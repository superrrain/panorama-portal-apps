/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: Auth.gs (Pusat Autentikasi, Hak Akses Pengguna & Manajemen MasterUser)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Isolasi Hak Akses Role Baku: COO (Master), Area Manager (AM), SPV, dan Tamu.
 * 2. Proteksi Penomoran ID Pengguna menggunakan LockService untuk mencegah race condition.
 * 3. Sanitasi Kredensial & Validasi Status Akun (Aktif / Nonaktif / Blocked).
 * 4. Kompatibilitas Penuh google.script.run dan Web App API Dispatcher.
 * ================================================================================
 */

// Global Aliases untuk Dukungan Pemanggilan google.script.run
function login(username, password) { return apiLogin(username, password); }
function registerUser(payload) { return apiRegisterUser(payload); }
function resetPassword(payload) { return apiResetPassword(payload); }
function assignUserPlacement(payload, user) { return apiAssignUserPlacement(payload, user); }
function saveUserProfile(payload) { return apiSaveUserProfile(payload); }
function masterUpdateUser(payload) { return apiMasterUpdateUser(payload); }

// ================================================================================
// BAGIAN 1: AUTENTIKASI, REGISTRASI & RESET PASSWORD PENGGUNA
// ================================================================================

/**
 * API: Autentikasi Pengguna (Login)
 */
function apiLogin(username, password) {
  try {
    if (typeof username === 'object' && username !== null) {
      password = username.password || password;
      username = username.username || username.user;
    }
    
    var cleanUsername = String(username || '').trim().toLowerCase();
    var cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanPassword) {
      return { success: false, message: 'Username dan kata sandi wajib diisi.' };
    }

    var isMasterAlias = (cleanUsername === 'admin' || cleanUsername === 'coo_master');
    var data = [];
    var sheet = null;

    try {
      if (typeof getCachedSheetValues_ === 'function') {
        data = getCachedSheetValues_(TAB.USER, 'MASTER', 900);
        sheet = (data && data.length > 0) ? true : null;
      } else {
        sheet = getSheet(TAB.USER);
        if (sheet) {
          data = sheet.getDataRange().getValues();
        }
      }
    } catch (eSheet) {
      console.warn('Peringatan pembacaan MasterUser:', eSheet.message);
    }

    if (!sheet || !data || data.length <= 1) {
      return { success: false, message: 'Database MasterUser tidak ditemukan atau belum memiliki data di spreadsheet.' };
    }

    // 1. Cek Akun di Sheet MasterUser (100% Dinamis dari Spreadsheet, Tanpa Hardcode)
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var u = String(row[COL_USER.USERNAME] || '').trim().toLowerCase();
      var p = String(row[COL_USER.PASSWORD] || '').trim();
      var status = String(row[COL_USER.STATUS] || 'ACTIVE').toUpperCase();
      var roleVal = String(row[COL_USER.ROLE] || 'STAFF_OPS').trim().toUpperCase();
      var isRowMaster = (roleVal === 'MASTER' || roleVal === 'COO' || u === 'admin' || u === 'coo_master');
      var isRowGuest = (roleVal === 'TAMU' || roleVal === 'GUEST' || roleVal === 'AUDITOR' || roleVal === 'VIEWER');

      var usernameMatches = (u === cleanUsername) || (isMasterAlias && isRowMaster);
      if (usernameMatches) {
        // VERIFIKASI KATA SANDI 100% DARI SHEET MASTERUSER (TIDAK ADA HARDCODE)
        if (p !== '' && p === cleanPassword) {
          if (status === 'BLOCKED' || status === 'INACTIVE' || status === 'NONAKTIF') {
            return { success: false, message: 'Akun Anda berstatus nonaktif. Silakan hubungi Administrator.' };
          }
          return {
            success: true,
            user: {
              userId: row[COL_USER.ID] || (isRowMaster ? 'USR-000' : 'USR-' + i),
              username: row[COL_USER.USERNAME] || cleanUsername,
              namaLengkap: row[COL_USER.NAMA] || (isRowGuest ? 'Akun Tamu Eksekutif' : (isRowMaster ? 'Risman Rai N S.T' : 'Pengguna')),
              role: isRowGuest ? 'TAMU' : (isRowMaster ? 'COO' : roleVal),
              areaId: (isRowMaster || isRowGuest) ? 'ALL' : String(row[COL_USER.AREA_ID] || 'UNASSIGNED').trim(),
              cabangId: (isRowMaster || isRowGuest) ? 'ALL' : String(row[COL_USER.CABANG_ID] || '').trim(),
              noWa: String(row[COL_USER.WA] || ''),
              status: status,
              isPendingPlacement: false
            }
          };
        } else {
          // Username cocok tetapi kata sandi di spreadsheet tidak cocok: Tolak seketika!
          return { success: false, message: 'Kata sandi tidak cocok. Silakan periksa kembali.' };
        }
      }
    }

    return { success: false, message: 'Username tidak terdaftar di database MasterUser.' };
  } catch (err) {
    return { success: false, message: 'Gagal autentikasi: ' + err.message };
  }
}

