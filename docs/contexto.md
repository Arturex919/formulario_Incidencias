# Contexto

## Qué hace la app

El equipo de Rental Holidays (responsables de alojamientos, gestión) usa la app para:

1. **Registrar una incidencia** de un alojamiento: qué pasó, quién la reporta, operario, proveedor, costes, estado.
2. **Subir la factura** asociada. Se guarda en Drive en la carpeta de su trimestre, propiedad y mes, con un nombre que permite encontrarla.
3. **Consultar el historial** de incidencias, filtrarlo por alojamiento o mes y ver la factura de cada una.
4. **Administrar** las carpetas de Drive de cada año y la lista de alojamientos.

## Piezas

```
Navegador (React)  ──GET/POST──►  Google Apps Script (Web App)  ──►  Google Sheets  (1 fila = 1 incidencia)
      │                                    │                    └─►  Google Drive   (PDF/imagen de facturas)
      │                                    └──────────────────────►  Lodgify API     (lista de alojamientos)
      └──gviz (lectura pública)──►  Sheet "ALOJAMIENTOS ACTIVOS"      (nombre, REF y encargado de cada alojamiento)
```

| Pieza | Dónde | Notas |
|---|---|---|
| Frontend | `src/App.jsx` (un solo componente, ~1600 líneas) + `src/index.css` | React 19 + Vite. Pestañas: Nuevo Reporte, Ver Historial, Administración, Ayuda. |
| Backend | `google-apps-script/Code.gs` | **El archivo del repo es solo una copia.** Lo que corre es lo que está pegado en script.google.com. No hay clasp ni CI (ver [decisiones](decisiones.md#d1-apps-script-desplegado-a-mano)). |
| Datos de incidencias | Spreadsheet "PAGO A PROPIETARIOS NUEVO", pestaña `INCIDENCIA <año>` | Libro grande compartido con pagos a propietarios (ver [D2](decisiones.md#d2-seguir-en-el-spreadsheet-viejo-y-cachear)). |
| Facturas | Google Drive, cuenta `rentalholidays.es@gmail.com` | Estructura abajo. |
| Alojamientos | Lodgify (API v2) + pestaña `PROPIEDADES MANUALES` + Sheet "ALOJAMIENTOS ACTIVOS" | La API key de Lodgify está en Script Properties (`LODGIFY_API_KEY`), nunca en el código. |

## Acciones del backend

Todas pasan por la misma URL (`GOOGLE_SCRIPT_URL` en `App.jsx`).

| Acción | Método | Qué hace | ¿Escribe? |
|---|---|---|---|
| `read` | GET | Devuelve todas las incidencias del año (cacheadas 5 min). | No |
| `getNextRef` / `getAllRefs` | GET | Siguiente REF libre del mes / facturas del mes en Drive. | No |
| `getMonthFiles` | GET | Facturas de un mes (todas las propiedades). | No¹ |
| `findInvoice` | GET | Busca la factura de una incidencia (ID, nombre, propiedad, REF; primero en su mes, luego el resto del año). | No¹ |
| `scanStructure` | GET | Carpetas trimestrales del año y sus colores. | No |
| `getProperties` | GET | Lodgify + manuales, sin duplicados (cacheado 5 min). | No |
| *(sin action)* | POST | Guarda o edita una fila de incidencia. | Sí |
| `delete` | POST | Borra una fila (no toca Drive). | Sí |
| `uploadInvoice` | POST | Guarda la factura en Drive + copia espejo. | Sí |
| `createYearStructure` | POST | Prepara carpetas trimestrales de un año y su color. | Sí |
| `createPropertyFolders` | POST | Crea la estructura espejo Propiedad/Año/Trimestre. | Sí |
| `addManualProperty` | POST | Añade un alojamiento que no está en Lodgify. | Sí |

¹ `getMonthFiles` crea la subcarpeta `INCIDENCIAS` del trimestre si no existe (`getOrCreate`). Es un efecto lateral pequeño, pero existe.

Guardar incidencia, borrar y subir factura usan `fetch` con `mode: "no-cors"`: el navegador **no puede leer la respuesta**. Por eso, tras subir una factura, la app vuelve a pedir la lista del mes para comprobar que está en Drive. Las acciones de Administración sí leen la respuesta (ver [D9](decisiones.md#d9-administración-confirma-con-la-respuesta-del-servidor)).

## Dónde se guarda cada cosa

### Incidencias
Una fila por incidencia en la pestaña `INCIDENCIA <año>` (el nombre sale de `new Date().getFullYear()`). Columnas: `RESPONSABLE DEL REPORTE`, `FECHA REPORTE INCIDENCIA`, `ref`, `PROPIEDAD`, `CLASIFICACION DE LA INCIDENCIA`, `DESCRIPCION DE LA INCIDENCIA`, `OPERARIO`, `ESTADO`, `ACCION TOMADA`, `PROVEEDOR`, `FECHA`, `costo mano obra`, `COSTO`, `PLAN DE ACCION`, `REF. FACTURA`, `ID FACTURA`, `NOMBRE FACTURA`.

En filas antiguas, `PROPIEDAD` y `OPERARIO` son fórmulas `VLOOKUP` contra las tablas `Tabla_2` (pestaña `CODIGO_PROPIEDADES`) y `Tabla_4` (pestaña `OPERARIOS`). Las filas que crea la app llevan texto plano.

### Facturas en Drive
```
DRIVE_ROOT_FOLDER_ID (16FuhBMu4n-Pv8feGdtWQxyVjGtXzna-J)
└── PERIODO <TRIMESTRE> <AÑO>           ej. "PERIODO JULIO-AGOSTO-SEPTIEMBRE 2026"
    └── INCIDENCIAS
        └── <PROPIEDAD>                  ej. "APARTAMENTO OROPESA VISTAMAR IV"
            └── <MES>                    ej. "SEPTIEMBRE"
                └── <Nombre> <FAC-ID> <REF>.pdf     ej. "Tapa WC FAC-MU40AQFO-WGNE 014.pdf"
```
Copia espejo de cada factura: `DRIVE_PROPERTIES_ROOT_ID (1517c0MB86MKUh4Ehx8WwWA4f05c9YOQd) / <Propiedad> / <Año> / <Trimestre>`.

**Carpeta trimestral:** se usa la que tenga el año en el nombre. Si no hay ninguna, se usa una **genérica sin año** (hoy `ABRIL-MAYO-JUNIO` para abril–junio de 2026). Una carpeta con otro año nunca se usa. La regla está en `findQuarterFolder` y la repiten `scanDriveStructure` y `createQuarterlyStructure` ([E11](errores-y-soluciones.md#e11-administración-ignoraba-la-carpeta-trimestral-sin-año)).

**Nombre del archivo:** el que se escribe en "Nombre de la factura", luego el ID único `FAC-…` y, **al final**, la REF de 3 dígitos. `refFromFileName` lee la REF del final del nombre, así que el orden importa.

**REF:** número correlativo **por mes y compartido por todas las propiedades** (`getNextInvoiceRef` = máximo del mes + 1).

## IDs y referencias

| Qué | Valor |
|---|---|
| Spreadsheet de incidencias (en uso) | `1joSFjd6yZS9rjVwbXzuZSU1SVCScbEIVovSexqrO7ZE` ("PAGO A PROPIETARIOS NUEVO") |
| Spreadsheet "INCIDENCIAS" (creado en la migración abandonada, sin uso) | `1AX7UffufsU2XoLxosH5CZGYj8egdLj1gDYJlS30VnD8` |
| Sheet "ALOJAMIENTOS ACTIVOS" (lo lee el frontend) | `1Z1qYQ2ykQG2Kq1hO9K2PdjES_OvOR2d1yKPv7MdyAa4` |
| Drive raíz facturas | `16FuhBMu4n-Pv8feGdtWQxyVjGtXzna-J` |
| Drive raíz espejo | `1517c0MB86MKUh4Ehx8WwWA4f05c9YOQd` |
| Web App en producción | `https://script.google.com/macros/s/AKfycbwhQ4teH9bNt6HVNgYrKi_sfZ9HvujWQppcLaLIp80P2LbcpHPiNPcu6mWFU6eIUXcW/exec` |
| Cuenta dueña de Drive/Sheets | `rentalholidays.es@gmail.com` |
| Repo | `github.com/Arturex919/formulario_Incidencias` |

## Archivos heredados

`api.py`, `processor.py`, `public/data.json` y el `README.md` de la raíz son de una versión anterior (Flask + cuenta de servicio de Google Cloud que importaba un Excel). La app actual no los usa. Las credenciales de esa cuenta de servicio **no están en el repo** (`.gitignore` excluye `*.json`) y nunca se commitearon.
