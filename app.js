const $=id=>document.getElementById(id)
const dialog=document.querySelector('dialog')
const demo=[
 ['02.01.01','2058206753891','Сумка дорожная спортивная с карманами',5,''],
 ['02.01.01','2058277117462','Рюкзак камуфляжный для поездок и рыбалки',5,''],
 ['02.01.01','2058345786262','Рюкзак пиксельный камуфляж хаки для поездок и рыбалки',5,'']
]
let rows=demo, live=false
const fmt=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'})
function racks(){
 const old=$('rack').value
 $('rack').replaceChildren(new Option('Все стеллажи',''))
 for(const r of [...new Set(rows.map(row=>row[0].split('.')[0]))].sort()) $('rack').add(new Option('Стеллаж '+r,r))
 if([...$('rack').options].some(opt=>opt.value===old)) $('rack').value=old
}
function render(){
 const q=$('query').value.trim().toLocaleLowerCase('ru')
 const matches=rows.filter(([cell,code,name])=>(!$('rack').value||cell.startsWith($('rack').value+'.'))&&
 (!$('status').value||(code?'busy':'empty')===$('status').value)&&[cell,code,name].some(x=>String(x).toLowerCase().includes(q)))
 $('cells').textContent=new Set(matches.map(r=>r[0])).size
 $('codes').textContent=new Set(matches.map(r=>r[1]).filter(Boolean)).size
 $('units').textContent=matches.reduce((n,r)=>n+Number(r[3]),0).toLocaleString('ru')
 const body=document.querySelector('tbody');body.replaceChildren()
 for(const [cell,code,name,qty,time] of matches){
  const tr=body.insertRow()
  for(const v of [cell,code||'—',name,qty,time?fmt.format(new Date(time)):'Пример']) tr.insertCell().textContent=v
 }
 $('none').hidden=!!matches.length
 $('none').textContent=rows.length?'Совпадений нет. Проверьте адрес или измените фильтры.':'В таблице пока нет проверенных ячеек. Выберите ячейку и нажмите «Обновить».'
}
async function sync(){
 const url=$('url').value.trim()
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))throw Error('Введите URL развёртывания с окончанием /exec.')
 const res=await fetch(url,{method:'POST',body:JSON.stringify({action:'stock',warehouse:'399276',key:$('key').value}),signal:AbortSignal.timeout(30000)})
 const data=await res.json()
 if(!res.ok||!Array.isArray(data.rows)||!data.rows.every(r=>Array.isArray(r)&&r.length===5&&typeof r[0]==='string'&&Number.isFinite(Date.parse(r[4]))))throw Error('Ошибка данных')
 sessionStorage.setItem('stock-connection',JSON.stringify([url,$('key').value]))
 rows=data.rows;live=true;racks();render()
 $('source').textContent='Данные Google Таблицы · загружены '+fmt.format(new Date())
 $('settings').textContent='Подключение';$('msg').textContent='';dialog.close()
}
async function load(){
 $('refresh').disabled=true;$('connect').querySelector('button.primary').disabled=true;$('error').textContent=''
 try{await sync()}catch(e){
 const error='Не удалось загрузить остатки. Проверьте URL, ключ и версию Code.gs.'
 $('error').textContent=error;$('msg').textContent=error
 }finally{$('refresh').disabled=!live;$('connect').querySelector('button.primary').disabled=false}
}
$('connect').onsubmit=e=>{e.preventDefault();load()}
$('refresh').onclick=startJob;$('settings').onclick=()=>dialog.showModal();$('close').onclick=()=>dialog.close()
$('query').oninput=render;$('status').onchange=render;$('rack').onchange=render
racks();render()
const saved=sessionStorage.getItem('stock-connection')
if(saved){[$('url').value,$('key').value]=JSON.parse(saved);load().then(()=>{const job=sessionStorage.getItem(batchKey);if(live&&job)track(JSON.parse(job))})}

const batchKey='pfc-active-job'
let monitoring=false
function showPair(){
 $('pair').hidden=document.documentElement.dataset.pfcAgent!=='3'
}
$('settings').addEventListener('click',showPair)
$('pair').onclick=()=>{
 if(!$('connect').reportValidity())return
 document.dispatchEvent(new Event('pfc-enable'))
}
document.addEventListener('pfc-enabled',()=>{$('error').textContent='Обработка включена на этом компьютере.'})
$('scope').onchange=()=>{$('target').disabled=$('scope').value==='all'}
async function jobCall(action,job){
 const [url,key]=JSON.parse(sessionStorage.getItem('stock-connection'))
 const response=await fetch(url,{method:'POST',body:JSON.stringify({...job,action,warehouse:'399276',key}),signal:AbortSignal.timeout(25000)})
 const state=await response.json()
 if(!response.ok||!Number.isInteger(state.total)||state.total<1)throw Error('Проверьте версию Code.gs и подключение')
 return state
}
async function startJob(){
 if(!live||monitoring)return
 const cell=$('scope').value==='all'?'':$('target').value.trim()
 if($('scope').value==='one'&&!/^(0[2-9]|10)\.0[1-5]\.0[1-3]$/.test(cell)){
   $('progress').textContent='Введите адрес склада, например 02.01.01';return
 }
 const job=JSON.parse(sessionStorage.getItem(batchKey)||'null')||{batch:crypto.randomUUID(),cell}
 sessionStorage.setItem(batchKey,JSON.stringify(job))
 await track(job)
}
async function track(job){
 if(monitoring)return
 monitoring=true;$('refresh').disabled=true
 try{
   let state=await jobCall('enqueue',job)
   while(state.done+state.failed<state.total){
     $('progress').textContent=(state.active?'Проверяется '+state.active:'Ожидание складского компьютера')+' · готово '+state.done+' из '+state.total+(state.failed?' · ошибок '+state.failed:'')
     await new Promise(resolve=>setTimeout(resolve,4000))
     state=await jobCall('progress',job)
   }
   sessionStorage.removeItem(batchKey)
   await sync()
   $('progress').textContent='Проверено '+state.done+' из '+state.total+(state.failed?' · '+state.error:' · остатки обновлены')
 }catch(e){$('progress').textContent='Связь с таблицей прервана. Проверьте подключение и версию Code.gs, затем нажмите «Обновить». '+e.message}
 finally{monitoring=false;$('refresh').disabled=!live}
}
