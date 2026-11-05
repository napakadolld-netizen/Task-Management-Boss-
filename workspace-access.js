(()=>{
 let role='viewer',user=null,demo=false,initialized=false;
 async function request(body,action,path='/api/workspace'){const response=await fetch(path+(action?'?action='+action:''),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'ยังโหลดข้อมูลไม่ได้');return data;}

 function query(){let operation=null,limit=null;const q={select(){return q;},order(){return q;},limit(value){limit=value;return q;},upsert(rows){operation={action:'upsert',rows:Array.isArray(rows)?rows:[rows]};return q;},delete(){operation={action:'delete'};return q;},eq(key,value){if(key!=='id')throw Error('Unsupported filter');operation.id=value;return q;},then(resolve,reject){return request(operation).then(data=>({data:limit===0?[]:data.rows,error:null})).catch(e=>({data:null,error:{message:e.message}})).then(resolve,reject);}};return q;}
 const access=window.DayflowAccess={
  isOwner:()=>role==='owner',getUser:()=>user,
  client:{auth:{getSession:async()=>({data:{session:null}})},from(table){if(table!=='tasks')throw Error('Unsupported table');return query();}},
  async initialize(onChange){
   try{const response=await fetch('/api/config',{cache:'no-store'});if(response.ok){const config=await response.json();demo=Boolean(config.demo);if(demo)document.querySelector('.welcome-viewer-note').textContent='ตัวอย่างหน้าผู้ชม · ใช้ข้อมูลสมมติ';}}catch{/* Public reads do not require browser credentials. */}
   async function refresh(){const result=await request(undefined,'session');const changed=!initialized||role!==result.role||user?.id!==result.user?.id;role=result.role;user=result.user||null;initialized=true;if(changed)await onChange();}
   await refresh();
   const url=new URL(location.href),error=url.searchParams.get('ownerError');
   if(error){const messages={not_owner:'บัญชีนี้ดูได้อย่างเดียว กรุณาเลือก Gmail ของเจ้าของพื้นที่',cancelled:'ยกเลิกการเข้าสู่ระบบแล้ว',expired:'ลิงก์เข้าสู่ระบบหมดอายุ กรุณาลองอีกครั้ง',failed:'ยังเข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง'};document.getElementById('welcome-status').textContent=messages[error]||messages.failed;url.searchParams.delete('ownerError');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}
   setInterval(()=>{if(!document.hidden)void refresh().catch(e=>onChange(e));},60000);
  },
  read:()=>request(),
  signIn:async()=>{if(demo)throw Error('ตัวอย่างนี้ยังไม่เชื่อมบัญชี Google จริง');const data=await request({action:'signin'},undefined,'/api/owner-auth');window.location.assign(data.url);},
  signOut:async()=>{await request({action:'signout'},undefined,'/api/owner-auth');window.location.assign('/');}
 };
})();
