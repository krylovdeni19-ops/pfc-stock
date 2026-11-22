'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const labels={ok:'● Занята',empty:'○ Пуста',unchecked:'? Не проверена',issue:'! Ошибка'};
let page='stock',zone='all',selected='',locations=[],items=new Map(),status=null,pending=false,target='',lastFinish='',generation=0,revision=0;
let config=JSON.parse(sessionStorage.getItem('stock-connection')||'null');
const dialog=document.querySelector('dialog');
if(config){[$('url').value,$('key').value]=config}
function settings(){if(!dialog.open)dialog.showModal()}
$('settings').onclick=settings;
$('close').onclick=()=>dialog.close();
$('pair').onclick=()=>{if($('connect').reportValidity())document.dispatchEvent(new Event('pfc-enable'))};
document.addEventListener('pfc-enabled',()=>$('feedback').textContent='Складской компьютер подключён.');
async function request(action,data={},credentials=config){
  if(!credentials)throw Error('Откройте настройки подключения.');
  const [url,key]=credentials;
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))throw Error('Укажите полный адрес Apps Script с окончанием /exec.');
  const response=await fetch(url,{method:'POST',body:JSON.stringify({action,...data,key,warehouse:'399276'}),signal:AbortSignal.timeout(35000)});
  if(!response.ok || !response.headers.get('content-type')?.includes('json'))throw Error('Проверьте доступ к Apps Script и ключ подключения.');
  const result=await response.json();
  if(result.errorMessage)throw Error(result.errorMessage);
  return result;
}
function inventory(data){
  locations=data.locations.slice().sort((a,b)=>a.cell.localeCompare(b.cell,'ru',{numeric:true}));
  items=new Map();
  for(const product of data.products)for(const address of product.cells){
    if(!items.has(address))items.set(address,[]);
    items.get(address).push(product);
  }
  render();
}
$('connect').onsubmit=async event=>{
  event.preventDefault();
  const next=[$('url').value.trim(),$('key').value];
  try{
    $('feedback').textContent='Проверяем подключение…';
    const data=await request('dashboard',{},next);
    config=next;generation++;status=null;lastFinish='';target='';
    sessionStorage.setItem('stock-connection',JSON.stringify(next));
    inventory(data);dialog.close();$('notice').textContent='';$('feedback').textContent='';poll();
  }catch(e){$('feedback').textContent=e.message}
};
function setPage(next){
  page=next;
  $('browse').hidden=['scan','generator'].includes(page);$('generator').hidden=page!=='generator';$('scan').hidden=page!=='scan';
  $('title').textContent={stock:'Поиск остатков',map:'Карта склада',scan:'Сверка склада',generator:'Генератор МХ'}[page];
  for(const btn of document.querySelectorAll('nav button'))btn.classList.toggle('on',btn.dataset.page===page);
  render();
}
function render(){
  const query=$('search').value.trim().toLowerCase();
  const rows=[];
  for(const loc of locations){
    const pallet=loc.cell.startsWith('01.01.');
    if((zone==='pallet'&&!pallet)||(zone==='rack'&&pallet))continue;
    const positions=items.get(loc.cell)||[];
    const matches=loc.cell.includes(query)?positions:positions.filter(p=>[p.barcode,p.name,p.nm].some(v=>String(v||'').toLowerCase().includes(query)));
    if(!loc.cell.includes(query)&&!matches.length)continue;
    rows.push({loc,matches,qty:matches.reduce((sum,p)=>sum+Number(p.qty),0)});
  }
  if(!rows.some(r=>r.loc.cell===selected))selected=rows[0]?.loc.cell||'';
  $('count').textContent=rows.length+' МХ'+(query?' · '+rows.reduce((sum,r)=>sum+r.qty,0)+' шт.':'');
  for(const btn of document.querySelectorAll('[data-zone]'))btn.classList.toggle('on',btn.dataset.zone===zone);
  $('listTitle').textContent=page==='map'?'Схема хранения':'Адреса хранения';
  const name=loc=>labels[loc.status]||labels.unchecked;
  if(!rows.length)$('results').textContent=config?'Адресов по запросу нет.':'Подключите таблицу через ⚙ в верхнем меню.';
  else if(page==='map'){
    const groups=new Map();
    for(const {loc} of rows){
      const [rack,shelf,n]=loc.cell.split('.');
      const start=Math.floor((Number(n)-1)/50)*50+1;
      const group=rack==='01'?'Паллеты '+start+'–'+(start+49):'Стеллаж '+rack;
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group).push(loc);
    }
    const [current,cells]=[...groups].find(([,group])=>group.some(loc=>loc.cell===selected));
    const options=[...groups].map(([title,group])=>'<option value="'+esc(group[0].cell)+'"'+(title===current?' selected':'')+'>'+esc(title)+'</option>').join('');
    const button=loc=>{
      const slot=loc.cell.split('.')[2],status=name(loc),hint=esc(loc.cell+' · '+status);
      return '<button class="slot" data-cell="'+esc(loc.cell)+'" aria-pressed="'+(loc.cell===selected)+'" title="'+hint+'" aria-label="'+hint+'"><span>'+esc(slot)+'</span><small>'+esc(status.split(' ')[0])+'</small></button>';
    };
    const levels=new Map();
    for(const loc of cells){
      const shelf=loc.cell.split('.')[1];
      if(!levels.has(shelf))levels.set(shelf,[]);
      levels.get(shelf).push(loc);
    }
    const shelves=current.startsWith('Паллеты')?'<div class="slots pallet-slots">'+cells.map(button).join('')+'</div>':
      [...levels].reverse().map(([shelf,slots])=>'<div class="shelf-line"><small>Полка '+esc(shelf)+'</small><div class="slots">'+slots.map(button).join('')+'</div></div>').join('');
    $('results').innerHTML='<div class="simple-map"><select id="rackChoice" aria-label="Стеллаж или паллетная зона">'+options+'</select>'+shelves+'<small class="map-key">● Занята　○ Пуста　? Не проверена　! Ошибка</small></div>';
    $('rackChoice').onchange=event=>{
      selected=event.target.value;
      render();
      $('rackChoice').focus();
    };
  }else{
    $('results').innerHTML='<table><thead><tr><th>МХ</th><th>Состояние</th><th>БК</th><th>Шт.</th></tr></thead><tbody>'+rows.map(({loc,matches,qty})=>{
      const known=loc.checked && loc.checked!=='—';
      return '<tr class="'+(loc.cell===selected?'selected':'')+'"><td><button data-cell="'+esc(loc.cell)+'">'+esc(loc.cell)+'</button></td><td class="'+esc(loc.status)+'">'+esc(name(loc))+'</td><td>'+(known?new Set(matches.map(p=>p.barcode)).size:'—')+'</td><td>'+(known?qty:'—')+'</td></tr>';
    }).join('')+'</tbody></table>';
  }
  const loc=rows.find(r=>r.loc.cell===selected)?.loc;
  if(!loc){$('detail').textContent='Выберите МХ для просмотра состава.';return}
  const list=items.get(selected)||[],parts=selected.split('.');
  $('detail').innerHTML='<small>'+esc(parts[0]==='01'?'Паллетное хранение':'Стеллаж '+parts[0]+' / Полка '+parts[1])+'</small><h2>МХ '+esc(selected)+'</h2><p><b>'+ (loc.checked==='—'?'Количество неизвестно':new Set(list.map(p=>p.barcode)).size+' БК　·　'+list.reduce((n,p)=>n+Number(p.qty),0)+' шт.')+'</b></p><p class="muted">'+(loc.checked==='—'?'Проверок пока нет':'Проверено '+esc(loc.checked)+' МСК')+'</p><h3>Состав ячейки</h3>'+list.map(p=>'<div class="item"><div>'+esc(p.name)+'<small>БК '+esc(p.barcode)+'　·　Артикул WB '+esc(p.nm||'—')+'</small></div><strong>'+esc(p.qty)+' шт.</strong></div>').join('')+(!list.length?'<p>'+esc(name(loc))+'</p>':'')+'<button class="primary" data-verify>Проверить этот МХ</button>';
  $('detail').querySelector('button').disabled=pending||!!status?.pending;
}
function elapsed(job){
  if(!job?.startedAt)return '';
  const seconds=Math.max(0,Math.floor(((Date.parse(job.endedAt)||Date.now())-Date.parse(job.startedAt))/1000));
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
function tick(){
  const job=status?.job,t=elapsed(job);
  $('clock').textContent=t||'—';
  $('strip').textContent=job?.progress?.total?'Сверка · '+job.status+'　 '+(job.progress.completed+job.progress.failed)+' / '+job.progress.total+' МХ'+(t?'　 '+t:''):'Состояние сверки · нет заданий';
}
function update(s){
  status=s;
  const job=s.job||{},p=job.progress||{};
  $('pc').textContent=s.workerOnline?'● ПК в сети':'○ ПК вне сети';$('pc').classList.toggle('online',s.workerOnline);
  $('state').textContent=job.status||'Ожидание';
  $('numbers').textContent='Проверено '+(p.completed||0)+' из '+(p.total||0)+' МХ　·　Ошибок '+(p.failed||0);
  $('progress').max=p.total||1;$('progress').value=(p.completed||0)+(p.failed||0);
  $('active').textContent='Сейчас проверяются: '+(p.currentCell||'—');
  $('signal').textContent='Последний сигнал ПК: '+(s.workerAt?new Date(s.workerAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'—');
  $('errors').textContent=(s.errors||[]).map(e=>e.cell+' · '+e.detail).join('\n')||'Ошибок нет.';
  if(target){
    $('notice').textContent='МХ '+target+' · '+(s.pending?(p.currentCell?'Проверяется':'В очереди'):(s.errors||[]).find(e=>e.cell===target)?.detail||job.status);
    if(!s.pending)target='';
  }
  for(const btn of document.querySelectorAll('[data-cmd]')){
    const cmd=btn.dataset.cmd;
    btn.disabled=pending||(cmd==='start'?!!s.pending:!s.pending||(cmd==='resume'&&job.status!=='Приостановлена')||(cmd==='pause'&&job.status==='Приостановлена'));
  }
  const verify=$('detail').querySelector('button');
  if(verify)verify.disabled=pending||!!s.pending;
  tick();
}
let polling=false;
async function poll(){
  if(!config||pending||polling)return;
  polling=true;
  const rev=revision,gen=generation;
  try{
    const s=await request('status');
    if(rev!==revision||gen!==generation)return;
    update(s);
    if(s.job?.finishedAt && lastFinish!==s.job.finishedAt){
      const data=await request('dashboard',{fresh:true});
      if(rev===revision&&gen===generation){inventory(data);lastFinish=s.job.finishedAt}
    }
  }catch(e){$('notice').textContent=e.message}finally{polling=false}
}
async function command(cmd,cell=''){
  if(!config){settings();return}
  if(pending)return;
  if(cmd==='stop'&&!confirm('Остановить текущую сверку?'))return;
  pending=true;revision++;$('notice').textContent='Отправляем команду…';
  try{
    const s=await request('control',{command:cmd,cell});
    pending=false;target=s.startAccepted===true?cell:'';
    $('notice').textContent=s.startAccepted===false?'Очередь занята. Подробности во вкладке «Сверка».':'Команда принята.';
    update(s);
  }catch(e){$('notice').textContent=e.message}finally{pending=false}
}
document.addEventListener('click',event=>{
  const btn=event.target.closest('button');
  if(!btn)return;
  if(btn.dataset.page)setPage(btn.dataset.page);
  if(btn.dataset.zone){zone=btn.dataset.zone;render()}
  if(btn.dataset.cell){selected=btn.dataset.cell;render();if(innerWidth<=850)$('detail').scrollIntoView({block:'start'})}
  if(btn.hasAttribute('data-verify'))command('start',selected);
  if(btn.dataset.cmd)command(btn.dataset.cmd);
});
$('search').oninput=render;
setPage('stock');
if(config)request('dashboard').then(inventory).catch(e=>$('notice').textContent=e.message);
poll();
setInterval(()=>{if(!document.hidden)poll()},15000);
setInterval(tick,1000);
