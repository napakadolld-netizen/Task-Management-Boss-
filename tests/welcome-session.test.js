const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const setup=source.slice(source.indexOf('async function setupAuth()'),source.indexOf('\nfunction showViewerAppointment'));
async function boot({owner=false,error=false}={}){
 const nodes=new Map();let reads=0;const body={dataset:{entered:'false'}};
 function $(id){if(!nodes.has(id))nodes.set(id,{value:'old-filter',hidden:false,textContent:'',async click(){return this.onclick?.();}});return nodes.get(id);}
 const location={href:'https://dayflow.test/',search:''};
 const access={isOwner:()=>owner,getUser:()=>owner?{id:'owner',email:'owner@example.test'}:null,client:{},async initialize(callback){if(error)throw Error('offline');await callback();},async read(){reads++;return{rows:[]};}};
 const context={$,window:{DayflowAccess:access,dispatchEvent(){}},document:{body,hidden:false,querySelector(){return{inert:true};},querySelectorAll(){return[];}},location,history:{state:null,replaceState(){}},URL,URLSearchParams,setInterval(){},setTimeout(){},render(){},updateAuthUi(){},toast(){},localDate:()=> '2026-11-05',taskFromDb:x=>x,calendarEventFromDb:()=>null,calendarMarker:'marker',tasks:[],calendarEvents:[],view:'board'};
 await vm.runInNewContext(setup+'\nsetupAuth();',context);await new Promise(r=>setImmediate(r));
 return{nodes,context,reads};
}
test('remembered owners go straight to Today activity after a plain refresh without callback query',async()=>{const p=await boot({owner:true});assert.equal(p.context.document.body.dataset.entered,'true');assert.equal(p.nodes.get('welcome').hidden,true);assert.equal(p.context.view,'activity');assert.equal(p.nodes.get('filter').value,'');assert.equal(p.nodes.get('date').value,'2026-11-05');assert.ok(p.reads>=1);});
test('visitors still see the welcome screen until they choose to enter',async()=>{const p=await boot();assert.equal(p.context.document.body.dataset.entered,'false');assert.equal(p.reads,0);await p.nodes.get('welcome-enter').click();assert.equal(p.context.view,'activity');assert.equal(p.context.document.body.dataset.entered,'true');});
test('session validation failure does not bypass welcome or grant editing access',async()=>{const p=await boot({owner:true,error:true});assert.equal(p.context.document.body.dataset.entered,'false');assert.equal(p.reads,0);assert.equal(p.nodes.get('welcome-status').textContent,'offline');});
