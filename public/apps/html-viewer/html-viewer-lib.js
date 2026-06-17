/**
 * HtmlViewerLib — html-viewer 前端核心 library（可嵌入式、純邏輯、不碰 DOM）
 *
 * 把「路徑安全檢查」「把片段包成完整文件 + 注入 Claude 設計系統 token」
 * 「與伺服器溝通」「檔名/時間戳工具」等可重用邏輯抽成一支 library；
 * index.html / html-viewer.js 只負責 DOM（iframe 插入、自動撐高、事件繫結、toast）。
 *
 * 設計重點：
 *   - 這支檢視器渲染的是 Claude 對話裡的「HTML 片段」（一堆 <div>/<canvas> + 自帶 CDN 的
 *     <script>，如 Chart.js）。片段以 Claude 設計系統 token（--color-background-secondary…）
 *     書寫，因此包裝時把這些 token 注入 iframe，讓它在這裡長得跟對話裡一樣。
 *   - 若讀進來的其實是「完整 HTML 文件」（自帶 <!doctype>/<html>），則 **原樣放行**
 *     （不包 body、不注入 token），交給它自己的 <head> 處理。
 *   - 片段內的 <script> 在 sandbox iframe（allow-scripts allow-same-origin）內執行。
 *
 * 後端對應：
 *   - 上傳： POST /api/upload?folder=html-viewer   （form 欄位 myFiles，多檔）
 *   - 列表： GET  /api/html-viewer/files
 *   - 清空： POST /api/html-viewer/clear
 *   - 靜態讀檔： /upload/html-viewer/<name>
 *
 * 依賴：無（原生 fetch / URL / location）。建議與 jQuery / Materialize / Lodash 一起載入。
 *
 * Public API：
 *   HtmlViewerLib.FOLDER                       → 'html-viewer'
 *   HtmlViewerLib.ALLOWED_ABSOLUTE_PREFIXES    → string[]   放行的絕對路徑前綴
 *   HtmlViewerLib.escapeHtml(s)                → string
 *   HtmlViewerLib.isSafeLink(link)             → boolean    擋 ../ \ protocol // 及非白名單絕對路徑
 *   HtmlViewerLib.isUploadable(name)           → boolean    是否為 .html / .htm
 *   HtmlViewerLib.isFullDocument(text)         → boolean    是否自帶 <!doctype>/<html>
 *   HtmlViewerLib.buildDoc({link,text,theme,lang}) → string  iframe srcdoc 用的完整 HTML
 *   HtmlViewerLib.uploadFile(file)             → Promise<resp>
 *   HtmlViewerLib.listFiles()                  → Promise<Array<{name,size,mtime}>>
 *   HtmlViewerLib.clearFolder()                → Promise<{ok,removed}>
 *   HtmlViewerLib.fetchText(link)              → Promise<string>
 *   HtmlViewerLib.fileUrl(name)                → string     /upload/html-viewer/<name>
 *   HtmlViewerLib.timestamp(date)              → 'yyyyMMddHHmmss'
 *   HtmlViewerLib.formatSize(bytes)            → 'xx KB'
 */
