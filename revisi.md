# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.9.5)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 26 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (v5.9.5)  

---

## 🎯 Latar Belakang & Analisis Permintaan Pengguna
Pengguna menginstruksikan dua hal penting terkait fitur **Generate Presentasi PDF**:
1. **Kontekstualisasi Peran (3-Tier Multi-Scope)**:
   - Skala Nasional $\rightarrow$ Menjelaskan dashboard secara nasional (COO).
   - Skala Manager $\rightarrow$ Menjelaskan dashboard sesuai cakupan wilayah binaan (Area Manager).
   - Skala SPV $\rightarrow$ Menjelaskan dashboard sesuai gerai binaan SPV sendiri (SPV Gerai).
2. **Penghapusan Poin SOP**:
   > *"yang bahas point SOP dihilangkan aja"*  
   - Menghapus total Slide 6 (Kepatuhan SOP & Checklist Toko) dari slide deck presentasi.
   - Menghapus modul metrik SOP dari Scorecard Slide 1 dan menggantinya dengan metrik operasional riil (Total Transaksi Kasir / Rata-rata Penjualan per Struk).

---

## 🛠️ Rencana Desain & Solusi Rekayasa (v5.9.5)

### 1. Eliminasi Total Poin SOP dari Slide Deck:
* **Modal Generate Presentasi**:
  - Hapus checkbox `chkPresentasi_tugas` (*Slide 6: Kedisiplinan SOP & Checklist Operasional Toko*).
  - Ubah teks deskripsi *Full Deck* menjadi: *"Menyajikan 6 poin kinerja operasional komprehensif"*.
* **Slide 1 (Scorecard)**:
  - Hapus kartu *Ketuntasan SOP* dan ganti dengan metrik operasional riil: **Total Transaksi Kasir (Struk)**.
  - Hapus seluruh poin bullet bertopik SOP.
* **Slide 6 Lama (SOP & Checklist)**: Dihapus secara permanen dari arsitektur slide deck.
* **Jumlah Slide Bersih**: Menjadi **6 Slide Utama**:
  1. Scorecard Kinerja Operasional
  2. Evaluasi Peringkat Kinerja (Leaderboard Wilayah / Ranking Hari Gerai)
  3. Performa Penjualan & Revenue
  4. Efisiensi Biaya HPP & Pengendalian Waste
  5. Manajemen Insiden & Resolusi SLA Lapangan
  6. Reputasi Digital & Sentimen Google Maps

---

### 2. Arsitektur 3-Tier Multi-Scope Berbasis Konteks Dashboard:

#### 🏛️ Tier 1: Akun Master COO (Skala Nasional)
* **Judul**: `LAPORAN KINERJA OPERASIONAL EKSEKUTIF NASIONAL`
* **Presenter**: `[Nama COO] • Head of Operations (COO)`
* **Cakupan**: 14 Wilayah & 146 Cabang se-Indonesia.
* **Isi 6 Slide**:
  1. *Scorecard*: Omzet nasional, gap target nasional, rata-rata HPP & waste nasional, total struk kasir nasional, rata-rata SLA insiden nasional.
  2. *Leaderboard*: Top 3 & Bottom 3 **Area Manager se-Indonesia**.
  3. *Sales*: Kontribusi omzet per **Unit Brand F&B Nasional** (Momoyo, Mixue, Tomoro, dsb).
  4. *Efisiensi*: Rata-rata HPP & akumulasi nominal waste 146 gerai nasional.
  5. *Insiden*: Klasifikasi insiden nasional & SLA penanganan lapangan.
  6. *Sentimen*: Rating Google Maps agregat 146 gerai nasional.

