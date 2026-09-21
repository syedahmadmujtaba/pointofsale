import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {validDate} from '@/lib/accounting';
export async function GET(request:Request){
 const q=new URL(request.url).searchParams,type=q.get('type')||'trial-balance';
 let asOf,from;try{asOf=validDate(q.get('asOf')||new Date().toISOString().slice(0,10));from=q.get('from')?validDate(q.get('from')):null;}catch{return NextResponse.json({error:'Invalid dates'},{status:400});}
 if(type==='trial-balance')return NextResponse.json((await pool.query(`SELECT a.account_id,a.account_code,a.account_name,a.account_type,
 COALESCE(sum(g.debit_amount),0) AS debits,COALESCE(sum(g.credit_amount),0) AS credits,
 COALESCE(sum(g.debit_amount-g.credit_amount),0) AS balance
 FROM chart_of_accounts a LEFT JOIN general_ledger g ON g.account_id=a.account_id AND g.transaction_date<=$1
 GROUP BY a.account_id,a.account_code,a.account_name,a.account_type ORDER BY a.account_code`,[asOf])).rows);
 if(type==='ledger')return NextResponse.json((await pool.query(`SELECT g.*,a.account_code,a.account_name,
 sum(g.debit_amount-g.credit_amount) OVER(PARTITION BY g.account_id ORDER BY g.transaction_date,g.ledger_id ROWS UNBOUNDED PRECEDING) AS running_balance
 FROM general_ledger g JOIN chart_of_accounts a USING(account_id) WHERE g.transaction_date<=$1 AND ($2::int IS NULL OR g.account_id=$2) ORDER BY g.transaction_date,g.ledger_id`,[asOf,q.get('accountId')||null])).rows);
 if(type==='aging'||type==='statement'){
  const customer=q.get('partyType')!=='vendor',table=customer?'sales':'purchases',party=customer?'customers':'vendors',key=customer?'customer_id':'vendor_id',date=customer?'sale_date':'purchase_date';
  // Outstanding uses the current settlement state; past as-of balances need payment event reconstruction.
  if(asOf!==new Date().toISOString().slice(0,10))return NextResponse.json({error:'Aging and statements currently show current outstanding balances; use the ledger for historical dates'},{status:400});
  const rows=(await pool.query(`SELECT d.id,d.invoice_number,p.name,d.${key} AS party_id,d.${date} AS invoice_date,d.due_date,d.total_amount,d.credited_amount,d.amount_paid,
 d.total_amount-d.credited_amount-d.amount_paid AS outstanding,
 CASE WHEN $1::date<=COALESCE(d.due_date,d.${date}::date) THEN 'current'
 WHEN $1::date-COALESCE(d.due_date,d.${date}::date)<=30 THEN '1-30'
 WHEN $1::date-COALESCE(d.due_date,d.${date}::date)<=60 THEN '31-60'
 WHEN $1::date-COALESCE(d.due_date,d.${date}::date)<=90 THEN '61-90' ELSE '90+' END AS aging_bucket
 FROM ${table} d JOIN ${party} p ON p.id=d.${key} WHERE d.voided_at IS NULL AND ($2::int IS NULL OR p.id=$2)
 ORDER BY p.name,COALESCE(d.due_date,d.${date}::date),d.id`,[asOf,q.get('partyId')||null])).rows;
  const advances=(await pool.query(`SELECT p.id,p.${key} AS party_id,p.amount-COALESCE(sum(a.amount),0) AS unallocated FROM payments p LEFT JOIN payment_allocations a ON a.payment_id=p.id WHERE p.voided_at IS NULL AND p.${key} IS NOT NULL AND ($1::int IS NULL OR p.${key}=$1) GROUP BY p.id HAVING p.amount>COALESCE(sum(a.amount),0)`,[q.get('partyId')||null])).rows;
  return NextResponse.json({invoices:rows,advances,asOf});
 }
 if(type==='audit')return NextResponse.json((await pool.query('SELECT * FROM audit_events ORDER BY id DESC LIMIT 500')).rows);
 if(type==='reconciliation'){
  const [unbalanced,orphans,legacy,inventory]=await Promise.all([
   pool.query(`SELECT j.journal_id,j.reference_type,j.reference_id,j.engine_version,sum(l.debit_amount-l.credit_amount) AS difference FROM journal_entries j LEFT JOIN journal_entry_lines l USING(journal_id) GROUP BY j.journal_id HAVING COALESCE(sum(l.debit_amount-l.credit_amount),0)<>0 OR count(l.line_id)<2`),
   pool.query('SELECT g.account_id,count(*) AS entries FROM general_ledger g LEFT JOIN chart_of_accounts a USING(account_id) WHERE a.account_id IS NULL GROUP BY g.account_id'),
   pool.query("SELECT reference_type,count(*) AS journals FROM journal_entries WHERE engine_version IS NULL GROUP BY reference_type"),
   pool.query("SELECT COALESCE(sum(inventory_value),0) AS stock_value FROM products WHERE item_type='stock'")]);
  return NextResponse.json({unbalanced:unbalanced.rows,orphanAccounts:orphans.rows,legacy:legacy.rows,inventory:inventory.rows[0],note:'Legacy postings require review against source documents. This report does not modify history.'});
 }
 if(type==='profit-loss')return NextResponse.json((await pool.query(`SELECT a.account_code,a.account_name,a.account_type,sum(CASE WHEN a.account_type='REVENUE' THEN credit_amount-debit_amount ELSE debit_amount-credit_amount END) AS amount FROM general_ledger g JOIN chart_of_accounts a USING(account_id) WHERE a.account_type IN ('REVENUE','EXPENSE') AND transaction_date<=$1 AND ($2::date IS NULL OR transaction_date >=$2) GROUP BY a.account_code,a.account_name,a.account_type ORDER BY a.account_code`,[asOf,from])).rows);
 return NextResponse.json({error:'Unknown report'},{status:400});
}
