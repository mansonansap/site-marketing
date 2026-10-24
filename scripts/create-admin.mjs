import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setAdmin } from '../cms/auth.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.stdin.isTTY){console.error('Запустите команду в интерактивном терминале: пароль вводится скрыто.');process.exit(1);}
const input=createInterface({input:process.stdin,output:process.stdout});
const username=(await input.question('Логин администратора [admin]: ')).trim()||'admin';input.close();
function hidden(prompt){
 return new Promise((resolve,reject)=>{
  process.stdout.write(prompt);let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  const onData=text=>{
   for(const char of text){
    if(char==='\u0003'){cleanup();reject(new Error('Ввод отменён'));return;}
    if(char==='\r'||char==='\n'){cleanup();resolve(value);return;}
    if(char==='\u007f'||char==='\b'){if(value){value=value.slice(0,-1);process.stdout.write('\b \b');}}
    else if(char>=' '&&value.length<256){value+=char;process.stdout.write('*');}
   }
  };
  function cleanup(){process.stdin.removeListener('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
  process.stdin.on('data',onData);
 });
}
try{
 const password=await hidden('Пароль (не менее 12 символов): ');
 const confirmation=await hidden('Повторите пароль: ');
 if(password!==confirmation)throw Error('Пароли не совпадают.');
 await setAdmin(resolve(process.env.DATA_DIR||resolve(root,'.data')),username,password);
 console.log('Администратор сохранён. Откройте /admin/ и войдите.');
}catch(error){console.error(error.message);process.exitCode=1;}
