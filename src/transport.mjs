import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
export function createTransport(broker, token) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('Pairing token must contain at least 32 characters');
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    // Never expose credentials or page content to ordinary website origins.
    if (origin && !/^safari-web-extension:\/\/[a-zA-Z0-9-]+$/.test(origin)) { res.writeHead(403).end(); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods','POST'); res.writeHead(204).end(); return; }
    const auth = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) { res.writeHead(401).end(); return; }
    if (req.method !== 'POST' || req.url !== '/sync') { res.writeHead(404).end(); return; }
    let body = ''; try {
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 262144) { res.writeHead(413).end(); return; } }
      const data = JSON.parse(body);
      if (!Array.isArray(data.tabs) || !Array.isArray(data.results) || data.tabs.length > 100 || data.results.length > 16) throw new Error('Invalid sync');
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({commands:broker.sync(data.tabs, data.results)}));
    } catch { res.writeHead(400).end(); }
  });
}
