const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../google-calendar.js'),'utf8');

function page({url='https://dayflow.test/',signedIn=false,failSync=false}={}){
 const nodes=new Map(),listeners={},documentListeners={},requests=[],notifications=[];
 let user=signedIn?{id:'person-1'}:null,reloads=0,modalOpens=0;
 function element(id){if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',append(){},replaceChildren(){},showModal(){modalOpens++;},close(){}});return nodes.get(id);}
 const window={location:{href:url,assign(){throw Error('Unexpected OAuth redirect');}},history:{state:{keep:true},replaceState(state,title,path){window.location.href=new URL(path,url).href;}},addEventListener(name,fn){listeners[name]=fn;}};
 window.dayflowCalendarAdapter={getUser:()=>user,getClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}}),reload:async()=>{reloads++;},notify:m=>notifications.push(m)};
 const document={hidden:false,body:{append(){}},createElement:tag=>element('created-'+tag+'-'+nodes.size),getElementById:element,querySelector:()=>element('header'),addEventListener(name,fn){documentListeners[name]=fn;}};
 const fetch=async url=>{const action=new URL(url,'https://dayflow.test').searchParams.get('action');requests.push(action);return{ok:!(action==='sync'&&failSync),status:action==='sync'&&failSync?502:200,json:async()=>action==='status'?{configured:true,connected:true,email:'test@example.test'}:failSync?{error:'offline'}:{pulled:0,pushed:0}};};
 vm.runInNewContext(source,{window,document,URL,URLSearchParams,fetch,setInterval(){},confirm(){return false;},Date});
 return{nodes,requests,notifications,window,get reloads(){return reloads;},get modalOpens(){return modalOpens;},ready(){listeners['dayflow:ready']();},signIn(){user={id:'person-1'};},async settle(){for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));}};
}

test('successful OAuth callback is consumed without opening a dialog, preserving other URL state',async()=>{
 const p=page({url:'https://dayflow.test/?other=yes&googleCalendar=connected#calendar',signedIn:true});await p.settle();
 assert.equal(p.window.location.href,'https://dayflow.test/?other=yes#calendar');
 assert.equal(p.modalOpens,0);assert.deepEqual(p.requests,['status','sync','status']);assert.equal(p.reloads,1);assert.deepEqual(p.notifications,[]);
});
test('normal refresh waits for Dayflow sign-in then reuses connection once without consent or success popups',async()=>{
 const p=page();await p.settle();assert.equal(p.requests.length,0);
 p.signIn();p.ready();p.ready();await p.settle();
 assert.equal(p.requests.filter(x=>x==='sync').length,1);assert.equal(p.modalOpens,0);assert.deepEqual(p.notifications,[]);
 p.ready();await p.settle();assert.equal(p.requests.filter(x=>x==='sync').length,1);
});
test('background network failure is quiet while manual retry reports the error',async()=>{
 const p=page({signedIn:true,failSync:true});await p.settle();assert.deepEqual(p.notifications,[]);
 await p.nodes.get('google-sync').onclick();await p.settle();assert.equal(p.notifications.length,1);assert.match(p.notifications[0],/offline/);
});
test('failed OAuth callback shows an actionable message once and removes callback parameter',async()=>{
 const p=page({url:'https://dayflow.test/?googleCalendar=scope_missing'});await p.settle();
 assert.equal(p.modalOpens,1);assert.equal(p.window.location.href,'https://dayflow.test/');assert.match(p.nodes.get('google-status').textContent,/ยังไม่ได้อนุญาต/);
});
