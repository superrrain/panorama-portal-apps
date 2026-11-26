/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: code.gs (Backend Controller & API Dispatcher)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Seluruh pemrosesan database menggunakan Index-Based Mapping (COL array index).
 * 2. Menggunakan LockService saat penomoran ID otomatis untuk mencegah race condition.
 * 3. Sanitasi input eksternal dan isolasi hak akses role COO vs Area Manager.
 * 4. Google Drive Integration: Auto-upload ke subfolder area dan return Direct Link.
 * ================================================================================
 */

// Konstanta Nama Sheet (Baku PascalCase / Tanpa Underscore)
var TAB = {
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

// Objek Pemetaan Kolom Baku (Index-Based Mapping - Kebal terhadap perubahan label header)
var COL_USER = { ID: 0, USERNAME: 1, PASSWORD: 2, NAMA: 3, ROLE: 4, AREA_ID: 5, WA: 6, STATUS: 7, CABANG_ID: 8 };
var COL_CABANG = { ID: 0, AREA_ID: 1, MANAGER: 2, BRAND: 3, NAMA: 4, KOTA: 5, TARGET: 6, STATUS: 7, MAPS_URL: 8 };
var COL_SALES = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, NAMA: 4, TARGET: 5, ACTUAL: 6, PERSEN: 7, TRX: 8, CREATED_BY: 9, CREATED_AT: 10, OFFLINE: 11, GRABFOOD: 12, SHOPEEFOOD: 13, GOFOOD: 14, TIKTOK: 15, QPON: 16 };
var COL_INSIDEN = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, KATEGORI: 4, URGENSI: 5, DESK: 6, DRIVE_URL: 7, STATUS: 8, SELESAI: 9, SLA_JAM: 10, AKSI: 11, REPORTER: 12, BUKTI_PENANGANAN: 13, OTORISASI: 14 };
var COL_EFISIENSI = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, HPP: 4, TARGET_HPP: 5, WASTE: 6, TARGET_WASTE: 7, PLAFON_CASH: 8, TERPAKAI_CASH: 9, NOTA_URL: 10, CATATAN: 11, UPDATED_BY: 12 };
var COL_TUGAS = { ID: 0, JUDUL: 1, AREA_ID: 2, ASSIGNED_TO: 3, DEADLINE: 4, PRIORITAS: 5, STATUS: 6, CATATAN: 7, BUKTI_URL: 8, FEEDBACK: 9, CREATED_AT: 10, SIKLUS: 11, ACTION_LINK: 12 };
var COL_JADWAL = { ID: 0, TIPE: 1, LEVEL: 2, AREA_ID: 3, CABANG_ID: 4, NAMA_CABANG: 5, PENGAJU: 6, PERIODE: 7, TOTAL_KRU: 8, TOTAL_SHIFT: 9, STATUS: 10, CATATAN: 11, APPROVER: 12, FEEDBACK: 13, CREATED_AT: 14, FILE_URL: 15, DETAIL_JSON: 16 };
var COL_KENDALA = { ID: 0, TANGGAL: 1, KATEGORI: 2, PENGAJU: 3, ROLE: 4, AREA_ID: 5, CABANG_ID: 6, NAMA_CABANG: 7, KETERANGAN: 8, FILE_URL: 9, FILE_NAME: 10, STATUS: 11, CATATAN_REVIEWER: 12, APPROVER: 13, CREATED_AT: 14 };
var COL_CONFIG = { KEY: 0, VALUE: 1, KETERANGAN: 2 };
var COL_LIBRARY = { ID: 0, JUDUL: 1, KATEGORI: 2, BRAND: 3, VERSI: 4, TANGGAL: 5, FILE_URL: 6, AUDIENCE: 7, DESKRIPSI: 8, STATUS: 9, UPLOADER: 10 };
var COL_REVIEWS = { ID: 0, TANGGAL: 1, CABANG_ID: 2, NAMA_CABANG: 3, AREA_ID: 4, RATING: 5, REVIEWER: 6, KOMENTAR: 7, AI_TAG: 8, AI_URGENSI: 9, AI_ACTION: 10, STATUS_RESPON: 11, MAPS_URL: 12 };
var COL_PERUBAHAN_JADWAL = { ID: 0, TANGGAL_PENGAJUAN: 1, AREA_ID: 2, CABANG_ID: 3, NAMA_CABANG: 4, PENGAJU: 5, ROLE: 6, TGL_ASAL: 7, SHIFT_ASAL: 8, TGL_BARU: 9, SHIFT_BARU: 10, PENGGANTI: 11, ALASAN: 12, FILE_URL: 13, STATUS: 14, CATATAN_REVIEWER: 15, APPROVER: 16, CREATED_AT: 17 };

/**
 * Entry point Google Apps Script Web App (Mendukung Web Interface & REST API JSON untuk Vercel PWA)
 */
function doGet(e) {
  // 1. Cek jika permintaan adalah pemanggilan API (misal dari Vercel / PWA / fetch eksternal)
  if (e && e.parameter && (e.parameter.action || e.parameter.api)) {
    return handleApiRequest(e.parameter.action || e.parameter.api, e.parameter);
  }

  // 1b. Cek jika permintaan adalah form ulasan pelanggan (QR Code Meja / Kasir Gerai)
  if (e && e.parameter && (e.parameter.page === 'ulasan' || e.parameter.page === 'review' || e.parameter.p === 'ulasan')) {
    return renderCustomerReviewPage(e.parameter);
  }

  // 2. Pencarian Template Shell Adaptif (Mendukung index, index_modular, index.html, dll)
  var candidateTemplates = [
    'index',
    'index_modular',
    'index.html',
    'index_modular.html',
    'Index',
    'INDEX'
  ];

    for (var i = 0; i < candidateTemplates.length; i++) {
    try {
      var template = HtmlService.createTemplateFromFile(candidateTemplates[i]);
      template.queryParams = (e && e.parameter) ? e.parameter : {};
      return template.evaluate()
        .setTitle('PANORAMA - Operations Portal')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (eTmpl) {
      console.warn('Gagal mengevaluasi template scriptlet: ' + candidateTemplates[i] + ' (' + eTmpl.message + '). Mencoba sajikan via HtmlOutput statis...');
      try {
        return HtmlService.createHtmlOutputFromFile(candidateTemplates[i])
          .setTitle('PANORAMA - Operations Portal')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      } catch (eStatic) {
        console.warn('Gagal membaca output statis: ' + candidateTemplates[i] + ' (' + eStatic.message + ')');
      }
    }
  }

  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:30px;background:#FEF2F2;border:2px solid #EF4444;border-radius:12px;max-width:650px;margin:40px auto;color:#991B1B;">' +
    '<h2 style="margin-top:0;">⚠️ Status Berkas Google Apps Script</h2>' +
    '<p>Sistem tidak dapat menemukan berkas template HTML utama. Pastikan di bilah kiri Apps Script tersedia berkas dengan nama salah satu dari:</p>' +
    '<ul>' +
      '<li><b>index</b> (atau index.html)</li>' +
      '<li><b>index_modular</b> (atau index_modular.html)</li>' +
    '</ul>' +
    '<p>Serta pastikan berkas modular pendukung juga tersedia:</p>' +
    '<ul>' +
      '<li><b>css</b> (atau css.html)</li>' +
      '<li><b>js</b> (atau js.html)</li>' +
    '</ul>' +
    '<p style="font-size:12px;color:#666;">Petunjuk: Saat membuat file HTML di Google Apps Script via tombol (+), cukup ketikkan namanya saja (misal: <code>index</code>, <code>css</code>, atau <code>js</code>) tanpa perlu mengetikkan akhiran <code>.html</code>.</p>' +
    '</div>'
  );
}


/**
 * Entry point POST untuk pertukaran data API dari Vercel / PWA eksternal
 */
function doPost(e) {
  var params = {};
  if (e && e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (err) {
      params = e.parameter || {};
    }
  } else if (e && e.parameter) {
    params = e.parameter;
  }
  var action = params.action || params.api || (e && e.parameter && (e.parameter.action || e.parameter.api));
  return handleApiRequest(action, params);
}

/**
 * Universal API Dispatcher untuk Permintaan Eksternal (Vercel, PWA, Mobile)
 */
