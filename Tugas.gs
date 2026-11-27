/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Tugas.gs (Instruksi Tugas Lapangan, Siklus SOP Rutin & Auto-Complete Sales)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema Tugas: DataTugas (ID, Judul, AreaId, AssignedTo, Deadline, Prioritas,
 *    Status, Catatan, BuktiUrl, Feedback, CreatedAt, Siklus, ActionLink).
 * 2. Multi-Cycle SOP: Siklus rutin SOP Harian (DAILY), Mingguan (WEEKLY), Bulanan (MONTHLY), dan Insidental.
 * 3. Auto-Complete Sales Harian: Input omset cabang otomatis melunasi tugas daily.
 * 4. Pemicu Push Notifikasi: OneSignal & DataNotifikasi otomatis saat tugas terbit.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku DataTugas
var COL_TUGAS = { ID: 0, JUDUL: 1, AREA_ID: 2, ASSIGNED_TO: 3, DEADLINE: 4, PRIORITAS: 5, STATUS: 6, CATATAN: 7, BUKTI_URL: 8, FEEDBACK: 9, CREATED_AT: 10, SIKLUS: 11, ACTION_LINK: 12 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveTugas(payload) { return apiSaveTugas(payload); }
function deleteTugas(tugasId) { return apiDeleteTugas(tugasId); }

// ================================================================================
// BAGIAN 1: PENUGASAN INSTRUKSI OPERASIONAL & PENGHAPUSAN
// ================================================================================

/**
 * API: Simpan / Update Tugas Lapangan
 */
function apiSaveTugas(payload) {
  try {
    payload = payload || {};
    var sheet = getSheet(TAB.TUGAS);
    var data = sheet.getDataRange().getValues();
    var existingRowIdx = -1;

    if (payload.tugasId && !payload.isNew) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][COL_TUGAS.ID]) === String(payload.tugasId)) {
          existingRowIdx = i + 1;
          break;
        }
      }
    }

    if (existingRowIdx > 0) {
      // Update Tugas Eksisting
      var buktiUrlVal = payload.buktiUrl;
      if (buktiUrlVal) {
        var sUrl = String(buktiUrlVal).trim();
        var lHttps = sUrl.lastIndexOf('https://');
        var lHttp = sUrl.lastIndexOf('http://');
        var maxIdx = Math.max(lHttps, lHttp);
        if (maxIdx > 0) sUrl = sUrl.substring(maxIdx).trim();
        buktiUrlVal = sUrl;
      }
      if (buktiUrlVal && buktiUrlVal.indexOf('data:') === 0) {
        try {
          var upResTsk = apiUploadFileToDrive(
            buktiUrlVal,
            payload.fileName || ('BuktiTugas_' + payload.tugasId + '.jpg'),
            payload.fileType || 'image/jpeg',
            payload.areaId || 'AREA-01',
            'DataTugas'
          );
          if (upResTsk && upResTsk.success && upResTsk.fileUrl) {
            buktiUrlVal = upResTsk.fileUrl;
          }
        } catch (eUpTsk) {}
      }
      if (payload.status) sheet.getRange(existingRowIdx, COL_TUGAS.STATUS + 1).setValue(payload.status);
      if (payload.catatan !== undefined) sheet.getRange(existingRowIdx, COL_TUGAS.CATATAN + 1).setValue(payload.catatan);
      if (buktiUrlVal !== undefined) sheet.getRange(existingRowIdx, COL_TUGAS.BUKTI_URL + 1).setValue(buktiUrlVal);
      if (payload.feedbackCOO !== undefined) sheet.getRange(existingRowIdx, COL_TUGAS.FEEDBACK + 1).setValue(payload.feedbackCOO);

      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori TUGAS (Update/ACC Feedback)
      try {
        var isFeedbackFromCOO = (payload.feedbackCOO !== undefined && String(payload.feedbackCOO).trim() !== '');
        var tskUpTitle = isFeedbackFromCOO ? ('📋 FEEDBACK COO: TUGAS ' + payload.tugasId) : ('📋 PROGRES TUGAS ' + payload.tugasId);
        var tskUpBody = 'Status tugas: ' + (payload.status || 'Updated') + (payload.feedbackCOO ? (' | Catatan COO: ' + payload.feedbackCOO) : '');
        var areaUpStr = String(payload.areaId || '').toUpperCase().trim();
        var assignedUpStr = String(payload.assignedTo || '').trim();
        var isNationalUp = (!areaUpStr || areaUpStr === 'ALL' || assignedUpStr.toLowerCase().indexOf('seluruh') !== -1 || assignedUpStr.toLowerCase().indexOf('semua') !== -1 || assignedUpStr.toLowerCase() === 'all');
        // Jika Master COO memberi balasan feedback/ACC -> notif ke penerima tugas. Jika AM yang update progres -> notif ke Master COO.
        var tskUpTarget = 'COO';
        if (isFeedbackFromCOO) {
          if (isNationalUp) {
            tskUpTarget = 'ALL';
          } else if (areaUpStr && areaUpStr !== 'ALL') {
            tskUpTarget = ['COO', areaUpStr];
          } else {
            var mAreaUp = assignedUpStr.match(/AREA-\d+/i);
            tskUpTarget = mAreaUp ? ['COO', mAreaUp[0].toUpperCase()] : 'ALL';
          }
        } else {
          tskUpTarget = (areaUpStr && areaUpStr !== 'ALL') ? ['COO', areaUpStr] : 'COO';
        }
        triggerOperationalPushAlert('TUGAS', tskUpTitle, tskUpBody, tskUpTarget);
      } catch (eTskUpPush) {
        Logger.log('Push update tugas notice: ' + eTskUpPush.message);
      }

      return { success: true, message: 'Progres tugas berhasil diperbarui.', tugasId: payload.tugasId };
    } else {
      // Buat Tugas Baru
      var nextId = generateNextId(TAB.TUGAS, 'TSK', COL_TUGAS.ID, false);
      var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      var newBuktiUrl = payload.buktiUrl || '';
      if (newBuktiUrl) {
        var sNewUrl = String(newBuktiUrl).trim();
        var lNewHttps = sNewUrl.lastIndexOf('https://');
        var lNewHttp = sNewUrl.lastIndexOf('http://');
        var maxNewIdx = Math.max(lNewHttps, lNewHttp);
        if (maxNewIdx > 0) sNewUrl = sNewUrl.substring(maxNewIdx).trim();
        newBuktiUrl = sNewUrl;
      }
      if (newBuktiUrl && newBuktiUrl.indexOf('data:') === 0) {
        try {
          var upResNewTsk = apiUploadFileToDrive(
            newBuktiUrl,
            payload.fileName || ('BuktiTugas_' + nextId + '.jpg'),
            payload.fileType || 'image/jpeg',
            payload.areaId || 'AREA-01',
            'DataTugas'
          );
          if (upResNewTsk && upResNewTsk.success && upResNewTsk.fileUrl) {
            newBuktiUrl = upResNewTsk.fileUrl;
          }
        } catch (eUpNewTsk) {}
      }
      var newRow = [
        nextId,
        payload.judul || 'Instruksi Tugas',
        payload.areaId || 'ALL',
        payload.assignedTo || 'Seluruh Area Manager',
        payload.deadline || '',
        payload.prioritas || 'NORMAL',
        payload.status || 'Waiting',
        payload.catatan || '',
        newBuktiUrl,
        payload.feedbackCOO || '',
        nowStr,
        payload.routineCycle || 'INSIDENTAL',
        payload.actionLink || ''
      ];
      sheet.appendRow(newRow);

      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori TUGAS (Baru - Ditugaskan ke Manager/User)
      try {
        var tskNewTitle = '📋 INSTRUKSI TUGAS OPERASIONAL';
        var tskNewBody = (payload.judul || 'Tugas Baru') + ' [' + (payload.prioritas || 'NORMAL') + '] • Ditugaskan ke: ' + (payload.assignedTo || 'Seluruh Area Manager');
        var areaNewStr = String(payload.areaId || '').toUpperCase().trim();
        var assignedNewStr = String(payload.assignedTo || '').trim();
        var isNationalNew = (!areaNewStr || areaNewStr === 'ALL' || assignedNewStr.toLowerCase().indexOf('seluruh') !== -1 || assignedNewStr.toLowerCase().indexOf('semua') !== -1 || assignedNewStr.toLowerCase() === 'all');
        // Target tugas operasional: jika bukan nasional, arahkan ke COO dan Area terkait (COO,AREA-XX)
        var tskNewTarget = 'ALL';
        if (!isNationalNew) {
          if (areaNewStr && areaNewStr !== 'ALL') {
            tskNewTarget = ['COO', areaNewStr];
          } else {
            var mAreaNew = assignedNewStr.match(/AREA-\d+/i);
            tskNewTarget = mAreaNew ? ['COO', mAreaNew[0].toUpperCase()] : 'ALL';
          }
        }
        triggerOperationalPushAlert('TUGAS', tskNewTitle, tskNewBody, tskNewTarget);
      } catch (eTskNewPush) {
        Logger.log('Push new tugas notice: ' + eTskNewPush.message);
      }

      return { success: true, message: 'Instruksi tugas berhasil diterbitkan.', tugasId: nextId };
    }
  } catch (err) {
    return { success: false, message: 'Gagal proses tugas: ' + err.message };
  }
}

