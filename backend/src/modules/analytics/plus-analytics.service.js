'use strict';
const fail=(message,statusCode=422)=>Object.assign(new Error(message),{statusCode});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const shift=(value,days)=>new Date(Date.parse(value+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
function range(query={},current=today()){
  if(Object.keys(query).some(key=>!['from','to','group_id','attendance_grouping'].includes(key)))throw fail('Unknown report filter.');
  const to=query.to??current,from=query.from??current.slice(0,8)+'01';
  if(!dateValid(from)||!dateValid(to)||from>to||to>current)throw fail('Choose valid report dates ending no later than today.');
  const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  if(days>366)throw fail('Choose a report period of 366 days or fewer.');
  if(query.group_id!=null&&!['string','number'].includes(typeof query.group_id))throw fail('Choose a valid classroom.');
  const group=query.group_id==null||query.group_id===''?null:Number(query.group_id);
  if(group!==null&&(!/^\d+$/.test(String(query.group_id))||!Number.isSafeInteger(group)||group<=0))throw fail('Choose a valid classroom.');
  const grouping=query.attendance_grouping??'day';
  if(!['day','week','month'].includes(grouping))throw fail('Choose day, week or month attendance grouping.');
  return {from,to,days,group_id:group,attendance_grouping:grouping,previous:{from:shift(from,-days),to:shift(from,-1)}};
}
function groupAttendance(daily,grouping='day'){
  const rows=[];
  for(const day of daily){
    const anchor=grouping==='week'?shift(day.date,-((new Date(day.date+'T00:00:00Z').getUTCDay()+6)%7)):grouping==='month'?day.date.slice(0,7)+'-01':day.date;
    let row=rows.at(-1);
    if(!row||row.anchor!==anchor){row={anchor,from:day.date,to:day.date,present:0,absent:0};rows.push(row);}
    row.to=day.date;row.present+=day.present;row.absent+=day.absent;
  }
  return rows.map(({anchor,...row})=>({...row,recorded_child_days:row.present+row.absent,present_percent:row.present+row.absent?Math.round(row.present*10000/(row.present+row.absent))/100:null}));
}
function cents(value){const text=String(value??'0');if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw Error('Invalid report amount');const negative=text.startsWith('-');const [whole,fraction='']=text.replace(/^-/,'').split('.');return (negative?-1n:1n)*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));}
const money=value=>{const n=typeof value==='bigint'?value:cents(value);return (n<0n?'-':'')+(n<0n?-n:n)/100n+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');};
function change(current,previous,moneyValue=false){
  if(moneyValue){const a=cents(current),b=cents(previous);return {difference:money(a-b),percent:b===0n?(a===0n?0:null):Number((a-b)*10000n/b)/100};}
  return {difference:current-previous,percent:previous===0?(current===0?0:null):Math.round((current-previous)*10000/previous)/100};
}
const bound=(column,start=2,end=3)=>`${column}>=($${start}::date::timestamp AT TIME ZONE 'Africa/Addis_Ababa') AND ${column}<(($${end}::date+1)::timestamp AT TIME ZONE 'Africa/Addis_Ababa')`;
function actor(user){if(user?.role!=='admin'||!Number.isSafeInteger(Number(user.daycare_id))||Number(user.daycare_id)<=0||!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)throw fail('Daycare administrator access required.',403);return {id:Number(user.id),daycareId:Number(user.daycare_id)};}

function createAnalyticsService(pool,options={}){
  const policy=()=>options.featurePolicy??require('../saas/package-features');
  async function period(client,id,from,to,groupId,includeShop,grouping){
    const params=[id,from,to,groupId];
    const childDays=`SELECT a.child_id,(a.event_time AT TIME ZONE 'Africa/Addis_Ababa')::date AS day,
      c.group_id,COALESCE(g.name,'Unassigned') AS classroom,
      bool_or(a.event_type IN ('checkin','checkout')) AS present,bool_or(a.event_type='absent') AS absent
      FROM attendance a JOIN children c ON c.id=a.child_id AND c.daycare_id=a.daycare_id
      LEFT JOIN groups g ON g.id=c.group_id AND g.daycare_id=c.daycare_id
      WHERE a.daycare_id=$1 AND ${bound('a.event_time')} AND ($4::integer IS NULL OR c.group_id=$4)
      GROUP BY a.child_id,day,c.group_id,g.name`;
    const daily=(await client.query(`WITH child_days AS (${childDays})
      SELECT day::text AS date,count(*) FILTER(WHERE present)::integer AS present,
        count(*) FILTER(WHERE absent AND NOT present)::integer AS absent
      FROM child_days GROUP BY day ORDER BY day`,params)).rows;
    const classrooms=(await client.query(`WITH child_days AS (${childDays})
      SELECT group_id,classroom,count(*) FILTER(WHERE present)::integer AS present,
        count(*) FILTER(WHERE absent AND NOT present)::integer AS absent
      FROM child_days GROUP BY group_id,classroom ORDER BY classroom`,params)).rows;
    const invoices=(await client.query(`SELECT count(*)::integer AS invoice_count,
      COALESCE(sum(i.amount),0)::text AS billed,
      COALESCE(sum(GREATEST(i.amount-i.amount_paid,0)),0)::text AS outstanding_now,
      COALESCE(sum(GREATEST(i.amount-i.amount_paid,0)) FILTER(WHERE i.due_date<(clock_timestamp() AT TIME ZONE 'Africa/Addis_Ababa')::date),0)::text AS overdue_now
      FROM child_invoices i JOIN children c ON c.id=i.child_id AND c.daycare_id=i.daycare_id
      WHERE i.daycare_id=$1 AND i.status<>'cancelled' AND ${bound('i.created_at')}
        AND ($4::integer IS NULL OR c.group_id=$4)`,params)).rows[0];
    const payments=(await client.query(`SELECT COALESCE(sum(p.amount_paid),0)::text AS collected
      FROM child_payments p JOIN child_invoices i ON i.id=p.invoice_id AND i.daycare_id=p.daycare_id
      JOIN children c ON c.id=i.child_id AND c.daycare_id=i.daycare_id
      WHERE p.daycare_id=$1 AND i.status<>'cancelled' AND ${bound('p.verified_at')}
        AND ($4::integer IS NULL OR c.group_id=$4)`,params)).rows[0];
    let placed={orders_placed:0,paid_orders_placed:0,unpaid_orders:0,placed_total:'0.00'},sales={paid_orders:0,collected:'0.00'},refunds={amount:'0.00'};
    if(includeShop){
      placed=(await client.query(`SELECT count(*)::integer AS orders_placed,
        count(*) FILTER(WHERE payment_status='paid')::integer AS paid_orders_placed,
        count(*) FILTER(WHERE payment_status<>'paid')::integer AS unpaid_orders,COALESCE(sum(total),0)::text AS placed_total
        FROM orders WHERE daycare_id=$1 AND order_status<>'cancelled' AND ${bound('created_at')}`,params.slice(0,3))).rows[0];
      sales=(await client.query(`SELECT count(*)::integer AS paid_orders,COALESCE(sum(o.total),0)::text AS collected
        FROM orders o JOIN payments p ON p.order_id=o.id
        WHERE o.daycare_id=$1 AND (o.order_status<>'cancelled' OR o.payment_status='refunded') AND o.payment_status IN ('paid','refunded') AND p.status='paid'
          AND p.method<>'demo' AND ${bound('p.verified_at')}`,params.slice(0,3))).rows[0];
      refunds=(await client.query(`SELECT COALESCE(sum(amount),0)::text AS amount FROM shop_order_refunds WHERE daycare_id=$1 AND ${bound('refunded_at')}`,params.slice(0,3))).rows[0];
    }
    const filled=[];for(let date=from;date<=to;date=shift(date,1)){filled.push(daily.find(row=>row.date===date)??{date,present:0,absent:0});}
    const totals=filled.reduce((sum,row)=>({present:sum.present+row.present,absent:sum.absent+row.absent}),{present:0,absent:0});
    return {from,to,attendance:{...totals,recorded_child_days:totals.present+totals.absent,present_percent:totals.present+totals.absent?Math.round(totals.present*10000/(totals.present+totals.absent))/100:null,daily:filled,grouped:groupAttendance(filled,grouping),classrooms},
      care_fees:{invoice_count:invoices.invoice_count,billed:money(invoices.billed),collected:money(payments.collected),outstanding_now:money(invoices.outstanding_now),overdue_now:money(invoices.overdue_now)},
      shop:{enabled:includeShop,orders_placed:placed.orders_placed,paid_orders_placed:placed.paid_orders_placed,unpaid_orders:placed.unpaid_orders,placed_total:money(placed.placed_total),paid_orders:sales.paid_orders,gross_collected:money(sales.collected),refunds:money(refunds.amount),collected:money(cents(sales.collected)-cents(refunds.amount))}};
  }
  async function report(user,query={}){
    const identity=actor(user),filters=range(query,options.today?.()??today());
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const found=(await client.query(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
        WHERE u.id=$1 AND u.daycare_id=$2 AND u.status='active' AND r.name='admin'`,[identity.id,identity.daycareId])).rows[0];
      if(!found)throw fail('Daycare administrator access required.',403);
      const access=await policy().requireFeature(client,identity.daycareId,'business_analytics');
      const daycare=(await client.query('SELECT id,name,max_children FROM daycares WHERE id=$1 AND deleted_at IS NULL',[identity.daycareId])).rows[0];
      if(!daycare)throw fail('Daycare not found.',404);
      const groups=(await client.query('SELECT id,name FROM groups WHERE daycare_id=$1 ORDER BY name',[identity.daycareId])).rows;
      if(filters.group_id!==null&&!groups.some(group=>Number(group.id)===filters.group_id))throw fail('Classroom not found.',404);
      const current=await period(client,identity.daycareId,filters.from,filters.to,filters.group_id,!!access.features.shop,filters.attendance_grouping);
      const previous=await period(client,identity.daycareId,filters.previous.from,filters.previous.to,filters.group_id,!!access.features.shop,filters.attendance_grouping);
      const capacity=(await client.query("SELECT count(*)::integer AS active_children FROM children WHERE daycare_id=$1 AND enrollment_status='active'",[identity.daycareId])).rows[0];
      const coverage=(await client.query('SELECT min(observed_at) AS coverage_started_at FROM daycare_occupancy_observations WHERE daycare_id=$1',[identity.daycareId])).rows[0];
      const observations=(await client.query(`SELECT observed_at,active_children,capacity,reason FROM daycare_occupancy_observations
        WHERE daycare_id=$1 AND ${bound('observed_at')} ORDER BY observed_at,id LIMIT 1001`,[identity.daycareId,filters.from,filters.to])).rows;
      let bestSellers=[],lowStock=[],stockMovements=[];
      if(access.features.shop){
        bestSellers=(await client.query(`SELECT i.product_id,p.name,sum(i.quantity)::integer AS units,COALESCE(sum(i.quantity*i.unit_price),0)::text AS collected
          FROM order_items i JOIN orders o ON o.id=i.order_id AND o.daycare_id=i.daycare_id
          JOIN payments pay ON pay.order_id=o.id
          JOIN products p ON p.id=i.product_id AND p.daycare_id=o.daycare_id
          WHERE o.daycare_id=$1 AND o.order_status<>'cancelled' AND o.payment_status='paid' AND pay.status='paid'
            AND pay.method<>'demo' AND ${bound('pay.verified_at')}
          GROUP BY i.product_id,p.name ORDER BY units DESC,i.product_id LIMIT 15`,[identity.daycareId,filters.from,filters.to])).rows.map(row=>({...row,collected:money(row.collected)}));
        lowStock=(await client.query('SELECT id,name,stock_qty FROM products WHERE daycare_id=$1 AND available AND stock_qty<=5 ORDER BY stock_qty,name LIMIT 100',[identity.daycareId])).rows;
        stockMovements=(await client.query(`SELECT id,product_id,product_name,before_qty,after_qty,quantity_change,reason,recorded_at
          FROM shop_stock_movements WHERE daycare_id=$1 AND ${bound('recorded_at')}
          ORDER BY recorded_at,id LIMIT 1001`,[identity.daycareId,filters.from,filters.to])).rows;
      }
      await client.query('COMMIT');
      return {generated_at:new Date().toISOString(),timezone:'Africa/Addis_Ababa',daycare:{id:daycare.id,name:daycare.name},filters,groups,current,previous,
        comparisons:{attendance:change(current.attendance.present,previous.attendance.present),care_collected:change(current.care_fees.collected,previous.care_fees.collected,true),care_billed:change(current.care_fees.billed,previous.care_fees.billed,true),shop_collected:change(current.shop.collected,previous.shop.collected,true)},
        occupancy:{current_active_children:capacity.active_children,current_capacity:daycare.max_children,current_utilization_percent:daycare.max_children?Math.round(capacity.active_children*10000/daycare.max_children)/100:null,
          coverage_started_at:coverage.coverage_started_at,observations:observations.slice(0,1000),truncated:observations.length>1000},best_sellers:bestSellers,low_stock:lowStock,
        stock_movements:stockMovements.slice(0,1000),stock_movements_truncated:stockMovements.length>1000,
        notes:['Attendance percentages include recorded present/absent child-days only; unmarked days are not inferred absent. Weeks run Monday–Sunday and months use calendar boundaries in Addis Ababa; edge buckets cover only dates within each report period.','Classroom filters use current child assignments. Shop totals and occupancy cover the whole daycare.','Collections use payment-record dates; invoices use issue dates. Outstanding/overdue balances are current balances on that invoice cohort.','Shop net collections equal gross verified payment events minus recorded cash returns dated by the attested return time. Refund records do not transfer money. Fully refunded orders are excluded from best sellers.','Occupancy observations start at the recorded coverage date. No earlier occupancy is inferred. Demo shop payments are excluded.']};
    }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
  }
  return {report};
}
function csvCell(value){const text=String(value??'');const safe=/^[\s]*[=+\-@]/.test(text)&&!/^[-+]?\d+(?:\.\d+)?$/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';}
function csv(report){
  const rows=[['Ankelba Plus management report',report.daycare.name],['Period',report.filters.from,report.filters.to],['Timezone',report.timezone],[],['Measure','Current period','Previous equal-length period']];
  for(const [label,key]of [['Fees billed','billed'],['Fees collected','collected'],['Outstanding now (invoice cohort)','outstanding_now'],['Overdue now (invoice cohort)','overdue_now']])rows.push([label,report.current.care_fees[key],report.previous.care_fees[key]]);
  rows.push(['Shop gross collections',report.current.shop.gross_collected??report.current.shop.collected,report.previous.shop.gross_collected??report.previous.shop.collected],['Recorded cash returns (no app transfer)',report.current.shop.refunds??'0.00',report.previous.shop.refunds??'0.00'],['Shop net collections',report.current.shop.collected,report.previous.shop.collected]);
  rows.push(['Orders placed',report.current.shop.orders_placed,report.previous.shop.orders_placed],['Placed orders marked paid now',report.current.shop.paid_orders_placed,report.previous.shop.paid_orders_placed],['Placed orders unpaid now',report.current.shop.unpaid_orders,report.previous.shop.unpaid_orders]);
  rows.push([],['Attendance grouping',report.filters.attendance_grouping??'day'],['Period','From','Through','Present child-days','Absent child-days','Recorded child-days','Present percent']);
  for(const [name,period]of [['Selected',report.current],['Previous',report.previous]])for(const row of period.attendance.grouped??groupAttendance(period.attendance.daily))rows.push([name,row.from,row.to,row.present,row.absent,row.recorded_child_days,row.present_percent]);
  rows.push([],['Classroom (current assignment)','Present child-days','Absent child-days']);
  for(const row of report.current.attendance.classrooms)rows.push([row.classroom,row.present,row.absent]);
  rows.push([],['Current active children',report.occupancy.current_active_children],['Current capacity',report.occupancy.current_capacity],['Occupancy coverage starts',report.occupancy.coverage_started_at],[],['Observation time','Active children','Capacity','Reason']);
  for(const row of report.occupancy.observations)rows.push([row.observed_at,row.active_children,row.capacity,row.reason]);
  rows.push([],['Best-selling paid products','Units','Collected']);for(const row of report.best_sellers)rows.push([row.name,row.units,row.collected]);
  rows.push([],['Current low-stock product','Units']);for(const row of report.low_stock)rows.push([row.name,row.stock_qty]);
  rows.push([],['Stock recorded at','Product','Before','After','Change','Reason']);for(const row of report.stock_movements??[])rows.push([row.recorded_at,row.product_name,row.before_qty,row.after_qty,row.quantity_change,row.reason]);
  rows.push([],['Report notes']);for(const note of report.notes)rows.push([note]);
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
module.exports={createAnalyticsService,range,money,change,csv,csvCell,groupAttendance};
