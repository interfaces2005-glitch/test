import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test('PostgreSQL rejects concurrent empty-calendar and partially overlapping reservations',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});const schema='test_lumi_'+randomUUID().replaceAll('-','');const admin=await pool.connect();
 try{
  await admin.query('CREATE SCHEMA '+schema);await admin.query('SET search_path TO '+schema+',public');await admin.query(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));await admin.query("INSERT INTO staff VALUES(1,'Test','Test','test.jpg')");
  const insert=async(start,end)=>{const db=await pool.connect();try{await db.query('SET search_path TO '+schema+',public');await db.query('INSERT INTO appointments(id,token_hash,staff_id,date,start,"end",service_ids,titles,price,status,expires_at) VALUES($1,\'hash\',1,\'2030-01-01\',$2,$3,\'{1}\',\'["Test"]\',100,\'held\',now()+interval \'6 minutes\')',[randomUUID(),start,end]);return true;}catch(e){if(e.code==='23P01')return false;throw e;}finally{db.release();}};
  const results=await Promise.all(Array.from({length:8},()=>insert(600,720)));assert.equal(results.filter(Boolean).length,1);assert.equal(await insert(690,750),false);assert.equal(await insert(720,780),true);
  await admin.query("UPDATE appointments SET status='cancelled' WHERE start=600");assert.equal(await insert(600,720),true);
 }finally{await admin.query('DROP SCHEMA '+schema+' CASCADE');admin.release();await pool.end();}
});