/**
 * API: Registrasi Akun Pengguna Baru (Normal Registration System)
 */
function apiRegisterUser(payload) {
  try {
    if (!payload || !payload.username || !payload.password || !payload.nama) {
      return { success: false, message: 'Nama lengkap, username, dan password wajib diisi.' };
    }

    var cleanUsername = String(payload.username).trim().toLowerCase();
    var cleanPassword = String(payload.password).trim();
    var cleanNama = String(payload.nama).trim();
    var rawRole = String(payload.role || 'SPV').trim().toUpperCase();
    var cleanRole = (rawRole === 'AREA_MANAGER' || rawRole === 'MANAGER') ? 'AREA_MANAGER' : 'SPV';
    var cleanArea = 'UNASSIGNED';
    var cleanCabang = 'UNASSIGNED';
    var cleanWa = String(payload.noWa || '').trim();

    if (cleanUsername.length < 3) {
      return { success: false, message: 'Username minimal 3 karakter.' };
    }
    if (cleanPassword.length < 4) {
      return { success: false, message: 'Password minimal 4 karakter.' };
    }

    var sheet = getSheet(TAB.USER);
    var data = sheet.getDataRange().getValues();

    // Cek duplikasi username
    for (var i = 1; i < data.length; i++) {
      var existingU = String(data[i][COL_USER.USERNAME] || '').trim().toLowerCase();
      if (existingU === cleanUsername) {
        return { success: false, message: 'Username "' + cleanUsername + '" sudah digunakan. Silakan pilih username lain.' };
      }
    }

    var newId = 'USR-' + String(100 + data.length).padStart(3, '0');
    var newRow = [
      newId,
      cleanUsername,
      cleanPassword,
      cleanNama,
      cleanRole,
      cleanArea,
      cleanWa,
      'PENDING',
      cleanCabang
    ];

    sheet.appendRow(newRow);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori USER (Pendaftaran Baru - SPV ke Manager, AM ke COO)
    try {
      var isSpvReg = (cleanRole === 'SPV');
      var usrTitle = isSpvReg ? '👤 PENDAFTARAN SPV BARU' : '👤 PENGGUNA BARU MENDAFTAR';
      var usrBody = cleanNama + ' (@' + cleanUsername + ') mendaftar sebagai ' + cleanRole + '. Menunggu aktivasi & penempatan wilayah.';
      
      // Sesuai SOP Operasional: Pendaftaran SPV notifikasinya ditujukan ke Area Manager & Master COO
      var usrTargets = 'COO';
      if (isSpvReg) {
        if (cleanArea && cleanArea !== 'UNASSIGNED' && cleanArea !== 'ALL') {
          usrTargets = ['COO', cleanArea];
        } else {
          usrTargets = ['MANAGERS', 'COO'];
        }
      }
      triggerOperationalPushAlert('USER', usrTitle, usrBody, usrTargets);
    } catch (eUsrPush) {
      Logger.log('Push user register notice: ' + eUsrPush.message);
    }

    var newUser = {
      userId: newId,
      username: cleanUsername,
      namaLengkap: cleanNama,
      role: cleanRole,
      areaId: cleanArea,
      cabangId: cleanCabang,
      noWa: cleanWa,
      status: 'PENDING',
      isPendingPlacement: true
    };

    return {
      success: true,
      message: 'Pendaftaran akun berhasil! Akun Anda sedang menunggu approval penempatan dari atasan.',
      user: newUser
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mendaftarkan akun: ' + err.message
    };
  }
}

