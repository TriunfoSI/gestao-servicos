// Servidor local de testes: serve a pasta app/ e imita o Supabase (/rest/v1 -> PostgREST, /auth/v1 -> GoTrue)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const APP = path.resolve(import.meta.dirname, '../app');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const alvo = (url) => url.startsWith('/rest/v1') ? ['localhost', 3000, url.slice(8) || '/'] : url.startsWith('/auth/v1') ? ['localhost', 9999, url.slice(8) || '/'] : null;
http.createServer((req, res) => {
  const a = alvo(req.url);
  if (a) {
    const p = http.request({ host: a[0], port: a[1], path: a[2], method: req.method, headers: { ...req.headers, host: `${a[0]}:${a[1]}` } }, (r) => {
      res.writeHead(r.statusCode, { ...r.headers, 'access-control-allow-origin': '*' }); r.pipe(res);
    });
    p.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(p); return;
  }
  if (req.url.split('?')[0] === '/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(`export const SUPABASE_URL = 'http://localhost:8000';\nexport const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImxvY2FsIiwiZXhwIjoyMDAwMDAwMDAwfQ.RlEJid_9_90GD3a7ISXNcvvpXo6mvWZo3KR3MUwxz64';\n`); return;
  }
  let f = path.join(APP, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(APP) || !fs.existsSync(f)) { res.writeHead(404); res.end('não encontrado'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8000, () => console.log('http://localhost:8000'));
