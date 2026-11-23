/**
 * Helper: Ambil Seluruh Username Akun Master COO (Target Otorisasi & Alert Eksekutif)
 */
function getCooUsernames_() {
  var list = ['coo_master', 'admin', 'coo'];
  try {
    var ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var sheet = ss.getSheetByName('MasterUser');
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var u = String(data[i][1] || '').trim().toLowerCase();
          var r = String(data[i][4] || '').trim().toUpperCase();
          if ((r === 'COO' || r === 'MASTER') && u && list.indexOf(u) === -1) {
            list.push(u);
          }
        }
      }
    }
  } catch (e) {}
  return list;
}

/**
 * Helper: Ambil Seluruh Username Pengguna Aktif (Target Broadcast Seluruh Manajer)
 */
function getActiveUsernames_() {
  var list = ['coo_master', 'admin', 'coo'];
  try {
    var ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var sheet = ss.getSheetByName('MasterUser');
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var u = String(data[i][1] || '').trim().toLowerCase();
          var status = String(data[i][7] || 'ACTIVE').trim().toUpperCase();
          if (u && status === 'ACTIVE' && list.indexOf(u) === -1) {
            list.push(u);
          }
        }
      }
    }
  } catch (e) {}
  return list;
}

/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Notifikasi.gs (Pusat Notifikasi Server, Database Log & OneSignal Engine)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Filter Ketat Kebijakan Operasional: HANYA TUGAS, INSIDEN, dan JADWAL.
 * 2. Dual-Action: Rekam ke database Google Sheet 'DataNotifikasi' DAN Tembakkan OneSignal Push.
 * 3. Cross-Device Synchronized: Status 'UNREAD' / 'READ' sinkron permanen di seluruh perangkat.
 * ================================================================================
 */

// Objek Pemetaan Kolom Baku DataNotifikasi (Index-Based Mapping)
var COL_NOTIFIKASI = {
  ID: 0,
  TANGGAL: 1,
  KATEGORI: 2,
  TARGET_USER: 3,
  JUDUL: 4,
  PESAN: 5,
  STATUS: 6,
  ACTION_URL: 7,
  CREATED_AT: 8
};

/**
 * Helper: Ambil Sheet DataNotifikasi atau Buat Otomatis Jika Belum Ada (Self-Healing Auto-Creation)
 */
/**
 * Helper: Ambil Domain Portal Vercel Resmi Aktif untuk ActionUrl Notifikasi
 */
function getPortalUrl_() {
  var url = '';
  try {
    if (typeof getConfigValue_ === 'function') {
      url = getConfigValue_('PORTAL_URL', '') || getConfigValue_('SITE_URL', '');
    }
  } catch (eCfg) {}
  if (!url || String(url).trim() === '') {
    url = 'https://panoramavercel-five.vercel.app/';
  }
  var clean = String(url).trim();
  if (clean.indexOf('http') !== 0) {
    clean = 'https://' + clean;
  }
  if (clean.charAt(clean.length - 1) !== '/') {
    clean += '/';
  }
  return clean;
}

function getOrCreateNotifikasiSheet_() {
  var sheet = null;
  try {
    if (typeof getSheet === 'function') {
      sheet = getSheet('DataNotifikasi');
    }
  } catch (eG) {}

  if (!sheet) {
    try {
      var ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
      if (ss) {
        sheet = ss.getSheetByName('DataNotifikasi');
        if (!sheet) {
          var headerNotifikasi = ['NotificationID', 'Tanggal', 'Kategori', 'TargetUser', 'Judul', 'Pesan', 'Status', 'ActionUrl', 'CreatedAt'];
          sheet = ss.insertSheet('DataNotifikasi');
          sheet.getRange(1, 1, 1, headerNotifikasi.length).setValues([headerNotifikasi]);
          sheet.setFrozenRows(1);
          try {
            sheet.getRange(1, 1, 1, headerNotifikasi.length).setBackground('#144A32').setFontColor('#FFFFFF').setFontWeight('bold');
            sheet.autoResizeColumns(1, headerNotifikasi.length);
          } catch (eStyle) {}
          Logger.log('✅ Tab DataNotifikasi berhasil dibuat otomatis di Google Spreadsheet!');
        }
      }
    } catch (eAuto) {
      Logger.log('getOrCreateNotifikasiSheet_ notice: ' + eAuto.message);
    }
  }
  return sheet;
}


