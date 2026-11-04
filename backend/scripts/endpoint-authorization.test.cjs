'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const bcrypt=require('bcryptjs');
const {once}=require('node:events');
const {withCurrentDatabase}=require('./helpers/auth-test-database.cjs');

test('every mounted legacy API route rejects missing/invalid sessions and forbidden roles',async()=>{
 await withCurrentDatabase(async({db,pool})=>{
  process.env.NODE_ENV='test';process.env.DAYCARE_AUTH_ENABLED='false';
  process.env.JWT_SECRET='synthetic-full-endpoint-matrix-secret';
  await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
  const [center]=await db('daycares').insert({name:'Endpoint matrix',slug:'endpoint-matrix',contact_email:'office@matrix.invalid',status:'active'}).returning('*');
  const hash=await bcrypt.hash('Synthetic-matrix-password-123!',4);
  const actors=await db('users').insert(['super_admin','admin','caregiver','parent'].map((role,id)=>({name:role,email:`${role}@matrix.invalid`,role_id:id,daycare_id:id?center.id:null,status:'active',password_hash:hash}))).returning('*');
  const root=path.resolve(__dirname,'../src')+path.sep;
  for(const key of Object.keys(require.cache))if(key.startsWith(root))delete require.cache[key];
  const dbFile=require.resolve('../src/config/db');require.cache[dbFile]={id:dbFile,filename:dbFile,loaded:true,exports:pool};
  const mounts=[],original=express.application.use;
  express.application.use=function(...args){if(args[1]?.stack)mounts.push({prefix:args[0],router:args[1]});return original.apply(this,args);};
  let app;try{app=require('../src/app');}finally{express.application.use=original;}
  const inventory=[];
  const add=(prefix,route)=>{for(const p of [].concat(route.path))for(const method of Object.keys(route.methods))inventory.push({method:method.toUpperCase(),path:prefix+p,roles:route.stack.map(x=>x.handle.allowedRoles).filter(Boolean).flat()});};
  for(const {prefix,router} of mounts)for(const p of [].concat(prefix))for(const layer of router.stack)if(layer.route)add(p,layer.route);
  for(const layer of app._router.stack)if(layer.route)add('',layer.route);
  const publicRoutes=new Set(['/','/health','/favicon.ico','/api/auth/login','/api/auth/register','/api/auth/forgot-password','/api/auth/reset-password','/api/payments/webhook']);
  for(const prefix of ['/api','/api/saas'])for(const suffix of ['/packages','/application-status','/register-daycare','/applications','/broadcast'])publicRoutes.add(prefix+suffix);
  const auth=require('../src/modules/auth/auth.service');const tokens={};
  await assert.rejects(auth.login('superadmin@ankelba.com','1234'),{statusCode:401});
  for(const actor of actors)tokens[actor.name]=(await auth.login(actor.email,'Synthetic-matrix-password-123!')).token;
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const failures=[];let checks=0;
  const request=async(route,token)=>{
   const url=route.path.replace(/:[A-Za-z_]+/g,'2147483000');
   const response=await fetch(base+url,{signal:AbortSignal.timeout(5000),method:route.method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(['GET','HEAD'].includes(route.method)?{}:{body:'{}'})});
   await response.arrayBuffer();return response.status;
  };
  try{
   for(const route of inventory){
    route.public=publicRoutes.has(route.path);if(route.public)continue;
    for(const token of [undefined,'invalid-session']){
     const status=await request(route,token);checks++;
     if(status!==401)failures.push(`${route.method} ${route.path}: ${token?'invalid':'missing'} session returned ${status}`);
    }
    for(const role of Object.keys(tokens))if(route.roles.length&&!route.roles.includes(role)){
     const status=await request(route,tokens[role]);checks++;
     if(status!==403)failures.push(`${route.method} ${route.path}: forbidden ${role} returned ${status}`);
    }
   }
   assert.equal(await request({method:'POST',path:'/api/auth/logout'},tokens.parent),200);
   assert.equal(await request({method:'GET',path:'/api/auth/me'},tokens.parent),401);
   const replacement=(await auth.login('parent@matrix.invalid','Synthetic-matrix-password-123!')).token;
   assert.equal(await request({method:'GET',path:'/api/auth/me'},replacement),200);
   fs.writeFileSync(path.resolve(__dirname,'../../docs/ENDPOINT_AUTHORIZATION_MATRIX_2026-10-31.json'),JSON.stringify({mode:'legacy active runtime',routes:inventory.length,checks,logoutRevocation:true,failures,inventory},null,2));
   console.log(`Enumerated ${inventory.length} mounted endpoints; ${checks} authentication/role denial checks; ${failures.length} failures.`);
   assert.deepEqual(failures,[]);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
});
