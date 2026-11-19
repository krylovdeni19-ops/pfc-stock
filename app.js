const $=id=>document.getElementById(id)
const dialog=document.querySelector('dialog')
const demo=[
 ['02.01.01','DEMO-001','Коробка для хранения',5,''],
 ['02.01.01','DEMO-002','Органайзер',3,''],
 ['02.01.02','DEMO-001','Коробка для хранения',2,'']
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
 $('none').textContent=rows.length?'Совпадений нет. Проверьте адрес или измените фильтры.':'В таблице пока нет проверенных ячеек. Запустите сверку в расширении.'
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
 $('refresh').disabled=true;$('connect').querySelector('button').disabled=true;$('error').textContent=''
 try{await sync()}catch(e){
 const error='Не удалось загрузить остатки. Проверьте URL, ключ и версию Code.gs.'
 $('error').textContent=error;$('msg').textContent=error
 }finally{$('refresh').disabled=!live;$('connect').querySelector('button').disabled=false}
}
$('connect').onsubmit=e=>{e.preventDefault();load()}
$('refresh').onclick=load;$('settings').onclick=()=>dialog.showModal();$('close').onclick=()=>dialog.close()
$('query').oninput=render;$('status').onchange=render;$('rack').onchange=render
racks();render()
const saved=sessionStorage.getItem('stock-connection')
if(saved){[$('url').value,$('key').value]=JSON.parse(saved);load()}
