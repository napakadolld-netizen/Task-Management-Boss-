const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/workspace');
const access=require('../lib/workspace-access');
let identity,calls,stored,foreign;
const workspace='2abeb576-cbb2-4cb6-8c52-8c36a8ea18e0';
beforeEach(()=>{
 Object.assign(process.env,{SUPABASE_URL:'https://database.test',SUPABASE_PUBLISHABLE_KEY:'publishable',SUPABASE_SECRET_KEY:'private',DAYFLOW_OWNER_EMAIL:'napakadol.ld@gmail.com',DAYFLOW_WORKSPACE_OWNER_ID:workspace,DAYFLOW_SITE_ORIGIN:'https://dayflow.test',DAYFLOW_PUBLIC_WORKSPACE:'enabled'});
 identity={id:'google-account-id',email:'napakadolld@gmail.com',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{email:'napakadolld@gmail.com'}}]};calls=[];stored=[];foreign=false;
 global.fetch=async(url,options={})=>{const u=new URL(url);calls.push({u,options});let data;
  if(u.pathname==='/auth/v1/user')data=identity;
  else if(options.method==='POST'){stored=JSON.parse(options.body);data=stored;assert.match(options.headers.Prefer,/merge-duplicates/);}
  else if(options.method==='DELETE')data=[];
  else if(u.searchParams.get('select')==='id,user_id')data=foreign?[{id:'task1',user_id:'other-workspace'}]:[];
  else data=[{id:'task1',title:'Shared task',notes:'Details'}];
  return new Response(JSON.stringify(data),{status:200});
 };
});
async function call({method='GET',action,token,body,origin}={}){let code,value;const headers={};await handler({method,query:{action},body,headers:{...(token?{authorization:'Bearer header.'+Buffer.from(JSON.stringify({sub:identity.id,amr:[{method:token==='email-login'?'otp':'oauth'}]})).toString('base64url')+'.signature'}:{}),...(origin?{origin}:{})}},{setHeader(k,v){headers[k]=v;},status(v){code=v;return this;},json(v){value=v;return this;}});return{code,value,headers};}
function row(){return{id:'task1',user_id:'forged',title:'Task',notes:'Details',requested_by:'',project:'ALTURA',task_date:'2026-11-05',status:'pending',priority:'normal',completed:null,parent_id:null};}
test('public visitors read only the fixed owner workspace without credentials or tokens in the response',async()=>{
 const r=await call();assert.equal(r.code,200);assert.equal(r.value.rows[0].title,'Shared task');assert.match(r.headers['Cache-Control'],/no-store/);assert.equal(calls[0].u.searchParams.get('user_id'),'eq.'+workspace);assert.doesNotMatch(JSON.stringify(r.value),/private|publishable/);
});
test('public data is closed until deployment explicitly enables sharing',async()=>{delete process.env.DAYFLOW_PUBLIC_WORKSPACE;const r=await call();assert.equal(r.code,401);assert.equal(calls.length,0);});
test('anonymous visitors cannot write even if the UI is bypassed',async()=>{const r=await call({method:'POST',body:{action:'upsert',rows:[row()]}});assert.equal(r.code,401);assert.equal(calls.length,0);});
test('a different Google account cannot edit',async()=>{identity.email='visitor@gmail.com';const r=await call({method:'POST',token:'valid-visitor',body:{action:'delete',id:'task1'}});assert.equal(r.code,403);assert.equal(calls.length,1);});
test('owner email login without Google is still read-only',async()=>{identity.app_metadata.provider='email';const r=await call({method:'POST',token:'email-login',body:{action:'delete',id:'task1'}});assert.equal(r.code,403);assert.equal(calls.length,1);});
test('owner Google login maps to the existing workspace, preserving Gmail dot aliases',async()=>{const r=await call({action:'session',token:'owner'});assert.equal(r.value.role,'owner');assert.equal(r.value.user.id,workspace);assert.equal(access.normalizeEmail('Napakadol.LD@googlemail.com'),'napakadolld@gmail.com');assert.notEqual(access.normalizeEmail('a.b@example.com'),access.normalizeEmail('ab@example.com'));});
test('owner edits force the canonical workspace ID and preserve merge-upsert semantics',async()=>{const r=await call({method:'POST',token:'owner',origin:'https://dayflow.test',body:{action:'upsert',rows:[row()]}});assert.equal(r.code,200);assert.equal(stored[0].user_id,workspace);});
test('service role never overwrites an existing foreign workspace record',async()=>{foreign=true;const r=await call({method:'POST',token:'owner',body:{action:'upsert',rows:[row()]}});assert.equal(r.code,409);assert.equal(stored.length,0);});
test('cross-origin owner writes and unsupported methods are rejected',async()=>{assert.equal((await call({method:'POST',token:'owner',origin:'https://other.test',body:{action:'upsert',rows:[row()]}})).code,403);assert.equal((await call({method:'PUT'})).code,405);});
test('owner deletion remains scoped to the canonical workspace',async()=>{const r=await call({method:'POST',token:'owner',body:{action:'delete',id:'task1'}});assert.equal(r.code,200);assert.equal(calls.at(-1).u.searchParams.get('user_id'),'eq.'+workspace);assert.equal(calls.at(-1).u.searchParams.get('id'),'eq.task1');});