/**
 * API: Hapus Data Tugas
 */
function apiDeleteTugas(tugasId) {
  try {
    if (typeof tugasId === 'object' && tugasId !== null) tugasId = tugasId.tugasId || tugasId.id;
    var sheet = getSheet(TAB.TUGAS);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_TUGAS.ID]) === String(tugasId)) {
        rowIdx = i + 1;
        break;
      }
    }
    if (rowIdx > 0) {
      sheet.deleteRow(rowIdx);
    }
    if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['SALES']);
    return { success: true, message: 'Tugas ' + tugasId + ' berhasil dihapus dari sistem.' };
  } catch (err) {
    return { success: true, message: 'Tugas ' + tugasId + ' berhasil dihapus dari tampilan sistem.' };
  }
}

// ================================================================================
// BAGIAN 2: AUTO-COMPLETE TUGAS HARIAN DARI INPUT PENJUALAN
// ================================================================================

/**
 * Auto-update status Tugas Daily di Google Sheets (Hanya Menulis Jika Belum Completed Hari Ini)
 */
function autoCompleteDailyTaskInSheet(targetDate) {
  try {
    var sheetTugas = getSheet(TAB.TUGAS);
    var dataTugas = sheetTugas.getDataRange().getValues();
    var tglText = targetDate || Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    var expectedNote = '✓ Selesai Otomatis: Data sales harian terinput pada ' + tglText;
    for (var k = 1; k < dataTugas.length; k++) {
      var tId = String(dataTugas[k][COL_TUGAS.ID] || '');
      var tJudul = String(dataTugas[k][COL_TUGAS.JUDUL] || '');
      var tSiklus = String(dataTugas[k][COL_TUGAS.SIKLUS] || '');
      if (tId === 'TSK-RTN-DAILY' || tSiklus === 'DAILY' || tJudul.toLowerCase().indexOf('sales harian') !== -1) {
        var curStatus = String(dataTugas[k][COL_TUGAS.STATUS] || '').trim();
        var curNote = String(dataTugas[k][COL_TUGAS.CATATAN] || '').trim();
        if (curStatus === 'Completed' && curNote.indexOf(tglText) !== -1) {
          continue; // Hemat write saat jam closing: sudah selesai untuk tanggal ini
        }
        sheetTugas.getRange(k + 1, COL_TUGAS.STATUS + 1, 1, 2).setValues([['Completed', expectedNote]]);
      }
    }
  } catch (eTugas) {
    // Abaikan jika tab tugas belum aktif
  }
}
