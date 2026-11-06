const { createHash } = require('crypto');
const MARKER = '__dayflow_calendar_event_v1__';
const PROJECTS = ['13Enterprise','13Education','DR.EV','EV Life Thailand','Delivery Drone','SIYI','ALTURA','งานทั่วไป / ประสานงาน','Event'];
const DEFAULT_PROJECT = 'งานทั่วไป / ประสานงาน';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function shiftDate(date, days) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10); }
function localParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const p = type => parts.find(x => x.type === type).value;
  return { date:`${p('year')}-${p('month')}-${p('day')}`, time:`${p('hour')}:${p('minute')}` };
}
function fields(e) { return { title:e.title,project:e.project,date:e.date,endDate:e.endDate||e.date,startTime:e.allDay?'':e.startTime||'',endTime:e.allDay?'':e.endTime||'',allDay:Boolean(e.allDay||!e.startTime),location:e.location||'',attendees:e.attendees||'',notes:e.notes||'',deleted:Boolean(e.deleted) }; }
const fingerprint = e => hash(fields(e.deleted?e:normalize(e)));
function validate(e) {
  if (!e || typeof e.title !== 'string' || !e.title.trim() || !PROJECTS.includes(e.project)) throw new Error('Invalid appointment title or category');
  for(const v of [e.date,e.endDate||e.date]) if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v) throw new Error('Invalid appointment date');
  if((e.endDate||e.date)<e.date) throw new Error('End date is before start date');
  if(!e.allDay && e.startTime) {
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.endTime||'')) throw new Error('Timed appointments need valid start and end times');
    if(`${e.endDate||e.date}T${e.endTime}`<=`${e.date}T${e.startTime}`) throw new Error('End time must be after start time');
  }
}
function normalize(e) {
  const next={...e,allDay:Boolean(e.allDay||!e.startTime)};
  if(!next.allDay&&!next.endTime) { const d=new Date(`${next.endDate||next.date}T${next.startTime}:00+07:00`); d.setTime(d.getTime()+3600000); const end=localParts(d); next.endTime=end.time; next.endDate=end.date; }
  validate(next); return next;
}
function toGoogle(event, previous={}) {
  const e=normalize(event), allDay=e.allDay;
  return {summary:e.title,description:e.notes||'',location:e.location||'',start:allDay?{date:e.date}:{dateTime:`${e.date}T${e.startTime}:00+07:00`,timeZone:'Asia/Bangkok'},end:allDay?{date:shiftDate(e.endDate||e.date,1)}:{dateTime:`${e.endDate||e.date}T${e.endTime}:00+07:00`,timeZone:'Asia/Bangkok'},extendedProperties:{...(previous.extendedProperties||{}),private:{...(previous.extendedProperties?.private||{}),dayflowId:e.id,dayflowProject:e.project,dayflowAttendees:e.attendees||''}}};
}
function supported(g) { return !g.recurrence && !g.recurringEventId && (!g.eventType || g.eventType==='default'); }
function fromGoogle(g,id,old={}) {
  if(g.status==='cancelled') return {...old,id,deleted:true,updatedAt:new Date().toISOString(),googleSyncEnabled:true};
  if(!supported(g)) throw new Error('Recurring or special Google events require editing in Google Calendar');
  const allDay=Boolean(g.start?.date), start=allDay?{date:g.start.date,time:''}:localParts(g.start.dateTime),end=allDay?{date:shiftDate(g.end.date,-1),time:''}:localParts(g.end.dateTime);
  const project=g.extendedProperties?.private?.dayflowProject;
  const e={...old,id,title:g.summary||'(ไม่มีชื่อ)',project:PROJECTS.includes(project)?project:old.project||DEFAULT_PROJECT,date:start.date,endDate:end.date,startTime:start.time,endTime:end.time,allDay,location:g.location||'',attendees:g.extendedProperties?.private?.dayflowAttendees||old.attendees||'',notes:g.description||'',deleted:false,googleSyncEnabled:true,updatedAt:new Date().toISOString()};
  validate(e); return e;
}
function parseRow(row) { if(row.requested_by!==MARKER || !row.notes?.startsWith(MARKER)) return null; try {return JSON.parse(row.notes.slice(MARKER.length));}catch{return null;} }
function rowFor(e,user) { return {id:e.id,user_id:user,title:e.title,notes:MARKER+JSON.stringify(e),requested_by:MARKER,project:e.project,task_date:e.date,status:'pending',priority:'normal',completed:null}; }
function decision(local,remote,link) {
  if(local?.googleSyncEnabled===false) return 'paused';
  if(!supported(remote)&&remote.status!=='cancelled') return 'unsupported';
  if(!link) return local?'reconcile':'import';
  if(!local) return 'missing-local';
  if(local.deleted && remote.status==='cancelled') return 'equal';
  if(remote.status==='cancelled') return 'remote-delete';
  if(local.deleted) return local.googleDeleteApproved?'local-delete':'conflict';
  const incoming=fromGoogle(remote,local.id,local);
  if(fingerprint(local)===fingerprint(incoming)) return 'equal';
  const lc=fingerprint(local)!==link.local_hash, rc=fingerprint(incoming)!==link.remote_hash;
  return lc&&rc?'conflict':lc?'push':rc?'pull':'equal';
}
module.exports={MARKER,PROJECTS,DEFAULT_PROJECT,hash,shiftDate,fields,fingerprint,normalize,validate,toGoogle,fromGoogle,supported,parseRow,rowFor,decision};
