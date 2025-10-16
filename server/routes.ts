// server/routes.ts
import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from 'express';

// Import route modules
import authRoutes from './routes/auth-routes';
import webhookRoutes from './routes/webhook-routes';
import subscriptionRoutes from './routes/subscription-routes';
import therapistRoutes from './routes/therapist-routes';  // ADD THIS LINE
import partnerRoutes from './routes/partner-routes';
import influencerRoutes from './routes/influencer-routes';
import adminRoutes from './routes/admin-routes';
import kbRoutes from './routes/kb-routes';
import { supabase } from './services/supabase-service';
import stripeWebhookRoutes from './routes/stripe-webhook';
import stripeCheckoutRoutes from './routes/stripe-checkout';

export async function registerRoutes(app: Express): Promise<Server> {
  const apiRouter = Router();

  // Mount route modules
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/vapi', webhookRoutes);
  apiRouter.use('/subscription', subscriptionRoutes);
  apiRouter.use('/therapist', therapistRoutes);  // ADD THIS LINE
  apiRouter.use('/partner', partnerRoutes);
  apiRouter.use('/admin', adminRoutes);
  console.log('✅ Admin routes mounted at /api/admin');
  apiRouter.use('/influencer', influencerRoutes);
  apiRouter.use('/kb', kbRoutes);
  apiRouter.use('/stripe/webhook', stripeWebhookRoutes);
  apiRouter.use('/stripe', stripeCheckoutRoutes);

  // Health check
  apiRouter.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      routes: {
        auth: 'Mounted at /api/auth',
        vapi: 'Mounted at /api/vapi',
        subscription: 'Mounted at /api/subscription',
        partner: 'Mounted at /api/partner',
        influencer: 'Mounted at /api/influencer',
        therapist: 'Mounted at /api/therapist',  // ADD THIS LINE
        admin: 'Mounted at /api/admin',
        kb: 'Mounted at /api/kb',
        health: 'Mounted at /api/health'
      }
    });
  });

  // Database health check
  apiRouter.get('/health/db-check', async (req, res) => {
    try {
      // Check each table manually
      const tableChecks = await Promise.allSettled([
        supabase.from('users').select('count').limit(1),
        supabase.from('therapeutic_sessions').select('count').limit(1),
        supabase.from('therapeutic_context').select('count').limit(1),
        supabase.from('css_patterns').select('count').limit(1),
        supabase.from('session_transcripts').select('count').limit(1),
        supabase.from('css_progressions').select('count').limit(1),
        supabase.from('user_profiles').select('count').limit(1),
        supabase.from('subscriptions').select('count').limit(1),
        supabase.from('usage_sessions').select('count').limit(1),
        supabase.from('therapist_client_relationships').select('count').limit(1),
        supabase.from('therapist_invitations').select('count').limit(1)
      ]);

      const tableStatus = {
        users: tableChecks[0].status === 'fulfilled' ? 'exists' : 'missing',
        therapeutic_sessions: tableChecks[1].status === 'fulfilled' ? 'exists' : 'missing',
        therapeutic_context: tableChecks[2].status === 'fulfilled' ? 'exists' : 'missing',
        css_patterns: tableChecks[3].status === 'fulfilled' ? 'exists' : 'missing',
        session_transcripts: tableChecks[4].status === 'fulfilled' ? 'exists' : 'missing',
        css_progressions: tableChecks[5].status === 'fulfilled' ? 'exists' : 'missing',
        user_profiles: tableChecks[6].status === 'fulfilled' ? 'exists' : 'missing',
        subscriptions: tableChecks[7].status === 'fulfilled' ? 'exists' : 'missing',
        usage_sessions: tableChecks[8].status === 'fulfilled' ? 'exists' : 'missing',
        therapist_client_relationships: tableChecks[9].status === 'fulfilled' ? 'exists' : 'missing',
        therapist_invitations: tableChecks[10].status === 'fulfilled' ? 'exists' : 'missing'
      };

      const missingTables = Object.entries(tableStatus)
        .filter(([_, status]) => status === 'missing')
        .map(([table]) => table);

      res.json({
        status: missingTables.length > 0 ? 'warning' : 'ok',
        tables: tableStatus,
        missingTables,
        message: missingTables.length > 0 
          ? `Missing tables: ${missingTables.join(', ')}. Run database migrations to create them.`
          : 'All tables present'
      });

    } catch (error) {
      console.error('Database check error:', error);
      res.status(500).json({ 
        status: 'error',
        message: 'Failed to check database',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}