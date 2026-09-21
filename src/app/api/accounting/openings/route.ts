import {financeWrite} from '@/lib/finance-http';
import {AccountingValidationError as Invalid,decimal,postJournal,resolveAccount,toMinorUnits,validDate} from '@/lib/accounting';
import {audit,invoiceTypes,positiveId} from '@/lib/finance-service';
export async function POST(request:Request){return financeWrite(request,async c=>{
 if(request.headers.get('x-pos-role')!=='admin')throw new Invalid('Administrator permission required');
 const b=await request.json(),type=b.party_type==='customer'?'sale':b.party_type==='vendor'?'purchase':null;
 if(!type)throw new Invalid('Choose customer or vendor');
 const cfg=invoiceTypes[type],party=positiveId(b.party_id),date=validDate(b.date),amount=toMinorUnits(b.amount);
 if(!amount||!b.reference)throw new Invalid('Opening amount and unique reference required');
 const doc=(await c.query(`INSERT INTO ${cfg.table}(invoice_number,${cfg.partyKey},subtotal,discount,tax_amount,total_amount,amount_paid,${cfg.date},due_date,engine_version,document_kind) VALUES($1,$2,0,0,0,$3,0,$4,$4,2,'opening') RETURNING *`,[b.reference,party,decimal(amount),date])).rows[0];
 const control=await resolveAccount(c,type==='sale'?'receivable':'payable'),equity=await resolveAccount(c,'equity');
 await postJournal(c,{date,description:`Opening balance ${b.reference}`,referenceType:cfg.ref,referenceId:doc.id,lines:type==='sale'?[{accountId:control,debit:decimal(amount)},{accountId:equity,credit:decimal(amount)}]:[{accountId:equity,debit:decimal(amount)},{accountId:control,credit:decimal(amount)}]});
 await audit(c,'opening',type,doc.id,null,doc);return doc;
},201);}
