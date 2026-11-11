'use strict';
const crypto=require('node:crypto');
const Joi=require('joi');
const {banks,bankCodes,receiptInput,cbeReceipt}=require('../saas/subscription-banks');
const {lookupVeritas,extractVeritasReceipt,messageFor}=require('../saas/veritas-client');
const {matchesVerifiedPayment,canonicalReference,telebirrPhone}=require('../saas/subscription-payments.service');
const {MAX_IMAGE_BASE64,readReceiptImage,extractedReceipt,providerReceipt}=require('./receipt-evidence');
const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const money=value=>{const s=String(value??'');const m=/^(\d+)(?:\.(\d{1,2}))?$/.exec(s);return m?BigInt(m[1])*100n+BigInt((m[2]||'').padEnd(2,'0')):null;};
const decimal=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
const name=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US'):'';
const account=value=>String(value??'').replace(/[\s-]/g,'').toUpperCase();
const disabled=()=>Object.fromEntries(bankCodes.map(code=>[code,{enabled:false,account_holder:'',account_number:''}]));
const bankSchema=Joi.object({enabled:Joi.boolean().required(),account_holder:Joi.string().trim().max(150).allow('').required(),account_number:Joi.string().trim().max(30).allow('').required()});
const settingsSchema=Joi.object({version:Joi.number().integer().min(0).required(),accounts:Joi.object(Object.fromEntries(bankCodes.map(code=>[code,bankSchema.required()]))).required(),reason:Joi.string().trim().min(12).max(1000).required()});
const createSchema=Joi.object({purpose:Joi.string().valid('invoice','order').required(),target_id:Joi.number().integer().positive().required(),provider:Joi.string().valid(...bankCodes).required(),request_key:Joi.string().pattern(/^[A-Za-z0-9_-]{16,100}$/).required()});
const proofSchema=Joi.object({
  version:Joi.number().integer().positive().required(),
  reference:Joi.string().trim().min(4).max(2048),
  image:Joi.string().max(MAX_IMAGE_BASE64),
  suffix:Joi.string().pattern(/^\d{5}$/),
}).xor('reference','image');
const reviewSchema=Joi.object({version:Joi.number().integer().positive().required(),decision:Joi.string().valid('approve','reject').required(),reason:Joi.string().trim().min(12).max(1000).required(),evidence_reference:Joi.string().trim().min(4).max(200).required(),
  verified_reference:Joi.string().trim().min(4).max(2048).pattern(/^[\x21-\x7e]+$/).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  confirmed_amount:Joi.number().strict().positive().max(99999999.99).precision(2).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  confirmed_recipient_name:Joi.string().trim().min(2).max(150).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  confirmed_recipient_account:Joi.string().trim().max(30).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  payment_date:Joi.string().isoDate().when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  payer_confirmed:Joi.boolean().valid(true).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  timing_confirmed:Joi.boolean().valid(true).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  amount_and_receiver_confirmed:Joi.boolean().valid(true).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
});
function validate(schema,body){const checked=schema.validate(body,{abortEarly:false});if(checked.error)throw fail(checked.error.details.map(d=>d.message).join('. '));return checked.value;}
function uuid(id){if(Joi.string().guid({version:'uuidv4'}).validate(id).error)throw fail('Payment request not found.',404);return id;}
function safe(row){return {id:row.id,purpose:row.purpose,target_id:row.invoice_id??row.order_id,amount:row.amount,currency:row.currency,provider:row.provider,status:row.status,version:row.version,expected:row.expected,payer_name:row.payer_name,valid_from:row.valid_from,expires_at:row.expires_at,created_at:row.created_at,
  submitted_reference:row.submitted_reference,verification_source:row.verification_source,verified_at:row.verified_at,payment_date:row.payment_date,review_reason:row.review_reason,applied_payment_id:row.applied_payment_id,resolution:row.resolution,
  verification:row.verification?{code:row.verification.code,message:row.verification.message}:null,message:row.status==='resolved'?'Independent resolution recorded. No money was moved by the app; reference claims remain permanent.':row.verification?.message||({awaiting_proof:'Transfer the exact amount to this daycare, then submit the bank receipt. Do not pay again if you already transferred.',applied:'Payment verified and applied.',verified_unapplied:'Receipt confirmed; the bill or order changed. Contact your daycare for reconciliation. Do not pay again.',rejected:'This proof was reviewed and rejected. Contact your daycare if money was transferred.'}[row.status]||'Payment requires review.')};}
