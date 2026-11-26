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
4. ✅ **Sinkronisasi Bundle**: Seluruh file bundle (`index.html`, `app.html`, `PANORAMA_VERCEL/index.html`, `PANORAMA_VERCEL/app.html`) tersinkronisasi 100%.
