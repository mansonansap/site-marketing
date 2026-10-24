import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { defaultContent } from '../scripts/build.mjs';
export const LANGUAGES=['ru','en','uk','es'];
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=message=>{throw new HttpError(400,message);};
const object=(value,field)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(`Некорректное поле: ${field}`);return value;};
const str=(value,field,max=4000,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Проверьте поле «${field}» (до ${max} символов).`);return value.trim();};
const list=(value,field,max)=>{if(!Array.isArray(value)||value.length>max)fail(`Проверьте список «${field}» (не более ${max}).`);return value;};
export function safeMedia(value,field='изображение'){
 const text=str(value??'',field,2000);if(!text)return '';
 if(/^\/(?:uploads|assets)\/[a-zA-Z0-9/_ .-]+$/.test(text)&&!text.includes('..')&&!text.includes('//'))return text;
 try{const u=new URL(text);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}
 fail(`В поле «${field}» нужен URL изображения или путь /uploads/…`);
}
function translation(value,field,max=4000,required=false){
 object(value,field);const ru=str(value.ru,field+' / RU',max,required);
 return Object.fromEntries(LANGUAGES.map(lang=>[lang,lang==='ru'?ru:str(value[lang]??'',field+' / '+lang,max)||ru]));
}
export function validateContent(input){
 object(input,'контент');const defaults=defaultContent();const p=object(input.profile,'профиль');
 const email=str(p.email,'email',254,true);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Укажите корректный email.');
 const years=Number(p.yearsExperience);if(!Number.isInteger(years)||years<0||years>80)fail('Стаж должен быть целым числом от 0 до 80.');
 const links=list(p.links,'ссылки',20).map((item,index)=>{
  object(item,'ссылка');const label=str(item.label,`название ссылки ${index+1}`,80,true);const url=str(item.url,`URL ссылки ${index+1}`,2000,true);
  try{const u=new URL(url);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return {label,url:u.href};}catch{}
  fail(`Некорректный URL ссылки ${index+1}.`);
 });
 const output={profile:{name:str(p.name,'имя',100,true),email,yearsExperience:years,photo:safeMedia(p.photo,'фото'),links},copy:{},cvCopy:{},articles:[],cases:[],experience:[]};
 for(const group of ['copy','cvCopy']){
  object(input[group],group);
  for(const lang of LANGUAGES){
   object(input[group][lang],group+'/'+lang);
   output[group][lang]=Object.fromEntries(Object.keys(defaults[group][lang]).map(key=>[key,str(input[group][lang][key],`${group}/${lang}/${key}`,8000)]));
  }
 }
 output.experience=list(input.experience,'опыт',30).map((entry,index)=>{
  object(entry,'запись опыта');
  if(!['commerce','gaming','growth','analytics','seo'].includes(entry.icon))fail('Выберите значок опыта.');
  object(entry.bullets,'пункты опыта');
  const bullets=Object.fromEntries(LANGUAGES.map(lang=>[lang,list(entry.bullets[lang]??[],'пункты опыта',15).map(text=>str(text,'пункт опыта',1000))]));
  for(const lang of LANGUAGES)if(!bullets[lang].length)bullets[lang]=structuredClone(bullets.ru);
  const articleSlug=str(entry.articleSlug??'','связанная статья',100);
  if(articleSlug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(articleSlug))fail('Выберите корректную связанную статью.');
  return {id:str(entry.id??String(index),'ID опыта',100,true),icon:entry.icon,articleSlug,title:translation(entry.title,'должность / направление',200,true),subtitle:translation(entry.subtitle,'подзаголовок опыта',300),description:translation(entry.description,'описание опыта',5000),company:translation(entry.company,'компания',200),period:translation(entry.period,'период',200),bullets};
 });
 for(const group of ['articles','cases']){
  const slugs=new Set();
  output[group]=list(input[group],group,100).map((entry,index)=>{
   object(entry,group);const slug=str(entry.slug,'URL',100,true);
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slugs.has(slug))fail('URL должны быть уникальными: маленькие латинские буквы, цифры и дефисы.');
   slugs.add(slug);
   if(typeof entry.published!=='boolean'||typeof entry.demo!=='boolean')fail('Проверьте статус материала.');
   const base={slug,number:String(index+1).padStart(2,'0'),published:entry.published,demo:entry.demo,cover:safeMedia(entry.cover,'обложка'),title:translation(entry.title,'заголовок',300,true),lead:translation(entry.lead,'описание',2000)};
   if(group==='articles'){
    if(!['strategy','commerce','gaming'].includes(entry.category))fail('Выберите категорию статьи.');
    const minutes=Number(entry.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>120)fail('Время чтения: от 1 до 120 минут.');
    const date=str(entry.date??'','дата',10);
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail('Некорректная дата статьи.');
    object(entry.body,'текст статьи');const body={};
    for(const lang of LANGUAGES){
     body[lang]=list(entry.body[lang]??[],'разделы статьи',80).map(pair=>{
      if(!Array.isArray(pair)||pair.length!==2)fail('Раздел статьи должен содержать заголовок и текст.');
      return [str(pair[0],'заголовок раздела',300),str(pair[1],'текст раздела',30000)];
     });
    }
    if(entry.published&&!body.ru.some(pair=>pair[1].trim()))fail('Перед публикацией добавьте текст статьи на RU.');
    for(const lang of LANGUAGES)if(!body[lang].some(pair=>pair[1].trim()))body[lang]=structuredClone(body.ru);
    return {...base,category:entry.category,minutes,date,art:{strategy:'direction',commerce:'funnel',gaming:'signal'}[entry.category],body};
   }
   const category=str(entry.category,'направление проекта',100,true);
   return {...base,category,art:category.toLowerCase().includes('gaming')?'gaming':'commerce',context:translation(entry.context,'контекст',30000,entry.published),approach:translation(entry.approach,'подход',30000,entry.published),result:translation(entry.result,'результат',30000,entry.published)};
  });
 }
 return output;
}
export async function atomicJson(filename,value){
 await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
 const temp=filename+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
 await rename(temp,filename);
}
export async function readJson(filename,fallback=null){try{return JSON.parse(await readFile(filename,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
export async function createStore(dataDir){
 await mkdir(dataDir,{recursive:true,mode:0o700});
 const filename=path.join(dataDir,'content.json');
 let state=await readJson(filename);
 if(!state){state={...defaultContent(),revision:1,savedAt:new Date().toISOString()};await atomicJson(filename,state);}
 let queue=Promise.resolve();
 return {
  get:()=>structuredClone(state),
  async save(input,expectedRevision){
   const operation=queue.then(async()=>{
    if(!Number.isInteger(expectedRevision)||expectedRevision!==state.revision)throw new HttpError(409,'Контент изменён в другой вкладке. Обновите данные перед сохранением.');
    const clean=validateContent(input);
    const backups=path.join(dataDir,'backups');await mkdir(backups,{recursive:true,mode:0o700});
    await atomicJson(path.join(backups,`content-${String(state.revision).padStart(8,'0')}.json`),state);
    const next={...clean,revision:state.revision+1,savedAt:new Date().toISOString()};
    await atomicJson(filename,next);state=next;
    const files=(await readdir(backups)).filter(x=>/^content-\d+\.json$/.test(x)).sort();
    await Promise.all(files.slice(0,-20).map(file=>unlink(path.join(backups,file))));
    return structuredClone(state);
   });
   queue=operation.catch(()=>{});return operation;
  },
 };
}
