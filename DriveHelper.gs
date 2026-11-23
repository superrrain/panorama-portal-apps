/**
 * ================================================================================
 * PANORAMA - Portal Monitoring Operasional Eksekutif COO
 * Berkas: DriveHelper.gs (Google Drive Storage Engine, Auto-Organizer & File Uploader)
 * ================================================================================
 * STANDAR REKAYASA KODE ZETTBOT:
 * 1. Struktur Folder Baku Otomatis:
 *    - Wilayah: PANORAMA UPLOADS / [AREA-XX] / [6 Subfolder Modul Sheet]
 *      (DataInsiden, DataEfisiensi, DataTugas, DataJadwal, DataKendala, DataPerubahanJadwal)
 *    - Dokumen Umum & SOP: PANORAMA UPLOADS / UMUM / DataLibrary / [Kategori SOP]
 * 2. Izin Berkas Terbuka Otomatis (VIEW / ANYONE_WITH_LINK) agar bukti foto/dokumen
 *    dapat diakses langsung di antarmuka portal tanpa hambatan hak akses Google.
 * 3. Base64 Decoder & MimeType Detection untuk seluruh upload bukti operasional.
 * ================================================================================
 */

// Global aliases for direct google.script.run support
function uploadFileToDrive(base64Data, fileName, mimeType, areaName, category, subCategory) {
  return apiUploadFileToDrive(base64Data, fileName, mimeType, areaName, category, subCategory);
}

function organizeDriveFolders() {
  return organizePanoramaDriveFolders();
}

/**
 * Helper: Ambil atau Buat Folder Induk Utama PANORAMA UPLOADS
 */
function ensurePanoramaRootFolder() {
  var rootName = 'PANORAMA UPLOADS';
  var rootFolders = DriveApp.getFoldersByName(rootName);
  var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);
  try {
    rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (eR) {}
  return rootFolder;
}

/**
 * Helper: Normalisasi Target Penempatan File Google Drive
 * Mengelompokkan berkas per Area (AREA-01, AREA-02, dst) dengan subfolder sesuai modul Sheet:
 * - DataInsiden
 * - DataEfisiensi
 * - DataTugas
 * - DataJadwal
 * - DataKendala
 * - DataPerubahanJadwal
 *
 * Khusus berkas umum/nasional (SOP Library, Master Template) ditempatkan di luar Area:
 * - PANORAMA UPLOADS / UMUM / DataLibrary
 * - PANORAMA UPLOADS / UMUM / Dokumen Umum
 */
/**
 * Helper: Normalisasi Nama Folder Kategori SOP Ramah Manusia
 */
function formatSopCategoryFolderName(kategori) {
  var cStr = String(kategori || '').trim();
  var cUpper = cStr.toUpperCase();
  if (cUpper.indexOf('PRODUK') !== -1 || cUpper.indexOf('RESEP') !== -1) {
    return 'Produk & Resep';
  } else if (cUpper.indexOf('SAFETY') !== -1 || cUpper.indexOf('KEBERSIHAN') !== -1 || cUpper.indexOf('SANITASI') !== -1) {
    return 'Sanitasi & Food Safety';
  } else if (cUpper.indexOf('HR') !== -1 || cUpper.indexOf('DISIPLIN') !== -1 || cUpper.indexOf('KARYAWAN') !== -1) {
    return 'HR & Disiplin';
  } else if (cUpper.indexOf('FINANCE') !== -1 || cUpper.indexOf('KASIR') !== -1 || cUpper.indexOf('PELAYANAN') !== -1) {
    return 'Kasir & Pelayanan';
  } else if (cUpper.indexOf('K3') !== -1 || cUpper.indexOf('DARURAT') !== -1 || cUpper.indexOf('KESELAMATAN') !== -1) {
    return 'Darurat & K3';
  } else if (cUpper === 'OPERASIONAL' || cUpper.indexOf('OPERASIONAL GERAI') !== -1) {
    return 'Operasional Gerai';
  }
  // Kategori kustom (misal: "Marketing & Promo", "Audit Toko", dsb)
  return cStr.length > 0 ? (cStr.charAt(0).toUpperCase() + cStr.slice(1)) : 'Operasional Gerai';
}

