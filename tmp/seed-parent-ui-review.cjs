'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const f=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'subscription-backups/plus-ui-acceptance/fixture.json'),'utf8'));
assert.equal(f.purpose,'Disposable local acceptance ONLY');assert.match(f.api,/^http:\/\/localhost:\d+\/api$/);assert.match(f.database,new RegExp(`^ankelba_auth_test_${f.pid}_\\d+_[a-f0-9]{8}$`));
(async()=>{
  const login=await fetch(f.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.accounts.admin,password:f.password})});assert.equal(login.status,200);const {token}=await login.json();
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const posts=[
    {title:'Weekly meals · የሳምንቱ ምግብ ዝርዝር',body:'Monday: vegetables, rice and fruit.\nTuesday: lentils and bread.\nPlease discuss individual allergies with the daycare office.',announcement_type:'meal_plan',audience:'parents'},
    {title:'Family meeting and classroom updates for the coming week',body:('This is a synthetic UI-review announcement about a family meeting. It contains a long paragraph to check reading density and wrapping. ').repeat(7)+'\n\nMeeting details:\n• Time: 16:00\n• Location: the daycare office\n• Bring your questions.',announcement_type:'general',audience:'parents'},
    {title:'Pickup entrance changed today · የመግቢያ ቦታ ለውጥ',body:'UI-review example only. Use the main office entrance for pickup today.\nContact the daycare directly if you need help. No actual entrance or policy has changed.',announcement_type:'alert',audience:'parents'},
  ];
  for(const post of posts){const r=await fetch(f.api+'/communication/announcements',{method:'POST',headers,body:JSON.stringify({...post,request_key:crypto.randomUUID()})});assert.equal(r.status,201,await r.text());}
  const report=await fetch(f.api+'/reports/daily',{method:'POST',headers,body:JSON.stringify({child_id:f.child_id,mood:'happy',sleep_duration_min:45,general_observations:'Synthetic UI-review caregiver observation.',meals:[{meal_type:'lunch',description:'Vegetables and rice',portion:'good'}],activities:[{activity_type:'play',description:'Building blocks',location:'indoor'}]})});assert.equal(report.status,201,await report.text());
  await fetch(f.api+'/auth/logout',{method:'POST',headers});console.log('Seeded 3 synthetic announcement types and one care report into the owned review fixture.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