(function (window) {
  'use strict';

  var FOLDER = 'html-viewer';
  var UPLOAD_API = '/api/upload?folder=' + FOLDER;
  var FILES_API = '/api/html-viewer/files';
  var CLEAR_API = '/api/html-viewer/clear';
  var STATIC_BASE = '/upload/' + FOLDER + '/';

  // 絕對路徑（開頭 /）只放行這些前綴；相對路徑（無開頭 /）一律相對 viewer 自身目錄、預設允許。
  // 要再開放其他資料夾就往這裡加前綴。
  var ALLOWED_ABSOLUTE_PREFIXES = [
    STATIC_BASE   // '/upload/html-viewer/' — 上傳進來的片段
  ];

  // 可上傳/可檢視的副檔名（HTML 片段或完整文件）
  var UPLOADABLE_RE = /\.html?$/i;

  function pad2(n) { return ('0' + n).slice(-2); }

  // 加上 cache-busting query，確保每次都讀到伺服器最新內容
  function bust(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 路徑安全：擋穿越（..）、反斜線、任意 scheme（http:/file:/javascript:）、protocol-relative（//）；
  // 絕對路徑須命中允許清單，相對路徑（相對 viewer 目錄）一律放行。
  function isSafeLink(link) {
    if (!link || typeof link !== 'string') return false;
    if (link.indexOf('..') !== -1) return false;
    if (link.charAt(0) === '\\') return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return false; // 拒絕 http: / file: / javascript: 等
    if (link.indexOf('//') === 0) return false;          // protocol-relative
    if (link.charAt(0) === '/') {
      return ALLOWED_ABSOLUTE_PREFIXES.some(function (p) { return link.indexOf(p) === 0; });
    }
    return true; // 相對 viewer 目錄
  }

  function isUploadable(name) {
    return UPLOADABLE_RE.test(String(name || ''));
  }

  // 是否為「完整 HTML 文件」（自帶 <!doctype html> 或 <html …>），而非可包裝的片段。
  // 只看開頭一小段，略過前導空白與 BOM。
  function isFullDocument(text) {
    var head = String(text || '').replace(/^﻿/, '').slice(0, 500).toLowerCase();
    return /^\s*<!doctype\s+html/.test(head) || /^\s*<html[\s>]/.test(head);
  }

  // 注入 iframe 的 Claude 設計系統 CSS 變數：片段以這些 token 書寫，注入後即可在這裡
  // 呈現成使用者在對話裡看到的樣子。light / dark 兩套，由 wrapper <html data-theme> 切換。
  var FRAGMENT_TOKENS = [
    ':root{',
    '  color-scheme: light;',
    '  --color-background-primary: #FAF9F5;',
    '  --color-background-secondary: #F0EEE6;',
    '  --color-background-tertiary: #E8E5DA;',
    '  --color-text-primary: #1F1E1D;',
    '  --color-text-secondary: #4A4843;',
    '  --color-text-tertiary: #85827D;',
    '  --color-border-primary: rgba(0,0,0,0.16);',
    '  --color-border-secondary: rgba(0,0,0,0.12);',
    '  --color-border-tertiary: rgba(0,0,0,0.08);',
    '  --color-accent-primary: #C96442;',
    '  --color-accent-secondary: #185FA5;',
    '  --border-radius-sm: 6px;',
    '  --border-radius-md: 12px;',
    '  --border-radius-lg: 16px;',
    '}',
    '[data-theme="dark"]{',
    '  color-scheme: dark;',
    '  --color-background-primary: #1F1E1D;',
    '  --color-background-secondary: #2A2826;',
    '  --color-background-tertiary: #34322F;',
    '  --color-text-primary: #FAF9F5;',
    '  --color-text-secondary: #D3D1C7;',
    '  --color-text-tertiary: #85827D;',
    '  --color-border-primary: rgba(255,255,255,0.16);',
    '  --color-border-secondary: rgba(255,255,255,0.12);',
    '  --color-border-tertiary: rgba(255,255,255,0.08);',
    '}',
    'html,body{',
    '  margin:0; padding:0;',
    '  background: var(--color-background-primary);',
    '  color: var(--color-text-primary);',
    '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC",',
    '    "Microsoft JhengHei","Helvetica Neue",Helvetica,Arial,sans-serif;',
    '  line-height:1.5; -webkit-font-smoothing:antialiased;',
    '}',
    'body{ padding:24px; box-sizing:border-box; }',
    '.sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px;',
    '  overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }',
    'h1,h2,h3,h4,h5,h6{ color: var(--color-text-primary); }',
    'a{ color: var(--color-accent-secondary); }'
  ].join('\n');

  // 覆寫 iframe 內的 matchMedia，讓片段裡讀 prefers-color-scheme（如 Chart.js 配色）也看到
  // 使用者選的主題，而非系統主題。
  function buildMatchMediaShim(theme) {
    return '(function(){' +
      'var forced=' + JSON.stringify(theme === 'dark' ? 'dark' : 'light') + ';' +
      'var orig=window.matchMedia;' +
      'window.matchMedia=function(q){' +
      '  if(typeof q==="string"&&q.indexOf("prefers-color-scheme")!==-1){' +
      '    var wantsDark=q.indexOf("dark")!==-1;' +
      '    var matches=(forced==="dark")===wantsDark;' +
      '    return {matches:matches,media:q,onchange:null,' +
      '      addListener:function(){},removeListener:function(){},' +
      '      addEventListener:function(){},removeEventListener:function(){},' +
      '      dispatchEvent:function(){return false;}};' +
      '  }' +
      '  return orig.call(window,q);' +
      '};' +
      '})();';
  }

  /**
   * 組出 iframe srcdoc 用的完整 HTML 字串。
   *   - 完整文件（isFullDocument）→ 原樣回傳（不包裝、不注入 token）。
   *   - 片段 → 包成完整文件：注入 Claude token + matchMedia shim + <base>（讓片段內相對資源
   *     以該檔位置為基準解析）。
   * @param {{link:string,text:string,theme:string,lang?:string}} opt
   */
  function buildDoc(opt) {
    opt = opt || {};
    var text = opt.text || '';
    var theme = opt.theme === 'dark' ? 'dark' : 'light';
    if (isFullDocument(text)) return text;

    var link = opt.link || '';
    var lang = opt.lang || 'zh-Hant';
    var baseHref = link;
    try { baseHref = new URL(link, location.href).href; } catch (e) { /* keep raw */ }

    return '<!DOCTYPE html>\n' +
      '<html lang="' + escapeHtml(lang) + '" data-theme="' + theme + '">\n' +
      '<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<base href="' + escapeHtml(baseHref) + '">\n' +
      '<title>' + escapeHtml(link) + '</title>\n' +
      '<style>' + FRAGMENT_TOKENS + '</style>\n' +
      '<script>' + buildMatchMediaShim(theme) + '</' + 'script>\n' +
      '</head>\n' +
      '<body>\n' + text + '\n</body>\n' +
      '</html>';
  }

  function fileUrl(name) {
    return STATIC_BASE + encodeURIComponent(name);
  }

  var HtmlViewerLib = {

    FOLDER: FOLDER,
    ALLOWED_ABSOLUTE_PREFIXES: ALLOWED_ABSOLUTE_PREFIXES,

    escapeHtml: escapeHtml,
    isSafeLink: isSafeLink,
    isUploadable: isUploadable,
    isFullDocument: isFullDocument,
    buildDoc: buildDoc,

    /** 上傳單一檔案到 /upload/html-viewer（同名覆寫）。回傳伺服器 JSON；失敗 reject。 */
    uploadFile: function (file) {
      var fd = new FormData();
      fd.append('myFiles', file);
      return fetch(UPLOAD_API, { method: 'POST', body: fd })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (resp) {
          if (!resp || !resp.ok) throw new Error((resp && resp.error) || '上傳失敗');
          return resp;
        });
    },

    /** 列出資料夾內檔案（依修改時間新→舊） */
    listFiles: function () {
      return fetch(bust(FILES_API), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('列表載入失敗 (' + r.status + ')');
          return r.json();
        })
        .then(function (d) { return (d && d.files) || []; });
    },

    /** 清空資料夾下所有可見檔案 */
    clearFolder: function () {
      return fetch(CLEAR_API, { method: 'POST' })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || '清空失敗');
          return d;
        });
    },

    /** 讀取連結（相對 viewer 目錄或白名單絕對路徑）的文字內容 */
    fetchText: function (link) {
      return fetch(bust(link), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('讀取失敗 (HTTP ' + r.status + ')');
          return r.text();
        });
    },

    fileUrl: fileUrl,

    /** 本地時間 yyyyMMddHHmmss */
    timestamp: function (date) {
      var d = date || new Date();
      return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
        pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    },

    /** 人類可讀的檔案大小 */
    formatSize: function (bytes) {
      bytes = Number(bytes) || 0;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }
  };

  window.HtmlViewerLib = HtmlViewerLib;
})(window);
