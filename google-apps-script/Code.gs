/**
 * Script para gestionar la base de datos de Incidencias 2026.
 * Este script debe pegarse en un proyecto de Apps Script vinculado a la hoja de cálculo.
 */

const SHEET_NAME = "Incidencia 2026";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    // Si la hoja no existe, la creamos
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      // Opcional: configurar cabeceras si es nueva
      const headers = Object.keys(data);
      sheet.appendRow(headers);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(header => data[header] || "");

    sheet.appendRow(newRow);

    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "Datos guardados correctamente en " + SHEET_NAME
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Función de prueba para verificar permisos
 */
function testDeployment() {
  Logger.log("Script listo para recibir datos.");
}
