import React from 'react';
import {PackageOffer,Cycle,priceLabel,offerPrice,packageBenefits} from './subscriptions';
import './journey.css';
export default function PackageCards({offers,cycle,onCycle,onChoose,selected,busy=false}:{offers:PackageOffer[];cycle:Cycle;onCycle:(c:Cycle)=>void;onChoose:(p:PackageOffer)=>void;selected?:string;busy?:boolean}){
 return <div className="journey">
  <fieldset className="j-cycle"><legend>Choose a billing period</legend>{(['monthly','six_month','annual'] as Cycle[]).map(c=><label key={c}><input type="radio" name="billing-cycle" checked={cycle===c} onChange={()=>onCycle(c)} disabled={busy}/>{c==='monthly'?'Monthly':c==='six_month'?'6 months':'Annual'}</label>)}</fieldset>
  <div className="j-packages">{offers.map(p=><article className={'j-package '+(selected===p.code?'selected':'')} key={p.code}>
   <h3>{p.name}</h3><p>{p.description}</p>
   <strong className="j-price">{priceLabel(offerPrice(p,cycle),cycle)}</strong>
   <p>Up to <strong>{p.max_children}</strong> active children</p><ul>{packageBenefits(p).map(f=><li key={f}>{f}</li>)}</ul>
   <button type="button" className="saas-btn saas-btn-primary" onClick={()=>onChoose(p)} disabled={busy || offerPrice(p,cycle)==null || Number(offerPrice(p,cycle)) <= 0}>{selected===p.code?'Selected: ': 'Choose '}{p.name}</button>
  </article>)}</div><p className="j-muted">Your paid period starts when your application is approved. You initiate each renewal payment; there are no automatic charges.</p>
 </div>;
}
