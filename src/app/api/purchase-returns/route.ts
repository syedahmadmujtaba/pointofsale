import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {createReturn,voidReturn} from '@/lib/returns';
import {positiveId} from '@/lib/finance-service';
export async function GET() {
  try {
      // Fetch all purchase returns
      const res = await pool.query(`
        SELECT pr.*, v.name as vendor_name 
        FROM purchase_returns pr 
        LEFT JOIN vendors v ON pr.vendor_id = v.id 
        ORDER BY pr.id ASC
      `);
      return NextResponse.json(res.rows);
    } catch (error) {
    return NextResponse.json({ error: "Error fetching purchase returns: " + error }, { status: 500 });
  }
}


export async function POST(request:Request){return financeWrite(request,async c=>({purchase_return:await createReturn(c,'purchase',await request.json())}),201);}
