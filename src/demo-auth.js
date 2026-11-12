// This gate demonstrates the sign-in flow on static hosting. Real access checks run on the server.
export const DEMO_LOGIN='admin';
export const DEMO_PASSWORD='MadinDemo2026!';
const SESSION_KEY='madinlashes-admin-session-v1';
const unauthorized=()=>Object.assign(new Error('Войдите в кабинет'),{status:401});
export function requireDemoAdmin(){
 let session;try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}
 if(!Number.isFinite(session?.expiresAt)||session.expiresAt<=Date.now()){sessionStorage.removeItem(SESSION_KEY);throw unauthorized();}
}
export function demoLogin(login,password){
 if(typeof login!=='string'||login.trim().toLowerCase()!==DEMO_LOGIN||password!==DEMO_PASSWORD)throw Object.assign(new Error('Неверный логин или пароль'),{status:401});
 sessionStorage.setItem(SESSION_KEY,JSON.stringify({expiresAt:Date.now()+12*3600e3}));return {demo:true};
}
export function demoLogout(){sessionStorage.removeItem(SESSION_KEY);}
