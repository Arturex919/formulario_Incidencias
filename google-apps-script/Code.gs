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
const TARGET_YEAR          = new Date().getFullYear().toString(); // "2026"
// La pestaña sigue el año en curso: en enero de 2027 hay que crear "INCIDENCIA 2027" en el Sheet, nada más.
const SHEET_NAME           = "INCIDENCIA " + TARGET_YEAR;
const DRIVE_ROOT_FOLDER_ID = "16FuhBMu4n-Pv8feGdtWQxyVjGtXzna-J";
// Carpeta "Facturas-Incidencias": espejo de cada factura organizado por Propiedad > Año > Trimestre.
const DRIVE_PROPERTIES_ROOT_ID = "1517c0MB86MKUh4Ehx8WwWA4f05c9YOQd";

// ── Lodgify: fuente de propiedades ─────────────────────────────────────────────
// La API key va en Project Settings > Script Properties (LODGIFY_API_KEY), nunca en el código.
const LODGIFY_API_URL           = "https://api.lodgify.com/v2/properties";
const MANUAL_PROPERTIES_SHEET   = "PROPIEDADES MANUALES"; // propiedades que no están en Lodgify

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

// Caché del historial: abrir el libro (miles de fórmulas) tarda 2-50s, así que "read" solo lo abre si la caché está vacía.
// CacheService limita cada valor a 100KB → se guarda troceado. Se invalida en cada guardado/borrado.
const READ_CACHE_KEY = "read_" + TARGET_YEAR;
const READ_CACHE_TTL = 300; // s — cambios hechos a mano en el Sheet tardan como mucho esto en verse

function getCachedRead() {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get(READ_CACHE_KEY + "_n"), 10);
  if (!n) return null;
  const keys  = Array.from({ length: n }, (_, i) => READ_CACHE_KEY + "_" + i);
  const parts = cache.getAll(keys);
  if (keys.some(k => parts[k] == null)) return null;
  return keys.map(k => parts[k]).join("");
}

function putCachedRead(json) {
  const size = 30000; // caracteres; hasta 3 bytes cada uno (ñ, €) → < 100KB por trozo
  const chunks = {};
  let n = 0;
  for (let i = 0; i < json.length; i += size) chunks[READ_CACHE_KEY + "_" + n++] = json.slice(i, i + size);
  chunks[READ_CACHE_KEY + "_n"] = String(n);
  try { CacheService.getScriptCache().putAll(chunks, READ_CACHE_TTL); } catch (_) {} // sin caché la lectura sigue funcionando
}

function clearCachedRead() {
  CacheService.getScriptCache().remove(READ_CACHE_KEY + "_n");
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

// REF del nombre del archivo. Dos formatos:
//   "lo que sea 007.pdf"                  → 007  (el que genera esta app al subir)
//   "Factura_AngelFerreiro_003_2026.pdf"  → 003  (ref de 3-4 dígitos delante del año)
// Un año suelto al final NO es referencia, y "07-04-2026 - 06-05-2026" es una fecha, no una ref.
function refFromFileName(fileName) {
  const nameNoExt = fileName.replace(/\.[^.]+$/, '');

  const conAnio = nameNoExt.match(/[\s\-_](\d{3,4})[\s\-_](?:19|20)\d{2}$/);
  if (conAnio) return String(conAnio[1]).padStart(3,'0');

  const suelto = nameNoExt.match(/[\s\-_](\d{1,4})$/);
  if (!suelto) return "---";
  const num = parseInt(suelto[1], 10);
  if (num >= 1900 && num <= 2100) return "---";
  return String(suelto[1]).padStart(3,'0');
}

function getOrCreate(parent, name) {
  const upperName = name.toUpperCase();
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (folder.getName().toUpperCase() === upperName) {
      return folder;
    }
  }
  return parent.createFolder(name);
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
  const folders = quarterFolder.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    const fname = folder.getName().toUpperCase();
    if (fname === upper || fname === monthName.toUpperCase()) {
      return folder;
    }
  }
  // No existe → crear
  return quarterFolder.createFolder(upper);
}

// ── Subcarpeta INCIDENCIAS dentro del trimestre (separada de GASTO DE EMPRESA) ──
function getIncidenciasFolder(quarterFolder) {
  return getOrCreate(quarterFolder, "INCIDENCIAS");
}

