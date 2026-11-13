export const services = [
 {id:1,title:'Классическое наращивание',category:'extensions',duration:120,price:1800,description:'Естественный объём, который подчёркивает ваш взгляд.',tag:'Естественная красота',image:'/images/beauty.jpg'},
 {id:2,title:'Объёмное наращивание 2D–3D',category:'extensions',duration:150,price:2000,description:'Выразительный взгляд и невесомый объём.',tag:'Выбор гостей',image:'/images/beauty.jpg'},
 {id:3,title:'Ламинирование ресниц',category:'lamination',duration:60,price:2400,description:'Красивый изгиб и бережный уход за своими ресницами.',tag:'Без наращивания',image:'/images/beauty.jpg'}
];
export const staff = [
 {id:1,name:'Мадина',role:'Мастер по ресницам',serviceIds:[1,2,3],image:'/images/master-madina-reference.svg'},
 {id:2,name:'Мия',role:'Мастер ламинирования',serviceIds:[3],image:'/images/master-mia-reference.svg'},
 {id:3,name:'Алина',role:'Мастер по ресницам',serviceIds:[1,2,3],image:'/images/alina.jpg'}
];
export const money = n => new Intl.NumberFormat('ru-RU').format(n)+' сом';
export const durationLabel = n => [n>=60?`${Math.floor(n/60)} ч`:'',n%60?`${n%60} мин`:''].filter(Boolean).join(' ');
export const pad = n=>String(n).padStart(2,'0');
export const dateKey = d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const today = ()=>dateKey(new Date());
export const minuteLabel = n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
export function generateSlots({start=540,end=1200,duration,busy=[],notBefore=0}) {
 const slots=[];
 for(let t=start;t+duration<=end;t+=30) if(t>=notBefore&&!busy.some(b=>t<b.end&&t+duration>b.start)) slots.push(t);
 return slots;
}
export function totalFor(ids, catalog=services){
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length) throw new Error('Выберите услуги');
 const selected=ids.map(id=>catalog.find(s=>s.id===Number(id)));
 if(selected.some(s=>!s)) throw new Error('Услуга недоступна');
 return {price:selected.reduce((n,s)=>n+Number(s.price),0),duration:selected.reduce((n,s)=>n+s.duration,0),selected};
}
export function compatibleStaff(ids, team=staff){return team.filter(s=>ids.every(id=>s.serviceIds.includes(Number(id))));}
