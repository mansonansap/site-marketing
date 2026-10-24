import { randomBytes, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { atomicJson, readJson, HttpError } from './content.mjs';
const scrypt=promisify(rawScrypt);
export async function setAdmin(dataDir,username,password){
 if(typeof username!=='string'||!/^[a-zA-Z0-9_.@-]{3,80}$/.test(username))throw new HttpError(400,'Логин: 3–80 латинских букв, цифр или . _ @ -');
 if(typeof password!=='string'||password.length<12||password.length>256)throw new HttpError(400,'Пароль должен содержать от 12 до 256 символов.');
 const salt=randomBytes(16).toString('hex');const hash=(await scrypt(password,salt,64)).toString('hex');
 const account={username,salt,hash,updatedAt:new Date().toISOString()};await atomicJson(path.join(dataDir,'auth.json'),account);return account;
}
export async function createAuth(dataDir){
 const sessions=new Map(),attempts=new Map();
 const dummySalt=randomBytes(16).toString('hex');
 const maxAge=12*60*60*1000;
 const account=()=>readJson(path.join(dataDir,'auth.json'));
 const parseCookie=req=>{const cookie=req.headers.cookie||'';const pair=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('cv_session='));return pair?pair.slice('cv_session='.length):'';};
 return {
  configured:async()=>Boolean(await account()),
  async login(username,password,address){
   const now=Date.now();
   for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
   const counter=attempts.get(address);
   if(counter?.count>=8&&counter.until>now)throw new HttpError(429,'Слишком много попыток. Попробуйте через 15 минут.');
   const current=await account();
   const safePassword=typeof password==='string'&&password.length<=256?password:'';
   const hash=await scrypt(safePassword,current?.salt||dummySalt,64);
   const valid=current&&typeof username==='string'&&username===current.username&&timingSafeEqual(hash,Buffer.from(current.hash,'hex'));
   if(!valid){attempts.set(address,{count:(counter?.count||0)+1,until:counter?.until||now+900000});throw new HttpError(401,'Неверный логин или пароль.');}
   attempts.delete(address);
   for(const [key,value] of sessions)if(value.expires<now)sessions.delete(key);
   if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);
   const token=randomBytes(32).toString('hex');const csrf=randomBytes(32).toString('hex');
   const session={username:current.username,csrf,expires:now+maxAge,accountVersion:current.updatedAt};sessions.set(token,session);
   return {token,session};
  },
  async session(req){
   const token=parseCookie(req);const session=sessions.get(token);if(!session)return null;
   const current=await account();
   if(session.expires<Date.now()||!current||current.updatedAt!==session.accountVersion){sessions.delete(token);return null;}
   return session;
  },
  logout(req){sessions.delete(parseCookie(req));},
  cookie(token,secure=false,clear=false){return `cv_session=${clear?'':token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:43200}${secure?'; Secure':''}`;},
  validCsrf(req,session){const value=req.headers['x-csrf-token'];return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value.length===session.csrf.length&&timingSafeEqual(Buffer.from(value),Buffer.from(session.csrf));},
 };
}
