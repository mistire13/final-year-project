export type ReceiptProvider='cbe'|'abyssinia'|'telebirr';
export type ReceiptPurpose='invoice'|'order';
export type DaycareReceivingAccount={provider:ReceiptProvider;institution:string;account_holder:string;account_number:string};
export type DaycareReceiptRequest={
  id:string;purpose:ReceiptPurpose;target_id:number;provider:ReceiptProvider;amount:string|number;currency:string;
  status:'awaiting_proof'|'checking'|'review_pending'|'verified_unapplied'|'applied'|'rejected'|'resolved'|'expired';version:number;
  expected:{account_holder:string;account_number:string;institution:string;settings_version:number};
  valid_from:string;expires_at:string;payer_name:string;reference?:string;payment_reference?:string;
  submitted_reference?:string;
  verification_source?:'provider_verified'|'independent_review'|null;verified_at?:string|null;payment_date?:string|null;
  message?:string;verification?:{code?:string;message?:string}|null;
  resolution?:{outcome:string;reason:string;evidence_reference:string;amount:string|number;recorded_at:string};
};
export const receiptStatusLabel=(status:string)=>({awaiting_proof:'Awaiting your receipt',checking:'Checking receipt',review_pending:'Daycare review needed',verified_unapplied:'Transfer verified · allocation needs review',applied:'Payment applied',rejected:'Receipt request closed',resolved:'Independent refund or credit recorded',expired:'Payment window ended'}[status]||'Check payment status');
export const paymentProvenanceLabel=(source?:string)=>source==='provider_verified'?'Bank receipt verified':source==='independent_review'?'Independently confirmed by daycare':source==='cash_confirmed'?'Cash confirmed at daycare':'Manually recorded by daycare';
