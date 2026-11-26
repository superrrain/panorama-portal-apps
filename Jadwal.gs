/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Jadwal.gs (Roster Shift, Approval Jadwal, Kendala Darurat & Tukar Shift)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema Roster Shift: DataJadwal, DataKendala, dan DataPerubahanJadwal.
 * 2. Multi-tier Approval: Area Manager (AM) & Master COO dengan SLA tanggapan cepat.
 * 3. Otomatisasi Push Notifikasi: Memicu OneSignal dan DataNotifikasi secara instan.
 * 4. Integrasi Bukti Google Drive: Upload lampiran surat dokter / foto roster.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Modul Jadwal
var COL_JADWAL = { ID: 0, TIPE: 1, LEVEL: 2, AREA_ID: 3, CABANG_ID: 4, NAMA_CABANG: 5, PENGAJU: 6, PERIODE: 7, TOTAL_KRU: 8, TOTAL_SHIFT: 9, STATUS: 10, CATATAN: 11, APPROVER: 12, FEEDBACK: 13, CREATED_AT: 14, FILE_URL: 15, DETAIL_JSON: 16 };
var COL_KENDALA = { ID: 0, TANGGAL: 1, KATEGORI: 2, PENGAJU: 3, ROLE: 4, AREA_ID: 5, CABANG_ID: 6, NAMA_CABANG: 7, KETERANGAN: 8, FILE_URL: 9, FILE_NAME: 10, STATUS: 11, CATATAN_REVIEWER: 12, APPROVER: 13, CREATED_AT: 14 };
var COL_PERUBAHAN_JADWAL = { ID: 0, TANGGAL_PENGAJUAN: 1, AREA_ID: 2, CABANG_ID: 3, NAMA_CABANG: 4, PENGAJU: 5, ROLE: 6, TGL_ASAL: 7, SHIFT_ASAL: 8, TGL_BARU: 9, SHIFT_BARU: 10, PENGGANTI: 11, ALASAN: 12, FILE_URL: 13, STATUS: 14, CATATAN_REVIEWER: 15, APPROVER: 16, CREATED_AT: 17 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function submitJadwal(payload, user) { return apiSubmitJadwal(payload, user); }
function updateJadwal(payload, user) { return apiUpdateJadwal(payload, user); }
function approveJadwal(jadwalId, status, feedback, user) { return apiApproveJadwal(jadwalId, status, feedback, user); }
function deleteJadwal(jadwalId) { return apiDeleteJadwal(jadwalId); }
function submitKendala(payload, user) { return apiSubmitKendala(payload, user); }
function updateKendalaStatus(payload, user) { return apiUpdateKendalaStatus(payload, user); }
function deleteKendala(payload, user) { return apiDeleteKendala(payload, user); }
function apiCreateSheetPerubahanJadwal() { return createDataPerubahanJadwalSheet(); }

/**
 * Menghitung ringkasan hari kerja aktif (Masuk + Lapangan) dari detailHari atau payload kalender.
 */
function computeJadwalDetailCounts_(detailHari, src, fallback) {
  var counts = {
    totalHariKerja: 0,
    masukCount: 0,
    lapanganCount: 0,
    liburCount: 0,
    phCount: 0,
    cutiCount: 0,
    sakitCount: 0
  };
  var hasDetailDays = false;
  if (detailHari && typeof detailHari === 'object') {
    var keys = Object.keys(detailHari);
    for (var kIdx = 0; kIdx < keys.length; kIdx++) {
      var info = detailHari[keys[kIdx]];
      if (!info || typeof info !== 'object') continue;
      var st = String(info.status || '').trim().toUpperCase();
      if (!st || st === 'KOSONG') continue;
      hasDetailDays = true;
      if (st === 'MASUK') counts.masukCount++;
      else if (st === 'LAPANGAN' || st === 'VISIT') counts.lapanganCount++;
      else if (st === 'LIBUR') counts.liburCount++;
      else if (st === 'PH') counts.phCount++;
      else if (st === 'CUTI' || st === 'IZIN') counts.cutiCount++;
      else if (st === 'SAKIT') counts.sakitCount++;
      else counts.masukCount++;
    }
  }
  if (hasDetailDays) {
    counts.totalHariKerja = counts.masukCount + counts.lapanganCount;
    return counts;
  }
  var pickNum = function(key) {
    if (src && src[key] !== undefined && src[key] !== null && src[key] !== '') return Number(src[key]) || 0;
    if (fallback && fallback[key] !== undefined && fallback[key] !== null && fallback[key] !== '') return Number(fallback[key]) || 0;
    return 0;
  };
  counts.masukCount = pickNum('masukCount');
  counts.lapanganCount = pickNum('lapanganCount');
  counts.liburCount = pickNum('liburCount');
  counts.phCount = pickNum('phCount');
  counts.cutiCount = pickNum('cutiCount');
  counts.sakitCount = pickNum('sakitCount');
  var explicitTotal = pickNum('totalHariKerja');
  counts.totalHariKerja = explicitTotal > 0 ? explicitTotal : (counts.masukCount + counts.lapanganCount);
  if (counts.totalHariKerja > 0 && counts.masukCount === 0 && counts.lapanganCount === 0) {
    counts.masukCount = counts.totalHariKerja;
  }
  return counts;
}

// ================================================================================
// BAGIAN 1: PENGAJUAN & APPROVAL ROSTER JADWAL KERJA BULANAN
// ================================================================================

/**
 * API: Simpan Pengajuan Jadwal Kerja Baru
 */
function apiSubmitJadwal(payload, user) {
  try {
    var sheet = getSheet(TAB.JADWAL);
    var newId = generateNextId(TAB.JADWAL, 'SCH', COL_JADWAL.ID, false);
    var nowStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

    var newRow = [];
    newRow[COL_JADWAL.ID] = newId;
    newRow[COL_JADWAL.TIPE] = payload.tipe;
    newRow[COL_JADWAL.LEVEL] = payload.level;
    newRow[COL_JADWAL.AREA_ID] = payload.areaId;
    newRow[COL_JADWAL.CABANG_ID] = payload.cabangId;
    newRow[COL_JADWAL.NAMA_CABANG] = payload.namaCabang;
    newRow[COL_JADWAL.PENGAJU] = payload.pengaju;
    newRow[COL_JADWAL.PERIODE] = payload.periode;
    newRow[COL_JADWAL.TOTAL_KRU] = payload.totalKru;
    newRow[COL_JADWAL.TOTAL_SHIFT] = payload.totalShift;
    newRow[COL_JADWAL.STATUS] = payload.status;
    newRow[COL_JADWAL.CATATAN] = payload.catatan || '';
    newRow[COL_JADWAL.APPROVER] = payload.approver || '';
    newRow[COL_JADWAL.FEEDBACK] = '';
    newRow[COL_JADWAL.CREATED_AT] = nowStr;
    var finalFileUrl = payload.fileUrl || '';
    if (finalFileUrl && finalFileUrl.indexOf('data:') === 0) {
      try {
        var upRes = apiUploadFileToDrive(
          finalFileUrl,
          payload.fileName || ('Jadwal_' + newId + '.pdf'),
          payload.fileType || 'application/pdf',
          payload.areaId || 'AREA-01',
          'DataJadwal'
        );
        if (upRes && upRes.success && upRes.fileUrl) {
          finalFileUrl = upRes.fileUrl;
        }
      } catch (eUp) {
        if (finalFileUrl.length > 40000) {
          finalFileUrl = '';
        }
      }
    }

    newRow[COL_JADWAL.FILE_URL] = finalFileUrl;

    var submitCounts = computeJadwalDetailCounts_(payload.detailHari || null, payload, null);
    var detailPayload = {
      fileUrl: finalFileUrl,
      fileName: payload.fileName || '',
      fileType: payload.fileType || '',
      detailHari: payload.detailHari || null,
      calendarMeta: payload.calendarMeta || null,
      detailKru: payload.detailKru || null,
      totalHariKerja: submitCounts.totalHariKerja,
      masukCount: submitCounts.masukCount,
      lapanganCount: submitCounts.lapanganCount,
      liburCount: submitCounts.liburCount,
      phCount: submitCounts.phCount,
      cutiCount: submitCounts.cutiCount,
      sakitCount: submitCounts.sakitCount
    };
    newRow[COL_JADWAL.DETAIL_JSON] = JSON.stringify(detailPayload);

    sheet.appendRow(newRow);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori JADWAL (Pengajuan - Strictly Isolated)
    try {
      var isSpvToMa = (payload.level === 'SPV_TO_MA');
      var schTitle = isSpvToMa ? '📅 PENGAJUAN JADWAL SHIFT TOKO' : '📅 PENGAJUAN JADWAL KERJA';
      var schBody = (payload.pengaju || 'Staff') + ' (' + (payload.namaCabang || payload.areaId || 'Gerai') + ') telah mengajukan jadwal periode ' + (payload.periode || '') + (isSpvToMa ? '. Menunggu review Area Manager.' : '. Menunggu otorisasi Master COO.');
      // Pembuat tidak perlu notifikasi: Jika SPV ajukan -> notif ke Manager. Jika Manager ajukan -> notif ke Master COO.
      var schTargets = isSpvToMa ? [payload.areaId] : 'COO';
      triggerOperationalPushAlert('JADWAL', schTitle, schBody, schTargets);
    } catch (eSchPush) {
      Logger.log('Push jadwal notice: ' + eSchPush.message);
    }

    return {
      success: true,
      jadwalId: newId,
      message: 'Pengajuan jadwal kerja ' + newId + ' berhasil disimpan.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal menyimpan jadwal kerja: ' + err.message
    };
  }
}

/**
 * API: Edit & Ajukan Ulang Jadwal Kerja Area Manager (Khusus Jadwal Belum ACC / Perlu Revisi)
 */
function apiUpdateJadwal(payload, user) {
  try {
    if (!payload || !payload.jadwalId) {
      return { success: false, message: 'ID Jadwal wajib disertakan untuk mode edit.' };
    }
    var sheet = getSheet(TAB.JADWAL);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, message: 'Data jadwal di spreadsheet masih kosong.' };
    }

    var targetId = String(payload.jadwalId).trim();
    var idRange = sheet.getRange(2, COL_JADWAL.ID + 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < idRange.length; i++) {
      if (String(idRange[i][0] || '').trim() === targetId) {
        rowIndex = i + 2;
        break;
      }
    }
    if (rowIndex === -1) {
      return { success: false, message: 'Jadwal ' + targetId + ' tidak ditemukan di database.' };
    }

    var totalCols = Math.max(sheet.getLastColumn(), COL_JADWAL.DETAIL_JSON + 1);
    var rowValues = sheet.getRange(rowIndex, 1, 1, totalCols).getValues()[0];
    var existingStatus = String(rowValues[COL_JADWAL.STATUS] || '').trim().toUpperCase();
    var existingTipe = String(rowValues[COL_JADWAL.TIPE] || '').trim().toUpperCase();
    var existingLevel = String(rowValues[COL_JADWAL.LEVEL] || '').trim().toUpperCase();

    if (existingStatus === 'DISETUJUI' || existingStatus === 'APPROVED') {
      return { success: false, message: 'Jadwal yang sudah disetujui (ACC) tidak dapat diubah melalui mode edit.' };
    }
    if (existingTipe !== 'VISIT_AREA' && existingLevel !== 'MA_TO_COO') {
      return { success: false, message: 'Fitur edit kalender dikhususkan untuk jadwal kerja Area Manager.' };
    }

    var nowStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    var existingDetail = {};
    try {
      if (rowValues[COL_JADWAL.DETAIL_JSON]) {
        existingDetail = JSON.parse(String(rowValues[COL_JADWAL.DETAIL_JSON]));
      }
    } catch (eParse) {}

    var nextDetailHari = payload.detailHari || existingDetail.detailHari || null;
    var updateCounts = computeJadwalDetailCounts_(nextDetailHari, payload, existingDetail);
    var detailPayload = {
      fileUrl: payload.fileUrl || existingDetail.fileUrl || '',
      fileName: payload.fileName || existingDetail.fileName || '',
      fileType: payload.fileType || existingDetail.fileType || '',
      detailHari: nextDetailHari,
      calendarMeta: payload.calendarMeta || existingDetail.calendarMeta || null,
      detailKru: payload.detailKru || existingDetail.detailKru || null,
      totalHariKerja: updateCounts.totalHariKerja,
      masukCount: updateCounts.masukCount,
      lapanganCount: updateCounts.lapanganCount,
      liburCount: updateCounts.liburCount,
      phCount: updateCounts.phCount,
      cutiCount: updateCounts.cutiCount,
      sakitCount: updateCounts.sakitCount
    };

    sheet.getRange(rowIndex, COL_JADWAL.PERIODE + 1).setValue(payload.periode || rowValues[COL_JADWAL.PERIODE]);
    sheet.getRange(rowIndex, COL_JADWAL.TOTAL_KRU + 1).setValue(payload.totalKru || rowValues[COL_JADWAL.TOTAL_KRU] || 8);
    sheet.getRange(rowIndex, COL_JADWAL.TOTAL_SHIFT + 1).setValue(Number(payload.totalShift || 0));
    sheet.getRange(rowIndex, COL_JADWAL.STATUS + 1).setValue('MENUNGGU_COO');
    if (payload.catatan !== undefined) {
      sheet.getRange(rowIndex, COL_JADWAL.CATATAN + 1).setValue(payload.catatan);
    }
    sheet.getRange(rowIndex, COL_JADWAL.APPROVER + 1).setValue(payload.approver || 'Master Administrator');
    sheet.getRange(rowIndex, COL_JADWAL.FEEDBACK + 1).setValue('');
    sheet.getRange(rowIndex, COL_JADWAL.CREATED_AT + 1).setValue(nowStr);
    sheet.getRange(rowIndex, COL_JADWAL.DETAIL_JSON + 1).setValue(JSON.stringify(detailPayload));

    try {
      var pengajuName = String(payload.pengaju || rowValues[COL_JADWAL.PENGAJU] || 'Area Manager').trim();
      var areaName = String(payload.areaId || rowValues[COL_JADWAL.AREA_ID] || '').trim();
      triggerOperationalPushAlert(
        'JADWAL',
        '📅 REVISI JADWAL KERJA DIAJUKAN ULANG',
        pengajuName + ' (' + (areaName || 'Area') + ') telah memperbarui jadwal ' + targetId + ' (' + (payload.periode || '') + '). Menunggu otorisasi Master COO.',
        'COO'
      );
    } catch (ePushEdit) {
      Logger.log('Push update jadwal notice: ' + ePushEdit.message);
    }

    return {
      success: true,
      isEdited: true,
      jadwalId: targetId,
      createdAt: nowStr,
      message: 'Revisi jadwal ' + targetId + ' berhasil disimpan & diajukan ulang ke Master COO.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal memperbarui jadwal kerja: ' + err.message
    };
  }
}

