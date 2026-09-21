export type Session = {id:number; username:string; role:'admin'|'accountant'|'clerk'|'viewer'; expires:number};
const encoder=new TextEncoder();
function base64(bytes:Uint8Array){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function decode(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function key(){
 const secret=process.env.SESSION_SECRET;
 if(!secret||secret.length<32)throw new Error('Configure SESSION_SECRET with at least 32 random characters');
 return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signSession(session:Session){
 const payload=base64(encoder.encode(JSON.stringify(session)));
 return `${payload}.${base64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),encoder.encode(payload))))}`;
}
export async function verifySession(token:string|undefined):Promise<Session|null>{
 try{
  if(!token)return null;
  const [payload,signature,extra]=token.split('.');if(extra||!signature)return null;
  if(!await crypto.subtle.verify('HMAC',await key(),decode(signature),encoder.encode(payload)))return null;
  const session=JSON.parse(new TextDecoder().decode(decode(payload)));
  if(!Number.isSafeInteger(session.id)||session.id<=0||!['admin','accountant','clerk','viewer'].includes(session.role)||!Number.isFinite(session.expires)||session.expires<=Date.now())return null;
  return session;
 }catch{return null;}
}
