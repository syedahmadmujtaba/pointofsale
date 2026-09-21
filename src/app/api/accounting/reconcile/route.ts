import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,toMinorUnits,validDate,decimal} from '@/lib/accounting';
import {positiveId,audit} from '@/lib/finance-service';
export async function GET(request:Request){
 const id=positiveId(new URL(request.url).searchParams.get('accountId'));
 return NextResponse.json((await pool.query('SELECT g.* FROM general_ledger g LEFT JOIN bank_reconciliation_lines r ON r.ledger_id=g.ledger_id WHERE g.account_id=$1 AND r.ledger_id IS NULL ORDER BY transaction_date,ledger_id',[id])).rows);
}
export async function POST(request:Request){return financeWrite(request,async c=>{
 const b=await request.json(),id=positiveId(b.account_id),date=validDate(b.date);
 const account=(await c.query("SELECT * FROM chart_of_accounts WHERE account_id=$1 AND account_type='ASSET' AND sub_type IN ('BANK','CASH') FOR UPDATE",[id])).rows[0];
 if(!account)throw new Invalid('Choose a cash or bank account');
 const ids=(b.ledger_ids||[]).map(positiveId);
 if(!ids.length||new Set(ids).size!==ids.length)throw new Invalid('Choose unique uncleared ledger entries');
 const rows=(await c.query(`SELECT g.* FROM general_ledger g LEFT JOIN bank_reconciliation_lines r ON r.ledger_id=g.ledger_id WHERE g.ledger_id=ANY($1::int[]) AND g.account_id=$2 AND g.transaction_date<=$3 AND r.ledger_id IS NULL FOR UPDATE OF g`,[ids,id,date])).rows;
 if(rows.length!==ids.length)throw new Invalid('Selected entries are already cleared or outside the statement');
 const previous=(await c.query('SELECT * FROM bank_reconciliations WHERE account_id=$1 ORDER BY statement_date DESC LIMIT 1',[id])).rows[0];
 if(previous&&date<=new Date(previous.statement_date).toISOString().slice(0,10))throw new Invalid('Statement must follow previous reconciliation');
 const signed=(v:any)=>String(v).startsWith('-')?-toMinorUnits(String(v).slice(1)):toMinorUnits(v);
 const expected=signed(previous?.statement_balance||0)+rows.reduce((s,r)=>s+toMinorUnits(r.debit_amount)-toMinorUnits(r.credit_amount),0);
 if(signed(b.balance)!==expected)throw new Invalid('Statement balance does not equal previous cleared balance plus selected entries');
 const rec=(await c.query('INSERT INTO bank_reconciliations(account_id,statement_date,statement_balance,reconciled_by) VALUES($1,$2,$3,$4) RETURNING *',[id,date,b.balance,positiveId(request.headers.get('x-pos-user'))])).rows[0];
 for(const row of rows)await c.query('INSERT INTO bank_reconciliation_lines(ledger_id,reconciliation_id) VALUES($1,$2)',[row.ledger_id,rec.id]);
 await audit(c,'reconcile','bank',rec.id,null,rec);return rec;
},201);}
