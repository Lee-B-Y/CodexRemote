import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesCommand,sameProcess,hasLivingParent} from '../process-ownership.mjs';

const expected={exe:'C:\\Program Files\\nodejs\\node.exe',args:['D:\\Code With Space\\supervisor.mjs','bridge']};
const actual={pid:42,executable:expected.exe,commandLine:'"C:\\Program Files\\nodejs\\node.exe" "D:\\Code With Space\\supervisor.mjs" bridge',createdAt:'2026-11-18T10:00:00Z'};
test('quoted Windows executable and script paths are identified exactly',()=>{
 assert.equal(matchesCommand(actual,expected),true);
 assert.equal(matchesCommand({...actual,commandLine:actual.commandLine+' extra'},expected),false);
 assert.equal(matchesCommand({...actual,commandLine:actual.commandLine.replace(' bridge',' tunnel')},expected),false);
});
test('a reused PID is not the recorded child',()=>{
 const record={pid:42,identity:actual};
 assert.equal(sameProcess(record,actual,expected),true);
 assert.equal(sameProcess(record,{...actual,createdAt:'2026-11-18T11:00:00Z'},expected),false);
 assert.equal(sameProcess(record,{...actual,commandLine:'node unrelated.mjs'},expected),false);
});
test('legacy child records require matching command and a close creation time',()=>{
 assert.equal(sameProcess({pid:42,startedAt:'2026-11-18T09:59:59Z'},actual,expected),true);
 assert.equal(sameProcess({pid:42,startedAt:'2026-11-17T10:00:00Z'},actual,expected),false);
});
test('parent PID reuse cannot make a surviving supervisor look parented',()=>{
 assert.equal(hasLivingParent(actual,null),false);
 assert.equal(hasLivingParent(actual,{createdAt:'2026-11-18T09:59:00Z'}),true);
 assert.equal(hasLivingParent(actual,{createdAt:'2026-11-18T11:00:00Z'}),false);
});
