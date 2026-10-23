import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readConnection, prepareDirectory, connectionRequest } from './connection.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
export async function connect() {
  const available = async () => {
    try {
      const descriptor = await readConnection();
      const status = await connectionRequest(descriptor,'/status',{},800);
      if (status.version === 1 && status.pid === descriptor.pid) return descriptor;
    } catch {}
    return null;
  };
  let connection = await available();
  if (!connection) {
    const directory = await prepareDirectory();
    const log = await open(join(directory,'bridge.log'),constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
    const stat=await log.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) {
      await log.close();throw new Error('Unsafe local bridge log');
    }
    try {
      const child = spawn(process.execPath,[fileURLToPath(new URL('./daemon.mjs',import.meta.url))],{detached:true,stdio:['ignore',log.fd,log.fd],env:process.env});
      child.on('error',()=>{}); child.unref();
    } finally { await log.close(); }
    const deadline=Date.now()+6000;
    while (!connection && Date.now()<deadline) { await delay(100); connection=await available(); }
    if (!connection) throw new Error('Safari Agent local connection could not start; inspect the installed extension and whether its local port is in use.');
  }
  const clientId=randomUUID();
  const lease=active=>connectionRequest(connection,'/lease',{clientId,active},1500);
  await lease(true);
  const heartbeat=setInterval(()=>lease(true).catch(()=>{}),15000);
  return {
    call:async(name,args)=>{
      try{return await connectionRequest(connection,'/call',{name,args:args||{}},18000);}
      catch{throw new Error('Safari bridge connection lost; outcome unknown. Inspect before retrying an action.');}
    },
    close:async()=>{clearInterval(heartbeat);await lease(false).catch(()=>{});}
  };
}