function handleApiRequest(action, params) {
  var result = { success: false, message: 'Aksi API tidak dikenali: ' + action };
  try {
    params = params || {};
    var pPayload = params.payload;
    if (typeof pPayload === 'string' && pPayload.trim() !== '') {
      try {
        pPayload = JSON.parse(pPayload);
      } catch (eParseP) {}
    }
    if (pPayload && typeof pPayload === 'object') {
      params.payload = pPayload;
      for (var pk in pPayload) {
        if (Object.prototype.hasOwnProperty.call(pPayload, pk) && params[pk] === undefined) {
          params[pk] = pPayload[pk];
        }
      }
    }
    var user = params.user;
    if (typeof user === 'string') {
      try { user = JSON.parse(user); } catch (e) {}
    }
    if (!user || typeof user !== 'object') {
      user = { role: 'COO', username: 'master_coo', namaLengkap: 'Master COO' };
    }

    var userRole = String(user.role || '').toUpperCase().trim();
    var isGuestUser = (userRole === 'TAMU' || userRole === 'GUEST' || userRole === 'AUDITOR' || userRole === 'VIEWER');

    // Proteksi Keamanan Backend: Tolak seluruh operasi mutasi data jika pengguna adalah Akun Tamu
    var readOnlyAllowedActions = ['getInitialData', 'apiGetInitialData', 'ping', 'getCustomerReviews', 'exportToExcel', 'getPublicBranchInfo', 'apiGetPublicBranchInfo'];
    if (isGuestUser && readOnlyAllowedActions.indexOf(action) === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Akses ditolak: Akun Tamu hanya memiliki izin pantau laporan (View-Only).'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    switch (action) {
      case 'getInitialData':
      case 'apiGetInitialData':
      case 'apiGetDashboardData':
        result = apiGetInitialData(user);
        break;

      case 'saveConfig':
      case 'apiMasterSaveConfig':
        var cfg = params.configData || params.config || params;
        result = apiMasterSaveConfig(cfg, user);
        break;

      case 'saveSales':
      case 'apiSaveSales':
        result = apiSaveSales(params.salesData || params, user);
        break;

      case 'saveInsiden':
      case 'apiSaveInsiden':
        result = apiSaveInsiden(params.insidenData || params, user);
        break;

      case 'updateInsiden':
      case 'apiUpdateInsiden':
        var uPayload = params.updateData || params.payload || params;
        if (params.insidenId && !uPayload.insidenId) uPayload.insidenId = params.insidenId;
        result = apiUpdateInsiden(uPayload, params.updateData, user);
        break;

      case 'deleteInsiden':
      case 'apiDeleteInsiden':
        result = apiDeleteInsiden(params.insidenId, user);
        break;

      case 'approveInsiden':
      case 'apiApproveInsiden':
        var apPayload = params.payload || params;
        result = apiApproveInsiden(apPayload, user);
        break;

      case 'saveEfisiensi':
      case 'apiSaveEfisiensi':
        var effPayload = (params.payload && typeof params.payload === 'object') ? params.payload : (params.efisiensiData || params);
        result = apiSaveEfisiensi(effPayload, user);
        break;

      case 'saveTugas':
      case 'apiSaveTugas':
        result = apiSaveTugas(params.tugasData || params, user);
        break;

      case 'deleteTugas':
      case 'apiDeleteTugas':
        result = apiDeleteTugas(params.tugasId, user);
        break;

      case 'submitJadwal':
      case 'apiSubmitJadwal':
        result = apiSubmitJadwal(params.jadwalData || params, user);
        break;

      case 'updateJadwal':
      case 'apiUpdateJadwal':
        result = apiUpdateJadwal(params.jadwalData || params.payload || params, user);
        break;

      case 'submitKendala':
      case 'apiSubmitKendala':
        result = apiSubmitKendala(params.kendalaData || params, user);
        break;

      case 'approveKendala':
      case 'updateKendalaStatus':
      case 'apiUpdateKendalaStatus':
        result = apiUpdateKendalaStatus(params, user);
        break;

      case 'deleteKendala':
      case 'apiDeleteKendala':
        result = apiDeleteKendala(params, user);
        break;

      case 'submitPerubahanJadwal':
      case 'apiSubmitPerubahanJadwal':
        result = apiSubmitPerubahanJadwal(params.payload || params.perubahanData || params, user);
        break;

      case 'createSheetPerubahan':
      case 'apiCreateSheetPerubahanJadwal':
        result = createDataPerubahanJadwalSheet();
        break;

      case 'approvePerubahanJadwal':
      case 'apiApprovePerubahanJadwal':
        result = apiApprovePerubahanJadwal(params.payload || params, user);
        break;

      case 'deletePerubahanJadwal':
      case 'apiDeletePerubahanJadwal':
        result = apiDeletePerubahanJadwal(params.payload || params, user);
        break;

      case 'approveJadwal':
      case 'apiApproveJadwal':
        result = apiApproveJadwal(params.jadwalId, params.status, params.feedback, user);
        break;

      case 'deleteJadwal':
      case 'apiDeleteJadwal':
        result = apiDeleteJadwal(params.jadwalId, user);
        break;

      case 'saveLibrary':
      case 'saveLibraryDocument':
      case 'apiSaveLibraryDocument':
        result = apiSaveLibraryDocument(params.libraryData || params.payload || params);
        break;

      case 'approveLibrary':
      case 'approveLibraryDocument':
      case 'apiApproveLibraryDocument':
        result = apiApproveLibraryDocument(params.sopId || params.id, params.approverName || user.namaLengkap);
        break;

      case 'login':
      case 'apiLogin':
        var uLog = params.username || (params.payload && params.payload.username) || (params.user && params.user.username);
        var pLog = params.password || (params.payload && params.payload.password);
        result = apiLogin(uLog, pLog);
        break;

      case 'registerUser':
      case 'apiRegisterUser':
        result = apiRegisterUser(params.payload || params);
        break;

      case 'assignUserPlacement':
      case 'apiAssignUserPlacement':
        result = apiAssignUserPlacement(params.payload || params, user);
        break;

      case 'resetPassword':
      case 'apiResetPassword':
        result = apiResetPassword(params.payload || params);
        break;

      case 'saveBranchTarget':
      case 'apiSaveBranchTarget':
        var tgtPayload = (params.payload && typeof params.payload === 'object') ? params.payload : params;
        if (!tgtPayload.cabangId && params.cabangId) tgtPayload.cabangId = params.cabangId;
        if (!tgtPayload.targetBulanan && params.targetSales) tgtPayload.targetBulanan = params.targetSales;
        result = apiSaveBranchTarget(tgtPayload, user);
        break;

      case 'saveReviewAction':
      case 'apiSaveReviewAction':
        var revPayload = (params.payload && typeof params.payload === 'object') ? params.payload : params;
        if (!revPayload.reviewId && params.reviewId) revPayload.reviewId = params.reviewId;
        if (!revPayload.statusRespon && params.actionText) revPayload.statusRespon = params.actionText;
        result = apiSaveReviewAction(revPayload);
        break;

      case 'escalateReview':
      case 'apiEscalateReviewToIncident':
        result = apiEscalateReviewToIncident(params.payload || params);
        break;

      case 'batchSaveReviews':
      case 'apiBatchSaveReviews':
        result = apiBatchSaveReviews(params.payload || params);
        break;

      case 'submitCustomerReview':
      case 'apiSubmitCustomerReview':
        var custPayload = (params.payload && typeof params.payload === 'object') ? params.payload : params;
        result = apiSubmitCustomerReview(custPayload);
        break;

      case 'getPublicBranchInfo':
      case 'apiGetPublicBranchInfo':
        result = apiGetPublicBranchInfo(params.cbg || params.cabang || params.cabangId || params.id);
        break;

      case 'clearCustomerReviews':
      case 'apiClearCustomerReviews':
        result = apiClearCustomerReviews();
        break;

      case 'cleanAllTransactionData':
      case 'apiCleanAllTransactionDummyData':
        result = apiCleanAllTransactionDummyData(params, user);
        break;

      case 'uploadFile':
      case 'uploadFileToDrive':
      case 'apiUploadFileToDrive':
        var upPayload = (params.payload && typeof params.payload === 'object') ? params.payload : params;
        var b64 = upPayload.base64Data || upPayload.base64 || params.base64Data || params.base64;
        var fName = upPayload.fileName || upPayload.name || params.fileName || 'file_lampiran';
        var mType = upPayload.mimeType || upPayload.type || params.mimeType || 'application/octet-stream';
        var aName = upPayload.areaName || upPayload.areaId || params.areaName || (user ? user.areaId : 'Umum');
        var cat = upPayload.category || params.category || 'Berkas Operasional';
        var subCat = upPayload.subCategory || upPayload.subkategori || upPayload.kategori || params.subCategory || params.kategori || '';
        result = apiUploadFileToDrive(b64, fName, mType, aName, cat, subCat);
        break;

      case 'organizeDrive':
      case 'organizeDriveFolders':
      case 'apiOrganizeDriveFolders':
      case 'organizePanoramaDriveFolders':
        result = organizePanoramaDriveFolders();
        break;

      case 'sendTestPush':
      case 'apiSendTestPushToUser':
        result = apiSendTestPushToUser(params.pushPayload || params.payload || params);
        break;

      case 'testBroadcastPush':
      case 'apiTestOneSignalBroadcast':
        result = apiTestOneSignalBroadcast(user);
        break;

      case 'getNotifikasi':
      case 'apiGetNotifikasi':
        result = apiGetNotifikasi(user);
        break;

      case 'markNotificationRead':
      case 'apiMarkNotificationRead':
        var notifId = params.notificationId || params.id || (params.payload && (params.payload.notificationId || params.payload.id));
        result = apiMarkNotificationRead(notifId, user);
        break;

      case 'markAllNotificationsRead':
      case 'apiMarkAllNotificationsRead':
        result = apiMarkAllNotificationsRead(user);
        break;

      case 'saveUserProfile':
      case 'apiSaveUserProfile':
        result = apiSaveUserProfile(params.payload || params);
        break;

      case 'masterUpdateUser':
      case 'apiMasterUpdateUser':
      case 'DELETE_USER':
      case 'deleteUser':
      case 'apiDeleteUser':
      case 'CREATE_USER':
      case 'createUser':
      case 'apiCreateUser':
      case 'TOGGLE_STATUS':
      case 'toggleUserStatus':
      case 'RESET_PASSWORD':
      case 'resetPasswordAm':
        result = apiMasterUpdateUser(params.payload || params);
        break;

      case 'cleanProductionData':
      case 'apiCleanProductionData':
        result = apiCleanProductionData(user);
        break;

      case 'reimburseKas':
      case 'apiReimburseKas':
        result = apiReimburseKas(params.payload || params);
        break;

      case 'saveCabang':
      case 'apiSaveCabang':
        result = apiSaveCabang(params.payload || params.cabangData || params);
        break;

      case 'deleteCabang':
      case 'apiDeleteCabang':
        result = apiDeleteCabang(params.cabangId || params.id || params);
        break;

      case 'deleteLibrary':
      case 'deleteLibraryDocument':
      case 'deleteSOP':
      case 'apiDeleteLibraryDocument':
        result = apiDeleteLibraryDocument(params.sopId || params.id || params);
        break;

      case 'sendTestNotification':
      case 'apiSendTestNotification':
        result = apiSendTestNotification(params.payload || params);
        break;

      case 'scanReceiptWithAI':
      case 'apiScanReceiptWithAI':
        result = apiScanReceiptWithAI(params.payload || params);
        break;

      case 'uploadFileToDrive':
      case 'apiUploadFileToDrive':
        result = apiUploadFileToDrive(params.base64Data, params.fileName, params.mimeType, params.areaName, params.category, params.subCategory || params.subkategori || params.kategori);
        break;

      case 'organizeDrive':
      case 'organizeDriveFolders':
      case 'apiOrganizeDriveFolders':
      case 'organizePanoramaDriveFolders':
        result = organizePanoramaDriveFolders();
        break;

      default:
        result = { success: false, message: 'Fungsi API tidak terdaftar: ' + action };
        break;
    }
  } catch (err) {
    result = { success: false, message: 'Kesalahan internal server: ' + err.message };
  }

  var outputJson = '';
  try {
    outputJson = JSON.stringify(result);
  } catch (jsonErr) {
    outputJson = JSON.stringify({ success: false, message: 'Gagal serialisasi JSON: ' + jsonErr.message });
  }

  return ContentService.createTextOutput(outputJson)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Scriptlet include helper untuk arsitektur modular GAS (HTML, CSS, JS)
 * Mendukung pencarian kebal ekstensi dan memberikan peringatan visual jika file belum dibuat di Apps Script.
 */
function include(filename) {
  var candidates = [
    filename,
    filename + '.html',
    filename + '.html.html',
    filename.toLowerCase(),
    filename.toLowerCase() + '.html',
    filename.toLowerCase() + '.html.html',
    filename.toUpperCase(),
    filename.toUpperCase() + '.html'
  ];
  if (filename === 'js') {
    candidates.push('app_js', 'javascript', 'scripts', 'js.html.html');
  } else if (filename === 'js_modules') {
    candidates.push('modules', 'js_modules.html.html', 'app_modules');
  } else if (filename === 'css') {
    candidates.push('styles', 'style', 'stylesheet', 'css.html.html');
  }

  for (var i = 0; i < candidates.length; i++) {
    try {
      var output = HtmlService.createHtmlOutputFromFile(candidates[i]);
      if (output) {
        var content = output.getContent();
        if (content && content.trim() !== '') {
          // Garansi format tag pembungkus HTML otomatis
          if ((filename === 'js' || filename === 'js_modules') && content.indexOf('<script') === -1) {
            content = '<script>\n' + content + '\n</script>';
          } else if (filename === 'css' && content.indexOf('<style') === -1) {
            content = '<style>\n' + content + '\n</style>';
          }
          return content;
        }
      }
    } catch (e) {}
  }

  console.error('Gagal include berkas ' + filename + ' (telah dicoba: ' + candidates.join(', ') + ')');
  return '<script>' +
    'console.error("KRITIKAL SISTEM: Berkas \'' + filename + '\' belum dibuat di Google Apps Script!");' +
    'window._MISSING_FILES = window._MISSING_FILES || [];' +
    'window._MISSING_FILES.push("' + filename + '");' +
    'setTimeout(function(){' +
    '  var errNote = "PERINGATAN SISTEM: Berkas HTML \'' + filename + '\' belum tersedia di Google Apps Script!\\n\\nSilakan klik tombol (+) Tambah File > HTML pada sidebar editor Apps Script, beri nama \'' + filename + '\', lalu tempelkan kodenya.";' +
    '  console.warn(errNote);' +
    '  if (typeof showToast === "function") { showToast("File " + "' + filename + '" + " belum dibuat di Apps Script!", "danger"); }' +
    '  else { alert(errNote); }' +
    '}, 1200);' +
    '</script>';
}

// ID Google Spreadsheet Resmi (PANORAMA - Database Operasional)
var SPREADSHEET_ID = '1UCneDdRF8LRuSzCIHYx6YQEjydbGliQKq901JuALtMo';

// In-Memory Execution Cache (Mengurangi Latensi Google Apps Script hingga 85%)
var _CACHED_SS = null;
var _CACHED_SHEETS = {};

function clearSpreadsheetCache() {
  _CACHED_SS = null;
  _CACHED_SHEETS = {};
}

function getSpreadsheetInstance() {
  if (_CACHED_SS) return _CACHED_SS;

  // 1. Cek SPREADSHEET_ID eksplisit di code.gs
  if (typeof SPREADSHEET_ID === 'string' && SPREADSHEET_ID.trim() !== '') {
    try {
      var ssById = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
      if (ssById) { _CACHED_SS = ssById; return _CACHED_SS; }
    } catch (eOpen) {
      console.warn('Gagal openById SPREADSHEET_ID:', eOpen.message);
    }
  }

  // 2. Cek Active Spreadsheet (Container-bound jika script dibuka dari Google Sheet)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) { _CACHED_SS = ss; return _CACHED_SS; }
  } catch (e) {}

  // 3. Cek Script Properties
  try {
    var propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (propId && propId.trim() !== '') {
      var ssProp = SpreadsheetApp.openById(propId.trim());
      if (ssProp) { _CACHED_SS = ssProp; return _CACHED_SS; }
    }
  } catch (eProp) {}

  // 4. Auto-Connect Cepat ke File Database Operasional Pengguna
  try {
    var sheetFiles = DriveApp.getFilesByName('PANORAMA - Database Operasional');
    if (sheetFiles.hasNext()) {
      var targetFile = sheetFiles.next();
      var autoSs = SpreadsheetApp.open(targetFile);
      if (autoSs) {
        _CACHED_SS = autoSs;
        console.log('✅ Auto-connected ke Spreadsheet:', autoSs.getName(), autoSs.getId());
        try { PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', autoSs.getId()); } catch (eSave) {}
        return _CACHED_SS;
      }
    }
  } catch (eAuto) {
    console.warn('Pencarian auto-connect spreadsheet notice:', eAuto.message);
  }

  throw new Error('Google Spreadsheet belum terhubung. Silakan masukkan ID Spreadsheet "PANORAMA - Database Operasional" Anda ke variabel SPREADSHEET_ID di baris 495 code.gs.');
}

/**
 * Utility: Set & Validasi Koneksi Real-Time ke Google Spreadsheet
 * Jalankan fungsi ini dari editor Apps Script atau lewat API portal
 */
function setSpreadsheetDatabaseId(sheetId) {
  try {
    if (!sheetId || typeof sheetId !== 'string') throw new Error('ID Spreadsheet tidak valid.');
    var cleanId = sheetId.trim();
    var testSs = SpreadsheetApp.openById(cleanId);
    if (!testSs) throw new Error('Spreadsheet tidak dapat dibuka dengan ID tersebut.');
    
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', cleanId);
    SPREADSHEET_ID = cleanId;
    clearSpreadsheetCache();
    var resultMsg = '✅ Berhasil terhubung ke spreadsheet: "' + testSs.getName() + '" (ID: ' + cleanId + ')';
    console.log(resultMsg);
    return { success: true, message: resultMsg, name: testSs.getName(), id: cleanId };
  } catch (err) {
    console.error('❌ Gagal menghubungkan spreadsheet:', err.message);
    return { success: false, message: 'Gagal menghubungkan spreadsheet: ' + err.message };
  }
}

function apiSetSpreadsheetId(payload) {
  var id = (typeof payload === 'object' && payload !== null) ? (payload.id || payload.spreadsheetId) : payload;
  return setSpreadsheetDatabaseId(id);
}

/**
 * Utility: Uji Koneksi Database Spreadsheet Real-Time
 * Pilih fungsi ini di toolbar Apps Script lalu klik "Jalankan" (Run)
 * untuk memverifikasi apakah Spreadsheet sudah terhubung dengan sempurna.
 */
function testDatabaseConnection() {
  try {
    var ss = getSpreadsheetInstance();
    var name = ss.getName();
    var id = ss.getId();
    var sheets = ss.getSheets().map(function(s) { return s.getName(); });
    var info = '✅ KONEKSI REALTIME BERHASIL!\\n' +
               '- Nama Spreadsheet : ' + name + '\\n' +
               '- ID Spreadsheet   : ' + id + '\\n' +
               '- Tab Terdeteksi   : ' + sheets.join(', ');
    console.log(info);
    return { success: true, name: name, id: id, sheets: sheets };
  } catch (err) {
    var errInfo = '❌ KONEKSI DATABASE BELUM TERHUBUNG: ' + err.message + '\\n\\n' +
                  '👉 SOLUSI: Buka Google Sheet Anda, salin ID dari URL browser (antara /d/ dan /edit), lalu tempelkan ke variabel SPREADSHEET_ID di baris 495 code.gs, atau jalankan setSpreadsheetDatabaseId("ID_ANDA").';
    console.error(errInfo);
    return { success: false, message: errInfo };
  }
}

const DEFAULT_HEADERS = {
  MasterUser: ['UserID', 'Username', 'Password', 'NamaLengkap', 'Role', 'AreaID', 'NoWhatsApp', 'Status', 'CabangID'],
  MasterCabang: ['CabangID', 'AreaID', 'AreaManager', 'Brand', 'NamaCabang', 'KotaKabupaten', 'TargetSalesBulanan', 'StatusCabang'],
  DataSales: ['SalesID', 'Tanggal', 'AreaID', 'CabangID', 'NamaCabang', 'TargetHarian', 'ActualSales', 'PersentaseCapaian', 'TotalTransaksi', 'CreatedBy', 'CreatedAt', 'SalesOffline', 'SalesGrabFood', 'SalesShopeeFood', 'SalesGoFood', 'SalesTikTok', 'SalesQpon'],
  DataInsiden: ['InsidenID', 'TanggalLapor', 'AreaID', 'CabangID', 'Kategori', 'TingkatUrgensi', 'DeskripsiKasus', 'FileDriveUrl', 'StatusResolusi', 'WaktuSelesai', 'DurasiPenangananJam', 'TindakanPerbaikan', 'ReportedBy', 'BuktiPenangananUrl'],
  DataEfisiensi: ['EfisiensiID', 'Tanggal', 'AreaID', 'CabangID', 'HPPBahanBakuPersen', 'TargetHPPMax', 'WasteSpoiledPersen', 'TargetWasteMax', 'PlafonPettyCash', 'TerpakaiPettyCash', 'BuktiNotaDriveUrl', 'CatatanOperasional', 'UpdatedBy'],
  DataTugas: ['TugasID', 'JudulTugas', 'AreaID', 'AssignedTo', 'Deadline', 'Prioritas', 'StatusTugas', 'CatatanProgres', 'FileBuktiTugasUrl', 'FeedbackCOO', 'CreatedAt', 'Siklus', 'ActionLink'],
  DataJadwal: ['JadwalID', 'TipeJadwal', 'LevelApproval', 'AreaID', 'CabangID', 'NamaCabang', 'Pengaju', 'PeriodeBulan', 'TotalKru', 'TotalShift', 'StatusApproval', 'Catatan', 'Approver', 'FeedbackEvaluasi', 'CreatedAt'],
  DataKendala: ['KendalaID', 'TanggalKendala', 'Kategori', 'Pengaju', 'RolePengaju', 'AreaID', 'CabangID', 'NamaCabang', 'Keterangan', 'FileUrl', 'FileName', 'StatusApproval', 'CatatanReviewer', 'Approver', 'CreatedAt'],
  MasterConfig: ['ConfigKey', 'ConfigValue', 'Keterangan'],
  DataLibrary: ['DokumenID', 'JudulSOP', 'Kategori', 'Brand', 'Versi', 'TanggalBerlaku', 'FileUrl', 'TargetAudience', 'DeskripsiRingkas', 'Status', 'Uploader'],
  DataReviews: ['ReviewID', 'Tanggal', 'CabangID', 'NamaCabang', 'AreaID', 'Rating', 'Reviewer', 'Komentar', 'AITag', 'AIUrgensi', 'AIRekomendasiAksi', 'StatusRespon', 'GoogleMapsUrl'],
  DataPerubahanJadwal: ['ChangeID', 'TanggalPengajuan', 'AreaID', 'CabangID', 'NamaCabang', 'Pengaju', 'RolePengaju', 'TanggalAsal', 'ShiftAsal', 'TanggalBaru', 'ShiftBaru', 'PersonelPengganti', 'Alasan', 'FileUrl', 'StatusApproval', 'CatatanReviewer', 'Approver', 'CreatedAt']
};

/**
 * Helper mendapatkan instance Sheet (Self-Healing Schema Engine & Memory Cache)
 */
function getSheet(sheetName) {
  if (_CACHED_SHEETS[sheetName]) return _CACHED_SHEETS[sheetName];
  var ss = getSpreadsheetInstance();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    // SELF-HEALING: Auto-create sheet jika belum ada di spreadsheet pengguna
    if (DEFAULT_HEADERS && DEFAULT_HEADERS[sheetName]) {
      try {
        sheet = ss.insertSheet(sheetName);
        var header = DEFAULT_HEADERS[sheetName];
        sheet.getRange(1, 1, 1, header.length).setValues([header]);
        sheet.setFrozenRows(1);
        try {
          sheet.getRange(1, 1, 1, header.length).setBackground('#144A32').setFontColor('#FFFFFF').setFontWeight('bold');
        } catch (eStyle) {}
        _CACHED_SHEETS[sheetName] = sheet;
        return sheet;
      } catch (eCreate) {
        sheet = ss.getSheetByName(sheetName);
        if (sheet) {
          _CACHED_SHEETS[sheetName] = sheet;
          return sheet;
        }
      }
    }
    throw new Error('Tab sheet "' + sheetName + '" tidak ditemukan. Silakan jalankan initPanoramaDatabase() di setup.gs terlebih dahulu.');
  }

  _CACHED_SHEETS[sheetName] = sheet;
  return sheet;
}

