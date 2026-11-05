const {randomUUID}=require('crypto');
const C=require('./google-calendar-core');
const S=require('./google-calendar-store');
const {db,query,connection,patchConnection,Google}=S;
async function rowsFor(user){let rows=[],offset=0;while(true){const page=await db(query('tasks',{user_id:`eq.${user}`,requested_by:`eq.${C.MARKER}`,select:'*',order:'id.asc',limit:'1000',offset:String(offset)}));rows.push(...page);if(page.length<1000)return rows;offset+=page.length;}}
async function replace(user,old,event){const ok=await db('rpc/dayflow_gcal_replace',{method:'POST',body:JSON.stringify({p_user:user,p_id:event.id,p_expected:old?.notes??null,p_row:C.rowFor(event,user)})});if(!ok){const e=Error('Appointment changed during synchronization. Retry to review both versions.');e.status=409;throw e;}return C.rowFor(event,user);}
async function linkFor(user,event,remote,conflict=null){
 const incoming=remote.status==='cancelled'?{...event,deleted:true}:C.fromGoogle(remote,event.id,event);
 return db('dayflow_google_links?on_conflict=user_id,appointment_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:user,appointment_id:event.id,google_event_id:remote.id,google_etag:remote.etag,local_hash:C.fingerprint(event),remote_hash:C.fingerprint(incoming),conflict})});
}
async function saveConflict(user,event,remote,reason){
 const conflict={reason,title:event?.title||remote.summary||'(ไม่มีชื่อ)',local:event?C.fields(event):null,google:remote.status==='cancelled'?{deleted:true}:!C.supported(remote)?{unsupported:true,title:remote.summary}:C.fields(C.fromGoogle(remote,event.id,event)),localHash:event?C.fingerprint(event):null,etag:remote.etag};
 const q=query('dayflow_google_links',{user_id:`eq.${user}`,google_event_id:`eq.${remote.id}`});await db(q,{method:'PATCH',body:JSON.stringify({conflict})});return conflict;
}
async function ensureCalendar(user,conn,g){
 if(conn.calendar_id)return conn.calendar_id;
 const cal=await g.api('calendars',{method:'POST',body:JSON.stringify({summary:'Dayflow',timeZone:'Asia/Bangkok',description:'นัดหมายที่ซิงก์สองทางกับ Dayflow'})});
 await patchConnection(user,{calendar_id:cal.id});conn.calendar_id=cal.id;return cal.id;
}
async function listChanges(g,calendar,token){
 const items=[];let page;
 do {const q=new URLSearchParams({showDeleted:'true',singleEvents:'false',maxResults:'2500'});if(token)q.set('syncToken',token);if(page)q.set('pageToken',page);const r=await g.api(`calendars/${encodeURIComponent(calendar)}/events?${q}`);items.push(...(r.items||[]));page=r.nextPageToken;if(!page)return {items,token:r.nextSyncToken};}while(page);
}
async function withLock(user,work){const token=randomUUID();const locked=await db('rpc/dayflow_gcal_lock',{method:'POST',body:JSON.stringify({p_user:user,p_token:token})});if(!locked){const e=Error('กำลังซิงก์อยู่ กรุณารอสักครู่');e.status=409;throw e;}try{return await work();}finally{await db('rpc/dayflow_gcal_unlock',{method:'POST',body:JSON.stringify({p_user:user,p_token:token})});}}
async function syncUser(user,resolve=null){
 return withLock(user,async()=>{
  const conn=await connection(user);if(!conn?.encrypted_tokens){const e=Error('เชื่อม Google Calendar ก่อนซิงก์');e.status=409;throw e;}
  const g=new Google(user,conn),cal=await ensureCalendar(user,conn,g),base=`calendars/${encodeURIComponent(cal)}/events`;
  const rows=await rowsFor(user),byId=new Map(rows.map(r=>[r.id,r]));
  const links=await db(query('dayflow_google_links',{user_id:`eq.${user}`,select:'*'}));const byGoogle=new Map(links.map(l=>[l.google_event_id,l])),byLocal=new Map(links.map(l=>[l.appointment_id,l]));
  if(resolve&&!byLocal.has(resolve.id)){const e=Error('ไม่พบนัดหมายที่เชื่อมกับ Google');e.status=400;throw e;}
  let changes;try{changes=await listChanges(g,cal,conn.sync_token);}catch(e){if(e.status!==410)throw e;changes=await listChanges(g,cal,null);}
  const remote=new Map(changes.items.map(e=>[e.id,e])),warnings=[],conflicts=[];let pulled=0,pushed=0;
  // Re-fetch existing links when local edits, conflicts, or explicit resolutions need the current etag.
  for(const link of links){const local=C.parseRow(byId.get(link.appointment_id)||{});if(resolve?.id===link.appointment_id||link.conflict||!local||C.fingerprint(local)!==link.local_hash){try{remote.set(link.google_event_id,await g.api(`${base}/${encodeURIComponent(link.google_event_id)}`));}catch(e){if(e.status===404||e.status===410)remote.set(link.google_event_id,{id:link.google_event_id,status:'cancelled',etag:link.google_etag});else throw e;}}}
  for(let resource of remote.values()){
   const claimed=resource.extendedProperties?.private?.dayflowId;const recoverable=claimed&&resource.id==='df'+C.hash(user+'|'+claimed).slice(0,50);let link=byGoogle.get(resource.id),row=link?byId.get(link.appointment_id):recoverable?byId.get(claimed):null,local=C.parseRow(row||{});
   if(local?.googleSyncEnabled===false)continue;
   if(!C.supported(resource)&&resource.status!=='cancelled'){warnings.push(`รายการเกิดซ้ำ/ประเภทพิเศษ: ${resource.summary||resource.id} — จัดการใน Google Calendar`);continue;}
   if(!link){
    if(resource.status==='cancelled')continue;
    if(!local){const id='gcal-'+C.hash(cal+'|'+resource.id).slice(0,40);local=C.fromGoogle(resource,id);row=await replace(user,null,local);byId.set(id,row);pulled++;}
    // Interrupted insert is recovered using the deterministic Google event ID and private Dayflow ID.
    const incoming=C.fromGoogle(resource,local.id,local);
    await linkFor(user,local,resource);link={user_id:user,appointment_id:local.id,google_event_id:resource.id,google_etag:resource.etag,local_hash:C.fingerprint(local),remote_hash:C.fingerprint(incoming)};byLocal.set(local.id,link);byGoogle.set(resource.id,link);
    if(C.fingerprint(local)!==C.fingerprint(incoming)){conflicts.push(await saveConflict(user,local,resource,'recovered-different-content'));continue;}
   }
   let action=C.decision(local,resource,link);
   if(resolve?.id===link.appointment_id){
    if(!local||C.fingerprint(local)!==resolve.localHash||resource.etag!==resolve.etag){const e=Error('ข้อมูลเปลี่ยนหลังแสดงตัวเลือก กรุณาซิงก์แล้วตรวจอีกครั้ง');e.status=409;throw e;}
    action=resolve.choice==='google'?(resource.status==='cancelled'?'accept-delete':'pull'):(local.deleted?'local-delete':'push');
    if(action==='push'&&resource.status==='cancelled') {const e=Error('Google ลบนัดหมายแล้ว หากต้องการเก็บงานให้ยกเลิกการซิงก์หรือสร้างนัดใหม่');e.status=409;throw e;}
   }
   if(action==='paused')continue;
   if(['conflict','remote-delete','missing-local'].includes(action)){if(local)conflicts.push(await saveConflict(user,local,resource,action));else warnings.push(`ไม่พบข้อมูล Dayflow สำหรับ ${resource.summary||resource.id}; ไม่ได้ลบข้อมูล Google`);continue;}
   if(action==='accept-delete'||action==='pull'){const incoming=C.fromGoogle(resource,local.id,local);row=await replace(user,row,incoming);local=incoming;byId.set(local.id,row);pulled++;await linkFor(user,local,resource);}
   else if(action==='push'){
    try{resource=await g.api(`${base}/${encodeURIComponent(resource.id)}`,{method:'PATCH',headers:{'If-Match':resource.etag},body:JSON.stringify(C.toGoogle(local,resource))});pushed++;await linkFor(user,local,resource);}catch(e){if(e.status!==412)throw e;const fresh=await g.api(`${base}/${encodeURIComponent(resource.id)}`);conflicts.push(await saveConflict(user,local,fresh,'google-edited-during-sync'));}
   }else if(action==='local-delete'){
    if(!local.googleDeleteApproved&&resolve?.id!==local.id){conflicts.push(await saveConflict(user,local,resource,'deletion-needs-confirmation'));continue;}
    if(resource.status!=='cancelled')try{await g.api(`${base}/${encodeURIComponent(resource.id)}`,{method:'DELETE',headers:{'If-Match':resource.etag}});pushed++;}catch(e){if(![404,410].includes(e.status))throw e;}
    await linkFor(user,local,{...resource,status:'cancelled'});
   }else if(action==='equal')await linkFor(user,local,resource);
  }
  // Only appointments explicitly enabled by the user are sent to Google.
  for(const row of byId.values()){
   const local=C.parseRow(row);if(!local||local.deleted||!local.googleSyncEnabled||byLocal.has(local.id))continue;
   const id='df'+C.hash(user+'|'+local.id).slice(0,50);let remote;
   try{remote=await g.api(base,{method:'POST',body:JSON.stringify({id,...C.toGoogle(local)})});pushed++;}
   catch(e){if(e.status!==409)throw e;remote=await g.api(`${base}/${id}`);if(remote.extendedProperties?.private?.dayflowId!==local.id)throw Error('Google event ID collision');}
   await linkFor(user,local,remote);
   if(C.fingerprint(local)!==C.fingerprint(C.fromGoogle(remote,local.id,local)))conflicts.push(await saveConflict(user,local,remote,'recovered-different-content'));
  }
  await patchConnection(user,{sync_token:changes.token||conn.sync_token,last_synced_at:new Date().toISOString(),last_error:null});
  return {pulled,pushed,conflicts,warnings,calendarId:cal,lastSyncedAt:new Date().toISOString()};
 });
}
module.exports={syncUser,replace,listChanges};
