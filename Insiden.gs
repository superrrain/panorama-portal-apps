/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Insiden.gs (Pelaporan Insiden Darurat Gerai, SLA, Bukti & Eskalasi Komplain)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema Insiden: DataInsiden (ID, Tanggal, Area, Cabang, Kategori, Urgensi, Desk,
 *    DriveUrl, Status, Selesai, SLA_Jam, Aksi, Reporter, BuktiPenangananUrl).
 * 2. Hitungan SLA Presisi: Menghitung selisih jam dari laporan hingga selesai.
 * 3. Integrasi Bukti Google Drive: Kolom N (BuktiPenangananUrl) direct view link.
 * 4. Eskalasi Otomatis Review Google Maps: Terhubung langsung ke antrean insiden gerai.
 * 5. Pemicu Push Alert: OneSignal Status Bar & Database DataNotifikasi instan.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku DataInsiden
var COL_INSIDEN = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, KATEGORI: 4, URGENSI: 5, DESK: 6, DRIVE_URL: 7, STATUS: 8, SELESAI: 9, SLA_JAM: 10, AKSI: 11, REPORTER: 12, BUKTI_PENANGANAN: 13, OTORISASI: 14 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveInsiden(payload) { return apiSaveInsiden(payload); }
function deleteInsiden(insidenId, user) { return apiDeleteInsiden(insidenId, user); }
function escalateReview(payload) { return apiEscalateReviewToIncident(payload); }
function approveInsiden(payload, user) { return apiApproveInsiden(payload, user); }

function isGoogleMapsUrl_(u) {
  var s = String(u || '').trim().toLowerCase();
  return Boolean(s && (s.indexOf('maps.google') !== -1 || s.indexOf('goo.gl') !== -1 || s.indexOf('google.com/maps') !== -1 || s.indexOf('maps.app.goo.gl') !== -1));
}

function isCustomerReviewIncident_(rowOrObj) {
  if (!rowOrObj) return false;
  var idStr = '', deskStr = '', repStr = '';
  if (Array.isArray(rowOrObj)) {
    idStr = String(rowOrObj[COL_INSIDEN.ID] || '').trim().toUpperCase();
    deskStr = String(rowOrObj[COL_INSIDEN.DESK] || '').trim().toUpperCase();
    repStr = String(rowOrObj[COL_INSIDEN.REPORTER] || '').trim().toUpperCase();
  } else {
    idStr = String(rowOrObj.insidenId || rowOrObj.id || '').trim().toUpperCase();
    deskStr = String(rowOrObj.deskripsi || '').trim().toUpperCase();
    repStr = String(rowOrObj.reporter || '').trim().toUpperCase();
  }
  if (idStr.indexOf('INS-') === 0) return true;
  if (repStr.indexOf('GOOGLE MAPS') !== -1 || repStr.indexOf('SENTINEL') !== -1) return true;
  if (deskStr.indexOf('[GOOGLE MAPS') !== -1 || deskStr.indexOf('[REV:') !== -1 || deskStr.indexOf('[REV-') !== -1) return true;
  return false;
}

