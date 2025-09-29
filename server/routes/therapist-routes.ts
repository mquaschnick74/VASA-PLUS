// server/routes/therapist-routes.ts
import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import crypto from 'crypto';

const router = Router();

// Generate invitation token
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Generate magic link token (shorter for email)
function generateMagicToken(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// POST /api/therapist/invite-client
router.post('/invite-client', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { therapist_id, client_email } = req.body;

    if (!therapist_id || !client_email) {
      return res.status(400).json({ 
        error: 'Missing required fields: therapist_id and client_email' 
      });
    }

    // Verify the requesting user is the therapist
    if (req.user?.id !== therapist_id && req.userId !== therapist_id) {
      // Check if the auth user owns this therapist account
      const { data: therapistUser } = await supabase
        .from('users')
        .select('auth_user_id')
        .eq('id', therapist_id)
        .single();

      if (therapistUser?.auth_user_id !== req.user?.id) {
        return res.status(403).json({ error: 'Unauthorized to send invitations for this therapist' });
      }
    }

    // Check if therapist exists and is actually a therapist
    const { data: therapist } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', therapist_id)
      .eq('user_type', 'therapist')
      .single();

    if (!therapist) {
      return res.status(404).json({ error: 'Therapist profile not found' });
    }

    // Check for existing invitation
    const { data: existingInvite } = await supabase
      .from('therapist_invitations')
      .select('*')
      .eq('therapist_id', therapist_id)
      .eq('client_email', client_email)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return res.status(400).json({ 
        error: 'An invitation has already been sent to this email' 
      });
    }

    // Check if client already exists and is linked
    const { data: existingClient } = await supabase
      .from('users')
      .select('id')
      .eq('email', client_email)
      .single();

    if (existingClient) {
      // Check if already linked
      const { data: existingRelationship } = await supabase
        .from('therapist_client_relationships')
        .select('*')
        .eq('therapist_id', therapist_id)
        .eq('client_id', existingClient.id)
        .single();

      if (existingRelationship) {
        return res.status(400).json({ 
          error: 'This client is already linked to your account' 
        });
      }
    }

    // Create invitation
    const invitationToken = generateInviteToken();
    const magicToken = generateMagicToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const { data: invitation, error: inviteError } = await supabase
      .from('therapist_invitations')
      .insert({
        therapist_id,
        client_email,
        invitation_token: invitationToken,
        magic_token: magicToken,
        status: 'pending',
        sent_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      return res.status(500).json({ error: 'Failed to create invitation' });
    }

    // Send invitation email (you'll need to implement email service)
    // For now, return the invitation details
    const inviteLink = `${process.env.APP_URL || 'https://your-app.com'}/join?token=${invitationToken}&email=${encodeURIComponent(client_email)}`;

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        magic_token: magicToken,
        invite_link: inviteLink,
        expires_at: invitation.expires_at
      },
      message: `Invitation sent to ${client_email}. They can use magic code: ${magicToken}`
    });

  } catch (error) {
    console.error('Error in invite-client:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// POST /api/therapist/accept-invitation
router.post('/accept-invitation', async (req, res) => {
  try {
    const { token, magic_token, client_email } = req.body;

    if ((!token && !magic_token) || !client_email) {
      return res.status(400).json({ 
        error: 'Missing required fields: (token or magic_token) and client_email' 
      });
    }

    // Find the invitation
    let query = supabase
      .from('therapist_invitations')
      .select('*')
      .eq('client_email', client_email)
      .eq('status', 'pending');

    if (token) {
      query = query.eq('invitation_token', token);
    } else if (magic_token) {
      query = query.eq('magic_token', magic_token.toUpperCase());
    }

    const { data: invitation, error: inviteError } = await query.single();

    if (inviteError || !invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('therapist_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'This invitation has expired' });
    }

    // Get or create the client user
    const { data: clientUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', client_email)
      .single();

    if (!clientUser) {
      return res.json({
        success: false,
        needs_registration: true,
        therapist_id: invitation.therapist_id,
        invitation_id: invitation.id,
        message: 'Please complete registration to accept the invitation'
      });
    }

    // Update the client's profile to link to therapist
    await supabase
      .from('user_profiles')
      .update({
        user_type: 'client',
        invited_by: invitation.therapist_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientUser.id);

    // Create the therapist-client relationship
    const { error: relationshipError } = await supabase
      .from('therapist_client_relationships')
      .insert({
        therapist_id: invitation.therapist_id,
        client_id: clientUser.id,
        invitation_id: invitation.id,
        status: 'active'
      });

    if (relationshipError) {
      // Check if relationship already exists
      if (relationshipError.code === '23505') {
        return res.json({
          success: true,
          message: 'You are already connected with this therapist'
        });
      }
      throw relationshipError;
    }

    // Update invitation status
    await supabase
      .from('therapist_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    res.json({
      success: true,
      message: 'Successfully connected with therapist',
      therapist_id: invitation.therapist_id,
      client_id: clientUser.id
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// GET /api/therapist/check-invitation
router.get('/check-invitation', async (req, res) => {
  try {
    const { email, token, magic_token } = req.query;

    if (!email || (!token && !magic_token)) {
      return res.status(400).json({ error: 'Missing email and token' });
    }

    let query = supabase
      .from('therapist_invitations')
      .select(`
        *,
        therapist:therapist_id(
          id,
          email,
          first_name
        )
      `)
      .eq('client_email', email)
      .eq('status', 'pending');

    if (token) {
      query = query.eq('invitation_token', token);
    } else if (magic_token) {
      query = query.eq('magic_token', magic_token);
    }

    const { data: invitation } = await query.single();

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid invitation' });
    }

    // Check expiry
    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    res.json({
      valid: true,
      therapist: {
        id: invitation.therapist.id,
        name: invitation.therapist.first_name || invitation.therapist.email,
        email: invitation.therapist.email
      },
      invitation_id: invitation.id
    });

  } catch (error) {
    console.error('Error checking invitation:', error);
    res.status(500).json({ error: 'Failed to check invitation' });
  }
});

export default router;