/**
 * API: Evaluasi & Approval Jadwal Kerja
 */
function apiApproveJadwal(jadwalId, status, feedback, user) {
  try {
    if (typeof jadwalId === 'object' && jadwalId !== null) {
      user = jadwalId.user || user;
      status = jadwalId.status || status;
      feedback = jadwalId.feedback || feedback;
      jadwalId = jadwalId.jadwalId;
    }
    var sheet = getSheet(TAB.JADWAL);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) throw new Error('Data jadwal kosong.');

    var idRange = sheet.getRange(2, COL_JADWAL.ID + 1, lastRow - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < idRange.length; i++) {
      if (String(idRange[i][0]) === String(jadwalId)) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) throw new Error('ID jadwal tidak ditemukan.');

    var approverName = (user && user.namaLengkap) ? user.namaLengkap : (user && user.username ? user.username : 'Approver Resmi');
    sheet.getRange(rowIndex, COL_JADWAL.STATUS + 1).setValue(status);
    sheet.getRange(rowIndex, COL_JADWAL.APPROVER + 1).setValue(approverName);
    sheet.getRange(rowIndex, COL_JADWAL.FEEDBACK + 1).setValue(feedback || '');

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori JADWAL (Balasan ACC COO ke Pengaju/Manager)
    try {
      var appTitle = '📅 STATUS PERSETUJUAN JADWAL';
      var statusLabel = (status === 'APPROVED' || status === 'DISETUJUI' ? 'DISETUJUI' : (status === 'REVISION' || status === 'REVISI' ? 'DIMINTA REVISI' : status));
      var appBody = 'Jadwal kerja ' + jadwalId + ' telah ' + statusLabel + ' oleh ' + approverName + '.' + (feedback ? (' Catatan: ' + feedback) : '');
      var rowValues = sheet.getRange(rowIndex, 1, 1, Math.max(sheet.getLastColumn(), 17)).getValues()[0];
      var jadwalArea = String(rowValues[COL_JADWAL.AREA_ID] || '').trim();
      var jadwalPengaju = String(rowValues[COL_JADWAL.PENGAJU] || '').trim();
      // Balasan ACC Master COO ditujukan khusus ke Area Manager & Pengaju Jadwal
      var appTargets = [];
      if (jadwalPengaju) appTargets.push(jadwalPengaju);
      if (jadwalArea && appTargets.indexOf(jadwalArea) === -1) appTargets.push(jadwalArea);
      if (appTargets.length === 0) appTargets = 'COO';
      triggerOperationalPushAlert('JADWAL', appTitle, appBody, appTargets);
    } catch (eAppPush) {
      Logger.log('Push approve jadwal notice: ' + eAppPush.message);
    }

    return {
      success: true,
      message: 'Status persetujuan jadwal ' + jadwalId + ' berhasil diperbarui menjadi ' + status + '.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal memperbarui persetujuan jadwal: ' + err.message
    };
  }
}

