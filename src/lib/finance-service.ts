import type { PoolClient } from 'pg';
import { AccountingValidationError as Invalid, assertOpenPeriod, decimal, postJournal, resolveAccount, reverseDocument, toMinorUnits, validDate, type JournalLine } from './accounting';
import { calculateInvoice } from './invoice-math';
import { recordPayment } from './payments';

export const invoiceTypes = {
  sale: { table:'sales', items:'sales_items', fk:'sale_id', party:'customers', partyKey:'customer_id', date:'sale_date', ref:'SALE' },
  purchase: { table:'purchases', items:'purchase_items', fk:'purchase_id', party:'vendors', partyKey:'vendor_id', date:'purchase_date', ref:'PURCHASE' },
} as const;
export type InvoiceType = keyof typeof invoiceTypes;
export const today = () => new Date().toISOString().slice(0,10);
export function positiveId(value: unknown) {
  const id=Number(value);
  if (!Number.isSafeInteger(id) || id<=0) throw new Invalid('Invalid record ID');
  return id;
}
export async function audit(client: PoolClient, action:string, entity:string, id:number, before:unknown, after:unknown) {
  await client.query(`INSERT INTO audit_events(actor,action,entity_type,entity_id,before_data,after_data)
    VALUES (COALESCE(NULLIF(current_setting('app.actor',true),''),'system'),$1,$2,$3,$4,$5)`,
    [action,entity,String(id),JSON.stringify(before ?? null),JSON.stringify(after ?? null)]);
}

