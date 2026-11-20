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
function reply(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
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
function doPost(e) {
  const p=PropertiesService.getScriptProperties(), d=JSON.parse(e.postData.contents);
  if(!p.getProperty('key') || d.key!==p.getProperty('key') || !/^\d+$/.test(d.warehouse)) throw Error('Доступ закрыт');

  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book=SpreadsheetApp.openById(p.getProperty('sheet'));
    if(d.warehouse !== '399276') throw Error('Другой склад');
    if(d.action==='control')return reply(control(book,p,d));
    if(d.action==='status')return reply(runStatus(book,p));
    if(d.action==='dashboard')return reply(dashboard(book,p));
    if(d.action==='locations')return reply(addAddresses(book,d.cells));
    if(d.action==='poll'){
      p.setProperty('ghWorkerAt', new Date().toISOString());
      if(p.getProperty('ghPaused')==='yes')return reply({});
    }
    if(d.action==='stock'){
      const tab=book.getSheetByName('ПФЦ '+d.warehouse+' — сверка');
      const rows=tab && tab.getLastRow()>1 ? tab.getRange(2,1,tab.getLastRow()-1,5).getValues().filter(row=>row[0]) : [];
      return reply({rows});
    }
    if(['poll','finish','fail'].includes(d.action)) return jobs(book,d,p);
    throw Error('Неизвестная команда');
  } catch(error){return reply({errorMessage:error.message});} finally {try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}
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

function addresses(book) {
  const cells=new Set();
  for(let rack=2;rack<=10;rack++) for(let shelf=1;shelf<=5;shelf++) for(let slot=1;slot<=3;slot++)
    cells.add([rack,shelf,slot].map(n=>String(n).padStart(2,'0')).join('.'));
  const tab=book.getSheetByName('GH Адреса');
  if(tab && tab.getLastRow())tab.getDataRange().getDisplayValues().forEach(([cell])=>cells.add(cell));
  return cells;
}
function appendRows(sheet,rows) {
  if(!rows.length)return;
  const first=sheet.getLastRow()+1, extra=first+rows.length-1-sheet.getMaxRows();
  if(extra>0)sheet.insertRowsAfter(sheet.getMaxRows(),extra);
  sheet.getRange(first,1,rows.length,rows[0].length).setNumberFormat('@').setValues(rows);
}
function addAddresses(book,items) {
  if(!Array.isArray(items)||items.length>10000||!items.every(cell=>/^\d{2}\.\d{2}\.\d{2}$/.test(cell)))throw Error('Допустимы адреса формата 02.01.03. До 10 000 адресов за раз.');
  const known=addresses(book), fresh=[...new Set(items)].filter(cell=>!known.has(cell));
  appendRows(book.getSheetByName('GH Адреса')||book.insertSheet('GH Адреса'),fresh.map(cell=>[cell]));
  return {total:known.size+fresh.length};
}
function currentRecords(book,p) {
  const id=p.getProperty('ghBatch');
  return id?book.getSheetByName('Запросы МХ').getDataRange().getDisplayValues().filter(r=>r[5]===id):[];
}
function runStatus(book,p,records=currentRecords(book,p)) {
  const progress={total:records.length,completed:0,failed:0,currentCell:''};
  const errors=[];
  let stopped=false;
  for(const row of records){
    if(row[2]==='Готово')progress.completed++;
    if(row[2].startsWith('Ошибка')){progress.failed++;errors.push({cell:row[1],title:'Ошибка проверки',detail:row[2]});}
    if(row[2]==='Проверяется')progress.currentCell=row[1];
    if(row[2]==='Отменено')stopped=true;
  }
  const pending=records.some(r=>!r[2]||r[2]==='Проверяется');
  let status='Ожидание';
  if(records.length){
    if(!pending)status=stopped?'Остановлено':'Завершено';
    else if(p.getProperty('ghPaused')==='yes')status='Приостановлена';
    else status=progress.currentCell?'Выполняется':'Ожидает рабочего компьютера';
  }
  const workerAt=p.getProperty('ghWorkerAt');
  return {workerAt,workerOnline:Date.now()-Date.parse(workerAt)<180000,errors,
    job:{status,progress,message:errors.length?errors[0].cell+' · '+errors[0].detail:'',finishedAt:!pending?p.getProperty('ghBatch'):''},pending};
}
function control(book,p,d) {
  const state=runStatus(book,p), q=book.getSheetByName('Запросы МХ');
  if(d.command==='start'&&!state.pending){
    const known=addresses(book);
    if(d.cell&&!known.has(d.cell))throw Error('Адрес отсутствует в справочнике');
    const batch=Utilities.getUuid();
    appendRows(q,(d.cell?[d.cell]:[...known]).map(cell=>[d.warehouse,cell,'','','',batch]));
    p.setProperties({ghBatch:batch,ghPaused:'no'});
  }else if(state.pending){
    if(d.command==='pause'||d.command==='resume')p.setProperty('ghPaused',d.command==='pause'?'yes':'no');
    if(d.command==='stop'){
      const records=q.getDataRange().getDisplayValues(), id=p.getProperty('ghBatch');
      const ranges=records.flatMap((r,i)=>r[5]===id&&(!r[2]||r[2]==='Проверяется')?['C'+(i+1)]:[]);
      if(ranges.length)q.getRangeList(ranges).setValue('Отменено');
      p.setProperty('ghPaused','no');
    }
  }
  return runStatus(book,p);
}
function dashboard(book,p) {
  const known=addresses(book), products=[], codes=new Set(), checked=new Map();
  const tab=book.getSheetByName('ПФЦ 399276 — сверка');
  const rows=tab&&tab.getLastRow()>1?tab.getRange(2,1,tab.getLastRow()-1,5).getValues():[];
  const issues=runStatus(book,p).errors, bad=new Set(issues.map(i=>i.cell));
  let units=0;
  for(const [cell,barcode,name,qty,stamp] of rows){
    if(!cell)continue;
    known.add(cell);
    const time=new Date(stamp);
    checked.set(cell,{time,occupied:Boolean(barcode)||Boolean(checked.get(cell)?.occupied)});
    if(!barcode)continue;
    products.push({barcode:String(barcode),name,qty:Number(qty),cells:[cell],nm:'—'});
    codes.add(String(barcode));units+=Number(qty);
  }
  const locations=[...known].sort().map(cell=>{
    const entry=checked.get(cell);
    return {cell,checked:entry?Utilities.formatDate(entry.time,'Europe/Moscow','dd.MM.yyyy HH:mm'):'—',
      status:bad.has(cell)?'issue':!entry?'unchecked':entry.occupied?'ok':'empty'};
  });
  const stats={locations:locations.length,units,barcodes:codes.size};
  const historySheet=book.getSheetByName('GH История')||book.insertSheet('GH История');
  if(rows.length){
    const day=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
    const snapshot=[day,units,codes.size,locations.length,issues.length];
    const last=historySheet.getLastRow();
    if(last && historySheet.getRange(last,1).getDisplayValue()===day)historySheet.getRange(last,1,1,5).setValues([snapshot]);
    else appendRows(historySheet,[snapshot]);
  }
  const history=historySheet.getLastRow()?historySheet.getDataRange().getDisplayValues().map(([date,units,barcodes,locations,issues])=>({date,units,barcodes,locations,issues})):[];
  return {mode:'SHEETS',stats,products,locations,issues,history};
}
