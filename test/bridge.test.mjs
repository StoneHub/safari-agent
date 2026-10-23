import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { Broker } from '../src/broker.mjs';
import { createTransport } from '../src/transport.mjs';
const token = 'fixture-only-not-a-real-token-'.repeat(2);

test('grants, queue delivery, results, revocation and scheme validation', async () => {
 const broker = new Broker();
 await assert.rejects(broker.call('read_page',{tabId:1}),/unavailable/);
 broker.sync([{id:1,grantId:'grant-1',url:'https://example.test',title:'Fixture'},{id:2,url:'file:///secret',title:'Hidden'}]);
 assert.equal((await broker.call('list_tabs')).length,1);
 await assert.rejects(broker.call('navigate',{tabId:1,url:'javascript:alert(1)'}),/HTTP/);
 const pending = broker.call('read_page',{tabId:1});
 const [job] = broker.sync([{id:1,grantId:'grant-1',url:'https://example.test'}]);
 assert.equal(job.name,'read_page');
 broker.sync([], [{id:job.id,result:{text:'Fixture'}}]);
 assert.deepEqual(await pending,{text:'Fixture'});
 await assert.rejects(broker.call('click',{tabId:1,handle:'old'}),/unavailable/);
 broker.close();
});

test('timed-out commands cannot execute late', async () => {
 const broker = new Broker(); const tabs = [{id:1,grantId:'grant-1',url:'https://example.test'}]; broker.sync(tabs);
 await assert.rejects(broker.call('read_page',{tabId:1},5),/outcome unknown/);
 assert.deepEqual(broker.sync(tabs),[]); broker.close();
});

test('loopback transport rejects missing auth and website origins, accepts authenticated extension', async t => {
 const broker = new Broker(); const server = createTransport(broker,token);
 server.listen(0,'127.0.0.1'); await once(server,'listening');
 t.after(() => {broker.close();server.closeAllConnections();server.close();});
 const url = `http://127.0.0.1:${server.address().port}/sync`;
 const request = headers => fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({tabs:[],results:[],connectionId:'00000000-0000-4000-8000-000000000001',sequence:1})});
 assert.equal((await request({})).status,401);
 assert.equal((await request({Authorization:`Bearer ${token}`,Origin:'https://evil.example'})).status,403);
 assert.equal((await request({Authorization:'Bearer wrong',Origin:'safari-web-extension://fixture'})).status,401);
 const result = await request({Authorization:`Bearer ${token}`,Origin:'safari-web-extension://fixture'});
 assert.equal(result.status,200); assert.deepEqual(await result.json(),{commands:[]});
 assert.equal(result.headers.get('access-control-allow-origin'),'safari-web-extension://fixture');
 const oversized = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:'x'.repeat(262145)});
 assert.equal(oversized.status,413);
});

test('MCP stdio initializes and advertises automatic-tab tools without starting browser work', async t => {
 const child=spawn(process.execPath,['src/server.mjs'],{cwd:new URL('..',import.meta.url),stdio:['pipe','pipe','pipe']});
 t.after(()=>{child.stdin.end();child.kill();});
 const responses=readline.createInterface({input:child.stdout})[Symbol.asyncIterator]();
 const request=async(id,method,params)=>{child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return JSON.parse((await responses.next()).value);};
 assert.equal((await request(1,'initialize',{})).result.serverInfo.version,'0.2.1');
 const tools=(await request(2,'tools/list')).result.tools;
 assert.deepEqual(tools.map(t=>t.name),['list_tabs','read_page','click','type','navigate']);
 assert.match(tools[0].description,/open Safari/);
});

 test('queued commands cannot inherit a fresh grant on the same tab and document', async () => {
 const broker = new Broker();
 broker.sync([{id:1,url:'https://example.test',grantId:'first'}]);
 const old = broker.call('click',{tabId:1,handle:'same-document-node'});
 const rejected = assert.rejects(old,/access revoked or document replaced/);
 assert.deepEqual(broker.sync([{id:1,url:'https://example.test',grantId:'second'}]),[]);
 await rejected;
 assert.equal(JSON.stringify(await broker.call('list_tabs')).includes('grantId'),false);
 broker.close();
});

test('out-of-order sync cannot restore access after Stop or a new background session',async()=>{
 const broker=new Broker();
 const tabs=[{id:1,url:'https://example.test',grantId:'first'}];
 const session='00000000-0000-4000-8000-000000000001';
 broker.sync(tabs,[],{connectionId:session,sequence:1});
 const old=broker.call('click',{tabId:1,handle:'old'});
 const rejected=assert.rejects(old,/access revoked/);
 broker.sync([],[],{connectionId:session,sequence:3});
 await rejected;
 assert.deepEqual(broker.sync(tabs,[],{connectionId:session,sequence:2}),[]);
 assert.deepEqual(await broker.call('list_tabs'),[]);
 broker.sync([],[],{connectionId:'00000000-0000-4000-8000-000000000002',sequence:1});
 broker.sync(tabs,[],{connectionId:session,sequence:4});
 assert.deepEqual(await broker.call('list_tabs'),[]);
 broker.close();
});