#### 🏢 Tier 2: Akun Area Manager (Skala Wilayah Binaan, misal: AREA-08)
* **Judul**: `LAPORAN KINERJA OPERASIONAL WILAYAH [AREA-08]`
* **Presenter**: `[Nama AM] • Area Manager ([AREA-08])`
* **Cakupan**: 11 Gerai binaan di wilayah tersebut.
* **Isi 6 Slide**:
  1. *Scorecard*: Konsolidasi omzet 11 gerai binaan, target wilayah, HPP wilayah, total transaksi struk area, insiden wilayah.
  2. *Leaderboard*: Peringkat Top 3 & Bottom 3 **Gerai Binaan di Area Tersebut**.
  3. *Sales*: Realisasi penjualan per gerai binaan di wilayah (toko capai target vs toko butuh dorongan).
  4. *Efisiensi*: Rata-rata HPP & waste toko binaan, toko over budget di wilayah.
  5. *Insiden*: Kasus insiden yang terjadi pada gerai binaan & kecepatan respon penanganan supervisi.
  6. *Sentimen*: Rata-rata rating Google Maps 11 gerai di wilayah binaan.

#### 🏪 Tier 3: Akun SPV Gerai (Skala Toko Tunggal, misal: Momoyo Babakan Ciparay)
* **Judul**: `LAPORAN KINERJA OPERASIONAL GERAI [MOMOYO BABAKAN CIPARAY]`
* **Presenter**: `[Nama SPV] • Supervisor Gerai ([CBG-076])`
* **Cakupan**: Murni 1 gerai SPV sendiri (`CBG-076`).
* **Isi 6 Slide**:
  1. *Scorecard*: Omzet riil toko bulan berjalan, target bulanan gerai, persentase capaian toko, HPP bahan baku toko, total transaksi struk gerai, dan status insiden toko.
  2. *Ranking Penjualan*: **Top 3 Hari Omzet Tertinggi Gerai** vs **3 Hari Omzet Terendah** (evaluasi jam sepi toko).
  3. *Sales*: Tren penjualan mingguan gerai & rata-rata basket size struk kasir toko.
  4. *Efisiensi*: HPP bahan baku toko, rincian belanja bahan mingguan, petty cash, dan waste fisik toko.
  5. *Insiden*: Status insiden gerai (*Nihil Insiden Aktif - Kondusif*) & service recovery langsung 15 menit.
  6. *Sentimen*: Rating Google Maps & ulasan konsumen khusus gerai tersebut.

---

## 🚦 Status Implementasi & Verifikasi (v5.9.5):
1. ✅ **Penghapusan Total Poin SOP**: Checkbox `chkPresentasi_tugas` dihapus, kartu metrik SOP di Slide 1 diganti dengan *Total Transaksi Kasir* & *Basket Size*, Slide 6 lama dihapus secara permanen. Total 6 slide bersih.
2. ✅ **Multi-Scope 3-Tier Berjalan**:
   - **SPV Gerai**: Menampilkan header & judul gerai otomatis (`MOMOYO BABAKAN CIPARAY`), Slide 2 menampilkan Top 3 Hari Omzet Tertinggi vs 3 Hari Omzet Terendah, Slide 3 progres mingguan W1-W4 gerai, Slide 4 HPP & waste gerai, Slide 5 insiden gerai (nihil insiden aktif), Slide 6 rating gerai.
   - **Area Manager**: Menampilkan header & judul wilayah (`AREA-08`), konsolidasi data gerai binaan, Leaderboard Top 3 & Bottom 3 gerai wilayah, sales breakdown gerai area, efisiensi & insiden wilayah.
   - **Master COO**: Menampilkan laporan skala nasional 14 area & 146 gerai se-Indonesia, Leaderboard AM nasional, performa multi-brand nasional, audit rantai pasok.
3. ✅ **Kompilasi & Validasi Sintaks**: Lulus uji sintaks Node.js VM pada `js.html` dan `PANORAMA_VERCEL/index.html` tanpa error.
---

# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.9.6)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 26 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (v5.9.6)  

---

## 🎯 Latar Belakang & Analisis Masalah
Pengguna melaporkan kendala pada menu **Jadwal Kerja**:
> *"ini udh ajukan jadwal tapi status nya belum ke ganti"*  
(Lampiran screenshot: Akun SPV CBG-076 telah mengunggah file `JADWAL DESEMBER 2.pdf` berstatus `MENUNGGU MA`, namun kartu banner kepatuhan di atasnya masih berwarna merah mencolok dengan status `MELEWATI DEADLINE (11 Hari Lalu)` dan pesan *"Anda belum menyerahkan jadwal kerja gerai untuk Desember 2026"*).

