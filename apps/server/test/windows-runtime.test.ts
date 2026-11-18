import {describe,it,expect} from 'vitest';
import {resolveWindowsDesktopCodex} from '../src/windows-runtime.js';
describe('Windows desktop CLI selection',()=>{
 it('selects resources CLI and ignores older user PATH installations',()=>{
  expect(resolveWindowsDesktopCodex('C:\\Program Files\\WindowsApps\\OpenAI.Codex_test',p=>p.endsWith('app\\resources\\codex.exe'))).toBe('C:\\Program Files\\WindowsApps\\OpenAI.Codex_test\\app\\resources\\codex.exe');
 });
 it('fails closed when the installed Desktop CLI disappeared after upgrade',()=>{
  expect(()=>resolveWindowsDesktopCodex('C:\\missing',()=>false)).toThrow(/Desktop/);
 });
 it('rejects relative install paths',()=>{
  expect(()=>resolveWindowsDesktopCodex('relative',()=>true)).toThrow(/absolute/);
 });
});
