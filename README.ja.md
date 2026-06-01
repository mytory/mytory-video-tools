# Mytory Video Tools

> **🇬🇧 English:** [README.md](./README.md) · **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇨🇳 简体中文:** [README.zh-cn.md](./README.zh-cn.md) · **🇪🇸 Español:** [README.es.md](./README.es.md) · **🇧🇷 Português:** [README.pt.md](./README.pt.md) · **🇫🇷 Français:** [README.fr.md](./README.fr.md) · **🇮🇩 Bahasa Indonesia:** [README.id.md](./README.id.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** は、高速ビデオエンコードおよびさまざまなメディア操作タスクのためのクロスプラットフォーム（Windows、macOS、Linux）デスクトップアプリケーションです。Electron で構築され、FFmpeg/FFprobe バイナリを内蔵しています。

---

## 1. 特徴

1. **サイドバータブナビゲーション**: 6つのコアメディアユーティリティをスタイリッシュなダークテーマのダッシュボード内で切り替えられます。
2. **柔軟な出力ポリシー**: デフォルトでは元のファイルと同じ場所にジョブ固有のサフィックスを付けて保存。カスタム出力フォルダも設定可能です。
3. **ハードウェアアクセラレーション自動検出**: 起動時にGPUをスキャンし、プラットフォームに最適なハードウェアエンコーダーを自動選択します（Apple Silicon VideoToolbox、NVIDIA NVENC、Intel QSV、AMD AMF等）。

### 6つのコアツール

| ツール | 説明 |
|---|---|
| ⚡ **速度変換 (Speed Changer)** | ピッチを保持（アンチチップマンク）したまま再生速度を変更（0.5x〜4.0x）。H.264、H.265/HEVC、VP9、AV1に対応。 |
| 🎵 **音声抽出 (Audio Drop)** | 音声トラックをロスレス抽出（自動）またはMP3、AAC、OGG、WAVに変換。 |
| 📸 **フレームキャプチャ (Frame Capture)** | 単一フレームキャプチャ、間隔を指定した一括抽出、感度調整可能な自動シーン検出。 |
| 🔄 **リマックス (Remuxer)** | 再エンコードなしでコンテナフォーマット（MP4、MKV、MOV）を高速変換。 |
| ✂️ **動画分割 (Video Splitter)** | 開始点と終了点を設定してセグメントをロスレスでカット。非常に高速。 |
| 📦 **圧縮 (Compressor)** | さまざまなコーデックと品質オプションで動画を目標ファイルサイズに圧縮。 |

> **🖱️ グローバルドラッグ＆ドロップ**: アプリウィンドウのどこにでもファイルをドラッグして、現在アクティブなツールに即座に追加できます。

---

## 2. 🚀 エンドユーザー: インストールと実行

自分でビルドせずにアプリを使用する場合は、以下の手順に従ってください。

### ダウンロード
*   [GitLab Releases](リンク_入力_予定) ページにアクセスし、お使いのOSに合ったパッケージをダウンロードします。
    *   **Windows:** `.exe`（インストーラー）
    *   **macOS:** `.dmg`（ディスクイメージ）
    *   **Linux:** `.AppImage`（ポータブル）

### ⚠️ セキュリティ警告について（必読）
このプログラムは個人開発者によって配布されており、有料のコードサイニング証明書による署名は行われていません。表示されるセキュリティ警告は**不良品ではありません**。以下の手順に従って実行してください。

*   **Windows:** 赤いSmartScreen警告で **[詳細情報]** をクリック → **[実行]** をクリック
*   **macOS:** アプリファイルを**右クリック（またはControl+クリック）** → **[開く]** を選択 → 再度 **[開く]** をクリック

---

## 3. 🛠 開発者: ソースからのビルド

開発環境のセットアップとプロジェクトのビルド手順です。

### 前提条件
[Node.js](https://nodejs.org/) がシステムにインストールされている必要があります。

### 依存関係のインストール
```bash
npm install
```

### 開発モードで実行
```bash
npm start
```

### 配布用にビルド
```bash
# dist/ フォルダに配布可能なパッケージを作成
npm run dist
```

### macOS コードサイニング / CI ビルドについて

* `npm run dist` は `dotenv` を介して `.env` から環境変数を読み込みます。
* macOS の署名 ID は `.env` の `CSC_NAME` 変数から読み取られます。この変数は、ローカルの macOS キーチェーンにインストールされた証明書の名前を指定します。
* `.env` の例:
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `.gitlab-ci.yml` の `CSC_LINK` / `CSC_KEY_PASSWORD` は、GitLab CI 環境で P12 ベースの署名に使用されます。

---

## 4. ディレクトリ構造

```text
.
├── package.json          # npm パッケージ & ビルド設定
├── main.js               # Electron メインプロセス
├── preload.js            # コンテキスト分離プリロードスクリプト
├── .gitlab-ci.yml        # GitLab CI/CD マルチプラットフォームビルド設定
├── README.md             # プロジェクトドキュメント (英語)
├── README.ko.md          # プロジェクトドキュメント (韓国語)
├── README.ja.md          # プロジェクトドキュメント (日本語)
├── README.zh-cn.md       # プロジェクトドキュメント (中国語)
├── README.es.md          # プロジェクトドキュメント (スペイン語)
├── README.pt.md          # プロジェクトドキュメント (ポルトガル語)
├── README.fr.md          # プロジェクトドキュメント (フランス語)
├── README.id.md          # プロジェクトドキュメント (インドネシア語)
├── README.hi.md          # プロジェクトドキュメント (ヒンディー語)
└── renderer/             # レンダラープロセス (フロントエンドリソース)
```

---

## 5. オープンソースライセンス

このアプリケーションは以下のオープンソースプロジェクトを使用しており、それぞれのライセンス条項に準拠しています。

*   **[Electron](https://www.electronjs.org/)** (MIT License): デスクトップアプリケーションフレームワーク
*   **[FFmpeg](https://ffmpeg.org/)** (LGPL/GPL License): マルチメディア処理エンジン
    *   このアプリは `ffmpeg-static` を介して FFmpeg をバンドルしています。FFmpeg のソースコードは公式サイトから入手できます。
*   **[Pico.css](https://picocss.com/)** (MIT License): UI スタイリング用ミニマル CSS フレームワーク
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (MIT License): FFmpeg/FFprobe バイナリプロバイダー

---

## 6. ライセンス

Copyright (c) 2026 mytory. このプロジェクトは **ISC License** の下でライセンスされています。詳細は [LICENSE](./LICENSE) ファイルを参照してください。

---

## 7. お問い合わせ

質問、バグ報告、機能提案は以下までお寄せください。

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub/GitLab:** [@mytory](https://github.com/mytory)