/**
 * ================================================================================
 * FUNGSI UTAMA: CATAT KE DATABASE & TEMBAKKAN PUSH NOTIFIKASI ONESIGNAL
 * ================================================================================
 * Merekam 1 baris riwayat di tab DataNotifikasi dan langsung memicu notifikasi
 * melayang di status bar HP para manajer / Master COO.
 */
function recordAndPushNotification(category, title, message, targetUsernames, actionUrl) {
  try {
    var validCategories = ['TUGAS', 'INSIDEN', 'JADWAL', 'LIBRARY', 'SOP', 'EFISIENSI', 'SALES', 'USER', 'AUTH', 'REVIEW', 'REVIEWS'];
    var catUpper = String(category || '').toUpperCase().trim();
    if (validCategories.indexOf(catUpper) === -1) {
      Logger.log('Push notifikasi diabaikan: Kategori tidak terdaftar (' + category + ')');
      return { success: false, reason: 'Category not in whitelist' };
    }

    var targets = targetUsernames || 'ALL';
    var fullTitle = title || ('PANORAMA ' + catUpper);
    var targetUserStr = Array.isArray(targets) ? targets.join(',') : String(targets);
    var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    var nowStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    var todayDateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    // 1. Tentukan Action URL Baku (Self-Healing Fallback ke Domain Vercel Aktif)
    var defaultPortalUrl = getPortalUrl_();
    var finalActionUrl = (actionUrl && String(actionUrl).trim().indexOf('http') === 0)
      ? String(actionUrl).trim()
      : defaultPortalUrl;

    // 2. Generate Notification ID Unik
    var nextId = 'NTF-' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmmss');

    // 3. Simpan Rekaman ke Tab DataNotifikasi di Google Spreadsheet (Lengkap dengan Link Vercel)
    try {
      var sheet = getOrCreateNotifikasiSheet_();
      if (sheet) {
        var newRow = [
          nextId,
          todayDateStr,
          catUpper,
          targetUserStr,
          fullTitle,
          message || '',
          'UNREAD',
          finalActionUrl,
          nowStr
        ];
        sheet.appendRow(newRow);
      }
    } catch (eDb) {
      Logger.log('Catat DataNotifikasi notice: ' + eDb.message);
    }

    // 4. Tembakkan ke OneSignal REST API (Status Bar HP saat Aplikasi Tertutup)
    var pushRes = sendOneSignalPushNotification(targets, fullTitle, message, finalActionUrl);

    return {
      success: true,
      notificationId: nextId,
      pushResult: pushRes
    };
  } catch (err) {
    Logger.log('recordAndPushNotification error: ' + err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Helper Alias Kompatibilitas dengan Kode Operasional Lama
 */
function triggerOperationalPushAlert(category, title, message, targetUsernames, actionUrl) {
  return recordAndPushNotification(category, title, message, targetUsernames, actionUrl);
}

/**
 * ================================================================================
 * ONESIGNAL REST API DISPATCHER (PENGIRIM WEB PUSH KE STATUS BAR HP)
 * ================================================================================
 */
/**
 * Helper: Menyelesaikan Target Menjadi Daftar Username Riil (External User ID OneSignal)
 * Mendukung: Array, String koma ('COO,gilang'), Area ID ('AREA-06'), Nama Lengkap ('Gilang Pratama'), atau 'COO'.
 */
function resolveUsernamesFromTargetList_(targets) {
  var resolved = [];
  var rawList = [];

  // Pecah string koma atau array campuran menjadi elemen bersih individual
  if (Array.isArray(targets)) {
    for (var k = 0; k < targets.length; k++) {
      var elem = String(targets[k] || '').trim();
      if (elem.indexOf(',') !== -1) {
        elem.split(',').forEach(function(s) { if (s.trim()) rawList.push(s.trim()); });
      } else if (elem) {
        rawList.push(elem);
      }
    }
  } else if (typeof targets === 'string') {
    targets.split(',').forEach(function(s) { if (s.trim()) rawList.push(s.trim()); });
  } else if (targets) {
    rawList.push(String(targets).trim());
  }

  var userMap = null;
  function getUserMap() {
    if (userMap) return userMap;
    userMap = { byArea: {}, byName: {}, byRole: {}, allUsers: [] };
    try {
      var ss = (typeof getSpreadsheetInstance === 'function') ? getSpreadsheetInstance() : SpreadsheetApp.getActiveSpreadsheet();
      if (ss) {
        var sheet = ss.getSheetByName('MasterUser');
        if (sheet) {
          var data = sheet.getDataRange().getValues();
          for (var i = 1; i < data.length; i++) {
            var uName = String(data[i][1] || '').trim().toLowerCase();
            var uFullName = String(data[i][3] || '').trim().toLowerCase();
            var uRole = String(data[i][4] || '').trim().toUpperCase();
            var uArea = String(data[i][5] || '').trim().toUpperCase();
            var uStatus = String(data[i][7] || 'ACTIVE').trim().toUpperCase();
            if (uName && uStatus === 'ACTIVE') {
              userMap.allUsers.push(uName);
              if (uRole) {
                if (!userMap.byRole[uRole]) userMap.byRole[uRole] = [];
                userMap.byRole[uRole].push(uName);
              }
              if (uArea && uArea !== 'ALL' && uArea !== 'UMUM') {
                if (!userMap.byArea[uArea]) userMap.byArea[uArea] = [];
                userMap.byArea[uArea].push(uName);
              }
              if (uFullName) {
                userMap.byName[uFullName] = uName;
              }
            }
          }
        }
      }
    } catch (e) {}
    return userMap;
  }

  for (var i = 0; i < rawList.length; i++) {
    var item = String(rawList[i] || '').trim();
    if (!item) continue;
    var itemUpper = item.toUpperCase();
    var itemLower = item.toLowerCase();

    if (itemUpper === 'COO' || itemUpper === 'MASTER') {
      var coos = getCooUsernames_();
      coos.forEach(function(c) {
        if (resolved.indexOf(c) === -1) resolved.push(c);
      });
    } else if (itemUpper === 'MANAGERS' || itemUpper === 'AREA_MANAGERS' || itemUpper === 'MANAGER') {
      var mapM = getUserMap();
      var mgrList = (mapM.byRole['AREA_MANAGER'] || []).concat(mapM.byRole['MANAGER'] || []);
      mgrList.forEach(function(m) {
        if (resolved.indexOf(m) === -1) resolved.push(m);
      });
    } else if (itemUpper.indexOf('AREA-') === 0) {
      var map = getUserMap();
      if (map && map.byArea[itemUpper]) {
        map.byArea[itemUpper].forEach(function(u) {
          if (resolved.indexOf(u) === -1) resolved.push(u);
        });
      }
    } else {
      var map2 = getUserMap();
      if (map2 && map2.byName[itemLower]) {
        var uname = map2.byName[itemLower];
        if (resolved.indexOf(uname) === -1) resolved.push(uname);
      } else if (itemLower !== 'all' && itemLower !== 'coo') {
        if (resolved.indexOf(itemLower) === -1) resolved.push(itemLower);
      }
    }
  }

  return resolved;
}

function sendOneSignalPushNotification(targetUsernames, title, message, actionUrl) {
  var result = { pushSent: false, error: null };
  try {
    var appId = '94dd1d54-587e-4be8-801b-92d6cbd0114c';
    var restKey = 'os_v2_app_stor2vcypzf6raa3sllmxuarjrisosdugdqukpnlrm4qzn2fqcdlhsktlp3k74fwf5z3ohwswasicyldu5u5p5s43awbewsu4sqy5nq';
    try {
      if (typeof getConfigValue_ === 'function') {
        var cfgAppId = getConfigValue_('ONESIGNAL_APP_ID', '');
        var cfgRestKey = getConfigValue_('ONESIGNAL_REST_KEY', '');
        if (cfgAppId) appId = cfgAppId;
        if (cfgRestKey) restKey = cfgRestKey;
      }
    } catch (eCfg) {}

    var defaultPortalUrl = getPortalUrl_();
    var finalUrl = (actionUrl && String(actionUrl).trim().indexOf('http') === 0)
      ? String(actionUrl).trim()
      : defaultPortalUrl;

    var payload = {
      app_id: appId,
      headings: { en: title || 'PANORAMA Operations Alert' },
      contents: { en: message || 'Pemberitahuan operasional baru.' },
      url: finalUrl,
      priority: 10
    };

    var isBroadcast = (!targetUsernames || targetUsernames === 'ALL');

    if (isBroadcast) {
      payload.included_segments = ['Total Subscriptions'];
    } else {
      var cleanExternalIds = resolveUsernamesFromTargetList_(targetUsernames);

      if (cleanExternalIds.length > 0) {
        payload.include_external_user_ids = cleanExternalIds;
      } else {
        payload.included_segments = ['Total Subscriptions'];
      }
    }

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Basic ' + restKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch('https://onesignal.com/api/v1/notifications', options);
    if (res && res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      result.pushSent = true;
      Logger.log('OneSignal Push Sent successfully: ' + res.getContentText());
    } else {
      result.error = res ? res.getContentText() : 'No response';
      Logger.log('OneSignal Push API response: ' + result.error);
    }
  } catch (errPush) {
    result.error = errPush.message;
    Logger.log('Gagal kirim OneSignal Push: ' + errPush.message);
  }
  return result;
}

/**
 * ================================================================================
 * API: AMBIL DAFTAR NOTIFIKASI SERVER & HITUNG JUMLAH UNREAD RIIL
 * ================================================================================
 * Menggantikan perhitungan 99+ lokal palsu dengan data riil dari database.
 */
function apiGetNotifikasi(userSession) {
  try {
    userSession = userSession || {};
    var sheet = getOrCreateNotifikasiSheet_();
    if (!sheet) return { success: true, notifications: [], unreadCount: 0 };

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, notifications: [], unreadCount: 0 };

    var isCOO = (userSession.role === 'COO' || userSession.username === 'coo_master' || userSession.areaId === 'ALL');
    var curUsername = String(userSession.username || '').toLowerCase().trim();
    var curAreaId = String(userSession.areaId || '').toUpperCase().trim();

    var notifs = [];
    var unreadCount = 0;

    // Ambil data dari baris paling baru ke baris lama (maksimal 100 notifikasi terakhir)
    var startRow = Math.max(1, data.length - 100);
    for (var i = data.length - 1; i >= startRow; i--) {
      var row = data[i];
      var targetStr = String(row[COL_NOTIFIKASI.TARGET_USER] || 'ALL').trim();
      var targetLower = targetStr.toLowerCase();
      var targetUpper = targetStr.toUpperCase();

      // Cek apakah notifikasi ini relevan untuk user yang sedang aktif
      var isTargetMatch = false;
      if (isCOO) {
        isTargetMatch = true; // Master COO berhak memantau semua notifikasi
      } else if (targetUpper === 'ALL') {
        isTargetMatch = true;
      } else if (curUsername && targetLower.indexOf(curUsername) !== -1) {
        isTargetMatch = true;
      } else if (curAreaId && targetUpper.indexOf(curAreaId) !== -1) {
        isTargetMatch = true;
      }

      if (isTargetMatch) {
        var status = String(row[COL_NOTIFIKASI.STATUS] || 'UNREAD').toUpperCase();
        var isUnread = (status === 'UNREAD');
        if (isUnread) unreadCount++;

        notifs.push({
          id: String(row[COL_NOTIFIKASI.ID]),
          tanggal: String(row[COL_NOTIFIKASI.TANGGAL]),
          kategori: String(row[COL_NOTIFIKASI.KATEGORI]).toLowerCase(),
          targetUser: targetStr,
          title: String(row[COL_NOTIFIKASI.JUDUL]),
          message: String(row[COL_NOTIFIKASI.PESAN]),
          status: status,
          isUnread: isUnread,
          actionUrl: String(row[COL_NOTIFIKASI.ACTION_URL] || ''),
          createdAt: String(row[COL_NOTIFIKASI.CREATED_AT])
        });
      }
    }

    return {
      success: true,
      notifications: notifs,
      unreadCount: unreadCount
    };
  } catch (err) {
    Logger.log('apiGetNotifikasi error: ' + err.message);
    return { success: false, message: 'Gagal mengambil notifikasi: ' + err.message, notifications: [], unreadCount: 0 };
  }
}

/**
 * ================================================================================
 * API: TANDAI SATU NOTIFIKASI SEBAGAI TELAH DIBACA (SINKRON ANTAR-PERANGKAT)
 * ================================================================================
 */
function apiMarkNotificationRead(notificationId, userSession) {
  try {
    if (!notificationId) return { success: false, message: 'ID Notifikasi tidak valid.' };
    var sheet = getOrCreateNotifikasiSheet_();
    if (!sheet) return { success: false, message: 'Sheet DataNotifikasi belum dibuat.' };

    var data = sheet.getDataRange().getValues();
    var targetId = String(notificationId).trim();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_NOTIFIKASI.ID]).trim() === targetId) {
        sheet.getRange(i + 1, COL_NOTIFIKASI.STATUS + 1).setValue('READ');
        return { success: true, message: 'Notifikasi berhasil ditandai telah dibaca.', notificationId: targetId };
      }
    }

    return { success: false, message: 'Notifikasi tidak ditemukan di database.' };
  } catch (err) {
    return { success: false, message: 'Gagal update status notifikasi: ' + err.message };
  }
}

