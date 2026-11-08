import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {defaultContent} from './build.mjs';
import {icons} from './icons.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const stage=path.join(root,'dist/hostiq');await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
await cp(path.join(root,'php-hosting'),stage,{recursive:true,filter:source=>!['config.php','uploads'].includes(path.basename(source))});
const privateDir=path.join(stage,'marketing-cv-private'),publicDir=path.join(stage,'public_html');
await writeFile(path.join(privateDir,'seed.json'),JSON.stringify(defaultContent(),null,2)+'\n');
await writeFile(path.join(privateDir,'icons.json'),JSON.stringify(icons,null,2)+'\n');
for(const file of ['assets','style.css','app.js','admin'])await cp(path.join(root,file),path.join(publicDir,file),{recursive:true});
const adminFile=path.join(publicDir,'admin/admin.js');let admin=await readFile(adminFile,'utf8');
admin=admin.replace('<code>npm run admin:create</code>','<a href="/install.php">Открыть установку</a>').replace('Создайте администратора в терминале сервера:','Создайте администратора через страницу установки:').replace('Команда попросит логин и пароль. Пароль не отображается и не отправляется в чат.','Для установки понадобится ключ из приватного config.php.');
await writeFile(adminFile,admin);
await cp(path.join(root,'HOSTIQ.md'),path.join(stage,'INSTALL.md'));
await mkdir(path.join(root,'releases'),{recursive:true});
const archive=path.join(root,'releases/hostiq-site.zip');
execFileSync('python3',['-c',`import pathlib,sys,zipfile
base=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as out:
 for p in sorted(base.rglob('*')):
  if p.is_file():
   info=zipfile.ZipInfo(str(p.relative_to(base)),(2026,1,1,0,0,0))
   info.compress_type=zipfile.ZIP_DEFLATED
   info.external_attr=0o100644 << 16
   out.writestr(info,p.read_bytes())
`,stage,archive]);
console.log('PHP hosting package: releases/hostiq-site.zip (no credentials or user data).');
