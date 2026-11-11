'use strict';

const crypto = require('node:crypto');
const {catalogFeatures,FEATURE_POLICY_VERSION}=require('./package-features');
const {lookupVeritas,messageFor} = require('./veritas-client');
const Joi = require('joi');
const {banks,bankCodes,isBankAccount,receiptInput,referenceMatches,cbeReceipt}=require('./subscription-banks');
const {addBillingPeriod,applyRenewalLocked,matchesRenewalTerms} = require('./subscriptions.service');
const changes=require('./subscription-changes');

const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const validate = (schema, body) => {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: false });
  if (error) throw fail(error.details.map(item => item.message).join('. '));
  return value;
};
const secretHash = token => crypto.createHash('sha256').update(token).digest('hex');
function verifySecret(token, expected) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(secretHash(token), 'hex'), Buffer.from(expected, 'hex'));
}
const providers = bankCodes;
function telebirrPhone(value) {
  const clean = typeof value === 'string' ? value.trim().replace(/[\s()-]/g,'').replace(/^\+/, '').replace(/^00251/,'251') : '';
  const international = /^0[79]\d{8}$/.test(clean) ? `251${clean.slice(1)}` : clean;
  return /^251[79]\d{8}$/.test(international) ? international : '';
}
const bankChoiceSchema = Joi.object({ provider: Joi.string().valid(...providers).required() });
const createSchema = Joi.object({
  provider: Joi.string().valid(...providers).required(),
  package_code: Joi.string().valid('standard', 'premium').required(),
  billing_cycle: Joi.string().valid('monthly', 'six_month', 'annual').required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(255).required(),
});
const proofSchema = Joi.object({
  token: Joi.string().length(43).required(),
  provider: Joi.string().valid(...providers).required(),
  reference: Joi.string().trim().min(4).max(2048).required(),
  suffix: Joi.when('provider',{is:'abyssinia',then:Joi.string().trim().pattern(/^\d{5}$/).required(),otherwise:Joi.forbidden()}),
  phoneNumber: Joi.forbidden(),
});
const reviewSchema = Joi.object({
  version: Joi.number().integer().min(1).required(),
  decision: Joi.string().valid('approve', 'reject').required(),
  reason: Joi.string().trim().min(12).max(1000).required(),
  verified_reference: Joi.string().trim().min(4).max(2048).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  evidence_reference: Joi.string().trim().min(4).max(200).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
  amount_and_receiver_confirmed: Joi.boolean().valid(true).when('decision',{is:'approve',then:Joi.required(),otherwise:Joi.forbidden()}),
});
const statusSchema = Joi.object({ token: Joi.string().length(43).required() });
const recoverySchema = Joi.object({
  version: Joi.number().integer().min(1).required(),
  reason: Joi.string().trim().min(12).max(1000).required(),
});
const bankAccountSchema=Joi.object({
  enabled:Joi.boolean().required(),
  account_holder:Joi.when('enabled',{is:true,then:Joi.string().trim().min(2).max(150).required(),otherwise:Joi.string().trim().max(150).allow('').required()}),
  account_number:Joi.when('enabled',{is:true,then:Joi.string().trim().pattern(/^\d{6,30}$/).required(),otherwise:Joi.string().trim().max(30).allow('').required()}),
});
const telebirrAccountSchema=bankAccountSchema.keys({
  account_number:Joi.when('enabled',{is:true,
    then:Joi.string().trim().custom((value,helpers)=>telebirrPhone(value)||helpers.message({custom:'Enter a complete Ethiopian Telebirr phone number.'})).required(),
    otherwise:Joi.string().trim().max(30).allow('').required()}),
});
const settingsSchema = Joi.object({
  version: Joi.number().integer().min(1).required(),
  accounts: Joi.object({
    telebirr: telebirrAccountSchema.optional(),
    cbe: bankAccountSchema.required(),
    abyssinia: bankAccountSchema.required(),
  }).required(),
  reason: Joi.string().trim().min(12).max(1000).required(),
});
const resolutionSchema = Joi.object({
  version:Joi.number().integer().min(1).required(),
  outcome:Joi.string().valid('refund_recorded','credit_recorded','other_resolved').required(),
  reason:Joi.string().trim().min(12).max(1000).required(),
  evidence_reference:Joi.string().trim().min(4).max(200).required(),
});
const safeIntent = row => ({ id: row.id, email:row.email, terms: row.terms, status: row.status, recipient: row.recipient,
  subscription_change_id:row.subscription_change_id,renewal_period_start:row.renewal_period_start,
  recipient_institution:row.terms?.recipient_institution, recipient_name:row.terms?.recipient_name,
  expires_at: row.expires_at, provider: row.provider, payment_reference: row.payment_reference, version: row.version,
  server_time: new Date().toISOString(),
  message: row.status==='verification_pending' ? messageFor(row.verification?.code) : undefined });
