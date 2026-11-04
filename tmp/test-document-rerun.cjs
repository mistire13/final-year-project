'use strict';
// Audit orchestration only. No application source or Word document is edited.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend'),out=path.join(root,'docs/evidence/test-plan-rerun-20261031');
fs.mkdirSync(out,{recursive:true});
const matrix=path.join(root,'docs/ENDPOINT_AUTHORIZATION_MATRIX_2026-10-31.json');
const original=fs.existsSync(matrix)?fs.readFileSync(matrix):null;
const tests=fs.readdirSync(path.join(backend,'scripts')).filter(f=>f.endsWith('.test.cjs')&&f!=='portal.test.cjs').sort();
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({started:new Date().toISOString(),node:process.version,files:tests,excludedFromMainRun:['portal.test.cjs: requires an outer disposable database because it otherwise uses configured DB_NAME'],command:'node --test --test-concurrency=2 --test-timeout=180000 scripts/<28 files>'},null,2));
const stream=fs.createWriteStream(path.join(out,'backend.tap'));
const child=spawn(process.execPath,['--test','--test-concurrency=2','--test-timeout=180000',...tests.map(f=>'scripts/'+f)],{cwd:backend,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
child.on('close',code=>{
 if(fs.existsSync(matrix))fs.copyFileSync(matrix,path.join(out,'endpoint-matrix.json'));
 if(original)fs.writeFileSync(matrix,original);else if(fs.existsSync(matrix))fs.unlinkSync(matrix);
 stream.end(()=>{fs.writeFileSync(path.join(out,'backend-exit.json'),JSON.stringify({exitCode:code,ended:new Date().toISOString()},null,2));console.log(`Backend test run finished: exit=${code}; files=${tests.length}; evidence=${out}`);});
});
