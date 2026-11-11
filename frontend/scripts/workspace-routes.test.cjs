'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/portal/workspaceRoutes.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});
const route=m.exports.workspaceRouteFailure;
const known=['dashboard','workspace','caregivers','finances','reports'];
test('workspace routes distinguish unknown addresses from known pages forbidden to the role',()=>{
  for(const address of ['/admin/missing','/admin/reports/extra','/staff/missing','/admin/preview/missing'])assert.equal(route(address,'admin',known,['dashboard','finances','reports']),'not-found');
  assert.equal(route('/staff/finances','caregiver',known,['workspace','reports']),'forbidden');
  assert.equal(route('/admin/finances','caregiver',known,['workspace','reports']),'forbidden');
  assert.equal(route('/staff/reports','admin',known,['dashboard','reports']),'forbidden');
});
test('valid workspace roots, previews, user alias and sign-in routes remain reachable',()=>{
  for(const address of ['/admin','/admin/','/admin/preview','/admin/preview/dashboard'])assert.equal(route(address,'admin',known,['dashboard']),null);
  assert.equal(route('/staff','caregiver',known,['workspace']),null);
  assert.equal(route('/admin/users','admin',known,['caregivers']),null);
  for(const address of ['/login','/signin','/admin/login'])assert.equal(route(address,'admin',known,[]),null);
});
