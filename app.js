(() => {
 'use strict';
 const node=document.getElementById('page-data');if(!node)return;
 const data=JSON.parse(node.textContent);
 const select=document.getElementById('language');
 const toggle=document.querySelector('.menu-toggle');
 const menu=document.getElementById('mobile-menu');
 let language='ru';
 const text=key=>data.translations[language][key]||data.translations.ru[key]||key;
 const preview=document.documentElement.hasAttribute('data-preview');
 function updateLinks(){
  document.querySelectorAll('a[href]').forEach(link=>{
   const href=link.getAttribute('href');
   if(href.startsWith('//')||(!href.startsWith('/')&&!href.startsWith('?page=')))return;
   const url=new URL(href,location.href);url.searchParams.set('lang',language);
   link.setAttribute('href',preview?url.search+url.hash:url.pathname+url.search+url.hash);
  });
 }
 function applyLanguage(code,updateUrl=false){
  language=data.translations[code]?code:'ru';document.documentElement.lang=language;select.value=language;
  select.setAttribute('aria-label',{ru:'Язык сайта',en:'Website language',uk:'Мова сайту',es:'Idioma del sitio'}[language]);
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.innerHTML=text(el.dataset.i18n);});
  document.title=data.titles[language];document.querySelector('meta[name="description"]').content=data.descriptions[language];
  const photo=document.querySelector('[data-photo]');if(photo)photo.alt=text('photoAlt');
  toggle.setAttribute('aria-label',text(menu.hidden?'menu':'close'));
  document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
  updateLinks();try{localStorage.setItem('portfolio-language',language);}catch{}
  if(updateUrl){const url=new URL(location.href);url.searchParams.set('lang',language);try{history.replaceState(null,'',url.href);}catch{}}
  document.getElementById('copy-status').textContent='';
 }
 let requested=new URLSearchParams(location.search).get('lang');if(!requested){try{requested=localStorage.getItem('portfolio-language');}catch{}}
 applyLanguage(requested||'ru');select.addEventListener('change',()=>applyLanguage(select.value,true));
 window.addEventListener('popstate',()=>applyLanguage(new URLSearchParams(location.search).get('lang')||'ru'));
 function closeMenu(focus=false){menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label',text('menu'));if(focus)toggle.focus();}
 toggle.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',text(open?'close':'menu'));});
 menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>closeMenu()));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden)closeMenu(true);});
 matchMedia('(min-width: 761px)').addEventListener('change',event=>{if(event.matches)closeMenu();});
 document.addEventListener('click',event=>{if(!menu.hidden&&!event.target.closest('.site-header'))closeMenu();});
 let timer;
 document.querySelector('.copy-email').addEventListener('click',async()=>{
  const status=document.getElementById('copy-status');clearTimeout(timer);
  try{if(!navigator.clipboard)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(data.email);status.textContent=text('copied');}
  catch{status.textContent=text('copyFailed');}
  timer=setTimeout(()=>{status.textContent='';},4500);
 });
 document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  const filter=button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(other=>{const active=other===button;other.classList.toggle('active',active);other.setAttribute('aria-pressed',String(active));});
  let visible=0;document.querySelectorAll('.journal-index [data-category]').forEach(row=>{const show=filter==='all'||row.dataset.category===filter;row.hidden=!show;if(show)visible++;});
  document.querySelector('.filter-count').textContent=String(visible);document.querySelector('.empty-message').hidden=visible!==0;
 }));
})();