// ── Carpeta espejo por propiedad: Facturas-Incidencias / <Propiedad> / <Año> / <Trimestre> ───
function getPropertyQuarterFolder(propiedad, quarterKey, year) {
  const root       = DriveApp.getFolderById(DRIVE_PROPERTIES_ROOT_ID);
  const propFolder = getOrCreate(root, String(propiedad).trim());
  const yearFolder = getOrCreate(propFolder, String(year));
  return getOrCreate(yearFolder, QUARTER_CONFIG[quarterKey].label);
}

// Crea de antemano Propiedad > Año > (Q1..Q4) para cada propiedad del sistema.
function createPropertyFolders(propiedades, year) {
  const ty      = year || TARGET_YEAR;
  const root    = DriveApp.getFolderById(DRIVE_PROPERTIES_ROOT_ID);
  const created = [];

  (propiedades || []).forEach(p => {
    const name = String(p || "").trim();
    if (!name) return;
    const propFolder = getOrCreate(root, name);
    const yearFolder = getOrCreate(propFolder, String(ty));
    Object.values(QUARTER_CONFIG).forEach(cfg => getOrCreate(yearFolder, cfg.label));
    created.push({ propiedad: name, id: propFolder.getId() });
  });

  return { success: true, year: ty, count: created.length, created };
}

// ── Propiedades desde Lodgify (paginado) ──────────────────────────────────────
function getLodgifyProperties() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("LODGIFY_API_KEY");
  if (!apiKey) return { error: "Falta LODGIFY_API_KEY en Project Settings > Script Properties", names: [] };

  const names = [];
  let page = 1;
  const size = 50;
  while (true) {
    const res = UrlFetchApp.fetch(LODGIFY_API_URL + "?page=" + page + "&size=" + size, {
      headers: { "X-ApiKey": apiKey },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      return { error: "Lodgify " + res.getResponseCode() + ": " + res.getContentText(), names };
    }
    const body  = JSON.parse(res.getContentText());
    const items = body.data || [];
    items.forEach(p => { if (p.name) names.push(String(p.name).trim()); });

    const total = (body.pagination && body.pagination.total) || items.length;
    if (items.length === 0 || page * size >= total) break;
    page++;
  }
  return { names };
}

// ── Propiedades añadidas a mano (no están en Lodgify) ─────────────────────────
function getManualPropertiesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheets().find(s => s.getName() === MANUAL_PROPERTIES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MANUAL_PROPERTIES_SHEET);
    sheet.appendRow(["NOMBRE"]);
  }
  return sheet;
}

function getManualProperties() {
  const values = getManualPropertiesSheet().getDataRange().getValues();
  return values.slice(1).map(r => String(r[0] || "").trim()).filter(Boolean);
}

function addManualProperty(name) {
  const clean = String(name || "").trim();
  if (!clean) return { success: false, error: "Nombre vacío" };
  const existing = getManualProperties();
  if (existing.some(n => n.toUpperCase() === clean.toUpperCase())) {
    return { success: true, alreadyExists: true, manual: existing };
  }
  getManualPropertiesSheet().appendRow([clean]);
  return { success: true, manual: existing.concat([clean]) };
}

