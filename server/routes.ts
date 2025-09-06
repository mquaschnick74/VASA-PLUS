import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from 'express';
import crypto from 'crypto';
import { db } from './services/supabase-service';
import { users, therapeuticSessions, sessionTranscripts } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';
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
      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUsers.length > 0) {
        return res.json({ user: existingUsers[0] });
      }

      // Create new user
      const newUsers = await db
        .insert(users)
        .values({
          email,
          first_name: firstName || email.split('@')[0]
        })
        .returning();

      if (newUsers.length === 0) {
        throw new Error('Failed to create user');
      }

      res.json({ user: newUsers[0] });
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
      const userResults = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResults.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResults[0];

      // Build memory context
      const memoryContext = await buildMemoryContext(userId);

      // Fetch recent sessions for stats
      const sessions = await db
        .select()
        .from(therapeuticSessions)
        .where(eq(therapeuticSessions.user_id, userId))
        .orderBy(desc(therapeuticSessions.created_at))
        .limit(10);

      // Set cache-control headers to prevent caching
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.json({
        success: true,
        profile: user,
        memoryContext,
        sessions: sessions,
        firstName: user.first_name || 'there',
        sessionCount: sessions.length
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
          await db
            .insert(therapeuticSessions)
            .values({
              call_id: callId,
              user_id: userId,
              agent_name: 'Sarah',
              status: 'active',
              start_time: new Date().toISOString(),
              metadata: message.call
            })
            .onConflictDoUpdate({
              target: therapeuticSessions.call_id,
              set: {
                status: 'active',
                start_time: new Date().toISOString(),
                metadata: message.call
              }
            });
          
          console.log('✅ Session started');
          break;

        case 'end-of-call-report':
          // Update session with end time and duration
          const duration = message?.call?.duration || 0;
          
          await db
            .update(therapeuticSessions)
            .set({
              status: 'completed',
              end_time: new Date().toISOString(),
              duration_seconds: duration,
              metadata: message.call
            })
            .where(eq(therapeuticSessions.call_id, callId));

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
            await db
              .insert(sessionTranscripts)
              .values({
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