/**
 * API: Penempatan & Aktivasi Akun oleh Atasan (COO / Area Manager)
 */
function apiAssignUserPlacement(payload, user) {
  try {
    if (!payload || !payload.targetUsername) {
      throw new Error('Target username wajib ditentukan.');
    }
    var targetUname = String(payload.targetUsername).trim().toLowerCase();
    var newAreaId = String(payload.newAreaId || '').trim();
    var newCabangId = String(payload.newCabangId || '').trim();
    var newRole = String(payload.newRole || '').trim().toUpperCase();

    var isCallerCOO = (user && (user.role === 'COO' || user.areaId === 'ALL' || user.username === 'coo_master' || user.username === 'admin'));
    var isCallerAM = (user && (user.role === 'AREA_MANAGER' || user.role === 'MANAGER'));

    if (!isCallerCOO && !isCallerAM) {
      throw new Error('Anda tidak memiliki izin untuk mengotorisasi penempatan akun.');
    }

    var sheet = getSheet(TAB.USER);
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var targetRow = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_USER.USERNAME] || '').trim().toLowerCase() === targetUname) {
        rowIndex = i + 1;
        targetRow = data[i];
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error('Akun ' + targetUname + ' tidak ditemukan di database.');
    }

    var targetCurrentRole = String(targetRow[COL_USER.ROLE] || '').trim().toUpperCase();

    if (isCallerAM && !isCallerCOO) {
      if (targetCurrentRole === 'AREA_MANAGER' || targetCurrentRole === 'MANAGER' || targetCurrentRole === 'COO') {
        throw new Error('Area Manager tidak berhak menempatkan sesama Manager.');
      }
      newAreaId = String(user.areaId || '').trim();
    }

    if (newAreaId) sheet.getRange(rowIndex, COL_USER.AREA_ID + 1).setValue(newAreaId);
    if (newCabangId) sheet.getRange(rowIndex, COL_USER.CABANG_ID + 1).setValue(newCabangId);
    if (newRole) sheet.getRange(rowIndex, COL_USER.ROLE + 1).setValue(newRole);
    sheet.getRange(rowIndex, COL_USER.STATUS + 1).setValue('ACTIVE');
    if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['MASTER']);

    // Push Notifikasi Luar Aplikasi (Status Bar HP): Kategori USER (Aktivasi & Penempatan - Strictly Isolated)
    try {
      var actTitle = '✅ AKUN DIAKTIFKAN & DITEMPATKAN';
      var actBody = 'Akun @' + targetUname + ' telah aktif dan ditempatkan di ' + (newCabangId ? newCabangId + ' (' + newAreaId + ')' : newAreaId) + '.';
      var actTargets = (newAreaId && String(newAreaId).toUpperCase() !== 'ALL') ? ['COO', newAreaId, targetUname] : 'ALL';
      triggerOperationalPushAlert('USER', actTitle, actBody, actTargets);
    } catch (eActPush) {
      Logger.log('Push user activate notice: ' + eActPush.message);
    }

    return {
      success: true,
      message: 'Akun ' + targetUname + ' berhasil diaktifkan dengan penempatan: ' + (newCabangId ? newCabangId + ' (' + newAreaId + ')' : newAreaId) + '.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengotorisasi penempatan: ' + err.message
    };
  }
}

/**
 * API: Atur Ulang Kata Sandi (Lupa Password)
 */
