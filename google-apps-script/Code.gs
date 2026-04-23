/**
 * Google Apps Script — Formulario Incidencias 2026 (VERSIÓN V10 - DRIVE COLORES + TRIMESTRES)
 */

const SPREADSHEET_ID      = "1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE";
const SHEET_NAME          = "INCIDENCIA 2026";
const INVOICES_ROOT_NAME  = "FACTURAS_INCIDENCIAS";
const DRIVE_ROOT_FOLDER_ID = "16FuhBMu4n-Pv8feGdtWQxyVjGtXzna-J";

// Mapa de trimestres → keywords de nombre de carpeta + meses
const QUARTER_CONFIG = {
  Q1: { label: "PERIODO ENERO-FEBRERO-MARZO",         keywords: ["ENERO","ENERO-FEB","ENE-FEB"],    months: [1, 2, 3]   },
  Q2: { label: "PERIODO ABRIL-MAYO-JUNIO",            keywords: ["ABRIL","ABRIL-MAYO","ABR-MAY"],   months: [4, 5, 6]   },
  Q3: { label: "PERIODO JULIO-AGOSTO-SEPTIEMBRE",     keywords: ["JULIO","JULIO-AGO","JUL-AGO"],    months: [7, 8, 9]   },
  Q4: { label: "PERIODO OCTUBRE-NOVIEMBRE-DICIEMBRE", keywords: ["OCTUBRE","OCT-NOV","OCTUBRE-NOV"],months: [10, 11, 12] }
};

// Paleta de colores disponibles en DriveApp.Color
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

function getTargetSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheets().find(s => s.getName().trim().toUpperCase() === SHEET_NAME.toUpperCase());
}

// Helper: obtiene el color de una carpeta de forma segura (getColor puede no estar disponible)
function getFolderColor(folder) {
  try {
    return (typeof folder.getColor === 'function') ? (folder.getColor() || "") : "";
  } catch (_) { return ""; }
}

// Helper: hace match del hex del color con la paleta
function getColorInfo(folder) {
  const raw = getFolderColor(folder);
  const match = COLOR_PALETTE.find(c => c.hex.toUpperCase() === raw.toUpperCase());
  return match ? { id: match.id, label: match.label, hex: match.hex } : { id: "GRAY", label: "Sin color", hex: "#9AA0A6" };
}

