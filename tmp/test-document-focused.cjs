'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{once}=require('node:events');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/evidence/test-plan-rerun-20261031');
const {withCurrentDatabase}=require('../backend/scripts/helpers/auth-test-database.cjs');
const bcrypt=require('../backend/node_modules/bcryptjs');
const results=[];
const record=(id,expected,actual,pass,classification='current behavior')=>results.push({id,expected,actual,status:pass?'PASS':'FAIL',classification});
withCurrentDatabase(async({db,pool})=>{
 process.env.NODE_ENV='development';process.env.DAYCARE_AUTH_ENABLED='false';
 await db('roles').insert([{id:0,name:'super_admin'},{id:1,name:'admin'},{id:2,name:'caregiver'},{id:3,name:'parent'}]).onConflict('id').ignore();
 const [center]=await db('daycares').insert({name:'Document comparison fixture',slug:'document-comparison-fixture',contact_email:'office@example.invalid',status:'active'}).returning('*');
 const password='Synthetic-audit-test-only-123!';const hash=await bcrypt.hash(password,4);
 const users=await db('users').insert(['admin','caregiver','parent'].map((role,i)=>({name:role,email:role+'@document.invalid',role_id:i+1,daycare_id:center.id,password_hash:hash,status:'active',profile_complete:true}))).returning('*');
 const [admin,staff,parent]=users;
 const [child]=await db('children').insert({full_name:'Synthetic child',dob:'2023-01-01',daycare_id:center.id,caregiver_id:staff.id}).returning('*');
 await db('guardian_links').insert({child_id:child.id,user_id:parent.id,relationship:'Parent',pickup_authorized:true,created_by:admin.id});
 const key=require.resolve('../backend/src/config/db');require.cache[key]={id:key,filename:key,loaded:true,exports:pool};
 const app=require('../backend/src/app');const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(method,url,token,body,headers={})=>{const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json().catch(()=>null),headers:response.headers};};
 try{
  const tokens={};for(const u of users){const r=await request('POST','/api/auth/login',null,{email:u.email,password});assert.equal(r.status,200);tokens[u.name]=r.body.token;}
  const preflight=await request('OPTIONS','/api/auth/login',null,null,{Origin:'https://evil.example','Access-Control-Request-Method':'POST'});
  const allowed=preflight.headers.get('access-control-allow-origin');record('TC-SEC-003','Unknown origin not allowed',{http:preflight.status,allowOrigin:allowed},allowed!=='https://evil.example','development CORS policy remains permissive');
  const bio=await request('POST','/api/biometric/verify',tokens.admin,{child_id:child.id,guardian_user_id:parent.id,method:'biometric',sample_data:'synthetic'});
  record('TC-PICK-004','Functional biometric match/no-match',{http:bio.status,error:bio.body?.error},bio.status===200,'hardware/provider feature gap');
  const product=await request('POST','/api/store/products',tokens.admin,{name:'Synthetic book',price:100,stock_qty:10,available:true});assert.equal(product.status,201);
  let order=await request('POST','/api/store/orders',tokens.parent,{idempotency_key:'document-review-order-20261031',items:[{product_id:product.body.id,quantity:1}]});assert.equal(order.status,201);
  let current=order.body;const patch=async status=>request('PATCH',`/api/store/orders/${current.id}/status`,tokens.admin,{version:current.version,order_status:status});
  const noVersion=await request('PATCH',`/api/store/orders/${current.id}/status`,tokens.admin,{order_status:'confirmed'});
  record('TC-STORE-006',422,{http:noVersion.status},noVersion.status===422);
  const paid=await request('PATCH',`/api/store/orders/${current.id}/status`,tokens.admin,{version:current.version,payment_status:'paid'});assert.equal(paid.status,200);current=paid.body;
  const jump=await patch('ready_for_pickup');record('TC-STORE-007-as-written','200 and ready_for_pickup directly from placed/paid',{http:jump.status,error:jump.body?.error},jump.status===200&&jump.body.order_status==='ready_for_pickup','test omits mandatory confirmed transition');
  const confirmed=await patch('confirmed');assert.equal(confirmed.status,200);current=confirmed.body;const ready=await patch('ready_for_pickup');
  record('TC-STORE-007-corrected-sequence','200 and ready_for_pickup after confirmed',{http:ready.status,status:ready.body?.order_status},ready.status===200&&ready.body.order_status==='ready_for_pickup');
  const savedKey=process.env.NVIDIA_API_KEY;process.env.NVIDIA_API_KEY='';
  const fallback=await request('POST','/api/ai/guide',tokens.parent,{question:'Suggest a quiet play activity.'});
  record('TC-AI-001','200 prepared guidance without provider key',{http:fallback.status,source:fallback.body?.source},fallback.status===200&&fallback.body.source==='prepared_guidance');
  if(savedKey===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=savedKey;
  const medical=await request('POST','/api/ai/guide',tokens.parent,{question:'What medicine dosage should I give?'});
  record('TC-AI-002','Medical redirect',{http:medical.status,redirect:medical.body?.safety_redirected},medical.status===200&&medical.body.safety_redirected===true);
  if(savedKey&&!savedKey.startsWith('placeholder')){const live=await request('POST','/api/ai/guide',tokens.parent,{question:'Suggest a quiet indoor drawing activity for a toddler.'});record('TC-AI-006','200 external provider response',{http:live.status,source:live.body?.source,providerConnected:live.body?.provider_connected,model:live.body?.model},live.status===200&&live.body.provider_connected===true,'live availability observation; fallback is valid service behavior but not proof of provider success');}
  else results.push({id:'TC-AI-006',status:'BLOCKED',actual:'No configured provider key'});
  const logout=await request('POST','/api/auth/logout',tokens.admin,{});const reuse=await request('GET','/api/auth/me',tokens.admin);
  record('TC-AUTH-016','Logout 200; previous token 401',{logout:logout.status,reuse:reuse.status},logout.status===200&&reuse.status===401);
 }finally{await new Promise(resolve=>server.close(resolve));}
 fs.writeFileSync(path.join(out,'focused-document-replay.json'),JSON.stringify({executed:new Date().toISOString(),isolation:'generated database; in-process API fixture uses provisioning pool; restricted-role RLS covered separately by backend suites',results},null,2));
 console.log(JSON.stringify(results));
}).catch(e=>{console.error(e.message);process.exitCode=1;});
