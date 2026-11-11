import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {Card,Text,Button,Field,Notice} from '../../components/design/System';
import {receivingAccounts,receiptRequests,createReceiptRequest,getReceiptRequest,verifyDaycareReceipt} from '../../api/daycarePayments';
import {receiptStatusLabel} from '../../types/daycarePayments';
import type {DaycareReceivingAccount,DaycareReceiptRequest,ReceiptProvider,ReceiptPurpose} from '../../types/daycarePayments';
const failure=(error:any)=>error?.response?.data?.error||error?.response?.data?.message||'Could not check this payment. Retry the saved request; do not pay again.';
const requestKey=()=>`receipt_${globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
const amount=(value:string|number)=>`${Number(value).toLocaleString('en-ET',{minimumFractionDigits:2,maximumFractionDigits:2})} ETB`;

export default function ReceiptPaymentCard({purpose,targetId,onApplied}:{purpose:ReceiptPurpose;targetId:number;onApplied?:()=>void}){
  const [accounts,setAccounts]=useState<DaycareReceivingAccount[]>([]),[provider,setProvider]=useState<ReceiptProvider|null>(null);
  const [request,setRequest]=useState<DaycareReceiptRequest|null>(null),[reference,setReference]=useState(''),[suffix,setSuffix]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const active=useRef(true),generation=useRef(0),working=useRef(false),key=useRef(requestKey()),applied=useRef<string|null>(null),onAppliedRef=useRef(onApplied);
  onAppliedRef.current=onApplied;
  const accept=useCallback((value:DaycareReceiptRequest)=>{
    if(!active.current)return;setRequest(value);setProvider(value.provider);setNotice(value.message||value.verification?.message||'');
    if(value.status==='applied'&&applied.current!==value.id){applied.current=value.id;onAppliedRef.current?.();}
  },[]);
  const load=useCallback(async()=>{
    const current=generation.current;
    setLoading(true);setError('');
    try{
      // Recover saved proof even when the daycare has disabled its current accounts.
      const saved=await receiptRequests(purpose,targetId);if(!active.current||generation.current!==current)return;
      const existing=saved.find(value=>!['rejected','expired','resolved'].includes(value.status))||saved[0];
      if(existing){accept(existing);setReference(existing.submitted_reference||existing.payment_reference||existing.reference||'');}
      else{const options=await receivingAccounts();if(!active.current||generation.current!==current)return;setAccounts(options);setProvider(options[0]?.provider||null);}
    }
    catch(value){if(active.current&&generation.current===current)setError(failure(value));}finally{if(active.current&&generation.current===current)setLoading(false);}
  },[purpose,targetId,accept]);
  useEffect(()=>{active.current=true;generation.current++;working.current=false;key.current=requestKey();applied.current=null;setRequest(null);setReference('');setSuffix('');setProvider(null);setAccounts([]);setBusy(false);setNotice('');void load();return()=>{active.current=false;generation.current++;};},[load]);
  const action=async(work:()=>Promise<DaycareReceiptRequest>)=>{
    if(working.current)return;const current=generation.current;working.current=true;setBusy(true);setError('');setNotice('');
    try{const value=await work();if(active.current&&generation.current===current)accept(value);}
    catch(value){
      if(active.current&&generation.current===current){
        setError(failure(value));
        // A lost HTTP response can still mean the server saved or applied proof.
        try{const saved=request?await getReceiptRequest(request.id):(await receiptRequests(purpose,targetId))[0];if(saved&&active.current&&generation.current===current)accept(saved);}catch{/* Keep the original error and entered proof for another status check. */}
      }
    }
    finally{if(generation.current===current){working.current=false;if(active.current)setBusy(false);}}
  };
  if(loading)return <Card><Text accessibilityRole="header" weight="bold">Bank transfer</Text><Text>Loading receiving details and saved payment status…</Text></Card>;
  if(error&&!request)return <Card><Notice tone="error">{error}</Notice><Button title="Retry payment details" onPress={()=>void load()}/></Card>;
  const closed=['applied','rejected','resolved'].includes(request?.status||'');
  return <Card><Text accessibilityRole="header" size={21} weight="bold">Pay by bank transfer</Text>
    <Text>Transfer directly to your daycare, then submit the receipt. Opening these details does not move money. Bank service interruptions can require daycare review.</Text>
    {!!error&&<Notice tone="error">{error}</Notice>}{!!notice&&<Notice>{notice}</Notice>}
    {!request?<>
      {!accounts.length?<Notice>Your daycare has not enabled receiving accounts. Contact its office for payment instructions.</Notice>:<>
        <Text weight="semibold">Choose a receiving account</Text>
        {accounts.map(account=><Button key={account.provider} title={`${provider===account.provider?'Selected · ':''}${account.institution}`} variant={provider===account.provider?'primary':'outline'} disabled={busy} onPress={()=>setProvider(account.provider)}/>)}
        <Button title={busy?'Opening payment details…':'Show amount and receiving details'} disabled={busy||!provider} onPress={()=>{if(provider)void action(()=>createReceiptRequest(purpose,targetId,provider,key.current));}}/>
      </>}
    </>:<>
      <View style={{gap:6,marginVertical:16}}><Text size={26} weight="bold">{amount(request.amount)}</Text><Text weight="semibold">{request.expected.institution}</Text><Text>Account holder: {request.expected.account_holder}</Text><Text selectable>Account: {request.expected.account_number}</Text><Text>Payment status: {receiptStatusLabel(request.status)}</Text><Text>Expected payer: {request.payer_name}. Payments from another person may need daycare review.</Text></View>
      {request.status==='expired'&&<Notice>The payment window ended. If you already transferred, submit the original receipt for daycare review. Contact your daycare before making a new transfer.</Notice>}
      {!closed&&<>
        <Notice>If you already transferred, submit that receipt or refresh its status. Do not make another transfer because checking is delayed.</Notice>
        {!['verified_unapplied','checking'].includes(request.status)&&<>
          <Field label={request.provider==='cbe'?'Complete CBE receipt link':'Transaction reference'} placeholder={request.provider==='cbe'?'Paste the HTTPS CBE receipt link':'Enter the transaction reference'} value={reference} onChangeText={setReference} autoCapitalize="none" autoCorrect={false} editable={!busy}/>
          {request.provider==='abyssinia'&&<Field label="Five-digit receipt account suffix" value={suffix} onChangeText={setSuffix} keyboardType="number-pad" maxLength={5} editable={!busy}/>}
          <Button title={busy?'Checking payment…':'Check this receipt'} disabled={busy||!reference.trim()||(request.provider==='abyssinia'&&!/^\d{5}$/.test(suffix))} onPress={()=>void action(()=>verifyDaycareReceipt(request,reference,suffix))}/>
        </>}
        <Button title="Refresh saved payment status" variant="outline" disabled={busy} onPress={()=>void action(()=>getReceiptRequest(request.id))}/>
      </>}
      {request.status==='applied'&&<Notice>Payment applied to this {purpose==='invoice'?'bill':'order'}. Your daycare receipt and updated balance are available in your records.</Notice>}
      {request.status==='verified_unapplied'&&<Notice>The transfer was verified, but this bill or order changed. Contact your daycare to allocate it; do not pay again.</Notice>}
      {request.status==='rejected'&&<Notice>This request is closed. Contact your daycare if money was transferred.</Notice>}
      {request.status==='resolved'&&<Notice>Your daycare recorded an independent refund or credit. {request.resolution?.evidence_reference&&`Evidence: ${request.resolution.evidence_reference}. `}Ankelba did not transfer money. Confirm the result with your daycare before making another payment.</Notice>}
    </>}
  </Card>;
}
