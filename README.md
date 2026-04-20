# 📋 Formulario de Incidencias 2026 - Gestión Inteligente

Este proyecto es una solución híbrida diseñada para automatizar el procesamiento de reportes de incidencias desde archivos Excel, visualizarlos en una interfaz moderna y guardarlos de forma organizada en Google Sheets.

## 🚀 Arquitectura del Sistema

El sistema se divide en tres componentes principales:

1.  **Procesador de Datos (Python + Pandas)**: Lee archivos Excel y los convierte a un formato JSON estandarizado para la plataforma web.
2.  **Interfaz de Usuario (React + Vite)**: Una aplicación web premium con estética *Glassmorphism* que permite revisar, completar y enviar las incidencias.
3.  **Backend de Google (Apps Script)**: Recibe los datos de la web y los escribe en tiempo real en la hoja de cálculo de Google.

---

## 🛠️ Instalación y Configuración

### 1. Requisitos Previos
- **Node.js** (v18 o superior)
- **Python 3.x** con la librería `pandas` y `openpyxl`.
  ```bash
  pip install pandas openpyxl
  ```

### 2. Configuración del Proyecto
Clona o descarga este repositorio y ejecuta:
```bash
npm install
```

---

## 📖 Guía de Uso

### Paso 1: Procesar el Excel con Pandas
Coloca tu archivo de incidencias (ej: `Incidencias.xlsx`) en la carpeta raíz y ejecuta el script de Python:
```bash
python processor.py Incidencias.xlsx
```
Esto generará el archivo `public/data.json` que alimenta a la web.

### Paso 2: Ejecutar la Web
Inicia el servidor de desarrollo para ver la interfaz:
```bash
npm run dev
```
Accede a `http://localhost:5173/`. Pulsa el botón **"Sincronizar con Excel"** para cargar los datos procesados.

### Paso 3: Conexión con Google Sheets (Apps Script)
1. Abre tu hoja de Google Sheets.
2. Ve a `Extensiones > Apps Script`.
3. Pega el código que se encuentra en `google-apps-script/Code.gs`.
4. Implementa como **Aplicación Web** con acceso para **Cualquier persona**.
5. Copia la URL generada y actualiza la lógica de envío en `App.jsx`.

---

## 📁 Estructura de Archivos

- `/src/App.jsx`: Componente principal de la interfaz y lógica de envío.
- `/src/index.css`: Sistema de diseño basado en variables y estética premium.
- `processor.py`: Script de procesamiento de datos con Pandas.
- `/google-apps-script/Code.gs`: Código para el backend de Google Sheets.
- `public/data.json`: Datos listos para ser consumidos por la web.

---

## ✨ Tecnologías Utilizadas

- **Frontend**: React, Vite, Framer Motion (animaciones), Lucide React (iconos).
- **Data Engineering**: Python, Pandas.
- **Backend**: Google Apps Script (GAS).
- **Estilos**: Vanilla CSS con enfoque en modernismo y glassmorphism.

---

Desarrollado por **Antigravity AI** para una gestión de incidencias eficiente y profesional. 🚀