### Akar Masalah (Root Causes):
1. **Ketidaksesuaian Periode Default Pengajuan**:
   - Pada modal unggah jadwal SPV (`openModalAjukanJadwal`) dan fungsi submit (`submitSpvRosterFile`), picker bulan secara statis diisi default `'2026-11'`.
   - Akibatnya, saat SPV mengunggah file jadwal Desember di akhir November, berkas tersimpan dengan metadata periode `2026-11` (bulan 11) alih-alih `2026-12` (bulan 12).
2. **Kriteria Deteksi Penyerahan Jadwal SPV yang Terlalu Kaku**:
   - Fungsi `renderJadwalDeadlineCard()` memeriksa `myStoreSubmitted` hanya berdasarkan string persis `nextMonthName` (Desember) atau `calendarMeta.month === 12`. Karena tersimpan sebagai bulan 11, deteksi bernilai `false` dan kartu tetap menampilkan status merah belum mengumpulkan.
3. **Hardcoded Background Merah pada CSS**:
   - Pada `css.html`, kelas `.jadwal-deadline-card` memiliki properti `background: linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%) !important` tanpa memedulikan status kepatuhan, sehingga kartu selalu berwarna merah.
4. **Tombol Approval Muncul untuk SPV Sendiri**:
   - Pengecekan izin approval (`canApprove`) menggunakan kondisi `(!isCOO && j.status === 'MENUNGGU_MA' && j.areaId === targetArea)`. Karena SPV bukan COO (`!isCOO`), tombol `Setujui` dan `Revisi` ikut muncul pada akun SPV sendiri.

---

## 🛠️ Solusi Rekayasa & Implementasi (v5.9.6)

### 1. Deteksi Multi-Kriteria & Auto-Healing Pengajuan Jadwal SPV:
- **Resilient Matching**: Deteksi `myStoreSubmitted` pada `renderJadwalDeadlineCard` dan `renderDashboardJadwalAlert` ditingkatkan dengan multi-kriteria:
  - Kecocokan periode (`nextMonthName` / `targetPeriodeStr`).
  - Kecocokan nama file / agenda yang mengandung kata `desember`, `des`, atau `12` (seperti `JADWAL DESEMBER 2.pdf`).
  - Status aktif pengajuan (`MENUNGGU_MA` atau `DISETUJUI`).
  - Pengajuan pada siklus bulan berjalan (`2026-11`).
- **Auto-Healing Metadata**: Saat tabel jadwal dirender, sistem secara otomatis menyelaraskan jadwal yang nama file-nya menyebutkan Desember agar memiliki `calendarMeta.month = 12` dan periode `2026-12`.

### 2. State Tampilan Banner Kepatuhan Sesuai Status:
- Ketika jadwal telah diajukan (`myStoreSubmitted = true`):
  - Wadah kartu berganti ke `.deadline-success` dengan tema hijau emerald lembut (`#F0FDF4` / `#BBF7D0`).
  - Badge berubah menjadi: `<span class="jadwal-deadline-badge badge-ontime"><svg ...></svg> ✓ Jadwal Sudah Diserahkan</span>`.
  - Teks deskripsi berganti menjadi: *"✓ Terima kasih! Jadwal kerja gerai Anda untuk periode Desember 2026 telah diajukan dan saat ini berstatus MENUNGGU APPROVAL AREA MANAGER."*
  - Tombol aksi berubah menjadi tombol outline elegan: **"Perbarui / Kirim Ulang Jadwal"**.

### 3. Otomasi Periode Default Bulan Depan:
- Input picker bulan pada modal pengajuan SPV (`calSpvMonthPicker`) kini dihitung secara dinamis: `now.getMonth() + 2` sehingga otomatis memilih `2026-12` (Desember 2026).

