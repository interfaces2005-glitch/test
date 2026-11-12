import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export function credentialsMatch(input,credentials){
 const validLogin=typeof input?.login==='string'&&input.login.length<=64,validPassword=typeof input?.password==='string'&&input.password.length<=256;
 const login=validLogin?input.login.trim().toLowerCase():'',password=validPassword?input.password:'';
 const loginMatches=timingSafeEqual(digest(login),digest(credentials.login.trim().toLowerCase()));
 const passwordMatches=timingSafeEqual(digest(password),digest(credentials.password));
 return validLogin&&validPassword&&login.length>0&&password.length>0&&loginMatches&&passwordMatches;
}
export function registerAdminAuth(app,{pool,redis,hash,fail,production,credentials}){
 app.use('/api/admin',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.post('/api/admin/login',async(req,res)=>{
  const key='login:'+hash(req.ip),attempts=await redis.incr(key);if(attempts===1)await redis.expire(key,900);if(attempts>10)fail('Повторите вход через 15 минут',429);
  if(!credentialsMatch(req.body,credentials))fail('Неверный логин или пароль',401);
  const token=randomBytes(32).toString('hex');await pool.query("INSERT INTO admin_sessions VALUES($1,now()+interval '12 hours')",[hash(token)]);await redis.del(key);
  res.cookie('lumi_admin',token,{httpOnly:true,secure:production,sameSite:'strict',maxAge:12*3600e3,path:'/api/admin'});res.json({ok:true});
 });
 app.use('/api/admin',async(req,res,next)=>{try{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('lumi_admin='))?.slice(11);if(!token)fail('Войдите в кабинет',401);const session=await pool.query('SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);if(!session.rowCount)fail('Сессия истекла',401);req.adminToken=token;next();}catch(e){next(e);}});
 app.post('/api/admin/logout',async(req,res)=>{await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1',[hash(req.adminToken)]);res.clearCookie('lumi_admin',{path:'/api/admin',httpOnly:true,secure:production,sameSite:'strict'});res.json({ok:true});});
}
