import React from 'react';
import {Page,Card,Text,Button,Notice} from '../../components/design/System';

export function HelpSupportScreen({navigation}:any){
  return <Page title="Help & Support" back>
    <Card><Text size={20} weight="bold">Your daycare can help</Text><Text style={{marginTop:12}}>Open Messages and choose the daycare office for account, enrollment, classroom or pickup questions. Choose your assigned caregiver for daily care updates.</Text></Card>
    <Card><Text weight="bold">Pickup contacts</Text><Text style={{marginTop:10}}>Request an additional adult from Authorized Guardians. The office reviews the request before pickup is permitted. Staff check identity at every collection. A pickup contact does not receive app access.</Text></Card>
    <Card><Text weight="bold">Missing reports or incorrect details</Text><Text style={{marginTop:10}}>Refresh the page and confirm the selected child and date. Ask your daycare to check an unsubmitted report or classroom assignment. You can edit care instructions and emergency contacts in your child's profile.</Text></Card>
    <Card><Text weight="bold">Orders & payments</Text><Text style={{marginTop:10}}>Care Fees and Order History show your saved payment status and receipts. Reopen a payment to check its status. If a bank check is delayed or needs review, contact the daycare office and keep your reference. Do not pay again while a payment is being checked.</Text></Card>
    <Notice>Messages are not an emergency contact channel. Use your daycare's direct phone contact for urgent pickup or care concerns.</Notice>
    <Button title="Open daycare contacts" onPress={()=>navigation.navigate('MainTabs',{screen:'Messages',params:{tab:'Messages'}})}/>
  </Page>;
}
