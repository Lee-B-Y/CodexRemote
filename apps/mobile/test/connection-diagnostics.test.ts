import {describe,it,expect} from 'vitest';
import {connectionDiagnosis} from '../src/lib/connectionDiagnostics';
describe('Direct HTTPS reverse-tunnel diagnostics',()=>{
 it('distinguishes an available cloud edge from an unavailable Windows path',()=>{
  expect(connectionDiagnosis(true,null)).toMatch(/入口正常.*隧道.*Bridge/);
  expect(connectionDiagnosis(false,null)).toMatch(/域名.*TLS.*网络/);
 });
 it('uses fresh cloud diagnostics to distinguish absent SSH from an unresponsive Bridge',()=>{
  const generated_at=new Date().toISOString();
  expect(connectionDiagnosis(true,null,{generated_at,tunnelListening:false})).toMatch(/SSH.*未建立/);
  expect(connectionDiagnosis(true,null,{generated_at,tunnelListening:true})).toMatch(/SSH.*存在.*Bridge.*不可达/);
  expect(connectionDiagnosis(true,null,{generated_at:'2000-01-01T00:00:00Z',tunnelListening:false})).toMatch(/隧道或本机 Bridge/);
 });
 it('distinguishes the auxiliary app-server, Desktop IPC and WebSocket/auth layers',()=>{
  expect(connectionDiagnosis(true,{ok:false})).toMatch(/App Server.*未就绪/);
  expect(connectionDiagnosis(true,{ok:true,desktopIpcReady:false})).toMatch(/桌面 IPC.*未就绪/);
  expect(connectionDiagnosis(true,{ok:true,desktopIpcReady:true})).toMatch(/WebSocket.*配对令牌/);
 });
});
