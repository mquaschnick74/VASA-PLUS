import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authenticateToken } from "./middleware/auth";
import { createRequestId, error as logError, info as logInfo } from "./utils/logger";
import { validateEnvironment } from "./utils/env";

try {
  validateEnvironment();
  log('✅ Environment validation passed');
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const app = express();

// Webhook raw bodies must be mounted before global parsers
app.use('/api/vapi/webhook', express.raw({ type: 'application/json', limit: '10mb' }));
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '10mb' }));
app.use('/api/stripe-webhook', express.raw({ type: 'application/json', limit: '10mb' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

const allowedOrigins = [
  'https://beta.ivasa.ai',
  'https://start.ivasa.ai',
  'https://ivasa.ai',
  'https://www.ivasa.ai',
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
}));

app.use((req, _res, next) => {
  const rid = (req.headers['x-request-id'] as string) || createRequestId();
  req.headers['x-request-id'] = rid;
  next();
});

// Redirect ivasa.ai to beta.ivasa.ai, excluding webhooks
app.use((req, res, next) => {
  const host = req.get('host');
  const path = req.path;

  if (path.includes('/stripe-webhook') || path.includes('/stripe/webhook') || path.includes('/vapi/webhook')) {
    return next();
  }

  if (host === 'ivasa.ai' || host === 'www.ivasa.ai' || host === 'ivasa-ai.com' || host === 'www.ivasa-ai.com') {
    return res.redirect(301, `https://beta.ivasa.ai${req.originalUrl}`);
  }

  next();
});

// Minimal safe request logging (no bodies/responses)
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || 'unknown';

  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    logInfo('api_request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
});

// Soft auth on /api except webhooks
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/vapi/webhook') || req.path.startsWith('/stripe/webhook') || req.path.startsWith('/stripe-webhook')) {
    return next();
  }
  return authenticateToken(req, res, next);
});

(async () => {
  try {
    log('🚀 Starting server initialization...');
    const server = await registerRoutes(app);
    log('✅ Routes registered successfully');

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      logError('unhandled_error', {
        requestId: req.headers['x-request-id'],
        name: err?.name,
        message: err?.message,
      });

      if (res.headersSent) return next(err);
      const status = err.status || err.statusCode || 500;
      const message = status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : (err.message || 'Internal Server Error');
      res.status(status).json({ message, requestId: req.headers['x-request-id'] });
    });

    if (app.get('env') === 'development') {
      await setupVite(app, server);
      log('✅ Vite development server configured');
    } else {
      serveStatic(app);
      log('✅ Static file serving configured for production');
    }

    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen({ port, host: '0.0.0.0', reusePort: true }, (error?: Error) => {
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
