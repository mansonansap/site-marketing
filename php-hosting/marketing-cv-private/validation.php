<?php
declare(strict_types=1);
const LANGS = ['ru', 'en', 'uk', 'es'];
function fail_input(string $message): never { throw new SiteError(400, $message); }
function obj(mixed $v, string $label): array {
    if (!is_array($v) || ($v !== [] && array_is_list($v))) fail_input('Некорректное поле: '.$label);
    return $v;
}
function txt(mixed $v, string $label, int $max = 4000, bool $required = false): string {
    if (!is_string($v) || mb_strlen($v) > $max || ($required && trim($v) === '')) fail_input('Проверьте поле «'.$label.'».');
    return trim($v);
}
function items(mixed $v, string $label, int $max): array {
    if (!is_array($v) || !array_is_list($v) || count($v) > $max) fail_input('Проверьте список «'.$label.'».');
    return $v;
}
function media(mixed $v): string {
    $v = txt($v ?? '', 'изображение', 2000);
    if ($v === '') return '';
    if (preg_match('~^/(uploads|assets)/[a-zA-Z0-9/_ .-]+$~D', $v) && !str_contains($v, '..') && !str_contains($v, '//')) return $v;
    return web_url($v);
}
function web_url(mixed $value): string {
    $v = txt($value, 'URL', 2000, true); $u = parse_url($v);
    if (!$u || !in_array(strtolower($u['scheme'] ?? ''), ['http', 'https'], true) || empty($u['host']) || isset($u['user']) || isset($u['pass']) || preg_match('/[\x00-\x20]/', $v)) fail_input('Нужна корректная ссылка https://…');
    return $v;
}
function tr(mixed $value, string $label, int $max = 4000, bool $required = false): array {
    $v = obj($value, $label); $ru = txt($v['ru'] ?? null, $label.' / RU', $max, $required); $out = [];
    foreach (LANGS as $lang) $out[$lang] = $lang === 'ru' ? $ru : (txt($v[$lang] ?? '', $label.' / '.$lang, $max) ?: $ru);
    return $out;
}
function slug(mixed $v, bool $empty = false): string {
    $v = txt($v, 'URL', 100, !$empty);
    if (($v !== '' || !$empty) && !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $v)) fail_input('В URL нужны маленькие латинские буквы, цифры и дефисы.');
    return $v;
}
function validate_content(mixed $input): array {
    $v = obj($input, 'контент'); $p = obj($v['profile'] ?? null, 'профиль');
    $years = $p['yearsExperience'] ?? null;
    if (!is_int($years) || $years < 0 || $years > 80) fail_input('Стаж: целое число от 0 до 80.');
    $out = ['profile' => ['name' => txt($p['name'] ?? null, 'имя', 100, true), 'yearsExperience' => $years, 'photo' => media($p['photo'] ?? ''), 'links' => []], 'copy'=>[], 'cvCopy'=>[], 'experience'=>[], 'articles'=>[], 'cases'=>[]];
    // Kept only for importing legacy backups. Never rendered or used for sending.
    $out['profile']['email'] = txt($p['email'] ?? '', 'email', 254);
    foreach (items($p['links'] ?? null, 'ссылки', 20) as $link) {
        $link = obj($link, 'ссылка'); $out['profile']['links'][] = ['label'=>txt($link['label'] ?? null, 'название ссылки', 80, true), 'url'=>web_url($link['url'] ?? null)];
    }
    $defaults = seed();
    foreach (['copy','cvCopy'] as $group) {
        $source = obj($v[$group] ?? null, $group);
        foreach (LANGS as $lang) {
            $values = obj($source[$lang] ?? null, $lang);
            foreach ($defaults[$group][$lang] as $key => $_) $out[$group][$lang][$key] = txt($values[$key] ?? null, $key, 8000);
        }
    }
    foreach (items($v['experience'] ?? null, 'опыт', 30) as $i => $e) {
        $e = obj($e, 'опыт');
        if (!in_array($e['icon'] ?? '', ['commerce','gaming','growth','analytics','seo'], true)) fail_input('Выберите значок опыта.');
        $r = ['id'=>txt($e['id'] ?? (string)$i, 'ID', 100, true), 'icon'=>$e['icon'], 'articleSlug'=>slug($e['articleSlug'] ?? '', true)];
        foreach (['title'=>[200,true],'subtitle'=>[300,false],'description'=>[5000,false],'company'=>[200,false],'period'=>[200,false]] as $key => [$max,$required]) $r[$key] = tr($e[$key] ?? null, $key, $max, $required);
        $bullets = obj($e['bullets'] ?? null, 'пункты опыта');
        foreach (LANGS as $lang) $r['bullets'][$lang] = array_map(fn($s)=>txt($s,'пункт опыта',1000),items($bullets[$lang] ?? [],'пункты опыта',15));
        foreach (LANGS as $lang) if (!$r['bullets'][$lang]) $r['bullets'][$lang] = $r['bullets']['ru'];
        $out['experience'][] = $r;
    }
    foreach (['articles','cases'] as $group) {
        $seen = [];
        foreach (items($v[$group] ?? null, $group, 100) as $i => $e) {
            $e = obj($e, $group); $key = slug($e['slug'] ?? null);
            if (isset($seen[$key])) fail_input('URL материалов должны быть уникальными.'); $seen[$key] = true;
            if (!is_bool($e['published'] ?? null) || !is_bool($e['demo'] ?? null)) fail_input('Проверьте статус материала.');
            $r = ['slug'=>$key,'number'=>str_pad((string)($i+1),2,'0',STR_PAD_LEFT),'published'=>$e['published'],'demo'=>$e['demo'],'cover'=>media($e['cover'] ?? ''),'title'=>tr($e['title'] ?? null,'заголовок',300,true),'lead'=>tr($e['lead'] ?? null,'описание',2000)];
            if ($group === 'articles') {
                if (!in_array($e['category'] ?? '',['strategy','commerce','gaming'],true)) fail_input('Выберите категорию.');
                if (!is_int($e['minutes'] ?? null) || $e['minutes'] < 1 || $e['minutes'] > 120) fail_input('Время чтения: 1–120 минут.');
                $date = txt($e['date'] ?? '', 'дата', 10);
                if ($date !== '' && (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$date,$m) || !checkdate((int)$m[2],(int)$m[3],(int)$m[1]))) fail_input('Некорректная дата.');
                $r += ['category'=>$e['category'],'minutes'=>$e['minutes'],'date'=>$date,'art'=>['strategy'=>'direction','commerce'=>'funnel','gaming'=>'signal'][$e['category']]];
                $body = obj($e['body'] ?? null, 'текст статьи');
                foreach (LANGS as $lang) {
                    $r['body'][$lang] = [];
                    foreach (items($body[$lang] ?? [],'разделы статьи',80) as $pair) {
                        if (!is_array($pair) || !array_is_list($pair) || count($pair) !== 2) fail_input('Раздел: заголовок и текст.');
                        $r['body'][$lang][] = [txt($pair[0],'заголовок раздела',300),txt($pair[1],'текст раздела',30000)];
                    }
                }
                if ($r['published'] && !array_filter($r['body']['ru'],fn($pair)=>$pair[1] !== '')) fail_input('Добавьте текст статьи на RU.');
                foreach (LANGS as $lang) if (!array_filter($r['body'][$lang],fn($pair)=>$pair[1] !== '')) $r['body'][$lang] = $r['body']['ru'];
            } else {
                $r['category'] = txt($e['category'] ?? null,'категория',100,true);
                $r['art'] = stripos($r['category'],'gaming') !== false ? 'gaming' : 'commerce';
                foreach (['context','approach','result'] as $field) $r[$field] = tr($e[$field] ?? null,$field,30000,$r['published']);
            }
            $out[$group][] = $r;
        }
    }
    return $out;
}
