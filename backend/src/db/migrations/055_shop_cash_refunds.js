'use strict';
exports.up=async knex=>{
  await knex.raw(`
    ALTER TABLE orders DROP CONSTRAINT chk_orders_pay_status;
    ALTER TABLE orders ADD CONSTRAINT chk_orders_pay_status CHECK(payment_status IN ('unpaid','pending','paid','failed','refunded'));
    CREATE TABLE shop_order_refunds (
      id bigserial PRIMARY KEY,daycare_id integer NOT NULL REFERENCES daycares(id),
      order_id integer NOT NULL UNIQUE,payment_id integer NOT NULL REFERENCES payments(id),
      parent_id integer NOT NULL,actor_id integer NOT NULL,amount numeric(10,2) NOT NULL CHECK(amount>0),
      original_payment_reference text NOT NULL,refund_reference varchar(160) NOT NULL,
      reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 12 AND 1000),
      stock_disposition varchar(30) NOT NULL CHECK(stock_disposition IN ('not_handed_over','returned_to_stock','not_restocked')),
      original_order_status varchar(30) NOT NULL,
      refunded_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      request_key varchar(100) NOT NULL,request_hash varchar(64) NOT NULL,
      UNIQUE(daycare_id,request_key),
      FOREIGN KEY(daycare_id,order_id) REFERENCES orders(daycare_id,id),
      FOREIGN KEY(daycare_id,parent_id) REFERENCES users(daycare_id,id),
      FOREIGN KEY(daycare_id,actor_id) REFERENCES users(daycare_id,id)
    );
    CREATE UNIQUE INDEX shop_refund_evidence_unique ON shop_order_refunds(daycare_id,lower(btrim(refund_reference)));
    CREATE INDEX shop_refund_history ON shop_order_refunds(daycare_id,refunded_at,id);
    ALTER TABLE shop_order_refunds ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shop_order_refunds FORCE ROW LEVEL SECURITY;
    CREATE POLICY refund_tenant_read ON shop_order_refunds FOR SELECT TO ankelba_tenant
      USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    CREATE POLICY refund_tenant_insert ON shop_order_refunds FOR INSERT TO ankelba_tenant
      WITH CHECK(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT,INSERT ON shop_order_refunds TO ankelba_tenant;
    GRANT USAGE,SELECT ON SEQUENCE shop_order_refunds_id_seq TO ankelba_tenant;
    CREATE FUNCTION public.check_shop_refund_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Refund evidence is immutable' USING ERRCODE='23514'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.orders o JOIN public.payments p ON p.order_id=o.id
        JOIN public.users u ON u.id=NEW.actor_id AND u.daycare_id=NEW.daycare_id AND u.role_id=1 AND u.status='active'
        WHERE o.id=NEW.order_id AND o.daycare_id=NEW.daycare_id AND o.parent_id=NEW.parent_id
          AND o.payment_status='paid' AND o.order_status<>'cancelled' AND o.total=NEW.amount
          AND p.id=NEW.payment_id AND p.method='pay_at_daycare' AND p.status='paid' AND p.verified_at IS NOT NULL
          AND p.gateway_ref=NEW.original_payment_reference AND NEW.original_order_status=o.order_status
          AND NEW.refunded_at>=p.verified_at AND NEW.refunded_at<=clock_timestamp()+INTERVAL '5 minutes'
          AND ((o.order_status='collected' AND NEW.stock_disposition<>'not_handed_over') OR
               (o.order_status<>'collected' AND NEW.stock_disposition<>'returned_to_stock')))
      THEN RAISE EXCEPTION 'Refund evidence does not match the original cash payment' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $$;
    REVOKE ALL ON FUNCTION public.check_shop_refund_evidence() FROM PUBLIC;
    CREATE TRIGGER validate_shop_refund BEFORE INSERT OR UPDATE OR DELETE ON shop_order_refunds
      FOR EACH ROW EXECUTE FUNCTION public.check_shop_refund_evidence();
  `);
};
// Retain immutable financial evidence on rollback.
exports.down=async()=>{};
