import http from 'node:http';
import { readFile, stat, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSite } from './scripts/build.mjs';
import { createStore, readJson, atomicJson, HttpError } from './cms/content.mjs';
import { createAuth } from './cms/auth.mjs';

const ROOT=fileURLToPath(new URL('.',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon'};
const allowedShared=new Set(['/style.css','/app.js','/admin/admin.css','/admin/admin.js']);
async function body(req,limit){
 const buffers=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw new HttpError(413,'Файл или запрос слишком большой.');buffers.push(chunk);}
 return Buffer.concat(buffers);
}
async function jsonBody(req,limit=4*1024*1024){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Ожидается JSON.');
 try{return JSON.parse((await body(req,limit)).toString('utf8'));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Некорректный JSON.');}
}
function imageType(buffer){
 if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
 if(buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'jpg';
 if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'webp';
 if(buffer.length>=10&&['GIF87a','GIF89a'].includes(buffer.toString('ascii',0,6)))return 'gif';
 throw new HttpError(415,'Загрузите JPEG, PNG, WebP или GIF. SVG и другие форматы не поддерживаются.');
}
function safeFile(base,relative){
 const filename=path.resolve(base,relative.replace(/^\/+/,''));
 if(filename!==base&&!filename.startsWith(path.resolve(base)+path.sep))throw new HttpError(404,'Не найдено.');
 return filename;
}
export async function createSiteServer(options={}){
 const configuredOrigin=options.publicOrigin||process.env.PUBLIC_ORIGIN||'';
 if(configuredOrigin){let url;try{url=new URL(configuredOrigin);}catch{throw Error('PUBLIC_ORIGIN must be an absolute HTTPS origin.');}if(!['https:','http:'].includes(url.protocol)||url.origin!==configuredOrigin)throw Error('PUBLIC_ORIGIN must be an origin without a path or trailing slash.');}
 const dataDir=path.resolve(options.dataDir||process.env.DATA_DIR||path.join(ROOT,'.data'));
 await mkdir(dataDir,{recursive:true,mode:0o700});
 const store=await createStore(dataDir),auth=await createAuth(dataDir);
 const publishedFile=path.join(dataDir,'published.json');
 let published=await readJson(publishedFile);
 if(!published){published={...store.get(),publishedAt:new Date().toISOString()};await atomicJson(publishedFile,published);}
 let currentRelease=await compile(published,'site');let currentPreview=null;
 await cleanupReleases();
 const inboxDir=path.join(dataDir,'inbox');await mkdir(inboxDir,{recursive:true,mode:0o700});
 let contactAttempts=[];
 let publishQueue=Promise.resolve();
 async function compile(content,kind){
  const destination=path.join(dataDir,'releases',`${kind}-${randomUUID()}`);
  try{await buildSite(content,destination);return destination;}catch(error){await rm(destination,{recursive:true,force:true});throw error;}
 }
 async function cleanupReleases(){
  const directory=path.join(dataDir,'releases');const entries=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&/^(site|preview)-[a-f0-9-]+$/.test(entry.name));
  const sorted=await Promise.all(entries.map(async entry=>({file:path.join(directory,entry.name),mtime:(await stat(path.join(directory,entry.name))).mtimeMs})));
  sorted.sort((a,b)=>b.mtime-a.mtime);
  await Promise.all(sorted.slice(8).filter(entry=>entry.file!==currentRelease&&entry.file!==currentPreview).map(entry=>rm(entry.file,{recursive:true,force:true})));
 }
 function serialized(operation){const result=publishQueue.then(operation);publishQueue=result.catch(()=>{});return result;}
 function secure(req){return (options.production??process.env.NODE_ENV==='production')||Boolean(req.socket.encrypted)||(process.env.TRUST_PROXY==='1'&&req.headers['x-forwarded-proto']==='https');}
 function origin(req){return configuredOrigin||`${secure(req)?'https':'http'}://${req.headers.host}`;}
 function checkOrigin(req){if(req.headers.origin!==origin(req))throw new HttpError(403,'Запрос должен быть отправлен с этого сайта.');}
 function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
 async function sendFile(req,res,filename,{status=200,privateFile=false,preview=false}={}){
  let info;try{info=await stat(filename);}catch(error){if(error.code==='ENOENT')throw new HttpError(404,'Не найдено.');throw error;}
  if(!info.isFile())throw new HttpError(404,'Не найдено.');
  const ext=path.extname(filename).toLowerCase();if(!MIME[ext])throw new HttpError(404,'Не найдено.');
  let contents=await readFile(filename);
  if(preview&&ext==='.html')contents=Buffer.from(contents.toString('utf8').replace(/(<a\b[^>]*\bhref=")\/(?!\/)/g,'$1/admin/preview/'));
  res.writeHead(status,{'Content-Type':MIME[ext],'Content-Length':contents.length,'Cache-Control':privateFile||ext==='.html'?'no-store':'public, max-age=3600',...(privateFile?{'X-Robots-Tag':'noindex, nofollow'}:{})});
  res.end(req.method==='HEAD'?undefined:contents);
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https: http: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  try{
   let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{throw new HttpError(400,'Некорректный URL.');}
   if(pathname.includes('\0')||pathname.includes('\\'))throw new HttpError(400,'Некорректный URL.');
   const mutation=!['GET','HEAD'].includes(req.method);
   if(pathname==='/api/contact'&&req.method==='POST'){
    checkOrigin(req);
    const now=Date.now();contactAttempts=contactAttempts.filter(time=>now-time<900000);
    if(contactAttempts.length>=60)throw new HttpError(429,'Попробуйте позже.');
    contactAttempts.push(now);
    const input=await jsonBody(req,16384);
    if(!input||typeof input!=='object')throw new HttpError(400,'Заполните форму.');
    if(input.website)return json(res,201,{ok:true});
    const entry={id:randomUUID(),createdAt:new Date().toISOString()};
    for(const [key,max] of [['name',100],['contact',200],['message',5000]]){
     if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max)throw new HttpError(400,'Проверьте поля формы.');
     entry[key]=input[key].trim();
    }
    if((await readdir(inboxDir)).length>=10000)throw new HttpError(503,'Попробуйте позже.');
    await atomicJson(path.join(inboxDir,entry.id+'.json'),entry);
    return json(res,201,{ok:true});
   }
   if(pathname.startsWith('/api/admin/')){
    if(mutation)checkOrigin(req);
    if(pathname==='/api/admin/login'&&req.method==='POST'){
     const input=await jsonBody(req);const {token,session}=await auth.login(input.username,input.password,req.socket.remoteAddress||'unknown');
     res.setHeader('Set-Cookie',auth.cookie(token,secure(req)));return json(res,200,{username:session.username,csrf:session.csrf});
    }
    const session=await auth.session(req);
    if(pathname==='/api/admin/session'&&req.method==='GET')return json(res,session?200:401,session?{username:session.username,csrf:session.csrf}:{configured:await auth.configured(),error:'Войдите в админку.'});
    if(!session)throw new HttpError(401,'Войдите в админку.');
    if(mutation&&!auth.validCsrf(req,session))throw new HttpError(403,'Сессия формы устарела. Обновите страницу.');
    if(pathname==='/api/admin/logout'&&req.method==='POST'){auth.logout(req);res.setHeader('Set-Cookie',auth.cookie('',secure(req),true));return json(res,200,{ok:true});}
    if(pathname==='/api/admin/messages'&&req.method==='GET'){
     const files=(await readdir(inboxDir)).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name));
     const messages=await Promise.all(files.map(name=>readJson(path.join(inboxDir,name))));
     return json(res,200,{messages:messages.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
    }
    if(pathname==='/api/admin/content'&&req.method==='GET')return json(res,200,{content:store.get(),publishedAt:published.publishedAt,publishedRevision:published.revision});
    if(pathname==='/api/admin/content'&&req.method==='PUT'){
     const input=await jsonBody(req);const content=await store.save(input.content,input.revision);return json(res,200,{content,publishedAt:published.publishedAt,publishedRevision:published.revision});
    }
    if(pathname==='/api/admin/publish'&&req.method==='POST'){
     const input=await jsonBody(req);
     return await serialized(async()=>{
      const snapshot=store.get();if(input.revision!==snapshot.revision)throw new HttpError(409,'Контент изменён. Сначала обновите и сохраните данные.');
      const release=await compile(snapshot,'site');const next={...snapshot,publishedAt:new Date().toISOString()};
      try{await atomicJson(publishedFile,next);}catch(error){await rm(release,{recursive:true,force:true});throw error;}
      currentRelease=release;published=next;await cleanupReleases();
      // Keep the latest releases for in-flight requests; older generated pages are disposable.
      return json(res,200,{publishedAt:next.publishedAt,publishedRevision:next.revision});
     });
    }
    if(pathname==='/api/admin/preview'&&req.method==='POST'){
     const input=await jsonBody(req);
     return await serialized(async()=>{
      const snapshot=store.get();if(input.revision!==snapshot.revision)throw new HttpError(409,'Сначала сохраните актуальную версию.');
      currentPreview=await compile(snapshot,'preview');await cleanupReleases();return json(res,200,{url:'/admin/preview/'});
     });
    }
    if(pathname==='/api/admin/uploads'&&req.method==='POST'){
     const bytes=await body(req,8*1024*1024);const ext=imageType(bytes);const name=randomBytes(18).toString('hex')+'.'+ext;
     const dir=path.join(dataDir,'uploads');await mkdir(dir,{recursive:true,mode:0o700});await writeFile(path.join(dir,name),bytes,{mode:0o600,flag:'wx'});
     return json(res,201,{url:'/uploads/'+name});
    }
    throw new HttpError(404,'Не найдено.');
   }
   if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Метод не поддерживается.');
   if(pathname==='/healthz')return json(res,200,{ok:true});
   if(pathname==='/admin'){res.writeHead(302,{Location:'/admin/','Cache-Control':'no-store'});return res.end();}
   if(pathname==='/admin/'||pathname==='/admin/index.html')return await sendFile(req,res,path.join(ROOT,'admin/index.html'),{privateFile:true});
   if(pathname.startsWith('/admin/preview/')){
    if(!await auth.session(req))throw new HttpError(401,'Войдите в админку.');
    if(!currentPreview)throw new HttpError(404,'Сначала создайте предпросмотр в админке.');
    let relative=pathname.slice('/admin/preview/'.length);if(!relative||relative.endsWith('/'))relative+='index.html';
    return await sendFile(req,res,safeFile(currentPreview,relative),{privateFile:true,preview:true});
   }
   if(allowedShared.has(pathname))return await sendFile(req,res,safeFile(ROOT,pathname),{privateFile:true});
   if(pathname.startsWith('/assets/'))return await sendFile(req,res,safeFile(ROOT,pathname));
   if(/^\/uploads\/[a-f0-9]{36}\.(png|jpg|webp|gif)$/.test(pathname))return await sendFile(req,res,safeFile(path.join(dataDir,'uploads'),pathname.slice('/uploads/'.length)));
   let relative=pathname;if(relative.endsWith('/'))relative+='index.html';
   if(!/^\/(?:index\.html|404\.html|(?:journal|work)\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?index\.html)$/.test(relative))return await sendFile(req,res,path.join(currentRelease,'404.html'),{status:404});
   try{return await sendFile(req,res,safeFile(currentRelease,relative));}
   catch(error){if(error.status===404)return await sendFile(req,res,path.join(currentRelease,'404.html'),{status:404});throw error;}
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   const status=error.status||500;if(status===429)res.setHeader('Retry-After','900');
   if(status>=500)console.error('Request failed:',error.code||error.name);
   json(res,status,{error:status>=500?'Не удалось выполнить операцию. Попробуйте ещё раз.':error.message});
  }
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,dataDir,store};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--development'))process.env.NODE_ENV='development';else process.env.NODE_ENV??='production';
 const {server}=await createSiteServer();const port=Number(process.env.PORT||3000);const host=process.env.HOST||'0.0.0.0';
 server.listen(port,host,()=>console.log(`CV site and /admin/ are listening on port ${port}.`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
}
