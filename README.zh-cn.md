# Mytory Video Tools

> **🇬🇧 English:** [README.md](./README.md) · **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇯🇵 日本語:** [README.ja.md](./README.ja.md) · **🇪🇸 Español:** [README.es.md](./README.es.md) · **🇧🇷 Português:** [README.pt.md](./README.pt.md) · **🇫🇷 Français:** [README.fr.md](./README.fr.md) · **🇮🇩 Bahasa Indonesia:** [README.id.md](./README.id.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** 是一款跨平台（Windows、macOS、Linux）桌面应用程序，用于高速视频编码和各种媒体处理任务。它基于 Electron 构建，并内嵌了 FFmpeg/FFprobe 二进制文件。

---

## 1. 功能特性

1. **侧边栏标签导航**：在时尚的深色主题仪表板中切换 6 个核心媒体工具。
2. **灵活的输出策略**：默认情况下，文件会以任务特定的后缀保存在原文件所在位置。也可以配置自定义输出文件夹。
3. **自动硬件加速检测**：启动时扫描你的 GPU，自动选择最适合你平台的硬件编码器（Apple Silicon VideoToolbox、NVIDIA NVENC、Intel QSV、AMD AMF 等）。

### 6 个核心工具

| 工具 | 说明 |
|---|---|
| ⚡ **倍速转换 (Speed Changer)** | 改变视频播放速度（0.5x~4.0x），同时保持音调不变（防花栗鼠音效）。支持 H.264、H.265/HEVC、VP9、AV1。 |
| 🎵 **音频提取 (Audio Drop)** | 无损提取音轨（自动）或转换为 MP3、AAC、OGG、WAV 格式。 |
| 📸 **帧捕获 (Frame Capture)** | 单帧捕获、按间隔批量提取、灵敏度可调的自动场景检测。 |
| 🔄 **格式转换 (Remuxer)** | 无需重新编码即可快速转换容器格式（MP4、MKV、MOV）。 |
| ✂️ **视频分割 (Video Splitter)** | 通过设置起始点和结束点无损剪切片段。速度极快。 |
| 📦 **压缩 (Compressor)** | 使用多种编码器和质量选项将视频压缩到目标文件大小。 |

> **🖱️ 全局拖放**：将文件拖放到应用程序窗口的任何位置，即可立即添加到当前活动的工具中。

---

## 2. 🚀 最终用户：安装与运行

如果您只想使用应用程序而不自行构建，请按以下步骤操作。

### 下载
*   访问 [GitHub Releases](https://github.com/mytory/mytory-video-tools/releases) 页面，下载您操作系统对应的安装包。
    *   **Windows:** `.exe`（安装程序）
    *   **macOS:** `.dmg`（磁盘映像） — Intel (x64) / Apple Silicon (arm64)
    *   **Linux:** `.AppImage`（便携式）

### ⚠️ 安全警告（请阅读）
本程序由个人开发者分发，未使用付费代码签名证书进行签名。您可能看到的安全警告**并非缺陷**。请按照以下说明运行应用程序。

*   **Windows:** 在红色 SmartScreen 警告上，点击 **[更多信息]** → **[仍要运行]**
*   **macOS:** **右键点击（或 Control+点击）** 应用文件 → 选择 **[打开]** → 再次点击 **[打开]**

---

## 3. 🛠 开发者：从源码构建

设置开发环境并构建项目的说明。

### 前提条件
系统必须安装 [Node.js](https://nodejs.org/)。

### 安装依赖
```bash
npm install
```

### 以开发模式运行
```bash
npm start
```

### 构建发布包
```bash
# 在 dist/ 文件夹中创建可分发的安装包
npm run dist
```

### macOS 代码签名 / CI 构建说明

* `npm run dist` 通过 `dotenv` 从 `.env` 加载环境变量。
* macOS 签名标识从 `.env` 中的 `CSC_NAME` 变量读取。该变量指定了本地 macOS 钥匙串中安装的证书名称。
* `.env` 示例：
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `.github/workflows/release.yml` 中的 `CSC_LINK` / `CSC_KEY_PASSWORD` 用于 GitHub Actions 环境中基于 P12 的签名。

---

## 4. 目录结构

```text
.
├── package.json          # npm 包 & 构建配置
├── main.js               # Electron 主进程
├── preload.js            # 上下文隔离预加载脚本
├── .github/workflows/   # GitHub Actions CI/CD 工作流配置
├── README.md             # 项目文档 (英语)
├── README.ko.md          # 项目文档 (韩语)
├── README.ja.md          # 项目文档 (日语)
├── README.zh-cn.md       # 项目文档 (中文)
├── README.es.md          # 项目文档 (西班牙语)
├── README.pt.md          # 项目文档 (葡萄牙语)
├── README.fr.md          # 项目文档 (法语)
├── README.id.md          # 项目文档 (印尼语)
├── README.hi.md          # 项目文档 (印地语)
└── renderer/             # 渲染器进程 (前端资源)
```

---

## 5. 开源许可证

本应用程序使用了以下开源项目，并遵守其各自的许可条款。

*   **[Electron](https://www.electronjs.org/)** (MIT License)：桌面应用程序框架
*   **[FFmpeg](https://ffmpeg.org/)** (LGPL/GPL License)：多媒体处理引擎
    *   本应用通过 `ffmpeg-static` 捆绑了 FFmpeg。FFmpeg 源代码可从官方网站获取。
*   **[Pico.css](https://picocss.com/)** (MIT License)：用于 UI 样式的最小化 CSS 框架
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (MIT License)：FFmpeg/FFprobe 二进制文件提供程序

---

## 6. 许可证

Copyright (c) 2026 mytory. 本项目采用 **ISC License** 许可。详情请参阅 [LICENSE](./LICENSE) 文件。

---

## 7. 联系方式

如有问题、错误报告或功能建议，请通过以下方式联系：

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub:** [@mytory](https://github.com/mytory)