/**
 * API: Simpan Laporan Sakit & Kendala Darurat (Tab DataKendala)
 * Dilengkapi Anti-Spam Guard & LockService untuk Mencegah Rekaman Ganda
 */
function apiSubmitKendala(payload, user) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getSheet(TAB.KENDALA);

    var cleanPengaju = String(payload.pengaju || (user ? user.namaLengkap : '')).trim().toLowerCase();
    var cleanTgl = String(payload.tanggal || '').trim();
    var cleanKet = String(payload.keterangan || '').trim().toLowerCase();
    var cleanKat = String(payload.kategori || 'SAKIT').trim().toUpperCase();

    // 1. Anti-Spam Backend: Cek apakah laporan yang sama persis sudah masuk dalam sheet
    var dAll = sheet.getDataRange().getValues();
    for (var chk = dAll.length - 1; chk >= 1; chk--) {
      var rowChk = dAll[chk];
      var chkId = String(rowChk[COL_KENDALA.ID] || '').trim();
      var chkTgl = String(rowChk[COL_KENDALA.TANGGAL] || '').trim();
      var chkKat = String(rowChk[COL_KENDALA.KATEGORI] || '').trim().toUpperCase();
      var chkPengaju = String(rowChk[COL_KENDALA.PENGAJU] || '').trim().toLowerCase();
      var chkKet = String(rowChk[COL_KENDALA.KETERANGAN] || '').trim().toLowerCase();

      // Jika pengaju, tanggal, kategori, dan keterangannya sama persis (akibat spam klik)
      if (chkPengaju === cleanPengaju && chkTgl === cleanTgl && chkKat === cleanKat && chkKet === cleanKet) {
        lock.releaseLock();
        return {
          success: true,
          kendalaId: chkId,
          fileUrl: String(rowChk[COL_KENDALA.FILE_URL] || ''),
          message: 'Laporan kendala ' + chkId + ' sudah tercatat (anti-spam aktif).'
        };
      }
    }

    var newId = generateNextId(TAB.KENDALA, 'KND', COL_KENDALA.ID, false);
    var nowStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');

    var finalFileUrl = payload.fileUrl || '';
    if (finalFileUrl && finalFileUrl.indexOf('data:') === 0) {
      try {
        var upRes = apiUploadFileToDrive(
          finalFileUrl,
          payload.fileName || ('SuratDokter_' + newId + '.jpg'),
          payload.fileType || 'image/jpeg',
          payload.areaId || 'AREA-01',
          'DataKendala'
        );
        if (upRes && upRes.success && upRes.fileUrl) {
          finalFileUrl = upRes.fileUrl;
        }
      } catch (eUp) {
        if (finalFileUrl.length > 40000) {
          finalFileUrl = '';
        }
      }
    }

    var newRow = [];
    newRow[COL_KENDALA.ID] = newId;
    newRow[COL_KENDALA.TANGGAL] = payload.tanggal || '';
    newRow[COL_KENDALA.KATEGORI] = payload.kategori || 'SAKIT';
    newRow[COL_KENDALA.PENGAJU] = payload.pengaju || (user ? user.namaLengkap : 'Staff');
    newRow[COL_KENDALA.ROLE] = payload.rolePengaju || (user ? user.role : 'STAFF');
    newRow[COL_KENDALA.AREA_ID] = payload.areaId || (user ? user.areaId : 'AREA-01');
    newRow[COL_KENDALA.CABANG_ID] = payload.cabangId || (user ? user.cabangId : 'ALL');
    newRow[COL_KENDALA.NAMA_CABANG] = payload.namaCabang || '';
    newRow[COL_KENDALA.KETERANGAN] = payload.keterangan || '';
    newRow[COL_KENDALA.FILE_URL] = finalFileUrl;
    newRow[COL_KENDALA.FILE_NAME] = payload.fileName || '';
    newRow[COL_KENDALA.STATUS] = payload.status || 'MENUNGGU';
    newRow[COL_KENDALA.CATATAN_REVIEWER] = payload.catatanReviewer || '';
    newRow[COL_KENDALA.APPROVER] = '';
    newRow[COL_KENDALA.CREATED_AT] = nowStr;

    sheet.appendRow(newRow);
    lock.releaseLock();

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Kendala Darurat / Sakit - Strictly Isolated)
    try {
      var kndTitle = '🚨 KENDALA OPERASIONAL / SAKIT';
      var kndBody = (payload.pengaju || 'Kru') + ' (' + (payload.namaCabang || payload.areaId || 'Gerai') + '): ' + (payload.kategori || 'Sakit/Izin') + ' - ' + (payload.keterangan || '');
      // Pembuat (kru) tidak perlu notifikasi. Notifikasi dikirimkan ke Area Manager wilayah & Master COO
      var kndTargets = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'COO';
      triggerOperationalPushAlert('INSIDEN', kndTitle, kndBody, kndTargets);
    } catch (eKndPush) {
      Logger.log('Push kendala notice: ' + eKndPush.message);
    }

    return {
      success: true,
      kendalaId: newId,
      fileUrl: finalFileUrl,
      message: 'Laporan kendala darurat ' + newId + ' berhasil disimpan ke database.'
    };
  } catch (err) {
    try { lock.releaseLock(); } catch (eL) {}
    return {
      success: false,
      message: 'Gagal mencatat laporan kendala: ' + err.message
    };
  }
}

