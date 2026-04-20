/**
 * Google Apps Script — Formulario Incidencias 2026 (MAPEO DINÁMICO v3)
 */

const SHEET_NAME = "INCIDENCIA 2026";

/**
 * Función de diagnóstico: Abre el link en tu navegador para ver qué columnas detecta el script.
 */
function doGet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput("⛔ Error: No encuentro la hoja '" + SHEET_NAME + "'");
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return ContentService.createTextOutput("✅ Conexión Ok. Columnas detectadas: " + headers.join(" | "));
  } catch (e) {
    return ContentService.createTextOutput("❌ Error de acceso: " + e.toString());
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("No se encuentra la hoja '" + SHEET_NAME + "'");

    // 1. Obtener datos (JSON)
    const data = JSON.parse(e.postData.contents);
    
    // 2. Leer cabeceras actuales del Excel (fila 1)
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // 3. Mapeo inteligente
    // Creamos una fila vacía con el tamaño de las columnas actuales
    const newRow = new Array(headers.length).fill("");
    
    // Recorremos los datos que nos envía React y buscamos su sitio en el Excel
    Object.keys(data).forEach(key => {
      const incomingKey = key.toUpperCase().trim();
      
      // Buscamos en qué columna (index) está esa cabecera en el Excel
      const colIndex = headers.findIndex(h => h.toString().toUpperCase().trim() === incomingKey);
      
      if (colIndex !== -1) {
        newRow[colIndex] = data[key];
      }
    });

    // 4. Insertar fila
    sheet.appendRow(newRow);
    
    return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput("ERROR: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}