function normalizeDriveUploadTarget(areaName, category, subCategory) {
  var rawArea = String(areaName || '').trim();
  var rawCat = String(category || '').trim();
  var catUpper = rawCat.toUpperCase();
  var areaUpper = rawArea.toUpperCase();

  var isGeneralDoc = false;
  var targetSheetFolder = 'Dokumen Umum';
  var targetSubFolder = '';

  // 1. Deteksi Modul Sheet berdasarkan Kategori
  if (catUpper.indexOf('LIBRARY') !== -1 || catUpper.indexOf('SOP') !== -1) {
    targetSheetFolder = 'DataLibrary';
    isGeneralDoc = true;
    targetSubFolder = formatSopCategoryFolderName(subCategory || (catUpper.indexOf('LIBRARY') === -1 && catUpper.indexOf('SOP') === -1 ? rawCat : ''));
  } else if (catUpper.indexOf('INSIDEN') !== -1 || catUpper.indexOf('BUKTI_PENANGANAN') !== -1 || catUpper.indexOf('BUKTI PENANGANAN') !== -1 || catUpper.indexOf('INC') !== -1) {
    targetSheetFolder = 'DataInsiden';
  } else if (catUpper.indexOf('EFISIENSI') !== -1 || catUpper.indexOf('NOTA') !== -1 || catUpper.indexOf('PETTY') !== -1 || catUpper.indexOf('WASTE') !== -1 || catUpper.indexOf('EFF') !== -1) {
    targetSheetFolder = 'DataEfisiensi';
  } else if (catUpper.indexOf('TUGAS') !== -1 || catUpper.indexOf('TASK') !== -1 || catUpper.indexOf('TSK') !== -1) {
    targetSheetFolder = 'DataTugas';
  } else if (catUpper.indexOf('PERUBAHAN') !== -1 || catUpper.indexOf('TUKAR') !== -1 || catUpper.indexOf('CHG') !== -1) {
    targetSheetFolder = 'DataPerubahanJadwal';
  } else if (catUpper.indexOf('JADWAL') !== -1 || catUpper.indexOf('ROSTER') !== -1 || catUpper.indexOf('SCH') !== -1) {
    targetSheetFolder = 'DataJadwal';
  } else if (catUpper.indexOf('KENDALA') !== -1 || catUpper.indexOf('SAKIT') !== -1 || catUpper.indexOf('DOKTER') !== -1 || catUpper.indexOf('KND') !== -1) {
    targetSheetFolder = 'DataKendala';
  } else if (catUpper === 'DATAINSIDEN' || catUpper === 'DATAEFISIENSI' || catUpper === 'DATATUGAS' || catUpper === 'DATAJADWAL' || catUpper === 'DATAKENDALA' || catUpper === 'DATAPERUBAHANJADWAL' || catUpper === 'DATALIBRARY') {
    targetSheetFolder = rawCat;
  }

  // 2. Deteksi apakah berkas ini Berkas Umum (Non-Wilayah)
  if (!rawArea || areaUpper === 'ALL' || areaUpper === 'UMUM' || areaUpper === 'PUSAT' || areaUpper === 'NASIONAL' || areaUpper === 'SEMUA' || areaUpper === 'LIBRARY' || areaUpper === 'MASTER') {
    isGeneralDoc = true;
  }

  // 3. Tentukan Parent Folder: "UMUM" (di luar area) vs "AREA-XX" (per wilayah)
  var targetAreaFolder = isGeneralDoc ? 'UMUM' : rawArea;

  // Standarisasi penamaan Area (misal "AREA 1" -> "AREA-01", "AREA-02 (Bandung)" -> "AREA-02")
  if (!isGeneralDoc) {
    var matchArea = targetAreaFolder.match(/AREA[-_ ]?0?(\d+)/i);
    if (matchArea) {
      var num = parseInt(matchArea[1], 10);
      targetAreaFolder = 'AREA-' + (num < 10 ? '0' + num : num);
    }
  }

  return {
    parentFolder: targetAreaFolder,
    sheetFolder: targetSheetFolder,
    subFolder: targetSubFolder,
    isGeneral: isGeneralDoc
  };
}

