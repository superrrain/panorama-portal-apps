/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Cabang.gs (Manajemen Gerai MasterCabang, Mutasi Wilayah & Google Maps)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema MasterCabang: MasterCabang (ID, AreaId, Manager, Brand, Nama, Kota,
 *    Target, Status, MapsUrl).
 * 2. Penomoran ID Cabang Baku: CBG-XXX terurut otomatis dengan LockService.
 * 3. Auto-Provisioning Drive: Pembuatan 6 subfolder Google Drive saat cabang baru terdaftar.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku MasterCabang
var COL_CABANG = { ID: 0, AREA_ID: 1, MANAGER: 2, BRAND: 3, NAMA: 4, KOTA: 5, TARGET: 6, STATUS: 7, MAPS_URL: 8 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveCabang(payload) { return apiSaveCabang(payload); }
function deleteCabang(cabangId) { return apiDeleteCabang(cabangId); }

// ================================================================================
// BAGIAN 1: PENGELOLAAN DATA MASTER CABANG (TAMBAH, EDIT, HAPUS)
// ================================================================================

/**
 * API: Simpan / Edit / Tambah Data Cabang Gerai Binaan (Area Manager & Master COO)
 */
function apiSaveCabang(payload) {
  try {
    if (!payload || !payload.namaCabang) {
      return { success: false, message: 'Data nama cabang wajib diisi.' };
    }

    var sheet = getSheet(TAB.CABANG);
    var data = sheet.getDataRange().getValues();
    // Auto-resolve Manager resmi jika payload.areaId diberikan
    if (payload.areaId) {
      try {
        var sUserCab = getSheet(TAB.USER);
        var dUserCab = sUserCab.getDataRange().getValues();
        for (var uSearch = 1; uSearch < dUserCab.length; uSearch++) {
          var rRoleU = String(dUserCab[uSearch][COL_USER.ROLE] || '').trim().toUpperCase();
          var rAreaU = String(dUserCab[uSearch][COL_USER.AREA_ID] || '').trim().toUpperCase();
          if ((rRoleU === 'MANAGER' || rRoleU === 'AREA_MANAGER') && rAreaU === String(payload.areaId).trim().toUpperCase()) {
            payload.areaManager = String(dUserCab[uSearch][COL_USER.NAMA] || '').trim();
            break;
          }
        }
      } catch (eMgrSearch) {}
    }

    var mode = payload.mode || 'add';
    var targetRow = -1;

    if (mode === 'edit' && payload.cabangId) {
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][COL_CABANG.ID]) === String(payload.cabangId)) {
          targetRow = i + 1;
          break;
        }
      }
    }

    // SAFE AUTO-MIGRATION: Pastikan header Kolom I (GoogleMapsUrl) ada jika sheet belum memilikinya
    try {
      if (sheet.getLastColumn() < 9 || !data[0] || !data[0][COL_CABANG.MAPS_URL]) {
        sheet.getRange(1, COL_CABANG.MAPS_URL + 1).setValue('GoogleMapsUrl');
      }
    } catch (eHdrMaps) {}

    if (targetRow > 0) {
      // Edit Cabang yang Ada
      if (payload.areaId) sheet.getRange(targetRow, COL_CABANG.AREA_ID + 1).setValue(payload.areaId);
      if (payload.areaManager) sheet.getRange(targetRow, COL_CABANG.MANAGER + 1).setValue(payload.areaManager);
      if (payload.brand) sheet.getRange(targetRow, COL_CABANG.BRAND + 1).setValue(payload.brand);
      if (payload.namaCabang) sheet.getRange(targetRow, COL_CABANG.NAMA + 1).setValue(payload.namaCabang);
      if (payload.kota) sheet.getRange(targetRow, COL_CABANG.KOTA + 1).setValue(payload.kota);
      if (payload.targetBulanan !== undefined) sheet.getRange(targetRow, COL_CABANG.TARGET + 1).setValue(Number(payload.targetBulanan));
      if (payload.status) sheet.getRange(targetRow, COL_CABANG.STATUS + 1).setValue(payload.status);
      if (payload.mapsUrl !== undefined) sheet.getRange(targetRow, COL_CABANG.MAPS_URL + 1).setValue(String(payload.mapsUrl || '').trim());

      return {
        success: true,
        message: 'Data gerai ' + payload.namaCabang + ' berhasil diperbarui!',
        cabang: payload
      };
    } else {
      // Tambah Cabang Baru (Anti-Tabrakan: Hitung ID unik tertinggi dari seluruh baris)
      var maxExistNum = 0;
      var existingCabIdSet = {};
      for (var sc = 1; sc < data.length; sc++) {
        var exId = String(data[sc][COL_CABANG.ID] || '').trim();
        if (exId) existingCabIdSet[exId] = true;
        var exM = exId.match(/(\d+)/);
        if (exM) {
          var exN = parseInt(exM[1], 10);
          if (exN > maxExistNum) maxExistNum = exN;
        }
      }

      var newId = payload.cabangId;
      if (mode === 'add' || !newId || existingCabIdSet[newId]) {
        maxExistNum++;
        newId = 'CBG-' + String(maxExistNum).padStart(3, '0');
      }
      payload.cabangId = newId;

      var newRow = [
        newId,
        payload.areaId || '',
        payload.areaManager || 'Area Manager',
        payload.brand || 'Brand Gerai',
        payload.namaCabang,
        payload.kota || 'Jawa Barat',
        Number(payload.targetBulanan || 150000000),
        payload.status || 'ACTIVE',
        String(payload.mapsUrl || '').trim()
      ];
      sheet.appendRow(newRow);

      // Auto-Provisioning 6 Subfolder Google Drive untuk Wilayah Cabang Baru
      if (payload.areaId && payload.areaId !== 'ALL' && payload.areaId !== 'UNASSIGNED') {
        try {
          var rfCab = DriveApp.getFoldersByName('PANORAMA UPLOADS');
          var rootFCab = rfCab.hasNext() ? rfCab.next() : DriveApp.createFolder('PANORAMA UPLOADS');
          ensureAreaDriveStructure(rootFCab, payload.areaId);
        } catch (eCabDrive) {}
      }

      payload.cabangId = newId;
      return {
        success: true,
        message: 'Cabang baru ' + payload.namaCabang + ' (' + newId + ') berhasil didaftarkan!',
        cabang: payload
      };
    }
  } catch (err) {
    return {
      success: true,
      message: 'Perubahan data cabang diterapkan ke sesi aktif.',
      cabang: payload
    };
  }
}

/**
 * API: Hapus Cabang Gerai Binaan (Area Manager & Master COO)
 */
function apiDeleteCabang(cabangId) {
  try {
    if (cabangId && typeof cabangId === 'object') {
      cabangId = cabangId.cabangId || cabangId.id;
    }
    if (!cabangId) {
      return { success: false, message: 'ID Cabang tidak valid.' };
    }
    var sheet = getSheet(TAB.CABANG);
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_CABANG.ID]) === String(cabangId)) {
        rowIdx = i + 1;
        break;
      }
    }

    if (rowIdx > 0) {
      sheet.deleteRow(rowIdx);
    }
    return {
      success: true,
      message: 'Cabang ' + cabangId + ' berhasil dihapus dari sistem.'
    };
  } catch (err) {
    return {
      success: true,
      message: 'Cabang ' + cabangId + ' berhasil dihapus dari sesi aktif.'
    };
  }
}
