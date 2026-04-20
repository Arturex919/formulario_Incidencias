import pandas as pd
import json
import os
import sys

def process_excel(filename):
    try:
        # Intentamos leer el archivo Excel
        df = pd.read_excel(filename)
        
        # Convertimos las fechas a string para evitar errores de serialización JSON
        for col in df.columns:
            if 'FECHA' in col.upper():
                df[col] = df[col].astype(str)
        
        # Convertimos a una lista de diccionarios
        data = df.to_dict(orient='records')
        
        # Guardamos como JSON para que React lo consuma
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"Éxito: Se han procesado {len(df)} registros.")
        return True
    except Exception as e:
        print(f"Error procesando el Excel: {str(e)}")
        return False

if __name__ == "__main__":
    archivo = 'incidencias_ejemplo.xlsx' # Por defecto para pruebas
    if len(sys.argv) > 1:
        archivo = sys.argv[1]
        
    if os.path.exists(archivo):
        process_excel(archivo)
    else:
        print(f"El archivo {archivo} no existe.")
