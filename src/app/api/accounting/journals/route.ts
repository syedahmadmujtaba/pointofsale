import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,postJournal,validateJournal,validDate} from '@/lib/accounting';
import {audit,positiveId} from '@/lib/finance-service';
export async function GET(){return NextResponse.json((await pool.query('SELECT * FROM journal_proposals ORDER BY id DESC')).rows);}
export async function POST(request:Request){return financeWrite(request,async c=>{
 const b=await request.json(), actor=positiveId(request.headers.get('x-pos-user'));
 if(b.approve_id){
  if(request.headers.get('x-pos-role')!=='admin')throw new Invalid('Administrator approval required');
  const p=(await c.query('SELECT * FROM journal_proposals WHERE id=$1 FOR UPDATE',[positiveId(b.approve_id)])).rows[0];
  if(!p||p.journal_id||p.created_by===actor)throw new Invalid('A different administrator must approve a pending proposal');
  const journal=await postJournal(c,{date:new Date(p.entry_date).toISOString().slice(0,10),description:p.description,referenceType:'MANUAL',referenceId:p.id,lines:p.lines});
  await c.query('UPDATE journal_proposals SET approved_by=$1,journal_id=$2 WHERE id=$3',[actor,journal,p.id]);
  await audit(c,'approve','journal_proposal',p.id,p,{journal});return {journal_id:journal};
 }
 validDate(b.date);if(!b.description)throw new Invalid('Description is required');
 const lines=validateJournal(b.lines||[]);
 const proposal=(await c.query('INSERT INTO journal_proposals(description,entry_date,lines,created_by) VALUES($1,$2,$3,$4) RETURNING *',[b.description,b.date,JSON.stringify(lines),actor])).rows[0];
 await audit(c,'propose','journal_proposal',proposal.id,null,proposal);return proposal;
},201);}
