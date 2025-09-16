import type { Express } from "express";
import { createServer, type Server } from "http";
import { Router } from 'express';

// Import route modules
import authRoutes from './routes/auth-routes';
import webhookRoutes from './routes/webhook-routes';

export async function registerRoutes(app: Express): Promise<Server> {
  const apiRouter = Router();

  // Mount route modules
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/vapi', webhookRoutes);

  // Health check
  apiRouter.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      routes: {
        auth: 'Mounted at /api/auth',
        vapi: 'Mounted at /api/vapi',
        health: 'Mounted at /api/health'
      }
    });
  });

  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}