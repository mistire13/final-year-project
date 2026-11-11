'use strict';
const crypto=require('node:crypto');
const Joi=require('joi');
const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const schema=Joi.object({
  version:Joi.number().integer().positive().required(),
  amount:Joi.number().strict().positive().max(99999999.99).precision(2).required(),
  original_payment_reference:Joi.string().trim().max(200).required(),
  refund_reference:Joi.string().trim().min(4).max(160).pattern(/^[A-Za-z0-9][A-Za-z0-9 ._:/-]*$/).required(),
  refunded_at:Joi.string().isoDate().required(),
  stock_disposition:Joi.string().valid('not_handed_over','returned_to_stock','not_restocked').required(),
  reason:Joi.string().trim().min(12).max(1000).required(),
  refund_confirmed:Joi.boolean().valid(true).required(),
  request_key:Joi.string().pattern(/^[A-Za-z0-9_-]{16,100}$/).required(),
});
function cents(value){const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));return match?BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0')):null;}
function publicRefund(row){return Object.fromEntries(['id','amount','original_payment_reference','refund_reference','reason','stock_disposition','original_order_status','refunded_at','recorded_at'].map(key=>[key,row[key]]));}
function createRefundService(pool){
  async function record(orderId,user,body){
    if(user?.role!=='admin'||!Number.isSafeInteger(Number(user.daycare_id))||Number(user.daycare_id)<=0)throw fail('Daycare administrator required.',403);
    if(!/^\d+$/.test(String(orderId))||!Number.isSafeInteger(Number(orderId))||Number(orderId)<=0)throw fail('Order not found.',404);
    const checked=schema.validate(body,{abortEarly:false});if(checked.error)throw fail(checked.error.details.map(d=>d.message).join('. '));
    const input=checked.value;input.refunded_at=new Date(input.refunded_at).toISOString();
    const hash=crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(input).sort().map(key=>[key,input[key]])))).digest('hex');
    const c=await pool.connect();try{
      await c.query('BEGIN');
      if(!(await c.query("SELECT id FROM users WHERE id=$1 AND daycare_id=$2 AND role_id=1 AND status='active' FOR SHARE",[user.id,user.daycare_id])).rows.length)throw fail('Active daycare administrator required.',403);
      const order=(await c.query('SELECT * FROM orders WHERE id=$1 AND daycare_id=$2 FOR UPDATE',[Number(orderId),user.daycare_id])).rows[0];
      if(!order)throw fail('Order not found.',404);
      const previous=(await c.query('SELECT * FROM shop_order_refunds WHERE daycare_id=$1 AND (request_key=$2 OR order_id=$3)',[user.daycare_id,input.request_key,order.id])).rows[0];
      if(previous){if(previous.order_id===order.id&&previous.request_key===input.request_key&&previous.request_hash===hash){await c.query('COMMIT');return {order,refund:publicRefund(previous),replayed:true};}throw fail('A refund or request key is already recorded. Review the existing evidence.',409);}
      if(order.version!==input.version)throw fail('Order changed. Reload before recording a refund.',409);
      if(order.payment_status!=='paid'||order.order_status==='cancelled')throw fail('A full cash return can be recorded only for an open, paid cash order.',409);
      const payment=(await c.query('SELECT * FROM payments WHERE order_id=$1 FOR UPDATE',[order.id])).rows[0];
      if(!payment||payment.method!=='pay_at_daycare'||payment.status!=='paid'||!payment.verified_at||!payment.gateway_ref)throw fail('This order requires independent payment reconciliation; only confirmed daycare cash receipts are supported.',409);
      if(cents(input.amount)===null||cents(input.amount)!==cents(order.total))throw fail('Record the exact full amount returned. Partial refunds are not supported.');
      if(input.original_payment_reference!==payment.gateway_ref)throw fail('The original cash receipt reference does not match.');
      const date=Date.parse(input.refunded_at);if(date<Date.parse(payment.verified_at)||date>Date.now()+300000)throw fail('Cash return time must be after the original payment and cannot be in the future.');
      if((order.order_status==='collected'&&input.stock_disposition==='not_handed_over')||(order.order_status!=='collected'&&input.stock_disposition==='returned_to_stock'))throw fail('Confirm whether goods were collected, returned in saleable condition, or cannot be restocked.');
      const refund=(await c.query(`INSERT INTO shop_order_refunds(daycare_id,order_id,payment_id,parent_id,actor_id,amount,
        original_payment_reference,refund_reference,reason,stock_disposition,original_order_status,refunded_at,request_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [user.daycare_id,order.id,payment.id,order.parent_id,user.id,order.total,payment.gateway_ref,input.refund_reference,input.reason,input.stock_disposition,order.order_status,input.refunded_at,input.request_key,hash])).rows[0];
      if(input.stock_disposition!=='not_restocked'){
        const items=(await c.query('SELECT product_id,SUM(quantity)::int AS quantity FROM order_items WHERE order_id=$1 AND daycare_id=$2 GROUP BY product_id ORDER BY product_id',[order.id,user.daycare_id])).rows;
        for(const item of items){const update=await c.query('UPDATE products SET stock_qty=stock_qty+$1,updated_at=NOW() WHERE id=$2 AND daycare_id=$3',[item.quantity,item.product_id,user.daycare_id]);if(update.rowCount!==1)throw fail('Inventory evidence requires reconciliation before recording this refund.',409);}
      }
      // Preserve the original paid receipt and verified_at. Cash returns are
      // separate financial events, so reports do not erase past collections.
      const updated=(await c.query("UPDATE orders SET payment_status='refunded',order_status='cancelled',updated_at=NOW() WHERE id=$1 AND daycare_id=$2 RETURNING *",[order.id,user.daycare_id])).rows[0];
      await c.query('INSERT INTO audit_logs(daycare_id,actor_id,action,target_table,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',
        [user.daycare_id,user.id,'SHOP_CASH_REFUND_RECORDED','orders',order.id,JSON.stringify({refund_id:refund.id,amount:refund.amount,original_payment_reference:payment.gateway_ref,refund_reference:input.refund_reference,refunded_at:input.refunded_at,reason:input.reason,stock_disposition:input.stock_disposition,money_moved_by_application:false})]);
      await c.query('COMMIT');return {order:updated,refund:publicRefund(refund),replayed:false};
    }catch(error){await c.query('ROLLBACK');if(error.code==='23505')throw fail('This refund reference or request is already recorded.',409);throw error;}finally{c.release();}
  }
  return {record};
}
module.exports={createRefundService};
