import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSite,normalizeSite,validateService,validImage} from '../shared/site-content.mjs';
import {services,staff} from '../shared/catalog.mjs';
import {imageMime} from '../server/content-routes.mjs';
test('studio catalog contains only extensions and lamination, never manicure',()=>{
 assert.equal(services.length,3);assert.deepEqual(new Set(services.map(s=>s.category)),new Set(['extensions','lamination']));assert.ok(services.every(s=>!/маникюр|ногт/i.test(s.title)));assert.ok(staff.every(m=>m.serviceIds.every(id=>services.some(s=>s.id===id))));
});
test('site settings reject executable URLs, SVG, invalid themes, duplicate photos and incomplete FAQ',()=>{
 assert.deepEqual(normalizeSite(structuredClone(defaultSite)),defaultSite);
 for(const mutate of [d=>d.instagram='javascript:alert(1)',d=>d.hero.image='https://evil.example/photo.svg',d=>d.theme.accent='red',d=>d.faq[0].answer='',d=>d.portfolio=[{id:'same',image:'/images/beauty.jpg',category:'extensions',title:'A',visible:true},{id:'same',image:'/images/beauty.jpg',category:'extensions',title:'B',visible:true}]]){const d=structuredClone(defaultSite);mutate(d);assert.throws(()=>normalizeSite(d));}
 assert.equal(validImage('data:image/svg+xml,attack'),false);
});
test('site normalization preserves photo ordering, visibility, text and safe links',()=>{
 const d=structuredClone(defaultSite);d.instagram='https://www.instagram.com/madinlashes/';d.portfolio=[{id:'b',image:'/images/beauty.jpg',category:'lamination',title:'Ламинирование',visible:false},{id:'a',image:'/images/anna.jpg',category:'extensions',title:'Наращивание',visible:true}];const clean=normalizeSite(d);assert.deepEqual(clean.portfolio.map(p=>p.id),['b','a']);assert.equal(clean.portfolio[0].visible,false);
});
test('service edits reject removed categories and invalid duration',()=>{
 const s={...services[0],staffIds:[1]};validateService(s);assert.throws(()=>validateService({...s,category:'nails'}));assert.throws(()=>validateService({...s,duration:16}));
});
test('media uploads must match JPEG, PNG or WebP signatures, not SVG or renamed text',()=>{
 assert.equal(imageMime(Buffer.from('<svg onload="alert(1)">')),null);assert.equal(imageMime(Buffer.from('not a jpg file')),null);assert.equal(imageMime(Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0])),'image/jpeg');assert.equal(imageMime(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])),'image/png');assert.equal(imageMime(Buffer.from('RIFF0000WEBP0000')),'image/webp');
});
