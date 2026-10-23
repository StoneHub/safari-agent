import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
export function createTransport(broker, token, options = {}) {
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
    if (req.method !== 'POST' || !['/sync','/call','/status','/lease'].includes(req.url)) { res.writeHead(404).end(); return; }
    if (req.url !== '/sync' && origin) {res.writeHead(403).end();return;}
    let body = ''; try {
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 262144) { res.writeHead(413).end(); return; } }
      const data = JSON.parse(body);
      let result;
      if (req.url === '/sync') {
        if (!Array.isArray(data.tabs) || !Array.isArray(data.results) || data.tabs.length > 500 || data.results.length > 16 || typeof data.connectionId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.connectionId) || !Number.isSafeInteger(data.sequence) || data.sequence < 0) throw new Error('Invalid sync');
        result={commands:broker.sync(data.tabs,data.results,{connectionId:data.connectionId,sequence:data.sequence})};
      } else if (req.url === '/status' && options.status) result=options.status();
      else if (req.url === '/lease' && options.lease) result=options.lease(data);
      else if (req.url === '/call' && options.wake) {
        if (!['list_tabs','read_page','click','type','navigate'].includes(data.name) || (data.args !== undefined && (!data.args || typeof data.args !== 'object' || Array.isArray(data.args)))) throw new Error('Invalid call');
        options.wake(); await broker.waitForSync();
        const pending=broker.call(data.name,data.args);options.wake();
        try { result=await pending; } catch(error) {result={error:error.message};}
      } else {res.writeHead(404).end();return;}
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(result));
    } catch { if (!res.headersSent) res.writeHead(400);res.end(); }
  });
}
