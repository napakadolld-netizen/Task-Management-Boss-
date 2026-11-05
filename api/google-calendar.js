const {randomBytes,createHash}=require('crypto');
const S=require('../lib/google-calendar-store');
const {syncUser}=require('../lib/google-calendar-sync');
const SCOPES='openid email https://www.googleapis.com/auth/calendar.app.created';
const COOKIE='__Host-dayflow-gcal-state';
function cookie(value,maxAge=600){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
function reply(res,status,body){res.setHeader('Cache-Control','no-store');return res.status(status).json(body);}
function back(res,result){res.setHeader('Set-Cookie',cookie('',0));res.setHeader('Location',S.config().origin+'/?googleCalendar='+result);return res.status(303).end();}
async function callback(req,res){
 const state=typeof req.query.state==='string'?req.query.state:'';
 const stateCookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!state||!S.equal(state,stateCookie))return reply(res,400,{error:'Invalid or expired Google connection state. Start again from Dayflow.'});
 const stateHash=createHash('sha256').update(state).digest('hex');
 const states=await S.db(S.query('dayflow_google_oauth_states',{state_hash:`eq.${stateHash}`,expires_at:`gt.${new Date().toISOString()}`}),{method:'DELETE'});
 const pending=states?.[0];if(!pending)return reply(res,400,{error:'Google connection request expired or already used'});
 if(req.query.error)return back(res,'cancelled');
 if(typeof req.query.code!=='string')return reply(res,400,{error:'Google authorization code is missing'});
 const verifier=S.unseal(pending.verifier_encrypted);
 const r=await S.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:S.config().redirect,code_verifier:verifier,grant_type:'authorization_code'})});
 if(!r.ok)return back(res,'failed');
 const tokens=await r.json();
 if(!tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/calendar.app.created'))return back(res,'scope_missing');
 const identity=await S.request('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});if(!identity.ok)return back(res,'failed');const profile=await identity.json();if(!profile.sub)return back(res,'failed');
 const old=await S.connection(pending.user_id);
 if(old?.google_sub&&old.google_sub!==profile.sub)return back(res,'different_account');
 const oldTokens=old?.encrypted_tokens?S.unseal(old.encrypted_tokens):{};
 if(!tokens.refresh_token&&!oldTokens.refresh_token)return back(res,'refresh_missing');
 const encrypted=S.seal({...oldTokens,...tokens,expires_at:Date.now()+tokens.expires_in*1000});
 await S.db('dayflow_google_connections?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:pending.user_id,encrypted_tokens:encrypted,google_sub:profile.sub,google_email:profile.email||'',last_error:null})});
 return back(res,'connected');
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const action=req.query?.action||'status',ready=Boolean(S.config());
  if(action==='status'&&!ready)return reply(res,200,{configured:false,connected:false});
  if(!ready)return reply(res,503,{error:'ยังไม่ได้ตั้งค่า Google Calendar OAuth และฐานข้อมูล โปรดทำตามคู่มือตั้งค่า'});
  if(action==='callback'){if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});return await callback(req,res);}
  if(action==='cron'){
   if(req.method!=='GET'||!process.env.CRON_SECRET||!S.equal(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`))return reply(res,401,{error:'Unauthorized'});
   const connections=await S.db(S.query('dayflow_google_connections',{select:'user_id',encrypted_tokens:'not.is.null',order:'last_attempt_at.asc.nullsfirst',limit:'1'}));
   if(!connections.length)return reply(res,200,{processed:0});
   const result=await syncUser(connections[0].user_id);return reply(res,200,{processed:1,pulled:result.pulled,pushed:result.pushed,conflicts:result.conflicts.length});
  }
  if(action!=='status'&&req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  if(req.headers.origin&&req.headers.origin!==S.config().origin)return reply(res,403,{error:'Invalid request origin'});
  const user=await S.authenticated(req);
  if(action==='status'){
   const conn=await S.connection(user.id);const conflicts=conn?await S.db(S.query('dayflow_google_links',{user_id:`eq.${user.id}`,conflict:'not.is.null',select:'appointment_id,conflict'})):[];
   return reply(res,200,{configured:true,connected:Boolean(conn?.encrypted_tokens),email:conn?.google_email,calendarId:conn?.calendar_id,lastSyncedAt:conn?.last_synced_at,lastError:conn?.last_error,conflicts:conflicts.map(x=>({id:x.appointment_id,...x.conflict}))});
  }
  if(action==='connect'){
   const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
   await S.db(S.query('dayflow_google_oauth_states',{expires_at:`lt.${new Date().toISOString()}`}),{method:'DELETE'});
   await S.db('dayflow_google_oauth_states',{method:'POST',body:JSON.stringify({state_hash:createHash('sha256').update(state).digest('hex'),user_id:user.id,verifier_encrypted:S.seal(verifier),expires_at:new Date(Date.now()+600000).toISOString()})});
   const q=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:S.config().redirect,response_type:'code',scope:SCOPES,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
   res.setHeader('Set-Cookie',cookie(state));return reply(res,200,{url:'https://accounts.google.com/o/oauth2/v2/auth?'+q});
  }
  if(action==='sync'||action==='resolve'){
   let resolve=null;if(action==='resolve'){const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||typeof b.id!=='string'||!['local','google'].includes(b.choice)||typeof b.localHash!=='string'||typeof b.etag!=='string')return reply(res,400,{error:'Invalid conflict choice'});resolve=b;}
   const result=await syncUser(user.id,resolve);return reply(res,200,result);
  }
  if(action==='disconnect'){
   const conn=await S.connection(user.id);if(conn?.encrypted_tokens){const t=S.unseal(conn.encrypted_tokens);try{await S.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:t.refresh_token||t.access_token})});}catch{/* Application disconnect still clears its stored authorization. */}}
   await S.patchConnection(user.id,{encrypted_tokens:null,sync_token:null,last_error:null});return reply(res,200,{connected:false});
  }
  return reply(res,404,{error:'Unknown Google Calendar operation'});
 }catch(error){
  // Never expose Google token responses, secrets, Supabase payloads or stack traces.
  return reply(res,[400,401,403,409,412,503].includes(error.status)?error.status:502,{error:error.status?error.message:'การเชื่อม Google Calendar ยังไม่สำเร็จ ลองซิงก์อีกครั้งหรือตรวจการตั้งค่า'});
 }
};
