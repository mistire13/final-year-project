'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBillingAutomation}=require('../src/modules/billing-automation/service');

test('billing email preference is private to an active parent in the authenticated daycare and preserves other notification choices',async()=>{
  const users=[{id:10,daycare_id:20,role_id:3,status:'active',ui_preferences:{notifications:{messages:false,billing_email:true},theme:'warm'}},
    {id:11,daycare_id:20,role_id:3,status:'inactive',ui_preferences:{}},{id:12,daycare_id:20,role_id:1,status:'active',ui_preferences:{}}];
  const pool={query:async(sql,values)=>{
    assert.match(sql,/id=\$1 AND daycare_id=\$2 AND role_id=3 AND status='active'/);
    const user=users.find(user=>user.id===values[0]&&user.daycare_id===values[1]&&user.role_id===3&&user.status==='active');
    if(user&&sql.startsWith('UPDATE')){assert.match(sql,/COALESCE\(ui_preferences->'notifications'/);user.ui_preferences.notifications={...user.ui_preferences.notifications,billing_email:values[2]};}
    return {rows:user?[user]:[]};
  }};
  const service=createBillingAutomation(pool),parent={id:10,daycare_id:20,role:'parent'};
  assert.deepEqual(await service.parentPreferences(parent),{billing_email:true});
  assert.deepEqual(await service.emailPreference(false,parent),{billing_email:false});
  assert.deepEqual(await service.parentPreferences(parent),{billing_email:false});
  assert.equal(users[0].ui_preferences.notifications.messages,false);assert.equal(users[0].ui_preferences.theme,'warm');
  for(const user of [{...parent,daycare_id:21},{...parent,id:11},{...parent,id:12},{...parent,role:'admin'}]){
    await assert.rejects(service.parentPreferences(user),error=>error.statusCode===403);
    await assert.rejects(service.emailPreference(true,user),error=>error.statusCode===403);
  }
  await assert.rejects(service.emailPreference('true',parent),error=>error.statusCode===422);
});
