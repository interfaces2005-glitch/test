import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {services,staff} from '../shared/catalog.mjs';
import {defaultSite} from '../shared/site-content.mjs';
export async function migrate(pool){
 const db=await pool.connect();try{await db.query('BEGIN');await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 await db.query(await readFile(new URL('./content-schema.sql',import.meta.url),'utf8'));
 for(const s of services)await db.query('INSERT INTO services(id,title,category,duration,price,description,tag,image) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[s.id,s.title,s.category,s.duration,s.price,s.description,s.tag,s.image]);
 for(const m of staff){const inserted=await db.query('INSERT INTO staff(id,name,role,image) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[m.id,m.name,m.role,m.image]);if(inserted.rowCount)for(const id of m.serviceIds)await db.query('INSERT INTO staff_services VALUES($1,$2) ON CONFLICT DO NOTHING',[m.id,id]);}
 await db.query('INSERT INTO site_content(id,content) VALUES(1,$1) ON CONFLICT DO NOTHING',[defaultSite]);
 await db.query(await readFile(new URL('./booking-schema.sql',import.meta.url),'utf8'));
 await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
if(process.argv[1]===new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').replaceAll('/','\\')||process.argv[1]?.endsWith('migrate.mjs')){const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await migrate(pool);console.log('Database migrated.');}finally{await pool.end();}}
