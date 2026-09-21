import {financeWrite} from '@/lib/finance-http';
import {voidPayment} from '@/lib/payments';
import {positiveId} from '@/lib/finance-service';
import {allocatePayment} from '@/lib/allocate-payment';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async c=>allocatePayment(c,id,await request.json()));
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async c=>{await voidPayment(c,id);return {message:'Payment reversed'};});
}
