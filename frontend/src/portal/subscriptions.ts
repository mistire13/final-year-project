export type PackageOffer={code:'standard'|'premium';name:string;description:string;max_children:number;trial_days:number;monthly_price:string|null;annual_price:string|null;available:boolean;version:number};
export type Cycle='monthly'|'annual';
export const priceLabel=(value:string|number|null|undefined,cycle:Cycle)=>value===null||value===undefined?'Renewal price not configured':`${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})} ETB / ${cycle==='annual'?'year':'month'}`;
export const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'medium',timeStyle:'short'}):'Not started';
export const coreFeatures=['Attendance and verified pickup','Daily care reports and health observations','Parent messaging and announcements','Classrooms, staff duties and family access','Events, daycare store and audit history'];
