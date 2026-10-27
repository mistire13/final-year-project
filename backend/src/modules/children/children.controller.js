'use strict';
// Children Controller — Phase 1 + Phase 5 (care CRUD)
const svc = require('./children.service');
const careSvc = require('./children.care.service');
const listChildren  = async (req, res, next) => { try { res.json(await svc.listChildren(req.query, req.user)); } catch(e) { next(e); } };
const createChild   = async (req, res, next) => { try { res.status(201).json(await svc.createChild(req.body, req.user)); } catch(e) { next(e); } };
const getChild      = async (req, res, next) => { try { res.json(await svc.getChild(req.params.id, req.user)); } catch(e) { next(e); } };
const updateChild   = async (req, res, next) => { try { res.json(await svc.updateChild(req.params.id, req.body, req.user)); } catch(e) { next(e); } };
const addGuardian   = async (req, res, next) => { try { res.status(201).json(await svc.addGuardian(req.params.id, req.body, req.user)); } catch(e) { next(e); } };
const getGuardians  = async (req, res, next) => { try { res.json(await svc.getGuardians(req.params.id, req.user)); } catch(e) { next(e); } };
const removeGuardian = async (req, res, next) => { try { await svc.removeGuardian(req.params.id, req.params.gid, req.user); res.status(204).send(); } catch(e) { next(e); } };
// Emergency Contacts
const addContact     = async (req, res, next) => { try { res.status(201).json(await careSvc.addContact(req.params.id, req.body, req.user)); } catch(e) { next(e); } };
const updateContact  = async (req, res, next) => { try { res.json(await careSvc.updateContact(req.params.cid, req.body, req.user)); } catch(e) { next(e); } };
const deleteContact  = async (req, res, next) => { try { res.json(await careSvc.deleteContact(req.params.cid, req.user, req.body)); } catch(e) { next(e); } };
// Care Instructions
const addInstruction    = async (req, res, next) => { try { res.status(201).json(await careSvc.addInstruction(req.params.id, req.body, req.user)); } catch(e) { next(e); } };
const updateInstruction = async (req, res, next) => { try { res.json(await careSvc.updateInstruction(req.params.iid, req.body, req.user)); } catch(e) { next(e); } };
const deleteInstruction = async (req, res, next) => { try { res.json(await careSvc.deleteInstruction(req.params.iid, req.user, req.body)); } catch(e) { next(e); } };
const enrollFamily   = async (req, res, next) => { try { res.status(201).json(await svc.enrollFamily(req.body, req.user)); } catch(e) { next(e); } };
const assignCaregiver = async (req, res, next) => { try { res.json(await svc.assignCaregiver(req.body, req.user)); } catch(e) { next(e); } };
module.exports = { listChildren, createChild, getChild, updateChild, addGuardian, getGuardians, removeGuardian, enrollFamily, assignCaregiver, addContact, updateContact, deleteContact, addInstruction, updateInstruction, deleteInstruction };

