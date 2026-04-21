/**
 * Google Apps Script — Formulario Incidencias 2026 (MAPEO DINÁMICO v3)
 */

const SHEET_NAME = "INCIDENCIA 2026";

/**
 * Función de diagnóstico: Abre el link en tu navegador para ver qué columnas detecta el script.
 */
function doGet() {
  try {
    const ss = SpreadsheetApp.openById("1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE");
    const sheets = ss.getSheets();
    const sheetNames = sheets.map(s => s.getName());
    
    // Buscamos la hoja de forma flexible (ignorando espacios de más al principio o final)
    const sheet = sheets.find(s => s.getName().trim().toUpperCase() === SHEET_NAME.trim().toUpperCase());
    
    if (!sheet) {
      return ContentService.createTextOutput("⛔ Error: No encuentro la hoja '" + SHEET_NAME + "'. \n\nLas hojas disponibles son: " + sheetNames.join(", "));
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return ContentService.createTextOutput("✅ Conexión Ok. \n\nHoja: " + SHEET_NAME + "\nColumnas: " + headers.join(" | "));
  } catch (e) {
    return ContentService.createTextOutput("❌ Error de acceso: " + e.toString());
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById("1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE");
    
    // Búsqueda flexible
    const sheet = ss.getSheets().find(s => s.getName().trim().toUpperCase() === SHEET_NAME.trim().toUpperCase());
    
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

    // 4. Encontrar la primera fila vacía real (evitando el error de appendRow con fórmulas)
    // Buscamos en la columna 2 (B - PROPIEDAD) porque siempre suele estar rellena. 
    // Si prefieres usar otra, cambia el "B:B".
    const values = sheet.getRange("B:B").getValues();
    let nextRow = 1;
    while (values[nextRow] && values[nextRow][0] !== "") {
      nextRow++;
    }
    nextRow++; // Convertir índice 0 a fila de Excel

    // 5. Insertar los datos en esa fila específica
    sheet.getRange(nextRow, 1, 1, newRow.length).setValues([newRow]);
    
    return ContentService.createTextOutput("SUCCESS").setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    return ContentService.createTextOutput("ERROR: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}
