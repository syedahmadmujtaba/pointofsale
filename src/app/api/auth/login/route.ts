import {scryptSync,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {pool} from '@/lib/db';
import {signSession} from '@/lib/session';
export async function POST(request:Request){
 const {username,password}=await request.json();
 if(typeof username!=='string'||typeof password!=='string'||username.length>100||password.length>1024)return NextResponse.json({error:'Invalid credentials'},{status:400});
 const name=username.trim().toLowerCase();
 const attempt=(await pool.query(`INSERT INTO login_attempts(username,attempts) VALUES($1,1)
  ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
  window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,[name])).rows[0];
 if(attempt.attempts>10)return NextResponse.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
 const user=(await pool.query('SELECT * FROM app_users WHERE username=$1 AND active=true',[name])).rows[0];
 const [salt,hash]=(user?.password_hash||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
 const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,'hex');
 if(!user||actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:'Invalid credentials'},{status:401});
 await pool.query('DELETE FROM login_attempts WHERE username=$1',[name]);
 const response=NextResponse.json({username:user.username,role:user.role});
 response.cookies.set('pos_session',await signSession({id:user.id,username:user.username,role:user.role,expires:Date.now()+3600000}),
  {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:3600});
 return response;
}
