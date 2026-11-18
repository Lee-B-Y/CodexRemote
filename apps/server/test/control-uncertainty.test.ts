import { EventEmitter } from 'node:events';
import { describe,it,expect } from 'vitest';
import { MobileGateway } from '../src/gateway.js';
import { DesktopIpcBridge } from '../src/desktop-ipc-bridge.js';
import { loadConfig } from '../src/config.js';
describe('fail closed after losing Desktop authority',()=>{
 it('never falls back to app-server turn/start when a known Desktop task loses owner',async()=>{
  const app=new EventEmitter() as any;app.ready=true;let calls=0;app.request=async()=>{calls++;return {};};
  const desktop=new DesktopIpcBridge(false);
  (desktop as any).desktopOwnedIds.add('owned');
  const gateway=new MobileGateway(app,loadConfig({CMR_TOKEN:'a'.repeat(40)}),desktop);
  try{await expect((gateway as any).submitPreparedTurn('owned',{input:[],clientUserMessageId:'once'},'auto')).rejects.toThrow(/Desktop|桌面|不确定/);expect(calls).toBe(0);}
  finally{gateway.close();}
 });
 for(const method of ['submitPreparedTurn','startQueuedTurn']){
  it(`${method} rechecks IPC authority after the disk reservation`,async()=>{
   const app=new EventEmitter() as any;app.ready=true;let calls=0;app.request=async()=>{calls++;return {};};
   const desktop=new EventEmitter() as any;desktop.supported=true;desktop.ready=true;
   desktop.hasOwner=()=>false;desktop.isControlStateUncertain=()=>false;
   const ledger={reserve:async()=>{await Promise.resolve();desktop.ready=false;}};
   const gateway=new MobileGateway(app,loadConfig({CMR_TOKEN:'a'.repeat(40)}),desktop,undefined,undefined,ledger as any);
   try{await expect((gateway as any)[method]('test',{input:[],clientUserMessageId:'once'},'auto')).rejects.toThrow(/Desktop|桌面|不确定/);expect(calls).toBe(0);}
   finally{gateway.close();}
  });
 }
 it('uses the newly observed Desktop owner after persistence',async()=>{
  const app=new EventEmitter() as any;app.ready=true;const calls:string[]=[];app.request=async()=>{calls.push('app');return {};};
  const desktop=new EventEmitter() as any;desktop.supported=true;desktop.ready=true;let owned=false;
  desktop.hasOwner=()=>owned;desktop.isControlStateUncertain=()=>false;desktop.steerTurn=async()=>{calls.push('desktop');return {};};
  const ledger={reserve:async()=>{await Promise.resolve();owned=true;}};
  const gateway=new MobileGateway(app,loadConfig({CMR_TOKEN:'a'.repeat(40)}),desktop,undefined,undefined,ledger as any);
  try{await (gateway as any).submitPreparedTurn('test',{input:[],clientUserMessageId:'once'},'auto');expect(calls).toEqual(['desktop']);}
  finally{gateway.close();}
 });
 it('does not start a queued turn that became active during persistence',async()=>{
  const app=new EventEmitter() as any;app.ready=true;let calls=0;app.request=async()=>{calls++;return {};};
  let gateway:MobileGateway;
  const ledger={reserve:async()=>{await Promise.resolve();(gateway as any).appServerCurrentTurnIds.set('test','active');}};
  gateway=new MobileGateway(app,loadConfig({CMR_TOKEN:'a'.repeat(40)}),undefined,undefined,undefined,ledger as any);
  try{await expect((gateway as any).startQueuedTurn('test',{input:[],clientUserMessageId:'once'})).rejects.toMatchObject({code:'submission_state_unknown'});expect(calls).toBe(0);}
  finally{gateway.close();}
 });
});
