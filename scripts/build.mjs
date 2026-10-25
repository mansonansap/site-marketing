import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { profile, copy, articles, cases } from '../site-data.mjs';
import { cvCopy } from '../cv-copy.mjs';
import { icons } from './icons.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const languages = Object.keys(copy);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = value => String(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const sentence = value => { const text=plain(value); return text === text.toLocaleUpperCase() ? text.charAt(0)+text.slice(1).toLocaleLowerCase() : text; };
const external = value => {try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
function createPage(kind,item,content){
  const {profile,copy,cvCopy,articles,cases}=content;
  const dict=Object.fromEntries(languages.map(lang=>[lang,Object.fromEntries(Object.entries({...copy[lang],...cvCopy[lang]}).map(([key,value])=>[key,esc(value)]))]));
  const used=new Set();let sequence=0;
  const t=(key,tag='span',cls='')=>{used.add(key);return `<${tag}${cls?` class="${cls}"`:''} data-i18n="${key}">${dict.ru[key]}</${tag}>`;};
  const local=(values,tag='span',cls='',makeSentence=false)=>{
    const key='local_'+(++sequence);
    for(const lang of languages)dict[lang][key]=esc(makeSentence?sentence(values[lang]??values.ru):String(values[lang]??values.ru));
    return t(key,tag,cls);
  };
  const symbol=(type,cls='')=>`<span class="icon ${cls}" aria-hidden="true">${icons[type]||icons.document}</span>`;
  const mail='#contact';
  const link=(url,key,cls='text-link')=>`<a class="${cls}" href="${url}">${t(key)}${symbol('arrow')}</a>`;
  const articleIcon=a=>a.category==='commerce'?'growth':a.category==='gaming'?'gaming':'seo';
  const category=a=>a.category==='commerce'?'E-commerce':a.category==='gaming'?'Online gaming':'Strategy';
  const articleRow=(a,heading='h3')=>`<article class="article-row" data-category="${a.category}"><a class="article-link" href="/journal/${a.slug}/">${a.cover?`<img class="article-thumbnail" src="${esc(a.cover)}" alt="" loading="lazy">`:symbol(articleIcon(a),'article-icon')}<div class="article-summary"><div class="article-meta"><span>${category(a)}</span><span>${a.minutes} ${t('minutes')}</span>${a.demo!==false?t('articleDemo'):''}</div>${local(a.title,heading,'',true)}${local(a.lead,'p')}</div>${symbol('arrow','row-arrow')}</a></article>`;
  const caseRow=c=>`<a class="case-row" href="/work/${c.slug}/">${symbol(c.art==='gaming'?'gaming':'commerce','case-icon')}<div><div class="article-meta"><span>${esc(c.category)}</span>${c.demo!==false?t('caseStatus'):''}</div>${local(c.title,'h2','',true)}${local(c.lead,'p')}</div>${symbol('arrow','row-arrow')}</a>`;

  const experienceCards=()=> (content.experience||[]).map(e=>{
    const article=articles.find(a=>a.slug===e.articleSlug);
    const companyLine=languages.some(lang=>e.company?.[lang]||e.period?.[lang]);
    const rowsKey='local_'+(++sequence);
    for(const lang of languages)dict[lang][rowsKey]=(e.bullets[lang]||[]).map(text=>`<li>${esc(text)}</li>`).join('');
    return `<article class="experience-card"><div class="experience-top">${symbol(e.icon,'experience-icon')}<div>${local(e.title,'h3')}${local(e.subtitle,'p')}</div></div>${companyLine?`<div class="experience-company">${local(e.company)}${local(e.period)}</div>`:''}${local(e.description,'p','experience-intro')}${t(rowsKey,'ul')}${article?`<a class="experience-article" href="/journal/${article.slug}/">${symbol('document')}${t('relatedArticle')}${symbol('arrow')}</a>`:''}</article>`;
  }).join('');
  const nav=`<a href="/#experience">${t('navExperience')}</a><a href="/journal/"${['journal','article'].includes(kind)?' aria-current="page"':''}>${t('navJournal')}</a><a href="/#contact">${t('talk')}</a>`;
  const header=`<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="${esc(profile.name)} — Home"><span class="brand-mark">${esc(profile.name.charAt(0))}<i></i></span><span>${esc(profile.name)}<small>Growth Marketing</small></span></a><nav class="desktop-nav" aria-label="Main">${nav}</nav><div class="header-tools"><select id="language" aria-label="Language"><option value="ru">RU</option><option value="en">EN</option><option value="uk">UA</option><option value="es">ES</option></select><button class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span></button></div></div><nav class="mobile-menu container" id="mobile-menu" aria-label="Mobile" hidden>${nav}</nav></header>`;
  const social=profile.links.filter(l=>external(l.url)).map(l=>`<a href="${esc(external(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${symbol('arrow')}</a>`).join('');
  const formCopy={ru:['Связаться','Имя','Как с вами связаться','Обращение','Отправить','Сообщение отправлено. Спасибо!','Не удалось отправить. Попробуйте позже.','Отправляем…','Оставьте обращение — я свяжусь с вами.'],en:['Contact me','Name','How can I reach you?','Message','Send message','Message sent. Thank you!','Could not send. Please try later.','Sending…','Leave a message and I will get back to you.'],uk:["Зв’язатися","Ім’я","Як із вами зв’язатися","Звернення","Надіслати","Повідомлення надіслано. Дякую!","Не вдалося надіслати. Спробуйте пізніше.","Надсилаємо…","Залиште звернення — я зв’яжуся з вами."],es:['Contactar','Nombre','¿Cómo puedo contactarte?','Mensaje','Enviar','Mensaje enviado. ¡Gracias!','No se pudo enviar. Inténtalo más tarde.','Enviando…','Deja un mensaje y me pondré en contacto contigo.']};
  for(const lang of languages){const values=formCopy[lang];['contactMe','formName','formContact','formMessage','formSend','formSuccess','formError','formSending','formIntro'].forEach((key,i)=>dict[lang][key]=esc(values[i]));}
  ['formSuccess','formError','formSending'].forEach(key=>used.add(key));
  const contact=`<section class="contact-card" id="contact"><div>${t('contactMe','h2')}${t('formIntro','p')}</div><form id="contact-form" class="contact-form"><div class="contact-fields"><label>${t('formName')}<input name="name" autocomplete="name" maxlength="100" required></label><label>${t('formContact')}<input name="contact" autocomplete="off" maxlength="200" required></label></div><label>${t('formMessage')}<textarea name="message" rows="4" maxlength="5000" required></textarea></label><label class="form-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><div class="form-submit"><button class="button button-dark" type="submit">${t('formSend')}</button><p id="contact-status" role="status" aria-live="polite"></p></div></form>${social?`<div class="social-links">${social}</div>`:''}</section>`;
  const footer=`<footer class="site-footer container"><span>© 2023–<span data-year>${new Date().getFullYear()}</span> andrewshmarketing.ink</span><span>E-commerce · Online gaming</span><a href="#top">${t('toTop')} ↑</a></footer>`;
  let body='';
  if(kind==='home'){
    const photo=profile.photo&&(profile.photo.startsWith('/assets/')||profile.photo.startsWith('/uploads/')||external(profile.photo));
    const image=photo?`<img src="${esc(profile.photo)}" alt="${esc(dict.ru.photoAlt)}" data-photo class="portrait-image" fetchpriority="high">`:`<div class="portrait-placeholder">${symbol('portrait')}<span>${t('photoLabel')}</span></div>`;
    const tools=[['growth','growthLabel','tool-growth'],['seo','seoLabel','tool-seo'],['facebook','Meta Ads','tool-meta'],['instagram','Instagram','tool-instagram'],['analytics','analyticsLabel','tool-analytics'],['ads','Google Ads','tool-ads']];
    body=`<section class="profile-section" id="about"><div class="profile-copy"><div class="eyebrow"><span class="status-dot"></span>${t('cvLabel')}</div><h1>${esc(profile.name)}</h1>${t('profileTitle','p','profile-role')}${t('profileSubtitle','p','profile-subtitle')}${t('profileIntro','p','profile-intro')}${t('profileDetail','p','profile-detail')}<div class="profile-actions"><a class="button button-dark" href="${mail}">${symbol('mail')}${t('contactMe')}</a><a class="button button-light" href="#experience">${t('explore')}${symbol('arrow')}</a></div></div><div class="portrait-wrap"><div class="portrait-card">${image}<div class="portrait-bottom"><span>${esc(profile.name)}</span><span>Marketing</span></div></div><div class="experience-badge"><strong>${esc(profile.yearsExperience??5)}</strong>${t('yearsLabel')}<span class="badge-chart">${icons.growth}</span></div></div></section><section class="tool-section"><div class="tool-heading">${t('contextLabel','h2','eyebrow')}${t('contextNote','span')}</div><div class="tool-list">${tools.map(([icon,key,cls])=>`<div class="tool ${cls}">${symbol(icon)}${dict.ru[key]?t(key):`<span>${esc(key)}</span>`}</div>`).join('')}</div></section><section class="experience-section" id="experience"><div class="section-heading"><div>${t('experienceLabel','h2')}${t('experienceNote','p')}</div>${link('/work/','projectsLink')}</div><div class="experience-grid">${experienceCards()}</div></section><section class="home-articles"><div class="section-heading"><div>${t('articlesLabel','h2')}${t('articlesNote','p')}</div>${link('/journal/','allArticles')}</div><div class="article-list">${articles.slice(0,3).map(a=>articleRow(a)).join('')}</div></section>`;
  }else if(kind==='journal'){
    body=`<section class="page-heading"><a class="back-link" href="/">← ${t('home')}</a>${t('journalPageTitle','h1')}${t('journalPageNote','p')}<div class="filter-bar" aria-label="Article categories">${[['all','filterAll'],['strategy','filterStrategy'],['commerce','filterCommerce'],['gaming','filterGaming']].map(([filter,key])=>`<button class="filter-button${filter==='all'?' active':''}" data-filter="${filter}" aria-pressed="${filter==='all'}">${t(key)}</button>`).join('')}<span class="filter-count" aria-live="polite">${articles.length}</span></div></section><section class="journal-index"><div class="article-list">${articles.map(a=>articleRow(a,'h2')).join('')}</div><p class="empty-message" hidden>${t('empty')}</p></section>`;
  }else if(kind==='work'){
    body=`<section class="page-heading"><a class="back-link" href="/">← ${t('home')}</a>${t('workPageTitle','h1')}${t('workPageNote','p')}</section><section class="case-list">${cases.map(caseRow).join('')}</section>`;
  }else if(kind==='article'){
    const sections=item.body.ru.map((_,i)=>{
      const headings=Object.fromEntries(languages.map(lang=>[lang,item.body[lang][i][0]]));
      const paragraphs=Object.fromEntries(languages.map(lang=>[lang,item.body[lang][i][1]]));
      return `<section class="prose-section">${local(headings,'h2')}${local(paragraphs,'p')}</section>`;
    }).join('');
    body=`<article class="reading-page"><header class="reading-header"><a class="back-link" href="/journal/">← ${t('backJournal')}</a><div class="article-meta"><span>${category(item)}</span><span>${item.minutes} ${t('minutes')}</span>${item.demo!==false?t('articleDemo'):''}${item.date?`<time datetime="${esc(item.date)}">${esc(item.date)}</time>`:''}</div>${local(item.title,'h1','',true)}${local(item.lead,'p','reading-lead')}<div class="article-author"><span class="author-avatar">${esc(profile.name.charAt(0))}</span><span>${esc(profile.name)}<small>${t('profileTitle')}</small></span></div></header>${item.cover?`<img class="reading-cover" src="${esc(item.cover)}" alt="">`:""}<div class="prose">${item.demo!==false?`<p class="content-notice">${t('articleNotice')}</p>`:""}${sections}<a class="text-link" href="/journal/">← ${t('backJournal')}</a></div></article><section class="related-articles"><div class="section-heading">${t('nextArticle','h2')}${link('/journal/','allArticles')}</div><div class="article-list">${articles.filter(a=>a.slug!==item.slug).slice(0,2).map(a=>articleRow(a)).join('')}</div></section>`;
  }else if(kind==='case'){
    body=`<article class="reading-page"><header class="reading-header"><a class="back-link" href="/work/">← ${t('backWork')}</a><div class="article-meta"><span>${esc(item.category)}</span>${item.demo!==false?t('caseStatus'):''}</div>${local(item.title,'h1','',true)}${local(item.lead,'p','reading-lead')}</header>${item.cover?`<img class="reading-cover" src="${esc(item.cover)}" alt="">`:""}<div class="prose">${item.demo!==false?`<p class="content-notice">${t('caseNotice')}</p>`:""}<section class="prose-section">${t('caseContext','h2')}${local(item.context,'p')}</section><section class="prose-section">${t('caseApproach','h2')}${local(item.approach,'p')}</section><section class="prose-section result-placeholder">${t('caseResult','h2')}${item.result?local(item.result,'p'):t('resultPlaceholder','p')}</section><a class="text-link" href="/work/">← ${t('backWork')}</a></div></article>`;
  }else{
    body=`<section class="page-heading error-page"><span class="eyebrow">404</span>${t('notFound','h1')}${link('/','backHome','button button-dark')}</section>`;
  }
  for(const key of ['menu','close','photoAlt','copied','copyFailed','metaDescription'])used.add(key);
  const translations=Object.fromEntries(languages.map(lang=>[lang,Object.fromEntries([...used].map(key=>[key,dict[lang][key]]))]));
  const titles=Object.fromEntries(languages.map(lang=>[lang,(item?sentence(item.title[lang]):kind==='journal'?dict[lang].journalPageTitle:kind==='work'?dict[lang].workPageTitle:dict[lang].profileTitle)+' — '+profile.name]));
  const descriptions=Object.fromEntries(languages.map(lang=>[lang,item?item.lead[lang]:cvCopy[lang].metaDescription.replace('Example',profile.name)]));
  const data=JSON.stringify({translations,titles,descriptions}).replaceAll('<','\\u003c');
  return `<!doctype html>\n<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f8f9fb"><meta name="description" content="${esc(descriptions.ru)}"><title>${esc(titles.ru)}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script></head><body class="page-${kind}" id="top">${header}<main class="container" id="main">${body}${contact}</main>${footer}<script type="application/json" id="page-data">${data}</script></body></html>\n`;
}
export function defaultContent(){
 const experience=[['commerce','commerce','ecommerce-lifecycle'],['gaming','gaming','gaming-engagement']].map(([id,prefix],index)=>({id,icon:id,articleSlug:articles[index].slug,title:Object.fromEntries(languages.map(lang=>[lang,cvCopy[lang][prefix+'Role']])),subtitle:Object.fromEntries(languages.map(lang=>[lang,cvCopy[lang][prefix+'Caption']])),description:Object.fromEntries(languages.map(lang=>[lang,cvCopy[lang][prefix+'Intro']])),company:Object.fromEntries(languages.map(lang=>[lang,''])),period:Object.fromEntries(languages.map(lang=>[lang,''])),bullets:Object.fromEntries(languages.map(lang=>[lang,[cvCopy[lang][prefix+'Bullet1'],cvCopy[lang][prefix+'Bullet2']]]))}));
 return structuredClone({experience,profile:{...profile,yearsExperience:5},copy,cvCopy,articles:articles.map(a=>({...a,published:true,demo:true,cover:'',date:''})),cases:cases.map(c=>({...c,published:true,demo:true,cover:'',result:Object.fromEntries(languages.map(lang=>[lang,copy[lang].resultPlaceholder]))}))});
}
export async function buildSite(content=defaultContent(),outputDir=root){
 const visible={...content,articles:content.articles.filter(a=>a.published!==false),cases:content.cases.filter(c=>c.published!==false)};
 const routes=[['index.html','home'],['journal/index.html','journal'],['work/index.html','work'],['404.html','404'],...visible.articles.map(a=>[`journal/${a.slug}/index.html`,'article',a]),...visible.cases.map(c=>[`work/${c.slug}/index.html`,'case',c])];
 for(const [filename,kind,item] of routes){
  if(!/^(?:index\.html|404\.html|(?:journal|work)\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?index\.html)$/.test(filename))throw Error('Invalid output path');
  const target=path.join(outputDir,filename);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,createPage(kind,item,visible));
 }
 return routes.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const count=await buildSite();console.log(`Built ${count} CV pages in ${languages.length} languages.`);
}