function computeIncidentSlaHours_(rawTLapor) {
  var diffJam = 0.5;
  var rawStr = String(rawTLapor || '').trim();
  var tLapor = new Date(rawStr);
  var tSelesai = new Date();
  if (!isNaN(tLapor.getTime())) {
    if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(rawStr)) {
      var tglLaporStr = rawStr.replace(/\//g, '-');
      var tglNowStr = Utilities.formatDate(tSelesai, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (tglLaporStr === tglNowStr) {
        diffJam = 0.5;
      } else {
        diffJam = Math.round(((tSelesai - tLapor) / (1000 * 60 * 60)) * 10) / 10;
      }
    } else {
      diffJam = Math.round(((tSelesai - tLapor) / (1000 * 60 * 60)) * 10) / 10;
    }
  }
  return Math.max(0.2, diffJam);
}

function resolveIncidentRelatedReviewInSheet_(targetId, rowArray) {
  try {
    var sRev = getSheet(TAB.REVIEWS);
    var dRev = sRev.getDataRange().getValues();
    var incCabId = String(rowArray[COL_INSIDEN.CABANG_ID] || '').trim();
    var incDesk = String(rowArray[COL_INSIDEN.DESK] || '');
    var incKat = String(rowArray[COL_INSIDEN.KATEGORI] || '');
    for (var r = 1; r < dRev.length; r++) {
      var revId = String(dRev[r][COL_REVIEWS.ID] || '').trim();
      var revStatus = String(dRev[r][COL_REVIEWS.STATUS_RESPON] || '');
      var revCabId = String(dRev[r][COL_REVIEWS.CABANG_ID] || '').trim();
      var revReviewer = String(dRev[r][COL_REVIEWS.REVIEWER] || '').trim();

      var isRevMatch = false;
      if (revId && incDesk.indexOf(revId) !== -1) {
        isRevMatch = true;
      } else if (revStatus.indexOf(targetId) !== -1) {
        isRevMatch = true;
      } else if (incCabId && incCabId === revCabId && incKat === 'Komplain Pelanggan') {
        if (revReviewer && incDesk.indexOf(revReviewer) !== -1) {
          isRevMatch = true;
        }
      }

      if (isRevMatch) {
        sRev.getRange(r + 1, COL_REVIEWS.STATUS_RESPON + 1).setValue('RESOLVED / TERJAWAB (' + targetId + ')');
      }
    }
  } catch (eRevSync) {
    Logger.log('Auto-resolve review error: ' + eRevSync.message);
  }
}

// ================================================================================
// BAGIAN 1: PELAPORAN INSIDEN, PENANGANAN SLA & PENGHAPUSAN
// ================================================================================

/**
 * API: Laporkan Insiden Lapangan Baru
 */
function apiSaveInsiden(payload) {
  try {
    var nextId = generateNextId(TAB.INSIDEN, 'INC', COL_INSIDEN.ID, false);
    var sheet = getSheet(TAB.INSIDEN);
    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    var driveUrl = payload.fileDriveUrl || payload.driveUrl || '';
    if (payload.fileData && payload.fileData.dataUri) {
      try {
        var upRes = apiUploadFileToDrive(
          payload.fileData.dataUri,
          payload.fileData.name || ('BuktiAwal_' + nextId + '.jpg'),
          payload.fileData.type || 'image/jpeg',
          payload.areaId || 'AREA-01',
          'DataInsiden'
        );
        if (upRes && upRes.success && upRes.fileUrl) {
          driveUrl = upRes.fileUrl;
        }
      } catch (eUp) {}
    } else if (driveUrl && driveUrl.indexOf('data:') === 0) {
      try {
        var upRes2 = apiUploadFileToDrive(
          driveUrl,
          payload.fileName || ('BuktiAwal_' + nextId + '.jpg'),
          payload.fileType || 'image/jpeg',
          payload.areaId || 'AREA-01',
          'DataInsiden'
        );
        if (upRes2 && upRes2.success && upRes2.fileUrl) {
          driveUrl = upRes2.fileUrl;
        }
      } catch (eUp2) {}
    }

    var newRow = [
      nextId,
      nowStr,
      payload.areaId,
      payload.cabangId,
      payload.kategori,
      payload.urgensi,
      payload.deskripsi,
      driveUrl,
      'OPEN',
      '',
      0,
      payload.tindakan || '',
      payload.reporter,
      ''
    ];

    sheet.appendRow(newRow);
    if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['OTHER_OPS']);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Strictly Isolated Per-Wilayah)
    try {
      var incTitle = '🚨 INSIDEN ' + String(payload.urgensi || 'OPERASIONAL').toUpperCase();
      var incBody = '[' + (payload.kategori || 'Operasional') + '] ' + (payload.cabangId || payload.areaId || 'Gerai') + ': ' + (payload.deskripsi ? String(payload.deskripsi).substring(0, 90) : 'Laporan insiden baru masuk.');
      var incTargets = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'ALL';
      triggerOperationalPushAlert('INSIDEN', incTitle, incBody, incTargets);
    } catch (eIncPush) {
      Logger.log('Push insiden notice: ' + eIncPush.message);
    }

    return { success: true, message: 'Laporan insiden berhasil dikirim ke Command Center COO.', insidenId: nextId, fileDriveUrl: driveUrl };
  } catch (err) {
    return { success: false, message: 'Gagal laporkan insiden: ' + err.message };
  }
}

/**
 * API: Update Status & SLA Insiden
 */
