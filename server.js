/**
 * @file server.js
 * @description Standalone Node.js development server for Day Planner web application.
 * Serves root index.html and static assets (/src, /images) directly from project root.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/**
 * Builds the standalone static file server: serves `index.html` for `/`,
 * resolves requests under the project root with directory-traversal
 * protection, and sets a no-cache response so local edits are always fresh.
 * @returns {import('node:http').Server} An unstarted HTTP server (call `.listen()`).
 */
export function createServer() {
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;

    if (pathname === '/') {
      pathname = '/index.html';
    }

    // Prevent directory traversal attacks
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(__dirname, safePath);

    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        if (err && err.code !== 'ENOENT') {
          console.error(`stat failed for ${filePath}:`, err.stack || err);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const stream = fs.createReadStream(filePath);
      stream.on('open', () => {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        stream.pipe(res);
      });
      stream.on('error', (streamErr) => {
        console.error(`Failed to read ${filePath}:`, streamErr.stack || streamErr);
        if (!res.headersSent) {
          const status = streamErr.code === 'ENOENT' ? 404 : 500;
          res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(status === 404 ? '404 Not Found' : '500 Internal Server Error');
        } else {
          res.destroy();
        }
      });
    });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use — is another instance of \`npm start\` already running?`);
    } else {
      console.error('Server failed to start:', err.stack || err);
    }
    process.exit(1);
  });
  server.listen(PORT, () => {
    console.log(`Day Planner standalone server running at http://localhost:${PORT}`);
  });
}
