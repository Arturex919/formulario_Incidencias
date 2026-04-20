from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os
import json

app = Flask(__name__)
# Habilitamos CORS para que React (localhost:5173) pueda hacer peticiones
CORS(app)

# Configuración de Google Sheets
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds_file = "rental-holidays-492710-e52e75d23cfd.json"
spreadsheet_id = "1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE"
sheet_name = "Incidencia 2026"

def get_sheet():
    creds = ServiceAccountCredentials.from_json_keyfile_name(creds_file, scope)
    client = gspread.authorize(creds)
    return client.open_by_key(spreadsheet_id).worksheet(sheet_name)

@app.route('/api/data', methods=['GET'])
def get_data():
    """Lee el Excel y lo devuelve como JSON."""
    try:
        # Buscamos archivos excel en la raíz
        files = [f for f in os.listdir('.') if f.endswith(('.xlsx', '.xls')) and not f.startswith('~$')]
        if not files:
            return jsonify({"error": "No se encontró ningún archivo Excel en la carpeta raíz."}), 404
        
        filename = files[0] # Tomamos el primero que encuentre
        df = pd.read_excel(filename)
        
        # Limpieza básica
        df = df.fillna('')
        for col in df.columns:
            if 'FECHA' in col.upper():
                df[col] = df[col].astype(str)
        
        data = df.to_dict(orient='records')
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/submit', methods=['POST'])
def submit_incidencia():
    """Recibe los datos del formulario y los escribe en Google Sheets."""
    try:
        form_data = request.json
        sheet = get_sheet()
        
        # Obtenemos las cabeceras actuales del Sheet para asegurar el orden
        headers = sheet.row_values(1)
        
        # Mapeamos los datos siguiendo el orden de las cabeceras
        new_row = []
        for header in headers:
            new_row.append(form_data.get(header, ""))
        
        # Insertamos la fila al final
        sheet.append_row(new_row)
        
        return jsonify({"status": "success", "message": "Incidencia registrada correctamente en Google Sheets."})
    except Exception as e:
        print(f"Error al enviar datos: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Ejecutamos en el puerto 5000 por defecto
    print("🚀 Servidor de Incidencias arrancado en http://localhost:5000")
    app.run(debug=True, port=5000)