function apiUpdateInsiden(payload, updateData, user) {
  try {
    if (typeof payload === 'string') {
      var strId = payload;
      payload = updateData || {};
      payload.insidenId = strId;
    }
    payload = payload || {};
    user = user || {};
    var roleInfo = (typeof getUserRoleInfo === 'function') ? getUserRoleInfo(user) : { isMaster: false, isManager: false, isSPV: true, isGuest: false };
    if (roleInfo.isGuest) {
      return { success: false, message: 'Akses ditolak: Akun Tamu tidak dapat mengubah status insiden.' };
    }

    var sheet = getSheet(TAB.INSIDEN);
    var data = sheet.getDataRange().getValues();
    var targetId = String(payload.insidenId || '').trim();
    var newStatusUpper = String(payload.newStatus || 'OPEN').trim().toUpperCase();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_INSIDEN.ID]).trim() === targetId) {
        var rowIdx = i + 1;
        var curRow = data[i];
        var isReviewTicket = isCustomerReviewIncident_(curRow);
        var urgUpper = String(curRow[COL_INSIDEN.URGENSI] || 'MEDIUM').trim().toUpperCase();
        var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

        // Upload / update berkas bukti penanganan (HANYA Kolom N: BuktiPenangananUrl)
        var uploadedUrl = '';
        var rawCandidate = payload.buktiPenangananUrl || payload.fileDriveUrl || '';
        if (rawCandidate && !isGoogleMapsUrl_(rawCandidate)) {
          uploadedUrl = String(rawCandidate).trim();
        }
        if (payload.fileData && payload.fileData.dataUri) {
          try {
            var upRes = apiUploadFileToDrive(
              payload.fileData.dataUri,
              payload.fileData.name || ('BuktiProgres_' + targetId + '.jpg'),
              payload.fileData.type || 'image/jpeg',
              curRow[COL_INSIDEN.AREA_ID] || 'AREA-01',
              'DataInsiden'
            );
            if (upRes && upRes.success && upRes.fileUrl) {
              uploadedUrl = upRes.fileUrl;
            }
          } catch (eUp) {
            Logger.log('Upload bukti insiden error: ' + eUp.message);
          }
        }

        var existingHandlingUrl = (curRow.length > COL_INSIDEN.BUKTI_PENANGANAN) ? String(curRow[COL_INSIDEN.BUKTI_PENANGANAN] || '').trim() : '';
        if (isGoogleMapsUrl_(existingHandlingUrl)) existingHandlingUrl = '';
        var effectiveHandlingUrl = uploadedUrl || existingHandlingUrl;

        // ATURAN WAJIB FOTO: Untuk mengajukan ACC (ESKALASI_COO) atau RESOLVED, WAJIB punya foto bukti penanganan nyata!
        if ((newStatusUpper === 'ESKALASI_COO' || newStatusUpper === 'RESOLVED') && !effectiveHandlingUrl) {
          return {
            success: false,
            code: 'PHOTO_PROOF_REQUIRED',
            message: 'Wajib mengunggah foto bukti penanganan (sudah dikerjakan) sebelum mengubah status!'
          };
        }

        // ATURAN HAK ACC LAPORAN LAPANGAN (INC-*): Review bisa langsung RESOLVED asal ada foto; Lapangan butuh ACC sesuai urgensi
        if (!isReviewTicket && newStatusUpper === 'RESOLVED') {
          if (urgUpper === 'CRITICAL' && !roleInfo.isMaster) {
            return {
              success: false,
              code: 'COO_APPROVAL_REQUIRED',
              message: 'Insiden tingkat CRITICAL wajib di-ACC oleh Master COO terlebih dahulu sebelum status menjadi RESOLVED.'
            };
          }
          if (urgUpper !== 'CRITICAL' && !roleInfo.isMaster && !roleInfo.isManager) {
            return {
              success: false,
              code: 'MANAGER_APPROVAL_REQUIRED',
              message: 'Insiden lapangan tingkat ' + urgUpper + ' wajib di-ACC oleh Area Manager terlebih dahulu.'
            };
          }
        }

        sheet.getRange(rowIdx, COL_INSIDEN.STATUS + 1).setValue(newStatusUpper);
        if (payload.tindakan !== undefined && String(payload.tindakan).trim() !== '') {
          sheet.getRange(rowIdx, COL_INSIDEN.AKSI + 1).setValue(payload.tindakan);
        }

        // Simpan ke Kolom N: BuktiPenangananUrl di Google Spreadsheet (pisahkan dari Foto Kejadian Awal / Maps di Kolom H)
        ensureInsidenColumnN(sheet);
        if (uploadedUrl) {
          sheet.getRange(rowIdx, COL_INSIDEN.BUKTI_PENANGANAN + 1).setValue(uploadedUrl);
        }

        var diffJam = 0.5;
        if (newStatusUpper === 'RESOLVED') {
          sheet.getRange(rowIdx, COL_INSIDEN.SELESAI + 1).setValue(nowStr);
          diffJam = computeIncidentSlaHours_(curRow[COL_INSIDEN.TANGGAL]);
          sheet.getRange(rowIdx, COL_INSIDEN.SLA_JAM + 1).setValue(diffJam);

          if (isReviewTicket) {
            resolveIncidentRelatedReviewInSheet_(targetId, curRow);
          }
        }

        if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['OTHER_OPS']);

        // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Strictly Isolated Per-Wilayah)
        try {
          var updateTitle = '🛠️ STATUS INSIDEN ' + targetId;
          var updateBody = 'Status insiden telah diubah menjadi ' + newStatusUpper + ' oleh ' + (user && user.namaLengkap ? user.namaLengkap : 'Petugas Operasional') + '.';
          var incArea = curRow ? curRow[COL_INSIDEN.AREA_ID] : '';
          var incUpTargets = (incArea && String(incArea).toUpperCase() !== 'ALL') ? ['COO', incArea] : 'ALL';
          triggerOperationalPushAlert('INSIDEN', updateTitle, updateBody, incUpTargets);
        } catch (eIncUpPush) {
          Logger.log('Push update insiden notice: ' + eIncUpPush.message);
        }

        return {
          success: true,
          message: 'Status insiden ' + targetId + ' berhasil diperbarui menjadi ' + newStatusUpper + '.' + (uploadedUrl ? ' Foto bukti penanganan tersimpan.' : ''),
          newStatus: newStatusUpper,
          slaJam: diffJam,
          waktuSelesai: (newStatusUpper === 'RESOLVED') ? nowStr : '',
          buktiPenangananUrl: effectiveHandlingUrl,
          fileDriveUrl: effectiveHandlingUrl
        };
      }
    }
    return { success: false, message: 'Insiden ID tidak ditemukan.' };
  } catch (err) {
    return { success: false, message: 'Gagal perbarui insiden: ' + err.message };
  }
}

