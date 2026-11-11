import express from 'express';
import {randomUUID} from 'node:crypto';
import {defaultSite,normalizeSite,validateService,validImage} from '../shared/site-content.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function getSite(pool){const row=(await pool.query('SELECT content,revision FROM site_content WHERE id=1')).rows[0];return {site:row?normalizeSite(row.content):defaultSite,siteRevision:row?.revision||0};}
export function imageMime(bytes){
 if(!bytes||bytes.length<12)return null;
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';return null;
}
const serverImage=src=>{if(!validImage(src)||src.startsWith('local-media:'))fail('Загрузите изображение на сервер');return src;};
export function registerContentRoutes(app,{pool,transaction}){
 // This public asset route is registered outside /api/admin; it never returns client data.
 app.get('/api/media/:id',async(req,res)=>{if(!/^[0-9a-f-]{36}$/i.test(req.params.id))fail('Фото не найдено',404);const row=(await pool.query('SELECT mime,data FROM media WHERE id=$1',[req.params.id])).rows[0];if(!row)fail('Фото не найдено',404);res.set({'Content-Type':row.mime,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'});res.send(row.data);});
 app.post('/api/admin/media',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'6mb'}),async(req,res)=>{if(!Buffer.isBuffer(req.body)||!req.body.length)fail('Выберите JPG, PNG или WebP');const mime=imageMime(req.body);if(!mime||mime!==req.get('Content-Type')?.split(';')[0])fail('Формат файла не соответствует изображению');const id=randomUUID();await pool.query('INSERT INTO media(id,mime,data) VALUES($1,$2,$3)',[id,mime,req.body]);res.status(201).json({image:'/api/media/'+id});});
 app.put('/api/admin/site',async(req,res)=>{
  const site=normalizeSite(req.body.site),revision=req.body.revision;if(!Number.isInteger(revision)||revision<0)fail('Некорректная версия сайта');serverImage(site.hero.image);site.portfolio.forEach(p=>serverImage(p.image));
  const result=await transaction(async db=>{const row=(await db.query('UPDATE site_content SET content=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision',[site,revision])).rows[0];if(!row)fail('Сайт уже изменён в другом окне. Загрузите сохранённую версию перед редактированием.',409);return {site,siteRevision:row.revision};});res.json(result);
 });
 const saveService=async(req,res)=>{
  const s=validateService(req.body);serverImage(s.image);const id=req.params.id?Number(req.params.id):null;if(id!==null&&(!Number.isInteger(id)||id<1))fail('Некорректная услуга');
  const result=await transaction(async db=>{
   const args=[s.title,s.category,s.duration,s.price,s.description,s.tag,s.image];let serviceId=id;
   if(id){const r=await db.query('UPDATE services SET title=$1,category=$2,duration=$3,price=$4,description=$5,tag=$6,image=$7 WHERE id=$8 AND is_active RETURNING id',[...args,id]);if(!r.rowCount)fail('Услуга не найдена',404);}
   else serviceId=(await db.query('INSERT INTO services(title,category,duration,price,description,tag,image) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',args)).rows[0].id;
   await db.query('DELETE FROM staff_services WHERE service_id=$1',[serviceId]);for(const staffId of s.staffIds){const r=await db.query('INSERT INTO staff_services(staff_id,service_id) SELECT id,$2 FROM staff WHERE id=$1',[staffId,serviceId]);if(!r.rowCount)fail('Выбранный мастер недоступен');}return {id:serviceId};
  });res.status(id?200:201).json(result);
 };
 app.post('/api/admin/services',saveService);app.put('/api/admin/services/:id',saveService);
 app.delete('/api/admin/services/:id',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id))fail('Некорректная услуга');await transaction(async db=>{const r=await db.query('UPDATE services SET is_active=false WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)fail('Услуга не найдена',404);});res.json({ok:true});});
 app.put('/api/admin/staff/:id',async(req,res)=>{const s=req.body,id=Number(req.params.id);if(!Number.isInteger(id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>100||typeof s.role!=='string'||!s.role.trim()||s.role.length>150||typeof s.is_active!=='boolean')fail('Проверьте имя и специализацию мастера');serverImage(s.image||'');await transaction(async db=>{const r=await db.query('UPDATE staff SET name=$2,role=$3,image=$4,is_active=$5 WHERE id=$1 RETURNING id',[id,s.name.trim(),s.role.trim(),s.image||'',s.is_active]);if(!r.rowCount)fail('Мастер не найден',404);});res.json({ok:true});});
}
