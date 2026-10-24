import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createSiteServer } from '../server.mjs';
import { setAdmin } from '../cms/auth.mjs';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVxkAAAAASUVORK5CYII=','base64');
async function listen(app){await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+app.server.address().port;}
async function close(server){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}

test('CMS: auth, isolated drafts, media, publication, persistence and removal',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'marketing-cms-test-'));
 const password=randomBytes(24).toString('hex');await setAdmin(dataDir,'owner',password);
 let app=await createSiteServer({dataDir,production:false});let origin=await listen(app);let cookie='',csrf='';
 t.after(async()=>{await close(app.server);await rm(dataDir,{recursive:true,force:true});});
 async function request(route,{method='GET',data,auth=true,token=true,originHeader=origin,raw,extra={}}={}){
  const headers={...extra};if(auth&&cookie)headers.Cookie=cookie;
  if(method!=='GET'){headers.Origin=originHeader;if(token&&csrf)headers['X-CSRF-Token']=csrf;}
  Object.assign(headers,extra);
  let body;if(data!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(data);}else if(raw){headers['Content-Type']='application/octet-stream';body=raw;}
  return fetch(origin+route,{method,headers,body,redirect:'manual'});
 }
 async function json(route,options){const response=await request(route,options);return {status:response.status,data:await response.json(),response};}
 async function login(){const result=await json('/api/admin/login',{method:'POST',data:{username:'owner',password},auth:false});assert.equal(result.status,200);cookie=result.response.headers.get('set-cookie').split(';')[0];csrf=result.data.csrf;return result;}
 let content,revision,uploaded;
 await t.test('public site is available while administration is protected',async()=>{
  assert.equal((await request('/')).status,200);
  assert.equal((await request('/admin/')).status,200);
  for(const route of ['/api/admin/content','/admin/preview/'])assert.equal((await request(route,{auth:false})).status,401);
  for(const route of ['/.data/auth.json','/cms/auth.mjs','/site-data.mjs','/.data/content.json'])assert.equal((await request(route)).status,404);
  assert.equal((await json('/api/admin/session',{auth:false})).data.configured,true);
  assert.equal((await json('/api/admin/login',{method:'POST',data:{username:'owner',password},originHeader:'https://other.example'})).status,403);
  assert.equal((await json('/api/admin/login',{method:'POST',data:{username:'owner',password:'incorrect'}})).status,401);
  const result=await login();assert.match(result.response.headers.get('set-cookie'),/HttpOnly/);assert.match(result.response.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await json('/api/admin/session')).data.username,'owner');
 });
 await t.test('CSRF and invalid uploads are rejected, valid image is persisted',async()=>{
  assert.equal((await json('/api/admin/uploads',{method:'POST',raw:PNG,token:false})).status,403);
  assert.equal((await json('/api/admin/uploads',{method:'POST',raw:Buffer.from('<svg onload="alert(1)"></svg>')})).status,415);
  const result=await json('/api/admin/uploads',{method:'POST',raw:PNG});assert.equal(result.status,201);uploaded=result.data.url;
  const image=await request(uploaded,{auth:false});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),PNG);
  assert.equal((await json('/api/admin/content',{method:'PUT',data:{},extra:{'X-CSRF-Token':'x'.repeat(64)}})).status,403);
 });
 await t.test('saving a draft leaves the public version unchanged and detects conflicts',async()=>{
  const result=await json('/api/admin/content');content=result.data.content;revision=content.revision;
  content.profile.name='Edited Owner';content.profile.photo=uploaded;content.profile.yearsExperience=7;
  content.cvCopy.ru.profileIntro='<img src=x onerror=alert(1)>\nНовый текст из редактора.';
  content.experience[0].company.ru='A company';content.experience[0].period.ru='2020–2025';
  content.articles[0].title.ru='Уникальный заголовок из редактора';content.articles[0].cover=uploaded;content.articles[0].date='2026-10-24';content.articles[0].demo=false;
  content.articles[0].body.ru=[['Один раздел','Уникальный текст статьи.\n\nВторой абзац.']];
  content.articles.push({...structuredClone(content.articles[0]),slug:'private-draft',published:false});
  content.cases=[];
  const saved=await json('/api/admin/content',{method:'PUT',data:{content,revision}});assert.equal(saved.status,200);content=saved.data.content;
  assert.equal(content.revision,revision+1);assert(!((await (await request('/')).text()).includes('Edited Owner')));
  assert.equal((await json('/api/admin/content',{method:'PUT',data:{content,revision}})).status,409);
  const invalid=structuredClone(content);invalid.articles[0].slug='../../escape';assert.equal((await json('/api/admin/content',{method:'PUT',data:{content:invalid,revision:content.revision}})).status,400);
  invalid.articles[0].slug=content.articles[0].slug;invalid.profile.photo='javascript:alert(1)';assert.equal((await json('/api/admin/content',{method:'PUT',data:{content:invalid,revision:content.revision}})).status,400);
 });
 await t.test('authenticated preview shows saved edits with isolated navigation',async()=>{
  const result=await json('/api/admin/preview',{method:'POST',data:{revision:content.revision}});assert.equal(result.status,200);
  assert.equal((await request(result.data.url,{auth:false})).status,401);
  const response=await request(result.data.url);const html=await response.text();assert.equal(response.status,200);assert.match(html,/Edited Owner/);assert.match(html,/href="\/admin\/preview\/journal\//);assert.match(response.headers.get('cache-control'),/no-store/);
  assert(!html.includes('<img src=x onerror='));assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert(!((await (await request('/')).text()).includes('Edited Owner')));
 });
 await t.test('publish updates public pages, preserves content safely, excludes drafts and deleted pages',async()=>{
  const result=await json('/api/admin/publish',{method:'POST',data:{revision:content.revision}});assert.equal(result.status,200);
  const html=await (await request('/')).text();assert.match(html,/Edited Owner/);assert(html.includes(uploaded));assert(!html.includes('<img src=x onerror='));
  const article=await(await request('/journal/acquisition-is-not-growth/')).text();assert.match(article,/Уникальный текст статьи/);assert.match(article,/Второй абзац/);assert(article.includes(uploaded));assert(!article.includes('class="content-notice"'));
  assert.equal((await request('/journal/private-draft/')).status,404);assert.equal((await request('/work/ecommerce-lifecycle/')).status,404);
 });
 await t.test('an empty journal/experience/project collection can be published',async()=>{
  content.articles=[];content.cases=[];content.experience=[];
  const saved=await json('/api/admin/content',{method:'PUT',data:{content,revision:content.revision}});assert.equal(saved.status,200);content=saved.data.content;
  assert.equal((await json('/api/admin/publish',{method:'POST',data:{revision:content.revision}})).status,200);
  for(const route of ['/','/journal/','/work/'])assert.equal((await request(route)).status,200);
  assert.equal((await request('/journal/acquisition-is-not-growth/')).status,404);
 });
 await t.test('saved content, uploaded files and credentials survive a restart; sessions do not',async()=>{
  await close(app.server);app=await createSiteServer({dataDir,production:false});origin=await listen(app);
  assert.match(await(await request('/')).text(),/Edited Owner/);assert.equal((await request(uploaded)).status,200);
  assert.equal((await request('/api/admin/session')).status,401);await login();
  const result=await json('/api/admin/content');assert.equal(result.data.content.profile.name,'Edited Owner');assert.equal(result.data.content.articles.length,0);assert.equal(result.data.content.revision,content.revision);
  const credentials=await readFile(path.join(dataDir,'auth.json'),'utf8');assert(!credentials.includes(password));assert((await readdir(path.join(dataDir,'backups'))).length>=2);
  assert.equal((await json('/api/admin/logout',{method:'POST',data:{}})).status,200);assert.equal((await request('/api/admin/content')).status,401);
 });
 await t.test('repeated wrong passwords are rate limited',async()=>{
  for(let i=0;i<8;i++)assert.equal((await json('/api/admin/login',{method:'POST',data:{username:'owner',password:'wrong'},auth:false})).status,401);
  assert.equal((await json('/api/admin/login',{method:'POST',data:{username:'owner',password:'wrong'},auth:false})).status,429);
 });
});

test('production: Secure cookies and explicit public origin behind HTTPS proxy',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'marketing-cms-production-'));
 const password=randomBytes(24).toString('hex');await setAdmin(dataDir,'owner',password);
 const app=await createSiteServer({dataDir,production:true,publicOrigin:'https://cv.example'});const origin=await listen(app);
 t.after(async()=>{await close(app.server);await rm(dataDir,{recursive:true,force:true});});
 const login=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://cv.example'},body:JSON.stringify({username:'owner',password})});
 assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/; Secure/);assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 const foreign=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://another.example'},body:JSON.stringify({username:'owner',password})});assert.equal(foreign.status,403);
});
