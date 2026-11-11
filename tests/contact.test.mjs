import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatKgPhone,isValidKgPhone,STUDIO_TIMEZONE} from '../shared/contact.mjs';
import {localNow,studioInstant} from '../server/domain.mjs';
test('Kyrgyz phone accepts international and local input and rejects Russian and incomplete numbers',()=>{
 for(const value of ['+996 555 123 456','996555123456','0555123456','555123456'])assert.equal(formatKgPhone(value),'+996 (555) 123-456');
 assert.equal(isValidKgPhone('+996 (555) 123-456'),true);assert.equal(isValidKgPhone('+7 (999) 123-45-67'),false);assert.equal(isValidKgPhone('+996 (555) 123-45'),false);assert.equal(formatKgPhone(''),'');
});
test('studio calendar and export use Bishkek across a date boundary',()=>{
 assert.deepEqual(localNow(STUDIO_TIMEZONE,new Date('2026-11-11T19:30:00Z')),{date:'2026-11-12',minute:90});assert.equal(studioInstant('2026-11-12',600,STUDIO_TIMEZONE).toISOString(),'2026-11-12T04:00:00.000Z');
});
