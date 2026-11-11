import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {launchImageLibraryAsync} from 'expo-image-picker';
import {Card,Text,Button,Field,Notice} from '../../components/design/System';
import {receivingAccounts,receiptRequests,createReceiptRequest,getReceiptRequest,verifyDaycareReceipt} from '../../api/daycarePayments';
import {receiptStatusLabel} from '../../types/daycarePayments';
import type {DaycareReceivingAccount,DaycareReceiptRequest,ReceiptProvider,ReceiptPurpose} from '../../types/daycarePayments';
const failure=(error:any)=>error?.response?.data?.error||error?.response?.data?.message||'Could not check this payment. Retry the saved request; do not pay again.';
const requestKey=()=>`receipt_${globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
const amount=(value:string|number)=>`${Number(value).toLocaleString('en-ET',{minimumFractionDigits:2,maximumFractionDigits:2})} ETB`;
const maxScreenshotLength=Math.ceil((4*1024*1024)/3)*4;

export default function ReceiptPaymentCard({purpose,targetId,onApplied}:{purpose:ReceiptPurpose;targetId:number;onApplied?:()=>void}){
  const [accounts,setAccounts]=useState<DaycareReceivingAccount[]>([]),[provider,setProvider]=useState<ReceiptProvider|null>(null);
  const [request,setRequest]=useState<DaycareReceiptRequest|null>(null),[reference,setReference]=useState(''),[suffix,setSuffix]=useState('');
  const [image,setImage]=useState<string|null>(null),[picking,setPicking]=useState(false);
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
  useEffect(()=>{active.current=true;generation.current++;working.current=false;key.current=requestKey();applied.current=null;setRequest(null);setReference('');setSuffix('');setImage(null);setPicking(false);setProvider(null);setAccounts([]);setBusy(false);setNotice('');void load();return()=>{active.current=false;generation.current++;};},[load]);
  const action=async(work:()=>Promise<DaycareReceiptRequest>,fromImage=false)=>{
    if(working.current)return;const current=generation.current;working.current=true;setBusy(true);setError('');setNotice('');
    try{
      const value=await work();
      if(active.current&&generation.current===current){
        if(fromImage){
          setImage(null);
          if(value.submitted_reference)setReference(value.submitted_reference);
        }
        accept(value);
      }
    }
    catch(value){
      if(active.current&&generation.current===current){
        setError(failure(value));
        // A lost HTTP response can still mean the server saved or applied proof.
        try{const saved=request?await getReceiptRequest(request.id):(await receiptRequests(purpose,targetId))[0];if(saved&&active.current&&generation.current===current)accept(saved);}catch{/* Keep the original error and entered proof for another status check. */}
      }
    }
    finally{if(generation.current===current){working.current=false;if(active.current)setBusy(false);}}
  };
  const chooseScreenshot=async()=>{
    if(picking||working.current)return;
    const current=generation.current;
    setPicking(true);
    setError('');
    try{
      const result=await launchImageLibraryAsync({mediaTypes:['images'],base64:true});
      if(!active.current||generation.current!==current||result.canceled)return;
      const photo=result.assets[0]?.base64;
      if(!photo||photo.length>maxScreenshotLength){
        setError('Choose a JPEG or PNG screenshot up to 4 MB.');
        return;
      }
      setImage(photo);
    }catch{
      if(active.current&&generation.current===current)setError('Could not open your screenshots. Try again or enter the receipt details.');
    }finally{
      if(active.current&&generation.current===current)setPicking(false);
    }
  };
  if(loading)return <Card><Text accessibilityRole="header" weight="bold">Bank transfer</Text><Text>Loading receiving details and saved payment status…</Text></Card>;
  if(error&&!request)return <Card><Notice tone="error">{error}</Notice><Button title="Retry payment details" onPress={()=>void load()}/></Card>;
  const closed=['applied','rejected','resolved'].includes(request?.status||'');
  return <Card style={{gap:8}}><Text accessibilityRole="header" size={21} weight="bold">{request?.status==='applied'?'Payment verified':'Pay by bank transfer'}</Text>
    {!request&&<Text>Transfer to your daycare, then submit your receipt.</Text>}
    {!!error&&<Notice tone="error">{error}</Notice>}{!!notice&&request?.status!=='applied'&&<Notice>{notice}</Notice>}
    {!request?<>
      {!accounts.length?<Notice>Your daycare has not enabled receiving accounts. Contact its office for payment instructions.</Notice>:<>
        <Text weight="semibold">Choose a receiving account</Text>
        {accounts.map(account=><Button key={account.provider} title={`${provider===account.provider?'Selected · ':''}${account.institution}`} variant={provider===account.provider?'primary':'outline'} disabled={busy} onPress={()=>setProvider(account.provider)}/>)}
        <Button title={busy?'Opening payment details…':'Show amount and receiving details'} disabled={busy||!provider} onPress={()=>{if(provider)void action(()=>createReceiptRequest(purpose,targetId,provider,key.current));}}/>
      </>}
    </>:<>
      <View style={{gap:6,marginVertical:8}}><Text size={26} weight="bold">{amount(request.amount)}</Text><Text weight="semibold">{request.expected.institution}</Text><Text>Account holder: {request.expected.account_holder}</Text><Text selectable>Account: {request.expected.account_number}</Text><Text>{receiptStatusLabel(request.status)}</Text></View>
      {request.status==='expired'&&<Notice>The payment window ended. If you already transferred, submit the original receipt for daycare review. Contact your daycare before making a new transfer.</Notice>}
      {!closed&&<>
        <Notice>Already paid? Submit your receipt or refresh its status. Do not pay again.</Notice>
        {!['verified_unapplied','checking'].includes(request.status)&&<>
          {image ? (
            <>
              <Text weight="semibold">Screenshot selected</Text>
              <Button title="Use receipt details instead" variant="outline" disabled={busy||picking} onPress={()=>setImage(null)}/>
            </>
          ) : (
            <Field label={request.provider==='cbe'?'Complete CBE receipt link':'Transaction reference'} value={reference} onChangeText={setReference} autoCapitalize="none" autoCorrect={false} editable={!busy&&!picking}/>
          )}
          {request.provider==='abyssinia'&&<Field label={image?'Five-digit receipt suffix (if shown)':'Five-digit receipt account suffix'} value={suffix} onChangeText={setSuffix} keyboardType="number-pad" maxLength={5} editable={!busy&&!picking}/>}
          <Button title={image?'Choose another screenshot':'Choose receipt screenshot'} variant="outline" disabled={busy||picking} onPress={()=>void chooseScreenshot()}/>
          {image&&<Text size={13}>Your screenshot will be sent to Veritas for verification.</Text>}
          <Button title={busy?'Checking payment…':'Check this receipt'} disabled={busy||picking||(!image&&!reference.trim())||(request.provider==='abyssinia'&&(!image||!!suffix)&&!/^\d{5}$/.test(suffix))} onPress={()=>void action(()=>verifyDaycareReceipt(request,reference,suffix,image??undefined),!!image)}/>
        </>}
        <Button title="Refresh saved payment status" variant="outline" disabled={busy} onPress={()=>void action(()=>getReceiptRequest(request.id))}/>
      </>}
      {request.status==='applied'&&<Notice tone="success">Your {purpose==='invoice'?'bill':'order'} is paid. View your receipt in your history.</Notice>}
      {request.status==='verified_unapplied'&&<Notice>The transfer was verified, but this bill or order changed. Contact your daycare to allocate it; do not pay again.</Notice>}
      {request.status==='rejected'&&<Notice>This request is closed. Contact your daycare if money was transferred.</Notice>}
      {request.status==='resolved'&&<Notice>Your daycare recorded an independent refund or credit. {request.resolution?.evidence_reference&&`Evidence: ${request.resolution.evidence_reference}. `}Ankelba did not transfer money. Confirm the result with your daycare before making another payment.</Notice>}
    </>}
  </Card>;
}
