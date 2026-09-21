import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { financeWrite } from '@/lib/finance-http';
import { saveInvoice, voidInvoice, positiveId } from '@/lib/finance-service';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Fetch the specific sale by ID
    const res = await pool.query("SELECT * FROM sales WHERE id = $1", [id]);
    
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }
    const saleItemsRes = await pool.query("SELECT * FROM sales_items WHERE sale_id = $1", [id]);
    return NextResponse.json({ sale: res.rows[0], items: saleItemsRes.rows });
  } catch (error) {
    return NextResponse.json({ error: "Error fetching sale: " + error }, { status: 500 });
  }
}


export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async client=>({sale:await saveInvoice(client,'sale',await request.json(),id)}));
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async client=>{await voidInvoice(client,'sale',id);return {message:'Invoice voided; history preserved'};});
}
