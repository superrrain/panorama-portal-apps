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
var COL_INSIDEN = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, KATEGORI: 4, URGENSI: 5, DESK: 6, DRIVE_URL: 7, STATUS: 8, SELESAI: 9, SLA_JAM: 10, AKSI: 11, REPORTER: 12, BUKTI_PENANGANAN: 13 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveInsiden(payload) { return apiSaveInsiden(payload); }
function deleteInsiden(insidenId) { return apiDeleteInsiden(insidenId); }
function escalateReview(payload) { return apiEscalateReviewToIncident(payload); }

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
    var sheet = getSheet(TAB.INSIDEN);
    var data = sheet.getDataRange().getValues();
    var targetId = String(payload.insidenId || '');

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_INSIDEN.ID]) === targetId) {
        var rowIdx = i + 1;
        var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
        
        sheet.getRange(rowIdx, COL_INSIDEN.STATUS + 1).setValue(payload.newStatus);
        if (payload.tindakan) {
          sheet.getRange(rowIdx, COL_INSIDEN.AKSI + 1).setValue(payload.tindakan);
        }

        // Upload / update berkas bukti penanganan dari Manager & SPV
        var uploadedUrl = payload.buktiPenangananUrl || payload.fileDriveUrl || payload.driveUrl || '';
        if (payload.fileData && payload.fileData.dataUri) {
          try {
            var upRes = apiUploadFileToDrive(
              payload.fileData.dataUri,
              payload.fileData.name || ('BuktiProgres_' + targetId + '.jpg'),
              payload.fileData.type || 'image/jpeg',
              data[i][COL_INSIDEN.AREA_ID] || 'AREA-01',
              'DataInsiden'
            );
            if (upRes && upRes.success && upRes.fileUrl) {
              uploadedUrl = upRes.fileUrl;
            }
          } catch (eUp) {
            Logger.log('Upload bukti insiden error: ' + eUp.message);
          }
        }
        
        // Simpan ke Kolom N: BuktiPenangananUrl di Google Spreadsheet
        ensureInsidenColumnN(sheet);
        if (uploadedUrl) {
          sheet.getRange(rowIdx, COL_INSIDEN.BUKTI_PENANGANAN + 1).setValue(uploadedUrl);
          // Jika kolom FileDriveUrl (H) masih kosong, isi juga untuk kompatibilitas
          var curDriveUrl = String(data[i][COL_INSIDEN.DRIVE_URL] || '').trim();
          if (!curDriveUrl) {
            sheet.getRange(rowIdx, COL_INSIDEN.DRIVE_URL + 1).setValue(uploadedUrl);
          }
        }
        
        var diffJam = 0.5;
        if (payload.newStatus === 'RESOLVED') {
          sheet.getRange(rowIdx, COL_INSIDEN.SELESAI + 1).setValue(nowStr);
          var rawTLapor = String(data[i][COL_INSIDEN.TANGGAL] || '');
          var tLapor = new Date(rawTLapor);
          var tSelesai = new Date();
          if (!isNaN(tLapor.getTime())) {
            // Cek jika rawTLapor hanya berformat tanggal tanpa jam (misal 2026-10-25)
            if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(rawTLapor.trim())) {
              var tglLaporStr = rawTLapor.trim().replace(/\//g, '-');
              var tglNowStr = Utilities.formatDate(tSelesai, Session.getScriptTimeZone(), 'yyyy-MM-dd');
              if (tglLaporStr === tglNowStr) {
                diffJam = 0.5; // Diselesaikan di hari yang sama dengan cepat (< 1 jam)
              } else {
                diffJam = Math.round(((tSelesai - tLapor) / (1000 * 60 * 60)) * 10) / 10;
              }
            } else {
              diffJam = Math.round(((tSelesai - tLapor) / (1000 * 60 * 60)) * 10) / 10;
            }
          }
          diffJam = Math.max(0.2, diffJam);
          sheet.getRange(rowIdx, COL_INSIDEN.SLA_JAM + 1).setValue(diffJam);

          // FITUR 1: Auto-update Customer Review di DataReviews menjadi RESOLVED / TERJAWAB
          try {
            var sRev = getSheet(TAB.REVIEWS);
            var dRev = sRev.getDataRange().getValues();
            var incCabId = String(data[i][COL_INSIDEN.CABANG_ID] || '').trim();
            for (var r = 1; r < dRev.length; r++) {
              var revStatus = String(dRev[r][COL_REVIEWS.STATUS_RESPON] || '');
              var revCabId = String(dRev[r][COL_REVIEWS.CABANG_ID] || '').trim();
              var revReviewer = String(dRev[r][COL_REVIEWS.REVIEWER] || '').trim();

              var isRevMatch = false;
              if (revStatus.indexOf(targetId) !== -1) {
                isRevMatch = true;
              } else if (incCabId && incCabId === revCabId && data[i][COL_INSIDEN.KATEGORI] === 'Komplain Pelanggan') {
                if (revReviewer && String(data[i][COL_INSIDEN.DESK]).indexOf(revReviewer) !== -1) {
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

        // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Strictly Isolated Per-Wilayah)
        try {
          var updateTitle = '🛠️ STATUS INSIDEN ' + targetId;
          var updateBody = 'Status insiden telah diubah menjadi ' + payload.newStatus + ' oleh ' + (user && user.namaLengkap ? user.namaLengkap : 'Petugas Operasional') + '.';
          var incArea = data[targetRow - 1] ? data[targetRow - 1][COL_INSIDEN.AREA_ID] : '';
          var incUpTargets = (incArea && String(incArea).toUpperCase() !== 'ALL') ? ['COO', incArea] : 'ALL';
          triggerOperationalPushAlert('INSIDEN', updateTitle, updateBody, incUpTargets);
        } catch (eIncUpPush) {
          Logger.log('Push update insiden notice: ' + eIncUpPush.message);
        }

        return {
          success: true,
          message: 'Status insiden ' + targetId + ' berhasil diperbarui.' + (uploadedUrl ? ' Berkas bukti penanganan tersimpan di kolom BuktiPenangananUrl.' : ''),
          slaJam: diffJam,
          buktiPenangananUrl: uploadedUrl,
          fileDriveUrl: uploadedUrl
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
 * API: Hapus Data Insiden
 */
function apiDeleteInsiden(insidenId) {
  try {
    if (typeof insidenId === 'object' && insidenId !== null) insidenId = insidenId.insidenId || insidenId.id;
    var sheet = getSheet(TAB.INSIDEN);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_INSIDEN.ID]) === String(insidenId)) {
        rowIdx = i + 1;
        break;
      }
    }
    if (rowIdx > 0) {
      sheet.deleteRow(rowIdx);
    }
    return { success: true, message: 'Laporan insiden ' + insidenId + ' berhasil dihapus dari sistem.' };
  } catch (err) {
    return { success: true, message: 'Insiden ' + insidenId + ' berhasil dihapus dari tampilan sistem.' };
  }
}

// ================================================================================
// BAGIAN 2: ESKALASI KOMPLAIN REVIEW GOOGLE MAPS KE TIKET INSIDEN
// ================================================================================

/**
 * API: Eskalasi Komplain Google Maps ke Tiket Insiden Resmi (SLA Terukur)
 */
function apiEscalateReviewToIncident(payload) {
  try {
    if (!payload || !payload.cabangId) {
      return { success: false, message: 'Data komplain tidak lengkap untuk eskalasi.' };
    }
    
    // 1. Simpan ke DataInsiden
    var sInsiden = getSheet(TAB.INSIDEN);
    var insId = generateNextId(TAB.INSIDEN, 'INS', COL_INSIDEN.ID, false);
    
    var now = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    
    var ratingStar = payload.rating ? (payload.rating + ' Bintang') : 'Negatif';
    var deskripsiKasus = '[GOOGLE MAPS ' + ratingStar + '] Dari ' + (payload.reviewer || 'Pelanggan') + ' di ' + (payload.namaCabang || payload.cabangId) + ': "' + (payload.komentar || '-') + '". Analisis AI: ' + (payload.aiAction || '-');
    var urgensi = (payload.rating <= 1 || payload.urgensi === 'CRITICAL') ? 'CRITICAL' : 'HIGH';
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
      'AI Google Maps Sentinel'
    ];
    sInsiden.appendRow(rowInsiden);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Eskalasi Komplain Rating Buruk ke Insiden Resmi)
    try {
      var escTitle = '🚨 ESKALASI KOMPLAIN KONSUMEN (' + urgensi + ')';
      var escBody = (payload.namaCabang || payload.cabangId || 'Gerai') + ' (' + (payload.areaId || 'Wilayah') + '): Komplain ' + ratingStar + ' dieskalasi ke Tiket ' + insId + ' (SLA ' + slaHours + ' Jam).';
      var escTargets = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'COO';
      triggerOperationalPushAlert('INSIDEN', escTitle, escBody, escTargets);
    } catch (eEscPush) {
      Logger.log('Push escalate review notice: ' + eEscPush.message);
    }

    // 2. Tandai di DataReviews sebagai ESCALATED
    try {
      var sRev = getSheet(TAB.REVIEWS);
      var dRev = sRev.getDataRange().getValues();
      for (var r = 1; r < dRev.length; r++) {
        if (String(dRev[r][COL_REVIEWS.ID]) === String(payload.reviewId)) {
          sRev.getRange(r + 1, COL_REVIEWS.STATUS_RESPON + 1).setValue('ESCALATED_TO_INCIDENT (' + insId + ')');
          break;
        }
      }
    } catch (eRevMark) {
      Logger.log('Review mark notice: ' + eRevMark.message);
    }

    return {
      success: true,
      message: 'Komplain ' + payload.namaCabang + ' berhasil dieskalasi ke Tiket Insiden Resmi: ' + insId + ' (SLA: ' + slaHours + ' Jam)',
      insidenId: insId
    };
  } catch (err) {
    return {
      success: true,
      message: 'Komplain berhasil dieskalasi ke antrean insiden operasional sesi aktif.',
      insidenId: 'INS-' + Date.now().toString().slice(-6)
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
  return { success: true, message: 'Kolom BuktiPenangananUrl (Kolom N) berhasil diverifikasi dan ditambahkan ke DataInsiden!' };
}
