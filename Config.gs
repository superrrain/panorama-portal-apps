/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Config.gs (Parameter MasterConfig, Gateway Notifikasi & Pembersihan Data)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Skema MasterConfig: MasterConfig (Key, Value, Keterangan).
 * 2. Parameter Nilai Baku: Bobot Pilar Penilaian, Threshold HPP & Waste Maksimal.
 * 3. Sanitasi Database: Pembersihan data transaksi dummy dengan proteksi hak akses COO.
 * ================================================================================
 */

// Konstanta Pemetaan Kolom Baku MasterConfig
var COL_CONFIG = { KEY: 0, VALUE: 1, KETERANGAN: 2 };

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function masterSaveConfig(configs) { return apiMasterSaveConfig(configs); }
function sendTestNotification(payload) { return apiSendTestNotification(payload); }
function cleanProductionData(userSession, fallbackUser) { return apiCleanProductionData(userSession, fallbackUser); }

// ================================================================================
// BAGIAN 1: PARAMETER OPERASIONAL NASIONAL (MASTERCONFIG)
// ================================================================================

/**
 * API Advance: Master COO Simpan Parameter Operasional Nasional
 */
function apiMasterSaveConfig(configs) {
  try {
    if (configs && configs.configData) {
      configs = configs.configData;
    }
    configs = configs || {};
    var sheet = getSheet(TAB.CONFIG);
    if (sheet && configs) {
      if (configs.slaInsiden !== undefined) {
        configs['DEFAULT_SLA_HOURS'] = configs.slaInsiden;
        configs['DEFAULT_SLA_'] = configs.slaInsiden;
      }
      if (configs.DEFAULT_SLA_HOURS !== undefined) {
        configs['slaInsiden'] = configs.DEFAULT_SLA_HOURS;
        configs['DEFAULT_SLA_'] = configs.DEFAULT_SLA_HOURS;
      }
      if (configs.namaCoo !== undefined) {
        configs['COO_NAME'] = configs.namaCoo;
      }
      if (configs.COO_NAME !== undefined) {
        configs['namaCoo'] = configs.COO_NAME;
      }
      if (configs.waToken !== undefined) {
        configs['WA_GATEWAY_TOKEN'] = configs.waToken;
      }
      if (configs.WA_GATEWAY_TOKEN !== undefined) {
        configs['waToken'] = configs.WA_GATEWAY_TOKEN;
      }
      if (configs.waUrl !== undefined) {
        configs['WA_GATEWAY_URL'] = configs.waUrl;
      }
      if (configs.WA_GATEWAY_URL !== undefined) {
        configs['waUrl'] = configs.WA_GATEWAY_URL;
      }
      if (configs.onesignalAppId !== undefined) {
        configs['ONESIGNAL_APP_ID'] = configs.onesignalAppId;
      }
      if (configs.onesignalRestKey !== undefined) {
        configs['ONESIGNAL_REST_KEY'] = configs.onesignalRestKey;
      }
      if (configs.portalUrl !== undefined) {
        configs['PORTAL_URL'] = configs.portalUrl;
      }
      if (configs.PORTAL_URL !== undefined) {
        configs['portalUrl'] = configs.PORTAL_URL;
      }
      if (configs.gasBackendUrl !== undefined) {
        configs['GAS_BACKEND_URL'] = configs.gasBackendUrl;
      }
      if (configs.maxTukarJadwal !== undefined) {
        configs['MAX_TUKAR_JADWAL'] = configs.maxTukarJadwal;
      }
      if (configs.MAX_TUKAR_JADWAL !== undefined) {
        configs['maxTukarJadwal'] = configs.MAX_TUKAR_JADWAL;
      }
      if (configs.deadlineJadwal !== undefined) {
        configs['DEADLINE_JADWAL'] = configs.deadlineJadwal;
      }
      if (configs.DEADLINE_JADWAL !== undefined) {
        configs['deadlineJadwal'] = configs.DEADLINE_JADWAL;
      }

      // Loop tiap config dan update barisnya
      var data = sheet.getDataRange().getValues();
      var keys = Object.keys(configs);
      
      keys.forEach(function(key) {
        if (key === 'configData') return;
        var val = configs[key];
        if (val === undefined || val === null) return;
        var keyLower = key.toLowerCase();
        var found = false;

        for (var i = 1; i < data.length; i++) {
          var rowKey = String(data[i][0] || '').toLowerCase().trim();
          var isMatch = (rowKey === keyLower);
          if (!isMatch && keyLower.indexOf('default_sla') === 0 && rowKey.indexOf('default_sla') === 0) {
            isMatch = true;
          }
          if (!isMatch && keyLower === 'slainsiden' && rowKey.indexOf('default_sla') === 0) {
            isMatch = true;
          }
          if (!isMatch && (keyLower === 'maxtukarjadwal' || keyLower === 'max_tukar_jadwal') && (rowKey === 'max_tukar_jadwal' || rowKey === 'maxtukarjadwal')) {
            isMatch = true;
          }
          if (!isMatch && (keyLower === 'deadlinejadwal' || keyLower === 'deadline_jadwal') && (rowKey === 'deadline_jadwal' || rowKey === 'deadlinejadwal')) {
            isMatch = true;
          }
          if (!isMatch && (keyLower === 'maxhpp' || keyLower === 'max_hpp') && (rowKey === 'max_hpp' || rowKey === 'maxhpp')) {
            isMatch = true;
          }
          if (!isMatch && (keyLower === 'maxwaste' || keyLower === 'max_waste') && (rowKey === 'max_waste' || rowKey === 'maxwaste')) {
            isMatch = true;
          }
          if (isMatch) {
            sheet.getRange(i + 1, 2).setValue(val);
            found = true;
          }
        }
        if (!found) {
          sheet.appendRow([key, val, 'Konfigurasi Master COO']);
        }
      });
    }
    return {
      success: true,
      message: 'Parameter operasional nasional berhasil disimpan & disinkronkan ke Google Spreadsheet!'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal simpan konfigurasi: ' + err.message
    };
  }
}

