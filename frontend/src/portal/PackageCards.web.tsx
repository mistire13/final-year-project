import React from 'react';
import {PackageOffer,Cycle,priceLabel,coreFeatures} from './subscriptions';
import './journey.css';
export default function PackageCards({offers,cycle,onCycle,onChoose,selected,busy=false}:{offers:PackageOffer[];cycle:Cycle;onCycle:(c:Cycle)=>void;onChoose:(p:PackageOffer)=>void;selected?:string;busy?:boolean}){
 return <div className="journey">
  <fieldset className="j-cycle"><legend>Billing period after your free trial</legend>{(['monthly','annual'] as Cycle[]).map(c=><label key={c}><input type="radio" name="billing-cycle" checked={cycle===c} onChange={()=>onCycle(c)} disabled={busy}/>{c==='monthly'?'Monthly':'Annual'}</label>)}</fieldset>
  <div className="j-packages">{offers.map(p=><article className={'j-package '+(selected===p.code?'selected':'')} key={p.code}>
   <span className="j-tag">{p.trial_days} days free after approval</span><h3>{p.name}</h3><p>{p.description}</p>
   <strong className="j-price">{priceLabel(p[cycle==='annual'?'annual_price':'monthly_price'],cycle)}</strong>
   <p>Up to <strong>{p.max_children}</strong> active children</p><ul>{coreFeatures.map(f=><li key={f}>{f}</li>)}</ul>
   <button className="saas-btn saas-btn-primary" onClick={()=>onChoose(p)} disabled={busy}>{selected===p.code?'Selected: ': 'Choose '}{p.name}</button>
  </article>)}</div><p className="j-muted">Your trial begins after approval. No automatic charges. Both packages include the same core care and safety features; capacity differs. Package prices and terms are shown before you apply.</p>
 </div>;
}
