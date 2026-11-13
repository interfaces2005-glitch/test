import {bookingDefaults} from './booking.mjs';
import {isValidKgPhone} from './contact.mjs';
export const defaultSite={
 brand:'MADINLASHES',tagline:'LASH STUDIO',city:'Бишкек',address:'ул. Исанова, 105/3',addressNote:'',hours:'Ежедневно, 09:00–20:00',phone:'',instagram:'',telegram:'',booking:{...bookingDefaults,ownerWhatsapp:'+996 (999) 019-454',whatsappOwnerEnabled:true,qrImage:'/images/payment-qr.jpg',recipient:'Мадина К. · +996 (999) 019-454',paymentNote:'Сохраните QR и откройте его из галереи в банковском приложении. Проверьте получателя: Мадина К. Переведите предоплату и загрузите чек ниже. Мастер подтвердит запись после проверки поступления.'},
 hero:{eyebrow:'МАЛЕНЬКИЕ РИТУАЛЫ. БОЛЬШЕ ЛЮБВИ К СЕБЕ.',title:'Красота,',accent:'в вашем взгляде.',description:'Невесомое наращивание. Бережное ламинирование.\nИ время, которое принадлежит только вам.',button:'Выбрать дату и записаться',image:'/images/beauty.jpg',note:'Бережно к вашей красоте.\nС вниманием к каждой детали.'},
 texts:{servicesEyebrow:'МЕНЮ КРАСОТЫ',servicesTitle:'Ваш взгляд —',servicesAccent:'ваши правила.',servicesDescription:'От естественного изгиба до выразительного объёма. Подберём то, что подходит вам.',staffEyebrow:'В ЗАБОТЛИВЫХ РУКАХ',staffTitle:'Знакомьтесь,',staffAccent:'ваши мастера',portfolioEyebrow:'НАШИ РАБОТЫ',portfolioTitle:'Красота',portfolioAccent:'в каждом взгляде.',portfolioDescription:'Наращивание и ламинирование ресниц в MADINLASHES.',portfolioEmpty:'Здесь скоро появятся фотографии наших работ.',bookingEyebrow:'ОНЛАЙН-ЗАПИСЬ',bookingTitle:'В вашем ритме.',bookingAccent:'В удобное время.',bookingDescription:'Выберите услугу, мастера и свободное окошко в одном удобном окне.',faqEyebrow:'ДО ВСТРЕЧИ В СТУДИИ',faqTitle:'Вы спрашивали —',faqAccent:'мы отвечаем.',contactsEyebrow:'ЖДЁМ ВАС В ГОСТИ',contactsTitle:'Ваше место',contactsAccent:'красивого взгляда.',contactsDescription:'Уютная студия, любимая музыка и немного времени только для вас.',footer:'С любовью к вашей естественной красоте.'},
 theme:{accent:'#9c6457',background:'#faf8f5',ink:'#383b36',font:'serif'},
 visible:{staff:true,portfolio:true,faq:true},
 portfolio:[],legal:{operator:'',privacy:'',cancellation:''},
 faq:[{id:'faq-1',question:'Как выбрать между наращиванием и ламинированием?',answer:'Наращивание позволяет изменить длину и объём. Ламинирование подчёркивает изгиб собственных ресниц. Напишите свои пожелания в комментарии к записи — обсудим их перед процедурой.'},{id:'faq-2',question:'Как подготовиться к визиту?',answer:'Удобнее прийти без макияжа глаз за 5–10 минут до начала. Индивидуальные рекомендации уточняйте у мастера.'},{id:'faq-3',question:'Как отменить запись?',answer:'В демонстрации отмена доступна на экране подтверждения. Правила отмены студии уточняются перед запуском.'}]
};
export const categoryLabels={extensions:'Наращивание',lamination:'Ламинирование'};
const error=message=>{throw Object.assign(new Error(message),{status:400});};
const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max)error('Проверьте длину и формат текста');return v.trim();};
export function validImage(src){return typeof src==='string'&&(src===''||/^\/images\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(src)||/^\/api\/media\/[0-9a-f-]{36}$/i.test(src)||/^local-media:[0-9a-f-]{36}$/i.test(src));}
export function normalizeSite(value){
 if(!value||typeof value!=='object'||Array.isArray(value))error('Некорректные настройки сайта');
 const out={};for(const key of ['brand','tagline','city','address','addressNote','hours','phone','instagram','telegram'])out[key]=text(value[key],key==='brand'?40:300);
 if(!out.brand||!out.city)error('Укажите название и город');
 if(out.phone&&!/^996\d{9}$/.test(out.phone.replace(/\D/g,'')))error('Телефон студии должен быть в формате +996 (XXX) XXX-XXX');
 for(const key of ['instagram','telegram'])if(out[key]){let u;try{u=new URL(out[key]);}catch{error('Укажите полную HTTPS-ссылку на соцсеть');}if(u.protocol!=='https:'||u.username||u.password)error('Используйте HTTPS-ссылку без логина и пароля');}
 out.hero={};for(const key of Object.keys(defaultSite.hero))out.hero[key]=text(value.hero?.[key],key==='description'||key==='note'?1000:300);
 if(!validImage(out.hero.image))error('Загрузите допустимое изображение для главного экрана');
 out.texts={};for(const key of Object.keys(defaultSite.texts))out.texts[key]=text(value.texts?.[key],1000);
 out.legal={operator:text(value.legal?.operator||'',300),privacy:text(value.legal?.privacy||'',6000),cancellation:text(value.legal?.cancellation||'',3000)};
 const b={...bookingDefaults,...value.booking};if(typeof b.depositEnabled!=='boolean'||typeof b.whatsappClientsEnabled!=='boolean'||typeof b.whatsappStaffEnabled!=='boolean'||!Number.isInteger(b.depositAmount)||b.depositAmount<100||b.depositAmount>50000||!Number.isInteger(b.paymentMinutes)||b.paymentMinutes<10||b.paymentMinutes>120||!Number.isInteger(b.reminderMinutes)||b.reminderMinutes<15||b.reminderMinutes>1440||!validImage(b.qrImage))error('Проверьте сумму предоплаты, QR и время напоминания');if(typeof b.whatsappOwnerEnabled!=='boolean'||typeof b.ownerWhatsapp!=='string'||b.ownerWhatsapp&&!isValidKgPhone(b.ownerWhatsapp))error('Проверьте WhatsApp хозяйки');out.booking={depositEnabled:b.depositEnabled,depositAmount:b.depositAmount,paymentMinutes:b.paymentMinutes,qrImage:b.qrImage,recipient:text(b.recipient,150),paymentNote:text(b.paymentNote,1000),reminderMinutes:b.reminderMinutes,whatsappClientsEnabled:b.whatsappClientsEnabled,whatsappStaffEnabled:b.whatsappStaffEnabled,ownerWhatsapp:text(b.ownerWhatsapp,40),whatsappOwnerEnabled:b.whatsappOwnerEnabled};
 out.theme={};for(const key of ['accent','background','ink']){const c=value.theme?.[key];if(!/^#[0-9a-f]{6}$/i.test(c))error('Укажите цвет в формате #RRGGBB');out.theme[key]=c;}
 if(!['serif','sans'].includes(value.theme?.font))error('Выберите стиль шрифта');out.theme.font=value.theme.font;
 out.visible={};for(const key of ['staff','portfolio','faq']){if(typeof value.visible?.[key]!=='boolean')error('Проверьте видимость разделов');out.visible[key]=value.visible[key];}
 if(!Array.isArray(value.portfolio)||value.portfolio.length>24)error('Можно добавить до 24 фотографий работ');
 out.portfolio=value.portfolio.map(p=>{const id=text(p.id,80),image=text(p.image,300);if(!id||!validImage(image)||!image||!categoryLabels[p.category]||typeof p.visible!=='boolean')error('Проверьте фотографию и категорию работы');return {id,image,title:text(p.title,150),category:p.category,visible:p.visible};});
 if(new Set(out.portfolio.map(p=>p.id)).size!==out.portfolio.length)error('Повторяющиеся фотографии');
 if(!Array.isArray(value.faq)||value.faq.length>20)error('Можно добавить до 20 вопросов');out.faq=value.faq.map(f=>({id:text(f.id,80),question:text(f.question,200),answer:text(f.answer,1500)}));
 if(out.faq.some(f=>!f.id||!f.question||!f.answer)||new Set(out.faq.map(f=>f.id)).size!==out.faq.length)error('Заполните вопросы и ответы');return out;
}
export function validateService(s){
 if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>150||!categoryLabels[s.category]||!Number.isInteger(s.duration)||s.duration<15||s.duration>600||s.duration%15||!Number.isFinite(s.price)||s.price<0||s.price>1e6||typeof s.description!=='string'||s.description.length>500||!Array.isArray(s.staffIds)||s.staffIds.length>20||!s.staffIds.every(Number.isInteger)||new Set(s.staffIds).size!==s.staffIds.length||!validImage(s.image||''))error('Проверьте параметры услуги');
 return {...s,title:s.title.trim(),image:s.image||'',tag:text(s.tag||'',100)};
}
