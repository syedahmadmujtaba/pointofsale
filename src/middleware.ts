import {NextResponse,type NextRequest} from 'next/server';
import {verifySession} from './lib/session';
export async function middleware(request:NextRequest){
 const path=request.nextUrl.pathname,api=path.startsWith('/api/');
 const write=!['GET','HEAD','OPTIONS'].includes(request.method);
 if(api&&write&&request.headers.get('origin')!==request.nextUrl.origin){
  return NextResponse.json({error:'Same-origin request required'},{status:403});
 }
 if(path==='/login'||path==='/api/auth/login')return NextResponse.next();
 const session=await verifySession(request.cookies.get('pos_session')?.value);
 if(!session)return api?NextResponse.json({error:'Authentication required'},{status:401}):NextResponse.redirect(new URL('/login',request.url));
 const privileged=path.startsWith('/api/accounting')||path.startsWith('/api/payments')||path.startsWith('/api/inventory');
 if(api&&path!=='/api/auth/logout'&&((write&&session.role==='viewer')||(privileged&&session.role==='clerk')||
   (request.method==='DELETE'&&session.role==='clerk')||
   (path.startsWith('/api/accounting/settings')&&write&&session.role!=='admin'))){
  return NextResponse.json({error:'Insufficient permission'},{status:403});
 }
 const headers=new Headers(request.headers);
 headers.set('x-pos-user',String(session.id));headers.set('x-pos-role',session.role);
 return NextResponse.next({request:{headers}});
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)']};
