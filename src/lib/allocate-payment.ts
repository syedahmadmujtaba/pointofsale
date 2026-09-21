import type {PoolClient} from 'pg';
import {AccountingValidationError as Invalid,toMinorUnits,decimal} from './accounting';
import {audit,invoiceTypes,positiveId} from './finance-service';
export async function allocatePayment(client:PoolClient,id:number,body:any){
 const p=(await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!p||p.voided_at)throw new Invalid('Payment not found or reversed');
 const cfg=invoiceTypes[p.kind==='receipt'?'sale':'purchase'];
 const invoiceId=positiveId(body.invoice_id),amount=toMinorUnits(body.amount);
 const existing=(await client.query('SELECT COALESCE(sum(amount),0)::text AS allocated FROM payment_allocations WHERE payment_id=$1',[id])).rows[0];
 if(!amount||toMinorUnits(existing.allocated)+amount>toMinorUnits(p.amount))throw new Invalid('Amount exceeds available advance');
 const invoice=(await client.query(`SELECT * FROM ${cfg.table} WHERE id=$1 FOR UPDATE`,[invoiceId])).rows[0];
 if(!invoice||invoice.voided_at||invoice.engine_version!==2||invoice[cfg.partyKey]!==p[cfg.partyKey])throw new Invalid('Choose an active invoice for the same party');
 if(amount>toMinorUnits(invoice.total_amount)-toMinorUnits(invoice.credited_amount)-toMinorUnits(invoice.amount_paid))throw new Invalid('Allocation exceeds invoice balance');
 await client.query(`INSERT INTO payment_allocations(payment_id,${cfg.fk},amount) VALUES($1,$2,$3)`,[id,invoiceId,decimal(amount)]);
 await client.query(`UPDATE ${cfg.table} SET amount_paid=amount_paid+$1 WHERE id=$2`,[decimal(amount),invoiceId]);
 await audit(client,'allocate','payment',id,null,{invoiceId,amount:decimal(amount)});
 return {allocated:decimal(amount)};
}
