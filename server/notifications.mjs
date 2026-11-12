import {randomUUID} from 'node:crypto';
import {notificationJobs} from '../shared/booking.mjs';
import {studioInstant} from '../shared/time.mjs';
import {getSite} from './content-routes.mjs';
import {toApp} from './appointment-record.mjs';
import {viewToken} from './visit-token.mjs';
const templateEnv={client_pending:'WA_CLIENT_PENDING_TEMPLATE',client_confirmed:'WA_CLIENT_CONFIRMED_TEMPLATE',client_reminder:'WA_CLIENT_REMINDER_TEMPLATE',client_cancelled:'WA_CLIENT_CANCELLED_TEMPLATE',staff_new:'WA_STAFF_NEW_TEMPLATE',staff_confirmed:'WA_STAFF_CONFIRMED_TEMPLATE',staff_receipt:'WA_STAFF_RECEIPT_TEMPLATE',staff_cancelled:'WA_STAFF_CANCELLED_TEMPLATE'};
export const whatsappReady=kind=>!!((process.env.WHATSAPP_WEBHOOK_URL?process.env.WHATSAPP_WEBHOOK_URL.startsWith('https://'):false)||(!process.env.WHATSAPP_WEBHOOK_URL&&process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION||'')&&(!kind||process.env[templateEnv[kind]])));
export async function enqueue(db,row,event,zone){
 const {site}=await getSite(db),m=(await db.query('SELECT id,name,whatsapp_phone,whatsapp_opt_in FROM staff WHERE id=$1',[row.staff_id])).rows[0],master=m?{...m,whatsapp:m.whatsapp_phone,whatsappOptIn:m.whatsapp_opt_in}:null;
 if(event==='cancelled')await db.query("UPDATE notifications SET sent_at=now(),last_error='skipped: cancelled' WHERE appointment_id=$1 AND kind='client_reminder' AND sent_at IS NULL",[row.id]);
 for(const job of notificationJobs(toApp(row),site,master,event,Date.now(),zone))await db.query("INSERT INTO notifications(id,appointment_id,channel,kind,due_at,audience,recipient,payload) VALUES($1,$2,'whatsapp',$3,$4,$5,$6,$7) ON CONFLICT(appointment_id,channel,kind) DO NOTHING",[randomUUID(),row.id,job.kind,new Date(job.dueAt),job.audience,job.recipient,job]);
}
export function shouldSend(job,a,now=Date.now(),zone='Asia/Bishkek'){
 if(!a)return false;if(job.audience==='client'&&!a.notifyWhatsapp)return false;
 if(!job.kind.endsWith('cancelled')&&studioInstant(a.date,a.start,zone).getTime()<=now)return false;
 if(job.kind==='client_reminder')return a.status==='confirmed'&&studioInstant(a.date,a.start,zone).getTime()>now;
 if(job.kind.endsWith('cancelled'))return a.status==='cancelled';
 if(job.kind==='client_pending')return a.status==='pending_payment';
 if(job.kind==='staff_receipt')return a.status==='payment_review';
 if(job.kind==='staff_new')return a.status==='pending_payment'||(a.status==='confirmed'&&!a.depositAmount);
 return a.status==='confirmed';
}
export function startNotifications(pool,zone){let running=false,stopped=false;
 async function tick(){if(running||stopped)return;running=true;try{
  const rows=(await pool.query("UPDATE notifications SET locked_until=now()+interval '5 minutes' WHERE id IN (SELECT id FROM notifications WHERE channel='whatsapp' AND sent_at IS NULL AND due_at<=now() AND (locked_until IS NULL OR locked_until<now()) AND attempts<8 ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING *")).rows;
  for(const job of rows){try{
   const row=(await pool.query('SELECT * FROM appointments WHERE id=$1',[job.appointment_id])).rows[0],a=row?toApp(row):null;
   if(!shouldSend(job,a,Date.now(),zone)){await pool.query("UPDATE notifications SET sent_at=now(),last_error='skipped: outdated' WHERE id=$1",[job.id]);continue;}
   const {site}=await getSite(pool);if(job.audience==='client'&&!site.booking.whatsappClientsEnabled||job.audience==='staff'&&!site.booking.whatsappStaffEnabled){await pool.query("UPDATE notifications SET sent_at=now(),last_error='skipped: disabled' WHERE id=$1",[job.id]);continue;}
   const master=(await pool.query('SELECT whatsapp_phone,whatsapp_opt_in FROM staff WHERE id=$1',[a.staffId])).rows[0];if(job.audience==='staff'&&(!master?.whatsapp_opt_in||master.whatsapp_phone.replace(/\D/g,'')!==job.recipient)){await pool.query("UPDATE notifications SET sent_at=now(),last_error='skipped: recipient changed' WHERE id=$1",[job.id]);continue;}
   if(!whatsappReady(job.kind)){await pool.query("UPDATE notifications SET locked_until=NULL,due_at=now()+interval '60 seconds',last_error='WhatsApp provider or template not configured' WHERE id=$1",[job.id]);continue;}
   const link=(process.env.APP_ORIGIN||'http://localhost:3001')+(job.audience==='staff'?'/#admin':'/#visit='+a.id+'&key='+viewToken(a.id)),payload={...job.payload,parameters:[...(job.payload.parameters||[]),link],manageUrl:link,text:job.payload.text+'\n'+link};let response,providerId;
   await pool.query('UPDATE notifications SET attempts=attempts+1 WHERE id=$1',[job.id]);
   if(process.env.WHATSAPP_WEBHOOK_URL){response=await fetch(process.env.WHATSAPP_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(process.env.WHATSAPP_WEBHOOK_TOKEN||''),'Idempotency-Key':job.id},body:JSON.stringify({id:job.id,to:job.recipient,kind:job.kind,audience:job.audience,template:process.env[templateEnv[job.kind]]||job.kind,language:process.env.WHATSAPP_LANGUAGE||'ru',...payload}),signal:AbortSignal.timeout(12000)});}
   else{response=await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN},body:JSON.stringify({messaging_product:'whatsapp',to:job.recipient,type:'template',template:{name:process.env[templateEnv[job.kind]],language:{code:process.env.WHATSAPP_LANGUAGE||'ru'},components:[{type:'body',parameters:payload.parameters.map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(12000)});if(response.ok)providerId=(await response.json()).messages?.[0]?.id;}
   if(!response.ok)throw new Error('Provider returned '+response.status);await pool.query('UPDATE notifications SET sent_at=now(),last_error=NULL,provider_message_id=$2 WHERE id=$1',[job.id,providerId||null]);
  }catch(e){await pool.query("UPDATE notifications SET locked_until=NULL,due_at=now()+($2::integer*interval '1 second'),last_error=$3 WHERE id=$1",[job.id,Math.min(3600,30*2**Math.min(8,job.attempts+1)),e.message.startsWith('Provider')?e.message:'WhatsApp delivery attempt failed']);}}
 }catch{console.error('WhatsApp queue unavailable');}finally{running=false;}}
 const timer=setInterval(tick,15000);tick();return()=>{stopped=true;clearInterval(timer);};
}
