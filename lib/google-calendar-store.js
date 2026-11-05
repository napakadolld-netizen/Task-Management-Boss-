const {randomBytes,createCipheriv,createDecipheriv,timingSafeEqual}=require('crypto');
function config() {
  const e=process.env;
  const required=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI','DAYFLOW_TOKEN_ENCRYPTION_KEY','SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_PUBLISHABLE_KEY'];
  if(required.some(k=>!e[k])) return null;
  const key=Buffer.from(e.DAYFLOW_TOKEN_ENCRYPTION_KEY,'base64'); if(key.length!==32) return null;
  const redirect=new URL(e.GOOGLE_REDIRECT_URI);if(redirect.protocol!=='https:') return null;
  return {key,redirect:redirect.href,origin:redirect.origin};
}
function seal(value) {const c=config();if(!c)throw Error('Integration is not configured');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',c.key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(x=>x.toString('base64url')).join('.');}
function unseal(value) {const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64url'));const c=createDecipheriv('aes-256-gcm',config().key,iv);c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString());}
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
async function request(url,options={}) {return fetch(url,{...options,signal:AbortSignal.timeout(15000)});}
async function db(path,options={}) {
 const key=process.env.SUPABASE_SECRET_KEY;
 const r=await request(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...options.headers}});
 if(!r.ok) {const err=Error('Database operation failed; verify the Google Calendar migration is installed');err.status=503;throw err;}
 const t=await r.text();return t?JSON.parse(t):null;
}
function query(table,values){return table+'?'+new URLSearchParams(values);}
async function authenticated(req) {
 const bearer=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!bearer){const e=Error('เข้าสู่ระบบ Dayflow ก่อนเชื่อม Google Calendar');e.status=401;throw e;}
 const r=await request(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${bearer}`}});
 if(!r.ok){const e=Error('กรุณาเข้าสู่ระบบ Dayflow อีกครั้ง');e.status=401;throw e;}const u=await r.json();if(!u.id)throw Error('Invalid Dayflow user');return u;
}
async function connection(user){return (await db(query('dayflow_google_connections',{user_id:`eq.${user}`,select:'*'})))?.[0];}
async function patchConnection(user,patch){return db(query('dayflow_google_connections',{user_id:`eq.${user}`}),{method:'PATCH',body:JSON.stringify(patch)});}
class Google {
 constructor(user,conn){this.user=user;this.conn=conn;this.tokens=unseal(conn.encrypted_tokens);}
 async access(){
  if(this.tokens.expires_at>Date.now()+60000)return this.tokens.access_token;
  const r=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:this.tokens.refresh_token,grant_type:'refresh_token'})});
  if(!r.ok){const e=Error('Google connection expired or was revoked; connect again');e.status=401;throw e;}
  const t=await r.json();this.tokens={...this.tokens,...t,expires_at:Date.now()+t.expires_in*1000};await patchConnection(this.user,{encrypted_tokens:seal(this.tokens)});return this.tokens.access_token;
 }
 async api(path,options={}){
  const token=await this.access();const r=await request('https://www.googleapis.com/calendar/v3/'+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}});
  if(!r.ok){const e=Error(`Google Calendar request failed (${r.status})`);e.status=r.status;throw e;}
  return r.status===204?null:await r.json();
 }
}
module.exports={config,seal,unseal,equal,request,db,query,authenticated,connection,patchConnection,Google};
