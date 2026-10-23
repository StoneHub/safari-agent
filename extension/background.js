const grants = new Map();
let pairing = null, polling = false, results = [], status = 'Disconnected', generation = 0;
const safeURL = url => /^https?:\/\//.test(url || '');
browser.tabs.onRemoved.addListener(id => grants.delete(id));
browser.tabs.onUpdated.addListener((id, change) => { if (change.url || change.status === 'loading') grants.delete(id); });
async function sync() {
  if (polling || !pairing) return;
  polling = true;
  const epoch = generation;
  try {
    const tabs = [];
    for (const [id, grant] of grants) {
      try { const tab = await browser.tabs.get(id); if (tab.url !== grant.url) grants.delete(id); else tabs.push({id,url:grant.url,title:tab.title || '',grantId:grant.grantId}); } catch { grants.delete(id); }
    }
    const response = await fetch(`http://127.0.0.1:${pairing.port}/sync`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${pairing.token}`},body:JSON.stringify({tabs,results}),signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`Bridge refused (${response.status})`);
    const data = await response.json();
    if (epoch !== generation) return;
    results = []; status = 'Connected';
    for (const command of data.commands) {
      try {
        const tab = await browser.tabs.get(command.args.tabId);
        const grant = grants.get(command.args.tabId);
        if (epoch !== generation) throw new Error('Access stopped');
        if (!grant || command.grantId !== grant.grantId || tab.url !== grant.url) throw new Error('User grant expired');
        if (command.name === 'navigate') {
          if (!safeURL(command.args.url)) throw new Error('HTTP(S) only');
          grants.delete(tab.id); await browser.tabs.update(tab.id,{url:command.args.url});
          results.push({id:command.id,result:{navigating:true,grantRevoked:true}});
        } else {
          const result = await browser.tabs.sendMessage(tab.id,{kind:'agent-command',document:grant.document,command});
          results.push({id:command.id,result});
        }
      } catch (error) { results.push({id:command.id,error:error.message}); }
    }
  } catch (error) { status = error.message; }
  finally { polling = false; }
}
browser.runtime.onMessage.addListener(async (message, sender) => {
  // Only this extension's popup may pair/grant/stop. Content scripts cannot.
  if (sender.tab || sender.id !== browser.runtime.id) throw new Error('Popup required');
  if (message.kind === 'pair') {
    if (typeof message.token !== 'string' || message.token.length < 32 || !Number.isInteger(message.port) || message.port < 1024 || message.port > 65535) throw new Error('Invalid local pairing');
    generation++; grants.clear(); results = []; pairing = {token:message.token,port:message.port}; await sync();
  } else if (message.kind === 'grant') {
    if (!pairing) throw new Error('Pair first');
    const [tab] = await browser.tabs.query({active:true,currentWindow:true});
    if (!safeURL(tab?.url)) throw new Error('Choose an HTTP(S) tab');
    await browser.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    const document = await browser.tabs.sendMessage(tab.id,{kind:'identify'});
    grants.set(tab.id,{url:tab.url,document,grantId:crypto.randomUUID()}); await sync();
  } else if (message.kind === 'stop') { generation++; grants.clear(); results = []; await sync(); }
  return {status,granted:grants.size};
});
// Memory-only pairing and grants fail closed if Safari suspends/restarts background.
setInterval(sync, 700);
