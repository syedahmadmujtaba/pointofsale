import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { financeWrite } from '@/lib/finance-http';
import { saveInvoice, voidInvoice, positiveId } from '@/lib/finance-service';

export async function GET() {
  try {
    const res = await pool.query("SELECT * FROM purchases WHERE voided_at IS NULL ORDER BY purchase_date DESC");
    return NextResponse.json(res.rows);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching purchases: " + error }, { status: 500 });
  }
}


export async function POST(request:Request){
 return financeWrite(request,async client=>({purchase:await saveInvoice(client,'purchase',await request.json())}),201);
}
