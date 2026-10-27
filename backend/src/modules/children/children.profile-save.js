'use strict';

const crypto = require('node:crypto');
const Joi = require('joi');
const db = require('../../config/db');
const { transaction, lockAccount, activeAccount } = require('../auth/legacy-security');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const categories = { allergy: 'allergy', dietary: 'dietary', diet: 'dietary', medication: 'medical_note', medical_note: 'medical_note', note: 'general', routine: 'general', general: 'general' };
const schema = Joi.object({
  version: Joi.string().hex().length(64).required(),
  profile: Joi.object({
    full_name: Joi.string().trim().min(1).max(150),
    dob: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => {
      const date = new Date(value + 'T00:00:00Z');
      return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date > new Date()
        ? helpers.error('any.invalid') : value;
    }),
    gender: Joi.string().valid('male', 'female', 'other'),
    photo_url: Joi.string().uri({ scheme: ['https'] }).max(2048).allow(null),
    relationship: Joi.string().trim().min(1).max(80),
  }).min(1),
  parent_name: Joi.string().trim().min(1).max(150),
  care_instructions: Joi.array().max(100).items(Joi.object({
    category: Joi.string().valid(...Object.keys(categories)).required(),
    instruction_text: Joi.string().trim().min(2).max(10000).required(),
  })),
  emergency_contacts: Joi.array().max(5).items(Joi.object({
    name: Joi.string().trim().min(2).max(150).required(),
    relationship: Joi.string().trim().min(1).max(80).required(),
    phone: Joi.string().trim().min(7).max(30).required(),
  })),
  complete_profile: Joi.boolean().strict(),
}).or('profile', 'parent_name', 'care_instructions', 'emergency_contacts', 'complete_profile');

async function authorize(client, user, childId) {
  const actor = await lockAccount(client, { id: user.id });
  if (!activeAccount(actor) || actor.role !== 'parent' || actor.daycare_id !== user.daycare_id) {
    throw fail(403, 'Active parent account required.');
  }
  const child = (await client.query('SELECT * FROM children WHERE id=$1 FOR UPDATE', [childId])).rows[0];
  if (!child || child.daycare_id !== actor.daycare_id) throw fail(403, 'Child not linked to this account.');
  const link = (await client.query('SELECT * FROM guardian_links WHERE child_id=$1 AND user_id=$2 FOR UPDATE', [childId, actor.id])).rows[0];
  if (!link) throw fail(403, 'Child not linked to this account.');
  return actor;
}

async function read(client, childId, actor) {
  const child = (await client.query(`SELECT c.id,c.full_name,c.dob,c.gender,c.photo_url,c.group_id,c.caregiver_id,
    c.enrollment_status,g.name AS group_name,gl.relationship,gl.pickup_authorized
    FROM children c LEFT JOIN groups g ON g.id=c.group_id
    JOIN guardian_links gl ON gl.child_id=c.id AND gl.user_id=$2 WHERE c.id=$1`, [childId, actor.id])).rows[0];
  child.care_instructions = (await client.query('SELECT id,category,instruction_text FROM care_instructions WHERE child_id=$1 ORDER BY id', [childId])).rows;
  child.emergency_contacts = (await client.query('SELECT id,name,relationship,phone FROM emergency_contacts WHERE child_id=$1 ORDER BY id', [childId])).rows;
  const parent = (await client.query('SELECT id,name,profile_complete FROM users WHERE id=$1', [actor.id])).rows[0];
  const version = crypto.createHash('sha256').update(JSON.stringify({ child, parent })).digest('hex');
  return { child, parent, version };
}

async function execute(user, childId, input) {
  if (!Number.isSafeInteger(childId) || childId <= 0) throw fail(422, 'Invalid child ID.');
  let body;
  if (input !== undefined) {
    const result = schema.validate(input, { abortEarly: false, stripUnknown: false });
    if (result.error) throw fail(422, result.error.details.map(item => item.message).join('; '));
    body = result.value;
  }
  return transaction(db, async client => {
    const actor = await authorize(client, user, childId);
    const current = await read(client, childId, actor);
    if (!body) return current;
    if (body.version !== current.version) throw fail(409, 'Profile changed. Reload it before saving.');
    const profile = body.profile || {};
    const fields = ['full_name', 'dob', 'gender', 'photo_url'].filter(key => Object.hasOwn(profile, key));
    if (fields.length) await client.query(`UPDATE children SET ${fields.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE id=$${fields.length + 1}`, [...fields.map(key => profile[key]), childId]);
    if (!fields.length && (body.care_instructions !== undefined || body.emergency_contacts !== undefined)) {
      // Advance the shared edit_version trigger even when only collections
      // change, so an administrator's previously loaded care editor is stale.
      await client.query('UPDATE children SET full_name=full_name WHERE id=$1', [childId]);
    }
    if (profile.relationship !== undefined) await client.query('UPDATE guardian_links SET relationship=$1 WHERE child_id=$2 AND user_id=$3', [profile.relationship, childId, actor.id]);
    if (body.parent_name !== undefined) await client.query('UPDATE users SET name=$1,updated_at=NOW() WHERE id=$2', [body.parent_name, actor.id]);
    if (body.care_instructions !== undefined) {
      await client.query('DELETE FROM care_instructions WHERE child_id=$1', [childId]);
      for (const row of body.care_instructions) await client.query('INSERT INTO care_instructions(child_id,category,instruction_text) VALUES($1,$2,$3)', [childId, categories[row.category], row.instruction_text]);
    }
    if (body.emergency_contacts !== undefined) {
      await client.query('DELETE FROM emergency_contacts WHERE child_id=$1', [childId]);
      for (const row of body.emergency_contacts) await client.query('INSERT INTO emergency_contacts(child_id,name,relationship,phone) VALUES($1,$2,$3,$4)', [childId, row.name, row.relationship, row.phone]);
    }
    if (body.complete_profile === true) {
      const saved = await read(client, childId, actor);
      if (!saved.child.full_name || !saved.child.dob || !saved.child.emergency_contacts.length) throw fail(422, 'Profile completion requires child details and an emergency contact.');
      await client.query('UPDATE users SET profile_complete=true,updated_at=NOW() WHERE id=$1', [actor.id]);
    }
    await client.query(`INSERT INTO audit_logs(actor_id,action,target_table,target_id,metadata,daycare_id)
      VALUES($1,'PARENT_PROFILE_SAVED','children',$2,$3,$4)`, [actor.id, childId, JSON.stringify({ sections: Object.keys(body).filter(key => key !== 'version') }), actor.daycare_id]);
    return read(client, childId, actor);
  });
}

const handler = write => async (req, res, next) => {
  try { res.json(await execute(req.user, Number(req.params.id), write ? req.body : undefined)); }
  catch (error) { next(error); }
};
module.exports = { execute, authorize, get: handler(false), save: handler(true) };