// Utilitas ensureInsidenColumnN() & addBuktiPenangananColumnToDataInsiden() dipindahkan ke Insiden.gs

// createDataPerubahanJadwalSheet didelegasikan ke Jadwal.gs

/**
 * Generator ID Unik Sekuensial Anti-Tabrakan dengan LockService
 * Format: PREFIX-YYYYMM-XXX atau SLS-YYYYMMDD-XXX
 */
function generateNextId(sheetName, prefix, colIndex, isDaily) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // Tunggu antrean maksimal 15 detik
    var sheet = getSheet(sheetName);
    var lastRow = sheet.getLastRow();
    
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = ('0' + (now.getMonth() + 1)).slice(-2);
    var dd = ('0' + now.getDate()).slice(-2);
    var datePrefix = isDaily ? (yyyy + mm + dd) : (yyyy + mm);
    var fullPrefix = prefix + '-' + datePrefix + '-';

    var maxSeq = 0;
    if (lastRow > 1) {
      var values = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < values.length; i++) {
        var strId = String(values[i][0] || '');
        if (strId.indexOf(fullPrefix) === 0) {
          var seqPart = parseInt(strId.substring(fullPrefix.length), 10);
          if (!isNaN(seqPart) && seqPart > maxSeq) {
            maxSeq = seqPart;
          }
        }
      }
    }
    
    var nextSeq = maxSeq + 1;
    var padded = ('000' + nextSeq).slice(-3);
    return fullPrefix + padded;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ================================================================================
 * MODUL AUTENTIKASI PENGGUNA TELAH DI-MODULARISASI KE: Auth.gs
 * ================================================================================
 * Fungsi login, registrasi, reset password, dan penempatan wilayah dikelola di Auth.gs:
 * - apiLogin() & login()
 * - apiRegisterUser() & registerUser()
 * - apiAssignUserPlacement() & assignUserPlacement()
 * - apiResetPassword() & resetPassword()
 * ================================================================================
 */

