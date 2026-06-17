# html-viewer

**English** · [中文](README.zh-Hant.md) · [日本語](README.ja.md)

A single-page web app to **view HTML fragments from Claude conversations** — the kind made of `<div>` / `<canvas>` + a self-contained `<script>` (e.g. Chart.js), authored against Claude's design-system CSS tokens. It wraps each fragment into a full document, **injects the Claude design tokens** (`--color-background-secondary`, …) so it looks the way it did in the conversation, and runs it inside a **sandboxed iframe**. Backed by a lightweight Express server for upload / list / clear.

- 🧩 **Fragment viewer** — injects Claude design tokens + a `matchMedia` shim, runs the fragment's own `<script>` (Chart.js etc.) in a `sandbox` iframe that **auto-sizes** to its content
- 📄 **Full-document passthrough** — if the file is already a complete `<!doctype html>` document, it's rendered **as-is** (no wrapping, no token injection); a "Full document" badge marks it
- 📥 **Drag & drop upload** — drop `.html` / `.htm` anywhere on the page; **same name overwrites**
- 🔗 **Deep links** — open any file with `?link=<path>` (relative to the viewer, or an allow-listed absolute path); shareable & back/forward aware
- 🌗 **Light / Dark** toggle (saved in localStorage; the iframe rebuilds so the fragment & its charts follow the theme)
- 🌐 **Multilingual UI** — 繁體中文 / English / 日本語 (default 繁體中文, saved in localStorage)
- 🛡️ **Path safety** — blocks `..`, backslashes, `javascript:` / `file:` schemes, protocol-relative `//`, and non-allow-listed absolute paths
- 🗂️ File-list sidebar, open original in a new tab, empty folder

> Third-party front-end libraries (jQuery, Materialize, Lodash, Material Icons) load from CDN — no bundling or build step. Each fragment brings its own CDN `<script>` (e.g. Chart.js), executed inside the sandbox.

## Quick start

Requires Node.js 18+.

```bash
npm install
npm start
# open http://localhost:3000/apps/html-viewer/
```

Set `PORT` to change the port: `PORT=8080 npm start`.

## Directory structure

```
html-viewer/
├── app.js                          # Standalone Express server (static + 2 APIs)
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=html-viewer (multer, multi-file, overwrite)
│   └── html-viewer.js              # GET /files, POST /clear
└── public/
    ├── apps/html-viewer/           # Front end (served at /apps/html-viewer/)
    │   ├── index.html              # Structure only
    │   ├── html-viewer.css         # Theme tokens + page styles
    │   ├── html-viewer.js          # Controller (glue): theme / i18n / upload / iframe
    │   ├── html-viewer-lib.js      # HtmlViewerLib: safety / doc-building / server I/O (pure, no DOM)
    │   ├── materialize-dark.css    # Shared family asset (Materialize dark)
    │   ├── side-tool.css           # Right-side floating toolbar
    │   ├── thinking-dot.css        # Shared loading-dot utility
    │   ├── i18n.js                 # i18n engine
    │   └── locales/{zh-Hant,en,ja}.js
    └── upload/html-viewer/         # Uploaded fragments (contents are git-ignored; one sample shipped)
```

## API

| Method / Path | Description |
|---|---|
| `POST /api/upload?folder=html-viewer` | Upload (form field `myFiles`, multi-file; keeps the original name when `folder` is set → overwrites) |
| `GET /api/html-viewer/files` | List visible files in `public/upload/html-viewer/` (newest first) |
| `POST /api/html-viewer/clear` | Delete all visible files in that folder (keeps the folder & hidden files) |

Static read: `/upload/html-viewer/<name>`. All API responses use the `{ ok }` envelope.

`GET /api/html-viewer/files` returns:

```jsonc
{
  "ok": true,
  "files": [
    { "name": "string", "size": 0, "mtime": 0 }   // mtime = epoch ms; sorted newest → oldest
  ]
}
```

## Core library (`HtmlViewerLib`)

Pure logic, no DOM — embeddable on its own. Key method:

```jsonc
// HtmlViewerLib.buildDoc({ link, text, theme, lang }) → string  (iframe srcdoc)
//   isFullDocument(text) === true  → returns `text` unchanged (passthrough)
//   otherwise                      → wraps the fragment: injects Claude tokens +
//                                    a matchMedia shim + <base href>, in a
//                                    <html data-theme="light|dark"> document
```

Other helpers: `isSafeLink`, `isFullDocument`, `isUploadable`, `listFiles`, `uploadFile`, `clearFolder`, `fetchText`, `fileUrl`, `formatSize`, `timestamp`.

## Notes

- The front end calls APIs with **absolute paths** (`/api/...`, `/upload/...`), so it must be served from the **site root** by this project's Node server. **Not GitHub-Pages-compatible** (static hosting can't run the upload / list / clear APIs).
- The sandbox uses `allow-scripts allow-same-origin` so fragment scripts can read the wrapped document. Only view fragments you trust — the same as opening any local HTML file.
- This app belongs to the **nodeapp WebApp family**; shared conventions live in [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family).

## License

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
