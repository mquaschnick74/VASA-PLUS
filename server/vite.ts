import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { blogSocialMetaMiddleware } from "./middleware/blog-social-meta";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Helper function to get the HTML template for development
  const getDevHtmlTemplate = async () => {
    const clientTemplate = path.resolve(
      import.meta.dirname,
      "..",
      "client",
      "index.html",
    );

    let template = await fs.promises.readFile(clientTemplate, "utf-8");
    template = template.replace(
      `src="/src/main.tsx"`,
      `src="/src/main.tsx?v=${nanoid()}"`,
    );
    return await vite.transformIndexHtml("", template);
  };

  // Handle blog post social meta tags before the catch-all route
  app.use("*", async (req, res, next) => {
    await blogSocialMetaMiddleware(req, res, next, getDevHtmlTemplate);
  });

  // Catch-all route for all other pages
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static files with proper MIME types and caching
  app.use(express.static(distPath, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Set correct MIME types for JavaScript modules
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
      }
    }
  }));

  // Helper function to get the HTML template for production
  const getProdHtmlTemplate = async () => {
    return fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
  };

  // Handle blog post social meta tags before the catch-all route
  app.use("*", async (req, res, next) => {
    // Skip asset files - don't process them for social meta
    if (req.originalUrl.startsWith('/assets/')) {
      return next();
    }
    await blogSocialMetaMiddleware(req, res, next, getProdHtmlTemplate);
  });

  // fall through to index.html if the file doesn't exist
  // BUT skip this for asset requests to prevent serving HTML as JavaScript
  app.use("*", (req, res, next) => {
    // If request is for an asset file, let it 404 instead of serving index.html
    if (req.originalUrl.startsWith('/assets/')) {
      return next();
    }

    // For all other routes, serve index.html (SPA behavior)
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