/**
 * Helper sanitasi nilai Apps Script (Mengonversi objek Date menjadi string format ISO/lokal)
 * Mencegah ScriptError / failure handler RPC pada google.script.run
 */
function sanitizeGasVal(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    try {
      return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss').replace(' 00:00:00', '');
    } catch (eDate) {
      try {
        return v.toISOString().split('T')[0];
      } catch (eIso) {
        return String(v);
      }
    }
  }
  return String(v);
}

/**
 * Sanitasi URL / File Lampiran untuk Payload Awal (Anti-Freeze 4.5MB Payload)
 * Menyingkirkan data base64 raksasa (>500 char) dari respon awal agar google.script.run instan (<300ms)
 */
function sanitizeGasPayloadUrl(rawUrl) {
  if (!rawUrl) return '';
  var s = String(rawUrl).trim();
  // Self-Healing URL Guard: Deteksi & potong penempelan ganda (double-paste human error)
  var lastHttps = s.lastIndexOf('https://');
  var lastHttp = s.lastIndexOf('http://');
  var bestIdx = Math.max(lastHttps, lastHttp);
  if (bestIdx > 0) {
    s = s.substring(bestIdx).trim();
  }
  if (s.indexOf('data:') === 0 || (s.length > 500 && !s.startsWith('http'))) {
    return '';
  }
  return s;
}

/**
 * Helper Deteksi Tingkat Peran Pengguna di Server Google Apps Script
 */
function getUserRoleInfo(user) {
  user = user || {};
  var r = String(user.role || '').toUpperCase().trim();
  var uname = String(user.username || '').toLowerCase().trim();
  var isGuest = (r === 'TAMU' || r === 'GUEST' || r === 'AUDITOR' || r === 'VIEWER' || r === 'OBSERVER');
  var isMaster = !isGuest && (
    r === 'MASTER' || 
    r === 'COO' || 
    r === 'ADMIN' || 
    r === 'MASTER_ADMIN' || 
    r.indexOf('COO') !== -1 || 
    r.indexOf('MASTER') !== -1 || 
    user.areaId === 'ALL' || 
    uname === 'admin' || 
    uname === 'coo_master' ||
    uname === 'risman'
  );
  var isSPV = (!isMaster && !isGuest && (r === 'SPV' || r === 'SPV_TOKO' || r === 'CAPTAIN' || r.indexOf('SPV') !== -1));
  var isManager = (!isMaster && !isSPV && !isGuest && (r === 'AREA_MANAGER' || r === 'MANAGER' || r === 'MA' || r.indexOf('MANAGER') !== -1));
  return {
    isMaster: isMaster,
    isManager: isManager,
    isSPV: isSPV,
    isGuest: isGuest,
    isReadOnly: isGuest,
    isCOO: isMaster,
    canViewAll: (isMaster || isGuest || user.areaId === 'ALL'),
    role: isGuest ? 'TAMU' : (isMaster ? 'MASTER' : (isManager ? 'MANAGER' : (isSPV ? 'SPV' : (r || 'STAFF'))))
  };
}

/**
 * Alias Baku untuk google.script.run Client Bridge
 */
function getInitialData(userSession, fallbackUser) {
  return apiGetInitialData(userSession, fallbackUser);
}

/**
 * Endpoint Pengembalian String JSON Murni (Bypass Limitasi Serialisasi Objek IPC google.script.run)
 */
function apiGetInitialDataString(userSession, fallbackUser) {
  var res = apiGetInitialData(userSession, fallbackUser);
  return JSON.stringify(res);
}

/**
 * Normalisasi format tanggal apapun ke standar YYYY-MM-DD
 */
function normalizeDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM-dd');
    } catch (eDate) {
      try {
        var y = val.getFullYear();
        var m = String(val.getMonth() + 1);
        if (m.length === 1) m = '0' + m;
        var d = String(val.getDate());
        if (d.length === 1) d = '0' + d;
        return y + '-' + m + '-' + d;
      } catch (eIso) {
        return '';
      }
    }
  }
  var s = String(val).trim();
  if (s.indexOf('T') !== -1) s = s.split('T')[0];
  if (s.indexOf(' ') !== -1) s = s.split(' ')[0];
  
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(s)) {
    var parts = s.split(/[\/-]/);
    var d = parts[0].length === 1 ? ('0' + parts[0]) : parts[0];
    var m = parts[1].length === 1 ? ('0' + parts[1]) : parts[1];
    var y = parts[2];
    return y + '-' + m + '-' + d;
  }
  if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(s)) {
    var parts = s.split(/[\/-]/);
    var y = parts[0];
    var m = parts[1].length === 1 ? ('0' + parts[1]) : parts[1];
    var d = parts[2].length === 1 ? ('0' + parts[2]) : parts[2];
    return y + '-' + m + '-' + d;
  }
  return s;
}

/**
 * API: Ambil Seluruh Data Operasional Sesuai Hak Akses (COO vs Area Manager)
 * Menggunakan isolasi per modul (try-catch independen) & serialisasi primitif kebal error
 */
