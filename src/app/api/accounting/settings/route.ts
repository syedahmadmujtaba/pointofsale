import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {financeWrite} from '@/lib/finance-http';
import {accountDefaults,AccountingValidationError as Invalid,validDate} from '@/lib/accounting';
import {audit} from '@/lib/finance-service';
export async function GET(){
 const [settings,accounts,mappings]=await Promise.all([pool.query('SELECT *,closed_through::text AS closed_through FROM business_settings'),pool.query('SELECT * FROM chart_of_accounts ORDER BY account_code'),pool.query('SELECT * FROM accounting_account_mappings')]);
 return NextResponse.json({settings:settings.rows[0],accounts:accounts.rows,mappings:mappings.rows,roles:accountDefaults});
}
export async function PUT(request:Request){return financeWrite(request,async c=>{
 const b=await request.json();
 const before=(await c.query('SELECT *,closed_through::text AS closed_through FROM business_settings WHERE id=true FOR UPDATE')).rows[0];
 const settings={...before,...b.settings};
 if(typeof settings.name!=='string'||!settings.name.trim()||!/^[A-Z]{3}$/.test(settings.currency)||!Number.isInteger(Number(settings.fiscal_year_start))||Number(settings.fiscal_year_start)<1||Number(settings.fiscal_year_start)>12||!Number.isFinite(Number(settings.default_tax_rate))||Number(settings.default_tax_rate)<0||Number(settings.default_tax_rate)>100)throw new Invalid('Invalid business settings');
 if(settings.currency!==before.currency&&(await c.query('SELECT 1 FROM journal_entries LIMIT 1')).rows.length)throw new Invalid('Currency cannot change after accounting entries exist');
 if(settings.closed_through)validDate(String(settings.closed_through).slice(0,10));
 if(before.closed_through&&(!settings.closed_through||String(settings.closed_through).slice(0,10)<new Date(before.closed_through).toISOString().slice(0,10)))throw new Invalid('Reopening a closed period requires an explicit controlled migration');
 if(settings.closed_through&&String(settings.closed_through).slice(0,10)>new Date().toISOString().slice(0,10))throw new Invalid('Cannot close a future period');
 if(!/^[A-Za-z0-9-]{1,20}$/.test(settings.invoice_prefix)||!/^[A-Za-z0-9-]{1,20}$/.test(settings.purchase_prefix))throw new Invalid('Invalid invoice prefixes');
 for(const mapping of b.mappings??[]){
  const spec=accountDefaults[mapping.role as keyof typeof accountDefaults];
  if(!spec)throw new Invalid('Unknown posting role');
  const a=(await c.query('SELECT * FROM chart_of_accounts WHERE account_code=$1 FOR SHARE',[mapping.account_code])).rows;
  if(a.length!==1||!a[0].is_active||a[0].account_type!==spec[1])throw new Invalid(`Invalid account for ${mapping.role}`);
  await c.query('INSERT INTO accounting_account_mappings(role,account_code) VALUES($1,$2) ON CONFLICT(role) DO UPDATE SET account_code=excluded.account_code,updated_at=now()',[mapping.role,mapping.account_code]);
 }
 const updated=(await c.query(`UPDATE business_settings SET name=$1,currency=$2,fiscal_year_start=$3,closed_through=$4,default_tax_rate=$5,invoice_prefix=$6,purchase_prefix=$7 WHERE id=true RETURNING *`,[settings.name,settings.currency,settings.fiscal_year_start,settings.closed_through||null,settings.default_tax_rate,settings.invoice_prefix,settings.purchase_prefix])).rows[0];
 await audit(c,'configure','business',1,before,{settings:updated,mappings:b.mappings});return updated;
});}
export async function POST(request:Request){return financeWrite(request,async c=>{
 const b=await request.json();
 if(!/^[A-Za-z0-9-]{1,20}$/.test(b.account_code)||typeof b.account_name!=='string'||!b.account_name.trim()||!['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].includes(b.account_type))throw new Invalid('Invalid account');
 const a=(await c.query('INSERT INTO chart_of_accounts(account_code,account_name,account_type,sub_type) VALUES($1,$2,$3,$4) RETURNING *',[b.account_code,b.account_name,b.account_type,b.sub_type||'GENERAL'])).rows[0];
 await audit(c,'create','account',a.account_id,null,a);return a;
},201);}
