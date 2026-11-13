import {services,staff,today,dateKey,generateSlots,totalFor,compatibleStaff} from '../shared/catalog.mjs';
import {isValidKgPhone,STUDIO_TIMEZONE} from '../shared/contact.mjs';
import {localNow} from '../server/domain.mjs';
import {validateSchedule} from '../server/domain.mjs';
import {defaultSite,studioPortfolio,normalizeSite,validateService,categoryLabels,validImage} from '../shared/site-content.mjs';
import {storeLocalImage} from './media';
import {accessState} from './state-store';
import {hydrateBooking,expirePayments,depositQuote,phoneKey,paymentPending,registerClient,addDemoNotifications} from '../shared/booking.mjs';
import {demoLogin,demoLogout,requireDemoAdmin} from './demo-auth';
export const DEMO=import.meta.env.VITE_DEMO!=='false';
const KEY='lumi-demo-v1';
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('lumi-bookings'):null;
const listeners=new Set();
const notify=()=>{listeners.forEach(fn=>fn());channel?.postMessage('update');};
channel?.addEventListener('message',()=>listeners.forEach(fn=>fn()));
window.addEventListener('storage',e=>{if(e.key===KEY)listeners.forEach(fn=>fn());});
function hydrate(value){
 const data=value??JSON.parse(localStorage.getItem(KEY)||JSON.stringify({services,staff,appointments:[],schedules:[]}));
 if(!data.contentVersion){
  data.services=data.services.map(s=>s.category==='nails'?{...s,is_active:false}:({...s,category:s.id===3?'lamination':s.category==='lashes'?'extensions':s.category,image:s.image||'/images/beauty.jpg'}));
  data.staff=data.staff.map(m=>({...m,role:m.role.includes('маникюр')||m.role.includes('маникюра')?(m.id===2?'Мастер ламинирования':'Мастер по ресницам'):m.role,serviceIds:m.serviceIds.filter(id=>![4,5,6].includes(id)).concat(m.id===2?[3]:[])}));data.contentVersion=1;
 }
 data.site??=structuredClone(defaultSite);data.site.legal??=structuredClone(defaultSite.legal);data.siteRevision??=0;
 if(!data.paymentDetailsVersion){if(!data.site.booking?.qrImage&&!data.site.booking?.recipient){data.site.booking={...data.site.booking,qrImage:defaultSite.booking.qrImage,recipient:defaultSite.booking.recipient,paymentNote:defaultSite.booking.paymentNote};data.siteRevision++;}data.paymentDetailsVersion=1;}
 if(!data.ownerNotificationVersion){if(!Object.hasOwn(data.site.booking||{},'ownerWhatsapp')){data.site.booking={...data.site.booking,ownerWhatsapp:defaultSite.booking.ownerWhatsapp,whatsappOwnerEnabled:defaultSite.booking.whatsappOwnerEnabled};data.siteRevision++;}data.ownerNotificationVersion=1;}
 if(!data.studioAddressVersion){const previous='ул. Исанова, 172';if(data.site.address===previous){data.site.address=defaultSite.address;if(data.site.addressNote==='Ориентировочный адрес · расположение уточняется')data.site.addressNote='';data.siteRevision++;}if(data.site.address===defaultSite.address)data.notifications=(data.notifications||[]).map(n=>n.state==='demo'?{...n,text:n.text?.replaceAll(previous,defaultSite.address),parameters:n.parameters?.map(p=>typeof p==='string'?p.replaceAll(previous,defaultSite.address):p)}:n);data.studioAddressVersion=1;}
 if(!data.studioPortfolioVersion){data.site.portfolio??=[];const added=studioPortfolio.filter(p=>!data.site.portfolio.some(existing=>existing.id===p.id||existing.image===p.image)).slice(0,Math.max(0,24-data.site.portfolio.length));if(added.length){data.site.portfolio.push(...structuredClone(added));data.siteRevision++;}data.studioPortfolioVersion=1;}
 if(!data.studioTeamVersion){for(const m of data.staff){if(m.id===1){if(['Анна','Мадина'].includes(m.name))m.name='Мадина';if(m.image==='/images/anna.jpg')m.image='/images/master-madina-reference.svg';}if(m.id===2){if(['Мария','Мия демо','Мия'].includes(m.name))m.name='Мия';if(m.image==='/images/maria.jpg')m.image='/images/master-mia-reference.svg';}}data.studioTeamVersion=1;}
 if(!data.studioHeroVersion){if(['/images/beauty.jpg','/images/hero.jpg'].includes(data.site.hero.image)){data.site.hero.image=defaultSite.hero.image;data.siteRevision++;}data.studioHeroVersion=1;}
 return expirePayments(hydrateBooking(data));
}
function publicData(d){return {services:d.services.filter(s=>s.is_active!==false&&categoryLabels[s.category]),staff:d.staff.filter(s=>s.is_active!==false).map(({whatsapp,whatsappOptIn,...s})=>s),site:d.site,siteRevision:d.siteRevision,timezone:STUDIO_TIMEZONE};}
function commit(data){try{const previous=JSON.parse(localStorage.getItem(KEY)||'null');if(!previous||!(previous.stateVersion>data.stateVersion))localStorage.setItem(KEY,JSON.stringify(data));}catch{}notify();}
const read=()=>accessState(hydrate,null,commit);
const atomic=fn=>accessState(hydrate,fn,commit);
const conflict=()=>{const e=new Error('Это время уже занято. Пожалуйста, выберите другое.');e.status=409;throw e;};
function slots(data,{date,serviceIds,staffId},exclude){
 const {duration}=totalFor(serviceIds,publicData(data).services);
 const team=compatibleStaff(serviceIds,publicData(data).staff).filter(s=>!staffId||s.id===Number(staffId));
 const now=new Date();const local=localNow(STUDIO_TIMEZONE);
 return team.flatMap(s=>{
  const schedule=data.schedules.find(x=>x.date===date&&x.staffId===s.id)||{start:540,end:1200,breaks:[{start:840,end:870}]};
  if(schedule.off||date<local.date||dateKey(new Date(now.getTime()+90*864e5))<date)return [];
  const busy=[...schedule.breaks,...data.appointments.filter(a=>a.id!==exclude&&a.date===date&&a.staffId===s.id&&a.status!=='cancelled'&&a.status!=='expired'&&(a.status!=='held'||a.expiresAt>Date.now())).map(a=>({start:a.start,end:a.end}))];
  return generateSlots({start:schedule.start,end:schedule.end,duration,busy,notBefore:date===local.date?local.minute+30:0}).map(t=>({start:t,staffId:s.id}));
 }).sort((a,b)=>a.start-b.start||a.staffId-b.staffId);
}
async function request(path,body,method=body?'POST':'GET'){
 const res=await fetch('/api'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await res.json();if(!res.ok){const e=new Error(data.error||'Не удалось выполнить запрос');e.status=res.status;throw e;}return data;
}
export const api={
 async catalog(){if(!DEMO)return request('/catalog');return publicData(await read());},
 async slots(q){return DEMO?slots(await read(),q):request('/slots?'+new URLSearchParams({...q,serviceIds:q.serviceIds.join(',')}));},
 async hold(q){if(!DEMO)return request('/holds',q);return atomic(data=>{
  const match=slots(data,q).find(s=>s.start===q.start);if(!match)conflict();
  const totals=totalFor(q.serviceIds,data.services);const a={id:crypto.randomUUID(),token:crypto.randomUUID(),...q,staffId:match.staffId,end:q.start+totals.duration,price:totals.price,titles:totals.selected.map(s=>s.title),status:'held',expiresAt:Date.now()+6*60e3};data.appointments.push(a);return a;
 });},
 async release(a){if(!a)return;if(!DEMO)return request('/holds/'+a.id,{token:a.token},'DELETE');return atomic(d=>{const x=d.appointments.find(x=>x.id===a.id&&x.token===a.token&&x.status==='held');if(x)x.status='expired';});},
 async quote(q){if(!DEMO)return request('/booking-quote',q);const d=await read(),a=d.appointments.find(a=>a.id===q.id&&a.token===q.token);if(!a||!isValidKgPhone(q.phone))throw new Error('Проверьте номер и резерв');return depositQuote(d.clients,q.phone,a.price,d.site.booking);},
 async book(q){if(!isValidKgPhone(q.phone))throw new Error('Введите телефон в формате +996 (XXX) XXX-XXX');if(!DEMO)return request('/appointments',q);return atomic(d=>{
  const a=d.appointments.find(a=>a.id===q.id&&a.token===q.token);if(!a)conflict();if(['confirmed','pending_payment','payment_review'].includes(a.status))return a;if(a.status!=='held'||a.expiresAt<=Date.now())conflict();
  const quote=depositQuote(d.clients,q.phone,a.price,d.site.booking);
  if(quote.requiresDeposit&&d.appointments.some(x=>x.id!==a.id&&phoneKey(x.phone)===phoneKey(q.phone)&&paymentPending(x)))throw new Error('У вас уже есть заявка с неоплаченной предоплатой. Завершите её или свяжитесь со студией.');
  Object.assign(a,{name:q.name.trim(),phone:q.phone,comment:q.comment||'',notifyWhatsapp:!!q.notifyWhatsapp,status:quote.requiresDeposit?'pending_payment':'confirmed',depositAmount:quote.depositAmount,depositPaid:0,paymentStatus:quote.requiresDeposit?'awaiting_transfer':'not_required',paymentDeadline:quote.requiresDeposit?Date.now()+d.site.booking.paymentMinutes*60000:null});
  if(a.status==='confirmed')registerClient(d.clients,a,'booking');addDemoNotifications(d,a,'created');return a;
 });},
 async visit(id,token){if(!DEMO){const res=await fetch('/api/appointments/'+id,{headers:{Authorization:'Bearer '+token},credentials:'same-origin'});const d=await res.json();if(!res.ok)throw new Error(d.error||'Запись не найдена');return {...d,token};}const d=await read(),a=d.appointments.find(a=>a.id===id&&a.token===token);if(!a)throw new Error('Запись не найдена');return a;},
 async submitReceipt(id,token,blob){if(!DEMO){const res=await fetch('/api/appointments/'+id+'/receipt',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':blob.type},credentials:'same-origin',body:blob});const d=await res.json();if(!res.ok)throw new Error(d.error||'Чек не отправлен');return {...d,token};}const image=await storeLocalImage(blob);return atomic(d=>{const a=d.appointments.find(a=>a.id===id&&a.token===token);if(!a||!paymentPending(a))throw new Error('Запись уже подтверждена или срок оплаты истёк');a.receipt=image;a.receiptMime=blob.type;a.hasReceipt=true;a.status='payment_review';a.paymentStatus='review';a.paymentNote='';addDemoNotifications(d,a,'receipt');return a;});},
 async confirmPayment(id,amount,verified){if(!verified)throw new Error('Подтвердите, что поступление проверено');if(!DEMO)return request('/admin/payments/'+id+'/confirm',{amount,verified});return atomic(d=>{const a=d.appointments.find(a=>a.id===id);if(!a)throw new Error('Запись не найдена');if(a.paymentStatus==='paid')return a;if(!paymentPending(a)||amount!==a.depositAmount)throw new Error('Проверьте сумму и состояние записи');a.status='confirmed';a.paymentStatus='paid';a.depositPaid=a.depositAmount;a.paymentDeadline=null;registerClient(d.clients,a);addDemoNotifications(d,a,'confirmed');return a;});},
 async rejectPayment(id,reason){if(!DEMO)return request('/admin/payments/'+id+'/reject',{reason});return atomic(d=>{const a=d.appointments.find(a=>a.id===id);if(!a||!paymentPending(a))throw new Error('Запись недоступна для проверки');a.status='pending_payment';a.paymentStatus='rejected';a.paymentNote=reason||'Не удалось подтвердить перевод. Свяжитесь со студией.';a.paymentDeadline=Date.now()+d.site.booking.paymentMinutes*60000;return a;});},
 async addClient(c){if(!c.name?.trim()||!isValidKgPhone(c.phone))throw new Error('Проверьте имя и телефон');if(!DEMO)return request('/admin/clients',c);return atomic(d=>registerClient(d.clients,{...c,id:crypto.randomUUID()},'admin'));},
 async cancel(id,token){if(!DEMO)return request('/appointments/'+id+'/cancel',{token},'PATCH');return atomic(d=>{const a=d.appointments.find(x=>x.id===id&&x.token===token);if(!a)throw new Error('Запись не найдена');if(!['confirmed','new','pending_payment','payment_review','cancelled'].includes(a.status))throw new Error('Этот визит нельзя отменить');if(a.status!=='cancelled'){a.status='cancelled';addDemoNotifications(d,a,'cancelled');}return a;});},
 async login(login,password){return DEMO?demoLogin(login,password):request('/admin/login',{login,password});},
 async logout(){if(DEMO)demoLogout();else await request('/admin/logout',{});},
 async adminData(){if(DEMO){const d=await read();return {...d,...publicData(d),staff:d.staff,whatsappReady:false};}return request('/admin/data');},
 async status(id,status){if(!DEMO)return request('/admin/appointments/'+id,{status},'PATCH');return atomic(d=>{const a=d.appointments.find(x=>x.id===id);if(!a)throw new Error('Запись не найдена');if(a.status==='cancelled'&&status!=='cancelled')throw new Error('Создайте новую запись для отменённого визита');if(paymentPending(a)&&!['cancelled',a.status].includes(status))throw new Error('Сначала подтвердите предоплату');if(status==='cancelled'&&a.status!=='cancelled')addDemoNotifications(d,{...a,status},'cancelled');a.status=status;});},
 async saveService(value){const s=validateService(value);if(!DEMO)return request(s.id?'/admin/services/'+s.id:'/admin/services',s,s.id?'PUT':'POST');return atomic(d=>{let id=s.id;if(id){const existing=d.services.find(x=>x.id===id&&x.is_active!==false);if(!existing)throw new Error('Услуга больше недоступна');Object.assign(existing,s);}else{id=Math.max(100,...d.services.map(s=>s.id))+1;d.services.push({...s,id,is_active:true});}d.staff.forEach(m=>{m.serviceIds=m.serviceIds.filter(sid=>sid!==id);if(s.staffIds.includes(m.id))m.serviceIds.push(id);});return {id};});},
 async deleteService(id){if(!DEMO)return request('/admin/services/'+id,{},'DELETE');return atomic(d=>{const s=d.services.find(s=>s.id===id);if(s)s.is_active=false;});},
 async saveStaff(s){if(!s.name?.trim()||!s.role?.trim()||!validImage(s.image||'')||(s.whatsapp&&!isValidKgPhone(s.whatsapp))||(s.whatsappOptIn&&!isValidKgPhone(s.whatsapp)))throw new Error('Проверьте имя, фото и номер WhatsApp мастера');if(!DEMO)return request('/admin/staff/'+s.id,s,'PUT');return atomic(d=>{const m=d.staff.find(m=>m.id===s.id);if(!m)throw new Error('Мастер не найден');Object.assign(m,{name:s.name.trim(),role:s.role.trim(),image:s.image,is_active:s.is_active,whatsapp:s.whatsapp||'',whatsappOptIn:!!s.whatsappOptIn});});},
 async saveSite(site,revision){const normalized=normalizeSite(site);if(!DEMO)return request('/admin/site',{site:normalized,revision},'PUT');return atomic(d=>{if(d.siteRevision!==revision){const e=new Error('Сайт уже изменён в другой вкладке. Загрузите сохранённую версию перед повторным редактированием.');e.status=409;throw e;}d.site=normalized;d.siteRevision++;return {site:normalized,siteRevision:d.siteRevision};});},
 async uploadImage(blob){if(DEMO)return storeLocalImage(blob);const res=await fetch('/api/admin/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type},body:blob});const data=await res.json();if(!res.ok)throw new Error(data.error||'Не удалось загрузить фото');return data.image;},
 async schedule(q){validateSchedule(q);if(!DEMO)return request('/admin/schedules',q,'PUT');return atomic(d=>{
  const apps=d.appointments.filter(a=>a.date===q.date&&a.staffId===q.staffId&&!['cancelled','expired'].includes(a.status)&&(a.status!=='held'||a.expiresAt>Date.now()));
  if(apps.some(a=>q.off||a.start<q.start||a.end>q.end||q.breaks.some(b=>a.start<b.end&&a.end>b.start)))throw new Error('График пересекается с существующей записью');
  d.schedules=d.schedules.filter(s=>s.date!==q.date||s.staffId!==q.staffId);d.schedules.push(q);
 });},
 subscribe(fn){listeners.add(fn);let es;if(!DEMO){es=new EventSource('/api/events');es.onmessage=fn;es.onerror=()=>fn();}const timer=setInterval(fn,30000);return()=>{listeners.delete(fn);es?.close();clearInterval(timer);};}
};
// The same admin operations require a session in both modes. Static demo data remains browser-local.
for(const name of ['adminData','status','saveService','deleteService','saveStaff','saveSite','uploadImage','schedule','addClient','confirmPayment','rejectPayment']){
 const operation=api[name];api[name]=async(...args)=>{if(DEMO)requireDemoAdmin();return operation(...args);};
}
