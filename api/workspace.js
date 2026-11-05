const access=require('../lib/workspace-access');
const columns='id,title,notes,requested_by,project,task_date,status,priority,completed,parent_id';
async function database(query,options={}){
 const key=process.env.SUPABASE_SECRET_KEY;
 const response=await fetch(process.env.SUPABASE_URL+'/rest/v1/tasks?'+query,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Object.assign(Error('ยังโหลดหรือบันทึกข้อมูลไม่ได้ กรุณาลองอีกครั้ง'),{status:503});
 return response.status===204?[]:await response.json();
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY||!process.env.SUPABASE_SECRET_KEY)return res.status(503).json({error:'ยังไม่ได้ตั้งค่าพื้นที่ทำงาน'});
  if(req.method==='GET'&&req.query?.action==='session'){
   try{return res.status(200).json({role:'owner',user:await access.owner(req)});}catch(e){if([401,403].includes(e.status))return res.status(200).json({role:'viewer'});throw e;}
  }
  const query=new URLSearchParams({user_id:'eq.'+access.ownerId(),select:columns});
  if(req.method==='GET'){
   if(process.env.DAYFLOW_PUBLIC_WORKSPACE!=='enabled')await access.owner(req);
   const rows=[];
   for(let offset=0;offset<100000;offset+=1000){query.set('order','id.asc');query.set('limit','1000');query.set('offset',String(offset));const batch=await database(query);rows.push(...batch);if(batch.length<1000)return res.status(200).json({rows});}
   return res.status(503).json({error:'ข้อมูลมีจำนวนมากเกินขีดจำกัด กรุณาติดต่อเจ้าของพื้นที่'});
  }
  await access.owner(req);
  if(req.headers.origin&&req.headers.origin!==process.env.DAYFLOW_SITE_ORIGIN)return res.status(403).json({error:'Invalid request origin'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(body?.action==='delete'&&typeof body.id==='string'&&body.id.length<=200){query.set('id','eq.'+body.id);return res.status(200).json({rows:await database(query,{method:'DELETE'})});}
  if(body?.action!=='upsert'||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500)return res.status(400).json({error:'Invalid workspace operation'});
  const allowed=columns.split(','),rows=body.rows.map(row=>{
   if(!row||typeof row.id!=='string'||!row.id||row.id.length>200||typeof row.title!=='string'||!row.title.trim()||row.title.length>180||typeof row.notes!=='string'||row.notes.length>100000||!['pending','doing','done'].includes(row.status)||!['low','normal','high'].includes(row.priority)||!/^\d{4}-\d{2}-\d{2}$/.test(row.task_date)||typeof row.project!=='string'||row.project.length>120||row.parent_id!==undefined&&row.parent_id!==null&&typeof row.parent_id!=='string')throw Object.assign(Error('ข้อมูลรายการไม่ถูกต้อง'),{status:400});
   return {...Object.fromEntries(allowed.filter(k=>k in row).map(k=>[k,row[k]])),user_id:access.ownerId()};
  });
  const ids=rows.map(row=>row.id);if(new Set(ids).size!==ids.length)return res.status(400).json({error:'Duplicate record IDs'});
  // Never let the service-role upsert overwrite a record belonging to another workspace.
  const existing=await database(new URLSearchParams({select:'id,user_id',id:'in.('+ids.map(id=>'"'+id.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+')'}));
  if(existing.some(row=>row.user_id!==access.ownerId()))return res.status(409).json({error:'รหัสรายการซ้ำกับพื้นที่อื่น กรุณาตรวจสอบก่อนบันทึก'});
  return res.status(200).json({rows:await database(new URLSearchParams({on_conflict:'id',select:columns}),{method:'POST',body:JSON.stringify(rows),headers:{Prefer:'resolution=merge-duplicates,return=representation'}})});
 }catch(e){return res.status([400,401,403,409,503].includes(e.status)?e.status:503).json({error:e.status?e.message:'ยังดำเนินการไม่ได้ กรุณาลองอีกครั้ง'});}
};
