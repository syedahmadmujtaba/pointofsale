import {createHash} from 'node:crypto';

export function baselineColumns(sql){
 const result=[];
 for(const table of sql.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)){
  for(const line of table[2].split('\n')){
   const column=line.trim().match(/^(\w+)\s/);
   if(column)result.push(`${table[1]}.${column[1]}`);
  }
 }
 if(result.length<50)throw new Error('Cannot parse baseline schema');
 return result;
}
const checksum=sql=>createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');

export async function migrate(client,files,{statusOnly=false}={}){
 await client.query(statusOnly?'BEGIN READ ONLY':'BEGIN');
 try{
  if(!statusOnly)await client.query('SELECT pg_advisory_xact_lock($1)',[527244173]);
  const exists=(await client.query("SELECT to_regclass('public.schema_migrations') AS migrations, to_regclass('public.products') AS products")).rows[0];
  const applied=exists.migrations?(await client.query('SELECT * FROM public.schema_migrations')).rows:[];
  const completed=new Map(applied.map(r=>[r.name,r]));
  const results=[];
  if(!statusOnly){
   await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now(),checksum text)');
   await client.query('ALTER TABLE public.schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
  }
  for(const {name,sql} of files){
   const hash=checksum(sql),previous=completed.get(name);
   if(previous){
    if(previous.checksum&&previous.checksum!==hash)throw new Error(`Applied migration changed: ${name}`);
    results.push({name,status:'applied'});continue;
   }
   let adopted=false;
   if(name==='000_baseline.sql'&&exists.products){
    const actual=new Set((await client.query("SELECT table_name||'.'||column_name AS column FROM information_schema.columns WHERE table_schema='public'")).rows.map(r=>r.column));
    const missing=baselineColumns(sql).filter(column=>!actual.has(column));
    if(missing.length)throw new Error(`Existing schema is incomplete: ${missing.join(', ')}`);
    adopted=true;
   }
   results.push({name,status:adopted?'adopt existing schema':statusOnly?'pending':'applied'});
   if(statusOnly)continue;
   if(!adopted)await client.query(sql);
   // The imported pg_dump baseline clears search_path; restore it before recording.
   await client.query('SET LOCAL search_path=public');
   await client.query('INSERT INTO public.schema_migrations(name,checksum) VALUES($1,$2)',[name,hash]);
  }
  await client.query(statusOnly?'ROLLBACK':'COMMIT');
  return results;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
