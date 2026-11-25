# 📋 PAPAN REVISI & TRACKING PERBAIKAN ZETTBOT (v5.8.1)
**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
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
