# html-viewer

[English](README.md) · [中文](README.zh-Hant.md) · **日本語**

**Claude の会話に出てくる HTML 断片**を表示する単一ページ Web アプリ——`<div>` / `<canvas>` ＋自前の CDN `<script>`（Chart.js など）で構成され、Claude のデザインシステム token で書かれた断片を対象とします。断片を完全な文書に包み、**Claude のデザイン token**（`--color-background-secondary` …）を**注入**して会話で見たままに表示し、**サンドボックス iframe** 内で実行します。バックエンドは軽量な Express（アップロード / 一覧 / クリア）。

- 🧩 **断片ビューア** — Claude token ＋ `matchMedia` shim を注入し、断片自前の `<script>`（Chart.js 等）を `sandbox` iframe 内で実行。iframe は内容に合わせて**自動で高さ調整**
- 📄 **完全な文書はそのまま** — ファイルがすでに完全な `<!doctype html>` 文書なら**そのまま**描画（包まず・token を注入せず）、「完全な文書」バッジを表示
- 📥 **ドラッグ＆ドロップ** — `.html` / `.htm` をページ上にドロップ；**同名は上書き**
- 🔗 **ディープリンク** — `?link=<パス>` で任意のファイルを開く（ビューア相対、または許可リストの絶対パス）；共有可・戻る／進む対応
- 🌗 **ライト / ダーク**切替（localStorage 保存；切替時に iframe を再構築し、断片とそのグラフもテーマに追従）
- 🌐 **多言語 UI** — 繁體中文 / English / 日本語（既定は繁體中文、localStorage 保存）
- 🛡️ **パス安全性** — `..`・バックスラッシュ・`javascript:` / `file:` スキーム・protocol-relative `//`・許可リスト外の絶対パスを遮断
- 🗂️ ファイル一覧サイドバー、元ファイルを新しいタブで開く、フォルダを空にする

> サードパーティのフロントエンドライブラリ（jQuery、Materialize、Lodash、Material Icons）は CDN から読み込み——バンドルもビルドも不要。各断片は自前の CDN `<script>`（Chart.js 等）を持ち、サンドボックス内で実行されます。

## クイックスタート

Node.js 18+ が必要です。

```bash
npm install
npm start
# http://localhost:3000/apps/html-viewer/ を開く
```

ポート変更は `PORT`：`PORT=8080 npm start`。

## ディレクトリ構成

```
html-viewer/
├── app.js                          # スタンドアロン Express サーバ（static + API 2 本）
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=html-viewer（multer・複数・上書き）
│   └── html-viewer.js              # GET /files、POST /clear
└── public/
    ├── apps/html-viewer/           # フロントエンド（/apps/html-viewer/ で配信）
    │   ├── index.html              # 構造のみ
    │   ├── html-viewer.css         # テーマ token + ページスタイル
    │   ├── html-viewer.js          # コントローラ（グルー）：テーマ / i18n / アップロード / iframe
    │   ├── html-viewer-lib.js      # HtmlViewerLib：安全性 / 文書生成 / サーバ通信（純ロジック・DOM 非依存）
    │   ├── materialize-dark.css    # ファミリー共有アセット（Materialize ダーク）
    │   ├── side-tool.css           # 右側フローティングツールバー
    │   ├── thinking-dot.css        # 共有ローディングドット utility
    │   ├── i18n.js                 # i18n エンジン
    │   └── locales/{zh-Hant,en,ja}.js
    └── upload/html-viewer/         # アップロードされた断片（内容は git 管理外；サンプルを 1 つ同梱）
```

## API

| Method / Path | 説明 |
|---|---|
| `POST /api/upload?folder=html-viewer` | アップロード（form フィールド `myFiles`・複数；`folder` 指定時は元の名前を保持 → 上書き）|
| `GET /api/html-viewer/files` | `public/upload/html-viewer/` 内の可視ファイルを一覧（新しい順）|
| `POST /api/html-viewer/clear` | そのフォルダ内の可視ファイルをすべて削除（フォルダと隠しファイルは保持）|

静的読み取り：`/upload/html-viewer/<name>`。すべての API は `{ ok }` エンベロープ。

`GET /api/html-viewer/files` の戻り値：

```jsonc
{
  "ok": true,
  "files": [
    { "name": "string", "size": 0, "mtime": 0 }   // mtime = epoch ms；新→旧でソート
  ]
}
```

## コアライブラリ（`HtmlViewerLib`）

純ロジック・DOM 非依存で単体組み込み可能。主要メソッド：

```jsonc
// HtmlViewerLib.buildDoc({ link, text, theme, lang }) → string  （iframe srcdoc）
//   isFullDocument(text) === true  → text をそのまま返す（passthrough）
//   それ以外                       → 断片を包む：Claude token ＋ matchMedia shim
//                                    ＋ <base href> を <html data-theme="light|dark"> 文書に注入
```

その他のヘルパ：`isSafeLink`、`isFullDocument`、`isUploadable`、`listFiles`、`uploadFile`、`clearFolder`、`fetchText`、`fileUrl`、`formatSize`、`timestamp`。

## 備考

- フロントエンドは API を**絶対パス**（`/api/...`、`/upload/...`）で呼ぶため、本プロジェクトの Node サーバが**サイトルート**から配信する必要があります。**GitHub Pages 非対応**（静的ホスティングではアップロード / 一覧 / クリア API を実行できません）。
- サンドボックスは `allow-scripts allow-same-origin` を使用し、断片スクリプトが包まれた文書を読めるようにしています。**信頼できる断片のみを表示**してください——ローカルの HTML を開くのと同じです。
- 本アプリは **nodeapp WebApp ファミリー**に属します。共通規約は [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family) を参照。

## ライセンス

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
