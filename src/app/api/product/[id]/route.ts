import { pool } from "@/lib/db";
import { NextResponse } from 'next/server';
import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,toMinorUnits} from '@/lib/accounting';
import {positiveId,audit} from '@/lib/finance-service';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const productId = Number((await params).id);
        if (isNaN(productId)) {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

        const res = await pool.query("DELETE FROM products WHERE id = $1 RETURNING *", [productId]);
        if (res.rowCount === 0) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        return NextResponse.json({ error: "Error deleting product" }, { status: 500 });
    }
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async c=>{
  const b=await request.json();
  const old=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!old)throw new Invalid('Product not found');
  toMinorUnits(b.cost_price);toMinorUnits(b.sale_price);
  if(old.stock!==0&&toMinorUnits(b.cost_price)!==toMinorUnits(old.cost_price))throw new Invalid('Stock cost is maintained by weighted-average purchases; use inventory adjustments for corrections');
  const itemType=b.item_type||old.item_type;
  if(!['stock','service'].includes(itemType))throw new Invalid('Invalid product type');
  if(itemType!==old.item_type&&(old.stock!==0||(await c.query('SELECT 1 FROM stock_movements WHERE product_id=$1 LIMIT 1',[id])).rows.length))throw new Invalid('Cannot change the type of an inventory product with stock history');
  const updated=(await c.query('UPDATE products SET name=$1,sku=$2,cost_price=$3,sale_price=$4,brand_id=$5,category_id=$6,min_stock_level=$7,item_type=$8 WHERE id=$9 RETURNING *',[b.name,b.sku,b.cost_price,b.sale_price,b.brand_id,b.category_id,b.min_stock_level,itemType,id])).rows[0];
  await audit(c,'update','product',id,old,updated);return updated;
 });
}
