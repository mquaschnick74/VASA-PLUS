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

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Check if user exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (existingUser) {
        return res.json({ user: existingUser });
      }

      // Create new user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email,
          first_name: firstName || email.split('@')[0]
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

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

      // Extract user ID from metadata
      const userId = message?.call?.metadata?.userId || message?.metadata?.userId;
      const callId = message?.call?.id || message?.callId;

      if (!userId || !callId) {
        console.warn('Missing userId or callId in webhook');
        return res.status(200).json({ received: true });
      }

      switch (eventType) {
        case 'call-started':
          // Create or update session
          await supabase
            .from('therapeutic_sessions')
            .upsert({
              call_id: callId,
              user_id: userId,
              agent_name: 'Sarah',
              status: 'active',
              start_time: new Date().toISOString(),
              metadata: message.call
            }, {
              onConflict: 'call_id'
            });
          
          console.log('✅ Session started');
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
