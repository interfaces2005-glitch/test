import {DEMO_LOGIN,DEMO_PASSWORD} from '../src/demo-auth.js';
export async function authorizeDemo(page){await page.evaluate(async({login,password})=>{const {api}=await import('/src/api.js');await api.login(login,password);},{login:DEMO_LOGIN,password:DEMO_PASSWORD});}
export async function signInDemo(page){await page.getByLabel('Логин',{exact:true}).fill(DEMO_LOGIN);await page.getByLabel('Пароль',{exact:true}).fill(DEMO_PASSWORD);await page.getByRole('button',{name:'Войти в кабинет',exact:true}).click();await page.locator('.admin-nav').waitFor();}
