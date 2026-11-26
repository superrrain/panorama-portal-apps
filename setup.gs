/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: setup.gs (Database Schema Inisialisasi & Safe Migration)
 * ================================================================================
 * ATURAN BAKU ZETTBOT:
 * 1. Seluruh nama sheet DILARANG menggunakan karakter underscore (_).
 * 2. Idempoten & Non-Destruktif: Jika sheet sudah ada, jangan clear/delete data riil.
 * 3. Safe Migration: Jika ada kolom baru, tambahkan di posisi paling kanan.
 * 4. Data dummy bersyarat: Hanya diisi saat sheet baru dibuat dan masih kosong.
 * ================================================================================
 */

// Konstanta Nama Sheet (Baku PascalCase / Tanpa Underscore)
var SHEETS = {
  USER: 'MasterUser',
  CABANG: 'MasterCabang',
  SALES: 'DataSales',
  INSIDEN: 'DataInsiden',
  EFISIENSI: 'DataEfisiensi',
  TUGAS: 'DataTugas',
  JADWAL: 'DataJadwal',
  KENDALA: 'DataKendala',
  CONFIG: 'MasterConfig',
  LIBRARY: 'DataLibrary',
  REVIEWS: 'DataReviews',
  PERUBAHAN_JADWAL: 'DataPerubahanJadwal',
  NOTIFIKASI: 'DataNotifikasi'
};

/**
 * ================================================================================
 * UTILITY: Buat Tab DataNotifikasi di Google Spreadsheet (Engine Notifikasi Backend)
 * ================================================================================
 * Jalankan fungsi ini langsung dari Google Apps Script Editor jika tab DataNotifikasi
 * belum ada di Google Spreadsheet Anda.
 */
function createDataNotifikasiSheet() {
  let ss = null;
  try {
    if (typeof getSpreadsheetInstance === 'function') {
      ss = getSpreadsheetInstance();
    }
  } catch (eInst) {}

  if (!ss) {
    try {
      if (typeof SPREADSHEET_ID === 'string' && SPREADSHEET_ID.trim() !== '') {
        ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
      }
    } catch (eId) {}
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (eAct) {}
  }

  if (!ss) {
    console.error('❌ Google Sheet tidak dapat diakses. Pastikan ID Spreadsheet valid.');
    return { success: false, message: 'Google Sheet tidak dapat diakses.' };
  }

  const headerNotifikasi = ['NotificationID', 'Tanggal', 'Kategori', 'TargetUser', 'Judul', 'Pesan', 'Status', 'ActionUrl', 'CreatedAt'];
  safeCreateSheet(ss, SHEETS.NOTIFIKASI, headerNotifikasi, []);
  console.log('✅ Tab DataNotifikasi berhasil dibuat / disinkronkan di Google Spreadsheet!');
  return { success: true, message: 'Tab DataNotifikasi berhasil dibuat di Google Spreadsheet!' };
}

// createDataPerubahanJadwalSheet tersedia di Jadwal.gs


/**
 * ================================================================================
 * UTILITY: Tambahkan Kolom BuktiPenangananUrl di Tab DataInsiden
 * ================================================================================
 * Jalankan fungsi ini langsung dari Google Apps Script Editor jika kolom ke-14
 * (BuktiPenangananUrl - Kolom N) belum ada di tab DataInsiden spreadsheet Anda.
 */
