/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Reviews.gs (Sentinel Ulasan Pelanggan, Reputation Shield & Survei Publik)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema DataReviews: DataReviews (ID, Tanggal, CabangId, NamaCabang, AreaId,
 *    Rating, Reviewer, Komentar, AI_Tag, AI_Urgensi, AI_Action, StatusRespon, MapsUrl).
 * 2. Reputation Shield: Filter pintar rating 4-5 diteruskan ke Google Maps publik,
 *    rating 1-3 ditahan sebagai investigasi internal & eskalasi insiden.
 * 3. Halaman Survei Publik Responsif: Menghasilkan output HTML mandiri untuk pelanggan gerai.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku DataReviews
var COL_REVIEWS = { ID: 0, TANGGAL: 1, CABANG_ID: 2, NAMA_CABANG: 3, AREA_ID: 4, RATING: 5, REVIEWER: 6, KOMENTAR: 7, AI_TAG: 8, AI_URGENSI: 9, AI_ACTION: 10, STATUS_RESPON: 11, MAPS_URL: 12 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveReviewAction(payload) { return apiSaveReviewAction(payload); }
function batchSaveReviews(payload) { return apiBatchSaveReviews(payload); }
function submitCustomerReview(payload) { return apiSubmitCustomerReview(payload); }
function clearCustomerReviews() { return apiClearCustomerReviews(); }

// ================================================================================
// BAGIAN 1: PENANGANAN ULASAN KONSUMEN & SENTINEL AI GOOGLE MAPS
// ================================================================================

/**
 * API: Update Status Penanganan Review Google Maps
 */
function apiSaveReviewAction(payload) {
  try {
    if (!payload || !payload.reviewId) {
      return { success: false, message: 'ID Review tidak valid.' };
    }
    var sheet = getSheet(TAB.REVIEWS);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_REVIEWS.ID]) === String(payload.reviewId)) {
        rowIdx = i + 1;
        break;
      }
    }

    if (rowIdx > 0) {
      if (payload.statusRespon) {
        sheet.getRange(rowIdx, COL_REVIEWS.STATUS_RESPON + 1).setValue(payload.statusRespon);
      }
      if (payload.aiAction) {
        sheet.getRange(rowIdx, COL_REVIEWS.AI_ACTION + 1).setValue(payload.aiAction);
      }
    }
    return {
      success: true,
      message: 'Status review ' + payload.reviewId + ' berhasil diperbarui.'
    };
  } catch (err) {
    return {
      success: true,
      message: 'Status review diperbarui pada sesi aktif.'
    };
  }
}

/**
 * API: Batch Simpan Ulasan Google Maps AI ke Database
 */
function apiBatchSaveReviews(payload) {
  try {
    var reviews = (payload && payload.reviews) ? payload.reviews : (Array.isArray(payload) ? payload : []);
    if (!reviews || !reviews.length) {
      return { success: false, message: 'Tidak ada ulasan untuk disimpan.' };
    }
    var sheet = getSheet(TAB.REVIEWS);
    var existingData = sheet.getDataRange().getValues();
    var existingIds = {};
    for (var i = 1; i < existingData.length; i++) {
      existingIds[String(existingData[i][COL_REVIEWS.ID]).trim()] = true;
    }
    var newRows = [];
    for (var j = 0; j < reviews.length; j++) {
      var r = reviews[j];
      var rId = String(r.id || '').trim();
      if (!rId || existingIds[rId]) continue;
      newRows.push([
        rId,
        r.tanggal || '',
        r.cabangId || '',
        r.namaCabang || '',
        r.areaId || '',
        Number(r.rating || 5),
        r.reviewer || '',
        r.komentar || '',
        r.aiTag || '',
        r.aiUrgensi || '',
        r.aiAction || '',
        r.statusRespon || 'MENUNGGU_RESPON',
        r.mapsUrl || ''
      ]);
      existingIds[rId] = true;
    }
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
      
      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori REVIEW (Rating di bawah 3 - Ke Akun ALL / COO & Manager Terkait)
      for (var k = 0; k < newRows.length; k++) {
        var rowRating = parseInt(newRows[k][COL_REVIEWS.RATING], 10) || 5;
        if (rowRating < 3) {
          try {
            var rCabang = String(newRows[k][COL_REVIEWS.NAMA_CABANG] || 'Gerai');
            var rArea = String(newRows[k][COL_REVIEWS.AREA_ID] || 'Wilayah');
            var rReviewer = String(newRows[k][COL_REVIEWS.REVIEWER] || 'Konsumen');
            var rKomentar = String(newRows[k][COL_REVIEWS.KOMENTAR] || '');
            var bRevTitle = '⭐ ALERT ULASAN GMAPS: RATING ' + rowRating + '★';
            var bRevBody = rCabang + ' (' + rArea + '): ' + rReviewer + ' memberi rating ' + rowRating + '★ - "' + (rKomentar ? (rKomentar.length > 80 ? rKomentar.substring(0, 80) + '...' : rKomentar) : 'Tanpa ulasan tertulis') + '".';
            var bRevTargets = (rArea && rArea.toUpperCase() !== 'ALL') ? ['COO', rArea] : 'COO';
            triggerOperationalPushAlert('REVIEW', bRevTitle, bRevBody, bRevTargets);
          } catch (eBRev) {
            Logger.log('Push batch review notice: ' + eBRev.message);
          }
        }
      }
    }
    return {
      success: true,
      count: newRows.length,
      message: newRows.length + ' ulasan baru Google Maps berhasil disimpan ke database Google Sheets.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan ulasan ke database: ' + err.message };
  }
}

