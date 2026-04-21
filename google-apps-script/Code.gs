/**
 * Google Apps Script — Formulario Incidencias 2026 (VERSIÓN FINAL V5 - LECTURA Y ESCRITURA)
 * Nota: Este script debe estar dentro del Google Sheets (Extensiones > Apps Script)
 */

const SHEET_NAME = "INCIDENCIA 2026";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets().find(s => s.getName().trim().toUpperCase() === SHEET_NAME.toUpperCase());
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Hoja no encontrada" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Si viene la acción de leer datos
    if (e.parameter.action === "read") {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const rows = data.slice(1);
      
      const jsonData = rows
        .filter(row => row[0] !== "") // Solo filas rellenadas (basado en Responsable)
        .map(row => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = row[i];
          });
          return obj;
        });
      
      return ContentService.createTextOutput(JSON.stringify(jsonData))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Comprobación de conexión estándar
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return ContentService.createTextOutput("✅ Conexión Ok. \n\nHoja detectada: " + sheet.getName() + "\nColumnas: " + headers.join(" | "));
  } catch (e) {
    return ContentService.createTextOutput("❌ Error: " + e.toString());
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets().find(s => s.getName().trim().toUpperCase() === SHEET_NAME.toUpperCase());
    
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
