# 📋 RENCANA & TRACKING REVISI v5.12.0 — Akselerasi Muat Awal Dashboard (Instant Snapshot + Paket Kilat SPV + Auto-Warmup)

**Proyek**: PANORAMA Executive Operations Portal  
**Lead Architect**: ZettBOT by Zettbos  
**Tanggal**: 28 November 2026  
**Status**: 🟡 DALAM EKSEKUSI (Mandat penuh pengguna: *"oiya kalo begitu saya percayakan ke kamu"*)

---

## 🎯 Akar Masalah Lambat & Layar `Rp 0` Saat Awal Buka
1. **Salinan Data HP Tidak Dipakai di Awal (`js.html`):** Browser sebenarnya sudah menyimpan salinan data (`PANORAMA_DATA_CACHE`), namun baru dibuka ketika server gagal/offline (`renderStandaloneFallback`) — bukan saat membuka layar awal (`authenticateUserSuccess` / `fetchOperationalData`). Akibatnya layar dimulai dari `Rp 0` sambil menunggu Google Sheet membaca data.
2. **Login 2x Putaran Berurutan (`js.html` & `Auth.gs`):** `handleFormLogin` memanggil `apiLogin`, lalu memanggil `authenticateUserSuccess` (`fetchOperationalData()`) sekaligus `fetchOperationalData(true)` — memaksa dua putaran antre server dan menampilkan spinner blokir 15 detik.
3. **Paket Data SPV Gemuk & Memuat 13 Tab Sekaligus (`code.gs` & `Library.gs`):** Akun SPV (`CBG-076`) tetap menerima seluruh 160+ daftar akun (`listUsers`), jadwal kerja seluruh gerai lain di satu area (`detailHari`/`detailKru`), dan daftar dokumen `DataLibrary` saat pertama masuk Dashboard.
4. **Umur Cache Server Terlalu Pendek (`90s`/`180s`):** Meskipun setiap penulisan sudah langsung membuang cache terkait (`invalidateCacheDomains_`), umur simpan sementara hanya 90–180 detik sehingga sebentar saja sepi sudah hangus dan pengguna berikutnya kena baca dingin Google Sheet (~13 detik).

---

## 🛠️ Solusi Rekayasa (`v5.12.0`)
1. **Tampilan Sekejap `0,1` Detik (`Stale-While-Revalidate`) + Indikator Tenang (`js.html`, `index_modular.html`, `css.html`):**
   - Simpan & muat potret data terisolasi per akun (`PANORAMA_DATA_CACHE_<username>`) dengan verifikasi kesamaan `username`, `role`, `areaId`, dan `cabangId`.
   - Muat snapshot langsung di awal sebelum menyentuh server sehingga omzet/grafik/tugas muncul ~`0,1` detik tanpa layar `Rp 0`, disertai pil/ikon menyegarkan halus (`#bgSyncStatusPill` & `#btnHeaderRefreshData.is-syncing`).
   - Bersihkan cache lama tak terisolasi saat logout agar data antar akun tidak pernah tercampur.
2. **Login 1x Jalan (`Auth.gs`, `code.gs`, `js.html`):**
   - `handleFormLogin` mengirim `includeInitialData: true`; `apiLogin` mengembalikan `user` + `initialData` (dari cache hangat dalam satu respons) tanpa memanggil `fetchOperationalData` dua kali.
3. **Paket Kilat SPV & Muat Bertahap *Lazy Load* (`code.gs`, `Library.gs`, `js.html`):**
   - Untuk SPV: `listUsers` hanya memuat akun SPV itu sendiri + Area Manager wilayahnya (~2 entri alih-alih 160+), dan `listJadwal` hanya memuat jadwal milik gerainya sendiri (plus perbaiki banner dashboard agar prompt `VISIT_AREA` Manager tidak salah tampil ke SPV).
   - Pisahkan pengambilan `DataLibrary` melalui endpoint `apiGetLibraryData` (cached) dan opsi `liteMode: true` saat boot dashboard; `switchTab('library')` memuatnya secara otomatis dan menyimpannya ke snapshot.
4. **Cache Lebih Awet + Pemanas Otomatis (`code.gs`, `Notifikasi.gs`, `Library.gs`):**
   - Perpanjang umur `CacheService` menjadi `3600s` (`MASTER`), `900s` (`SALES`, `OTHER_OPS`), dan `300s` (`NOTIF`) karena invalidasi domain sudah aktif otomatis pada setiap penyimpanan data (termasuk penambahan invalidasi langsung di `Library.gs`).
   - Tambahkan `warmupPanoramaCache_()`, `apiWarmupCache`, `warmupPanoramaCacheCron_()`, dan `setupCacheWarmupTrigger()` (trigger tiap 10 menit opsional) agar server selalu hangat ~3 detik dan terhindar dari pembacaan dingin 13 detik.
