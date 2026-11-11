import {test} from 'node:test';
import assert from 'node:assert/strict';
import {services,staff,generateSlots,totalFor,compatibleStaff} from '../shared/catalog.mjs';
import {calculateSlots,validateSelection,validateSchedule,localNow,studioInstant} from '../server/domain.mjs';
const base={catalog:{services,staff},query:{date:'2026-11-12',serviceIds:[1],staffId:1},now:{date:'2026-11-11',minute:900}};
test('slots fit full duration, exclude overlaps and allow adjacent appointments',()=>{
 assert.deepEqual(generateSlots({start:600,end:840,duration:60,busy:[{start:660,end:750}]}),[600,750,780]);
 assert.deepEqual(generateSlots({start:600,end:660,duration:90}),[]);
});
test('combined services sum prices and durations and restrict staff',()=>{
 const total=totalFor([1,3]);assert.equal(total.price,5200);assert.equal(total.duration,180);assert.deepEqual(compatibleStaff([1,3]).map(s=>s.id),[1,3]);assert.throws(()=>totalFor([1,1]));assert.throws(()=>totalFor([999]));
});
test('breaks and bookings remove every overlapping start, cancellation restores it',()=>{
 const a={staffId:1,start:600,end:720,status:'confirmed'};
 const result=calculateSlots({...base,appointments:[a]});assert.equal(result.some(s=>s.start===600),false);assert.equal(result.some(s=>s.start===720),true);assert.equal(result.some(s=>s.start===750),false);
 assert.equal(calculateSlots({...base,appointments:[{...a,status:'cancelled'}]}).some(s=>s.start===600),true);
});
test('active holds block slots and expired holds do not',()=>{
 const a={staffId:1,start:600,end:720,status:'held',expiresAt:Date.now()+60000};assert.equal(calculateSlots({...base,appointments:[a]}).some(s=>s.start===600),false);assert.equal(calculateSlots({...base,appointments:[{...a,expiresAt:Date.now()-1}]}).some(s=>s.start===600),true);
});
test('days off, past dates and schedule bounds are respected',()=>{
 assert.deepEqual(calculateSlots({...base,schedules:[{staffId:1,off:true}]}),[]);assert.deepEqual(calculateSlots({...base,query:{...base.query,date:'2026-11-10'}}),[]);const slots=calculateSlots({...base,schedules:[{staffId:1,start:660,end:840,breaks:[]}]});assert.deepEqual(slots.map(s=>s.start),[660,690,720]);
});
test('same day requires 30 minutes notice, uses studio timezone',()=>{
 const slots=calculateSlots({...base,query:{...base.query,date:'2026-11-11'},now:{date:'2026-11-11',minute:610}});assert.equal(slots[0].start,660);assert.deepEqual(localNow('Europe/Moscow',new Date('2026-11-11T22:30:00Z')),{date:'2026-11-12',minute:90});assert.equal(studioInstant('2026-11-12',600,'Europe/Moscow').toISOString(),'2026-11-12T07:00:00.000Z');
});
test('invalid selections and invalid break intervals are rejected',()=>{
 for(const q of [{date:'2026-02-30',serviceIds:[1]},{date:'2026-11-12',serviceIds:[1,1]},{date:'2026-11-12',serviceIds:[]}])assert.throws(()=>validateSelection(q));
 assert.throws(()=>validateSchedule({start:600,end:1200,breaks:[{start:900,end:800}]}));assert.throws(()=>validateSchedule({start:600,end:1200,breaks:[{start:500,end:700}]}));
 validateSchedule({start:600,end:1200,breaks:[{start:840,end:870}]});
});