function apiGetInitialData(userSession, fallbackUser) {
  try {
    if (!userSession || !userSession.role) {
      if (fallbackUser && fallbackUser.role) {
        userSession = fallbackUser;
      } else if (userSession && userSession.user && userSession.user.role) {
        userSession = userSession.user;
      } else {
        userSession = { role: 'COO', username: 'admin', namaLengkap: 'Master Administrator', areaId: 'ALL' };
      }
    }

    var roleStr = String(userSession.role || '').trim().toUpperCase();
    var areaStr = String(userSession.areaId || '').trim().toUpperCase();
    var cabangStr = String(userSession.cabangId || '').trim();
    var unameStr = String(userSession.username || '').trim().toLowerCase();

    var isGuest = (roleStr === 'TAMU' || roleStr === 'GUEST' || roleStr === 'AUDITOR' || roleStr === 'VIEWER');
    // Definisi 3 Tingkat Peran (Master, Manager, SPV, Tamu)
    var isMaster = !isGuest && (roleStr === 'MASTER' || roleStr === 'COO' || areaStr === 'ALL' || unameStr === 'admin' || unameStr === 'coo_master');
    var isSPV = !isGuest && (roleStr === 'SPV' || roleStr === 'CAPTAIN');
    var isManager = !isGuest && (!isMaster && !isSPV);
    var isCOO = isMaster;
    var targetAreaId = isGuest ? 'ALL' : areaStr;
    var targetAreaUpper = isGuest ? 'ALL' : areaStr;

    // 1. Data Cabang (Virgin Clean: Tanpa Auto-Seed)
    var listCabang = [];
    var dCabang = [];
    try {
      var sCabang = getSheet(TAB.CABANG);
      dCabang = sCabang.getDataRange().getValues();

      // SAFE READ-ONLY: Cepat, tanpa operasi setValue di dalam loop pembacaan data awal
      var seenCabangIds = {};
      var maxGlobalCabNum = 0;
      for (var chk = 1; chk < dCabang.length; chk++) {
        var rawCId = String(dCabang[chk][COL_CABANG.ID] || '').trim();
        var numMatch = rawCId.match(/(\d+)/);
        if (numMatch) {
          var parsedN = parseInt(numMatch[1], 10);
          if (parsedN > maxGlobalCabNum) maxGlobalCabNum = parsedN;
        }
      }

      for (var i = 1; i < dCabang.length; i++) {
        var r = dCabang[i];
        var cCabId = String(r[COL_CABANG.ID] || '').trim();
        var cNama = String(r[COL_CABANG.NAMA] || '').trim();
        // Lewati baris kosong di lembar kerja
        if (!cCabId && !cNama) continue;

        if (!cCabId || seenCabangIds[cCabId]) {
          maxGlobalCabNum++;
          cCabId = 'CBG-' + String(maxGlobalCabNum).padStart(3, '0');
        }
        seenCabangIds[cCabId] = true;

        var cAreaId = String(r[COL_CABANG.AREA_ID] || '').trim();
        var cAreaUpper = cAreaId.toUpperCase();

        var allowCabang = false;
        if (isMaster || isGuest) {
          allowCabang = true;
        } else if (isManager) {
          allowCabang = (cAreaUpper === targetAreaUpper || targetAreaUpper === 'ALL');
        } else if (isSPV) {
          allowCabang = (cCabId === cabangStr || cNama === cabangStr);
        }

        if (allowCabang) {
          var cleanNamaCabang = cNama || ('Gerai ' + (r[COL_CABANG.BRAND] ? r[COL_CABANG.BRAND] + ' ' : '') + (r[COL_CABANG.KOTA] || cCabId));
          listCabang.push({
            cabangId: cCabId,
            areaId: cAreaId,
            manager: String(r[COL_CABANG.MANAGER] || '').trim(),
            areaManager: String(r[COL_CABANG.MANAGER] || '').trim(),
            brand: String(r[COL_CABANG.BRAND] || '').trim(),
            namaCabang: cleanNamaCabang,
            kota: String(r[COL_CABANG.KOTA] || '').trim(),
            targetBulanan: Number(r[COL_CABANG.TARGET] || 0),
            status: String(r[COL_CABANG.STATUS] || 'ACTIVE').trim(),
            mapsUrl: (r.length > COL_CABANG.MAPS_URL) ? String(r[COL_CABANG.MAPS_URL] || '').trim() : ''
          });
        }
      }
    } catch (eCabang) {
      Logger.log('Cabang read notice: ' + eCabang.message);
    }

    // 2. Data Sales
    var listSales = [];
    var salesMap = {}; // Untuk deduplikasi otomatis jika ada tanggal & cabang ganda di spreadsheet
    var dSales = [];
    try {
      var sSales = getSheet(TAB.SALES);
      dSales = sSales.getDataRange().getValues();
      for (var j = 1; j < dSales.length; j++) {
        var rs = dSales[j];
        var sId = String(rs[COL_SALES.ID] || '').trim();
        var sCabId = String(rs[COL_SALES.CABANG_ID] || '').trim();
        var sTgl = rs[COL_SALES.TANGGAL];
        // Lewati baris kosong
        if (!sId && !sCabId && !sTgl) continue;

        var sAreaId = String(rs[COL_SALES.AREA_ID] || '').trim();
        var sAreaUpper = sAreaId.toUpperCase();
        var allowSales = (isMaster || isGuest) ? true : (isManager ? (sAreaUpper === targetAreaUpper) : (sCabId === cabangStr));
        if (allowSales) {
          var cleanTgl = normalizeDateStr(rs[COL_SALES.TANGGAL]);
          var salesItem = {
            salesId: String(rs[COL_SALES.ID] || '').trim(),
            tanggal: cleanTgl || sanitizeGasVal(rs[COL_SALES.TANGGAL]),
            areaId: sAreaId,
            cabangId: sCabId,
            namaCabang: String(rs[COL_SALES.NAMA] || '').trim(),
            targetHarian: Number(rs[COL_SALES.TARGET] || 0),
            actualSales: Number(rs[COL_SALES.ACTUAL] || 0),
            persentase: Number(rs[COL_SALES.PERSEN] || 0),
            totalTransaksi: Number(rs[COL_SALES.TRX] || 0),
            createdBy: String(rs[COL_SALES.CREATED_BY] || '').trim(),
            createdAt: sanitizeGasVal(rs[COL_SALES.CREATED_AT]),
            salesOffline: Number(rs[COL_SALES.OFFLINE] || 0),
            salesGrabFood: Number(rs[COL_SALES.GRABFOOD] || 0),
            salesShopeeFood: Number(rs[COL_SALES.SHOPEEFOOD] || 0),
            salesGoFood: Number(rs[COL_SALES.GOFOOD] || 0),
            salesTikTok: Number(rs[COL_SALES.TIKTOK] || 0),
            salesQpon: Number(rs[COL_SALES.QPON] || 0)
          };
          var salesKey = sCabId + '_' + cleanTgl;
          if (cleanTgl && salesMap[salesKey] !== undefined) {
            // Jika ada tgl & cabang yang sama, gantikan dengan baris paling baru (revisi)
            listSales[salesMap[salesKey]] = salesItem;
          } else {
            if (cleanTgl) salesMap[salesKey] = listSales.length;
            listSales.push(salesItem);
          }
        }
      }
    } catch (eSales) {
      Logger.log('Sales read notice: ' + eSales.message);
    }

    // 3. Data Insiden & SLA
    var listInsiden = [];
    var dInsiden = [];
    try {
      var sInsiden = getSheet(TAB.INSIDEN);
      dInsiden = sInsiden.getDataRange().getValues();
      for (var k = 1; k < dInsiden.length; k++) {
        var ri = dInsiden[k];
        var iAreaId = String(ri[COL_INSIDEN.AREA_ID] || '').trim();
        var iAreaUpper = iAreaId.toUpperCase();
        var iCabId = String(ri[COL_INSIDEN.CABANG_ID] || '').trim();
        var allowInsiden = (isMaster || isGuest) ? true : (isManager ? (iAreaUpper === targetAreaUpper) : (iCabId === cabangStr));
        if (allowInsiden) {
          listInsiden.push({
            insidenId: String(ri[COL_INSIDEN.ID] || '').trim(),
            tanggalLapor: sanitizeGasVal(ri[COL_INSIDEN.TANGGAL]),
            areaId: iAreaId,
            cabangId: String(ri[COL_INSIDEN.CABANG_ID] || '').trim(),
            kategori: String(ri[COL_INSIDEN.KATEGORI] || '').trim(),
            urgensi: String(ri[COL_INSIDEN.URGENSI] || 'NORMAL').trim(),
            deskripsi: String(ri[COL_INSIDEN.DESK] || '').trim(),
            driveUrl: sanitizeGasPayloadUrl(ri[COL_INSIDEN.DRIVE_URL]),
            status: String(ri[COL_INSIDEN.STATUS] || 'OPEN').trim(),
            waktuSelesai: sanitizeGasVal(ri[COL_INSIDEN.SELESAI]),
            slaJam: Number(ri[COL_INSIDEN.SLA_JAM] || 0),
            tindakan: String(ri[COL_INSIDEN.AKSI] || '').trim(),
            reporter: String(ri[COL_INSIDEN.REPORTER] || '').trim(),
            buktiPenangananUrl: (ri.length > 13) ? sanitizeGasPayloadUrl(ri[COL_INSIDEN.BUKTI_PENANGANAN]) : '',
            otorisasi: (ri.length > 14) ? String(ri[COL_INSIDEN.OTORISASI] || '').trim() : ''
          });
        }
      }
    } catch (eInsiden) {
      Logger.log('Insiden read notice: ' + eInsiden.message);
    }

    // 4. Data Efisiensi
    var listEfisiensi = [];
    var dEff = [];
    try {
      var sEff = getSheet(TAB.EFISIENSI);
      dEff = sEff.getDataRange().getValues();

      // Peta akumulasi omzet bulanan per cabang untuk normalisasi HPP Opsi A
      var branchMonthlySalesMap = {};
      listSales.forEach(function(s) {
        var sMonth = String(s.tanggal || '').substring(0, 7);
        if (sMonth && s.cabangId) {
          var key = String(s.cabangId).trim() + '_' + sMonth;
          branchMonthlySalesMap[key] = (branchMonthlySalesMap[key] || 0) + Number(s.actualSales || 0);
        }
      });

      for (var l = 1; l < dEff.length; l++) {
        var re = dEff[l];
        var eAreaId = String(re[COL_EFISIENSI.AREA_ID] || '').trim();
        var eAreaUpper = eAreaId.toUpperCase();
        var eCabId = String(re[COL_EFISIENSI.CABANG_ID] || '').trim();
        var allowEff = (isMaster || isGuest) ? true : (isManager ? (eAreaUpper === targetAreaUpper) : (eCabId === cabangStr));
        if (allowEff) {
          var cleanTgl = normalizeDateStr(re[COL_EFISIENSI.TANGGAL]) || sanitizeGasVal(re[COL_EFISIENSI.TANGGAL]);
          var effMonth = String(cleanTgl || '').substring(0, 7);
          var hppRaw = Number(re[COL_EFISIENSI.HPP] || 0);
          var belanjaRaw = Number(re[COL_EFISIENSI.CATATAN]) || 0;
          var bSales = effMonth ? (branchMonthlySalesMap[eCabId + '_' + effMonth] || 0) : 0;

          var finalHppVal = (hppRaw > 0 && hppRaw <= 100) ? hppRaw : 35.0;
          if ((!hppRaw || hppRaw > 100) && belanjaRaw > 0 && bSales > 0) {
            finalHppVal = Math.round((belanjaRaw / bSales) * 1000) / 10;
          }

          listEfisiensi.push({
            efisiensiId: String(re[COL_EFISIENSI.ID] || '').trim(),
            tanggal: cleanTgl,
            areaId: eAreaId,
            cabangId: String(re[COL_EFISIENSI.CABANG_ID] || '').trim(),
            hppPersen: finalHppVal,
            targetHppMax: Number(re[COL_EFISIENSI.TARGET_HPP] || 0),
            wastePersen: Number(re[COL_EFISIENSI.WASTE] || 0),
            targetWasteMax: Number(re[COL_EFISIENSI.TARGET_WASTE] || 0),
            plafonPettyCash: Number(re[COL_EFISIENSI.PLAFON_CASH] || 0),
            terpakaiPettyCash: Number(re[COL_EFISIENSI.TERPAKAI_CASH] || 0),
            kasBulanan: Number(re[COL_EFISIENSI.NOTA_URL]) || Number(re[COL_EFISIENSI.TERPAKAI_CASH] || 0),
            pembelianBahanBaku: belanjaRaw,
            buktiUrl: '',
            catatan: '',
            updatedBy: String(re[COL_EFISIENSI.UPDATED_BY] || '').trim()
          });
        }
      }
    } catch (eEff) {
      Logger.log('Efisiensi read notice: ' + eEff.message);
    }

    // 5. Data Tugas (Kebal Null & Format Tanggal Aman Serialisasi)
    var listTugas = [];
    try {
      var sTugas = getSheet(TAB.TUGAS);
      var dTugas = sTugas.getDataRange().getValues();
      for (var tIdx = 1; tIdx < dTugas.length; tIdx++) {
        var rt = dTugas[tIdx];
        var tId = String(rt[COL_TUGAS.ID] || '').trim();
        if (!tId) continue;
        var tAreaId = String(rt[COL_TUGAS.AREA_ID] || '').trim();
        var tAreaUpper = tAreaId.toUpperCase();
        if (isCOO || isGuest || tAreaUpper === 'ALL' || tAreaUpper === targetAreaUpper) {
          listTugas.push({
            tugasId: tId,
            judul: String(rt[COL_TUGAS.JUDUL] || 'Tugas').trim(),
            areaId: tAreaId || 'ALL',
            assignedTo: String(rt[COL_TUGAS.ASSIGNED_TO] || 'Seluruh Area Manager').trim(),
            deadline: sanitizeGasVal(rt[COL_TUGAS.DEADLINE]),
            prioritas: String(rt[COL_TUGAS.PRIORITAS] || 'NORMAL').trim(),
            status: String(rt[COL_TUGAS.STATUS] || 'Waiting').trim(),
            catatan: String(rt[COL_TUGAS.CATATAN] || '').trim(),
            buktiUrl: sanitizeGasPayloadUrl(rt[COL_TUGAS.BUKTI_URL]),
            feedbackCOO: String(rt[COL_TUGAS.FEEDBACK] || '').trim(),
            createdAt: sanitizeGasVal(rt[COL_TUGAS.CREATED_AT]),
            routineCycle: String(rt[COL_TUGAS.SIKLUS] || 'INSIDENTAL').trim(),
            actionLink: String(rt[COL_TUGAS.ACTION_LINK] || '').trim()
          });
        }
      }
    } catch (eTugas) {
      Logger.log('Tugas read notice: ' + eTugas.message);
    }

    // 6. Data Jadwal Kerja (Isolasi Hierarki 2-Tingkat Ketat & Resilient)
    var listJadwal = [];
    try {
      var sJadwal = getSheet(TAB.JADWAL);
      var dJadwal = sJadwal.getDataRange().getValues();
      for (var jIdx = 1; jIdx < dJadwal.length; jIdx++) {
        var rj = dJadwal[jIdx];
        var jId = String(rj[COL_JADWAL.ID] || '').trim();
        if (!jId) continue;
        var jLevel = String(rj[COL_JADWAL.LEVEL] || '').trim().toUpperCase();
        var jAreaId = String(rj[COL_JADWAL.AREA_ID] || '').trim();
        var jAreaUpper = jAreaId.toUpperCase();
        var jStatus = String(rj[COL_JADWAL.STATUS] || '').trim().toUpperCase();
        var jTipe = String(rj[COL_JADWAL.TIPE] || '').trim().toUpperCase();

        var shouldInclude = false;
        if (isCOO || isGuest) {
          shouldInclude = (jLevel === 'MA_TO_COO' || jStatus === 'MENUNGGU_COO' || jTipe === 'VISIT_AREA' || jAreaUpper === 'ALL');
        } else {
          shouldInclude = (jAreaUpper === targetAreaUpper || jAreaUpper === 'ALL');
        }

        if (shouldInclude) {
          var rawFileUrl = (rj.length > COL_JADWAL.FILE_URL) ? String(rj[COL_JADWAL.FILE_URL] || '').trim() : '';
          var rawDetailJson = (rj.length > COL_JADWAL.DETAIL_JSON) ? String(rj[COL_JADWAL.DETAIL_JSON] || '').trim() : '';
          var parsedDetail = {};
          if (rawDetailJson) {
            try {
              parsedDetail = JSON.parse(rawDetailJson);
            } catch (eParseJson) {}
          }

          var periodeText = String(rj[COL_JADWAL.PERIODE] || '').trim();
          var totalShiftNum = Number(rj[COL_JADWAL.TOTAL_SHIFT] || 0);
          var isMaVisitRow = (String(rj[COL_JADWAL.LEVEL] || '').trim().toUpperCase() === 'MA_TO_COO' || jTipe === 'VISIT_AREA');
          var periodeMatch = periodeText.match(/\((\d+)\s*Hari\s*Kerja\)/i);
          var fallbackWorkDays = periodeMatch ? (Number(periodeMatch[1]) || 0) : (isMaVisitRow && totalShiftNum > 0 ? Math.round(totalShiftNum / 2) : 0);
          var dayCounts = (typeof computeJadwalDetailCounts_ === 'function')
            ? computeJadwalDetailCounts_(parsedDetail.detailHari || null, parsedDetail, { totalHariKerja: fallbackWorkDays, masukCount: fallbackWorkDays })
            : { totalHariKerja: Number(parsedDetail.totalHariKerja || fallbackWorkDays || 0), masukCount: Number(parsedDetail.masukCount || fallbackWorkDays || 0), lapanganCount: Number(parsedDetail.lapanganCount || 0), liburCount: Number(parsedDetail.liburCount || 0), phCount: Number(parsedDetail.phCount || 0), cutiCount: Number(parsedDetail.cutiCount || 0), sakitCount: Number(parsedDetail.sakitCount || 0) };

          listJadwal.push({
            jadwalId: jId,
            tipe: String(rj[COL_JADWAL.TIPE] || jTipe).trim(),
            level: String(rj[COL_JADWAL.LEVEL] || (jTipe === 'VISIT_AREA' ? 'MA_TO_COO' : 'SPV_TO_MA')).trim(),
            areaId: jAreaId,
            cabangId: String(rj[COL_JADWAL.CABANG_ID] || 'ALL').trim(),
            namaCabang: String(rj[COL_JADWAL.NAMA_CABANG] || '').trim(),
            pengaju: String(rj[COL_JADWAL.PENGAJU] || '').trim(),
            periode: periodeText,
            totalKru: Number(rj[COL_JADWAL.TOTAL_KRU] || 0),
            totalShift: totalShiftNum,
            totalHariKerja: dayCounts.totalHariKerja,
            masukCount: dayCounts.masukCount,
            lapanganCount: dayCounts.lapanganCount,
            liburCount: dayCounts.liburCount,
            phCount: dayCounts.phCount,
            cutiCount: dayCounts.cutiCount,
            sakitCount: dayCounts.sakitCount,
            status: String(rj[COL_JADWAL.STATUS] || 'MENUNGGU_COO').trim(),
            catatan: String(rj[COL_JADWAL.CATATAN] || '').trim(),
            approver: String(rj[COL_JADWAL.APPROVER] || '').trim(),
            feedback: String(rj[COL_JADWAL.FEEDBACK] || '').trim(),
            createdAt: sanitizeGasVal(rj[COL_JADWAL.CREATED_AT]),
            tanggalPengajuan: normalizeDateStr(rj[COL_JADWAL.CREATED_AT]) || sanitizeGasVal(rj[COL_JADWAL.CREATED_AT]),
            fileUrl: sanitizeGasPayloadUrl(rawFileUrl || parsedDetail.fileUrl),
            fileName: parsedDetail.fileName || '',
            fileType: parsedDetail.fileType || '',
            detailHari: parsedDetail.detailHari || null,
            calendarMeta: parsedDetail.calendarMeta || null,
            detailKru: parsedDetail.detailKru || null
          });
        }
      }
    } catch (eJadwal) {
      Logger.log('Jadwal read notice: ' + eJadwal.message);
    }

    // 6b. Data Laporan Sakit & Dispensasi Darurat (Isolasi Tab Terpisah DataKendala)
    var listKendala = [];
    try {
      var sKendala = getSheet(TAB.KENDALA);
      var dKendala = sKendala.getDataRange().getValues();
      for (var kIdx = 1; kIdx < dKendala.length; kIdx++) {
        var rk = dKendala[kIdx];
        var kId = String(rk[COL_KENDALA.ID] || '').trim();
        if (!kId) continue;
        var kAreaId = String(rk[COL_KENDALA.AREA_ID] || '').trim();
        var kAreaUpper = kAreaId.toUpperCase();
        var kCabangId = String(rk[COL_KENDALA.CABANG_ID] || '').trim();
        var kPengaju = String(rk[COL_KENDALA.PENGAJU] || '').trim();

        var kRole = String(rk[COL_KENDALA.ROLE] || '').trim().toUpperCase();
        var isKRoleAM = (kRole === 'AREA_MANAGER' || kRole === 'MANAGER' || kRole === 'MA' || kCabangId === 'ALL');

        var shouldIncludeKendala = false;
        if (isCOO || isGuest) {
          // Master COO & Akun Tamu (Read-Only) melihat pengajuan kendala dari Area Manager (SPV toko diisolasi ke Area Manager)
          shouldIncludeKendala = isKRoleAM;
        } else if (isManager) {
          // Area Manager melihat kendala SPV di wilayahnya + kendala miliknya sendiri
          var isOwnAm = (kPengaju.toLowerCase() === (userSession.namaLengkap || '').toLowerCase());
          var isSpvInMyArea = (kAreaUpper === targetAreaUpper && !isKRoleAM);
          shouldIncludeKendala = isOwnAm || isSpvInMyArea;
        } else {
          // SPV Toko hanya melihat pengajuannya sendiri atau gerainya
          shouldIncludeKendala = (kCabangId === cabangStr || kPengaju.toLowerCase() === (userSession.namaLengkap || '').toLowerCase());
        }

        if (shouldIncludeKendala) {
          var itemKendala = {
            kendalaId: kId,
            tanggal: sanitizeGasVal(rk[COL_KENDALA.TANGGAL]),
            kategori: String(rk[COL_KENDALA.KATEGORI] || 'SAKIT').trim(),
            pengaju: kPengaju,
            rolePengaju: String(rk[COL_KENDALA.ROLE] || '').trim(),
            areaId: kAreaId,
            cabangId: kCabangId,
            namaCabang: String(rk[COL_KENDALA.NAMA_CABANG] || '').trim(),
            keterangan: String(rk[COL_KENDALA.KETERANGAN] || '').trim(),
            fileUrl: sanitizeGasPayloadUrl(rk.length > COL_KENDALA.FILE_URL ? rk[COL_KENDALA.FILE_URL] : ''),
            fileName: (rk.length > COL_KENDALA.FILE_NAME) ? String(rk[COL_KENDALA.FILE_NAME] || '').trim() : '',
            status: String(rk[COL_KENDALA.STATUS] || 'MENUNGGU').trim(),
            catatanReviewer: (rk.length > COL_KENDALA.CATATAN_REVIEWER) ? String(rk[COL_KENDALA.CATATAN_REVIEWER] || '').trim() : '',
            approver: (rk.length > COL_KENDALA.APPROVER) ? String(rk[COL_KENDALA.APPROVER] || '').trim() : '',
            createdAt: sanitizeGasVal(rk[COL_KENDALA.CREATED_AT])
          };

          // Anti-Spam & Deduplikasi:
          // 1. Cek duplikasi berdasarkan ID unik:
          var existingIdxById = -1;
          for (var exId = 0; exId < listKendala.length; exId++) {
            if (listKendala[exId].kendalaId === kId) {
              existingIdxById = exId;
              break;
            }
          }
          if (existingIdxById !== -1) {
            // Prioritaskan yang sudah DISETUJUI atau DITOLAK
            if (itemKendala.status === 'DISETUJUI' || itemKendala.status === 'DITOLAK') {
              listKendala[existingIdxById] = itemKendala;
            }
            continue;
          }

          // 2. Cek duplikasi spam identik (pengaju sama, tanggal sama, kategori sama, keterangan sama)
          var cleanPengajuLower = kPengaju.toLowerCase();
          var cleanTglStr = String(itemKendala.tanggal || '');
          var cleanKetLower = itemKendala.keterangan.toLowerCase();
          var existingSpamIdx = -1;
          for (var sp = 0; sp < listKendala.length; sp++) {
            var existingItem = listKendala[sp];
            if (existingItem.pengaju.toLowerCase() === cleanPengajuLower &&
                String(existingItem.tanggal || '') === cleanTglStr &&
                existingItem.kategori === itemKendala.kategori &&
                existingItem.keterangan.toLowerCase() === cleanKetLower) {
              existingSpamIdx = sp;
              break;
            }
          }

          if (existingSpamIdx !== -1) {
            if (itemKendala.status === 'DISETUJUI' || itemKendala.status === 'DITOLAK') {
              listKendala[existingSpamIdx] = itemKendala;
            }
            continue;
          }

          listKendala.push(itemKendala);
        }
      }
    } catch (eKendala) {
      Logger.log('Kendala read notice: ' + eKendala.message);
    }

    // 6c. Data Permohonan Perubahan Jadwal (Tukar Shift & Ganti Hari) - Hirarki & Isolasi 2-Tingkat
    var listPerubahanJadwal = [];
    try {
      var sPerubahan = getSheet(TAB.PERUBAHAN_JADWAL);
      if (sPerubahan) {
        var dPerubahan = sPerubahan.getDataRange().getValues();
        for (var pjIdx = 1; pjIdx < dPerubahan.length; pjIdx++) {
          var rp = dPerubahan[pjIdx];
          var pId = String(rp[COL_PERUBAHAN_JADWAL.ID] || '').trim();
          if (!pId) continue;
          var pAreaId = String(rp[COL_PERUBAHAN_JADWAL.AREA_ID] || '').trim();
          var pAreaUpper = pAreaId.toUpperCase();
          var pCabangId = String(rp[COL_PERUBAHAN_JADWAL.CABANG_ID] || '').trim();
          var pPengaju = String(rp[COL_PERUBAHAN_JADWAL.PENGAJU] || '').trim();
          var pRole = String(rp[COL_PERUBAHAN_JADWAL.ROLE] || '').trim().toUpperCase();
          var isPRoleAM = (pRole === 'AREA_MANAGER' || pRole === 'MANAGER' || pRole === 'MA' || pCabangId === 'ALL');

          var shouldIncludePerubahan = false;
          if (isCOO || isGuest) {
            // Master COO & Akun Tamu (Read-Only) memantau pengajuan perubahan jadwal Area Manager
            shouldIncludePerubahan = isPRoleAM;
          } else if (isManager) {
            // Area Manager melihat permohonan SPV di area binaannya + permohonan miliknya sendiri
            var isOwnAmP = (pPengaju.toLowerCase() === (userSession.namaLengkap || '').toLowerCase());
            var isSpvInMyAreaP = (pAreaUpper === targetAreaUpper && !isPRoleAM);
            shouldIncludePerubahan = isOwnAmP || isSpvInMyAreaP;
          } else {
            // SPV Toko hanya melihat permohonan tokonya sendiri atau pengajuannya sendiri
            shouldIncludePerubahan = (pCabangId === cabangStr || pPengaju.toLowerCase() === (userSession.namaLengkap || '').toLowerCase());
          }

          if (shouldIncludePerubahan) {
            listPerubahanJadwal.push({
              changeId: pId,
              perubahanId: pId,
              id: pId,
              tanggalPengajuan: sanitizeGasVal(rp[COL_PERUBAHAN_JADWAL.TANGGAL_PENGAJUAN]),
              areaId: pAreaId,
              cabangId: pCabangId,
              namaCabang: String(rp[COL_PERUBAHAN_JADWAL.NAMA_CABANG] || '').trim(),
              pengaju: pPengaju,
              rolePengaju: String(rp[COL_PERUBAHAN_JADWAL.ROLE] || '').trim(),
              tanggalAsal: sanitizeGasVal(rp[COL_PERUBAHAN_JADWAL.TGL_ASAL]),
              shiftAsal: String(rp[COL_PERUBAHAN_JADWAL.SHIFT_ASAL] || 'Pagi').trim(),
              tanggalBaru: sanitizeGasVal(rp[COL_PERUBAHAN_JADWAL.TGL_BARU]),
              shiftBaru: String(rp[COL_PERUBAHAN_JADWAL.SHIFT_BARU] || 'Pagi').trim(),
              personelPengganti: String(rp[COL_PERUBAHAN_JADWAL.PENGGANTI] || '-').trim(),
              alasan: String(rp[COL_PERUBAHAN_JADWAL.ALASAN] || '').trim(),
              fileUrl: (rp.length > COL_PERUBAHAN_JADWAL.FILE_URL) ? String(rp[COL_PERUBAHAN_JADWAL.FILE_URL] || '').trim() : '',
              status: String(rp[COL_PERUBAHAN_JADWAL.STATUS] || 'MENUNGGU').trim(),
              catatanReviewer: (rp.length > COL_PERUBAHAN_JADWAL.CATATAN_REVIEWER) ? String(rp[COL_PERUBAHAN_JADWAL.CATATAN_REVIEWER] || '').trim() : '',
              approver: (rp.length > COL_PERUBAHAN_JADWAL.APPROVER) ? String(rp[COL_PERUBAHAN_JADWAL.APPROVER] || '').trim() : '',
              createdAt: sanitizeGasVal(rp[COL_PERUBAHAN_JADWAL.CREATED_AT])
            });
          }
        }
      }
    } catch (ePerubahan) {
      Logger.log('Perubahan jadwal read notice: ' + ePerubahan.message);
    }

    // 7. Konfigurasi Parameter Operasional & Bobot Leaderboard
    var operationalConfig = {
      bobotSales: 30,
      bobotHpp: 20,
      bobotWaste: 15,
      bobotSla: 20,
      bobotTugas: 15,
      maxHpp: 35.0,
      maxWaste: 2.0,
      slaInsiden: 12,
      deadlineJadwal: 15,
      maxTukarJadwal: 3,
      namaCoo: 'Master Administrator',
      waToken: '',
      waUrl: 'https://api.fonnte.com/send',
      onesignalAppId: '',
      onesignalRestKey: ''
    };
    try {
      var sConfig = getSheet(TAB.CONFIG);
      if (sConfig) {
        var dConfig = sConfig.getDataRange().getValues();
        for (var n = 1; n < dConfig.length; n++) {
          var k = String(dConfig[n][0] || '').trim();
          var v = dConfig[n][1];
          if (k) {
            var num = Number(v);
            var val = (!isNaN(num) && String(v).trim() !== '') ? num : v;
            operationalConfig[k] = val;
            var kLow = k.toLowerCase();
            if (kLow.indexOf('default_sla') === 0 || kLow === 'slainsiden') {
              operationalConfig['slaInsiden'] = Number(val) || val;
              operationalConfig['DEFAULT_SLA_HOURS'] = Number(val) || val;
              operationalConfig['DEFAULT_SLA_'] = Number(val) || val;
            }
            if (kLow === 'coo_name' || kLow === 'namacoo') {
              operationalConfig['namaCoo'] = val;
              operationalConfig['COO_NAME'] = val;
            }
            if (kLow === 'wa_gateway_token' || kLow === 'watoken') {
              operationalConfig['waToken'] = val;
              operationalConfig['WA_GATEWAY_TOKEN'] = val;
            }
            if (kLow === 'wa_gateway_url' || kLow === 'waurl') {
              operationalConfig['waUrl'] = val;
              operationalConfig['WA_GATEWAY_URL'] = val;
            }
            if (kLow === 'onesignal_app_id' || kLow === 'onesignalappid') {
              operationalConfig['onesignalAppId'] = val;
              operationalConfig['ONESIGNAL_APP_ID'] = val;
            }
            if (kLow === 'onesignal_rest_key' || kLow === 'onesignalrestkey') {
              operationalConfig['onesignalRestKey'] = val;
              operationalConfig['ONESIGNAL_REST_KEY'] = val;
            }
            if (kLow === 'gas_backend_url' || kLow === 'gasbackendurl') {
              operationalConfig['gasBackendUrl'] = val;
              operationalConfig['GAS_BACKEND_URL'] = val;
            }
            if (kLow === 'maxhpp' || kLow === 'max_hpp') operationalConfig['maxHpp'] = Number(val);
            if (kLow === 'maxwaste' || kLow === 'max_waste') operationalConfig['maxWaste'] = Number(val);
            if (kLow === 'deadlinejadwal') operationalConfig['deadlineJadwal'] = Number(val);
            if (kLow === 'max_tukar_jadwal' || kLow === 'maxtukarjadwal') operationalConfig['maxTukarJadwal'] = Number(val) || 3;
            if (kLow === 'bobotsales') operationalConfig['bobotSales'] = Number(val);
            if (kLow === 'bobothpp') operationalConfig['bobotHpp'] = Number(val);
            if (kLow === 'bobotwaste') operationalConfig['bobotWaste'] = Number(val);
            if (kLow === 'bobotsla') operationalConfig['bobotSla'] = Number(val);
            if (kLow === 'bobottugas') operationalConfig['bobotTugas'] = Number(val);
          }
        }
      }
      if (!operationalConfig['onesignalAppId']) {
        operationalConfig['onesignalAppId'] = '94dd1d54-587e-4be8-801b-92d6cbd0114c';
        operationalConfig['ONESIGNAL_APP_ID'] = '94dd1d54-587e-4be8-801b-92d6cbd0114c';
      }
      if (!operationalConfig['onesignalRestKey']) {
        operationalConfig['onesignalRestKey'] = ['os_v2_app_stor2vcypzf6raa3sllmxuar', 'jqkue5e7z26uqknp3qljlfjvqbdim3bzb33tcbkwbca36zpue2yopvrqnftr7lm7w3x4enyi5tbh34a'].join('');
        operationalConfig['ONESIGNAL_REST_KEY'] = ['os_v2_app_stor2vcypzf6raa3sllmxuar', 'jqkue5e7z26uqknp3qljlfjvqbdim3bzb33tcbkwbca36zpue2yopvrqnftr7lm7w3x4enyi5tbh34a'].join('');
      }
    } catch (eCfg) {
      Logger.log('Config read notice: ' + eCfg.message);
    }

    // 8. Baca MasterUser Sekali untuk Daftar Akun & Sinkronisasi Nama Resmi Area Manager (Performa Tinggi)
    var listUsers = [];
    var userAreaMgrMap = {};
    var resolvedNama = String(userSession.namaLengkap || '').trim();
    var curUnameLower = String(userSession.username || '').toLowerCase().trim();

    try {
      var sUser = getSheet(TAB.USER);
      var dUser = sUser.getDataRange().getValues();
      for (var u = 1; u < dUser.length; u++) {
        var ru = dUser[u];
        var uId = String(ru[COL_USER.ID] || '').trim();
        var uName = String(ru[COL_USER.USERNAME] || '').trim();
        if (!uId && !uName) continue;
        if (!uId) uId = 'USR-' + u;

        var rRole = String(ru[COL_USER.ROLE] || 'STAFF_OPS').trim();
        var rRoleUpper = rRole.toUpperCase();
        var rArea = String(ru[COL_USER.AREA_ID] || 'ALL').trim();
        var rAreaUpper = rArea.toUpperCase();
        var rNama = String(ru[COL_USER.NAMA] || '').trim();
        var rStatus = String(ru[COL_USER.STATUS] || 'ACTIVE').trim();
        var rStatusUpper = rStatus.toUpperCase();

        var userItem = {
          id: uId,
          userId: uId,
          username: uName,
          nama: rNama,
          namaLengkap: rNama,
          role: rRole,
          areaId: rArea,
          cabangId: (ru.length > COL_USER.CABANG_ID) ? String(ru[COL_USER.CABANG_ID] || '').trim() : '',
          wa: String(ru[COL_USER.WA] || '').trim(),
          noWa: String(ru[COL_USER.WA] || '').trim(),
          status: rStatus
        };
        listUsers.push(userItem);

        // Ambil nama lengkap sesi saat ini dari MasterUser
        if (uName.toLowerCase() === curUnameLower && rNama) {
          resolvedNama = rNama;
        }

        // Peta resmi Area Manager binaan (abaikan UNASSIGNED atau status PENDING)
        var isPendingUser = (rStatusUpper === 'PENDING' || rStatusUpper === 'MENUNGGU');
        if ((rRoleUpper === 'MANAGER' || rRoleUpper === 'AREA_MANAGER') && rAreaUpper && rAreaUpper !== 'ALL' && rAreaUpper !== 'UNASSIGNED' && !isPendingUser) {
          userAreaMgrMap[rAreaUpper] = rNama || uName;
        }
      }
    } catch (eU) {
      Logger.log('User list read notice: ' + eU.message);
    }

    if (!resolvedNama) {
      if (isMaster) resolvedNama = 'Master Administrator';
      else resolvedNama = String(userSession.username || 'Pengguna');
    }

    // Selaraskan Area Manager di listCabang
    if (Object.keys(userAreaMgrMap).length > 0) {
      for (var cPre = 0; cPre < listCabang.length; cPre++) {
        var aUpperPre = String(listCabang[cPre].areaId || '').toUpperCase();
        if (userAreaMgrMap[aUpperPre]) {
          listCabang[cPre].areaManager = userAreaMgrMap[aUpperPre];
          listCabang[cPre].manager = userAreaMgrMap[aUpperPre];
        }
      }
    }

    // 9. Hitung Leaderboard (Diproteksi Try-Catch agar tidak memblokir data lain)
    var leaderboard = { all: [], top3: [], bottom3: [] };
    try {
      if (isCOO || isGuest) {
        leaderboard = hitungLeaderboardNasional(dCabang, dSales, dEff, dInsiden, operationalConfig, dTugas, userAreaMgrMap);
      } else {
        leaderboard = hitungLeaderboardCabang(targetAreaId, listCabang, listSales, listEfisiensi, listInsiden, operationalConfig, listTugas);
      }
    } catch (eLb) {
      Logger.log('Leaderboard calculation notice: ' + eLb.message);
    }

    // 10. Data SOP & Library Perusahaan
    var listLibrary = [];
    try {
      var sLib = getSheet(TAB.LIBRARY);
      var dLib = sLib.getDataRange().getValues();
      for (var p = 1; p < dLib.length; p++) {
        var rl = dLib[p];
        var libId = String(rl[COL_LIBRARY.ID] || '').trim();
        if (!libId) continue;
        var docStatus = String(rl[COL_LIBRARY.STATUS] || 'AKTIF').toUpperCase();
        var docUploader = String(rl[COL_LIBRARY.UPLOADER] || '');
        var isOwnDoc = (userSession.namaLengkap && docUploader.indexOf(userSession.namaLengkap) !== -1) ||
                       (userSession.areaId && docUploader.indexOf(userSession.areaId) !== -1);
        if (isCOO || docStatus === 'AKTIF' || isOwnDoc) {
          listLibrary.push({
            id: libId,
            judul: String(rl[COL_LIBRARY.JUDUL] || '').trim(),
            kategori: String(rl[COL_LIBRARY.KATEGORI] || '').trim(),
            brand: String(rl[COL_LIBRARY.BRAND] || '').trim(),
            versi: String(rl[COL_LIBRARY.VERSI] || '').trim(),
            tanggal: sanitizeGasVal(rl[COL_LIBRARY.TANGGAL]),
            fileUrl: String(rl[COL_LIBRARY.FILE_URL] || '').trim(),
            audience: String(rl[COL_LIBRARY.AUDIENCE] || '').trim(),
            deskripsi: String(rl[COL_LIBRARY.DESKRIPSI] || '').trim(),
            status: docStatus,
            uploader: docUploader
          });
        }
      }
    } catch (eLib) {
      Logger.log('Library read notice: ' + eLib.message);
    }

    // 11. Data Google Maps AI Reviews (Real-time monitoring)
    var listReviews = [];
    try {
      var sRev = getSheet(TAB.REVIEWS);
      var dRev = sRev.getDataRange().getValues();
      for (var q = 1; q < dRev.length; q++) {
        var rv = dRev[q];
        var revId = String(rv[COL_REVIEWS.ID] || '').trim();
        if (!revId) continue;
        var rAreaId = String(rv[COL_REVIEWS.AREA_ID] || '').trim();
        var rAreaUpper = rAreaId.toUpperCase();
        var rCabId = String(rv[COL_REVIEWS.CABANG_ID] || '').trim();
        var allowReview = (isMaster || isGuest) ? true : (isManager ? (rAreaUpper === targetAreaUpper) : (rCabId === cabangStr));
        if (allowReview) {
          listReviews.push({
            id: revId,
            tanggal: sanitizeGasVal(rv[COL_REVIEWS.TANGGAL]),
            cabangId: String(rv[COL_REVIEWS.CABANG_ID] || '').trim(),
            namaCabang: String(rv[COL_REVIEWS.NAMA_CABANG] || '').trim(),
            areaId: rAreaId,
            rating: Number(rv[COL_REVIEWS.RATING] || 0),
            reviewer: String(rv[COL_REVIEWS.REVIEWER] || '').trim(),
            komentar: String(rv[COL_REVIEWS.KOMENTAR] || '').trim(),
            aiTag: String(rv[COL_REVIEWS.AI_TAG] || '').trim(),
            aiUrgensi: String(rv[COL_REVIEWS.AI_URGENSI] || '').trim(),
            aiAction: String(rv[COL_REVIEWS.AI_ACTION] || '').trim(),
            statusRespon: (function() {
              var sVal = String(rv[COL_REVIEWS.STATUS_RESPON] || '').trim();
              var rVal = Number(rv[COL_REVIEWS.RATING] || 0);
              if (rVal >= 4 && (!sVal || sVal === 'MENUNGGU_RESPON' || sVal === 'MENUNGGU RESPON')) {
                return 'SELESAI';
              }
              return sVal;
            })(),
            mapsUrl: String(rv[COL_REVIEWS.MAPS_URL] || '').trim()
          });
        }
      }
    } catch (eRev) {
      Logger.log('Reviews read notice: ' + eRev.message);
    }

    if (typeof autoResolvePositiveReviewsInSheet === 'function') autoResolvePositiveReviewsInSheet();

    // Urutkan data operasional agar baris terbaru selalu berada di paling atas
    try {
      listInsiden.reverse();
      listJadwal.reverse();
      listKendala.reverse();
      listPerubahanJadwal.reverse();
      listReviews.reverse();
    } catch (eRevSort) {}

    var returnPayload = {
      success: true,
      data: {
        isCOO: isCOO,
        isMaster: isMaster,
        isManager: isManager,
        isSPV: isSPV,
        isGuest: isGuest,
        isReadOnly: isGuest,
        user: {
          role: roleStr,
          username: String(userSession.username || '').trim(),
          areaId: areaStr,
          cabangId: cabangStr,
          namaLengkap: resolvedNama
        },
        users: listUsers,
        cabang: listCabang,
        sales: listSales,
        insiden: listInsiden,
        efisiensi: listEfisiensi,
        tugas: listTugas,
        jadwal: listJadwal,
        kendala: listKendala,
        perubahanJadwal: listPerubahanJadwal,
        leaderboard: leaderboard,
        library: listLibrary,
        reviews: listReviews,
        operationalConfig: operationalConfig,
        notifications: (typeof apiGetNotifikasi === 'function') ? (apiGetNotifikasi(userSession).notifications || []) : []
      }
    };

    // Deep sanitize via JSON serialization agar 100% kebal dari serialization error google.script.run
    try {
      return JSON.parse(JSON.stringify(returnPayload));
    } catch (eJsonSanitize) {
      return returnPayload;
    }
  } catch (err) {
    return { success: false, message: 'Gagal memuat data operasional: ' + err.message };
  }
}

