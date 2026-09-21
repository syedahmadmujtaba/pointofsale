import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,postExpense,toMinorUnits,validDate} from '@/lib/accounting';
import {audit} from '@/lib/finance-service';
export async function GET(){return NextResponse.json((await pool.query('SELECT * FROM expenses WHERE voided_at IS NULL ORDER BY expense_date DESC')).rows);}
export async function POST(request:Request){return financeWrite(request,async c=>{
 const b=await request.json();validDate(b.expense_date);
 if(!b.description||!toMinorUnits(b.amount))throw new Invalid('Description and positive amount required');
 const expense=(await c.query('INSERT INTO expenses(description,amount,expense_date,category,notes) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.description,b.amount,b.expense_date,b.category,b.notes])).rows[0];
 const journal=await postExpense(c,{...expense,expense_date:b.expense_date});await audit(c,'create','expense',expense.id,null,expense);
 return {expense,accounting:{journal_entry_id:journal}};
},201);}
