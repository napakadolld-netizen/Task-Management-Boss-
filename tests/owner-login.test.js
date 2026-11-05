const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../lib/google-calendar-store'),A=require('../lib/workspace-access');
const handler=require('../api/owner-auth'),callbackRoute=require('../api/google-calendar/callback');
const id='2abeb576-cbb2-4cb6-8c52-8c36a8ea18e0';
let states,profile,googleBodies;
beforeEach(()=>{
 Object.assign(process.env,{SUPABASE_URL:'https://database.test',SUPABASE_SECRET_KEY:'private',SUPABASE_PUBLISHABLE_KEY:'public',DAYFLOW_OWNER_EMAIL:'napakadol.ld@gmail.com',DAYFLOW_WORKSPACE_OWNER_ID:id,GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'https://dayflow.test/api/google-calendar/callback',DAYFLOW_SITE_ORIGIN:'https://dayflow.test',DAYFLOW_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')});
 states=[];profile={sub:'google-person',email:'napakadolld@gmail.com',email_verified:true};googleBodies=[];
 global.fetch=async(url,options={})=>{const u=new URL(url);let body;
  if(u.hostname==='database.test'){
   assert.match(u.pathname,/dayflow_google_oauth_states$/);
   if(options.method==='POST'){states.push(JSON.parse(options.body));body=states;}
   else if(options.method==='DELETE'){body=states.filter(s=>'eq.'+s.state_hash===u.searchParams.get('state_hash')&&new Date(s.expires_at)>new Date());states=states.filter(s=>!body.includes(s));}
  }else if(u.hostname==='oauth2.googleapis.com'){googleBodies.push(new URLSearchParams(options.body));body={access_token:'temporary-google-access'};}
  else if(u.hostname==='openidconnect.googleapis.com')body=profile;
  else throw Error('Unexpected request');
  return new Response(JSON.stringify(body),{status:200});
 };
});
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
async function begin(){const r=res();await handler({method:'POST',headers:{origin:'https://dayflow.test'},body:{action:'signin'},query:{}},r);assert.equal(r.code,200);const url=new URL(r.body.url);return{r,url,state:url.searchParams.get('state'),cookie:r.headers['Set-Cookie'].split(';')[0]};}
async function finish(start){const r=res();await callbackRoute({method:'GET',headers:{cookie:start.cookie},query:{state:start.state,code:'google-code'}},r);return r;}
test('owner sign-in reuses the registered Calendar callback with purpose-isolated state and PKCE',async()=>{const s=await begin();assert.equal(s.url.searchParams.get('redirect_uri'),process.env.GOOGLE_REDIRECT_URI);assert.equal(s.url.searchParams.get('scope'),'openid email');assert.equal(s.url.searchParams.get('code_challenge_method'),'S256');assert.match(s.r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);assert.equal(S.unseal(states[0].verifier_encrypted).purpose,'owner_login');});
test('verified owner Google email establishes only the canonical owner session, without changing Calendar credentials',async()=>{const s=await begin(),r=await finish(s);assert.equal(r.code,303);assert.equal(r.headers.Location,'https://dayflow.test/?owner=1');const cookie=r.headers['Set-Cookie'].find(c=>c.startsWith(A.OWNER_COOKIE+'=')).split(';')[0];assert.equal((await A.owner({headers:{cookie}})).id,id);assert.equal(states.length,0);assert.equal(googleBodies[0].get('redirect_uri'),process.env.GOOGLE_REDIRECT_URI);});
test('another Google account and unverified email cannot obtain an owner session',async()=>{profile.email='visitor@gmail.com';let r=await finish(await begin());assert.match(r.headers.Location,/ownerError=not_owner/);assert.equal(r.headers['Set-Cookie'].length,1);profile.email='napakadolld@gmail.com';profile.email_verified=false;r=await finish(await begin());assert.match(r.headers.Location,/ownerError=not_owner/);});
test('login callback is single use and mismatched browser state cannot exchange a code',async()=>{const s=await begin();let r=res();await handler({method:'GET',headers:{cookie:'bad'},query:{action:'callback',state:s.state,code:'code'}},r);assert.equal(r.code,400);assert.equal(googleBodies.length,0);await finish(s);r=await finish(s);assert.match(r.headers.Location,/ownerError=expired/);assert.equal(googleBodies.length,1);});
test('forged or expired session cookies are rejected and sign-out clears only the owner session',async()=>{await assert.rejects(A.owner({headers:{cookie:A.OWNER_COOKIE+'=fake'}}),{status:401});const expired=S.seal({purpose:'owner_session',user_id:id,email:'napakadolld@gmail.com',expires_at:Date.now()-1});await assert.rejects(A.owner({headers:{cookie:A.OWNER_COOKIE+'='+expired}}),{status:401});const r=res();await handler({method:'POST',headers:{origin:'https://dayflow.test'},body:{action:'signout'}},r);assert.equal(r.code,200);assert.match(r.headers['Set-Cookie'],/Max-Age=0/);assert.match(r.headers['Set-Cookie'],/__Host-dayflow-owner=/);});
test('cross-site login requests and unsupported methods fail closed',async()=>{const r=res();await handler({method:'POST',headers:{origin:'https://evil.test'},body:{action:'signin'}},r);assert.equal(r.code,403);const g=res();await handler({method:'GET',headers:{},query:{}},g);assert.equal(g.code,405);});
