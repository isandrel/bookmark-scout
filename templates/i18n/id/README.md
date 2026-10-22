{# source: 755c10623769 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="Logo {{ site.name }}" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Simpan setiap halaman ke folder bookmark yang tepat, dalam hitungan detik.</h3>

<p align="center">
  Ketik beberapa huruf nama folder, atau tekan satu pintasan, dan halaman langsung masuk ke tempatnya.<br>
  Gratis, tanpa akun, dan tanpa iklan. Tidak ada yang dikirim ke developer.
</p>

<p align="center">
{{ md.store_badges("Tambahkan ke {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/situs%20web-kunjungi-{{ site.brand_color }}?style=flat-square" alt="Situs web"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/panduan-baca-{{ site.brand_color }}?style=flat-square" alt="Panduan"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/open%20source-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Lisensi open source"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="Popup {{ site.name }}: mengetik &quot;fin&quot; menemukan folder Fine-tuning di dalam AI / LLMs, siap menyimpan halaman di sana dengan Enter. Di sebelahnya, saran AI opsional untuk artikel tentang prompt caching, termasuk folder baru." width="800">
  </picture>
</p>

## ✨ Apa yang dilakukannya

- 📁 **Simpan ke folder yang tepat dengan mengetik namanya.** Ketik beberapa huruf, bahkan untuk folder yang terselip jauh di dalam folder lain, lalu tekan Enter. Salah ketik kecil tetap cocok.
- ⚡ **Simpan dengan satu pintasan.** Tekan {{ shortcuts["commands.quick-save"].both }} di halaman mana pun. Pesan kecil menunjukkan ke mana halaman disimpan, dengan **Urungkan** dan folder lain untuk memindahkannya.
- 🔎 **Temukan apa pun yang sudah Anda simpan.** Telusuri semua bookmark sambil mengetik, dari toolbar, panel samping, atau pengelola bookmark satu halaman penuh.
- 🧹 **Rapikan bookmark bertahun-tahun.** Hapus duplikat, temukan link yang sudah tidak berfungsi, dan buang kode pelacakan dari alamat web. Anda melihat setiap perubahan sebelum terjadi, dan bisa mengurungkannya.
- 🕘 **Lihat setiap perubahan, dan kembalikan bookmark yang terhapus.** Histori mencantumkan setiap perubahan pada bookmark Anda, termasuk yang dibuat di luar Bookmark Scout, dan mengembalikan yang dihapus, bahkan setelah browser dimulai ulang. Semuanya tetap di komputer Anda.
- ✨ **Saran AI opsional.** Biarkan AI memilihkan folder untuk Anda, dengan akun AI Anda sendiri atau model AI gratis di komputer Anda sendiri, seperti yang sudah ada di Chrome. AI tetap nonaktif sampai Anda mengaktifkannya.
- 🔒 **Privat sejak dirancang.** Tanpa akun, tanpa iklan, tanpa pelacakan, dan tidak ada yang dikirim ke developer. Menyimpan dan menelusuri bahkan berfungsi saat offline.

🌍 Tersedia dalam {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Instal

{{ md.store_links("segera hadir di {store}. Sampai saat itu, Anda bisa [menginstalnya secara manual]({docs}/installation#{id}) (lanjutan).") }}

Lalu simpan halaman pertama Anda:

1. **Sematkan.** Klik ikon kepingan puzzle di toolbar browser, lalu ikon pin di sebelah {{ site.name }}.
2. **Buka halaman yang ingin Anda simpan** dan klik ikon {{ site.name }}.
3. **Ketik beberapa huruf nama folder** lalu tekan Enter: halaman disimpan ke folder pertama dalam daftar. Untuk memilih folder lain, tekan ↓ terlebih dahulu. Selesai.

Lain kali, cukup tekan {{ shortcuts["commands.quick-save"].both }} di halaman tersebut. [Panduan menyimpan dan mengatur]({{ docs_url }}/guides/save-and-organize) menjelaskan lebih banyak.

## 🔒 Privasi Anda

{{ site.name }} tidak punya akun dan tidak punya server, jadi developer tidak pernah menerima bookmark, setelan, atau apa pun milik Anda. Bookmark Anda dibaca dan diubah di dalam browser Anda. Data hanya keluar dari browser saat Anda memakai fitur yang memerlukannya, misalnya AI (data dikirim ke perusahaan AI yang Anda pilih) atau pemeriksaan link mati (fitur ini mengunjungi situs yang di-bookmark). Baca [kebijakan privasi]({{ pages.privacy }}) untuk detailnya.

## 🔐 Izin

Yang akan diminta browser Anda:

- **Saat menginstal:** *"Membaca dan mengubah bookmark Anda."* Hanya itu yang dibutuhkan {{ site.name }} untuk mulai bekerja.
- **Hanya saat Anda memakai fitur yang memerlukan lebih**, setelah penjelasan singkat dari {{ site.name }}. Misalnya, memeriksa link mati meminta izin untuk mengunjungi situs-situs tersebut, dan menyimpan dari panel samping meminta izin untuk melihat tab mana yang sedang terbuka. Jika Anda menolak, hanya fitur itu yang tetap nonaktif.

Lihat [setiap izin dan alasan diperlukannya]({{ docs_url }}/permissions).

## ❓ Pertanyaan

**Apakah benar-benar gratis?**<br>
Ya. Tanpa iklan, tanpa paket berbayar, dan kodenya terbuka untuk dibaca siapa saja. Jika Anda mengaktifkan AI dengan akun perusahaan AI, perusahaan itu mungkin menagih Anda atas penggunaannya.

**Apakah saya perlu AI?**<br>
Tidak. Menyimpan, menelusuri, dan merapikan semuanya berfungsi tanpa AI.

**Apakah berfungsi di Firefox, Edge, atau Safari?**<br>
Firefox dan Edge: ya (lihat [Instal](#-instal)). Safari: tidak, karena Safari tidak mengizinkan ekstensi bekerja dengan bookmark.

Jawaban lainnya ada di [FAQ]({{ docs_url }}/faq).

## 💬 Bantuan dan link

- 🌐 Situs web: [{{ site.url }}]({{ site.url }})
- 📖 Panduan: [{{ docs_url }}]({{ docs_url }})
- ✉️ Email: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 Menemukan masalah atau punya ide? [Beri tahu kami di GitHub]({{ site.repo.new_issue }})

{{ site.name }} dibuat oleh developer independen, [@{{ site.author.name }}]({{ site.author.url }}), bukan perusahaan: tanpa iklan, tanpa akun, dan open source.

## 🛠️ Untuk developer dan agen AI

Cara membangun dari kode sumber, teknologi yang dipakai, status proyek, dan pengujian ada di [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (dalam bahasa Inggris). Untuk ikut membantu, baca [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). Agen coding AI di komputer Anda, seperti Claude Code, bisa menelusuri dan mengatur bookmark Anda dengan persetujuan Anda: lihat [Menggunakan dengan agen AI lokal]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Gratis dan open source di bawah <a href="{{ root }}LICENSE">lisensi {{ site.license.spdx }}</a>.
</p>
