export function localNow(zone,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute)};
}
export function studioInstant(date,minute,zone){let guess=Date.parse(date+'T00:00:00Z')+minute*60000;for(let i=0;i<3;i++){const local=localNow(zone,new Date(guess));const represented=Date.parse(local.date+'T00:00:00Z')+local.minute*60000;guess+=Date.parse(date+'T00:00:00Z')+minute*60000-represented;}return new Date(guess);}
