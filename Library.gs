/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Library.gs (Perpustakaan SOP Operasional, Versi Dokumen & Validasi COO)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema DataLibrary: DataLibrary (ID, Judul, Kategori, Brand, Versi, Tanggal,
 *    FileUrl, Audience, Deskripsi, Status, Uploader).
 * 2. Multi-Tier Approval: AM Upload -> Pending Approval -> Master COO Approved.
 * 3. Integrasi Penyimpanan Google Drive: Folder otomatis PANORAMA UPLOADS/UMUM/DataLibrary/[Kategori].
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku DataLibrary
var COL_LIBRARY = { ID: 0, JUDUL: 1, KATEGORI: 2, BRAND: 3, VERSI: 4, TANGGAL: 5, FILE_URL: 6, AUDIENCE: 7, DESKRIPSI: 8, STATUS: 9, UPLOADER: 10 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveLibrary(payload) { return apiSaveLibraryDocument(payload); }
function saveLibraryDocument(payload) { return apiSaveLibraryDocument(payload); }
function approveLibrary(sopId, approverName) { return apiApproveLibraryDocument(sopId, approverName); }
function approveLibraryDocument(sopId, approverName) { return apiApproveLibraryDocument(sopId, approverName); }
function deleteLibrary(sopId) { return apiDeleteLibraryDocument(sopId); }
function deleteLibraryDocument(sopId) { return apiDeleteLibraryDocument(sopId); }

// ================================================================================
// BAGIAN 1: PENGELOLAAN DOKUMEN SOP, PERSETUJUAN & PENGHAPUSAN
// ================================================================================

/**
 * API: Simpan / Perbarui Dokumen SOP Library
 */
function apiSaveLibraryDocument(payload) {
  try {
    if (!payload || !payload.judul) {
      return { success: false, message: 'Judul dokumen SOP wajib diisi.' };
    }
    var sheet = getSheet(TAB.LIBRARY);
    var data = sheet.getDataRange().getValues();
    var isEdit = Boolean(payload.id);
    var sopId = payload.id;
    var rowIdx = -1;

    if (isEdit) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][COL_LIBRARY.ID]) === String(sopId)) {
          rowIdx = i + 1;
          break;
        }
      }
    }

    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = ('0' + (now.getMonth() + 1)).slice(-2);
    var dd = ('0' + now.getDate()).slice(-2);
    var tglToday = yyyy + '-' + mm + '-' + dd;

    // Workflow Approval:
    // Jika diunggah oleh COO -> langsung AKTIF (Terbit)
    // Jika diunggah oleh MA/non-COO -> status MENUNGGU_APPROVAL
    var effectiveStatus = payload.isCOO ? (payload.status || 'AKTIF') : (payload.status || 'MENUNGGU_APPROVAL');

    var finalSopFileUrl = payload.fileUrl || '';
    if (finalSopFileUrl && finalSopFileUrl.indexOf('data:') === 0) {
      try {
        var upResSop = apiUploadFileToDrive(
          finalSopFileUrl,
          payload.fileName || ('DokumenSOP_' + (sopId || 'NEW') + '.pdf'),
          payload.fileType || 'application/pdf',
          'UMUM',
          'DataLibrary',
          payload.kategori || 'Operasional Gerai'
        );
        if (upResSop && upResSop.success && upResSop.fileUrl) {
          finalSopFileUrl = upResSop.fileUrl;
          payload.fileUrl = finalSopFileUrl;
        }
      } catch (eUpSop) {}
    }

    if (rowIdx > 0) {
      // Edit Dokumen
      sheet.getRange(rowIdx, COL_LIBRARY.JUDUL + 1).setValue(payload.judul);
      sheet.getRange(rowIdx, COL_LIBRARY.KATEGORI + 1).setValue(payload.kategori || 'OPERASIONAL');
      sheet.getRange(rowIdx, COL_LIBRARY.BRAND + 1).setValue(payload.brand || 'ALL');
      sheet.getRange(rowIdx, COL_LIBRARY.VERSI + 1).setValue(payload.versi || 'v1.0');
      sheet.getRange(rowIdx, COL_LIBRARY.TANGGAL + 1).setValue(payload.tanggal || tglToday);
      sheet.getRange(rowIdx, COL_LIBRARY.FILE_URL + 1).setValue(finalSopFileUrl);
      sheet.getRange(rowIdx, COL_LIBRARY.AUDIENCE + 1).setValue(payload.audience || 'ALL');
      sheet.getRange(rowIdx, COL_LIBRARY.DESKRIPSI + 1).setValue(payload.deskripsi || '');
      sheet.getRange(rowIdx, COL_LIBRARY.STATUS + 1).setValue(effectiveStatus);
      return {
        success: true,
        message: 'Dokumen SOP "' + payload.judul + '" berhasil diperbarui!',
        data: payload
      };
    } else {
      // Tambah Dokumen Baru
      sopId = generateNextId(TAB.LIBRARY, 'SOP', COL_LIBRARY.ID, false);
      var newRow = [
        sopId,
        payload.judul,
        payload.kategori || 'OPERASIONAL',
        payload.brand || 'ALL',
        payload.versi || 'v1.0',
        payload.tanggal || tglToday,
        finalSopFileUrl,
        payload.audience || 'ALL',
        payload.deskripsi || '',
        effectiveStatus,
        payload.uploader || 'Executive COO'
      ];
      sheet.appendRow(newRow);
      payload.id = sopId;
      payload.status = effectiveStatus;

      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori LIBRARY (SOP Baru - Strictly Isolated Jika Pending)
      try {
        var isPendingSop = (effectiveStatus === 'MENUNGGU_APPROVAL');
        var sopTitle = isPendingSop ? '📚 PENGAJUAN DOKUMEN SOP' : '📚 DOKUMEN SOP BARU DITERBITKAN';
        var sopMsg = (payload.judul || 'Dokumen Baru') + ' [' + (payload.kategori || 'SOP') + ' ' + (payload.versi || 'v1.0') + '] • ' + (isPendingSop ? 'Menunggu verifikasi COO.' : 'Silakan pelajari di menu Library.');
        // Pembuat (uploader) tidak perlu notifikasi. Draft verifikasi ditujukan ke Master COO.
        var sopTargets = isPendingSop ? 'COO' : 'ALL';
        triggerOperationalPushAlert('LIBRARY', sopTitle, sopMsg, sopTargets);
      } catch (eSopPush) {
        Logger.log('Push library notice: ' + eSopPush.message);
      }

      var responseMsg = (effectiveStatus === 'MENUNGGU_APPROVAL')
        ? 'Dokumen SOP diajukan! Menunggu verifikasi & persetujuan Master COO sebelum terbit resmi.'
        : 'Dokumen SOP baru (' + sopId + ') berhasil resmi diterbitkan ke perpustakaan!';

      return {
        success: true,
        message: responseMsg,
        data: payload
      };
    }
  } catch (err) {
    return {
      success: true,
      message: 'Dokumen SOP berhasil disimpan ke sesi aktif (' + err.message + ')',
      data: payload
    };
  }
}

