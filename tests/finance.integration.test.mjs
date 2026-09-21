import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {saveInvoice} from '../src/lib/finance-service.ts';
import {recordPayment,voidPayment} from '../src/lib/payments.ts';
import {createReturn,voidReturn} from '../src/lib/returns.ts';
import {reverseJournal} from '../src/lib/accounting.ts';
import {allocatePayment} from '../src/lib/allocate-payment.ts';

test('fresh migrations and accounting lifecycle',async()=>{
 const db=new PGlite();
 const client={query:async(sql,params)=>{
   if(!params && sql.includes(';')){const results=await db.exec(sql);return results.at(-1)||{rows:[]};}
   return db.query(sql,params);
 }};
 const tx=async fn=>{await db.exec('BEGIN');try{const value=await fn();await db.exec('COMMIT');return value;}catch(e){await db.exec('ROLLBACK');throw e;}};
 try{
  for(const file of (await fs.readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   await tx(async()=>{await db.exec(await fs.readFile(`migrations/${file}`,'utf8'));await db.exec('SET LOCAL search_path=public');});
   await db.exec('SET search_path=public');
  }
  await db.exec("INSERT INTO customers(name) VALUES('Customer'); INSERT INTO vendors(name) VALUES('Supplier'); INSERT INTO products(sku,name,cost_price,sale_price,stock) VALUES('P1','Part',0,1000,0)");
  const purchase=await tx(()=>saveInvoice(client,'purchase',{vendor_id:1,invoice_number:'P1',payment_terms:'credit',purchase_date:'2026-09-01',items:[{product_id:1,quantity:10,price:'600.00'}]}));
  assert.equal(purchase.amount_paid,'0.00');
  const sale=await tx(()=>saveInvoice(client,'sale',{customer_id:1,invoice_number:'S1',payment_terms:'credit',sale_date:'2026-09-02',items:[{product_id:1,quantity:10,price:'1000.00'}]}));
  const payment=await tx(()=>recordPayment(client,{kind:'receipt',party_id:1,amount:'4000.00',payment_date:'2026-09-03',idempotency_key:'test-payment-1',allocations:[{invoice_id:sale.id,amount:'4000.00'}]}));
  assert.equal((await db.query('SELECT total_amount-amount_paid AS due FROM sales WHERE id=$1',[sale.id])).rows[0].due,'6000.00');
  const retry=await tx(()=>recordPayment(client,{kind:'receipt',party_id:1,amount:'4000.00',payment_date:'2026-09-03',idempotency_key:'test-payment-1',allocations:[{invoice_id:sale.id,amount:'4000.00'}]}));
  assert.equal(retry.id,payment.id);
  await assert.rejects(()=>tx(()=>recordPayment(client,{kind:'receipt',party_id:1,amount:'4000.00',payment_date:'2026-09-03',idempotency_key:'test-payment-1',allocations:[]})),/different request/);
  await assert.rejects(()=>tx(()=>recordPayment(client,{kind:'receipt',party_id:1,amount:'4000.00',payment_date:'2026-09-04',idempotency_key:'test-payment-1',allocations:[{invoice_id:sale.id,amount:'4000.00'}]})),/different request/);
  await tx(()=>voidPayment(client,Number(payment.id),'2026-09-04'));
  assert.equal((await db.query('SELECT amount_paid FROM sales WHERE id=$1',[sale.id])).rows[0].amount_paid,'0.00');
  const returned=await tx(()=>createReturn(client,'sale',{original_sale_id:sale.id,return_date:'2026-09-05',refund_amount:0,items:[{product_id:1,quantity:2}]}));
  assert.equal(returned.total_amount,'2000.00');
  await assert.rejects(()=>tx(()=>createReturn(client,'sale',{original_sale_id:sale.id,items:[{product_id:1,quantity:9}]})));
  await tx(()=>voidReturn(client,'sale',returned.id,'2026-09-06'));
  assert.equal((await db.query('SELECT stock FROM products WHERE id=1')).rows[0].stock,0);
  await assert.rejects(()=>tx(()=>saveInvoice(client,'sale',{customer_id:1,items:[{product_id:1,quantity:1,price:1000}]})));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM sales')).rows[0].n,1);
  const balance=(await db.query('SELECT sum(debit_amount-credit_amount) AS balance FROM general_ledger')).rows[0].balance;
  assert.equal(balance,'0.00');
  assert.equal((await db.query("SELECT sum(g.credit_amount-g.debit_amount) AS revenue FROM general_ledger g JOIN chart_of_accounts a USING(account_id) WHERE a.account_code='4000'")).rows[0].revenue,'10000.00');
  // Discounted cash transactions create separate payment records and balance exactly.
  await tx(()=>saveInvoice(client,'purchase',{vendor_id:1,purchase_date:'2026-09-07',invoice_number:'P2',items:[{product_id:1,quantity:3,price:'0.33'}],discount:'0.01',tax_amount:'0.02'}));
  assert.equal((await db.query('SELECT inventory_value FROM products WHERE id=1')).rows[0].inventory_value,'0.98');
  const cashSale=await tx(()=>saveInvoice(client,'sale',{customer_id:1,sale_date:'2026-09-08',invoice_number:'S2',items:[{product_id:1,quantity:3,price:'1.00'}],discount:'0.10',tax_amount:'0.05'}));
  assert.equal(cashSale.total_amount,'2.95');assert.equal(cashSale.amount_paid,'2.95');
  assert.equal((await db.query('SELECT inventory_value FROM products WHERE id=1')).rows[0].inventory_value,'0.00');
  const cashReturn=await tx(()=>createReturn(client,'sale',{original_sale_id:cashSale.id,return_date:'2026-09-09',refund_amount:'2.95',items:[{product_id:1,quantity:3}]}));
  assert.equal(cashReturn.total_amount,'2.95');
  assert.equal((await db.query('SELECT inventory_value FROM products WHERE id=1')).rows[0].inventory_value,'0.98');
  const p2=(await db.query("SELECT * FROM purchases WHERE invoice_number='P2'")).rows[0];
  await tx(()=>createReturn(client,'purchase',{original_purchase_id:p2.id,return_date:'2026-09-10',refund_received:'1.00',items:[{product_id:1,quantity:3}]}));
  assert.equal((await db.query('SELECT inventory_value FROM products WHERE id=1')).rows[0].inventory_value,'0.00');
  const advance=await tx(()=>recordPayment(client,{kind:'receipt',party_id:1,amount:'500.00',payment_date:'2026-09-10',idempotency_key:'advance-test-1',allocations:[]}));
  await tx(()=>allocatePayment(client,advance.id,{invoice_id:sale.id,amount:'500.00'}));
  await assert.rejects(()=>tx(()=>allocatePayment(client,advance.id,{invoice_id:sale.id,amount:'0.01'})));
  assert.equal((await db.query('SELECT sum(debit_amount-credit_amount) AS balance FROM general_ledger')).rows[0].balance,'0.00');
  // Verify actual report SQL against the same isolated PostgreSQL database.
  process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
  const {pool}=await import('../src/lib/db.ts');
  pool.query=client.query;
  pool.connect=async()=>({...client,release(){}});
  const reporting=await import('../src/app/api/accounting/reports/route.ts');
  for(const type of ['trial-balance','ledger','profit-loss','aging','statement','reconciliation','audit']){
   const response=await reporting.GET(new Request(`http://localhost/api/accounting/reports?type=${type}`));
   assert.equal(response.status,200,type);
  }
  const legacyReports=await import('../src/app/api/reports/route.ts');
  for(const type of ['sales','profit-loss','balance-sheet','customer-report','vendor-report']){
   const response=await legacyReports.GET(new Request(`http://localhost/api/reports?type=${type}&customerId=1&vendorId=1`));
   assert.equal(response.status,200,type);
  }
  await assert.rejects(()=>db.query('INSERT INTO journal_entry_lines(journal_id,account_id,debit_amount,credit_amount) VALUES($1,1,1,0)',[payment.journal_id]));
  await assert.rejects(()=>db.query('DELETE FROM journal_entries WHERE engine_version=2'));
  // Exercise maker/checker controls, warehouse stock guards and reconciliation APIs.
  await db.exec("INSERT INTO app_users(username,password_hash,role) VALUES('maker','test','admin'),('checker','test','admin')");
  const post=(body,actor=1)=>new Request('http://localhost/api/accounting',{method:'POST',headers:{'content-type':'application/json','x-pos-user':String(actor),'x-pos-role':'admin'},body:JSON.stringify(body)});
  const journals=await import('../src/app/api/accounting/journals/route.ts');
  const cashId=(await db.query("SELECT account_id FROM chart_of_accounts WHERE account_code='1000'")).rows[0].account_id;
  const equityId=(await db.query("SELECT account_id FROM chart_of_accounts WHERE account_code='3000'")).rows[0].account_id;
  const proposalResponse=await journals.POST(post({description:'Opening cash',date:'2026-09-11',lines:[{accountId:cashId,debit:'100.00'},{accountId:equityId,credit:'100.00'}]}));
  assert.equal(proposalResponse.status,201);
  const proposal=await proposalResponse.json();
  assert.equal((await journals.POST(post({approve_id:proposal.id}))).status,400);
  assert.equal((await journals.POST(post({approve_id:proposal.id},2))).status,201);
  assert.equal((await journals.POST(post({approve_id:proposal.id},2))).status,400);
  const inventory=await import('../src/app/api/inventory/route.ts');
  const warehouse=await (await inventory.POST(post({action:'warehouse',name:'Storage'}))).json();
  await db.query('UPDATE products SET cost_price=1 WHERE id=1');
  assert.equal((await inventory.POST(post({action:'adjust',product_id:1,quantity:2,reason:'Count correction',date:'2026-09-12'}))).status,201);
  assert.equal((await inventory.POST(post({action:'transfer',product_id:1,quantity:2,from_warehouse:1,to_warehouse:warehouse.id,date:'2026-09-12'}))).status,201);
  await assert.rejects(()=>tx(()=>saveInvoice(client,'sale',{customer_id:1,sale_date:'2026-09-12',items:[{product_id:1,quantity:1,price:1}]})));
  assert.equal((await db.query('SELECT stock FROM products WHERE id=1')).rows[0].stock,2);
  const reconcile=await import('../src/app/api/accounting/reconcile/route.ts');
  const cashRows=(await db.query('SELECT * FROM general_ledger WHERE account_id=$1',[cashId])).rows;
  const cashBalance=cashRows.reduce((sum,r)=>sum+Math.round(Number(r.debit_amount)*100)-Math.round(Number(r.credit_amount)*100),0)/100;
  const recBody={account_id:cashId,date:'2026-09-15',balance:cashBalance.toFixed(2),ledger_ids:cashRows.map(r=>r.ledger_id)};
  assert.equal((await reconcile.POST(post({...recBody,balance:'99999.00'}))).status,400);
  assert.equal((await reconcile.POST(post(recBody))).status,201);
  assert.equal((await reconcile.POST(post(recBody))).status,400);
  await db.query("UPDATE business_settings SET closed_through='2026-09-30'");
  const reversal=await tx(()=>reverseJournal(client,Number(payment.journal_id),'2026-09-07'));
  assert.ok(reversal); // Already reversed returns the existing journal without reposting.
  await assert.rejects(()=>tx(()=>saveInvoice(client,'purchase',{vendor_id:1,purchase_date:'2026-09-20',items:[{product_id:1,quantity:1,price:600}]})));
 }finally{await db.close();}
});