// ── Unión: Lodgify + manuales, sin duplicados ─────────────────────────────────
function getAllProperties() {
  const lodgify = getLodgifyProperties();
  const manual  = getManualProperties();
  const unique  = [...new Set(lodgify.names.concat(manual))].sort((a, b) => a.localeCompare(b));
  return { error: lodgify.error || null, lodgify: lodgify.names, manual, all: unique };
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
    if (action === "findInvoice" || action === "findInvoiceById") {
      return jsonResponse(findInvoiceSmart(e.parameter.id, e.parameter.name, e.parameter.ref, e.parameter.month, e.parameter.year, e.parameter.propiedad));
    }
    if (action === "getProperties")  return jsonResponse(getAllProperties());

    if (action === "read") {
      const cached = getCachedRead();
      if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }

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
      const json = JSON.stringify(jsonData);
      putCachedRead(json);
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
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
      return jsonResponse(saveInvoiceToDrive(data.fileBase64, data.fileName, data.refNumber || null, data.month || null, data.year || null, data.propiedad || null, data.invoiceId || null, data.invoiceName || null));
    }

    if (data.action === "createYearStructure") {
      return jsonResponse(createQuarterlyStructure(data.year, data.colorAssignments));
    }

    if (data.action === "createPropertyFolders") {
      return jsonResponse(createPropertyFolders(data.propiedades, data.year));
    }

    if (data.action === "addManualProperty") {
      return jsonResponse(addManualProperty(data.name));
    }

    if (data.action === "delete") {
      const sheet = getTargetSheet();
      if (!sheet) throw new Error("No se encuentra la hoja");
      const rowIndex = parseInt(data.rowIndex);
      if (isNaN(rowIndex) || rowIndex < 2) throw new Error("Índice de fila inválido");
      sheet.deleteRow(rowIndex);
      clearCachedRead();
      return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);
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
    clearCachedRead();
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

  const incidenciasFolder = getIncidenciasFolder(quarterFolder);
  const monthUpper = month.toUpperCase();
  const colorHex  = getFolderColorById(quarterFolder.getId());
  const colorInfo = matchColorToPalette(colorHex);
  const results   = [];

  function collectFiles(folder, propiedad) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file     = files.next();
      const fileName = file.getName();
      const nameNoExt = fileName.replace(/\.[^.]+$/, '');

      const ref       = refFromFileName(fileName);
      const clientName = ref === "---"
        ? nameNoExt.trim()
        : nameNoExt.replace(/[\s\-_]\d{1,4}([\s\-_](?:19|20)\d{2})?$/, '').trim();

      results.push({
        ref:        String(ref),
        fullName:   fileName,
        clientName,
        propiedad:  propiedad,
        fileId:     file.getId(),
        fileUrl:    file.getUrl(),
        folderName: quarterFolder.getName(),
        colorLabel: colorInfo.label,
        colorHex:   colorInfo.hex
      });
    }
  }

  // INCIDENCIAS/<Propiedad>/<Mes> — una carpeta de propiedad, y dentro la del mes
  const propFolders = incidenciasFolder.getFolders();
  while (propFolders.hasNext()) {
    const pf = propFolders.next();
    const monthFolders = pf.getFolders();
    while (monthFolders.hasNext()) {
      const mf = monthFolders.next();
      if (mf.getName().toUpperCase() === monthUpper) {
        collectFiles(mf, pf.getName());
      }
    }
  }

  return results.sort((a, b) => {
    if (a.ref === "---" && b.ref === "---") return 0;
    if (a.ref === "---") return 1;
    if (b.ref === "---") return -1;
    return parseInt(a.ref,10) - parseInt(b.ref,10);
  });
}

// ── GUARDAR FACTURA → Trimestre > INCIDENCIAS > Propiedad > Mes ──────────────
function saveInvoiceToDrive(base64Data, originalFileName, refNumber, month, year, propiedad, invoiceId, invoiceName) {
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

  // INCIDENCIAS/<Propiedad>/<Mes> (si no viene propiedad, el mes queda directo en INCIDENCIAS)
  const incidenciasFolder = getIncidenciasFolder(quarterFolder);
  const propFolder   = propiedad ? getOrCreate(incidenciasFolder, String(propiedad).trim()) : incidenciasFolder;
  const targetFolder = getMonthSubFolder(propFolder, tm);

  // REF como String corto
  const nextNum   = getNextInvoiceRef(tm, ty);
  const paddedRef = refNumber
    ? String(refNumber).padStart(3,'0')
    : String(nextNum).padStart(3,'0');

  const extMatch    = originalFileName.match(/\.([^.]+)$/);
  const ext         = extMatch ? extMatch[1] : 'pdf';
  const baseName    = originalFileName.replace(/\.[^.]+$/, '').trim();
  // El ID va ANTES del REF en el nombre: refFromFileName necesita el REF al final para no romper el parseo.
  const newFileName = baseName + (invoiceId ? ' ' + invoiceId : '') + ' ' + paddedRef + '.' + ext;

  const extLow = ext.toLowerCase();
  let mimeType = 'application/octet-stream';
  if (extLow === 'pdf')  mimeType = 'application/pdf';
  if (extLow === 'jpg' || extLow === 'jpeg') mimeType = 'image/jpeg';
  if (extLow === 'png')  mimeType = 'image/png';

  const content = base64Data.split(",")[1] || base64Data;
  const blob    = Utilities.newBlob(Utilities.base64Decode(content), mimeType, newFileName);
  const file    = targetFolder.createFile(blob);

  // Copia espejo en Facturas-Incidencias (carpeta por propiedad), coordinada con la carpeta principal
  if (propiedad) {
    file.makeCopy(newFileName, getPropertyQuarterFolder(propiedad, quarterKey, ty));
  }

  return {
    success:    true,
    ref:        paddedRef,
    fileUrl:    file.getUrl(),
    fileName:   newFileName,
    folderId:   targetFolder.getId(),
    folderPath: quarterFolder.getName() + " / INCIDENCIAS" + (propiedad ? " / " + propFolder.getName() : "") + " / " + targetFolder.getName()
  };
}

