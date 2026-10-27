import React, {useState} from "react";
import { Page, Card, Text, Button, Notice } from "../../components/design/System";
import {simulateDemoPayment,getPaymentCapabilities} from "../../api/parentApi";
import {useRemoteResource} from '../../hooks/useRemoteResource';
export function PaymentVerificationScreen({ navigation, route }: any) {
  const [busy,setBusy]=useState(false);
  const [reference,setReference]=useState('');
  const [error,setError]=useState('');
  const capabilities=useRemoteResource('payment-capabilities',getPaymentCapabilities,{demo_enabled:false,online_enabled:false});
  const pay=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try {
      const result=await simulateDemoPayment(Number(route.params?.orderId));
      setReference(result.gateway_ref || (result.method==='no_charge'?'No payment required':''));
    } catch(e:any){setError(e?.response?.data?.message || 'Could not confirm demo payment. Retry to check the same order.');}
    finally{setBusy(false);}
  };
  return <Page title={capabilities.data.demo_enabled?'Demo payment':'Payment options'} back>
    <Card><Text size={23} weight="bold">{reference?'Demo payment succeeded':'Simulate a successful payment'}</Text>
      <Text style={{marginTop:16}}>Order {route.params?.orderRef}</Text>
      <Text style={{marginTop:16}}>{capabilities.data.demo_enabled?'This development demo records a simulated payment. No money is transferred and no card details are needed.':'Settle this order at the daycare office. Demo payments are unavailable in this environment.'}</Text>
      {!!reference && <Text style={{marginTop:16}} weight="bold">Reference: {reference}</Text>}
    </Card>
    {!!error && <Notice tone="error">{error}</Notice>}
    {!!capabilities.error && <Button title="Retry payment options" onPress={capabilities.refresh}/>}
    {!reference && capabilities.data.demo_enabled && <Button title={busy?'Recording demo payment…':'Simulate payment success'} disabled={busy||capabilities.loading} onPress={pay}/>}
    <Button title="View my orders" onPress={()=>navigation.navigate("Orders")}/>
  </Page>;
}
