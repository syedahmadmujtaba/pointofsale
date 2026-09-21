import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,toMinorUnits,decimal} from '@/lib/accounting';
import {positiveId,audit} from '@/lib/finance-service';
export async function PUT(request:Request){return financeWrite(request,async c=>{
 if(request.headers.get('x-pos-role')!=='admin')throw new Invalid('Administrator permission required');
 const b=await request.json(),id=positiveId(b.customer_id);
 const value=b.credit_limit===null?null:decimal(toMinorUnits(b.credit_limit));
 const before=(await c.query('SELECT * FROM customers WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!before)throw new Invalid('Customer not found');
 await c.query('UPDATE customers SET credit_limit=$1 WHERE id=$2',[value,id]);
 await audit(c,'credit_limit','customer',id,{credit_limit:before.credit_limit},{credit_limit:value});return {credit_limit:value};
});}
