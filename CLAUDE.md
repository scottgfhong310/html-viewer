# html-viewer — Session context

檢視 **Claude 對話 HTML 片段**（`<div>`/`<canvas>` ＋自帶 CDN `<script>`，如 Chart.js）的單頁 WebApp：
把片段包成完整文件、**注入 Claude 設計系統 token**（`--color-background-*`）讓它長得跟對話裡一樣，
並在 **sandbox iframe**（`allow-scripts allow-same-origin`）內執行、依內容自動撐高。輕量 Express 後端（上傳 / 列表 / 清空）。
由 `markdown-reader` 起手式複製改名而來（Path A），共用家族 canon（主題 / i18n / 四件式 / side-tool）。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程）。**改動前請先讀那兩份，照其中 canon 做。**

**設計細節（架構 / 逐模組 / 決策 / 限制）見 [DESIGN.md](./DESIGN.md)。**

## 結構

```
app.js                              # Express 入口：port 3000；/ → 302 /apps/html-viewer/
routes/upload.js                    # POST /api/upload?folder=html-viewer（家族共用最小版：權威版＝ nodeapp-webapp-family/routes-upload.js，byte-identical；含檔名消毒 sanitizeUploadName，§3.4）
routes/html-viewer.js               # GET /files、POST /clear
public/apps/html-viewer/            # 前端（服務於 /apps/html-viewer/）
├─ index.html · html-viewer.css · html-viewer.js · html-viewer-lib.js
├─ materialize-dark.css             # 家族共用（Materialize 深色；materialize.css 之後載入）
├─ side-tool.css · side-tool.js     # 家族共用側鍵：〔正統〕flex .side-tools 樣式＋setIconDone 行為（權威版＝家族 repo，§5.5）
├─ thinking-dot.css                 # 共用載入點 utility（權威版＝獨立 repo thinking-dot；本份消費、byte-identical 同步；載入點預設 2026-07-19 隨權威統一 14px→27px/2.1s）
├─ i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/html-viewer/          # 上傳的片段（內容不進版控；附一個 sample）
scripts/make-icons.py               # viewer 六支共用的 icon 產生器（六份 byte-identical）
scripts/sync-copies.sh              # viewer 六支共用的回灌腳本（同上；不碰 upload.js／public/upload/）
public/apps/html-viewer/icons/              # App icon：母版 SVG 深/淺＋favicon(.ico/.svg)＋PNG 16–512＋manifest

```

## 執行 / 驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/html-viewer/
```

## App icon（viewer 六支共用模板）

```bash
python3 scripts/make-icons.py       # 重產整套 icon（SVG／PNG／.ico／manifest）
```

`docx-viewer`／`html-viewer`／`pptx-viewer`／`xlsx-viewer`／`rare-glyph`／`svg-style`
**共用同一支產生器**（六份 byte-identical，照家族 A 類共用件慣例；改一份要六份一起同步，
`md5` 應為單一 hash）。它靠**自己所在的 repo 目錄名**決定產哪一支，所以六份不必各自改參數。

**共用的是 tile 系統，不是圖案**：同樣的圓角方塊、同樣的「紙」與同樣的 accent
（`#90caf9`——六支的 `--accent` 本來就相同），一眼是一套；差異只在裡面那枚純幾何標記。
本 app 是 **一對角括號（HTML 片段）**。

- **刻意不用副檔名字樣**（`.docx` 這種）：六支裡 `rare-glyph`／`svg-style` 根本不是文件檢視器，
  套上去會說謊。純幾何也省掉字型依賴（光柵化時不必內嵌字型）。
- ⚠️ **PyMuPDF 兩個限制**（家族其他 icon 也踩過）：① **不渲染 `linearGradient`**，會整片退成黑色
  → 母版一律純色底；② **以 SVG 宣告的 `width`/`height` 為渲染基準、不是 `viewBox`**
  → 倍率要用「目標 ÷ 實際 page 寬」反推。
- **產出要排出來看**：`html-viewer` 第一版的角括號尖端朝內，讀起來是一個 ✕ 而不是 `< >`——
  九個 PNG 都產出、尺寸都對，光看檔案清單完全發現不了。

### 回灌 InProgress

```bash
bash scripts/sync-copies.sh
```

