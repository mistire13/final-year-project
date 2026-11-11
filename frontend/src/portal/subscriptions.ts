export type PackageOffer={code:'standard'|'premium';name:string;description:string;max_children:number;trial_days:number;monthly_price:string|null;six_month_price:string|null;annual_price:string|null;available:boolean;version:number;features?:Record<string,boolean>;feature_policy_version?:number};
export type Cycle='monthly'|'six_month'|'annual';
export const cycleLabel=(cycle:Cycle)=>cycle==='annual'?'year':cycle==='six_month'?'6 months':'month';
export const offerPrice=(offer:PackageOffer,cycle:Cycle)=>offer[cycle==='annual'?'annual_price':cycle==='six_month'?'six_month_price':'monthly_price'];
export const priceLabel=(value:string|number|null|undefined,cycle:Cycle)=>value===null||value===undefined?'Price not configured':`${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})} ETB / ${cycleLabel(cycle)}`;
export const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'medium',timeStyle:'short'}):'Not started';
export const coreFeatures=['Attendance and authorized pickup','Daily reports and health/incident records','Parent messaging, announcements and events','Child/guardian profiles and classroom access','Individual front-desk duties','Manual invoices, payment records and receipts','Basic financial overview and audit history'];

export const plusFeatureLabels:Record<string,string>={shop:'Daycare shop, orders and stock control',business_analytics:'Comparative business reports and CSV/PDF exports',billing_automation:'Scheduled monthly invoices and payment reminders',staff_scheduling:'Repeating attendance/pickup shifts, leave and substitutes'};
export const packageBenefits=(offer:PackageOffer)=>[...coreFeatures,...Object.entries(plusFeatureLabels).filter(([key])=>offer.features?.[key]===true).map(([,label])=>label)];
export const packageComparisonRows:{key:string;label:string;feature?:string;capacity?:boolean}[]=[
  {key:'profiles',label:'Child and guardian profiles; classroom/caregiver assignments'},
  {key:'attendance',label:'Attendance and authorized pickup'},
  {key:'care',label:'Daily reports and health/incident records'},
  {key:'communication',label:'Parent messaging, announcements, events and calendar'},
  {key:'duties',label:'Individual attendance and pickup duties'},
  {key:'billing',label:'Manual invoices, payment records and receipts'},
  {key:'receipt_verification',label:'Care-fee bank receipt verification and daycare review'},
  {key:'overview',label:'Basic operational/financial overview and audit history'},
  {key:'capacity',label:'Active child limit',capacity:true},
  {key:'shop',label:'Shop catalogue, categories, stock and new orders',feature:'shop'},
  {key:'inventory',label:'Shop inventory history and sales reporting',feature:'shop'},
  {key:'reports',label:'Comparative business reports, week/month grouping and CSV/PDF',feature:'business_analytics'},
  {key:'automation',label:'Scheduled monthly invoices and payment reminders',feature:'billing_automation'},
  {key:'shifts',label:'Repeating attendance/pickup shifts, weekly calendar, leave and substitutes',feature:'staff_scheduling'},
];
export function packageComparisonValue(offer:PackageOffer,row:typeof packageComparisonRows[number]){
  if(row.capacity)return `${offer.max_children} active children`;
  return !row.feature||offer.features?.[row.feature]===true?'Included':'Not included';
}