// Global aliases for direct google.script.run support
function updateInsiden(payload, updateData, user) {
  return apiUpdateInsiden(payload, updateData, user);
}

/**
 * API: Hapus Data Insiden (DIBEDAKAN: Customer Review khusus Master COO; Laporan Lapangan boleh sesuai scope)
 */
function apiDeleteInsiden(insidenId, user) {
  try {
    if (typeof insidenId === 'object' && insidenId !== null) {
      if (!user && insidenId.user) user = insidenId.user;
      insidenId = insidenId.insidenId || insidenId.id;
    }
    var targetId = String(insidenId || '').trim();
    if (!targetId) {
      return { success: false, message: 'ID Insiden tidak valid.' };
    }

    var roleInfo = (typeof getUserRoleInfo === 'function') ? getUserRoleInfo(user || {}) : { isMaster: false, isManager: false, isSPV: true, isGuest: false };
    if (roleInfo.isGuest) {
      return { success: false, code: 'FORBIDDEN_GUEST', message: 'Akses ditolak: Akun Tamu tidak dapat menghapus insiden.' };
    }

    var sheet = getSheet(TAB.INSIDEN);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    var targetRow = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_INSIDEN.ID]).trim() === targetId) {
        rowIdx = i + 1;
        targetRow = data[i];
        break;
      }
    }
    if (rowIdx === -1 || !targetRow) {
      return { success: false, message: 'Laporan insiden ' + targetId + ' tidak ditemukan.' };
    }

    var isFromReview = isCustomerReviewIncident_(targetRow);
    if (isFromReview && !roleInfo.isMaster) {
      return {
        success: false,
        code: 'FORBIDDEN_DELETE_REVIEW_INCIDENT',
        message: 'Akses ditolak: Insiden hasil Customer Review hanya dapat dihapus oleh Master COO.'
      };
    }

    if (!isFromReview && !roleInfo.isMaster) {
      var uAreaUpper = String((user && user.areaId) || '').trim().toUpperCase();
      var uCabUpper = String((user && user.cabangId) || '').trim().toUpperCase();
      var rowAreaUpper = String(targetRow[COL_INSIDEN.AREA_ID] || '').trim().toUpperCase();
      var rowCabUpper = String(targetRow[COL_INSIDEN.CABANG_ID] || '').trim().toUpperCase();

      if (roleInfo.isManager && uAreaUpper && uAreaUpper !== 'ALL' && rowAreaUpper && rowAreaUpper !== uAreaUpper) {
        return { success: false, code: 'FORBIDDEN_SCOPE', message: 'Area Manager hanya dapat menghapus laporan wilayahnya sendiri.' };
      }
      if (roleInfo.isSPV && uCabUpper && uCabUpper !== 'ALL' && rowCabUpper && rowCabUpper !== uCabUpper) {
        return { success: false, code: 'FORBIDDEN_SCOPE', message: 'SPV hanya dapat menghapus laporan milik gerainya sendiri.' };
      }
    }

    sheet.deleteRow(rowIdx);
    if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['OTHER_OPS']);
    return { success: true, message: 'Laporan insiden ' + targetId + ' berhasil dihapus dari sistem.' };
  } catch (err) {
    return { success: false, message: 'Gagal menghapus insiden: ' + err.message };
  }
}