function aliasesFor(reference,provider,authoritative){const receipt=provider==='cbe'?cbeReceipt(reference):null;return [...new Set([reference,receipt?.identifier,receipt?.reference,authoritative].filter(v=>typeof v==='string'&&v.trim()).map(v=>canonicalReference(v,provider)))];}

function createDaycarePayments(pool,options={}){
  const now=options.now??(()=>new Date());
  async function actor(c,user,roles=['parent','admin']){
    if(!roles.includes(user?.role)||!Number.isSafeInteger(Number(user.daycare_id))||Number(user.daycare_id)<=0)throw fail('Daycare account required.',403);
    const row=(await c.query(`SELECT u.id,u.name,u.role_id FROM users u JOIN daycares d ON d.id=u.daycare_id WHERE u.id=$1 AND u.daycare_id=$2 AND u.status='active' AND d.status='active' AND d.deleted_at IS NULL AND u.role_id=$3`,[user.id,user.daycare_id,user.role==='admin'?1:3])).rows[0];
    if(!row)throw fail('Active daycare account required.',403);return row;
  }
  async function tx(user,work){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.daycare_id',$1,true),set_config('app.current_daycare_id',$1,true)",[String(user.daycare_id)]);const result=await work(c);await c.query('COMMIT');return result;}catch(error){await c.query('ROLLBACK');if(error.code==='23505')throw fail('This reference or payment request is already registered. Refresh and review the existing payment.',409);if(['40P01','40001'].includes(error.code))throw fail('Another payment operation changed this request. Refresh its status; do not pay again.',409);throw error;}finally{c.release();}}
  async function audit(c,user,action,id,metadata){await c.query('INSERT INTO audit_logs(daycare_id,actor_id,action,target_table,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',[user.daycare_id,user.id,action,'daycares',user.daycare_id,JSON.stringify({payment_request_id:id,...metadata})]);}
  async function settings(user){await actor(pool,user,['admin']);const row=(await pool.query('SELECT * FROM daycare_payment_settings WHERE daycare_id=$1',[user.daycare_id])).rows[0];return {version:row?.version??0,accounts:{...disabled(),...row?.accounts}};}
  async function saveSettings(body,user){const input=validate(settingsSchema,body);return tx(user,async c=>{
    await actor(c,user,['admin']);
    await c.query('SELECT id FROM daycares WHERE id=$1 FOR UPDATE',[user.daycare_id]);
    for(const code of bankCodes){const a=input.accounts[code];if(!a.enabled)continue;if(a.account_holder.length<2)throw fail('Enter the exact account-holder name.');
      if(code==='telebirr'){const phone=telebirrPhone(a.account_number);if(!phone)throw fail('Enter a complete Ethiopian Telebirr phone number.');a.account_number=phone;}
      else if(!/^\d{6,30}$/.test(a.account_number))throw fail('Enter the complete bank account number.');}
    const before=(await c.query('SELECT * FROM daycare_payment_settings WHERE daycare_id=$1 FOR UPDATE',[user.daycare_id])).rows[0];
    if((before?.version??0)!==input.version)throw fail('Receiving settings changed. Refresh before saving.',409);
    const saved=(await c.query(`INSERT INTO daycare_payment_settings(daycare_id,accounts,updated_by) VALUES($1,$2,$3) ON CONFLICT(daycare_id) DO UPDATE SET accounts=EXCLUDED.accounts,updated_by=EXCLUDED.updated_by,version=daycare_payment_settings.version+1,updated_at=NOW() RETURNING *`,[user.daycare_id,JSON.stringify(input.accounts),user.id])).rows[0];
    await audit(c,user,'DAYCARE_RECEIVING_ACCOUNTS_UPDATED',null,{reason:input.reason,version:saved.version});return {version:saved.version,accounts:saved.accounts};
  });}
  async function receivingAccounts(user){await actor(pool,user);const row=(await pool.query('SELECT accounts FROM daycare_payment_settings WHERE daycare_id=$1',[user.daycare_id])).rows[0];return {accounts:bankCodes.filter(code=>row?.accounts?.[code]?.enabled).map(code=>({provider:code,institution:banks[code],account_holder:row.accounts[code].account_holder,account_number:row.accounts[code].account_number}))};}
  async function target(c,row,lock=false){
    if(row.purpose==='invoice')return (await c.query(`SELECT i.*,c.full_name AS child_name FROM child_invoices i JOIN children c ON c.id=i.child_id AND c.daycare_id=i.daycare_id WHERE i.id=$1 AND i.daycare_id=$2 AND i.parent_id=$3 AND EXISTS(SELECT 1 FROM guardian_links g WHERE g.daycare_id=i.daycare_id AND g.child_id=i.child_id AND g.user_id=$3)${lock?' FOR UPDATE OF i':''}`,[row.invoice_id??row.target_id,row.daycare_id,row.parent_id])).rows[0];
    return (await c.query(`SELECT * FROM orders WHERE id=$1 AND daycare_id=$2 AND parent_id=$3${lock?' FOR UPDATE':''}`,[row.order_id??row.target_id,row.daycare_id,row.parent_id])).rows[0];
  }
  async function lockTarget(c,row){await c.query(`SELECT id FROM ${row.purpose==='invoice'?'child_invoices':'orders'} WHERE id=$1 AND daycare_id=$2 FOR UPDATE`,[row.invoice_id??row.order_id,row.daycare_id]);}
  async function own(c,id,user,lock=false){await actor(c,user);const args=[uuid(id),user.daycare_id,user.role==='admin',user.id];let row=(await c.query('SELECT * FROM daycare_payment_requests WHERE id=$1 AND daycare_id=$2 AND ($3::boolean OR parent_id=$4)',args)).rows[0];if(!row)throw fail('Payment request not found.',404);
    if(lock){await lockTarget(c,row);row=(await c.query('SELECT * FROM daycare_payment_requests WHERE id=$1 AND daycare_id=$2 AND ($3::boolean OR parent_id=$4) FOR UPDATE',args)).rows[0];}
    return row;}
  async function create(body,user){const input=validate(createSchema,body);return tx(user,async c=>{
    const parent=await actor(c,user,['parent']);
    const identity={...input,daycare_id:user.daycare_id,parent_id:user.id};const bill=await target(c,identity,true);if(!bill)throw fail('Owned bill or order not found.',404);
    const old=(await c.query('SELECT * FROM daycare_payment_requests WHERE daycare_id=$1 AND parent_id=$2 AND request_key=$3',[user.daycare_id,user.id,input.request_key])).rows[0];
    if(old){if(old.purpose!==input.purpose||(old.invoice_id??old.order_id)!==input.target_id||old.provider!==input.provider)throw fail('This request key belongs to different payment terms.',409);return safe(old);}
    const balance=input.purpose==='invoice'?money(bill.amount)-money(bill.amount_paid):money(bill.total);
    if(balance<=0n||bill.status==='cancelled'||input.purpose==='order'&&(bill.order_status==='cancelled'||bill.payment_status!=='unpaid'))throw fail('This bill or order cannot start another payment.',409);
    const existing=(await c.query(`SELECT * FROM daycare_payment_requests WHERE daycare_id=$1 AND purpose=$2 AND ${input.purpose==='invoice'?'invoice_id':'order_id'}=$3 AND status IN ('awaiting_proof','checking','review_pending','verified_unapplied') FOR UPDATE`,[user.daycare_id,input.purpose,input.target_id])).rows[0];
    if(existing){if(existing.status==='awaiting_proof'&&Date.parse(existing.expires_at)<=now().getTime())await c.query("UPDATE daycare_payment_requests SET status='expired',version=version+1,updated_at=NOW() WHERE id=$1",[existing.id]);else{if(existing.parent_id===user.id&&existing.provider===input.provider)return safe(existing);throw fail('A payment already exists for this bill or order. Resume or ask your daycare to review it; do not pay again.',409);}}
    const configured=(await c.query('SELECT * FROM daycare_payment_settings WHERE daycare_id=$1 FOR SHARE',[user.daycare_id])).rows[0];const dest=configured?.accounts?.[input.provider];
    if(!dest?.enabled||!dest.account_holder||!dest.account_number)throw fail('This daycare has not configured that receiving account.',503);
    const expected={institution:banks[input.provider],account_holder:dest.account_holder,account_number:dest.account_number,settings_version:configured.version};
    const id=crypto.randomUUID(),validFrom=new Date(bill.created_at),expiry=new Date(now().getTime()+24*3600000);
    const row=(await c.query(`INSERT INTO daycare_payment_requests(id,daycare_id,parent_id,purpose,invoice_id,order_id,provider,amount,expected,payer_name,valid_from,expires_at,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,user.daycare_id,user.id,input.purpose,input.purpose==='invoice'?input.target_id:null,input.purpose==='order'?input.target_id:null,input.provider,decimal(balance),JSON.stringify(expected),parent.name,validFrom,expiry,input.request_key])).rows[0];
    await audit(c,user,'DAYCARE_PAYMENT_REQUEST_CREATED',id,{purpose:input.purpose,target_id:input.target_id,amount:row.amount,provider:input.provider});return safe(row);
  });}
  async function recover(c,user){await c.query("UPDATE daycare_payment_requests SET status='review_pending',verification=$4,lease_until=NULL,version=version+1,updated_at=NOW() WHERE daycare_id=$1 AND ($2::boolean OR parent_id=$3) AND status='checking' AND lease_until<=$5",[user.daycare_id,user.role==='admin',user.id,JSON.stringify({code:'interrupted',message:'The verification check was interrupted. Retry its status or ask your daycare to review the saved proof. Do not pay again.'}),now()]);}
  async function decorated(c,row){if(row.status!=='resolved')return safe(row);const resolution=(await c.query('SELECT outcome,reason,evidence_reference,amount,recorded_at FROM daycare_payment_resolutions WHERE request_id=$1 AND daycare_id=$2',[row.id,row.daycare_id])).rows[0];return {...safe(row),resolution};}
  async function get(id,user){await actor(pool,user);await recover(pool,user);return decorated(pool,await own(pool,id,user));}
  async function list(query={},user){await actor(pool,user);await recover(pool,user);const input=validate(Joi.object({purpose:Joi.string().valid('invoice','order'),target_id:Joi.number().integer().positive(),status:Joi.string().valid('awaiting_proof','checking','review_pending','verified_unapplied','applied','rejected','expired','resolved'),limit:Joi.number().integer().min(1).max(100).default(25),offset:Joi.number().integer().min(0).max(1000000).default(0)}),query);
    const filter=`r.daycare_id=$1 AND ($2::boolean OR r.parent_id=$3) AND ($4::text IS NULL OR r.purpose=$4) AND ($5::int IS NULL OR COALESCE(r.invoice_id,r.order_id)=$5) AND ($6::text IS NULL OR r.status=$6)`;
    const args=[user.daycare_id,user.role==='admin',user.id,input.purpose||null,input.target_id||null,input.status||null];
    const count=(await pool.query(`SELECT count(*)::int AS total FROM daycare_payment_requests r WHERE ${filter}`,args)).rows[0];
    const rows=(await pool.query(`SELECT r.* FROM daycare_payment_requests r WHERE ${filter} ORDER BY r.created_at DESC,r.id DESC LIMIT $7 OFFSET $8`,[...args,input.limit,input.offset])).rows;
    const items=[];for(const row of rows)items.push(await decorated(pool,row));return {items,total:count.total,limit:input.limit,offset:input.offset};}
  async function available(c,row,aliases){for(const reference of aliases){const found=(await c.query('SELECT public.daycare_payment_reference_available($1,$2) AS available',[row.id,reference])).rows[0];if(!found?.available)throw fail('This payment reference has already been registered. Contact your daycare; do not pay again.',409);}}
  async function claim(c,row,aliases){for(const reference of aliases){const result=(await c.query('SELECT public.claim_daycare_payment_reference($1,$2) AS claimed',[row.id,reference])).rows[0];if(!result?.claimed)throw fail('This payment reference has already been registered. Contact your daycare; do not pay again.',409);}}
  async function pending(c,id,verification){
    const {rows}=await c.query("UPDATE daycare_payment_requests SET status='review_pending',verification=$2,lease_until=NULL,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",[id,JSON.stringify(verification)]);
    return safe(rows[0]);
  }
  async function settle(c,row,user){
    const bill=await target(c,row,true);const balance=bill&&(row.purpose==='invoice'?money(bill.amount)-money(bill.amount_paid):money(bill.total));
    const active=(await c.query("SELECT u.id FROM users u JOIN daycares d ON d.id=u.daycare_id WHERE u.id=$1 AND u.daycare_id=$2 AND u.role_id=3 AND u.status='active' AND d.status='active' AND d.deleted_at IS NULL",[row.parent_id,row.daycare_id])).rowCount===1;
    if(!bill||!active||balance!==money(row.amount)||bill.status==='cancelled'||row.purpose==='order'&&(bill.order_status==='cancelled'||bill.payment_status!=='unpaid')){
      return (await c.query("UPDATE daycare_payment_requests SET status='verified_unapplied',verification=$2,version=version+1,lease_until=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[row.id,JSON.stringify({code:'target_changed',message:'Receipt confirmed, but this bill or order changed. Your daycare must reconcile it. Do not pay again.'})])).rows[0];
    }
    let paymentId;
    if(row.purpose==='invoice'){
      const receipt=`BANK-${row.id}`;
      const actorId=user.role==='admin'?user.id:(await c.query("SELECT id FROM users WHERE daycare_id=$1 AND role_id=1 AND status='active' ORDER BY id LIMIT 1",[row.daycare_id])).rows[0]?.id;
      if(!actorId)return (await c.query("UPDATE daycare_payment_requests SET status='verified_unapplied',verification=$2,version=version+1,lease_until=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[row.id,JSON.stringify({code:'receipt_admin_unavailable',message:'Receipt confirmed, but an active daycare administrator must issue the care receipt. Your daycare must reconcile it. Do not pay again.'})])).rows[0];
      paymentId=(await c.query(`INSERT INTO child_payments(daycare_id,invoice_id,amount_paid,payment_method,reference_code,receipt_number,recorded_by,verified_at,notes,verification_source,daycare_payment_request_id) VALUES($1,$2,$3,'bank_transfer',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[row.daycare_id,row.invoice_id,row.amount,row.authoritative_reference,receipt,actorId,row.payment_date,'Full balance settled from independently verified bank receipt',row.verification_source,row.id])).rows[0].id;
      await c.query("UPDATE child_invoices SET amount_paid=amount,status='paid',updated_at=NOW() WHERE id=$1 AND daycare_id=$2",[row.invoice_id,row.daycare_id]);
    }else{
      const pay=(await c.query('SELECT * FROM payments WHERE order_id=$1 FOR UPDATE',[row.order_id])).rows[0];
      if(!pay||pay.status!=='unpaid')return (await c.query("UPDATE daycare_payment_requests SET status='verified_unapplied',verification=$2,version=version+1,lease_until=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[row.id,JSON.stringify({code:'target_changed',message:'Receipt confirmed, but the order payment changed. Ask your daycare to reconcile it; do not pay again.'})])).rows[0];
      paymentId=(await c.query("UPDATE payments SET status='paid',method='bank_transfer',gateway_ref=$2,verified_at=$3,verification_source=$4,daycare_payment_request_id=$5 WHERE id=$1 RETURNING id",[pay.id,row.authoritative_reference,row.payment_date,row.verification_source,row.id])).rows[0].id;
      await c.query("UPDATE orders SET payment_status='paid',updated_at=NOW() WHERE id=$1 AND daycare_id=$2",[row.order_id,row.daycare_id]);
    }
    await audit(c,user,'DAYCARE_BANK_PAYMENT_APPLIED',row.id,{purpose:row.purpose,target_id:row.invoice_id??row.order_id,amount:row.amount,provider:row.provider,verification_source:row.verification_source,payment_id:paymentId,money_moved_by_application:false});
    return (await c.query("UPDATE daycare_payment_requests SET status='applied',applied_payment_id=$2,verification=$3,version=version+1,lease_until=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[row.id,paymentId,JSON.stringify({code:'applied',message:'Payment confirmed and applied. The receipt is available in your history.'})])).rows[0];
  }
  async function verify(id,body,user){
    const input=validate(proofSchema,body);
    const image=input.image?readReceiptImage(input.image):null;
    if(input.image&&!image)throw fail('Choose a JPEG or PNG receipt screenshot up to 4 MB.');
    let reference;
    let row=await tx(user,async c=>{
      const request=await own(c,id,user,true);if(user.role!=='parent')throw fail('The billing parent must submit receipt proof.',403);
      if(request.status==='applied')return request;if(['rejected','verified_unapplied','resolved'].includes(request.status))throw fail('This payment requires independent daycare reconciliation.',409);
      if(request.status==='checking'&&Date.parse(request.lease_until)>now().getTime())throw fail('Receipt verification is already running. Wait for the result.',409);
      if(request.version!==input.version)throw fail('Payment request changed. Refresh its latest status.',409);
      if(request.attempt_count>=20||request.last_attempt_at&&now().getTime()-Date.parse(request.last_attempt_at)<10000)throw fail('Please wait before checking another receipt. Contact your daycare if verification remains unavailable.',429);
      if(input.reference){
        reference=canonicalReference(input.reference,request.provider);
        try{receiptInput(request.provider,reference,input.suffix);}catch(error){throw fail(error.message);}
        await available(c,request,aliasesFor(reference,request.provider));
      }
      if(!image&&(request.status==='expired'||now().getTime()>Date.parse(request.expires_at))){
        return (await c.query("UPDATE daycare_payment_requests SET status='review_pending',submitted_reference=$2,suffix=$3,attempt_count=attempt_count+1,last_attempt_at=$4,verification=$5,lease_until=NULL,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",[request.id,reference,input.suffix||null,now(),JSON.stringify({code:'timing_review',message:'Your saved receipt is outside this request window. The original receiving details are preserved for independent daycare review. Do not pay again.'})])).rows[0];
      }
      return (await c.query("UPDATE daycare_payment_requests SET status='checking',submitted_reference=$2,suffix=$3,attempt_count=attempt_count+1,last_attempt_at=$4,lease_until=$5,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",[request.id,reference??request.submitted_reference,image?request.suffix:input.suffix||null,now(),new Date(now().getTime()+60000)])).rows[0];
    });
    if(row.status==='applied'||row.status==='review_pending'&&row.verification?.code==='timing_review')return safe(row);
    let check;
    if(image){
      let extraction;
      try{extraction=await (options.extract??extractVeritasReceipt)(image);}catch{extraction={available:false,code:'transport'};}
      const proof=extractedReceipt(extraction,row.provider,input.suffix);
      if(proof){
        reference=canonicalReference(proof.reference,row.provider);
        const saved=await tx(user,async c=>{
          await lockTarget(c,row);
          const current=(await c.query('SELECT * FROM daycare_payment_requests WHERE id=$1 AND daycare_id=$2 AND parent_id=$3 FOR UPDATE',[row.id,row.daycare_id,row.parent_id])).rows[0];
          if(!current||current.version!==row.version||current.status!=='checking')return current;
          try{await available(c,current,aliasesFor(reference,row.provider));}
          catch(error){if(error.statusCode!==409)throw error;check={available:false,code:'duplicate_reference'};}
          return (await c.query('UPDATE daycare_payment_requests SET submitted_reference=$2,suffix=$3,updated_at=NOW() WHERE id=$1 RETURNING *',[row.id,reference,proof.suffix??null])).rows[0];
        });
        if(!saved)throw fail('Payment request not found.',404);
        if(saved.version!==row.version||saved.status!=='checking')return safe(saved);
        row=saved;
      }else{
        check=extraction.available?{available:false,code:'image_unreadable'}:extraction;
      }
    }
    if(!check){
      if(now().getTime()>Date.parse(row.expires_at))check={available:false,code:'timing_review'};
      else try{check=await (options.lookup??lookupVeritas)({provider:row.provider,reference,suffix:row.suffix||undefined});}catch{check={available:false,code:'transport'};}
    }
    const d=providerReceipt(check.result,row.provider),actual=d?.transactionReference??d?.reference??d?.receiptNumber??d?.receiptNo??d?.transactionId;
    const date=d?.transactionDate??d?.paymentDate??d?.paidAt??d?.date??d?.timestamp??d?.dateTime;
    const payer=d?.payerName??d?.senderName??d?.debitedPartyName??d?.sender??d?.payer;
    const expectedIntent={provider:row.provider,amount:row.amount,currency:row.currency,recipient:row.expected.account_number,terms:{recipient_name:row.expected.account_holder},created_at:new Date(Date.parse(row.valid_from)+300000)};
    const evidence=!!check.available&&!!d&&matchesVerifiedPayment({success:true,data:d},expectedIntent,reference,{environment:'production',nameAmountOnly:false});
    const payerMatch=name(payer)!==''&&name(payer)===name(row.payer_name);
    const timing=evidence&&Number.isFinite(Date.parse(date))&&Date.parse(date)<=Date.parse(row.expires_at)&&now().getTime()<=Date.parse(row.expires_at);
    return tx(user,async c=>{
      // The user was authenticated when proof was submitted. Preserve a trusted
      // provider result even if guardianship/account status changes in flight.
      await lockTarget(c,row);
      const current=(await c.query('SELECT * FROM daycare_payment_requests WHERE id=$1 AND daycare_id=$2 AND parent_id=$3 FOR UPDATE',[row.id,row.daycare_id,row.parent_id])).rows[0];
      if(!current)throw fail('Payment request not found.',404);if(current.version!==row.version||current.status!=='checking')return safe(current);
      if(!evidence||!payerMatch||!timing){
        const code=!check.available?(check.code||'upstream'):!evidence?'mismatch':!payerMatch?'payer_review':'timing_review';
        const message=code==='duplicate_reference'?'This receipt is already registered. Contact your daycare; do not pay again.':code==='payer_review'?'Receipt needs independent confirmation of the payer. Your daycare can review it; do not pay again.':code==='timing_review'?'This receipt needs independent timing review. Your daycare can reconcile it; do not pay again.':!check.available?messageFor(code):'Receipt amount, destination, date, identity or successful status could not be matched. Check the proof or ask your daycare; do not pay again.';
        return pending(c,id,{code,message,http_status:check.httpStatus||null,payer_match:payerMatch,timing_match:!!timing});
      }
      const aliases=aliasesFor(reference,row.provider,actual);
      await c.query('SAVEPOINT receipt_claim');
      const verified=(await c.query("UPDATE daycare_payment_requests SET authoritative_reference=$2,verified_aliases=$3,verification_source='provider_verified',verified_at=$4,payment_date=$5 WHERE id=$1 RETURNING *",[id,canonicalReference(actual,row.provider),JSON.stringify(aliases),now(),new Date(date)])).rows[0];
      try{await claim(c,verified,aliases);}
      catch(error){
        if(error.statusCode!==409)throw error;
        await c.query('ROLLBACK TO SAVEPOINT receipt_claim');
        return pending(c,id,{code:'duplicate_reference',message:error.message});
      }
      return safe(await settle(c,verified,user));
    });
  }
  async function review(id,body,user){const input=validate(reviewSchema,body);return tx(user,async c=>{
    await actor(c,user,['admin']);const row=await own(c,id,user,true);
    if(row.status==='applied')return safe(row);if(!['review_pending','verified_unapplied'].includes(row.status)||row.version!==input.version)throw fail('Refresh the submitted payment before reviewing it.',409);
    if(input.decision==='reject'){
      if(row.verified_at)throw fail('Confirmed money cannot be discarded. Reconcile its existing receipt independently.',409);
      const rejected=(await c.query("UPDATE daycare_payment_requests SET status='rejected',review_reason=$2,review_evidence_reference=$3,reviewed_by=$4,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",[id,input.reason,input.evidence_reference,user.id])).rows[0];
      await audit(c,user,'DAYCARE_PAYMENT_PROOF_REJECTED',id,{reason:input.reason,evidence_reference:input.evidence_reference});return safe(rejected);
    }
    if(money(input.confirmed_amount)!==money(row.amount)||name(input.confirmed_recipient_name)!==name(row.expected.account_holder)||(row.provider==='telebirr'?telebirrPhone(input.confirmed_recipient_account)!==telebirrPhone(row.expected.account_number):account(input.confirmed_recipient_account)!==account(row.expected.account_number)))throw fail('The independently checked amount and receiving details must match the accepted payment exactly.');
    if(Date.parse(input.payment_date)>now().getTime()+300000)throw fail('The independently checked payment date cannot be in the future.');
    const verifiedRef=canonicalReference(input.verified_reference,row.provider),aliases=aliasesFor(row.submitted_reference,row.provider,verifiedRef);
    if(row.verified_at&&row.authoritative_reference!==verifiedRef)throw fail('Confirmed receipt identity is immutable; reconcile its original payment.',409);
    const saved=(await c.query("UPDATE daycare_payment_requests SET authoritative_reference=$2,verified_aliases=$3,verification_source=COALESCE(verification_source,'independent_review'),verified_at=COALESCE(verified_at,$4),payment_date=COALESCE(payment_date,$5),review_reason=$6,review_evidence_reference=$7,reviewed_by=$8 WHERE id=$1 RETURNING *",[id,verifiedRef,JSON.stringify(aliases),now(),new Date(input.payment_date),input.reason,input.evidence_reference,user.id])).rows[0];
    await claim(c,saved,aliases);
    await audit(c,user,'DAYCARE_PAYMENT_INDEPENDENTLY_REVIEWED',id,{reason:input.reason,evidence_reference:input.evidence_reference,payer_confirmed:true,timing_confirmed:true,timing_exception:Date.parse(input.payment_date)<Date.parse(row.valid_from)||Date.parse(input.payment_date)>Date.parse(row.expires_at)});
    return safe(await settle(c,saved,user));
  });}
  async function resolve(id,body,user){const input=validate(Joi.object({version:Joi.number().integer().positive().required(),outcome:Joi.string().valid('refund_recorded','credit_recorded').required(),reason:Joi.string().trim().min(12).max(1000).required(),evidence_reference:Joi.string().trim().min(4).max(200).required(),amount_confirmed:Joi.boolean().valid(true).required()}),body);return tx(user,async c=>{
    await actor(c,user,['admin']);const row=await own(c,id,user,true);
    if(row.status==='resolved'){const previous=(await c.query('SELECT * FROM daycare_payment_resolutions WHERE request_id=$1 AND daycare_id=$2',[id,user.daycare_id])).rows[0];if(previous?.outcome===input.outcome&&previous.reason===input.reason&&previous.evidence_reference===input.evidence_reference)return {...safe(row),resolution:previous};throw fail('This payment already has different resolution evidence.',409);}
    if(row.status!=='verified_unapplied'||!row.verified_at||row.version!==input.version)throw fail('Only unapplied confirmed money can be independently resolved. Refresh before recording its evidence.',409);
    const resolution=(await c.query('INSERT INTO daycare_payment_resolutions(daycare_id,request_id,actor_id,outcome,reason,evidence_reference,amount) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[user.daycare_id,id,user.id,input.outcome,input.reason,input.evidence_reference,row.amount])).rows[0];
    const saved=(await c.query("UPDATE daycare_payment_requests SET status='resolved',review_reason=$2,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",[id,input.reason])).rows[0];
    await audit(c,user,'DAYCARE_CONFIRMED_PAYMENT_RESOLVED',id,{outcome:input.outcome,reason:input.reason,evidence_reference:input.evidence_reference,amount:row.amount,money_moved_by_application:false});
    return {...safe(saved),resolution,message:'Independent resolution recorded. No money was moved by the app; reference claims remain permanent.'};
  });}
  return {settings,saveSettings,receivingAccounts,create,get,list,verify,review,resolve};
}
module.exports={createDaycarePayments};
