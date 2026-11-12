import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bookingDefaults,depositQuote,hydrateBooking,registerClient,expirePayments,notificationJobs} from '../shared/booking.mjs';
import {defaultSite,normalizeSite} from '../shared/site-content.mjs';
import {calculateSlots,validateSchedule} from '../server/domain.mjs';
import {services,staff} from '../shared/catalog.mjs';
import {studioInstant} from '../shared/time.mjs';
import {shouldSend,whatsappReady} from '../server/notifications.mjs';
import {viewToken,tokenMatches} from '../server/visit-token.mjs';
test('new clients owe 500; existing canonical phone numbers are exempt; deposit is part of total',()=>{
 const q=depositQuote([],'+996 (555) 123-456',2800);assert.equal(q.depositAmount,500);assert.equal(q.remainingAmount,2300);assert.equal(q.requiresDeposit,true);
 const known=depositQuote([{phone:'996555123456'}],'+996 (555) 123-456',2800);assert.equal(known.requiresDeposit,false);assert.equal(known.depositAmount,0);assert.equal(depositQuote([],'996555123456',300).depositAmount,300);
});
test('unpaid or cancelled requests do not establish returning-client exemption; verified clients are registered once',()=>{
 const data={site:structuredClone(defaultSite),appointments:[{id:'one',status:'pending_payment',name:'A',phone:'996555123456'},{id:'two',status:'cancelled',name:'A',phone:'996555123456'}],staff:[],schedules:[]};hydrateBooking(data);assert.equal(data.clients.length,0);registerClient(data.clients,data.appointments[0]);registerClient(data.clients,data.appointments[0]);assert.equal(data.clients.length,1);
});
test('unpaid deadlines release slots but submitted receipts remain reserved for verification',()=>{
 const now=Date.now(),data={appointments:[{status:'pending_payment',paymentDeadline:now-1},{status:'payment_review',paymentDeadline:now-1}]};expirePayments(data,now);assert.equal(data.appointments[0].status,'cancelled');assert.equal(data.appointments[0].paymentStatus,'expired');assert.equal(data.appointments[1].status,'payment_review');
});
test('schedule starts at 09:00 and accepts 09:00 shifts',()=>{
 const q={date:'2030-01-02',serviceIds:[1],staffId:1};const result=calculateSlots({catalog:{services,staff},query:q,now:{date:'2030-01-01',minute:800}});assert.equal(result[0].start,540);validateSchedule({start:540,end:1200,breaks:[]});assert.throws(()=>validateSchedule({start:510,end:1200,breaks:[]}));
});
const appointment={id:'demo',date:'2030-01-02',start:540,end:660,price:2800,name:'Гостья',phone:'+996 (555) 123-456',titles:['Наращивание'],status:'confirmed',notifyWhatsapp:true,depositAmount:500,depositPaid:500};const master={name:'Анна',whatsapp:'996777111222',whatsappOptIn:true};const now=Date.parse('2030-01-01T00:00:00Z');
test('confirmed booking creates separate client/master messages and one reminder exactly an hour before',()=>{
 const jobs=notificationJobs(appointment,defaultSite,master,'confirmed',now);assert.ok(jobs.some(j=>j.kind==='client_confirmed'&&j.recipient==='996555123456'));assert.ok(jobs.some(j=>j.kind==='staff_confirmed'&&j.recipient==='996777111222'));const reminder=jobs.find(j=>j.kind==='client_reminder');assert.equal(reminder.dueAt,studioInstant(appointment.date,appointment.start,'Asia/Bishkek').getTime()-3600000);assert.match(jobs.find(j=>j.kind==='staff_confirmed').text,/09:00/);assert.match(jobs.find(j=>j.kind==='client_confirmed').text,/2300/);
});
test('pending payment has no visit reminder; client/master consent and owner notifications are independent',()=>{
 const pending={...appointment,status:'pending_payment',depositPaid:0};const jobs=notificationJobs(pending,defaultSite,master,'created',now);assert.ok(jobs.some(j=>j.kind==='client_pending'));assert.ok(jobs.some(j=>j.kind==='staff_new'));assert.ok(!jobs.some(j=>j.kind==='client_confirmed'||j.kind==='client_reminder'));assert.equal(notificationJobs({...appointment,notifyWhatsapp:false},{...defaultSite,booking:{...defaultSite.booking,whatsappOwnerEnabled:false}},{...master,whatsappOptIn:false},'confirmed',now).length,0);
});
test('cancelled, unpaid and past appointments cannot send a reminder',()=>{
 const job={kind:'client_reminder',audience:'client'};assert.equal(shouldSend(job,{...appointment,status:'cancelled'},now),false);assert.equal(shouldSend(job,{...appointment,status:'pending_payment'},now),false);assert.equal(shouldSend(job,appointment,Date.parse('2031-01-01')),false);
});
test('payment configuration and capability links reject malformed values and invalid credentials',()=>{
 const site=structuredClone(defaultSite);site.booking.depositAmount=500;normalizeSite(site);assert.throws(()=>normalizeSite({...site,booking:{...site.booking,qrImage:'javascript:bad'}}));
 const old=process.env.BOOKING_LINK_SECRET;process.env.BOOKING_LINK_SECRET='test-only-long-random-signing-secret';try{const hash=s=>createHash('sha256').update(s).digest('hex'),row={id:'public-id',token_hash:hash('hold-token')};assert.equal(tokenMatches(row,'hold-token',hash),true);assert.equal(tokenMatches(row,viewToken(row.id),hash),true);assert.equal(tokenMatches(row,'wrong',hash),false);assert.equal(tokenMatches(row,viewToken('other-id'),hash),false);}finally{if(old===undefined)delete process.env.BOOKING_LINK_SECRET;else process.env.BOOKING_LINK_SECRET=old;}
});
