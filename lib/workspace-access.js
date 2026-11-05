const OWNER_ID='2abeb576-cbb2-4cb6-8c52-8c36a8ea18e0';
function ownerId(){return process.env.DAYFLOW_WORKSPACE_OWNER_ID||OWNER_ID;}
function normalizeEmail(email){const value=String(email||'').trim().toLowerCase();const [local,domain]=value.split('@');return ['gmail.com','googlemail.com'].includes(domain)?local.replace(/\./g,'')+'@gmail.com':value;}
async function owner(req){
 const token=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];
 if(!token)throw Object.assign(Error('กรุณาเข้าสู่ระบบด้วย Google ของเจ้าของพื้นที่'),{status:401});
 const response=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Object.assign(Error('กรุณาเข้าสู่ระบบอีกครั้ง'),{status:401});
 const user=await response.json(),expected=process.env.DAYFLOW_OWNER_EMAIL;
 let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{throw Object.assign(Error('Invalid session'),{status:401});}
 const google=user.identities?.some(identity=>identity.provider==='google'&&normalizeEmail(identity.identity_data?.email||user.email)===normalizeEmail(expected));
 const oauth=claims.sub===user.id&&Array.isArray(claims.amr)&&claims.amr.some(method=>method.method==='oauth');
 if(!expected||!user.id||(!google||!oauth)||normalizeEmail(user.email)!==normalizeEmail(expected))throw Object.assign(Error('บัญชีนี้มีสิทธิ์ดูอย่างเดียว'),{status:403});
 return {id:ownerId(),email:user.email};
}
module.exports={ownerId,owner,normalizeEmail};