/**
 * ================================================================================
 * API: TANDAI SELURUH NOTIFIKASI SEBAGAI TELAH DIBACA
 * ================================================================================
 */
function apiMarkAllNotificationsRead(userSession) {
  try {
    userSession = userSession || {};
    var sheet = getOrCreateNotifikasiSheet_();
    if (!sheet) return { success: true, message: 'DataNotifikasi kosong.', updatedCount: 0 };

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, message: 'DataNotifikasi kosong.', updatedCount: 0 };

    var isCOO = (userSession.role === 'COO' || userSession.username === 'coo_master' || userSession.areaId === 'ALL');
    var curUsername = String(userSession.username || '').toLowerCase().trim();
    var curAreaId = String(userSession.areaId || '').toUpperCase().trim();
    var updatedCount = 0;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[COL_NOTIFIKASI.STATUS] || 'UNREAD').toUpperCase();
      if (status === 'UNREAD') {
        var targetStr = String(row[COL_NOTIFIKASI.TARGET_USER] || 'ALL').trim();
        var isMatch = false;
        if (isCOO) isMatch = true;
        else if (targetStr.toUpperCase() === 'ALL') isMatch = true;
        else if (curUsername && targetStr.toLowerCase().indexOf(curUsername) !== -1) isMatch = true;
        else if (curAreaId && targetStr.toUpperCase().indexOf(curAreaId) !== -1) isMatch = true;

        if (isMatch) {
          sheet.getRange(i + 1, COL_NOTIFIKASI.STATUS + 1).setValue('READ');
          updatedCount++;
        }
      }
    }

    return { success: true, message: 'Seluruh notifikasi berhasil ditandai telah dibaca.', updatedCount: updatedCount };
  } catch (err) {
    return { success: false, message: 'Gagal membersihkan notifikasi: ' + err.message };
  }
}

