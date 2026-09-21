import { NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { pool } from './db';
import { AccountingValidationError } from './accounting';

export async function financeWrite(request:Request, operation:(client:PoolClient)=>Promise<unknown>,status=200){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor',$1,true)",[request.headers.get('x-pos-user') || 'system']);
    const result=await operation(client);
    await client.query('COMMIT');
    return NextResponse.json(result,{status});
  }catch(error){
    await client.query('ROLLBACK');
    const code=(error as {code?:string}).code;
    const expected=error instanceof AccountingValidationError || ['23505','23503','23514'].includes(code || '');
    if(!expected) console.error('Financial operation failed',error);
    return NextResponse.json({error:error instanceof AccountingValidationError ? error.message : expected?'The operation conflicts with existing records':'Financial operation failed; verify migrations and configuration'}, {status:expected?400:500});
  }finally{client.release();}
}