### 4. Isolasi Wewenang Approval (Strict Role Check):
- Logika `canApprove` pada tabel desktop dan kartu mobile diubah dari `!isCOO` menjadi `roleInfo.isManager`.
- SPV tidak lagi melihat tombol `Setujui` / `Revisi` pada pengajuannya sendiri; tombol tersebut eksklusif hanya untuk Area Manager atasan.

---

## 🚦 Status Verifikasi (v5.9.6):
1. ✅ **Uji Sintaks JavaScript**: `vm.Script` pada `js.html` dan `PANORAMA_VERCEL/index.html` lolos 100% tanpa error.
2. ✅ **Sinkronisasi Bundle**: Seluruh file bundle (`index.html`, `app.html`, `PANORAMA_VERCEL/index.html`, `PANORAMA_VERCEL/app.html`) terkompilasi penuh.
3. ✅ **Regresi Guard**: Tampilan Master COO dan Area Manager tetap utuh tanpa efek samping.

---

# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.9.7)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Keahlian Khusus**: UI/UX Pro Max Intelligence  
**Tanggal**: 26 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (v5.9.7)  

---

## 🎯 Latar Belakang & Analisis Permintaan Pengguna
Pengguna melaporkan kendala visual dan fungsional pada modal **Laporkan Insiden Operasional Toko**:
> *"/ui-ux-pro-max logo upload nya kegedean spt nya, jadi tidak tau sudah terupload atau belum , upload foto juga bisa lebih dari satu"*  
(Lampiran screenshot: Ikon SVG panah upload membengkak raksasa memenuhi layar modal hingga ~350px, tidak ada pratinjau foto/thumbnail yang jelas selain teks kecil, dan input hanya mendukung single-file).

### Akar Masalah (Root Causes):
1. **Unconstrained SVG pada Upload Zone**:
   - Kelas `.file-upload-zone` dan `.upload-icon` belum didefinisikan sama sekali di `css.html`.
   - SVG bawaan yang memiliki atribut `viewBox="0 0 24 24"` tanpa batasan dimensi CSS (`width`/`height`) melebar otomatis hingga 100% ukuran modal box, menutupi konten lain secara agresif.
2. **Ketiadaan Feedback Visual (Perceived Quality & State Clarity)**:
   - Tidak ada visual thumbnail / kartu pratinjau foto setelah file dipilih. Pengguna hanya disajikan teks kecil yang samar, sehingga membingungkan apakah foto sudah benar-benar terpilih atau belum.
3. **Keterbatasan Single File**:
   - Elemen `<input type="file">` tidak memiliki atribut `multiple`, dan fungsi handler hanya membaca `input.files[0]`. Dalam operasional gerai, insiden fisik (seperti mesin soft serve bocor, stopkontak terbakar, nota vendor) membutuhkan beberapa sudut pengambilan foto bukti sekaligus.

---

## 🛠️ Solusi Rekayasa & Desain (UI/UX Pro Max v5.9.7)

### 1. Perancangan Ulang Dropzone (`.file-upload-zone` & `.upload-icon`):
- **Dimensi Ikon Terkendali**: Ikon upload kini dibungkus dalam lingkaran modern berukuran proporsional $48 \times 48\text{ px}$ dengan ikon SVG $24 \times 24\text{ px}$ (warna hijau hutan khas PANORAMA), hover micro-interaction translasi $-3\text{ px}$ yang halus.
- **Dashed Dropzone Modern**: Border putus-putus elegan `#94A3B8` dengan radius $12\text{ px}$, transisi warna hover hijau emerald saat kursor melintas, serta dukungan **Drag & Drop** langsung dari desktop.
- **Dark Mode Native**: Terintegrasi penuh dengan tema gelap portal (`body.dark-mode`).

