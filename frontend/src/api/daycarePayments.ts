import {apiClient} from './client';
import type {DaycareReceivingAccount,DaycareReceiptRequest,ReceiptProvider,ReceiptPurpose} from '../types/daycarePayments';
export const receivingAccounts=async():Promise<DaycareReceivingAccount[]> => (await apiClient.get('/daycare-payments/receiving-accounts')).data.accounts||[];
export const receiptRequests=async(purpose:ReceiptPurpose,targetId:number):Promise<DaycareReceiptRequest[]> => (await apiClient.get('/daycare-payments/requests',{params:{purpose,target_id:targetId}})).data.items||[];
export const createReceiptRequest=async(purpose:ReceiptPurpose,targetId:number,provider:ReceiptProvider,requestKey:string):Promise<DaycareReceiptRequest> => (await apiClient.post('/daycare-payments/requests',{purpose,target_id:targetId,provider,request_key:requestKey})).data;
export const getReceiptRequest=async(id:string):Promise<DaycareReceiptRequest> => (await apiClient.get(`/daycare-payments/requests/${encodeURIComponent(id)}`)).data;
export const verifyDaycareReceipt=async(request:DaycareReceiptRequest,reference:string,suffix:string):Promise<DaycareReceiptRequest> => (await apiClient.post(`/daycare-payments/requests/${encodeURIComponent(request.id)}/verify`,{version:request.version,reference:reference.trim(),...(request.provider==='abyssinia'?{suffix:suffix.trim()}:{})})).data;
