(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DayflowEventModel=model;})(typeof window==='object'?window:this,()=>{
 const BU=['13Enterprise','13Education','DR.EV','EV Life Thailand','Delivery Drone','SIYI','ALTURA','งานทั่วไป / ประสานงาน'];
 const PHASES=['ประสานงาน / หาข้อมูล','รอตัดสินใจ','ยืนยันเข้าร่วม / เตรียมงาน','จบงาน','ไม่เข้าร่วม'];
 function normalize(info){if(!info||typeof info!=='object')return null;return{bus:[...new Set(Array.isArray(info.bus)?info.bus.filter(x=>BU.includes(x)):[])],start:typeof info.start==='string'?info.start:'',end:typeof info.end==='string'?info.end:'',location:typeof info.location==='string'?info.location.slice(0,240):'',phase:PHASES.includes(info.phase)?info.phase:PHASES[0]};}
 function isEvent(task){return Boolean(task&&(task.taskType==='event'||task.taskType!=='task'&&task.project==='Event'));}
 function eventRoot(task,tasks){const seen=new Set();let current=task,event=null;while(current&&!seen.has(current.id)){seen.add(current.id);if(isEvent(current)){event=current;if(normalize(current.eventInfo)?.bus.length)return current;}current=tasks.find(t=>t.id===current.parentId);}return event;}
 function matches(task,project,tasks){if(!project)return true;if(project==='Event')return Boolean(eventRoot(task,tasks));if(task.project===project)return true;const root=eventRoot(task,tasks);return Boolean(root&&(project==='Event'||normalize(root.eventInfo)?.bus.includes(project)));}
 function dateValid(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;}
 function validate(info,fallbackStart=''){const value=normalize(info);if(!value?.bus.length)return'เลือก BU ที่เกี่ยวข้องอย่างน้อย 1 หมวด';const start=value.start||fallbackStart;if(value.start&&!dateValid(value.start))return'วันที่จัดงานไม่ถูกต้อง';if(value.end&&(!dateValid(value.end)||!start||value.end<start))return'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม และต้องระบุวันที่เริ่มจัดงาน';return'';}
 return{BU,PHASES,normalize,isEvent,eventRoot,matches,validate};
});
