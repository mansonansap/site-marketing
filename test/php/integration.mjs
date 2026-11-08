import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,cp,writeFile,mkdir,rm,chmod,readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const root=new URL('../../',import.meta.url).pathname;
const temp=await mkdtemp('/tmp/cv-php-test-');await chmod(temp,0o755);
const name='cv-php-test-'+process.pid,network=name+'-net',database=name+'-db',web=name+'-web';
const password=randomBytes(24).toString('hex'),setupKey=randomBytes(32).toString('hex'),dbPassword=randomBytes(24).toString('hex');let browser;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let origin,cookie='',csrf='',revision;
async function request(route,{method='GET',body,raw,auth=true,token=true,source,headers={}}={}){
 const h={...headers};if(auth&&cookie)h.Cookie=cookie;
 if(!['GET','HEAD'].includes(method)){h.Origin=source??origin;if(token)h['X-CSRF-Token']=csrf;}
 if(body!==undefined){h['Content-Type']='application/json';body=JSON.stringify(body);}else body=raw;
 return fetch(origin+route,{method,headers:h,body,redirect:'manual'});
}
async function json(route,options){const res=await request(route,options);return {res,data:await res.json()};}
try{
 await cp(root+'dist/hostiq',temp+'/site',{recursive:true});
 await writeFile(temp+'/db.env',`MARIADB_ROOT_PASSWORD=${randomBytes(24).toString('hex')}\nMARIADB_DATABASE=cv_test\nMARIADB_USER=cv_user\nMARIADB_PASSWORD=${dbPassword}\n`,{mode:0o600});
 docker('network','create',network);
 docker('run','-d','--name',database,'--network',network,'--env-file',temp+'/db.env','mariadb:10.11');
 docker('run','-d','--name',web,'--network',network,'-p','127.0.0.1::80','-v',temp+'/site/public_html:/var/www/html','-v',temp+'/site/marketing-cv-private:/var/www/marketing-cv-private','marketing-cv-php:test');
 const port=docker('port',web,'80/tcp').split(':').pop();origin='http://127.0.0.1:'+port;
 const config={db_host:database,db_name:'cv_test',db_user:'cv_user',db_password:dbPassword,origin,setup_key:setupKey};
 await writeFile(temp+'/site/marketing-cv-private/config.php',`<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'),true);`,{mode:0o600});
 for(let i=0;i<60;i++){try{if(docker('exec',database,'healthcheck.sh','--connect','--innodb_initialized')!==undefined)break;}catch{}if(i===59)throw Error('DB startup timeout');await wait(500);}
 const require=createRequire(import.meta.url);const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/install.php');await page.locator('[name=setup_key]').fill(setupKey);await page.locator('[name=username]').fill('owner');await page.locator('[name=password]').fill(password);await page.locator('[name=confirmation]').fill(password);await page.locator('button').click();await page.waitForURL('**/admin/');
 assert.equal((await request('/install.php')).status,404);
 for(const route of ['/api/admin/content','/api/admin/messages','/admin/preview/'])assert.equal((await request(route,{auth:false})).status,401);
 for(const route of ['/marketing-cv-private/config.php','/config.php','/.git/config','/assets/../../config.php'])assert.ok([400,404].includes((await request(route)).status));
 assert.equal((await request('/api/admin/login',{method:'POST',body:{username:'owner',password},source:'https://foreign.example'})).status,403);
 const login=await json('/api/admin/login',{method:'POST',body:{username:'owner',password}});assert.equal(login.res.status,200);cookie=login.res.headers.getSetCookie().at(-1).split(';')[0];csrf=login.data.csrf;assert.ok(login.res.headers.get('set-cookie').includes('HttpOnly'));
 let {data}=await json('/api/admin/content');let content=data.content;revision=content.revision;
 assert.equal((await request('/api/admin/content',{method:'PUT',body:{content,revision},token:false})).status,403);
 for(const modify of [c=>c.profile.photo='javascript:alert(1)',c=>c.articles.push(structuredClone(c.articles[0])),c=>c.articles[0].date='2026-02-30',c=>c.cases[0].result.ru='']){
  const invalid=structuredClone(content);modify(invalid);assert.equal((await request('/api/admin/content',{method:'PUT',body:{content:invalid,revision}})).status,400);
 }

 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVxkAAAAASUVORK5CYII=','base64');
 assert.equal((await request('/api/admin/uploads',{method:'POST',raw:'<svg onload=alert(1)></svg>'})).status,415);
 const uploaded=await json('/api/admin/uploads',{method:'POST',raw:png});assert.equal(uploaded.res.status,201);const photo=uploaded.data.url;assert.equal((await request(photo)).status,200);
 content.profile.name='PHP <script>alert(1)</script>';content.profile.photo=photo;
 content.articles[0].body.en=[['One','English only section']];
 let saved=await json('/api/admin/content',{method:'PUT',body:{content,revision}});assert.equal(saved.res.status,200);content=saved.data.content;revision=content.revision;
 assert.equal((await request('/api/admin/content',{method:'PUT',body:{content,revision:revision-1}})).status,409);
 assert.ok(!(await(await request('/')).text()).includes('PHP &lt;script&gt;'));
 assert.equal((await request('/api/admin/preview',{method:'POST',body:{revision}})).status,200);
 const preview=await(await request('/admin/preview/')).text();assert.ok(preview.includes('PHP &lt;script&gt;'));assert.ok(preview.includes('/admin/preview/journal/'));
 assert.equal((await request('/api/admin/publish',{method:'POST',body:{revision}})).status,200);
 const home=await(await request('/')).text();assert.ok(home.includes('PHP &lt;script&gt;'));assert.ok(!home.includes('<h1>PHP <script>'));assert.ok(!home.includes('mailto:'));assert.ok(home.includes('127.0.0.1'));assert.ok(!home.includes('andrewshmarketing.ink'));
 // Browser exercises the unchanged editor against the PHP API.
 await page.goto(origin+'/admin/');await page.locator('#username').fill('owner');await page.locator('#password').fill(password);await page.locator('#login-form button').click();await page.locator('[data-nav=profile]').waitFor();
 await page.locator('[data-path="profile.name"]').fill('PHP Browser Profile');await page.locator('[data-action=save]').click();await page.getByText('Изменения сохранены. Можно проверить предпросмотр.',{exact:true}).waitFor();await page.locator('[data-action=publish]').click();await page.getByText('Готово. Изменения опубликованы на сайте.',{exact:true}).waitFor();
 await page.goto(origin);await page.locator('[name=name]').fill('Visitor <script>');await page.locator('[name=contact]').fill('@visitor');await page.locator('[name=message]').fill('PHP inbox test');await page.locator('#contact-form button').click();await page.getByText('Сообщение отправлено. Спасибо!',{exact:true}).waitFor();
 await page.goto(origin+'/admin/');await page.locator('[data-nav=messages]').click();await page.getByText('PHP inbox test',{exact:true}).waitFor();assert.equal(await page.locator('#inbox-list script').count(),0);
 // APIs use a separate login cookie; browser login did not overwrite it.
 let inbox=await json('/api/admin/messages');assert.equal(inbox.data.messages.length,1);
 assert.equal((await request('/api/contact',{method:'POST',body:{name:'n',contact:'c',message:'m'},source:'https://foreign.example'})).status,403);
 assert.equal((await request('/api/contact',{method:'POST',body:{name:'n',contact:'c',message:''}})).status,400);
 const routes=['/','/journal/','/work/',...content.articles.map(a=>'/journal/'+a.slug+'/'),...content.cases.map(c=>'/work/'+c.slug+'/')];
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const route of routes){await page.goto(origin+route);for(const lang of ['ru','en','uk','es']){await page.selectOption('#language',lang);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${route} ${width} ${lang}`);}}}
 await page.goto(origin+'/journal/'+content.articles[0].slug+'/?lang=en');assert.equal(await page.locator('.prose-section').count(),1);await page.getByText('English only section',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 // Validate actual restart persistence (not in-memory data).
 docker('restart',web);
 origin='http://127.0.0.1:'+docker('port',web,'80/tcp').split(':').pop();config.origin=origin;
 await writeFile(temp+'/site/marketing-cv-private/config.php',`<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'),true);`,{mode:0o600});
 for(let i=0;i<30;i++){try{if((await request('/healthz')).status===200)break;}catch{}if(i===29)throw Error('Apache restart health timeout');await wait(200);}
 assert.ok((await(await request('/')).text()).includes('PHP Browser Profile'));assert.equal((await request(photo)).status,200);
 // Remove all visible materials and ensure stale URLs disappear without deleting stored snapshots.
 ({data}=await json('/api/admin/content'));content=data.content;revision=content.revision;content.articles=[];content.cases=[];content.experience=[];
 saved=await json('/api/admin/content',{method:'PUT',body:{content,revision}});assert.equal(saved.res.status,200);revision=saved.data.content.revision;
 await request('/api/admin/publish',{method:'POST',body:{revision}});assert.equal((await request(routes[3])).status,404);assert.equal((await request('/journal/')).status,200);
 // Production cookies use Secure/HttpOnly/SameSite=Strict when origin is HTTPS.
 config.origin='https://php-test.example';
 await writeFile(temp+'/site/marketing-cv-private/config.php',`<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'),true);`,{mode:0o600});
 const secureLogin=await request('/api/admin/login',{method:'POST',body:{username:'owner',password},source:config.origin});assert.equal(secureLogin.status,200);
 const secureCookie=secureLogin.headers.getSetCookie().at(-1);assert.match(secureCookie,/secure/i);assert.match(secureCookie,/httponly/i);assert.match(secureCookie,/samesite=strict/i);
 config.origin=origin;
 await writeFile(temp+'/site/marketing-cv-private/config.php',`<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'),true);`,{mode:0o600});
 // Contact throttling is persisted in MariaDB.
 let throttled=false;for(let i=0;i<12;i++){if((await request('/api/contact',{method:'POST',body:{name:'n',contact:'c',message:'m',website:'bot'}})).status===429){throttled=true;break;}}assert.ok(throttled);
 console.log('PASS PHP/Apache/MariaDB: installer, protected admin, CSRF/origin, validation, uploads, drafts/conflicts, preview/publish, browser editor/inbox, 128 responsive language routes, restart persistence, empty collections, throttling.');
} catch(error){console.error(error.stack);try{console.error(docker('logs','--tail','15',web));}catch{}process.exitCode=1;
} finally {
 await browser?.close();for(const container of [web,database]){try{docker('rm','-f',container);}catch{}}try{docker('network','rm',network);}catch{}await rm(temp,{recursive:true,force:true});
}
