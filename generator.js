(()=>{
'use strict';
const byId=$;
  var genBlocks = [{from:2,to:2,shelves:5,cells:3}];
  var genValues = [];
  function genPad(n){return String(n).padStart(2,'0');}
  function genInput(label,cls,value){return '<label class="gen-field"><span>'+label+'</span><input class="'+cls+'" type="number" min="1" max="999" step="1" inputmode="numeric" value="'+value+'"></label>';}
  function genBlockMarkup(b,i){
    return '<div class="gen-block" data-gen-index="'+i+'"><div class="gen-block-head"><b>Блок '+(i+1)+'</b>'+
      (i?'<button type="button" class="gen-btn gen-danger" data-gen-delete>Удалить блок</button>':'')+
      '</div><div class="gen-block-grid">'+genInput('Стеллажи: с','from',b.from)+genInput('Стеллажи: по','to',b.to)+genInput('Количество полок','shelves',b.shelves)+genInput('Ячеек на полке','cells',b.cells)+'</div></div>';
  }
  function genRenderBlocks(){byId('generatorBlocks').innerHTML=genBlocks.map(genBlockMarkup).join('');genInvalidate();}
  function genCaptureBlocks(){genBlocks=Array.prototype.slice.call(byId('generatorBlocks').querySelectorAll('.gen-block')).map(function(el){return {from:el.querySelector('.from').value,to:el.querySelector('.to').value,shelves:el.querySelector('.shelves').value,cells:el.querySelector('.cells').value};});}
  function genReadBlocks(){
    var elements=Array.prototype.slice.call(byId('generatorBlocks').querySelectorAll('.gen-block'));
    if(!elements.length)throw Error('Добавьте хотя бы один блок стеллажей.');
    var blocks=elements.map(function(el){
      function read(c,label){var field=el.querySelector('.'+c),raw=field.value.trim(),n=Number(raw);if(raw===''||!Number.isSafeInteger(n)||n<1||n>999){field.setAttribute('aria-invalid','true');throw Error('Поле «'+label+'» должно содержать целое число от 1 до 999.');}field.removeAttribute('aria-invalid');return n;}
      return {from:read('from','Стеллажи: с'),to:read('to','Стеллажи: по'),shelves:read('shelves','Количество полок'),cells:read('cells','Ячеек на полке')};
    }).sort(function(a,b){return a.from-b.from;});
    var last=0;
    blocks.forEach(function(b){if(b.to>99||b.shelves>99||b.cells>(b.from===1?350:99))throw Error('Проверьте диапазон адресов ПФЦ.');
      if(b.from===1&&(b.to!==1||b.shelves!==1))throw Error('Для паллет задайте отдельный блок: стеллаж 1, полка 1.');
      if(b.to<b.from)throw Error('В одном из блоков конечный номер стеллажа меньше начального.');if(b.from<=last)throw Error('Диапазоны стеллажей пересекаются. Исправьте блоки: один стеллаж нельзя генерировать дважды.');last=b.to;});
    var total=blocks.reduce(function(sum,b){return sum+(b.to-b.from+1)*b.shelves*b.cells;},0);
    if(total>10000)throw Error('Получится '+total.toLocaleString('ru-RU')+' адресов. Максимум за одну генерацию — 10 000.');
    return blocks;
  }
  function genMakeValues(){
    var out=[];genReadBlocks().forEach(function(b){for(var r=b.from;r<=b.to;r++)for(var sh=1;sh<=b.shelves;sh++)for(var c=1;c<=b.cells;c++)out.push(genPad(r)+'.'+genPad(sh)+'.'+genPad(c));});
    return out;
  }
  function genInvalidate(){
    genValues=[];['genCsv','genSaveToSheets','genPrint'].forEach(function(id){var el=byId(id);if(el)el.disabled=true;});
    if(byId('genResult'))byId('genResult').hidden=true;if(byId('genPrintArea'))byId('genPrintArea').innerHTML='';
    genSummary();previewLabel();
  }
  function genSummary(){try{var v=genMakeValues();byId('genSummary').textContent='Будет создано '+v.length.toLocaleString('ru-RU')+' МХ · '+v[0]+' — '+v[v.length-1]+'.';}catch(e){byId('genSummary').textContent=e.message;}}
  function genGfMul(x,y){var z=0;for(var i=0;i<8;i++){if(y&1)z^=x;y>>=1;x<<=1;if(x&256)x^=0x11d;}return z;}
  function genRs(data,n){var gen=[1],root=1;for(var i=0;i<n;i++){var next=Array(gen.length+1).fill(0);gen.forEach(function(v,j){next[j]^=v;next[j+1]^=genGfMul(v,root);});gen=next;root=genGfMul(root,2);}var res=Array(n).fill(0);data.forEach(function(v){var k=v^res.shift();res.push(0);gen.slice(1).forEach(function(g,i){res[i]^=genGfMul(g,k);});});return res;}
  function genQrSvg(value){
    var bytes=Array.from(new TextEncoder().encode(value));if(bytes.length>17)throw Error('Адрес слишком длинный для QR версии 1-L: '+value);
    var bits=[];function put(v,n){for(var i=n-1;i>=0;i--)bits.push((v>>>i)&1);}put(4,4);put(bytes.length,8);bytes.forEach(function(b){put(b,8);});put(0,Math.min(4,152-bits.length));while(bits.length%8)bits.push(0);
    var data=[];for(var i=0;i<bits.length;i+=8){var v=0;for(var j=0;j<8;j++)v=(v<<1)|bits[i+j];data.push(v);}for(var p=0;data.length<19;p++)data.push(p%2?0x11:0xec);
    var code=data.concat(genRs(data,7)),n=21,m=Array.from({length:n},function(){return Array(n).fill(null);});
    function finder(x,y){for(var dy=-1;dy<=7;dy++)for(var dx=-1;dx<=7;dx++){var xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=n||yy>=n)continue;var on=dx>=0&&dx<=6&&dy>=0&&dy<=6&&(dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4));m[yy][xx]=on?1:0;}}
    finder(0,0);finder(14,0);finder(0,14);for(var q=8;q<13;q++){m[6][q]=q%2?0:1;m[q][6]=q%2?0:1;}for(var k=0;k<9;k++)if(k!==6){m[8][k]=0;m[k][8]=0;}for(var t=0;t<8;t++){m[8][20-t]=0;m[20-t][8]=0;}m[8][13]=0;m[13][8]=0;
    var bit=0,up=true;for(var x=20;x>=1;x-=2){if(x===6)x=5;for(var row=0;row<21;row++){var y=up?20-row:row;for(var dx2=0;dx2<2;dx2++){var xx2=x-dx2;if(m[y][xx2]!==null)continue;var bb=bit<code.length*8?((code[bit>>>3]>>>(7-(bit&7)))&1):0;bit++;if((y+xx2)%2===0)bb^=1;m[y][xx2]=bb;}}up=!up;}
    var rem=8;for(var f=0;f<10;f++)rem=(rem<<1)^((rem>>>9)*0x537);var format=((8<<10)|rem)^0x5412;
    for(var ii=0;ii<15;ii++){var fb=(format>>>ii)&1;if(ii<6)m[ii][8]=fb;else if(ii<8)m[ii+1][8]=fb;else m[20-14+ii][8]=fb;if(ii<8)m[8][20-ii]=fb;else if(ii<9)m[8][15-ii]=fb;else m[8][14-ii]=fb;}m[13][8]=1;
    var rects='';for(var yy=0;yy<n;yy++)for(var xxx=0;xxx<n;xxx++)if(m[yy][xxx])rects+='<rect x="'+xxx+'" y="'+yy+'" width="1" height="1"/>';
    return '<svg class="gen-qr" xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 29 29" shape-rendering="crispEdges" role="img" aria-label="QR '+value+'"><rect x="-4" y="-4" width="29" height="29" fill="white"/><g fill="black">'+rects+'</g></svg>';
  }
  function genArrowSvg(direction){var path=direction==='down'?'M12 24 L2 10 H9 V0 H15 V10 H22 Z':'M12 0 L22 14 H15 V24 H9 V14 H2 Z';return '<svg class="gen-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'" fill="black"/></svg>';}
  function genCreate(){
    try{
      genValues=genMakeValues();if(!genValues.length)throw Error('Нет мест хранения для создания.');
      var arrows=byId('genArrows').checked,downRaw=byId('genDownShelf').value.trim(),downShelf=Number(downRaw);
      if(arrows&&(!downRaw||!Number.isSafeInteger(downShelf)||downShelf<1||downShelf>999))throw Error('Укажите корректный номер полки для стрелки вниз (1–999).');
      byId('genRows').innerHTML=genValues.map(function(v,i){return '<tr><td>'+(i+1)+'</td><td>'+v+'</td></tr>';}).join('');
      byId('genResultInfo').textContent='Создано '+genValues.length.toLocaleString('ru-RU')+' уникальных адресов.';byId('genResult').hidden=false;
      ['genCsv','genPrint','genSaveToSheets'].forEach(function(id){byId(id).disabled=false;});
      previewLabel();byId('genStatus').className='gen-status ok';byId('genStatus').textContent='Готово: адреса, QR-коды и этикетки сформированы.';byId('genResult').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){genValues=[];['genCsv','genPrint','genSaveToSheets'].forEach(function(id){byId(id).disabled=true;});byId('genPrintArea').innerHTML='';byId('genStatus').className='gen-status err';byId('genStatus').textContent=e.message;}
  }
  function genDownloadCsv(){if(!genValues.length)return;var csv='Адрес МХ\r\n'+genValues.map(function(v){return '"'+v+'"';}).join('\r\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='PFC-Analytics_места-хранения.csv';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
  function labelMarkup(address){
    const arrow=byId('genArrows').checked?genArrowSvg(Number(address.split('.')[1])===Number(byId('genDownShelf').value)?'down':'up'):'';
    return '<div class="gen-label">'+genQrSvg(address)+arrow+'<span class="gen-address">'+address+'</span></div>';
  }
  function previewLabel(){
    const shape=byId('shape').value, w=byId('labelW'), h=byId('labelH');
    h.disabled=shape==='square';
    if(h.disabled)h.value=w.value;
    const width=Number(w.value),height=Number(h.value);
    const valid=width>=30 && width<=190 && height>=25 && height<=250 && Number.isInteger(width) && Number.isInteger(height);
    byId('genPrint').disabled=!valid||!genValues.length;
    byId('labelInfo').textContent=valid?'Образец · '+width+' × '+height+' мм':'Введите ширину 30–190 мм и высоту 25–250 мм.';
    const preview=byId('labelPreview');
    preview.innerHTML=valid?labelMarkup(genValues[0]||'02.01.01'):'';
    if(valid){
      const style=document.documentElement.style;
      style.setProperty('--label-w',width+'mm');style.setProperty('--label-h',height+'mm');
      style.setProperty('--label-radius',shape==='rounded'?'4mm':'0');
      style.setProperty('--qr-side',Math.min(height-10,width-(byId('genArrows').checked?10:4))+'mm');
    }
    return valid;
  }
  function genInit(){
    for(const id of ['genArrows','genDownShelf'])byId(id).addEventListener('input',genInvalidate);
    byId('labelLayout').addEventListener('input',previewLabel);
    genRenderBlocks();byId('genAddBlock').addEventListener('click',function(){genCaptureBlocks();genBlocks.push({from:'',to:'',shelves:'',cells:''});genRenderBlocks();});
    byId('generatorBlocks').addEventListener('input',function(){genCaptureBlocks();genInvalidate();});
    byId('generatorBlocks').addEventListener('click',function(e){var del=e.target.closest('[data-gen-delete]');if(del){genCaptureBlocks();var el=del.closest('.gen-block');genBlocks.splice(Number(el.getAttribute('data-gen-index')),1);genRenderBlocks();}});
    byId('genCreate').addEventListener('click',genCreate);byId('genCsv').addEventListener('click',genDownloadCsv);
    var saveBtn=byId('genSaveToSheets');saveBtn.addEventListener('click',function(){if(!genValues.length)return;if(!config){settings();return}saveBtn.disabled=true;byId('genStatus').textContent='Сохраняю адреса в Google Таблицу…';request('locations',{cells:genValues}).then(r=>{byId('genStatus').textContent='Адресов в справочнике: '+r.total;return request('dashboard',{fresh:true}).then(inventory);}).catch(e=>byId('genStatus').textContent=e.message).finally(()=>saveBtn.disabled=!genValues.length);});
    byId('genPrint').addEventListener('click',function(){if(!genValues.length)return;
      if(!previewLabel())return;
      byId('genPrintArea').innerHTML=genValues.map(labelMarkup).join('');window.print();});
  }
genInit();
})();
