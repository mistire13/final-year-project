'use strict';
exports.up=async knex=>{
  await knex.raw(`
    CREATE TABLE daycare_payment_settings (
      daycare_id integer PRIMARY KEY REFERENCES daycares(id),accounts jsonb NOT NULL DEFAULT '{}',
      version integer NOT NULL DEFAULT 1,updated_by integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW(),
      FOREIGN KEY(daycare_id,updated_by) REFERENCES users(daycare_id,id)
    );
    CREATE TABLE daycare_payment_requests (
      id uuid PRIMARY KEY,daycare_id integer NOT NULL REFERENCES daycares(id),parent_id integer NOT NULL,
      purpose text NOT NULL CHECK(purpose IN ('invoice','order')),invoice_id integer,order_id integer,
      provider text NOT NULL CHECK(provider IN ('cbe','abyssinia','telebirr')),amount numeric(10,2) NOT NULL CHECK(amount>0),currency text NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
      expected jsonb NOT NULL,payer_name text NOT NULL,valid_from timestamptz NOT NULL,expires_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'awaiting_proof' CHECK(status IN ('awaiting_proof','checking','review_pending','verified_unapplied','applied','rejected','expired','resolved')),
      submitted_reference varchar(2048),suffix varchar(8),authoritative_reference varchar(2048),verified_aliases jsonb NOT NULL DEFAULT '[]',
      verification jsonb,verification_source text,verified_at timestamptz,payment_date timestamptz,
      attempt_count integer NOT NULL DEFAULT 0,last_attempt_at timestamptz,lease_until timestamptz,
      version integer NOT NULL DEFAULT 1,request_key varchar(100) NOT NULL,
      review_reason text,review_evidence_reference text,reviewed_by integer,
      applied_payment_id integer,created_at timestamptz NOT NULL DEFAULT NOW(),updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE(daycare_id,id),UNIQUE(daycare_id,parent_id,request_key),
      CHECK((purpose='invoice' AND invoice_id IS NOT NULL AND order_id IS NULL) OR (purpose='order' AND order_id IS NOT NULL AND invoice_id IS NULL)),
      CHECK(expires_at>valid_from),
      FOREIGN KEY(daycare_id,parent_id) REFERENCES users(daycare_id,id),
      FOREIGN KEY(daycare_id,invoice_id) REFERENCES child_invoices(daycare_id,id),
      FOREIGN KEY(daycare_id,order_id) REFERENCES orders(daycare_id,id),
      FOREIGN KEY(daycare_id,reviewed_by) REFERENCES users(daycare_id,id)
    );
    CREATE UNIQUE INDEX daycare_one_open_invoice_payment ON daycare_payment_requests(daycare_id,invoice_id)
      WHERE purpose='invoice' AND status IN ('awaiting_proof','checking');
    CREATE UNIQUE INDEX daycare_one_open_order_payment ON daycare_payment_requests(daycare_id,order_id)
      WHERE purpose='order' AND status IN ('awaiting_proof','checking');
    CREATE INDEX daycare_payment_review ON daycare_payment_requests(daycare_id,status,created_at);
    ALTER TABLE child_payments ADD COLUMN verification_source text NOT NULL DEFAULT 'manual_recorded',
      ADD COLUMN daycare_payment_request_id uuid UNIQUE,
      ADD CONSTRAINT child_payment_request_scope FOREIGN KEY(daycare_id,daycare_payment_request_id) REFERENCES daycare_payment_requests(daycare_id,id);
    ALTER TABLE child_payments ALTER COLUMN reference_code TYPE varchar(2048);
    ALTER TABLE payments ADD COLUMN verification_source text NOT NULL DEFAULT 'manual_recorded',
      ADD COLUMN daycare_payment_request_id uuid UNIQUE REFERENCES daycare_payment_requests(id);
    ALTER TABLE payments DROP CONSTRAINT chk_pay_method;
    ALTER TABLE payments ADD CONSTRAINT chk_pay_method CHECK(method IN ('pay_at_daycare','digital','demo','no_charge','bank_transfer'));
    CREATE TABLE daycare_payment_resolutions (
      id bigserial PRIMARY KEY,daycare_id integer NOT NULL,request_id uuid NOT NULL UNIQUE,actor_id integer NOT NULL,
      outcome text NOT NULL CHECK(outcome IN ('refund_recorded','credit_recorded')),reason text NOT NULL CHECK(length(btrim(reason))>=12),
      evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference))>=4),amount numeric(10,2) NOT NULL CHECK(amount>0),recorded_at timestamptz NOT NULL DEFAULT NOW(),
      FOREIGN KEY(daycare_id,request_id) REFERENCES daycare_payment_requests(daycare_id,id),FOREIGN KEY(daycare_id,actor_id) REFERENCES users(daycare_id,id)
    );
    ALTER TABLE daycare_payment_resolutions ENABLE ROW LEVEL SECURITY;ALTER TABLE daycare_payment_resolutions FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON daycare_payment_resolutions TO ankelba_tenant USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer) WITH CHECK(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT,INSERT ON daycare_payment_resolutions TO ankelba_tenant;GRANT USAGE,SELECT ON SEQUENCE daycare_payment_resolutions_id_seq TO ankelba_tenant;
    CREATE FUNCTION public.protect_daycare_payment_resolution() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN RAISE EXCEPTION 'Payment resolution evidence is immutable' USING ERRCODE='23514'; END $$;
    REVOKE ALL ON FUNCTION public.protect_daycare_payment_resolution() FROM PUBLIC;
    CREATE TRIGGER protect_resolution BEFORE UPDATE OR DELETE ON daycare_payment_resolutions FOR EACH ROW EXECUTE FUNCTION public.protect_daycare_payment_resolution();
    CREATE FUNCTION public.protect_daycare_payment_terms() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN
      IF ROW(NEW.id,NEW.daycare_id,NEW.parent_id,NEW.purpose,NEW.invoice_id,NEW.order_id,NEW.provider,NEW.amount,NEW.currency,NEW.expected,NEW.payer_name,NEW.valid_from,NEW.expires_at,NEW.request_key,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.daycare_id,OLD.parent_id,OLD.purpose,OLD.invoice_id,OLD.order_id,OLD.provider,OLD.amount,OLD.currency,OLD.expected,OLD.payer_name,OLD.valid_from,OLD.expires_at,OLD.request_key,OLD.created_at)
      THEN RAISE EXCEPTION 'Accepted daycare payment terms are immutable' USING ERRCODE='23514'; END IF;
      IF OLD.status='applied' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Applied payment evidence is immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $$;
    REVOKE ALL ON FUNCTION public.protect_daycare_payment_terms() FROM PUBLIC;
    CREATE TRIGGER protect_daycare_payment_terms BEFORE UPDATE ON daycare_payment_requests FOR EACH ROW EXECUTE FUNCTION public.protect_daycare_payment_terms();
    CREATE TABLE payment_reference_claims (
      reference_key text PRIMARY KEY,owner_kind text NOT NULL,owner_id text NOT NULL,provider text NOT NULL,claimed_at timestamptz NOT NULL DEFAULT NOW()
    );
    REVOKE ALL ON payment_reference_claims FROM PUBLIC,ankelba_tenant,ankelba_control;
    CREATE FUNCTION public.protect_global_payment_claim() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN RAISE EXCEPTION 'Confirmed payment reference claims are permanent' USING ERRCODE='23514'; END $$;
    REVOKE ALL ON FUNCTION public.protect_global_payment_claim() FROM PUBLIC;
    CREATE TRIGGER protect_global_claim BEFORE UPDATE OR DELETE ON payment_reference_claims FOR EACH ROW EXECUTE FUNCTION public.protect_global_payment_claim();
    CREATE FUNCTION public.payment_reference_key(reference text,provider text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
      SELECT CASE WHEN reference~*'^https?://' OR provider='cbe' AND reference!~*'^FT[A-Z0-9]+$'
        THEN btrim(reference) ELSE upper(regexp_replace(btrim(reference),'\\s','','g')) END
    $$;
    REVOKE ALL ON FUNCTION public.payment_reference_key(text,text) FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM subscription_payment_references GROUP BY public.payment_reference_key(reference,provider)
        HAVING count(DISTINCT CASE WHEN intent_id IS NOT NULL THEN 'subscription:'||intent_id::text ELSE 'event:'||subscription_event_id::text END)>1)
      THEN RAISE EXCEPTION 'Historical reference claims require reconciliation before shared-ledger migration'; END IF;
    END $$;
    INSERT INTO payment_reference_claims(reference_key,owner_kind,owner_id,provider)
      SELECT DISTINCT ON (public.payment_reference_key(reference,provider)) public.payment_reference_key(reference,provider),
        CASE WHEN intent_id IS NOT NULL THEN 'subscription' ELSE 'subscription_event' END,
        COALESCE(intent_id::text,subscription_event_id::text),COALESCE(provider,'legacy') FROM subscription_payment_references ORDER BY public.payment_reference_key(reference,provider),id;
    CREATE FUNCTION public.claim_subscription_reference_globally() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE owner_type text;owner text;found_kind text;found_owner text;
    BEGIN
      owner_type:=CASE WHEN NEW.intent_id IS NOT NULL THEN 'subscription' ELSE 'subscription_event' END;
      owner:=COALESCE(NEW.intent_id::text,NEW.subscription_event_id::text);
      PERFORM pg_advisory_xact_lock(71956,1);
      SELECT owner_kind,owner_id INTO found_kind,found_owner FROM public.payment_reference_claims c WHERE
        c.reference_key=public.payment_reference_key(NEW.reference,NEW.provider) OR
        (NEW.reference!~*'^https?://' AND c.provider='legacy' AND c.reference_key=upper(regexp_replace(NEW.reference,'\\s','','g'))) OR
        (NEW.provider='legacy' AND NEW.reference!~*'^https?://' AND upper(c.reference_key)=upper(regexp_replace(NEW.reference,'\\s','','g'))) LIMIT 1;
      IF FOUND AND (found_kind IS DISTINCT FROM owner_type OR found_owner IS DISTINCT FROM owner) THEN RAISE EXCEPTION 'Payment reference is already registered' USING ERRCODE='23505'; END IF;
      INSERT INTO public.payment_reference_claims(reference_key,owner_kind,owner_id,provider)
        VALUES(public.payment_reference_key(NEW.reference,NEW.provider),owner_type,owner,COALESCE(NEW.provider,'legacy')) ON CONFLICT DO NOTHING;
      SELECT owner_kind,owner_id INTO found_kind,found_owner FROM public.payment_reference_claims WHERE reference_key=public.payment_reference_key(NEW.reference,NEW.provider);
      IF found_kind IS DISTINCT FROM owner_type OR found_owner IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Payment reference is already registered' USING ERRCODE='23505'; END IF;
      RETURN NEW;
    END $$;
    REVOKE ALL ON FUNCTION public.claim_subscription_reference_globally() FROM PUBLIC;
    CREATE TRIGGER subscription_global_reference_claim BEFORE INSERT ON subscription_payment_references FOR EACH ROW EXECUTE FUNCTION public.claim_subscription_reference_globally();
    CREATE FUNCTION public.daycare_payment_reference_available(request_id uuid,reference text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE tenant integer;r public.daycare_payment_requests%ROWTYPE;claim public.payment_reference_claims%ROWTYPE;
    BEGIN
      tenant:=NULLIF(current_setting('app.daycare_id',true),'')::integer;
      SELECT * INTO r FROM public.daycare_payment_requests WHERE id=request_id AND daycare_id=tenant;
      IF tenant IS NULL OR NOT FOUND THEN RETURN false; END IF;
      SELECT * INTO claim FROM public.payment_reference_claims c WHERE c.reference_key=public.payment_reference_key(reference,r.provider) OR
        (reference!~*'^https?://' AND c.provider='legacy' AND c.reference_key=upper(regexp_replace(reference,'\\s','','g'))) LIMIT 1;
      RETURN NOT FOUND OR claim.owner_kind='daycare' AND claim.owner_id=request_id::text;
    END $$;
    CREATE FUNCTION public.claim_daycare_payment_reference(request_id uuid,reference text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE tenant integer;r public.daycare_payment_requests%ROWTYPE;claim public.payment_reference_claims%ROWTYPE;
    BEGIN
      tenant:=NULLIF(current_setting('app.daycare_id',true),'')::integer;
      SELECT * INTO r FROM public.daycare_payment_requests WHERE id=request_id AND daycare_id=tenant;
      IF NOT FOUND OR r.status NOT IN ('checking','review_pending','verified_unapplied') OR NOT(jsonb_exists(r.verified_aliases,reference)) THEN RETURN false; END IF;
      PERFORM pg_advisory_xact_lock(71956,1);
      SELECT * INTO claim FROM public.payment_reference_claims c WHERE c.reference_key=public.payment_reference_key(reference,r.provider) OR
        (reference!~*'^https?://' AND c.provider='legacy' AND c.reference_key=upper(regexp_replace(reference,'\\s','','g'))) LIMIT 1;
      IF FOUND AND (claim.owner_kind<>'daycare' OR claim.owner_id<>request_id::text) THEN RETURN false; END IF;
      INSERT INTO public.payment_reference_claims(reference_key,owner_kind,owner_id,provider)
        VALUES(public.payment_reference_key(reference,r.provider),'daycare',request_id::text,r.provider) ON CONFLICT DO NOTHING;
      SELECT * INTO claim FROM public.payment_reference_claims WHERE reference_key=public.payment_reference_key(reference,r.provider);
      RETURN claim.owner_kind='daycare' AND claim.owner_id=request_id::text;
    END $$;
    REVOKE ALL ON FUNCTION public.daycare_payment_reference_available(uuid,text),public.claim_daycare_payment_reference(uuid,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.daycare_payment_reference_available(uuid,text),public.claim_daycare_payment_reference(uuid,text) TO ankelba_tenant;
  `);
  for(const table of ['daycare_payment_settings','daycare_payment_requests'])await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON ${table} TO ankelba_tenant USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer) WITH CHECK(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT,INSERT,UPDATE ON ${table} TO ankelba_tenant;`);
  // Legacy manually recorded transfers remain manual; conservatively reserve
  // their known identifiers so they cannot be spent again by the new verifier.
  const historical=[
    ...(await knex('child_payments').select('id','reference_code','payment_method').whereIn('payment_method',['telebirr_transfer','cbe_transfer','digital_gateway','bank_transfer']).whereNotNull('reference_code')).map(row=>({reference:row.reference_code,kind:'legacy_care',owner:String(row.id),provider:row.payment_method==='cbe_transfer'?'cbe':row.payment_method==='telebirr_transfer'?'telebirr':'legacy'})),
    ...(await knex('payments').select('id','gateway_ref','method').where({status:'paid'}).whereIn('method',['digital','bank_transfer']).whereNotNull('gateway_ref')).map(row=>({reference:row.gateway_ref,kind:'legacy_shop',owner:String(row.id),provider:'legacy'})),
  ];
  for(const item of historical){
    const reference=String(item.reference).trim();if(!reference)continue;
    const aliases=[reference];
    try{const url=new URL(reference);if(url.protocol==='https:'&&['mbreciept.cbe.com.et','apps.cbe.com.et'].includes(url.hostname)){
      const token=url.searchParams.getAll('id').length===1?url.searchParams.get('id'):decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)||'');
      if(token){aliases.push(token);const match=/^(FT[A-Za-z0-9]{10})[-&+ ]?(\d{8})$/i.exec(token);if(match)aliases.push(match[1]);}
    }}catch{}
    for(const alias of [...new Set(aliases)]){
      const key=/^https?:/i.test(alias)||(item.provider==='cbe'&&!/^FT[A-Za-z0-9]+$/i.test(alias))?alias:alias.replace(/\s/g,'').toUpperCase();
      const conflicts=(await knex.raw(`SELECT 1 FROM payment_reference_claims WHERE (reference_key=? OR (?='legacy' AND ?!~*'^https{0,1}://' AND upper(reference_key)=upper(regexp_replace(?,'\\s','','g')))) AND (owner_kind<>? OR owner_id<>?) LIMIT 1`,[key,item.provider,alias,alias,item.kind,item.owner])).rows;
      if(conflicts.length)throw Error('Historical daycare transfer references conflict; reconcile independently before shared-ledger migration.');
      await knex.raw('INSERT INTO payment_reference_claims(reference_key,owner_kind,owner_id,provider) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',[key,item.kind,item.owner,item.provider]);
      const claim=await knex('payment_reference_claims').where({reference_key:key}).first();
      if(claim.owner_kind!==item.kind||claim.owner_id!==item.owner)throw Error('Historical daycare transfer references conflict; reconcile independently before shared-ledger migration.');
    }
  }
};
exports.down=async()=>{};
