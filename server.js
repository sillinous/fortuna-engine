import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from dist with caching
app.use(express.static(join(__dirname, 'dist'), {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, path) => {
    // Don't cache index.html (always get latest version)
    if (path.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// SPA fallback — serve index.html for all non-file routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Fortuna Engine v10.4 running on port ${PORT}`);
});
