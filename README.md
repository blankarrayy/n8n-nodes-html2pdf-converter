# n8n-nodes-html2pdf-converter

[![npm version](https://img.shields.io/npm/v/n8n-nodes-html2pdf-converter.svg?style=flat-square)](https://www.npmjs.com/package/n8n-nodes-html2pdf-converter)
[![npm downloads](https://img.shields.io/npm/dt/n8n-nodes-html2pdf-converter.svg?style=flat-square)](https://www.npmjs.com/package/n8n-nodes-html2pdf-converter)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

Fast, lightweight HTML to PDF converter for [n8n](https://n8n.io). Generate pixel-perfect invoices, reports, receipts, and dynamic documents from HTML/CSS with zero Chromium or Puppeteer overhead.

---

## 🚀 Why Choose This Node?

Traditional HTML-to-PDF nodes in n8n rely on heavy headless browsers like **Puppeteer**, **Playwright**, or **Chromium**. While powerful, they introduce severe pain points in automated workflow environments:
- ❌ **Massive RAM Consumption:** Chromium instances consume 300MB–800MB+ RAM per process, causing Out-Of-Memory (OOM) workflow crashes.
- ❌ **Docker Library Errors:** Alpine Linux and hardened containers frequently crash with missing shared libraries (`libnss3.so`, `libnspr4.so`, `spawn ENOEXEC`, code 127).
- ❌ **Slow Cold Starts:** Launching a full browser process for every document adds seconds of latency.

### The Solution: 100% Plug & Play
- ⚡ **Instant Rendering:** Standalone native engine compiles pages directly without spawning browser processes.
- 📦 **Pre-bundled Binaries:** Includes statically-linked musl binaries directly inside the node. No `apk add chromium`, no external microservices, and no server configuration needed.
- 🎯 **Pixel-Perfect Modern Layouts:** Full support for CSS Flexbox, Grid, `@page` rules, page-break controls (`break-inside: avoid`), custom fonts, and web assets.
- 🛡️ **Zero Squeezing:** Default margins are set to `0` so your HTML/CSS layout starts flush from the page boundary as designed, without arbitrary 1-inch blank margins.
- 🔄 **Drop-in Compatible:** Completely backward-compatible with workflows created using v1.0.0.

---

## 💻 Platform & Architecture Support

The node automatically detects your system architecture at runtime:

| Platform | Architecture | Binary Type | Compatibility |
|---|---|---|---|
| **Linux** | `x86_64` (`x64`) | ELF 64-bit Static Musl | ✅ Alpine Linux (Official n8n Docker), Debian, Ubuntu, RHEL |
| **Linux** | `aarch64` (`arm64`) | ELF 64-bit Static Musl | ✅ AWS Graviton, Apple Silicon Docker, Raspberry Pi |
| **macOS** | `arm64` | Mach-O 64-bit | ✅ Apple Silicon (M1/M2/M3/M4) local instances |

---

## 📦 Installation

### Method 1: Community Nodes (Recommended)
1. In your n8n dashboard, go to **Settings** > **Community Nodes**.
2. Click **Install a community node**.
3. Enter `n8n-nodes-html2pdf-converter`.
4. Accept the community node risk prompt and click **Install**.

### NOTE: Docker Environment
Add the following environment variable to your n8n Docker configuration:
```env
N8N_COMMUNITY_PACKAGES_ENABLED=true
```

---

## ✨ Features

- **CSS3 Flexbox & Grid:** Modern responsive layout models rendered natively.
- **Remote Assets by Default:** Remote HTTP/HTTPS images (`<img src="...">`), stylesheets, and web fonts load automatically.
- **First-Class Pagination:** Respects CSS Fragmentation (`break-before`, `break-after`, `break-inside: avoid`, `orphans`, `widows`).
- **Dynamic Headers & Footers:** Configurable margin-box headers and footers with variable placeholders like `[page]`, `[pages]`, `[date]`, and `[title]`.
- **Automatic Table of Contents:** Generates an indexed TOC directly from your document headings with `--toc`.
- **Custom Dimensions:** Choose standard paper sizes (`A4`, `Letter`, `Legal`, `A3`, `A5`, etc.) or define explicit dimensions (`mm`, `cm`, `in`, `pt`, `px`).
- **Flexible Inputs:** Convert HTML strings containing n8n dynamic expressions (`{{ $json.myHtml }}`), remote URLs, or binary files.

---

## 🛠️ Node Configuration

### Main Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| **Source Type** | Options | `HTML String` | Choose `HTML String`, `Binary File`, or `URL`. |
| **HTML** | String | Default template | HTML markup to render. Supports n8n expressions like `{{ $json.clientName }}`. |
| **URL** | String | `""` | Web page URL to fetch and convert (when Source Type is `URL`). |
| **Property Name** | String | `data` | The binary property key where the generated PDF will be stored. |
| **File Name** | String | `document.pdf` | File name assigned to the generated PDF. |
| **Mode** | Options | `Plug & Play (Embedded)` | Runs the self-contained native engine. Optionally switch to `External HTTP Server`. |

### Options (Pre-configured by Default)

The following options are active by default in the node:

- **Page Size:** `A4` *(or Letter, Legal, Tabloid, A0–A6, Custom)*
- **Orientation:** `Portrait` *(or Landscape)*
- **Allow Remote Assets:** `true` *(fetches external images, stylesheets, and fonts over HTTP/HTTPS)*

### Additional Options

Click **Add Option** in the node to configure:
- **Margins:** `Margin Top`, `Margin Bottom`, `Margin Left`, `Margin Right` (default is `0` so your CSS controls the layout; supports units like `10mm`, `0.5in`, `20px`).
- **Headers & Footers:** `Header Left/Center/Right`, `Footer Left/Center/Right`, separator lines, and spacing.
- **Table of Contents:** Insert an automatic TOC with customized headings.
- **DPI & Scaling:** Adjust `DPI` (default `96`) and `Zoom Factor` (default `1.0`).
- **Appearance:** `Grayscale Mode`, `No Background`, `No Images`, `No Compression`.
- **Streaming Mode:** Emits pages incrementally for low-memory processing of large documents.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
Credits to [sghtmltopdf](https://github.com/waka/sghtmltopdf)