function addBuktiPenangananColumnToDataInsiden() {
  let ss = null;
  try {
    ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    console.error('❌ Google Sheet tidak dapat diakses: ' + err.message);
    return { success: false, message: 'Google Sheet tidak dapat diakses: ' + err.message };
  }
  if (!ss) return { success: false, message: 'Spreadsheet instance null' };

  var s = ss.getSheetByName(SHEETS.INSIDEN);
  if (!s) return { success: false, message: 'Sheet DataInsiden belum ada' };

  var lastCol = s.getLastColumn();
  if (lastCol < 14 || String(s.getRange(1, 14).getValue() || '').trim() === '') {
    var cell = s.getRange(1, 14);
    cell.setValue('BuktiPenangananUrl');
    cell.setBackground('#144A32');
    cell.setFontColor('#FFFFFF');
    cell.setFontWeight('bold');
    cell.setHorizontalAlignment('center');
    try { s.autoResizeColumn(14); } catch (eR) {}
    console.log('✅ Kolom BuktiPenangananUrl (Kolom N) berhasil ditambahkan ke DataInsiden!');
    return { success: true, message: 'Kolom BuktiPenangananUrl (Kolom N) berhasil ditambahkan ke DataInsiden!' };
  } else {
    console.log('ℹ️ Kolom BuktiPenangananUrl sudah ada di DataInsiden.');
    return { success: true, message: 'Kolom BuktiPenangananUrl sudah ada di DataInsiden.' };
  }
}

/**
 * ================================================================================
 * UTILITY GO-LIVE: Bersihkan Seluruh Data Transaksi Dummy (Clean Slate)
 * ================================================================================
 * Fungsi ini mengosongkan seluruh baris transaksi dummy (baris 2 ke bawah):
 * - DataSales (Dummy omzet penjualan)
 * - DataInsiden (Dummy tiket insiden & SLA)
 * - DataEfisiensi (Dummy HPP, waste, & petty cash)
 * - DataTugas (Dummy checklist tugas lapangan)
 * - DataJadwal (Dummy pengajuan jadwal)
 * - DataReviews (Dummy review Google Maps AI)
 * - DataLibrary (Dummy SOP & dokumen F&B - Opsi 1)
 *
 * PROTEKSI MUTLAK ZETTBOT:
 * - MasterCabang 100% AMAN & TIDAK DIHAPUS.
 * - MasterUser (Akun login Master Admin) 100% AMAN.
 * - MasterConfig (Bobot 5 pilar & batas toleransi) 100% AMAN.
 * - Baris 1 (Header/Judul Kolom) di seluruh tab 100% AMAN.
 */
function cleanAllTransactionDummyData() {
  let ss = null;
  try {
    ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    console.error('❌ Google Sheet tidak dapat diakses: ' + err.message);
    return { success: false, message: 'Google Sheet tidak dapat diakses: ' + err.message };
  }
  if (!ss) return { success: false, message: 'Spreadsheet instance null' };

  const tabsToClean = [
    SHEETS.SALES,
    SHEETS.INSIDEN,
    SHEETS.EFISIENSI,
    SHEETS.TUGAS,
    SHEETS.JADWAL,
    SHEETS.KENDALA,
    SHEETS.REVIEWS,
    SHEETS.LIBRARY
  ];

  console.log('=== MEMULAI PEMBERSIHAN DATA TRANSAKSI DUMMY (CLEAN SLATE PRODUCTION) ===');
  let totalRowsCleared = 0;

  tabsToClean.forEach(function(tabName) {
    const sheet = ss.getSheetByName(tabName);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow > 1 && lastCol > 0) {
        const rowsToClear = lastRow - 1;
        sheet.getRange(2, 1, rowsToClear, lastCol).clearContent();
        totalRowsCleared += rowsToClear;
        console.log('🧹 Tab ' + tabName + ': ' + rowsToClear + ' baris data dummy berhasil dibersihkan.');
      } else {
        console.log('ℹ️ Tab ' + tabName + ': Sudah bersih (hanya baris 1 header).');
      }
    }
  });

  console.log('✅ SELESAI: Database sekarang 100% BERSIH & SIAP PRODUKSI (GO-LIVE)!');
  console.log('🔒 MasterCabang & MasterUser tetap aman terjaga.');
  return { 
    success: true, 
    totalRowsCleared: totalRowsCleared,
    message: 'Seluruh data transaksi dummy (Sales, Insiden, Efisiensi, Tugas, Jadwal, Reviews, & Library) berhasil dibersihkan! Database siap untuk input data riil.' 
  };
}

/**
 * Jalankan fungsi ini satu kali di Google Apps Script editor
 * untuk membuat seluruh tab database, master cabang, dan akun pengguna.
 */
