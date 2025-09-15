import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { buildEnhancedMemoryContext } from '../services/memory-service';
import { deleteUserCascade, findUserByEmail } from '../services/user-service';
import { generateMissingCSSSummaries } from '../services/generate-missing-css';

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

// Get user context with enhanced memory and agent-specific verbal acknowledgment
router.get('/user-context/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { agentName = 'Sarah' } = req.query; // Extract agent name from query params

    // Fetch user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const firstName = user.first_name || 'there';

    // Build enhanced memory context with agent-specific verbal acknowledgment
    const memoryResult = await buildEnhancedMemoryContext(
      userId, 
      firstName,
      agentName as string  // Pass the agent name for agent-specific greetings
    );
    
    const memoryContext = memoryResult.context;
    const verbalAcknowledgment = memoryResult.verbalAcknowledgment;

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

    console.log(`🧠 Enhanced memory context built for ${firstName} with agent ${agentName}`);
    console.log(`💬 Agent-specific verbal acknowledgment: ${verbalAcknowledgment.substring(0, 100)}...`);

    res.json({
      success: true,
      profile: user,
      memoryContext,
      verbalAcknowledgment,
      sessions: sessions || [],
      firstName,
      sessionCount: sessions?.length || 0,
      agentName // Include agent name in response
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

// Diagnostic endpoint to check and fix therapeutic_context table
router.get('/fix-therapeutic-context', async (req, res) => {
  try {
    console.log('🔧 Checking therapeutic_context table...');
    
    // First, try to query the table to see its current structure
    const { data: testQuery, error: testError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.log('Error querying therapeutic_context:', testError);
      
      // Try to add the metadata column if it's missing
      if (testError.message.includes('metadata')) {
        console.log('Attempting to add metadata column...');
        
        // Use raw SQL through Supabase
        const { error: alterError } = await supabase.rpc('exec_sql', {
          query: 'ALTER TABLE therapeutic_context ADD COLUMN IF NOT EXISTS metadata JSONB'
        });
        
        if (alterError) {
          console.log('Could not add column via RPC:', alterError);
          // Column might already exist or RPC function doesn't exist
        }
      }
    }
    
    // Check how many records exist
    const { count, error: countError } = await supabase
      .from('therapeutic_context')
      .select('*', { count: 'exact', head: true });
    
    // Get sample records
    const { data: samples, error: sampleError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    res.json({
      success: true,
      recordCount: count || 0,
      sampleRecords: samples || [],
      errors: {
        test: testError?.message,
        count: countError?.message,
        sample: sampleError?.message
      }
    });
    
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ error: 'Diagnostic failed', details: error });
  }
});

// Generate missing CSS summaries for all users
router.post('/generate-missing-css', async (req, res) => {
  try {
    console.log('🚀 Starting CSS summary generation for missing transcripts...');
    const result = await generateMissingCSSSummaries();
    res.json(result);
  } catch (error) {
    console.error('Error generating CSS summaries:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Generate CSS for specific user (Sophia)
router.post('/generate-css-for-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🎯 Generating CSS for user: ${userId}`);
    
    // Import the function we need
    const { generateCSSProgressionSummary } = await import('../services/summary-service');
    
    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get transcripts
    const { data: transcripts } = await supabase
      .from('session_transcripts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (!transcripts || transcripts.length === 0) {
      return res.json({ success: false, message: 'No transcripts found' });
    }
    
    const results = [];
    
    for (const transcript of transcripts) {
      if (!transcript.text || transcript.text.length < 100) {
        console.log(`⏭️ Skipping short transcript: ${transcript.call_id}`);
        continue;
      }
      
      console.log(`📝 Processing transcript for call: ${transcript.call_id}`);
      console.log(`   Transcript length: ${transcript.text.length} chars`);
      
      try {
        // Generate CSS summary
        const summary = await generateCSSProgressionSummary(
          transcript.text,
          userId,
          transcript.call_id,
          'Sarah' // Default agent
        );
        
        results.push({
          callId: transcript.call_id,
          status: 'success',
          summary: summary?.slice(0, 200) + '...'
        });
        
        console.log(`✅ CSS summary generated for call: ${transcript.call_id}`);
      } catch (error) {
        console.error(`❌ Failed for ${transcript.call_id}:`, error);
        results.push({
          callId: transcript.call_id,
          status: 'failed',
          error: String(error)
        });
      }
    }
    
    res.json({
      success: true,
      user: user.first_name,
      processed: results.length,
      results
    });
    
  } catch (error) {
    console.error('Error generating CSS for user:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Check user sessions and transcripts
router.get('/check-user-sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get sessions
    const { data: sessions } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Get transcripts
    const { data: transcripts } = await supabase
      .from('session_transcripts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Get all context
    const { data: contexts } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    res.json({ 
      success: true,
      sessions: sessions || [],
      transcripts: transcripts?.map(t => ({
        id: t.id,
        call_id: t.call_id,
        created_at: t.created_at,
        text_length: t.text?.length || 0,
        text_preview: t.text?.substring(0, 200) || ''
      })) || [],
      contexts: contexts || []
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Check users and their CSS data
router.get('/check-users-css', async (req, res) => {
  try {
    // Get all users with first_name containing 'Sophia' or similar
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .ilike('first_name', '%soph%');

    const userResults = [];
    
    for (const user of users || []) {
      // Get CSS summaries for this user
      const { data: cssData } = await supabase
        .from('therapeutic_context')
        .select('*')
        .eq('user_id', user.id)
        .in('context_type', ['css_summary', 'call_summary'])
        .order('created_at', { ascending: false })
        .limit(5);

      // Get session count
      const { count: sessionCount } = await supabase
        .from('therapeutic_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      userResults.push({
        user,
        sessionCount,
        cssRecords: cssData || [],
        hasCSSData: (cssData || []).some(r => r.context_type === 'css_summary')
      });
    }

    res.json({ 
      success: true,
      users: userResults
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

// Check CSS data for specific call ID
router.get('/check-css/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    // Get all context for this call
    const { data: callData, error: callError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('call_id', callId)
      .order('created_at', { ascending: false });

    // Get CSS summaries for the user associated with this call
    let userData = null;
    let userId = null;
    if (callData && callData.length > 0) {
      userId = callData[0].user_id;
      const { data, error } = await supabase
        .from('therapeutic_context')
        .select('*')
        .eq('user_id', userId)
        .in('context_type', ['css_summary', 'call_summary'])
        .order('created_at', { ascending: false })
        .limit(10);
      userData = data;
    }

    res.json({ 
      success: true,
      callId,
      userId,
      callRecords: callData || [],
      userRecords: userData || [],
      contextTypes: [...new Set((callData || []).map(r => r.context_type))]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;