const canonicalReference = (reference, provider) => {
  const clean = reference.trim();
  // New CBE receipt tokens and URLs are case sensitive. Never rewrite them.
  if (/^https?:\/\//i.test(clean) || (provider === 'cbe' && !/^FT[A-Z0-9]+$/i.test(clean))) return clean;
  return clean.replace(/\s+/g, '').toUpperCase();
};
const cents = value => {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const [whole, decimal = ''] = s.split('.');
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
};
const account = value => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
const personName = value => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US') : '';
function nameMatches(candidate, expected) {
  const name=personName(candidate);
  return name!=='' && name===personName(expected);
}
function providerData(result) {
  let data = result;
  for (let depth = 0; depth < 3 && data?.data && typeof data.data === 'object' && !Array.isArray(data.data); depth++) {
    if (data.success === false) return null;
    data = data.data;
  }
  return data?.success === false ? null : data;
}

// Provider payloads differ. Only accept an unambiguous, complete provider result;
// extraction, HTTP 200, and an outer success flag alone are not proof of payment.
function matchesVerifiedPayment(result, intent, reference, policy = {}) {
  if (!result || result.success !== true) return false;
  const d = providerData(result);
  if (!d) return false;
  const status = String(d.status ?? d.transactionStatus ?? '').toLowerCase();
  const ref = d.transactionReference ?? d.reference ?? d.receiptNumber ?? d.receiptNo ?? d.transactionId;
  const amount = intent.provider === 'telebirr' ? (d.settledAmount ?? d.amount ?? d.transactionAmount) : (d.transactionAmount ?? d.amount ?? d.settledAmount);
  const currency = d.currency ?? d.currencyCode;
  const recipient = d.receiverAccount ?? d.receiverAccountNumber ?? d.creditedPartyAccount ?? d.creditedPartyAccountNo ?? d.beneficiaryAccount ?? d.receiverPhone;
  const receiver = d.receiverName ?? d.creditedPartyName ?? d.beneficiaryName ?? d.receiver;
  const date = d.transactionDate ?? d.paymentDate ?? d.paidAt ?? d.date ?? d.timestamp ?? d.dateTime;
  const at = new Date(date).getTime();
  const created = new Date(intent.created_at).getTime();
  const nameAndAmountMatch=cents(amount)!==null && cents(amount)===cents(intent.amount)
    && nameMatches(receiver,intent.terms?.recipient_name);
  // Explicit local-development diagnostic mode. Never accept a failed provider
  // result, infer a payment from input alone, or enable this policy in production.
  if(policy.environment==='development' && policy.nameAmountOnly===true){
    return nameAndAmountMatch && (!status || ['success','successful','completed','paid'].includes(status));
  }
  return ['success', 'successful', 'completed', 'paid'].includes(status)
    && referenceMatches(ref,reference,intent.provider,canonicalReference)
    && nameAndAmountMatch
    && String(currency ?? '').toUpperCase() === intent.currency
    && (intent.provider === 'telebirr'
      ? telebirrPhone(recipient) !== '' && telebirrPhone(recipient) === telebirrPhone(intent.recipient)
      : account(recipient) !== '' && account(recipient) === account(intent.recipient))
    && Number.isFinite(at) && Number.isFinite(created) && at >= created - 300000 && at <= Date.now() + 300000;
}
async function transaction(pool, work) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const value = await work(c); await c.query('COMMIT'); return value; }
  catch (e) { await c.query('ROLLBACK'); if (e.code === '23505') throw fail('This payment reference is already associated with a payment.', 409); throw e; }
  finally { c.release(); }
}
async function claimReferences(c, intent, references, source) {
  for (const reference of [...new Set(references.filter(Boolean).map(value => canonicalReference(value,intent.provider)))]) {
    // Unknown-provider historical payments cannot safely be assumed to use a
    // case-sensitive token format. Conservatively reject alternate case/space
    // spellings; leave actual CBE receipt URLs and current tokens intact.
    if (!/^https?:\/\//i.test(reference)) {
      const old = (await c.query(`SELECT intent_id FROM subscription_payment_references WHERE provider='legacy'
        AND reference !~* '^https?://' AND upper(regexp_replace(reference,'\\s','','g'))=upper(regexp_replace($1,'\\s','','g')) LIMIT 1`,[reference])).rows[0];
      if (old && old.intent_id !== intent.id) throw fail('This payment reference has already been used.',409);
    }
    const claimed = await c.query(`INSERT INTO subscription_payment_references(provider,reference,intent_id,source)
      VALUES($1,$2,$3,$4) ON CONFLICT(reference) DO NOTHING RETURNING intent_id`,
    [intent.provider,reference,intent.id,source]);
    if (!claimed.rows.length) {
      const previous = (await c.query('SELECT intent_id FROM subscription_payment_references WHERE reference=$1',[reference])).rows[0];
      if (!previous || previous.intent_id !== intent.id) throw fail('This payment reference has already been used.',409);
    }
  }
}
function authoritativeReference(result) {
  const data = providerData(result);
  return data?.transactionReference ?? data?.reference ?? data?.receiptNumber ?? data?.receiptNo ?? data?.transactionId;
}
function recoveryMailer(options) {
  if (options.recoverySender) return options.recoverySender;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, FRONTEND_URL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !FRONTEND_URL) {
    throw fail('Email delivery is not configured. Contact platform support.',503);
  }
  let base;
  try { base = new URL(FRONTEND_URL); } catch (_) { throw fail('Email recovery link is not configured.',503); }
  if (base.username || base.password || (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost','127.0.0.1'].includes(base.hostname)))) {
    throw fail('Email recovery link is not configured securely.',503);
  }
  const nodemailer = require('nodemailer');
  const secure = process.env.SMTP_SECURE==='true';
  const transport = nodemailer.createTransport({host:SMTP_HOST,port:Number(SMTP_PORT),secure,requireTLS:!secure,
    auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:30000});
  return async ({email,id,token,purpose}) => {
    const url = new URL('/',base);
    url.searchParams.set('subscription_resume',id);
    url.hash = `token=${token}${purpose === 'renewal' ? '&purpose=renewal' : ''}`;
    await transport.sendMail({from:SMTP_FROM,to:email,subject:'Resume your Ankelba subscription payment',
      text:`Use this link to resume your payment session: ${url.href}\n\nIf you did not request this, contact Ankelba support. Do not share the link.`});
  };
}
function createPaymentService(pool, options = {}) {
  const matchingPolicy={
    nameAmountOnly:options.matchingPolicy?.nameAmountOnly ?? process.env.SUBSCRIPTION_NAME_AMOUNT_TEST_MODE==='true',
    environment:process.env.NODE_ENV==='production'?'production':options.matchingPolicy?.environment ?? process.env.NODE_ENV,
  };
  const matchingMode=matchingPolicy.environment==='development'&&matchingPolicy.nameAmountOnly?'name_amount_test':'strict';
  let cachedRecoverySender = options.recoverySender || null;
  const getRecoverySender = () => {
    if (!cachedRecoverySender) {
      cachedRecoverySender = recoveryMailer(options);
    }
    return cachedRecoverySender;
  };
  const blankAccounts = () => Object.fromEntries(bankCodes.map(code => [code, { enabled: false, account_holder: '', account_number: '' }]));
  async function configuredAccounts() {
    const row = (await pool.query('SELECT bank_accounts,version,updated_at FROM subscription_payment_settings WHERE id=1')).rows[0];
    const accounts = { ...blankAccounts(), ...(options.accounts ?? row?.bank_accounts ?? {}) };
    return { accounts, version: row?.version ?? 1, updated_at: row?.updated_at };
  }
  async function receivingAccount(provider) {
    const {accounts} = await configuredAccounts();
    const value = accounts[provider];
    const accountNumber=provider==='telebirr'?telebirrPhone(value?.account_number):isBankAccount(value?.account_number)&&value.account_number;
    if (!bankCodes.includes(provider) || !value?.enabled || !accountNumber || !value.account_holder?.trim()) {
      throw fail('This payment receiving account is not configured. Choose another payment method or contact support.', 503);
    }
    return { ...value, account_number:accountNumber, institution: banks[provider], provider };
  }
  async function getSettings() { return configuredAccounts(); }
  async function updateSettings(body, actorId) {
    const input = validate(settingsSchema, body);
    return transaction(pool, async c => {
      let query = 'UPDATE subscription_payment_settings SET bank_accounts=bank_accounts || $2::jsonb,version=version+1,updated_at=NOW()';
      const params = [input.version, JSON.stringify(input.accounts)];
      if (input.accounts?.telebirr?.account_number) {
        query = 'UPDATE subscription_payment_settings SET bank_accounts=bank_accounts || $2::jsonb,institution=\'Telebirr\',account_holder=$3,account_number=$4,version=version+1,updated_at=NOW()';
        params.push(input.accounts.telebirr.account_holder?.trim() || '', telebirrPhone(input.accounts.telebirr.account_number) || input.accounts.telebirr.account_number);
      }
      query += ' WHERE id=1 AND version=$1 RETURNING bank_accounts,version,updated_at';
      const row = (await c.query(query, params)).rows[0];
      if (!row) throw fail('Payment settings changed. Refresh and review again.', 409);
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata) VALUES($1,'SUBSCRIPTION_PAYMENT_SETTINGS_CHANGED','subscription_payment_settings',$2)`,
        [actorId, JSON.stringify(input)]);
      return { accounts:{...blankAccounts(),...row.bank_accounts},version:row.version,updated_at:row.updated_at };
    });
  }
  async function publicSettings() {
    const {accounts}=await configuredAccounts();
    return {accounts:bankCodes.filter(code=>accounts[code]?.enabled&&(code==='telebirr'?telebirrPhone(accounts[code].account_number):isBankAccount(accounts[code].account_number))&&accounts[code].account_holder?.trim())
      .map(code=>({...accounts[code],account_number:code==='telebirr'?telebirrPhone(accounts[code].account_number):accounts[code].account_number,provider:code,institution:banks[code]}))};
  }
  async function create(body) {
    const input = validate(createSchema, body);
    const destination = await receivingAccount(input.provider);
    const email = input.email.toLowerCase();
    const existing = await pool.query(`SELECT 1 FROM users WHERE lower(email)=$1 UNION ALL
      SELECT 1 FROM daycare_applications WHERE lower(admin_email)=$1 AND status='pending' LIMIT 1`, [email]);
    if (existing.rows.length) throw fail('This email already has an account or pending application. Please sign in or contact support.',409);
    const offer = (await pool.query('SELECT * FROM subscription_packages WHERE code=$1 AND available', [input.package_code])).rows[0];
    if (!offer) throw fail('This package is unavailable.', 404);
    const price = offer[{ monthly: 'monthly_price', six_month: 'six_month_price', annual: 'annual_price' }[input.billing_cycle]];
    if (price == null || cents(price) === null || cents(price) <= 0n) throw fail('The package price is not configured. Please contact support.', 503);
    const terms = { code: offer.code, name: offer.name, version: offer.version, billing_cycle: input.billing_cycle,
      price: String(price), currency: 'ETB', max_children: offer.max_children, features:catalogFeatures(offer.code),feature_policy_version:FEATURE_POLICY_VERSION,
      recipient_institution:destination.institution,recipient_name:destination.account_holder,recipient_provider:destination.provider };
    const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
    const row = (await pool.query(`INSERT INTO subscription_payment_intents
      (id,secret_hash,email,terms,status,amount,currency,recipient,expires_at,provider)
      VALUES($1,$2,$3,$4,'pending',$5,'ETB',$6,NOW()+INTERVAL '10 minutes',$7) RETURNING *`,
    [id,secretHash(token),email,JSON.stringify(terms),price,destination.account_number,input.provider])).rows[0];
    return { ...safeIntent(row), token };
  }
  async function createRenewal(daycareId, actorId = null, body = {}) {
    const input=validate(bankChoiceSchema,body);
    const destination = await receivingAccount(input.provider);
    return transaction(pool, async c => {
      const daycare = (await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE', [daycareId])).rows[0];
      if (!daycare || daycare.deleted_at) throw fail('Daycare not found.',404);
      const change=await changes.openChange(c,daycareId,true);
      if(change&&['paid','blocked'].includes(change.status))throw fail('The future package already has a payment. Review its activation or contact the operator.',409);
      if(await changes.conflictingPayment(c,daycareId))throw fail('An existing renewal payment must be completed or resolved first. Recover that payment session rather than paying again.',409);
      if(change&&!changes.sameTime(change.effective_at,daycare.subscription_ends_at))throw fail('The future package period changed. Contact the operator before paying.',409);
      const terms = { ...(change?.terms||daycare.subscription_terms), recipient_institution:destination.institution,recipient_name:destination.account_holder,recipient_provider:destination.provider };
      if (!terms || !['monthly','six_month','annual'].includes(terms.billing_cycle) || terms.currency !== 'ETB'
          || cents(terms.price) === null || cents(terms.price) <= 0n) throw fail('Subscription terms are not configured. Contact the platform operator.',409);
      if (daycare.status !== 'active' || daycare.subscription_status === 'cancelled') throw fail('Contact the platform operator to resume this subscription.',409);
      if (!daycare.subscription_started_at || !daycare.subscription_ends_at) throw fail('This subscription needs operator review before you pay. Contact platform support.',409);
      const overdue = !change&&addBillingPeriod(daycare.subscription_ends_at,daycare.billing_cycle,daycare.subscription_started_at).getTime() <= Date.now();
      const authorization = overdue ? daycare.renewal_restart_authorization : null;
      if (overdue && (!authorization || authorization.intent_id || !authorization.id ||
          !Number.isFinite(Date.parse(authorization.expires_at)) || Date.parse(authorization.expires_at) <= Date.now() ||
          !matchesRenewalTerms(authorization.terms,terms))) {
        throw fail('This subscription needs operator review before you pay. Contact platform support.',409);
      }
      const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
      const expiry = new Date(Math.min(Date.now()+30*86400000,overdue ? Date.parse(authorization.expires_at) : Infinity));
      const row = (await c.query(`INSERT INTO subscription_payment_intents
        (id,secret_hash,email,terms,status,amount,currency,recipient,expires_at,daycare_id,created_by,restart_authorization_id,provider,subscription_change_id,renewal_period_start)
        VALUES($1,$2,$3,$4,'pending',$5,'ETB',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id,secretHash(token),daycare.contact_email,JSON.stringify(terms),terms.price,destination.account_number,expiry,daycareId,actorId,authorization?.id || null,input.provider,change?.id||null,daycare.subscription_ends_at])).rows[0];
      if(change)await c.query('UPDATE subscription_package_changes SET payment_intent_id=$2,updated_at=NOW() WHERE id=$1',[change.id,id]);
      if (authorization) await c.query('UPDATE daycares SET renewal_restart_authorization=$2,updated_at=NOW() WHERE id=$1',
        [daycareId,JSON.stringify({...authorization,intent_id:id})]);
      return { ...safeIntent(row), token };
    });
  }
  async function status(id, body) {
    const { token } = validate(statusSchema, body);
    let row = (await pool.query('SELECT * FROM subscription_payment_intents WHERE id=$1', [id])).rows[0];
    if (!row || !verifySecret(token, row.secret_hash)) throw fail('Payment session could not be found.', 404);
    if (row.status === 'pending' && row.provider === 'telebirr' && !row.subscription_change_id) {
      try {
        const dest = await receivingAccount('telebirr');
        if (dest && (row.recipient !== dest.account_number || row.terms?.recipient_name !== dest.account_holder)) {
          const updatedTerms = { ...row.terms, recipient_name: dest.account_holder, recipient_institution: dest.institution };
          row = (await pool.query(`UPDATE subscription_payment_intents
            SET recipient=$1, terms=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
            [dest.account_number, JSON.stringify(updatedTerms), id])).rows[0];
        }
      } catch (_) {}
    }
    return safeIntent(row);
  }
  async function resumeRenewal(daycareId, id, body) {
    const {token}=validate(statusSchema,body);
    const row=(await pool.query('SELECT * FROM subscription_payment_intents WHERE id=$1 AND daycare_id=$2',[id,daycareId])).rows[0];
    if (!row || !verifySecret(token,row.secret_hash)) throw fail('Payment session could not be found.',404);
    if (['consumed','rejected','resolved'].includes(row.status)) throw fail('This payment session cannot be resumed.',409);
    return safeIntent(row);
  }
  async function verify(id, body) {
    const input = validate(proofSchema, body), reference = canonicalReference(input.reference, input.provider);
    try{receiptInput(input.provider,reference,input.suffix);}catch(error){throw fail(error.message);}
    const row = await transaction(pool, async c => {
      const item = (await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!item || !verifySecret(input.token,item.secret_hash)) throw fail('Payment session could not be found.', 404);
      if (item.status === 'verified' || item.status === 'consumed') return item;
      if (['rejected','resolved'].includes(item.status)) throw fail('This payment requires operator assistance.', 409);
      if(!providers.includes(item.terms?.recipient_provider))throw fail('This is a payment for a previous payment method. Contact support for review; do not pay again.',409);
      if(item.terms.recipient_provider!==input.provider||item.provider!==input.provider)throw fail('The payment method does not match this payment session.',409);
      if (new Date(item.expires_at).getTime() + 60000 <= Date.now()) throw fail('This payment session has expired. Contact support if you already paid.', 409);
      const receipt=input.provider==='cbe'?cbeReceipt(reference):null;
      const aliases=[...new Set([reference,receipt?.identifier,receipt?.reference].filter(Boolean).map(alias=>canonicalReference(alias,input.provider)))];
      for(const alias of aliases){
        const existingClaim = (await c.query("SELECT intent_id FROM subscription_payment_references WHERE reference=$1 OR (provider='legacy' AND reference !~* '^https?://' AND $1 !~* '^https?://' AND upper(regexp_replace(reference,'\\s','','g'))=upper(regexp_replace($1,'\\s','','g'))) LIMIT 1",[alias])).rows[0];
        if (existingClaim && existingClaim.intent_id !== id) throw fail('This payment reference has already been used.', 409);
      }
      await c.query('INSERT INTO subscription_payment_attempts(intent_id,provider,reference,outcome) VALUES($1,$2,$3,$4)',
        [id,input.provider,reference,'submitted']);
      return (await c.query(`UPDATE subscription_payment_intents SET provider=$2,payment_reference=$3,status='verification_pending',
        version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`, [id,input.provider,reference])).rows[0];
    });
    if (row.status === 'verified' || row.status === 'consumed') return safeIntent(row);
    const check = await lookupVeritas({ ...input, reference }, options);
    const verified = check.available && matchesVerifiedPayment(check.result, row, reference,matchingPolicy);
    const updated = await transaction(pool, async c => {
      // Lock in the same order as renewal and operator reconciliation.
      const daycare = row.daycare_id ? (await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[row.daycare_id])).rows[0] : null;
      const item = (await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!item || item.version !== row.version || item.status !== 'verification_pending') return item;
      if (verified) {
        const receipt=input.provider==='cbe'?cbeReceipt(reference):null;
        await claimReferences(c,item,[reference,receipt?.identifier,receipt?.reference,authoritativeReference(check.result)],'veritas');
      }
      await c.query('INSERT INTO subscription_payment_attempts(intent_id,provider,reference,outcome) VALUES($1,$2,$3,$4)',
        [id,input.provider,reference,verified?'matched':'needs_review']);
      const saved = (await c.query(`UPDATE subscription_payment_intents SET status=$2,verification=$3,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id,verified?'verified':'verification_pending',JSON.stringify({source:'veritas',matching_mode:matchingMode, outcome:verified?'matched':'needs_review', code:verified?'matched':check.available?(matchingMode==='name_amount_test'?'name_amount_mismatch':'mismatch'):check.code, http_status:check.httpStatus, retryable:!!check.retryable})])).rows[0];
      if (verified && daycare) {
        const actor = saved.created_by || (await c.query("SELECT id FROM users WHERE daycare_id=$1 AND role_id=1 AND status='active' ORDER BY id LIMIT 1",[daycare.id])).rows[0]?.id;
        try {
          const renewal = await applyRenewalLocked(c,daycare,saved,actor);
          return {...saved,status:renewal.scheduled||renewal.blocked?'verified':'consumed',renewal_applied:!renewal.scheduled&&!renewal.blocked,scheduled_change:renewal.scheduled_change,subscription_ends_at:renewal.subscription_ends_at,
            message:renewal.scheduled?'Payment verified for the scheduled next period. Current access is unchanged until its effective date.':renewal.message};
        } catch (error) {
          if (error.statusCode !== 409) throw error;
          return {...saved,renewal_applied:false,message:'Payment verified; renewal requires operator attention.'};
        }
      }
      return saved;
    });
    return { ...safeIntent(updated),scheduled_change:updated?.scheduled_change, ...(updated?.renewal_applied === undefined ? {} : {renewal_applied:updated.renewal_applied,subscription_ends_at:updated.subscription_ends_at}),
      message: updated?.message || (updated?.status === 'verified' || updated?.status === 'consumed' ? 'Payment verified.' : messageFor(updated?.verification?.code)) };
  }
  async function list(query = {}) {
    const {limit,offset,search} = validate(Joi.object({
      limit:Joi.number().integer().min(1).max(100).default(25),
      offset:Joi.number().integer().min(0).max(1000000).default(0),
      search:Joi.string().trim().max(150).allow('').default(''),
    }),query);
    const pattern = `%${search.replace(/[\\%_]/g,'\\$&')}%`;
    const filter = `($1='' OR i.email ILIKE $2 ESCAPE '\\' OR COALESCE(i.payment_reference,'') ILIKE $2 ESCAPE '\\' OR i.id::text ILIKE $2 ESCAPE '\\')`;
    const {rows:[count]} = await pool.query(`SELECT COUNT(*)::int AS total FROM subscription_payment_intents i WHERE ${filter}`,[search,pattern]);
    const { rows } = await pool.query(`SELECT i.id,i.email,i.terms,i.status,i.amount,i.currency,i.recipient,i.provider,i.payment_reference,
      i.verification,i.review_reason,i.reviewed_by,i.version,i.created_at,i.updated_at,i.expires_at,i.application_id,i.daycare_id,i.subscription_change_id,i.renewal_period_start,
      (SELECT a.status FROM daycare_applications a WHERE a.id=i.application_id) AS application_status,
      (SELECT json_build_object('outcome',r.outcome,'reason',r.reason,'evidence_reference',r.evidence_reference,
        'recorded_at',r.recorded_at,'actor_id',r.actor_id) FROM subscription_payment_resolutions r WHERE r.intent_id=i.id) AS resolution
      FROM subscription_payment_intents i WHERE ${filter} ORDER BY i.created_at DESC,i.id DESC LIMIT $3 OFFSET $4`,[search,pattern,limit,offset]);
    return {items:rows,total:count.total,limit,offset};
  }
  async function resolve(id, body, actorId) {
    const input=validate(resolutionSchema,body);
    return transaction(pool,async c => {
      // Match approval's lock order: application before intent.
      const initial=(await c.query('SELECT application_id,daycare_id FROM subscription_payment_intents WHERE id=$1',[id])).rows[0];
      if (!initial) throw fail('Payment session not found.',404);
      if(initial.daycare_id)await c.query('SELECT id FROM daycares WHERE id=$1 FOR UPDATE',[initial.daycare_id]);
      let application;
      if (initial.application_id) application=(await c.query('SELECT status FROM daycare_applications WHERE id=$1 FOR UPDATE',[initial.application_id])).rows[0];
      const item=(await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!item || item.application_id !== initial.application_id || item.version !== input.version) throw fail('Payment changed. Refresh before recording its resolution.',409);
      const unappliedRenewal = item.daycare_id && !item.application_id && item.status === 'verified';
      const unappliedApplication = !item.daycare_id && (item.status==='verified' && !item.application_id ||
        item.status==='consumed' && application?.status==='rejected');
      if (!item.payment_reference || !(unappliedRenewal || unappliedApplication)) {
        throw fail('Only an unapplied confirmed payment or rejected application can be resolved.',409);
      }
      const resolution=(await c.query(`INSERT INTO subscription_payment_resolutions(intent_id,outcome,reason,evidence_reference,actor_id)
        VALUES($1,$2,$3,$4,$5) RETURNING outcome,reason,evidence_reference,actor_id,recorded_at`,
      [id,input.outcome,input.reason,input.evidence_reference,actorId])).rows[0];
      await c.query("UPDATE subscription_payment_intents SET status='resolved',version=version+1,updated_at=NOW() WHERE id=$1",[id]);
      if(item.subscription_change_id)await c.query("UPDATE subscription_package_changes SET status='blocked',blocked_reason='Payment was externally resolved. Cancel this change before agreeing new terms.',updated_at=NOW() WHERE id=$1 AND status IN ('awaiting_payment','paid','blocked')",[item.subscription_change_id]);
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata) VALUES($1,'SUBSCRIPTION_PAYMENT_RESOLVED','subscription_payment_intents',$2)`,
        [actorId,JSON.stringify({intent_id:id,outcome:input.outcome,reason:input.reason,evidence_reference:input.evidence_reference})]);
      return {id,status:'resolved',resolution};
    });
  }
  async function review(id, body, actorId) {
    const input = validate(reviewSchema,body);
    return transaction(pool, async c => {
      const initial = (await c.query('SELECT daycare_id FROM subscription_payment_intents WHERE id=$1',[id])).rows[0];
      if (!initial) throw fail('Payment session not found.',404);
      const daycare = initial.daycare_id ? (await c.query('SELECT * FROM daycares WHERE id=$1 FOR UPDATE',[initial.daycare_id])).rows[0] : null;
      const item = (await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!item) throw fail('Payment session not found.', 404);
      if (item.daycare_id !== initial.daycare_id) throw fail('Payment changed in another view. Refresh and review again.',409);
      if (item.version !== input.version) throw fail('Payment changed in another view. Refresh and review again.',409);
      const legacyPending=item.status==='pending'&&!providers.includes(item.terms?.recipient_provider);
      if (!legacyPending && (item.status !== 'verification_pending' || !item.provider || !item.payment_reference)) throw fail('Only a submitted payment can be reviewed.',409);
      const next = input.decision === 'approve' ? 'verified' : 'rejected';
      if(legacyPending&&next==='verified'){
        item.provider=item.provider||'legacy';
        item.payment_reference=canonicalReference(input.verified_reference,item.provider);
      }
      if (next === 'verified') await claimReferences(c,item,[item.payment_reference,input.verified_reference],'manual_review');
      const row = (await c.query(`UPDATE subscription_payment_intents SET status=$2,review_reason=$3,reviewed_by=$4,
        provider=$5,payment_reference=$6,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,next,input.reason,actorId,item.provider,item.payment_reference])).rows[0];
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata) VALUES($1,$2,'subscription_payment_intents',$3)`,
        [actorId,'SUBSCRIPTION_PAYMENT_REVIEWED',JSON.stringify({intent_id:id,decision:input.decision,reason:input.reason,provider:item.provider,payment_reference:item.payment_reference,
          verified_reference:input.verified_reference,evidence_reference:input.evidence_reference,amount_and_receiver_confirmed:input.amount_and_receiver_confirmed})]);
      if (next === 'verified' && daycare) {
        try {
          const renewal = await applyRenewalLocked(c,daycare,row,actorId);
          return {...safeIntent(row),status:renewal.scheduled||renewal.blocked?'verified':'consumed',daycare_id:row.daycare_id,renewal_applied:!renewal.scheduled&&!renewal.blocked,scheduled_change:renewal.scheduled_change,subscription_ends_at:renewal.subscription_ends_at,
            message:renewal.scheduled?'Payment verified for the scheduled next period. Current paid access is unchanged.':renewal.message};
        } catch (error) {
          if (error.statusCode !== 409) throw error;
          return {...safeIntent(row),daycare_id:row.daycare_id,renewal_applied:false,message:'Payment verified; renewal requires operator attention.'};
        }
      }
      return { ...safeIntent(row), daycare_id: row.daycare_id };
    });
  }
  async function recover(id, body, actorId) {
    const input = validate(recoverySchema,body);
    const sendRecovery = getRecoverySender();
    return transaction(pool, async c => {
      const item = (await c.query('SELECT * FROM subscription_payment_intents WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!item) throw fail('Payment session not found.',404);
      if (item.version !== input.version) throw fail('Payment changed in another view. Refresh and review again.',409);
      if (['consumed','rejected','resolved'].includes(item.status)) throw fail('This payment session cannot be recovered.',409);
      const token = crypto.randomBytes(32).toString('base64url');
      await c.query(`UPDATE subscription_payment_intents SET secret_hash=$2,
        expires_at=NOW()+INTERVAL '30 days',version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id,secretHash(token)]);
      await c.query(`INSERT INTO audit_logs(actor_id,action,target_table,metadata) VALUES($1,'SUBSCRIPTION_PAYMENT_RECOVERED','subscription_payment_intents',$2)`,
        [actorId,JSON.stringify({intent_id:id,reason:input.reason})]);
      try { await sendRecovery({email:item.email,id,token,purpose:item.daycare_id?'renewal':'application'}); }
      catch (_) { throw fail('The recovery email could not be sent. Please retry or contact support.',503); }
      return { message:'Recovery link sent to the payment session email address.' };
    });
  }
  return { create, createRenewal, status, resumeRenewal, verify, list, review, recover, resolve, getSettings, updateSettings, publicSettings };
}
module.exports = { createPaymentService, verifySecret, secretHash, matchesVerifiedPayment, lookupVeritas, canonicalReference, telebirrPhone };
