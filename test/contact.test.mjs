import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createSiteServer} from '../server.mjs';
import {setAdmin} from '../cms/auth.mjs';
test('contact inbox validates submissions, protects access and persists after restart',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'cv-inbox-'));let app;
 const password=randomBytes(24).toString('hex');await setAdmin(dataDir,'owner',password);
 async function start(){app=await createSiteServer({dataDir,production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+app.server.address().port;}
 async function stop(){await new Promise(r=>{app.server.close(r);app.server.closeAllConnections();});}
 try{
  let origin=await start();
  const entry={name:'Test <script>',contact:'@visitor',message:'First line\nSecond line'};
  const send=(data,source=origin)=>fetch(origin+'/api/contact',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await fetch(origin+'/api/admin/messages')).status,401);
  assert.equal((await send(entry,'https://other.example')).status,403);
  assert.equal((await send({...entry,message:''})).status,400);
  assert.equal((await send({...entry,contact:'x'.repeat(201)})).status,400);
  assert.equal((await send({...entry,website:'spam'})).status,201);
  assert.equal((await send(entry)).status,201);
  const html=await(await fetch(origin+'/')).text();assert.ok(!html.includes('mailto:'));assert.ok(!html.includes('contact@examle.com'));assert.ok(html.includes('Growth Marketing'));
  await stop();origin=await start();
  const login=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'owner',password})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await fetch(origin+'/api/admin/messages',{headers:{Cookie:cookie}});assert.equal(response.status,200);
  const {messages}=await response.json();assert.equal(messages.length,1);for(const key of Object.keys(entry))assert.equal(messages[0][key],entry[key]);
  assert.equal((await fetch(origin+'/inbox/'+messages[0].id+'.json')).status,404);
 }finally{if(app)await stop();await rm(dataDir,{recursive:true,force:true});}
});