// ── BUSCAR UNA FACTURA POR REF EN TODO EL AÑO ────────────────────────────────
// 1. Escanea las carpetas trimestrales bajo DRIVE_ROOT_FOLDER_ID.
// 2. Si no encuentra nada (p.ej. DRIVE_ROOT_FOLDER_ID no está al nivel correcto),
//    usa DriveApp.searchFiles como fallback global.
function findInvoiceByRef(ref, year, monthHint) {
  const target = String(ref || "").replace(/\D/g, '');
  if (!target) return { found: false };

  const padded  = target.padStart(3, '0');
  const yearStr = year || TARGET_YEAR;
  const root    = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const matches = [];

  function scan(folder, path) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (refFromFileName(file.getName()) !== padded) continue;
      matches.push({
        ref:      padded,
        fullName: file.getName(),
        fileId:   file.getId(),
        fileUrl:  file.getUrl(),
        path:     path
      });
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      scan(sub, path + " / " + sub.getName());
    }
  }

  // ── 1. Escaneo estructurado desde la raíz ────────────────────────────────
  const quarters = root.getFolders();
  while (quarters.hasNext()) {
    const q    = quarters.next();
    const name = q.getName().toUpperCase();
    const esTrimestre = Object.keys(QUARTER_CONFIG).some(k => QUARTER_CONFIG[k].keywords.some(kw => name.includes(kw)));
    if (!esTrimestre) continue;
    if (/\d{4}/.test(name) && !name.includes(yearStr)) continue; // carpeta de otro año → fuera
    scan(q, q.getName());
  }

  // ── 2. Fallback: búsqueda nativa de Drive por título ─────────────────────
  // Cubre casos donde DRIVE_ROOT_FOLDER_ID no es el padre directo de los
  // trimestres, o cuando el escaneo recursivo no llega por alguna razón.
  if (matches.length === 0) {
    try {
      const driveResults = DriveApp.searchFiles(
        "title contains ' " + padded + "' and trashed = false"
      );
      while (driveResults.hasNext()) {
        const file = driveResults.next();
        if (refFromFileName(file.getName()) !== padded) continue;
        // Verificar que pertenece al año correcto subiendo por los padres
        let inYear = false;
        try {
          let parents = file.getParents();
          while (parents.hasNext() && !inYear) {
            const p = parents.next();
            if (p.getName().includes(yearStr)) { inYear = true; break; }
            const gp = p.getParents();
            while (gp.hasNext() && !inYear) {
              if (gp.next().getName().includes(yearStr)) inYear = true;
            }
          }
        } catch (_) { inYear = true; }
        if (!inYear) continue;
        matches.push({
          ref:      padded,
          fullName: file.getName(),
          fileId:   file.getId(),
          fileUrl:  file.getUrl(),
          path:     buildPathToRoot(file)
        });
      }
    } catch (_) {}
  }

  if (matches.length === 0) return { found: false, ref: padded, year: yearStr };

  // El mes de la incidencia manda: si hay varias con la misma ref, primero la de ese mes
  if (monthHint) {
    const mh = String(monthHint).toUpperCase();
    matches.sort(function (a, b) {
      const am = a.path.toUpperCase().indexOf(mh) >= 0 ? 0 : 1;
      const bm = b.path.toUpperCase().indexOf(mh) >= 0 ? 0 : 1;
      return am - bm;
    });
  }

  return { found: true, file: matches[0], total: matches.length };
}

