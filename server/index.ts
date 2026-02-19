import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authenticateToken } from "./middleware/auth";
import { createRequestId, error as logError, info as logInfo } from "./utils/logger";
import { validateEnvironment } from "./utils/env";

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 UNHANDLED REJECTION:', reason);
  if (reason instanceof Error) {
    console.error('   Stack:', reason.stack);
  }
});

process.on('uncaughtException', (error) => {
  console.error('🔴 UNCAUGHT EXCEPTION:', error.message);
  console.error('   Stack:', error.stack);
});

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

const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(cors({
  origin: (origin, callback) => {
    // DEV: allow everything (Replit preview origins vary)
    if (NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // PROD: allow server-to-server / same-origin (no Origin header)
    if (!origin) return callback(null, true);

    // PROD: allow only allowlisted origins
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // IMPORTANT: do NOT throw an error (that causes 500 + white screen)
    return callback(null, false);
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

// Global request logger with short request ID
let reqCounter = 0;
app.use((req, res, next) => {
  const start = Date.now();
  const rid = `R${++reqCounter}`;
  const requestId = (req.headers['x-request-id'] as string) || rid;

  if (req.path.startsWith('/api')) {
    console.log(`➡️ [${rid}] ${req.method} ${req.originalUrl}`);
  }

  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    const duration = Date.now() - start;
    console.log(`⬅️ [${rid}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    logInfo('api_request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
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