/**
 * API: Evaluasi & Approval Laporan Kendala Darurat (Sakit / Izin)
 * Memperbarui seluruh baris yang cocok untuk mencegah inkonsistensi data ganda
 */
function apiUpdateKendalaStatus(payload, user) {
  try {
    var kendalaId = String(payload.kendalaId || '').trim();
    var status = payload.status || 'DISETUJUI';
    var catatan = payload.catatanReviewer || payload.catatan || '';
    var sheet = getSheet(TAB.KENDALA);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) throw new Error('Data kendala kosong.');

    var idRange = sheet.getRange(2, COL_KENDALA.ID + 1, lastRow - 1, 1).getValues();
    var matchedRows = [];
    for (var i = 0; i < idRange.length; i++) {
      if (String(idRange[i][0]).trim() === kendalaId) {
        matchedRows.push(i + 2);
      }
    }

    if (matchedRows.length === 0) throw new Error('ID laporan kendala ' + kendalaId + ' tidak ditemukan.');

    var approverName = (user && user.namaLengkap) ? user.namaLengkap : (user && user.username ? user.username : 'Approver Resmi');
    
    // Perbarui seluruh baris yang memiliki kendalaId ini (membersihkan duplikasi masa lalu)
    for (var m = 0; m < matchedRows.length; m++) {
      var rIdx = matchedRows[m];
      sheet.getRange(rIdx, COL_KENDALA.STATUS + 1).setValue(status);
      sheet.getRange(rIdx, COL_KENDALA.CATATAN_REVIEWER + 1).setValue(catatan);
      sheet.getRange(rIdx, COL_KENDALA.APPROVER + 1).setValue(approverName);
    }

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori INSIDEN (Balasan ACC Status Kendala / Sakit)
    try {
      var kndUpTitle = '🩺 STATUS LAPORAN KENDALA / SAKIT';
      var kndUpBody = 'Laporan ' + kendalaId + ' telah ' + status + ' oleh ' + approverName + '.' + (catatan ? (' Catatan: ' + catatan) : '');
      var kndRowValues = sheet.getRange(matchedRows[0], 1, 1, Math.max(sheet.getLastColumn(), 12)).getValues()[0];
      var kndArea = String(kndRowValues[COL_KENDALA.AREA_ID] || '').trim();
      var kndPengaju = String(kndRowValues[COL_KENDALA.PENGAJU] || '').trim();
      // Balasan ACC dikirimkan ke Kru Pengaju & Area Manager terkait
      var kndUpTargets = [];
      if (kndPengaju) kndUpTargets.push(kndPengaju);
      if (kndArea && kndUpTargets.indexOf(kndArea) === -1) kndUpTargets.push(kndArea);
      if (kndUpTargets.length === 0) kndUpTargets = 'COO';
      triggerOperationalPushAlert('INSIDEN', kndUpTitle, kndUpBody, kndUpTargets);
    } catch (eKndUpPush) {
      Logger.log('Push update kendala notice: ' + eKndUpPush.message);
    }

    return {
      success: true,
      message: 'Status laporan ' + kendalaId + ' berhasil diperbarui menjadi ' + status + '.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal memperbarui status kendala: ' + err.message
    };
  }
}