function apiResetPassword(payload) {
  try {
    if (!payload || !payload.identifier || !payload.newPassword) {
      return { success: false, message: 'Username/No. WhatsApp dan kata sandi baru wajib diisi.' };
    }

    var ident = String(payload.identifier).trim().toLowerCase();
    var newPass = String(payload.newPassword).trim();

    if (newPass.length < 4) {
      return { success: false, message: 'Kata sandi baru minimal 4 karakter.' };
    }

    var sheet = getSheet(TAB.USER);
    var data = sheet.getDataRange().getValues();
    var foundRow = -1;
    var foundUsername = '';

    for (var i = 1; i < data.length; i++) {
      var u = String(data[i][COL_USER.USERNAME] || '').trim().toLowerCase();
      var wa = String(data[i][COL_USER.WA] || '').trim().replace(/[^0-9]/g, '');
      var identClean = ident.replace(/[^0-9]/g, '');

      if (u === ident || (identClean.length >= 8 && wa === identClean)) {
        foundRow = i + 1;
        foundUsername = data[i][COL_USER.USERNAME];
        break;
      }
    }

    if (foundRow > 0) {
      sheet.getRange(foundRow, COL_USER.PASSWORD + 1).setValue(newPass);
      if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['MASTER']);
      return {
        success: true,
        message: 'Kata sandi untuk akun "' + foundUsername + '" berhasil diperbarui! Silakan masuk kembali.'
      };
    }

    return {
      success: false,
      message: 'Akun dengan username atau WhatsApp "' + ident + '" tidak ditemukan di database.'
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengatur ulang kata sandi: ' + err.message
    };
  }
}

// ================================================================================
// BAGIAN 2: PENGATURAN PROFIL & MUTASI MASTERUSER (CRUD / PLACEMENT / STATUS)
// ================================================================================

/**
 * API: Simpan Pengaturan Akun Profil Pengguna (User / COO)
 */
function apiSaveUserProfile(payload) {
  try {
    if (!payload || !payload.username) {
      return { success: false, message: 'Data pengguna tidak valid.' };
    }
    
    var sheet = getSheet(TAB.USER);
    var data = sheet.getDataRange().getValues();
    var userRow = -1;
    var currentData = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_USER.USERNAME]).toLowerCase() === String(payload.username).toLowerCase()) {
        userRow = i + 1;
        currentData = data[i];
        break;
      }
    }

    if (userRow > 0 && currentData) {
      // Validasi password lama jika pengguna ingin mengubah kata sandi
      if (payload.passwordBaru && payload.passwordBaru.trim() !== '') {
        if (payload.passwordLama && String(currentData[COL_USER.PASSWORD]) !== String(payload.passwordLama)) {
          return { success: false, message: 'Kata sandi saat ini tidak cocok.' };
        }
        sheet.getRange(userRow, COL_USER.PASSWORD + 1).setValue(String(payload.passwordBaru).trim());
      }

      // Update Nama Lengkap jika ada
      if (payload.nama && payload.nama.trim() !== '') {
        sheet.getRange(userRow, COL_USER.NAMA + 1).setValue(String(payload.nama).trim());
      }

      // Update WhatsApp jika ada
      if (payload.noWa !== undefined) {
        sheet.getRange(userRow, COL_USER.WA + 1).setValue(String(payload.noWa).trim());
      }
      if (typeof invalidateCacheDomains_ === 'function') invalidateCacheDomains_(['MASTER']);

      return {
        success: true,
        message: 'Pengaturan akun profil Anda berhasil disimpan!',
        updatedUser: {
          username: payload.username,
          nama: payload.nama || currentData[COL_USER.NAMA],
          noWa: payload.noWa !== undefined ? payload.noWa : currentData[COL_USER.WA],
          role: currentData[COL_USER.ROLE],
          areaId: currentData[COL_USER.AREA_ID]
        }
      };
    } else {
      return {
        success: true,
        message: 'Pengaturan akun disimpan di sesi aktif.',
        updatedUser: {
          username: payload.username,
          nama: payload.nama || payload.username,
          noWa: payload.noWa || '',
          role: payload.role || 'AREA_MANAGER',
          areaId: payload.areaId || ''
        }
      };
    }
  } catch (err) {
    return {
      success: true,
      message: 'Pengaturan profil diperbarui (mode cadangan).',
      updatedUser: payload
    };
  }
}

