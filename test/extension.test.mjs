import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const background = await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
const content = await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
const flush = async () => { for(let i=0;i<80;i++) await Promise.resolve(); };
const popup = {id:'fixture',url:'safari-web-extension://fixture/popup.html'};
function deferred() { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; }
async function harness(options={}) {
 let listener, removed, updated, interval, nativeMessage, nativeDisconnected; const sent = [], requests = [], nativeCalls = [], injections = [], permissionChecks = [];
 const stored = options.stored || {};
 const tab = {id:7,url:'https://example.test/form',title:'Synthetic fixture',incognito:false,status:'complete'};
 const tabs = options.tabs || [tab];
 let commands=[], documentId='doc-1', holdFetch=null, holdResult=null, now=1000000;
 const eventListeners={}, counts={queries:0};
 const events = name => ({addListener(fn){if(name)eventListeners[name]=fn;}});
 const browser = {
  runtime:{id:'fixture',getURL:path=>'safari-web-extension://fixture/'+path,onMessage:{addListener:f=>listener=f},onStartup:events(),onInstalled:events(),connectNative:()=>({onMessage:{addListener:f=>nativeMessage=f},onDisconnect:{addListener:f=>nativeDisconnected=f},disconnect:()=>nativeDisconnected?.()}),sendNativeMessage:async(app,msg)=>{nativeCalls.push({app,msg});return options.nativeReply || {ok:true,version:1,token:'a'.repeat(64),port:19447};}},
  storage:{local:{get:async defaults=>({...defaults,...stored}),set:async value=>Object.assign(stored,value)}},
  permissions:{contains:async({origins})=>{permissionChecks.push(...origins);return options.permissionCheck ? options.permissionCheck(origins) : !origins.some(origin=>origin.startsWith('https://denied.test'));},onRemoved:events(),onAdded:events()},
  tabs:{onCreated:events('created'),onActivated:events(),onRemoved:{addListener:f=>removed=f},onUpdated:{addListener:f=>updated=f},get:async id=>({...tabs.find(t=>t.id===id)}),query:async()=>{counts.queries++;return tabs.map(t=>({...t}));},update:async(id,{url})=>{tab.url=url;tab.status='loading';updated(id,{url,status:'loading'});},sendMessage:async(id,msg)=>{sent.push(msg);if(msg.kind==='identify')return documentId; if(holdResult){const gate=holdResult;holdResult=null;await gate.promise;}return {text:'Fixture'};}},
  scripting:{executeScript:async options=>{injections.push(options);}}
 };
 class Clock extends Date {static now(){return now;}}
 vm.runInNewContext(background,{browser,URL,AbortController,Date:Clock,crypto:{randomUUID},setTimeout,clearTimeout,setInterval:f=>interval=f,fetch:async(url,init)=>{
  requests.push({url,...JSON.parse(init.body)});const batch=commands;commands=[];
  if(holdFetch){const gate=holdFetch;holdFetch=null;await gate.promise;}
  return {ok:true,json:async()=>({commands:batch})};
 }});
 await flush();
 return {tab,tabs,sent,requests,stored,nativeCalls,injections,counts,permissionChecks,
  advance:ms=>{now+=ms;},
  create:async newTab=>{tabs.push(newTab);eventListeners.created(newTab);await flush();},
  send:(msg,sender=popup)=>listener(msg,sender),
  tick:async()=>{interval();await flush();},
  navigate:async()=>{tab.status='loading';updated(7,{status:'loading'});await flush();documentId='doc-2';tab.status='complete';updated(7,{status:'complete'});await flush();},
  commands:c=>{commands=c.map(command=>({...command,grantId:command.grantId ?? requests.at(-1)?.tabs.find(t=>t.id===command.args.tabId)?.grantId}));},
  holdFetch:()=>{const gate=deferred();holdFetch=gate;return gate;},
  holdResult:()=>{const gate=deferred();holdResult=gate;return gate;},
  wake:async message=>{nativeMessage?.(message);await flush();}
 };
}
test('normal permitted tabs appear automatically; no page can pair or change access',async()=>{
 const h=await harness();
 assert.equal(h.requests.at(-1).tabs[0].id,7);
 assert.deepEqual(JSON.parse(JSON.stringify(h.nativeCalls[0])),{app:'app.stonehub.safari-agent',msg:{kind:'connection',version:1}});
 assert.equal((await h.send({kind:'status'})).available,1);
 await assert.rejects(h.send({kind:'stop'},{...popup,tab:{id:7}}),/Popup/);
 await assert.rejects(h.send({kind:'resume'},{id:'other',url:popup.url}),/Popup/);
 await assert.rejects(h.send({kind:'pair',token:'bad',port:1234}),/Unsupported/);
 assert.ok(h.requests.every(r=>r.url==='http://127.0.0.1:19447/sync'));
 assert.ok(!JSON.stringify(h.stored).includes('aaaa'), 'never persist native credentials');
});
test('custom-port tabs use Safari-compatible host patterns without changing their document URL',async()=>{
 const url='http://127.0.0.1:19448/form.html';
 const h=await harness({tabs:[{id:7,url,incognito:false,status:'complete'}],permissionCheck:origins=>origins.every(pattern=>pattern==='http://127.0.0.1/*')});
 assert.equal(h.requests.at(-1).tabs[0].url,url);
 assert.ok(h.permissionChecks.length>0);
 assert.ok(h.permissionChecks.every(pattern=>pattern==='http://127.0.0.1/*'));
});
test('idle syncs reuse discovery for five seconds but new tabs and navigation refresh immediately',async()=>{
 const h=await harness();
 const initialQueries=h.counts.queries;
 const initialIdentify=h.sent.filter(message=>message.kind==='identify').length;
 for(let i=0;i<5;i++){h.advance(700);await h.tick();}
 assert.equal(h.counts.queries,initialQueries,'idle polling does not repeatedly enumerate tabs');
 assert.equal(h.sent.filter(message=>message.kind==='identify').length,initialIdentify,'idle polling avoids per-tab IPC');
 h.advance(1500);await h.tick();
 assert.equal(h.counts.queries,initialQueries+1,'cache expires at five seconds');
 const afterExpiry=h.counts.queries;
 await h.create({id:8,url:'https://example.test/new',title:'New fictional tab',incognito:false,status:'complete'});
 assert.ok(h.counts.queries>afterExpiry,'tab lifecycle invalidates the fresh cache');
 assert.deepEqual(h.requests.at(-1).tabs.map(tab=>tab.id),[7,8]);
 const old=h.requests.at(-1).tabs.find(tab=>tab.id===7).grantId;
 await h.navigate();
 assert.notEqual(h.requests.at(-1).tabs.find(tab=>tab.id===7).grantId,old,'navigation refreshes nonce without a clock advance');
});
test('private, denied-host, loading and non-HTTP tabs never appear or receive injection',async()=>{
 const tabs=[
  {id:1,url:'https://allowed.test/',incognito:false},
  {id:2,url:'https://private.test/',incognito:true},
  {id:3,url:'https://denied.test/',incognito:false},
  {id:4,url:'file:///private/fixture',incognito:false},
  {id:5,url:'https://unknown-window.test/'},
  {id:6,url:'https://loading.test/',incognito:false,status:'loading'}
 ];
 const h=await harness({tabs});
 assert.deepEqual(h.requests.at(-1).tabs.map(t=>t.id),[1]);
 assert.deepEqual(h.injections.map(x=>x.target.tabId),[1]);
});
test('navigation automatically discovers fresh document access and rejects old commands',async()=>{
 const h=await harness(); const old=h.requests.at(-1).tabs[0].grantId;
 await h.navigate();const fresh=h.requests.at(-1).tabs[0].grantId;
 assert.notEqual(fresh,old);
 h.commands([{id:'stale',name:'click',grantId:old,args:{tabId:7,handle:'old'}}]);await h.tick();
 assert.equal(h.sent.filter(m=>m.kind==='agent-command').length,0);
 h.commands([{id:'fresh',name:'read_page',args:{tabId:7}}]);await h.tick();
 assert.equal(h.sent.at(-1).document,'doc-2');
 const seq=h.requests.map(r=>r.sequence);assert.equal(new Set(seq).size,seq.length);
 assert.ok(seq.every((n,i)=>i===0 || n>seq[i-1]));
 assert.equal(new Set(h.requests.map(r=>r.connectionId)).size,1);
});
test('Stop persists, sends empty access and requires explicit Resume after restart',async()=>{
 const h=await harness();await h.send({kind:'stop'});
 assert.equal(h.stored.agentStopped,true);
 assert.equal((await h.send({kind:'status'})).available,0);
 assert.deepEqual(h.requests.at(-1).tabs,[]);
 await h.tick();assert.deepEqual(h.requests.at(-1).tabs,[]);
 const restarted=await harness({stored:h.stored});
 assert.equal(restarted.nativeCalls.length,0);
 assert.equal((await restarted.send({kind:'status'})).stopped,true);
 await restarted.send({kind:'resume'});
 assert.equal((await restarted.send({kind:'status'})).available,1);
 assert.equal(restarted.stored.agentStopped,false);
});
test('Stop supersedes an in-flight bridge response before command dispatch',async()=>{
 const h=await harness();const gate=h.holdFetch();
 h.commands([{id:'pending',name:'click',args:{tabId:7,handle:'fixture'}}]);
 const tick=h.tick();await flush();
 await h.send({kind:'stop'});gate.resolve();await tick;await flush();
 assert.equal(h.sent.filter(m=>m.kind==='agent-command').length,0);
 assert.deepEqual(h.requests.at(-1).tabs,[]);
});
test('Stop discards an already-dispatched result and Resume rotates access',async()=>{
 const h=await harness();const old=h.requests.at(-1).tabs[0].grantId;const gate=h.holdResult();
 h.commands([{id:'pending',name:'read_page',args:{tabId:7}}]);const tick=h.tick();await flush();
 await h.send({kind:'stop'});gate.resolve();await tick;await flush();
 assert.ok(h.requests.every(r=>!r.results.some(result=>result.id==='pending')));
 await h.send({kind:'resume'});assert.notEqual(h.requests.at(-1).tabs[0].grantId,old);
 h.commands([{id:'old',name:'click',grantId:old,args:{tabId:7,handle:'fixture'}}]);await h.tick();
 assert.equal(h.sent.filter(m=>m.kind==='agent-command').length,1,'no second dispatch under stopped session');
});
test('bad native descriptor never chooses an arbitrary bridge origin or exposes tabs',async()=>{
 const h=await harness({nativeReply:{ok:true,version:1,host:'https://evil.test',port:80,token:'a'.repeat(64)}});
 assert.equal(h.requests.length,0);assert.equal(h.injections.length,0);
 assert.equal((await h.send({kind:'status'})).available,0);
});
test('native wake reconnects through private bootstrap; messages cannot supply credentials or resume Stop',async()=>{
 const h=await harness(); const calls=h.nativeCalls.length;
 await h.wake({name:'bridge-wake',userInfo:{kind:'wake',version:1}});
 assert.equal(h.nativeCalls.length,calls+1);
 await h.wake({kind:'pair',version:1,token:'b'.repeat(64),port:9999});
 assert.ok(h.requests.every(r=>r.url==='http://127.0.0.1:19447/sync'));
 await h.send({kind:'stop'}); const stoppedCalls=h.nativeCalls.length;
 await h.wake({kind:'wake',version:1});
 assert.equal(h.nativeCalls.length,stoppedCalls);
 assert.equal((await h.send({kind:'status'})).stopped,true);
});
test('navigation refuses unsafe schemes and hosts without browser permission',async()=>{
 const h=await harness();
 for(const url of ['javascript:alert(1)','https://denied.test/next']){
  h.commands([{id:'bad',name:'navigate',args:{tabId:7,url}}]);await h.tick();
  assert.equal(h.tab.url,'https://example.test/form');
 }
});
test('content uses document-bound actual DOM nodes; stale documents/nodes and password edits rejected', async () => {
 let listener; const node={tagName:'INPUT',type:'text',isConnected:true,disabled:false,innerText:'',getClientRects:()=>[{}],getAttribute:()=>null};
 const doc={title:'Fixture',body:{innerText:'Synthetic page'},querySelectorAll:()=>[node]};
 const context={crypto:{randomUUID},browser:{runtime:{onMessage:{addListener:f=>listener=f}}},document:doc,location:{href:'https://example.test'},getComputedStyle:()=>({visibility:'visible'})};
 vm.runInNewContext(content,context);
 const id=await listener({kind:'identify'});
 const command=(name,args,document=id)=>listener({kind:'agent-command',document,command:{name,args}});
 await assert.rejects(command('read_page',{},'old-document'),/Document changed/);
 const page=await command('read_page',{});const handle=page.elements[0].handle;
 assert.equal((await command('read_page',{})).elements[0].handle,handle);
 node.type='password';await assert.rejects(command('type',{handle,text:'secret'}),/cannot be edited/);
 node.isConnected=false;await assert.rejects(command('click',{handle}),/Stale/);
});