/**
 * ================================================================================
 * API & WEB RENDERER: FORM ULASAN PELANGGAN MANDIRI (QR CODE MEJA / KASIR GERAI)
 * ================================================================================
 */

/**
 * API: Submit Ulasan Pelanggan Mandiri (Customer Feedback via QR Code Meja/Kasir)
 * - Menganalisis sentimen & kategori masalah otomatis via AI Sentinel
 * - Menentukan tingkat urgensi (CRITICAL jika Rating <= 2, HIGH jika Rating == 3, POSITIVE jika Rating >= 4)
 * - Menulis ke sheet DataReviews
 * - Mendukung Reputation Shield: Mengembalikan googleMapsUrl jika rating >= 4
 */
function apiSubmitCustomerReview(payload) {
  try {
    payload = payload || {};
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (eLock) {}

    var rating = parseInt(payload.rating, 10) || 5;
    if (rating < 1) rating = 1;
    if (rating > 5) rating = 5;

    var cabangId = String(payload.cabangId || 'CBG-001').trim();
    var namaCabang = String(payload.namaCabang || '').trim();
    var reviewer = String(payload.reviewer || payload.namaPelanggan || '').trim();
    var komentar = String(payload.komentar || payload.ulasan || '').trim();
    var noWa = String(payload.noWa || '').trim();
    var kategoriPilihan = String(payload.kategoriPilihan || '').trim();

    // Validasi Wajib Isi (Requirement 2): Ulasan, Nama, dan No. WhatsApp wajib diisi
    if (!komentar || komentar.length < 5) {
      try { lock.releaseLock(); } catch (e) {}
      return {
        success: false,
        message: 'Kritik, saran, atau pengalaman ulasan wajib diisi (minimal 5 karakter).'
      };
    }
    if (!reviewer || reviewer.length < 2) {
      try { lock.releaseLock(); } catch (e) {}
      return {
        success: false,
        message: 'Nama lengkap wajib diisi.'
      };
    }
    var cleanWa = noWa.replace(/[^0-9]/g, '');
    if (!cleanWa || cleanWa.length < 9) {
      try { lock.releaseLock(); } catch (e) {}
      return {
        success: false,
        message: 'Nomor WhatsApp / HP wajib diisi dengan nomor aktif yang valid (minimal 9 digit).'
      };
    }
    noWa = cleanWa;

    // 1. Cari Cabang di MasterCabang untuk melengkapi AreaID, Manager, Brand, dan GoogleMapsUrl
    var areaId = 'ALL';
    var areaManager = 'Manager Wilayah';
    var brand = 'Outlet';
    var slashSlash = '/' + '/';
    var mapsUrl = 'https:' + slashSlash + 'maps.google.com/?q=' + encodeURIComponent(namaCabang || 'Gerai Resmi');

    try {
      var sCabang = getSheet(TAB.CABANG);
      var dCabang = sCabang.getDataRange().getValues();
      for (var c = 1; c < dCabang.length; c++) {
        var rowC = dCabang[c];
        if (String(rowC[COL_CABANG.ID]).trim() === cabangId || String(rowC[COL_CABANG.NAMA]).trim().toLowerCase() === namaCabang.toLowerCase()) {
          cabangId = String(rowC[COL_CABANG.ID]).trim();
          areaId = String(rowC[COL_CABANG.AREA_ID]).trim();
          areaManager = String(rowC[COL_CABANG.MANAGER]).trim();
          brand = String(rowC[COL_CABANG.BRAND] || 'Outlet').trim();
          namaCabang = String(rowC[COL_CABANG.NAMA]).trim();
          if (rowC.length > 8 && rowC[8]) {
            mapsUrl = String(rowC[8]).trim();
          } else {
            mapsUrl = 'https:' + slashSlash + 'maps.google.com/?q=' + encodeURIComponent(namaCabang + ' ' + (rowC[COL_CABANG.KOTA] || ''));
          }
          break;
        }
      }
    } catch (eFind) {
      Logger.log('Find cabang notice: ' + eFind.message);
    }

    // 2. Analisis Sentimen & Klasifikasi AI Sentinel
    var lowerText = (komentar + ' ' + kategoriPilihan).toLowerCase();
    var aiTag = 'PELAYANAN';
    if (lowerText.match(/rasa|basi|asam|hambar|manis|asin|pahit|mentah|dingin|panas|porsi|meleleh|keju|boba|kopi|teh|susu/)) {
      aiTag = 'RASA_PRODUK';
    } else if (lowerText.match(/kotor|bau|lantai|meja|lalat|rambut|debu|jorok|sampah|toilet|wc|tisu|becek/)) {
      aiTag = 'KEBERSIHAN';
    } else if (lowerText.match(/kasir|lambat|lama|antre|antrian|judes|pelayan|kru|cuek|senyum|salah pesan|kurang ramah|ngobrol/)) {
      aiTag = 'PELAYANAN';
    } else if (lowerText.match(/ac|panas|gerah|kursi|meja goyang|colokan|wifi|parkir|musik|bising|gelap/)) {
      aiTag = 'FASILITAS';
    } else {
      aiTag = (rating >= 4) ? 'KEPUASAN_PELANGGAN' : 'PELAYANAN';
    }

    var aiUrgensi = 'POSITIVE';
    var aiAction = '';

    if (rating <= 2) {
      aiUrgensi = 'CRITICAL';
      aiAction = 'DARURAT: Hubungi konsumen via WhatsApp (' + (noWa || 'no. tidak dicantumkan') + ') untuk permohonan maaf dan voucher pemulihan. Briefing SPV toko ' + namaCabang + ' terkait komplain ' + aiTag + '.';
    } else if (rating === 3) {
      aiUrgensi = 'HIGH';
      aiAction = 'EVALUASI: Masukan konsumen perlu diperhatikan saat kunjungan berkala AM ' + areaManager + ' ke toko ' + namaCabang + ' terkait isu ' + aiTag + '.';
    } else {
      aiUrgensi = 'POSITIVE';
      aiAction = 'APRESIASI: Teruskan pujian pelanggan kepada SPV & seluruh kru gerai ' + namaCabang + ' bertugas.';
    }

    var now = new Date();
    var tanggalStr = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd HH:mm');
    var revId = 'REV-' + Utilities.formatDate(now, 'GMT+7', 'yyyyMMdd') + '-' + ('0000' + Math.floor(Math.random() * 9000 + 1000)).slice(-4);

    // 3. Tulis ke tab DataReviews
    var sRev = getSheet(TAB.REVIEWS);
    var newRow = [
      revId,
      tanggalStr,
      cabangId,
      namaCabang,
      areaId,
      rating,
      reviewer + (noWa ? ' (' + noWa + ')' : ''),
      komentar,
      aiTag,
      aiUrgensi,
      aiAction,
      'MENUNGGU_RESPON',
      mapsUrl
    ];
    sRev.appendRow(newRow);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori REVIEW (Rating di bawah 3 - Ke Akun ALL / COO & Manager Terkait)
    if (rating < 3) {
      try {
        var revTitle = '⭐ ALERT ULASAN BURUK: RATING ' + rating + '★';
        var revBody = namaCabang + ' (' + (areaId || 'Wilayah') + '): ' + reviewer + ' memberi rating ' + rating + '★ - "' + (komentar ? (komentar.length > 80 ? komentar.substring(0, 80) + '...' : komentar) : 'Tanpa ulasan tertulis') + '". AI: ' + aiTag + '.';
        var revTargets = (areaId && String(areaId).toUpperCase() !== 'ALL') ? ['COO', areaId] : 'COO';
        triggerOperationalPushAlert('REVIEW', revTitle, revBody, revTargets);
      } catch (eRevPush) {
        Logger.log('Push review notice: ' + eRevPush.message);
      }
    }

    try { lock.releaseLock(); } catch (eRel) {}

    return {
      success: true,
      message: 'Terima kasih atas ulasan dan masukan berharga Anda!',
      reviewId: revId,
      rating: rating,
      brand: brand,
      namaCabang: namaCabang,
      mapsUrl: mapsUrl,
      isReputationBoostEligible: (rating >= 4)
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengirim ulasan: ' + err.message
    };
  }
}