// ── BÚSQUEDA INTELIGENTE DE FACTURAS ─────────────────────────────────────────
// 1. Por ID único (FAC-XXXXX...) -> rápido, exacto, sin falsos positivos.
// 2. Por Nombre de Factura -> si se especificó nombre ("prueba", etc.)
// 3. Por Ref -> fallback para incidencias que solo tienen número de referencia.
function findInvoiceSmart(id, name, ref, month, year, propiedad) {
  const cleanId   = String(id || "").trim();
  const cleanName = String(name || "").trim();
  const cleanRef  = String(ref || "").trim();
  const paddedRef = cleanRef && /^\d+$/.test(cleanRef) ? cleanRef.padStart(3, '0') : "";
  const yearStr   = String(year || TARGET_YEAR).trim();
  const monthStr  = String(month || "").trim();
  const propStr   = String(propiedad || "").trim().toUpperCase();

  // ── 1. Buscar PRIMERO dentro de la carpeta del mes (solo facturas oficiales) ──
  const monthFiles = (monthStr ? getMonthFiles(monthStr, yearStr) : []);

  if (monthFiles && monthFiles.length > 0) {
    // Puntuar cada archivo de la carpeta según coincidencia
    const scored = monthFiles.map(f => {
      let score = 0;
      const fNameUpper = f.fullName.toUpperCase();

      // Coincidencia exacta por ID de factura
      if (cleanId && fNameUpper.indexOf(cleanId.toUpperCase()) !== -1) {
        score += 100;
      }
      // Coincidencia por Nombre de factura (si no es la palabra genérica "prueba")
      if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== "prueba") {
        if (fNameUpper.indexOf(cleanName.toUpperCase()) !== -1) score += 50;
      }
      // Coincidencia por Propiedad (ej. "VILLA GRAO" en el nombre del archivo)
      if (propStr && propStr.length >= 3 && fNameUpper.indexOf(propStr) !== -1) {
        score += 30;
      }
      // Coincidencia por Ref
      if (paddedRef && f.ref === paddedRef) {
        score += 20;
      }

      return { file: f, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Si hubo coincidencia con alguna puntuación positiva, devolverla
    if (scored[0].score > 0) {
      return {
        found: true,
        foundInMonth: monthStr,
        file: scored[0].file,
        monthFiles: monthFiles,
        total: monthFiles.length
      };
    }
  }

  // ── 2. Si no se encontró en ese mes, buscar en los DEMÁS meses del año ──────
  const otherMonths = MONTH_NAMES_ES.filter(m => m.toUpperCase() !== monthStr.toUpperCase());
  for (let i = 0; i < otherMonths.length; i++) {
    const mName = otherMonths[i];
    const filesInM = getMonthFiles(mName, yearStr);
    if (!filesInM || filesInM.length === 0) continue;

    for (let j = 0; j < filesInM.length; j++) {
      const f = filesInM[j];
      const fUpper = f.fullName.toUpperCase();
      let matched = false;

      if (cleanId && fUpper.indexOf(cleanId.toUpperCase()) !== -1) matched = true;
      if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== "prueba" && fUpper.indexOf(cleanName.toUpperCase()) !== -1) matched = true;
      if (paddedRef && f.ref === paddedRef) matched = true;

      if (matched) {
        return {
          found: true,
          foundInMonth: mName,
          file: f,
          monthFiles: filesInM,
          total: filesInM.length
        };
      }
    }
  }

  // ── 3. Si no hubo coincidencia por id/nombre/ref, solo devolver del mes original
  //      si al menos la PROPIEDAD coincide (si no, sería mostrar la factura de otro alojamiento) ──
  if (monthFiles && monthFiles.length > 0 && propStr && propStr.length >= 3) {
    const porPropiedad = monthFiles.find(f => String(f.propiedad || "").toUpperCase().indexOf(propStr) !== -1);
    if (porPropiedad) {
      return {
        found: true,
        foundInMonth: monthStr,
        file: porPropiedad,
        monthFiles: monthFiles,
        total: monthFiles.length
      };
    }
  }

  // ── 4. Fallback por REF en las carpetas trimestrales del año ───────────────
  if (paddedRef) {
    const resRef = findInvoiceByRef(paddedRef, yearStr, monthStr);
    if (resRef.found) return resRef;
  }

  // ── 3. Búsqueda por ID único (solo PDFs e imágenes dentro del proyecto) ────
  if (cleanId && /^FAC-[A-Z0-9]+-[A-Z0-9]+$/i.test(cleanId)) {
    try {
      const q = "title contains '" + cleanId.toUpperCase() + "' and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')";
      const files = DriveApp.searchFiles(q);
      if (files.hasNext()) {
        const file = files.next();
        return {
          found: true,
          matchBy: "id",
          file: {
            ref:      refFromFileName(file.getName()) || paddedRef,
            fullName: file.getName(),
            fileId:   file.getId(),
            fileUrl:  file.getUrl(),
            path:     buildPathToRoot(file)
          }
        };
      }
    } catch (_) {}
  }

  return { found: false };
}

function findInvoiceById(id) {
  return findInvoiceSmart(id, "", "", "", "", "");
}

// Construye el path relativo desde el archivo hasta la raíz del proyecto.
function buildPathToRoot(file) {
  let path = "";
  try {
    let parents = file.getParents();
    while (parents.hasNext()) {
      const p = parents.next();
      if (p.getId() === DRIVE_ROOT_FOLDER_ID) break;
      path = path ? p.getName() + " / " + path : p.getName();
      parents = p.getParents();
    }
  } catch (_) {}
  return path;
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
    
    let qFolder = null;
    let statusMsg = "";
    
    const folders = root.getFolders();
    while (folders.hasNext()) {
      const f = folders.next();
      if (f.getName() === folderName) {
        qFolder = f;
        statusMsg = "ya existia (color actualizado)";
        break;
      }
    }

    if (!qFolder) {
      qFolder = root.createFolder(folderName);
      // Crear subcarpetas de meses automáticamente solo si es nueva
      cfg.monthNames.forEach(m => qFolder.createFolder(m));
      statusMsg = "creada con meses";
    }

    // Si ya existía, nos aseguramos de que tenga los meses (sin duplicar)
    if (statusMsg.includes("ya existia")) {
      cfg.monthNames.forEach(m => getOrCreate(qFolder, m));
    }

    // Asignar/Actualizar color vía Drive API v2 o v3 si está disponible
    try {
      if (typeof Drive !== 'undefined' && Drive.Files) {
        const hex = COLOR_PALETTE.find(c => c.id === colorId)?.hex || "#9AA0A6";
        const resource = { folderColorRgb: hex };
        const fileId = qFolder.getId();
        
        if (Drive.Files.patch) {
          Drive.Files.patch(resource, fileId);
        } else if (Drive.Files.update) {
          Drive.Files.update(resource, fileId);
        }
      }
    } catch (e) {}

    created.push({ quarter, folderName, colorId, status: statusMsg, id: qFolder.getId() });
  }

  return { success: true, year, created };
}

