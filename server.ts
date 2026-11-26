import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { authenticateMiddleware, registerAuthRoutes } from './server/auth.ts';
import { registerApiRoutes } from './server/routes.ts';
import './server/db.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '6mb' }));

  // Public auth endpoints (/api/auth/status, /api/auth/signup, /api/auth/login)
  registerAuthRoutes(app);

  // Protect all remaining /api endpoints with Bearer session verification
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) {
      next();
      return;
    }
    authenticateMiddleware(req, res, next);
  });

  registerApiRoutes(app);

  // Explicit 404 for unknown /api routes so SPA fallback doesn't mask API errors
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`University Student Information Management System listening on port ${PORT}`);
  });
}

startServer();
