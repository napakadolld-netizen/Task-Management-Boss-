(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DayflowEventModel=model;})(typeof window==='object'?window:this,()=>{
 const BU=['13Enterprise','13Education','DR.EV','EV Life Thailand','Delivery Drone','SIYI','ALTURA','งานทั่วไป / ประสานงาน'];
 function normalize(info){if(!info||typeof info!=='object')return null;return{bus:[...new Set(Array.isArray(info.bus)?info.bus.filter(x=>BU.includes(x)):[])],end:typeof info.end==='string'?info.end:'',location:typeof info.location==='string'?info.location.slice(0,240):''};}
 function eventRoot(task,tasks){const seen=new Set();let current=task,event=null;while(current&&!seen.has(current.id)){seen.add(current.id);if(current.project==='Event'){event=current;if(normalize(current.eventInfo)?.bus.length)return current;}current=tasks.find(t=>t.id===current.parentId);}return event;}
 function matches(task,project,tasks){if(!project)return true;if(task.project===project)return true;const root=eventRoot(task,tasks);return Boolean(root&&(project==='Event'||normalize(root.eventInfo)?.bus.includes(project)));}
 function validate(info,start){const value=normalize(info);if(!value?.bus.length)return'เลือก BU ที่เกี่ยวข้องอย่างน้อย 1 หมวด';if(value.end&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.end)||!Number.isFinite(Date.parse(value.end+'T12:00:00'))||value.end<start))return'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';return'';}
 return{BU,normalize,eventRoot,matches,validate};
});
