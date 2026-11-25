import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'supabase' });
});

app.get('/api/download-zip', (_req, res) => {
  const zipPath = path.resolve(process.cwd(), 'public', 'forvasu-source-code.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'forvasu-app.zip');
  } else {
    res.status(404).json({ error: 'Zip archive not ready.' });
  }
});

async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Application build not found.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ForVasu server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
