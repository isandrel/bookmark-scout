import type { DocsCopy } from "../copy";

/** Docs UI copy in id; see `en` in ../copy.ts for what each entry is. */
export const id: DocsCopy = {
  nav: { website: "Situs web" },

  release: { latest: "rilis GitHub terbaru" },

  store: {
    listed: (product: string, store: string) =>
      `Instal ${product} dari halamannya di ${store}.`,
    notListed: (product: string, store: string) =>
      `${product} segera hadir di ${store}.`,
    noneListed: (product: string) =>
      `Belum ada store browser yang menyediakan ${product}.`,
    listedOn: (product: string) => `${product} tersedia di:`,
  },

  home: {
    install: (product: string) => `Instal ${product}`,
    addTo: (browser: string) => `Tambahkan ke ${browser}, gratis`,
    otherBrowsers: "Browser lain",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: ["duplikat", "link mati", "impor", "pintasan", "kunci API"],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Cari halaman",
    label: "Telusuri dokumentasi berdasarkan tugas",
    placeholder: "Apa yang ingin Anda lakukan?",
    idle: (total: number) =>
      `Pilih tugas, atau ketik untuk memfilter semua ${total} halaman. Enter membuka hasil pertama yang cocok.`,
    count: (shown: number, total: number) => `${shown} dari ${total} halaman`,
    noMatch: (query: string) =>
      `Tidak ada halaman yang cocok dengan “${query}”. Coba dengan lebih sedikit kata, atau gunakan Telusuri di bagian atas halaman untuk menelusuri isi semua halaman.`,
  },

  shortcut: {
    or: " atau ",
    notes: {
      mac: "{keys} di Mac",
      other: "{keys} di Windows dan Linux",
      pair: "{primary} ({secondary})",
      click: "klik",
    },
  },

  languages: {
    en: "Inggris",
    "zh-CN": "Tionghoa Sederhana",
    es: "Spanyol",
    fr: "Prancis",
    "pt-BR": "Portugis Brasil",
    de: "Jerman",
    ja: "Jepang",
    ko: "Korea",
    "zh-TW": "Tionghoa Tradisional",
    ru: "Rusia",
    it: "Italia",
    id: "Indonesia",
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Halaman ini belum diterjemahkan, jadi ditampilkan dalam bahasa Inggris.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      'Dua popup: "fin" diketik di kotak penelusuran dengan folder Fine-tuning (AI / LLMs) terpilih di bawah Simpan ke folder, dan saran AI untuk halaman lain: folder baru AI/LLMs/Inference dan folder AI/LLMs yang sudah ada',
    "quick-save":
      "Halaman panduan developer dengan notifikasi simpan cepat di sudut atasnya: disimpan ke Agents (AI / Agents), dengan Urungkan dan Papers di bawah Pindahkan ke",
    manager:
      "Pengelola bookmark di AI / LLMs / Fine-tuning: hierarki folder dengan AI, Dev, Design, Tools, dan Reading list, satu kotak penelusuran, dan tabel bookmark dengan ikon setiap situs",
    duplicates:
      "Tinjauan Pembersih Duplikat di atas pengelola, dengan bookmark yang dipertahankan di setiap grup ditandai Pertahankan",
    settings:
      "Tab Dasar di Setelan: Folder Simpan Cepat, Folder Tujuan, Menu Klik Kanan (nonaktif), Tema, dan Bahasa",
    "options-ai":
      "Tab AI di Setelan: Fitur AI aktif, dan di bawah Tambahkan layanan ada dua layanan AI yang ditambahkan pengguna: perusahaan AI cloud dengan kuncinya disembunyikan, disetel sebagai default, dan model di komputer",
    "manager-cards":
      "Pengelola bookmark menampilkan Reading list sebagai kartu: tiga artikel dengan gambar sampul, tag, dan ringkasan, serta tiga situs berupa ubin dengan ikonnya, di samping hierarki folder",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "Bahasa Indonesia",
    "Ask AI(AI chat button)": "Tanya AI",
    "Back to Home(404 page)": "Kembali ke beranda",
    "Choose a language(language switcher)": "Pilih bahasa",
    "Choose a language(language switcher)(aria-label)": "Pilih bahasa",
    "Close Banner(banner)(aria-label)": "Tutup banner",
    "Close Search(search dialog)(aria-label)": "Tutup penelusuran",
    "Close Sidebar(aria-label)": "Tutup bilah samping",
    "Close Sidebar(sidebar)(aria-label)": "Tutup bilah samping",
    "Close(image zoom)(aria-label)": "Tutup",
    "Collapse Sidebar(sidebar)(aria-label)": "Ciutkan bilah samping",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "Link judul bagian disalin",
    "Copied Link(accordion)(aria-label)": "Link disalin",
    "Copied Markdown(page actions)": "Markdown disalin",
    "Copied Text(code block)(aria-label)": "Teks disalin",
    "Copy Anchor Link(heading anchor)(aria-label)": "Salin link judul bagian",
    "Copy Link(accordion)(aria-label)": "Salin link",
    "Copy Markdown(page actions)": "Salin Markdown",
    "Copy Text(code block)(aria-label)": "Salin teks",
    "Dark(theme switcher)(aria-label)": "Gelap",
    "Default(type table)": "Default",
    "Edit on GitHub(edit page)": "Edit di GitHub",
    "Hide Sidebar(sidebar)": "Sembunyikan bilah samping",
    "Image Viewer(image zoom)(aria-label)": "Penampil gambar",
    "Last updated on(page footer)": "Terakhir diperbarui:",
    "Layout Tab(layout tab trigger)": "Tab tata letak",
    "Light(theme switcher)(aria-label)": "Terang",
    "Next Image(image zoom)(aria-label)": "Gambar berikutnya",
    "Next Page(pagination)": "Berikutnya",
    "No Headings(table of contents)": "Tidak ada judul",
    "No results found(search dialog)": "Tidak ada hasil",
    "On this page(table of contents)": "Di halaman ini",
    "Open Search(search trigger)(aria-label)": "Buka penelusuran",
    "Open Sidebar(sidebar)(aria-label)": "Buka bilah samping",
    "Open in ChatGPT(page actions)": "Buka di ChatGPT",
    "Open in Claude(page actions)": "Buka di Claude",
    "Open in Cursor(page actions)": "Buka di Cursor",
    "Open in GitHub(page actions)": "Buka di GitHub",
    "Open in Scira AI(page actions)": "Buka di Scira AI",
    "Open(page actions)": "Buka",
    "Page Not Found(404 page)": "Halaman tidak ditemukan",
    "Parameters(type table)": "Parameter",
    "Previous Image(image zoom)(aria-label)": "Gambar sebelumnya",
    "Previous Page(pagination)": "Sebelumnya",
    "Prop(type table)": "Prop",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Baca {url}, saya ingin mengajukan pertanyaan tentang halaman ini.",
    "Returns(type table)": "Mengembalikan",
    "Search failed(search dialog)": "Penelusuran gagal",
    "Search failed, showing results for {query}(search dialog)":
      "Penelusuran gagal, menampilkan hasil untuk {query}",
    "Search(search dialog)": "Telusuri",
    "Search(search trigger)": "Telusuri",
    "Show Sidebar(sidebar)": "Tampilkan bilah samping",
    "System(theme switcher)(aria-label)": "Sistem",
    "Table of Contents(inline table of contents)": "Daftar isi",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "Halaman yang Anda cari mungkin telah dihapus, diganti namanya, atau untuk sementara tidak tersedia.",
    "Toggle Menu(mobile menu)(aria-label)": "Tampilkan atau sembunyikan menu",
    "Toggle Theme(theme switcher)(aria-label)": "Ganti tema",
    "Type(type table)": "Tipe",
    "View as Markdown(page actions)": "Lihat sebagai Markdown",
  },
};
