import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {matchesCommand,sameProcess,hasLivingParent} from './process-ownership.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../..'), privateDir=path.join(directory,'private');
const role=process.argv[2];if(!['bridge','tunnel'].includes(role))throw Error('Expected bridge or tunnel');
const settings=JSON.parse(fs.readFileSync(path.join(privateDir,'settings.json'),'utf8'));
const lock=path.join(privateDir,role+'.lock.json');
const logDir=path.join(privateDir,'logs');fs.mkdirSync(logDir,{recursive:true});
let child,stopping=false,restarts=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function writeLog(message){
  let text=String(message).replaceAll(settings.token,'[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]');
  // Log lifecycle and diagnostic lines only. Never log WebSocket frames or prompt bodies.
  if(text.length>1600)text=text.slice(0,1600)+' [truncated]';
  const file=path.join(logDir,role+'.log');
  if(fs.existsSync(file)&&fs.statSync(file).size>2*1024*1024){
    for(let i=4;i>=1;i--){const from=i===1?file:file+'.'+(i-1),to=file+'.'+i;if(fs.existsSync(from))fs.renameSync(from,to);}
  }
  fs.appendFileSync(file,new Date().toISOString()+' '+text.trim()+'\n');
}
function acquireLock(identity=readProcess(process.pid)){
  let fd;
  try{fd=fs.openSync(lock,'wx');try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,role,startedAt:new Date().toISOString(),identity}));}finally{fs.closeSync(fd);}}
  catch(error){
    if(fd!==undefined){fs.rmSync(lock,{force:true});throw error;}
    if(error.code!=='EEXIST')throw error;
    const previous=JSON.parse(fs.readFileSync(lock,'utf8'));
    const actual=readProcess(previous.pid);
    const expected={exe:settings.node,args:[fileURLToPath(import.meta.url),role]};
    if(matchesCommand(actual,expected)){
      if(!sameProcess(previous,actual,expected))throw Error('Supervisor identity changed; inspect before recovery');
      if(hasLivingParent(actual,readProcess(actual.parentPid)))throw Error(role+' supervisor is already running');
      const stopped=spawnSync(path.join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(actual.pid),'/T','/F'],{windowsHide:true,encoding:'utf8'});
      if(stopped.status!==0&&readProcess(actual.pid))throw Error('Could not stop verified orphan supervisor');
      writeLog('recovered verified orphan '+role+' supervisor pid='+actual.pid);
    }
    fs.unlinkSync(lock);acquireLock(identity);
  }
}
function readProcess(pid){
  if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid recorded process ID');
  const command="$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId = "+pid+"'; if($p){[pscustomobject]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;executable=$p.ExecutablePath;commandLine=$p.CommandLine;createdAt=$p.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress}";
  const result=spawnSync(settings.powershell,['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000});
  if(result.status!==0)throw Error('Could not inspect process ownership safely');
  const value=result.stdout.replace(/^\uFEFF/,'').trim();return value?JSON.parse(value):null;
}
function reconcileChild(){
  const filename=path.join(privateDir,role+'.child.json');
  if(!fs.existsSync(filename))return;
  const record=JSON.parse(fs.readFileSync(filename,'utf8')),actual=readProcess(record.pid);
  const expected=role==='bridge'?{exe:settings.node,args:[path.join(root,'apps/server/dist/index.js')]}:tunnelCommand();
  if(actual&&sameProcess(record,actual,expected)){
    const stopped=spawnSync(path.join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(record.pid),'/T','/F'],{windowsHide:true,encoding:'utf8'});
    if(stopped.status!==0&&readProcess(record.pid))throw Error('Could not stop the verified orphan child');
    writeLog('recovered verified orphan '+role+' child pid='+record.pid);
  }else if(matchesCommand(actual,expected)){
    throw Error('Child command matches but creation time does not; inspect before recovery');
  }
  // A reused PID belonging to another command is never terminated.
  fs.unlinkSync(filename);
}
function bridgeCommand(){
  const result=spawnSync(settings.powershell,['-NoProfile','-NonInteractive','-Command',"Get-AppxPackage -Name OpenAI.Codex | Select-Object InstallLocation,Version | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true,timeout:20000});
  if(result.status!==0)throw Error('Could not locate the current user Desktop package');
  const packageInfo=JSON.parse(result.stdout.replace(/^\uFEFF/,''));
  if(packageInfo.Version!==settings.testedDesktopVersion)throw Error('Desktop version changed to '+packageInfo.Version+'; protocol verification is required before restarting Bridge');
  const executable=path.join(packageInfo.InstallLocation,'app','resources','codex.exe');
  if(!fs.existsSync(executable))throw Error('Desktop resources CLI is missing; refusing PATH fallback');
  return {exe:settings.node,args:[path.join(root,'apps/server/dist/index.js')],env:{...process.env,
    CODEX_HOME:settings.codexHome,CODEX_BIN:executable,CMR_DESKTOP_INSTALL_DIRECTORY:packageInfo.InstallLocation,
    CMR_HOST:'127.0.0.1',CMR_PORT:'8787',CMR_TOKEN:settings.token,CMR_SERVER_ID:settings.serverId || 'windows-codex',
    CMR_STATE_DIRECTORY:path.join(privateDir,'state'),CMR_ALLOWED_ORIGINS:settings.publicUrl,
    CMR_FILE_ROOTS:settings.fileRoots.join(','),CMR_DESKTOP_IPC:'1'}};
}
function tunnelCommand(){
  return {exe:settings.ssh,args:['-NT','-i',path.join(privateDir,'id_ed25519'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes',
    '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+path.join(privateDir,'known_hosts'),
    '-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=12','-o','ConnectionAttempts=1',
    '-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','-o','TCPKeepAlive=yes',
    '-o','UpdateHostKeys=no','-o','LogLevel=ERROR','-R','127.0.0.1:18787:127.0.0.1:8787',
    settings.tunnelUser+'@'+settings.sshHost],env:process.env};
}
function terminate(){
  stopping=true;
  if(child?.pid)spawnSync(path.join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
}
process.on('SIGINT',terminate);process.on('SIGTERM',terminate);
process.on('exit',terminate);
acquireLock();
try{
  reconcileChild();
  while(!stopping){
    let startedAt=Date.now();
    let childFinished;
    try{
      const command=role==='bridge'?bridgeCommand():tunnelCommand();
      writeLog('starting '+role);
      child=spawn(command.exe,command.args,{cwd:root,env:command.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      childFinished=new Promise(resolve=>{child.once('error',error=>resolve(String(error)));child.once('exit',(code,signal)=>resolve('exit code='+code+' signal='+signal));});
      const pidFile=path.join(privateDir,role+'.child.json');
      const childRecord={pid:child.pid,supervisorPid:process.pid,startedAt:new Date().toISOString()};
      fs.writeFileSync(pidFile,JSON.stringify(childRecord));
      fs.writeFileSync(pidFile,JSON.stringify({...childRecord,identity:readProcess(child.pid)}));
      for(const stream of [child.stdout,child.stderr]){
        let pending='';stream.setEncoding('utf8');stream.on('data',chunk=>{pending=(pending+chunk).slice(-8192);let at;while((at=pending.indexOf('\n'))>=0){writeLog(pending.slice(0,at));pending=pending.slice(at+1);}});
      }
      const status=await childFinished;
      writeLog(status);fs.rmSync(pidFile,{force:true});child=null;
    }catch(error){writeLog(error.message);if(child){terminate();process.exitCode=1;await Promise.race([childFinished,delay(5000)]);}}
    if(stopping)break;
    restarts=Date.now()-startedAt>120000?0:restarts+1;
    const wait=Math.min(60000,1000*2**Math.min(restarts,6))+Math.floor(Math.random()*1000);
    writeLog('retry in '+wait+'ms');await delay(wait);
  }
}finally{fs.rmSync(lock,{force:true});writeLog('stopped');}
