import {randomBytes,scryptSync} from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
const username=process.env.POS_USERNAME?.trim().toLowerCase(), password=process.env.POS_PASSWORD, role=process.env.POS_ROLE||'admin';
if(!username||username.length>100||!password||password.length<5||password.length>1024||!['admin','accountant','clerk','viewer'].includes(role))throw new Error('Set POS_USERNAME, POS_PASSWORD (12+ characters), and optionally POS_ROLE');
const salt=randomBytes(16).toString('hex');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try{await client.connect();await client.query('INSERT INTO app_users(username,password_hash,role) VALUES($1,$2,$3)',[username,`${salt}:${scryptSync(password,salt,64).toString('hex')}`,role]);console.log('User created');}finally{await client.end();}