export async function saveInvoice(client: PoolClient, type: InvoiceType, body:any, id?:number) {
  const config=invoiceTypes[type];
  const date=validDate(body[config.date] || today());
  await assertOpenPeriod(client,date);
  const partyId=positiveId(body[config.partyKey]);
  const party=(await client.query(`SELECT * FROM ${config.party} WHERE id=$1 FOR UPDATE`,[partyId])).rows[0];
  if (!party) throw new Invalid('Customer or supplier not found');
  if (!Array.isArray(body.items) || !body.items.length) throw new Invalid('At least one item is required');
  const items=body.items.map((i:any) => ({id:positiveId(i.product_id ?? i.id), quantity:i.quantity,
    price:i.price ?? i.unit_price ?? (type==='sale' ? i.sale_price : i.cost_price)}));
  if (new Set(items.map((i:any)=>i.id)).size!==items.length) throw new Invalid('Combine duplicate products into one line');
  const totals=calculateInvoice(items,body.discount ?? 0,body.tax_amount ?? 0);
  const paid=toMinorUnits(body.amount_paid ?? (body.payment_terms==='credit' ? 0 : decimal(totals.total)));
  if (paid>totals.total) throw new Invalid('Record overpayments separately as an advance');
  let due=body.due_date ? validDate(body.due_date) : date;
  if (due<date) throw new Invalid('Due date cannot precede invoice date');
  let old:any;
  let oldItems:any[]=[];
  if (id) {
    old=(await client.query(`SELECT *, ${config.date}::date::text AS original_date FROM ${config.table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if (!old || old.voided_at) throw new Invalid('Invoice not found or voided');
    if(body.due_date===undefined && old.due_date) due=new Date(old.due_date).toISOString().slice(0,10);
    if(due<date) throw new Invalid('Due date cannot precede invoice date; supply a new due date');
    if (old.document_kind==='opening') throw new Invalid('Opening documents must be corrected with a reviewed journal');
    if (old.engine_version!==2) throw new Invalid('Legacy invoice requires accounting reconciliation before editing');
    await assertOpenPeriod(client,old.original_date);
    const returns=await client.query(`SELECT 1 FROM ${type==='sale'?'sale_returns':'purchase_returns'} WHERE ${type==='sale'?'original_sale_id':'original_purchase_id'}=$1 AND status='COMPLETED'`,[id]);
    const allocations=await client.query(`SELECT 1 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.${config.fk}=$1 AND p.voided_at IS NULL`,[id]);
    if (returns.rows.length || allocations.rows.length) throw new Invalid('Reverse associated returns/payments before editing this invoice');
    oldItems=(await client.query(`SELECT * FROM ${config.items} WHERE ${config.fk}=$1`,[id])).rows;
    await client.query('INSERT INTO document_revisions(document_type,document_id,document,items) VALUES($1,$2,$3,$4)',[type,id,JSON.stringify(old),JSON.stringify(oldItems)]);
    await reverseDocument(client,config.ref,id,date);
  }
  if(type==='sale' && party.credit_limit!==null && totals.total>paid){
    const balance=(await client.query(`SELECT COALESCE(sum(total_amount-credited_amount-amount_paid),0)::text AS due FROM sales WHERE customer_id=$1 AND voided_at IS NULL AND ($2::int IS NULL OR id<>$2)`,[partyId,id ?? null])).rows[0];
    if(toMinorUnits(balance.due)+totals.total-paid>toMinorUnits(party.credit_limit)) throw new Invalid('Customer credit limit exceeded');
  }
  const productIds=[...new Set<number>([...items.map((i:any)=>i.id),...oldItems.map(i=>i.product_id)])].sort((a,b)=>a-b);
  const products=(await client.query('SELECT * FROM products WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[productIds])).rows;
  if(products.length!==productIds.length) throw new Invalid('Product not found');
  const productMap=new Map(products.map(p=>[p.id,p]));
  // Undo physical quantities for the prior revision before applying replacements.
  for(const item of oldItems){
    const product=productMap.get(item.product_id)!;
    if(product.item_type==='service') continue;
    if(type==='purchase') throw new Invalid('Posted stock purchases are corrected through purchase returns, not edits');
    product.stock+=item.quantity;
    product.inventory_value=decimal(toMinorUnits(product.inventory_value)+toMinorUnits(item.cost_total));
    await client.query(`INSERT INTO stock_movements(product_id,quantity,unit_cost,movement_date,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,$6)`,[product.id,item.quantity,item.cost_price,date,'SALE_EDIT_REVERSAL',id]);
  }
  const settings=(await client.query('SELECT * FROM business_settings WHERE id=true')).rows[0];
  let number=body.invoice_number;
  if(!number){ const seq=(await client.query("SELECT nextval('business_document_number') AS n")).rows[0].n; number=`${type==='sale'?settings.invoice_prefix:settings.purchase_prefix}-${seq}`; }
  const values=[String(number),partyId,decimal(totals.subtotal),decimal(totals.discount),decimal(totals.tax),decimal(totals.total),'0.00',date,due];
  let document;
  if(id){
    document=(await client.query(`UPDATE ${config.table} SET invoice_number=$1,${config.partyKey}=$2,subtotal=$3,discount=$4,tax_amount=$5,total_amount=$6,amount_paid=$7,${config.date}=$8,due_date=$9,engine_version=2,updated_at=now() WHERE id=$10 RETURNING *`,[...values,id])).rows[0];
    await client.query(`DELETE FROM ${config.items} WHERE ${config.fk}=$1`,[id]);
  }else{
    document=(await client.query(`INSERT INTO ${config.table}(invoice_number,${config.partyKey},subtotal,discount,tax_amount,total_amount,amount_paid,${config.date},due_date,engine_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,2) RETURNING *`,values)).rows[0];
    id=document.id;
  }
  let cogs=0,inventoryValue=0,serviceValue=0;
  for(let index=0;index<items.length;index++){
    const item=items[index], product=productMap.get(item.id)!;
    let cost=toMinorUnits(product.cost_price);
    let itemCost=0;
    if(type==='sale'){
      const prior=oldItems.find(i=>i.product_id===item.id);
      if(prior?.cost_price!=null) cost=toMinorUnits(prior.cost_price);
      if(product.item_type!=='service'){
        if(product.stock<item.quantity) throw new Invalid(`Insufficient stock for ${product.name}`);
        itemCost=prior?.cost_total!=null?Math.round(toMinorUnits(prior.cost_total)*item.quantity/prior.quantity):Math.round(toMinorUnits(product.inventory_value)*item.quantity/product.stock);
        if(itemCost>toMinorUnits(product.inventory_value))throw new Invalid('Inventory valuation reconciliation required before editing');
        product.inventory_value=decimal(toMinorUnits(product.inventory_value)-itemCost);
        product.stock-=item.quantity; cogs+=itemCost;
        cost=Math.round(itemCost/item.quantity);
      }
    }else if(product.item_type!=='service'){
      inventoryValue+=totals.netLines[index];
      product.inventory_value=decimal(toMinorUnits(product.inventory_value)+totals.netLines[index]);
      cost=Math.round(toMinorUnits(product.inventory_value)/(product.stock+item.quantity));
      product.stock+=item.quantity; product.cost_price=decimal(cost);
    }else serviceValue+=totals.netLines[index];
    await client.query(`INSERT INTO ${config.items}(product_id,${config.fk},quantity,unit_price,line_total,net_total${type==='sale'?',cost_price,cost_total':''}) VALUES($1,$2,$3,$4,$5,$6${type==='sale'?',$7,$8':''})`,
      [item.id,id,item.quantity,decimal(toMinorUnits(item.price)),decimal(totals.lines[index]),decimal(totals.netLines[index]),...(type==='sale'?[decimal(cost),decimal(itemCost)]:[])]);
    if(product.item_type!=='service') await client.query(`INSERT INTO stock_movements(product_id,quantity,unit_cost,movement_date,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,$6)`,[item.id,type==='sale'?-item.quantity:item.quantity,decimal(type==='sale'?cost:Math.round(totals.netLines[index]/item.quantity)),date,config.ref,id]);
  }
  for(const p of products) await client.query('UPDATE products SET stock=$1,cost_price=$2,inventory_value=$3 WHERE id=$4',[p.stock,p.cost_price,p.inventory_value,p.id]);
  const lines:JournalLine[]=[];
  const add=async(role:Parameters<typeof resolveAccount>[1],side:'debit'|'credit',amount:number)=>{
    if(amount) lines.push({accountId:await resolveAccount(client,role),[side]:decimal(amount)});
  };
  const method=body.payment_method==='bank'?'bank':'cash';
  if(type==='sale'){
    await add('receivable','debit',totals.total);
    await add('revenue','credit',totals.subtotal-totals.discount); await add('taxPayable','credit',totals.tax);
    await add('cogs','debit',cogs); await add('inventory','credit',cogs);
  }else{
    await add('inventory','debit',inventoryValue); await add('operatingExpense','debit',serviceValue);
    await add('taxRecoverable','debit',totals.tax); await add('payable','credit',totals.total);
  }
  const journalId=await postJournal(client,{date,description:`${config.ref} ${number}`,referenceType:config.ref,referenceId:id!,lines});
  if(paid){
    await recordPayment(client,{kind:type==='sale'?'receipt':'supplier_payment',party_id:partyId,
      amount:decimal(paid),payment_date:date,payment_method:method,reference:`Payment for ${number}`,
      idempotency_key:`invoice-${type}-${id}-journal-${journalId}`,allocations:[{invoice_id:id,amount:decimal(paid)}]});
    document.amount_paid=decimal(paid);
  }
  await audit(client,id&&old?'replace':'create',type,id!,old,document);
  return document;
}

export async function voidInvoice(client:PoolClient,type:InvoiceType,id:number,date=today()){
  const c=invoiceTypes[type];
  const doc=(await client.query(`SELECT * FROM ${c.table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(!doc||doc.voided_at) throw new Invalid('Invoice not found or already voided');
  if(doc.engine_version!==2) throw new Invalid('Legacy invoice requires reconciliation before voiding');
  const allocations=await client.query(`SELECT 1 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.${c.fk}=$1 AND p.voided_at IS NULL`,[id]);
  const returns=await client.query(`SELECT 1 FROM ${type==='sale'?'sale_returns':'purchase_returns'} WHERE ${type==='sale'?'original_sale_id':'original_purchase_id'}=$1 AND status='COMPLETED'`,[id]);
  if(allocations.rows.length||returns.rows.length) throw new Invalid('Reverse returns and allocated payments first');
  if(type==='purchase') throw new Invalid('Use a purchase return to reverse stock purchases');
  const items=(await client.query(`SELECT i.*,p.item_type FROM ${c.items} i JOIN products p ON p.id=i.product_id WHERE ${c.fk}=$1 ORDER BY p.id FOR UPDATE OF p`,[id])).rows;
  await reverseDocument(client,c.ref,id,date);
  for(const item of items){
    if(item.item_type==='service') continue;
    await client.query('UPDATE products SET stock=stock+$1,inventory_value=inventory_value+$2 WHERE id=$3',[item.quantity,item.cost_total,item.product_id]);
    await client.query('INSERT INTO stock_movements(product_id,quantity,unit_cost,movement_date,reference_type,reference_id) VALUES($1,$2,$3,$4,$5,$6)',[item.product_id,item.quantity,item.cost_price,date,'SALE_VOID',id]);
  }
  await client.query(`UPDATE ${c.table} SET voided_at=now() WHERE id=$1`,[id]);
  await audit(client,'void',type,id,doc,null);
}