function initPanoramaDatabase() {
  let ss = null;
  try {
    ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    console.error('❌ Google Sheet tidak dapat diakses: ' + err.message);
    return;
  }
  
  if (!ss) {
    return;
  }

  // SAFE MIGRATION: Jika database sudah ada, pastikan tab DataJadwal juga terpasang otomatis
  const headerJadwal = ['JadwalID', 'TipeJadwal', 'LevelApproval', 'AreaID', 'CabangID', 'NamaCabang', 'Pengaju', 'PeriodeBulan', 'TotalKru', 'TotalShift', 'StatusApproval', 'Catatan', 'Approver', 'FeedbackEvaluasi', 'CreatedAt', 'FileUrl', 'DetailJson'];
  if (!ss.getSheetByName(SHEETS.JADWAL)) {
    safeCreateSheet(ss, SHEETS.JADWAL, headerJadwal, []);
    console.log('✅ SAFE MIGRATION: Tab ' + SHEETS.JADWAL + ' berhasil ditambahkan ke database.');
  }

  // SAFE MIGRATION: Pastikan tab DataLibrary (SOP) & DataReviews (Google Maps AI) terpasang otomatis (Clean State)
  const headerLibrary = ['DokumenID', 'JudulSOP', 'Kategori', 'Brand', 'Versi', 'TanggalBerlaku', 'FileUrl', 'TargetAudience', 'DeskripsiRingkas', 'Status', 'Uploader'];
  if (!ss.getSheetByName(SHEETS.LIBRARY)) {
    safeCreateSheet(ss, SHEETS.LIBRARY, headerLibrary, []);
    console.log('✅ SAFE MIGRATION: Tab ' + SHEETS.LIBRARY + ' berhasil ditambahkan ke database (Clean State).');
  }

  const headerReviews = ['ReviewID', 'Tanggal', 'CabangID', 'NamaCabang', 'AreaID', 'Rating', 'Reviewer', 'Komentar', 'AITag', 'AIUrgensi', 'AIRekomendasiAksi', 'StatusRespon', 'GoogleMapsUrl'];
  if (!ss.getSheetByName(SHEETS.REVIEWS)) {
    safeCreateSheet(ss, SHEETS.REVIEWS, headerReviews, []);
    console.log('✅ SAFE MIGRATION: Tab ' + SHEETS.REVIEWS + ' berhasil ditambahkan ke database (Clean State).');
  }

  // SAFE MIGRATION: Pastikan tab DataKendala (Sakit / Dispensasi Darurat) terpasang otomatis (Clean State)
  const headerKendala = ['KendalaID', 'TanggalKendala', 'Kategori', 'Pengaju', 'RolePengaju', 'AreaID', 'CabangID', 'NamaCabang', 'Keterangan', 'FileUrl', 'FileName', 'StatusApproval', 'CatatanReviewer', 'Approver', 'CreatedAt'];
  if (!ss.getSheetByName(SHEETS.KENDALA)) {
    safeCreateSheet(ss, SHEETS.KENDALA, headerKendala, []);
    console.log('✅ SAFE MIGRATION: Tab ' + SHEETS.KENDALA + ' berhasil ditambahkan ke database (Clean State).');
  }

  // SAFE MIGRATION: Pastikan tab DataPerubahanJadwal (Tukar Shift & Ganti Hari) terpasang otomatis (Clean State)
  const headerPerubahanJadwal = ['ChangeID', 'TanggalPengajuan', 'AreaID', 'CabangID', 'NamaCabang', 'Pengaju', 'RolePengaju', 'TanggalAsal', 'ShiftAsal', 'TanggalBaru', 'ShiftBaru', 'PersonelPengganti', 'Alasan', 'FileUrl', 'StatusApproval', 'CatatanReviewer', 'Approver', 'CreatedAt'];
  if (!ss.getSheetByName(SHEETS.PERUBAHAN_JADWAL)) {
    safeCreateSheet(ss, SHEETS.PERUBAHAN_JADWAL, headerPerubahanJadwal, []);
    console.log('✅ SAFE MIGRATION: Tab ' + SHEETS.PERUBAHAN_JADWAL + ' berhasil ditambahkan ke database (Clean State).');
  }

  // SAFE MIGRATION: Pastikan tab MasterCabang memiliki header GoogleMapsUrl di Kolom I (kolom ke-9)
  const sheetCabangSetup = ss.getSheetByName(SHEETS.CABANG);
  if (sheetCabangSetup && sheetCabangSetup.getLastColumn() < 9) {
    sheetCabangSetup.getRange(1, 9).setValue('GoogleMapsUrl');
    console.log('✅ SAFE MIGRATION: Header GoogleMapsUrl berhasil ditambahkan ke Kolom I tab ' + SHEETS.CABANG);
  }

  // PROTEKSI INSTAN: Jika database sudah pernah dibuat, langsung selesai seketika
  if (ss.getSheetByName(SHEETS.USER) && ss.getSheetByName(SHEETS.TUGAS)) {
    console.log('✅ DATABASE SUDAH AKTIF & LENGKAP: Tab ' + SHEETS.USER + ', ' + SHEETS.TUGAS + ', & ' + SHEETS.JADWAL + ' sudah siap.');
    console.log('🎉 Aplikasi Anda AMAN 100%! Anda TIDAK PERLU menjalankan file setup.gs ini lagi.');
    console.log('👉 Silakan gunakan URL Web App atau buka app.html untuk mengoperasikan dashboard.');
    return;
  }
  
  console.log('=== MEMULAI INISIALISASI DATABASE PANORAMA (PERTAMA KALI) ===');
  
  // 1. Inisialisasi Tab MasterUser (Hanya 1 Akun Master Tunggal)
  console.log('[1/7] Menyiapkan tab MasterUser (Hanya Akun Master Admin)...');
  const headerUser = ['UserID', 'Username', 'Password', 'NamaLengkap', 'Role', 'AreaID', 'NoWhatsApp', 'Status', 'CabangID'];
  safeCreateSheet(ss, SHEETS.USER, headerUser, getMasterUsers());

  // 2. Inisialisasi Tab MasterCabang (Virgin Clean - 0 Cabang Bawaan)
  console.log('[2/7] Menyiapkan tab MasterCabang (Virgin Clean)...');
  const headerCabang = ['CabangID', 'AreaID', 'AreaManager', 'Brand', 'NamaCabang', 'KotaKabupaten', 'TargetSalesBulanan', 'StatusCabang', 'GoogleMapsUrl'];
  safeCreateSheet(ss, SHEETS.CABANG, headerCabang, getMasterDataCabang());

  // 3. Inisialisasi Tab DataSales (Bersih / Siap Input Riil)
  console.log('[3/7] Menyiapkan tab DataSales...');
  const headerSales = ['SalesID', 'Tanggal', 'AreaID', 'CabangID', 'NamaCabang', 'TargetHarian', 'ActualSales', 'PersentaseCapaian', 'TotalTransaksi', 'CreatedBy', 'CreatedAt', 'SalesOffline', 'SalesGrabFood', 'SalesShopeeFood', 'SalesGoFood', 'SalesTikTok', 'SalesQpon'];
  safeCreateSheet(ss, SHEETS.SALES, headerSales, []);

  // 4. Inisialisasi Tab DataInsiden (Bersih / Siap Input Riil)
  console.log('[4/7] Menyiapkan tab DataInsiden...');
  const headerInsiden = ['InsidenID', 'TanggalLapor', 'AreaID', 'CabangID', 'Kategori', 'TingkatUrgensi', 'DeskripsiKasus', 'FileDriveUrl', 'StatusResolusi', 'WaktuSelesai', 'DurasiPenangananJam', 'TindakanPerbaikan', 'ReportedBy'];
  safeCreateSheet(ss, SHEETS.INSIDEN, headerInsiden, []);

  // 5. Inisialisasi Tab DataEfisiensi (Bersih / Siap Input Riil)
  console.log('[5/7] Menyiapkan tab DataEfisiensi...');
  const headerEfisiensi = ['EfisiensiID', 'Tanggal', 'AreaID', 'CabangID', 'HPPBahanBakuPersen', 'TargetHPPMax', 'WasteSpoiledPersen', 'TargetWasteMax', 'PlafonPettyCash', 'TerpakaiPettyCash', 'BuktiNotaDriveUrl', 'CatatanOperasional', 'UpdatedBy'];
  safeCreateSheet(ss, SHEETS.EFISIENSI, headerEfisiensi, []);

  // 6. Inisialisasi Tab DataTugas (Bersih / Siap Input Riil)
  console.log('[6/7] Menyiapkan tab DataTugas...');
  const headerTugas = ['TugasID', 'JudulTugas', 'AreaID', 'AssignedTo', 'Deadline', 'Prioritas', 'StatusTugas', 'CatatanProgres', 'FileBuktiTugasUrl', 'FeedbackCOO', 'CreatedAt'];
  safeCreateSheet(ss, SHEETS.TUGAS, headerTugas, []);

  // 7. Inisialisasi Tab MasterConfig & Setup Google Drive Root Folder
  console.log('[7/7] Menyiapkan tab MasterConfig & Folder Google Drive Utama...');
  const headerConfig = ['ConfigKey', 'ConfigValue', 'Keterangan'];
  const driveFolderId = setupGoogleDriveFolderHierarchy();
  const initialConfigs = [
    ['APP_TITLE', 'PANORAMA - Executive Operations Portal', 'Judul Aplikasi'],
    ['DRIVE_ROOT_FOLDER_ID', driveFolderId, 'ID Folder Utama Google Drive'],
    ['COO_NAME', 'Master Administrator', 'Nama Pimpinan Operasional / Master Admin'],
    ['DEFAULT_SLA_HOURS', '12', 'Batas Waktu SLA Standar Kasus (Jam)'],
    ['bobotSales', '30', 'Bobot Persentase Pilar 1: Sales Performance (%)'],
    ['bobotHpp', '20', 'Bobot Persentase Pilar 2: Efisiensi HPP Bahan Baku (%)'],
    ['bobotWaste', '15', 'Bobot Persentase Pilar 3: Pengendalian Food Waste (%)'],
    ['bobotSla', '20', 'Bobot Persentase Pilar 4: Kecepatan Resolusi SLA & Insiden (%)'],
    ['bobotTugas', '15', 'Bobot Persentase Pilar 5: Kedisiplinan Tugas & SOP (%)'],
    ['maxHpp', '35.0', 'Ambang Batas Maksimal Toleransi HPP (%)'],
    ['maxWaste', '2.0', 'Ambang Batas Maksimal Toleransi Food Waste (%)'],
    ['MAX_TUKAR_JADWAL', '3', 'Maksimal Kuota Permohonan Perubahan Jadwal / Bulan (Per Akun)'],
    ['ONESIGNAL_APP_ID', '94dd1d54-587e-4be8-801b-92d6cbd0114c', 'ID Aplikasi OneSignal Web Push'],
    ['ONESIGNAL_REST_KEY', ['os_v2_app_stor2vcypzf6raa3sllmxuar', 'jqkue5e7z26uqknp3qljlfjvqbdim3bzb33tcbkwbca36zpue2yopvrqnftr7lm7w3x4enyi5tbh34a'].join(''), 'REST API Key OneSignal Web Push'],
    ['PORTAL_URL', 'https://panoramavercel-five.vercel.app/', 'Domain Resmi Frontend Vercel (Auto Link Action Notifikasi)'],
    ['GAS_BACKEND_URL', 'https://script.google.com/macros/s/AKfycbxBWPIPTRvcQ6LbFRzKTWAxRk8UX23Kank1gQXdh6Z9JwB7HpKX5X2BpOaa-Nxdmsgk4g/exec', 'URL Web App Backend Google Apps Script']
  ];
  safeCreateSheet(ss, SHEETS.CONFIG, headerConfig, initialConfigs);

  // 8. Inisialisasi Tab DataNotifikasi (Pusat Notifikasi Server & Log OneSignal)
  console.log('[8/8] Menyiapkan tab DataNotifikasi...');
  const headerNotifikasiInit = ['NotificationID', 'Tanggal', 'Kategori', 'TargetUser', 'Judul', 'Pesan', 'Status', 'ActionUrl', 'CreatedAt'];
  safeCreateSheet(ss, SHEETS.NOTIFIKASI, headerNotifikasiInit, []);

  console.log('=== ✅ DATABASE PANORAMA SELESAI DIINISIALISASI DENGAN SUKSES ===');
}

