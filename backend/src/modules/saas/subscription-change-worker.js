'use strict';
const {createSubscriptions}=require('./subscriptions.service');
function createSubscriptionChangeWorker(pool,logger=console,options={}){
  const control=pool.control||pool,service=createSubscriptions(control,options);let busy=false;
  async function run(){if(busy)return {busy:true};busy=true;try{
    const rows=(await control.query("SELECT daycare_id FROM subscription_package_changes WHERE status IN ('paid','blocked') AND effective_at<=$1 ORDER BY effective_at",[options.now?.()||new Date()])).rows;
    let activated=0,blocked=0;for(const row of rows){try{const result=await service.activateDueChange(row.daycare_id);if(result?.blocked)blocked++;else if(result?.scheduled_change?.status==='activated')activated++;}catch(error){logger.error('Scheduled subscription activation failed',{daycare_id:row.daycare_id});}}
    return {examined:rows.length,activated,blocked};
  }finally{busy=false;}}
  return {run};
}
module.exports={createSubscriptionChangeWorker};
