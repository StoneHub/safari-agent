import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const background = await readFile(new URL('../extension/background.js',import.meta.url),'utf8');
const content = await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
function harness() {
 let listener, removed, updated, interval; const sent = [], requests = [];
 const tab = {id:7,url:'https://example.test/form',title:'Synthetic fixture'};
 let commands = [];
 const browser = {runtime:{id:'fixture',onMessage:{addListener:f=>listener=f}},tabs:{onRemoved:{addListener:f=>removed=f},onUpdated:{addListener:f=>updated=f},get:async()=>({...tab}),query:async()=>[{...tab}],update:async(id,{url})=>{tab.url=url;updated(id,{url});},sendMessage:async(id,msg)=>{sent.push(msg);return msg.kind === 'identify'?'doc-1':{text:'Fixture'};}},scripting:{executeScript:async()=>{}}};
 vm.runInNewContext(background,{browser,fetch:async(url,init)=>{requests.push(JSON.parse(init.body)); const batch=commands;commands=[];return {ok:true,json:async()=>({commands:batch})};},AbortSignal,crypto:{randomUUID},setInterval:f=>interval=f});
 return {tab,sent,requests,send:(msg,sender={id:'fixture'})=>listener(msg,sender),tick:()=>interval(),navigate:()=>updated(7,{status:'loading'}),remove:()=>removed(7),commands:c=>commands=c.map(command=>({...command,grantId:command.grantId ?? requests.at(-1)?.tabs.find(t=>t.id===command.args.tabId)?.grantId}))};
}
const token='synthetic-fixture-token-at-least-32-characters';
test('only popup can grant; fresh tabs denied; navigation and Stop revoke access', async () => {
 const h=harness();
 await assert.rejects(h.send({kind:'grant'},{id:'fixture',tab:{id:7}}),/Popup/);
 await assert.rejects(h.send({kind:'grant'}),/Pair first/);
 await h.send({kind:'pair',token,port:19447});
 assert.equal((await h.send({kind:'status'})).granted,0);
 await h.send({kind:'grant'}); assert.equal((await h.send({kind:'status'})).granted,1);
 h.commands([{id:'one',name:'read_page',args:{tabId:7}}]);await h.tick();
 assert.equal(h.sent.at(-1).document,'doc-1');
 h.navigate(); assert.equal((await h.send({kind:'status'})).granted,0);
 h.commands([{id:'two',name:'read_page',args:{tabId:7}}]);await h.tick();
 assert.equal(h.sent.filter(m=>m.kind==='agent-command').length,1);
 await h.send({kind:'grant'});await h.send({kind:'stop'});
 assert.equal((await h.send({kind:'status'})).granted,0);
 assert.deepEqual(h.requests.at(-1).tabs,[]);
});
test('navigation restricts schemes, revokes grants and never activates a window', async () => {
 const h=harness();await h.send({kind:'pair',token,port:19447});await h.send({kind:'grant'});
 h.commands([{id:'bad',name:'navigate',args:{tabId:7,url:'javascript:alert(1)'}}]);await h.tick();assert.equal(h.tab.url,'https://example.test/form');
 h.commands([{id:'good',name:'navigate',args:{tabId:7,url:'https://example.test/next'}}]);await h.tick();
 assert.equal(h.tab.url,'https://example.test/next');assert.equal((await h.send({kind:'status'})).granted,0);
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

test('Stop and regrant reject a command captured under the previous grant', async () => {
 const h=harness(); await h.send({kind:'pair',token,port:19447}); await h.send({kind:'grant'});
 const old=h.requests.at(-1).tabs[0].grantId;
 await h.send({kind:'stop'}); await h.send({kind:'grant'});
 assert.notEqual(h.requests.at(-1).tabs[0].grantId,old);
 h.commands([{id:'stale',name:'click',grantId:old,args:{tabId:7,handle:'old'}}]); await h.tick();
 assert.equal(h.sent.filter(m=>m.kind==='agent-command').length,0);
});
