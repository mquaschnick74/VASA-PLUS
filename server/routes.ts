import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from './services/supabase-service';
import { buildMemoryContext, storeSessionContext } from './services/memory-service';

export async function registerRoutes(app: Express): Promise<Server> {
  const apiRouter = Router();

  // Auth routes
  apiRouter.post('/auth/user', async (req, res) => {
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
  apiRouter.get('/auth/user-context/:userId', async (req, res) => {
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

      // Build memory context
      const memoryContext = await buildMemoryContext(userId);

      // Fetch recent sessions for stats
      const { data: sessions } = await supabase
        .from('therapeutic_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Set cache-control headers to prevent caching
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

  // VAPI webhook handler
  apiRouter.post('/vapi/webhook', async (req, res) => {
    console.log('📥 VAPI webhook received:', JSON.stringify(req.body, null, 2));
    try {
      // Verify webhook signature if in production
      if (process.env.NODE_ENV === 'production' && process.env.VAPI_SECRET_KEY) {
        const signature = req.headers['x-vapi-signature'] as string;
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac('sha256', process.env.VAPI_SECRET_KEY)
          .update(payload)
          .digest('hex');

        if (signature !== expectedSignature) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const { message } = req.body;
      const eventType = message?.type;

      console.log(`📥 Received VAPI webhook: ${eventType}`);

      // Extract user ID from metadata - handle different webhook structures
      const userId = message?.call?.metadata?.userId || 
                    message?.metadata?.userId ||
                    message?.call?.assistant?.metadata?.userId ||
                    message?.assistant?.metadata?.userId;
      const callId = message?.call?.id || message?.callId;
      
      console.log('🔍 Parsing webhook data:', {
        foundUserId: userId,
        foundCallId: callId,
        path1: message?.call?.metadata?.userId,
        path2: message?.metadata?.userId,
        path3: message?.call?.assistant?.metadata?.userId,
        path4: message?.assistant?.metadata?.userId
      });

      if (!userId || !callId) {
        console.warn('Missing userId or callId in webhook');
        console.warn('Available data:', {
          userId: userId,
          callId: callId,
          messageStructure: {
            hasCall: !!message?.call,
            hasCallMetadata: !!message?.call?.metadata,
            hasCallAssistantMetadata: !!message?.call?.assistant?.metadata,
            hasDirectMetadata: !!message?.metadata,
            callKeys: message?.call ? Object.keys(message.call) : [],
            metadataKeys: message?.call?.metadata ? Object.keys(message.call.metadata) : []
          }
        });
        return res.status(200).json({ received: true });
      }

      switch (eventType) {
        case 'call-started':
          // Extract agent name from metadata
          const agentName = message?.call?.metadata?.agentName || 
                           message?.metadata?.agentName ||
                           message?.call?.assistant?.metadata?.agentName ||
                           message?.assistant?.metadata?.agentName ||
                           'Sarah'; // Default fallback
          
          // Create or update session
          const { data: sessionData, error: sessionError } = await supabase
            .from('therapeutic_sessions')
            .upsert({
              call_id: callId,
              user_id: userId,
              agent_name: agentName,
              status: 'active',
              start_time: new Date().toISOString(),
              metadata: message.call
            }, {
              onConflict: 'call_id'
            });
          
          if (sessionError) {
            console.error('❌ Session creation failed:', sessionError);
          } else {
            console.log('✅ Session started:', sessionData);
          }
          break;

        case 'end-of-call-report':
          // Update session with end time and duration
          const duration = message?.call?.duration || 0;
          
          await supabase
            .from('therapeutic_sessions')
            .update({
              status: 'completed',
              end_time: new Date().toISOString(),
              duration_seconds: duration,
              metadata: message.call
            })
            .eq('call_id', callId);

          // Store call summary as context
          if (message?.summary) {
            await storeSessionContext(
              userId,
              callId,
              message.summary,
              'call_summary'
            );
          }

          // Store complete transcript
          if (message?.transcript) {
            await supabase
              .from('session_transcripts')
              .insert({
                user_id: userId,
                call_id: callId,
                text: message.transcript,
                role: 'complete'
              });
          }

          console.log('✅ Session completed and stored');
          break;

        case 'transcript':
          // Optional: Store real-time transcript chunks
          if (message?.transcript?.text) {
            // Could store incremental transcripts if needed
          }
          break;

        default:
          console.log(`Unhandled event type: ${eventType}`);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Health check
  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}
