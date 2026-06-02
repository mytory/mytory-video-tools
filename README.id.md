# Mytory Video Tools

> **🇬🇧 English:** [README.md](./README.md) · **🇰🇷 한국어:** [README.ko.md](./README.ko.md) · **🇯🇵 日本語:** [README.ja.md](./README.ja.md) · **🇨🇳 简体中文:** [README.zh-cn.md](./README.zh-cn.md) · **🇪🇸 Español:** [README.es.md](./README.es.md) · **🇧🇷 Português:** [README.pt.md](./README.pt.md) · **🇫🇷 Français:** [README.fr.md](./README.fr.md) · **🇮🇳 हिन्दी:** [README.hi.md](./README.hi.md)

**Mytory Video Tools** adalah aplikasi desktop lintas platform (Windows, macOS, Linux) untuk encoding video berkecepatan tinggi dan berbagai tugas manipulasi media. Dibangun dengan Electron dan dilengkapi dengan biner FFmpeg/FFprobe bawaan.

---

## 1. Fitur

1. **Navigasi Tab Sidebar**: Beralih di antara 7 utilitas media inti dalam dasbor tema gelap yang ramping.
2. **Kebijakan Output Fleksibel**: Secara default, file disimpan di samping file asli dengan sufiks khusus tugas. Folder output kustom juga dapat dikonfigurasi.
3. **Deteksi Akselerasi Perangkat Keras Otomatis**: Saat startup, aplikasi memindai GPU Anda dan memilih encoder perangkat keras optimal untuk platform Anda (Apple Silicon VideoToolbox, NVIDIA NVENC, Intel QSV, AMD AMF, dll.).

### 7 Alat Inti

| Alat | Deskripsi |
|---|---|
| ⚡ **Pengubah Kecepatan** | Ubah kecepatan pemutaran video (0,5x ~ 4,0x) dengan pelestarian nada. Mendukung H.264, H.265/HEVC, VP9, AV1. |
| 🎵 **Ekstraksi Audio** | Ekstrak trek audio tanpa kehilangan (Otomatis) atau konversi ke MP3, AAC, OGG, atau WAV. |
| 📸 **Tangkapan Bingkai** | Tangkapan bingkai tunggal, ekstraksi batch pada interval, dan deteksi adegan otomatis dengan kontrol sensitivitas. |
| 🔄 **Remuxer** | Konversi format kontainer cepat (MP4, MKV, MOV) tanpa encoding ulang. |
| 🔗 **Gabungkan video** | Menggabungkan beberapa file video dengan parameter encoding identik tanpa kehilangan kualitas. Sempurna untuk menyusun ulang segmen yang dipisah. |
| ✂️ **Pemotong Video** | Potong segmen tanpa kehilangan dengan menetapkan titik awal dan akhir. Sangat cepat. |
| 📦 **Kompresor** | Kompres video ke ukuran file target dengan berbagai opsi codec dan kualitas. |

> **🖱️ Seret dan Lepas Global**: Seret file ke mana saja di jendela aplikasi untuk langsung menambahkannya ke alat yang sedang aktif.

---

## 2. 🚀 Pengguna Akhir: Instalasi & Menjalankan

Jika Anda hanya ingin menggunakan aplikasi tanpa membangunnya sendiri, ikuti langkah-langkah di bawah ini.

