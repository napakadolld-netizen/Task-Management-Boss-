const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../lib/google-calendar-core');
const S=require('../lib/google-calendar-store');
const {syncUser}=require('../lib/google-calendar-sync');
const handler=require('../api/google-calendar');
const user='11111111-1111-4111-8111-111111111111';
function appointment(extra={}){return {id:'a-1',title:'ตรวจพื้นที่',project:'ALTURA',date:'2026-11-02',startTime:'10:00',endTime:'11:00',allDay:false,location:'สถานที่',attendees:'ทีม',notes:'รายละเอียด',deleted:false,googleSyncEnabled:true,...extra};}
function remote(e,extra={}){return {id:'google1',etag:'"v1"',status:'confirmed',...C.toGoogle(e),...extra};}
let tasks,links,connections,events,states,changed,failList,resetCount,googleWrites,lockAvailable;
function response(value,status=200){return new Response(status===204?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}
function matches(rows,q){return rows.filter(row=>[...q].every(([k,v])=>!v.startsWith('eq.')||String(row[k])===v.slice(3)));}
beforeEach(()=>{
 Object.assign(process.env,{SUPABASE_URL:'https://supabase.test',SUPABASE_SECRET_KEY:'server-secret',SUPABASE_PUBLISHABLE_KEY:'public',GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'oauth-secret',GOOGLE_REDIRECT_URI:'https://dayflow.test/api/google-calendar/callback',DAYFLOW_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')});
 tasks=[];links=[];states=[];events=new Map();changed=[];failList=null;resetCount=0;googleWrites=[];lockAvailable=true;
 connections=[{user_id:user,calendar_id:'dedicated',encrypted_tokens:S.seal({access_token:'access',refresh_token:'refresh',expires_at:Date.now()+3600000})}];
 global.fetch=async(url,opts={})=>{
  const u=new URL(url),method=opts.method||'GET',body=opts.body?JSON.parse(typeof opts.body==='string'?opts.body:'{}'):null;
  if(u.hostname==='oauth2.googleapis.com')return response({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar.app.created'});
  if(u.hostname==='openidconnect.googleapis.com')return response({sub:'google-person',email:'person@example.test'});
  if(u.hostname==='supabase.test'){
   if(u.pathname==='/auth/v1/user')return response({id:user});
   const table=u.pathname.split('/').at(-1);
   if(table==='dayflow_gcal_lock'){const result=lockAvailable;lockAvailable=false;return response(result);}
   if(table==='dayflow_gcal_unlock'){lockAvailable=true;return response(null);}
   if(table==='dayflow_gcal_replace'){
    const old=tasks.find(t=>t.id===body.p_id&&t.user_id===body.p_user);
    if(body.p_expected===null){if(old)return response(false);tasks.push(body.p_row);return response(true);}
    if(!old||old.notes!==body.p_expected)return response(false);Object.assign(old,body.p_row);return response(true);
   }
   const rows=table==='tasks'?tasks:table==='dayflow_google_links'?links:table==='dayflow_google_oauth_states'?states:connections;
   const selected=matches(rows,u.searchParams);
   if(method==='GET')return response(selected);
   if(method==='DELETE'){const removed=selected.filter(x=>!u.searchParams.get('expires_at')||new Date(x.expires_at)>new Date());removed.forEach(x=>rows.splice(rows.indexOf(x),1));return response(removed);}
   if(method==='PATCH'){selected.forEach(x=>Object.assign(x,body));return response(selected);}
   if(method==='POST'){let old=table==='dayflow_google_links'?rows.find(x=>x.user_id===body.user_id&&x.appointment_id===body.appointment_id):rows.find(x=>x.user_id===body.user_id);if(old)Object.assign(old,body);else rows.push(body);return response([old||body]);}
  }
  if(u.hostname==='www.googleapis.com'){
   const id=decodeURIComponent(u.pathname.split('/').at(-1));
   if(id==='events'&&method==='GET'){if(failList){const status=failList;failList=null;if(status===410)resetCount++;return response({},status);}return response({items:changed,nextSyncToken:'next'});}
   if(id==='events'&&method==='POST'){if(events.has(body.id))return response({},409);const e={...body,etag:'"created"',status:'confirmed'};events.set(body.id,e);googleWrites.push({method,body});return response(e);}
   const e=events.get(id);if(!e)return response({},404);
   if(method==='GET')return response(e);
   if(opts.headers['If-Match']!==e.etag)return response({},412);
   if(method==='PATCH'){const next={...e,...body,etag:'"updated"'};events.set(id,next);googleWrites.push({method,body});return response(next);}
   if(method==='DELETE'){events.set(id,{id,status:'cancelled',etag:e.etag});googleWrites.push({method});return response(null,204);}
  }
  throw Error('Unexpected mock request '+url);
 };
});
function link(e,g){tasks.push(C.rowFor(e,user));events.set(g.id,g);links.push({user_id:user,appointment_id:e.id,google_event_id:g.id,google_etag:g.etag,local_hash:C.fingerprint(e),remote_hash:C.fingerprint(C.fromGoogle(g,e.id,e))});}
test('all-day multi-day end remains exclusive in Google and round trips',()=>{const e=appointment({allDay:true,startTime:'',endTime:'',endDate:'2026-11-04'}),g=remote(e);assert.equal(g.end.date,'2026-11-05');assert.equal(C.fingerprint(C.fromGoogle(g,e.id)),C.fingerprint(e));});
test('timezone conversion preserves instant in Bangkok',()=>{const e=C.fromGoogle(remote(appointment(),{start:{dateTime:'2026-11-02T03:00:00Z'},end:{dateTime:'2026-11-02T04:00:00Z'}}),'x');assert.equal(e.startTime,'10:00');assert.equal(e.endTime,'11:00');});
test('default duration crosses midnight safely',()=>{const g=C.toGoogle(appointment({startTime:'23:30',endTime:''}));assert.match(g.end.dateTime,/2026-11-03T00:30/);});
test('invalid dates and inverted times are rejected',()=>{assert.throws(()=>C.normalize(appointment({date:'2026-02-30'})));assert.throws(()=>C.normalize(appointment({endTime:'09:00'})));});
test('extended properties survive and invitations are never changed',()=>{const g=C.toGoogle(appointment(),{extendedProperties:{private:{other:'keep'},shared:{x:'y'}},attendees:[{email:'guest@test'}]});assert.equal(g.extendedProperties.private.other,'keep');assert.deepEqual(g.extendedProperties.shared,{x:'y'});assert(!('attendees'in g));});
test('unknown category imports into general coordination',()=>{const g=remote(appointment());g.extendedProperties={};assert.equal(C.fromGoogle(g,'x').project,C.DEFAULT_PROJECT);});
test('recurrence is explicitly unsupported instead of silently flattened',()=>{const g=remote(appointment(),{recurrence:['RRULE:FREQ=WEEKLY']});assert.throws(()=>C.fromGoogle(g,'x'));});
test('token encryption uses distinct IVs and detects tampering',()=>{const a=S.seal({secret:'value'}),b=S.seal({secret:'value'});assert.notEqual(a,b);assert.equal(S.unseal(a).secret,'value');assert.throws(()=>S.unseal(a.slice(0,-3)+'abc'));});
test('new approved local event creates once, then no duplicate',async()=>{tasks.push(C.rowFor(appointment(),user));await syncUser(user);assert.equal(events.size,1);changed=[...events.values()];await syncUser(user);assert.equal(googleWrites.filter(x=>x.method==='POST').length,1);});
test('appointments without explicit approval are not exported',async()=>{tasks.push(C.rowFor(appointment({googleSyncEnabled:false}),user));await syncUser(user);assert.equal(events.size,0);});
test('Google-created event imports with stable identity',async()=>{const g=remote(appointment());g.extendedProperties={};changed=[g];events.set(g.id,g);await syncUser(user);await syncUser(user);assert.equal(tasks.length,1);assert.equal(C.parseRow(tasks[0]).project,C.DEFAULT_PROJECT);});
test('local edit updates same Google ID using etag',async()=>{const e=appointment(),g=remote(e);link(e,g);tasks[0]=C.rowFor({...e,title:'Local edit'},user);await syncUser(user);assert.equal(events.get(g.id).summary,'Local edit');assert.equal(events.size,1);});
test('Google edit pulls into the same local appointment',async()=>{const e=appointment(),g=remote(e);link(e,g);changed=[{...g,summary:'Google edit',etag:'"v2"'}];events.set(g.id,changed[0]);await syncUser(user);assert.equal(C.parseRow(tasks[0]).title,'Google edit');assert.equal(tasks[0].id,e.id);});
test('both sides edited produces conflict without overwriting either',async()=>{const e=appointment(),g=remote(e);link(e,g);tasks[0]=C.rowFor({...e,title:'Local edit'},user);const next={...g,summary:'Google edit',etag:'"v2"'};changed=[next];events.set(g.id,next);const r=await syncUser(user);assert.equal(r.conflicts.length,1);assert.equal(C.parseRow(tasks[0]).title,'Local edit');assert.equal(events.get(g.id).summary,'Google edit');assert.equal(googleWrites.length,0);});
test('Google deletion requires an explicit decision',async()=>{const e=appointment(),g=remote(e);link(e,g);changed=[{id:g.id,status:'cancelled',etag:'"v2"'}];events.set(g.id,changed[0]);const r=await syncUser(user);assert.equal(r.conflicts.length,1);assert.equal(C.parseRow(tasks[0]).deleted,false);});
test('confirmed local deletion propagates',async()=>{const e=appointment(),g=remote(e);link(e,g);tasks[0]=C.rowFor({...e,deleted:true,googleDeleteApproved:true},user);await syncUser(user);assert.equal(events.get(g.id).status,'cancelled');});
test('stale conflict decision is rejected',async()=>{const e=appointment(),g=remote(e);link(e,g);await assert.rejects(syncUser(user,{id:e.id,choice:'google',localHash:'stale',etag:g.etag}),/ข้อมูลเปลี่ยน/);});
test('410 restarts full snapshot without clearing local records',async()=>{connections[0].sync_token='expired';tasks.push(C.rowFor(appointment({googleSyncEnabled:false}),user));failList=410;await syncUser(user);assert.equal(resetCount,1);assert.equal(tasks.length,1);assert.equal(connections[0].sync_token,'next');});
test('API failure does not advance checkpoint',async()=>{connections[0].sync_token='old';failList=429;await assert.rejects(syncUser(user));assert.equal(connections[0].sync_token,'old');});
test('foreign-user appointments cannot be exported',async()=>{tasks.push(C.rowFor(appointment(),'other-user'));await syncUser(user);assert.equal(events.size,0);});
test('disabled connection reports setup state without revealing secrets',async()=>{delete process.env.GOOGLE_CLIENT_SECRET;const res={setHeader(){},status(s){this.code=s;return this;},json(v){this.body=v;return this;}};await handler({method:'GET',query:{action:'status'},headers:{}},res);assert.equal(res.code,200);assert.equal(res.body.configured,false);assert(!JSON.stringify(res.body).includes('server-secret'));});
test('sync requires Dayflow authentication',async()=>{const res={setHeader(){},status(s){this.code=s;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',query:{action:'sync'},headers:{}},res);assert.equal(res.code,401);});
test('OAuth callback rejects a mismatched browser cookie',async()=>{const res={setHeader(){},status(s){this.code=s;return this;},json(v){this.body=v;return this;}};await handler({method:'GET',query:{action:'callback',state:'state'},headers:{cookie:'__Host-dayflow-gcal-state=other'}},res);assert.equal(res.code,400);});

function resMock(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(v){this.body=v;return this;},end(){return this;}};}
test('OAuth uses PKCE, bounded cookie and single-use state',async()=>{
 const res=resMock();await handler({method:'POST',query:{action:'connect'},headers:{authorization:'Bearer session',origin:'https://dayflow.test'}},res);
 assert.equal(res.code,200);const url=new URL(res.body.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
 const state=url.searchParams.get('state'),cookie='__Host-dayflow-gcal-state='+state;
 const callback=resMock();await handler({method:'GET',query:{action:'callback',state,code:'code'},headers:{cookie}},callback);assert.equal(callback.code,303);assert.match(callback.headers.Location,/connected$/);assert.equal(states.length,0);assert.equal(connections[0].google_sub,'google-person');assert(!connections[0].encrypted_tokens.includes('new-refresh'));
 const replay=resMock();await handler({method:'GET',query:{action:'callback',state,code:'code'},headers:{cookie}},replay);assert.equal(replay.code,400);
});
test('cross-origin mutations are rejected',async()=>{const res=resMock();await handler({method:'POST',query:{action:'sync'},headers:{authorization:'Bearer session',origin:'https://evil.test'}},res);assert.equal(res.code,403);});
test('concurrent sync is rejected by database lock',async()=>{lockAvailable=false;await assert.rejects(syncUser(user),/กำลังซิงก์/);assert.equal(googleWrites.length,0);});
test('paginated Google snapshot retains every page and final token',async()=>{const {listChanges}=require('../lib/google-calendar-sync');let calls=0;const g={api:async path=>{calls++;return calls===1?{items:[{id:'one'}],nextPageToken:'page2'}:{items:[{id:'two'}],nextSyncToken:'checkpoint'};}};const result=await listChanges(g,'dedicated',null);assert.equal(result.items.length,2);assert.equal(result.token,'checkpoint');});

test('Google copies retaining metadata import as separate appointments',async()=>{const e=appointment(),g=remote(e);link(e,g);const copy={...g,id:'google-copy',summary:'Copied appointment'};changed=[copy];events.set(copy.id,copy);await syncUser(user);assert.equal(tasks.length,2);assert.equal(C.parseRow(tasks.find(t=>t.id===e.id)).title,e.title);assert.equal(links.length,2);});
test('interrupted deterministic create is recovered without duplicates',async()=>{const e=appointment();tasks.push(C.rowFor(e,user));const id='df'+C.hash(user+'|'+e.id).slice(0,50);events.set(id,remote(e,{id}));await syncUser(user);assert.equal(events.size,1);assert.equal(links.length,1);assert.equal(links[0].google_event_id,id);});

test('default end time keeps an explicitly chosen final day',()=>{const g=C.toGoogle(appointment({endDate:'2026-11-04',endTime:''}));assert.match(g.end.dateTime,/2026-11-04T11:00/);});
