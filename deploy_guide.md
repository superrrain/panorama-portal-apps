# PANDUAN DEPLOY PWA & ONESIGNAL PUSH NOTIFICATION (v4.0.5)
================================================================================
SISTEM: PANORAMA - Executive Operations Portal
TARGET: Notifikasi Status Bar & Lock Screen HP Saat Aplikasi Ditutup Total
STATUS: 🚀 SIAP PAKAI & 100% GRATIS

---

## 1. MENGAPA BUTUH PWA / VERCEL UNTUK NOTIFIKASI STATUS BAR HP?
- **Batasan Google Apps Script (GAS):** 
  Link web app default Google Apps Script (`script.google.com/macros/s/.../exec`) berjalan di dalam iframe sandbox. Browser modern (Chrome, Safari, Edge) melarang Service Worker berjalan di dalam iframe demi keamanan.
- **Solusi Bersih & Elegan (Arsitektur Hybrid):**
  Frontend PANORAMA di-host gratis di **Vercel** (domain HTTPS milik Anda, misal: `panorama-ops.vercel.app`), sedangkan database dan backend tetap 100% berjalan di **Google Sheets & Google Apps Script**.
- **Hasil:**
  - Pengguna bisa klik tombol **"Tambahkan ke Layar Utama" (Install App)** di HP Android & iPhone.
  - Saat ada tugas baru, insiden darurat, atau pengingat jadwal, **notifikasi push bergetar dan muncul di status bar atas HP dan layar kunci** meskipun aplikasi sedang tidak dibuka.

---

## 2. CARA MENDAPATKAN ONESIGNAL APP ID & REST API KEY (GRATIS)
1. Buka situs resmi: **[https://onesignal.com](https://onesignal.com)** dan daftar akun gratis (*Free Plan* mencakup hingga 10.000 subscriber).
2. Klik **New App/Website**:
   - Beri nama aplikasi: `PANORAMA Operations`
   - Pilih platform: **Web Push**
   - Klik **Next: Configure Platform**.
3. Pada halaman konfigurasi Web:
   - Pilih **Typical Site**.
   - Masukkan Site Name: `PANORAMA Operations Portal`
   - Masukkan Site URL: URL Vercel Anda (misal: `https://panorama-ops.vercel.app` atau URL web app Anda).
   - Auto Resubscribe: Aktifkan (*ON*).
   - Klik **Save**.
4. Ambil Kredensial:
   - Buka menu **Settings > Keys & IDs**.
   - Salin **OneSignal App ID** (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
   - Salin **REST API Key** (format: `os_v2_app_xxxxxxxx...`).
5. Tempelkan kedua kunci tersebut ke portal PANORAMA:
   - Buka menu **Pengaturan > Parameter Nasional**.
   - Masukkan di kolom **OneSignal App ID** dan **OneSignal REST API Key**.
   - Klik **Simpan Parameter Nasional**.

---

## 3. CARA 1-KLIK DEPLOY KE VERCEL (GRATIS, BERSIH & CEPAT)
Kami telah menyiapkan folder khusus siap pakai bernama **`PANORAMA_VERCEL`** yang hanya berisi aset web statis murni tanpa berkas skrip backend atau dokumentasi.

### Cara Drag & Drop (Paling Instan - Tanpa Perlu GitHub):
1. Buka dashboard **[https://vercel.com](https://vercel.com)**.
2. Klik tombol **`+ Create New`** (atau klik tautan biru **`folder`**).
3. Pilih langsung folder:
   📂 **`c:\Users\Lenovo\.gemini\antigravity-ide\DASHBOARD HEAD OPS\PANORAMA_VERCEL`**
4. Klik tombol **Deploy**!
5. Dalam 10 detik, link resmi Anda (misal `https://dashboard-head-ops.vercel.app`) langsung aktif dengan desain Donezo hijau emerald, PWA, dan Push Notification 100% sempurna!

---

## 4. CARA AKTIFKAN NOTIFIKASI DI HP PENGGUNA (ANDROID & IPHONE)
1. Buka link web app PANORAMA di browser HP Anda (Chrome untuk Android, Safari untuk iPhone).
2. Tekan menu browser lalu pilih **"Tambahkan ke Layar Utama" / "Install Aplikasi"**.
3. Buka ikon aplikasi PANORAMA dari layar utama HP Anda.
4. Masuk ke menu **Pengaturan > Profil Saya**:
   - Pada kartu **Notifikasi Status Bar HP**, klik **🔔 Aktifkan di HP Ini**.
   - Pilih **"Izinkan" (Allow)** pada jendela konfirmasi browser.
   - Status akan langsung berubah menjadi hijau: **`✅ Notifikasi HP Aktif`**.
5. Klik **🧪 Uji Notifikasi ke HP** untuk melihat langsung banner pop-up berbunyi di status bar HP Anda!

---

## 5. STANDAR MUTLAK DEPLOYMENT GOOGLE APPS SCRIPT (BACKEND PRODUKSI)
> ⚠️ **PERATURAN EMAS:** Dilarang keras membuat link baru atau membuat Deployment ID baru! URL backend harus tetap abadi selamanya agar koneksi Vercel dan seluruh browser pengguna tidak pernah putus.

- **Deployment ID Resmi**: `AKfycbxBWPIPTRvcQ6LbFRzKTWAxRk8UX23Kank1gQXdh6Z9JwB7HpKX5X2BpOaa-Nxdmsgk4g` (Label: `ver 23.0`)
- **URL Resmi**: `https://script.google.com/macros/s/AKfycbxBWPIPTRvcQ6LbFRzKTWAxRk8UX23Kank1gQXdh6Z9JwB7HpKX5X2BpOaa-Nxdmsgk4g/exec`

### Cara Deploy Otomatis (1 Langkah Aman):
Jalankan script otomatis yang sudah disiapkan:
```bash
node scratch/safe_deploy_gas.js "Catatan update"
```
Script ini secara otomatis:
1. Mem-build bundle HTML terbaru (`index.html`, `app.html`, `PANORAMA_VERCEL/index.html`).
2. Melakukan push file ke Google Apps Script via Clasp.
3. Membuat nomor versi baru.
4. Mere-deploy ke ID produksi `AKfycbxBWPIPTRvcQ6LbFRzKTWAxRk8UX23Kank1gQXdh6Z9JwB7HpKX5X2BpOaa-Nxdmsgk4g` dengan flag `-i` (URL tidak pernah berubah).
5. Memverifikasi kelola deployment tetap bersih.

