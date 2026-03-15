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
import chatRoutes from './routes/chat-routes';  // NEW: Text-to-text chat
import analysisRoutes from './routes/analysis-routes';  // Unified analysis routes (includes legacy PCA)
import assessmentRoutes from './routes/assessment-routes';  // NEW: Assessment integration
import emailPreferencesRoutes from './routes/email-preferences-routes';
import pushNotificationRoutes from './routes/push-notification-routes';
import { supabase } from './services/supabase-service';
import stripeWebhookRoutes from './routes/stripe-webhook';
import stripeCheckoutRoutes from './routes/stripe-checkout';
import blogRoutes from './routes/blog-routes';
import contentRoutes from './routes/content-routes';
import customLlmRoutes from './routes/custom-llm-routes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Make supabase available to all routes via app.locals
  app.locals.supabase = supabase;
  console.log('✅ Supabase client attached to app.locals');

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
  apiRouter.use('/chat', chatRoutes);  // NEW: Text chat
  console.log('✅ Chat routes mounted at /api/chat');
  apiRouter.use('/analysis', analysisRoutes);  // Unified analysis routes
  console.log('✅ Analysis routes mounted at /api/analysis');
  apiRouter.use('/assessment', assessmentRoutes);  // NEW: Assessment integration
  console.log('✅ Assessment routes mounted at /api/assessment');
  apiRouter.use('/email-preferences', emailPreferencesRoutes);
  apiRouter.use('/push-notifications', pushNotificationRoutes);
  console.log('✅ Push notification routes mounted at /api/push-notifications');
  apiRouter.use('/stripe/webhook', stripeWebhookRoutes);
  apiRouter.use('/stripe-webhook', stripeWebhookRoutes); // Backwards compatibility for existing Stripe config
  apiRouter.use('/stripe', stripeCheckoutRoutes);
  apiRouter.use('/blog', blogRoutes);
  apiRouter.use('/content', contentRoutes);
  console.log('✅ Content routes mounted at /api/content');
  apiRouter.use('/custom-llm', customLlmRoutes);
  console.log('✅ Custom LLM routes mounted at /api/custom-llm');

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
        chat: 'Mounted at /api/chat',  // NEW: Text chat
        analysis: 'Mounted at /api/analysis (unified)',  // Unified analysis routes
        assessment: 'Mounted at /api/assessment',  // NEW: Assessment integration
        emailPreferences: 'Mounted at /api/email-preferences',
        pushNotifications: 'Mounted at /api/push-notifications',
        content: 'Mounted at /api/content',
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

  // Dynamic sitemap — registered on app directly (not apiRouter) so it responds
  // at https://beta.ivasa.ai/sitemap.xml. Queries Supabase for all published posts
  // so individual blog post URLs are always current. This route must be registered
  // before app.use('/api', apiRouter) and before static file serving.
  app.get('/sitemap.xml', async (_req, res) => {
    try {
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('slug, published_at, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (error) {
        console.error('Sitemap: failed to fetch blog posts from Supabase:', error);
      }

      const staticUrls = [
        { loc: 'https://beta.ivasa.ai/', changefreq: 'weekly', priority: '1.0', lastmod: '2025-10-27' },
        { loc: 'https://beta.ivasa.ai/pricing', changefreq: 'monthly', priority: '0.8', lastmod: '2025-10-27' },
        { loc: 'https://beta.ivasa.ai/faq', changefreq: 'monthly', priority: '0.7', lastmod: '2025-10-27' },
        { loc: 'https://beta.ivasa.ai/blog', changefreq: 'weekly', priority: '0.9', lastmod: new Date().toISOString().split('T')[0] },
      ];

      const blogPostUrls = (posts || []).map(post => {
        const lastmod = post.updated_at
          ? new Date(post.updated_at).toISOString().split('T')[0]
          : post.published_at
            ? new Date(post.published_at).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
        return {
          loc: `https://beta.ivasa.ai/blog/${post.slug}`,
          changefreq: 'monthly',
          priority: '0.7',
          lastmod,
        };
      });

      const allUrls = [...staticUrls, ...blogPostUrls];

      const urlEntries = allUrls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries}
</urlset>`;

      res.status(200).set({
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      }).end(xml);

    } catch (err) {
      console.error('Sitemap route error:', err);
      res.status(500).send('Failed to generate sitemap');
    }
  });

  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}