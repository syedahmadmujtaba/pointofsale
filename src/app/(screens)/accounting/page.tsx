'use client';
import {useEffect,useRef,useState} from 'react';

async function api(path:string,body?:unknown,method='POST'){
 const res=await fetch(path,body===undefined?undefined:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed');return data;
}
const today=()=>new Date().toISOString().slice(0,10);
function Table({rows}:{rows:any[]}){
 if(!rows.length)return <p className="p-4 text-gray-500">No records</p>;
 const keys=Object.keys(rows[0]);
 return <div className="overflow-auto max-h-[60vh]"><table className="w-full text-sm"><thead><tr>{keys.map(k=><th key={k} className="p-2 text-left border-b">{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{keys.map(k=><td key={k} className="p-2 border-b">{typeof r[k]==='object'?JSON.stringify(r[k]):String(r[k]??'')}</td>)}</tr>)}</tbody></table></div>;
}
export default function Accounting(){
 const paymentRequest=useRef<{payload:string,key:string}|null>(null);
 const [tab,setTab]=useState('Payments'),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [config,setConfig]=useState<any>(null),[customers,setCustomers]=useState<any[]>([]),[vendors,setVendors]=useState<any[]>([]),[invoices,setInvoices]=useState<any[]>([]),[payments,setPayments]=useState<any[]>([]),[products,setProducts]=useState<any[]>([]),[inventory,setInventory]=useState<any>(null),[proposals,setProposals]=useState<any[]>([]);
 const [report,setReport]=useState('trial-balance'),[rows,setRows]=useState<any[]>([]),[kind,setKind]=useState('receipt'),[party,setParty]=useState(''),[invoice,setInvoice]=useState('');
 const [mappingRole,setMappingRole]=useState('cash'),[accountCode,setAccountCode]=useState(''),[selectedLedger,setSelectedLedger]=useState<number[]>([]);
 const load=async()=>{
  const [c,cu,v,p,pr,i,j]=await Promise.all([api('/api/accounting/settings'),api('/api/customer'),api('/api/vendor'),api('/api/payments'),api('/api/product'),api('/api/inventory'),api('/api/accounting/journals')]);
  setConfig(c);setCustomers(cu);setVendors(v);setPayments(p);setProducts(pr);setInventory(i);setProposals(j);
 };
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 useEffect(()=>{api(kind==='receipt'?'/api/sale':'/api/purchase').then(setInvoices).catch(e=>setError(e.message));setParty('');setInvoice('');},[kind]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');setMessage('');try{await fn();setMessage('Saved successfully');await load();setInvoices(await api(kind==='receipt'?'/api/sale':'/api/purchase'));}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}};
 const submit=(fn:(data:any)=>Promise<unknown>)=>(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));run(()=>fn(data));};
 const parties=kind==='receipt'?customers:vendors;
 const available=invoices.filter(i=>String(i[kind==='receipt'?'customer_id':'vendor_id'])===party&&!i.voided_at&&Number(i.total_amount)-Number(i.credited_amount||0)-Number(i.amount_paid)>0);
 const field='border rounded p-2 w-full bg-white';
 const button='rounded bg-indigo-700 text-white px-4 py-2 disabled:opacity-50';
 return <main className="max-w-6xl mx-auto space-y-5 p-4">
  <h1 className="text-3xl font-bold">Accounting</h1>
  <nav className="flex flex-wrap gap-2">{['Payments','Reports','Settings','Inventory','Journals','Opening balances','Bank reconciliation'].map(t=><button key={t} onClick={()=>{setTab(t);setRows([]);}} className={`px-3 py-2 rounded ${t===tab?'bg-indigo-700 text-white':'bg-gray-100'}`}>{t}</button>)}</nav>
  {error&&<p role="alert" className="bg-red-50 text-red-800 p-3">{error}</p>}{message&&<p role="status" className="text-green-800">{message}</p>}
  {!config?<p>Loading accounting settings…</p>:<>
  {tab==='Payments'&&<section className="space-y-4"><h2 className="text-xl font-semibold">Customer receipts and supplier payments</h2>
   <form onSubmit={submit(async d=>{
    const body={...d,kind,party_id:Number(party),allocations:invoice?[{invoice_id:Number(invoice),amount:d.allocated}]:[]};
    const payload=JSON.stringify(body);
    if(paymentRequest.current?.payload!==payload)paymentRequest.current={payload,key:crypto.randomUUID()};
    await api('/api/payments',{...body,idempotency_key:paymentRequest.current!.key});
    paymentRequest.current=null;
   })} className="grid md:grid-cols-3 gap-3">
    <label>Payment type<select className={field} value={kind} onChange={e=>setKind(e.target.value)}><option value="receipt">Customer receipt</option><option value="supplier_payment">Supplier payment</option></select></label>
    <label>Customer / supplier<select required className={field} value={party} onChange={e=>{setParty(e.target.value);setInvoice('');}}><option value="">Select</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Amount<input required name="amount" type="number" min="0.01" step="0.01" className={field}/></label>
    <label>Date<input required name="payment_date" type="date" defaultValue={today()} className={field}/></label>
    <label>Paid through<select name="payment_method" className={field}><option value="cash">Cash</option><option value="bank">Bank</option></select></label>
    <label>Reference<input name="reference" className={field}/></label>
    <label>Apply to invoice<select className={field} value={invoice} onChange={e=>setInvoice(e.target.value)}><option value="">Keep as unallocated advance</option>{available.map(i=><option key={i.id} value={i.id}>{i.invoice_number} — due {(Number(i.total_amount)-Number(i.credited_amount||0)-Number(i.amount_paid)).toFixed(2)}</option>)}</select></label>
    {invoice&&<label>Allocation amount<input name="allocated" required type="number" min="0.01" step="0.01" className={field}/></label>}
    <button disabled={busy} className={button}>Record payment</button>
   </form>
   <Table rows={payments}/>
   <h3 className="font-semibold">Allocate an existing advance</h3>
   <form onSubmit={submit(d=>api(`/api/payments/${Number(d.payment_id)}`,{invoice_id:Number(d.invoice_id),amount:d.amount},'PUT'))} className="flex gap-3">
    <input required name="payment_id" type="number" min="1" placeholder="Payment ID" aria-label="Payment ID" className={field}/>
    <input required name="invoice_id" type="number" min="1" placeholder="Invoice ID" aria-label="Invoice ID" className={field}/>
    <input required name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" aria-label="Allocation amount" className={field}/>
    <button disabled={busy} className={button}>Allocate advance</button>
   </form>
   <form onSubmit={submit(d=>api(`/api/payments/${Number(d.id)}`,{},'DELETE'))} className="flex gap-3"><label>Payment ID to reverse<input required name="id" type="number" min="1" className={field}/></label><button disabled={busy} className={button}>Reverse payment</button></form>
  </section>}
  {tab==='Reports'&&<section className="space-y-4"><form onSubmit={submit(async d=>{
    const result=await api(`/api/accounting/reports?${new URLSearchParams({type:report,...d})}`);
    setRows(Array.isArray(result)?result:Object.entries(result).map(([section,value])=>({section,value})));
   })} className="flex flex-wrap items-end gap-3">
   <label>Report<select className={field} value={report} onChange={e=>setReport(e.target.value)}>{['trial-balance','ledger','profit-loss','aging','statement','reconciliation','audit'].map(r=><option key={r}>{r}</option>)}</select></label>
   <label>As of<input type="date" name="asOf" defaultValue={today()} className={field}/></label>
   <label>From (profit and loss)<input type="date" name="from" className={field}/></label>
   <label>Party type<select name="partyType" className={field}><option value="customer">Customers</option><option value="vendor">Suppliers</option></select></label>
   <label>Party ID (optional)<input name="partyId" type="number" min="1" className={field}/></label>
   <button disabled={busy} className={button}>Generate report</button></form><Table rows={rows}/></section>}
  {tab==='Settings'&&<section className="space-y-5"><h2 className="text-xl font-semibold">Business settings (administrator)</h2>
   <form onSubmit={submit(d=>api('/api/accounting/settings',{settings:d},'PUT'))} className="grid md:grid-cols-3 gap-3">
    {['name','currency','invoice_prefix','purchase_prefix','fiscal_year_start','default_tax_rate'].map(k=><label key={k}>{k.replaceAll('_',' ')}<input required name={k} defaultValue={config.settings[k]} className={field}/></label>)}
    <label>Close periods through<input name="closed_through" type="date" defaultValue={config.settings.closed_through?.slice(0,10)||''} className={field}/></label>
    <p className="text-sm">Closing a period prevents backdated postings. Existing journals cannot be edited.</p><button disabled={busy} className={button}>Save settings</button>
   </form>
   <h2 className="text-xl font-semibold">Posting account mapping</h2><form onSubmit={submit(()=>api('/api/accounting/settings',{mappings:[{role:mappingRole,account_code:accountCode}]},'PUT'))} className="flex gap-3">
    <select className={field} value={mappingRole} onChange={e=>{setMappingRole(e.target.value);setAccountCode('');}}>{Object.keys(config.roles).map(r=><option key={r}>{r}</option>)}</select>
    <select required className={field} value={accountCode} onChange={e=>setAccountCode(e.target.value)}><option value="">Choose account</option>{config.accounts.filter((a:any)=>a.account_type===config.roles[mappingRole][1]).map((a:any)=><option key={a.account_id} value={a.account_code}>{a.account_code} — {a.account_name}</option>)}</select><button disabled={busy} className={button}>Save mapping</button>
   </form><Table rows={Object.entries(config.roles).map(([role,value]:any)=>({role,account_code:config.mappings.find((m:any)=>m.role===role)?.account_code||value[0]}))}/>
   <h2 className="text-xl font-semibold">Chart of accounts</h2><Table rows={config.accounts}/>
   <h2 className="text-xl font-semibold">Customer credit limit</h2>
   <form onSubmit={submit(d=>api('/api/accounting/credit-limits',{customer_id:Number(d.customer_id),credit_limit:d.credit_limit===''?null:d.credit_limit},'PUT'))} className="flex gap-3">
    <select name="customer_id" className={field}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <input name="credit_limit" type="number" min="0" step="0.01" placeholder="Blank for unlimited" aria-label="Credit limit" className={field}/>
    <button disabled={busy} className={button}>Set credit limit</button>
   </form>
   <form onSubmit={submit(d=>api('/api/accounting/settings',d))} className="flex gap-3"><input name="account_code" placeholder="Account code" required className={field}/><input name="account_name" placeholder="Account name" required className={field}/><select name="account_type" className={field}>{['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].map(t=><option key={t}>{t}</option>)}</select><button disabled={busy} className={button}>Add account</button></form>
  </section>}
  {tab==='Inventory'&&<section className="space-y-4"><p>Invoices use Main warehouse. Transfer stock to Main before selling it. Costing uses weighted average.</p>
   <form onSubmit={submit(d=>api('/api/inventory',{...d,product_id:Number(d.product_id),quantity:Number(d.quantity),from_warehouse:Number(d.from_warehouse),to_warehouse:Number(d.to_warehouse)}))} className="grid md:grid-cols-3 gap-3">
    <label>Operation<select name="action" className={field}><option value="adjust">Adjust Main stock</option><option value="transfer">Transfer stock</option></select></label>
    <label>Product<select required name="product_id" className={field}>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Quantity (negative for loss)<input required name="quantity" type="number" step="1" className={field}/></label>
    {['from_warehouse','to_warehouse'].map(k=><label key={k}>{k.replaceAll('_',' ')}<select name={k} className={field}>{inventory?.warehouses.map((w:any)=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>)}
    <label>Reason<input name="reason" className={field}/></label><label>Date<input type="date" name="date" defaultValue={today()} className={field}/></label><button disabled={busy} className={button}>Record movement</button>
   </form><form onSubmit={submit(d=>api('/api/inventory',{action:'warehouse',name:d.name}))} className="flex gap-3"><input required name="name" placeholder="New warehouse name" className={field}/><button disabled={busy} className={button}>Add warehouse</button></form><Table rows={inventory?.stock||[]}/><Table rows={inventory?.movements||[]}/></section>}
  {tab==='Journals'&&<section className="space-y-4"><p>Submit balanced opening or correction entries. Another administrator must approve them. Do not change historical entries directly.</p>
   <form onSubmit={submit(d=>api('/api/accounting/journals',{date:d.date,description:d.description,lines:[{accountId:Number(d.debit),debit:d.amount},{accountId:Number(d.credit),credit:d.amount}]}))} className="grid md:grid-cols-3 gap-3">
    <label>Description<input name="description" required className={field}/></label><label>Date<input name="date" type="date" required defaultValue={today()} className={field}/></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required className={field}/></label>
    {['debit','credit'].map(side=><label key={side}>{side} account<select name={side} className={field}>{config.accounts.map((a:any)=><option key={a.account_id} value={a.account_id}>{a.account_code} — {a.account_name}</option>)}</select></label>)}<button disabled={busy} className={button}>Submit for approval</button>
   </form><Table rows={proposals}/><form onSubmit={submit(d=>api('/api/accounting/journals',{approve_id:Number(d.id)}))} className="flex gap-3"><input name="id" type="number" required min="1" placeholder="Proposal ID" className={field}/><button disabled={busy} className={button}>Approve journal</button></form></section>}
  {tab==='Opening balances'&&<form onSubmit={submit(d=>api('/api/accounting/openings',{...d,party_id:Number(d.party_id)}))} className="grid md:grid-cols-3 gap-3">
   <p className="md:col-span-3">Administrator: enter an unpaid customer or supplier opening balance against Owner Equity. Do not duplicate invoices already imported.</p>
   <label>Party type<select name="party_type" className={field}><option value="customer">Customer</option><option value="vendor">Supplier</option></select></label><label>Party ID<input required name="party_id" type="number" min="1" className={field}/></label><label>Amount<input required name="amount" type="number" min="0.01" step="0.01" className={field}/></label><label>Date<input required name="date" type="date" defaultValue={today()} className={field}/></label><label>Unique reference<input required name="reference" className={field}/></label><button disabled={busy} className={button}>Record opening balance</button>
  </form>}
  {tab==='Bank reconciliation'&&<section className="space-y-4"><form onSubmit={submit(async d=>{setRows(await api(`/api/accounting/reconcile?accountId=${d.account_id}`));setSelectedLedger([]);})} className="flex gap-3"><select name="account_id" className={field}>{config.accounts.filter((a:any)=>['CASH','BANK'].includes(a.sub_type)).map((a:any)=><option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}</select><button disabled={busy} className={button}>Load uncleared entries</button></form>
   {rows.map(r=><label key={r.ledger_id} className="block"><input type="checkbox" checked={selectedLedger.includes(r.ledger_id)} onChange={e=>setSelectedLedger(e.target.checked?[...selectedLedger,r.ledger_id]:selectedLedger.filter(i=>i!==r.ledger_id))}/> {String(r.transaction_date).slice(0,10)} — {r.description} — debit {r.debit_amount}, credit {r.credit_amount}</label>)}
   <form onSubmit={submit(d=>api('/api/accounting/reconcile',{...d,account_id:rows[0]?.account_id,ledger_ids:selectedLedger}))} className="flex gap-3"><label>Statement date<input required name="date" type="date" defaultValue={today()} className={field}/></label><label>Statement closing balance<input required name="balance" type="number" step="0.01" className={field}/></label><button disabled={busy||!selectedLedger.length} className={button}>Reconcile selected entries</button></form></section>}
  </>}
 </main>;
}