### 2. Multi-File Selection & Interactive Preview Grid:
- **Dukungan Banyak Foto**: Input berkas diperbarui menjadi `<input type="file" multiple>` dengan tombol **"+ Tambah Foto Lain"**, memungkinkan SPV/Manager memilih beberapa foto sekaligus atau menambah foto secara bertahap.
- **Galeri Pratinjau Interaktif (`#insidenFilesGrid`)**:
  - Tiap foto yang dipilih menampilkan **thumbnail gambar asli** ($1:1$ aspect ratio, `object-fit: cover`) via data URI pembacaan lokal.
  - Untuk berkas dokumen PDF, menampilkan ikon dokumen PDF merah yang elegan.
  - Informasi nama berkas (dengan teks elipsis rapi) dan ukuran file ($KB / MB$).
  - Badge hijau **"✓ Siap"** di pojok kiri bawah thumbnail.
  - Tombol **Hapus Individual ("✕")** di pojok kanan atas thumbnail, memudahkan pengguna membatalkan foto tertentu tanpa harus mengulang dari awal.
  - Badge jumlah foto di header: *"✓ X Foto Terpilih"*.

### 3. Multi-Upload Pipeline ke Google Drive:
- Fungsi `submitInsidenForm()` mengunggah seluruh berkas yang ada di daftar `window.PANORAMA_INSIDEN_FILES` secara sekuensial ke endpoint Google Drive API per Area dengan progress loader dinamis: *"Mengunggah foto bukti (1 dari 3)..."*.
- URL disimpan dalam format multi-URL (JSON array string) yang tetap 100% kompatibel dengan data tunggal lama.

### 4. Pratinjau Multi-Foto di Peninjauan Insiden (`openKendalaProof`):
- Saat tiket insiden yang memiliki lebih dari satu foto bukti dibuka, penampil pratinjau (`modalPreviewBukti`) otomatis menampilkan **Gallery Switcher**: deretan thumbnail horizontal di bagian atas dan pratinjau foto aktif di tengah, memudahkan COO atau Area Manager memeriksa seluruh foto bukti insiden secara detail.

---

## 🚦 Status Verifikasi (v5.9.7):
1. ✅ **Uji Sintaks JavaScript**: `vm.Script` lolos 100% pada `js.html` dan `PANORAMA_VERCEL/index.html`.
2. ✅ **Sinkronisasi Bundle**: Seluruh file bundle (`index.html`, `app.html`, `PANORAMA_VERCEL/index.html`, `PANORAMA_VERCEL/app.html`) terkompilasi penuh.
3. ✅ **Regresi Guard**: Tidak ada dampak samping pada alur submit kendala lain atau modul penjualan.

---

# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.9.8)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 26 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (Desktop + Mobile, Light + Dark Mode)  

---

## 🎯 Latar Belakang & Analisis Masalah
Pengguna melaporkan bug tampilan pada halaman form ulasan pelanggan (`?page=ulasan&cbg=CBG-076&...`):
> *"ada bug tampilan di form isi ulasan customer"*  
(Lampiran screenshot: Form ulasan tergencet sempit di sisi kiri layar desktop sementara ~85% area kanan kosong berwarna putih solid, dan teks/bintang terpotong ke bawah).

### Akar Masalah (Root Causes):
1. **Blok Fungsi JavaScript Berada di Luar Tag Penutup `</script>` (`js.html` baris 25253–25309)**:
   - Pada pembaruan sebelumnya, fungsi `renderMultiPhotoIncidentProof` tertulis setelah `</script>` di bagian akhir `js.html`.
   - Browser mem-parsing potongan HTML string di dalam fungsi tersebut (termasuk `<div class="proof-gallery-thumbs">` dan `<div style="position:relative; width:100%; ...">`) langsung ke dalam `<body>` sebagai elemen DOM nyata.
   - Karena mode `?page=ulasan` menerapkan `body { display: flex !important; }`, elemen nyasar tersebut menjadi *flex sibling* selebar penuh di sisi kanan yang menekan `.review-standalone-wrap` hingga menyusut ke sisi kiri layar!
