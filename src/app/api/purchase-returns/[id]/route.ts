import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {createReturn,voidReturn} from '@/lib/returns';
import {positiveId} from '@/lib/finance-service';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Fetch the specific purchase return by ID
    const res = await pool.query("SELECT * FROM purchase_returns WHERE id = $1", [id]);
    
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Purchase return not found" }, { status: 404 });
    }
    const returnItemsRes = await pool.query("SELECT * FROM purchase_return_items WHERE purchase_return_id = $1", [id]);
    
    return NextResponse.json({ purchase_return: res.rows[0], items: returnItemsRes.rows });
  } catch (error) {
    return NextResponse.json({ error: "Error fetching purchase return: " + error }, { status: 500 });
  }
}


export async function PUT(){return NextResponse.json({error:'Posted returns cannot be edited. Reverse the return and create a corrected return.'},{status:409});}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);return financeWrite(request,async c=>{await voidReturn(c,'purchase',id);return {message:'Return reversed'};});
}
