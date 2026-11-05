const {randomBytes,createHash}=require('node:crypto');
const S=require('../lib/google-calendar-store');
const A=require('../lib/workspace-access');
const STATE_COOKIE='__Host-dayflow-owner-state',SESSION_SECONDS=8*60*60;
function hash(state){return createHash('sha256').update(state).digest('hex');}
function finish(res,error,session){
 const cookies=[A.cookie(STATE_COOKIE,'',0)];
 if(session)cookies.push(A.cookie(A.OWNER_COOKIE,S.seal(session),SESSION_SECONDS));
 res.setHeader('Set-Cookie',cookies);res.setHeader('Cache-Control','no-store');res.setHeader('Location',A.origin()+(error?'/?ownerError='+error:'/?owner=1'));return res.status(303).end();
}
async function callback(req,res){
 const state=typeof req.query.state==='string'?req.query.state:'';
 if(!state||!S.equal(state,A.readCookie(req,STATE_COOKIE)))return res.status(400).json({error:'Invalid owner login state'});
 const records=await S.db(S.query('dayflow_google_oauth_states',{state_hash:'eq.'+hash(state),expires_at:'gt.'+new Date().toISOString()}),{method:'DELETE'});
 if(!records?.length)return finish(res,'expired');
 const pending=records[0],proof=S.unseal(pending.verifier_encrypted);
 if(proof.purpose!=='owner_login'||pending.user_id!==A.ownerId())return finish(res,'failed');
 if(req.query.error)return finish(res,'cancelled');
 if(typeof req.query.code!=='string')return finish(res,'failed');
 const tokens=await S.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:S.config().redirect,code_verifier:proof.verifier,grant_type:'authorization_code'})});
 if(!tokens.ok)return finish(res,'failed');
 const token=await tokens.json();
 const response=await S.request('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token}});
 if(!response.ok)return finish(res,'failed');
 const profile=await response.json();
 if(!profile.sub||profile.email_verified!==true||!process.env.DAYFLOW_OWNER_EMAIL||A.normalizeEmail(profile.email)!==A.normalizeEmail(process.env.DAYFLOW_OWNER_EMAIL))return finish(res,'not_owner');
 return finish(res,null,{purpose:'owner_session',user_id:A.ownerId(),google_sub:profile.sub,email:profile.email,expires_at:Date.now()+SESSION_SECONDS*1000});
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  if(!S.config())return res.status(503).json({error:'ระบบ Google Login ยังไม่พร้อม'});
  if(req.query?.action==='callback'&&req.method==='GET')return await callback(req,res);
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(req.headers.origin&&req.headers.origin!==A.origin())return res.status(403).json({error:'Invalid request origin'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(body?.action==='signout'){res.setHeader('Set-Cookie',A.cookie(A.OWNER_COOKIE,'',0));return res.status(200).json({signedOut:true});}
  if(body?.action!=='signin')return res.status(400).json({error:'Invalid login action'});
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  await S.db('dayflow_google_oauth_states',{method:'POST',body:JSON.stringify({state_hash:hash(state),user_id:A.ownerId(),verifier_encrypted:S.seal({purpose:'owner_login',verifier}),expires_at:new Date(Date.now()+600000).toISOString()})});
  const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:S.config().redirect,response_type:'code',scope:'openid email',prompt:'select_account',state,code_challenge:hash(verifier),code_challenge_method:'S256'});
  // PKCE challenges use base64url, not hexadecimal.
  params.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));
  res.setHeader('Set-Cookie',A.cookie(STATE_COOKIE,state,600));return res.status(200).json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
 }catch{return res.status(503).json({error:'ยังเข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง'});}
};
module.exports.callback=callback;
module.exports.STATE_COOKIE=STATE_COOKIE;