同樣是 **viewer 六支共用、byte-identical 的一份**（靠 repo 目錄名認自己是誰）。
**兩個絕對不覆蓋的東西**：`routes/upload.js`（InProgress 是加強版，往回蓋會弄壞孵化器上
所有 app 的上傳——腳本只搬 `routes/<app>.js`，並在偵測到兩邊變成一樣時出聲）、
`public/upload/`（使用者實際上傳的檔案，從不觸碰）。`app.js` 同理不同步。
共用件一律**只驗不抓**，不一致時明講去哪個 repo 同步、回非 0。

## 本 app 的 canon 重點

- **兩套 token，別混淆**：`html-viewer.css` 的家族 token（`--bg/--surface/--text/--accent`…）管「外殼」（toolbar / frame / 空狀態 / 側欄）；iframe 內片段用的是另一套 **Claude 設計系統 token**（`--color-background-*`），由 `html-viewer-lib.js` 的 `FRAGMENT_TOKENS` 注入。
- **可嵌入 lib** `html-viewer-lib.js`（`window.HtmlViewerLib`，純邏輯、不碰 DOM）：
  - `buildDoc({link,text,theme,lang})` → iframe srcdoc 用的完整 HTML。**`isFullDocument(text)` 命中 `<!doctype>`/`<html>` 就原樣回傳**（passthrough、不包不注入）；否則包裝片段＝注入 Claude token ＋ `matchMedia` shim ＋ `<base href>`。
  - `isSafeLink()`：擋 `..`、反斜線、scheme（`http:`/`file:`/`javascript:`）、protocol-relative `//`；絕對路徑須命中 `ALLOWED_ABSOLUTE_PREFIXES`（預設 `['/upload/html-viewer/']`），相對路徑相對 viewer 目錄放行。
  - server 通訊：`listFiles` / `uploadFile` / `clearFolder` / `fetchText`；工具 `formatSize` / `timestamp` / `fileUrl`。
- **控制器** `html-viewer.js`（碰 DOM）：主題切換（重建片段 iframe；完整文件不重建）、i18n 重繪、拖拉/上傳、檔案清單、iframe 插入＋`ResizeObserver` 自動撐高＋failsafe timers、`?link=` 深連結（`pushState`/`popstate`）。
- **iframe 自動撐高**：只量 `body.scrollHeight`（`documentElement.scrollHeight` 會與設定的高度回授）；剛插入時 load 可能漏接，補 `[50,200,600,1500]ms` timers。
- **matchMedia shim**：覆寫 iframe 內 `matchMedia('prefers-color-scheme')`，讓片段（如 Chart.js 配色）跟使用者選的主題而非系統主題。
- **主題**：CSS 變數 light/dark，**預設 dark**（markdown-reader 形式：`<html data-theme="dark">` ＋ `localStorage('html-viewer-theme')||'dark'`）；防閃爍開機腳本同時 toggle `dark-mode`/`light-mode` class 驅動 `materialize-dark.css`（§5.1）。
- **i18n**：`i18n.js` 引擎 + `locales/*.js`，`data-i18n` 屬性，預設 `zh-Hant`。片段內容是 **data，永不翻譯**。
- **side-tool**：`#setting-menu`（檔案清單）/ `#setting-open`（在新分頁開原始檔，只在開檔時顯示、`window.open(link,'_blank','noopener')` + check 回饋）/ `#setting-clear`（清空，hover 轉紅）/ `#setting-mode`（主題）/ `#setting-lang`；用〔正統〕flex `.side-tools` 容器，**chrome（主題／語言）墊底**（§5.5 排列順序，2026-07-26 收斂）。**動作走側鍵、toolbar 不放操作鍵**（家族 §4.7）。
- **安全**：sandbox `allow-scripts allow-same-origin`；只檢視信任的片段。後端操作目標寫死、`{ ok }` 信封；jQuery 3.7.1，後端不依賴 lodash。
- **InProgress 鏡像**：同名前端也回灌到 `InProgress/public/apps/html-viewer/`，route 掛在 InProgress 的 `/api/html-viewer`；上傳沿用 InProgress 共用 `/api/upload?folder=html-viewer`（雙鍵 `{ ok, success }`，前端查 `resp.ok`）。
