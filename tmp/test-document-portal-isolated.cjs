'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend'),out=path.join(root,'docs/evidence/test-plan-rerun-20261031');
const {withCurrentDatabase}=require('../backend/scripts/helpers/auth-test-database.cjs');
withCurrentDatabase(async({name})=>{
 const log=fs.createWriteStream(path.join(out,'legacy-portal.tap'));
 const child=spawn(process.execPath,['--test','--test-timeout=60000','scripts/portal.test.cjs'],{cwd:backend,env:{...process.env,DB_NAME:name},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const code=await new Promise(resolve=>child.on('close',resolve));await new Promise(resolve=>log.end(resolve));
 fs.writeFileSync(path.join(out,'legacy-portal-exit.json'),JSON.stringify({exitCode:code,databaseIsolation:'generated outer disposable database; existing runtime login behavior preserved'},null,2));
 console.log(`Legacy portal suite completed in disposable database: exit=${code}`);
}).catch(e=>{console.error(e.message);process.exitCode=1;});
