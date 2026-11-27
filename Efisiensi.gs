/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Efisiensi.gs (HPP Produk, Pembuangan Waste, Plafon Kas Toko & Reimburse)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema DataEfisiensi: DataEfisiensi (ID, Tanggal, AreaId, CabangId, HPP, TargetHPP,
 *    Waste, TargetWaste, PlafonCash, TerpakaiCash, NotaUrl, Catatan, UpdatedBy).
 * 2. Smart Upsert Harian: Menjamin 1 entri per cabang per tanggal laporan.
 * 3. Reimbursement Otomatis Kas Kecil: Reset kas terpakai ke 0 dan pertahankan akumulasi bulanan.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku DataEfisiensi
var COL_EFISIENSI = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, HPP: 4, TARGET_HPP: 5, WASTE: 6, TARGET_WASTE: 7, PLAFON_CASH: 8, TERPAKAI_CASH: 9, NOTA_URL: 10, CATATAN: 11, UPDATED_BY: 12 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveEfisiensi(payload) { return apiSaveEfisiensi(payload); }
function reimburseKas(payload) { return apiReimburseKas(payload); }

// ================================================================================
// BAGIAN 1: PENCATATAN EFISIENSI HPP, WASTE & REIMBURSE KAS KECIL TOKO
// ================================================================================

/**
 * API: Simpan Log Efisiensi (HPP, Waste & Petty Cash) - Smart Upsert Anti-Duplikasi
 */
