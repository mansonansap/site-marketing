(() => {
 'use strict';
 const $=selector=>document.querySelector(selector);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const LANGS=['ru','en','uk','es'];
 const sections={profile:'Профиль и фото',experience:'Опыт',articles:'Статьи',cases:'Проекты',texts:'Тексты сайта'};
 const labels={
  cvLabel:'Маленькая подпись над именем',profileTitle:'Профессия',profileSubtitle:'Специализация',profileIntro:'Краткое описание',profileDetail:'Дополнительная строка',
  contactMe:'Кнопка связи в профиле',explore:'Кнопка перехода к опыту',yearsLabel:'Подпись к стажу',photoLabel:'Подпись без фотографии',photoAlt:'Описание фотографии для доступности',
  navExperience:'Навигация: опыт',navJournal:'Навигация: статьи',talk:'Навигация: связь',menu:'Открыть меню',close:'Закрыть меню',
  contextLabel:'Заголовок блока инструментов',contextNote:'Подпись блока инструментов',experienceLabel:'Заголовок опыта',experienceNote:'Подпись под заголовком опыта',projectsLink:'Ссылка на проекты',relatedArticle:'Ссылка на статью из опыта',
  articlesLabel:'Заголовок статей на главной',articlesNote:'Подпись блока статей',allArticles:'Ссылка на все статьи',read:'Чтение материала',articleDemo:'Пометка демонстрационной статьи',
  contactTitle:'Заголовок контактов',contactText:'Описание контактов',write:'Кнопка в контактах',contactLabel:'Название контактов',copy:'Копирование email',copied:'Email скопирован',copyFailed:'Ошибка копирования',toTop:'Ссылка наверх',
  journalPageTitle:'Заголовок журнала',journalPageNote:'Описание журнала',workPageTitle:'Заголовок проектов',workPageNote:'Описание страницы проектов',caseStatus:'Пометка шаблона кейса',openCase:'Открытие проекта',seoLabel:'Название SEO',analyticsLabel:'Название аналитики',growthLabel:'Название роста',metaDescription:'Описание сайта для поисковиков',
  home:'Главная',minutes:'Подпись времени чтения',filterAll:'Фильтр: все',filterStrategy:'Фильтр: стратегия',filterCommerce:'Фильтр: e-commerce',filterGaming:'Фильтр: gaming',empty:'Нет материалов',nextArticle:'Другие статьи',articleNotice:'Уведомление демонстрационной статьи',caseNotice:'Уведомление демонстрационного кейса',caseContext:'Заголовок контекста проекта',caseApproach:'Заголовок подхода',caseResult:'Заголовок результата',resultPlaceholder:'Текст вместо результата',backJournal:'Назад в журнал',backWork:'Назад к проектам',notFound:'Страница не найдена',backHome:'На главную'
 };
 const legacyKeys=['home','minutes','filterAll','filterStrategy','filterCommerce','filterGaming','empty','nextArticle','articleNotice','caseNotice','caseContext','caseApproach','caseResult','resultPlaceholder','backJournal','backWork','notFound','backHome'];
 const state={content:null,csrf:null,username:'',section:'profile',lang:'ru',selected:{experience:0,articles:0,cases:0},dirty:false,busy:false,publishedRevision:0,publishedAt:null,textSearch:''};
 let toastTimer;
 function toast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},error?8000:4200);}
 async function api(endpoint,{method='GET',body,raw=false,headers={}}={}){
  const options={method,credentials:'same-origin',headers:{...headers}};
  if(method!=='GET')options.headers['X-CSRF-Token']=state.csrf||'';
  if(body!==undefined){options.body=raw?body:JSON.stringify(body);if(!raw)options.headers['Content-Type']='application/json';}
  const response=await fetch('/api/admin/'+endpoint,options);let result;
  try{result=await response.json();}catch{throw Error('Сервер недоступен. Повторите попытку.');}
  if(!response.ok){
   if(response.status===401&&endpoint!=='login'&&state.csrf){state.csrf=null;renderLogin(true,'Сессия закончилась. Войдите снова. Несохранённые правки остаются в этой вкладке.');}
   throw Object.assign(Error(result.error||'Не удалось выполнить операцию.'),{status:response.status,details:result});
  }
  return result;
 }
 function value(path){return path.split('.').reduce((object,key)=>object?.[key],state.content);}
 function set(path,next){const parts=path.split('.');const key=parts.pop();let current=state.content;for(const part of parts)current=current[part];current[key]=next;state.dirty=true;updateStatus();}
 function field(label,path,{type='text',large=false,hint='',required=false}={}){
  const id='field-'+path.replaceAll('.','-');
  const attrs=`id="${id}" data-path="${esc(path)}"${required?' required':''}`;
  const current=value(path)??'';
  const input=type==='textarea'?`<textarea ${attrs} class="${large?'large':''}" rows="${large?9:3}">${esc(current)}</textarea>`:`<input ${attrs} type="${type}" value="${esc(current)}"${type==='number'?' min="0" max="120"':''}>`;
  return `<div class="field"><label for="${id}">${label}</label>${input}${hint?`<small>${hint}</small>`:''}</div>`;
 }
 function select(label,path,options){const id='field-'+path.replaceAll('.','-');return `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-path="${esc(path)}">${options.map(([key,text])=>`<option value="${esc(key)}"${String(value(path))===String(key)?' selected':''}>${esc(text)}</option>`).join('')}</select></div>`;}
 function checkbox(label,path){return `<label class="checkbox"><input type="checkbox" data-path="${esc(path)}"${value(path)?' checked':''}>${label}</label>`;}
 function button(text,action,extra='',cls=''){return `<button type="button" class="button ${cls}" data-action="${action}" ${extra}>${text}</button>`;}
 function translated(values=''){return Object.fromEntries(LANGS.map(lang=>[lang,lang==='ru'?values:'']));}
 function upload(path,label='Загрузить изображение'){return `<label class="button upload-button">${label}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload="${esc(path)}" aria-label="${label}"></label>`;}
 function photoEditor(path,label='Фото'){
  const url=value(path)||'';
  return `<div class="photo-editor"><div class="photo-preview">${url?`<img src="${esc(url)}" alt="${label}">`:'Без изображения'}</div><div><div class="upload-actions">${upload(path,label==='Фото'?'Загрузить фото':'Загрузить обложку')}${url?button('Убрать','clear-image',`data-image-path="${esc(path)}"`,'small-button'):''}</div><p class="help">JPEG, PNG, WebP или GIF, до 8 МБ. Изображение хранится на сервере.</p>${field('Или ссылка на изображение',path,{hint:'Можно оставить пустым.'})}</div></div>`;
 }
 function statusText(){if(state.dirty)return 'Есть несохранённые изменения';return state.content?.revision!==state.publishedRevision?'Сохранено · ещё не опубликовано':'Сохранено и опубликовано';}
 function updateStatus(){const el=$('#save-state');if(el){el.innerHTML=`<i></i><span>${statusText()}</span>`;el.classList.toggle('unsaved',state.dirty||state.content?.revision!==state.publishedRevision);}}
 function updateBusy(){document.querySelectorAll('.workspace input,.workspace textarea,.workspace select,.workspace button,.sidebar button,[data-action="logout"]').forEach(el=>{el.disabled=state.busy;});}
 function renderLogin(configured=true,message=''){
  $('#admin-app').innerHTML=`<main class="login-shell"><div class="login-logo">E</div><h1>Управление сайтом</h1><p>Профиль, фото, опыт и публикации — всё в одном месте.</p>${configured?`<form class="login-card" id="login-form"><div class="field"><label for="username">Логин</label><input id="username" name="username" autocomplete="username" required autofocus maxlength="80"></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"></div><button class="button primary" type="submit">Войти</button><p class="error" id="login-error" role="alert">${esc(message)}</p></form>`:`<div class="setup-note"><strong>Первый вход</strong><p>Создайте администратора в терминале сервера:</p><code>npm run admin:create</code><p>Команда попросит логин и пароль. Пароль не отображается и не отправляется в чат.</p><a href="/admin/">Проверить снова</a></div>`}<p class="help login-back"><a href="/">← На сайт</a></p></main>`;
  $('#login-form')?.addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('button');submit.disabled=true;$('#login-error').textContent='';
   try{const result=await api('login',{method:'POST',body:{username:form.username.value,password:form.password.value}});form.password.value='';state.csrf=result.csrf;state.username=result.username;await loadContent(true);render();}
   catch(error){const target=$('#login-error');if(target)target.textContent=error.message;}
   finally{submit.disabled=false;}
  });
 }
 async function loadContent(preserve=false){const result=await api('content');if(!preserve||!state.content||!state.dirty)state.content=result.content;state.publishedRevision=result.publishedRevision;state.publishedAt=result.publishedAt;}
 function render(){
  const content=state.content;if(!content)return;
  $('#admin-app').innerHTML=`<header class="topbar"><div class="admin-brand"><span>${esc(content.profile.name.charAt(0))}</span><div><strong>${esc(content.profile.name)}</strong><small>Управление сайтом</small></div></div><div class="topbar-links"><a href="/" target="_blank" rel="noopener">Открыть сайт</a><button class="link-button" data-action="logout">Выйти</button></div></header><div class="layout"><aside class="sidebar"><p>МОЙ САЙТ</p>${Object.entries(sections).map(([key,title])=>`<button class="nav-button${key===state.section?' active':''}" data-nav="${key}"><span>${title}</span>${['experience','articles','cases'].includes(key)?`<span>${content[key].length}</span>`:''}</button>`).join('')}<p class="sidebar-note">Сохраните правки, проверьте предпросмотр и опубликуйте готовую версию.</p></aside><main class="workspace"><div class="toolbar"><div><h1>${sections[state.section]}</h1><div class="toolbar-subtitle status-line" id="save-state"></div></div><div class="toolbar-actions">${button('Сохранить','save')}${button('Предпросмотр','preview')}${button('Опубликовать','publish','','publish')}</div></div><div id="editor-error" role="alert"></div><div class="language-bar"><label for="edit-language">Язык контента</label><select id="edit-language">${[['ru','Русский'],['en','English'],['uk','Українська'],['es','Español']].map(([key,text])=>`<option value="${key}"${state.lang===key?' selected':''}>${text}</option>`).join('')}</select><p>Пустые переводы статей и опыта используют текст RU.</p></div><div id="editor"></div><p class="save-note">«Сохранить» сохраняет правки в админке. Посетители увидят их после «Опубликовать». Резервная копия создаётся при каждом сохранении.</p></main></div>`;
  renderEditor();updateStatus();updateBusy();bind();
 }
 function renderEditor(){
  const lang=state.lang;let html='';
  if(state.section==='profile'){
   html=`<section class="card"><h2>Основная информация</h2><p class="card-description">Имя, контакты и фотография общие для всех языков.</p><div class="grid">${field('Имя','profile.name',{required:true})}${field('Email','profile.email',{type:'email',required:true})}${field('Стаж в маркетинге, лет','profile.yearsExperience',{type:'number'})}</div></section><section class="card"><h2>Фотография</h2><p class="card-description">Портрет на главной странице.</p>${photoEditor('profile.photo')}</section><section class="card"><h2>Описание профиля</h2><p class="card-description">Тексты для выбранного языка.</p>${field('Профессия',`cvCopy.${lang}.profileTitle`)}${field('Специализация',`cvCopy.${lang}.profileSubtitle`)}${field('Краткое описание',`cvCopy.${lang}.profileIntro`,{type:'textarea'})}${field('Дополнительная строка',`cvCopy.${lang}.profileDetail`,{type:'textarea'})}</section><section class="card"><div class="section-top"><h2>Социальные сети и ссылки</h2>${button('+ Добавить','add-link','','small-button')}</div>${state.content.profile.links.map((_,i)=>`<div class="repeat-row"><div class="row">${field('Название',`profile.links.${i}.label`)}${field('URL',`profile.links.${i}.url`,{type:'url'})}${button('Убрать','remove-link',`data-index="${i}"`,'small-button danger-button')}</div></div>`).join('')||'<p class="help">Добавьте Telegram, LinkedIn или другие нужные ссылки.</p>'}</section>`;
  }else if(state.section==='experience')html=experienceEditor();
  else if(state.section==='articles'||state.section==='cases')html=publicationEditor();
  else html=textEditor();
  $('#editor').innerHTML=html;
 }
 function experienceEditor(){
  const entries=state.content.experience,lang=state.lang;
  state.selected.experience=Math.max(0,Math.min(state.selected.experience,entries.length-1));
  const i=state.selected.experience,e=entries[i],base=`experience.${i}`;
  const list=entries.map((entry,index)=>`<button class="item-button${index===i?' active':''}" data-select="experience" data-index="${index}"><strong>${esc(entry.title[lang]||entry.title.ru)}</strong><small>${esc(entry.company[lang]||entry.company.ru||'Компания не указана')}</small></button>`).join('');
  return `<div class="section-top"><p class="help">Добавляйте компании, должности, периоды и направления работы.</p>${button('+ Добавить опыт','add-experience','','small-button')}</div><div class="editor-layout"><div class="item-list">${list||'<div class="empty">Записей пока нет</div>'}</div><div>${e?`<section class="card"><h2 class="editor-title">Запись опыта</h2>${field('Должность или направление',`${base}.title.${lang}`)}<div class="grid">${field('Компания',`${base}.company.${lang}`)}${field('Период',`${base}.period.${lang}`,{hint:'Например: 2021–2024 или «По настоящее время».'})}</div>${field('Подзаголовок',`${base}.subtitle.${lang}`)}${field('Описание',`${base}.description.${lang}`,{type:'textarea'})}${select('Значок',`${base}.icon`,[['commerce','E-commerce'],['gaming','Online gaming'],['growth','Рост'],['analytics','Аналитика'],['seo','SEO']])}<div class="divider"></div><div class="section-top"><h2>Что делал / результаты</h2>${button('+ Пункт','add-bullet',`data-index="${i}"`,'small-button')}</div>${e.bullets[lang].map((_,j)=>`<div class="repeat-row"><div class="row">${field(`Пункт ${j+1}`,`${base}.bullets.${lang}.${j}`)}${button('Убрать','remove-bullet',`data-index="${i}" data-row="${j}"`,'small-button danger-button')}</div></div>`).join('')}${select('Статья по теме',`${base}.articleSlug`,[['','Без ссылки'],...state.content.articles.map(a=>[a.slug,a.title[lang]||a.title.ru])])}<div class="remove-row"><p>Удаление появится на сайте после публикации.</p>${button('Удалить запись','remove-experience',`data-index="${i}"`,'small-button danger-button')}</div></section>`:'<section class="card empty">Добавьте первую запись опыта.</section>'}</div></div><section class="card">${field('Подпись под заголовком опыта',`cvCopy.${lang}.experienceNote`,{hint:'Обновите общий стаж и описание, если они изменились.'})}</section>`;
 }
 function publicationEditor(){
  const group=state.section,items=state.content[group],lang=state.lang,isArticle=group==='articles';
  state.selected[group]=Math.max(0,Math.min(state.selected[group],items.length-1));const i=state.selected[group],item=items[i],base=`${group}.${i}`;
  const list=items.map((entry,index)=>`<button class="item-button${index===i?' active':''}" data-select="${group}" data-index="${index}"><strong>${esc(entry.title[lang]||entry.title.ru)}</strong><small>/${isArticle?'journal':'work'}/${esc(entry.slug)}/</small><br><span class="status-pill${entry.published?'':' draft'}">${entry.published?'Включён на сайте':'Черновик'}</span></button>`).join('');
  let editor='';
  if(item){
   editor=`<section class="card"><h2 class="editor-title">${isArticle?'Статья':'Проект'}</h2>${checkbox('Включить на сайте при следующей публикации',`${base}.published`)}${checkbox('Показывать пометку демонстрационного материала',`${base}.demo`)}${field('Адрес страницы',`${base}.slug`,{hint:'Маленькие латинские буквы, цифры и дефисы. Изменение адреса меняет ссылку на материал.'})}${field('Заголовок',`${base}.title.${lang}`)}${field('Краткое описание',`${base}.lead.${lang}`,{type:'textarea'})}${isArticle?`<div class="grid">${select('Категория',`${base}.category`,[['commerce','E-commerce'],['gaming','Online gaming'],['strategy','Стратегия']])}${field('Минут на чтение',`${base}.minutes`,{type:'number'})}${field('Дата',`${base}.date`,{type:'date'})}</div>`:field('Направление / категория',`${base}.category`)}<div class="divider"></div><h2>Обложка</h2><p class="card-description">Необязательно. Без обложки останется небольшой значок.</p>${photoEditor(`${base}.cover`,'Обложка')}<div class="divider"></div>`;
   if(isArticle){
    editor+=`<div class="section-top"><h2>Текст статьи</h2>${button('+ Раздел','add-section',`data-index="${i}"`,'small-button')}</div><div class="sections-list">${item.body[lang].map((_,j)=>`<div class="section-card"><div class="section-top"><strong>РАЗДЕЛ ${j+1}</strong>${button('Удалить','remove-section',`data-index="${i}" data-row="${j}"`,'small-button danger-button')}</div>${field('Заголовок раздела',`${base}.body.${lang}.${j}.0`)}${field('Текст',`${base}.body.${lang}.${j}.1`,{type:'textarea',large:true})}</div>`).join('')}</div>`;
   }else{
    editor+=`${field('Контекст и задача',`${base}.context.${lang}`,{type:'textarea',large:true})}${field('Подход и решения',`${base}.approach.${lang}`,{type:'textarea',large:true})}${field('Результаты',`${base}.result.${lang}`,{type:'textarea',large:true})}`;
   }
   editor+=`<div class="remove-row"><p>Изменения попадут на сайт после публикации.</p>${button(isArticle?'Удалить статью':'Удалить проект','remove-item',`data-group="${group}" data-index="${i}"`,'small-button danger-button')}</div></section>`;
  }
  return `<div class="section-top"><p class="help">У каждого материала свой URL и отдельный текст.</p>${button(isArticle?'+ Новая статья':'+ Новый проект','add-item',`data-group="${group}"`,'small-button')}</div><div class="editor-layout"><div class="item-list">${list||'<div class="empty">Материалов пока нет</div>'}</div><div>${editor||'<section class="card empty">Добавьте первый материал.</section>'}</div></div>`;
 }
 function textEditor(){
  const lang=state.lang;
  const cvKeys=Object.keys(state.content.cvCopy[lang]).filter(key=>!/^(commerce|gaming)/.test(key));
  const entries=[...cvKeys.map(key=>['cvCopy',key]),...legacyKeys.map(key=>['copy',key])];
  return `<section class="card"><h2>Тексты интерфейса</h2><p class="card-description">Кнопки, подписи, контакты, SEO и уведомления для выбранного языка. Обычный текст, без HTML.</p><div class="field text-filter"><label for="text-search">Найти поле</label><input type="search" id="text-search" value="${esc(state.textSearch)}" placeholder="Например: контакты"></div><div class="text-grid">${entries.map(([group,key])=>`<div class="text-entry" data-search="${esc((labels[key]||key).toLowerCase())}">${field(labels[key]||key,`${group}.${lang}.${key}`,{type:'textarea'})}</div>`).join('')}</div></section><section class="card"><h2>Резервная копия контента</h2><p class="card-description">Можно скачать тексты и настройки в JSON. Изображения хранятся отдельно на сервере.</p><div class="upload-actions">${button('Скачать копию','export')}<label class="button upload-button">Восстановить из файла<input type="file" accept="application/json,.json" id="import-content" aria-label="Восстановить контент"></label></div></section>`;
 }
 function filterTexts(){document.querySelectorAll('[data-search]').forEach(el=>{el.hidden=!el.dataset.search.includes(state.textSearch.toLowerCase());});}
 async function save(){
  if(!state.dirty)return;
  const result=await api('content',{method:'PUT',body:{content:state.content,revision:state.content.revision}});
  state.content=result.content;state.publishedRevision=result.publishedRevision;state.publishedAt=result.publishedAt;state.dirty=false;updateStatus();
 }
 function showError(message){const target=$('#editor-error');if(target){target.className='banner';target.textContent=message;}toast(message,true);}
 async function run(action){
  if(state.busy)return;state.busy=true;updateBusy();const error=$('#editor-error');if(error){error.className='';error.textContent='';}
  let popup;if(action==='preview'){popup=window.open('about:blank','_blank');if(popup){popup.opener=null;popup.document.title='Предпросмотр';popup.document.body.textContent='Готовим предпросмотр…';}}
  try{
   await save();
   if(action==='publish'){
    const result=await api('publish',{method:'POST',body:{revision:state.content.revision}});state.publishedRevision=result.publishedRevision;state.publishedAt=result.publishedAt;toast('Готово. Изменения опубликованы на сайте.');
   }else if(action==='preview'){
    const result=await api('preview',{method:'POST',body:{revision:state.content.revision}});if(popup)popup.location.href=result.url;else location.assign(result.url);
   }else toast('Изменения сохранены. Можно проверить предпросмотр.');
   render();
  }catch(error){if(popup)popup.close();showError(error.message);}
  finally{state.busy=false;updateBusy();}
 }
 function newSlug(base,group){let slug=base,index=2;while(state.content[group].some(item=>item.slug===slug))slug=base+'-'+index++;return slug;}
 function changed(){state.dirty=true;render();}
 function remove(message,operation){if(confirm(message)){operation();changed();}}
 async function action(button){
  const name=button.dataset.action,index=Number(button.dataset.index),row=Number(button.dataset.row),lang=state.lang;
  if(['save','publish','preview'].includes(name))return run(name);
  if(name==='logout'){
   if(state.dirty&&!confirm('Есть несохранённые изменения. Выйти без сохранения?'))return;
   try{await api('logout',{method:'POST',body:{}});state.csrf=null;state.content=null;state.dirty=false;renderLogin(true);}catch(error){toast(error.message,true);}return;
  }
  if(name==='add-link'){state.content.profile.links.push({label:'',url:''});changed();}
  if(name==='remove-link'){state.content.profile.links.splice(index,1);changed();}
  if(name==='clear-image'){set(button.dataset.imagePath,'');render();}
  if(name==='add-experience'){
   state.content.experience.push({id:globalThis.crypto?.randomUUID?.()||'experience-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),icon:'growth',articleSlug:'',title:translated('Новая запись'),subtitle:translated(),description:translated(),company:translated(),period:translated(),bullets:Object.fromEntries(LANGS.map(code=>[code,[]]))});state.selected.experience=state.content.experience.length-1;changed();
  }
  if(name==='remove-experience')remove('Удалить эту запись опыта из черновика?',()=>state.content.experience.splice(index,1));
  if(name==='add-bullet'){state.content.experience[index].bullets[lang].push('');changed();}
  if(name==='remove-bullet'){state.content.experience[index].bullets[lang].splice(row,1);changed();}
  if(name==='add-item'){
   const group=button.dataset.group;
   const item={slug:newSlug(group==='articles'?'new-article':'new-project',group),title:translated(group==='articles'?'Новая статья':'Новый проект'),lead:translated(),published:false,demo:false,cover:''};
   if(group==='articles')Object.assign(item,{category:'strategy',minutes:3,date:'',body:Object.fromEntries(LANGS.map(code=>[code,[]]))});
   else Object.assign(item,{category:'E-commerce',context:translated(),approach:translated(),result:translated()});
   state.content[group].unshift(item);state.selected[group]=0;changed();
  }
  if(name==='remove-item')remove('Удалить материал из черновика? После публикации его страница исчезнет с сайта.',()=>state.content[button.dataset.group].splice(index,1));
  if(name==='add-section'){state.content.articles[index].body[lang].push(['','']);changed();}
  if(name==='remove-section')remove('Удалить этот раздел из черновика?',()=>state.content.articles[index].body[lang].splice(row,1));
  if(name==='export'){
   const file=new Blob([JSON.stringify(state.content,null,2)],{type:'application/json'});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='cv-content-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
 }
 function bind(){
  document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>{state.section=el.dataset.nav;render();}));
  document.querySelectorAll('[data-select]').forEach(el=>el.addEventListener('click',()=>{state.selected[el.dataset.select]=Number(el.dataset.index);render();}));
  $('#edit-language').addEventListener('change',event=>{state.lang=event.target.value;render();});
  document.querySelectorAll('[data-path]').forEach(el=>el.addEventListener('input',()=>set(el.dataset.path,el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value)));
  document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>action(el)));
  document.querySelectorAll('[data-upload]').forEach(el=>el.addEventListener('change',async()=>{
   const file=el.files[0];if(!file)return;if(file.size>8*1024*1024){toast('Размер файла не должен превышать 8 МБ.',true);el.value='';return;}
   if(state.busy)return;state.busy=true;updateBusy();
   try{const result=await api('uploads',{method:'POST',body:file,raw:true,headers:{'Content-Type':file.type||'application/octet-stream'}});set(el.dataset.upload,result.url);render();toast('Изображение загружено. Сохраните и опубликуйте правки.');}
   catch(error){toast(error.message,true);}finally{state.busy=false;updateBusy();}
  }));
  $('#text-search')?.addEventListener('input',event=>{state.textSearch=event.target.value;filterTexts();});filterTexts();
  $('#import-content')?.addEventListener('change',async event=>{
   const file=event.target.files[0];if(!file)return;
   try{if(file.size>4*1024*1024)throw Error('Файл слишком большой.');const content=JSON.parse(await file.text());if(!content.profile||!content.cvCopy||!Array.isArray(content.articles)||!Array.isArray(content.experience))throw Error('Это не файл контента сайта.');if(!confirm('Заменить текущий черновик данными из файла? Сайт изменится только после публикации.'))return;content.revision=state.content.revision;state.content=content;changed();toast('Копия загружена в редактор. Проверьте и сохраните её.');}catch(error){toast(error.message,true);}
  });
 }
 addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
 async function init(){
  try{const result=await api('session');state.csrf=result.csrf;state.username=result.username;await loadContent();render();}
  catch(error){if(error.status===401)renderLogin(error.details.configured);else{$('#admin-app').innerHTML=`<main class="login-shell"><h1>Не удалось открыть админку</h1><p>${esc(error.message)}</p><a href="/admin/">Попробовать снова</a></main>`;}}
 }
 init();
})();
