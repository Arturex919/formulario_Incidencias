# Operación

## Desplegar el backend (Apps Script)

El código de `google-apps-script/Code.gs` **no se publica solo** ([D1](decisiones.md#d1-apps-script-desplegado-a-mano)).

1. Abre el proyecto en script.google.com con la cuenta `rentalholidays.es@gmail.com`.
2. En "Archivos" (izquierda) tiene que haber **un solo** archivo `.gs`. Si hay dos, borra el sobrante: con dos, nada funciona ([E4](errores-y-soluciones.md#e4-todo-falla-identifier-spreadsheet_id-has-already-been-declared)).
3. Sustituye todo su contenido por el de `Code.gs` y guarda.
4. **Implementar → Gestionar implementaciones → lápiz ✏️** sobre la implementación existente (la de la URL `AKfycbwhQ4te…`) → Versión: **Nueva versión** → Implementar.
5. **Nunca** uses "Nueva implementación": crea otra URL y la app sigue con la vieja ([E1](errores-y-soluciones.md#e1-la-app-seguía-con-una-versión-vieja-del-backend)).
6. Comprueba que Project Settings → Script Properties tiene `LODGIFY_API_KEY`.

**Verificar el despliegue** (abrir en el navegador):
- `…/exec?action=getNextRef&month=Septiembre&year=2026` → `{"nextRef":"0xx"}`.
- `…/exec?action=scanStructure&year=abc` → con el código actual debe devolver `{"error":"Error: Año inválido"}`. Si devuelve carpetas, producción sigue con el código viejo.
- `…/exec?action=getProperties` → `all` con nombres. Si sale `"Lodgify respondió sin propiedades…"`, revisa la key o el formato de la API ([E13](errores-y-soluciones.md#e13-lodgify-devolvía-0-propiedades-sin-error)).

## Desplegar el frontend

`npm run build` genera `dist/`. El repo no tiene configuración de hosting (ni `vercel.json` ni workflows), así que el destino del despliegue no está documentado aquí. **Completar esta sección con dónde está publicada la app y cómo se sube.**

## Pruebas

| Comando | Qué prueba | Toca producción |
|---|---|---|
| `npm run build` | Que el frontend compila. | No |
| `node scripts/check-history.mjs` | Historial con respuestas simuladas de Google. | No |
| `node scripts/prueba-real.mjs` | La app real contra el Apps Script de producción: Nuevo Reporte (REF numérica, subida bloqueada), Historial (carga filas), Administración (4 trimestres con carpeta, propiedades > 0) y Ayuda. **Bloquea todos los POST**: no guarda ni sube nada. Tarda 1–3 min. | Solo lectura |

Los dos scripts de Playwright necesitan `playwright` instalado o `PLAYWRIGHT_MODULE=<ruta>/node_modules/playwright/index.mjs`.

**Resultado del 2026-09-23 (producción aún sin redesplegar):** Nuevo Reporte ✅, Historial ✅, trimestres ✅ (4 carpetas, todas "Sin color"), propiedades ❌ "Lodgify devolvió 0 propiedades" ([E13](errores-y-soluciones.md#e13-lodgify-devolvía-0-propiedades-sin-error), arreglado en el repo, pendiente de desplegar).

**Cuidado al probar a mano:** las acciones GET no deberían escribir, pero `getMonthFiles` crea `INCIDENCIAS` si falta, y la versión en producción aún tiene `ensureMonths`, que crea carpetas ([E12](errores-y-soluciones.md#e12-un-get-que-escribe-ensuremonths)).

## Cada enero

1. En "PAGO A PROPIETARIOS NUEVO", crea la pestaña `INCIDENCIA <año nuevo>` con las mismas cabeceras (ver [contexto](contexto.md#incidencias)). El código la encuentra solo por el año.
2. En la app, Administración → elige el año nuevo → elige un color para cada trimestre → "Preparar trimestres seleccionados".
3. Opcional: "Crear carpetas de propiedades" para el año nuevo.
4. Tras un cambio de esquema en Drive: en el editor de Apps Script, ejecuta `migrateOldInvoicesToIncidencias("<año>")` (▶). Solo mueve archivos, no borra.

## Pendientes manuales

Estado a 2026-09-23.

- [ ] **Redesplegar el Apps Script** con el `Code.gs` actual. Producción sigue en una versión anterior (acepta `year=abc` y tiene `ensureMonths`). Sin esto no llegan los arreglos de Lodgify, papelera, Administración ni carpeta sin año.
- [ ] **Desplegar el frontend** (`main` actual).
- [ ] Después, ejecutar `node scripts/prueba-real.mjs` y comprobar que pasa entero.
- [ ] Borrar la carpeta vacía `ABRIL` (ID `1Xt0bllIrXMYZPzvgHlBjJy4UmCUFoMxX`) dentro de `ABRIL-MAYO-JUNIO`. La creó una prueba ([E12](errores-y-soluciones.md#e12-un-get-que-escribe-ensuremonths)).
- [ ] Revisar los duplicados de septiembre en Drive y en su copia espejo ([E8](errores-y-soluciones.md#e8-el-selector-muestra-facturas-que-ya-no-están)): Portofino REF 003/004, Agua Marina REF 007 ×2, `tv valdelinares … ....pdf`.
- [ ] **Colores de carpeta "Sin color":** Administración muestra "Sin color" en los 4 trimestres, aunque en Drive las carpetas sí tienen color. `getFolderColorById` usa el servicio avanzado `Drive`. Lo más probable es que no esté activado en el proyecto (Servicios → + → Drive API). Sin confirmar.
- [ ] Opcional: renombrar `ABRIL-MAYO-JUNIO` a `PERIODO ABRIL-MAYO-JUNIO 2026` para no depender de carpetas sin año ([D8](decisiones.md#d8-una-sola-regla-para-elegir-la-carpeta-del-trimestre)).
- [ ] Opcional: actualizar o borrar el `README.md` de la raíz, que describe la arquitectura antigua.