// ================================================================================
// BAGIAN 2: ESKALASI KOMPLAIN REVIEW GOOGLE MAPS KE TIKET INSIDEN
// ================================================================================

/**
 * API: Eskalasi Komplain Google Maps ke Tiket Insiden Resmi (SLA Terukur + Anti-Duplikasi)
 */
function apiEscalateReviewToIncident(payload) {
  try {
    if (!payload || !payload.cabangId) {
      return { success: false, message: 'Data komplain tidak lengkap untuk eskalasi.' };
    }

    var sInsiden = getSheet(TAB.INSIDEN);
    var dIns = sInsiden.getDataRange().getValues();
    var reqRevId = String(payload.reviewId || '').trim();

    // Anti-duplikasi ketat berdasarkan ReviewID
    if (reqRevId) {
      for (var d = 1; d < dIns.length; d++) {
        var existingDesk = String(dIns[d][COL_INSIDEN.DESK] || '');
        if (existingDesk.indexOf(reqRevId) !== -1) {
          return {
            success: true,
            alreadyEscalated: true,
            insidenId: String(dIns[d][COL_INSIDEN.ID] || ''),
            message: 'Komplain ini sudah otomatis terdaftar sebagai tiket Insiden (' + String(dIns[d][COL_INSIDEN.ID] || '') + ').'
          };
        }
      }
    }

    var insId = generateNextId(TAB.INSIDEN, 'INS', COL_INSIDEN.ID, false);
    var now = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    var ratingStar = payload.rating ? (payload.rating + ' Bintang') : 'Negatif';
    var revTag = reqRevId ? (' [REV:' + reqRevId + ']') : '';
    var deskripsiKasus = '[GOOGLE MAPS ' + ratingStar + ']' + revTag + ' Dari ' + (payload.reviewer || 'Pelanggan') + ' di ' + (payload.namaCabang || payload.cabangId) + ': "' + (payload.komentar || '-') + '". Analisis AI: ' + (payload.aiAction || '-');
    var urgensi = (Number(payload.rating) <= 2 || payload.urgensi === 'CRITICAL') ? 'CRITICAL' : 'HIGH';
    var slaHours = (urgensi === 'CRITICAL') ? 6 : 12;

    var rowInsiden = [
      insId,
      nowStr,
      payload.areaId || '',
      payload.cabangId,
      'Komplain Pelanggan',
      urgensi,
      deskripsiKasus,
      payload.mapsUrl || '',
      'OPEN',
      '',
      slaHours,
      'Investigasi lapangan & Customer Recovery: ' + (payload.aiAction || 'Hubungi konsumen & perbaiki SOP pelayanan'),
      'AI Google Maps Sentinel',
      ''
    ];
    sInsiden.appendRow(rowInsiden);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Eskalasi Komplain Rating Buruk ke Insiden Resmi)
    try {
      var escTitle = '🚨 KOMPLAIN KONSUMEN OTOMATIS (' + urgensi + ')';
      var escBody = (payload.namaCabang || payload.cabangId || 'Gerai') + ' (' + (payload.areaId || 'Wilayah') + '): Komplain ' + ratingStar + ' otomatis masuk ke Tiket ' + insId + ' (SLA ' + slaHours + ' Jam).';
      var escTargets = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'COO';
      triggerOperationalPushAlert('INSIDEN', escTitle, escBody, escTargets);
    } catch (eEscPush) {
      Logger.log('Push escalate review notice: ' + eEscPush.message);
    }

    // 2. Tandai di DataReviews sebagai ESCALATED
    if (reqRevId) {
      try {
        var sRev = getSheet(TAB.REVIEWS);
        var dRev = sRev.getDataRange().getValues();
        for (var r = 1; r < dRev.length; r++) {
          if (String(dRev[r][COL_REVIEWS.ID]).trim() === reqRevId) {
            sRev.getRange(r + 1, COL_REVIEWS.STATUS_RESPON + 1).setValue('ESCALATED_TO_INCIDENT (' + insId + ')');
            break;
          }
        }
      } catch (eRevMark) {
        Logger.log('Review mark notice: ' + eRevMark.message);
      }
    }

    if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['OTHER_OPS']);

    return {
      success: true,
      message: 'Komplain ' + (payload.namaCabang || payload.cabangId) + ' berhasil masuk ke Tiket Insiden Resmi: ' + insId + ' (SLA: ' + slaHours + ' Jam)',
      insidenId: insId
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengeskalasi ulasan ke insiden: ' + err.message
    };
  }
}

