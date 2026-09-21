import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signSession,verifySession} from '../src/lib/session.ts';
test('signed sessions reject tampering and expiration',async()=>{
 process.env.SESSION_SECRET='test-only-session-secret-not-for-production-123';
 const session={id:1,username:'admin',role:'admin',expires:Date.now()+10000};
 const token=await signSession(session);
 assert.deepEqual(await verifySession(token),session);
 const [payload,signature]=token.split('.');
 assert.equal(await verifySession(`${payload.slice(0,-1)}X.${signature}`),null);
 assert.equal(await verifySession(await signSession({...session,expires:Date.now()-1})),null);
 assert.equal(await verifySession(undefined),null);
});

test('middleware enforces roles, origin and authenticated logout',async()=>{
 const {NextRequest}=await import('next/server');
 const {middleware}=await import('../src/middleware.ts');
 process.env.SESSION_SECRET='test-only-session-secret-not-for-production-123';
 const request=async(role,path,method='POST',origin='http://localhost')=>new NextRequest(`http://localhost${path}`,{method,headers:{origin,cookie:`pos_session=${await signSession({id:7,username:'test',role,expires:Date.now()+10000})}`,'x-pos-user':'999'}});
 assert.equal((await middleware(await request('viewer','/api/sale'))).status,403);
 assert.equal((await middleware(await request('viewer','/api/auth/logout'))).status,200);
 assert.equal((await middleware(await request('clerk','/api/payments','GET'))).status,403);
 assert.equal((await middleware(await request('admin','/api/sale','POST','https://attacker.example'))).status,403);
 const allowed=await middleware(await request('admin','/api/sale'));
 assert.equal(allowed.status,200);
 assert.equal(allowed.headers.get('x-middleware-request-x-pos-user'),'7');
 assert.equal((await middleware(new NextRequest('http://localhost/api/sale'))).status,401);
});
