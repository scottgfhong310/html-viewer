/**
 * html-viewer — 頁面控制器（glue）
 *
 * DOM 行為：主題切換、i18n（透過 I18n 引擎）、開檔（?link= 或側欄清單）、
 * 上傳 / 拖拉 / 清空、把片段塞進 sandbox iframe 並自動撐高。
 * 路徑安全、把片段包成完整文件 + 注入 Claude token、與伺服器溝通在 html-viewer-lib.js；
 * i18n 引擎在 i18n.js，語言字典在 locales/<code>.js。
 *
 * 依賴（皆於 index.html 先載入）：jQuery / Materialize / Lodash / HtmlViewerLib / I18n（+ locales）。
 */

(function () {
  'use strict';

  var L = window.HtmlViewerLib;
  var THEME_KEY = 'html-viewer-theme';
  // 語系由 I18n 引擎管理（localStorage 'lang'，預設 zh-Hant），不再自行保存。

  var emptyState = document.getElementById('empty-state');
  var docBox = document.getElementById('hv-doc');
  var frame = document.getElementById('hv-frame');
  var docName = document.getElementById('hv-doc-name');
  var docBadge = document.getElementById('hv-doc-badge');
  var openBtn = document.getElementById('setting-open');
  var sideNav = document.getElementById('side-nav');
  var dropOverlay = document.getElementById('drop-overlay');
  var filePicker = document.getElementById('file-picker');

  var state = {
    theme: 'dark',
    current: null,   // 目前開啟的連結（相對或白名單絕對路徑）
    name: '',        // 顯示用檔名
    text: '',        // 目前片段/文件原文
    isFull: false,   // 目前內容是否為完整 HTML 文件（原樣放行）
    files: []
  };

  /* ---------- 主題（light / dark） ---------- */

  function applyTheme(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    state.theme = theme;
    var r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.classList.toggle('dark-mode', theme === 'dark');
    r.classList.toggle('light-mode', theme === 'light');
    var icon = document.querySelector('#setting-mode i');
    if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    // 片段會吃注入的 Claude token + matchMedia shim，重建 iframe 讓它換主題；
    // 完整文件原樣放行、自管主題，不重建（避免重載閃爍）。
    if (state.current && !state.isFull) renderDoc();
  }

  /* ---------- iframe 渲染 + 自動撐高 ---------- */

  function setupAutoResize() {
    var queued = false;
    function resize() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        try {
          var doc = frame.contentDocument;
          if (!doc || !doc.body) return;
          // 只量 body.scrollHeight：documentElement.scrollHeight 會反映 iframe 自身高度，
          // 與我們設定的高度形成回授迴圈。
          var next = (doc.body.scrollHeight + 8) + 'px';
          if (frame.style.height !== next) frame.style.height = next;
        } catch (e) { /* cross-origin（srcdoc 不該發生） */ }
      });
    }
    function attachObserver() {
      try {
        var doc = frame.contentDocument;
        if (doc && doc.body && 'ResizeObserver' in window && !frame.__hvRO) {
          var ro = new ResizeObserver(resize);
          ro.observe(doc.body);
          frame.__hvRO = ro;
        }
      } catch (e) {}
    }
    frame.addEventListener('load', function () { resize(); attachObserver(); });
    // 保險：剛插入的 iframe 在同一 tick 設 srcdoc 時 load 事件可能漏接，從外部多敲幾次。
    [50, 200, 600, 1500].forEach(function (t) {
      setTimeout(function () { resize(); attachObserver(); }, t);
    });
  }

  function renderDoc() {
    state.isFull = L.isFullDocument(state.text);
    frame.style.height = '';                 // 重置高度，重新量測
    frame.__hvRO = null;                     // 換新文件後重新掛 observer
    frame.srcdoc = L.buildDoc({
      link: state.current,
      text: state.text,
      theme: state.theme,
      lang: (window.I18n && I18n.lang) || 'zh-Hant'
    });
    setupAutoResize();
    // 更新 toolbar
    docName.textContent = state.name || state.current || '';
    docName.title = state.name || state.current || '';
    docBadge.style.display = state.isFull ? '' : 'none';
  }

  function showDoc(show) {
    // #hv-doc 預設 CSS 為 display:none，故顯示時要給明確值（設 '' 會落回 CSS 的 none）
    docBox.style.display = show ? 'block' : 'none';
    emptyState.style.display = show ? 'none' : '';
    document.body.classList.toggle('is-empty', !show);
    // 「在新分頁開原始檔」側鍵只在有開檔時出現（.side-tool 預設 flex）
    if (openBtn) openBtn.style.display = show ? 'flex' : 'none';
  }

  // 「已執行」微回饋：icon 暫時變 check 800ms（家族 §5.5）
  function setIconDone(el) {
    var i = el && el.querySelector('i');
    if (!i) return;
    var orig = i.textContent;
    i.textContent = 'check';
    setTimeout(function () { i.textContent = orig; }, 800);
  }

  // 在新分頁開啟目前的原始檔
  function openCurrent() {
    if (!state.current) return;
    window.open(state.current, '_blank', 'noopener');
    setIconDone(openBtn);
  }

  /* ---------- loading 動畫 ---------- */
  var loadingTimer = null;
  function showLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(function () {
      var el = document.getElementById('loading');
      if (el) el.classList.add('show');
    }, 180);
  }
  function hideLoading() {
    clearTimeout(loadingTimer);
    var el = document.getElementById('loading');
    if (el) el.classList.remove('show');
  }

  /* ---------- 開檔 / 檔案清單 ---------- */

  // 由連結推出顯示用檔名（取末段、解碼、去掉 query）
  function nameFromLink(link) {
    var seg = String(link || '').split('?')[0].split('/').pop();
    try { seg = decodeURIComponent(seg); } catch (e) {}
    return seg || link;
  }

  // 載入並渲染某連結（不改 URL）。link：相對 viewer 目錄或白名單絕對路徑。
  function loadAndShow(link, displayName) {
    if (!L.isSafeLink(link)) {
      state.current = null; state.text = '';
      M.toast({ html: I18n.t('toast.badLink'), classes: 'red' });
      showDoc(false);
      return Promise.resolve();
    }
    state.current = link;
    state.name = displayName || nameFromLink(link);
    document.title = state.name + ' | ' + I18n.t('title.suffix');
    markActive(link);
    showDoc(true);
    showLoading();
    return L.fetchText(link)
      .then(function (text) {
        state.text = text;
        renderDoc();
      })
      .catch(function (err) {
        state.text = '';
        M.toast({ html: I18n.t('toast.loadFail', { n: state.name, m: err.message }), classes: 'red' });
        showDoc(false);
      })
      .then(function () { hideLoading(); });
  }

  // 點擊側欄/開檔時：更新 URL（可分享、可上一頁）再載入
  function navigate(link, displayName) {
    try {
      history.pushState({ link: link }, '', '?link=' + encodeURIComponent(link));
    } catch (e) {}
    loadAndShow(link, displayName);
  }

  function markActive(link) {
    $('#side-nav li').removeClass('active');
    if (!link) return;
    var esc = window.CSS && CSS.escape ? CSS.escape(link) : link;
    $('#side-nav li[data-link="' + esc + '"]').addClass('active');
  }

  function renderSideNav(files) {
    if (!files.length) {
      sideNav.innerHTML = '<li><a style="color:var(--muted)!important;">' + I18n.t('side.noFiles') + '</a></li>';
      return;
    }
    sideNav.innerHTML = files.map(function (f) {
      var link = L.fileUrl(f.name);
      return '<li data-link="' + _.escape(link) + '">' +
        '<a href="#!" class="file-item" data-name="' + _.escape(f.name) + '">' +
        '<i class="material-icons">description</i>' +
        '<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _.escape(f.name) + '</span>' +
        '<span class="file-meta">' + L.formatSize(f.size) + '</span>' +
        '</a></li>';
    }).join('');
    markActive(state.current);
  }

  // 重新抓清單。selectName：上傳/清空後想自動開的檔名；autoOpen：清單非空且目前沒開檔時自動開最新一筆。
  function refreshFiles(selectName, autoOpen) {
    return L.listFiles().then(function (files) {
      state.files = files;
      renderSideNav(files);
      if (selectName) {
        var hit = files.filter(function (f) { return f.name === selectName; })[0];
        if (hit) return navigate(L.fileUrl(hit.name), hit.name);
      }
      if (autoOpen && !state.current && files.length) {
        return loadAndShow(L.fileUrl(files[0].name), files[0].name);
      }
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.listFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 上傳 ---------- */

  function uploadFiles(fileList) {
    var arr = Array.prototype.slice.call(fileList).filter(function (f) { return L.isUploadable(f.name); });
    if (!arr.length) {
      M.toast({ html: I18n.t('toast.notHtml'), classes: 'orange' });
      return;
    }
    var lastName = null;
    var chain = Promise.resolve();
    arr.forEach(function (file) {
      chain = chain.then(function () {
        return L.uploadFile(file).then(function () {
          lastName = file.name;
          M.toast({ html: I18n.t('toast.uploaded', { n: file.name }), classes: 'green' });
        }).catch(function (err) {
          M.toast({ html: I18n.t('toast.uploadFail', { n: file.name, m: err.message }), classes: 'red' });
        });
      });
    });
    chain.then(function () { return refreshFiles(lastName); });
  }

  /* ---------- 清空 ---------- */

  function clearFolder() {
    if (!confirm(I18n.t('confirm.clear'))) return;
    L.clearFolder().then(function (d) {
      M.toast({ html: I18n.t('toast.cleared', { n: d.removed || 0 }), classes: 'teal' });
      state.current = null; state.name = ''; state.text = '';
      try { history.replaceState({}, '', './'); } catch (e) {}
      showDoc(false);
      document.title = I18n.t('title.suffix');
      return refreshFiles();
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.clearFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 全頁拖拉 ---------- */

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    return false;
  }

  function bindDragDrop() {
    var depth = 0;
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth++; dropOverlay.classList.add('show');
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      depth--; if (depth <= 0) { depth = 0; dropOverlay.classList.remove('show'); }
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; dropOverlay.classList.remove('show');
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) uploadFiles(dt.files);
    });
  }

  /* ---------- 語系（i18n） ---------- */

  function cycleLang() {
    var next = I18n.cycle();
    M.toast({ html: I18n.t('toast.lang', { name: I18n.name(next) }), classes: 'teal' });
  }

  function onLangChanged() {
    renderSideNav(state.files);   // 「尚無檔案」訊息隨語系
    document.title = state.current
      ? (state.name + ' | ' + I18n.t('title.suffix'))
      : I18n.t('title.suffix');
    // 已載入片段的 wrapper lang 跟著切（完整文件原樣放行、不重建）
    if (state.current && !state.isFull) renderDoc();
  }

  /* ---------- 事件繫結 ---------- */

  function bindEvents() {
    // 側欄檔案點擊
    $(document).on('click', '#side-nav a.file-item', function (e) {
      e.preventDefault();
      var name = String($(this).data('name'));
      navigate(L.fileUrl(name), name);
      var inst = M.Sidenav.getInstance(document.getElementById('slide-out'));
      if (inst && inst.isOpen) inst.close();
    });

    // 空狀態 / 檔案選擇器
    emptyState.addEventListener('click', function () { filePicker.click(); });
    filePicker.addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length) uploadFiles(e.target.files);
      filePicker.value = '';
    });

    // 右側工具列
    document.getElementById('setting-menu').addEventListener('click', function () {
      var inst = M.Sidenav.getInstance(document.getElementById('slide-out'));
      if (inst) inst.open();
    });
    document.getElementById('setting-mode').addEventListener('click', toggleTheme);
    document.getElementById('setting-lang').addEventListener('click', cycleLang);
    document.getElementById('setting-open').addEventListener('click', openCurrent);
    document.getElementById('setting-clear').addEventListener('click', clearFolder);

    // 上一頁／下一頁：依 ?link 重新載入
    window.addEventListener('popstate', function () {
      var link = new URLSearchParams(location.search).get('link');
      if (link) { loadAndShow(link); }
      else { state.current = null; state.name = ''; state.text = ''; showDoc(false); document.title = I18n.t('title.suffix'); markActive(null); }
    });
  }

  /* ---------- 初始化 ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    M.Sidenav.init(document.querySelectorAll('.sidenav'), {
      edge: 'right',
      onOpenStart: function () { document.body.classList.add('sidenav-open'); },
      onCloseEnd: function () { document.body.classList.remove('sidenav-open'); }
    });

    var saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(saved === 'light' ? 'light' : 'dark');

    // i18n：套用靜態文字 / 標題（引擎自解析初始語系：?lang → localStorage('lang') → 瀏覽器 → zh-Hant）
    I18n.apply(document);
    document.addEventListener('i18n:changed', onLangChanged);
    document.title = I18n.t('title.suffix');

    bindEvents();
    bindDragDrop();

    // ?link= 指定檔 → 直接載入（清單照樣抓來填側欄、標記 active；param 載入優先，不自動開最新）。
    // 沒有 param → 抓清單，有檔就自動開最新一筆，沒檔就停在空狀態。
    var param = new URLSearchParams(location.search).get('link');
    if (param) {
      loadAndShow(param);
      refreshFiles(null, false);
    } else {
      refreshFiles(null, true);
    }
  });
})();
