'use strict';
const router=require('express').Router();
const auth=require('../../middleware/auth');
const {allowRoles}=require('../../middleware/rbac');
const {Joi,validate}=require('../../middleware/validator');
const db=require('../../config/db');
const service=require('./service').createBillingAutomation(db);
const wrap=fn=>async(req,res,next)=>{try{res.json(await fn(req));}catch(error){next(error);}};
router.use(auth);
router.get('/settings',allowRoles('admin'),wrap(async req=>({...await service.settings(req.user),runtime:{
  scheduler_enabled:process.env.BILLING_AUTOMATION_ENABLED==='true',
  email_delivery_enabled:process.env.BILLING_AUTOMATION_ENABLED==='true'&&process.env.BILLING_AUTOMATION_EMAIL_ENABLED==='true'&&
    !!(process.env.SMTP_HOST&&process.env.SMTP_PORT&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM),
}})));
router.post('/preview',allowRoles('admin'),wrap(req=>service.preview(req.body,req.user)));
router.put('/settings',allowRoles('admin'),wrap(req=>service.save(req.body,req.user)));
router.get('/history',allowRoles('admin'),wrap(req=>service.history(req.user)));
router.post('/run',allowRoles('admin'),wrap(async req=>{
  await service.settings(req.user);const invoices=await service.generate(req.user.daycare_id);const queued=await service.enqueue(req.user.daycare_id);return {invoices,queued};
}));
router.get('/my-reminders',allowRoles('parent'),wrap(req=>service.parentReminders(req.user)));
router.get('/my-reminders/preferences',allowRoles('parent'),wrap(req=>service.parentPreferences(req.user)));
router.patch('/my-reminders/preferences',allowRoles('parent'),validate(Joi.object({email_enabled:Joi.boolean().required()})),wrap(req=>service.emailPreference(req.body.email_enabled,req.user)));
router.patch('/my-reminders/:id/read',allowRoles('parent'),wrap(req=>{
  if(Joi.number().integer().positive().validate(req.params.id).error)throw Object.assign(new Error('Reminder not found.'),{statusCode:404});return service.readReminder(Number(req.params.id),req.user);
}));
module.exports=router;
