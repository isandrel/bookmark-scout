<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <a href="../zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <a href="../es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <a href="../fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <a href="../pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="../ru/CONTRIBUTING.md" lang="ru" hreflang="ru">Русский</a> ·
  <strong lang="id">Bahasa Indonesia</strong> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="../ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <a href="../it/CONTRIBUTING.md" lang="it" hreflang="it">Italiano</a> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Berkontribusi pada Bookmark Scout

Pertama-tama, terima kasih karena Anda mempertimbangkan untuk berkontribusi pada Bookmark Scout! Berkat orang-orang seperti Anda, ekstensi ini menjadi lebih baik untuk semua orang.

## 📋 Daftar isi

- [Kode etik](#-kode-etik)
- [Bagaimana cara saya berkontribusi?](#-bagaimana-cara-saya-berkontribusi)
- [Menyiapkan lingkungan pengembangan](#-menyiapkan-lingkungan-pengembangan)
- [Proses pull request](#-proses-pull-request)
- [Panduan gaya](#-panduan-gaya)
- [Internasionalisasi](#-internasionalisasi)
- [Ada pertanyaan?](#-ada-pertanyaan)

## 📜 Kode etik

Proyek ini mengikuti [Kode etik](../../CODE_OF_CONDUCT.md). Dengan berpartisipasi, Anda diharapkan menjaga perilaku yang saling menghormati dan inklusif. Laporkan perilaku yang tidak dapat diterima melalui GitHub Issues.

## 🎯 Bagaimana cara saya berkontribusi?

### 🐛 Melaporkan bug

Sebelum membuat laporan bug, periksa issue yang sudah ada agar tidak terjadi duplikat.

**Saat melaporkan bug, sertakan:**

- Browser dan versinya (Chrome, Firefox, Edge)
- Versi ekstensi
- Langkah-langkah untuk mereproduksinya
- Perilaku yang diharapkan dan perilaku yang terjadi
- Screenshot, jika ada

Gunakan [template laporan bug](../../.github/ISSUE_TEMPLATE/01-bug-report.yml) kami.

### ✨ Mengusulkan fitur

Kami senang menerima usulan fitur! Gunakan [template permintaan fitur](../../.github/ISSUE_TEMPLATE/02-feature-request.yml) kami.

**Permintaan fitur yang baik mencakup:**

- Pernyataan masalah yang jelas
- Solusi yang diusulkan
- Pendekatan alternatif yang sudah dipertimbangkan

### 🔧 Kontribusi kode

Mencari sesuatu untuk dikerjakan? Periksa issue dengan label:

- `good first issue` - Cocok untuk pendatang baru
- `help wanted` - Kami akan senang dengan bantuan Anda

## 💻 Menyiapkan lingkungan pengembangan

Untuk memakai Bookmark Scout, instal dari store browser Anda atau dari rilis GitHub, seperti yang dijelaskan di [README](README.md#-instal). Langkah-langkah di bawah ini membangunnya dari kode sumber, untuk mengerjakannya. Untuk teknologi yang dipakai, status fitur, build rilis, dan struktur proyek, lihat [DEVELOPMENT.md](../../DEVELOPMENT.md).

### Prasyarat

- [Bun](https://bun.sh) (versi terbaru)
- [mise](https://mise.jdx.dev/) untuk mengelola runtime
- Salah satu browser ini: Chrome, Firefox, Edge

### Instalasi

```bash
# Clone repositori
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Instal dependensi
bun install

# Jalankan server pengembangan (Chrome)
bun run dev
```

### Membangun

```bash
# Build untuk semua browser
bun run build

# Build untuk Chrome
bunx nx run extension:build:chrome

# Build untuk Firefox
bun run build:firefox

# Build untuk Edge
bun run build:edge
```

### Memuat ekstensi

**Chrome/Edge:**

1. Buka `chrome://extensions` atau `edge://extensions`
2. Aktifkan "Mode developer" (di Edge, "Mode pengembang")
3. Klik "Muat yang belum dibuka" (di Edge, "Muat yang tidak dikemas")
4. Pilih `apps/extension/dist/chrome-mv3` (Chrome) atau `apps/extension/dist/edge-mv3` (Edge)

**Firefox:**

1. Buka `about:debugging#/runtime/this-firefox`
2. Klik "Muat Pengaya Sementara"
3. Pilih file `manifest.json` di `apps/extension/dist/firefox-mv2`

## 🔄 Proses pull request

### Sebelum Anda mulai

1. **Sinkronkan dengan main**: selalu lakukan pull dengan rebase sebelum mulai bekerja
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **Buat issue**: diskusikan perubahan besar sebelum mengimplementasikannya

3. **Buat branch**: gunakan penamaan konvensional
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Pesan commit

Kami memakai [Conventional Commits](https://www.conventionalcommits.org/) dengan [Gitmoji](https://gitmoji.dev/):

Hook `commit-msg` dan pemeriksaan **PR title** mewajibkannya, dengan jenis yang diizinkan di `config/commits.toml`.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Jenis      | Deskripsi           |
| ----- | ---------- | ------------------- |
| ✨    | `feat`     | Fitur baru          |
| 🐛    | `fix`      | Perbaikan bug       |
| 📝    | `docs`     | Dokumentasi         |
| 💄    | `style`    | UI/gaya tampilan    |
| ♻️     | `refactor` | Refaktor kode       |
| ⚡    | `perf`     | Performa            |
| ✅    | `test`     | Pengujian           |
| 🔧    | `chore`    | Pemeliharaan        |

### Membuat pull request

1. **Push branch Anda**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Buat PR melalui GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **Tunggu hingga pemeriksaan CI** lulus

4. **Tanggapi masukan review**, jika ada

### Daftar periksa PR

- [ ] Kode mengikuti panduan gaya proyek
- [ ] Review mandiri sudah dilakukan
- [ ] Validasi lint/build yang relevan sudah dijalankan
- [ ] Pengujian ditambahkan/diperbarui jika berlaku, saat ada rangkaian pengujian untuk bagian yang diubah
- [ ] Dokumentasi diperbarui jika perlu
- [ ] Ditautkan ke issue yang relevan

## 📐 Panduan gaya

### Gaya kode

Kami memakai [Biome](https://biomejs.dev/) untuk linting dan format.

```bash
# Periksa linting
bun run lint

# Jalankan lint ekstensi saja
bunx nx run extension:lint

# Jalankan semua pengujian ekstensi (build Chrome dan instal Chromium Playwright)
bun run test
```

Perintah pengujian menjalankan unit test dan rangkaian E2E Chromium headless (popup, panel samping, pengelola bookmark, setelan, simpan cepat, pemeliharaan, laporan, impor/ekspor, Tanya AI, dan alur lintas tampilan). CI menjalankan rangkaian yang sama tanpa menyiapkan browser secara manual, ditambah rangkaian Edge dan rangkaian smoke test Firefox. Alur yang bergantung pada jaringan dan penyedia AI berjalan offline: pengujian berjudul `[mocked provider contract]` menggantikan penyedia AI dengan stub (mock `ai` di Vitest dan endpoint yang kompatibel dengan OpenAI yang dirutekan oleh Playwright) dan memalsukan permintaan jaringan lewat rute; pengujian ini memverifikasi kontrak permintaan/respons Bookmark Scout, pengaktifan atas pilihan pengguna, dan penanganan error, bukan kompatibilitas dengan penyedia atau situs web sungguhan.

Rangkaian lain, untuk perubahan yang dicakupnya:

```bash
# Edge dan Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Agen AI lokal: pengujian jembatan MCP sendiri, lalu
# bookmark-scout-mcp hasil kompilasi dengan ekstensi di Chromium (Linux dan macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latensi dan scroll pada koleksi besar; jalankan sebelum dan sesudah perubahan kecepatan
bunx nx run extension:test:perf

# Fitur AI dengan penyedia sungguhan; dilewati kecuali variabel BS_LIVE_AI_* sudah diatur
# (lihat apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

CI menjalankan pengujian jembatan saat ekstensi atau `packages/mcp-bridge` berubah, rangkaian performa setiap hari, dan rangkaian AI langsung hanya saat diminta.

### AI bawaan Chrome

Layanan **AI bawaan** menjalankan model milik Chrome sendiri (Gemini Nano, `LanguageModel` dari Prompt API) di komputer Anda. Unit test dan pengujian E2E memakai `LanguageModel` palsu (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); model sungguhan diperiksa secara manual:

1. Gunakan Chrome 138 atau yang lebih baru di komputer yang memenuhi [persyaratan hardware Chrome](https://developer.chrome.com/docs/ai/get-started#hardware). **Periksa komputer ini**, di bawah layanan di Setelan > AI, membandingkan komputer ini dengan persyaratan tersebut. Untuk mencobanya di komputer yang lebih lemah, setel `chrome://flags/#optimization-guide-on-device-model` ke **Enabled BypassPerfRequirement** lalu mulai ulang Chrome.
2. Browser yang dibuka oleh `bun run dev` melaporkan model tidak tersedia. Jalankan browser itu dengan switch di bawah ini, atau nonaktifkan runner dan muat `apps/extension/dist/chrome-mv3-dev` di profil Chrome Anda sendiri dari `chrome://extensions`. Jangan masukkan file per developer ini ke Git: `apps/extension/web-ext.config.ts` diabaikan.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Atau gunakan profil Anda sendiri: disabled: true,
   });
   ```

3. Di **Setelan** > **AI**, klik **Gunakan AI bawaan**, lalu **Unduh model**. `chrome://on-device-internals` menampilkan status dan unduhan model, dan memungkinkan Anda mengirim prompt langsung ke model; Chrome hanya membukanya setelah Anda mengaktifkan halaman debugging internalnya di `chrome://chrome-urls`.
4. Aktifkan **Fitur AI** dan **Rekam permintaan**, buka popup di sebuah halaman, lalu klik tombol saran folder. **Aktivitas AI** menampilkan prompt sebagai `ON-DEVICE`.
5. Tekan pintasan simpan cepat AI dua kali di sebuah halaman. Kedua penyimpanan muncul di **Aktivitas AI**; yang kedua lebih cepat, karena halaman host AI (dokumen offscreen, tercantum di `chrome://extensions` di bawah tampilan ekstensi) tetap memuat instruksi selama `[quick_save] idle_timeout_ms` di `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Gunakan TypeScript untuk semua kode baru
- Utamakan `type` daripada `interface` untuk tipe objek
- Gunakan tipe kembalian eksplisit untuk fungsi

### Komponen React

- Gunakan komponen fungsional dengan hooks
- Jaga komponen tetap kecil dan terfokus
- Gunakan nama prop yang deskriptif

### Organisasi file

```
apps/extension/src/
├── components/     # Reusable UI components
├── hooks/          # Custom React hooks
├── services/       # Bookmark actions, AI, browser integrations, import/export
├── stores/         # Zustand stores
├── lib/            # Storage, schemas, and low-level helpers
├── types/          # TypeScript types
└── entrypoints/    # Extension entry points
```

`packages/mcp-bridge` berisi `bookmark-scout-mcp`, server MCP dan host native messaging yang dipakai agen AI lokal; pesannya ke ekstensi didefinisikan di `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Internasionalisasi

Saat menambahkan teks yang terlihat oleh pengguna:

1. Tambahkan string ke `apps/extension/public/_locales/<locale>/messages.json`
2. Tambahkan juga ke setiap locale yang tercantum di `[locales] extension` dalam `config/project.toml`
3. Gunakan helper i18n yang sudah ada: `t("message_key")`

`README.md`, panduan ini, dan terjemahannya di `i18n/<language>/` dibuat dari `templates/`: edit template-nya, jangan pernah file hasilnya. Lihat [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown) (dalam bahasa Inggris).

## 🤔 Ada pertanyaan?

- Periksa [issue](https://github.com/isandrel/bookmark-scout/issues) yang sudah ada
- Mulai [diskusi](https://github.com/isandrel/bookmark-scout/discussions)
- Buat [issue pertanyaan](../../.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Terima kasih!

Setiap kontribusi membantu Bookmark Scout menjadi lebih baik. Baik itu:

- 🐛 Melaporkan bug
- ✨ Mengusulkan fitur
- 📝 Memperbaiki dokumentasi
- 🔧 Menulis kode
- 🌐 Menerjemahkan

Kami menghargai waktu dan usaha Anda!