// ================================================================================
// BAGIAN 3: UTILITAS SKEMA KOLOM N (BUKTIPENANGANANURL)
// ================================================================================

/**
 * Utility: Pastikan Kolom N (BuktiPenangananUrl) ada di DataInsiden
 */
function ensureInsidenColumnN(sheet) {
  try {
    if (!sheet) return;
    var lastCol = sheet.getLastColumn();
    if (lastCol < 14 || String(sheet.getRange(1, 14).getValue() || '').trim() === '') {
      var headerCell = sheet.getRange(1, 14);
      headerCell.setValue('BuktiPenangananUrl');
      headerCell.setBackground('#144A32').setFontColor('#FFFFFF').setFontWeight('bold');
      headerCell.setHorizontalAlignment('center');
      try { sheet.autoResizeColumn(14); } catch (eR) {}
      Logger.log('✅ Kolom BuktiPenangananUrl (Kolom N) berhasil ditambahkan ke DataInsiden!');
    }
  } catch (eCol) {
    Logger.log('ensureInsidenColumnN notice: ' + eCol.message);
  }
}

function addBuktiPenangananColumnToDataInsiden() {
  var ss = getSpreadsheetInstance();
  if (!ss) return { success: false, message: 'Spreadsheet instance null' };
  var s = ss.getSheetByName(TAB.INSIDEN);
  if (!s) return { success: false, message: 'Sheet DataInsiden belum ada' };
  ensureInsidenColumnN(s);
  ensureInsidenColumnO(s);
  return { success: true, message: 'Kolom BuktiPenangananUrl (Kolom N) dan OtorisasiEskalasi (Kolom O) berhasil diverifikasi dan ditambahkan ke DataInsiden!' };
}

/**
 * Utility: Pastikan Kolom O (OtorisasiEskalasi) ada di DataInsiden
 */
function ensureInsidenColumnO(sheet) {
  try {
    if (!sheet) return;
    ensureInsidenColumnN(sheet);
    var lastCol = sheet.getLastColumn();
    if (lastCol < 15 || String(sheet.getRange(1, 15).getValue() || '').trim() === '') {
      var headerCell = sheet.getRange(1, 15);
      headerCell.setValue('OtorisasiEskalasi');
      headerCell.setBackground('#144A32').setFontColor('#FFFFFF').setFontWeight('bold');
      headerCell.setHorizontalAlignment('center');
      try { sheet.autoResizeColumn(15); } catch (eR) {}
      Logger.log('✅ Kolom OtorisasiEskalasi (Kolom O) berhasil ditambahkan ke DataInsiden!');
    }
  } catch (eCol) {
    Logger.log('ensureInsidenColumnO notice: ' + eCol.message);
  }
}

/**
 * API: Otorisasi & Disposisi Atasan pada Tiket Insiden (Multi-Tier Approval)
 * Level 1: Area Manager (AM)
 * Level 2: Head Operasional (COO)
 */
