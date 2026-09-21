import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {migrate} from './migration-runner.mjs';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
if(!url)throw new Error('Configure DATABASE_URL_UNPOOLED or DATABASE_URL');
const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../migrations');
const files=await Promise.all((await fs.readdir(directory)).filter(n=>/^\d+_.+\.sql$/.test(n)).sort().map(async name=>({name,sql:await fs.readFile(path.join(directory,name),'utf8')})));
const client=new pg.Client({connectionString:url,connectionTimeoutMillis:10000});
try{await client.connect();console.table(await migrate(client,files,{statusOnly:process.argv.includes('--status')}));}
catch(error){console.error('Migration failed:',error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[connection redacted]'));process.exitCode=1;}
finally{await client.end();}
