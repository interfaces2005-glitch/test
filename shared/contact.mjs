export const STUDIO_TIMEZONE='Asia/Bishkek';
export function formatKgPhone(value){
 let digits=String(value).replace(/\D/g,'');
 if(digits.startsWith('996'))digits=digits.slice(3);
 else if(digits.startsWith('0'))digits=digits.slice(1);
 digits=digits.slice(0,9);
 if(!digits)return '';
 return '+996 ('+digits.slice(0,3)+(digits.length>=3?') ':'')+digits.slice(3,6)+(digits.length>6?'-':'')+digits.slice(6,9);
}
export const isValidKgPhone=value=>/^996\d{9}$/.test(String(value).replace(/\D/g,''));
