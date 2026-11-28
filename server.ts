import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import { createApiApp } from './server/appFactory.ts';
import { ROOT_DIR } from './server/runtimePaths.ts';

dotenv.config();

const PORT = 3000;
const app = createApiApp();

// ---------------------------------------------------------------------------
// Start Server with Vite Middleware (Dev) or Static Dist (Prod)
// ---------------------------------------------------------------------------
async function startServer() {
  let activeMiddleware: express.RequestHandler | null = null;
  let initError: unknown = null;

  const initPromise = (async () => {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
        },
        appType: 'spa',
      });
      activeMiddleware = vite.middlewares;
    } else {
      const distDir = path.resolve(ROOT_DIR, 'dist');
      const staticRouter = express.Router();
      staticRouter.use(express.static(distDir));
      staticRouter.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
      activeMiddleware = staticRouter;
    }
  })().catch((err) => {
    initError = err;
    console.error('Failed to initialize frontend middleware:', err);
  });

  app.use(async (req: Request, res: Response, next) => {
    if (!activeMiddleware && !initError) {
      await initPromise;
    }
    if (initError) {
      res.status(500).send('Frontend middleware failed to initialize.');
      return;
    }
    if (activeMiddleware) {
      activeMiddleware(req, res, next);
      return;
    }
    next();
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Giri Sir's Gurukul Classes portal running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
