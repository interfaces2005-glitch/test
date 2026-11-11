import {services,staff,today,dateKey,generateSlots,totalFor,compatibleStaff} from '../shared/catalog.mjs';
import {isValidKgPhone,STUDIO_TIMEZONE} from '../shared/contact.mjs';
import {localNow} from '../server/domain.mjs';
import {validateSchedule} from '../server/domain.mjs';
import {defaultSite,normalizeSite,validateService,categoryLabels,validImage} from '../shared/site-content.mjs';
import {storeLocalImage} from './media';
import {accessState} from './state-store';
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
 data.site??=structuredClone(defaultSite);data.site.legal??=structuredClone(defaultSite.legal);data.siteRevision??=0;return data;
}
function publicData(d){return {services:d.services.filter(s=>s.is_active!==false&&categoryLabels[s.category]),staff:d.staff.filter(s=>s.is_active!==false),site:d.site,siteRevision:d.siteRevision,timezone:STUDIO_TIMEZONE};}
function commit(data){try{const previous=JSON.parse(localStorage.getItem(KEY)||'null');if(!previous||!(previous.stateVersion>data.stateVersion))localStorage.setItem(KEY,JSON.stringify(data));}catch{}notify();}
const read=()=>accessState(hydrate,null,commit);
const atomic=fn=>accessState(hydrate,fn,commit);
const conflict=()=>{const e=new Error('Это время уже занято. Пожалуйста, выберите другое.');e.status=409;throw e;};
function slots(data,{date,serviceIds,staffId},exclude){
 const {duration}=totalFor(serviceIds,publicData(data).services);
 const team=compatibleStaff(serviceIds,publicData(data).staff).filter(s=>!staffId||s.id===Number(staffId));
 const now=new Date();const local=localNow(STUDIO_TIMEZONE);
 return team.flatMap(s=>{
  const schedule=data.schedules.find(x=>x.date===date&&x.staffId===s.id)||{start:600,end:1200,breaks:[{start:840,end:870}]};
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
 async book(q){if(!isValidKgPhone(q.phone))throw new Error('Введите телефон в формате +996 (XXX) XXX-XXX');if(!DEMO)return request('/appointments',q);return atomic(d=>{
  const a=d.appointments.find(a=>a.id===q.id&&a.token===q.token);if(!a||a.expiresAt<=Date.now()||!['held','confirmed'].includes(a.status))conflict();if(a.status==='confirmed')return a;
  Object.assign(a,{name:q.name,phone:q.phone,comment:q.comment,status:'confirmed'});return a;
 });},
 async cancel(id,token){if(!DEMO)return request('/appointments/'+id+'/cancel',{token},'PATCH');return atomic(d=>{const a=d.appointments.find(x=>x.id===id&&x.token===token);if(!a)throw new Error('Запись не найдена');a.status='cancelled';return a;});},
 async login(password){return DEMO?{demo:true}:request('/admin/login',{password});},
 async logout(){if(!DEMO)await request('/admin/logout',{});},
 async adminData(){if(DEMO){const d=await read();return {...d,...publicData(d),staff:d.staff};}return request('/admin/data');},
 async status(id,status){if(!DEMO)return request('/admin/appointments/'+id,{status},'PATCH');return atomic(d=>{const a=d.appointments.find(x=>x.id===id);if(!a)throw new Error('Запись не найдена');if(a.status==='cancelled'&&status!=='cancelled')throw new Error('Создайте новую запись для отменённого визита');a.status=status;});},
 async saveService(value){const s=validateService(value);if(!DEMO)return request(s.id?'/admin/services/'+s.id:'/admin/services',s,s.id?'PUT':'POST');return atomic(d=>{let id=s.id;if(id){const existing=d.services.find(x=>x.id===id&&x.is_active!==false);if(!existing)throw new Error('Услуга больше недоступна');Object.assign(existing,s);}else{id=Math.max(100,...d.services.map(s=>s.id))+1;d.services.push({...s,id,is_active:true});}d.staff.forEach(m=>{m.serviceIds=m.serviceIds.filter(sid=>sid!==id);if(s.staffIds.includes(m.id))m.serviceIds.push(id);});return {id};});},
 async deleteService(id){if(!DEMO)return request('/admin/services/'+id,{},'DELETE');return atomic(d=>{const s=d.services.find(s=>s.id===id);if(s)s.is_active=false;});},
 async saveStaff(s){if(!s.name?.trim()||!s.role?.trim()||!validImage(s.image||''))throw new Error('Проверьте имя, специализацию и фото мастера');if(!DEMO)return request('/admin/staff/'+s.id,s,'PUT');return atomic(d=>{const m=d.staff.find(m=>m.id===s.id);if(!m)throw new Error('Мастер не найден');Object.assign(m,{name:s.name.trim(),role:s.role.trim(),image:s.image,is_active:s.is_active});});},
 async saveSite(site,revision){const normalized=normalizeSite(site);if(!DEMO)return request('/admin/site',{site:normalized,revision},'PUT');return atomic(d=>{if(d.siteRevision!==revision){const e=new Error('Сайт уже изменён в другой вкладке. Загрузите сохранённую версию перед повторным редактированием.');e.status=409;throw e;}d.site=normalized;d.siteRevision++;return {site:normalized,siteRevision:d.siteRevision};});},
 async uploadImage(blob){if(DEMO)return storeLocalImage(blob);const res=await fetch('/api/admin/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type},body:blob});const data=await res.json();if(!res.ok)throw new Error(data.error||'Не удалось загрузить фото');return data.image;},
 async schedule(q){validateSchedule(q);if(!DEMO)return request('/admin/schedules',q,'PUT');return atomic(d=>{
  const apps=d.appointments.filter(a=>a.date===q.date&&a.staffId===q.staffId&&!['cancelled','expired'].includes(a.status)&&(a.status!=='held'||a.expiresAt>Date.now()));
  if(apps.some(a=>q.off||a.start<q.start||a.end>q.end||q.breaks.some(b=>a.start<b.end&&a.end>b.start)))throw new Error('График пересекается с существующей записью');
  d.schedules=d.schedules.filter(s=>s.date!==q.date||s.staffId!==q.staffId);d.schedules.push(q);
 });},
 subscribe(fn){listeners.add(fn);let es;if(!DEMO){es=new EventSource('/api/events');es.onmessage=fn;es.onerror=()=>fn();}const timer=setInterval(fn,30000);return()=>{listeners.delete(fn);es?.close();clearInterval(timer);};}
};
