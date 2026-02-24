import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authenticateToken } from "./middleware/auth";
import {
  createRequestId,
  error as logError,
  info as logInfo,
} from "./utils/logger";
import { validateEnvironment } from "./utils/env";

// ---- BOOT MARKER (flush-friendly) ----
process.stdout.write(
  `[BOOT] pid=${process.pid} env=${process.env.NODE_ENV} time=${new Date().toISOString()}\n`
);

// ---- PROCESS-LEVEL SAFETY NETS ----
process.on("unhandledRejection", (reason) => {
  console.error("🔴 UNHANDLED REJECTION:", reason);
  if (reason instanceof Error) {
    console.error("   Stack:", reason.stack);
  }
});

process.on("uncaughtException", (error) => {
  console.error("🔴 UNCAUGHT EXCEPTION:", error.message);
  console.error("   Stack:", error.stack);
});

// ---- ENV VALIDATION ----
try {
  validateEnvironment();
  log("✅ Environment validation passed");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const app = express();

// ---- WEBHOOK RAW BODY (MUST BE BEFORE JSON PARSERS) ----
app.use("/api/vapi/webhook", express.raw({ type: "application/json", limit: "10mb" }));
app.use("/api/stripe/webhook", express.raw({ type: "application/json", limit: "10mb" }));
app.use("/api/stripe-webhook", express.raw({ type: "application/json", limit: "10mb" }));

// ---- GLOBAL BODY PARSERS ----
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// ---- CORS ----
const allowedOrigins = [
  "https://beta.ivasa.ai",
  "https://start.ivasa.ai",
  "https://ivasa.ai",
  "https://www.ivasa.ai",
  "http://localhost:5173",
  "http://localhost:3000",
  "capacitor://localhost",
  "http://localhost",
];

// Helper to allow Replit domains without hardcoding
function getReplitOrigins(): string[] {
  const origins: string[] = [];

  // Common in Replit dev
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) origins.push(`https://${devDomain}`);

  // Sometimes useful in deploy contexts
  const slug = process.env.REPL_SLUG;
  if (slug) origins.push(`https://${slug}.replit.app`);

  // Optional if you set it yourself
  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl) origins.push(publicUrl);

  return origins;
}

const NODE_ENV = process.env.NODE_ENV || "development";

app.use(
  cors({
    origin: (origin, callback) => {
      // DEV: allow everything (preview origins vary a lot)
      if (NODE_ENV !== "production") {
        return callback(null, true);
      }

      // PROD: allow server-to-server / same-origin (no Origin header)
      if (!origin) return callback(null, true);

      // PROD: allow replit origins + allowlist
      const effectiveAllowed = new Set<string>([
        ...allowedOrigins,
        ...getReplitOrigins(),
      ]);

      if (effectiveAllowed.has(origin)) return callback(null, true);

      // Log blocked origins to make debugging obvious
      process.stderr.write(`[CORS_BLOCK] origin=${origin}\n`);

      // IMPORTANT: do NOT throw an error (prevents 500/white screen)
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-Id",
    ],
  })
);

// ---- REQUEST ID ----
app.use((req, _res, next) => {
  const rid = (req.headers["x-request-id"] as string) || createRequestId();
  req.headers["x-request-id"] = rid;
  next();
});

// ---- GLOBAL REQUEST LOGGER (MUST BE BEFORE REDIRECTS) ----
let reqCounter = 0;
app.use((req, res, next) => {
  const start = Date.now();
  const rid = `R${++reqCounter}`;
  const requestId = (req.headers["x-request-id"] as string) || rid;

  // Use stdout.write for more reliable flushing in autoscale
  process.stdout.write(
    `➡️ [${rid}] ${req.method} ${req.originalUrl} host=${req.get("host")} requestId=${requestId}\n`
  );

  res.on("finish", () => {
    const duration = Date.now() - start;
    process.stdout.write(
      `⬅️ [${rid}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms) requestId=${requestId}\n`
    );

    // Structured log record (keep if you want metrics/searchability)
    logInfo("http_request", {
      requestId,
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      host: req.get("host"),
      status: res.statusCode,
      durationMs: duration,
    });
  });

  next();
});

// ---- REDIRECT ivasa.ai -> beta.ivasa.ai (EXCLUDING WEBHOOKS) ----
app.use((req, res, next) => {
  const host = req.get("host");
  const path = req.path;

  // Never redirect webhook endpoints
  if (
    path.includes("/stripe-webhook") ||
    path.includes("/stripe/webhook") ||
    path.includes("/vapi/webhook")
  ) {
    return next();
  }

  if (
    host === "ivasa.ai" ||
    host === "www.ivasa.ai" ||
    host === "ivasa-ai.com" ||
    host === "www.ivasa-ai.com" ||
    host === "theravasa.com" ||
    host === "www.theravasa.com" ||
    host === "registerreality.com" ||
    host === "www.registerreality.com"
  ) {
    return res.redirect(301, `https://beta.ivasa.ai${req.originalUrl}`);
  }

  next();
});

// Soft auth on /api except webhooks + auth bootstrap routes
app.use("/api", (req, res, next) => {
  // Skip auth for webhooks
  if (
    req.path.startsWith("/vapi/webhook") ||
    req.path.startsWith("/vapi/tools") ||
    req.path.startsWith("/stripe/webhook") ||
    req.path.startsWith("/stripe-webhook")
  ) {
    return next();
  }

  // Skip auth for auth bootstrap endpoints (signup/login/profile init)
  // IMPORTANT: these routes should validate in their own way (see note below)
  if (req.path.startsWith("/auth")) {
    return next();
  }

  return authenticateToken(req, res, next);
});

(async () => {
  try {
    log("🚀 Starting server initialization...");
    const server = await registerRoutes(app);
    log("✅ Routes registered successfully");

    // ---- ERROR HANDLER (AFTER ROUTES) ----
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      logError("unhandled_error", {
        requestId: req.headers["x-request-id"],
        name: err?.name,
        message: err?.message,
      });

      if (res.headersSent) return next(err);

      const status = err.status || err.statusCode || 500;
      const message =
        status >= 500 && process.env.NODE_ENV === "production"
          ? "Internal Server Error"
          : err.message || "Internal Server Error";

      res.status(status).json({ message, requestId: req.headers["x-request-id"] });
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
      log("✅ Vite development server configured");
    } else {
      serveStatic(app);
      log("✅ Static file serving configured for production");
    }

    // ---- SERVER START (CORRECT ERROR HANDLING) ----
    const port = parseInt(process.env.PORT || "5000", 10);

    server.on("error", (err: NodeJS.ErrnoException) => {
      process.stderr.write(
        `❌ Failed to start server on port ${port}: code=${err.code ?? "?"} message=${err.message}\n`
      );
      process.exit(1);
    });

    server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
      process.stdout.write(
        `✅ Server running on 0.0.0.0:${port} env=${process.env.NODE_ENV || "development"}\n`
      );
    });
  } catch (error) {
    console.error("❌ Fatal error during server startup:", error);
    process.exit(1);
  }
})();