/**
 * Helper: Ambil atau Buat Subfolder dengan Hak Akses Publik View
 */
function getOrCreateDriveFolder(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (eShare) {}
  return folder;
}

/**
 * Helper: Pastikan Struktur 6 Subfolder Modul Resmi Terbentuk Rapi pada Suatu Wilayah (AREA-XX)
 */
function ensureAreaDriveStructure(rootFolder, areaId) {
  var areaFolder = getOrCreateDriveFolder(rootFolder, areaId);
  var sheetNames = ['DataInsiden', 'DataEfisiensi', 'DataTugas', 'DataJadwal', 'DataKendala', 'DataPerubahanJadwal'];
  for (var i = 0; i < sheetNames.length; i++) {
    getOrCreateDriveFolder(areaFolder, sheetNames[i]);
  }
  return areaFolder;
}

/**
 * API: Upload File Bukti / Dokumen ke Google Drive Terstruktur
 * Mengelompokkan berkas per Area dan per Modul Sheet:
 * - Wilayah: PANORAMA UPLOADS / [AREA-XX] / [DataSheet]
 * - Umum: PANORAMA UPLOADS / UMUM / DataLibrary (SOP) / [Kategori SOP]
 */
function apiUploadFileToDrive(base64Data, fileName, mimeType, areaName, category, subCategory) {
  try {
    if (!base64Data) {
      return { success: false, message: 'Data berkas kosong (base64Data diperlukan).' };
    }

    var rootName = 'PANORAMA UPLOADS';
    var rootFolders = DriveApp.getFoldersByName(rootName);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);
    try { rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eR) {}

    var targetInfo = normalizeDriveUploadTarget(areaName, category, subCategory);

    // 1. Dapatkan atau buat Parent Folder (misal "UMUM" atau "AREA-01" lengkap 6 subfolder)
    var parentFolder;
    if (targetInfo.parentFolder && targetInfo.parentFolder !== 'UMUM') {
      parentFolder = ensureAreaDriveStructure(rootFolder, targetInfo.parentFolder);
    } else {
      parentFolder = getOrCreateDriveFolder(rootFolder, 'UMUM');
    }

    // 2. Dapatkan atau buat Subfolder Sheet (misal "DataInsiden", "DataLibrary", dll)
    var targetFolder = getOrCreateDriveFolder(parentFolder, targetInfo.sheetFolder);

    // 2b. Khusus DataLibrary (SOP): Tempatkan ke dalam subfolder kategori SOP
    if (targetInfo.sheetFolder === 'DataLibrary' && targetInfo.subFolder) {
      targetFolder = getOrCreateDriveFolder(targetFolder, targetInfo.subFolder);
    }

    // 3. Simpan File ke Target Folder
    var cleanFileName = fileName || (targetInfo.sheetFolder + '_' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd_HHmmss') + '.jpg');
    var rawB64 = base64Data.indexOf(',') !== -1 ? base64Data.split(',')[1] : base64Data;
    var decoded = Utilities.base64Decode(rawB64);
    var blob = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', cleanFileName);
    var file = targetFolder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eF) {}

    var folderPathDesc = rootName + ' / ' + targetInfo.parentFolder + ' / ' + targetInfo.sheetFolder + (targetInfo.subFolder ? (' / ' + targetInfo.subFolder) : '');

    return {
      success: true,
      fileUrl: file.getUrl(),
      fileId: file.getId(),
      fileName: cleanFileName,
      folderPath: folderPathDesc,
      message: 'Berkas berhasil disimpan di ' + folderPathDesc
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal mengunggah file ke Google Drive: ' + err.message
    };
  }
}

/**
 * Utilitas Otomatis: Rapihkan & Susun Struktur Folder Google Drive PANORAMA
 * Memisahkan folder UMUM (DataLibrary & Dokumen Umum) di luar Area,
 * dan membuat subfolder tiap Area sesuai modul Sheet:
 * - DataInsiden
 * - DataEfisiensi
 * - DataTugas
 * - DataJadwal
 * - DataKendala
 * - DataPerubahanJadwal
 */
