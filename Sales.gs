/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Sales.gs (Realisasi Omzet Penjualan, Target Cabang, AI OCR & Leaderboard)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema DataSales: DataSales (ID, Tanggal, AreaId, CabangId, NamaCabang, Target,
 *    Actual, Persen, TotalTransaksi, CreatedBy, CreatedAt).
 * 2. Smart Upsert Anti-Duplikasi: Pembaruan data sales tgl/cabang sama tanpa menumpuk baris.
 * 3. Integrasi AI Gemini Vision: Ekstraksi omset & total transaksi dari struk POS fisik.
 * 4. Peringkat 5 Pilar: Evaluasi komprehensif Sales, HPP, Waste, SLA, dan Tugas.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku DataSales
var COL_SALES = { ID: 0, TANGGAL: 1, AREA_ID: 2, CABANG_ID: 3, NAMA: 4, TARGET: 5, ACTUAL: 6, PERSEN: 7, TRX: 8, CREATED_BY: 9, CREATED_AT: 10 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function saveSales(payload) { return apiSaveSales(payload); }
function saveBranchTarget(payload) { return apiSaveBranchTarget(payload); }
function scanReceiptWithAI(payload) { return apiScanReceiptWithAI(payload); }

// ================================================================================
// BAGIAN 1: KALKULASI LEADERBOARD PERINGKAT CABANG & NASIONAL
// ================================================================================

/**
 * Logika Kalkulasi Leaderboard SPV / Cabang Binaan (Khusus Akun Area Manager)
 * Evaluasi 5 Pilar Riil Berdasarkan Transaksi Aktif Tanpa Fallback Fiktif
 */
function hitungLeaderboardCabang(targetAreaId, listCabang, listSales, listEff, listInsiden, operationalConfig, listTugas) {
  var cfg = operationalConfig || {};
  var wSales = Number(cfg.bobotSales !== undefined ? cfg.bobotSales : 30);
  var wHpp = Number(cfg.bobotHpp !== undefined ? cfg.bobotHpp : 20);
  var wWaste = Number(cfg.bobotWaste !== undefined ? cfg.bobotWaste : 15);
  var wSla = Number(cfg.bobotSla !== undefined ? cfg.bobotSla : 20);
  var wTugas = Number(cfg.bobotTugas !== undefined ? cfg.bobotTugas : 15);
  var maxHppStd = Number(cfg.maxHpp || 35.0);
  var maxWasteStd = Number(cfg.maxWaste || 2.0);

  var cabangMap = {};
  listCabang.forEach(function(c) {
    var cNamaClean = String(c.namaCabang || '').trim();
    if (!cNamaClean || cNamaClean === c.cabangId) {
      cNamaClean = (c.brand ? (c.brand + ' ') : '') + (c.kota ? c.kota : ('Cabang ' + c.cabangId));
    }
    cabangMap[c.cabangId] = {
      cabangId: c.cabangId,
      namaCabang: cNamaClean,
      brand: c.brand || 'D\'Kriuk',
      kota: c.kota || '-',
      spvToko: c.spvToko || '',
      totalTarget: Number(c.targetBulanan || 0),
      totalActual: 0,
      hasSales: false,
      totalHpp: 0,
      countHpp: 0,
      totalWaste: 0,
      countWaste: 0,
      openIncident: 0,
      totalSla: 0,
      countSla: 0,
      totalTugas: 0,
      completedTugas: 0
    };
  });

  // Agregasi Sales (Bulan Berjalan & Deduplikasi Revisi)
  var nowMonthPrefixCab = new Date().toISOString().substring(0, 7);
  var salesCabSeen = {};
  listSales.forEach(function(s) {
    var sTgl = normalizeDateStr(s.tanggal);
    if (!sTgl || sTgl.substring(0, 7) !== nowMonthPrefixCab) return;
    var sKey = String(s.cabangId) + '_' + sTgl;
    if (salesCabSeen[sKey]) return;
    salesCabSeen[sKey] = true;

    if (cabangMap[s.cabangId]) {
      var actVal = Number(s.actualSales || 0);
      cabangMap[s.cabangId].totalActual += actVal;
      cabangMap[s.cabangId].hasSales = true;
    }
  });

  // Helper ekstraksi YYYY-MM dari tanggal atau kode ID berpola YYYYMM
  function extractGasMonthPrefix(dateCandidates, idCandidate) {
    if (Array.isArray(dateCandidates)) {
      for (var dIdx = 0; dIdx < dateCandidates.length; dIdx++) {
        var raw = dateCandidates[dIdx];
        if (!raw) continue;
        var norm = normalizeDateStr(raw);
        if (norm && norm.length >= 7 && /^\d{4}-\d{2}/.test(norm)) {
          return norm.substring(0, 7);
        }
      }
    }
    if (idCandidate) {
      var idStr = String(idCandidate).trim();
      var mId = idStr.match(/(?:^|[-_])(20\d{2})(0[1-9]|1[0-2])(?:[-_]|$|\d)/);
      if (mId) return mId[1] + '-' + mId[2];
    }
    return '';
  }

  // Agregasi Efisiensi (Hanya Bulan Berjalan & Opsi A: Deduplikasi Cabang & Rasio Bulanan)
  var branchEffMapCab = {};
  listEff.forEach(function(e) {
    var eMonth = extractGasMonthPrefix([e.tanggal, e.createdAt], e.efisiensiId);
    if (eMonth && eMonth !== nowMonthPrefixCab) return;
    var cId = String(e.cabangId || '').trim();
    if (!cId) return;
    if (!branchEffMapCab[cId] || String(e.tanggal) > String(branchEffMapCab[cId].tanggal)) {
      branchEffMapCab[cId] = e;
    }
  });

  Object.keys(branchEffMapCab).forEach(function(cId) {
    var e = branchEffMapCab[cId];
    if (cabangMap[cId]) {
      var mSales = cabangMap[cId].totalActual || 0;
      var belanja = Number(e.pembelianBahanBaku || 0);
      var hVal = Number(e.hppPersen || 0);
      if (belanja > 0 && mSales > 0) {
        hVal = Math.round((belanja / mSales) * 1000) / 10;
      } else if (hVal > 100) {
        hVal = 35.0;
      }
      var wVal = Number(e.wastePersen);
      if (!isNaN(hVal) && hVal !== null && hVal > 0) {
        cabangMap[cId].totalHpp += hVal;
        cabangMap[cId].countHpp++;
      }
      if (!isNaN(wVal) && e.wastePersen !== '' && e.wastePersen !== null) {
        cabangMap[cId].totalWaste += wVal;
        cabangMap[cId].countWaste++;
      }
    }
  });

  // Agregasi Insiden (Bulan Berjalan + Carry-Over Insiden Belum Selesai dari Bulan Lalu)
  listInsiden.forEach(function(item) {
    var iStatus = String(item.status || '').trim().toUpperCase();
    var isResolved = (iStatus === 'RESOLVED' || iStatus === 'SELESAI' || iStatus === 'CLOSED' || iStatus === 'DONE');
    var iMonth = extractGasMonthPrefix([item.tanggalLapor, item.tanggal, item.waktuSelesai], item.insidenId);
    if (iMonth && iMonth < nowMonthPrefixCab && isResolved) return;
    if (iMonth && iMonth > nowMonthPrefixCab) return;

    if (cabangMap[item.cabangId]) {
      if (!isResolved) {
        cabangMap[item.cabangId].openIncident++;
      }
      var sla = Number(item.slaJam || 0);
      if (sla > 0) {
        cabangMap[item.cabangId].totalSla += sla;
        cabangMap[item.cabangId].countSla++;
      }
    }
  });

  // Agregasi Tugas SOP (Bulan Berjalan + Carry-Over Tugas Belum Selesai dari Bulan Lalu)
  if (Array.isArray(listTugas)) {
    listTugas.forEach(function(t) {
      var tStatus = String(t.status || '').trim().toLowerCase();
      var isCompleted = (tStatus === 'completed' || tStatus === 'done' || tStatus === 'selesai' || tStatus === 'verified');
      var tMonth = extractGasMonthPrefix([t.createdAt, t.deadline], t.tugasId);
      if (tMonth && tMonth < nowMonthPrefixCab && isCompleted) return;
      if (tMonth && tMonth > nowMonthPrefixCab) return;

      Object.keys(cabangMap).forEach(function(cId) {
        cabangMap[cId].totalTugas++;
        if (isCompleted) cabangMap[cId].completedTugas++;
      });
    });
  }

  var rankingList = [];
  Object.keys(cabangMap).forEach(function(key) {
    var item = cabangMap[key];
    var hasSales = item.hasSales && item.totalActual > 0;
    var targetVal = item.totalTarget > 0 ? item.totalTarget : (hasSales ? item.totalActual : 0);
    var actualVal = item.totalActual;
    var salesCapaian = (targetVal > 0 && actualVal > 0) ? (Math.round((actualVal / targetVal) * 1000) / 10) : 0;

    var hasHpp = item.countHpp > 0;
    var avgHpp = hasHpp ? (Math.round((item.totalHpp / item.countHpp) * 10) / 10) : null;

    var hasWaste = item.countWaste > 0;
    var avgWaste = hasWaste ? (Math.round((item.totalWaste / item.countWaste) * 10) / 10) : null;

    var avgSla = item.countSla > 0 ? (Math.round((item.totalSla / item.countSla) * 10) / 10) : 0;

    var tugasPersen = item.totalTugas > 0 ? Math.round((item.completedTugas / item.totalTugas) * 100) : 100;

    // Formula Skor Kinerja 5 Pilar Cabang (Murni Realitas Transaksi)
    var p1 = hasSales ? Math.min(wSales, Math.round(((salesCapaian / 100) * (wSales * 0.85)) * 10) / 10) : 0;
    var p2 = hasHpp ? Math.max(0, Math.min(wHpp, Math.round(((wHpp * 0.75) + ((maxHppStd - avgHpp) * 2)) * 10) / 10)) : 0;
    var p3 = hasWaste ? Math.max(0, Math.min(wWaste, Math.round(((wWaste * 0.67) + ((maxWasteStd - avgWaste) * 5)) * 10) / 10)) : 0;
    
    // Pilar 4: Jika 0 Open Insiden -> Wilayah/Cabang Aman Sempurna (Full Skor)
    var p4 = wSla;
    if (item.openIncident > 0 || avgSla > 4) {
      p4 = Math.max(0, Math.min(wSla, Math.round((wSla - ((item.openIncident || 0) * (wSla * 0.25)) - (avgSla > 4 ? (avgSla - 4) * 1.5 : 0)) * 10) / 10));
    }

    var p5 = Math.round(((tugasPersen / 100) * wTugas) * 10) / 10;
    var totalSkor = Math.round((p1 + p2 + p3 + p4 + p5) * 10) / 10;

    rankingList.push({
      type: 'CABANG',
      cabangId: item.cabangId,
      namaCabang: item.namaCabang,
      brand: item.brand,
      kota: item.kota,
      spvToko: item.spvToko || '',
      totalTarget: targetVal,
      totalActual: actualVal,
      hasSales: hasSales,
      salesCapaianPersen: salesCapaian,
      hasHpp: hasHpp,
      avgHpp: avgHpp,
      hasWaste: hasWaste,
      avgWaste: avgWaste,
      avgSlaJam: avgSla,
      openIncident: item.openIncident,
      tugasPersen: tugasPersen,
      skorKinerja: totalSkor,
      skorDetail: { p1Sales: p1, p2Hpp: p2, p3Waste: p3, p4Insiden: p4, p5Tugas: p5, total: totalSkor }
    });
  });

  rankingList.sort(function(a, b) {
    return b.skorKinerja - a.skorKinerja;
  });

  return {
    type: 'CABANG',
    areaId: targetAreaId,
    all: rankingList,
    top3: rankingList.slice(0, 3),
    bottom3: rankingList.slice(-3).reverse()
  };
}

/**
 * Logika Kalkulasi Leaderboard Nasional Seluruh Wilayah (Top 3 & Bottom 3)
 * Murni Menggunakan Transaksi Nyata 5 Pilar Tanpa Dummy Fallback
 */
function hitungLeaderboardNasional(dCabang, dSales, dEff, dInsiden, operationalConfig, dTugas, userAreaMgrMap) {
  var cfg = operationalConfig || {};
  var wSales = Number(cfg.bobotSales !== undefined ? cfg.bobotSales : 30);
  var wHpp = Number(cfg.bobotHpp !== undefined ? cfg.bobotHpp : 20);
  var wWaste = Number(cfg.bobotWaste !== undefined ? cfg.bobotWaste : 15);
  var wSla = Number(cfg.bobotSla !== undefined ? cfg.bobotSla : 20);
  var wTugas = Number(cfg.bobotTugas !== undefined ? cfg.bobotTugas : 15);
  var maxHppStd = Number(cfg.maxHpp || 35.0);
  var maxWasteStd = Number(cfg.maxWaste || 2.0);

  var areaMap = {};
  
  // Inisialisasi Wilayah Operasional
  for (var i = 1; i < dCabang.length; i++) {
    var aId = String(dCabang[i][COL_CABANG.AREA_ID] || '').trim();
    if (!aId || aId === 'ALL') continue;
    var aIdUpper = aId.toUpperCase();
    var aMgr = (userAreaMgrMap && userAreaMgrMap[aIdUpper]) 
      ? userAreaMgrMap[aIdUpper] 
      : String(dCabang[i][COL_CABANG.MANAGER] || '').trim();
    if (!aMgr || aMgr.toUpperCase() === aIdUpper || aMgr.toUpperCase().startsWith('AREA-')) {
      aMgr = 'Manager ' + aId;
    }
    var cTgt = Number(dCabang[i][COL_CABANG.TARGET] || 0);
    if (!areaMap[aId]) {
      areaMap[aId] = {
        areaId: aId,
        manager: aMgr,
        totalTarget: 0,
        monthlyBranchTargetSum: 0,
        totalActual: 0,
        hasSales: false,
        totalCabang: 0,
        totalWaste: 0,
        countWaste: 0,
        totalHpp: 0,
        countHpp: 0,
        totalSla: 0,
        countSla: 0,
        openIncident: 0,
        totalTugas: 0,
        completedTugas: 0
      };
    }
    areaMap[aId].totalCabang++;
    areaMap[aId].monthlyBranchTargetSum += cTgt;
  }

  // Agregasi Sales (Bulan Berjalan & Deduplikasi Revisi)
  var nowMonthPrefixNas = new Date().toISOString().substring(0, 7);
  var salesNasSeen = {};
  for (var s = 1; s < dSales.length; s++) {
    var rs = dSales[s];
    var sCabId = String(rs[COL_SALES.CABANG_ID] || '').trim();
    var sTgl = normalizeDateStr(rs[COL_SALES.TANGGAL]);
    if (!sCabId || !sTgl) continue;
    if (sTgl.substring(0, 7) !== nowMonthPrefixNas) continue;
    var sKey = sCabId + '_' + sTgl;
    if (salesNasSeen[sKey]) continue;
    salesNasSeen[sKey] = true;

    var sAId = String(rs[COL_SALES.AREA_ID] || '').trim();
    if (areaMap[sAId]) {
      var actS = Number(rs[COL_SALES.ACTUAL] || 0);
      areaMap[sAId].totalActual += actS;
      areaMap[sAId].hasSales = true;
    }
  }

  // Helper ekstraksi YYYY-MM dari tanggal atau kode ID berpola YYYYMM
  function extractNasMonthPrefix(dateCandidates, idCandidate) {
    if (Array.isArray(dateCandidates)) {
      for (var dIdx = 0; dIdx < dateCandidates.length; dIdx++) {
        var raw = dateCandidates[dIdx];
        if (!raw) continue;
        var norm = normalizeDateStr(raw);
        if (norm && norm.length >= 7 && /^\d{4}-\d{2}/.test(norm)) {
          return norm.substring(0, 7);
        }
      }
    }
    if (idCandidate) {
      var idStr = String(idCandidate).trim();
      var mId = idStr.match(/(?:^|[-_])(20\d{2})(0[1-9]|1[0-2])(?:[-_]|$|\d)/);
      if (mId) return mId[1] + '-' + mId[2];
    }
    return '';
  }

  // Agregasi Efisiensi (Hanya Bulan Berjalan & Opsi A: Deduplikasi Cabang & Rasio Bulanan)
  var branchEffMapNas = {};
  for (var e = 1; e < dEff.length; e++) {
    var eMonth = extractNasMonthPrefix([dEff[e][COL_EFISIENSI.TANGGAL]], dEff[e][COL_EFISIENSI.ID]);
    if (eMonth && eMonth !== nowMonthPrefixNas) continue;
    var eCabId = String(dEff[e][COL_EFISIENSI.CABANG_ID] || '').trim();
    if (!eCabId) continue;
    var eTgl = normalizeDateStr(dEff[e][COL_EFISIENSI.TANGGAL]);
    if (!branchEffMapNas[eCabId] || eTgl > branchEffMapNas[eCabId].tgl) {
      branchEffMapNas[eCabId] = {
        row: dEff[e],
        tgl: eTgl,
        areaId: String(dEff[e][COL_EFISIENSI.AREA_ID] || '').trim(),
        hppRaw: Number(dEff[e][COL_EFISIENSI.HPP]),
        wasteRaw: Number(dEff[e][COL_EFISIENSI.WASTE]),
        belanja: Number(dEff[e][COL_EFISIENSI.CATATAN]) || 0
      };
    }
  }

  // Peta omzet bulanan per cabang untuk normalisasi HPP Opsi A
  var branchMonthlySales = {};
  for (var s = 1; s < dSales.length; s++) {
    var rs = dSales[s];
    var sCabId = String(rs[COL_SALES.CABANG_ID] || '').trim();
    var sTgl = normalizeDateStr(rs[COL_SALES.TANGGAL]);
    if (!sCabId || !sTgl || sTgl.substring(0, 7) !== nowMonthPrefixNas) continue;
    branchMonthlySales[sCabId] = (branchMonthlySales[sCabId] || 0) + Number(rs[COL_SALES.ACTUAL] || 0);
  }

  Object.keys(branchEffMapNas).forEach(function(cId) {
    var effInfo = branchEffMapNas[cId];
    var eAId = effInfo.areaId;
    var mSales = branchMonthlySales[cId] || 0;
    var hppVal = effInfo.hppRaw;
    if (effInfo.belanja > 0 && mSales > 0) {
      hppVal = Math.round((effInfo.belanja / mSales) * 1000) / 10;
    } else if (hppVal > 100) {
      hppVal = 35.0;
    }
    var wasteVal = effInfo.wasteRaw;
    if (areaMap[eAId]) {
      if (!isNaN(hppVal) && hppVal !== null && hppVal > 0) {
        areaMap[eAId].totalHpp += hppVal;
        areaMap[eAId].countHpp++;
      }
      if (!isNaN(wasteVal) && effInfo.wasteRaw !== '' && effInfo.wasteRaw !== null) {
        areaMap[eAId].totalWaste += wasteVal;
        areaMap[eAId].countWaste++;
      }
    }
  });

  // Agregasi Insiden (Bulan Berjalan + Carry-Over Insiden Belum Selesai dari Bulan Lalu)
  for (var n = 1; n < dInsiden.length; n++) {
    var nAId = String(dInsiden[n][COL_INSIDEN.AREA_ID] || '').trim();
    var nStatus = String(dInsiden[n][COL_INSIDEN.STATUS] || '').trim().toUpperCase();
    var isResolved = (nStatus === 'RESOLVED' || nStatus === 'SELESAI' || nStatus === 'CLOSED' || nStatus === 'DONE');
    var nMonth = extractNasMonthPrefix([dInsiden[n][COL_INSIDEN.TANGGAL], dInsiden[n][COL_INSIDEN.SELESAI]], dInsiden[n][COL_INSIDEN.ID]);
    if (nMonth && nMonth < nowMonthPrefixNas && isResolved) continue;
    if (nMonth && nMonth > nowMonthPrefixNas) continue;

    var nSla = Number(dInsiden[n][COL_INSIDEN.SLA_JAM] || 0);
    if (areaMap[nAId]) {
      if (!isResolved) {
        areaMap[nAId].openIncident++;
      }
      if (nSla > 0) {
        areaMap[nAId].totalSla += nSla;
        areaMap[nAId].countSla++;
      }
    }
  }

  // Agregasi Tugas SOP (Bulan Berjalan + Carry-Over Tugas Belum Selesai dari Bulan Lalu)
  if (dTugas && dTugas.length > 1) {
    for (var t = 1; t < dTugas.length; t++) {
      var rt = dTugas[t];
      var tAreaId = String(rt[COL_TUGAS.AREA_ID] || '').trim();
      var tStatus = String(rt[COL_TUGAS.STATUS] || '').trim().toLowerCase();
      var isCompleted = (tStatus === 'completed' || tStatus === 'done' || tStatus === 'selesai' || tStatus === 'verified');
      var tMonth = extractNasMonthPrefix([rt[COL_TUGAS.CREATED_AT], rt[COL_TUGAS.DEADLINE]], rt[COL_TUGAS.ID]);
      if (tMonth && tMonth < nowMonthPrefixNas && isCompleted) continue;
      if (tMonth && tMonth > nowMonthPrefixNas) continue;

      Object.keys(areaMap).forEach(function(aIdKey) {
        if (tAreaId === 'ALL' || tAreaId === aIdKey) {
          areaMap[aIdKey].totalTugas++;
          if (isCompleted) areaMap[aIdKey].completedTugas++;
        }
      });
    }
  }

  // Hitung Skor Komposit 5 Pilar
  var rankingList = [];
  Object.keys(areaMap).forEach(function(key) {
    var item = areaMap[key];
    var hasSales = item.hasSales && item.totalActual > 0;
    var targetVal = item.monthlyBranchTargetSum > 0 ? item.monthlyBranchTargetSum : (item.totalTarget > 0 ? item.totalTarget : (hasSales ? item.totalActual : 0));
    item.totalTarget = targetVal;
    var actualVal = item.totalActual;
    var salesCapaian = (targetVal > 0 && actualVal > 0) ? (Math.round((actualVal / targetVal) * 1000) / 10) : 0;

    var hasHpp = item.countHpp > 0;
    var avgHpp = hasHpp ? (Math.round((item.totalHpp / item.countHpp) * 10) / 10) : null;

    var hasWaste = item.countWaste > 0;
    var avgWaste = hasWaste ? (Math.round((item.totalWaste / item.countWaste) * 10) / 10) : null;

    var avgSla = item.countSla > 0 ? (Math.round((item.totalSla / item.countSla) * 10) / 10) : 0;

    var tugasPersen = item.totalTugas > 0 ? Math.round((item.completedTugas / item.totalTugas) * 100) : 100;

    var p1 = hasSales ? Math.min(wSales, Math.round(((salesCapaian / 100) * (wSales * 0.85)) * 10) / 10) : 0;
    var p2 = hasHpp ? Math.max(0, Math.min(wHpp, Math.round(((wHpp * 0.75) + ((maxHppStd - avgHpp) * 2)) * 10) / 10)) : 0;
    var p3 = hasWaste ? Math.max(0, Math.min(wWaste, Math.round(((wWaste * 0.67) + ((maxWasteStd - avgWaste) * 5)) * 10) / 10)) : 0;

    // Pilar 4: Jika 0 Open Insiden -> Wilayah Aman Sempurna (Full Skor)
    var p4 = wSla;
    if (item.openIncident > 0 || avgSla > 4) {
      p4 = Math.max(0, Math.min(wSla, Math.round((wSla - (item.openIncident * (wSla * 0.25)) - (avgSla > 4 ? (avgSla - 4) * 1.5 : 0)) * 10) / 10));
    }

    var p5 = Math.round(((tugasPersen / 100) * wTugas) * 10) / 10;
    var totalSkor = Math.round((p1 + p2 + p3 + p4 + p5) * 10) / 10;

    rankingList.push({
      areaId: item.areaId,
      manager: item.manager,
      totalCabang: item.totalCabang,
      totalTarget: targetVal,
      totalActual: actualVal,
      hasSales: hasSales,
      salesCapaianPersen: salesCapaian,
      hasHpp: hasHpp,
      avgHpp: avgHpp,
      hasWaste: hasWaste,
      avgWaste: avgWaste,
      avgSlaJam: avgSla,
      openIncident: item.openIncident,
      tugasPersen: tugasPersen,
      skorKinerja: totalSkor,
      skorDetail: { p1Sales: p1, p2Hpp: p2, p3Waste: p3, p4Insiden: p4, p5Tugas: p5, total: totalSkor }
    });
  });

  rankingList.sort(function(a, b) {
    return b.skorKinerja - a.skorKinerja;
  });

  var top3 = rankingList.slice(0, 3);
  var bottom3 = rankingList.slice(-3).reverse();

  return {
    all: rankingList,
    top3: top3,
    bottom3: bottom3
  };
}

/**
 * API: Input / Simpan & Revisi Laporan Penjualan Cabang (Smart Upsert)
 */
function apiSaveSales(payload) {
  try {
    var nowIso = new Date().toISOString();
    var sheet = getSheet(TAB.SALES);
    var targetDate = normalizeDateStr(payload.tanggal) || nowIso.split('T')[0];
    var targetCabangId = String(payload.cabangId || '').trim();

    var target = Number(payload.targetHarian || 0);
    var actual = Number(payload.actualSales || 0);
    var persen = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0;

    // Cek apakah data sales untuk gerai & tanggal ini sudah pernah tercatat
    var data = sheet.getDataRange().getValues();
    var matchingRowIndices = [];

    for (var i = 1; i < data.length; i++) {
      var rowCbg = String(data[i][COL_SALES.CABANG_ID] || '').trim();
      var rowTgl = normalizeDateStr(data[i][COL_SALES.TANGGAL]);
      if (rowCbg === targetCabangId && rowTgl === targetDate) {
        matchingRowIndices.push(i + 1); // 1-based index di spreadsheet
      }
    }

    if (matchingRowIndices.length > 0) {
      // MODE REVISI / UPDATE: Perbarui data baris eksisting pertama
      var primaryRow = matchingRowIndices[0];
      sheet.getRange(primaryRow, COL_SALES.TANGGAL + 1).setValue(targetDate);
      sheet.getRange(primaryRow, COL_SALES.TARGET + 1).setValue(target);
      sheet.getRange(primaryRow, COL_SALES.ACTUAL + 1).setValue(actual);
      sheet.getRange(primaryRow, COL_SALES.PERSEN + 1).setValue(persen);
      sheet.getRange(primaryRow, COL_SALES.TRX + 1).setValue(Number(payload.totalTransaksi || 0));
      sheet.getRange(primaryRow, COL_SALES.CREATED_BY + 1).setValue(payload.createdBy + ' (Koreksi)');
      sheet.getRange(primaryRow, COL_SALES.CREATED_AT + 1).setValue(nowIso);

      // JIKA DITEMUKAN BARIS DUPLIKAT SEBELUMNYA, BERSIHKAN / HAPUS BARIS EKSTRA!
      // Hapus dari urutan index terbesar ke terkecil agar index baris tidak bergeser
      for (var dIdx = matchingRowIndices.length - 1; dIdx >= 1; dIdx--) {
        sheet.deleteRow(matchingRowIndices[dIdx]);
      }

      // Auto-update status Tugas Daily di Google Sheets (Bebas Approval Atasan)
      autoCompleteDailyTaskInSheet(targetDate);

      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori SALES (Strictly Isolated Per-Wilayah Jika < 60%)
      if (target > 0 && persen < 60) {
        try {
          var slsTitle = '🚨 PERINGATAN REVENUE: SALES < 60%';
          var slsBody = (payload.namaCabang || payload.cabangId || 'Gerai') + ' (' + (payload.areaId || 'Wilayah') + '): Capaian hanya ' + persen + '% (Rp ' + Number(actual).toLocaleString('id-ID') + ' dari Target Rp ' + Number(target).toLocaleString('id-ID') + ').';
          var slsTargets = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'ALL';
          triggerOperationalPushAlert('SALES', slsTitle, slsBody, slsTargets);
        } catch (eSlsPush) {
          Logger.log('Push sales notice: ' + eSlsPush.message);
        }
      }

      return { 
        success: true, 
        isRevised: true, 
        message: 'Data sales ' + (payload.namaCabang || payload.cabangId) + ' tgl ' + targetDate + ' berhasil diperbarui (menggantikan angka lama).', 
        salesId: String(data[primaryRow - 1][COL_SALES.ID] || '')
      };
    } else {
      // MODE BARU: Tambahkan baris baru dengan penomoran unik
      var nextId = generateNextId(TAB.SALES, 'SLS', COL_SALES.ID, true);
      var newRow = [
        nextId,
        targetDate,
        payload.areaId,
        payload.cabangId,
        payload.namaCabang,
        target,
        actual,
        persen,
        Number(payload.totalTransaksi || 0),
        payload.createdBy,
        nowIso
      ];

      sheet.appendRow(newRow);

      // Auto-update status Tugas Daily di Google Sheets (Bebas Approval Atasan)
      autoCompleteDailyTaskInSheet(targetDate);

      // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori SALES (Strictly Isolated Per-Wilayah Jika < 60%)
      if (target > 0 && persen < 60) {
        try {
          var slsTitleNew = '🚨 PERINGATAN REVENUE: SALES < 60%';
          var slsBodyNew = (payload.namaCabang || payload.cabangId || 'Gerai') + ' (' + (payload.areaId || 'Wilayah') + '): Capaian hanya ' + persen + '% (Rp ' + Number(actual).toLocaleString('id-ID') + ' dari Target Rp ' + Number(target).toLocaleString('id-ID') + ').';
          var slsTargetsNew = (payload.areaId && String(payload.areaId).toUpperCase() !== 'ALL') ? ['COO', payload.areaId] : 'ALL';
          triggerOperationalPushAlert('SALES', slsTitleNew, slsBodyNew, slsTargetsNew);
        } catch (eSlsPushNew) {
          Logger.log('Push sales notice: ' + eSlsPushNew.message);
        }
      }

      return { 
        success: true, 
        isRevised: false, 
        message: 'Laporan sales cabang ' + payload.namaCabang + ' berhasil dicatat.', 
        salesId: nextId 
      };
    }
  } catch (err) {
    return { success: false, message: 'Gagal simpan sales: ' + err.message };
  }
}

// Fungsi autoCompleteDailyTaskInSheet() dipindahkan ke Tugas.gs (tersedia di global runtime)



/**
 * API: Scan Struk & POS Screenshot dengan Gemini Vision / AI
 * Payload: { imageBase64: "...", mimeType: "image/jpeg" }
 */
function apiScanReceiptWithAI(payload) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, useClientOCR: true, message: 'Gemini API Key belum diset, menggunakan Client-side OCR.' };
    }

    var base64Data = payload.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    var mimeType = payload.mimeType || 'image/jpeg';

    var promptText = "Kamu adalah sistem AI pembaca struk kasir dan screenshot aplikasi POS F&B Indonesia (seperti Moka, Pawoon, ESB, Majoo, Grab/Gojek Merchant). " +
      "Tugasmu adalah membaca gambar ini dan mengekstrak data berikut secara presisi: " +
      "1. actualSales: Total omset / penjualan bersih / grand total / total penjualan (hanya angka integer bulat, tanpa titik/koma/Rp). " +
      "2. totalTransaksi: Jumlah struk / bill / transaksi / order (hanya angka integer, jika tidak tertulis beri null). " +
      "3. tanggal: Tanggal transaksi dalam format YYYY-MM-DD (Cari di header, footer, jam/tanggal, atau tgl cetak struk seperti '23/10/2026', '23 Okt 2026', 'Date:', 'Tgl:', dll. Jika tahun hanya 2 digit seperti 26 ubah jadi 2026). WAJIB sertakan jika tertera di gambar. " +
      "4. namaCabang: Nama toko atau cabang jika tertera pada struk. " +
      "Keluarkan HANYA format JSON valid tanpa markdown, contoh: {\"actualSales\":5450000,\"totalTransaksi\":200,\"tanggal\":\"2026-10-23\",\"namaCabang\":\"Gerai Utama\"}";

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
    var requestBody = {
      contents: [{
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(res.getContentText());

    if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
      var rawOutput = json.candidates[0].content.parts[0].text;
      var cleanOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
      var parsedData = JSON.parse(cleanOutput);
      return {
        success: true,
        data: parsedData,
        message: 'Berhasil membaca data struk via Gemini Vision AI'
      };
    } else {
      return { success: false, useClientOCR: true, message: 'AI tidak dapat mendeteksi struk, beralih ke Client-side OCR.' };
    }
  } catch (err) {
    return { success: false, useClientOCR: true, message: 'Error backend: ' + err.message };
  }
}

