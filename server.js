/**
 * @file server.js
 * @description Standalone Node.js development server for Day Planner web application.
 * Serves root index.html and an allowlist of static assets (/src, /images, /icons) from project root.
 * Binds loopback only and rejects foreign Host headers (DNS rebinding).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';

// Only what the mock preview needs; everything else in the repo root (.git, .claude, scratch, docs...) is denied.
const ALLOWED_FILES = new Set(['/index.html', '/manifest.json']);
const ALLOWED_PREFIXES = ['/src/', '/images/', '/icons/'];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/** DNS-rebinding guard: only loopback names on the served port. */
export function isAllowedHost(hostHeader, port) {
  return hostHeader === `localhost:${port}` || hostHeader === `127.0.0.1:${port}`;
}

/** Pure request check. Returns { status, filePath? }: 200 means serve filePath; 400/403 reject. */
export function resolveRequest(rawUrl, hostHeader, port) {
  if (!isAllowedHost(hostHeader, port)) return { status: 403 };
  let pathname = String(rawUrl).split(/[?#]/)[0];
  if (pathname === '/') pathname = '/index.html';
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (err) {
    console.error('server: undecodable request path, rejecting 400', err.stack);
    return { status: 400 };
  }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return { status: 403 };
  const segments = decoded.slice(1).split('/');
  // Empty, dot and dotfile segments: blocks '..', '//', .git, .claude, .env
  if (segments.some((seg) => seg === '' || seg.startsWith('.'))) return { status: 403 };
  if (!ALLOWED_FILES.has(decoded) && !ALLOWED_PREFIXES.some((pre) => decoded.startsWith(pre))) return { status: 403 };
  const filePath = path.join(__dirname, decoded);
  if (!filePath.startsWith(__dirname + path.sep)) return { status: 403 };
  return { status: 200, filePath };
}

export function createServer(port = PORT) {
  const server = http.createServer((req, res) => {
    // port 0 = ephemeral (tests): validate Host against the port actually bound
    const verdict = resolveRequest(req.url, req.headers.host, port || server.address().port);
    if (verdict.status !== 200) {
      res.writeHead(verdict.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(verdict.status === 400 ? '400 Bad Request' : '403 Forbidden');
      return;
    }
    const { filePath } = verdict;
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createServer(PORT).listen(PORT, HOST, () => {
    console.log(`Day Planner standalone server running at http://localhost:${PORT} (loopback only)`);
  });
}