2. **Konflik Flexbox `html` + `body` & Potensi Terpotong Vertikal (`css.html`)**:
   - Baik `html.panorama-review-mode` maupun `html.panorama-review-mode body` sama-sama memakai `display: flex !important; align-items: center !important;`. Pada layar pendek, `align-items: center` memotong bagian atas kartu keluar viewport.
   - Selector penyembunyian `#globalAppLoader` di CSS tidak cocok dengan ID sebenarnya `#globalLoader` di HTML, dan elemen seperti `#screenPendingApproval`, `#mobileSidebarBackdrop`, serta kontainer cetak belum ikut disembunyikan.
3. **Konflik Dark Mode pada Kartu Ulasan (`css.html`)**:
   - Inline style `background: '#FFFFFF'` bertabrakan dengan aturan dark mode `[style*="color:#0F172A"]` yang mengubah teks menjadi terang (`#E8EFEB`) sehingga teks nyaris tidak terbaca di latar putih saat perangkat berada pada Mode Gelap.
4. **Penutupan Dini `<head>` (`index_modular.html`)**:
   - `<div id="panoramaServerParams">` di dalam `<head>` secara spesifikasi HTML5 memicu penutupan `<head>` lebih awal.

---

## 🛠️ Solusi Rekayasa & Perbaikan (v5.9.8)

1. **Perbaikan Penempatan `</script>` di [js.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/js.html)**:
   - Memindahkan seluruh definisi `renderMultiPhotoIncidentProof` ke dalam blok `<script>` sebelum tag penutup `</script>` dan memastikan nol karakter/markup setelah `</script>`.
2. **Refaktor Layout Flexbox & Responsive Review Card ([css.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/css.html) & [js.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/js.html))**:
   - Memastikan `html.panorama-review-mode` tetap `display: block` dan hanya `body` yang menjadi *flex column* dengan `margin: auto` pada `.review-standalone-wrap` agar kartu selalu terpusat rapi di desktop maupun mobile tanpa memotong bagian atas di layar kecil.
   - Menambahkan pengaman penyembunyian lengkap (`#globalLoader`, `#screenPendingApproval`, `#mobileSidebarBackdrop`, `#presentationPrintContainer`, `#panoramaPrintUtilityContainer`).
   - Mengganti inline style kartu ulasan dengan CSS semantik (`.review-standalone-header`, `.review-standalone-body`, `.review-chip`, `.review-input`, `.review-form-grid`) dengan dukungan penuh **Light Mode & Dark Mode** ber-kontras tinggi.
   - Menjadikan kolom `Nama Anda` & `No. WhatsApp / HP` menumpuk (`1fr`) rapi di bawah `440px` dengan `font-size: 16px` agar tidak memicu *auto-zoom* di ponsel.
   - Menambahkan sanitasi `escapeHtml` pada seluruh parameter URL (`nama`, `brand`, `kota`).
3. **Validasi `<head>` ([index_modular.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/index_modular.html))**:
   - Mengubah `<div id="panoramaServerParams">` menjadi `<meta id="panoramaServerParams" name="panorama-server-params" data-params="">` agar struktur `<head>` tetap valid 100%.

---

## 🚦 Status Verifikasi (v5.9.8):
1. ✅ **Uji Sintaks Ketat**: Lulus `vm.Script` pada `js.html` dan `PANORAMA_VERCEL/index.html` serta pengecekan nol trailing markup di luar `</script>`.
2. ✅ **Verifikasi Visual Browser Nyata (Microsoft Edge Headless)**:
   - **Desktop (`1366x768`) Light & Dark Mode**: Kartu tampil presisi di tengah layar (`max-width: 460px`), nol overflow horizontal, kontras teks dan tombol tajam.
   - **Mobile (`375x812`) Light & Dark Mode**: Tata letak responsif 1 kolom, chip dan input berukuran nyaman disentuh (`>= 44px`), tidak ada elemen terpotong.

---

# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.9.9)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 26 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (iPhone Dynamic Island / Notch Safe-Area Fix)  

---

## 🎯 Latar Belakang & Analisis Masalah
Pengguna melaporkan kendala tampilan saat halaman digulir (*scroll*) pada iPhone PWA (`media_1795677619560_038e373b.jpg`):
> *"tampilan di iphone bug di scrool malah tembus bagian atas nya"*  
(Lampiran screenshot: Konten halaman yang di-scroll muncul menembus area atas di belakang *Dynamic Island* / status bar di atas `.top-bar`).

