# Indonesian Listing Copy (Bahasa Indonesia)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-22 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Manifest description | 132 |
| Firefox Add-ons summary | 244 |
| Full description, Chrome and Edge | 10,170 |
| Full description, Firefox | 5,977 |
| What's new in 0.3.3 | 1,115 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/id/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Ships with the first version that includes Indonesian (`extDescription`; changing it needs a new version; 132 characters):

```text
Simpan halaman ke folder yang tepat dengan cepat: ketik nama folder atau minta saran AI. Plus alat penelusuran dan perapian bookmark
```

### Firefox Add-ons summary (250 characters maximum)

```text
Simpan halaman ke folder bookmark yang tepat, cepat: ketik sebagian nama folder, tekan ⌥⇧S di Mac (Alt+Shift+S di Windows dan Linux) untuk menyimpan ke folder terbaik, atau minta saran AI opsional. Plus penelusuran instan dan pengelola lengkap.
```

## Search terms (Edge Add-ons)

```text
simpan ke folder
pengelola bookmark
cari bookmark
bookmark duplikat
link mati
folder bookmark
bookmark AI
```

## Full description: Chrome Web Store and Edge Add-ons

Plain text, 10,170 characters (2026-10-22); the Chrome Web Store allows 16,000. The same Edge condition as in `en.md` applies.

