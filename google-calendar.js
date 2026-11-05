/* Google authorization is server-side; browser requests only carry the existing Dayflow session. */
(()=>{
 const $=id=>document.getElementById(id),adapter=window.dayflowCalendarAdapter;
 let connection={configured:false,connected:false},busy=false,opened=false,lastPoll=0,activeUserId=null;
 const dialog=document.createElement('dialog');dialog.id='google-calendar-dialog';dialog.className='google-calendar-dialog';
 dialog.innerHTML='<div class="modal-title"><h2>Google Calendar · Dayflow</h2><button type="button" id="google-close" aria-label="ปิด">✕</button></div><p id="google-status" role="status" aria-live="polite"></p><div id="google-setup" hidden><p>ยังไม่ได้เปิดการเชื่อมต่อจริง ต้องตั้งค่า Google Cloud, OAuth และฐานข้อมูลก่อน</p><ol><li>เปิด Google Calendar API ใน Google Cloud</li><li>สร้าง OAuth Client แบบ Web application และตั้งค่า callback</li><li>ตั้งค่า Environment Variables ใน Vercel และรันไฟล์ migration ใน Supabase</li></ol><a href="docs/google-calendar-setup.html" target="_blank" rel="noopener">เปิดคู่มือตั้งค่าฉบับเต็ม ↗</a></div><p class="auth-description">เชื่อมเฉพาะปฏิทินชื่อ Dayflow ที่แอปสร้าง นัดหมายจาก Google ที่ยังไม่มีหมวดจะเข้าหมวด “งานทั่วไป / ประสานงาน” แล้วเปลี่ยนหมวดได้</p><div class="google-actions"><button id="google-connect" class="primary">เชื่อมบัญชี Google</button><button id="google-sync" class="primary">ซิงก์ตอนนี้</button><button id="google-disconnect" class="quiet">ยกเลิกการเชื่อมต่อ</button></div><div id="google-conflicts"></div><p class="calendar-confirm-note">ซิงก์อัตโนมัติขณะเปิดเว็บทุกประมาณ 60 วินาที และหลังบันทึกนัดหมายที่เปิดซิงก์ไว้ การซิงก์เมื่อปิดเว็บต้องเปิด scheduler ตามคู่มือ นัดหมายเกิดซ้ำหรือประเภทพิเศษให้จัดการใน Google Calendar ในรุ่นนี้</p>';
 document.body.append(dialog);
 const button=document.createElement('button');button.id='google-calendar-settings';button.className='quiet';button.textContent='Google Calendar';document.querySelector('.header-actions').append(button);
 async function api(action,body){
  const client=adapter.getClient();const session=client?await client.auth.getSession():null,token=session?.data?.session?.access_token;
  const res=await fetch('/api/google-calendar?action='+action,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(action==='status'&&res.status===404)return {configured:false,connected:false};const data=await res.json().catch(()=>({error:'Google Calendar API ยังไม่พร้อมใน Preview นี้'}));if(!res.ok)throw Error(data.error||'Google Calendar ยังไม่พร้อม');return data;
 }
 function showStatus(message){$('google-status').textContent=message;}
 function render(){
  $('google-setup').hidden=Boolean(connection.configured);
  $('google-connect').hidden=connection.connected;$('google-connect').disabled=!connection.configured||!adapter.getUser()||busy;
  $('google-sync').hidden=!connection.connected;$('google-sync').disabled=busy;
  $('google-disconnect').hidden=!connection.connected;$('google-disconnect').disabled=busy;
  if(!connection.configured)showStatus('รอตั้งค่า Google Calendar · ยังไม่ได้เชื่อมบัญชี');
  else if(!adapter.getUser())showStatus('กรุณาเข้าสู่ระบบ Dayflow ก่อนเชื่อม Google Calendar');
  else if(!connection.connected)showStatus('ยังไม่ได้เชื่อมบัญชี Google');
  else showStatus(`เชื่อมแล้ว: ${connection.email||'Google'} · ปฏิทิน Dayflow${connection.lastSyncedAt?' · ซิงก์ล่าสุด '+new Date(connection.lastSyncedAt).toLocaleString('th-TH'):''}`);
  renderConflicts(connection.conflicts||[]);
 }
 function renderConflicts(items){
  const box=$('google-conflicts');box.replaceChildren();if(!items.length)return;
  const heading=document.createElement('h3');heading.textContent='รายการที่ต้องตรวจสอบ';box.append(heading);
  for(const item of items){const card=document.createElement('article');card.className='google-conflict';const title=document.createElement('strong');title.textContent=item.title;card.append(title);
   const detail=document.createElement('pre');detail.textContent='Dayflow: '+JSON.stringify(item.local,null,2)+'\nGoogle: '+JSON.stringify(item.google,null,2);card.append(detail);
   for(const [choice,label] of [['local','ใช้ข้อมูล Dayflow'],['google',item.google?.deleted?'ยืนยันลบใน Dayflow ตาม Google':'ใช้ข้อมูล Google']]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{if(!confirm(`ยืนยัน “${label}” สำหรับ ${item.title} หรือไม่?`))return;await perform(()=>api('resolve',{id:item.id,choice,localHash:item.localHash,etag:item.etag}));};card.append(b);}box.append(card);
  }
 }
 async function refresh(){try{connection=await api('status');}catch(error){connection={configured:false,connected:false};render();showStatus(error.message);return;}render();}
 async function perform(work,{silent=false}={}){if(busy)return;busy=true;render();showStatus('กำลังซิงก์…');try{const result=await work();if(result.pulled!==undefined){await adapter.reload();await refresh();showStatus(`ซิงก์แล้ว · รับจาก Google ${result.pulled} · ส่งไป Google ${result.pushed}${result.warnings?.length?' · '+result.warnings.join(' / '):''}`);}else await refresh();return true;}catch(error){showStatus(error.message);if(!silent)adapter.notify('ยังซิงก์ Google ไม่สำเร็จ: '+error.message);return false;}finally{busy=false;$('google-sync').disabled=false;$('google-connect').disabled=!connection.configured||!adapter.getUser();$('google-disconnect').disabled=false;}}
 button.onclick=async()=>{opened=true;dialog.showModal();await refresh();};$('google-close').onclick=()=>{opened=false;dialog.close();};
 $('google-connect').onclick=async()=>{if(!adapter.getUser()){showStatus('เข้าสู่ระบบ Dayflow ก่อน');return;}try{const data=await api('connect',{});window.location.assign(data.url);}catch(e){showStatus(e.message);}};
 $('google-sync').onclick=()=>perform(()=>api('sync',{}));
 $('google-disconnect').onclick=()=>{if(confirm('ยกเลิกการเชื่อมต่อ Google Calendar? นัดหมายทั้งสองฝั่งจะยังอยู่ แต่หยุดซิงก์'))perform(()=>api('disconnect',{}));};
 window.DayflowGoogle={isConnected:()=>connection.connected,ensureConnected:async()=>{await refresh();return connection.connected;},afterSave:async e=>{if(!e.googleSyncEnabled&&!e.googleDeleteApproved)return;if(!adapter.getUser())return;await refresh();if(connection.connected)await perform(()=>api('sync',{}));else adapter.notify('บันทึกใน Dayflow แล้ว · รอเชื่อม Google เพื่อซิงก์');}};
 async function autoSync({initial=false}={}){
  const user=adapter.getUser();
  if(!user){activeUserId=null;connection={configured:false,connected:false};return;}
  if(busy||document.hidden)return;
  if(initial&&activeUserId===user.id)return;
  if(!initial&&Date.now()-lastPoll<60000)return;
  activeUserId=user.id;lastPoll=Date.now();
  await refresh();
  if(connection.connected)await perform(()=>api('sync',{}),{silent:true});
 }
 window.addEventListener('dayflow:ready',()=>{void autoSync({initial:true});});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void autoSync();});
 setInterval(()=>{void autoSync();},60000);
 const callbackUrl=new URL(window.location.href),result=callbackUrl.searchParams.get('googleCalendar');
 if(result){
  callbackUrl.searchParams.delete('googleCalendar');
  window.history.replaceState(window.history.state,'',callbackUrl.pathname+callbackUrl.search+callbackUrl.hash);
  if(result!=='connected'){
   const messages={cancelled:'ยกเลิกการอนุญาตแล้ว',different_account:'โปรดเชื่อมบัญชี Google เดิมที่เป็นเจ้าของปฏิทิน Dayflow',refresh_missing:'Google ไม่ได้ส่งสิทธิ์ offline โปรดเชื่อมใหม่และอนุญาตให้ครบ',scope_missing:'ยังไม่ได้อนุญาตสิทธิ์ปฏิทินที่จำเป็น',failed:'เชื่อม Google ไม่สำเร็จ กรุณาลองใหม่'};
   opened=true;dialog.showModal();void refresh().then(()=>showStatus(messages[result]||'ตรวจการเชื่อมต่อ Google Calendar'));
  }
 }
 if(adapter.getUser())void autoSync({initial:true});
})();