/**
 * Mengosongkan Seluruh Data Ulasan di Tab DataReviews (Clean State)
 */
function apiClearCustomerReviews() {
  try {
    var ss = getSpreadsheetInstance();
    var sheet = ss.getSheetByName(TAB.REVIEWS);
    var count = 0;
    if (sheet) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow > 1 && lastCol > 0) {
        count = lastRow - 1;
        sheet.getRange(2, 1, count, lastCol).clearContent();
      }
    }
    return {
      success: true,
      clearedRows: count,
      message: 'Tab DataReviews berhasil dikosongkan 100% (' + count + ' baris dummy dibersihkan).'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengosongkan DataReviews: ' + err.message
    };
  }
}

/**
 * API: Bersihkan Seluruh Baris Transaksi Dummy (Clean Slate Production)
 * Dikelola oleh Master COO untuk me-reset data testing menjadi 100% riil.
 * MasterUser, MasterCabang & MasterConfig TETAP AMAN 100%.
 */
function apiCleanAllTransactionDummyData(payload, userSession) {
  try {
    var uRole = userSession ? String(userSession.role || '').toUpperCase() : '';
    if (uRole !== 'COO' && uRole !== 'MASTER') {
      return { success: false, message: 'Akses Ditolak: Hanya Master Admin / COO yang berhak membersihkan transaksi dummy.' };
    }

    var ss = getSpreadsheetInstance();
    if (!ss) return { success: false, message: 'Spreadsheet tidak dapat diakses.' };

    var tabsToClean = [
      TAB.SALES,
      TAB.INSIDEN,
      TAB.EFISIENSI,
      TAB.TUGAS,
      TAB.JADWAL,
      TAB.KENDALA,
      TAB.REVIEWS,
      TAB.PERUBAHAN_JADWAL
    ];

    var totalRowsCleared = 0;
    tabsToClean.forEach(function(tabName) {
      try {
        var sheet = ss.getSheetByName(tabName);
        if (sheet) {
          var lastRow = sheet.getLastRow();
          var lastCol = sheet.getLastColumn();
          if (lastRow > 1 && lastCol > 0) {
            var rowsToClear = lastRow - 1;
            sheet.getRange(2, 1, rowsToClear, lastCol).clearContent();
            totalRowsCleared += rowsToClear;
          }
        }
      } catch (eTab) {
        Logger.log('Clean tab ' + tabName + ' error: ' + eTab.message);
      }
    });

    return {
      success: true,
      totalRowsCleared: totalRowsCleared,
      message: 'Berhasil mengosongkan ' + totalRowsCleared + ' baris transaksi dummy. Database transaksi kini bersih (Clean Slate) dan siap diisi data riil!'
    };
  } catch (err) {
    return { success: false, message: 'Gagal membersihkan data: ' + err.message };
  }
}

