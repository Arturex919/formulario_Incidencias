/**
 * Google Apps Script — Formulario Incidencias (V12)
 *
 * CAMBIOS V12:
 * - findQuarterFolder: PRIORIDAD al año actual. Si no existe, NO coge la más reciente (evita 2025).
 * - saveInvoiceToDrive: guarda en Trimestre > Mes. Nunca en raíz.
 * - createMonthFolders: crea subcarpetas de meses dentro de cada trimestre.
 * - REF siempre String padStart(3). Sin notación científica.
 * - Importes: Math.abs() para evitar negativos.
 * - Admin panel: solo scanStructure + createYearStructure (sin listado de facturas).
 */

const SPREADSHEET_ID       = "1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE";
const SHEET_NAME           = "INCIDENCIA 2026";
const DRIVE_ROOT_FOLDER_ID = "16FuhBMu4n-Pv8feGdtWQxyVjGtXzna-J";
const TARGET_YEAR          = new Date().getFullYear().toString(); // "2026"

// ── Trimestres ────────────────────────────────────────────────────────────────
const QUARTER_CONFIG = {
  Q1: { label: "PERIODO ENERO-FEBRERO-MARZO",         keywords: ["ENERO-FEBRERO","ENERO-FEB","ENE-FEB","ENERO"],       months: [1, 2, 3],   monthNames: ["ENERO","FEBRERO","MARZO"]       },
  Q2: { label: "PERIODO ABRIL-MAYO-JUNIO",            keywords: ["ABRIL-MAYO-JUNIO","ABRIL-MAYO","ABR-MAY","ABRIL"],   months: [4, 5, 6],   monthNames: ["ABRIL","MAYO","JUNIO"]          },
  Q3: { label: "PERIODO JULIO-AGOSTO-SEPTIEMBRE",     keywords: ["JULIO-AGOSTO","JULIO-AGO","JUL-AGO","JULIO"],        months: [7, 8, 9],   monthNames: ["JULIO","AGOSTO","SEPTIEMBRE"]   },
  Q4: { label: "PERIODO OCTUBRE-NOVIEMBRE-DICIEMBRE", keywords: ["OCTUBRE-NOVIEMBRE","OCTUBRE-NOV","OCT-NOV","OCTUBRE"],months: [10,11,12],  monthNames: ["OCTUBRE","NOVIEMBRE","DICIEMBRE"] }
};

const MONTH_NAMES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ── Paleta de colores Drive ───────────────────────────────────────────────────
const COLOR_PALETTE = [
  { id: "RED",    label: "Rojo",       hex: "#E52592" },
  { id: "ORANGE", label: "Naranja",    hex: "#E65100" },
  { id: "YELLOW", label: "Amarillo",   hex: "#F9AB00" },
  { id: "GREEN",  label: "Verde",      hex: "#0F9D58" },
  { id: "TEAL",   label: "Verde Azul", hex: "#00897B" },
  { id: "BLUE",   label: "Azul",       hex: "#1A73E8" },
  { id: "PURPLE", label: "Morado",     hex: "#8430CE" },
  { id: "PINK",   label: "Rosa",       hex: "#FF63B8" },
  { id: "GRAY",   label: "Gris",       hex: "#9AA0A6" }
];

// ── Helpers básicos ───────────────────────────────────────────────────────────
function getTargetSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheets().find(s => s.getName().trim().toUpperCase() === SHEET_NAME.toUpperCase());
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getFolderColorById(folderId) {
  try {
    if (typeof Drive !== 'undefined' && Drive.Files) {
      const meta = Drive.Files.get(folderId, { fields: "folderColorRgb" });
      if (meta && meta.folderColorRgb) return meta.folderColorRgb.toUpperCase();
    }
  } catch (_) {}
  return "";
}

function matchColorToPalette(hexColor) {
  if (!hexColor) return { id: "GRAY", label: "Sin color", hex: "#9AA0A6" };
  const norm = hexColor.toUpperCase().trim();
  return COLOR_PALETTE.find(c => c.hex.toUpperCase() === norm) || { id: "GRAY", label: "Sin color", hex: "#9AA0A6" };
}

