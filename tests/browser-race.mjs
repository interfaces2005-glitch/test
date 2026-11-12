import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext();const a=await context.newPage(),b=await context.newPage();await Promise.all([a.goto('http://127.0.0.1:5175/'),b.goto('http://127.0.0.1:5175/')]);
 const reserve=()=>async()=>{const {api}=await import('/src/api.js');const d=new Date();d.setDate(d.getDate()+1);const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;try{return {ok:true,a:await api.hold({date,serviceIds:[1],staffId:1,start:600})};}catch(e){return {ok:false,status:e.status};}};
 for(let round=0;round<5;round++){
 const results=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).evaluate(reserve())));assert.equal(results.filter(x=>x.ok).length,1);assert.ok(results.filter(x=>!x.ok).every(x=>x.status===409));const hold=results.find(x=>x.ok).a;
 const available=await b.evaluate(async hold=>{const {api}=await import('/src/api.js');return api.slots({date:hold.date,serviceIds:[1],staffId:1});},hold);assert.equal(available.some(s=>s.start===600||s.start===630||s.start===660||s.start===690),false);
 await a.evaluate(async hold=>{const {api}=await import('/src/api.js');await api.release(hold);},hold);
 const freed=await b.evaluate(async hold=>{const {api}=await import('/src/api.js');return api.slots({date:hold.date,serviceIds:[1],staffId:1});},hold);assert.equal(freed.some(s=>s.start===600),true);
 }
 console.log('PASS: simultaneous reservations in two tabs produce one winner; overlaps are blocked; release restores the slot.');
}finally{await browser.close();}