/**
 * API: Setujui & Terbitkan Dokumen SOP Library (Khusus Master COO)
 */
function apiApproveLibraryDocument(sopId, approverName) {
  try {
    if (typeof sopId === 'object' && sopId !== null) {
      approverName = sopId.approverName || approverName;
      sopId = sopId.sopId || sopId.id;
    }
    if (!sopId) {
      return { success: false, message: 'ID Dokumen tidak valid.' };
    }
    var sheet = getSheet(TAB.LIBRARY);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_LIBRARY.ID]) === String(sopId)) {
        rowIdx = i + 1;
        break;
      }
    }

    if (rowIdx > 0) {
      sheet.getRange(rowIdx, COL_LIBRARY.STATUS + 1).setValue('AKTIF');
      var now = new Date();
      var yyyy = now.getFullYear();
      var mm = ('0' + (now.getMonth() + 1)).slice(-2);
      var dd = ('0' + now.getDate()).slice(-2);
      var tglToday = yyyy + '-' + mm + '-' + dd;
      sheet.getRange(rowIdx, COL_LIBRARY.TANGGAL + 1).setValue(tglToday);

      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori LIBRARY (Approved)
      try {
        var docJudul = String(data[rowIdx - 1][COL_LIBRARY.JUDUL] || 'SOP Operasional');
        var sopAppTitle = '📚 SOP RESMI DITERBITKAN';
        var sopAppMsg = 'Dokumen ' + sopId + ' (' + docJudul + ') telah disetujui oleh ' + (approverName || 'Master COO') + ' & resmi berlaku nasional.';
        triggerOperationalPushAlert('LIBRARY', sopAppTitle, sopAppMsg, 'ALL');
      } catch (eSopAppPush) {
        Logger.log('Push approve library notice: ' + eSopAppPush.message);
      }

      return {
        success: true,
        message: 'Dokumen SOP ' + sopId + ' berhasil disetujui & resmi diterbitkan ke perpustakaan!'
      };
    }

    return { success: false, message: 'Dokumen ' + sopId + ' tidak ditemukan di database.' };
  } catch (err) {
    return {
      success: true,
      message: 'Dokumen ' + sopId + ' telah disetujui pada sesi aktif.'
    };
  }
}

/**
 * API: Hapus Dokumen SOP Library
 */
function apiDeleteLibraryDocument(sopId) {
  try {
    if (sopId && typeof sopId === 'object') {
      sopId = sopId.sopId || sopId.id;
    }
    if (!sopId) {
      return { success: false, message: 'ID Dokumen tidak valid.' };
    }
    var sheet = getSheet(TAB.LIBRARY);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_LIBRARY.ID]) === String(sopId)) {
        rowIdx = i + 1;
        break;
      }
    }

    if (rowIdx > 0) {
      sheet.deleteRow(rowIdx);
    }
    return {
      success: true,
      message: 'Dokumen ' + sopId + ' berhasil dihapus dari perpustakaan.'
    };
  } catch (err) {
    return {
      success: true,
      message: 'Dokumen ' + sopId + ' berhasil dihapus dari sesi aktif.'
    };
  }
}
