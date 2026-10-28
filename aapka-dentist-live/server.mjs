import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './server/auth.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
try{for(const line of readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(match&&process.env[match[1]]===undefined)process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2')}}catch{}
const DATA=process.env.DATA_FILE?path.resolve(process.env.DATA_FILE):path.join(ROOT,'data','store.json');
const PORT=Number(process.env.PORT||4173), TZ=process.env.CLINIC_TIMEZONE||'Asia/Kolkata';
const auth=createAuth({email:process.env.RECEPTIONIST_EMAIL||'',passwordHash:process.env.RECEPTIONIST_PASSWORD_HASH||''});
const services=[
 ['General Dental Consultation','A first visit or routine conversation about your oral health.',30,'◉'],
 ['Teeth Cleaning and Scaling','A professional cleaning consultation.',45,'✦'],
 ['Dental Fillings','Consultation about a tooth that may need a filling.',45,'◇'],
 ['Root Canal Consultation','Discuss symptoms and possible next steps with a dentist.',45,'⌁'],
 ['Tooth Extraction Consultation','Assessment and discussion with a dental professional.',30,'＋'],
 ['Cosmetic Dentistry Consultation','Talk through cosmetic dentistry options with the clinic.',45,'✧'],
 ['Orthodontic Consultation','An initial conversation about alignment options.',30,'⌖'],
 ['Dental Emergency Assessment','Request an urgent professional assessment.',30,'!']
].map(([name,description,duration,icon],i)=>({id:'S'+(i+1),name,description,duration,icon}));
const clinic={name:process.env.CLINIC_NAME||'Aapka Dentist',timezone:TZ,email:process.env.CLINIC_EMAIL||'Demo contact to be configured',phone:process.env.CLINIC_PHONE||'Demo contact to be configured',address:process.env.CLINIC_ADDRESS||'Demo address to be configured',hours:'Monday–Saturday, 9:00 AM–6:00 PM (demo schedule)',cancellation:'Please contact the clinic to reschedule or cancel.'};
let store;
async function load(){try{store=JSON.parse(await readFile(DATA,'utf8'))}catch{store={patients:[],appointments:[],emails:[],activity:[],conversations:[]}; await save()}}
async function save(){await mkdir(path.dirname(DATA),{recursive:true});await writeFile(DATA,JSON.stringify(store,null,2))}
function log(type,description,related=null){store.activity.unshift({id:randomUUID(),type,description,related,createdAt:new Date().toISOString()})}
function dateAtOffset(n){const d=new Date(Date.now()+n*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
function clockMinutes(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function slots(date,serviceId,excludeId=null){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<dateAtOffset(0))return [];
 const day=new Date(date+'T12:00:00Z').getUTCDay();if(day===0)return [];
 const duration=services.find(s=>s.id===serviceId)?.duration||30, out=[];
 for(let m=9*60;m+duration<=18*60;m+=30){const time=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');if(date===dateAtOffset(0)){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const nowM=Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value);if(m<=nowM)continue;}
 const end=m+duration, busy=store.appointments.some(a=>a.id!==excludeId&&a.date===date&&a.status!=='cancelled'&&m<clockMinutes(a.endTime)&&end>clockMinutes(a.startTime));if(!busy)out.push(time)}
 return out
}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'same-origin'});res.end(JSON.stringify(data))}
async function body(req){let s='';for await(const c of req)s+=c;if(s.length>20000)throw Error('Request too large');return s?JSON.parse(s):{}}
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function appointmentView(a){const patient=store.patients.find(x=>x.id===a.patientId)||{},email=store.emails.filter(x=>x.appointmentId===a.id).sort((x,y)=>y.createdAt.localeCompare(x.createdAt))[0];return {...a,emailStatus:email?.status||'not_available',patient:{id:patient.id,name:patient.name||'',email:patient.email||'',phone:patient.phone||''},source:a.source||'Not recorded'}}
function staffOnly(req,res){if(!auth.configured)return (json(res,503,{error:'Staff login is not configured. Ask the owner to create the initial receptionist account.'}),null);const staff=auth.staff(req);if(!staff)json(res,401,{error:'Your staff session has expired. Please sign in again.'});return staff}
function saveEmailEvent(appointment,patient,type){if(!patient.email)return;store.emails.unshift({id:randomUUID(),appointmentId:appointment.id,type,recipient:patient.email,status:'simulated',createdAt:new Date().toISOString()})}
async function route(req,res){
 const u=new URL(req.url,'http://localhost'), p=u.pathname;
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'});return res.end()}
 if(req.method==='GET'&&p==='/api/clinic')return json(res,200,{clinic,mode:'DEMO'});
 if(req.method==='GET'&&p==='/api/services')return json(res,200,{services});
 if(req.method==='GET'&&p==='/api/availability'){const date=u.searchParams.get('date'),serviceId=u.searchParams.get('serviceId');return json(res,200,{date,slots:slots(date,serviceId)})}
 if(req.method==='POST'&&p==='/api/receptionist/login'){
  const b=await body(req), result=await auth.login(req,b.email,b.password);
  if(!result.ok)return json(res,result.status,{error:result.error});
  res.setHeader('Set-Cookie',result.cookie);return json(res,200,{ok:true,staff:{email:result.email,role:'receptionist'}})
 }
 if(req.method==='GET'&&p==='/api/receptionist/me'){const staff=auth.staff(req);return json(res,200,{configured:auth.configured,staff})}
 if(req.method==='POST'&&p==='/api/receptionist/logout'){res.setHeader('Set-Cookie',auth.logout(req));return json(res,200,{ok:true})}
 if(p.startsWith('/api/receptionist/')&&p!=='/api/receptionist/login'&&p!=='/api/receptionist/me'&&p!=='/api/receptionist/logout'){
  const staff=staffOnly(req,res);if(!staff)return;
 }
 if(req.method==='GET'&&p==='/api/receptionist/appointments'){
  const appointments=store.appointments.map(appointmentView).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime));
  const today=dateAtOffset(0),nowParts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),nowTime=nowParts.find(x=>x.type==='hour').value+':'+nowParts.find(x=>x.type==='minute').value;
  const counts={today:0,upcoming:0,completed:0,cancelled:0,pending:0};for(const a of appointments){if(a.date===today&&a.status!=='cancelled')counts.today++;if((a.date>today||(a.date===today&&a.startTime>=nowTime))&&['confirmed','pending'].includes(a.status))counts.upcoming++;if(a.status==='completed')counts.completed++;if(a.status==='cancelled')counts.cancelled++;if(a.status==='pending')counts.pending++}
  return json(res,200,{appointments,counts,today,timezone:TZ,services})
 }
 if(req.method==='GET'&&p==='/api/receptionist/availability'){
  const date=u.searchParams.get('date'),serviceId=u.searchParams.get('serviceId'),excludeRef=u.searchParams.get('excludeReference'),exclude=store.appointments.find(a=>a.reference===excludeRef)?.id||null;
  return json(res,200,{date,slots:slots(date,serviceId,exclude),timezone:TZ})
 }
 if(req.method==='GET'&&p==='/api/receptionist/patients'){
  const today=dateAtOffset(0),clock=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const patients=store.patients.map(patient=>{const history=store.appointments.filter(a=>a.patientId===patient.id).sort((a,b)=>(b.date+b.startTime).localeCompare(a.date+a.startTime)),last=history.find(a=>a.status==='completed'||(a.status==='confirmed'&&(a.date<today||(a.date===today&&a.startTime<clock)))),next=[...history].filter(a=>(a.date>today||(a.date===today&&a.startTime>=clock))&&['confirmed','pending'].includes(a.status)).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime))[0]||null;return {...patient,appointmentCount:history.length,lastAppointment:last?.date||null,nextAppointment:next,appointments:history.map(a=>({reference:a.reference,date:a.date,time:a.startTime,service:a.service,status:a.status}))}}).sort((a,b)=>a.name.localeCompare(b.name));
  return json(res,200,{patients})
 }
 if(req.method==='GET'&&p==='/api/receptionist/activity'){const events=[...store.activity,...store.emails.map(e=>({id:e.id,related:e.appointmentId,createdAt:e.createdAt,description:`${e.type} email ${e.status}${e.recipient?' to '+e.recipient:''}`}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json(res,200,{activity:events.slice(0,30)})}
 if(req.method==='POST'&&p==='/api/receptionist/appointments'){
  const b=await body(req),service=services.find(s=>s.id===b.serviceId),name=String(b.name||'').trim(),email=String(b.email||'').trim(),phone=String(b.phone||'').trim();
  if(!name||name.length>100||(!email&&!phone)||(email&&!emailRe.test(email))||!service||!b.date||!b.time)return json(res,400,{error:'Enter a patient name, a valid service, a date and time, and at least one contact method.'});
  if(!slots(b.date,b.serviceId).includes(b.time))return json(res,409,{error:'That appointment time is unavailable. Choose another time.'});
  const patient=store.patients.find(x=>(email&&x.email?.toLowerCase()===email.toLowerCase())||(!email&&phone&&x.phone===phone&&x.name.toLowerCase()===name.toLowerCase()))||{id:randomUUID(),name,email,phone,createdAt:new Date().toISOString()};
  if(!store.patients.some(x=>x.id===patient.id))store.patients.push(patient);else{patient.name=name;if(email)patient.email=email;if(phone)patient.phone=phone}
  const end=clockMinutes(b.time)+service.duration,endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0'),appointment={id:randomUUID(),reference:'AD-'+randomBytes(3).toString('hex').toUpperCase(),patientId:patient.id,serviceId:service.id,service:service.name,date:b.date,startTime:b.time,endTime,status:'confirmed',source:'Receptionist',notes:String(b.notes||'').slice(0,500),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  store.appointments.push(appointment);saveEmailEvent(appointment,patient,'booking');log('appointment_created','Receptionist created appointment '+appointment.reference+'.',appointment.id);await save();return json(res,201,{appointment:appointmentView(appointment),emailStatus:patient.email?'simulated':'not_available'})
 }
 const appointmentRoute=p.match(/^\/api\/receptionist\/appointments\/([^/]+)$/);
 if(req.method==='GET'&&appointmentRoute){const a=store.appointments.find(x=>x.reference===decodeURIComponent(appointmentRoute[1]));return a?json(res,200,{appointment:appointmentView(a)}):json(res,404,{error:'Appointment not found.'})}
 if(req.method==='PATCH'&&appointmentRoute){
  const ref=decodeURIComponent(appointmentRoute[1]),appointment=store.appointments.find(a=>a.reference===ref);if(!appointment)return json(res,404,{error:'Appointment not found.'});
  const b=await body(req),action=b.action,patient=store.patients.find(x=>x.id===appointment.patientId)||{};
  if(action==='confirm'){
   if(appointment.status!=='pending')return json(res,409,{error:'Only pending appointments can be confirmed.'});appointment.status='confirmed';appointment.updatedAt=new Date().toISOString();saveEmailEvent(appointment,patient,'confirmation');log('appointment_confirmed','Receptionist confirmed appointment '+ref+'.',appointment.id)
  }else if(action==='complete'){
   const currentDate=dateAtOffset(0),parts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),currentTime=parts.find(x=>x.type==='hour').value+':'+parts.find(x=>x.type==='minute').value;if(appointment.status!=='confirmed'||appointment.date>currentDate||(appointment.date===currentDate&&appointment.startTime>currentTime))return json(res,409,{error:'Only a confirmed appointment that has already taken place can be completed.'});appointment.status='completed';appointment.updatedAt=new Date().toISOString();log('appointment_completed','Receptionist marked appointment '+ref+' completed.',appointment.id)
  }else if(action==='cancel'){
   if(!['pending','confirmed'].includes(appointment.status))return json(res,409,{error:'This appointment cannot be cancelled in its current status.'});appointment.status='cancelled';appointment.updatedAt=new Date().toISOString();saveEmailEvent(appointment,patient,'cancellation');log('appointment_cancelled','Receptionist cancelled appointment '+ref+'.',appointment.id)
  }else if(action==='reschedule'){
   const service=services.find(s=>s.id===appointment.serviceId);if(!service||!['pending','confirmed'].includes(appointment.status)||!b.date||!b.time)return json(res,400,{error:'This appointment cannot be rescheduled with the submitted details.'});
   if(!slots(b.date,service.id,appointment.id).includes(b.time))return json(res,409,{error:'That new date and time are unavailable. No changes were made.'});
   const end=clockMinutes(b.time)+service.duration;appointment.date=b.date;appointment.startTime=b.time;appointment.endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');appointment.updatedAt=new Date().toISOString();saveEmailEvent(appointment,patient,'reschedule');log('appointment_rescheduled','Receptionist rescheduled appointment '+ref+'.',appointment.id)
  }else return json(res,400,{error:'Choose a supported appointment action.'});
  await save();return json(res,200,{appointment:appointmentView(appointment),emailStatus:patient.email?'simulated':'not_available'})
 }
 if(req.method==='POST'&&p==='/api/appointments'){
  const b=await body(req), service=services.find(s=>s.id===b.serviceId);
  if(!b.name?.trim()||b.name.length>100||!emailRe.test(b.email||'')||!service||!b.date||!b.time||b.confirmed!==true)return json(res,400,{error:'Please provide valid details and confirm the appointment.'});
  if(!slots(b.date,b.serviceId).includes(b.time))return json(res,409,{error:'That time is no longer available. Please choose another slot.'});
  let patient=store.patients.find(x=>x.email.toLowerCase()===b.email.toLowerCase());if(!patient){patient={id:randomUUID(),name:b.name.trim(),email:b.email.trim(),phone:String(b.phone||'').slice(0,30),createdAt:new Date().toISOString()};store.patients.push(patient)}
  const duration=service.duration,end=clockMinutes(b.time)+duration,endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
  const a={id:randomUUID(),reference:'AD-'+randomBytes(3).toString('hex').toUpperCase(),patientId:patient.id,serviceId:service.id,service:service.name,date:b.date,startTime:b.time,endTime,status:'confirmed',source:'AI chatbot',createdAt:new Date().toISOString()};
  store.appointments.push(a);store.emails.unshift({id:randomUUID(),appointmentId:a.id,type:'booking',recipient:patient.email,status:'simulated',createdAt:new Date().toISOString()});log('appointment_created','Appointment '+a.reference+' booked (demo email simulated).',a.id);await save();return json(res,201,{appointment:a,emailStatus:'simulated',patientName:patient.name})
 }
 if(req.method==='POST'&&p==='/api/cancel/lookup'){
  const b=await body(req),a=store.appointments.find(x=>x.reference.toLowerCase()===String(b.reference||'').trim().toLowerCase()),patient=a&&store.patients.find(x=>x.id===a.patientId);
  if(!a||!patient||patient.email.toLowerCase()!==String(b.email||'').trim().toLowerCase())return json(res,404,{error:'We could not match that reference and email. Please check both details.'});
  if(a.status!=='confirmed')return json(res,409,{error:'This appointment is already cancelled.'});
  return json(res,200,{appointment:a,patientName:patient.name,service:a.service,verification:'Demo ownership check: reference plus booking email (not production identity verification).'})
 }
 if(req.method==='POST'&&p==='/api/cancel'){
  const b=await body(req),a=store.appointments.find(x=>x.reference===b.reference),patient=a&&store.patients.find(x=>x.id===a.patientId);
  if(!a||!patient||patient.email.toLowerCase()!==String(b.email||'').trim().toLowerCase())return json(res,404,{error:'Appointment verification failed.'});
  if(b.confirmed!==true)return json(res,400,{error:'Cancellation needs your confirmation.'});
  if(a.status!=='confirmed')return json(res,409,{error:'This appointment is already cancelled.'});
  a.status='cancelled';a.updatedAt=new Date().toISOString();store.emails.unshift({id:randomUUID(),appointmentId:a.id,type:'cancellation',recipient:patient.email,status:'simulated',createdAt:new Date().toISOString()});log('appointment_cancelled','Appointment '+a.reference+' cancelled (demo email simulated).',a.id);await save();return json(res,200,{appointment:a,emailStatus:'simulated'})
 }
 if(req.method==='GET'&&p==='/api/admin'){
  if(!staffOnly(req,res))return;
  return json(res,200,{demoAuth:true,appointments:store.appointments.map(a=>({...a,patient:store.patients.find(x=>x.id===a.patientId)})).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime)),patients:store.patients,emails:store.emails,activity:store.activity,counts:{today:store.appointments.filter(a=>a.date===dateAtOffset(0)&&a.status==='confirmed').length,upcoming:store.appointments.filter(a=>a.date>=dateAtOffset(0)&&a.status==='confirmed').length,cancelled:store.appointments.filter(a=>a.status==='cancelled').length,patients:store.patients.length}})
 }
 if(req.method==='POST'&&p==='/api/admin/reset'){
  if(!staffOnly(req,res))return;
  store={patients:[],appointments:[],emails:[],activity:[],conversations:[]};await save();return json(res,200,{ok:true})
 }
 if(req.method==='POST'&&p==='/api/chat'){
  const b=await body(req),text=String(b.message||'').slice(0,1000),lower=text.toLowerCase();let reply;
  if(/\b(urgent|emergency|swelling|bleeding|can't breathe|cannot breathe|difficulty swallowing)\b/.test(lower))reply='I’m sorry you’re dealing with this. If you have facial swelling affecting breathing or swallowing, uncontrolled bleeding, or rapidly worsening symptoms, seek urgent professional medical or dental care now. I can also help request human assistance.';
  else if(/diagnos|what is wrong|should i take|medicine|medication/.test(lower))reply='I can’t diagnose symptoms or recommend medication. A dental professional can assess this safely. Would you like to request an appointment or speak with the clinic team?';
  else if(/human|person|receptionist|staff/.test(lower)){log('human_assistance_requested','A visitor requested human assistance.');await save();reply='I’ve noted your request for the clinic team. Contact details are currently demo placeholders; please configure the clinic contact information before a live launch.'}
  else if(/hour|open|timing/.test(lower))reply='Our demo schedule is Monday–Saturday, 9:00 AM–6:00 PM ('+TZ+'). Clinic hours are configurable.';
  else if(/service|treatment|clean|filling|root canal|cosmetic|orthodont|extraction/.test(lower))reply='We can help with: '+services.map(x=>x.name).join(', ')+'. Which consultation would you like?';
  else if(/cancel/.test(lower))reply='I can help cancel a booking. Choose “Cancel an appointment” below and provide the appointment reference and booking email. The demo checks both details; this is not production identity verification.';
  else if(/book|appointment|available|slot/.test(lower))reply='I can help book. Choose “Book an appointment” below and I’ll check actual available times before asking for your details.';
  else reply='I’m the Aapka Dentist demo receptionist. I can share clinic hours and services, or help you book or cancel an appointment. What would you like to do?';
  return json(res,200,{reply,mode:'DEMO',conversationId:b.conversationId||randomUUID()})
 }
 if(req.method==='GET'&&p.startsWith('/api/'))return json(res,404,{error:'Not found'});
 const publicPath=p==='/'?'/index.html':(p==='/receptionist'||p==='/receptionist/'?'/receptionist.html':p);
 try{const file=await readFile(path.join(ROOT,'public',path.basename(publicPath)));const ext=path.extname(publicPath);res.writeHead(200,{'content-type':ext==='.css'?'text/css':ext==='.js'?'text/javascript':'text/html'});res.end(file)}catch{res.writeHead(404);res.end('Not found')}
}
await load();
const server=http.createServer((req,res)=>route(req,res).catch(e=>{console.error(e);json(res,500,{error:'Something went wrong. Please try again.'})}));
server.listen(PORT,()=>console.log('Aapka Dentist demo running at http://localhost:'+PORT+' (AI and email simulation; persistent JSON store)'));