function getOrCreate(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ── CLAVE: buscar carpeta trimestral FILTRANDO por año ───────────────────────
// Regla:
//   1. Si el nombre de la carpeta contiene el año buscado (ej "2026") → COINCIDENCIA EXACTA → devuelve inmediatamente.
//   2. Si no hay ninguna con ese año → devuelve null (NO coge la 2025 ni cualquier otra).
//   3. Si el año no se especifica → coge la más reciente.
function findQuarterFolder(quarterKey, yearHint) {
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const cfg     = QUARTER_CONFIG[quarterKey];
  const targetYearStr = yearHint || TARGET_YEAR; // "2026" por defecto

  let genericFolder = null; // Carpeta sin año en el nombre (legado)

  while (folders.hasNext()) {
    const folder = folders.next();
    const name   = folder.getName().toUpperCase();

    // Verificar que es del trimestre correcto
    if (!cfg.keywords.some(k => name.includes(k))) continue;

    // ¿Tiene el año correcto en el nombre?
    if (name.includes(targetYearStr)) {
      return folder; // ✅ Coincidencia exacta → devolver ya
    }

    // Guardar carpeta genérica (sin año) como último recurso
    const hasAnyYear = /\d{4}/.test(name);
    if (!hasAnyYear) {
      genericFolder = folder;
    }
    // Si tiene otro año (ej 2025) → IGNORAR COMPLETAMENTE
  }

  // Si hay carpeta genérica sin año → usarla
  // Si todas tienen otros años → null (no mezclar con 2025)
  return genericFolder;
}

// ── Subcarpeta del MES dentro del trimestre ──────────────────────────────────
function getMonthSubFolder(quarterFolder, monthName) {
  const upper = monthName.toUpperCase();
  const it1 = quarterFolder.getFoldersByName(upper);
  if (it1.hasNext()) return it1.next();
  const it2 = quarterFolder.getFoldersByName(monthName);
  if (it2.hasNext()) return it2.next();
  // No existe → crear
  return quarterFolder.createFolder(upper);
}

// ── doGet ─────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === "scanStructure")  return jsonResponse(scanDriveStructure(e.parameter.year));
    if (action === "getMonthFiles")  return jsonResponse({ files: getMonthFiles(e.parameter.month, e.parameter.year) });
    if (action === "getNextRef")     return jsonResponse({ nextRef: String(getNextInvoiceRef(e.parameter.month, e.parameter.year)).padStart(3,'0') });
    if (action === "getAllRefs")     return jsonResponse({ refs: getAllInvoiceRefs(e.parameter.month, e.parameter.year) });
    if (action === "ensureMonths")   return jsonResponse(ensureMonthFolders(e.parameter.year));

    const sheet = getTargetSheet();
    if (!sheet) return jsonResponse({ error: "Hoja no encontrada" });

    if (action === "read") {
      const data    = sheet.getDataRange().getValues();
      const headers = data[0];
      const jsonData = data.slice(1)
        .map((row, i) => {
          if (row[0] === "" || row[0] === "#N/A") return null;
          const obj = { rowIndex: i + 2 };
          headers.forEach((h, c) => {
            let val = row[c];
            // Evitar notación científica: forzar string si es número muy largo
            if (typeof val === 'number' && Math.abs(val) > 1e10) val = String(val);
            // Evitar importes negativos
            if (typeof val === 'number' && h.toString().toUpperCase().includes('COSTO')) val = Math.abs(val);
            obj[h] = val;
          });
          return obj;
        })
        .filter(Boolean);
      return jsonResponse(jsonData);
    }

    return jsonResponse({ status: "ok", sheet: sheet.getName() });

  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ── doPost ────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === "uploadInvoice") {
      return jsonResponse(saveInvoiceToDrive(data.fileBase64, data.fileName, data.refNumber || null, data.month || null, data.year || null));
    }

    if (data.action === "createYearStructure") {
      return jsonResponse(createQuarterlyStructure(data.year, data.colorAssignments));
    }

    // Guardar fila en Sheet
    const sheet = getTargetSheet();
    if (!sheet) throw new Error("No se encuentra la hoja '" + SHEET_NAME + "'");

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow  = new Array(headers.length).fill("");

    Object.keys(data).forEach(key => {
      const col = headers.findIndex(h => h.toString().toUpperCase().trim() === key.toUpperCase().trim());
      if (col !== -1) newRow[col] = data[key];
    });

    let targetRow;
    if (data.rowIndex && !isNaN(data.rowIndex)) {
      targetRow = parseInt(data.rowIndex);
    } else {
      const colA = sheet.getRange("A:A").getValues();
      let r = 1;
      while (colA[r] && colA[r][0] !== "" && colA[r][0] !== "#N/A") r++;
      targetRow = r + 1;
    }

    sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
    return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput("ERROR: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}

// ── ESCANEO DE ESTRUCTURA DRIVE ───────────────────────────────────────────────
function scanDriveStructure(year) {
  const yearStr = year || TARGET_YEAR;
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const structure = { Q1: [], Q2: [], Q3: [], Q4: [] };

  while (folders.hasNext()) {
    const folder = folders.next();
    const name   = folder.getName().toUpperCase();

    let quarter = null;
    for (const [q, cfg] of Object.entries(QUARTER_CONFIG)) {
      if (cfg.keywords.some(k => name.includes(k))) { quarter = q; break; }
    }
    if (!quarter) continue;

    const colorHex  = getFolderColorById(folder.getId());
    const colorInfo = matchColorToPalette(colorHex);
    const hasYearInName = name.includes(yearStr);
    const hasAnyYear    = /\d{4}/.test(name);

    structure[quarter].push({
      id:          folder.getId(),
      name:        folder.getName(),
      color:       colorInfo.id,
      colorHex:    colorInfo.hex,
      colorLabel:  colorInfo.label,
      matchesYear: hasYearInName,
      isGeneric:   !hasAnyYear
    });
  }

  const allColorIds = COLOR_PALETTE.map(c => c.id);
  const availability = {};
  for (const q of ["Q1","Q2","Q3","Q4"]) {
    const yearFolders = structure[q].filter(f => f.matchesYear || f.isGeneric);
    const used = yearFolders.map(f => f.color).filter(c => c !== "GRAY");
    availability[q] = {
      used,
      available: allColorIds.filter(c => c !== "GRAY" && !used.includes(c)),
      folders: yearFolders
    };
  }

  return { year: yearStr, structure, availability, colorPalette: COLOR_PALETTE };
}

// ── LISTAR ARCHIVOS DEL MES (solo año correcto) ───────────────────────────────
function getMonthFiles(month, year) {
  const monthNum = MONTH_NAMES_ES.indexOf(month) + 1;
  if (monthNum === 0) return [];

  let quarterKey = "Q4";
  for (const [q, cfg] of Object.entries(QUARTER_CONFIG)) {
    if (cfg.months.includes(monthNum)) { quarterKey = q; break; }
  }

  const quarterFolder = findQuarterFolder(quarterKey, year || TARGET_YEAR);
  if (!quarterFolder) return [];

  // Buscar subcarpeta del mes
  const monthUpper = month.toUpperCase();
  const subIt      = quarterFolder.getFoldersByName(monthUpper);
  const fileSource = subIt.hasNext() ? subIt.next() : quarterFolder;

  const colorHex  = getFolderColorById(quarterFolder.getId());
  const colorInfo = matchColorToPalette(colorHex);
  const results   = [];
  const files     = fileSource.getFiles();

  while (files.hasNext()) {
    const file     = files.next();
    const fileName = file.getName();
    const nameNoExt = fileName.replace(/\.[^.]+$/, '');

    // REF: número corto (1-4 dígitos) al final del nombre
    const refMatch  = nameNoExt.match(/[\s\-_](\d{1,4})$/);
    const ref       = refMatch ? String(refMatch[1]).padStart(3,'0') : "---";
    const clientName = refMatch
      ? nameNoExt.replace(/[\s\-_]\d{1,4}$/, '').trim()
      : nameNoExt.trim();

    results.push({
      ref:        String(ref),
      fullName:   fileName,
      clientName,
      fileId:     file.getId(),
      fileUrl:    file.getUrl(),
      folderName: quarterFolder.getName(),
      colorLabel: colorInfo.label,
      colorHex:   colorInfo.hex
    });
  }

  return results.sort((a, b) => {
    if (a.ref === "---" && b.ref === "---") return 0;
    if (a.ref === "---") return 1;
    if (b.ref === "---") return -1;
    return parseInt(a.ref,10) - parseInt(b.ref,10);
  });
}

// ── GUARDAR FACTURA → Trimestre > Mes ────────────────────────────────────────
function saveInvoiceToDrive(base64Data, originalFileName, refNumber, month, year) {
  const tm = month || MONTH_NAMES_ES[new Date().getMonth()];
  const ty = year  || TARGET_YEAR;

  const monthNum = MONTH_NAMES_ES.indexOf(tm) + 1;
  let quarterKey = "Q4";
  for (const [q, cfg] of Object.entries(QUARTER_CONFIG)) {
    if (cfg.months.includes(monthNum)) { quarterKey = q; break; }
  }

  const quarterFolder = findQuarterFolder(quarterKey, ty);
  if (!quarterFolder) {
    return { success: false, error: "No se encontró carpeta trimestral para " + tm + " " + ty + ". Crea la estructura en el panel de Administración." };
  }

  // Subcarpeta del mes (crear si no existe)
  const targetFolder = getMonthSubFolder(quarterFolder, tm);

  // REF como String corto
  const nextNum   = getNextInvoiceRef(tm, ty);
  const paddedRef = refNumber
    ? String(refNumber).padStart(3,'0')
    : String(nextNum).padStart(3,'0');

  const extMatch    = originalFileName.match(/\.([^.]+)$/);
  const ext         = extMatch ? extMatch[1] : 'pdf';
  const baseName    = originalFileName.replace(/\.[^.]+$/, '').trim();
  const newFileName = baseName + ' ' + paddedRef + '.' + ext;

  const extLow = ext.toLowerCase();
  let mimeType = 'application/octet-stream';
  if (extLow === 'pdf')  mimeType = 'application/pdf';
  if (extLow === 'jpg' || extLow === 'jpeg') mimeType = 'image/jpeg';
  if (extLow === 'png')  mimeType = 'image/png';

  const content = base64Data.split(",")[1] || base64Data;
  const blob    = Utilities.newBlob(Utilities.base64Decode(content), mimeType, newFileName);
  const file    = targetFolder.createFile(blob);

  return {
    success:    true,
    ref:        paddedRef,
    fileUrl:    file.getUrl(),
    fileName:   newFileName,
    folderId:   targetFolder.getId(),
    folderPath: quarterFolder.getName() + " / " + targetFolder.getName()
  };
}

// ── SIGUIENTE REFERENCIA ──────────────────────────────────────────────────────
function getNextInvoiceRef(month, year) {
  const files = getMonthFiles(month, year);
  let max = 0;
  files.forEach(f => {
    if (f.ref && f.ref !== "---" && /^\d{1,4}$/.test(f.ref)) {
      const num = parseInt(f.ref, 10);
      if (num > max) max = num;
    }
  });
  return max + 1;
}

function getAllInvoiceRefs(month, year) {
  return getMonthFiles(month, year);
}

// ── CREAR ESTRUCTURA TRIMESTRAL (con colores) ─────────────────────────────────
function createQuarterlyStructure(year, colorAssignments) {
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const created = [];

  for (const [quarter, colorId] of Object.entries(colorAssignments)) {
    const cfg = QUARTER_CONFIG[quarter];
    if (!cfg) continue;
    const folderName = cfg.label + " " + year;
    const existing   = root.getFoldersByName(folderName);

    if (existing.hasNext()) {
      const existId = existing.next().getId();
      // Asegurarse de que existen subcarpetas de meses
      const qFolder = DriveApp.getFolderById(existId);
      cfg.monthNames.forEach(m => getOrCreate(qFolder, m));
      created.push({ quarter, folderName, status: "ya existia", id: existId });
      continue;
    }

    const newFolder = root.createFolder(folderName);
    // Crear subcarpetas de meses automáticamente
    cfg.monthNames.forEach(m => newFolder.createFolder(m));

    // Asignar color vía Drive API v2 si está disponible
    try {
      if (typeof Drive !== 'undefined' && Drive.Files) {
        const hex = COLOR_PALETTE.find(c => c.id === colorId)?.hex || "#9AA0A6";
        Drive.Files.patch({ folderColorRgb: hex }, newFolder.getId());
      }
    } catch (_) {}

    created.push({ quarter, folderName, colorId, status: "creada con meses", id: newFolder.getId() });
  }

  return { success: true, year, created };
}

// ── ENSURE MONTH FOLDERS (para trimestres existentes) ────────────────────────
// Crea las subcarpetas de mes en todos los trimestres del año indicado.
function ensureMonthFolders(year) {
  const ty      = year || TARGET_YEAR;
  const results = [];

  for (const [qKey, cfg] of Object.entries(QUARTER_CONFIG)) {
    const qFolder = findQuarterFolder(qKey, ty);
    if (!qFolder) {
      results.push({ quarter: qKey, status: "no encontrada" });
      continue;
    }
    const created = [];
    cfg.monthNames.forEach(m => {
      const folder = getOrCreate(qFolder, m);
      created.push({ month: m, id: folder.getId() });
    });
    results.push({ quarter: qKey, folderName: qFolder.getName(), status: "ok", months: created });
  }

  return { success: true, year: ty, results };
}