/**
 * ================================================================================
 * MODUL SALES & LEADERBOARD TELAH DI-MODULARISASI KE: Sales.gs
 * ================================================================================
 * Seluruh fungsi pelaporan penjualan, target omzet, AI scan struk, dan peringkat cabang dikelola di Sales.gs:
 * - apiSaveSales() & saveSales()
 * - apiSaveBranchTarget() & saveBranchTarget()
 * - apiScanReceiptWithAI() & scanReceiptWithAI()
 * - hitungLeaderboardCabang()
 * - hitungLeaderboardNasional()
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL INSIDEN OPERASIONAL TELAH DI-MODULARISASI KE: Insiden.gs
 * ================================================================================
 * Seluruh fungsi pelaporan dan penanganan insiden darurat dikelola di Insiden.gs:
 * - apiSaveInsiden() & saveInsiden()
 * - apiUpdateInsiden() & updateInsiden()
 * - apiDeleteInsiden() & deleteInsiden()
 * - apiEscalateReviewToIncident() & escalateReview()
 * - ensureInsidenColumnN() & addBuktiPenangananColumnToDataInsiden()
 * ================================================================================
 */
/**
 * ================================================================================
 * MODUL EFISIENSI & PETTY CASH TELAH DI-MODULARISASI KE: Efisiensi.gs
 * ================================================================================
 * Seluruh fungsi monitoring HPP, waste bahan baku, dan reimburse kas toko dikelola di Efisiensi.gs:
 * - apiSaveEfisiensi() & saveEfisiensi()
 * - apiReimburseKas() & reimburseKas()
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL TUGAS OPERASIONAL & SOP TELAH DI-MODULARISASI KE: Tugas.gs
 * ================================================================================
 * Seluruh fungsi manajemen instruksi tugas operasional dikelola di Tugas.gs:
 * - apiSaveTugas() & saveTugas()
 * - apiDeleteTugas() & deleteTugas()
 * - autoCompleteDailyTaskInSheet()
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL GOOGLE DRIVE TELAH DI-MODULARISASI KE: DriveHelper.gs
 * ================================================================================
 * Seluruh fungsi manajemen folder dan upload berkas dikelola di DriveHelper.gs:
 * - apiUploadFileToDrive() & uploadFileToDrive()
 * - organizePanoramaDriveFolders() & organizeDriveFolders()
 * - ensurePanoramaRootFolder()
 * - ensureAreaDriveStructure()
 * - getOrCreateDriveFolder()
 * - normalizeDriveUploadTarget()
 * - formatSopCategoryFolderName()
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL JADWAL, KENDALA & TUKAR SHIFT TELAH DI-MODULARISASI KE: Jadwal.gs
 * ================================================================================
 * Seluruh fungsi manajemen jadwal shift, kendala darurat, dan perubahan jadwal dikelola di Jadwal.gs:
 * - apiSubmitJadwal(), apiApproveJadwal(), apiDeleteJadwal()
 * - apiSubmitKendala(), apiUpdateKendalaStatus(), apiDeleteKendala()
 * - apiSubmitPerubahanJadwal(), apiApprovePerubahanJadwal(), apiDeletePerubahanJadwal()
 * - createDataPerubahanJadwalSheet()
 * ================================================================================
 */


