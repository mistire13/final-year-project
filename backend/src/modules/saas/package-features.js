'use strict';
const FEATURE_POLICY_VERSION=1;
const FEATURE_KEYS=['shop','business_analytics','billing_automation','staff_scheduling'];
function catalogFeatures(code){return Object.fromEntries(FEATURE_KEYS.map(key=>[key,code==='premium']));}
function featureTerms(terms){
  return {feature_policy_version:terms?.feature_policy_version??0,features:terms?.features??catalogFeatures(terms?.code)};
}
function sameFeatureTerms(a,b){return FEATURE_KEYS.every(key=>featureTerms(a).features[key]===featureTerms(b).features[key])&&featureTerms(a).feature_policy_version===featureTerms(b).feature_policy_version;}
function effectiveFeatures(row,now=Date.now()){
  const code=row?.subscription_terms?.code??row?.subscription_plan;
  const end=row?.subscription_ends_at;
  const active=!!row&&row.status==='active'&&!row.deleted_at&&(end?Number.isFinite(Date.parse(end))&&Date.parse(end)>now:!row.subscription_terms);
  const defaults=catalogFeatures(code),accepted=row?.subscription_terms?.features;
  const features=Object.fromEntries(FEATURE_KEYS.map(key=>[key,active&&defaults[key]&&(!accepted||accepted[key]===true)]));
  if(active&&code==='standard'&&Date.parse(row?.legacy_shop_access_until)>now)features.shop=true;
  return {features,active,package_code:code||'standard',package_name:code==='premium'?'Plus':'Standard',expires_at:end||null,feature_policy_version:FEATURE_POLICY_VERSION};
}
async function getDaycareFeatures(client,daycareId){
  if(!Number.isSafeInteger(Number(daycareId))||Number(daycareId)<=0)return effectiveFeatures(null);
  const row=(await client.query('SELECT id,status,deleted_at,subscription_plan,subscription_terms,subscription_ends_at,legacy_shop_access_until FROM daycares WHERE id=$1 FOR SHARE',[daycareId])).rows[0];
  return effectiveFeatures(row);
}
async function requireFeature(client,daycareId,key){
  const result=await getDaycareFeatures(client,daycareId);
  if(!FEATURE_KEYS.includes(key)||!result.features[key])throw Object.assign(new Error('This feature requires an active Plus subscription.'),{statusCode:403,code:'FEATURE_NOT_INCLUDED',feature:key});
  return result;
}
module.exports={FEATURE_POLICY_VERSION,FEATURE_KEYS,catalogFeatures,featureTerms,sameFeatureTerms,effectiveFeatures,getDaycareFeatures,requireFeature};
