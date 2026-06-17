# html-viewer

[English](README.md) · **中文** · [日本語](README.ja.md)

檢視 **Claude 對話 HTML 片段** 的單頁 WebApp——那種由 `<div>` / `<canvas>` ＋自帶 CDN `<script>`（如 Chart.js）組成、以 Claude 設計系統 token 書寫的片段。本檢視器把片段包成完整文件、**注入 Claude 設計系統 token**（`--color-background-secondary`…）讓它長得跟在對話裡一樣，並在 **sandbox iframe** 內執行。後端是輕量 Express（上傳 / 列表 / 清空）。

- 🧩 **片段檢視** — 注入 Claude token ＋ `matchMedia` shim，在 `sandbox` iframe 內跑片段自帶的 `<script>`（Chart.js 等），iframe **自動撐高**貼齊內容
- 📄 **完整文件原樣放行** — 若檔案本身已是完整 `<!doctype html>` 文件，則 **原樣渲染**（不包裝、不注入 token），並標上「完整文件」徽章
- 📥 **拖拉上傳** — 把 `.html` / `.htm` 拖到頁面任意位置；**同名覆寫**
- 🔗 **深連結** — 用 `?link=<路徑>` 開任一檔（相對 viewer 目錄，或允許清單內的絕對路徑）；可分享、支援上一頁／下一頁
- 🌗 **淺色 / 深色** 切換（存 localStorage；切換時重建 iframe，讓片段與其圖表跟著主題）
- 🌐 **三語 UI** — 繁體中文 / English / 日本語（預設繁體中文，存 localStorage）
- 🛡️ **路徑安全** — 擋 `..`、反斜線、`javascript:` / `file:` 協定、protocol-relative `//`，以及非允許清單的絕對路徑
- 🗂️ 檔案清單側欄、在新分頁開原始檔、清空資料夾

> 第三方前端庫（jQuery、Materialize、Lodash、Material Icons）走 CDN——零打包、零 build。每個片段自帶 CDN `<script>`（如 Chart.js），在 sandbox 內執行。

## 快速開始

需要 Node.js 18+。

```bash
npm install
npm start
# 開啟 http://localhost:3000/apps/html-viewer/
```

以 `PORT` 改 port：`PORT=8080 npm start`。

## 目錄結構

```
html-viewer/
├── app.js                          # 獨立 Express 伺服器（static + 兩支 API）
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=html-viewer（multer、多檔、覆寫）
│   └── html-viewer.js              # GET /files、POST /clear
└── public/
    ├── apps/html-viewer/           # 前端（服務於 /apps/html-viewer/）
    │   ├── index.html              # 純結構
    │   ├── html-viewer.css         # 主題 token + 本頁樣式
    │   ├── html-viewer.js          # 控制器（膠水）：主題 / i18n / 上傳 / iframe
    │   ├── html-viewer-lib.js      # HtmlViewerLib：安全檢查 / 組文件 / 伺服器溝通（純邏輯、不碰 DOM）
    │   ├── materialize-dark.css    # 家族共用資產（Materialize 深色）
    │   ├── side-tool.css           # 右側浮動工具列
    │   ├── thinking-dot.css        # 共用載入點 utility
    │   ├── i18n.js                 # i18n 引擎
    │   └── locales/{zh-Hant,en,ja}.js
    └── upload/html-viewer/         # 上傳的片段（內容不進版控；附一個 sample）
```

## API

| Method / Path | 說明 |
|---|---|
| `POST /api/upload?folder=html-viewer` | 上傳（form 欄位 `myFiles`、多檔；指定 `folder` 時保留原檔名 → 覆寫）|
| `GET /api/html-viewer/files` | 列出 `public/upload/html-viewer/` 下可見檔（新→舊）|
| `POST /api/html-viewer/clear` | 刪除該資料夾下所有可見檔（保留資料夾與隱藏檔）|

靜態讀檔：`/upload/html-viewer/<name>`。所有 API 一律 `{ ok }` 信封。

`GET /api/html-viewer/files` 回傳：

```jsonc
{
  "ok": true,
  "files": [
    { "name": "string", "size": 0, "mtime": 0 }   // mtime = epoch ms；依新→舊排序
  ]
}
```

## 核心 library（`HtmlViewerLib`）

純邏輯、不碰 DOM，可獨立嵌入。關鍵方法：

```jsonc
// HtmlViewerLib.buildDoc({ link, text, theme, lang }) → string  （iframe srcdoc）
//   isFullDocument(text) === true  → 原樣回傳 text（passthrough）
//   否則                           → 包裝片段：注入 Claude token ＋ matchMedia shim
//                                    ＋ <base href>，置於 <html data-theme="light|dark"> 文件
```

其他工具：`isSafeLink`、`isFullDocument`、`isUploadable`、`listFiles`、`uploadFile`、`clearFolder`、`fetchText`、`fileUrl`、`formatSize`、`timestamp`。

## 備註

- 前端以**絕對路徑**呼叫 API（`/api/...`、`/upload/...`），須由本專案 Node 伺服器從**站台根**提供。**不相容 GitHub Pages**（純靜態託管跑不了上傳 / 列表 / 清空 API）。
- sandbox 用 `allow-scripts allow-same-origin`，片段 script 才能讀取被包裝的文件。**只檢視你信任的片段**——同等於開啟任何本機 HTML 檔。
- 本 app 屬 **nodeapp WebApp 家族**；共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)。

## 授權

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
