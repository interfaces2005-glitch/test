import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationJobs,addDemoNotifications} from '../shared/booking.mjs';
import {defaultSite,normalizeSite} from '../shared/site-content.mjs';
import {shouldSend,recipientAllowed} from '../server/notifications.mjs';
const now=Date.parse('2030-01-01T00:00:00Z'),a={id:'owner-test',staffId:3,date:'2030-01-02',start:540,end:660,name:'Гостья',phone:'+996 (555) 123-456',titles:['Наращивание'],price:2800,status:'pending_payment',depositAmount:500,depositPaid:0,notifyWhatsapp:false};
test('owner receives every master booking even with no client opt-in and no master WhatsApp',()=>{
 for(const name of ['Анна','Мария','Алина']){const jobs=notificationJobs(a,defaultSite,{name},'created',now);assert.equal(jobs.length,1);const n=jobs[0];assert.equal(n.kind,'owner_new');assert.equal(n.audience,'owner');assert.equal(n.recipient,'996999019454');assert.match(n.text,/09:00/);assert.match(n.text,/02\.01\.2030/);assert.ok(n.text.includes(name));assert.ok(n.text.includes(a.phone));assert.match(n.parameters[1],/555/);assert.match(n.parameters[7],/Ожидается 500/);}
});
test('owner receives confirmed returning-client bookings and avoids duplicates when also the master',()=>{
 const master={name:'Мадина',whatsapp:defaultSite.booking.ownerWhatsapp,whatsappOptIn:true};const jobs=notificationJobs({...a,status:'confirmed',depositAmount:0},defaultSite,master,'created',now);assert.equal(jobs.filter(n=>n.recipient==='996999019454').length,1);assert.equal(jobs[0].kind,'owner_new');assert.match(jobs[0].text,/без предоплаты/);const both=notificationJobs(a,defaultSite,{...master,whatsapp:'996777111222'},'created',now);assert.equal(both.filter(n=>n.audience==='owner').length,1);assert.equal(both.filter(n=>n.audience==='staff').length,1);
});
test('owner receipt, confirmation and cancellation jobs remain idempotent per appointment',()=>{
 const d={site:structuredClone(defaultSite),staff:[{id:3,name:'Алина'}],notifications:[]};for(const [event,status] of [['created','pending_payment'],['receipt','payment_review'],['confirmed','confirmed'],['cancelled','cancelled']])for(let i=0;i<2;i++)addDemoNotifications(d,{...a,status,depositPaid:event==='confirmed'?500:0},event,now);assert.deepEqual(d.notifications.map(n=>n.kind),['owner_new','owner_receipt','owner_confirmed','owner_cancelled']);assert.ok(d.notifications.every(n=>n.recipient==='996999019454'&&n.state==='demo'));
});
test('owner settings validate phone and stop jobs when disabled or recipient changes',()=>{
 const job={audience:'owner',recipient:'996999019454'};assert.equal(recipientAllowed(job,defaultSite),true);const off={...defaultSite,booking:{...defaultSite.booking,whatsappOwnerEnabled:false}};assert.equal(notificationJobs(a,off,null,'created',now).length,0);assert.equal(recipientAllowed(job,off),false);assert.equal(recipientAllowed(job,{...defaultSite,booking:{...defaultSite.booking,ownerWhatsapp:'996555111222'}}),false);assert.throws(()=>normalizeSite({...defaultSite,booking:{...defaultSite.booking,ownerWhatsapp:'123'}}));assert.equal(normalizeSite(defaultSite).booking.ownerWhatsapp,defaultSite.booking.ownerWhatsapp);
});
test('owner new-booking job survives receipt/payment updates, but skips cancelled or past visits',()=>{
 const job={kind:'owner_new',audience:'owner'};for(const status of ['pending_payment','payment_review','confirmed'])assert.equal(shouldSend(job,{...a,status},now),true);assert.equal(shouldSend(job,{...a,status:'cancelled'},now),false);assert.equal(shouldSend(job,a,Date.parse('2031-01-01')),false);assert.equal(shouldSend({kind:'owner_receipt',audience:'owner'},{...a,status:'payment_review'},now),true);assert.equal(shouldSend({kind:'owner_receipt',audience:'owner'},{...a,status:'confirmed'},now),false);
});