/**
 * API: Hapus Laporan Sakit & Kendala Darurat (Tab DataKendala)
 */
function apiDeleteKendala(payload, user) {
  try {
    var kendalaId = (typeof payload === 'object' && payload !== null) ? (payload.kendalaId || payload.id) : payload;
    if (!kendalaId) throw new Error('ID kendala tidak valid.');

    var sheet = getSheet(TAB.KENDALA);
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var pengajuDb = '';

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_KENDALA.ID]) === String(kendalaId)) {
        rowIndex = i + 1;
        pengajuDb = String(data[i][COL_KENDALA.PENGAJU] || '').trim();
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: true, message: 'Laporan kendala ' + kendalaId + ' sudah tidak ada di database.' };
    }

    // Validasi otorisasi: pengaju sendiri atau Master COO
    var isCOO = (user && (user.role === 'COO' || user.areaId === 'ALL' || user.username === 'coo_master'));
    var isOwner = user && (
      (user.namaLengkap && pengajuDb.toLowerCase() === String(user.namaLengkap).toLowerCase()) ||
      (user.username && pengajuDb.toLowerCase() === String(user.username).toLowerCase())
    );

    if (!isCOO && !isOwner) {
      throw new Error('Anda hanya berhak menghapus pengajuan kendala milik Anda sendiri.');
    }

    sheet.deleteRow(rowIndex);
    return {
      success: true,
      message: 'Laporan kendala ' + kendalaId + ' berhasil dihapus dari database.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal menghapus laporan kendala: ' + err.message
    };
  }
}

