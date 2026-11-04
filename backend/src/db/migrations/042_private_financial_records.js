'use strict';

exports.up = async knex => {
  // The platform authentication login must not bypass tenant privacy for invoices.
  await knex.raw(`REVOKE ALL ON child_invoices, child_payments FROM ankelba_control;
    REVOKE ALL ON SEQUENCE child_invoices_id_seq, child_payments_id_seq FROM ankelba_control;
    DROP POLICY IF EXISTS control_scope ON child_invoices;
    DROP POLICY IF EXISTS control_scope ON child_payments;
    ALTER TABLE child_invoices ADD CONSTRAINT invoice_child_scope FOREIGN KEY(daycare_id,child_id)
      REFERENCES children(daycare_id,id) NOT VALID;
    ALTER TABLE child_invoices ADD CONSTRAINT invoice_parent_scope FOREIGN KEY(daycare_id,parent_id)
      REFERENCES users(daycare_id,id) NOT VALID;
    ALTER TABLE child_invoices ADD CONSTRAINT invoice_scope_identity UNIQUE(daycare_id,id);
    ALTER TABLE child_payments ADD CONSTRAINT payment_invoice_scope FOREIGN KEY(daycare_id,invoice_id)
      REFERENCES child_invoices(daycare_id,id) NOT VALID;
    ALTER TABLE child_payments ADD CONSTRAINT payment_actor_scope FOREIGN KEY(daycare_id,recorded_by)
      REFERENCES users(daycare_id,id) NOT VALID;`);
};
// Do not restore excessive access on rollback.
exports.down = async () => {};
