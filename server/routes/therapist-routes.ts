// server/routes/therapist-routes.ts
// COMPLETE PRODUCTION-READY IMPLEMENTATION WITH AUTH FIX

import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import crypto from 'crypto';
import { Resend } from 'resend';

const router = Router();

// Initialize Resend email service
const resend = new Resend(process.env.RESEND_API_KEY);

// Verify email service is configured
const isEmailConfigured = (): boolean => {
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not configured in environment variables');
    return false;
  }
  return true;
};

// ============= ADD THIS HELPER FUNCTION =============
// Helper to validate that the authenticated user matches the therapist_id
async function validateTherapistAuth(authUser: any, therapistProfileId: string): Promise<boolean> {
  // The JWT contains the auth user ID, but therapist_id is the profile ID
  // We need to look up the profile by email to match them

  if (!authUser?.email) {
    console.error('No email in auth user');
    return false;
  }

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('id, user_type')
    .eq('email', authUser.email)
    .single();

  if (!userProfile) {
    console.error('No profile found for email:', authUser.email);
    return false;
  }

  if (userProfile.id !== therapistProfileId) {
    console.error('Profile ID mismatch:', {
      profileId: userProfile.id,
      requestedId: therapistProfileId
    });
    return false;
  }

  if (userProfile.user_type !== 'therapist') {
    console.error('User is not a therapist:', userProfile.user_type);
    return false;
  }

  return true;
}
// ============= END HELPER FUNCTION =============