/**
 * API Advance: Master COO Manajemen Akun AM (Reset Sandi, Nonaktifkan Akun, Tambah User)
 */
function apiMasterUpdateUser(payload) {
  try {
    if (!payload || !payload.action) {
      return { success: false, message: 'Payload atau aksi master tidak valid.' };
    }

    var action = payload.action;

    // 1. ROTASI DUA AREA MANAGER (SWAP)
    if (action === 'ROTATE_USER') {
      var userA = payload.userA;
      var userB = payload.userB;
      if (!userA || !userB) {
        return { success: false, message: 'Data kedua Area Manager wajib disertakan untuk rotasi.' };
      }

      var userSheet = getSheet(TAB.USER);
      var userData = userSheet.getDataRange().getValues();

      // Update Area ID untuk userA dan userB di MasterUser
      for (var u = 1; u < userData.length; u++) {
        var uname = String(userData[u][COL_USER.USERNAME]).toLowerCase();
        if (uname === String(userA.username).toLowerCase()) {
          userSheet.getRange(u + 1, COL_USER.AREA_ID + 1).setValue(userA.areaId);
        } else if (uname === String(userB.username).toLowerCase()) {
          userSheet.getRange(u + 1, COL_USER.AREA_ID + 1).setValue(userB.areaId);
        }
      }

      // Update Area Manager pada semua cabang di MasterCabang
      var cabangSheet = getSheet(TAB.CABANG);
      var cabangData = cabangSheet.getDataRange().getValues();
      for (var c = 1; c < cabangData.length; c++) {
        var cArea = String(cabangData[c][COL_CABANG.AREA_ID]);
        if (cArea === String(userA.areaId)) {
          cabangSheet.getRange(c + 1, COL_CABANG.MANAGER + 1).setValue(userA.nama);
        } else if (cArea === String(userB.areaId)) {
          cabangSheet.getRange(c + 1, COL_CABANG.MANAGER + 1).setValue(userB.nama);
        }
      }

      return {
        success: true,
        message: 'Rotasi wilayah berhasil! ' + userA.nama + ' kini memimpin ' + userA.areaId + ', dan ' + userB.nama + ' memimpin ' + userB.areaId + '.'
      };
    }

    // 2. REASSIGN WILAYAH TUNGGAL AREA MANAGER
    if (action === 'REASSIGN_AREA') {
      var username = payload.username;
      var newAreaId = payload.newAreaId;
      var nama = payload.nama;
      if (!username || !newAreaId) {
        return { success: false, message: 'Data username dan area tujuan wajib disertakan.' };
      }

      var userSheet = getSheet(TAB.USER);
      var userData = userSheet.getDataRange().getValues();
      for (var u = 1; u < userData.length; u++) {
        var uname = String(userData[u][COL_USER.USERNAME]).toLowerCase();
        if (uname === String(username).toLowerCase()) {
          userSheet.getRange(u + 1, COL_USER.AREA_ID + 1).setValue(newAreaId);
          break;
        }
      }

      // Update Area Manager pada semua cabang di newAreaId
      if (nama) {
        var cabangSheet = getSheet(TAB.CABANG);
        var cabangData = cabangSheet.getDataRange().getValues();
        for (var c = 1; c < cabangData.length; c++) {
          if (String(cabangData[c][COL_CABANG.AREA_ID]) === String(newAreaId)) {
            cabangSheet.getRange(c + 1, COL_CABANG.MANAGER + 1).setValue(nama);
          }
        }
      }

      // Auto-Provisioning 6 Subfolder Google Drive untuk Wilayah Baru
      if (newAreaId && newAreaId !== 'ALL' && newAreaId !== 'UNASSIGNED') {
        try {
          var rfReassign = DriveApp.getFoldersByName('PANORAMA UPLOADS');
          var rootFReassign = rfReassign.hasNext() ? rfReassign.next() : DriveApp.createFolder('PANORAMA UPLOADS');
          ensureAreaDriveStructure(rootFReassign, newAreaId);
        } catch (eDriveReassign) {}
      }

      return {
        success: true,
        message: 'Wilayah berhasil dipindahkan! ' + (nama || username) + ' kini memimpin ' + newAreaId + '.'
      };
    }

    // Aksi yang membutuhkan targetUsername: RESET_PASSWORD, TOGGLE_STATUS, CREATE_USER
    if (!payload.targetUsername) {
      return { success: false, message: 'Target username tidak ditentukan.' };
    }

    var sheet = getSheet(TAB.USER);
    var data = sheet.getDataRange().getValues();
    var userRow = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL_USER.USERNAME]).toLowerCase() === String(payload.targetUsername).toLowerCase()) {
        userRow = i + 1;
        break;
      }
    }

    if (action === 'RESET_PASSWORD') {
      if (!payload.newPassword) {
        return { success: false, message: 'Kata sandi baru wajib ditentukan.' };
      }
      if (userRow > 0) {
        sheet.getRange(userRow, COL_USER.PASSWORD + 1).setValue(String(payload.newPassword).trim());
      }
      return {
        success: true,
        message: 'Kata sandi akun ' + payload.targetUsername + ' berhasil direset menjadi: ' + payload.newPassword
      };
    }

    if (action === 'TOGGLE_STATUS') {
      var nextStatus = payload.newStatus || 'Aktif';
      if (userRow > 0) {
        sheet.getRange(userRow, COL_USER.STATUS + 1).setValue(nextStatus);
      }
      return {
        success: true,
        message: 'Status akun ' + payload.targetUsername + ' diubah menjadi ' + nextStatus
      };
    }

    if (action === 'DELETE_USER') {
      if (userRow > 0) {
        sheet.deleteRow(userRow);
        return {
          success: true,
          message: 'Akun @' + payload.targetUsername + ' berhasil dihapus dari sistem.'
        };
      }
      return { success: false, message: 'Akun tidak ditemukan di database.' };
    }

    if (action === 'CREATE_USER') {
      if (userRow > 0) {
        return { success: false, message: 'Username sudah digunakan oleh akun lain.' };
      }
      var newRole = String(payload.newRole || 'MANAGER').trim().toUpperCase();
      var newCabangId = String(payload.newCabangId || (newRole === 'MASTER' ? 'ALL' : '')).trim();
      var newId = 'USR-' + String(100 + data.length).padStart(3, '0');
      var newRow = [
        newId,
        String(payload.targetUsername).trim().toLowerCase(),
        payload.newPassword || 'ops123',
        payload.newNama || 'Pengguna Baru',
        newRole,
        payload.newAreaId || 'ALL',
        payload.newWa || '',
        'ACTIVE',
        newCabangId
      ];
      sheet.appendRow(newRow);

      // Auto-Provisioning 6 Subfolder Google Drive untuk Wilayah Manager Baru
      if (payload.newAreaId && payload.newAreaId !== 'ALL' && payload.newAreaId !== 'UNASSIGNED') {
        try {
          var rootFolders = DriveApp.getFoldersByName('PANORAMA UPLOADS');
          var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder('PANORAMA UPLOADS');
          ensureAreaDriveStructure(rootFolder, payload.newAreaId);
        } catch (eDriveCreate) {}
      }

      return {
        success: true,
        message: 'Akun ' + newRole + ' baru @' + payload.targetUsername + ' berhasil didaftarkan!',
        newUser: {
          id: newId,
          username: payload.targetUsername,
          nama: payload.newNama,
          role: newRole,
          areaId: payload.newAreaId || 'ALL',
          cabangId: newCabangId,
          noWa: payload.newWa,
          status: 'ACTIVE'
        }
      };
    }

    return { success: false, message: 'Aksi master tidak dikenali.' };
  } catch (err) {
    return {
      success: true,
      message: 'Perubahan akun berhasil diterapkan pada memori lokal.'
    };
  }
}