/**
 * API: Simpan Target Sales Bulanan Cabang (dengan breakdown harian & mingguan)
 * Payload: {
 *   cabangId: "CBG-001" | "ALL_AREA",
 *   areaId: "AREA-01",
 *   bulan: "2026-10",
 *   targetBulanan: 165000000,
 *   targetHarian: 5500000,
 *   targetMingguan: 38500000,
 *   updatedBy: "Manager"
 * }
 */
/**
 * Helper: Ambil Jumlah Hari Kalender Tepat di Backend (28 - 31 Hari)
 */
function getDaysInMonthForBackend(monthKey) {
  if (monthKey && typeof monthKey === 'string' && monthKey.length >= 7) {
    var parts = monthKey.split('-');
    var yr = parseInt(parts[0], 10);
    var mo = parseInt(parts[1], 10);
    if (yr && mo) {
      return new Date(yr, mo, 0).getDate();
    }
  }
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function apiSaveBranchTarget(payload) {
  try {
    var sheetCabang = getSheet(TAB.CABANG);
    var dataCabang = sheetCabang.getDataRange().getValues();
    var targetBulanan = Number(payload.targetBulanan || 0);
    var daysInMonth = Number(payload.daysInMonth || getDaysInMonthForBackend(payload.bulan));
    if (!daysInMonth || daysInMonth < 28 || daysInMonth > 31) daysInMonth = 30;
    var targetHarian = Number(payload.targetHarian || Math.round(targetBulanan / daysInMonth));
    var isAll = payload.cabangId === 'ALL_AREA';
    var updatedCount = 0;

    for (var i = 1; i < dataCabang.length; i++) {
      var cId = dataCabang[i][COL_CABANG.ID];
      var cAreaId = dataCabang[i][COL_CABANG.AREA_ID];

      if (isAll ? (cAreaId === payload.areaId) : (cId === payload.cabangId)) {
        // Kolom TARGET di MasterCabang (index 6, 1-based index 7)
        sheetCabang.getRange(i + 1, COL_CABANG.TARGET + 1).setValue(targetBulanan);
        updatedCount++;
      }
    }

    // Perbarui juga data target di DataSales jika ada record sales cabang terkait
    var sheetSales = getSheet(TAB.SALES);
    var dataSales = sheetSales.getDataRange().getValues();
    for (var j = 1; j < dataSales.length; j++) {
      var sCabangId = dataSales[j][COL_SALES.CABANG_ID];
      var sAreaId = dataSales[j][COL_SALES.AREA_ID];
      if (isAll ? (sAreaId === payload.areaId) : (sCabangId === payload.cabangId)) {
        sheetSales.getRange(j + 1, COL_SALES.TARGET + 1).setValue(targetHarian);
      }
    }

    return {
      success: true,
      message: 'Target penjualan bulanan berhasil disimpan untuk ' + updatedCount + ' cabang binaan.',
      targetBulanan: targetBulanan,
      targetHarian: targetHarian,
      updatedCount: updatedCount
    };
  } catch (err) {
    return { success: false, message: 'Gagal simpan target: ' + err.message };
  }
}