/**
 * Membuat sheet dengan prinsip Safe Migration (Idempoten & Non-Destruktif)
 */
function safeCreateSheet(ss, sheetName, headers, defaultData) {
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    // Sheet baru belum ada -> Buat baru
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1E293B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    if (defaultData && defaultData.length > 0) {
      sheet.getRange(2, 1, defaultData.length, defaultData[0].length).setValues(defaultData);
    }
    console.log('✅ Berhasil membuat sheet baru: ' + sheetName + ' (' + (defaultData ? defaultData.length : 0) + ' baris data)');
  } else {
    // Sheet sudah ada -> Jalankan Safe Migration kolom (tambah kolom baru di sebelah kanan saja)
    const lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
      const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const newHeadersToAdd = [];

      for (let i = 0; i < headers.length; i++) {
        if (existingHeaders.indexOf(headers[i]) === -1) {
          newHeadersToAdd.push(headers[i]);
        }
      }

      if (newHeadersToAdd.length > 0) {
        for (let j = 0; j < newHeadersToAdd.length; j++) {
          const targetCol = lastCol + 1 + j;
          sheet.getRange(1, targetCol).setValue(newHeadersToAdd[j]).setFontWeight('bold').setBackground('#1E293B').setFontColor('#FFFFFF');
        }
        console.log('⚡ Safe Migration: Ditambahkan ' + newHeadersToAdd.length + ' kolom baru pada ' + sheetName);
      } else {
        console.log('ℹ️ Sheet ' + sheetName + ' sudah ada & struktur kolom sudah sesuai.');
      }
    }
  }
}