// ── MIGRAR FACTURAS DEL ESQUEMA VIEJO (Trimestre/Mes/Propiedad) AL NUEVO (Trimestre/INCIDENCIAS/Propiedad/Mes) ──
// Solo MUEVE archivos, no borra nada. Correr UNA VEZ a mano desde el editor de Apps Script (▶) por año.
function migrateOldInvoicesToIncidencias(year) {
  const ty    = year || TARGET_YEAR;
  const moved = [];

  Object.keys(QUARTER_CONFIG).forEach(qKey => {
    const quarterFolder = findQuarterFolder(qKey, ty);
    if (!quarterFolder) return;
    const incidenciasFolder = getIncidenciasFolder(quarterFolder);

    const subfolders = quarterFolder.getFolders();
    while (subfolders.hasNext()) {
      const sub     = subfolders.next();
      const subName = sub.getName().toUpperCase();
      if (subName === "INCIDENCIAS" || subName === "GASTO DE EMPRESA") continue;
      if (!MONTH_NAMES_ES.some(m => m.toUpperCase() === subName)) continue; // no es carpeta de mes del esquema viejo

      // Facturas sueltas directo en el Mes (sin propiedad) → INCIDENCIAS/<Mes>
      const looseTarget = getMonthSubFolder(incidenciasFolder, subName);
      const looseFiles  = sub.getFiles();
      while (looseFiles.hasNext()) {
        const f = looseFiles.next();
        f.moveTo(looseTarget);
        moved.push({ file: f.getName(), to: "INCIDENCIAS/" + subName });
      }

      // Subcarpetas de propiedad dentro del Mes → INCIDENCIAS/<Propiedad>/<Mes>
      const propSubs = sub.getFolders();
      while (propSubs.hasNext()) {
        const propSub         = propSubs.next();
        const newPropFolder   = getOrCreate(incidenciasFolder, propSub.getName());
        const newMonthFolder  = getMonthSubFolder(newPropFolder, subName);
        const propFiles       = propSub.getFiles();
        while (propFiles.hasNext()) {
          const f = propFiles.next();
          f.moveTo(newMonthFolder);
          moved.push({ file: f.getName(), to: "INCIDENCIAS/" + propSub.getName() + "/" + subName });
        }
      }
    }
  });

  return { success: true, year: ty, count: moved.length, moved };
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
