'use strict';
const { auditedWrite } = require('../../utils/auditedWrite');
const conflict = () => Object.assign(new Error('This child’s care details changed in another view. Refresh the profile before saving again.'), {statusCode:409});

// Parent care-profile saves lock this same child before replacing collections.
async function careWrite(actor, table, targetId, body, operation, work) {
  const actions = table === 'emergency_contacts'
    ? {add:'EMERGENCY_CONTACT_ADDED',update:'EMERGENCY_CONTACT_UPDATED',delete:'EMERGENCY_CONTACT_DELETED'}
    : {add:'CARE_INSTRUCTION_ADDED',update:'CARE_INSTRUCTION_UPDATED',delete:'CARE_INSTRUCTION_DELETED'};
  return auditedWrite(actor, actions[operation], table, async client => {
    let childId = Number(targetId);
    if (operation !== 'add') {
      // table is selected only by the fixed exports below, never from input.
      const {rows:[record]} = await client.query('SELECT child_id FROM '+table+' WHERE id=$1', [targetId]);
      if (!record) throw Object.assign(new Error('Care record not found. Refresh the profile.'), {statusCode:404});
      childId = record.child_id;
    }
    const {rows:[child]} = await client.query('SELECT id,daycare_id,version FROM children WHERE id=$1 FOR UPDATE', [childId]);
    if (!child || child.daycare_id !== actor.daycare_id) throw Object.assign(new Error('Child not found.'), {statusCode:404});
    if (body?.child_version !== undefined && body?.child_version !== null) {
      if (!Number.isSafeInteger(body.child_version) || body.child_version !== child.version) throw conflict();
    }
    const record = await work(client, childId);
    if (!record) throw conflict();
    // The edit_version trigger advances the shared revision in this transaction.
    await client.query('UPDATE children SET version=version WHERE id=$1', [childId]);
    return record;
  }, {}, actor.daycare_id);
}

const addContact = (childId, body, actor) => careWrite(actor,'emergency_contacts',childId,body,'add',async(client,id)=>{
  const {rows:[record]} = await client.query('INSERT INTO emergency_contacts(child_id,name,relationship,phone) VALUES($1,$2,$3,$4) RETURNING *', [id,body.name,body.relationship,body.phone]);
  return record;
});
const updateContact = (id, body, actor) => careWrite(actor,'emergency_contacts',id,body,'update',async client=>{
  const {rows:[record]} = await client.query('UPDATE emergency_contacts SET name=$2,relationship=$3,phone=$4 WHERE id=$1 RETURNING *', [id,body.name,body.relationship,body.phone]);
  return record;
});
const deleteContact = (id, actor, body={}) => careWrite(actor,'emergency_contacts',id,body,'delete',async client=>{
  const {rows:[record]} = await client.query('DELETE FROM emergency_contacts WHERE id=$1 RETURNING id,child_id', [id]);
  return record;
});
const addInstruction = (childId, body, actor) => careWrite(actor,'care_instructions',childId,body,'add',async(client,id)=>{
  const {rows:[record]} = await client.query('INSERT INTO care_instructions(child_id,category,instruction_text) VALUES($1,$2,$3) RETURNING *', [id,body.category,body.instruction_text]);
  return record;
});
const updateInstruction = (id, body, actor) => careWrite(actor,'care_instructions',id,body,'update',async client=>{
  const {rows:[record]} = await client.query('UPDATE care_instructions SET category=$2,instruction_text=$3 WHERE id=$1 RETURNING *', [id,body.category,body.instruction_text]);
  return record;
});
const deleteInstruction = (id, actor, body={}) => careWrite(actor,'care_instructions',id,body,'delete',async client=>{
  const {rows:[record]} = await client.query('DELETE FROM care_instructions WHERE id=$1 RETURNING id,child_id', [id]);
  return record;
});
module.exports = {addContact,updateContact,deleteContact,addInstruction,updateInstruction,deleteInstruction};