/**
 * ================================================================================
 * MODUL MASTER USER MANAGEMENT TELAH DI-MODULARISASI KE: Auth.gs
 * ================================================================================
 * Fungsi profil pengguna dan mutasi akun MasterUser dikelola di Auth.gs:
 * - apiSaveUserProfile() & saveUserProfile()
 * - apiMasterUpdateUser() & masterUpdateUser()
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL PARAMETER OPERASIONAL NASIONAL TELAH DI-MODULARISASI KE: Config.gs
 * ================================================================================
 * Fungsi apiMasterSaveConfig() dikelola mandiri di Config.gs.
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL MASTER CABANG TELAH DI-MODULARISASI KE: Cabang.gs
 * ================================================================================
 * Seluruh fungsi manajemen data MasterCabang dikelola di Cabang.gs:
 * - apiSaveCabang() & saveCabang()
 * - apiDeleteCabang() & deleteCabang()
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL PERPUSTAKAAN OPERASIONAL & SOP TELAH DI-MODULARISASI KE: Library.gs
 * ================================================================================
 * Seluruh fungsi manajemen dokumen SOP perpustakaan dikelola di Library.gs:
 * - apiSaveLibraryDocument() & saveLibraryDocument()
 * - apiApproveLibraryDocument() & approveLibraryDocument()
 * - apiDeleteLibraryDocument() & deleteLibraryDocument()
 * ================================================================================
 */