/**
 * API: Simpan Permohonan Perubahan Jadwal (Tab DataPerubahanJadwal)
 * Aturan Bisnis & Validasi:
 * 1. Kuota Maksimal per Bulan (Default 3 kali per bulan, dinamis dari MasterConfig MAX_TUKAR_JADWAL).
 * 2. Hanya 1 tanggal tunggal per pengajuan (tanggalAsal).
 * 3. LockService backend anti-tabrakan.
 */
function apiSubmitPerubahanJadwal(payload, user) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    payload = payload || {};
    user = user || {};

    if (!payload.tanggalAsal) {
      return { success: false, message: 'Tanggal jadwal asal yang ingin diubah wajib dipilih.' };
    }
    if (!payload.tanggalBaru) {
      return { success: false, message: 'Tanggal atau shift jadwal pengganti wajib dipilih.' };
    }
    if (!payload.alasan || String(payload.alasan).trim().length < 3) {
      return { success: false, message: 'Alasan perubahan jadwal wajib diisi dengan jelas.' };
    }

    // 1. Ambil batasan kuota maksimal dari MasterConfig (default 3)
    var maxQuota = 3;
    try {
      var sCfg = getSheet(TAB.CONFIG);
      if (sCfg) {
        var dCfg = sCfg.getDataRange().getValues();
        for (var c = 1; c < dCfg.length; c++) {
          var kCfg = String(dCfg[c][0] || '').trim().toUpperCase();
          if (kCfg === 'MAX_TUKAR_JADWAL' || kCfg === 'MAXTUKARJADWAL') {
            var nVal = parseInt(dCfg[c][1], 10);
            if (!isNaN(nVal) && nVal > 0) maxQuota = nVal;
            break;
          }
        }
      }
    } catch (eCfg) {}

    var sheet = null;
    try {
      sheet = getSheet(TAB.PERUBAHAN_JADWAL);
    } catch (eGet) {
      sheet = null;
    }
    // Safe auto-creation jika tab belum ada di spreadsheet
    if (!sheet) {
      var ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
      var hdrP = DEFAULT_HEADERS.DataPerubahanJadwal;
      sheet = ss.insertSheet(TAB.PERUBAHAN_JADWAL);
      sheet.getRange(1, 1, 1, hdrP.length).setValues([hdrP]);
      sheet.setFrozenRows(1);
      try {
        sheet.getRange(1, 1, 1, hdrP.length).setBackground('#144A32').setFontColor('#FFFFFF').setFontWeight('bold');
      } catch (eS) {}
    }

    var data = sheet.getDataRange().getValues();

    // 2. Cek Kuota Bulanan Pengaju pada periode bulan berjalan (YYYY-MM)
    var pengajuName = String(payload.pengaju || user.namaLengkap || user.username || 'Staff').trim();
    var pengajuRole = String(payload.rolePengaju || user.role || 'SPV').trim().toUpperCase();
    var targetDateStr = String(payload.tanggalAsal || '').substring(0, 7); // 'YYYY-MM'
    
    var userSubmissionsThisMonth = 0;
    for (var i = 1; i < data.length; i++) {
      var rowPengaju = String(data[i][COL_PERUBAHAN_JADWAL.PENGAJU] || '').trim();
      var rowTglAsal = String(data[i][COL_PERUBAHAN_JADWAL.TGL_ASAL] || '').substring(0, 7);
      var rowStatus = String(data[i][COL_PERUBAHAN_JADWAL.STATUS] || '').toUpperCase();
      
      if (rowPengaju.toLowerCase() === pengajuName.toLowerCase() && rowTglAsal === targetDateStr) {
        if (rowStatus !== 'DITOLAK' && rowStatus !== 'REJECTED') {
          userSubmissionsThisMonth++;
        }
      }
    }

    if (userSubmissionsThisMonth >= maxQuota) {
      return {
        success: false,
        message: 'Batas kuota perubahan jadwal tercapai. Anda sudah mengajukan ' + userSubmissionsThisMonth + ' dari maksimal ' + maxQuota + ' kali untuk periode bulan ini.'
      };
    }

    // 3. Generate Unique ID sekuensial (CHG-YYYYMM-XXX)
    var newId = generateNextId(TAB.PERUBAHAN_JADWAL, 'CHG', COL_PERUBAHAN_JADWAL.ID, false);
    var now = new Date();
    var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var todayDateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    var finalFileUrl = payload.fileUrl || '';
    if (finalFileUrl && finalFileUrl.indexOf('data:') === 0) {
      try {
        var upResChg = apiUploadFileToDrive(
          finalFileUrl,
          payload.fileName || ('PerubahanJadwal_' + newId + '.jpg'),
          payload.fileType || 'image/jpeg',
          payload.areaId || (user ? user.areaId : 'AREA-01'),
          'DataPerubahanJadwal'
        );
        if (upResChg && upResChg.success && upResChg.fileUrl) {
          finalFileUrl = upResChg.fileUrl;
        }
      } catch (eUpChg) {
        if (finalFileUrl.length > 40000) finalFileUrl = '';
      }
    }

    var newRow = [
      newId,
      todayDateStr,
      payload.areaId || user.areaId || 'AREA-01',
      payload.cabangId || user.cabangId || 'ALL',
      payload.namaCabang || '',
      pengajuName,
      pengajuRole,
      payload.tanggalAsal,
      payload.shiftAsal || 'Pagi',
      payload.tanggalBaru,
      payload.shiftBaru || 'Pagi',
      payload.personelPengganti || '-',
      payload.alasan || '',
      finalFileUrl,
      'MENUNGGU',
      '',
      '',
      nowStr
    ];

    sheet.appendRow(newRow);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori JADWAL (Tukar Jadwal - Strictly Isolated)
    try {
      var swapTitle = '🔄 PERMOHONAN TUKAR JADWAL';
      var swapBody = pengajuName + ' (' + (payload.namaCabang || payload.areaId || 'Gerai') + ') mengajukan tukar jadwal tgl ' + payload.tanggalAsal + ' -> ' + payload.tanggalBaru + '. Menunggu persetujuan.';
      // Pembuat/pengaju tidak perlu notifikasi. Notifikasi dikirimkan ke Area Manager wilayah & Master COO
      var swapTargets = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'COO';
      triggerOperationalPushAlert('JADWAL', swapTitle, swapBody, swapTargets);
    } catch (eSwapPush) {
      Logger.log('Push submit tukar jadwal notice: ' + eSwapPush.message);
    }

    return {
      success: true,
      message: 'Permohonan perubahan jadwal (' + newId + ') berhasil diajukan! Menunggu persetujuan atasan.',
      changeId: newId,
      perubahanId: newId,
      id: newId,
      sisaKuota: Math.max(0, maxQuota - (userSubmissionsThisMonth + 1))
    };
  } catch (err) {
    return { success: false, message: 'Gagal mengajukan perubahan jadwal: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (eL) {}
  }
}

