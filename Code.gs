function setup() {
  const p=PropertiesService.getScriptProperties();
  p.setProperty('sheet',SpreadsheetApp.getActive().getId());
  if(!p.getProperty('key')) p.setProperty('key',Utilities.getUuid());
  const book=SpreadsheetApp.getActive();
  const q=book.getSheetByName('Запросы МХ')||book.insertSheet('Запросы МХ');
  if(q.getLastRow()===0){
    q.appendRow(['ПФЦ','МХ для проверки','Статус','Номер запроса','Срок обработки']);
    q.getRange('A:B').setNumberFormat('@');
    q.setFrozenRows(1);
  }
  console.log(p.getProperty('key'));
}
function reply(data){return ContentService.createTextOutput(JSON.stringify(data));}
function jobs(book,d,p){
  const q=book.getSheetByName('Запросы МХ');
  if(!q) throw Error('Сначала выполните setup');
  const data=q.getDataRange().getDisplayValues();
  for(let i=1;i<data.length;i++){
    const [wh,cell,status,id,until]=data[i];
    if(wh!==d.warehouse || !/^\d{2}\.\d{2}\.\d{2}$/.test(cell)) continue;
    if(d.action==='poll'){
      if(status && !(status==='Проверяется' && Number(until)<Date.now())) continue;
      const token=Utilities.getUuid();
      q.getRange(i+1,3,1,3).setValues([['Проверяется',token,String(Date.now()+600000)]]);
      return reply({cell,token});
    }
    if(status!=='Проверяется'||!id||id!==d.token||cell!==d.cell) continue;
    if(d.action==='finish'){
      if(!d.rows.every(r=>r[0]===cell)) throw Error('Адрес изменился');
      writeStock(book,d,true);
    }
    q.getRange(i+1,3,1,3).setValues([[d.action==='finish'?'Готово':'Ошибка: '+String(d.error).slice(0,250),id,'']]);
    return reply({ok:true});
  }
  return reply(d.action==='poll'?{}:{ok:false});
}
function siteJob(book,d){
  const q=book.getSheetByName('Запросы МХ');
  if(!q || !/^[a-f0-9-]{36}$/.test(d.batch)) throw Error('Проверьте setup и номер запроса');
  const records=q.getDataRange().getDisplayValues().filter(r=>r[5]===d.batch && r[0]===d.warehouse);
  if(!records.length && d.action==='enqueue'){
    const cells=[];
    for(let rack=2;rack<=10;rack++)for(let shelf=1;shelf<=5;shelf++)for(let slot=1;slot<=3;slot++)
      cells.push([rack,shelf,slot].map(n=>String(n).padStart(2,'0')).join('.'));
    if(d.cell && !cells.includes(d.cell)) throw Error('Адрес вне диапазона склада');
    const items=(d.cell?[d.cell]:cells).map(cell=>[d.warehouse,cell,'','','',d.batch]);
    q.getRange(q.getLastRow()+1,1,items.length,6).setValues(items);
    return reply({total:items.length,done:0,failed:0});
  }
  const failed=records.filter(r=>r[2].startsWith('Ошибка'));
  return reply({total:records.length,done:records.filter(r=>r[2]==='Готово').length,
    active:records.find(r=>r[2]==='Проверяется')?.[1]||'',failed:failed.length,
    error:failed.length?failed[0][1]+' · '+failed[0][2]:''});
}
function doPost(e) {
  const p=PropertiesService.getScriptProperties(), d=JSON.parse(e.postData.contents);
  if(!p.getProperty('key') || d.key!==p.getProperty('key') || !/^\d+$/.test(d.warehouse)) throw Error('Доступ закрыт');

  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book=SpreadsheetApp.openById(p.getProperty('sheet'));
    if(['enqueue','progress'].includes(d.action))return siteJob(book,d);
    if(d.action==='stock'){
      const tab=book.getSheetByName('ПФЦ '+d.warehouse+' — сверка');
      const rows=tab && tab.getLastRow()>1 ? tab.getRange(2,1,tab.getLastRow()-1,5).getValues().filter(row=>row[0]) : [];
      return reply({rows});
    }
    if(['poll','finish','fail'].includes(d.action)) return jobs(book,d,p);
    writeStock(book,d,false);
    return ContentService.createTextOutput('OK');
  } finally {try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}
}
function writeStock(book,d,partial){
  if(!Array.isArray(d.rows)||!d.rows.length||!d.rows.every(r=>Array.isArray(r)&&r.length===5&&/^\d\d\.\d\d\.\d\d$/.test(r[0])&&typeof r[1]==='string'&&/^(?:[A-Za-z0-9][A-Za-z0-9_-]*)?$/.test(r[1])&&typeof r[2]==='string'&&Number.isSafeInteger(r[3])&&r[3]>=0&&Number.isFinite(Date.parse(r[4])))) throw Error('Ошибка формата');
    const title='ПФЦ '+d.warehouse+' — сверка';
    const tab=book.getSheetByName(title)||book.insertSheet(title);
    const header=['МХ','Баркод','Товар','Количество','Проверено (UTC)'];
    if(tab.getLastRow() && JSON.stringify(tab.getRange(1,1,1,5).getValues()[0])!==JSON.stringify(header)) throw Error('Лист занят');
    const previous=tab.getLastRow()>1?tab.getRange(2,1,tab.getLastRow()-1,5).getValues():[];
    const byCell=new Map();
    for(const row of d.rows){
      if(!byCell.has(row[0])) byCell.set(row[0],[]);
      byCell.get(row[0]).push(row);
    }
    const retained=previous.filter(row=>{
      const incoming=byCell.get(String(row[0]));
      return incoming ? Date.parse(row[4])>Date.parse(incoming[0][4]) : partial;
    });
    const keep=new Set(retained.map(row=>String(row[0])));
    const stock=retained.concat(d.rows.filter(row=>!keep.has(row[0]))).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const rows=[header,...stock.map(r=>[r[0],r[1],String(r[2]).startsWith('=')?"'"+r[2]:r[2],r[3],r[4]])];
    while(rows.length<tab.getLastRow()) rows.push(['','','','','']);
    if(rows.length>tab.getMaxRows()) tab.insertRowsAfter(tab.getMaxRows(),rows.length-tab.getMaxRows());
    tab.getRange(1,1,rows.length,2).setNumberFormat('@');
    tab.getRange(1,1,rows.length,5).setValues(rows);
}
