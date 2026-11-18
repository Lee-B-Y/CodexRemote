import {describe,it,expect}from'vitest';
import {isAbsoluteHostPath}from'../src/lib/hostPaths';
describe('Windows host project paths',()=>{
 it('accepts drive, UNC and Unix absolute paths',()=>{
  for(const value of ['D:/work/demo-project','D:\\work\\demo-project','\\\\server\\share\\project','/home/user/project'])expect(isAbsoluteHostPath(value)).toBe(true);
 });
 it('refuses drive-relative paths and missing directories',()=>{
  for(const value of ['D:project','project','.','',String.raw`\relative`])expect(isAbsoluteHostPath(value)).toBe(false);
 });
});
