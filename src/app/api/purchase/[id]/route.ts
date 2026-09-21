import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { financeWrite } from '@/lib/finance-http';
import { saveInvoice, voidInvoice, positiveId } from '@/lib/finance-service';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Fetch the specific purchase by ID
    const res = await pool.query("SELECT * FROM purchases WHERE id = $1", [id]);
    
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }   
    
    const purchaseItemsRes = await pool.query("SELECT * FROM purchase_items WHERE purchase_id = $1", [id]);
    return NextResponse.json({ purchase: res.rows[0], items: purchaseItemsRes.rows });
  } catch (error) {
    return NextResponse.json({ error: "Error fetching purchase: " + error }, { status: 500 });
  }
}


export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async client=>({purchase:await saveInvoice(client,'purchase',await request.json(),id)}));
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async client=>{await voidInvoice(client,'purchase',id);return {message:'Invoice voided; history preserved'};});
}
