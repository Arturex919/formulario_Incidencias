/**
 * Google Apps Script — Formulario Incidencias 2026 (VERSIÓN FINAL VINCULADA)
 * Nota: Este script debe estar dentro del Google Sheets (Extensiones > Apps Script)
 */

const SHEET_NAME = "INCIDENCIA 2026";

function doGet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    
    // Búsqueda flexible de la hoja
    const sheet = sheets.find(s => s.getName().trim().toUpperCase() === SHEET_NAME.toUpperCase());
    
    if (!sheet) {
      const sheetNames = sheets.map(s => s.getName());
      return ContentService.createTextOutput("⛔ Error: No encuentro la hoja '" + SHEET_NAME + "'. \n\nHojas disponibles: " + sheetNames.join(", "));
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return ContentService.createTextOutput("✅ Conexión Ok. \n\nHoja detectada: " + sheet.getName() + "\nColumnas: " + headers.join(" | "));
  } catch (e) {
    return ContentService.createTextOutput("❌ Error: " + e.toString());
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const sheet = sheets.find(s => s.getName().trim().toUpperCase() === SHEET_NAME.toUpperCase());
    
    if (!sheet) throw new Error("No se encuentra la hoja");

    // 1. Obtener datos
    const data = JSON.parse(e.postData.contents);
    
    // 2. Leer cabeceras
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = new Array(headers.length).fill("");

    // 3. Mapeo de columnas
    Object.keys(data).forEach(key => {
      const colIndex = headers.findIndex(h => h.toString().toUpperCase().trim() === key.toUpperCase().trim());
      if (colIndex !== -1) newRow[colIndex] = data[key];
    });

    // 4. Buscar fila vacía (Columna A - Responsable)
    const values = sheet.getRange("A:A").getValues();
    let nextRow = 1;
    while (values[nextRow] && values[nextRow][0] !== "") {
      nextRow++;
    }
    nextRow++; // Fila de Excel

    // 5. Insertar fila
    sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow]);
    
    return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput("ERROR: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}
