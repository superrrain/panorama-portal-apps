# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.8.2)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 25 November 2026  
**Status**: 🟢 SELESAI & TERTUJI (VERIFIED) - Penghapusan Fitur Reimburse & Plafon Kas Kecil, Petty Cash Murni Akumulasi Pengeluaran  
**Modul Terdampak**: `index_modular.html`, `js.html`, `Efisiensi.gs`, Bundle HTML (`index.html`, `app.html`, `PANORAMA_VERCEL/*`)

---

## 🎯 Ringkasan Perubahan v5.8.2: Penyederhanaan Petty Cash (Kas Kecil)

Berdasarkan instruksi langsung pimpinan operasional:
> *"hapus aja fitur reimburse ini dan plafond pettcash , cukup menjumlahkan aja petty cash yang terpakai"*

Sistem monitoring kas kecil kini disederhanakan secara menyeluruh tanpa konsep plafon, saldo sisa, atau reimburse:

### 1. Penghapusan Fitur & Tombol Reimburse Kas
- **Modal Input/Koreksi Efisiensi**: Menghapus action banner *"Dana Reimburse Cair? Kembalikan saldo fisik ke plafon..."* serta tombol `[🔁 Reimburse]`.
- **Backend Handler (`Efisiensi.gs`)**: Fungsi `apiReimburseKas()` kini dinonaktifkan secara aman dan mengembalikan respons sukses neutral tanpa mereset saldo, mencegah mutasi data yang tidak diinginkan.

### 2. Penghapusan Plafon Petty Cash & Konsep Saldo Sisa
- **Form Input Efisiensi**: Input `Plafon Kas (Rp)` dihapus total. Section 2 form disederhanakan hanya memuat `Waste Bulanan (%)`.
- **Live Badge & Helper Text**: Menghapus indikator badge `Sisa: Rp ...` dan helper `Plafon: Rp ...`. Digantikan dengan `Total Bln: Rp ...` yang langsung menjumlahkan total kas terpakai bulan berjalan.
- **Tabel Rekapitulasi (Desktop & Mobile)**:
  - Kolom `Plafon Kas` pada tabel Mode Cabang & Mode Area ditiadakan.
  - Kolom `Kas Terpakai (Sisa)` disederhanakan menjadi `Kas Terpakai`.
  - Kartu Mobile KPI tidak lagi menampilkan Plafon atau Sisa Saldo, melainkan `Total Kas Terpakai Bulan Ini`.
  - Tabel Riwayat Mingguan: Kolom `Sisa Saldo` dihapus (sekarang 6 kolom baku).
- **Status Evaluasi Efisiensi**: Menghilangkan logika `Over Kas` (`kasVal > plafonVal`). Status efisiensi gerai kini murni dievaluasi berdasarkan kepatuhan `HPP` dan `Waste Spoiled`.

### 3. Sifat Kas Murni Akumulatif Kumulatif
- Kas kecil dihitung dan ditampilkan murni sebagai jumlah pengeluaran kas yang terpakai:
  - Nominal mingguan (Mgg 1 s/d Mgg 5).
  - Total riwayat dan akumulasi kas bulan berjalan.

---

## 🔒 Jaminan Keamanan Kode & Zero-Regression
1. **Integritas Spreadsheet**: Kolom `DataEfisiensi` di Google Sheets (`COL_EFISIENSI.PLAFON_CASH`) tidak digeser atau dihapus agar data historis tetap utuh. Nilai plafon pada input baru otomatis diisi default 0.
2. **Kompilasi Bundel Sinkron**: Seluruh berkas produksi (`index.html`, `app.html`, `PANORAMA_VERCEL/index.html`, `PANORAMA_VERCEL/app.html`) telah dikompilasi ulang dan identik 100%.

---

# 📋 ARSIP PERBAIKAN SEBELUMNYA (v5.8.1)
**Tanggal**: 25 November 2026  
**Status**: 🟢 SELESAI & TERTUJI (VERIFIED) - OneSignal Web SDK v16 REST API Payload & Auto-Normalizer Area ID Deployed @84  
**Modul Terdampak**: `Notifikasi.gs`, `code.gs` (OneSignal API Payload & Area ID Normalizer)

---

## 🎯 Klarifikasi & Penegasan Fokus Perbaikan

Kritik pengguna **100% valid**: Akun pimpinan/Master COO (`admin` / `coo_master`) memang **tidak pernah diubah** dan di fungsi `getCooUsernames_()` daftar default `['coo_master', 'admin', 'coo']` sudah selalu menyertakan username tersebut dari awal.

Oleh karena itu, **tidak ada perubahan atau utak-atik pada akun Master COO**.

---

## 🔍 Akar Masalah Sebenarnya (Hanya 2 Titik Kunci)

### 1. Format REST API OneSignal Kedaluwarsa (Penyebab Gagal ke HP Pak Risman & Semua HP Manajer)
- Akun Pak Risman (`admin`) dan para Area Manager (`dimas`, `gilang`, dll.) **sebenarnya sudah berhasil dikumpulkan** oleh backend GAS ke dalam variabel:
  `cleanExternalIds = ['coo_master', 'admin', 'coo', 'gilang'];`
- Namun, saat dikirim ke OneSignal:
  `payload.include_external_user_ids = cleanExternalIds;`
- Di sisi HP/Browser, aplikasi menggunakan **OneSignal Web SDK v16** (`OneSignal.login()`).
- OneSignal API modern **tidak lagi menerima `include_external_user_ids` untuk SDK v16**, sehingga OneSignal merespon **0 penerima (`recipients: 0`)**.
- **Solusi Tepat**: Kirim payload sesuai format resmi OneSignal Web SDK v16:
  ```json
  {
    "target_channel": "push",
    "include_aliases": {
      "external_id": cleanExternalIds
    },
    "include_external_user_ids": cleanExternalIds
  }
  ```

### 2. Format Area ID pada Data Transaksi (`03` / `12` vs `AREA-03` / `AREA-12`)
- Di `Sales.gs`, `Insiden.gs`, dan `Efisiensi.gs`, sistem memanggil:
  `['COO', payload.areaId]`
- Jika `payload.areaId` berisi angka murni `'03'` atau `'12'`, fungsi pencarian `resolveUsernamesFromTargetList_` hanya mengecek `if (item.indexOf('AREA-') === 0)`.
- Karena tidak ada awalan `'AREA-'`, backend gagal mencocokkan ke username Area Manager (`dimas`/`gilang`).
- **Solusi Tepat**: Tambahkan auto-prefix sederhana: jika target adalah 2 digit angka (`'03'`, `'12'`), otomatis baca sebagai `'AREA-03'`, `'AREA-12'` sehingga username Area Manager terkait ikut tertangkap.

### 3. Server Dispatcher Test Push (`code.gs`)
- Penyelarasan pembacaan `apiSendTestPushToUser(params.pushPayload || params.payload || params)` agar saat tes dilakukan, ia benar-benar menguji alur targeted yang sama persis dengan notifikasi omset/insiden riil.

---

## 🔒 Jaminan Keamanan Kode
- Tidak menyentuh struktur akun Master COO atau data login apapun.
- Hanya memperbaiki transmisi protokol HTTP OneSignal dan penanganan string Area ID.
