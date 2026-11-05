// Local visual preview only: synthetic data, no credentials or production requests.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const date=(()=>{const now=new Date();return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);})();
const marker='\n__DAYFLOW_PROJECT_META__';
const meta={isProject:true,nextStep:'สรุปแนวทางและนัดทีมทบทวนแผน',parentId:null,isTodo:false,activity:[{id:'demo-added',type:'task_created',text:'สร้างโครงการตัวอย่าง',at:new Date().toISOString(),actor:'Boss Napakadol',sourceTaskId:'demo-project'}]};
const rows=[{id:'demo-project',title:'โครงการตัวอย่าง · แผนงานประจำเดือน',notes:'ตัวอย่างพื้นที่ทำงานของ Boss Napakadol สำหรับตรวจหน้าจอ\nผู้ชมเปิดดูรายละเอียด Next step และ To-do ได้'+marker+encodeURIComponent(JSON.stringify(meta)),project:'13Enterprise',requested_by:'',task_date:date,status:'doing',priority:'high',completed:null,parent_id:null},{id:'demo-todo',title:'รวบรวมข้อมูลและสรุปความคืบหน้า',notes:marker+encodeURIComponent(JSON.stringify({isTodo:true,isProject:false,parentId:'demo-project',nextStep:'',activity:[]})),project:'13Enterprise',requested_by:'',task_date:date,status:'pending',priority:'normal',completed:null,parent_id:'demo-project'},{id:'demo-task',title:'เตรียมข้อมูลสำหรับประชุมทีม',notes:'ข้อมูลสมมติสำหรับตรวจหน้าผู้ชม ไม่มีการเชื่อมฐานข้อมูลจริง',project:'ALTURA',requested_by:'Boss',task_date:date,status:'pending',priority:'normal',completed:null,parent_id:null}];
const event={id:'demo-event',title:'ประชุมทบทวนแผนงาน · ตัวอย่าง',project:'ALTURA',date,startTime:'10:00',endTime:'11:00',allDay:false,location:'ห้องประชุม',attendees:'ทีมงาน',notes:'นัดหมายสมมติ',deleted:false,updatedAt:new Date().toISOString()};rows.push({id:event.id,title:event.title,notes:'__dayflow_calendar_event_v1__'+JSON.stringify(event),requested_by:'__dayflow_calendar_event_v1__',project:event.project,task_date:date,status:'pending',priority:'normal',completed:null,parent_id:null});
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 function json(code,data){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
 if(url.pathname==='/api/config')return json(200,{ready:true,demo:true,url:'https://example.supabase.co',publishableKey:'demo-public-key'});
 if(url.pathname==='/api/workspace')return req.method==='GET'?json(200,url.searchParams.get('action')==='session'?{role:'viewer'}:{rows}):json(401,{error:'Read only preview'});
 if(url.pathname.startsWith('/api/'))return json(404,{error:'Preview only'});
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep))return json(403,{});
 fs.readFile(file,(error,bytes)=>{if(error)return json(404,{});res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(bytes);});
}).listen(4174,'127.0.0.1',()=>process.stdout.write('Welcome preview: http://127.0.0.1:4174/\n'));
