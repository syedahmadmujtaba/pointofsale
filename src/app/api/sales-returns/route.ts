import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {createReturn,voidReturn} from '@/lib/returns';
import {positiveId} from '@/lib/finance-service';
export async function GET() {
  try {
      // Fetch all sales returns
      const res = await pool.query(`
        SELECT sr.*, c.name as customer_name 
        FROM sale_returns sr 
        LEFT JOIN customers c ON sr.customer_id = c.id 
        ORDER BY sr.id ASC
      `);
      return NextResponse.json(res.rows);
    
  } catch (error) {
    return NextResponse.json({ error: "Error fetching sales returns: " + error }, { status: 500 });
  }
}


export async function POST(request:Request){return financeWrite(request,async c=>({sale_return:await createReturn(c,'sale',await request.json())}),201);}