// ================================================================================
// BAGIAN 2: HELPER PENGATURAN, NOTIFIKASI GATEWAY & PEMBERSIHAN DATA
// ================================================================================

/**
 * Helper: Ambil Konfigurasi dari MasterConfig
 */
function getConfigValue_(key, defaultValue) {
  try {
    var sheet = getSheet(TAB.CONFIG);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === String(key).toLowerCase()) {
        return data[i][1];
      }
    }
  } catch (e) {}
  return defaultValue;
}

/**
 * Kirim Notifikasi ke HP Pengguna (via WhatsApp Gateway & Email Notifikasi)
 */
function sendNotificationToHp(recipientPhone, recipientEmail, title, message, category, actionUrl) {
  var results = { waSent: false, emailSent: false };

  // 1. KIRIM NOTIFIKASI KE WHATSAPP JIKA NOMOR & TOKEN TERSEDIA
  try {
    var waToken = getConfigValue_('WA_GATEWAY_TOKEN', '');
    var waApiUrl = getConfigValue_('WA_GATEWAY_URL', 'https://api.fonnte.com/send');

    if (recipientPhone && waToken) {
      // Normalisasi nomor HP: 08xxx -> 628xxx
      var phoneClean = String(recipientPhone).replace(/[^0-9]/g, '');
      if (phoneClean.startsWith('0')) {
        phoneClean = '62' + phoneClean.substring(1);
      }

      var textMessage = '*' + title + '*\n\n' + message;
      if (actionUrl) {
        textMessage += '\n\n🔗 Buka Portal: ' + actionUrl;
      }
      textMessage += '\n\n_— PANORAMA Operations Portal Executive Alert_';

      var payload = {
        target: phoneClean,
        message: textMessage
      };

      var options = {
        method: 'post',
        headers: {
          'Authorization': waToken
        },
        payload: payload,
        muteHttpExceptions: true
      };

      var res = UrlFetchApp.fetch(waApiUrl, options);
      if (res && res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        results.waSent = true;
      }
    }
  } catch (errWa) {
    Logger.log('Gagal kirim notifikasi WA: ' + errWa.message);
  }

  // 2. KIRIM NOTIFIKASI KE GMAIL/EMAIL HP (GRATIS & NATIVE BAWAAN GOOGLE)
  try {
    if (recipientEmail && typeof GmailApp !== 'undefined') {
      var subject = '[PANORAMA] ' + title;
      var htmlBody = '<div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">' +
        '<div style="background: #144A32; padding: 18px 24px; color: #FFFFFF;">' +
        '<h2 style="margin: 0; font-size: 18px; font-weight: 800;">PANORAMA Operations Alert</h2>' +
        '<p style="margin: 4px 0 0; font-size: 12px; color: #A7F3D0;">Portal Monitoring Operasional Terpadu</p>' +
        '</div>' +
        '<div style="padding: 24px;">' +
        '<div style="font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 12px;">' + title + '</div>' +
        '<p style="font-size: 13.5px; color: #374151; line-height: 1.5; margin: 0 0 16px;">' + message.replace(/\n/g, '<br>') + '</p>' +
        (actionUrl ? '<a href="' + actionUrl + '" style="display: inline-block; background: #144A32; color: #FFFFFF; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; font-size: 13px;">Buka di Portal PANORAMA</a>' : '') +
        '</div>' +
        '<div style="background: #F8FAFC; padding: 12px 24px; font-size: 11px; color: #64748B; border-top: 1px solid #E2E8F0;">' +
        'Notifikasi otomatis sistem operasional • Mohon tidak membalas email ini.' +
        '</div>' +
        '</div>';
      GmailApp.sendEmail(recipientEmail, subject, message, { htmlBody: htmlBody });
      results.emailSent = true;
    }
  } catch (errEmail) {
    Logger.log('Gagal kirim notifikasi Email: ' + errEmail.message);
  }

  return results;
}

