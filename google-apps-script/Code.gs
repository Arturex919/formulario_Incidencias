/**
 * Google Apps Script — Formulario Incidencias 2026
 * Hoja destino: "Incidencia 2026"
 *
 * INSTRUCCIONES:
 * 1. Abre script.google.com y pega este código.
 * 2. Despliega como "Aplicación web" (ejecutar como "Yo", acceso "Cualquiera").
 * 3. Copia la URL de despliegue y pégala en App.jsx → GOOGLE_SCRIPT_URL.
 */

const SHEET_NAME = "Incidencia 2026";

// Orden de columnas que se escribirán en la hoja
const COLUMN_ORDER = [
  "RESPONSABLE DEL REPORTE",
  "FECHA REPORTE INCIDENCIA",
  "ref",
  "PROPIEDAD",
  "CLASIFICACION DE LA INCIDENCIA",
  "DESCRIPCION DE LA INCIDENCIA",
  "OPERARIO",
  "costo mano obra",
  "ACCION TOMADA",
  "ESTADO",
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    let sheet  = ss.getSheetByName(SHEET_NAME);

    // Crear la hoja si no existe y añadir cabeceras
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(COLUMN_ORDER);
      // Estilo de cabecera
      const headerRange = sheet.getRange(1, 1, 1, COLUMN_ORDER.length);
      headerRange.setBackground("#1a237e");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
    }

    // Construir la fila en el orden de las columnas
    const newRow = COLUMN_ORDER.map(col => data[col] !== undefined ? data[col] : "");
    sheet.appendRow(newRow);

    // Auto-ajustar columnas al insertar
    sheet.autoResizeColumns(1, COLUMN_ORDER.length);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: "success",
        message: "Incidencia registrada en '" + SHEET_NAME + "' correctamente."
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para obtener los datos de la hoja (GET)
function doGet(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return _json({ status: "error", message: "Hoja no encontrada." });

    const values  = sheet.getDataRange().getValues();
    const headers = values[0];
    const rows    = values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });

    return _json({ status: "success", data: rows });
  } catch (err) {
    return _json({ status: "error", message: err.toString() });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testScript() {
  Logger.log("Script listo. Hoja destino: " + SHEET_NAME);
}
