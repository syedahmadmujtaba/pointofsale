import type {PoolClient} from 'pg';
import {AccountingValidationError as Invalid,decimal,postJournal,resolveAccount,reverseDocument,toMinorUnits,validDate,type JournalLine} from './accounting';
import {audit,invoiceTypes,positiveId,today,type InvoiceType} from './finance-service';

export async function createReturn(client:PoolClient,type:InvoiceType,body:any){
  const cfg=invoiceTypes[type], sale=type==='sale';
  const table=sale?'sale_returns':'purchase_returns', itemTable=sale?'sale_return_items':'purchase_return_items';
  const originalKey=sale?'original_sale_id':'original_purchase_id',returnKey=sale?'sale_return_id':'purchase_return_id';
  const refundKey=sale?'refund_amount':'refund_received';
  const id=positiveId(body[originalKey]),date=validDate(body.return_date||today());
  const doc=(await client.query(`SELECT *,${cfg.date}::date::text AS original_date FROM ${cfg.table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(!doc||doc.voided_at) throw new Invalid('Original invoice not found or voided');
  if(doc.engine_version!==2) throw new Invalid('Legacy returns require original-cost and account reconciliation first');
  if(date<doc.original_date) throw new Invalid('Return cannot precede invoice');
  if(!Array.isArray(body.items)||!body.items.length) throw new Invalid('Return items are required');
  const items=body.items.map((i:any)=>({id:positiveId(i.product_id),quantity:i.quantity})).sort((a:any,b:any)=>a.id-b.id);
  if(new Set(items.map((i:any)=>i.id)).size!==items.length) throw new Invalid('Duplicate return item');
  const original=(await client.query(`SELECT * FROM ${cfg.items} WHERE ${cfg.fk}=$1`,[id])).rows;
  const prior=(await client.query(`SELECT i.product_id,sum(i.quantity)::int AS quantity FROM ${itemTable} i JOIN ${table} r ON r.id=i.${returnKey} WHERE r.${originalKey}=$1 AND r.status='COMPLETED' GROUP BY i.product_id`,[id])).rows;
  let subtotal=0,costTotal=0,serviceTotal=0;
  const normalized=[];
  for(const item of items){
    const source=original.find(i=>i.product_id===item.id),returned=prior.find(i=>i.product_id===item.id)?.quantity||0;
    if(!source||!Number.isSafeInteger(item.quantity)||item.quantity<=0||item.quantity+returned>source.quantity) throw new Invalid('Return exceeds remaining invoiced quantity');
    const product=(await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[item.id])).rows[0];
    if(!sale&&product.item_type!=='service'&&product.stock<item.quantity) throw new Invalid('Insufficient stock for supplier return');
    const net=toMinorUnits(source.net_total);
    const value=Math.round(net*(returned+item.quantity)/source.quantity)-Math.round(net*returned/source.quantity);
    const originalCost=sale?toMinorUnits(source.cost_total):net;
    const costValue=Math.round(originalCost*(returned+item.quantity)/source.quantity)-Math.round(originalCost*returned/source.quantity);
    const cost=Math.round(costValue/item.quantity);
    subtotal+=value;
    if(product.item_type!=='service') costTotal+=costValue;
    else serviceTotal+=value;
    normalized.push({...item,value,cost,costValue,source,product});
  }
  const previous=(await client.query(`SELECT COALESCE(sum(subtotal),0)::text AS subtotal,COALESCE(sum(tax_amount),0)::text AS tax FROM ${table} WHERE ${originalKey}=$1 AND status='COMPLETED'`,[id])).rows[0];
  const invoiceNet=toMinorUnits(doc.subtotal)-toMinorUnits(doc.discount);
  const tax=invoiceNet?Math.round(toMinorUnits(doc.tax_amount)*(toMinorUnits(previous.subtotal)+subtotal)/invoiceNet)-toMinorUnits(previous.tax):0;
  const total=subtotal+tax,refund=toMinorUnits(body[refundKey]??0);
  const outstanding=toMinorUnits(doc.total_amount)-toMinorUnits(doc.credited_amount)-toMinorUnits(doc.amount_paid);
  if(!total||refund>total||refund>toMinorUnits(doc.amount_paid)||total-refund>outstanding) throw new Invalid('Refund must settle the paid portion; credit can only reduce the outstanding portion');
  const number=body.return_number||`RET-${(await client.query("SELECT nextval('business_document_number') AS n")).rows[0].n}`;
  const returned=(await client.query(`INSERT INTO ${table}(return_number,${originalKey},${cfg.partyKey},subtotal,tax_amount,total_amount,${refundKey},return_date,reason,status,engine_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'COMPLETED',2) RETURNING *`,[number,id,doc[cfg.partyKey],decimal(subtotal),decimal(tax),decimal(total),decimal(refund),date,body.reason||'',])).rows[0];
  for(const item of normalized){
    await client.query(`INSERT INTO ${itemTable}(${returnKey},product_id,quantity,unit_price,line_total,cost_price,cost_total) VALUES($1,$2,$3,$4,$5,$6,$7)`,[returned.id,item.id,item.quantity,item.source.unit_price,decimal(item.value),decimal(item.cost),decimal(item.costValue)]);
    if(item.product.item_type==='service') continue;
    const qty=sale?item.quantity:-item.quantity;
    const oldValue=toMinorUnits(item.product.inventory_value);
    const newStock=item.product.stock+qty;
    const valueDelta=sale?item.costValue:-item.costValue;
    if(oldValue+valueDelta<0) throw new Invalid('Supplier return requires inventory valuation reconciliation');
    const newCost=newStock?Math.round((oldValue+valueDelta)/newStock):toMinorUnits(item.product.cost_price);
    await client.query('UPDATE products SET stock=$1,cost_price=$2,inventory_value=$3 WHERE id=$4',[newStock,decimal(newCost),decimal(oldValue+valueDelta),item.id]);
    await client.query('INSERT INTO stock_movements(product_id,quantity,unit_cost,movement_date,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,$6)',[item.id,qty,decimal(item.cost),date,sale?'SALE_RETURN':'PURCHASE_RETURN',returned.id]);
  }
  const lines:JournalLine[]=[];
  const add=async(role:Parameters<typeof resolveAccount>[1],side:'debit'|'credit',value:number)=>{if(value)lines.push({accountId:await resolveAccount(client,role),[side]:decimal(value)});};
  if(sale){
    await add('revenue','debit',subtotal);await add('taxPayable','debit',tax);
    await add('receivable','credit',total-refund);await add(body.payment_method==='bank'?'bank':'cash','credit',refund);
    await add('inventory','debit',costTotal);await add('cogs','credit',costTotal);
  }else{
    await add('payable','debit',total-refund);await add(body.payment_method==='bank'?'bank':'cash','debit',refund);
    await add('inventory','credit',costTotal);await add('operatingExpense','credit',serviceTotal);await add('taxRecoverable','credit',tax);
  }
  await postJournal(client,{date,description:`Return ${number}`,referenceType:sale?'SALE_RETURN':'PURCHASE_RETURN',referenceId:returned.id,lines});
  await client.query(`UPDATE ${cfg.table} SET credited_amount=credited_amount+$1,amount_paid=amount_paid-$2 WHERE id=$3`,[decimal(total),decimal(refund),id]);
  await audit(client,'create',table,returned.id,null,returned);
  return returned;
}

export async function voidReturn(client:PoolClient,type:InvoiceType,id:number,date=today()){
  const sale=type==='sale',cfg=invoiceTypes[type];
  const table=sale?'sale_returns':'purchase_returns', itemTable=sale?'sale_return_items':'purchase_return_items';
  const fk=sale?'sale_return_id':'purchase_return_id',originalKey=sale?'original_sale_id':'original_purchase_id';
  const lookup=(await client.query(`SELECT ${originalKey} FROM ${table} WHERE id=$1`,[id])).rows[0];
  if(!lookup) throw new Invalid('Return not found');
  await client.query(`SELECT id FROM ${cfg.table} WHERE id=$1 FOR UPDATE`,[lookup[originalKey]]);
  const doc=(await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(doc.status!=='COMPLETED'||doc.engine_version!==2) throw new Invalid('Only new completed returns can be reversed');
  if(date<new Date(doc.return_date).toISOString().slice(0,10)) throw new Invalid('Reversal cannot precede return');
  const items=(await client.query(`SELECT i.*,p.stock,p.inventory_value,p.cost_price AS current_cost,p.item_type FROM ${itemTable} i JOIN products p ON p.id=i.product_id WHERE i.${fk}=$1 ORDER BY p.id FOR UPDATE OF p`,[id])).rows;
  await reverseDocument(client,sale?'SALE_RETURN':'PURCHASE_RETURN',id,date);
  for(const i of items){
    if(i.item_type==='service')continue;
    const quantity=sale?-i.quantity:i.quantity, stock=i.stock+quantity;
    if(stock<0)throw new Invalid('Insufficient stock to reverse return');
    const value=toMinorUnits(i.inventory_value)+(sale?-1:1)*toMinorUnits(i.cost_total);
    if(value<0)throw new Invalid('Inventory valuation reconciliation required');
    await client.query('UPDATE products SET stock=$1,cost_price=$2,inventory_value=$3 WHERE id=$4',[stock,stock?decimal(Math.round(value/stock)):i.current_cost,decimal(value),i.product_id]);
    await client.query('INSERT INTO stock_movements(product_id,quantity,unit_cost,movement_date,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,$6)',[i.product_id,quantity,i.cost_price,date,'RETURN_VOID',id]);
  }
  await client.query(`UPDATE ${cfg.table} SET credited_amount=credited_amount-$1,amount_paid=amount_paid+$2 WHERE id=$3`,[doc.total_amount,doc[sale?'refund_amount':'refund_received'],doc[originalKey]]);
  await client.query(`UPDATE ${table} SET status='CANCELLED' WHERE id=$1`,[id]);
  await audit(client,'void',table,id,doc,null);
}