// ── Helper para respuestas JSON ────────────────────────────────────────────────
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doGet ──────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === "scanStructure") {
      return jsonResponse(scanDriveStructure(e.parameter.year));
    }

    if (action === "getMonthFiles") {
      return jsonResponse({ files: getMonthFiles(e.parameter.month, e.parameter.year) });
    }

    if (action === "getNextRef") {
      const nextRef = getNextInvoiceRef(e.parameter.month, e.parameter.year);
      return jsonResponse({ nextRef: nextRef.toString().padStart(3, '0') });
    }

    if (action === "getAllRefs") {
      return jsonResponse({ refs: getAllInvoiceRefs(e.parameter.month, e.parameter.year) });
    }

    const sheet = getTargetSheet();
    if (!sheet) return jsonResponse({ error: "Hoja no encontrada" });

    if (action === "read") {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const jsonData = data.slice(1)
        .map((row, i) => {
          if (row[0] === "" || row[0] === "#N/A") return null;
          const obj = { rowIndex: i + 2 };
          headers.forEach((h, c) => { obj[h] = row[c]; });
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

// ── doPost ─────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === "uploadInvoice") {
      return jsonResponse(saveInvoiceToDrive(
        data.fileBase64,
        data.fileName,
        data.refNumber || null,
        data.month     || null,
        data.year      || null
      ));
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

// ── DRIVE: COLORES Y TRIMESTRES ────────────────────────────────────────────────

function scanDriveStructure(year) {
  const yearStr = year || new Date().getFullYear().toString();
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const structure = { Q1: [], Q2: [], Q3: [], Q4: [] };

  while (folders.hasNext()) {
    const folder = folders.next();
    const name   = folder.getName().toUpperCase();
    const ci     = getColorInfo(folder);

    // Las carpetas NO llevan año en el nombre — buscamos solo por keywords de trimestre
    let quarter = null;
    for (const [q, cfg] of Object.entries(QUARTER_CONFIG)) {
      if (cfg.keywords.some(k => name.includes(k))) { quarter = q; break; }
    }
    if (!quarter) continue;

    structure[quarter].push({
      id: folder.getId(),
      name: folder.getName(),
      color: ci.id,
      colorHex: ci.hex,
      matchesYear: true
    });
  }

  // Calcular disponibilidad de colores por trimestre
  const allColorIds = COLOR_PALETTE.map(c => c.id);
  const availability = {};
  for (const q of ["Q1","Q2","Q3","Q4"]) {
    const used = structure[q].map(f => f.color);
    availability[q] = {
      used: used,
      available: allColorIds.filter(c => !used.includes(c))
    };
  }

  return { year: yearStr, structure, availability, colorPalette: COLOR_PALETTE };
}

function getMonthFiles(month, year) {
  const MONTHS   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const monthNum = MONTHS.indexOf(month) + 1;
  if (monthNum === 0) return [];

  let quarterKey = "Q4";
  for (const [q, cfg] of Object.entries(QUARTER_CONFIG)) {
    if (cfg.months.includes(monthNum)) { quarterKey = q; break; }
  }

  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const results = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    const name   = folder.getName().toUpperCase();
    const cfg    = QUARTER_CONFIG[quarterKey];

    // Buscar por keywords del trimestre SIN requerir el año en el nombre
    if (!cfg.keywords.some(k => name.includes(k))) continue;

    const colorInfo = getColorInfo(folder);

    // Buscar subcarpeta del mes (ej: carpeta "ABRIL" dentro de "ABRIL-MAYO-JUNIO")
    const monthUpper = month.toUpperCase();
    const subFolders = folder.getFoldersByName(monthUpper);
    const fileSources = [];

    if (subFolders.hasNext()) {
      // Si existe subcarpeta del mes, listar archivos de ahí
      fileSources.push(subFolders.next());
    } else {
      // Si no hay subcarpeta, listar archivos directamente en la carpeta trimestral
      fileSources.push(folder);
    }

    fileSources.forEach(src => {
      const files = src.getFiles();
      while (files.hasNext()) {
        const file     = files.next();
        const fileName = file.getName();
        // El número de referencia es la secuencia de dígitos al FINAL del nombre (antes de la extensión)
        const refMatch = fileName.replace(/\.[^.]+$/, '').match(/(\d+)$/);
        const ref      = refMatch ? refMatch[1].padStart(3, '0') : "---";
        const clientName = fileName.replace(/\.[^.]+$/, '').replace(/(\s*\d+)$/, '').trim();

        results.push({
          ref,
          fullName: fileName,
          clientName,
          fileId:     file.getId(),
          fileUrl:    file.getUrl(),
          folderName: folder.getName(),
          colorLabel: colorInfo.label,
          colorHex:   colorInfo.hex
        });
      }
    });
  }

  return results.sort((a, b) => parseInt(a.ref) - parseInt(b.ref));
}

function createQuarterlyStructure(year, colorAssignments) {
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const created = [];

  for (const [quarter, colorId] of Object.entries(colorAssignments)) {
    const cfg = QUARTER_CONFIG[quarter];
    if (!cfg) continue;
    const folderName = cfg.label + " " + year;
    const existing   = root.getFoldersByName(folderName);

    if (existing.hasNext()) {
      created.push({ quarter, folderName, status: "ya existia", id: existing.next().getId() });
      continue;
    }

    const newFolder  = root.createFolder(folderName);
    try {
      const driveColor = DriveApp.Color[colorId.toUpperCase()];
      if (driveColor) newFolder.setColor(driveColor);
    } catch (_) { /* color no soportado, se ignora */ }

    created.push({ quarter, folderName, colorId, status: "creada", id: newFolder.getId() });
  }

  return { success: true, year, created };
}

// ── DRIVE: GUARDAR FACTURA EN CARPETA TRIMESTRAL EXISTENTE ───────────────────

/**
 * Busca la carpeta trimestral correcta en DRIVE_ROOT_FOLDER_ID y guarda el archivo ahí.
 * El nombre final del archivo será: [nombreOriginalSinExtension] [ref].[extension]
 * data.refNumber: referencia ya calculada desde el frontend (ej: "009")
 * data.fileName:  nombre original del archivo (ej: "gestoria alviana.pdf")
 */
function saveInvoiceToDrive(base64Data, originalFileName, refNumber, month, year) {
  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const now    = new Date();
  const tm     = month || MONTHS[now.getMonth()];

  // Calcular el trimestre para el mes actual
  const monthNum = MONTHS.indexOf(tm) + 1;
  let quarterKey = "Q4";
  for (const [q, cfg] of Object.entries(QUARTER_CONFIG)) {
    if (cfg.months.includes(monthNum)) { quarterKey = q; break; }
  }

  // Buscar la carpeta trimestral en Drive (sin filtro por año)
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const folders = root.getFolders();
  let targetFolder = null;

  while (folders.hasNext()) {
    const folder = folders.next();
    const name   = folder.getName().toUpperCase();
    const cfg    = QUARTER_CONFIG[quarterKey];
    if (cfg.keywords.some(k => name.includes(k))) {
      targetFolder = folder;
      break;
    }
  }

  // Si no existe carpeta trimestral, usar el root como fallback
  if (!targetFolder) targetFolder = root;

  // Construir el nombre final: [baseName] [ref].[ext]
  const paddedRef  = refNumber ? refNumber.toString().padStart(3, '0') : getNextInvoiceRef(tm).toString().padStart(3, '0');
  const extMatch   = originalFileName.match(/\.([^.]+)$/);
  const ext        = extMatch ? extMatch[1] : 'pdf';
  const baseName   = originalFileName.replace(/\.[^.]+$/, '').trim();
  const newFileName = baseName + ' ' + paddedRef + '.' + ext;

  // Determinar MIME type basado en la extensión
  const mimeType = ext.toLowerCase() === 'pdf' ? 'application/pdf' : 'application/octet-stream';

  const content = base64Data.split(",")[1] || base64Data;
  const blob    = Utilities.newBlob(Utilities.base64Decode(content), mimeType, newFileName);
  const file    = targetFolder.createFile(blob);

  return { success: true, ref: paddedRef, fileUrl: file.getUrl(), fileName: newFileName };
}

function getOrCreateSubFolder(parent, name) {
  const f = parent.getFoldersByName(name);
  return f.hasNext() ? f.next() : parent.createFolder(name);
}

function getNextInvoiceRef(month, year) {
  const files = getMonthFiles(month, year);
  let max = 0;
  files.forEach(f => {
    if (f.ref && !isNaN(f.ref)) {
      const num = parseInt(f.ref);
      if (num > max) max = num;
    }
  });
  return max + 1;
}

function getAllInvoiceRefs(month, year) {
  // Ahora leemos de la nueva estructura de colores/trimestres
  return getMonthFiles(month, year);
}
