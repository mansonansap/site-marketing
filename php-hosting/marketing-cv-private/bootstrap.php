<?php
declare(strict_types=1);
define('PUBLIC_DIR', dirname($_SERVER['SCRIPT_FILENAME']));
final class SiteError extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
require __DIR__.'/validation.php';
require __DIR__.'/render.php';
function stamp(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
function encode(mixed $v): string { return json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); }
function decode(string $s): array { return json_decode($s,true,512,JSON_THROW_ON_ERROR); }
function seed(): array { static $seed; return $seed ??= decode(file_get_contents(__DIR__.'/seed.json')); }
function db(): PDO {
    global $config; static $db;
    return $db ??= new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
}
function query(string $sql,array $args=[]): PDOStatement { $q=db()->prepare($sql);$q->execute($args);return $q; }
function installed(): bool {
    try { return (bool)query('SELECT id FROM cv_admin WHERE id=1')->fetchColumn(); }
    catch (PDOException $e) { if ($e->getCode()==='42S02') return false; throw $e; }
}
function payload(int $limit=4194304): array {
    if (!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json')) throw new SiteError(415,'Ожидается JSON.');
    $raw = file_get_contents('php://input',false,null,0,$limit+1);
    if (strlen($raw)>$limit) throw new SiteError(413,'Запрос слишком большой.');
    try { $v=json_decode($raw,true,64,JSON_THROW_ON_ERROR); } catch (JsonException) { throw new SiteError(400,'Некорректный JSON.'); }
    if (!is_array($v) || array_is_list($v)) throw new SiteError(400,'Некорректный запрос.');
    return $v;
}
function respond(int $status,mixed $v): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo encode($v);exit; }
function same_origin(): void { global $config;if (($_SERVER['HTTP_ORIGIN']??'')!==$config['origin']) throw new SiteError(403,'Запрос должен быть отправлен с этого сайта.'); }
function limit_attempts(string $bucket,int $max): void {
    $slot=(int)floor(time()/900);$key=hash('sha256',$bucket);
    query('INSERT INTO cv_limits(bucket,slot,hits) VALUES(?,?,1) ON DUPLICATE KEY UPDATE hits=hits+1',[$key,$slot]);
    $count=(int)query('SELECT hits FROM cv_limits WHERE bucket=? AND slot=?',[$key,$slot])->fetchColumn();
    query('DELETE FROM cv_limits WHERE slot < ?',[$slot-2]);
    if ($count>$max) throw new SiteError(429,'Слишком много попыток. Попробуйте через 15 минут.');
}
function session_begin(): void {
    global $config;if (session_status()===PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime','43200');
    session_name('cv_session');session_set_cookie_params(['lifetime'=>43200,'path'=>'/','secure'=>str_starts_with($config['origin'],'https://'),'httponly'=>true,'samesite'=>'Strict']);session_start();
}
function admin(): ?array {
    session_begin();$a=$_SESSION['admin']??null;
    if (!$a || ($a['expires']??0)<time()) return null;
    $version=query('SELECT version FROM cv_admin WHERE id=1')->fetchColumn();
    return is_string($version)&&hash_equals($version,$a['version'])?$a:null;
}
function csrf(array $a): void { if (!hash_equals($a['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) throw new SiteError(403,'Сессия формы устарела. Обновите страницу.'); }
function state(bool $lock=false): array {
    $row=query('SELECT draft,published,preview FROM cv_state WHERE id=1'.($lock?' FOR UPDATE':''))->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new SiteError(503,'Сначала установите сайт.');
    return ['draft'=>decode($row['draft']),'published'=>decode($row['published']),'preview'=>$row['preview']?decode($row['preview']):null];
}
function transaction(callable $operation): mixed {
    db()->beginTransaction();try{$result=$operation();db()->commit();return $result;}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function send_asset(string $file,bool $private=false): never {
    if (!is_file($file)) throw new SiteError(404,'Не найдено.');
    $mimes=['css'=>'text/css; charset=utf-8','js'=>'text/javascript; charset=utf-8','svg'=>'image/svg+xml','woff2'=>'font/woff2','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp','gif'=>'image/gif','ico'=>'image/x-icon','html'=>'text/html; charset=utf-8'];
    $ext=strtolower(pathinfo($file,PATHINFO_EXTENSION));if(!isset($mimes[$ext]))throw new SiteError(404,'Не найдено.');
    header('Content-Type: '.$mimes[$ext]);header('Cache-Control: '.($private?'no-store':'public, max-age=3600'));header('Content-Length: '.filesize($file));
    if (($_SERVER['REQUEST_METHOD']??'GET')!=='HEAD') readfile($file);exit;
}
function installer(): never {
    global $config;
    if (installed()) throw new SiteError(404,'Сайт уже установлен.');
    session_begin();$_SESSION['install_csrf']??=bin2hex(random_bytes(32));$error='';
    if (($_SERVER['REQUEST_METHOD']??'GET')==='POST') {
        same_origin();
        if (!hash_equals($_SESSION['install_csrf'],$_POST['csrf']??'')) throw new SiteError(403,'Обновите страницу установки.');
        if (!hash_equals($config['setup_key'],$_POST['setup_key']??'')) throw new SiteError(403,'Неверный ключ установки.');
        $user=txt($_POST['username']??'','логин',80,true);$password=$_POST['password']??'';
        if (strlen($password)<12 || strlen($password)>72) $error='Пароль: от 12 до 72 байт.';
        elseif ($password!==($_POST['confirmation']??'')) $error='Пароли не совпадают.';
        else {
            foreach(explode(';',file_get_contents(__DIR__.'/schema.sql')) as $sql)if(trim($sql)!=='')db()->exec($sql);
            transaction(function()use($user,$password){
                $content=validate_content(seed());$content['revision']=1;$content['savedAt']=stamp();$published=$content;$published['publishedAt']=stamp();
                query('INSERT IGNORE INTO cv_state(id,draft,published) VALUES(1,?,?)',[encode($content),encode($published)]);state(true);
                if(query('SELECT id FROM cv_admin WHERE id=1')->fetchColumn())throw new SiteError(409,'Сайт уже установлен.');
                query('INSERT INTO cv_admin(id,username,password_hash,version) VALUES(1,?,?,?)',[$user,password_hash($password,PASSWORD_DEFAULT),bin2hex(random_bytes(32))]);
            });
            $_SESSION=[];session_regenerate_id(true);header('Location: /admin/',true,303);exit;
        }
    }
    header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');header('X-Robots-Tag: noindex, nofollow');
    echo '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Установка сайта</title><link rel="stylesheet" href="/admin/admin.css"></head><body><main class="login-shell"><h1>Установка сайта</h1><p>Создайте администратора. Ключ установки указан в вашем config.php.</p><form class="login-card" method="post"><input type="hidden" name="csrf" value="'.esc($_SESSION['install_csrf']).'"><div class="field"><label for="setup-key">Ключ установки</label><input id="setup-key" name="setup_key" type="password" required autocomplete="off"></div><div class="field"><label for="setup-user">Логин</label><input id="setup-user" name="username" maxlength="80" required autocomplete="username"></div><div class="field"><label for="setup-password">Пароль, 12–72 байта</label><input id="setup-password" name="password" type="password" required autocomplete="new-password"></div><div class="field"><label for="setup-confirmation">Повторите пароль</label><input id="setup-confirmation" name="confirmation" type="password" required autocomplete="new-password"></div><p class="error">'.esc($error).'</p><button class="button primary">Установить</button></form></main></body></html>';exit;
}
header('X-Content-Type-Options: nosniff');header('Referrer-Policy: same-origin');header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https: http: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
try {
    if (PHP_VERSION_ID<80200 || !extension_loaded('pdo_mysql') || !extension_loaded('mbstring') || !extension_loaded('fileinfo')) throw new SiteError(503,'Нужны PHP 8.2+, pdo_mysql, mbstring и fileinfo.');
    if (!is_file(__DIR__.'/config.php')) throw new SiteError(503,'Скопируйте config.example.php в config.php и заполните настройки базы и домена.');
    $config=require __DIR__.'/config.php';
    $origin=$config['origin']??'';$u=parse_url($origin);
    if (!$u || !in_array($u['scheme']??'',['https','http'],true) || empty($u['host']) || isset($u['path']) || isset($u['query']) || isset($u['fragment']) || isset($u['user']) || isset($u['pass']) || str_contains($origin,'YOUR-DOMAIN')) throw new SiteError(503,'Укажите в config.php origin нового сайта без пути и завершающего слеша.');
    if (strlen($config['setup_key']??'')<32 || str_starts_with($config['setup_key'],'REPLACE_')) throw new SiteError(503,'Задайте случайный setup_key длиной не менее 32 символов в config.php.');
    $method=$_SERVER['REQUEST_METHOD']??'GET';$path=rawurldecode(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)??'/');
    if (str_contains($path,"\0") || str_contains($path,'\\') || preg_match('~(?:^|/)\.\.(?:/|$)~',$path)) throw new SiteError(400,'Некорректный URL.');
    if (in_array($method,['GET','HEAD'],true)) {
        if(in_array($path,['/style.css','/app.js','/admin/admin.css','/admin/admin.js'],true))send_asset(PUBLIC_DIR.$path,true);
        if(preg_match('~^/assets/[a-zA-Z0-9/_ .-]+$~D',$path)&&!str_contains($path,'..'))send_asset(PUBLIC_DIR.$path);
    }
    if ($path==='/install.php' && in_array($method,['GET','POST'],true)) installer();
    if (!installed()) throw new SiteError(503,'Откройте /install.php и создайте администратора.');
    if ($path==='/healthz' && in_array($method,['GET','HEAD'],true)) respond(200,['ok'=>true]);
    if ($path==='/api/contact' && $method==='POST') {
        same_origin();limit_attempts('contact-global',60);limit_attempts('contact-ip:'.($_SERVER['REMOTE_ADDR']??''),10);$input=payload(32768);
        if (!empty($input['website'])) respond(201,['ok'=>true]);
        $name=txt($input['name']??null,'имя',100,true);$contact=txt($input['contact']??null,'контакт',200,true);$message=txt($input['message']??null,'обращение',5000,true);
        if ((int)query('SELECT COUNT(*) FROM cv_messages')->fetchColumn()>=10000) throw new SiteError(503,'Попробуйте позже.');
        query('INSERT INTO cv_messages(id,created_at,name,contact,message) VALUES(?,?,?,?,?)',[bin2hex(random_bytes(16)),stamp(),$name,$contact,$message]);respond(201,['ok'=>true]);
    }
    if (str_starts_with($path,'/api/admin/')) {
        $mutation=!in_array($method,['GET','HEAD'],true);if($mutation)same_origin();
        if($path==='/api/admin/login' && $method==='POST') {
            limit_attempts('login-ip:'.($_SERVER['REMOTE_ADDR']??''),8);limit_attempts('login-global',100);$input=payload(8192);
            $a=query('SELECT * FROM cv_admin WHERE id=1')->fetch(PDO::FETCH_ASSOC);
            $username=$input['username']??null;$password=$input['password']??null;
            if(!is_string($username)||!is_string($password)||strlen($password)>72||!password_verify($password,$a['password_hash'])||!hash_equals($a['username'],$username))throw new SiteError(401,'Неверный логин или пароль.');
            session_begin();session_regenerate_id(true);$_SESSION=['admin'=>['username'=>$a['username'],'version'=>$a['version'],'csrf'=>bin2hex(random_bytes(32)),'expires'=>time()+43200]];
            respond(200,['username'=>$a['username'],'csrf'=>$_SESSION['admin']['csrf']]);
        }
        $a=admin();
        if($path==='/api/admin/session' && $method==='GET')respond($a?200:401,$a?['username'=>$a['username'],'csrf'=>$a['csrf']]:['configured'=>true,'error'=>'Войдите в админку.']);
        if(!$a)throw new SiteError(401,'Войдите в админку.');if($mutation)csrf($a);
        if($path==='/api/admin/logout' && $method==='POST') {$_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>time()-3600,'path'=>'/','secure'=>str_starts_with($origin,'https://'),'httponly'=>true,'samesite'=>'Strict']);respond(200,['ok'=>true]);}
        if($path==='/api/admin/messages' && $method==='GET') {
            $messages=query('SELECT id,created_at AS createdAt,name,contact,message FROM cv_messages ORDER BY created_at DESC,id DESC')->fetchAll(PDO::FETCH_ASSOC);respond(200,['messages'=>$messages]);
        }
        if($path==='/api/admin/content' && $method==='GET') {$s=state();respond(200,['content'=>$s['draft'],'publishedAt'=>$s['published']['publishedAt'],'publishedRevision'=>$s['published']['revision']]);}
        if($path==='/api/admin/content' && $method==='PUT') {
            $input=payload();$clean=validate_content($input['content']??null);
            $result=transaction(function()use($input,$clean){
                $s=state(true);$old=$s['draft'];
                if(!is_int($input['revision']??null)||$input['revision']!==$old['revision'])throw new SiteError(409,'Контент изменён в другой вкладке. Обновите данные перед сохранением.');
                query('INSERT INTO cv_backups(revision,content) VALUES(?,?)',[$old['revision'],encode($old)]);
                $next=$clean;$next['revision']=$old['revision']+1;$next['savedAt']=stamp();query('UPDATE cv_state SET draft=? WHERE id=1',[encode($next)]);
                query('DELETE FROM cv_backups WHERE revision < ?', [max(0,$old['revision']-19)]);
                return ['content'=>$next,'publishedAt'=>$s['published']['publishedAt'],'publishedRevision'=>$s['published']['revision']];
            });respond(200,$result);
        }
        if(in_array($path,['/api/admin/publish','/api/admin/preview'],true) && $method==='POST') {
            $input=payload();$preview=$path==='/api/admin/preview';
            $result=transaction(function()use($input,$preview){
                $s=state(true);$draft=$s['draft'];
                if(!is_int($input['revision']??null)||$input['revision']!==$draft['revision'])throw new SiteError(409,'Сначала сохраните актуальную версию.');
                if($preview){query('UPDATE cv_state SET preview=? WHERE id=1',[encode($draft)]);return ['url'=>'/admin/preview/'];}
                $draft['publishedAt']=stamp();query('UPDATE cv_state SET published=? WHERE id=1',[encode($draft)]);return ['publishedAt'=>$draft['publishedAt'],'publishedRevision'=>$draft['revision']];
            });respond(200,$result);
        }
        if($path==='/api/admin/uploads' && $method==='POST') {
            $bytes=file_get_contents('php://input',false,null,0,8388609);if(strlen($bytes)>8388608)throw new SiteError(413,'Максимальный размер — 8 МБ.');
            $info=@getimagesizefromstring($bytes);$type=(new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);$types=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp','image/gif'=>'gif'];
            if(!$info||!isset($types[$type])||($info['mime']??'')!==$type)throw new SiteError(415,'Загрузите JPEG, PNG, WebP или GIF.');
            if($info[0]>16000 || $info[1]>16000)throw new SiteError(415,'Изображение слишком большое по размерам.');
            $dir=__DIR__.'/uploads';if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('Upload directory unavailable');
            $name=bin2hex(random_bytes(18)).'.'.$types[$type];$file=$dir.'/'.$name;
            if(file_put_contents($file,$bytes,LOCK_EX)!==strlen($bytes))throw new RuntimeException('Upload failed');chmod($file,0600);respond(201,['url'=>'/uploads/'.$name]);
        }
        throw new SiteError(404,'Не найдено.');
    }
    if(!in_array($method,['GET','HEAD'],true))throw new SiteError(405,'Метод не поддерживается.');
    if(preg_match('~^/uploads/([a-f0-9]{36}\.(?:png|jpg|webp|gif))$~D',$path,$m))send_asset(__DIR__.'/uploads/'.$m[1]);
    if($path==='/admin') {header('Location: /admin/',true,302);exit;}
    if(in_array($path,['/admin/','/admin/index.html'],true)) {
        header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');header('X-Robots-Tag: noindex, nofollow');
        $html=file_get_contents(PUBLIC_DIR.'/admin/index.html');
        foreach(['admin.css','admin.js'] as $asset)$html=str_replace('/admin/'.$asset,'/admin/'.$asset.'?v='.substr(hash_file('sha256',PUBLIC_DIR.'/admin/'.$asset),0,12),$html);
        echo $html;exit;
    }
    $preview=str_starts_with($path,'/admin/preview/');
    if($preview){if(!admin())throw new SiteError(401,'Войдите в админку.');$path='/'.substr($path,strlen('/admin/preview/'));header('X-Robots-Tag: noindex, nofollow');}
    $s=state();$content=$preview?$s['preview']:$s['published'];if(!$content)throw new SiteError(404,'Сначала создайте предпросмотр.');
    $kind='404';$item=null;
    if(in_array($path,['/','/index.html'],true))$kind='home';
    elseif(preg_match('~^/(journal|work)/(?:index\.html)?$~D',$path,$m))$kind=$m[1];
    elseif(preg_match('~^/(journal|work)/([a-z0-9]+(?:-[a-z0-9]+)*)/(?:index\.html)?$~D',$path,$m)) {
        foreach($content[$m[1]==='journal'?'articles':'cases'] as $entry)if($entry['slug']===$m[2]&&$entry['published']){$kind=$m[1]==='journal'?'article':'case';$item=$entry;break;}
    }
    header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');http_response_code($kind==='404'?404:200);
    if($method!=='HEAD')echo render_page($content,$kind,$item,$preview);
} catch(Throwable $e) {
    $status=$e instanceof SiteError?$e->status:500;
    if($status===429)header('Retry-After: 900');
    if($status===500)error_log('Marketing CV: '.get_class($e).' / '.($e instanceof PDOException?$e->getCode():'operation failed'));
    respond($status,['error'=>$status===500?'Не удалось выполнить операцию. Проверьте настройки базы или повторите позже.':$e->getMessage()]);
}
