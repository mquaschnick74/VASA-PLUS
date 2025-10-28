import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authenticateToken } from "./middleware/auth";

// Environment variable validation for production
function validateEnvironment() {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('⚠️ Running in development mode with missing environment variables');
    }
  } else {
    log('✅ All required environment variables present');
  }
}

// Validate environment on startup
validateEnvironment();

const app = express();

// IMPORTANT: Raw body parsers for webhooks MUST come BEFORE global JSON parser
// This allows webhook signature validation to work properly

// Special handling for VAPI webhook endpoint with raw body for signature validation
app.use('/api/vapi/webhook', express.raw({
  type: 'application/json',
  limit: '10mb'
}));

// Special handling for Stripe webhook endpoint with raw body for signature validation
app.use('/api/stripe/webhook', express.raw({
  type: 'application/json',
  limit: '10mb'
}));

// INCREASED LIMITS for VAPI webhooks with large transcripts
app.use(express.json({ limit: '10mb' }));  // Increased from default 100kb
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Diagnostic logging for malformed auth headers (temporary - helps identify polling source)
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Only log if there's a malformed Bearer token
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ').length !== 2) {
    console.log('🔍 MALFORMED AUTH DETECTED:', {
      path: req.path,
      method: req.method,
      authHeaderLength: authHeader.length,
      authPreview: authHeader.substring(0, 50) + '...',
      userAgent: req.headers['user-agent']?.substring(0, 100)
    });
  }
  next();
});

// Rest of your existing code...
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Continue with the rest of the file...

// Apply soft auth to all /api routes EXCEPT webhooks
// Webhooks need to bypass auth as they come from external services with their own signature validation
app.use('/api', (req, res, next) => {
  // Skip auth for webhook endpoints - they have their own signature validation
  if (req.path.startsWith('/vapi/webhook') || req.path.startsWith('/stripe/webhook')) {
    console.log(`🔓 Webhook endpoint accessed: ${req.path} - Skipping JWT auth`);
    return next();
  }

  // Apply auth to all other /api routes
  return authenticateToken(req, res, next);
});

(async () => {
  try {
    log('🚀 Starting server initialization...');
    
    const server = await registerRoutes(app);
    log('✅ Routes registered successfully');

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
      log('✅ Vite development server configured');
    } else {
      serveStatic(app);
      log('✅ Static file serving configured for production');
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    // Graceful server startup with error handling
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, (error?: Error) => {
      if (error) {
        console.error(`❌ Failed to start server on port ${port}:`, error);
        process.exit(1);
      }
      log(`✅ Server running on 0.0.0.0:${port} in ${process.env.NODE_ENV || 'development'} mode`);
    });

  } catch (error) {
    console.error('❌ Fatal error during server startup:', error);
    process.exit(1);
  }
})();