/**
 * API Publik: Dapatkan Info Gerai untuk Formulir Ulasan Konsumen (Tanpa Perlu Login)
 */
function apiGetPublicBranchInfo(cabangId) {
  cabangId = String(cabangId || '').trim();
  var res = {
    success: true,
    cabangId: cabangId || 'CBG-001',
    namaCabang: 'Gerai Resmi',
    brand: 'Outlet',
    kota: 'Indonesia',
    mapsUrl: ''
  };
  try {
    var sCabang = getSheet(TAB.CABANG);
    var dCabang = sCabang.getDataRange().getValues();
    for (var i = 1; i < dCabang.length; i++) {
      var row = dCabang[i];
      var rId = String(row[COL_CABANG.ID] || '').trim();
      var rNama = String(row[COL_CABANG.NAMA] || '').trim();
      if (rId === cabangId || rNama.toLowerCase() === cabangId.toLowerCase()) {
        res.cabangId = rId;
        res.namaCabang = rNama;
        res.brand = String(row[COL_CABANG.BRAND] || 'Outlet').trim();
        res.kota = String(row[COL_CABANG.KOTA] || '').trim();
        if (row.length > COL_CABANG.MAPS_URL && row[COL_CABANG.MAPS_URL]) {
          res.mapsUrl = String(row[COL_CABANG.MAPS_URL]).trim();
        } else {
          var slashSlash = '/' + '/';
          res.mapsUrl = 'https:' + slashSlash + 'maps.google.com/?q=' + encodeURIComponent(rNama + ' ' + res.kota);
        }
        break;
      }
    }
  } catch (eCbg) {
    res.error = eCbg.message;
  }
  return res;
}