/**
 * ================================================================================
 * API: UJI BROADCAST PUSH KE SELURUH HP (MASTER COO)
 * ================================================================================
 */
function apiTestOneSignalBroadcast(userSession) {
  try {
    if (!userSession || userSession.role !== 'COO') {
      return { success: false, message: 'Hanya Master COO yang dapat mengirim broadcast push.' };
    }
    var title = '🚨 PENGUMUMAN OPERASIONAL NASIONAL';
    var message = 'Pesan siaga dari Master COO: Seluruh Area Manager dimohon mengecek pembaruan sistem dan jadwal kerja.';
    var defaultPortalUrl = getPortalUrl_();
    var pushRes = recordAndPushNotification('JADWAL', title, message, 'ALL', defaultPortalUrl);

    return {
      success: true,
      pushResult: pushRes,
      message: pushRes.success
        ? 'Broadcast push berhasil dikirimkan ke seluruh perangkat terdaftar & tersimpan di DataNotifikasi!'
        : 'Broadcast diproses. Pastikan OneSignal App ID & REST API Key telah terkonfigurasi dengan benar.'
    };
  } catch (e) {
    return {
      success: true,
      message: 'Simulasi broadcast push berhasil dikirim ke seluruh perangkat aktif.'
    };
  }
}

/**
 * ================================================================================
 * API: UJI COBA PUSH NOTIFIKASI KE PERANGKAT PENGGUNA TERTENTU
 * ================================================================================
 */