/**
 * API: Review & Setujui / Tolak Perubahan Jadwal (Hirarki 2-Tingkat)
 * Aturan Hirarki:
 * - SPV Gerai di-review murni oleh Area Manager wilayahnya. (COO tidak perlu ACC).
 * - Area Manager di-review oleh Master COO.
 */
function apiApprovePerubahanJadwal(payload, user) {
  try {
    payload = payload || {};
    user = user || {};
    var changeId = String(payload.changeId || payload.id || '').trim();
    var status = String(payload.status || 'DISETUJUI').trim().toUpperCase();
    var catatan = String(payload.catatan || payload.feedback || '').trim();
    var approverName = String(user.namaLengkap || user.username || 'Approver Operasional').trim();

    if (!changeId) {
      return { success: false, message: 'Change ID tidak valid.' };
    }

    var sheet = getSheet(TAB.PERUBAHAN_JADWAL);
    if (!sheet) return { success: false, message: 'Sheet DataPerubahanJadwal tidak ditemukan.' };
    
    var data = sheet.getDataRange().getValues();
    var targetRow = -1;
    var rowData = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_PERUBAHAN_JADWAL.ID]) === changeId) {
        targetRow = i + 1;
        rowData = data[i];
        break;
      }
    }

    if (targetRow === -1 || !rowData) {
      return { success: false, message: 'Permohonan perubahan jadwal ' + changeId + ' tidak ditemukan.' };
    }

    var reqRole = String(rowData[COL_PERUBAHAN_JADWAL.ROLE] || '').toUpperCase();
    var reqArea = String(rowData[COL_PERUBAHAN_JADWAL.AREA_ID] || '').toUpperCase();
    var isUserCOO = (user.role === 'COO' || user.areaId === 'ALL' || user.username === 'coo_master');
    var isUserAM = (user.role === 'MANAGER' || user.role === 'AREA_MANAGER');

    // Validasi Hirarki Otorisasi:
    if (reqRole === 'SPV') {
      // SPV toko di-approve oleh Area Manager wilayahnya (atau Master COO sebagai superuser darurat)
      if (!isUserAM && !isUserCOO) {
        return { success: false, message: 'Hanya Area Manager yang berwenang menyetujui permohonan SPV toko.' };
      }
      if (isUserAM && String(user.areaId || '').toUpperCase() !== reqArea) {
        return { success: false, message: 'Anda hanya berwenang menyetujui permohonan di wilayah binaan Anda (' + user.areaId + ').' };
      }
    } else {
      // Area Manager di-approve oleh Master COO
      if (!isUserCOO) {
        return { success: false, message: 'Permohonan Area Manager hanya dapat disetujui oleh Master COO.' };
      }
    }

    sheet.getRange(targetRow, COL_PERUBAHAN_JADWAL.STATUS + 1).setValue(status);
    sheet.getRange(targetRow, COL_PERUBAHAN_JADWAL.CATATAN_REVIEWER + 1).setValue(catatan);
    sheet.getRange(targetRow, COL_PERUBAHAN_JADWAL.APPROVER + 1).setValue(approverName);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori JADWAL (Balasan ACC Tukar Jadwal)
    try {
      var swapAppTitle = '🔄 STATUS TUKAR JADWAL';
      var swapAppBody = 'Permohonan tukar jadwal ' + changeId + ' telah ' + (status === 'DISETUJUI' ? 'DISETUJUI' : 'DITOLAK') + ' oleh ' + approverName + '.' + (catatan ? (' Catatan: ' + catatan) : '');
      var swapArea = data[targetRow - 1] ? data[targetRow - 1][COL_PERUBAHAN_JADWAL.AREA_ID] : '';
      var swapPengaju = data[targetRow - 1] ? data[targetRow - 1][COL_PERUBAHAN_JADWAL.PENGAJU] : '';
      // Balasan ACC dikirimkan ke Kru Pengaju permohonan & Area Manager wilayah
      var swapAppTargets = [swapPengaju, swapArea];
      triggerOperationalPushAlert('JADWAL', swapAppTitle, swapAppBody, swapAppTargets);
    } catch (eSwapAppPush) {
      Logger.log('Push approve tukar jadwal notice: ' + eSwapAppPush.message);
    }

    return {
      success: true,
      message: 'Permohonan perubahan jadwal ' + changeId + ' berhasil ' + (status === 'DISETUJUI' ? 'disetujui' : 'ditolak') + ' oleh ' + approverName + '.',
      status: status,
      approver: approverName,
      catatanReviewer: catatan
    };
  } catch (err) {
    return { success: false, message: 'Gagal memperbarui status perubahan jadwal: ' + err.message };
  }
}

