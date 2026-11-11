'use strict';
// Record actual inventory changes from this point forward, including checkout
// and cancellation transactions. Runtime clients cannot rewrite this evidence.
exports.up=async knex=>{
  await knex.raw(`
    CREATE TABLE shop_stock_movements (
      id bigserial PRIMARY KEY, daycare_id integer NOT NULL REFERENCES daycares(id),
      product_id integer NOT NULL, product_name text NOT NULL,
      before_qty integer NOT NULL, after_qty integer NOT NULL,
      quantity_change integer GENERATED ALWAYS AS (after_qty-before_qty) STORED,
      reason text NOT NULL CHECK(reason IN ('baseline','product_created','stock_change')),
      recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK(before_qty>=0 AND after_qty>=0),
      FOREIGN KEY(daycare_id,product_id) REFERENCES products(daycare_id,id)
    );
    CREATE INDEX shop_stock_history ON shop_stock_movements(daycare_id,recorded_at,id);
    ALTER TABLE shop_stock_movements ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shop_stock_movements FORCE ROW LEVEL SECURITY;
    CREATE POLICY shop_stock_tenant_read ON shop_stock_movements FOR SELECT TO ankelba_tenant
      USING(daycare_id=NULLIF(current_setting('app.daycare_id',true),'')::integer);
    GRANT SELECT ON shop_stock_movements TO ankelba_tenant;
    INSERT INTO shop_stock_movements(daycare_id,product_id,product_name,before_qty,after_qty,reason)
      SELECT daycare_id,id,name,stock_qty,stock_qty,'baseline' FROM products;
    CREATE FUNCTION public.capture_shop_stock() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
      BEGIN
        IF TG_OP='UPDATE' THEN
          IF OLD.stock_qty=NEW.stock_qty THEN RETURN NULL; END IF;
          INSERT INTO public.shop_stock_movements(daycare_id,product_id,product_name,before_qty,after_qty,reason)
            VALUES(NEW.daycare_id,NEW.id,NEW.name,OLD.stock_qty,NEW.stock_qty,'stock_change');
        ELSE
          INSERT INTO public.shop_stock_movements(daycare_id,product_id,product_name,before_qty,after_qty,reason)
            VALUES(NEW.daycare_id,NEW.id,NEW.name,0,NEW.stock_qty,'product_created');
        END IF;
        RETURN NULL;
      END $$;
    REVOKE ALL ON FUNCTION public.capture_shop_stock() FROM PUBLIC;
    CREATE TRIGGER capture_product_stock AFTER INSERT OR UPDATE OF stock_qty ON products
      FOR EACH ROW EXECUTE FUNCTION public.capture_shop_stock();
  `);
};
exports.down=async()=>{};