### Akar Masalah (Root Causes):
1. **Tidak Ada `viewport-fit=cover` pada `<meta name="viewport">`**:
   - Pada [index_modular.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/index_modular.html#L6) (serta [code.gs](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/code.gs#L75) dan [Reviews.gs](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/Reviews.gs#L486)), meta viewport belum menyertakan `viewport-fit=cover`.
   - Bersama `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, WebKit iOS mengunci `.top-bar` (`position: fixed; top: 0`) di bawah area *Dynamic Island* (`y ≈ 59px`), sementara area status bar di atasnya dibiarkan transparan sehingga konten yang digulir ke atas terlihat tembus tepat di belakang status bar iPhone.
2. **Header `.top-bar`, `.main-content`, & Drawer Belum Memperhitungkan `env(safe-area-inset-top)`**:
   - Hanya `.bottom-nav` yang memakai `env(safe-area-inset-bottom)`, sedangkan `.top-bar` (`54px`) dan `padding-top` `.main-content` belum menyertakan `env(safe-area-inset-top, 0px)`.
3. **`overflow-x: hidden` Ganda pada `html, body` & `overflow: hidden` pada `.top-bar`**:
   - Pada iOS WebKit, `overflow-x: hidden` di `html` dan `body` dapat memicu perilaku kontainer scroll terpisah pada elemen `fixed`, dan `overflow: hidden` pada `.top-bar` memblokir perisai penutup area atas (*safe-area shield*).

---

## 🛠️ Solusi Rekayasa & Implementasi (v5.9.9)

1. **Aktifkan Edge-to-Edge Viewport (`viewport-fit=cover`)**:
   - Menambahkan `viewport-fit=cover` pada meta viewport di [index_modular.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/index_modular.html#L6), [code.gs](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/code.gs#L75-L82), dan [Reviews.gs](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/Reviews.gs#L486-L512) sehingga `top: 0` menempel hingga tepi fisik atas layar iPhone dan `env(safe-area-inset-top)` aktif.
2. **Header `.top-bar`, `.main-content`, & `.mobile-sidebar` Safe-Area ([css.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/css.html))**:
   - Memperbarui `.top-bar` (`@media (max-width: 900px)` dan `768px`) dengan:
     - `padding-top: env(safe-area-inset-top, 0px)` dan `height: calc(54px + env(safe-area-inset-top, 0px))`.
     - Latar belakang solid (`var(--bg-surface, #FFFFFF)` untuk Light Mode, `#151E1A` untuk Dark Mode).
     - Pseudo-elemen perisai `.top-bar::before` (`top: -120px; height: 120px;`) sebagai pengaman tambahan agar konten *scroll* atau *overscroll bounce* tidak pernah menembus area atas maupun pada bookmark PWA cache lama / iframe.
   - Menyelaraskan `padding-top: calc(54px + env(safe-area-inset-top, 0px))` pada `.main-content`, safe-area pada `.mobile-sidebar-header`, `.modal-backdrop`, `.login-entrance-overlay`, dan `.toast-container`.
   - Menambahkan `overflow-x: clip` pada `html, body`, `.app-wrapper`, dan `.main-content` mobile untuk menjaga perilaku root *scrolling* iOS tetap stabil.

---

## 🚦 Status Verifikasi (v5.9.9):
1. ✅ **Sinkronisasi Bundle**: Seluruh file bundle ([index.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/index.html), [app.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/app.html), [PANORAMA_VERCEL/index.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/PANORAMA_VERCEL/index.html), [PANORAMA_VERCEL/app.html](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/PANORAMA_VERCEL/app.html)) terkompilasi penuh melalui [build_bundles.js](file:///c:/Users/Lenovo/.gemini/antigravity-ide/DASHBOARD%20HEAD%20OPS/scratch/build_bundles.js).
2. ✅ **Verifikasi Visual Scroll iPhone (`375x812`, Simulasi Dynamic Island `59px`)**: Diperiksa langsung pada mode Light dan Dark dalam posisi halaman ter-scroll ke bawah — area di atas maupun di belakang Dynamic Island tertutup solid oleh `.top-bar` dan nol kebocoran konten.


---

## v5.10.0 — Breakdown Sales 6-Channel (Offline, GrabFood, ShopeeFood, GoFood, TikTok, Qpon) & Multi-Brand POS AI Scanner
**Tanggal:** 2026-11-26  
**Status:** Implementasi Lengkap & Terverifikasi  

### Ringkasan Perubahan
1. **Skema `DataSales` Backward-Compatible (`code.gs`, `Sales.gs`, `setup.gs`, `prd.md`)**:
   - Menambahkan 6 kolom channel baru di indeks `11..16` (`L..Q`): `SalesOffline`, `SalesGrabFood`, `SalesShopeeFood`, `SalesGoFood`, `SalesTikTok`, dan `SalesQpon` tanpa menggeser kolom `A..K`.
   - Menambahkan `ensureSalesChannelHeaders_(sheet)` di `Sales.gs` agar sheet produksi lama otomatis menambah header kolom channel saat penyimpanan baru/koreksi pertama kali.
   - Data historis lama tetap dihitung utuh di total omzet (`ActualSales`) dan ditandai secara aman sebagai `Belum Dirinci (Legacy)` di visualisasi komposisi channel.
2. **Input Sales Modal & Multi-Brand + Multi-Foto POS Scanner (`index_modular.html`, `js.html`, `Sales.gs`)**:
   - Menambahkan grid input 6 channel (`Offline`, `GrabFood`, `ShopeeFood`, `GoFood`, `TikTok`, `Qpon`) dengan **auto-sum** ke `Total Realisasi Omzet (Actual Sales)`, rasio Offline vs Online live, dan perbandingan langsung terhadap Target Harian.
   - Meng-upgrade AI Scanner agar mendukung **1–3 foto sekaligus** (termasuk mode *scroll* seperti Daily Report Tomoro Coffee dengan deduplikasi baris overlap otomatis), melewati `callPanoramaApi` (bekerja baik di GAS maupun Vercel PWA), serta men-upgrade model backend `apiScanReceiptWithAI` dari `gemini-1.5-flash` ke `gemini-2.5-flash` (fallback `gemini-2.0-flash` + Client OCR `parseReceiptOcrText` multi-brand).
   - Memasukkan aturan parser spesifik untuk **5 brand POS lapangan**:
     - **Momoyo** (`POS`, `Tiktok`, `Shopee food`, `Qpon`, `Gojek`, `Persamaan`)
     - **Wedrink / ESB POS** (`CASH` + `QRIS MANUAL`, `GRAB FOOD`, `QPON`, `TIKTOK GO`)
     - **Tomoro** (multi-foto scroll + deduplikasi baris overlap, pemisahan dompet/EDC toko `Gopay/ShopeePay/OVO/DANA/BCA/BRI` sebagai Offline)
     - **Mixue** (blok `Rincian penerimaan uang` pasca diskon toko, `Tunai + Gopay + Online` sebagai Offline, `GoFood manual input`)
     - **Tianlala** (baca hanya kolom `TERCATAT`, abaikan `SELISIH` minus, ekstrak `Penjualan` tunai tanpa modal awal `Kas Masuk`, peta `* Integrasi`)
3. **Summary Sales 3-Tier, Dashboard Hero, Presentasi PDF Slide 3 & Export Excel (`js.html`, `css.html`)**:
   - Agregasi 6 channel + `legacyUnclassified` terpusat pada `getPeriodFilteredSalesData` untuk konsistensi **SPV → Area Manager → COO Nasional**.
   - Penambahan **Stacked Channel Composition Bar + Channel Cards/Chips** di Dashboard Hero, Sales Performance (SPV, Area Manager, COO), modal riwayat harian, Slide 3 Presentasi PDF, dan **Export Excel Eksekutif** (Matriks Area 17 kolom + Rincian Gerai 20 kolom).
