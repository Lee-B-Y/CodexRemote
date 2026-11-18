import {win32} from 'node:path';

const normalize=value=>win32.normalize(String(value)).toLowerCase();
// Our arguments contain ordinary paths/options, without embedded quotes.
const argumentsOf=line=>Array.from(String(line).matchAll(/"([^"]*)"|([^\s"]+)/g),m=>m[1]??m[2]);
export function matchesCommand(actual,expected){
  if(!actual?.executable||normalize(actual.executable)!==normalize(expected.exe))return false;
  const args=argumentsOf(actual.commandLine),wanted=[expected.exe,...expected.args];
  return args.length===wanted.length&&args.every((value,i)=>normalize(value)===normalize(wanted[i]));
}
export function sameProcess(record,actual,expected){
  if(!actual||record.pid!==actual.pid||!matchesCommand(actual,expected))return false;
  const created=Date.parse(actual.createdAt);
  if(!Number.isFinite(created))return false;
  if(record.identity)return created===Date.parse(record.identity.createdAt);
  // Migration of the original records: spawning could include an Appx lookup first.
  const difference=created-Date.parse(record.startedAt);
  return Number.isFinite(difference)&&difference>=-3000&&difference<=30000;
}
export function hasLivingParent(actual,parent){
  return !!parent&&Number.isFinite(Date.parse(parent.createdAt))
    &&Date.parse(parent.createdAt)<=Date.parse(actual.createdAt);
}
