import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Manager, MAX_CONFIG_MSG } from './sessions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'",
};

// Log: solo codice sessione, tipo di evento e numero di giocatori.
const log = (code, ev, n) => console.log(`${new Date().toISOString()} ${code} ${ev} ${n}`);

export function createServer({ port = Number(process.env.PORT) || 3000, host = process.env.HOST || '127.0.0.1', file = process.env.DATA_FILE || path.join(ROOT, 'data', 'sessions.json'), rnd, now, timers = true } = {}) {
  const manager = new Manager({ file, rnd, now, log });

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (p === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}'); return; }
    if (p === '/') p = '/index.html';
    const f = path.join(PUBLIC, path.normalize(p));
    if (!f.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato'); return; }
      res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_CONFIG_MSG,
    verifyClient: ({ origin, req }) => {
      try { return new URL(origin).host === req.headers.host; } catch { return false; }
    },
  });

  wss.on('connection', (ws) => {
    const conn = manager.conn((o) => ws.send(JSON.stringify(o)), (code) => ws.close(code));
    ws.on('message', (data) => manager.onMessage(conn, data));
    ws.on('close', () => manager.onClose(conn));
    ws.on('error', () => manager.onClose(conn));
  });

  if (timers) manager.start();

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        manager,
        close: () => new Promise((r) => {
          manager.stop();
          wss.clients.forEach((c) => c.terminate());
          server.close(() => r());
        }),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srv = await createServer();
  console.log(`Ruota della Fortuna in ascolto su porta ${srv.port}`);
  const bye = () => srv.close().then(() => process.exit(0));
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
}
