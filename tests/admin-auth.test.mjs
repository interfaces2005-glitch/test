import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createHash} from 'node:crypto';
import {credentialsMatch,registerAdminAuth} from '../server/admin-auth.mjs';
const credentials={login:'studio-owner',password:'test-only-long-password-42!'},hash=s=>createHash('sha256').update(String(s)).digest('hex');
test('server requires both the configured login and password, with bounded string inputs',()=>{
 assert.equal(credentialsMatch(credentials,credentials),true);assert.equal(credentialsMatch({...credentials,login:' STUDIO-OWNER '},credentials),true);
 for(const input of [{password:credentials.password},{...credentials,login:'admin'},{...credentials,password:'wrong'},{login:[],password:credentials.password},{...credentials,password:'x'.repeat(257)},{...credentials,login:'x'.repeat(65)},null])assert.equal(credentialsMatch(input,credentials),false);
});
async function fixture(t){
 const sessions=new Map(),rates=new Map();const pool={query:async(sql,args)=>{if(sql.startsWith('INSERT'))sessions.set(args[0],Date.now()+12*3600e3);else if(sql.startsWith('DELETE'))sessions.delete(args[0]);else if(sql.startsWith('SELECT'))return {rowCount:sessions.get(args[0])>Date.now()?1:0};return {rowCount:1};}};
 const redis={incr:async key=>{const n=(rates.get(key)||0)+1;rates.set(key,n);return n;},expire:async()=>{},del:async key=>rates.delete(key)};
 const app=express();app.use(express.json());const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};registerAdminAuth(app,{pool,redis,hash,fail,production:true,credentials});
 app.get('/api/admin/data',(req,res)=>res.json({private:true}));app.post('/api/admin/change',(req,res)=>res.json({saved:true}));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,cookie)=>fetch(base+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {request,sessions,rates};
}
test('HTTP login protects admin reads and writes, creates a private cookie, and logout revokes it',async t=>{
 const {request,sessions,rates}=await fixture(t);assert.equal((await request('data')).status,401);assert.equal((await request('change',{})).status,401);
 const wrongLogin=await request('login',{...credentials,login:'wrong'}),wrongPassword=await request('login',{...credentials,password:'wrong'});assert.equal(wrongLogin.status,401);assert.equal(wrongPassword.status,401);assert.deepEqual(await wrongLogin.json(),await wrongPassword.json());assert.equal(sessions.size,0);
 const response=await request('login',credentials);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true});const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);assert.match(cookie,/Path=\/api\/admin/);assert.match(cookie,/Max-Age=43200/);const bearer=cookie.split(';')[0],token=bearer.slice('lumi_admin='.length);assert.equal(sessions.has(hash(token)),true);assert.equal(sessions.has(token),false);assert.equal(rates.size,0);
 assert.equal((await request('data',undefined,bearer)).status,200);assert.equal((await request('change',{},bearer)).status,200);assert.equal((await request('logout',{},bearer)).status,200);assert.equal(sessions.size,0);assert.equal((await request('data',undefined,bearer)).status,401);assert.equal((await request('change',{},bearer)).status,401);
});
test('expired sessions and repeated failed logins are rejected',async t=>{
 const {request,sessions}=await fixture(t);const ok=await request('login',credentials),cookie=ok.headers.get('set-cookie').split(';')[0];for(const key of sessions.keys())sessions.set(key,Date.now()-1);assert.equal((await request('data',undefined,cookie)).status,401);
 for(let i=0;i<10;i++)assert.equal((await request('login',{...credentials,password:'wrong'})).status,401);assert.equal((await request('login',credentials)).status,429);
});
