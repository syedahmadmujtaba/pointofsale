import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,assertOpenPeriod,decimal,postJournal,resolveAccount,toMinorUnits,validDate} from '@/lib/accounting';
import {audit,positiveId,today} from '@/lib/finance-service';
export async function GET(){
 const [warehouses,stock,movements]=await Promise.all([pool.query('SELECT * FROM warehouses'),pool.query('SELECT w.*,p.name,p.sku FROM warehouse_stock w JOIN products p ON p.id=w.product_id ORDER BY warehouse_id,p.name'),pool.query('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 500')]);
 return NextResponse.json({warehouses:warehouses.rows,stock:stock.rows,movements:movements.rows});
}
export async function POST(request:Request){return financeWrite(request,async c=>{
 const b=await request.json();
 if(b.action==='warehouse'){
  if(typeof b.name!=='string'||!b.name.trim())throw new Invalid('Warehouse name required');
  const w=(await c.query('INSERT INTO warehouses(name) VALUES($1) RETURNING *',[b.name.trim()])).rows[0];
  await audit(c,'create','warehouse',w.id,null,w);return w;
 }
 const id=positiveId(b.product_id),date=validDate(b.date||today());await assertOpenPeriod(c,date);
 const product=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!product||product.item_type!=='stock')throw new Invalid('Choose a stock product');
 if(!Number.isSafeInteger(b.quantity)||!b.quantity)throw new Invalid('Nonzero integer quantity required');
 if(b.action==='transfer'){
  const from=positiveId(b.from_warehouse),to=positiveId(b.to_warehouse);
  if(from===to||b.quantity<0)throw new Invalid('Choose different warehouses and positive quantity');
  const result=await c.query('UPDATE warehouse_stock SET quantity=quantity-$1 WHERE warehouse_id=$2 AND product_id=$3 AND quantity>=$1 RETURNING *',[b.quantity,from,id]);
  if(!result.rows.length)throw new Invalid('Insufficient stock in source warehouse');
  await c.query('INSERT INTO warehouse_stock(warehouse_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity=warehouse_stock.quantity+excluded.quantity',[to,id,b.quantity]);
  const transfer=(await c.query('INSERT INTO warehouse_transfers(product_id,from_warehouse,to_warehouse,quantity,transfer_date) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,from,to,b.quantity,date])).rows[0];
  await audit(c,'transfer','stock',id,null,transfer);return transfer;
 }
 if(b.action!=='adjust'||typeof b.reason!=='string'||!b.reason.trim())throw new Invalid('Adjustment reason is required');
 if(product.stock+b.quantity<0)throw new Invalid('Insufficient stock');
 const cost=toMinorUnits(product.cost_price),value=b.quantity<0?Math.round(toMinorUnits(product.inventory_value)*Math.abs(b.quantity)/product.stock):Math.abs(b.quantity)*cost;
 if(!value)throw new Invalid('Set a positive inventory cost before a value adjustment');
 await c.query('UPDATE products SET stock=stock+$1,inventory_value=inventory_value+$2 WHERE id=$3',[b.quantity,(b.quantity<0?'-':'')+decimal(value),id]);
 const move=(await c.query("INSERT INTO stock_movements(product_id,quantity,unit_cost,movement_date,reference_type,reference_id) VALUES($1,$2,$3,$4,'ADJUSTMENT',$1) RETURNING *",[id,b.quantity,product.cost_price,date])).rows[0];
 const inventory=await resolveAccount(c,'inventory'),offset=await resolveAccount(c,'stockAdjustment');
 await postJournal(c,{date,description:b.reason,referenceType:'ADJUSTMENT',referenceId:Number(move.id),lines:b.quantity>0?[{accountId:inventory,debit:decimal(value)},{accountId:offset,credit:decimal(value)}]:[{accountId:offset,debit:decimal(value)},{accountId:inventory,credit:decimal(value)}]});
 await audit(c,'adjust','stock',id,product,{quantity:b.quantity,reason:b.reason});return move;
},201);}
