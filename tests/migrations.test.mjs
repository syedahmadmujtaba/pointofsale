import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import {migrate} from '../scripts/migration-runner.mjs';
test('migration runner is atomic, repeatable and checks existing schemas',async()=>{
 const db=new PGlite();
 const client={query:async(sql,params)=>!params&&sql.includes(';')?(await db.exec(sql)).at(-1)||{rows:[]}:db.query(sql,params)};
 const files=await Promise.all((await fs.readdir('migrations')).filter(f=>f.endsWith('.sql')).sort().map(async name=>({name,sql:await fs.readFile(`migrations/${name}`,'utf8')})));
 try{
  const status=await migrate(client,files,{statusOnly:true});assert.ok(status.every(r=>r.status==='pending'));
  assert.equal((await db.query("SELECT to_regclass('public.schema_migrations') AS t")).rows[0].t,null);
  await assert.rejects(()=>migrate(client,[...files,{name:'999_invalid.sql',sql:'SELECT missing_column FROM missing_table'}]));
  assert.equal((await db.query("SELECT to_regclass('public.products') AS t")).rows[0].t,null);
  await migrate(client,files);
  assert.ok((await migrate(client,files)).every(r=>r.status==='applied'));
  await assert.rejects(()=>migrate(client,files.map((f,i)=>i?f:{...f,sql:f.sql+'\n-- changed'})),/Applied migration changed/);
 }finally{await db.close();}
 const partial=new PGlite();
 try{
  await partial.exec('CREATE TABLE products(id integer)');
  const c={query:(sql,params)=>partial.query(sql,params)};
  await assert.rejects(()=>migrate(c,files,{statusOnly:true}),/Existing schema is incomplete/);
 }finally{await partial.close();}
});
