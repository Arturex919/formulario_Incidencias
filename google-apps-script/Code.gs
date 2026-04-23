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
        .map((row, i) => {
          if (row[0] === "" && row[1] === "") return null; // Saltar vacías
          const obj = { rowIndex: i + 2 }; // i + 2 (fila 1 es cabecera, i=0 es fila 2)
          headers.forEach((header, iCol) => {
            obj[header] = row[iCol];
          });
          return obj;
        })
        .filter(row => row !== null);
      
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

    // 4. Determinar fila destino
    let targetRow;
    if (data.rowIndex && !isNaN(data.rowIndex)) {
      targetRow = parseInt(data.rowIndex);
      logSistema("Actualizando fila existente", targetRow);
    } else {
      // Buscar siguiente fila vacía (Columna B - Propiedad o A - Responsable)
      const values = sheet.getRange("B:B").getValues();
      let nextRow = 1;
      while (values[nextRow] && values[nextRow][0] !== "") {
        nextRow++;
      }
      targetRow = nextRow + 1;
      logSistema("Insertando nueva fila", targetRow);
    }

    // 5. Escribir datos
    sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
    
    return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput("ERROR: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}
