import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {recordPayment} from '@/lib/payments';
export async function GET(){
  return NextResponse.json((await pool.query(`SELECT p.*,p.amount-COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id=p.id),0) AS unallocated FROM payments p ORDER BY id DESC`)).rows);
}
export async function POST(request:Request){
  return financeWrite(request,async c=>({payment:await recordPayment(c,await request.json())}),201);
}
