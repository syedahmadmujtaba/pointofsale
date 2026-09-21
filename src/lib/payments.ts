import type {PoolClient} from 'pg';
import {AccountingValidationError as Invalid, decimal, postJournal, resolveAccount, reverseJournal, toMinorUnits, validDate} from './accounting';
import {audit, invoiceTypes, positiveId, today} from './finance-service';

export async function recordPayment(client:PoolClient,body:any){
  const type=body.kind==='receipt'?'sale':body.kind==='supplier_payment'?'purchase':null;
  if(!type) throw new Invalid('Choose receipt or supplier_payment');
  const cfg=invoiceTypes[type], partyId=positiveId(body.party_id);
  const amount=toMinorUnits(body.amount), date=validDate(body.payment_date||today());
  if(!amount) throw new Invalid('Payment must be positive');
  if(typeof body.idempotency_key!=='string'||body.idempotency_key.length<8||body.idempotency_key.length>150) throw new Invalid('A unique payment request key is required');
  if(body.payment_method && !['cash','bank'].includes(body.payment_method)) throw new Invalid('Choose cash or bank');
  if(!Array.isArray(body.allocations ?? [])) throw new Invalid('Allocations must be a list');
  const allocations=(body.allocations ?? []).map((a:any)=>({id:positiveId(a.invoice_id),amount:toMinorUnits(a.amount)})).sort((a:any,b:any)=>a.id-b.id);
  const payload={kind:body.kind,partyId,amount,date,method:body.payment_method||'cash',reference:body.reference||'',allocations};
  // Serialize retries by request key, including retries that target a different party.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[body.idempotency_key]);
  const prior=(await client.query('SELECT * FROM payments WHERE idempotency_key=$1',[body.idempotency_key])).rows[0];
  if(prior) {
    if(!prior.request_payload || JSON.stringify(payload)!==JSON.stringify({kind:prior.request_payload.kind,partyId:prior.request_payload.partyId,amount:prior.request_payload.amount,date:prior.request_payload.date,method:prior.request_payload.method,reference:prior.request_payload.reference,allocations:prior.request_payload.allocations.map((a:any)=>({id:a.id,amount:a.amount}))})) throw new Invalid('Payment request key was already used for a different request');
    return prior;
  }
  const party=await client.query(`SELECT id FROM ${cfg.party} WHERE id=$1 FOR UPDATE`,[partyId]);
  if(!party.rows.length) throw new Invalid('Customer or supplier not found');
  if(new Set(allocations.map((a:any)=>a.id)).size!==allocations.length) throw new Invalid('Duplicate invoice allocation');
  if(allocations.reduce((s:number,a:any)=>s+a.amount,0)>amount) throw new Invalid('Allocated amount exceeds payment');
  for(const a of allocations){
    const invoice=(await client.query(`SELECT * FROM ${cfg.table} WHERE id=$1 FOR UPDATE`,[a.id])).rows[0];
    if(!invoice||invoice.voided_at||invoice[cfg.partyKey]!==partyId) throw new Invalid('Allocation must target this party’s active invoice');
    if(invoice.engine_version!==2) throw new Invalid('Reconcile legacy invoice before allocating payments');
    if(date<new Date(invoice[cfg.date]).toISOString().slice(0,10)) throw new Invalid('Payment cannot precede the allocated invoice');
    const due=toMinorUnits(invoice.total_amount)-toMinorUnits(invoice.credited_amount)-toMinorUnits(invoice.amount_paid);
    if(!a.amount||a.amount>due) throw new Invalid('Allocation exceeds invoice outstanding balance');
  }
  const cash=await resolveAccount(client,body.payment_method==='bank'?'bank':'cash');
  const control=await resolveAccount(client,type==='sale'?'receivable':'payable');
  const id=Number((await client.query("SELECT nextval(pg_get_serial_sequence('payments','id')) AS id")).rows[0].id);
  const journal=await postJournal(client,{date,description:body.reference||body.kind,referenceType:'PAYMENT',referenceId:id,
    lines:type==='sale'?[{accountId:cash,debit:decimal(amount)},{accountId:control,credit:decimal(amount)}]:[{accountId:control,debit:decimal(amount)},{accountId:cash,credit:decimal(amount)}]});
  const payment=(await client.query(`INSERT INTO payments(id,kind,${cfg.partyKey},amount,payment_date,account_id,reference,idempotency_key,journal_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,body.kind,partyId,decimal(amount),date,cash,body.reference||'',body.idempotency_key,journal])).rows[0];
  await client.query('UPDATE payments SET request_payload=$1::jsonb WHERE id=$2',[JSON.stringify(payload),id]);
  for(const a of allocations){
    await client.query(`INSERT INTO payment_allocations(payment_id,${cfg.fk},amount) VALUES($1,$2,$3)`,[id,a.id,decimal(a.amount)]);
    await client.query(`UPDATE ${cfg.table} SET amount_paid=amount_paid+$1 WHERE id=$2`,[decimal(a.amount),a.id]);
  }
  await audit(client,'create','payment',id,null,payment);
  return payment;
}

export async function voidPayment(client:PoolClient,id:number,date=today()){
  const p=(await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!p||p.voided_at) throw new Invalid('Payment not found or already voided');
  if(date<new Date(p.payment_date).toISOString().slice(0,10)) throw new Invalid('Reversal cannot precede payment');
  const cfg=invoiceTypes[p.kind==='receipt'?'sale':'purchase'];
  const allocations=(await client.query(`SELECT * FROM payment_allocations WHERE payment_id=$1 ORDER BY ${cfg.fk}`,[id])).rows;
  for(const a of allocations){
    const doc=(await client.query(`SELECT * FROM ${cfg.table} WHERE id=$1 FOR UPDATE`,[a[cfg.fk]])).rows[0];
    if(toMinorUnits(doc.amount_paid)<toMinorUnits(a.amount)) throw new Invalid('Reverse refunds before reversing this payment');
  }
  await reverseJournal(client,p.journal_id,validDate(date));
  for(const a of allocations) await client.query(`UPDATE ${cfg.table} SET amount_paid=amount_paid-$1 WHERE id=$2`,[a.amount,a[cfg.fk]]);
  await client.query('UPDATE payments SET voided_at=now() WHERE id=$1',[id]);
  await audit(client,'void','payment',id,p,null);
}