### Unduh
*   Kunjungi halaman [GitHub Releases](https://github.com/mytory/mytory-video-tools/releases) dan unduh paket untuk sistem operasi Anda.
    *   **Windows:** `.exe` (pemasang)
    *   **macOS:** `.dmg` (gambar disk) — Intel (x64) / Apple Silicon (arm64)
    *   **Linux:** `.AppImage` (portabel)

### ⚠️ Peringatan Keamanan (Harap Baca)
Program ini didistribusikan oleh pengembang individu dan tidak ditandatangani dengan sertifikat penandatanganan kode berbayar. Peringatan keamanan yang mungkin Anda lihat **bukanlah cacat**. Ikuti petunjuk di bawah ini untuk menjalankan aplikasi.

*   **Windows:** Pada peringatan SmartScreen merah, klik **[Info lebih lanjut]** → **[Tetap jalankan]**
*   **macOS:** **Klik kanan (atau Control+klik)** file aplikasi → Pilih **[Buka]** → Klik **[Buka]** lagi

---

## 3. 🛠 Pengembang: Membangun dari Sumber

Petunjuk untuk menyiapkan lingkungan pengembangan dan membangun proyek.

### Prasyarat
[Node.js](https://nodejs.org/) harus diinstal pada sistem Anda.

### Instal Dependensi
```bash
npm install
```

### Jalankan dalam Mode Pengembangan
```bash
npm start
```

### Bangun untuk Distribusi
```bash
# Membuat paket yang dapat didistribusikan di folder dist/
npm run dist
```

### Catatan Penandatanganan Kode macOS / Build CI

* `npm run dist` memuat variabel lingkungan dari `.env` melalui `dotenv`.
* Identitas penandatanganan macOS dibaca dari variabel `CSC_NAME` di `.env`. Variabel ini menentukan nama sertifikat yang diinstal di keychain macOS lokal Anda.
* Contoh `.env`:
    ```env
    CSC_NAME="Apple Development: my-email@test.com (XXXXJ356NG)"
    ```
* `CSC_LINK` / `CSC_KEY_PASSWORD` di `.github/workflows/release.yml` digunakan untuk penandatanganan berbasis P12 di lingkungan GitHub Actions.

---

## 4. Struktur Direktori

```text
.
├── package.json          # Paket npm & konfigurasi build
├── main.js               # Proses utama Electron
├── preload.js            # Skrip pramuat isolasi konteks
├── .github/workflows/   # Workflow CI/CD GitHub Actions
├── README.md             # Dokumentasi proyek (Inggris)
├── README.ko.md          # Dokumentasi proyek (Korea)
├── README.ja.md          # Dokumentasi proyek (Jepang)
├── README.zh-cn.md       # Dokumentasi proyek (Cina)
├── README.es.md          # Dokumentasi proyek (Spanyol)
├── README.pt.md          # Dokumentasi proyek (Portugis)
├── README.fr.md          # Dokumentasi proyek (Prancis)
├── README.id.md          # Dokumentasi proyek (Indonesia)
├── README.hi.md          # Dokumentasi proyek (Hindi)
└── renderer/             # Proses perender (sumber daya frontend)
```

---

## 5. Lisensi Sumber Terbuka

Aplikasi ini menggunakan proyek sumber terbuka berikut dan mematuhi ketentuan lisensi masing-masing.

*   **[Electron](https://www.electronjs.org/)** (Lisensi MIT): Kerangka aplikasi desktop
*   **[FFmpeg](https://ffmpeg.org/)** (Lisensi LGPL/GPL): Mesin pemrosesan multimedia
    *   Aplikasi ini menggabungkan FFmpeg melalui `ffmpeg-static`. Kode sumber FFmpeg tersedia dari situs web resmi.
*   **[Pico.css](https://picocss.com/)** (Lisensi MIT): Kerangka CSS minimal untuk gaya UI
*   **[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) & [ffprobe-static](https://github.com/eugeneware/ffprobe-static)** (Lisensi MIT): Penyedia biner FFmpeg/FFprobe

---

## 6. Lisensi

Hak Cipta (c) 2026 mytory. Proyek ini dilisensikan di bawah **ISC License**. Lihat file [LICENSE](./LICENSE) untuk detailnya.

---

## 7. Kontak

Untuk pertanyaan, laporan bug, atau saran fitur, silakan hubungi melalui:

*   **Email:** [mail@mytory.net](mailto:mail@mytory.net)
*   **Blog:** [https://mytory.net](https://mytory.net)
*   **GitHub:** [@mytory](https://github.com/mytory)
