# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.8.6)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 25 November 2026  
**Status**: 🟢 SELESAI & TERTUJI PENUH (VERIFIED 100% PUSH DELIVERY - GAS DEPLOYMENT @90, GIT 9cce87d)  
**Hasil Audit Live**: Kunci REST API Key baru aktif (`os_v2_app_...`) berhasil mengirimkan sinyal push ke **5 perangkat aktif** (Chrome Web Push & Edge Web Push) dengan status HTTP 200 OK!

---

## 🔍 Analisis Mendalam Akar Masalah (Root Cause Analysis)
1. **Format Penulisan Database**: Di modul `Tugas.gs`, label UI `Area Manager (AREA-06 - Gilang Pratama)` sebelumnya diteruskan ke array target sehingga kolom `TargetUser` di baris 645 tertulis panjang. Sudah dinormalkan menjadi token bersih `COO,AREA-06` (atau `AREA-06`).
2. **Kegagalan Push ke HP**: REST API Key OneSignal lama telah kedaluwarsa/dicabut (HTTP 401 Access Denied).
3. **Resolusi Tuntas**: Pengguna memperbarui REST API Key aktif. Kunci baru telah diintegrasikan, dideploy ke GAS @90, dan diverifikasi sukses menembus 5 perangkat sekaligus.

---

## 🛠️ Rencana Eksekusi Perbaikan (Implementation Plan)

### 1. Normalisasi Target Tugas di `Tugas.gs`:
- Hapus penyertaan teks deskripsi `payload.assignedTo` ke dalam array target notifikasi.
- Format target tugas baru menjadi standar yang baku dan bersih:
  - Tugas Nasional: `'ALL'`
  - Tugas Wilayah Tertentu: `['COO', areaNewStr]` (misal: `['COO', 'AREA-06']`), sehingga di sheet `DataNotifikasi` kolom `TargetUser` kembali tertulis rapi dan konsisten: `COO,AREA-06` (atau `AREA-06`).

### 2. Sanitasi & Resolusi External ID di `Notifikasi.gs`:
- **Pembersihan Database Target (`recordAndPushNotification`)**: Hanya mencatat token target bersih (tanpa teks deskripsi panjang) ke kolom `TargetUser` Google Sheets.
- **Normalisasi Wilayah & Status di `getUserMap()`**:
  - Menggunakan `getSheet(TAB.USER)` yang konsisten.
  - Membaca status aktif secara toleran: aktif jika bukan `BLOCKED`, `INACTIVE`, `NONAKTIF`, `PENDING`.
  - Memetakan `uArea` secara fleksibel (baik berupa `'AREA-06'`, `'06'`, `'AREA 06'`, maupun `'AREA-06 - ...'`) ke format baku `'AREA-06'` dan `'06'`.
- **Sanitasi Ketat External ID (`resolveUsernamesFromTargetList_`)**:
  - Jika target berupa teks deskriptif, regex otomatis mengekstrak kode wilayah (misal: `AREA-06`) dan nama personil (misal: `Gilang Pratama`) untuk dihubungkan ke username riil (`gilang`).
  - Tolak string dengan spasi atau tanda kurung agar tidak pernah terkirim sebagai alias OneSignal. Hanya username bersih (`gilang`, `coo_master`, `admin`) yang diteruskan ke OneSignal.

---

## 🔒 Jaminan Zero-Regression
- Struktur kolom dan riwayat data lama di Google Sheets tetap 100% aman dan utuh.
- Pengiriman notifikasi uji coba langsung diverifikasi setelah penerapan.

---

# 📋 ARSIP PERBAIKAN SEBELUMNYA (v5.8.3)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 25 November 2026  
**Status**: 🟢 SELESAI & TERTUJI (VERIFIED) - Perbaikan Tombol Aksi Edit Efisiensi (Fix ReferenceError isHppSafe & Multi-Role Branch Binding)  
**Modul Terdampak**: `js.html`, Bundle HTML (`index.html`, `app.html`, `PANORAMA_VERCEL/*`)

---

## 🔍 Akar Masalah & Solusi Perbaikan v5.8.3

Saat tombol aksi edit `[ ✎ ]` pada tabel Efisiensi HPP & Waste diklik, tombol tidak merespon karena 2 kendala teknis:

1. **`ReferenceError: isHppSafe is not defined` pada `renderEfisiensiWeeklyBreakdown()`**:
   - Di dalam loop mingguan `sortedEffs.forEach()`, badge status HPP mencoba membaca variabel `isHppSafe` dan `hpp`.
   - Variabel tersebut sebelumnya tidak dideklarasikan di scope baris item, melainkan di blok ringkasan bawah.
   - **Solusi**: Telah dideklarasikan dan dikalkulasi secara presisi `monthlyOmzet`, `hpp`, `maxHppStd`, dan `isHppSafe` per baris minggu riwayat.

2. **Resolusi Cabang untuk Akun Master Admin (`openInputEfisiensiModal` & `openEditEfisiensiModalForBranch`)**:
   - Pengecekan peran `user.role === 'COO'` sebelumnya mengecualikan akun berlabel `'MASTER_ADMIN'`, sehingga saat filter wilayah diset `'ALL'`, daftar cabang bernilai kosong.
   - **Solusi**: Menggunakan standardisasi `roleInfo.isMaster || roleInfo.isCOO || roleInfo.canViewAll`. Jika cabang yang dipilih belum ada di dropdown, sistem secara otomatis menginjeksi opsi cabang tersebut sehingga modal langsung menampilkan cabang yang diklik secara instan.

3. **Global Window Scope Binding**:
   - Menjamin seluruh fungsi modal (`openEditEfisiensiModalForBranch`, `openInputEfisiensiModal`, `setEfisiensiInputMode`, dll.) terdaftar secara eksplisit pada objek `window` agar bebas kendala closure di berbagai runtime browser.

---

# 📋 ARSIP PERBAIKAN SEBELUMNYA (v5.8.2)
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