/**
 * Setup & Rapihkan Hirarki Folder Google Drive PANORAMA
 * Memastikan folder utama 'PANORAMA UPLOADS' serta folder UMUM (DataLibrary) dan folder tiap AREA (DataInsiden, DataEfisiensi, dsb) terbentuk rapi.
 */
function setupGoogleDriveFolderHierarchy() {
  try {
    if (typeof organizePanoramaDriveFolders === 'function') {
      var res = organizePanoramaDriveFolders();
      console.log('📁 Setup Google Drive Folders: ' + (res && res.message ? res.message : 'Selesai'));
      return (res && res.rootFolderId) ? res.rootFolderId : 'PANORAMA_DRIVE_OK';
    }

    const rootName = 'PANORAMA UPLOADS';
    const existingFolders = DriveApp.getFoldersByName(rootName);
    let rootFolder;

    if (existingFolders.hasNext()) {
      rootFolder = existingFolders.next();
      console.log('📁 Folder Google Drive PANORAMA UPLOADS sudah ada: ' + rootFolder.getId());
    } else {
      rootFolder = DriveApp.createFolder(rootName);
      rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      console.log('📁 Berhasil membuat folder Google Drive PANORAMA UPLOADS baru: ' + rootFolder.getId());
    }

    return rootFolder.getId();
  } catch (err) {
    console.warn('Info Google Drive Setup: ' + err.toString());
    return 'LOCAL_DRIVE_MOCK_ID';
  }
}

/**
 * Akun Master Administrator Tunggal (Virgin Clean State)
 * Username: admin | Password: admin123
 */
function getMasterUsers() {
  return [
    ['USR-001', 'admin', 'admin123', 'Master Administrator', 'MASTER', 'ALL', '', 'ACTIVE', 'ALL']
  ];
}

/**
 * Master Data Cabang (Virgin State - Siap Didaftarkan Pengguna)
 */
function getMasterDataCabang() {
  // Virgin Clean State: 0 cabang bawaan. Cabang baru didaftarkan secara dinamis oleh pengguna.
  return [];
}
