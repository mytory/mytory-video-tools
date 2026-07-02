# Mytory Video Tools

> **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇯🇵 日本語:** [README.ja.md](./README.ja.md) · **🇨🇳 简体中文:** [README.zh-cn.md](./README.zh-cn.md) · **🇪🇸 Español:** [README.es.md](./README.es.md) · **🇧🇷 Português:** [README.pt.md](./README.pt.md) · **🇫🇷 Français:** [README.fr.md](./README.fr.md) · **🇮🇩 Bahasa Indonesia:** [README.id.md](./README.id.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** is a cross-platform (Windows, macOS, Linux) desktop application for high-speed video encoding and various media manipulation tasks. It is built with Electron and ships with embedded FFmpeg/FFprobe binaries.

---

## 1. Features

1. **Sidebar Tab Navigation**: Switch between 8 core media utilities within a sleek dark-theme dashboard.
2. **Flexible Output Policy**: By default, files are saved alongside the original with a job-specific suffix. Custom output folders can also be configured.
3. **Auto Hardware Acceleration Detection**: On startup, the app scans your GPU and selects the optimal hardware encoder for your platform (Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QSV, AMD AMF, etc.).

### 8 Core Tools

| Tool | Description |
|---|---|
| ⚡ **Speed Changer** | Change video playback speed (0.5x ~ 4.0x) with pitch preservation (anti-chipmunk). Supports H.264, H.265/HEVC, VP9, AV1. |
| 🎵 **Audio Drop** | Extract audio tracks losslessly (Auto) or convert to MP3, AAC, OGG, or WAV. |
| 🗜️ **Audio Compressor** | Compress lossless audio (WAV, AIFF, FLAC, ALAC) to high-quality MP3 with CBR/VBR encoding. |
| 📸 **Frame Capture** | Single-frame capture, batch extraction at intervals, and automatic scene detection with sensitivity control. |
| 🔄 **Remuxer** | Fast container format conversion (MP4, MKV, MOV) without re-encoding. |
| 🔗 **Video Joiner** | Losslessly concatenate multiple video files with identical encoding parameters. Perfect for re-assembling split segments. |
| ✂️ **Video Splitter** | Losslessly cut a segment by setting start and end points. Extremely fast. |
| 📦 **Compressor** | Compress video to a target file size with various codec and quality options. |

> **🖱️ Global Drag & Drop**: Drag files anywhere onto the app window to instantly add them to the currently active tool.

---

## 2. 🚀 End Users: Installation & Running

If you just want to use the app without building it yourself, follow the steps below.

### Download
*   Visit the [GitHub Releases](https://github.com/mytory/mytory-video-tools/releases) page and download the package for your operating system.
    *   **Windows:** `.exe` (installer)
    *   **macOS:** `.dmg` (disk image) — Intel (x64) / Apple Silicon (arm64)
    *   **Linux:** `.AppImage` (portable)

### ⚠️ Security Warning (Please Read)
This program is distributed by an individual developer and is not signed with a paid code signing certificate. The security warning you may see is **not a defect**. Please follow the instructions below to run the application.

*   **Windows:** On the red SmartScreen warning, click **\[More info\]** → **\[Run anyway\]**
*   **macOS:** **Right-click (or Control+click)** the app file → Select **\[Open\]** → Click **\[Open\]** again

---

## 3. 🛠 Developers: Building from Source

Instructions for setting up a development environment and building the project.

### Prerequisites
[Node.js](https://nodejs.org/) must be installed on your system.

### Install Dependencies
```bash
npm install
```

### Run in Development Mode
```bash
npm start
```

### Build for Distribution
```bash
# Creates distributable packages in the dist/ folder
npm run dist
```

### macOS Code Signing / CI Build Notes

* `npm run dist` loads environment variables from `.env` via `dotenv`.
* The macOS signing identity is read from the `CSC_NAME` variable in `.env`. This variable specifies the name of a certificate installed in your local macOS keychain.
* Example `.env`:
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `CSC_LINK` / `CSC_KEY_PASSWORD` in `.github/workflows/release.yml` are used for P12-based signing in GitHub Actions environments.

---

## 4. Directory Structure

```text
.
├── package.json          # npm package & build config
├── main.js               # Electron main process
├── preload.js            # Context isolation preload script
├── .github/workflows/   # GitHub Actions CI/CD workflows
├── README.md             # Project documentation (English)
├── README.ko.md          # Project documentation (Korean)
├── README.ja.md          # Project documentation (Japanese)
├── README.zh-cn.md       # Project documentation (Chinese Simplified)
├── README.es.md          # Project documentation (Spanish)
├── README.pt.md          # Project documentation (Portuguese)
├── README.fr.md          # Project documentation (French)
├── README.id.md          # Project documentation (Indonesian)
├── README.hi.md          # Project documentation (Hindi)
└── renderer/             # Renderer process (frontend resources)
```

---

## 5. Open Source Licenses

This application uses the following open-source projects and complies with their respective license terms.

*   **[Electron](https://www.electronjs.org/)** (MIT License): Desktop application framework
*   **[FFmpeg](https://ffmpeg.org/)** (LGPL/GPL License): Multimedia processing engine
    *   This app bundles FFmpeg via `ffmpeg-static`. FFmpeg source code is available from the official website.
*   **[Pico.css](https://picocss.com/)** (MIT License): Minimal CSS framework for UI styling
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (MIT License): FFmpeg/FFprobe binary providers
*   **[ExifTool](https://exif-tool.com/)** (GPLv1+ or Artistic License 2.0): Metadata reading/writing engine, bundled via `exiftool-vendored`
    *   ExifTool © 2003-2025 Phil Harvey. Licensed under the GNU General Public License (GPL) version 1 or later, or the Artistic License 2.0.
*   **[exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js)** (MIT License): Cross-platform ExifTool wrapper
*   **[sharp](https://sharp.pixelplumbing.com/)** (Apache 2.0 License): High-performance image processing

---

## 6. License

Copyright (c) 2026 mytory. This project is licensed under the **ISC License**. See the [LICENSE](./LICENSE) file for details.

---

## 7. Contact

For questions, bug reports, or feature suggestions, please reach out via:

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub:** [@mytory](https://github.com/mytory)

---

## 8. Support the Project

Proudly ad-free and user-supported. Every coffee makes a difference.

☕ [Support via PayPal](https://www.paypal.com/ncp/payment/SWKQD7USX8J5U)
