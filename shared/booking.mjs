import {STUDIO_TIMEZONE,isValidKgPhone} from './contact.mjs';
import {studioInstant} from './time.mjs';
import {minuteLabel} from './catalog.mjs';
export const OPENING_MINUTE=540;
export const bookingDefaults={depositEnabled:true,depositAmount:500,paymentMinutes:30,qrImage:'',recipient:'',paymentNote:'Переведите предоплату по QR и отправьте чек. Запись подтвердится после проверки поступления.',reminderMinutes:60,whatsappClientsEnabled:true,whatsappStaffEnabled:true,ownerWhatsapp:'',whatsappOwnerEnabled:true};
export const phoneKey=value=>String(value||'').replace(/\D/g,'');
export const paymentPending=a=>['pending_payment','payment_review'].includes(a.status);
export function depositQuote(clients,phone,price,settings=bookingDefaults){const known=clients.some(c=>phoneKey(c.phone)===phoneKey(phone));const amount=!known&&settings.depositEnabled?Math.min(settings.depositAmount,Number(price)):0;return {knownClient:known,requiresDeposit:amount>0,depositAmount:amount,remainingAmount:Math.max(0,Number(price)-amount),paymentReady:!!settings.qrImage};}
export function hydrateBooking(data){
 data.site.booking={...bookingDefaults,...data.site.booking};data.clients??=[];data.notifications??=[];
 if(!data.bookingVersion){
  data.schedules=data.schedules.map(s=>s.start===600?{...s,start:540}:s);
  if(data.site.hours==='Ежедневно, 10:00–20:00')data.site.hours='Ежедневно, 09:00–20:00';
  for(const a of data.appointments)if(['confirmed','completed'].includes(a.status)&&isValidKgPhone(a.phone)&&!data.clients.some(c=>phoneKey(c.phone)===phoneKey(a.phone)))data.clients.push({id:'legacy-'+a.id,name:a.name,phone:phoneKey(a.phone),source:'legacy'});
  data.bookingVersion=1;
 }
 return data;
}
export function expirePayments(data,now=Date.now()){
 for(const a of data.appointments)if(a.status==='pending_payment'&&a.paymentDeadline<=now){a.status='cancelled';a.paymentStatus='expired';}
 return data;
}
export function registerClient(clients,a,source='payment'){const phone=phoneKey(a.phone);let c=clients.find(c=>phoneKey(c.phone)===phone);if(!c){c={id:'client-'+a.id,name:a.name,phone,source};clients.push(c);}return c;}
export function notificationJobs(a,site,master,event,now=Date.now(),zone=STUDIO_TIMEZONE){
 const settings={...bookingDefaults,...site.booking},date=a.date.split('-').reverse().join('.'),time=minuteLabel(a.start),address=`${site.city}, ${site.address}`;
 const visit=studioInstant(a.date,a.start,zone).getTime(),jobs=[];
 const payment=a.depositPaid?`Получено ${a.depositPaid} сом`:a.depositAmount?a.status==='payment_review'?`Чек на проверке: ${a.depositAmount} сом`:`Ожидается ${a.depositAmount} сом`:'Без предоплаты';
 const add=(kind,audience,recipient,text,dueAt=now)=>jobs.push({kind,audience,recipient:phoneKey(recipient),text,dueAt,appointmentId:a.id,parameters:[site.brand,audience==='client'?a.name:`${a.name}, ${a.phone}`,a.titles.join(', '),date,time,master?.name||'Мастер',address,audience==='client'?(a.depositAmount?`${a.depositAmount} сом`:'Без предоплаты'):payment]});
 const details=`${a.titles.join(', ')} · ${date} в ${time}\nМастер: ${master?.name||'указан в записи'}\n${address}`;
 const client=settings.whatsappClientsEnabled&&a.notifyWhatsapp&&isValidKgPhone(a.phone);
 const staff=settings.whatsappStaffEnabled&&master?.whatsappOptIn&&isValidKgPhone(master.whatsapp);
 const owner=settings.whatsappOwnerEnabled&&isValidKgPhone(settings.ownerWhatsapp);
 const management=(kind,text)=>{if(owner)add(kind.replace('staff_','owner_'),'owner',settings.ownerWhatsapp,text);if(staff&&(!owner||phoneKey(master.whatsapp)!==phoneKey(settings.ownerWhatsapp)))add(kind,'staff',master.whatsapp,text);};
 if(event==='cancelled'){
  if(client)add('client_cancelled','client',a.phone,`${site.brand}: запись отменена.\n${details}`);
  management('staff_cancelled',`Отмена записи: ${a.name}, ${a.phone}\n${details}`);return jobs;
 }
 if(event==='receipt'){
  management('staff_receipt',`Нужно проверить предоплату ${a.depositAmount} сом.\n${a.name}, ${a.phone}\n${details}`);return jobs;
 }
 if(event==='created'&&paymentPending(a)){
  if(client)add('client_pending','client',a.phone,`${site.brand}: заявка принята, ожидаем предоплату ${a.depositAmount} сом.\n${details}\nПодтверждение придёт после проверки перевода.`);
  management('staff_new',`Новая заявка: ${a.name}, ${a.phone}\n${details}\n${payment}.`);return jobs;
 }
 if(['created','confirmed'].includes(event)&&a.status==='confirmed'){
  if(client)add('client_confirmed','client',a.phone,`${site.brand}: ${a.name}, ваша запись подтверждена!\n${details}${a.depositPaid?`\nПредоплата ${a.depositPaid} сом получена. Остаток: ${Math.max(0,a.price-a.depositPaid)} сом.`:'\nПредоплата не требуется.'}`);
  management(event==='created'?'staff_new':'staff_confirmed',`Запись подтверждена: ${a.name}, ${a.phone}\n${details}\n${a.depositPaid?`Предоплата: ${a.depositPaid} сом.`:'Постоянный клиент, без предоплаты.'}`);
  const dueAt=visit-settings.reminderMinutes*60000;
  if(client&&dueAt>now)add('client_reminder','client',a.phone,`${site.brand}: напоминаем о вашем визите через ${settings.reminderMinutes} мин.\n${details}`,dueAt);
 }
 return jobs;
}
export function addDemoNotifications(data,a,event,now=Date.now()){
 const master=data.staff.find(s=>s.id===a.staffId);for(const job of notificationJobs(a,data.site,master,event,now)){if(data.notifications.some(n=>n.appointmentId===a.id&&n.kind===job.kind))continue;data.notifications.push({...job,id:crypto.randomUUID(),state:'demo',createdAt:now});}
 if(event==='cancelled')data.notifications=data.notifications.map(n=>n.appointmentId===a.id&&n.kind==='client_reminder'?{...n,state:'cancelled'}:n);
}