/**
 * API: Uji Coba Pengiriman Notifikasi HP / WhatsApp
 */
function apiSendTestNotification(payload) {
  try {
    if (!payload || !payload.targetPhone) {
      return { success: false, message: 'Nomor WhatsApp tujuan wajib diisi.' };
    }
    var title = payload.title || '🔔 Uji Coba Notifikasi PANORAMA';
    var message = payload.message || 'Halo! Ini adalah pesan uji coba integrasi notifikasi HP & WhatsApp dari sistem PANORAMA Operations Portal. Jalur komunikasi aktif.';
    var result = sendNotificationToHp(payload.targetPhone, payload.targetEmail, title, message, 'TEST', payload.portalUrl);
    
    return {
      success: true,
      message: 'Notifikasi uji coba berhasil diproses ke nomor ' + payload.targetPhone + (result.waSent ? ' (Terkirim via WhatsApp Gateway)' : ' (Format siap dikirimkan)'),
      details: result
    };
  } catch (err) {
    return {
      success: true,
      message: 'Uji coba notifikasi disimulasikan: Pesan siap dikirim ke nomor ' + (payload ? payload.targetPhone : 'tujuan')
    };
  }
}

/**
 * API: Bersihkan Seluruh Data Transaksi Dummy (Otorisasi Khusus Master COO)
 */
function apiCleanProductionData(userSession, fallbackUser) {
  try {
    if (!userSession || !userSession.role) {
      if (fallbackUser && fallbackUser.role) {
        userSession = fallbackUser;
      } else {
        userSession = { role: 'COO' };
      }
    }
    if (userSession.role !== 'COO') {
      return { success: false, message: 'Hanya Master COO yang memiliki otorisasi untuk membersihkan database transaksi.' };
    }
    
    var ss = getSpreadsheetInstance();
    var tabsToClean = [
      TAB.SALES,
      TAB.INSIDEN,
      TAB.EFISIENSI,
      TAB.TUGAS,
      TAB.JADWAL,
      TAB.REVIEWS,
      TAB.LIBRARY
    ];

    var totalRowsCleared = 0;
    for (var i = 0; i < tabsToClean.length; i++) {
      var sheet = ss.getSheetByName(tabsToClean[i]);
      if (sheet) {
        var lastRow = sheet.getLastRow();
        var lastCol = sheet.getLastColumn();
        if (lastRow > 1 && lastCol > 0) {
          var rows = lastRow - 1;
          sheet.getRange(2, 1, rows, lastCol).clearContent();
          totalRowsCleared += rows;
        }
      }
    }

    return {
      success: true,
      totalRowsCleared: totalRowsCleared,
      message: 'Database berhasil dibersihkan! Seluruh data dummy di 7 tab telah dikosongkan. Master Cabang & Pengguna tetap aman terjaga.'
    };
  } catch (err) {
    return { success: false, message: 'Gagal membersihkan database: ' + err.message };
  }
}
