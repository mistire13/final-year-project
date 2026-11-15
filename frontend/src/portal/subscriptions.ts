export type PackageOffer={code:'standard'|'premium';name:string;description:string;max_children:number;trial_days:number;monthly_price:string|null;six_month_price:string|null;annual_price:string|null;available:boolean;version:number;features?:Record<string,boolean>;feature_policy_version?:number};
export type Cycle='monthly'|'six_month'|'annual';
export const cycleLabel=(cycle:Cycle)=>cycle==='annual'?'year':cycle==='six_month'?'6 months':'month';
export const offerPrice=(offer:PackageOffer,cycle:Cycle)=>offer[cycle==='annual'?'annual_price':cycle==='six_month'?'six_month_price':'monthly_price'];
export const priceLabel=(value:string|number|null|undefined,cycle:Cycle)=>value===null||value===undefined?'Price not configured':`${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})} ETB / ${cycleLabel(cycle)}`;
export const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'medium',timeStyle:'short'}):'Not started';
export const coreFeatures=['Attendance and authorized pickup','Daily reports and health/incident records','Parent messaging, announcements and events','Child/guardian profiles and classroom access','Individual front-desk duties','Manual invoices, payment records and receipts','Basic financial overview and audit history'];

export const plusNavigationFeatures:Record<string,string>={
  'staff-scheduling':'staff_scheduling',
  'billing-automation':'billing_automation',
  store:'shop',
  business:'business_analytics',
};

/** Keep locked tools out of the main navigation while retaining existing order history. */
export function adminNavigationForFeatures<T extends {group:string;items:string[][]}>(groups:T[],features:Record<string,unknown>,preview:boolean):T[]{
  return groups.map(group=>({
    ...group,
    items:group.items.filter(([key])=>!plusNavigationFeatures[key] || preview || features[plusNavigationFeatures[key]]===true)
      .map(([key,title,icon])=>[key,plusNavigationFeatures[key] && !preview ? title.replace(/ · Plus$/, '') : title,icon]),
  })).filter(group=>group.items.length>0);
}

/** Report the known subscription state without treating a blocked legacy trial as expired paid access. */
export function subscriptionDisplayState(daycare:any, now=Date.now()):'trial'|'expired_trial'|'active'|'cancelled'|'expired'|'unavailable'|'unknown'{
  if(!daycare)return 'unknown';
  if(daycare.subscription_status==='trialing'){
    const end=daycare.trial_ends_at ? Date.parse(daycare.trial_ends_at) : NaN;
    return Number.isFinite(end) && end<=now ? 'expired_trial' : 'trial';
  }
  const end=daycare.subscription_ends_at ? Date.parse(daycare.subscription_ends_at) : NaN;
  if(['active','cancelled'].includes(daycare.subscription_status) && Number.isFinite(end) && end<=now)return 'expired';
  if(daycare.subscription_active===true)return daycare.subscription_status==='cancelled' ? 'cancelled' : 'active';
  if(daycare.subscription_active===false)return 'unavailable';
  return 'unknown';
}

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
export const featureKeyLabels:Record<string,string>={
  shop:'Daycare shop, orders and stock control',
  business_analytics:'Comparative business reports and CSV/PDF exports',
  billing_automation:'Scheduled monthly invoices and payment reminders',
  staff_scheduling:'Repeating attendance/pickup shifts, leave and substitutes',
};
export function packageTierSummary(value:any){
  const code=(value?.package_code||value?.subscription_terms?.code||value?.subscription_plan||'standard')==='premium'?'premium':'standard';
  const name=value?.package_name||value?.subscription_terms?.name||(code==='premium'?'Plus':'Standard');
  const maxChildren=typeof value?.max_children==='number'?value.max_children:(code==='premium'?150:50);
  const activeChildren=typeof value?.active_children_count==='number'?value.active_children_count:null;
  const endMs=value?.subscription_ends_at?Date.parse(value.subscription_ends_at):NaN;
  const expired=Number.isFinite(endMs)?endMs<=Date.now():value?.effective_status==='expired';
  const cancelled=value?.effective_status==='cancelled'||value?.subscription_status==='cancelled';
  return {code,name,isPlus:code==='premium',maxChildren,activeChildren,expired,cancelled};
}
