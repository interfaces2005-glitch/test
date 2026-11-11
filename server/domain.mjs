import {generateSlots,totalFor,compatibleStaff,dateKey} from '../shared/catalog.mjs';
export const HOLD_SECONDS=360;
export function validateSelection(q){
 if(!q||!/^\d{4}-\d{2}-\d{2}$/.test(q.date)||isNaN(Date.parse(q.date+'T12:00:00Z'))||new Date(q.date+'T12:00:00Z').toISOString().slice(0,10)!==q.date)throw Object.assign(new Error('Некорректная дата'),{status:400});
 if(!Array.isArray(q.serviceIds)||!q.serviceIds.length||q.serviceIds.length>6||!q.serviceIds.every(Number.isInteger)||new Set(q.serviceIds).size!==q.serviceIds.length)throw Object.assign(new Error('Выберите услуги'),{status:400});
 if(q.staffId!=null&&q.staffId!==''&&(!Number.isInteger(Number(q.staffId))||Number(q.staffId)<1))throw Object.assign(new Error('Некорректный мастер'),{status:400});
}
export function validateSchedule(q){
 if(!Number.isInteger(q.start)||!Number.isInteger(q.end)||q.start<600||q.end>1200||q.start>=q.end||!Array.isArray(q.breaks)||q.breaks.length>10||q.breaks.some(b=>!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<q.start||b.end>q.end||b.start>=b.end))throw Object.assign(new Error('Проверьте смену и перерывы (10:00–20:00)'),{status:400});
}
export function localNow(zone,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute)};
}
export function calculateSlots({catalog,schedules=[],appointments=[],query,now}){
 const {duration}=totalFor(query.serviceIds,catalog.services);
 const max=new Date(now.date+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+90);
 if(query.date<now.date||query.date>max.toISOString().slice(0,10))return [];
 return compatibleStaff(query.serviceIds,catalog.staff).filter(m=>!query.staffId||m.id===Number(query.staffId)).flatMap(m=>{
  const schedule=schedules.find(s=>s.staffId===m.id)||{start:600,end:1200,off:false,breaks:[{start:840,end:870}]};if(schedule.off)return [];
  const busy=[...schedule.breaks,...appointments.filter(a=>a.staffId===m.id&&!['cancelled','expired'].includes(a.status)&&(a.status!=='held'||a.expiresAt>Date.now())).map(a=>({start:a.start,end:a.end}))];
  return generateSlots({start:schedule.start,end:schedule.end,duration,busy,notBefore:query.date===now.date?now.minute+30:0}).map(start=>({start,staffId:m.id}));
 }).sort((a,b)=>a.start-b.start||a.staffId-b.staffId);
}
// Convert a studio wall-clock time to UTC without depending on the server timezone.
export function studioInstant(date,minute,zone){
 let guess=Date.parse(date+'T00:00:00Z')+minute*60000;
 for(let i=0;i<3;i++){const local=localNow(zone,new Date(guess));const represented=Date.parse(local.date+'T00:00:00Z')+local.minute*60000;guess+=Date.parse(date+'T00:00:00Z')+minute*60000-represented;}
 return new Date(guess);
}
