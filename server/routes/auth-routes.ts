import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { buildEnhancedMemoryContext } from '../services/memory-service';
import { deleteUserCascade, findUserByEmail } from '../services/user-service';

const router = Router();

// Create or get user
router.post('/user', async (req, res) => {
  try {
    const { email, firstName } = req.body;
    console.log('Auth request received:', { email, firstName });

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Test Supabase connection first
    console.log('Testing Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('Supabase connection test failed:', testError);
      return res.status(500).json({ error: 'Database connection failed', details: testError.message });
    }
    
    console.log('Supabase connection successful');

    // Check if user exists
    console.log('Checking for existing user...');
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('Error checking existing user:', selectError);
      throw selectError;
    }

    if (existingUser) {
      console.log('Found existing user:', existingUser.email);
      return res.json({ user: existingUser });
    }

    // Create new user
    console.log('Creating new user...');
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        first_name: firstName || email.split('@')[0]
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating new user:', error);
      throw error;
    }

    console.log('New user created:', newUser.email);
    res.json({ user: newUser });
  } catch (error) {
    console.error('Error in /user endpoint:', error);
    res.status(500).json({ error: 'Failed to process user' });
  }
});

// Get user context with memory
router.get('/user-context/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build enhanced memory context with user's first name
    const memoryContext = await buildEnhancedMemoryContext(userId, user.first_name || 'there');

    // Fetch recent sessions for stats
    const { data: sessions } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Set cache-control headers
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.json({
      success: true,
      profile: user,
      memoryContext,
      sessions: sessions || [],
      firstName: user.first_name || 'there',
      sessionCount: sessions?.length || 0
    });
  } catch (error) {
    console.error('Error fetching user context:', error);
    res.status(500).json({ error: 'Failed to fetch user context' });
  }
});

// CASCADE DELETE: Delete user and all related data
router.delete('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🗑️ Starting cascade delete for user: ${userId}`);

    // Verify user exists
    const { data: userToDelete, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !userToDelete) {
      console.error('User not found for deletion:', userId);
      return res.status(404).json({ 
        error: 'User not found',
        userId: userId 
      });
    }

    console.log(`📋 User found: ${userToDelete.email}`);

    // Get counts of related data
    const { count: sessionsCount } = await supabase
      .from('therapeutic_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: contextsCount } = await supabase
      .from('therapeutic_context')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: transcriptsCount } = await supabase
      .from('session_transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    console.log(`📊 Related data to be deleted:
      - Sessions: ${sessionsCount || 0}
      - Contexts: ${contextsCount || 0}
      - Transcripts: ${transcriptsCount || 0}`);

    // Delete the user (CASCADE handles related tables)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return res.status(500).json({ 
        error: 'Failed to delete user',
        details: deleteError.message 
      });
    }

    console.log(`✅ Successfully deleted user ${userToDelete.email}`);

    res.json({
      success: true,
      message: 'User and all related data successfully deleted',
      deletedUser: {
        id: userId,
        email: userToDelete.email,
        deletedAt: new Date().toISOString()
      },
      deletedCounts: {
        sessions: sessionsCount || 0,
        contexts: contextsCount || 0,
        transcripts: transcriptsCount || 0
      }
    });

  } catch (error) {
    console.error('Unexpected error in user deletion:', error);
    res.status(500).json({ 
      error: 'An unexpected error occurred during deletion',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete user by email
router.delete('/user-by-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`🗑️ Starting cascade delete for user with email: ${email}`);

    // Find user by email
    const { user: userToDelete, error: fetchError } = await findUserByEmail(email);

    if (fetchError || !userToDelete) {
      return res.status(404).json({ 
        error: 'User not found with that email',
        email: email 
      });
    }

    // Use the cascade delete service
    const result = await deleteUserCascade(userToDelete.id);
    
    if (!result.success) {
      return res.status(500).json({ 
        error: result.error || 'Failed to delete user'
      });
    }

    res.json({
      success: true,
      message: 'User and all related data successfully deleted via email lookup',
      deletedUser: {
        id: result.deletedUserId,
        email: result.deletedEmail,
        deletedAt: new Date().toISOString()
      },
      deletedCounts: result.deletedCounts
    });
    
  } catch (error) {
    console.error('Error in delete by email:', error);
    res.status(500).json({ 
      error: 'Failed to delete user by email',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;