'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('../backend/node_modules/dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
const {Client}=require('../backend/node_modules/pg');
(async()=>{
  const identity=JSON.parse(fs.readFileSync(path.join(__dirname,'announcement-banner-fixture-identity.json'),'utf8'));
  assert.equal(identity.purpose,'Disposable local acceptance ONLY');
  assert.match(identity.database,new RegExp(`^ankelba_auth_test_${identity.pid}_\\d+_[a-f0-9]{8}$`));
  const client=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:'postgres'});
  await client.connect();
  try {
    assert.equal((await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[identity.database])).rowCount,0,'Owned disposable DB must be removed.');
    assert.equal(fs.existsSync(path.join(__dirname,'subscription-backups/plus-ui-acceptance/fixture.json')),false,'Disposable credentials must be removed.');
    const health=await fetch('http://localhost:5000/health'),app=await fetch('http://localhost:8081/app'),pricing=await fetch('http://localhost:8081/pricing');
    const bundle=await fetch('http://localhost:8081/index.bundle?platform=web&dev=true&hot=false&lazy=true');
    const code=await bundle.text();
    const result={fixture_database_removed:true,fixture_credentials_removed:true,backend_health:health.status,parent_app:app.status,pricing:pricing.status,web_bundle:bundle.status,disposable_api_in_normal_bundle:code.includes('localhost:5300/api')};
    console.log(JSON.stringify(result));
    assert.equal(health.status,200);assert.equal(app.status,200);assert.equal(pricing.status,200);assert.equal(bundle.status,200);assert.equal(result.disposable_api_in_normal_bundle,false);
    fs.writeFileSync(path.join(__dirname,'announcement-banner-local-check.json'),JSON.stringify(result,null,2));
  } finally {await client.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
