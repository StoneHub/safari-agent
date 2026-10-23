const grants = new Map();
let pairing = null, polling = false, results = [], status = 'Connecting automatically', generation = 0;
let stopped = true, initialized = false, controller = null, nativePort = null;
const connectionId = crypto.randomUUID();
let sequence = 0;
let discoveryVersion = 0, cachedDiscovery = null;
function invalidateDiscovery() { discoveryVersion++; cachedDiscovery = null; }
const safeURL = url => {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !!parsed.hostname; }
  catch { return false; }
};
const normalTab = tab => Number.isInteger(tab?.id) && tab.incognito === false && safeURL(tab.url) && tab.status !== 'loading';
async function hostAllowed(url) {
  if (!safeURL(url)) return false;
  try {
    // Safari match-pattern hosts cannot contain a port. Host permissions cover
    // all ports; the actual tab URL remains unchanged for document checks.
    const parsed = new URL(url);
    return await browser.permissions.contains({origins:[`${parsed.protocol}//${parsed.hostname}/*`]});
  }
  catch { return false; }
}
const current = epoch => epoch === generation && !stopped;
async function discover(epoch) {
  if (cachedDiscovery && cachedDiscovery.epoch === epoch && cachedDiscovery.version === discoveryVersion && Date.now() - cachedDiscovery.at < 5000) {
    return cachedDiscovery.tabs.filter(tab => {
      const grant = grants.get(tab.id);
      return grant?.grantId === tab.grantId && grant.url === tab.url;
    });
  }
  const version = discoveryVersion;
  const valid = () => current(epoch) && version === discoveryVersion;
  const tabs = await browser.tabs.query({});
  if (!valid()) return [];
  const allowed = [];
  const present = new Set();
  for (const tab of tabs.slice(0,500)) {
    if (!valid()) break;
    if (!normalTab(tab) || !(await hostAllowed(tab.url))) { grants.delete(tab.id); continue; }
    if (!valid()) break;
    try {
      let grant = grants.get(tab.id), document;
      if (grant?.url === tab.url) {
        try { document = await browser.tabs.sendMessage(tab.id,{kind:'identify'}); } catch { grant = null; }
      }
      if (!grant || grant.url !== tab.url || document !== grant.document) {
        await browser.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
        if (!valid()) break;
        document = await browser.tabs.sendMessage(tab.id,{kind:'identify'});
        grant = {url:tab.url,document,grantId:crypto.randomUUID()};
      }
      const latest = await browser.tabs.get(tab.id);
      if (!valid()) break;
      if (!normalTab(latest) || latest.url !== tab.url || typeof document !== 'string' || !document || document.length > 128) {
        grants.delete(tab.id); continue;
      }
      grants.set(tab.id,grant); present.add(tab.id);
      allowed.push({id:tab.id,url:tab.url,title:latest.title || '',grantId:grant.grantId});
    } catch { grants.delete(tab.id); }
  }
  if (!valid()) return [];
  for (const id of grants.keys()) if (!present.has(id)) grants.delete(id);
  cachedDiscovery = {epoch,version,at:Date.now(),tabs:allowed};
  return allowed;
}
async function connect(epoch) {
  if (!nativePort && typeof browser.runtime.connectNative === 'function') {
    try {
      const port = browser.runtime.connectNative('app.stonehub.safari-agent');
      nativePort = port;
      port.onMessage.addListener(message => {
        const wake = message?.name === 'bridge-wake' ? message.userInfo : message;
        if (!stopped && wake?.kind === 'wake' && wake.version === 1) {
          // Native messages trigger resync only; never accept credentials or access settings here.
          pairing = null;
          invalidateDiscovery();
          void sync();
        }
      });
      port.onDisconnect.addListener(() => { if (nativePort === port) { nativePort = null; invalidateDiscovery(); } });
    } catch { nativePort = null; }
  }
  if (pairing) return pairing;
  const reply = await browser.runtime.sendNativeMessage('app.stonehub.safari-agent',{kind:'connection',version:1});
  if (!current(epoch)) return null;
  if (reply?.ok !== true || reply.version !== 1 || !Number.isInteger(reply.port) || reply.port < 1024 || reply.port > 65535 || !/^[a-f0-9]{64}$/i.test(reply.token || '')) throw new Error('Native connection unavailable');
  pairing = {port:reply.port,token:reply.token};
  invalidateDiscovery();
  return pairing;
}
async function sync() {
  if (!initialized || polling || (stopped && !pairing)) return;
  polling = true;
  const epoch = generation;
  let requestDiscoveryVersion = discoveryVersion;
  try {
    const connection = stopped ? pairing : await connect(epoch);
    if (!connection || epoch !== generation) return;
    requestDiscoveryVersion = discoveryVersion;
    const tabs = stopped ? [] : await discover(epoch);
    if (epoch !== generation) return;
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(),5000);
    let response;
    try {
      response = await fetch(`http://127.0.0.1:${connection.port}/sync`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection.token}`},body:JSON.stringify({tabs,results,connectionId,sequence:++sequence}),signal:requestController.signal});
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error('Bridge unavailable');
    const data = await response.json();
    if (epoch !== generation) return;
    results = [];
    status = stopped ? 'Stopped — no agent access' : 'Connected — open permitted tabs are available';
    if (stopped) return;
    if (!Array.isArray(data.commands) || data.commands.length > 16) throw new Error('Invalid bridge response');
    for (const command of data.commands) {
      if (!current(epoch)) break;
      try {
        if (!['read_page','click','type','navigate'].includes(command.name)) throw new Error('Unsupported command');
        const tab = await browser.tabs.get(command.args?.tabId);
        const grant = grants.get(command.args?.tabId);
        if (!current(epoch)) throw new Error('Access stopped');
        if (!normalTab(tab) || !grant || command.grantId !== grant.grantId || tab.url !== grant.url || !(await hostAllowed(tab.url))) throw new Error('Document access expired');
        if (!current(epoch) || grants.get(tab.id) !== grant) throw new Error('Access stopped or document changed');
        let result;
        if (command.name === 'navigate') {
          if (!(await hostAllowed(command.args.url))) throw new Error('Browser website access required');
          if (!current(epoch) || grants.get(tab.id) !== grant) throw new Error('Access stopped or document changed');
          grants.delete(tab.id);
          await browser.tabs.update(tab.id,{url:command.args.url});
          result = {navigating:true,documentAccessRefreshing:true};
        } else {
          result = await browser.tabs.sendMessage(tab.id,{kind:'agent-command',document:grant.document,command});
        }
        if (current(epoch)) results.push({id:command.id,result});
      } catch {
        if (current(epoch)) results.push({id:command.id,error:'Command rejected or document unavailable; inspect before retrying'});
      }
    }
  } catch {
    if (epoch === generation) {
      pairing = null; grants.clear(); results = [];
      invalidateDiscovery();
      requestDiscoveryVersion = discoveryVersion;
      status = stopped ? 'Stopped — no agent access' : 'Bridge unavailable — reconnecting automatically';
    }
  } finally {
    polling = false; controller = null;
    // Stop/resume can supersede an in-flight discovery or network response.
    if (epoch !== generation || (!stopped && requestDiscoveryVersion !== discoveryVersion)) void sync();
  }
}
function invalidate() { generation++; grants.clear(); results = []; invalidateDiscovery(); controller?.abort(); }
browser.tabs.onRemoved.addListener(id => { grants.delete(id); invalidateDiscovery(); void sync(); });
browser.tabs.onUpdated.addListener((id, change) => {
  invalidateDiscovery();
  if (change.url || change.status === 'loading') grants.delete(id);
  void sync();
});
browser.tabs.onCreated?.addListener(() => { invalidateDiscovery(); void sync(); });
browser.tabs.onActivated?.addListener(() => { invalidateDiscovery(); void sync(); });
browser.permissions.onRemoved?.addListener(() => { invalidate(); void sync(); });
browser.permissions.onAdded?.addListener(() => { invalidateDiscovery(); void sync(); });
browser.windows?.onFocusChanged?.addListener(() => { invalidateDiscovery(); void sync(); });
browser.runtime.onStartup?.addListener(() => void sync());
browser.runtime.onInstalled?.addListener(() => void sync());
browser.alarms?.onAlarm?.addListener(alarm => { if (alarm.name === 'safari-agent-reconnect') void sync(); });
browser.runtime.onMessage.addListener(async (message, sender) => {
  // Normal pages and content scripts cannot connect, stop, resume or supply credentials.
  if (sender.tab || sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('popup.html')) throw new Error('Popup required');
  if (!['status','stop','resume'].includes(message?.kind)) throw new Error('Unsupported popup request');
  if (message.kind === 'stop') {
    invalidate(); stopped = true; status = 'Stopped — no agent access';
    nativePort?.disconnect(); nativePort = null;
    await browser.storage.local.set({agentStopped:true});
  } else if (message.kind === 'resume') {
    invalidate(); stopped = false; pairing = null; status = 'Connecting automatically';
    await browser.storage.local.set({agentStopped:false});
  }
  await sync();
  return {status,stopped,available:grants.size};
});
// Tokens and document nonces are memory-only. Stop survives extension suspension/restart.
const initializationEpoch = generation;
browser.storage.local.get({agentStopped:false}).then(settings => {
  if (generation === initializationEpoch) stopped = settings.agentStopped === true;
  initialized = true;
  if (stopped) status = 'Stopped — no agent access';
  void sync();
}).catch(() => { initialized = true; stopped = true; status = 'Stopped — local settings unavailable'; });
browser.alarms?.create('safari-agent-reconnect',{periodInMinutes:1});
// Timers are opportunistic polling, not a promise of Safari background execution.
setInterval(() => void sync(),700);
