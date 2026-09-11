const icons={left:'M15 5l-7 7 7 7',right:'M9 5l7 7-7 7',first:'M5 5v14 M18 5l-7 7 7 7',last:'M19 5v14 M6 5l7 7-7 7',list:'M8 6h12 M8 12h12 M8 18h12 M3 6h.1 M3 12h.1 M3 18h.1',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',zoom:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5 M7 10.5h7 M10.5 7v7',share:'M12 16V3 M7 8l5-5 5 5 M5 13v7h14v-7',fullscreen:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',play:'M7 4l13 8-13 8z',pause:'M8 5v14 M16 5v14',close:'M6 6l12 12 M18 6L6 18',plus:'M12 5v14 M5 12h14',minus:'M5 12h14',text:'M4 5h16 M12 5v15 M8 20h8',print:'M6 8V3h12v5 M6 17H3V9h18v8h-3 M6 14h12v7H6z'};
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[el.dataset.icon]}"></path></svg>`});

(() => {
  'use strict';
  const $=id=>document.getElementById(id), data=window.BOOK_DATA;
  if(!data || !window.St){$('hint').textContent='전자책 파일을 불러오지 못했습니다. 새로고침해 주세요.';return;}
  const total=data.pages.length, ratio=858.898/612.283;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current=0, timer=null, toastTimer, activePanel='toc', busy=false, turning=false, queuedDirection=0, zoom=1.5;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"></path></svg>`;
  const pageLabel=n=>n===1?'앞표지':n===total?'뒤표지':`${n}페이지`;
  const fromHash=()=>{const m=location.hash.match(/^#p=(\d+)$/);return m?Math.max(0,Math.min(total-1,Number(m[1])-1)):0;};
  current=fromHash();
  const book=$('book');book.style.width='100%';book.style.height='100%';
  book.innerHTML=data.pages.map(p=>`<div class="page" data-page="${p.number}" ${p.number===1||p.number===total?'data-density="hard"':''}><img data-src="${p.reading||p.image}" alt="${esc(pageLabel(p.number)+' · '+p.title)}" draggable="false" decoding="async" width="998" height="1400"></div>`).join('');
  const ground=document.createElement('div');ground.className='book-ground';ground.setAttribute('aria-hidden','true');book.prepend(ground);
  // Corner-only click filtering also blocks programmatic flips when the book is vertically centered.
  const turnDuration=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-turn-duration'))||820;
  const flip=new St.PageFlip(book,{width:430,height:430*ratio,size:'stretch',minWidth:240,maxWidth:680,minHeight:150,maxHeight:1000,autoSize:false,showCover:true,usePortrait:true,drawShadow:!reduced,showPageCorners:false,maxShadowOpacity:.13,flippingTime:reduced?1:turnDuration,startPage:current,mobileScrollSupport:false,swipeDistance:35,disableFlipByClick:false});
  const decodeCache=new WeakMap();
  function decodeImage(im){if(!decodeCache.has(im))decodeCache.set(im,im.decode().catch(()=>undefined));return decodeCache.get(im);}
  function hydrate(index){
    const images=[...book.querySelectorAll('.page')].filter(p=>Math.abs(Number(p.dataset.page)-1-index)<=5).flatMap(p=>[...p.querySelectorAll('img')]);
    for(const im of images){if(!im.getAttribute('src'))im.src=im.dataset.src;decodeImage(im);}
    return images;
  }
  function visiblePages(){return flip.getOrientation()==='portrait'||current===0||current===total-1?[current]:[current,Math.min(current+1,total-1)];}
  function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
  function sync(){
    current=flip.getCurrentPageIndex();hydrate(current);
    const shown=visiblePages(),last=shown.at(-1),portrait=flip.getOrientation()==='portrait';
    $('page-input').value=current+1;$('page-range').textContent=shown.length===2?`–${last+1} / ${total}`:`/ ${total}`;
    $('section-name').textContent=data.pages[current].title;$('view-mode').textContent=portrait?'한 장 보기':'펼쳐 보기';
    $('progress').value=current+1;const pct=current/(total-1)*100;$('progress').style.background=`linear-gradient(to right,var(--accent) ${pct}%,var(--line) ${pct}%)`;
    for(const id of ['prev','prev-edge','first','zoom-prev'])$(id).disabled=current===0;
    for(const id of ['next','next-edge','last','zoom-next'])$(id).disabled=last>=total-1;
    for(const b of document.querySelectorAll('[data-jump]')){const active=shown.includes(Number(b.dataset.jump)-1);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
    book.style.transform=`translate3d(${bookOffset(current)}px,0,0)`;
    syncGround(current);
    const hash=`#p=${current+1}`;if(location.hash!==hash){try{history.replaceState(null,'',hash);}catch{}}
    $('announcer').textContent=shown.map(i=>pageLabel(i+1)).join(', ')+', '+data.pages[current].title;
    if(last>=total-1)stopAuto();
  }
  function bookOffset(index){if(flip.getOrientation()==='portrait')return 0;const pw=flip.getBoundsRect().pageWidth;return index===0?-pw/2:index===total-1?pw/2:0;}
  // One contact shadow belongs to the book, rather than a floating shadow per leaf.
  // Its footprint follows the cover's projected width on the same motion timeline.
  function syncGround(from,to=from,progress=0){
    const rect=flip.getBoundsRect(),portrait=flip.getOrientation()==='portrait';
    book.dataset.layout=portrait?'portrait':'landscape';
    const footprint=index=>portrait?[0,1]:index===0?[0,1]:index===total-1?[1,0]:[1,1];
    const a=footprint(from),b=footprint(to),cos=Math.cos(Math.PI*Math.max(0,Math.min(1,progress)));
    const visible=a.map((v,i)=>v===b[i]?v:v===0?Math.max(0,-cos):Math.max(0,cos));
    ground.style.left=(rect.left+rect.pageWidth*(1-visible[0]))+'px';
    ground.style.top=rect.top+'px';
    ground.style.width=rect.pageWidth*(visible[0]+visible[1])+'px';
    ground.style.height=rect.height+'px';
  }
  function nextIndex(direction){if(flip.getOrientation()==='portrait')return current+direction;return direction>0?(current===0?1:Math.min(total-1,current+2)):(current===1?0:Math.max(0,current-2));}
  flip.on('flipProgress',e=>{if(!e.data.turning)return;const target=nextIndex(e.data.direction===0?1:-1);const from=bookOffset(current),to=bookOffset(target);if(from!==to)book.style.transform=`translate3d(${from+(to-from)*e.data.progress}px,0,0)`;syncGround(current,target,e.data.progress);});
  flip.on('changeState',e=>{turning=e.data==='flipping'||e.data==='user_fold';book.classList.toggle('is-turning',turning);if(e.data==='read')sync();if(e.data==='read'&&queuedDirection){const direction=queuedDirection;queuedDirection=0;requestAnimationFrame(()=>step(direction));}});
  flip.on('flip',sync);flip.on('changeOrientation',()=>requestAnimationFrame(sync));
  flip.on('init',sync);hydrate(current);flip.loadFromHTML(book.querySelectorAll('.page'));
  let resizeFrame;
  new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{flip.update();sync();});}).observe($('book-host'));
  function stopAuto(){clearInterval(timer);timer=null;$('autoplay').innerHTML=icon('play');$('autoplay').setAttribute('aria-pressed','false');$('autoplay').setAttribute('aria-label','자동 넘김 시작');}
  async function step(direction,automatic=false){
    if(!automatic)stopAuto();
    if(busy||turning||flip.getState()==='flipping'){if(!automatic)queuedDirection=direction;return;}
    const target=nextIndex(direction);if(target<0||target>=total||target===current)return;
    busy=true;
    await Promise.all(hydrate(target).filter(im=>Math.abs(Number(im.parentElement.dataset.page)-1-target)<=1).map(decodeImage));
    busy=false;
    if(direction>0&&visiblePages().at(-1)<total-1){if(reduced)flip.turnToNextPage();else flip.flipNext();}
    else if(direction<0&&current>0){if(reduced)flip.turnToPrevPage();else flip.flipPrev();}
  }
  async function goTo(number,closeMobile=true){
    if(!Number.isInteger(number)||number<1||number>total)throw new Error(`1부터 ${total} 사이의 페이지 번호를 입력하세요.`);
    stopAuto();queuedDirection=0;
    if(busy||turning)await new Promise((resolve,reject)=>{const start=performance.now();const check=()=>{if(!busy&&!turning)resolve();else if(performance.now()-start>3000)reject(new Error('페이지 넘김을 마친 뒤 다시 시도해 주세요.'));else requestAnimationFrame(check);};check();});
    busy=true;
    try{
      const target=number-1;
      const imgs=hydrate(target).filter(im=>Math.abs(Number(im.parentElement.dataset.page)-number)<=1);
      await Promise.all(imgs.map(decodeImage));
      flip.turnToPage(target);sync();
      if(closeMobile&&matchMedia('(max-width:700px)').matches)closePanel();
    }finally{busy=false;}
  }
  $('prev').onclick=$('prev-edge').onclick=()=>step(-1);$('next').onclick=$('next-edge').onclick=()=>step(1);
  $('first').onclick=()=>goTo(1);$('last').onclick=()=>goTo(total);
  $('page-form').onsubmit=e=>{e.preventDefault();goTo(Number($('page-input').value)).catch(e=>notify(e.message));};
  $('progress').oninput=()=>{$('page-input').value=$('progress').value;};
  $('progress').onchange=()=>goTo(Number($('progress').value));
  $('autoplay').onclick=()=>{if(timer){stopAuto();return;}if(visiblePages().at(-1)>=total-1){notify('마지막 페이지입니다. 첫 페이지로 이동해 주세요.');return;}$('autoplay').innerHTML=icon('pause');$('autoplay').setAttribute('aria-pressed','true');$('autoplay').setAttribute('aria-label','자동 넘김 정지');timer=setInterval(()=>step(1,true),5000);notify('5초마다 페이지를 넘깁니다.');};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto();});
  window.addEventListener('hashchange',()=>goTo(fromHash()+1,false));

  function jumpButton(title,page,cls=''){return `<button class="${cls}" data-jump="${page}"><span>${esc(title)}</span><span>${pageLabel(page).replace('페이지','')}</span></button>`;}
  $('toc').innerHTML=jumpButton('앞표지',1)+jumpButton('목차',4)+jumpButton('센터 소개 · 입주기업 현황',6)+data.chapters.map(c=>jumpButton(c.title,c.page,'chapter')+c.companies.map(x=>jumpButton(x.title,x.page,'company')).join('')).join('')+jumpButton('발행 정보',60,'chapter')+jumpButton('뒤표지',64);
  $('thumbs').innerHTML=data.pages.map(p=>`<button class="thumb" data-jump="${p.number}" aria-label="${esc(pageLabel(p.number)+' · '+p.title)}"><img data-src="${p.thumb}" alt="" width="190" height="267" loading="lazy"><span>${pageLabel(p.number)}</span></button>`).join('');
  $('sidebar').addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(b)goTo(Number(b.dataset.jump));});
  function setPanel(name){
    activePanel=name;$('sidebar').hidden=false;
    for(const n of ['toc','thumbs','search']){const selected=n===name;$(n==='search'?'search-panel':n).hidden=!selected;const t=$('tab-'+n);t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;}
    $('panel-title').textContent=name==='toc'?'목차':name==='thumbs'?'전체 페이지':'본문 검색';
    $('toc-open').setAttribute('aria-expanded',String(name==='toc'));$('thumbs-open').setAttribute('aria-expanded',String(name==='thumbs'));
    if(name==='thumbs')for(const im of $('thumbs').querySelectorAll('img[data-src]'))if(!im.src)im.src=im.dataset.src;
    if(name==='search')$('query').focus();
    else $('tab-'+name).focus();
  }
  function closePanel(){const hadFocus=$('sidebar').contains(document.activeElement);$('sidebar').hidden=true;$('toc-open').setAttribute('aria-expanded','false');$('thumbs-open').setAttribute('aria-expanded','false');if(hadFocus)$(activePanel==='search'?'search-open':activePanel==='toc'?'toc-open':'thumbs-open').focus();}
  function togglePanel(name){if(!$('sidebar').hidden&&activePanel===name)closePanel();else{stopAuto();setPanel(name);}}
  $('toc-open').onclick=()=>togglePanel('toc');$('thumbs-open').onclick=()=>togglePanel('thumbs');$('search-open').onclick=()=>togglePanel('search');$('panel-close').onclick=closePanel;
  document.querySelectorAll('[data-panel]').forEach(b=>{b.onclick=()=>setPanel(b.dataset.panel);b.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const names=['toc','thumbs','search'];setPanel(names[(names.indexOf(b.dataset.panel)+(e.key==='ArrowRight'?1:2))%3]);}};});
  const normalize=s=>s.toLocaleLowerCase().replace(/\s/g,'');
  function findResults(query){const q=normalize(query.trim());if(!q)return[];return data.pages.filter(p=>normalize(p.title+' '+p.text).includes(q)).map(p=>{const plain=p.text.replace(/\s+/g,' ');const index=plain.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());const start=Math.max(0,index-35);return {page:p.number,title:p.title,snippet:(start?'…':'')+plain.slice(start,start+140)+(plain.length>start+140?'…':'')};});}
  function search(){const q=$('query').value.trim();const results=findResults(q);$('search-count').textContent=!q?'찾고 싶은 단어를 입력하세요.':results.length?`${results.length}개 페이지에서 찾았습니다.`:'검색 결과가 없습니다. 다른 단어로 검색해 보세요.';$('results').innerHTML=results.map(r=>`<button class="result" data-jump="${r.page}"><strong>${esc(r.title)} · ${r.page}페이지</strong>${esc(r.snippet)}</button>`).join('');return results;}
  $('query').oninput=search;

  function renderZoom(){const shown=visiblePages();$('zoom-label').textContent=shown.map(i=>i+1).join('–')+'페이지';$('zoom-pages').innerHTML=shown.map(i=>`<img src="${data.pages[i].image}" alt="${esc(data.pages[i].title)}">`).join('');applyZoom();$('zoom-prev').disabled=current===0;$('zoom-next').disabled=shown.at(-1)>=total-1;}
  function applyZoom(){const count=visiblePages().length;const available=Math.max(260,$('zoom-scroll').clientWidth-48);const base=Math.min(650,available/count);for(const im of $('zoom-pages').children)im.style.width=Math.round(base*zoom)+'px';$('zoom-level').textContent=Math.round(zoom*100)+'%';$('zoom-out').disabled=zoom<=1;$('zoom-in').disabled=zoom>=3;}
  $('zoom-open').onclick=()=>{stopAuto();$('zoom-dialog').showModal();zoom=1.5;renderZoom();};
  $('zoom-close').onclick=()=>$('zoom-dialog').close();$('zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.25);applyZoom();};$('zoom-out').onclick=()=>{zoom=Math.max(1,zoom-.25);applyZoom();};
  async function zoomStep(d){const shown=visiblePages();const target=d>0?shown.at(-1)+2:Math.max(1,current-(shown.length===2?1:0));await goTo(target,false);renderZoom();$('zoom-scroll').scrollTo(0,0);}
  $('zoom-prev').onclick=()=>zoomStep(-1);$('zoom-next').onclick=()=>zoomStep(1);
  $('text-open').onclick=()=>{stopAuto();$('text-content').replaceChildren();for(const i of visiblePages()){const section=document.createElement('section'),title=document.createElement('h3'),text=document.createElement('p');title.textContent=data.pages[i].title+' · '+pageLabel(i+1);text.textContent=data.pages[i].text||'이 페이지는 이미지로 구성되어 있습니다. 확대 보기로 내용을 확인해 주세요.';section.append(title,text);$('text-content').append(section);}$('text-dialog').showModal();};
  $('text-close').onclick=()=>$('text-dialog').close();
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('이 브라우저는 전체 화면을 지원하지 않습니다.');}catch{notify('브라우저 메뉴에서 전체 화면을 선택해 주세요.');}};
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'전체 화면 종료':'전체 화면');});
  $('share').onclick=async()=>{if(location.protocol==='file:'||['localhost','127.0.0.1'].includes(location.hostname)){notify('온라인에 게시한 뒤 페이지 링크를 공유할 수 있습니다.');return;}try{await navigator.clipboard.writeText(location.href);notify('현재 페이지 링크를 복사했습니다.');}catch{window.prompt('아래 페이지 주소를 복사해 주세요.',location.href);}};
  $('print').onclick=async()=>{stopAuto();$('print-pages').innerHTML=visiblePages().map(i=>`<img src="${data.pages[i].image}" alt="${esc(data.pages[i].title)}">`).join('');await Promise.all([...$('print-pages').querySelectorAll('img')].map(im=>im.decode().catch(()=>undefined)));window.print();};
  window.addEventListener('afterprint',()=>$('print-pages').replaceChildren());
  document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button')||document.querySelector('dialog[open]'))return;if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();step(1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();step(-1);}else if(e.key==='Home'){e.preventDefault();goTo(1);}else if(e.key==='End'){e.preventDefault();goTo(total);}else if(e.key==='Escape'){closePanel();stopAuto();}});
  book.addEventListener('error',e=>{if(e.target.tagName==='IMG')notify('페이지 이미지를 불러오지 못했습니다. 새로고침해 주세요.');},true);

  // The optional browser interface uses the same navigation and search actions.
  const context=document.modelContext;
  if(context?.registerTool){
    const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
    const getState=()=>({page:current+1,visiblePages:visiblePages().map(i=>i+1),total,title:data.pages[current].title,mode:flip.getOrientation()});
    register({name:'read_book_state',description:'Read the current page, visible pages and total page count.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=="object"||Object.keys(input).length)throw Error("This tool accepts an empty object.");return getState();}});
    register({name:'navigate_book_page',description:'Open a page in this content book. Page numbers range from 1 to 64.',inputSchema:{type:'object',properties:{page:{type:'integer',minimum:1,maximum:64}},required:['page'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||!Number.isInteger(input.page))throw Error('A page number is required.');await goTo(input.page,false);return getState();}});
    register({name:'search_book_text',description:'Search company names and extracted PDF text; show the matching pages in the search panel.',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:100}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||typeof input.query!=='string'||!input.query.trim()||input.query.length>100)throw Error('Enter 1 to 100 characters.');stopAuto();setPanel('search');$('query').value=input.query;return {results:search()};}});
  }
})();
