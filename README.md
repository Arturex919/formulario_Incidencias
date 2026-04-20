# 📋 Formulario de Incidencias 2026 - Gestión Inteligente

Este proyecto es una solución híbrida profesional diseñada para automatizar la gestión de incidencias desde archivos Excel hacia Google Sheets utilizando la API de Google Cloud.

## 🚀 Arquitectura del Sistema

El sistema utiliza una arquitectura de tres capas:

1.  **Frontend (React + Vite)**: Interfaz de usuario premium para la revisión y envío de incidencias.
2.  **API Backend (Python + Flask)**: Servidor local que actúa como puente de datos.
3.  **Base de Datos (Google Sheets)**: Almacenamiento final mediante la API oficial de Google (Service Account).

---

## 🛠️ Instalación y Configuración

### 1. Requisitos Previos
- **Node.js** (v18+)
- **Python 3.x**
  ```bash
  pip install pandas openpyxl gspread oauth2client flask flask-cors
  ```

### 2. Configuración de Google Cloud
El sistema ya cuenta con el archivo de credenciales `rental-holidays-492710-e52e75d23cfd.json`.

> [!IMPORTANT]
> **Paso Crítico**: Debes compartir tu Google Sheet con este email (permisos de editor):
> `formulario-incidencia@rental-holidays-492710.iam.gserviceaccount.com`

---

## 📖 Guía de Uso

1.  **Carga del Excel**: Asegúrate de tener tu archivo Excel (ej: `Incidencias.xlsx`) en la carpeta raíz del proyecto.
2.  **Inicia el Servidor API**:
    ```bash
    python api.py
    ```
    *(Mantén esta ventana abierta)*.
3.  **Inicia la Web**:
    ```bash
    npm run dev
    ```
4.  **Gestión**: Entra en `http://localhost:5173`, pulsa **Sincronizar**, selecciona una incidencia, complétala y pulsa **Guardar en Sheet**. Los datos aparecerán instantáneamente en tu Google Sheet.

---

## 📁 Estructura de Archivos

- `api.py`: El corazón del sistema (Servidor Flask + Conexión Google Sheets).
- `src/App.jsx`: Interfaz de usuario interactiva.
- `rental-holidays-492710-e52e75d23cfd.json`: Clave privada de acceso a Google Cloud.
- `README.md`: Esta guía de uso.

---

Desarrollado con precisión por **Antigravity AI**. 🚀
