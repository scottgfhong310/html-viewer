# html-viewer — 設計文件

> 開發者面向的設計與實作參考。使用說明見 [README](./README.md)；快速定位 / canon 重點見 [CLAUDE.md](./CLAUDE.md)；
> 家族共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)（`DESIGN_GUIDELINES.md` / `WORKFLOW.md` / `PLAYBOOK.md`）。
> 本 app 屬「**viewer 類**」家族成員，與 `docx-/xlsx-/pptx-viewer` 共用同一套骨架（見 §6 與家族 §4.7）。是本系列 Path A 的起手範例（PLAYBOOK 主寫這支）。

---

## 1. 定位與目標

檢視 **Claude 對話裡的 HTML 片段**——由 `<div>`/`<canvas>` ＋自帶 CDN `<script>`（如 Chart.js）組成、以 Claude 設計系統 token 書寫的片段。
本檢視器把片段包成完整文件、**注入 Claude 設計 token**讓它長得跟對話裡一樣，並在 **sandbox iframe** 內執行、依內容自動撐高。
與其他三支不同：**沒有第三方轉換引擎**，「組文件」本身就是核心邏輯（純字串，放 lib）。

## 2. 架構與資料流

```
使用者
  │  拖拉 / 點選 / ?link=<路徑> / 側欄點擊
  ▼
html-viewer.js（控制器，碰 DOM）
  │  loadAndShow(link)
  ├─ HtmlViewerLib.isSafeLink(link)                 // 路徑安全（純）
  ├─ HtmlViewerLib.fetchText(link)                  // GET → text
  ├─ HtmlViewerLib.buildDoc({link,text,theme,lang}) // ★ 純字串：包成完整 HTML
  ▼
frame.srcdoc = <doc>    // 控制器寫 DOM（sandbox iframe）
  ▼
setupAutoResize()       // 依內容自動撐高（量 body.scrollHeight）
```

- **依賴載入順序**：jQuery → Materialize → Lodash → `html-viewer-lib.js` → `i18n.js` → `locales/*` → `html-viewer.js`。片段自帶的 CDN `<script>`（如 Chart.js）在 **iframe 內**執行。
- **後端**：`/` 302 → `/apps/html-viewer/`；絕對路徑 API → 不相容 GitHub Pages。

## 3. 後端（Express）

與家族一致：`app.js`、`routes/upload.js`（共用最小版）、`routes/html-viewer.js`（`/files`、`/clear`）。

| Method / Path | 說明 | 回應 |
|---|---|---|
| `POST /api/upload?folder=html-viewer` | 上傳（多檔、覆寫）| `{ ok, ... }` |
| `GET /api/html-viewer/files` | 列出 `public/upload/html-viewer/` | `{ ok, files:[{name,size,mtime}] }` |
| `POST /api/html-viewer/clear` | 清空該資料夾 | `{ ok, removed }` |

## 4. 前端四件式

### 4.1 `index.html`（純結構）
- 防閃爍開機腳本（`localStorage('html-viewer-theme')||'dark'`）。
- 結構：側欄、空狀態、`#hv-doc`（toolbar：icon + 檔名 + `#hv-doc-badge`「完整文件」徽章；`#hv-frame`：sandbox iframe）、loading、drop-overlay、`#file-picker`（accept `.html,.htm`）、side-tools。

### 4.2 `html-viewer.css`（主題 token + 樣式）— **兩套 token，別混淆**
- **外殼 token**：家族標準 `--bg/--surface/--text/--accent…`，管 toolbar / frame 外框 / 空狀態 / 側欄。
- **片段 token**：另一套 Claude 設計系統 token（`--color-background-*` 等），**不在這支 CSS**——由 `html-viewer-lib.js` 的 `FRAGMENT_TOKENS` 注入 iframe。

### 4.3 `html-viewer-lib.js`（核心 library，`window.HtmlViewerLib`，純邏輯、不碰 DOM）
本支的「渲染準備」是純字串運算，故**連 `buildDoc` 都在 lib**：

