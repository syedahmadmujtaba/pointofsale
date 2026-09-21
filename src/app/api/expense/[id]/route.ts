import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,postExpense,reverseDocument,toMinorUnits,validDate,assertOpenPeriod} from '@/lib/accounting';
import {audit,positiveId,today} from '@/lib/finance-service';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async c=>{
  const old=(await c.query('SELECT * FROM expenses WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!old||old.voided_at)throw new Invalid('Expense not found or voided');
  await reverseDocument(c,'EXPENSE',id,today());
  await c.query('UPDATE expenses SET voided_at=now() WHERE id=$1',[id]);
  await audit(c,'void','expense',id,old,null);return {message:'Expense reversed',expense:old};
 });
}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const id=positiveId((await params).id);
 return financeWrite(request,async c=>{
  const b=await request.json();validDate(b.expense_date);
  if(!b.description||!toMinorUnits(b.amount))throw new Invalid('Description and positive amount required');
  const old=(await c.query('SELECT *,expense_date::text AS original_date FROM expenses WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!old||old.voided_at)throw new Invalid('Expense not found or voided');
  await assertOpenPeriod(c,old.original_date);
  await reverseDocument(c,'EXPENSE',id,b.expense_date);
  const expense=(await c.query('UPDATE expenses SET description=$2,amount=$3,expense_date=$4,category=$5,notes=$6 WHERE id=$1 RETURNING *',[id,b.description,b.amount,b.expense_date,b.category,b.notes])).rows[0];
  await postExpense(c,{...expense,expense_date:b.expense_date});await audit(c,'replace','expense',id,old,expense);return {expense};
 });
}
