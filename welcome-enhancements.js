/* Welcome interactions use the existing workspace entry and read-only data API. */
(()=>{
 const root=document.getElementById('welcome'),hint=document.getElementById('welcome-bu-hint'),latest=document.getElementById('welcome-latest');
 if(!root||!hint||!latest)return;
 const nodes=[...root.querySelectorAll('[data-welcome-project]')];
 const defaultHint='เลือก BU เพื่อดูงานและความคืบหน้าของหมวดนั้น';
 nodes.forEach((node,index)=>{
  node.style.setProperty('--node-index',index);
  const describe=()=>{hint.textContent='เปิดพื้นที่ทำงาน · '+node.innerText.replace(/\s+/g,' ').trim();};
  node.addEventListener('mouseenter',describe);node.addEventListener('focus',describe);
  node.addEventListener('mouseleave',()=>{hint.textContent=defaultHint;});
  node.addEventListener('blur',()=>{hint.textContent=defaultHint;});
  node.addEventListener('click',async()=>{
   await document.getElementById('welcome-enter').onclick();
   document.getElementById('filter').value=node.dataset.welcomeProject;
   document.getElementById('search').value='';view='board';render();
  });
 });
 try{if(!sessionStorage.getItem('dayflow.welcome.intro.v1')){root.dataset.intro='on';sessionStorage.setItem('dayflow.welcome.intro.v1','1');}}catch{root.dataset.intro='on';}
 let selected=null;
 latest.addEventListener('click',async()=>{
  await document.getElementById('welcome-enter').onclick();
  if(selected){const task=tasks.find(t=>t.id===selected.taskId);if(task)openProjectDetail(topLevelTask(task).id);}
 });
 async function refreshLatest(){
  try{
   const response=await fetch('/api/workspace',{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)throw Error('unavailable');
   const data=await response.json();
   const items=(data.rows||[]).filter(row=>row.requested_by!==calendarMarker).map(taskFromDb);
   const events=items.flatMap(owner=>(owner.activity||[]).filter(event=>Number.isFinite(Date.parse(event.at))).map(event=>({event,task:items.find(t=>t.id===event.sourceTaskId)||owner}))).sort((a,b)=>Date.parse(b.event.at)-Date.parse(a.event.at));
   const item=events[0];
   if(!item){selected=null;latest.querySelector('strong').textContent='ยังไม่มีความเคลื่อนไหวที่บันทึกไว้';latest.querySelector('small').textContent='กดเพื่อเปิดภาพรวมความเคลื่อนไหววันนี้';return;}
   selected={taskId:item.task.id};
   latest.querySelector('strong').textContent=item.task.project+' · '+item.task.title;
   const when=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.event.at));
   latest.querySelector('small').textContent=when+' · '+(item.event.text||'อัปเดตงาน');
  }catch{selected=null;latest.querySelector('strong').textContent='เปิดดูความเคลื่อนไหววันนี้';latest.querySelector('small').textContent='ยังโหลดกิจกรรมล่าสุดไม่ได้ · กดเพื่อลองเปิดพื้นที่ทำงาน';}
 }
 void refreshLatest();
 document.getElementById('welcome-back').addEventListener('click',()=>void refreshLatest());
})();