| 成員 | 說明 |
|---|---|
| `isSafeLink(link)` | 擋 `..`、`\`、scheme、`//`；絕對路徑須命中 `ALLOWED_ABSOLUTE_PREFIXES`（`/upload/html-viewer/`）|
| `isUploadable(name)` | `/\.html?$/i` |
| `isFullDocument(text)` | 開頭是否 `<!doctype html>` / `<html>` |
| `buildDoc({link,text,theme,lang})` | **iframe srcdoc 的完整 HTML**：`isFullDocument` 命中→**原樣回傳**（passthrough）；否則包裝片段＝注入 `FRAGMENT_TOKENS`（Claude token，light/dark）＋ `matchMedia` shim ＋ `<base href>` |
| `fetchText / uploadFile / listFiles / clearFolder` | 伺服器溝通 |
| `fileUrl / escapeHtml / timestamp / formatSize` | 工具 |

### 4.4 `html-viewer.js`（控制器，碰 DOM）
- `renderDoc()`：`isFullDocument` 判定 → `frame.srcdoc = buildDoc(...)` → `setupAutoResize`；更新檔名、徽章。
- `setupAutoResize()`：**只量 `body.scrollHeight`**（`documentElement.scrollHeight` 會與設定高度回授）；`ResizeObserver` + 失誤保險 timers `[50,200,600,1500]ms`（剛插入 iframe load 可能漏接）。
- `toggleTheme()`：片段吃注入 token + `matchMedia` shim → **重建 iframe** 讓它換主題；**完整文件原樣放行、自管主題，不重建**（避免重載閃爍）。
- 其餘同家族：清單 / 上傳 / 清空 / 拖拉 / i18n / `?link=` 深連結。
- **在新分頁開原始檔**：右側 `#setting-open` 側鍵（`window.open(link,'_blank','noopener')`，§4.7），只在開檔時顯示 + `check` 微回饋。

## 5. 關鍵設計決策（與理由 / 替代方案）

1. **無第三方引擎，自組文件。** 片段是 HTML，直接包成完整文件即可；核心是「包裝 + 注入 token」，純字串 → 放 lib（`buildDoc`）。
2. **片段 vs 完整文件。** `isFullDocument` 命中（自帶 `<!doctype>`/`<html>`）→ **原樣放行**，交給它自己的 `<head>`；否則才包裝注入 token。避免對完整文件重複套殼。
3. **sandbox iframe（`allow-scripts allow-same-origin`）。** 片段自帶 `<script>`（Chart.js…）要能跑且能讀被包裝的文件 → 需 same-origin。代價：**只檢視信任來源**。
4. **注入 Claude 設計 token + `matchMedia` shim。** 讓片段在這裡長得跟對話裡一樣；shim 覆寫 `matchMedia('prefers-color-scheme')` 使片段配色（如 Chart.js）跟使用者選的主題而非系統主題。
5. **自動撐高只量 `body.scrollHeight`。** 避免與 iframe 自身高度回授；補 failsafe timers。
6. **「開原始檔」走側鍵**（家族 §4.7）。其動作是 `open_in_new`（在新分頁開）、非下載——片段是可執行內容、看原始檔比下載實用。

## 6. lib / 控制器邊界（家族 §4.7）

html-viewer 與 `xlsx-viewer` 同屬「**渲染準備是純運算 → 進 lib**」這側：`buildDoc`（純字串）在 lib，`frame.srcdoc=`（寫 DOM）在控制器。對照 `docx-/pptx-viewer`（引擎直接寫 DOM、渲染只能留控制器）。

## 7. 主題 / i18n / 安全

- **主題**：外殼用家族 token；片段用注入的 Claude token；切主題重建片段 iframe（完整文件不重建）。預設 dark；防閃爍。
- **i18n**：引擎 + locales×3，預設 `zh-Hant`；**片段內容是 data，永不翻譯**。
- **安全**：上傳白名單 `.html/.htm`；`isSafeLink`；sandbox `allow-scripts allow-same-origin`（**只檢視信任片段**）；後端操作目標寫死、`{ok}` 信封、5mb 上限、`confirm`。

## 8. 已知限制與取捨

- **信任邊界**：same-origin sandbox 讓片段 script 能讀同源——等同開啟本機 HTML，**勿載入不信任來源**。
- **自動撐高**：極端版型（內部自捲動、絕對定位溢出）可能量不準；failsafe timers 緩解但非萬靈。
- **完整文件**：原樣放行，外殼主題不影響其內部。

## 9. 參考

- 家族規範：`DESIGN_GUIDELINES.md`（§4.1 拆分、§4.7 viewer 引擎與 lib 邊界、§5 視覺、§6 i18n、§8 安全）。
- 流程：`WORKFLOW.md`、`PLAYBOOK.md`（本支為 Path A 主範例；§5 `display=''` 坑）。
