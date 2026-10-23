import { constants } from 'node:fs';
import { open, mkdir, lstat, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';

export const nativeHelper='/Applications/Safari Agent.app/Contents/MacOS/safari-agent-native';
// Only isolated tests use filesystem descriptors directly. Real connections go
// through the signed helper; Node has no access to protected app-group storage.
const isolated=()=>Boolean(process.env.SAFARI_AGENT_CONNECTION_DIR);
export const connectionDirectory=()=>process.env.SAFARI_AGENT_CONNECTION_DIR || join(homedir(),'.local','state','safari-agent');
export const connectionPath=()=>join(connectionDirectory(),'connection.json');
const owned=s=>s.uid===process.getuid();
function nativeRequest(mode,value) {
  return new Promise((resolve,reject)=>{
    const child=execFile(nativeHelper,[mode],{timeout:5000,maxBuffer:8192},(error,stdout)=>{
      if(error){reject(new Error('Installed Safari Agent native connection is unavailable'));return;}
      try{resolve(stdout.trim()?JSON.parse(stdout):{ok:true});}catch{reject(new Error('Invalid native connection response'));}
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(value?JSON.stringify(value):undefined);
  });
}
export async function prepareDirectory(){
  const folder=connectionDirectory();
  await mkdir(folder,{recursive:true,mode:0o700});
  const stat=await lstat(folder);
  if(!stat.isDirectory()||stat.isSymbolicLink()||!owned(stat)||(stat.mode&0o777)!==0o700)throw new Error('Local bridge directory must be private and owned by this user');
  return folder;
}
function validate(value){
  if(value.version!==1||!Number.isInteger(value.port)||value.port<1024||value.port>65535||!/^[a-f0-9]{64}$/.test(value.token)||!Number.isInteger(value.pid)||value.pid<1)throw new Error('Invalid native connection descriptor');
  return value;
}
export async function readConnection(){
  if(!isolated())return validate(await nativeRequest('--read-connection'));
  const directory=await lstat(connectionDirectory());
  if(!directory.isDirectory()||directory.isSymbolicLink()||!owned(directory)||(directory.mode&0o777)!==0o700)throw new Error('Unsafe native connection directory');
  const file=await open(connectionPath(),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=await file.stat();
    if(!stat.isFile()||!owned(stat)||stat.nlink!==1||(stat.mode&0o777)!==0o600||stat.size>4096)throw new Error('Unsafe native connection descriptor');
    return validate(JSON.parse(await file.readFile('utf8')));
  }finally{await file.close();}
}
export async function publishConnection(value){
  validate(value);
  if(!isolated()){await nativeRequest('--publish-connection',value);return;}
  await prepareDirectory();
  const temporary=join(connectionDirectory(),`.connection-${randomUUID()}`);
  const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
  try{await rename(temporary,connectionPath());}finally{await unlink(temporary).catch(()=>{});}
}
export async function removeConnection(token){
  if(!isolated()){await nativeRequest('--remove-connection',{token}).catch(()=>{});return;}
  try{if((await readConnection()).token===token)await unlink(connectionPath());}catch{}
}
export async function connectionRequest(connection,route,payload={},timeout=15000){
  const response=await fetch(`http://127.0.0.1:${connection.port}${route}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection.token}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error(`Local Safari bridge refused (${response.status})`);
  return response.json();
}
