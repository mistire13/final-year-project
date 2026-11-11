'use strict';
const path=require('node:path');
require('../backend/node_modules/dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
const {Client}=require('../backend/node_modules/pg');
(async()=>{
  const c=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'postgres'});
  await c.connect();
  try {
    const fixture=(await c.query("SELECT 1 FROM pg_database WHERE datname IN ('ankelba_auth_test_36356_1794316265625_d126afd3','ankelba_auth_test_38608_1794320764249_ae71c3b7','ankelba_auth_test_28784_1794321230565_b39ba152','ankelba_auth_test_41920_1794340606995_6a52eafd')")).rowCount;
    const health=await fetch('http://localhost:5000/health');
    const page=await fetch('http://localhost:8081/pricing');
    const bundle=await fetch('http://localhost:8081/index.bundle?platform=web&dev=true&hot=false&lazy=true');
    const code=await bundle.text();
    console.log(JSON.stringify({fixture_database_removed:fixture===0,backend_health:health.status,frontend_pricing:page.status,web_bundle:bundle.status,disposable_api_in_bundle:code.includes('localhost:5300/api')}));
    if(fixture!==0||health.status!==200||page.status!==200||bundle.status!==200||code.includes('localhost:5300/api'))process.exitCode=1;
  } finally {await c.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