function apiApproveInsiden(payload, user) {
  try {
    payload = payload || {};
    user = user || {};
    var insidenId = String(payload.insidenId || payload.id || '').trim();
    if (!insidenId) return { success: false, message: 'ID Insiden tidak valid.' };

    var roleInfo = (typeof getUserRoleInfo === 'function') ? getUserRoleInfo(user) : { isMaster: false, isManager: false, isSPV: true, isGuest: false };
    if (roleInfo.isGuest || roleInfo.isSPV) {
      return { success: false, code: 'FORBIDDEN_APPROVER', message: 'Akses ditolak: Hanya Area Manager atau Master COO yang berhak memberikan ACC insiden.' };
    }

    var approverLevel = roleInfo.isMaster ? 'COO' : 'MANAGER';
    var reqLevel = String(payload.approverLevel || '').toUpperCase().trim();
    if (reqLevel === 'COO' && !roleInfo.isMaster) {
      return { success: false, code: 'FORBIDDEN_COO_APPROVE', message: 'Akses ditolak: Hanya Master COO yang berhak memberikan ACC final tingkat COO.' };
    }
    if (reqLevel === 'MANAGER' || reqLevel === 'COO') {
      approverLevel = roleInfo.isMaster ? 'COO' : 'MANAGER';
    }

    var approvalAction = String(payload.action || 'APPROVED').toUpperCase(); // APPROVED | REJECTED
    var catatan = String(payload.catatan || '').trim();
    var approverName = String(user.namaLengkap || user.username || (approverLevel === 'COO' ? 'Head Operasional' : 'Area Manager')).trim();
    var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    var sheet = getSheet(TAB.INSIDEN);
    if (!sheet) return { success: false, message: 'Sheet DataInsiden tidak ditemukan.' };
    ensureInsidenColumnN(sheet);
    ensureInsidenColumnO(sheet);

    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    var targetRow = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_INSIDEN.ID]).trim() === insidenId) {
        rowIdx = i + 1;
        targetRow = data[i];
        break;
      }
    }

    if (rowIdx === -1) {
      return { success: false, message: 'Tiket insiden ' + insidenId + ' tidak ditemukan.' };
    }

    var isReviewTicket = isCustomerReviewIncident_(targetRow);
    if (isReviewTicket) {
      return { success: false, message: 'Insiden Customer Review selesai otomatis setelah unggah foto bukti penanganan, tidak memerlukan ACC atasan.' };
    }

    var urgUpper = String(targetRow[COL_INSIDEN.URGENSI] || 'MEDIUM').trim().toUpperCase();
    var curStatus = String(targetRow[COL_INSIDEN.STATUS] || '').trim();

    // Cek & unggah foto bila disertakan bersamaan saat ACC
    var uploadedUrl = '';
    if (payload.fileData && payload.fileData.dataUri) {
      try {
        var upAccRes = apiUploadFileToDrive(
          payload.fileData.dataUri,
          payload.fileData.name || ('BuktiACC_' + insidenId + '.jpg'),
          payload.fileData.type || 'image/jpeg',
          targetRow[COL_INSIDEN.AREA_ID] || 'AREA-01',
          'DataInsiden'
        );
        if (upAccRes && upAccRes.success && upAccRes.fileUrl) {
          uploadedUrl = upAccRes.fileUrl;
          sheet.getRange(rowIdx, COL_INSIDEN.BUKTI_PENANGANAN + 1).setValue(uploadedUrl);
        }
      } catch (eAccUp) {}
    }

    var existingHandlingUrl = (targetRow.length > COL_INSIDEN.BUKTI_PENANGANAN) ? String(targetRow[COL_INSIDEN.BUKTI_PENANGANAN] || '').trim() : '';
    if (isGoogleMapsUrl_(existingHandlingUrl)) existingHandlingUrl = '';
    var effectiveProofUrl = uploadedUrl || existingHandlingUrl;

    if (approvalAction === 'APPROVED' && !effectiveProofUrl) {
      return {
        success: false,
        code: 'PHOTO_PROOF_REQUIRED',
        message: 'Tidak dapat di-ACC sebelum foto bukti penanganan (sudah dikerjakan) diunggah terlebih dahulu!'
      };
    }

    var rawOtorisasi = (targetRow.length > 14) ? String(targetRow[14] || '').trim() : '';
    var otorisasiObj = {};
    try {
      if (rawOtorisasi) otorisasiObj = JSON.parse(rawOtorisasi);
    } catch (eJson) {
      otorisasiObj = {};
    }

    var finalStatus = curStatus || 'OPEN';
    var computedSla = Number(targetRow[COL_INSIDEN.SLA_JAM] || 0);
    var waktuSelesaiOut = String(targetRow[COL_INSIDEN.SELESAI] || '');

    if (approvalAction === 'APPROVED') {
      if (approverLevel === 'COO') {
        otorisasiObj.coo = {
          status: 'APPROVED',
          by: approverName,
          at: nowStr,
          catatan: catatan
        };
        // ACC Master COO -> status OTOMATIS menjadi RESOLVED (selesai)
        finalStatus = 'RESOLVED';
      } else {
        otorisasiObj.manager = {
          status: 'APPROVED',
          by: approverName,
          at: nowStr,
          catatan: catatan
        };
        // MEDIUM & HIGH: cukup ACC Area Manager -> OTOMATIS menjadi RESOLVED!
        // CRITICAL: ACC AM hanya meneruskan ke antrean ACC final Master COO (ESKALASI_COO)
        finalStatus = (urgUpper === 'CRITICAL') ? 'ESKALASI_COO' : 'RESOLVED';
      }
    } else if (approvalAction === 'REJECTED') {
      if (approverLevel === 'COO') {
        otorisasiObj.coo = { status: 'REJECTED', by: approverName, at: nowStr, catatan: catatan };
      } else {
        otorisasiObj.manager = { status: 'REJECTED', by: approverName, at: nowStr, catatan: catatan };
      }
      finalStatus = 'INVESTIGASI';
    }

    var updatedOtorisasiStr = JSON.stringify(otorisasiObj);
    sheet.getRange(rowIdx, 15).setValue(updatedOtorisasiStr);
    sheet.getRange(rowIdx, COL_INSIDEN.STATUS + 1).setValue(finalStatus);
    if (payload.tindakan !== undefined && String(payload.tindakan).trim() !== '') {
      sheet.getRange(rowIdx, COL_INSIDEN.AKSI + 1).setValue(payload.tindakan);
    }

    if (finalStatus === 'RESOLVED') {
      waktuSelesaiOut = nowStr;
      computedSla = computeIncidentSlaHours_(targetRow[COL_INSIDEN.TANGGAL]);
      sheet.getRange(rowIdx, COL_INSIDEN.SELESAI + 1).setValue(waktuSelesaiOut);
      sheet.getRange(rowIdx, COL_INSIDEN.SLA_JAM + 1).setValue(computedSla);
    }

    if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['OTHER_OPS']);

    // Push Notifikasi Luar Aplikasi ke bawahan / gerai / COO terkait
    try {
      var notifActionText = (finalStatus === 'RESOLVED')
        ? 'telah di-ACC & SELESAI (RESOLVED)'
        : (approvalAction === 'APPROVED' ? 'di-ACC AM & diteruskan menunggu ACC Final COO (CRITICAL)' : 'diminta revisi / dikembalikan ke Investigasi');
      var title = (finalStatus === 'RESOLVED') ? ('✅ INSIDEN SELESAI (ACC ' + approverLevel + ')') : ('⚠️ DISPOSISI INSIDEN ' + approverLevel);
      var body = 'Tiket ' + insidenId + ' [' + urgUpper + '] ' + notifActionText + ' oleh ' + approverName + '.' + (catatan ? ' Catatan: "' + catatan + '"' : '');
      var incArea = targetRow[COL_INSIDEN.AREA_ID] || '';
      var incTargets = (incArea && String(incArea).toUpperCase() !== 'ALL') ? ['COO', incArea] : 'ALL';
      triggerOperationalPushAlert('INSIDEN', title, body, incTargets);
    } catch (ePush) {
      Logger.log('Push approve insiden notice: ' + ePush.message);
    }

    return {
      success: true,
      message: (finalStatus === 'RESOLVED')
        ? ('Tiket ' + insidenId + ' berhasil di-ACC ' + approverLevel + ' dan otomatis selesai (RESOLVED)!')
        : ('Otorisasi ' + approverLevel + ' tersimpan. Status saat ini: ' + finalStatus),
      otorisasi: updatedOtorisasiStr,
      newStatus: finalStatus,
      slaJam: computedSla,
      waktuSelesai: waktuSelesaiOut,
      buktiPenangananUrl: effectiveProofUrl
    };
  } catch (err) {
    Logger.log('apiApproveInsiden error: ' + err.message);
    return { success: false, message: 'Gagal memproses otorisasi: ' + err.message };
  }
}