// Send invitation email using Resend (keeping your existing function as-is)
async function sendInvitationEmail(
  clientEmail: string,
  therapistName: string,
  therapistEmail: string,
  invitationLink: string
): Promise<boolean> {
  try {
    if (!isEmailConfigured()) {
      throw new Error('Email service not configured');
    }

    const { data, error } = await resend.emails.send({
      from: 'iVASA <notifications@ivasa.ai>',  // Using Resend's test email
      to: clientEmail,
      replyTo: therapistEmail,
      subject: `${therapistName} has invited you to join iVASA`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #4F46E5; font-size: 28px; font-weight: 600;">
                        Welcome to iVASA
                      </h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                        Hi there,
                      </p>
                      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                        <strong>${therapistName}</strong> has invited you to join iVASA as their client. 
                        iVASA is an AI-powered therapeutic assistant that provides voice-based support 
                        for your mental health journey.
                      </p>
                      <p style="margin: 0 0 30px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                        By accepting this invitation, you'll be able to:
                      </p>
                      <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #374151; font-size: 16px; line-height: 1.8;">
                        <li>Access voice-based therapeutic sessions</li>
                        <li>Track your mental health progress</li>
                        <li>Connect with your therapist through the platform</li>
                        <li>Use your therapist's subscription for sessions</li>
                      </ul>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 20px 0 30px 0;">
                            <a href="${invitationLink}" 
                               style="display: inline-block; padding: 14px 32px; background-color: #4F46E5; 
                                      color: white; text-decoration: none; font-size: 16px; font-weight: 600; 
                                      border-radius: 8px; transition: background-color 0.2s;">
                              Accept Invitation
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0 0 20px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0 0 30px 0; padding: 12px; background-color: #F3F4F6; 
                                border-radius: 6px; color: #4F46E5; font-size: 12px; 
                                word-break: break-all; font-family: monospace;">
                        ${invitationLink}
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #E5E7EB;">
                      <p style="margin: 0 0 10px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                        <strong>Important:</strong> This invitation will expire in 7 days.
                      </p>
                      <p style="margin: 0 0 10px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                        If you have questions, please contact your therapist at 
                        <a href="mailto:${therapistEmail}" style="color: #4F46E5; text-decoration: none;">
                          ${therapistEmail}
                        </a>
                      </p>
                      <p style="margin: 0; color: #9CA3AF; font-size: 12px; line-height: 1.6;">
                        © 2025 iVASA. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `
        ${therapistName} has invited you to join iVASA

        Hi there,

        ${therapistName} has invited you to join iVASA as their client. 
        iVASA is an AI-powered therapeutic assistant that provides voice-based support for your mental health journey.

        Accept the invitation here:
        ${invitationLink}

        This invitation will expire in 7 days.

        If you have questions, contact your therapist at ${therapistEmail}
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      return false;
    }

    console.log(`✅ Email sent successfully to ${clientEmail}. Email ID: ${data?.id}`);
    return true;

  } catch (error) {
    console.error('❌ Failed to send invitation email:', error);
    return false;
  }
}

// ============= ADD DIAGNOSTIC ENDPOINT =============
// Diagnostic endpoint to check authentication
router.get('/auth-check', authenticateToken, async (req: AuthRequest, res) => {
  console.log('🔍 AUTH CHECK - User email:', req.user?.email);

  // Get the profile for this auth user
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', req.user?.email)
    .single();

  res.json({
    authenticated: !!req.user,
    authUser: {
      id: req.user?.id,
      email: req.user?.email
    },
    profile: profile
  });
});
// ============= END DIAGNOSTIC ENDPOINT =============

// Invite a client endpoint - FIXED AUTHENTICATION
router.post('/invite-client', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { therapist_id, client_email } = req.body;

    console.log('📧 Processing client invitation:', {
      therapist: therapist_id,
      client: client_email,
      auth_email: req.user?.email  // Add this for debugging
    });

    // Validate input
    if (!therapist_id || !client_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(client_email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // ============= FIXED AUTHENTICATION CHECK =============
    // Use the helper function to validate auth
    const isAuthorized = await validateTherapistAuth(req.user, therapist_id);
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    // ============= END FIX =============

    // Check if therapist exists and is actually a therapist (redundant but kept for safety)
    const { data: therapistProfile, error: therapistError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', therapist_id)
      .eq('user_type', 'therapist')
      .single();

    if (therapistError || !therapistProfile) {
      console.error('Therapist profile not found:', therapistError);
      return res.status(400).json({ error: 'Invalid therapist account' });
    }

    // Check if client email is already registered
    const { data: existingClient } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', client_email)
      .maybeSingle();

    if (existingClient) {
      // Check if relationship already exists
      const { data: existingRelationship } = await supabase
        .from('therapist_client_relationships')
        .select('*')
        .eq('therapist_id', therapist_id)
        .eq('client_id', existingClient.id)
        .maybeSingle();

      if (existingRelationship) {
        if (existingRelationship.status === 'active') {
          return res.status(400).json({ 
            error: 'You already have an active relationship with this client' 
          });
        } else if (existingRelationship.status === 'pending') {
          return res.status(400).json({ 
            error: 'An invitation is already pending for this client' 
          });
        }
      }

      // Create relationship with existing client
      const { error: relationshipError } = await supabase
        .from('therapist_client_relationships')
        .insert({
          therapist_id,
          client_id: existingClient.id,
          status: 'pending'
        });

      if (relationshipError) {
        console.error('Failed to create relationship:', relationshipError);
        return res.status(500).json({ error: 'Failed to create relationship' });
      }

      // Send notification email to existing client
      const emailSent = await sendInvitationEmail(
        client_email,
        therapistProfile.full_name || therapistProfile.email,
        therapistProfile.email,
        `${process.env.CLIENT_URL || 'https://ivasa.ai'}/dashboard`
      );

      if (!emailSent) {
        // Rollback the relationship if email fails
        await supabase
          .from('therapist_client_relationships')
          .delete()
          .eq('therapist_id', therapist_id)
          .eq('client_id', existingClient.id);

        return res.status(500).json({ 
          error: 'Failed to send notification email. Please verify email service is configured.' 
        });
      }

      return res.json({ 
        success: true, 
        message: 'Relationship created with existing client',
        type: 'existing_client'
      });
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabase
      .from('therapist_invitations')
      .select('*')
      .eq('therapist_id', therapist_id)
      .eq('client_email', client_email)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvitation) {
      // Check if invitation is still valid
      if (new Date(existingInvitation.expires_at) > new Date()) {
        return res.status(400).json({ 
          error: 'An invitation is already pending for this email address' 
        });
      }
    }

    // Generate invitation token and link
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationLink = `${process.env.CLIENT_URL || 'https://ivasa.ai'}/?token=${invitationToken}&therapist=${therapist_id}`;

    // Create invitation record
    const { data: invitation, error: inviteError } = await supabase
      .from('therapist_invitations')
      .insert({
        therapist_id,
        client_email,
        invitation_token: invitationToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Failed to create invitation:', inviteError);

      // Check if it's a missing table error
      if (inviteError.message?.includes('relation') || inviteError.message?.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Database table not found. Please run the SQL migration to create therapist_invitations table.' 
        });
      }

      return res.status(500).json({ error: 'Failed to create invitation' });
    }

    // Send invitation email
    const emailSent = await sendInvitationEmail(
      client_email,
      therapistProfile.full_name || therapistProfile.email,
      therapistProfile.email,
      invitationLink
    );

    if (!emailSent) {
      // Delete the invitation if email fails
      await supabase
        .from('therapist_invitations')
        .delete()
        .eq('id', invitation.id);

      // Return error with manual link as fallback
      return res.status(500).json({ 
        error: 'Failed to send email. Please verify your email service configuration.',
        invitation_link: invitationLink,
        suggestion: 'Share this link with your client manually'
      });
    }

    console.log(`✅ Invitation sent successfully to ${client_email}`);
    res.json({ 
      success: true, 
      message: 'Invitation sent successfully',
      invitation_id: invitation.id
    });

  } catch (error) {
    console.error('Error in invite-client:', error);
    res.status(500).json({ error: 'Failed to process invitation' });
  }
});

// ============= KEEPING ALL YOUR OTHER ENDPOINTS UNCHANGED =============

// Accept invitation endpoint
router.post('/accept-invitation', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { token } = req.body;
    const auth_user_id = req.user?.id;  // This is Supabase auth ID

    if (!auth_user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get the profile using the auth email
    const { data: clientProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', req.user?.email)
      .single();

    if (!clientProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const client_user_id = clientProfile.id;  // This is the profile ID

    // Find and validate the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('therapist_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('therapist_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return res.status(400).json({ error: 'This invitation has expired' });
    }

    // Check if relationship already exists
    const { data: existingRelationship } = await supabase
      .from('therapist_client_relationships')
      .select('*')
      .eq('therapist_id', invitation.therapist_id)
      .eq('client_id', client_user_id)
      .maybeSingle();

    if (existingRelationship) {
      if (existingRelationship.status === 'active') {
        return res.status(400).json({ error: 'Relationship already exists' });
      }

      // Update existing relationship
      await supabase
        .from('therapist_client_relationships')
        .update({ 
          status: 'active',
          invitation_id: invitation.id
        })
        .eq('id', existingRelationship.id);
    } else {
      // Create new relationship
      const { error: relationshipError } = await supabase
        .from('therapist_client_relationships')
        .insert({
          therapist_id: invitation.therapist_id,
          client_id: client_user_id,
          invitation_id: invitation.id,
          status: 'active'
        });

      if (relationshipError) {
        console.error('Failed to create relationship:', relationshipError);
        return res.status(500).json({ error: 'Failed to create relationship' });
      }
    }

    // Mark invitation as accepted
    await supabase
      .from('therapist_invitations')
      .update({ 
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    // Update client profile
    await supabase
      .from('user_profiles')
      .update({
        invited_by: invitation.therapist_id,
        user_type: 'client'
      })
      .eq('id', client_user_id);

    res.json({ 
      success: true, 
      message: 'Invitation accepted successfully',
      therapist_id: invitation.therapist_id
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Get all clients for a therapist - FIXED AUTHENTICATION
router.get('/clients', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // ============= FIX: Get profile ID from auth email =============
    const { data: therapistProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type')
      .eq('email', req.user?.email)
      .single();

    if (!therapistProfile || therapistProfile.user_type !== 'therapist') {
      return res.status(403).json({ error: 'Only therapists can access this endpoint' });
    }

    const therapist_id = therapistProfile.id;
    // ============= END FIX =============

    // Get all relationships with full client profiles
    const { data: relationships, error } = await supabase
      .from('therapist_client_relationships')
      .select(`
        *,
        client:user_profiles!client_id(*)
      `)
      .eq('therapist_id', therapist_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching clients:', error);
      return res.status(500).json({ error: 'Failed to fetch clients' });
    }

    res.json({ clients: relationships || [] });
  } catch (error) {
    console.error('Error in get clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get pending invitations - FIXED AUTHENTICATION
router.get('/invitations', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // ============= FIX: Get profile ID from auth email =============
    const { data: therapistProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type')
      .eq('email', req.user?.email)
      .single();

    if (!therapistProfile || therapistProfile.user_type !== 'therapist') {
      return res.status(403).json({ error: 'Only therapists can access this endpoint' });
    }

    const therapist_id = therapistProfile.id;
    // ============= END FIX =============

    const { data: invitations, error } = await supabase
      .from('therapist_invitations')
      .select('*')
      .eq('therapist_id', therapist_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
      return res.status(500).json({ error: 'Failed to fetch invitations' });
    }

    res.json({ invitations: invitations || [] });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Cancel an invitation - FIXED AUTHENTICATION
router.delete('/invitation/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const invitation_id = req.params.id;

    // ============= FIX: Get profile ID from auth email =============
    const { data: therapistProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type')
      .eq('email', req.user?.email)
      .single();

    if (!therapistProfile || therapistProfile.user_type !== 'therapist') {
      return res.status(403).json({ error: 'Only therapists can cancel invitations' });
    }

    const therapist_id = therapistProfile.id;
    // ============= END FIX =============

    // Verify the invitation belongs to this therapist
    const { data: invitation } = await supabase
      .from('therapist_invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('therapist_id', therapist_id)
      .single();

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Delete the invitation
    const { error } = await supabase
      .from('therapist_invitations')
      .delete()
      .eq('id', invitation_id);

    if (error) {
      console.error('Error canceling invitation:', error);
      return res.status(500).json({ error: 'Failed to cancel invitation' });
    }

    res.json({ success: true, message: 'Invitation canceled' });
  } catch (error) {
    console.error('Error canceling invitation:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

export default router;