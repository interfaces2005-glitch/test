import {randomUUID} from 'node:crypto';
import {studioInstant} from './domain.mjs';
import {minuteLabel} from '../shared/catalog.mjs';
export async function enqueue(db,a,kind,zone){
 if(kind==='cancelled')await db.query("DELETE FROM notifications WHERE appointment_id=$1 AND kind LIKE 'reminder%' AND sent_at IS NULL",[a.id]);
 const jobs=[['telegram',kind,new Date()],['sms',kind,new Date()]];
 if(kind==='created')for(const hours of [24,2]){const due=new Date(studioInstant(typeof a.date==='string'?a.date:a.date.toISOString().slice(0,10),a.start,zone).getTime()-hours*3600e3);if(due>new Date())jobs.push(['sms','reminder'+hours,due]);}
 for(const [channel,type,due] of jobs)await db.query('INSERT INTO notifications(id,appointment_id,channel,kind,due_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(appointment_id,channel,kind) DO NOTHING',[randomUUID(),a.id,channel,type,due]);
}
export function startNotifications(pool,zone){let running=false;let stopped=false;
 async function tick(){if(running||stopped)return;running=true;try{
  const rows=(await pool.query("UPDATE notifications SET locked_until=now()+interval '5 minutes',attempts=attempts+1 WHERE id IN (SELECT id FROM notifications WHERE sent_at IS NULL AND due_at<=now() AND (locked_until IS NULL OR locked_until<now()) AND attempts<8 AND ((channel='telegram' AND $1) OR (channel='sms' AND $2)) ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING *",[!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID),!!process.env.SMS_WEBHOOK_URL])).rows;
  for(const job of rows){try{
   const a=(await pool.query('SELECT * FROM appointments WHERE id=$1',[job.appointment_id])).rows[0];if(!a||((job.kind==='created'||job.kind.startsWith('reminder'))&&!['new','confirmed'].includes(a.status))){await pool.query('UPDATE notifications SET sent_at=now(),last_error=$2 WHERE id=$1',[job.id,'Skipped: inactive appointment']);continue;}
   const date=typeof a.date==='string'?a.date:a.date.toISOString().slice(0,10);const label=job.kind==='cancelled'?'Запись отменена':job.kind.startsWith('reminder')?'Напоминание о визите':'Новая запись';
   const text=`MADINLASHES · ${label}\n${a.name}\n${a.phone}\n${a.titles.join(', ')}\n${date} в ${minuteLabel(a.start)} (${zone})\n${process.env.STUDIO_ADDRESS||''}`;
   let response;
   if(job.channel==='telegram'){response=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text}),signal:AbortSignal.timeout(12000)});if(response.ok&&!(await response.json()).ok)throw new Error('Provider rejected delivery');}
   else{if(!process.env.SMS_WEBHOOK_URL.startsWith('https://'))throw new Error('SMS webhook requires HTTPS');response=await fetch(process.env.SMS_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(process.env.SMS_WEBHOOK_TOKEN||''),'Idempotency-Key':job.id},body:JSON.stringify({id:job.id,phone:a.phone,text}),signal:AbortSignal.timeout(12000)});}
   if(!response.ok)throw new Error('Provider returned '+response.status);await pool.query('UPDATE notifications SET sent_at=now(),last_error=NULL WHERE id=$1',[job.id]);
  }catch(e){await pool.query("UPDATE notifications SET due_at=now()+($2::integer*interval '1 second'),locked_until=NULL,last_error=$3 WHERE id=$1",[job.id,Math.min(3600,30*2**job.attempts),e.message.startsWith('Provider')?e.message:'Delivery failed; check configuration']);}}
 }catch{console.error('Notification queue unavailable');}finally{running=false;}}
 const timer=setInterval(tick,15000);tick();return()=>{stopped=true;clearInterval(timer);};
}
