
/* GRIZZLY HUG STORAGE v4.5 — audited heatmap, issues and history */
(function () {
  'use strict';

  var appData = {locations:[], products:[], stats:{}, history:[], issues:[]};
  var pageTitles = {
    dashboard: 'Обзор', storage: 'Адресное хранение', generator: 'Генератор МХ и этикеток', products: 'Поиск товаров',
    issues: 'Проблемы', history: 'История изменений', map: 'Карта склада',
    sync: 'Синхронизация', settings: 'Настройки'
  };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }
  function statusLabel(status) {
    return ({ok:'Актуальная', occupied:'Есть товар · не проверена', stale:'Неактуальная', issue:'Проблема', empty:'Пустая', unchecked:'Не проверена'})[status] || 'Неизвестно';
  }
  function statusBadge(status) {
    return '<span class="status-badge status-' + escapeHtml(status) + '">' + statusLabel(status) + '</span>';
  }

  function renderStockHistory() {
    var host = byId('stockHistoryChart');
    var rows = appData && Array.isArray(appData.history) ? appData.history : [];
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<div class="stock-chart-empty"><b>История пока не накоплена</b><span>График начнёт строиться после первого обновления данных из Google Таблицы. Один снимок сохраняется в день.</span></div>';
      byId('stockChartPeriod').textContent = 'Нет истории';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r.units) || 0; }).concat([1]));
    var top = Math.ceil(max / 10) * 10;
    if (top === max) top = max || 10;
    var points = rows.map(function (r, i) {
      var x = rows.length === 1 ? 300 : 12 + (576 * i / (rows.length - 1));
      var y = 150 - ((Number(r.units) || 0) / top) * 130;
      return { x: x, y: y, row: r };
    });
    var line = points.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = line + ' L' + points[points.length - 1].x.toFixed(1) + ' 158 L' + points[0].x.toFixed(1) + ' 158 Z';
    var circles = points.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5" fill="#8064e8"><title>' + escapeHtml(p.row.date) + ': ' + Number(p.row.units || 0).toLocaleString('ru-RU') + ' ед.</title></circle>';
    }).join('');
    var labels = points.filter(function (p, i) { return i === 0 || i === points.length - 1 || (rows.length > 4 && i % Math.ceil(rows.length / 5) === 0); })
      .map(function (p) { return '<span>' + escapeHtml(p.row.date) + '</span>'; }).join('');
    host.innerHTML = '<div class="stock-chart-summary"><b>' + Number(rows[rows.length - 1].units || 0).toLocaleString('ru-RU') + ' ед.</b><span>последний снимок</span></div>' +
      '<div class="stock-chart-canvas"><div class="stock-chart-y"><span>' + top.toLocaleString('ru-RU') + '</span><span>' + Math.round(top * .66).toLocaleString('ru-RU') + '</span><span>' + Math.round(top * .33).toLocaleString('ru-RU') + '</span><span>0</span></div>' +
      '<svg viewBox="0 0 600 165" preserveAspectRatio="none" role="img" aria-label="Динамика общего количества единиц товара на МХ">' +
      '<defs><linearGradient id="stockFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8064e8" stop-opacity=".24"/><stop offset="100%" stop-color="#8064e8" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#stockFill)"/><path d="' + line + '" fill="none" stroke="#8064e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + circles + '</svg></div><div class="stock-chart-dates">' + labels + '</div>';
    byId('stockChartPeriod').textContent = rows.length + ' ' + (rows.length === 1 ? 'день' : 'дней');
  }

  function renderHistoryRows() {
    var host = byId('historyRows');
    if (!host) return;
    var rows = appData && Array.isArray(appData.history) ? appData.history.slice().reverse() : [];
    var count = byId('historyCount');
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' снимок' : ' снимков');
    if (!rows.length) {
      host.innerHTML = '<tr><td colspan="5"><div class="storage-empty"><b>История пока не накоплена</b><small>Первый ежедневный снимок появится после загрузки данных.</small></div></td></tr>';
      return;
    }
    host.innerHTML = rows.map(function (row) {
      return '<tr><td><b>' + escapeHtml(row.date || '—') + '</b></td>' +
        '<td>' + Number(row.units || 0).toLocaleString('ru-RU') + '</td>' +
        '<td>' + Number(row.barcodes || 0).toLocaleString('ru-RU') + '</td>' +
        '<td>' + Number(row.locations || 0).toLocaleString('ru-RU') + '</td>' +
        '<td>' + (row.issues === null || row.issues === undefined ? '—' : Number(row.issues).toLocaleString('ru-RU')) + '</td></tr>';
    }).join('');
  }

  function renderMiniChart(id, key, color) {
    var host = byId(id);
    if (!host) return;
    // Keep each value paired with its own date; filtering null historical fields must not shift labels.
    var rows = appData && Array.isArray(appData.history) ? appData.history : [];
    var entries = rows.map(function (r) {
      if (!r || r[key] === null || r[key] === undefined || r[key] === '') return null;
      var v = Number(r[key]);
      return isFinite(v) ? { date: String(r.date || ''), value: v } : null;
    }).filter(function (entry) { return entry !== null; });
    if (!entries.length) {
      host.innerHTML = '<span class="mini-chart-empty">История появится после обновлений</span>';
      return;
    }
    var values = entries.map(function (entry) { return entry.value; });
    var w = 150, h = 34, pad = 3;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = max - min;
    var pts = entries.map(function (entry, i) {
      var x = entries.length === 1 ? w / 2 : pad + (w - pad * 2) * i / (entries.length - 1);
      var y = span === 0 ? h / 2 : h - pad - ((entry.value - min) / span) * (h - pad * 2);
      return {x:x, y:y, value:entry.value, date:entry.date};
    });
    var d = pts.map(function (pt, i) { return (i ? 'L' : 'M') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    var title = pts.map(function (pt) { return pt.date + ': ' + pt.value; }).join(' | ');
    host.innerHTML = '<svg viewBox="0 0 150 34" preserveAspectRatio="none" role="img" aria-label="Историческая динамика"><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="3" fill="' + color + '"><title>' + escapeHtml(title) + '</title></circle></svg>';
  }

  function renderMiniCharts() {
    renderMiniChart('miniLocations', 'locations', '#8064e8');
    renderMiniChart('miniBarcodes', 'barcodes', '#9b83e8');
    renderMiniChart('miniUnits', 'units', '#76c5a6');
    renderMiniChart('miniIssues', 'issues', '#e4a64f');
  }

  function renderStats() {
    var s = appData.stats || {};
    var sourcePill = document.querySelector('.demo-pill');
    if (sourcePill) { sourcePill.textContent = appData.mode === 'SHEETS' ? '● GOOGLE SHEETS' : '● ДЕМО-ДАННЫЕ'; sourcePill.classList.toggle('live-pill', appData.mode === 'SHEETS'); }
    var workspaceTag = document.querySelector('.workspace-tag');
    if (workspaceTag) workspaceTag.textContent = appData.mode === 'SHEETS' ? '● РАБОЧАЯ БАЗА' : '● ДЕМО-ПРОСТРАНСТВО';
    byId('statLocations').textContent = Number(s.locations || 0).toLocaleString('ru-RU');
    byId('statBarcodes').textContent = Number(s.barcodes || 0).toLocaleString('ru-RU');
    byId('statUnits').textContent = Number(s.units || 0).toLocaleString('ru-RU');
    var issueCount = Array.isArray(appData.issues) ? appData.issues.length : 0;
    byId('statIssues').textContent = issueCount.toLocaleString('ru-RU');
    var issueBadge = byId('issuesNavCount');
    if (issueBadge) {
      issueBadge.textContent = issueCount.toLocaleString('ru-RU');
      issueBadge.hidden = issueCount === 0;
      issueBadge.setAttribute('aria-label', issueCount ? ('Проблем: ' + issueCount) : 'Проблем нет');
    }
    renderMiniCharts();
  }

  function normalizeCellCode(value) {
    var raw = String(value || '').trim().replace(/\s+/g, '');
    var parts = raw.split('.');
    return parts.length === 3 && parts.every(function (part) { return /^\d+$/.test(part); }) ? parts.map(function (part) { return (Number(part) < 10 ? '0' : '') + String(Number(part)); }).join('.') : raw.toLowerCase();
  }

  // Единый источник расчёта показателей МХ: состав товаров в ячейке.
  // Если список товаров загружен, не используем устаревшие/демо-цифры из locations.
  function getCellMetrics(loc) {
    var allProducts = appData && Array.isArray(appData.products) ? appData.products : null;
    if (!allProducts) {
      return { barcodes: Number(loc.barcodes || 0), units: Number(loc.units || 0) };
    }
    var inCell = allProducts.filter(function (product) {
      return (product.cells || []).indexOf(loc.cell) !== -1;
    });
    var unique = {};
    var units = 0;
    inCell.forEach(function (product) {
      var barcode = String(product.barcode || '').trim();
      if (barcode) unique[barcode] = true;
      units += Number(product.qty || 0);
    });
    return { barcodes: Object.keys(unique).length, units: units };
  }

  function hideStorageSuggestions() {
    var box = byId('storageSuggestions');
    if (!box) return;
    box.hidden = true;
    box.innerHTML = '';
    byId('storageSearch').setAttribute('aria-expanded', 'false');
  }

  function renderStorageSuggestions() {
    var input = byId('storageSearch');
    var box = byId('storageSuggestions');
    var raw = input.value.trim();
    if (!raw || !appData || !box) {
      hideStorageSuggestions();
      return;
    }

    // Подсказки адресов показываем только для ввода, похожего на код МХ.
    // Если введён буквенный запрос (название товара), список не раскрываем.
    var looksLikeCell = /^[0-9.\s-]+$/.test(raw);
    if (!looksLikeCell) {
      hideStorageSuggestions();
      return;
    }

    var needle = normalizeCellCode(raw);
    if (!needle) {
      hideStorageSuggestions();
      return;
    }

    var matches = (appData.locations || []).filter(function (loc) {
      return normalizeCellCode(loc.cell).indexOf(needle) === 0;
    }).sort(function (a, b) {
      return a.cell.localeCompare(b.cell, 'ru', { numeric: true });
    }).slice(0, 7);

    if (!matches.length) {
      hideStorageSuggestions();
      return;
    }

    box.innerHTML = matches.map(function (loc, index) {
      return '<button type="button" class="storage-suggestion" role="option" aria-selected="false" data-suggest-cell="' +
        escapeHtml(loc.cell) + '" data-suggestion-index="' + index + '">' +
        '<span class="suggestion-main"><b>' + escapeHtml(loc.cell) + '</b><small>' +
        getCellMetrics(loc).barcodes + ' баркодов · ' + getCellMetrics(loc).units + ' ед.</small></span>' +
        statusBadge(loc.status) + '</button>';
    }).join('');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function chooseStorageSuggestion(cellCode) {
    byId('storageSearch').value = cellCode;
    hideStorageSuggestions();
    renderStorageRows();
    var row = byId('storageRows').querySelector('[data-open-cell="' + cellCode.replace(/"/g, '\\"') + '"]');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderStorageRows() {
    var query = byId('storageSearch').value.trim().toLowerCase();
    var status = byId('storageStatus').value;
    var sort = byId('storageSort').value;
    var products = appData.products || [];

    var rows = (appData.locations || []).filter(function (loc) {
      if (status && loc.status !== status) return false;
      if (!query) return true;
      var addressMatch = String(loc.cell || '').toLowerCase().indexOf(query) !== -1;
      if (addressMatch) return true;
      return products.some(function (product) {
        var inThisCell = (product.cells || []).indexOf(loc.cell) !== -1;
        if (!inThisCell) return false;
        var searchable = [product.barcode, product.nm, product.name].join(' ').toLowerCase();
        return searchable.indexOf(query) !== -1;
      });
    });

    var statusOrder = { issue: 0, stale: 1, occupied: 2, ok: 3, empty: 4, unchecked: 5 };
    rows.sort(function (a, b) {
      if (sort === 'units-desc') return getCellMetrics(b).units - getCellMetrics(a).units || a.cell.localeCompare(b.cell);
      if (sort === 'barcodes-desc') return getCellMetrics(b).barcodes - getCellMetrics(a).barcodes || a.cell.localeCompare(b.cell);
      if (sort === 'status') return statusOrder[a.status] - statusOrder[b.status] || a.cell.localeCompare(b.cell);
      return a.cell.localeCompare(b.cell, 'ru', { numeric: true });
    });

    byId('storageResultCount').textContent = rows.length + ' ' +
      (rows.length === 1 ? 'адрес' : (rows.length >= 2 && rows.length <= 4 ? 'адреса' : 'адресов'));

    byId('storageRows').innerHTML = rows.length ? rows.map(function (loc) {
      var metrics = getCellMetrics(loc);
      var matchingProducts = query ? products.filter(function (product) {
        var inThisCell = (product.cells || []).indexOf(loc.cell) !== -1;
        return inThisCell && [product.barcode, product.nm, product.name].join(' ').toLowerCase().indexOf(query) !== -1;
      }) : [];
      var matchNote = matchingProducts.length
        ? '<small class="storage-match-note">Найдено товаров: ' + matchingProducts.length + '</small>' : '';
      return '<tr data-open-cell="' + escapeHtml(loc.cell) + '">' +
        '<td><b class="storage-cell-code">' + escapeHtml(loc.cell) + '</b>' + matchNote + '</td>' +
        '<td>' + metrics.barcodes + '</td><td>' + metrics.units +
        '</td><td>' + escapeHtml(loc.checked) + '</td><td>' + statusBadge(loc.status) + '</td></tr>';
    }).join('') : '<tr class="storage-empty-row"><td colspan="5"><div class="storage-empty"><span>⌕</span><b>Ничего не найдено</b><small>Измени запрос или сбрось фильтры.</small><button type="button" id="storageEmptyReset">Сбросить поиск</button></div></td></tr>';
  }

  function renderDashboardRows() {
    byId('dashboardRows').innerHTML = (appData.locations || []).slice(0, 5).map(function (loc) {
      var metrics = getCellMetrics(loc);
      return '<tr data-open-cell="' + escapeHtml(loc.cell) + '">' +
        '<td>' + escapeHtml(loc.cell) + '</td><td>' + metrics.barcodes +
        '</td><td>' + metrics.units + '</td><td>' + escapeHtml(loc.checked) +
        '</td><td>' + statusBadge(loc.status) + '</td></tr>';
    }).join('');
  }

  function renderProducts() {
    var query = byId('productSearch').value.trim().toLowerCase();
    if (!query) {
      byId('productResults').innerHTML = '<p class="empty-hint">Введите запрос для поиска по товарам склада.</p>';
      return;
    }
    var matches = (appData.products || []).filter(function (product) {
      return [product.barcode, product.nm, product.name].join(' ').toLowerCase().indexOf(query) !== -1;
    });
    byId('productResults').innerHTML = matches.length ? matches.map(function (product) {
      return '<div class="product-row"><div><b>' + escapeHtml(product.name) + '</b><small>Баркод: ' +
        escapeHtml(product.barcode) + '<br>nm_id: ' + escapeHtml(product.nm) +
        '<br>МХ: ' + escapeHtml((product.cells || []).join(', ')) +
        '</small></div><b class="product-qty">' + Number(product.qty || 0) + ' шт.</b></div>';
    }).join('') : '<p class="empty-hint">Совпадений не найдено.</p>';
  }

  function renderIssues() {
    var issues = Array.isArray(appData.issues) ? appData.issues : [];
    var container = byId('issueList');
    if (!container) return;
    container.innerHTML = issues.length ? issues.map(function (issue) {
      issue = issue || {};
      var cell = String(issue.cell || '');
      return '<article class="issue-card"><div><b>' + escapeHtml(issue.title || 'Проблема') +
        '</b><small>МХ ' + escapeHtml(cell) + ' · ' + escapeHtml(issue.detail || 'Требуется проверка') +
        '</small></div><button type="button" data-open-cell="' + escapeHtml(cell) +
        '">Открыть МХ</button></article>';
    }).join('') : '<article class="panel empty-state"><h2>Проблем не обнаружено</h2><p>Сейчас нет адресов, отмеченных как проблемные.</p></article>';
  }

  var mapMode='rack';
  function selectMapMode(mode){
    mapMode=mode;
    byId('mapSearch').value='';
    renderMap();
  }
  byId('rackMode').onclick=()=>selectMapMode('rack');
  byId('palletMode').onclick=()=>selectMapMode('pallet');
  function mapButton(loc,full){
            var metrics = getCellMetrics(loc);
            var rawStatus = String(loc.status || '').toLowerCase();
            var cls = ['ok','occupied','empty','stale','issue','unchecked'].indexOf(rawStatus) >= 0 ? rawStatus : 'unchecked';
            // Защита интерфейса на случай старого backend: заполненная ячейка не должна быть серой.
            if (metrics.units > 0 && (cls === 'unchecked' || cls === 'empty')) cls = 'occupied';
            return '<button type="button" class="map-cell status-' + cls + '" data-open-cell="' + escapeHtml(loc.cell) + '" title="' + escapeHtml(loc.cell + ' · ' + statusLabel(cls)) + '"><b>' + escapeHtml(full ? loc.cell : String(loc.cell).split('.')[2]) + '</b><small>' + Number(metrics.units || 0) + ' шт.</small></button>';
  }
  function renderMap() {
    var host = byId('mapCells');
    if (!host) return;
    var query = (byId('mapSearch') && byId('mapSearch').value || '').trim().toLowerCase();
    var locations = (appData.locations || []).slice();
    const pallets=locations.filter(loc=>loc.cell.startsWith('01.01.'));
    byId('rackMode').querySelector('span').textContent=locations.length-pallets.length;
    byId('palletMode').querySelector('span').textContent=pallets.length;
    if(/^\d{2}\./.test(query))mapMode=query.startsWith('01.')?'pallet':'rack';
    const pallet=mapMode==='pallet';
    byId('rackMode').setAttribute('aria-pressed',String(!pallet));
    byId('palletMode').setAttribute('aria-pressed',String(pallet));
    host.classList.toggle('pallet-view',pallet);
    if(pallet){
      const sections=new Map();
      const matches=pallets.filter(loc=>loc.cell.includes(query)).sort((a,b)=>a.cell.localeCompare(b.cell,'ru',{numeric:true}));
      for(const loc of matches){
        const start=Math.floor((Number(loc.cell.split('.')[2])-1)/50)*50+1;
        if(!sections.has(start))sections.set(start,[]);
        sections.get(start).push(loc);
      }
      byId('mapTotal').textContent='Найдено МХ: '+matches.length;
      host.innerHTML=[...sections].map(([start,cells])=>'<section class="map-rack"><header class="map-rack-head"><b>Места '+String(start).padStart(2,'0')+'–'+(start+49)+'</b></header><div class="pallet-grid">'+cells.map(loc=>mapButton(loc,true)).join('')+'</div></section>').join('')||'<div class="map-no-results">Паллетные места не найдены.</div>';
      return;
    }
    locations=locations.filter(loc=>!loc.cell.startsWith('01.01.'));
    var groups = {};
    locations.forEach(function (loc) {
      var parts = String(loc.cell || '').split('.');
      var rack = parts[0] || 'Без стеллажа';
      var shelf = parts[1] || '—';
      if (query && String(loc.cell).toLowerCase().indexOf(query) === -1 && rack.toLowerCase().indexOf(query) === -1) return;
      if (!groups[rack]) groups[rack] = {};
      if (!groups[rack][shelf]) groups[rack][shelf] = [];
      groups[rack][shelf].push(loc);
    });
    var visible = Object.keys(groups).sort(function(a,b){return a.localeCompare(b,'ru',{numeric:true});});
    var count = visible.reduce(function(sum,rack){return sum + Object.keys(groups[rack]).reduce(function(n,shelf){return n + groups[rack][shelf].length;},0);},0);
    var total = byId('mapTotal');
    if (total) total.textContent = count.toLocaleString('ru-RU') + ' адресов';
    host.innerHTML = visible.length ? visible.map(function (rack) {
      var shelves = Object.keys(groups[rack]).sort(function(a,b){return a.localeCompare(b,'ru',{numeric:true});});
      var rackCount = shelves.reduce(function(n,shelf){return n + groups[rack][shelf].length;},0);
      return '<section class="map-rack"><header class="map-rack-head"><b>' + (rack==='01'?'Паллетное хранение · стеллаж ':'Обычный стеллаж ') + escapeHtml(rack) + '</b><span>' + rackCount + ' МХ</span></header>' +
        shelves.map(function(shelf){
          var cells = groups[rack][shelf].sort(function(a,b){var ap=String(a.cell).split('.'),bp=String(b.cell).split('.');return Number(ap[2]||0)-Number(bp[2]||0);});
          return '<div class="map-shelf"><span class="map-shelf-label">Полка ' + escapeHtml(shelf) + '</span><div class="map-shelf-cells">' + cells.map(function(loc){
            return mapButton(loc,false);
          }).join('') + '</div></div>';
        }).join('') + '</section>';
    }).join('') : '<div class="map-no-results">По этому запросу адреса не найдены.</div>';
  }

  function renderAll() {
    renderStats();
    renderStockHistory();
    renderHistoryRows();
    renderDashboardRows();
    renderStorageRows();
    renderProducts();
    renderIssues();
    renderMap();
  }

  var activeCellProducts = [];

  function renderCellProductList(query) {
    var q = String(query || '').trim().toLowerCase();
    var matches = activeCellProducts.filter(function (product) {
      return !q || [product.barcode, product.nm, product.name].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var host = byId('cellProductList');
    if (!host) return;
    host.innerHTML = matches.length ? matches.map(function (product) {
      return '<div class="product-row cell-product-row"><div><b>' + escapeHtml(product.name) +
        '</b><small>Баркод: ' + escapeHtml(product.barcode) +
        '<br>nm_id: ' + escapeHtml(product.nm) + '</small></div><b class="product-qty">' +
        Number(product.qty || 0) + ' шт.</b></div>';
    }).join('') : '<div class="cell-products-empty">' + (q ? 'По этому запросу товаров не найдено.' : 'Состав ячейки не найден.') + '</div>';
    byId('cellProductCount').textContent = 'Показано ' + matches.length + ' из ' + activeCellProducts.length;
  }

  function openCell(cellCode) {
    var loc = (appData.locations || []).filter(function (item) { return item.cell === cellCode; })[0];
    if (!loc) return;
    activeCellProducts = (appData.products || []).filter(function (item) {
      return (item.cells || []).indexOf(cellCode) !== -1;
    });
    var cellMetrics = getCellMetrics(loc);
    var barcodeCount = cellMetrics.barcodes;
    var unitCount = cellMetrics.units;

    byId('drawerContent').innerHTML =
      '<div class="drawer-kicker">БЫСТРЫЙ ПРОСМОТР МХ</div><h2 class="cell-drawer-address">' + escapeHtml(loc.cell) + '</h2>' +
      '<p class="helper-text">'+(cellCode.startsWith('01.01.')?'Паллетное хранение':'Обычный стеллаж')+'</p>' +
      '<div class="cell-summary-grid">' +
        '<div class="cell-summary-card"><span>Уникальных баркодов</span><b>' + barcodeCount + '</b></div>' +
        '<div class="cell-summary-card"><span>Единиц товара</span><b>' + unitCount + '</b></div>' +
      '</div>' +
      '<div class="drawer-line"><span>Статус</span><b>' + statusLabel(loc.status) + '</b></div>' +
      '<div class="drawer-line"><span>Последняя проверка</span><b>' + escapeHtml(loc.checked) + '</b></div>' +
      '<div class="cell-products-heading"><h3>Товары в ячейке</h3><small id="cellProductCount"></small></div>' +
      '<label class="cell-product-search"><span>⌕</span><input id="cellProductSearch" type="search" placeholder="Поиск по названию, баркоду или nm_id" autocomplete="off"></label>' +
      '<div id="cellProductList" class="cell-product-list"></div>';

    const verify=document.createElement('button');
    verify.className='primary-btn';verify.textContent='Проверить эту ячейку';
    verify.onclick=()=>{closeDrawer();showPage('dashboard');remoteCall('start',cellCode);};
    byId('drawerContent').append(verify);
    renderCellProductList('');
    byId('cellProductSearch').addEventListener('input', function () {
      renderCellProductList(this.value);
    });
    byId('cellDrawer').classList.add('open');
    byId('drawerBackdrop').classList.add('open');
    document.body.classList.add('drawer-open');
    byId('cellDrawer').setAttribute('aria-modal', 'true');
  }

  function closeDrawer() {
    byId('cellDrawer').style.transform = '';
    byId('cellDrawer').style.transition = '';
    byId('cellDrawer').classList.remove('open');
    byId('drawerBackdrop').classList.remove('open');
    document.body.classList.remove('drawer-open');
    byId('cellDrawer').removeAttribute('aria-modal');
  }

  // iPhone: vertical drag closes the detail sheet; horizontal browser-history gestures are blocked while it is open.
  (function initDrawerSwipe() {
    var handle = byId('drawerSwipeHandle');
    var drawer = byId('cellDrawer');
    if (!handle || !drawer) return;
    var startY = 0, lastY = 0, startX = 0, startTime = 0, dragging = false, pointerId = null;
    function begin(y, x, id, type) {
      if (type === 'mouse' || !drawer.classList.contains('open')) return;
      startY = lastY = y; startX = x; startTime = Date.now(); dragging = true; pointerId = id;
      drawer.classList.add('dragging');
    }
    function move(y, x, id, event) {
      if (!dragging || (pointerId !== null && id !== pointerId)) return;
      var dy = y - startY, dx = x - startX;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) { if (event && event.cancelable) event.preventDefault(); return; }
      lastY = y;
      if (dy > 0) { drawer.style.transform = 'translateY(' + dy + 'px)'; if (event && event.cancelable) event.preventDefault(); }
    }
    function finish(id) {
      if (!dragging || (pointerId !== null && id !== pointerId)) return;
      var distance = Math.max(0, lastY - startY), elapsed = Math.max(1, Date.now() - startTime), velocity = distance / elapsed;
      dragging = false; pointerId = null; drawer.classList.remove('dragging'); drawer.style.transform = '';
      if (distance > 90 || (distance > 32 && velocity > .55)) closeDrawer();
    }
    if (window.PointerEvent) {
      handle.addEventListener('pointerdown', function(e){ begin(e.clientY,e.clientX,e.pointerId,e.pointerType); if(dragging){try{handle.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault();} });
      handle.addEventListener('pointermove', function(e){move(e.clientY,e.clientX,e.pointerId,e);});
      handle.addEventListener('pointerup', function(e){finish(e.pointerId);});
      handle.addEventListener('pointercancel', function(e){finish(e.pointerId);});
    } else {
      handle.addEventListener('touchstart',function(e){var t=e.touches[0];begin(t.clientY,t.clientX,null,'touch');},{passive:true});
      handle.addEventListener('touchmove',function(e){var t=e.touches[0];move(t.clientY,t.clientX,null,e);},{passive:false});
      handle.addEventListener('touchend',function(){finish(null);},{passive:true});
      handle.addEventListener('touchcancel',function(){finish(null);},{passive:true});
    }
    handle.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeDrawer(); } });
    // Safari's edge-swipe history gesture can steal horizontal drags from a web page.
    // While the drawer is visible, cancel horizontal touch movement inside the app.
    var touchX=0, touchY=0;
    document.addEventListener('touchstart',function(e){if(!drawer.classList.contains('open')||!e.touches.length)return;touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;},{passive:true});
    document.addEventListener('touchmove',function(e){if(!drawer.classList.contains('open')||!e.touches.length)return;var dx=e.touches[0].clientX-touchX,dy=e.touches[0].clientY-touchY;if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>7&&e.cancelable)e.preventDefault();},{passive:false});
  })();

  function showPage(pageId) {
    if (!pageTitles[pageId]) return;
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (page) {
      page.classList.toggle('active', page.id === pageId);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn[data-page]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-page') === pageId);
    });
    byId('breadcrumb').textContent = pageTitles[pageId];
    Array.prototype.forEach.call(document.querySelectorAll('.mobile-nav-btn[data-page]'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-page') === pageId);
    });
    closeMoreSheet();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  function closeMoreSheet() {
    var sheet = byId('mobileMoreSheet');
    var backdrop = byId('mobileMoreBackdrop');
    if (sheet) sheet.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }
  function toggleMoreSheet() {
    var sheet = byId('mobileMoreSheet');
    var backdrop = byId('mobileMoreBackdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.toggle('open');
    backdrop.classList.toggle('open');
  }

  // Мобильная тема: выбор сохраняется на этом устройстве.
  function applyMobileTheme(isDark) {
    document.body.classList.toggle('dark-theme', !!isDark);
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', isDark ? '#101116' : '#f5f4fa');
    var statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusMeta) statusMeta.setAttribute('content', isDark ? 'black' : 'default');
    var toggle = byId('themeToggle');
    var label = byId('themeToggleText');
    var icon = byId('themeToggleIcon');
    if (toggle) toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    if (label) label.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
    if (icon) icon.textContent = isDark ? '☀' : '☾';
  }

  function initMobileTheme() {
    var saved = 'light';
    try { saved = localStorage.getItem('grizzlyMobileTheme') || 'light'; } catch (e) {}
    applyMobileTheme(saved === 'dark');
    var toggle = byId('themeToggle');
    if (toggle) toggle.addEventListener('click', function () {
      var isDark = !document.body.classList.contains('dark-theme');
      applyMobileTheme(isDark);
      try { localStorage.setItem('grizzlyMobileTheme', isDark ? 'dark' : 'light'); } catch (e) {}
    });
  }

  function setSpreadsheetFeedback(message, type) {
    var el = byId('spreadsheetConnectionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'settings-feedback' + (type ? ' ' + type : '');
  }

  const dialog = document.querySelector('dialog');
  const saved = JSON.parse(sessionStorage.getItem('stock-connection') || 'null');
  if (saved) [byId('url').value, byId('key').value] = saved;
  function configure() {
    byId('pair').hidden = document.documentElement.dataset.pfcAgent !== '3';
    if (!dialog.open) dialog.showModal();
  }
  byId('configure').onclick = configure;
  byId('dismiss').onclick = () => dialog.close();
  byId('pair').onclick = () => {
    if (byId('connect').reportValidity()) document.dispatchEvent(new Event('pfc-enable'));
  };
  document.addEventListener('pfc-enabled', () => byId('feedback').textContent = 'Складской компьютер подключён.');
  async function request(action, fields = {}) {
    const url = byId('url').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || !byId('key').value)
      throw Error('В настройках укажите адрес /exec и ключ.');
    const response = await fetch(url, {method:'POST', body:JSON.stringify({...fields, action, key:byId('key').value, warehouse:'399276'}), signal:AbortSignal.timeout(35000)});
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw Error('Проверьте доступ, адрес, ключ и версию Code.gs.');
    const result = await response.json();
    if (result.errorMessage) throw Error(result.errorMessage);
    return result;
  }
  byId('connect').onsubmit = async event => {
    event.preventDefault();
    try { await readStock(); sessionStorage.setItem('stock-connection',JSON.stringify([byId('url').value.trim(),byId('key').value])); dialog.close(); pollRemoteStatus(); }
    catch (error) { byId('feedback').textContent = error.message; }
  };
  function parseWarehouseCells(input) {
    const cells=input.trim().split(/[\s,;]+/).filter(Boolean);
    if(!cells.length)throw Error('Вставьте хотя бы один адрес МХ.');
    for(const cell of cells){
      if(!/^\d{2}\.\d{2}\.\d{2,3}$/.test(cell))throw Error('Проверьте адрес «'+cell+'». Образец: 02.01.03.');
    }
    return [...new Set(cells)];
  }
  byId('addWarehouseCells').onclick=async function(){
    const feedback=byId('addressImportResult');
    const input=byId('addressImport');
    this.disabled=true;
    try{
      const cells=parseWarehouseCells(input.value);
      const result=await request('locations',{cells});
      if(!Number.isInteger(result.total))throw Error('Сервер не подтвердил сохранение.');
      feedback.textContent='Список сохранён. МХ в справочнике: '+result.total+'.';
      input.value='';
      loadData();
    }catch(error){feedback.textContent=error.message;}
    finally{this.disabled=false;}
  };
  async function readStock() {
    appData = await request('dashboard');
    renderAll();
    byId('knownCells').textContent=appData.locations.map(loc=>loc.cell).join('\n');
    const count = appData.locations.filter(loc => loc.checked !== '—').length;
    byId('coverage').textContent = 'Проверено '+count+' из '+appData.locations.length;
    byId('coverage').parentNode.nextElementSibling.firstElementChild.style.width = (100*count/(appData.locations.length||1))+'%';
    byId('sheetConnectionBadge').textContent = 'ПОДКЛЮЧЕНА';
    byId('settingsDataSource').textContent = 'ПФЦ 399276';
    byId('settingsAppMode').textContent = 'Google Sheets';
    lastSuccessfulLoadAt = Date.now();
    setFreshness('live','Снимок загружен '+formatCheckedAt(lastSuccessfulLoadAt)+'. Время проверки указано у каждой ячейки.');
  }
  var lastSuccessfulLoadAt = 0;
  var loadInProgress = false;
  var remoteJobActive = false;
  var lastAutoLoadedFinish = '';
  var lastLoadError = '';

  function setFreshness(state, message) {
    var pill = byId('dataFreshnessPill');
    var line = byId('dataFreshnessLine');
    var text = byId('dataFreshnessText');
    if (pill) {
      pill.className = 'demo-pill freshness-' + state;
      pill.textContent = state === 'live' ? '● GOOGLE SHEETS' : state === 'loading' ? '● ОБНОВЛЕНИЕ' : state === 'error' ? '● НЕТ СВЯЗИ' : '● ДЕМО-ДАННЫЕ';
    }
    if (line) line.className = 'data-freshness-line freshness-' + state;
    if (text) text.textContent = message;
  }

  function formatCheckedAt(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  function loadData(options) {
    options = options || {};
    if (loadInProgress) return;
    loadInProgress = true;
    var refresh = byId('refreshBtn');
    if (refresh && !remoteJobActive) { refresh.disabled = true; refresh.textContent = 'Загрузка базы…'; }
    setFreshness('loading', 'Получаем свежие данные из общей Google Таблицы…');
    readStock().catch(e=>setFreshness('error',e.message)).finally(()=>{
      loadInProgress=false;
      if(refresh){refresh.disabled=remoteJobActive;refresh.textContent=remoteJobActive?'Проверка выполняется…':'↻ Обновить данные';}
    });
  }
  // При возвращении во вкладку обновляем данные; периодическая проверка — только пока страница видима.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastSuccessfulLoadAt > 30000) loadData();
  });
  window.addEventListener('pageshow', function () {
    if (Date.now() - lastSuccessfulLoadAt > 30000) loadData();
  });
  window.setInterval(function () {
    if (!document.hidden && Date.now() - lastSuccessfulLoadAt > 60000) loadData();
  }, 15000);


  // Генератор МХ и QR-этикеток — с защитой от устаревшего результата.
  var genBlocks = [{from:1,to:1,shelves:1,cells:1}];
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
    blocks.forEach(function(b){if(b.to<b.from)throw Error('В одном из блоков конечный номер стеллажа меньше начального.');if(b.from<=last)throw Error('Диапазоны стеллажей пересекаются. Исправьте блоки: один стеллаж нельзя генерировать дважды.');last=b.to;});
    var total=blocks.reduce(function(sum,b){return sum+(b.to-b.from+1)*b.shelves*b.cells;},0);
    if(total>50000)throw Error('Получится '+total.toLocaleString('ru-RU')+' адресов. Максимум за одну генерацию — 50 000.');
    return blocks;
  }
  function genMakeValues(){
    var out=[];genReadBlocks().forEach(function(b){for(var r=b.from;r<=b.to;r++)for(var sh=1;sh<=b.shelves;sh++)for(var c=1;c<=b.cells;c++)out.push(genPad(r)+'.'+genPad(sh)+'.'+genPad(c));});
    return out;
  }
  function genInvalidate(){
    genValues=[];['genCsv','genSaveToSheets','genPrint'].forEach(function(id){var el=byId(id);if(el)el.disabled=true;});
    if(byId('genResult'))byId('genResult').hidden=true;if(byId('genPrintArea'))byId('genPrintArea').innerHTML='';
    genSummary();
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
    return '<svg class="gen-qr" xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 23 23" shape-rendering="crispEdges" role="img" aria-label="QR '+value+'"><rect x="-1" y="-1" width="23" height="23" fill="white"/><g fill="black">'+rects+'</g></svg>';
  }
  function genArrowSvg(direction){var path=direction==='down'?'M12 24 L2 10 H9 V0 H15 V10 H22 Z':'M12 0 L22 14 H15 V24 H9 V14 H2 Z';return '<svg class="gen-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'" fill="black"/></svg>';}
  function genCreate(){
    try{
      genValues=genMakeValues();if(!genValues.length)throw Error('Нет мест хранения для создания.');
      var arrows=byId('genArrows').checked,downRaw=byId('genDownShelf').value.trim(),downShelf=Number(downRaw);
      if(arrows&&(!downRaw||!Number.isSafeInteger(downShelf)||downShelf<1||downShelf>999))throw Error('Укажите корректный номер полки для стрелки вниз (1–999).');
      var labels=genValues.map(function(v){var shelf=Number(v.split('.')[1]);return '<div class="gen-label">'+genQrSvg(v)+(arrows?genArrowSvg(shelf===downShelf?'down':'up'):'')+'<span class="gen-address">'+v+'</span></div>';});
      byId('genRows').innerHTML=genValues.map(function(v,i){return '<tr><td>'+(i+1)+'</td><td>'+v+'</td></tr>';}).join('');
      byId('genResultInfo').textContent='Создано '+genValues.length.toLocaleString('ru-RU')+' уникальных адресов.';byId('genResult').hidden=false;byId('genPrintArea').innerHTML=labels.join('');
      ['genCsv','genPrint','genSaveToSheets'].forEach(function(id){byId(id).disabled=false;});
      byId('genStatus').className='gen-status ok';byId('genStatus').textContent='Готово: адреса, QR-коды и этикетки сформированы.';byId('genResult').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){genValues=[];['genCsv','genPrint','genSaveToSheets'].forEach(function(id){byId(id).disabled=true;});byId('genPrintArea').innerHTML='';byId('genStatus').className='gen-status err';byId('genStatus').textContent=e.message;}
  }
  function genDownloadCsv(){if(!genValues.length)return;var csv='Адрес МХ\r\n'+genValues.map(function(v){return '"'+v+'"';}).join('\r\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='GRIZZLY_HUG_места-хранения.csv';a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
  function genInit(){
    genRenderBlocks();byId('genAddBlock').addEventListener('click',function(){genCaptureBlocks();genBlocks.push({from:'',to:'',shelves:'',cells:''});genRenderBlocks();});
    byId('generatorBlocks').addEventListener('input',function(){genCaptureBlocks();genInvalidate();});
    byId('generatorBlocks').addEventListener('click',function(e){var del=e.target.closest('[data-gen-delete]');if(del){genCaptureBlocks();var el=del.closest('.gen-block');genBlocks.splice(Number(el.getAttribute('data-gen-index')),1);genRenderBlocks();}});
    byId('genCreate').addEventListener('click',genCreate);byId('genCsv').addEventListener('click',genDownloadCsv);
    var saveBtn=byId('genSaveToSheets');saveBtn.addEventListener('click',function(){if(!genValues.length)return;saveBtn.disabled=true;byId('genStatus').textContent='Сохраняю адреса в Google Таблицу…';request('locations',{cells:genValues}).then(r=>{byId('genStatus').textContent='Адресов в справочнике: '+r.total;loadData();}).catch(e=>byId('genStatus').textContent=e.message).finally(()=>saveBtn.disabled=false);});
    byId('genPrint').addEventListener('click',function(){if(genValues.length)window.print();});
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('#mobileMoreBtn')) {
      toggleMoreSheet();
      return;
    }
    if (event.target.closest('#mobileMoreBackdrop')) {
      closeMoreSheet();
      return;
    }
    var pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      showPage(pageButton.getAttribute('data-page'));
      return;
    }
    var gotoButton = event.target.closest('[data-goto]');
    if (gotoButton) {
      showPage(gotoButton.getAttribute('data-goto'));
      return;
    }
    var cellButton = event.target.closest('[data-open-cell]');
    if (cellButton) {
      openCell(cellButton.getAttribute('data-open-cell'));
    }
  });

  byId('storageSearch').addEventListener('input', function () {
    renderStorageRows();
    renderStorageSuggestions();
  });
  byId('storageSearch').addEventListener('keydown', function (event) {
    var box = byId('storageSuggestions');
    if (!box || box.hidden) return;
    var options = Array.prototype.slice.call(box.querySelectorAll('[data-suggest-cell]'));
    var active = box.querySelector('[aria-selected="true"]');
    var activeIndex = options.indexOf(active);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      var next = options[Math.min(activeIndex + 1, options.length - 1)];
      options.forEach(function (item) { item.setAttribute('aria-selected', 'false'); });
      if (next) next.setAttribute('aria-selected', 'true');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      var previous = options[Math.max(activeIndex - 1, 0)];
      options.forEach(function (item) { item.setAttribute('aria-selected', 'false'); });
      if (previous) previous.setAttribute('aria-selected', 'true');
    } else if (event.key === 'Enter') {
      var selected = active || options[0];
      if (selected) {
        event.preventDefault();
        chooseStorageSuggestion(selected.getAttribute('data-suggest-cell'));
      }
    } else if (event.key === 'Escape') {
      hideStorageSuggestions();
    }
  });
  byId('storageSuggestions').addEventListener('click', function (event) {
    var option = event.target.closest('[data-suggest-cell]');
    if (option) chooseStorageSuggestion(option.getAttribute('data-suggest-cell'));
  });
  document.addEventListener('click', function (event) {
    if (!event.target.closest('.storage-search-area')) hideStorageSuggestions();
  });
  byId('storageStatus').addEventListener('change', renderStorageRows);
  byId('storageSort').addEventListener('change', renderStorageRows);
  byId('storageReset').addEventListener('click', function () {
    byId('storageSearch').value = '';
    byId('storageStatus').value = '';
    byId('storageSort').value = 'cell';
    hideStorageSuggestions();
    renderStorageRows();
  });
  byId('storageRows').addEventListener('click', function (event) {
    if (event.target.closest('#storageEmptyReset')) {
      byId('storageSearch').value = '';
      byId('storageStatus').value = '';
      byId('storageSort').value = 'cell';
      hideStorageSuggestions();
      renderStorageRows();
    }
  });
  byId('productSearch').addEventListener('input', renderProducts);

  // Удалённое управление рабочим ПК: секрет расширения никогда не попадает в браузер сайта.
  var remotePollTimer = null;
  function setRemoteText(id, value) { var node = byId(id); if (node) node.textContent = value; }
  let sending = false;
  async function remoteCall(command,cell='') {
    if(!byId('key').value){configure();return;}
    if(sending)return;
    sending=true;
    try {renderRemoteStatus(await request('control',{command,cell}));}
    catch(e){for(const id of ['remoteFeedback','overviewRemoteFeedback'])setRemoteText(id,e.message);}
    finally{sending=false;}
  }
  let scanClock = {};
  function updateScanClock(){
    const start=Date.parse(scanClock.startedAt);
    const end=scanClock.endedAt?Date.parse(scanClock.endedAt):Date.now();
    const sec=Math.max(0,Math.floor((end-start)/1000));
    const label=Number.isFinite(sec)?[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':'):'—';
    for(const id of ['remoteElapsed','overviewRemoteElapsed'])setRemoteText(id,label);
  }
  setInterval(updateScanClock,1000);
  function renderRemoteStatus(result) {
    if (!result) return;
    var online = !!result.workerOnline;
    var badge = byId('remoteWorkerBadge');
    if (badge) { badge.className='remote-badge '+(online?'online':'offline'); badge.textContent=online?'● РАБОЧИЙ ПК В СЕТИ':'● НЕ В СЕТИ'; }
    var overviewBadge = byId('overviewRemoteBadge');
    if (overviewBadge) { overviewBadge.className='remote-badge '+(online?'online':'offline'); overviewBadge.textContent=online?'● РАБОЧИЙ ПК В СЕТИ':'● НЕ В СЕТИ'; }
    var job=result.job||{}, p=job.progress||{};
    scanClock=job;updateScanClock();
    var total=Number(p.total)||0, completed=Number(p.completed)||0, failed=Number(p.failed)||0;
    var percent=total?Math.min(100,Math.round((completed+failed)/total*100)):0;
    var status = job.status || 'ожидание';
    if(status==='Завершено' && failed)status=completed?'Завершено с ошибками':'Ошибка проверки';
    var active = /выполняется|ожидает рабочего компьютера|приостановлена|запрошена пауза|запрошено продолжение|запрошена остановка/i.test(status);
    remoteJobActive = active;
    setRemoteText('remoteJobStatus','Состояние: '+status);
    setRemoteText('remoteProgressText','Обработано '+(completed+failed)+' / '+total+' ('+percent+'%)');
    if(byId('remoteProgressBar')) byId('remoteProgressBar').style.width=percent+'%';
    setRemoteText('remoteCompleted',completed);
    setRemoteText('remoteFailed',failed);
    setRemoteText('remoteCurrentCell',p.currentCell||'—');
    setRemoteText('overviewRemoteJobStatus','Состояние: '+status);
    setRemoteText('overviewRemoteProgressText','Обработано '+(completed+failed)+' / '+total+' ('+percent+'%)');
    if(byId('overviewRemoteProgressBar')) byId('overviewRemoteProgressBar').style.width=percent+'%';
    setRemoteText('overviewRemoteCompleted',completed);
    setRemoteText('overviewRemoteFailed',failed);
    setRemoteText('overviewRemoteCurrentCell',p.currentCell||'—');
    var stamp=online&&result.workerAt?' Последний сигнал ПК: '+formatCheckedAt(result.workerAt)+'.':' Компьютер или Chrome не отправляет сигнал.';
    var message=(job.message||'Ожидаем команду.')+stamp;
    setRemoteText('remoteFeedback',message);
    setRemoteText('overviewRemoteFeedback',message);
    var refresh = byId('refreshBtn');
    if (refresh) {
      refresh.disabled = active;
      refresh.textContent = active ? 'Проверка выполняется…' : '↻ Обновить данные';
    }
    // После полного завершения очереди перечитываем Google Sheets и обновляем все карточки обзора.
    if (job.finishedAt && job.finishedAt !== lastAutoLoadedFinish) {
      lastAutoLoadedFinish = job.finishedAt;
      if(!failed)setRemoteText('overviewRemoteFeedback','Проверка завершена. Загружаем обновлённые остатки и статистику…');
      loadData();
    }
  }
  function pollRemoteStatus() {
    if(!byId('key').value)return;
    request('status').then(renderRemoteStatus).catch(e=>{
      for(const id of ['remoteFeedback','overviewRemoteFeedback'])setRemoteText(id,e.message);
    });
  }
  if(byId('remoteStartBtn')) byId('remoteStartBtn').addEventListener('click',function(){remoteCall('start');});
  if(byId('remotePauseBtn')) byId('remotePauseBtn').addEventListener('click',function(){remoteCall('pause');});
  if(byId('remoteResumeBtn')) byId('remoteResumeBtn').addEventListener('click',function(){remoteCall('resume');});
  if(byId('remoteStopBtn')) byId('remoteStopBtn').addEventListener('click',function(){remoteCall('stop');});
  pollRemoteStatus();
  remotePollTimer=window.setInterval(function(){if(!document.hidden)pollRemoteStatus();},15000);

  byId('refreshBtn').addEventListener('click', function(){ remoteCall('start'); });

  if (byId('mapSearch')) byId('mapSearch').addEventListener('input', renderMap);
  if (byId('mapRefreshBtn')) byId('mapRefreshBtn').addEventListener('click', loadData);
  byId('drawerClose').addEventListener('click', closeDrawer);
  byId('drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closeDrawer(); closeMoreSheet(); }
  });

  initMobileTheme();
  genInit();

  loadData();
})();