```text
Bookmark Scout menyimpan setiap halaman ke folder yang tepat dalam hitungan detik, dari toolbar atau dengan satu pintasan keyboard, lalu membantu Anda menemukan dan merapikan bookmark tanpa meninggalkan browser. Gratis, tanpa akun dan tanpa iklan.

SIMPAN KE FOLDER YANG TEPAT DALAM HITUNGAN DETIK
• Klik tombol Bookmark Scout, ketik sebagian nama folder mana pun, bahkan yang tersimpan jauh di dalam hierarki, lalu simpan halaman di sana tanpa melepas tangan dari keyboard
• Ketik jalur seperti ai/llms; salah ketik kecil tetap menemukan foldernya, dan folder yang baru-baru ini Anda gunakan muncul lebih dulu
• Halaman yang sudah ada di folder tersebut tidak disimpan dua kali
• AI opsional menyarankan folder terbaik untuk halaman tersebut, atau folder baru yang Anda tinjau sebelum dibuat
• Menu klik kanan opsional (awalnya nonaktif; aktifkan Menu Klik Kanan di Setelan) untuk menyimpan link ke folder terbaru

PINTASAN SIMPAN CEPAT
• Tekan ⌥⇧S di Mac (Alt+Shift+S di Windows dan Linux) di halaman mana pun untuk menyimpannya tanpa membuka Bookmark Scout: secara default ke folder yang paling cocok dengan halaman tersebut (dihitung di perangkat Anda), atau ke folder yang terakhir Anda gunakan, atau folder pilihan Anda
• Notifikasi kecil di halaman memberi tahu tempat halaman disimpan, dengan Urungkan dan folder lain untuk memindahkannya
• Jika AI aktif, ⌥⇧D di Mac (Alt+Shift+D di Windows dan Linux) menyimpan halaman ke saran folder AI yang pertama
• Ubah tombolnya di halaman pintasan browser. Di sana Anda juga dapat memberikan ⌘D di Mac (Ctrl+D di Windows dan Linux) ke simpan cepat, sehingga menggantikan dialog bookmark browser; Setelan menunjukkan caranya

TEMUKAN BOOKMARK ANDA
• Telusuri semua bookmark Anda sambil mengetik, langsung dari toolbar
• Hierarki folder dengan tarik dan lepas, luaskan dan ciutkan semua, serta folder baru
• Panel samping dengan hierarki, penelusuran, dan folder yang cocok yang sama
• Hapus dengan konfirmasi (aktif secara default) dan Urungkan selama 10 detik

PENGELOLA BOOKMARK
Bookmark Scout menggantikan halaman Bookmark browser dengan pengelola yang bekerja seperti pengelola bawaan browser, ditambah breadcrumb, tabel yang dapat diurutkan, dan penelusuran tersimpan yang selalu menampilkan hasil terkini.
• Menu klik kanan pada bookmark, folder, dan ruang kosong: edit, ganti nama, potong, salin, tempel, buka di tab atau jendela baru, tampilkan di folder, dan hapus
• Tarik dan lepas untuk memindahkan bookmark ke folder atau mengubah urutannya; link yang dilepas dari halaman lain menjadi bookmark
• Pilih beberapa baris dengan Cmd+klik dan Shift+klik, dan gunakan pintasan keyboard pengelola bawaan browser: ⌘A, ⌘C, ⌘X, ⌘V, ⌘⌫, ⌘Z untuk mengurungkan, dan ⇧⌘Z untuk mengulangi di Mac (Ctrl+klik, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z, dan Ctrl+Shift+Z di Windows dan Linux)
• Urungkan dan ulangi mencakup pengeditan, pemindahan, pengurutan, dan penghapusan, termasuk perubahan yang dibuat oleh Tanya AI
• Pilih perintah yang ditampilkan menu klik kanan dan ⋯, serta urutannya (Setelan)

RAPIKAN BOOKMARK BERTAHUN-TAHUN
• Pembersih Duplikat: tinjau grup duplikat sebelum menghapus salinan berlebih
• Pembersih URL: pratinjau dan hapus kode pelacakan dari alamat web
• Pemeriksa Link Mati: temukan link yang tidak berfungsi lagi, lalu tinjau perbaikannya (hapus, gunakan alamat baru, arahkan ke salinan arsip, atau edit) dengan Urungkan
• Pengambil Metadata: sarankan judul halaman dan terapkan hanya yang Anda pilih
• Pemindai Privasi: temukan detail pribadi di bookmark Anda, seperti alamat email dan kode login di dalam link
• Statistik: situs, folder, kedalaman, dan duplikat
• Perbarui Ikon Situs: ambil ikon asli setiap situs, tanpa layanan ikon pihak ketiga
• Impor file bookmark dengan pratinjau, penanganan duplikat, dan Urungkan
• Ekspor ke HTML, JSON, Markdown, atau CSV, dengan tinjauan privasi opsional yang dapat menyembunyikan detail pribadi

APA YANG AKAN DITANYAKAN BROWSER ANDA, DAN MENGAPA
Saat instalasi, browser hanya meminta satu hal: "Membaca dan mengubah bookmark Anda", agar Bookmark Scout dapat menyimpan, menelusuri, dan menata bookmark. Izin lainnya hanya diminta saat Anda menggunakan fitur yang memerlukannya, setelah penjelasan singkat. Jika Anda menolak, hanya fitur tersebut yang tetap nonaktif.
• "Membaca ikon situs yang Anda kunjungi": saat Anda mengklik Tampilkan ikon browser di Perbarui Ikon Situs, atau mengaktifkan Gunakan cache ikon browser, untuk menampilkan ikon yang sudah disimpan browser Anda di samping bookmark
• "Membaca dan mengubah data Anda di semua situs example.com" (atau "di sejumlah situs"): saat Anda menjalankan Pemeriksa Link Mati, Pengambil Metadata, atau Perbarui Ikon Situs, hanya untuk situs dalam proses tersebut. Proses untuk lebih dari 20 situs, serta setelan AI Baca konten halaman, meminta "Membaca dan mengubah semua data Anda di semua situs". Permintaan dikirim tanpa cookie. Setelah semua situs diizinkan, Tanya AI juga dapat memeriksa apakah link yang di-bookmark masih berfungsi
• "Membaca histori penjelajahan Anda": hanya untuk menyimpan halaman saat ini atau mendapatkan saran folder dari panel samping. Tombol toolbar dan pintasan simpan cepat tidak memerlukan izin, dan Bookmark Scout hanya membaca judul dan alamat tab yang terbuka
• "Berkomunikasi dengan aplikasi native yang bekerja sama": hanya saat Anda mengaktifkan Agen AI lokal (lihat Untuk developer di bawah)
Menu klik kanan juga opsional, tetapi tidak memiliki peringatan, jadi browser menambahkannya tanpa bertanya.

PRIVASI
• Tanpa akun, tanpa analitik, tanpa pelacakan, tanpa iklan
• Bookmark Anda tetap di browser; tag, ringkasan, dan penelusuran tersimpan tetap di perangkat ini
• Setelan yang Anda ubah, prompt kustom, dan Tentang saya disinkronkan melalui akun browser Anda jika browser mendukungnya

AI OPSIONAL (NONAKTIF SECARA DEFAULT)
AI bersifat opsional, dan semua fitur di atas berfungsi tanpanya. Untuk menggunakannya, Anda memerlukan akun di perusahaan AI, yang mungkin mengenakan sedikit biaya setiap kali digunakan, atau program AI gratis di komputer Anda sendiri. Bookmark Scout tidak memiliki layanan AI sendiri: aktifkan AI di Setelan dan tambahkan layanan pilihan Anda.
• Saran folder untuk halaman saat ini, termasuk folder baru yang Anda tinjau terlebih dahulu
• Di Chrome, saran folder gratis dari AI bawaan Chrome, yang berjalan di komputer Anda tanpa akun atau kunci, jika komputer Anda dapat menjalankannya
• Saran tag dan ringkasan singkat yang Anda tinjau sebelum disimpan
• Rencana penataan ulang folder, selalu dipratinjau sebelum ada yang berubah
• Tanya AI: chat tentang bookmark Anda. Tanya AI dapat menelusurinya berdasarkan kata, folder, tag, situs, atau tanggal ditambahkan, menemukan duplikat, menyarankan folder, dan melihat halaman saat ini
• Tanya AI hanya membuat perubahan saat Anda memintanya: menyimpan halaman, serta mengusulkan pemindahan, penggantian nama, penghapusan, dan folder baru sebagai rencana yang tidak mengubah apa pun sampai Anda menyetujuinya. Setiap perubahan dapat diurungkan
• Jawaban dapat diakhiri dengan tombol: pertanyaan lanjutan, opsi untuk dipilih, menyimpan halaman ke folder yang disarankan, atau membuka bookmark. Tidak ada yang terjadi sampai Anda mengklik
• Pilih apa yang boleh dicari atau diubah oleh Tanya AI (Setelan > AI)
• Baca konten halaman (nonaktif secara default): kirim teks setiap halaman yang dapat dibaca, tidak hanya judul dan alamatnya, untuk saran yang lebih baik
• Tag, ringkasan, dan nama folder baru dikembalikan dalam bahasa Anda, dalam bahasa yang Anda pilih, atau dalam bahasa setiap halaman (Setelan > AI)

Saat Anda menggunakan fitur AI, data yang diperlukan dikirim langsung dari browser Anda ke layanan AI pilihan Anda, sesuai ketentuan layanan tersebut: judul bookmark, alamat, nama folder, tanggal bookmark ditambahkan, serta tag dan ringkasan tersimpan; judul dan alamat halaman saat ini; pesan Tanya AI Anda; teks Tentang saya yang Anda tulis, jika ada; apakah link yang diperiksa Tanya AI masih berfungsi; dan, hanya jika Baca konten halaman aktif, teks halaman yang terlibat. Tidak ada yang dikirim ke Bookmark Scout. Kunci API Anda disimpan di penyimpanan ekstensi lokal browser ini dan tidak disinkronkan. Menggunakan layanan AI mungkin dikenai biaya.

SETELAN DAN CADANGAN
• Cadangkan setelan, di bagian bawah Setelan, menyimpan file berisi setelan yang Anda ubah, prompt kustom, Tentang saya, layanan AI (tanpa kuncinya), penelusuran tersimpan, dan kolom pengelola. Pulihkan setelan mengembalikannya
• Hanya setelan yang Anda ubah yang disimpan, jadi default yang lebih baik di versi berikutnya tetap sampai kepada Anda

UNTUK DEVELOPER
• Opsi penelusuran: cocokkan huruf besar/kecil, seluruh kata, dan ekspresi reguler. Alamat pengelola menyimpan penelusuran dan foldernya, jadi link dapat membukanya dalam keadaan sudah menelusuri (?q=react), dan Kembali serta Maju memulihkan keduanya
• Layanan AI dapat berupa penyedia AI cloud, endpoint apa pun yang kompatibel dengan OpenAI, atau server model di komputer Anda sendiri
• Ekspor bookmark yang dipilih sebagai konteks Markdown atau XML untuk chat AI (berfungsi tanpa AI dan tidak mengirim apa pun)
• Pemindai Privasi juga menandai parameter kueri sensitif, fragmen URL, dan UUID
• Agen AI lokal (nonaktif secara default): izinkan agen AI di komputer Anda, seperti Claude Code, mencari bookmark Anda melalui program open source terpisah bookmark-scout-mcp. Jika Izinkan perubahan juga aktif, agen dapat menyimpan dan menata ulang bookmark, dan setiap perubahan menunggu persetujuan Anda di jendela Bookmark Scout
• Open source dengan lisensi AGPL-3.0: https://github.com/isandrel/bookmark-scout

MEMPERBARUI DARI VERSI SEBELUMNYA
Versi 0.3.3 menyimpan datanya dalam format baru dan tidak mengonversi data lama: setelan kembali ke default, layanan AI dan kunci API perlu ditambahkan lagi, serta prompt kustom, penelusuran tersimpan, tag, ringkasan, dan ikon situs tersimpan dihapus. Bookmark Anda sendiri tidak diubah.

Dibuat oleh developer independen: tanpa perusahaan, tanpa iklan, tanpa akun. Tersedia dalam 12 bahasa. Tema terang, gelap, dan sistem.

Dokumentasi: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout menyimpan setiap halaman ke folder yang tepat dalam hitungan detik, dari toolbar atau dengan satu pintasan keyboard, lalu membantu Anda menemukan dan menata bookmark tanpa meninggalkan browser. Gratis, tanpa akun dan tanpa iklan.

SIMPAN KE FOLDER YANG TEPAT DALAM HITUNGAN DETIK
• Klik tombol Bookmark Scout, ketik sebagian nama folder mana pun, bahkan yang tersimpan jauh di dalam hierarki, lalu simpan halaman di sana tanpa melepas tangan dari keyboard
• Ketik jalur seperti ai/llms; salah ketik kecil tetap menemukan foldernya, dan folder yang baru-baru ini Anda gunakan muncul lebih dulu
• Halaman yang sudah ada di folder tersebut tidak disimpan dua kali
• AI opsional menyarankan folder terbaik untuk halaman tersebut, atau folder baru yang Anda tinjau sebelum dibuat
• Simpan link dari menu klik kanan ke folder terbaru, setelah Anda mengaktifkan Menu Klik Kanan di Setelan

PINTASAN SIMPAN CEPAT
• Tekan ⌥⇧S di Mac (Alt+Shift+S di Windows dan Linux) di halaman mana pun untuk menyimpannya tanpa membuka Bookmark Scout: secara default ke folder yang paling cocok dengan halaman tersebut (dihitung di perangkat Anda), atau ke folder yang terakhir Anda gunakan, atau folder pilihan Anda
• Notifikasi kecil di halaman memberi tahu tempat halaman disimpan, dengan Urungkan dan folder lain untuk memindahkannya
• Jika AI aktif, ⌥⇧D di Mac (Alt+Shift+D di Windows dan Linux) menyimpan halaman ke saran folder AI yang pertama
• Ubah tombolnya di Setelan > Penyimpanan & Penelusuran > Pintasan keyboard

TEMUKAN BOOKMARK ANDA
• Telusuri semua bookmark Anda sambil mengetik, langsung dari toolbar
• Hierarki folder dengan tarik dan lepas, luaskan dan ciutkan semua, serta folder baru
• Hierarki, penelusuran, dan folder yang cocok yang sama di bilah samping Firefox, yang tetap terbuka saat Anda menjelajah
• Hapus dengan konfirmasi (aktif secara default) dan Urungkan selama 10 detik

PENGELOLA BOOKMARK
Buka pengelola bookmark di popup toolbar atau bilah samping membuka pengelola lengkap di tab baru, dengan hierarki folder dan tabel yang dapat diurutkan.
• Menu klik kanan pada bookmark, folder, dan ruang kosong: edit, ganti nama, potong, salin, tempel, buka, tampilkan di folder, dan hapus
• Tarik dan lepas untuk memindahkan bookmark ke folder atau mengubah urutannya; link yang dilepas dari halaman lain menjadi bookmark
• Pilih beberapa baris dengan Cmd+klik dan Shift+klik, salin, potong, dan tempel dengan tombol yang biasa, serta urungkan dan ulangi perubahan dengan ⌘Z dan ⇧⌘Z di Mac (Ctrl+klik, Ctrl+Z, dan Ctrl+Shift+Z di Windows dan Linux)

APA YANG AKAN DITANYAKAN FIREFOX, DAN MENGAPA
Saat instalasi, Firefox hanya meminta satu hal: "Membaca dan mengubah markah". Izin lainnya hanya diminta saat Anda menggunakan fitur yang memerlukannya, setelah penjelasan singkat. Jika Anda menolak, hanya fitur tersebut yang tetap nonaktif.
• "Mengakses tab peramban": hanya untuk menyimpan halaman saat ini atau mendapatkan saran folder dari bilah samping. Tombol toolbar dan pintasan simpan cepat tidak memerlukan izin
• Mengaktifkan AI: Firefox meminta izin untuk membagikan "informasi autentikasi, markah, aktivitas penjelajahan" (kunci API Anda, bookmark dan folder Anda, serta judul dan alamat halaman saat ini). Prompt-nya menyebut bahwa pengembang ingin mengumpulkannya; di sini, artinya layanan AI pilihan Anda, yang menerimanya langsung dari browser Anda. Tidak ada yang sampai ke Bookmark Scout
• Baca konten halaman: "Mengakses data Anda untuk semua situs web", dan membagikan "konten situs web" dengan layanan AI Anda
• Verifikasi Layanan: akses ke alamat layanan AI Anda, dan membagikan "informasi autentikasi" (kunci API Anda) dengan layanan tersebut

PRIVASI
• Tanpa akun, tanpa analitik, tanpa pelacakan, tanpa iklan
• Bookmark Anda tetap di browser
• Setelan yang Anda ubah, prompt kustom, dan Tentang saya disinkronkan melalui Firefox Sync jika diaktifkan

SARAN FOLDER AI OPSIONAL (NONAKTIF SECARA DEFAULT)
AI bersifat opsional, dan semua fitur di atas berfungsi tanpanya. Untuk menggunakannya, Anda memerlukan akun di perusahaan AI, yang mungkin mengenakan sedikit biaya setiap kali digunakan, atau program AI gratis di komputer Anda sendiri. Aktifkan AI di Setelan dan tambahkan layanan pilihan Anda. Bookmark Scout kemudian menyarankan folder untuk halaman saat ini, di popup atau dengan pintasan simpan cepat AI, dan dapat membuat folder baru setelah Anda meninjaunya.

Saat Anda meminta saran, judul dan alamat halaman saat ini serta nama folder Anda dikirim langsung dari browser Anda ke layanan AI pilihan Anda, sesuai ketentuan layanan tersebut, dan, hanya jika Anda mengaktifkan Baca konten halaman, teks halaman tersebut. Tidak ada yang dikirim ke Bookmark Scout. Kunci API Anda disimpan di penyimpanan ekstensi lokal browser ini dan tidak disinkronkan. Menggunakan layanan AI mungkin dikenai biaya.

SETELAN DAN CADANGAN
• Cadangkan setelan, di bagian bawah Setelan, menyimpan file berisi setelan yang Anda ubah, prompt kustom, Tentang saya, layanan AI (tanpa kuncinya), dan penelusuran tersimpan. Pulihkan setelan mengembalikannya
• Hanya setelan yang Anda ubah yang disimpan, jadi default yang lebih baik di versi berikutnya tetap sampai kepada Anda

UNTUK DEVELOPER
• Opsi penelusuran: cocokkan huruf besar/kecil, seluruh kata, dan ekspresi reguler
• Layanan AI dapat berupa penyedia AI cloud, endpoint apa pun yang kompatibel dengan OpenAI, atau server model di komputer Anda sendiri
• Open source dengan lisensi AGPL-3.0: https://github.com/isandrel/bookmark-scout

MEMPERBARUI DARI VERSI SEBELUMNYA
Versi 0.3.3 menyimpan datanya dalam format baru dan tidak mengonversi data lama: setelan kembali ke default, layanan AI dan kunci API perlu ditambahkan lagi, serta prompt kustom, penelusuran tersimpan, tag, ringkasan, dan ikon situs tersimpan dihapus. Bookmark Anda sendiri tidak diubah.

Dibuat oleh developer independen: tanpa perusahaan, tanpa iklan, tanpa akun. Tersedia dalam 12 bahasa. Tema terang, gelap, dan sistem.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Simpan cepat: tekan ⌥⇧S di Mac (Alt+Shift+S di Windows dan Linux) di halaman mana pun untuk menyimpannya ke folder yang paling cocok. Notifikasi di halaman memberi tahu tempat halaman disimpan, dengan Urungkan dan folder lain untuk memindahkannya. Jika AI aktif, ⌥⇧D di Mac (Alt+Shift+D di Windows dan Linux) menyimpan ke saran AI yang pertama
• Pengelola bookmark: menu klik kanan, tarik dan lepas, potong, salin, dan tempel, memilih beberapa baris, serta urungkan dan ulangi
• Tanya AI dapat menyimpan halaman dan mengusulkan pemindahan, penggantian nama, penghapusan, dan folder baru yang tidak mengubah apa pun sampai Anda menyetujuinya, dan setiap perubahan dapat diurungkan. Jawaban dapat diakhiri dengan tombol yang dapat Anda klik
• Pilih perintah yang ditampilkan menu pengelola, dan apa yang boleh dilakukan Tanya AI
• Ekspor di Setelan kini menyimpan cadangan yang dapat Anda impor
• Pembaruan ini mereset data tersimpan Bookmark Scout: setelan kembali ke default, dan layanan AI serta kunci API, prompt kustom, penelusuran tersimpan, tag, dan ringkasan perlu disiapkan lagi. Bookmark Anda tidak diubah
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the Indonesian pages:

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/id/support/ |
| Privacy policy URL | https://bookmark-scout.com/id/privacy/ |
| Support email | support@bookmark-scout.com |