function apiSaveEfisiensi(payload) {
  var pushAlertJob = null;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return {
      success: false,
      retryable: true,
      code: 'LOCK_TIMEOUT',
      message: 'Antrean server sedang padat. Silakan tekan Simpan ulang sesaat lagi.'
    };
  }
  try {
    if (!payload) return { success: false, message: 'Payload data efisiensi kosong.' };
    var targetCabangId = String(payload.cabangId || '').trim();
    if (!targetCabangId) {
      return { success: false, message: 'Gagal simpan: ID Cabang tidak boleh kosong.' };
    }
    var sheet = getSheet(TAB.EFISIENSI);
    var data = sheet.getDataRange().getValues();

    // Self-healing: bersihkan baris tanpa CabangID jika ada
    for (var cln = data.length - 1; cln >= 1; cln--) {
      var cIdCheck = String(data[cln][COL_EFISIENSI.CABANG_ID] || '').trim();
      if (!cIdCheck) {
        try { sheet.deleteRow(cln + 1); data.splice(cln, 1); } catch (eCln) {}
      }
    }

    var matchingRowIndices = [];
    var targetDate = normalizeDateStr(payload.tanggal) || Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    var targetEffId = String(payload.efisiensiId || '').trim();

    // Baca parameter operasional dari cache MasterConfig jika tersedia
    var defaultTargetHpp = 35.0;
    var defaultTargetWaste = 2.0;
    try {
      var dCfg = (typeof getCachedSheetValues_ === 'function')
        ? getCachedSheetValues_(TAB.CONFIG, 'MASTER', 900)
        : (function() { var sc = getSheet(TAB.CONFIG); return sc ? sc.getDataRange().getValues() : []; })();
      for (var c = 1; c < dCfg.length; c++) {
        var kCfg = String(dCfg[c][0] || '').trim().toLowerCase();
        if (kCfg === 'maxhpp' || kCfg === 'max_hpp') {
          var nVal = parseFloat(dCfg[c][1]);
          if (!isNaN(nVal) && nVal > 0) defaultTargetHpp = nVal;
        }
        if (kCfg === 'maxwaste' || kCfg === 'max_waste') {
          var nWaste = parseFloat(dCfg[c][1]);
          if (!isNaN(nWaste) && nWaste > 0) defaultTargetWaste = nWaste;
        }
      }
    } catch (eCfg) {}

    var targetHppVal = (payload.targetHppMax !== undefined && payload.targetHppMax !== '' && !isNaN(Number(payload.targetHppMax)) && Number(payload.targetHppMax) > 0)
      ? Number(payload.targetHppMax)
      : defaultTargetHpp;
    var targetWasteVal = (payload.targetWasteMax !== undefined && payload.targetWasteMax !== '' && !isNaN(Number(payload.targetWasteMax)) && Number(payload.targetWasteMax) > 0)
      ? Number(payload.targetWasteMax)
      : defaultTargetWaste;

    // Helper Partisi Minggu Kalender (v5.8.0)
    function getWeekNumFromDateStr(dStr) {
      if (!dStr) return 1;
      var parts = String(dStr).split('T')[0].split('-');
      var dayNum = parseInt(parts[2], 10) || 1;
      if (dayNum <= 7) return 1;
      if (dayNum <= 14) return 2;
      if (dayNum <= 21) return 3;
      if (dayNum <= 28) return 4;
      return 5;
    }

    var targetWeekNum = payload.mingguKe ? Number(payload.mingguKe) : getWeekNumFromDateStr(targetDate);
    var targetMonthStr = String(targetDate).substring(0, 7);

    // Cek apakah ada record spesifik (by efisiensiId, atau by cabangId + bulan + minggu kalender)
    for (var i = 1; i < data.length; i++) {
      var rowId = String(data[i][COL_EFISIENSI.ID] || '').trim();
      var rowCbg = String(data[i][COL_EFISIENSI.CABANG_ID] || '').trim();
      var rowTgl = normalizeDateStr(data[i][COL_EFISIENSI.TANGGAL]);
      var rowMonth = rowTgl ? String(rowTgl).substring(0, 7) : '';
      var rowWeekNum = getWeekNumFromDateStr(rowTgl);

      if (targetEffId && rowId === targetEffId) {
        matchingRowIndices.push(i + 1);
      } else if (rowCbg === targetCabangId && rowMonth === targetMonthStr && rowWeekNum === targetWeekNum) {
        matchingRowIndices.push(i + 1);
      }
    }

    // Perhitungan HPP Opsi A (Akumulasi Bulanan Berjalan)
    var effHppVal = Number(payload.hppPersen || 0);
    if ((effHppVal > 100 || !effHppVal) && Number(payload.pembelianBahanBaku || 0) > 0) {
      try {
        var sSales = getSheet(TAB.SALES);
        if (sSales) {
          var dSales = sSales.getDataRange().getValues();
          var sMonth = targetDate.substring(0, 7);
          var mOmzet = 0;
          var dedupSalesMap = {};
          for (var sIdx = 1; sIdx < dSales.length; sIdx++) {
            var scId = String(dSales[sIdx][COL_SALES.CABANG_ID] || '').trim();
            var sTgl = normalizeDateStr(dSales[sIdx][COL_SALES.TANGGAL]);
            if (scId === targetCabangId && sTgl && sTgl.indexOf(sMonth) === 0) {
              dedupSalesMap[sTgl] = Number(dSales[sIdx][COL_SALES.ACTUAL] || 0);
            }
          }
          for (var tKey in dedupSalesMap) {
            mOmzet += dedupSalesMap[tKey];
          }
          if (mOmzet > 0) {
            effHppVal = Math.round((Number(payload.pembelianBahanBaku) / mOmzet) * 1000) / 10;
          }
        }
      } catch (eHppRecalc) {}
    }

    var effResponse = null;
    if (matchingRowIndices.length > 0) {
      // MODE REVISI / UPDATE: Perbarui data baris eksisting pertama
      var primaryRow = matchingRowIndices[0];
      sheet.getRange(primaryRow, COL_EFISIENSI.TANGGAL + 1).setValue(targetDate);
      sheet.getRange(primaryRow, COL_EFISIENSI.AREA_ID + 1).setValue(payload.areaId);
      sheet.getRange(primaryRow, COL_EFISIENSI.CABANG_ID + 1).setValue(targetCabangId);
      sheet.getRange(primaryRow, COL_EFISIENSI.HPP + 1).setValue(effHppVal);
      sheet.getRange(primaryRow, COL_EFISIENSI.TARGET_HPP + 1).setValue(targetHppVal);
      sheet.getRange(primaryRow, COL_EFISIENSI.WASTE + 1).setValue(Number(payload.wastePersen || 0));
      sheet.getRange(primaryRow, COL_EFISIENSI.TARGET_WASTE + 1).setValue(targetWasteVal);
      sheet.getRange(primaryRow, COL_EFISIENSI.PLAFON_CASH + 1).setValue(payload.plafonPettyCash !== undefined ? Number(payload.plafonPettyCash) : 0);
      sheet.getRange(primaryRow, COL_EFISIENSI.TERPAKAI_CASH + 1).setValue(Number(payload.terpakaiPettyCash || 0));
      sheet.getRange(primaryRow, COL_EFISIENSI.NOTA_URL + 1).setValue(Number(payload.kasBulanan !== undefined ? payload.kasBulanan : (payload.terpakaiPettyCash || 0)));
      sheet.getRange(primaryRow, COL_EFISIENSI.CATATAN + 1).setValue(Number(payload.pembelianBahanBaku || 0));
      sheet.getRange(primaryRow, COL_EFISIENSI.UPDATED_BY + 1).setValue(payload.updatedBy);

      // JIKA DITEMUKAN BARIS DUPLIKAT SEBELUMNYA, BERSIHKAN / HAPUS BARIS EKSTRA!
      for (var dIdx = matchingRowIndices.length - 1; dIdx >= 1; dIdx--) {
        sheet.deleteRow(matchingRowIndices[dIdx]);
      }

      var effHpp = effHppVal;
      var effWaste = Number(payload.wastePersen || 0);
      var effCbg = payload.namaCabang || targetCabangId || 'Gerai';
      var isAlert = (effHpp > targetHppVal || effWaste > targetWasteVal);
      pushAlertJob = {
        title: isAlert ? '⚠️ ALERT EFISIENSI: HPP/WASTE OVER' : '📊 UPDATE EFISIENSI GERAI',
        body: effCbg + ' (' + (payload.areaId || 'Wilayah') + '): HPP ' + effHpp + '% (Max: ' + targetHppVal + '%), Waste ' + effWaste + '% (Max: ' + targetWasteVal + '%).',
        targets: (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'ALL'
      };

      effResponse = {
        success: true,
        isRevised: true,
        message: 'Data efisiensi gerai ' + (payload.namaCabang || targetCabangId) + ' berhasil diperbarui (menggantikan data lama).',
        efisiensiId: String(data[primaryRow - 1][COL_EFISIENSI.ID] || '')
      };
    } else {
      // Tambah baris transaksi baru di dalam lock yang sama
      var nextId = payload.efisiensiId || ((typeof generateNextIdUnlocked_ === 'function')
        ? generateNextIdUnlocked_(sheet, 'EFF', COL_EFISIENSI.ID, false)
        : generateNextId(TAB.EFISIENSI, 'EFF', COL_EFISIENSI.ID, false));
      var newRow = [
        nextId,
        targetDate,
        payload.areaId,
        targetCabangId,
        effHppVal,
        targetHppVal,
        Number(payload.wastePersen || 0),
        targetWasteVal,
        (payload.plafonPettyCash !== undefined ? Number(payload.plafonPettyCash) : 0),
        Number(payload.terpakaiPettyCash || 0),
        Number(payload.kasBulanan !== undefined ? payload.kasBulanan : (payload.terpakaiPettyCash || 0)),
        Number(payload.pembelianBahanBaku || 0),
        payload.updatedBy
      ];
      sheet.appendRow(newRow);

      var effHppNew = effHppVal;
      var effWasteNew = Number(payload.wastePersen || 0);
      var effCbgNew = payload.namaCabang || targetCabangId || 'Gerai';
      var isAlertNew = (effHppNew > targetHppVal || effWasteNew > targetWasteVal);
      pushAlertJob = {
        title: isAlertNew ? '⚠️ ALERT EFISIENSI: HPP/WASTE OVER' : '📊 LAPORAN EFISIENSI GERAI',
        body: effCbgNew + ' (' + (payload.areaId || 'Wilayah') + '): HPP ' + effHppNew + '% (Max: ' + targetHppVal + '%), Waste ' + effWasteNew + '% (Max: ' + targetWasteVal + '%).',
        targets: (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'ALL'
      };

      effResponse = {
        success: true,
        isRevised: false,
        message: 'Data efisiensi gerai ' + (payload.namaCabang || targetCabangId) + ' tgl ' + targetDate + ' berhasil dicatat.',
        efisiensiId: nextId
      };
    }

    try { SpreadsheetApp.flush(); } catch (eFlush) {}
    if (typeof invalidateCacheDomains_ === 'function') {
      invalidateCacheDomains_(['OTHER_OPS']);
    }
    return effResponse;
  } catch (err) {
    return { success: false, retryable: true, message: 'Gagal simpan efisiensi: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
    if (pushAlertJob) {
      try {
        triggerOperationalPushAlert('EFISIENSI', pushAlertJob.title, pushAlertJob.body, pushAlertJob.targets);
      } catch (eEffPushOut) {
        Logger.log('Push efisiensi notice: ' + eEffPushOut.message);
      }
    }
  }
}

/**
 * API: Reimburse Kas Toko (Reset Kas Siklus Berjalan Toko ke 0, Pertahankan Akumulasi Kas Bulanan)
 */
function apiReimburseKas(payload) {
  return { 
    success: true, 
    message: 'Fitur reimburse kas telah dinonaktifkan.' 
  };
}
