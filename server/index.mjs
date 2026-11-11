import express from 'express';
import {getSite,registerContentRoutes} from './content-routes.mjs';
import {isValidKgPhone,STUDIO_TIMEZONE} from '../shared/contact.mjs';
import helmet from 'helmet';
import pg from 'pg';
import {createClient} from 'redis';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {totalFor,minuteLabel} from '../shared/catalog.mjs';
import {HOLD_SECONDS,validateSelection,validateSchedule,calculateSlots,localNow,studioInstant} from './domain.mjs';
import {startNotifications,enqueue} from './notifications.mjs';

pg.types.setTypeParser(1082,value=>value);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:15});
const redis=createClient({url:process.env.REDIS_URL});redis.on('error',()=>console.error('Redis connection error'));
const zone=process.env.STUDIO_TIMEZONE||STUDIO_TIMEZONE;const origin=process.env.APP_ORIGIN||'http://localhost:3001';const production=process.env.NODE_ENV==='production';
if(!process.env.DATABASE_URL||!process.env.REDIS_URL||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<16||process.env.ADMIN_PASSWORD.includes('replace-with'))throw new Error('Configure DATABASE_URL, REDIS_URL and a unique ADMIN_PASSWORD (16+ characters).');
await redis.connect();await pool.query('SELECT 1');
const hash=s=>createHash('sha256').update(String(s)).digest('hex');const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const validId=id=>{if(!/^[0-9a-f-]{36}$/i.test(id||''))fail('Некорректный идентификатор');return id;};
const app=express();app.set('trust proxy','loopback');app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],frameSrc:['https://maps.google.com'],connectSrc:["'self'"]}},crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'256kb'}));
app.use('/api',async(req,res,next)=>{try{
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==origin)fail('Недопустимый источник запроса',403);
 const key='rate:'+hash(req.ip)+':'+Math.floor(Date.now()/60000);const n=await redis.incr(key);if(n===1)await redis.expire(key,65);if(n>240)fail('Слишком много запросов. Повторите через минуту.',429);next();
}catch(e){next(e);}});
const toApp=a=>({id:a.id,staffId:a.staff_id,date:typeof a.date==='string'?a.date:a.date.toISOString().slice(0,10),start:a.start,end:a.end,serviceIds:a.service_ids,titles:a.titles,price:Number(a.price),status:a.status,expiresAt:a.expires_at?new Date(a.expires_at).getTime():null,name:a.name,phone:a.phone,comment:a.comment});
const scheduleRow=s=>({date:s.date,staffId:s.staff_id,start:s.start,end:s.end,off:s.off,breaks:s.breaks});
async function catalog(db=pool,includeInactiveStaff=false){const services=(await db.query('SELECT * FROM services WHERE is_active ORDER BY id')).rows;const staff=(await db.query('SELECT s.*,COALESCE(array_agg(ss.service_id) FILTER(WHERE ss.service_id IS NOT NULL),ARRAY[]::integer[]) AS "serviceIds" FROM staff s LEFT JOIN staff_services ss ON s.id=ss.staff_id WHERE ($1 OR s.is_active) GROUP BY s.id ORDER BY s.id',[includeInactiveStaff])).rows;return {services:services.map(s=>({...s,price:Number(s.price)})),staff};}
async function getSlots(query,db=pool){validateSelection(query);const cat=await catalog(db);const schedules=(await db.query('SELECT * FROM schedules WHERE date=$1',[query.date])).rows.map(scheduleRow);const appointments=(await db.query('SELECT * FROM appointments WHERE date=$1 AND status NOT IN (\'cancelled\',\'expired\')',[query.date])).rows.map(toApp);return calculateSlots({catalog:cat,schedules,appointments,query,now:localNow(zone)});}
async function transaction(fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('SELECT pg_notify(\'lumi_calendar\',\'changed\')');await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
const lockDay=(db,id,date)=>db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id+':'+date]);
const lockKeys=a=>Array.from({length:(a.end-a.start)/15},(_,i)=>`hold:{${a.staffId}:${a.date}}:${a.start+i*15}`);
const acquireLua="for i,key in ipairs(KEYS) do if redis.call('EXISTS',key)==1 then return 0 end end for i,key in ipairs(KEYS) do redis.call('SET',key,ARGV[1],'EX',ARGV[2]) end return 1";
const releaseLua="for i,key in ipairs(KEYS) do if redis.call('GET',key)==ARGV[1] then redis.call('DEL',key) end end return 1";
const releaseRedis=(a,token)=>redis.eval(releaseLua,{keys:lockKeys(a),arguments:[hash(token)]});
const releaseStored=row=>redis.eval(releaseLua,{keys:lockKeys(toApp(row)),arguments:[row.token_hash]}).catch(()=>console.error('Redis hold release delayed until TTL'));
app.get('/api/health',async(req,res)=>{await pool.query('SELECT 1');await redis.ping();res.json({ok:true});});
app.get('/api/catalog',async(req,res)=>res.json({...await catalog(),...await getSite(pool),timezone:zone}));
app.get('/api/slots',async(req,res)=>{res.set('Cache-Control','no-store');res.json(await getSlots({date:req.query.date,serviceIds:String(req.query.serviceIds||'').split(',').filter(Boolean).map(Number),staffId:req.query.staffId}));});
app.post('/api/holds',async(req,res)=>{
 const q=req.body;validateSelection(q);if(!Number.isInteger(q.start)||q.start%30!==0)fail('Некорректное время');
 const matches=await getSlots(q);const candidates=matches.filter(s=>s.start===q.start);let result;
 for(const candidate of candidates){let reservation;const token=randomBytes(32).toString('hex');let acquired=false;
  try{result=await transaction(async db=>{
   await lockDay(db,candidate.staffId,q.date);await db.query("UPDATE appointments SET status='expired' WHERE staff_id=$1 AND date=$2 AND status='held' AND expires_at<=now()",[candidate.staffId,q.date]);
   const cat=await catalog(db);const totals=totalFor(q.serviceIds,cat.services);
   const current=await getSlots({...q,staffId:candidate.staffId},db);if(!current.some(s=>s.start===q.start))fail('Это время уже занято. Выберите другое окошко.',409);
   reservation={...q,staffId:candidate.staffId,end:q.start+totals.duration};
   acquired=!!await redis.eval(acquireLua,{keys:lockKeys(reservation),arguments:[hash(token),String(HOLD_SECONDS)]});if(!acquired)fail('Это время уже резервируется другим гостем.',409);
   const id=randomUUID();const row=(await db.query('INSERT INTO appointments(id,token_hash,staff_id,date,start,"end",service_ids,titles,price,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,\'held\',now()+interval \'360 seconds\') RETURNING *',[id,hash(token),candidate.staffId,q.date,q.start,reservation.end,q.serviceIds,JSON.stringify(totals.selected.map(s=>s.title)),totals.price])).rows[0];
   return {...toApp(row),token};
  });break;}catch(e){if(acquired)await releaseRedis(reservation,token).catch(()=>{});if(e.status!==409&&e.code!=='23P01')throw e;}
 }
 if(!result)fail('Это время уже занято. Выберите другое окошко.',409);res.status(201).json(result);
});
app.delete('/api/holds/:id',async(req,res)=>{validId(req.params.id);const token=req.body?.token;if(typeof token!=='string')fail('Нужен ключ резерва');const row=await transaction(async db=>(await db.query("UPDATE appointments SET status='expired' WHERE id=$1 AND token_hash=$2 AND status='held' RETURNING *",[req.params.id,hash(token)])).rows[0]);if(row)await releaseRedis(toApp(row),token);res.json({ok:true});});
app.post('/api/appointments',async(req,res)=>{
 const q=req.body;validId(q.id);if(typeof q.token!=='string'||typeof q.name!=='string'||q.name.trim().length<2||q.name.length>100||typeof q.phone!=='string'||!isValidKgPhone(q.phone)||typeof(q.comment||'')!=='string'||(q.comment||'').length>1000)fail('Проверьте имя, телефон и комментарий');
 const row=await transaction(async db=>{
  const a=(await db.query('SELECT * FROM appointments WHERE id=$1 AND token_hash=$2 FOR UPDATE',[q.id,hash(q.token)])).rows[0];if(!a)fail('Резерв не найден',409);if(a.status==='confirmed')return a;
  if(a.status!=='held'||new Date(a.expires_at)<=new Date())fail('Резерв истёк. Выберите время заново.',409);
  const saved=(await db.query("UPDATE appointments SET status='confirmed',name=$2,phone=$3,comment=$4 WHERE id=$1 RETURNING *",[q.id,q.name.trim(),q.phone,q.comment||''])).rows[0];await enqueue(db,saved,'created',zone);return saved;
 });await releaseStored(row);res.status(201).json({...toApp(row),token:q.token,timezone:zone});
});
app.patch('/api/appointments/:id/cancel',async(req,res)=>{
 validId(req.params.id);if(typeof req.body?.token!=='string')fail('Нужен ключ записи');
 const row=await transaction(async db=>{const a=(await db.query('SELECT * FROM appointments WHERE id=$1 AND token_hash=$2 FOR UPDATE',[req.params.id,hash(req.body.token)])).rows[0];if(!a)fail('Запись не найдена',404);if(!['confirmed','new','cancelled'].includes(a.status))fail('Этот визит нельзя отменить',409);if(a.status==='cancelled')return a;const updated=(await db.query("UPDATE appointments SET status='cancelled' WHERE id=$1 RETURNING *",[a.id])).rows[0];await enqueue(db,updated,'cancelled',zone);return updated;});await releaseRedis(toApp(row),req.body.token);res.json({...toApp(row),token:req.body.token,timezone:zone});
});
// Only invalidations are broadcast. Customer names, numbers and tokens never enter SSE.
const streams=new Set();app.get('/api/events',(req,res)=>{if(streams.size>=200)return res.status(503).json({error:'Повторите подключение позже'});res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('data: changed\n\n');streams.add(res);req.on('close',()=>streams.delete(res));});
const listener=await pool.connect();await listener.query('LISTEN lumi_calendar');listener.on('notification',()=>{for(const res of streams)res.write('data: changed\n\n');});listener.on('error',()=>{console.error('Calendar listener disconnected; clients will poll.');for(const res of streams)res.end();streams.clear();});
const heartbeat=setInterval(()=>{for(const res of streams)res.write(': heartbeat\n\n');},20000);
app.post('/api/admin/login',async(req,res)=>{
 const key='login:'+hash(req.ip);const attempts=await redis.incr(key);if(attempts===1)await redis.expire(key,900);if(attempts>10)fail('Повторите вход через 15 минут',429);
 const supplied=hash(req.body?.password||'');if(!timingSafeEqual(Buffer.from(supplied),Buffer.from(hash(process.env.ADMIN_PASSWORD))))fail('Неверный пароль',401);
 const token=randomBytes(32).toString('hex');await pool.query("INSERT INTO admin_sessions VALUES($1,now()+interval '12 hours')",[hash(token)]);res.cookie('lumi_admin',token,{httpOnly:true,secure:production,sameSite:'strict',maxAge:12*3600e3,path:'/api/admin'});res.json({ok:true});
});
app.use('/api/admin',async(req,res,next)=>{try{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('lumi_admin='))?.slice(11);if(!token)fail('Войдите в кабинет',401);const session=await pool.query('SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);if(!session.rowCount)fail('Сессия истекла',401);req.adminToken=token;next();}catch(e){next(e);}});
app.post('/api/admin/logout',async(req,res)=>{await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1',[hash(req.adminToken)]);res.clearCookie('lumi_admin',{path:'/api/admin'});res.json({ok:true});});
app.get('/api/admin/data',async(req,res)=>{res.set('Cache-Control','no-store');const appointments=(await pool.query("SELECT * FROM appointments WHERE status NOT IN ('expired','held') ORDER BY date,start")).rows.map(toApp);const schedules=(await pool.query("SELECT staff_id,to_char(date,'YYYY-MM-DD') AS date,start,\"end\",off,breaks FROM schedules")).rows.map(scheduleRow);res.json({...await catalog(pool,true),...await getSite(pool),appointments,schedules,timezone:zone});});
app.patch('/api/admin/appointments/:id',async(req,res)=>{validId(req.params.id);const status=req.body.status;if(!['new','confirmed','completed','cancelled','no_show'].includes(status))fail('Некорректный статус');await transaction(async db=>{const a=(await db.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!a||['held','expired'].includes(a.status))fail('Запись не найдена',404);if(a.status==='cancelled'&&status!=='cancelled')fail('Создайте новую запись для отменённого визита',409);if(a.status===status)return;const updated=(await db.query('UPDATE appointments SET status=$2 WHERE id=$1 RETURNING *',[a.id,status])).rows[0];if(status==='cancelled')await enqueue(db,updated,'cancelled',zone);});res.json({ok:true});});
registerContentRoutes(app,{pool,transaction});
app.put('/api/admin/schedules',async(req,res)=>{
 const q=req.body;validateSelection({date:q.date,serviceIds:[1],staffId:q.staffId});validateSchedule(q);if(typeof q.off!=='boolean'||!Number.isInteger(q.staffId))fail('Проверьте мастера и выходной день');
 await transaction(async db=>{await lockDay(db,q.staffId,q.date);await db.query("UPDATE appointments SET status='expired' WHERE staff_id=$1 AND date=$2 AND status='held' AND expires_at<=now()",[q.staffId,q.date]);const apps=(await db.query("SELECT * FROM appointments WHERE staff_id=$1 AND date=$2 AND status NOT IN ('cancelled','expired')",[q.staffId,q.date])).rows;
 if(apps.some(a=>q.off||a.start<q.start||a.end>q.end||q.breaks.some(b=>a.start<b.end&&a.end>b.start)))fail('График пересекается с существующей записью',409);
 await db.query('INSERT INTO schedules(staff_id,date,start,"end",off,breaks) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(staff_id,date) DO UPDATE SET start=$3,"end"=$4,off=$5,breaks=$6',[q.staffId,q.date,q.start,q.end,q.off,JSON.stringify(q.breaks)]);});res.json({ok:true});
});
app.use('/api',(req,res)=>res.status(404).json({error:'Маршрут не найден'}));
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');app.use(express.static(dist));app.get('/',(req,res)=>res.sendFile(path.join(dist,'index.html')));
app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const status=err.status||(err.code==='23P01'?409:500);if(status>=500)console.error('Request failed:',err.code||err.name);res.status(status).json({error:status===500?'Сервис временно недоступен. Попробуйте позже.':status===409&&err.code==='23P01'?'Время уже занято. Выберите другое.':err.message});});
const stopNotifications=startNotifications(pool,zone);const server=app.listen(Number(process.env.PORT)||3001,'127.0.0.1',()=>console.log('MADINLASHES server is ready.'));
const cleanup=setInterval(()=>pool.query("WITH expired AS (UPDATE appointments SET status='expired' WHERE status='held' AND expires_at<=now() RETURNING id) SELECT CASE WHEN count(*)>0 THEN pg_notify('lumi_calendar','changed') END FROM expired").catch(()=>console.error('Hold cleanup failed')),15000);
async function shutdown(){clearInterval(cleanup);clearInterval(heartbeat);stopNotifications();for(const res of streams)res.end();server.close();listener.release();await redis.quit();await pool.end();}
process.on('SIGINT',()=>shutdown().then(()=>process.exit()));process.on('SIGTERM',()=>shutdown().then(()=>process.exit()));
