import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, stat, chmod, readFile, writeFile, symlink, unlink, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { connectionPath, prepareDirectory, publishConnection, readConnection, removeConnection, connectionRequest } from '../src/connection.mjs';
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const synthetic = token => ({version:1,port:19447,token,pid:process.pid});
async function fixture(run) {
 const root=await mkdtemp(join(tmpdir(),'safari-agent-connection-'));
 const previous=process.env.SAFARI_AGENT_CONNECTION_DIR;
 process.env.SAFARI_AGENT_CONNECTION_DIR=join(root,'private');
 try {await run(root);} finally {
  if(previous===undefined)delete process.env.SAFARI_AGENT_CONNECTION_DIR;else process.env.SAFARI_AGENT_CONNECTION_DIR=previous;
  await rm(root,{recursive:true,force:true});
 }
}
test('descriptor publication is atomic/private and removes only its own token',()=>fixture(async root=>{
 const first=synthetic('a'.repeat(64)), second=synthetic('b'.repeat(64));
 await publishConnection(first);
 assert.equal((await stat(join(root,'private'))).mode&0o777,0o700);
 assert.equal((await stat(connectionPath())).mode&0o777,0o600);
 assert.deepEqual(await readConnection(),first);
 await publishConnection(second);
 assert.deepEqual(await readConnection(),second);
 assert.deepEqual(await readdir(join(root,'private')),['connection.json'],'no partially published files remain');
 await removeConnection(first.token);assert.deepEqual(await readConnection(),second,'old daemon cannot remove replacement descriptor');
 await removeConnection(second.token);await assert.rejects(readConnection(),{code:'ENOENT'});
}));
test('descriptor reader rejects permissive modes, symlinks and foreign ownership',()=>fixture(async root=>{
 await publishConnection(synthetic('a'.repeat(64)));
 const path=connectionPath();
 await chmod(path,0o644);await assert.rejects(readConnection(),/Unsafe native connection descriptor/);await chmod(path,0o600);
 const directory=join(root,'private');
 await chmod(directory,0o755);await assert.rejects(readConnection(),/Unsafe native connection directory/);await chmod(directory,0o700);
 const originalUID=process.getuid;
 try {process.getuid=()=>originalUID()+1;await assert.rejects(readConnection(),/Unsafe native connection directory/);} finally {process.getuid=originalUID;}
 await unlink(path);const outside=join(root,'sentinel.json');const text=JSON.stringify(synthetic('c'.repeat(64)));
 await writeFile(outside,text,{mode:0o600});await symlink(outside,path);
 await assert.rejects(readConnection());
 assert.equal(await readFile(outside,'utf8'),text,'reader never modifies symlink target');
 await unlink(path);await rm(directory,{recursive:true});
 await symlink(root,directory);await assert.rejects(prepareDirectory(),/private and owned/);
}));
test('descriptor reader rejects oversized and malformed records',()=>fixture(async()=>{
 await prepareDirectory();
 const path=connectionPath();
 await writeFile(path,'x'.repeat(4097),{mode:0o600});await assert.rejects(readConnection(),/Unsafe native connection descriptor/);
 for(const record of [synthetic('short'),{...synthetic('a'.repeat(64)),port:80},{...synthetic('a'.repeat(64)),pid:0}]){
  await writeFile(path,JSON.stringify(record));await assert.rejects(readConnection(),/Invalid native connection descriptor/);
 }
}));

function mcp(environment) {
 const child=spawn(process.execPath,['src/server.mjs'],{cwd:new URL('..',import.meta.url),env:environment,stdio:['pipe','pipe','pipe']});
 const lines=readline.createInterface({input:child.stdout})[Symbol.asyncIterator]();
 // Drain private child diagnostics; no credentials/content are printed by tests.
 child.stderr.resume();
 let id=0;
 return {child,request:async(method,params={})=>{
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:++id,method,params})+'\n');
  let timeout;
  try {return JSON.parse((await Promise.race([lines.next(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Synthetic MCP reply timeout')),10000);})])).value);}
  finally {clearTimeout(timeout);}
 }};
}
test('two MCP clients share one isolated daemon and clean up only the owned process',()=>fixture(async()=>{
 const environment={...process.env,SAFARI_AGENT_PORT:'0'};
 const first=mcp(environment), second=mcp(environment);
 let ownedDaemon;
 try {
  assert.equal((await first.request('initialize')).result.serverInfo.name,'safari-agent');
  const firstCall=first.request('tools/call',{name:'list_tabs',arguments:{}}).catch(error=>({testFailure:error}));
  const deadline=Date.now()+7000;
  while(Date.now()<deadline){
   try {ownedDaemon=await readConnection();break;} catch {await pause(25);}
  }
  assert.ok(ownedDaemon,'our isolated descriptor was published');
  assert.notEqual(ownedDaemon.pid,process.pid);
  const session=randomUUID();
  await connectionRequest(ownedDaemon,'/sync',{tabs:[],results:[],connectionId:session,sequence:1});
  const firstResult=await firstCall;
  assert.equal(firstResult.testFailure,undefined);
  assert.equal(firstResult.result.isError,undefined);
  assert.deepEqual(JSON.parse(firstResult.result.content[0].text),[]);
  assert.equal((await second.request('initialize')).result.serverInfo.name,'safari-agent');
  const secondResult=await second.request('tools/call',{name:'list_tabs',arguments:{}});
  assert.equal(secondResult.result.isError,undefined);
  assert.equal((await readConnection()).pid,ownedDaemon.pid,'second MCP client reused the established daemon');
  assert.equal((await connectionRequest(ownedDaemon,'/status')).pid,ownedDaemon.pid);
 } finally {
  // Close only subprocesses spawned here, and the daemon proved by this fixture's descriptor.
  for(const client of [first,second]){
   client.child.stdin.end();
   if(client.child.exitCode===null)client.child.kill('SIGTERM');
  }
  if(ownedDaemon){
   const current=await readConnection().catch(()=>null);
   if(current?.pid===ownedDaemon.pid && current.token===ownedDaemon.token){
    process.kill(ownedDaemon.pid,'SIGTERM');
    const deadline=Date.now()+3000;
    while(Date.now()<deadline && await readConnection().catch(()=>null))await pause(25);
    await assert.rejects(readConnection(),{code:'ENOENT'});
   }
  }
 }
}));
