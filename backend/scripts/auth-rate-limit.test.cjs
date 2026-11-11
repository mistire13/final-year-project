'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const express=require('express');
const createAuthLimiter=require('../src/middleware/auth-rate-limit');
test('production credential throttling does not count or block authenticated session checks and logout',async()=>{
  const app=express(),router=express.Router();
  router.get('/me',(req,res)=>res.json({session:'synthetic'}));
  router.post('/logout',(req,res)=>res.json({signed_out:true}));
  router.post('/login',(req,res)=>res.status(401).json({error:'Invalid credentials'}));
  app.use('/api/auth',createAuthLimiter('production'),router);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api/auth`;
  try{
    for(let n=0;n<25;n++)assert.equal((await fetch(base+'/me')).status,200,'routine session refreshes do not consume login attempts');
    for(let n=0;n<20;n++)assert.equal((await fetch(base+'/login',{method:'POST'})).status,401,'the production login budget remains 20');
    assert.equal((await fetch(base+'/login',{method:'POST'})).status,429,'credential attempts stay rate limited');
    assert.equal((await fetch(base+'/me')).status,200,'existing sessions can still be checked');
    assert.equal((await fetch(base+'/logout',{method:'POST'})).status,200,'sign-out remains usable after login throttling');
    assert.equal((await fetch(base+'/login',{method:'POST'})).status,429,'logout must not clear the IP credential throttle');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
