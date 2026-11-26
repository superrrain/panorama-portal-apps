# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.8.7)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 26 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (VERIFIED - BUNDLE COMPILED)  

---

## 🔍 Ringkasan Perubahan yang Diterapkan:

1. **Ranking Omzet Harian (Khusus Akun SPV)**:
   * Pada akun SPV, judul komponen `#lblHeroRankTitleText` berubah dinamis menjadi **`Ranking Omzet`**.
   * Badge cakupan `#badgeHeroRankScope` otomatis menampilkan **Nama Cabang Binaan Resmi SPV** (misal: `MOMOYO BABAKAN CIPARAY`), menggantikan kode wilayah `AREA-08`.
   * Label tab tombol beralih menjadi:
     * **`3 Omzet Terbaik`** (menampilkan 3 tanggal transaksi dengan omzet tertinggi di bulan tersebut).
     * **`3 Omzet Terendah`** (menampilkan 3 tanggal transaksi dengan omzet terendah di bulan tersebut).
   * Menampilkan tanggal dalam format bahasa Indonesia lengkap (misal: *Rabu, 25 Nov 2026*), target harian, jumlah struk kasir, nominal omzet, dan % capaian.
   * *(Akun COO, Area Manager, dan Tamu tetap mempertahankan fitur Ranking Antar Cabang Nasional/Area tanpa regresi).*

2. **Metrik "Rata-rata Penjualan" (Basket Size / Rata-rata per Struk)**:
   * Label sub-metrik di kartu kiri bawah diubah dari `Rata-rata / Gerai` menjadi **`Rata-rata Penjualan`** (elemen `#lblSalesAvgMetric`).
   * Rumus perhitungan diperbarui secara presisi:
     $$\text{Rata-rata Penjualan} = \frac{\text{Total Actual Sales}}{\text{Total Struk Kasir}}$$
   * Jika struk transaksi kasir masih bernilai 0, sistem secara aman menampilkan `Rp 0` tanpa error pembagian nol.

3. **Kompilasi Bundle Otomatis**:
   * Seluruh perubahan modular dari `index_modular.html` dan `js.html` telah berhasil dikompilasi ke 4 file target produksi via `scratch/build_bundles.js`:
     * `index.html` (2.090.119 bytes)
     * `app.html` (2.090.119 bytes)
     * `PANORAMA_VERCEL/index.html` (2.090.119 bytes)
     * `PANORAMA_VERCEL/app.html` (2.090.119 bytes)