/**
 * API: Hapus Permohonan Perubahan Jadwal (Tab DataPerubahanJadwal)
 */
function apiDeletePerubahanJadwal(payload, user) {
  try {
    var changeId = (typeof payload === 'object' && payload !== null) ? (payload.changeId || payload.id) : payload;
    if (!changeId) throw new Error('Change ID tidak valid.');

    var sheet = getSheet(TAB.PERUBAHAN_JADWAL);
    if (!sheet) return { success: true, message: 'Sheet tidak ditemukan.' };
    
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var pengajuDb = '';

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_PERUBAHAN_JADWAL.ID]) === String(changeId)) {
        rowIndex = i + 1;
        pengajuDb = String(data[i][COL_PERUBAHAN_JADWAL.PENGAJU] || '').trim();
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: true, message: 'Permohonan perubahan jadwal ' + changeId + ' sudah tidak ada di database.' };
    }

    var isCOO = (user && (user.role === 'COO' || user.areaId === 'ALL' || user.username === 'coo_master'));
    var isOwner = user && (
      (user.namaLengkap && pengajuDb.toLowerCase() === String(user.namaLengkap).toLowerCase()) ||
      (user.username && pengajuDb.toLowerCase() === String(user.username).toLowerCase())
    );

    if (!isCOO && !isOwner) {
      throw new Error('Anda hanya berhak membatalkan permohonan milik Anda sendiri.');
    }

    sheet.deleteRow(rowIndex);
    return {
      success: true,
      message: 'Permohonan perubahan jadwal ' + changeId + ' berhasil dibatalkan dan dihapus.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal menghapus permohonan: ' + err.message };
  }
}

/**
 * Global Aliases for Google Apps Script google.script.run
 */
function submitPerubahanJadwal(payload, user) {
  return apiSubmitPerubahanJadwal(payload, user);
}

function approvePerubahanJadwal(payload, user) {
  return apiApprovePerubahanJadwal(payload, user);
}

function deletePerubahanJadwal(payload, user) {
  return apiDeletePerubahanJadwal(payload, user);
}

// ================================================================================
// BAGIAN 2: HAPUS JADWAL & UTILITAS TAB DATAPERUBAHANJADWAL
// ================================================================================

/**
 * API: Hapus Data Jadwal Kerja
 */
function apiDeleteJadwal(jadwalId) {
  try {
    if (typeof jadwalId === 'object' && jadwalId !== null) jadwalId = jadwalId.jadwalId || jadwalId.id;
    var sheet = getSheet(TAB.JADWAL);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_JADWAL.ID]) === String(jadwalId)) {
        rowIdx = i + 1;
        break;
      }
    }
    if (rowIdx > 0) {
      sheet.deleteRow(rowIdx);
    }
    return { success: true, message: 'Jadwal ' + jadwalId + ' berhasil dihapus dari sistem.' };
  } catch (err) {
    return { success: true, message: 'Jadwal ' + jadwalId + ' berhasil dihapus dari tampilan sistem.' };
  }
}

/**
 * Utility: Buat / Migrasi Tab DataPerubahanJadwal di Google Spreadsheet
 * Dapat dijalankan langsung dari Google Apps Script Editor atau via API Web App.
 */
function createDataPerubahanJadwalSheet() {
  try {
    var ss = getSpreadsheetInstance();
    if (!ss) return { success: false, message: 'Google Spreadsheet tidak dapat diakses.' };
    
    var sheet = ss.getSheetByName(TAB.PERUBAHAN_JADWAL);
    var headers = DEFAULT_HEADERS.DataPerubahanJadwal;
    
    if (!sheet) {
      sheet = ss.insertSheet(TAB.PERUBAHAN_JADWAL);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      try {
        sheet.getRange(1, 1, 1, headers.length).setBackground('#144A32').setFontColor('#FFFFFF').setFontWeight('bold');
      } catch (eStyle) {}
      Logger.log('✅ Tab DataPerubahanJadwal BERHASIL DIBUAT di Google Spreadsheet.');
      return { success: true, message: 'Tab DataPerubahanJadwal berhasil dibuat di Google Spreadsheet!' };
    } else {
      // Safe migration: pastikan kolom lengkap
      var lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        for (var i = 0; i < headers.length; i++) {
          if (existing.indexOf(headers[i]) === -1) {
            var targetCol = sheet.getLastColumn() + 1;
            sheet.getRange(1, targetCol).setValue(headers[i]).setFontWeight('bold').setBackground('#144A32').setFontColor('#FFFFFF');
          }
        }
      }
      Logger.log('ℹ️ Tab DataPerubahanJadwal sudah ada di Google Spreadsheet.');
      return { success: true, message: 'Tab DataPerubahanJadwal sudah ada dan siap digunakan.' };
    }
  } catch (err) {
    Logger.log('❌ Gagal membuat sheet DataPerubahanJadwal: ' + err.message);
    return { success: false, message: 'Gagal membuat sheet: ' + err.message };
  }
}
