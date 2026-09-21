import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { financeWrite } from '@/lib/finance-http';
import { saveInvoice, voidInvoice, positiveId } from '@/lib/finance-service';

export async function GET() {
  try {
    // Fetch all sales
    const res = await pool.query("SELECT * FROM sales WHERE voided_at IS NULL ORDER BY sale_date DESC");
    return NextResponse.json(res.rows);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching sales" + error }, { status: 500 });
  }
}


export async function POST(request:Request){
 return financeWrite(request,async client=>({sale:await saveInvoice(client,'sale',await request.json())}),201);
}
