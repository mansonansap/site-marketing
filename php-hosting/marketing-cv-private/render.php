<?php
declare(strict_types=1);
function esc(mixed $v): string { return htmlspecialchars((string)($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function render_page(array $content, string $kind, ?array $item = null, bool $preview = false): string {
    global $config;
    $p = $content['profile'];
    $articles = array_values(array_filter($content['articles'],fn($a)=>$a['published'] !== false));
    $cases = array_values(array_filter($content['cases'],fn($c)=>$c['published'] !== false));
    $dict = [];
    foreach (LANGS as $lang) $dict[$lang] = array_map('esc',array_merge($content['copy'][$lang],$content['cvCopy'][$lang]));
    $form = [
        'ru'=>['Связаться','Имя','Как с вами связаться','Обращение','Отправить','Сообщение отправлено. Спасибо!','Не удалось отправить. Попробуйте позже.','Отправляем…','Оставьте обращение — я свяжусь с вами.'],
        'en'=>['Contact me','Name','How can I reach you?','Message','Send message','Message sent. Thank you!','Could not send. Please try later.','Sending…','Leave a message and I will get back to you.'],
        'uk'=>['Зв’язатися','Ім’я','Як із вами зв’язатися','Звернення','Надіслати','Повідомлення надіслано. Дякую!','Не вдалося надіслати. Спробуйте пізніше.','Надсилаємо…','Залиште звернення — я зв’яжуся з вами.'],
        'es'=>['Contactar','Nombre','¿Cómo puedo contactarte?','Mensaje','Enviar','Mensaje enviado. ¡Gracias!','No se pudo enviar. Inténtalo más tarde.','Enviando…','Deja un mensaje y me pondré en contacto contigo.']
    ];
    foreach (LANGS as $lang) foreach (['contactMe','formName','formContact','formMessage','formSend','formSuccess','formError','formSending','formIntro'] as $i=>$key) $dict[$lang][$key] = esc($form[$lang][$i]);
    $t = function(string $key,string $tag='span',string $class='') use (&$dict): string { return '<'.$tag.($class?' class="'.$class.'"':'').' data-i18n="'.$key.'">'.($dict['ru'][$key] ?? '').'</'.$tag.'>'; };
    $sequence = 0;
    $local = function(array $values,string $tag='span',string $class='') use (&$sequence,&$dict,$t): string {
        $key = 'local_'.(++$sequence); foreach (LANGS as $lang) $dict[$lang][$key] = esc($values[$lang] ?? $values['ru'] ?? ''); return $t($key,$tag,$class);
    };
    $icons = json_decode(file_get_contents(__DIR__.'/icons.json'),true,512,JSON_THROW_ON_ERROR);
    $icon = fn(string $key,string $class='')=>'<span class="icon '.$class.'" aria-hidden="true">'.($icons[$key] ?? $icons['document']).'</span>';
    $link = fn(string $url,string $key,string $class='text-link')=>'<a class="'.$class.'" href="'.$url.'">'.$t($key).$icon('arrow').'</a>';
    $category = fn(array $a)=>['commerce'=>'E-commerce','gaming'=>'Online gaming','strategy'=>'Strategy'][$a['category']] ?? esc($a['category']);
    $row = function(array $a,string $heading='h3') use ($icon,$t,$local,$category): string {
        $art = $a['category']==='commerce'?'growth':($a['category']==='gaming'?'gaming':'seo');
        $cover = $a['cover'] ? '<img class="article-thumbnail" src="'.esc($a['cover']).'" alt="" loading="lazy">' : $icon($art,'article-icon');
        return '<article class="article-row" data-category="'.esc($a['category']).'"><a class="article-link" href="/journal/'.$a['slug'].'/">'.$cover.'<div class="article-summary"><div class="article-meta"><span>'.$category($a).'</span><span>'.$a['minutes'].' '.$t('minutes').'</span>'.($a['demo']?$t('articleDemo'):'').'</div>'.$local($a['title'],$heading).$local($a['lead'],'p').'</div>'.$icon('arrow','row-arrow').'</a></article>';
    };
    $nav = '<a href="/#experience">'.$t('navExperience').'</a><a href="/journal/"'.(in_array($kind,['journal','article'],true)?' aria-current="page"':'').'>'.$t('navJournal').'</a><a href="/#contact">'.$t('talk').'</a>';
    $initial = esc(mb_substr($p['name'],0,1));
    $header = '<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="'.esc($p['name']).' — Home"><span class="brand-mark">'.$initial.'<i></i></span><span>'.esc($p['name']).'<small>Growth Marketing</small></span></a><nav class="desktop-nav" aria-label="Main">'.$nav.'</nav><div class="header-tools"><select id="language" aria-label="Language"><option value="ru">RU</option><option value="en">EN</option><option value="uk">UA</option><option value="es">ES</option></select><button class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span></button></div></div><nav class="mobile-menu container" id="mobile-menu" aria-label="Mobile" hidden>'.$nav.'</nav></header>';
    $social = '';
    foreach ($p['links'] as $l) $social .= '<a href="'.esc($l['url']).'" target="_blank" rel="noopener noreferrer">'.esc($l['label']).$icon('arrow').'</a>';
    $contact = '<section class="contact-card" id="contact"><div>'.$t('contactMe','h2').$t('formIntro','p').'</div><form id="contact-form" class="contact-form"><div class="contact-fields"><label>'.$t('formName').'<input name="name" autocomplete="name" maxlength="100" required></label><label>'.$t('formContact').'<input name="contact" autocomplete="off" maxlength="200" required></label></div><label>'.$t('formMessage').'<textarea name="message" rows="4" maxlength="5000" required></textarea></label><label class="form-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><div class="form-submit"><button class="button button-dark" type="submit">'.$t('formSend').'</button><p id="contact-status" role="status" aria-live="polite"></p></div></form>'.($social?'<div class="social-links">'.$social.'</div>':'').'</section>';
    $domain = esc(parse_url($config['origin'],PHP_URL_HOST));
    $footer = '<footer class="site-footer container"><span>© 2023–<span data-year>'.date('Y').'</span> '.$domain.'</span><span>E-commerce · Online gaming</span><a href="#top">'.$t('toTop').' ↑</a></footer>';
    $body = '';
    if ($kind === 'home') {
        $image = $p['photo'] ? '<img src="'.esc($p['photo']).'" alt="'.($dict['ru']['photoAlt'] ?? '').'" data-photo class="portrait-image" fetchpriority="high">' : '<div class="portrait-placeholder">'.$icon('portrait').'<span>'.$t('photoLabel').'</span></div>';
        $body = '<section class="profile-section" id="about"><div class="profile-copy"><div class="eyebrow"><span class="status-dot"></span>'.$t('cvLabel').'</div><h1>'.esc($p['name']).'</h1>'.$t('profileTitle','p','profile-role').$t('profileSubtitle','p','profile-subtitle').$t('profileIntro','p','profile-intro').$t('profileDetail','p','profile-detail').'<div class="profile-actions"><a class="button button-dark" href="#contact">'.$icon('mail').$t('contactMe').'</a><a class="button button-light" href="#experience">'.$t('explore').$icon('arrow').'</a></div></div><div class="portrait-wrap"><div class="portrait-card">'.$image.'<div class="portrait-bottom"><span>'.esc($p['name']).'</span><span>Marketing</span></div></div><div class="experience-badge"><strong>'.esc($p['yearsExperience']).'</strong>'.$t('yearsLabel').'<span class="badge-chart">'.$icons['growth'].'</span></div></div></section>';
        $body .= '<section class="tool-section"><div class="tool-heading">'.$t('contextLabel','h2','eyebrow').$t('contextNote').'</div><div class="tool-list">';
        foreach ([['growth','growthLabel','growth'],['seo','seoLabel','seo'],['facebook','Meta Ads','meta'],['instagram','Instagram','instagram'],['analytics','analyticsLabel','analytics'],['ads','Google Ads','ads']] as [$symbol,$key,$class]) $body .= '<div class="tool tool-'.$class.'">'.$icon($symbol).(isset($dict['ru'][$key])?$t($key):'<span>'.$key.'</span>').'</div>';
        $body .= '</div></section><section class="experience-section" id="experience"><div class="section-heading"><div>'.$t('experienceLabel','h2').$t('experienceNote','p').'</div>'.$link('/work/','projectsLink').'</div><div class="experience-grid">';
        foreach ($content['experience'] as $e) {
            $key = 'local_'.(++$sequence);
            foreach (LANGS as $lang) $dict[$lang][$key] = implode('',array_map(fn($s)=>'<li>'.esc($s).'</li>',$e['bullets'][$lang] ?: $e['bullets']['ru']));
            $company = implode('',array_values($e['company'])).implode('',array_values($e['period'])) !== '';
            $body .= '<article class="experience-card"><div class="experience-top">'.$icon($e['icon'],'experience-icon').'<div>'.$local($e['title'],'h3').$local($e['subtitle'],'p').'</div></div>'.($company?'<div class="experience-company">'.$local($e['company']).$local($e['period']).'</div>':'').$local($e['description'],'p','experience-intro').$t($key,'ul');
            foreach ($articles as $a) if ($a['slug'] === $e['articleSlug']) $body .= '<a class="experience-article" href="/journal/'.$a['slug'].'/">'.$icon('document').$t('relatedArticle').$icon('arrow').'</a>';
            $body .= '</article>';
        }
        $body .= '</div></section><section class="home-articles"><div class="section-heading"><div>'.$t('articlesLabel','h2').$t('articlesNote','p').'</div>'.$link('/journal/','allArticles').'</div><div class="article-list">';
        foreach (array_slice($articles,0,3) as $a) $body .= $row($a);
        $body .= '</div></section>';
    } elseif ($kind === 'journal' || $kind === 'work') {
        $isJournal = $kind === 'journal';
        $body = '<section class="page-heading"><a class="back-link" href="/">← '.$t('home').'</a>'.$t($isJournal?'journalPageTitle':'workPageTitle','h1').$t($isJournal?'journalPageNote':'workPageNote','p');
        if ($isJournal) {
            $body .= '<div class="filter-bar" aria-label="Article categories">';
            foreach (['all'=>'filterAll','strategy'=>'filterStrategy','commerce'=>'filterCommerce','gaming'=>'filterGaming'] as $filter=>$key) $body .= '<button class="filter-button'.($filter==='all'?' active':'').'" data-filter="'.$filter.'" aria-pressed="'.($filter==='all'?'true':'false').'">'.$t($key).'</button>';
            $body .= '<span class="filter-count" aria-live="polite">'.count($articles).'</span></div></section><section class="journal-index"><div class="article-list">';
            foreach ($articles as $a) $body .= $row($a,'h2');
            $body .= '</div><p class="empty-message" hidden>'.$t('empty').'</p></section>';
        } else {
            $body .= '</section><section class="case-list">';
            foreach ($cases as $c) $body .= '<a class="case-row" href="/work/'.$c['slug'].'/">'.$icon($c['art']==='gaming'?'gaming':'commerce','case-icon').'<div><div class="article-meta"><span>'.esc($c['category']).'</span>'.($c['demo']?$t('caseStatus'):'').'</div>'.$local($c['title'],'h2').$local($c['lead'],'p').'</div>'.$icon('arrow','row-arrow').'</a>';
            $body .= '</section>';
        }
    } elseif ($item !== null) {
        $isArticle = $kind === 'article'; $base = $isArticle?'journal':'work'; $back = $isArticle?'backJournal':'backWork';
        $body = '<article class="reading-page"><header class="reading-header"><a class="back-link" href="/'.$base.'/">← '.$t($back).'</a><div class="article-meta"><span>'.$category($item).'</span>'.($isArticle?'<span>'.$item['minutes'].' '.$t('minutes').'</span>':'').($item['demo']?$t($isArticle?'articleDemo':'caseStatus'):'').($isArticle && $item['date']?'<time datetime="'.$item['date'].'">'.$item['date'].'</time>':'').'</div>'.$local($item['title'],'h1').$local($item['lead'],'p','reading-lead');
        if ($isArticle) $body .= '<div class="article-author"><span class="author-avatar">'.$initial.'</span><span>'.esc($p['name']).'<small>'.$t('profileTitle').'</small></span></div>';
        $body .= '</header>'.($item['cover']?'<img class="reading-cover" src="'.esc($item['cover']).'" alt="">':'').'<div class="prose">'.($item['demo']?'<p class="content-notice">'.$t($isArticle?'articleNotice':'caseNotice').'</p>':'');
        if ($isArticle) {
            // Each language may have a different number of article sections.
            $key = 'local_'.(++$sequence);
            foreach (LANGS as $lang) {
                $dict[$lang][$key] = '';
                foreach (($item['body'][$lang] ?: $item['body']['ru']) as [$heading,$paragraph]) $dict[$lang][$key] .= '<section class="prose-section"><h2>'.esc($heading).'</h2><p>'.esc($paragraph).'</p></section>';
            }
            $body .= $t($key,'div');
        } else foreach (['context'=>'caseContext','approach'=>'caseApproach','result'=>'caseResult'] as $field=>$heading) $body .= '<section class="prose-section'.($field==='result'?' result-placeholder':'').'">'.$t($heading,'h2').$local($item[$field],'p').'</section>';
        $body .= '<a class="text-link" href="/'.$base.'/">← '.$t($back).'</a></div></article>';
        if ($isArticle) {
            $body .= '<section class="related-articles"><div class="section-heading">'.$t('nextArticle','h2').$link('/journal/','allArticles').'</div><div class="article-list">';
            foreach (array_slice(array_values(array_filter($articles,fn($a)=>$a['slug']!==$item['slug'])),0,2) as $a) $body .= $row($a);
            $body .= '</div></section>';
        }
    } else $body = '<section class="page-heading error-page"><span class="eyebrow">404</span>'.$t('notFound','h1').$link('/','backHome','button button-dark').'</section>';
    $titles = []; $descriptions = [];
    foreach (LANGS as $lang) {
        $title = $item ? $item['title'][$lang] : ($kind==='journal'?$content['cvCopy'][$lang]['journalPageTitle']:($kind==='work'?$content['cvCopy'][$lang]['workPageTitle']:$content['cvCopy'][$lang]['profileTitle']));
        $titles[$lang] = $title.' — '.$p['name'];
        $descriptions[$lang] = $item ? $item['lead'][$lang] : str_replace('Example',$p['name'],$content['cvCopy'][$lang]['metaDescription']);
    }
    $data = json_encode(['translations'=>$dict,'titles'=>$titles,'descriptions'=>$descriptions],JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    $css = substr(hash_file('sha256',PUBLIC_DIR.'/style.css'),0,12); $js = substr(hash_file('sha256',PUBLIC_DIR.'/app.js'),0,12);
    $html = '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f7f5"><meta name="description" content="'.esc($descriptions['ru']).'"><title>'.esc($titles['ru']).'</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css?v='.$css.'"><script src="/app.js?v='.$js.'" defer></script></head><body class="page-'.$kind.'" id="top">'.$header.'<main class="container" id="main">'.$body.$contact.'</main>'.$footer.'<script type="application/json" id="page-data">'.$data.'</script></body></html>';
    if ($preview) $html = preg_replace('~(<a\b[^>]*\bhref=")/(?!/)~','$1/admin/preview/',$html);
    return $html;
}
