/**
 * @file server.js
 * @description Local Node.js development server for Day Planner web application.
 * Serves index.html with embedded styles, scripts, and mocked Google Apps Script bridge bindings.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

/**
 * Handles HTTP requests and renders the concatenated Day Planner web application.
 * @param {import('node:http').IncomingMessage} req HTTP incoming request object.
 * @param {import('node:http').ServerResponse} res HTTP response object.
 * @returns {void}
 */
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/' || pathname === '/index.html') {
    try {
      let html = fs.readFileSync(path.join(__dirname, 'gas-app', 'Index.html'), 'utf8');
      const styles = fs.readFileSync(path.join(__dirname, 'gas-app', 'Styles.html'), 'utf8');
      const script = fs.readFileSync(path.join(__dirname, 'gas-app', 'Script.html'), 'utf8');
      const about = fs.readFileSync(path.join(__dirname, 'gas-app', 'About.html'), 'utf8');
      const gasBridge = fs.readFileSync(path.join(__dirname, 'src', 'gasBridge.js'), 'utf8');

      // Replace include directives
      html = html.replace("<?!= include('style'); ?>", styles);
      html = html.replace("<?!= include('Styles'); ?>", styles);
      html = html.replace("<?!= include('About'); ?>", about);
      
      // Inject module exports wrapper for gasBridge in script tag
      const bridgeScriptSnippet = `<script type="module">
        ${gasBridge.replace('export class GASBridge', 'window.GASBridge = class GASBridge')}
      </script>`;

      html = html.replace("<?!= include('Script'); ?>", bridgeScriptSnippet + script);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${err.message}`);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Day Planner local dev server running at http://localhost:${PORT}`);
});