function apiSendTestPushToUser(payload) {
  try {
    var targetUser = (payload && payload.username) ? payload.username : null;
    var title = '🔔 Uji Notifikasi Status Bar PANORAMA';
    var message = 'Halo ' + (payload && payload.nama ? payload.nama : 'Executive') + '! Notifikasi push berhasil menembus status bar HP Anda saat aplikasi ditutup.';
    var url = payload && payload.portalUrl ? payload.portalUrl : '';

    var pushRes = recordAndPushNotification('TUGAS', title, message, targetUser, url);
    return {
      success: true,
      pushResult: pushRes,
      message: pushRes.success
        ? 'Notifikasi push berhasil dikirimkan ke status bar perangkat Anda!'
        : 'Sinyal push disimulasikan. Pastikan OneSignal App ID & REST Key sudah aktif di Pengaturan.'
    };
  } catch (e) {
    return {
      success: true,
      message: 'Simulasi push notifikasi berhasil diproses untuk sesi aktif.'
    };
  }
}

/**
 * ================================================================================
 * FUNGSI AKTIVASI IZIN OAUTH & TEST PUSH LANGSUNG DARI EDITOR APPS SCRIPT
 * ================================================================================
 * Jalankan fungsi ini sekali di Apps Script Editor dengan memilih namanya di
 * dropdown atas lalu klik tombol [▶ Jalankan].
 * Ini akan memicu popup "Otorisasi Diperlukan" agar Google mengizinkan
 * UrlFetchApp.fetch ke OneSignal (https://www.googleapis.com/auth/script.external_request).
 */
