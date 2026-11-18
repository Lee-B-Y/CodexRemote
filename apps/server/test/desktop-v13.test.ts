import { describe, expect, it } from 'vitest';
import { DesktopIpcBridge } from '../src/desktop-ipc-bridge.js';

function desktop(version=13) {
 const bridge=new DesktopIpcBridge(false);
 const i=bridge as any;
 i.clientId='bridge';i.socket={writable:true};
 const sent:any[]=[];
 i.write=(f:any)=>{sent.push(f);if(f.type==='request')queueMicrotask(()=>i.handleFrame({type:'response',requestId:f.requestId,method:f.method,handledByClientId:'owner',result:{ok:true}}));};
 i.handleFrame({type:'broadcast',method:'thread-stream-following-changed',version:1,sourceClientId:'owner',params:{conversationId:'test',following:true}});
 i.handleFrame({type:'broadcast',method:'thread-stream-state-changed',version,sourceClientId:'owner',params:{conversationId:'test',change:{type:'snapshot',revision:10,conversationState:{id:'test',cwd:'D:\\test',threadRuntimeStatus:{type:'active'},turns:[{id:'turn',status:'inProgress',items:[]}]}}}});
 return {bridge,i,sent};
}
describe('Desktop 26.1111 v13',()=>{
 it('accepts v13 snapshot and consecutive patches',()=>{
  const {bridge,i}=desktop();expect(bridge.hasOwner('test')).toBe(true);
  i.handleFrame({type:'broadcast',method:'thread-stream-state-changed',version:13,sourceClientId:'owner',params:{conversationId:'test',change:{type:'patches',baseRevision:10,revision:11,patches:[{op:'replace',path:['threadRuntimeStatus'],value:{type:'idle'}}]}}});
  expect(bridge.getConversation('test')?.threadRuntimeStatus).toEqual({type:'idle'});
 });
 it('sends v2 turnStart envelope instead of legacy turnStartParams',async()=>{
  const {bridge,sent}=desktop();await bridge.startTurn('test',{threadId:'test',input:[{type:'text',text:'ping'}],clientUserMessageId:'stable'});
  expect(sent.at(-1)).toMatchObject({version:2,params:{turnStart:{request:{threadId:'test',clientUserMessageId:'stable'},context:{}}}});
  expect(sent.at(-1).params.turnStartParams).toBeUndefined();
 });
 it('pins interrupt to the observed active turn and v4 user-stop mode',async()=>{
  const {bridge,sent}=desktop();await bridge.interruptTurn('test');
  expect(sent.at(-1)).toMatchObject({version:4,params:{mode:'user-stop',expectedTurnId:'turn'}});
 });
 it('uses v2 settings requests for the current desktop',async()=>{
  const {bridge,sent}=desktop();await bridge.updateThreadSettings('test',{model:'test'});
  expect(sent.at(-1).version).toBe(2);
 });
 it('normalizes omitted text_elements before the Desktop renders start and steer inputs',async()=>{
  const {bridge,sent}=desktop();
  const input=[{type:'text',text:'safe text'}];
  await bridge.startTurn('test',{threadId:'test',input});
  expect(sent.at(-1).params.turnStart.request.input[0].text_elements).toEqual([]);
  await bridge.steerTurn('test',{threadId:'test',input});
  expect(sent.at(-1).params.input[0].text_elements).toEqual([]);
 });
 it('unknown version prevents control and does not retain an old owner snapshot',()=>{
  const {bridge,i}=desktop();
  i.handleFrame({type:'broadcast',method:'thread-stream-state-changed',version:99,sourceClientId:'owner',params:{conversationId:'test',change:{type:'snapshot',revision:20,conversationState:{id:'test'}}}});
  expect(bridge.hasOwner('test')).toBe(false);
  expect(bridge.isControlStateUncertain('test')).toBe(true);
 });
 it('IPC reset marks previously desktop-owned threads uncertain',()=>{
  const {bridge,i}=desktop();i.handleFrame({type:'broadcast',method:'ipc-connection-reset',version:1,sourceClientId:'owner',params:{}});
  expect(bridge.isControlStateUncertain('test')).toBe(true);
 });
});
