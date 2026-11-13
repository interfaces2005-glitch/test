import {authorizeDemo,signInDemo} from './auth-helper.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const root=path.resolve('dist'),prefix='/madinlashes-demo/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}const file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[],failed=[],apiCalls=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&!r.url().endsWith('/favicon.ico')&&r.status()>=400)failed.push(r.url());});page.on('request',r=>{if(r.url().startsWith(origin+'/api/'))apiCalls.push(r.url());});
 await page.goto(origin+prefix,{waitUntil:'domcontentloaded'});await page.locator('.hero h1').waitFor();await page.locator('img[loading=lazy]').evaluateAll(images=>images.forEach(i=>i.loading='eager'));await page.waitForFunction(()=>document.querySelectorAll('img').length>0&&[...document.images].every(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.title(),'MADINLASHES — время для себя');await page.locator('header').getByRole('button',{name:'Записаться',exact:true}).click();await page.getByRole('dialog',{name:'Запись в MADINLASHES'}).waitFor();await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.goto(origin+prefix+'#admin');await signInDemo(page);await page.getByRole('button',{name:'Редактор сайта',exact:true}).click();await page.getByLabel('Главный заголовок',{exact:true}).waitFor();assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(apiCalls,[]);console.log('PASS: GitHub Pages subdirectory loads scripts, styles, all photos, booking and site editor without API calls or 404 errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