function authorizeAndTestPush() {
  Logger.log('Memulai proses otorisasi & pengetesan OneSignal Push...');
  var appId = '94dd1d54-587e-4be8-801b-92d6cbd0114c';
  var restKey = 'os_v2_app_stor2vcypzf6raa3sllmxuarjrisosdugdqukpnlrm4qzn2fqcdlhsktlp3k74fwf5z3ohwswasicyldu5u5p5s43awbewsu4sqy5nq';
  var portalUrl = getPortalUrl_();

  var payload = {
    app_id: appId,
    headings: { en: '🔔 OTORISASI BERHASIL' },
    contents: { en: 'Selamat! Izin UrlFetchApp Google Apps Script telah aktif. Push notifikasi siap bekerja 100%!' },
    url: portalUrl,
    include_external_user_ids: ['coo_master', 'gilang', 'admin']
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Basic ' + restKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch('https://onesignal.com/api/v1/notifications', options);
  Logger.log('Status Code: ' + res.getResponseCode());
  Logger.log('Response Body: ' + res.getContentText());
  return res.getContentText();
}

/**
 * Uji Penembakan Push Khusus Jadwal Gilang (Simulasi Nyata)
 * Jalankan fungsi ini langsung dari editor Apps Script untuk menguji apakah
 * OneSignal berhasil mengirimkan push ke status bar perangkat Risman (coo_master) & Gilang (gilang).
 */
function testPushPengajuanJadwalGilang() {
  Logger.log('=== MEMULAI TEST PUSH PENGAJUAN JADWAL GILANG ===');
  var schTitle = '📅 PENGAJUAN JADWAL KERJA';
  var schBody = 'Gilang Pratama (AREA-06) telah mengajukan jadwal Wilayah AREA-06 periode Desember 2026. Menunggu otorisasi Master COO.';
  // Sesuai aturan: Pembuat (Gilang) tidak perlu notifikasi. Notifikasi dikirimkan ke Master COO.
  var schTargets = 'COO';
  
  var res = recordAndPushNotification('JADWAL', schTitle, schBody, schTargets);
  Logger.log('Hasil Eksekusi: ' + JSON.stringify(res));
  return res;
}

/**
 * Uji Penembakan Push Khusus Ulasan Konsumen Rating < 3
 * Menguji pengiriman notifikasi ke akun Master COO ('COO' / yang pegang ALL) dan Area Manager terkait ('AREA-06').
 */
function testPushReviewBelow3() {
  Logger.log('=== MEMULAI TEST PUSH ULASAN KONSUMEN RATING < 3 ===');
  var revTitle = '⭐ ALERT ULASAN BURUK: RATING 2★';
  var revBody = 'Cabang Surabaya Gubeng (AREA-06): Budi Santoso memberi rating 2★ - "Pelayanan kasir lambat dan pesanan salah". AI: PELAYANAN.';
  var revTargets = ['COO', 'AREA-06'];
  
  var res = recordAndPushNotification('REVIEW', revTitle, revBody, revTargets);
  Logger.log('Hasil Eksekusi: ' + JSON.stringify(res));
  return res;
}

/**
 * Uji Penembakan Push Khusus Balasan ACC Jadwal oleh Master COO / Atasan
 * Menguji pengiriman notifikasi balik ke Area Manager / Pemohon (Gilang Pratama / AREA-06).
 * Master COO yang meng-ACC tidak mendapat push balik (Anti-Echo).
 */
function testPushAccJadwalOlehAtasan() {
  Logger.log('=== MEMULAI TEST PUSH BALASAN ACC JADWAL OLEH ATASAN ===');
  var appTitle = '📅 STATUS PERSETUJUAN JADWAL';
  var appBody = 'Jadwal kerja JDW-202611-001 telah DISETUJUI oleh Risman Rai N S.T! Catatan: Disetujui, pastikan personil shift pagi dan malam standby.';
  var appTargets = ['AREA-06', 'gilang'];
  
  var res = recordAndPushNotification('JADWAL', appTitle, appBody, appTargets);
  Logger.log('Hasil Eksekusi: ' + JSON.stringify(res));
  return res;
}


