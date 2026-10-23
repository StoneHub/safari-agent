import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { Broker } from './broker.mjs';
import { createTransport } from './transport.mjs';
import { publishConnection, removeConnection } from './connection.mjs';

const token = randomBytes(32).toString('hex');
const broker = new Broker();
const clients = new Map();
let lastClient = Date.now(), closing = false, lastWake = 0;
const wake = () => {
  if (process.env.SAFARI_AGENT_CONNECTION_DIR) return; // Isolated tests never wake the real browser.
  if (Date.now() - lastWake < 400) return;
  lastWake = Date.now();
  execFile('/Applications/Safari Agent.app/Contents/MacOS/Safari Agent', ['--bridge-wake'], {timeout:4000}, () => {});
};
const server = createTransport(broker, token, {
  wake,
  status: () => ({version:1,pid:process.pid,extensionConnected:Date.now()-broker.lastSync<5000,availableTabs:broker.tabs.length}),
  lease: ({clientId,active}) => {
    if (typeof clientId !== 'string' || !/^[a-f0-9-]{36}$/.test(clientId)) throw new Error('Invalid client lease');
    if (active) clients.set(clientId,Date.now()); else clients.delete(clientId);
    lastClient = Date.now();
    return {ok:true};
  }
});
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(idle);
  broker.close(); server.closeAllConnections(); server.close();
  await removeConnection(token);
}
const idle = setInterval(() => {
  for (const [id,time] of clients) if (Date.now()-time > 45000) clients.delete(id);
  if (!clients.size && !broker.pending.size && Date.now()-lastClient > 45000) close();
},5000);
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,close);
server.on('error', () => { clearInterval(idle); process.exitCode = 1; });
server.listen(Number(process.env.SAFARI_AGENT_PORT || 19447),'127.0.0.1',async () => {
  try {
    await publishConnection({version:1,port:server.address().port,token,pid:process.pid});
    wake();
  } catch { console.error('Safari Agent could not publish its private native connection. Open the installed extension once and retry.'); await close(); process.exitCode=1; }
});