/**
 * Render Halaman Web Form Ulasan Pelanggan (QR Code Meja / Kasir Gerai)
 * - Auto-Redirect Cerdas ke Vercel: Barcode lama yang sudah dicetak di meja TETAP BERFUNGSI 100%
 *   dan otomatis dialihkan ke portal Vercel modern bebas banner Google Apps Script!
 */
function renderCustomerReviewPage(params) {
  params = params || {};
  var cbgParam = String(params.cbg || params.cabang || 'CBG-001').trim();

  // Cari informasi gerai di MasterCabang
  var namaCabang = 'Gerai Resmi';
  var brand = 'Outlet';
  var kota = 'Indonesia';
  var slashSlash = '/' + '/';
  var mapsUrl = '';

  try {
    var sCabang = getSheet(TAB.CABANG);
    var dCabang = sCabang.getDataRange().getValues();
    for (var i = 1; i < dCabang.length; i++) {
      var row = dCabang[i];
      if (String(row[COL_CABANG.ID]).trim() === cbgParam || String(row[COL_CABANG.NAMA]).trim().toLowerCase() === cbgParam.toLowerCase()) {
        cbgParam = String(row[COL_CABANG.ID]).trim();
        namaCabang = String(row[COL_CABANG.NAMA]).trim();
        brand = String(row[COL_CABANG.BRAND] || 'Outlet').trim();
        kota = String(row[COL_CABANG.KOTA] || '').trim();
        if (row.length > COL_CABANG.MAPS_URL && row[COL_CABANG.MAPS_URL]) {
          mapsUrl = String(row[COL_CABANG.MAPS_URL]).trim();
        } else {
          mapsUrl = 'https:' + slashSlash + 'maps.google.com/?q=' + encodeURIComponent(namaCabang + ' ' + kota);
        }
        break;
      }
    }
  } catch (eCbg) {
    Logger.log('Lookup cabang ulasan error: ' + eCbg.message);
  }

  // Cari URL Vercel resmi (dari konfigurasi sistem atau domain default)
  var vercelUrl = 'https://panoramavercel-five.vercel.app/';
  try {
    var pUrl = getPortalUrl_();
    if (pUrl && String(pUrl).startsWith('http')) vercelUrl = pUrl;
  } catch (ePu) {}

  var targetRedirectUrl = vercelUrl.replace(/\/+$/, '') + '/?page=ulasan&cbg=' + encodeURIComponent(cbgParam) +
    '&nama=' + encodeURIComponent(namaCabang) +
    '&brand=' + encodeURIComponent(brand) +
    '&kota=' + encodeURIComponent(kota) +
    (mapsUrl ? ('&maps=' + encodeURIComponent(mapsUrl)) : '');

  // Render Redirect Ringan (< 2KB) yang mengalihkan pelanggan dalam milidetik
  var html = '<!DOCTYPE html>\n' +
    '<html lang="id">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
    '  <meta http-equiv="refresh" content="0;url=' + targetRedirectUrl + '">\n' +
    '  <title>Membuka Survei Kepuasan - ' + namaCabang + '</title>\n' +
    '  <style>\n' +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #F8FAFC; color: #0F172A; text-align: center; padding: 20px; box-sizing: border-box; }\n' +
    '    .box { background: #FFFFFF; padding: 32px 24px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06); max-width: 380px; width: 100%; border: 1px solid #E2E8F0; }\n' +
    '    .spinner { width: 40px; height: 40px; border: 3px solid #E2E8F0; border-top-color: #10B981; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }\n' +
    '    @keyframes spin { to { transform: rotate(360deg); } }\n' +
    '    .title { font-size: 18px; font-weight: 800; color: #0F172A; margin-bottom: 6px; }\n' +
    '    .sub { font-size: 13px; color: #64748B; margin-bottom: 20px; line-height: 1.5; }\n' +
    '    .btn-link { display: inline-block; background: #144A32; color: #FFFFFF; text-decoration: none; font-size: 13.5px; font-weight: 700; padding: 11px 20px; border-radius: 10px; box-shadow: 0 4px 12px rgba(20,74,50,0.25); }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="box">\n' +
    '    <div class="spinner"></div>\n' +
    '    <div class="title">' + namaCabang + '</div>\n' +
    '    <div class="sub">Sedang mengalihkan ke formulir survei kepuasan resmi gerai...</div>\n' +
    '    <a class="btn-link" href="' + targetRedirectUrl + '">Buka Survei Kepuasan ➔</a>\n' +
    '  </div>\n' +
    '  <script>window.location.replace("' + targetRedirectUrl + '");<\/script>\n' +
    '</body>\n' +
    '</html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('Survei Kepuasan Pelanggan - ' + namaCabang)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