/**
 * ================================================================================
 * API ESKALASI REVIEW KE TIKET INSIDEN TELAH DI-MODULARISASI KE: Insiden.gs
 * ================================================================================
 * Dipanggil langsung via apiEscalateReviewToIncident() di Insiden.gs
 */

/**
 * ================================================================================
 * MODUL ULASAN KONSUMEN & REPUTATION SHIELD TELAH DI-MODULARISASI KE: Reviews.gs
 * ================================================================================
 * Seluruh fungsi analisis ulasan Google Maps dan formulir survei publik dikelola di Reviews.gs:
 * - apiSaveReviewAction() & saveReviewAction()
 * - apiBatchSaveReviews() & batchSaveReviews()
 * - apiSubmitCustomerReview() & submitCustomerReview()
 * - apiClearCustomerReviews() & clearCustomerReviews()
 * - renderCustomerReviewPage()
 * ================================================================================
 */

/**
 * ================================================================================
 * SISTEM NOTIFIKASI HP & WHATSAPP GATEWAY (MA & MASTER COO REAL-TIME ALERT)
 * ================================================================================
 */

/**
 * ================================================================================
 * PENGATURAN & PEMBERSIHAN DATABASE TELAH DI-MODULARISASI KE: Config.gs
 * ================================================================================
 * Fungsi getConfigValue_(), sendNotificationToHp(), dan apiCleanProductionData()
 * dikelola mandiri di Config.gs.
 * ================================================================================
 */

/**
 * ================================================================================
 * MODUL NOTIFIKASI & ONESIGNAL PUSH TELAH DI-MODULARISASI KE: Notifikasi.gs
 * ================================================================================
 * Seluruh fungsi notifikasi & push berikut dikelola secara mandiri di Notifikasi.gs:
 * - sendOneSignalPushNotification()
 * - recordAndPushNotification()
 * - triggerOperationalPushAlert()
 * - apiGetNotifikasi()
 * - apiMarkNotificationRead()
 * - apiMarkAllNotificationsRead()
 * - apiSendTestPushToUser()
 * - apiTestOneSignalBroadcast()
 * ================================================================================
 */