function organizePanoramaDriveFolders() {
  try {
    var rootName = 'PANORAMA UPLOADS';
    var rootFolders = DriveApp.getFoldersByName(rootName);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(rootName);
    try { rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eR) {}

    var foldersCreated = 0;
    var filesMoved = 0;

    // 1. Setup Folder UMUM (di luar area)
    var umumFolder = getOrCreateDriveFolder(rootFolder, 'UMUM');
    var libraryFolder = getOrCreateDriveFolder(umumFolder, 'DataLibrary');
    var dokumenUmumFolder = getOrCreateDriveFolder(umumFolder, 'Dokumen Umum');

    // 1b. Siapkan 6 Subfolder Kategori Standar di dalam DataLibrary (SOP)
    var sopCatFolders = {};
    var standardSopCategories = [
      'Operasional Gerai',
      'Produk & Resep',
      'Sanitasi & Food Safety',
      'Kasir & Pelayanan',
      'HR & Disiplin',
      'Darurat & K3'
    ];
    for (var scIdx = 0; scIdx < standardSopCategories.length; scIdx++) {
      var catName = standardSopCategories[scIdx];
      sopCatFolders[catName] = getOrCreateDriveFolder(libraryFolder, catName);
    }

    // 1c. Kumpulkan pemetaan URL file SOP ke kategori dari sheet DataLibrary
    var fileUrlToCategoryMap = {};
    try {
      var sLib = getSheet(TAB.LIBRARY);
      if (sLib) {
        var dLib = sLib.getDataRange().getValues();
        for (var lRow = 1; lRow < dLib.length; lRow++) {
          var fUrl = String(dLib[lRow][COL_LIBRARY.FILE_URL] || '').trim();
          var fCat = String(dLib[lRow][COL_LIBRARY.KATEGORI] || '').trim();
          if (fUrl && fCat) {
            fileUrlToCategoryMap[fUrl] = formatSopCategoryFolderName(fCat);
          }
        }
      }
    } catch (eLib) {}

    // 1d. Pindahkan berkas lepas yang ada langsung di bawah DataLibrary ke subfolder kategorinya
    try {
      var looseLibFiles = libraryFolder.getFiles();
      while (looseLibFiles.hasNext()) {
        var lFile = looseLibFiles.next();
        var lfUrl = lFile.getUrl();
        var lfName = lFile.getName().toUpperCase();
        var matchedCat = fileUrlToCategoryMap[lfUrl] || null;

        if (!matchedCat) {
          if (lfName.indexOf('PRODUK') !== -1 || lfName.indexOf('RESEP') !== -1) matchedCat = 'Produk & Resep';
          else if (lfName.indexOf('SAFETY') !== -1 || lfName.indexOf('SANITASI') !== -1) matchedCat = 'Sanitasi & Food Safety';
          else if (lfName.indexOf('HR') !== -1 || lfName.indexOf('DISIPLIN') !== -1) matchedCat = 'HR & Disiplin';
          else if (lfName.indexOf('KASIR') !== -1 || lfName.indexOf('FINANCE') !== -1) matchedCat = 'Kasir & Pelayanan';
          else if (lfName.indexOf('K3') !== -1 || lfName.indexOf('DARURAT') !== -1) matchedCat = 'Darurat & K3';
          else matchedCat = 'Operasional Gerai';
        }

        var targetCatFolder = sopCatFolders[matchedCat] || getOrCreateDriveFolder(libraryFolder, matchedCat);
        lFile.moveTo(targetCatFolder);
        filesMoved++;
      }
    } catch (eLooseLib) {}

    // 2. Kumpulkan seluruh Area ID terdaftar dari MasterCabang & MasterUser
    var registeredAreas = [];
    try {
      var sCbg = getSheet(TAB.CABANG);
      if (sCbg) {
        var dCbg = sCbg.getDataRange().getValues();
        for (var i = 1; i < dCbg.length; i++) {
          var a = String(dCbg[i][COL_CABANG.AREA_ID] || '').trim().toUpperCase();
          if (a && a !== 'ALL' && a !== 'UMUM' && a !== 'PUSAT' && registeredAreas.indexOf(a) === -1) {
            registeredAreas.push(a);
          }
        }
      }
    } catch (eCbg) {}

    try {
      var sUsr = getSheet(TAB.USER);
      if (sUsr) {
        var dUsr = sUsr.getDataRange().getValues();
        for (var u = 1; u < dUsr.length; u++) {
          var au = String(dUsr[u][COL_USER.AREA_ID] || '').trim().toUpperCase();
          if (au && au !== 'ALL' && au !== 'UMUM' && au !== 'PUSAT' && registeredAreas.indexOf(au) === -1) {
            registeredAreas.push(au);
          }
        }
      }
    } catch (eUsr) {}

    if (registeredAreas.length === 0) {
      registeredAreas = ['AREA-01', 'AREA-02', 'AREA-03', 'AREA-04', 'AREA-05'];
    }
    registeredAreas.sort();

    // 3. Buat folder per wilayah & modul sheet di dalamnya
    var areaFolderMap = {};
    var sheetNamesPerArea = ['DataInsiden', 'DataEfisiensi', 'DataTugas', 'DataJadwal', 'DataKendala', 'DataPerubahanJadwal'];

    for (var aIdx = 0; aIdx < registeredAreas.length; aIdx++) {
      var areaId = registeredAreas[aIdx];
      var aFolder = getOrCreateDriveFolder(rootFolder, areaId);
      areaFolderMap[areaId] = { root: aFolder, sheets: {} };

      for (var sIdx = 0; sIdx < sheetNamesPerArea.length; sIdx++) {
        var shName = sheetNamesPerArea[sIdx];
        var shFolder = getOrCreateDriveFolder(aFolder, shName);
        areaFolderMap[areaId].sheets[shName] = shFolder;
      }
    }

    // 4. Migrasi File & Folder Lama / Lepas (Legacy Migration)
    var subFolders = rootFolder.getFolders();
    while (subFolders.hasNext()) {
      var subF = subFolders.next();
      var subName = subF.getName();

      // Cek folder 'Umum' (lowercase) lama -> pindahkan isinya ke 'UMUM'
      if (subName.toLowerCase() === 'umum' && subName !== 'UMUM') {
        var oldFiles = subF.getFiles();
        while (oldFiles.hasNext()) {
          var oFile = oldFiles.next();
          var oName = oFile.getName().toUpperCase();
          var dest = (oName.indexOf('SOP') !== -1 || oName.indexOf('LIBRARY') !== -1) ? libraryFolder : dokumenUmumFolder;
          oFile.moveTo(dest);
          filesMoved++;
        }
        try { subF.setTrashed(true); } catch (eTrSub) {}
      }

      // Cek subfolder lama di dalam tiap Area (misal 'Bukti_Penanganan' -> 'DataInsiden')
      var matchArea = subName.match(/AREA[-_ ]?0?(\d+)/i);
      if (matchArea && areaFolderMap[subName]) {
        var targetAreaMeta = areaFolderMap[subName];
        var innerSubFolders = subF.getFolders();
        while (innerSubFolders.hasNext()) {
          var inF = innerSubFolders.next();
          var inName = inF.getName();
          var targetSheet = null;
          var inUpper = inName.toUpperCase();
          if (inUpper.indexOf('INSIDEN') !== -1 || inUpper.indexOf('BUKTI_PENANGANAN') !== -1 || inUpper.indexOf('BUKTI PENANGANAN') !== -1) {
            targetSheet = 'DataInsiden';
          } else if (inUpper.indexOf('EFISIENSI') !== -1 || inUpper.indexOf('NOTA') !== -1 || inUpper.indexOf('PETTY') !== -1) {
            targetSheet = 'DataEfisiensi';
          } else if (inUpper.indexOf('TUGAS') !== -1) {
            targetSheet = 'DataTugas';
          } else if (inUpper.indexOf('JADWAL') !== -1 || inUpper.indexOf('ROSTER') !== -1) {
            targetSheet = 'DataJadwal';
          } else if (inUpper.indexOf('KENDALA') !== -1 || inUpper.indexOf('SAKIT') !== -1) {
            targetSheet = 'DataKendala';
          } else if (inUpper.indexOf('PERUBAHAN') !== -1 || inUpper.indexOf('TUKAR') !== -1) {
            targetSheet = 'DataPerubahanJadwal';
          }

          if (targetSheet && inName !== targetSheet && targetAreaMeta.sheets[targetSheet]) {
            var destFolder = targetAreaMeta.sheets[targetSheet];
            var fToMove = inF.getFiles();
            while (fToMove.hasNext()) {
              var mf = fToMove.next();
              mf.moveTo(destFolder);
              filesMoved++;
            }
            try { inF.setTrashed(true); } catch (eTrF) {}
          }
        }

        // Cek file lepas langsung di dalam folder Area
        var looseAreaFiles = subF.getFiles();
        while (looseAreaFiles.hasNext()) {
          var lf = looseAreaFiles.next();
          var lfName = lf.getName().toUpperCase();
          var targetSh = 'DataInsiden';
          if (lfName.indexOf('SCH') !== -1 || lfName.indexOf('JADWAL') !== -1) targetSh = 'DataJadwal';
          else if (lfName.indexOf('KND') !== -1 || lfName.indexOf('SAKIT') !== -1 || lfName.indexOf('DOKTER') !== -1) targetSh = 'DataKendala';
          else if (lfName.indexOf('CHG') !== -1 || lfName.indexOf('TUKAR') !== -1) targetSh = 'DataPerubahanJadwal';
          else if (lfName.indexOf('TSK') !== -1 || lfName.indexOf('TUGAS') !== -1) targetSh = 'DataTugas';
          else if (lfName.indexOf('EFF') !== -1 || lfName.indexOf('NOTA') !== -1) targetSh = 'DataEfisiensi';

          if (targetAreaMeta.sheets[targetSh]) {
            lf.moveTo(targetAreaMeta.sheets[targetSh]);
            filesMoved++;
          }
        }
      }
    }

    // 5. Cek file lepas langsung di dalam rootFolder (PANORAMA UPLOADS)
    var rootLooseFiles = rootFolder.getFiles();
    while (rootLooseFiles.hasNext()) {
      var rlf = rootLooseFiles.next();
      var rlfName = rlf.getName().toUpperCase();
      if (rlfName.indexOf('SOP') !== -1 || rlfName.indexOf('LIBRARY') !== -1) {
        rlf.moveTo(libraryFolder);
        filesMoved++;
      } else {
        var fAreaMatch = rlfName.match(/AREA[-_ ]?0?(\d+)/i);
        if (fAreaMatch) {
          var fAreaId = 'AREA-' + (parseInt(fAreaMatch[1], 10) < 10 ? '0' + parseInt(fAreaMatch[1], 10) : parseInt(fAreaMatch[1], 10));
          if (areaFolderMap[fAreaId]) {
            var destSh = 'DataInsiden';
            if (rlfName.indexOf('SCH') !== -1 || rlfName.indexOf('JADWAL') !== -1) destSh = 'DataJadwal';
            else if (rlfName.indexOf('KND') !== -1 || rlfName.indexOf('SAKIT') !== -1) destSh = 'DataKendala';
            else if (rlfName.indexOf('CHG') !== -1) destSh = 'DataPerubahanJadwal';
            else if (rlfName.indexOf('TSK') !== -1) destSh = 'DataTugas';
            else if (rlfName.indexOf('EFF') !== -1) destSh = 'DataEfisiensi';

            rlf.moveTo(areaFolderMap[fAreaId].sheets[destSh]);
            filesMoved++;
            continue;
          }
        }
        rlf.moveTo(dokumenUmumFolder);
        filesMoved++;
      }
    }

    var summaryMsg = 'Struktur folder Google Drive berhasil dirapihkan!\n' +
      '• Folder SOP Library: UMUM / DataLibrary (dikelompokkan rapi per kategori: Operasional Gerai, Produk & Resep, Sanitasi, Kasir, HR, K3) & UMUM / Dokumen Umum\n' +
      '• Folder Wilayah: ' + registeredAreas.join(', ') + ' (masing-masing memiliki 6 subfolder sheet modul)\n' +
      '• File dipindahkan/dirapihkan: ' + filesMoved;

    return {
      success: true,
      message: summaryMsg,
      rootFolderId: rootFolder.getId(),
      rootFolderUrl: rootFolder.getUrl(),
      areasProcessed: registeredAreas,
      filesMoved: filesMoved
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal merapihkan folder Google Drive: ' + err.message
    };
  }
}
