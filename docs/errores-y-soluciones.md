# Errores y soluciones

Fallos reales del proyecto. Cada uno tiene el síntoma (el mensaje tal cual), la causa, el arreglo y cómo detectarlo si vuelve a pasar. Los más recientes van al final.

**Primera comprobación ante cualquier fallo del backend:** abrir en el navegador `<URL del Web App>?action=getNextRef&month=Septiembre&year=2026`. Si no devuelve JSON (`{"nextRef":"…"}`), la página de error de Google dice el motivo exacto.

---

## E1. La app seguía con una versión vieja del backend

**Síntoma:** después de "desplegar", la app se comportaba como antes.
**Causa:** se usó **"Nueva implementación"** en Apps Script. Eso crea una URL nueva; `GOOGLE_SCRIPT_URL` en `App.jsx` seguía apuntando a la implementación anterior, congelada en su versión.
**Solución:** redesplegar siempre sobre la implementación existente: Gestionar implementaciones → lápiz ✏️ → Nueva versión ([operacion.md](operacion.md#desplegar-el-backend-apps-script)).
**Cómo detectarlo:** comparar la URL de Gestionar implementaciones con `GOOGLE_SCRIPT_URL`.

## E2. `#REF!` al copiar la pestaña a otro spreadsheet

**Síntoma:** en el spreadsheet nuevo "INCIDENCIAS", toda la columna `PROPIEDAD` y parte de `OPERARIO` mostraban `#REF!`.
**Causa:** esas columnas son `=VLOOKUP(C2,Tabla_2[],2,FALSE)` y `=VLOOKUP(C2,Tabla_4[],2,FALSE)`. `Tabla_2` (pestaña `CODIGO_PROPIEDADES`) y `Tabla_4` (pestaña `OPERARIOS`) solo existen en el libro viejo.
**Solución aplicada:** para `PROPIEDAD`, pegado especial → solo valores. Después se abandonó la migración ([D2](decisiones.md#d2-seguir-en-el-spreadsheet-viejo-y-cachear)).
**Para la próxima vez:** antes de copiar una pestaña con fórmulas a otro archivo, convertirla a valores en el propio archivo de origen.

## E3. Historial y guardado muy lentos (2–50 s)

**Síntoma:** "Cargando historial..." durante decenas de segundos; "Enviar Incidencia" tarda.
**Causa:** `SpreadsheetApp.openById` sobre un libro con unas 7.500 fórmulas (PAGO PROPIETARIOS 2026: 1.145; RESERVAS: 2.073; GESTION: 1.730…). Google recalcula al abrir y al escribir.
**Solución:** caché del historial en `CacheService` ([D2](decisiones.md#d2-seguir-en-el-spreadsheet-viejo-y-cachear)) y caché corta en el frontend ([D10](decisiones.md#d10-caché-en-el-frontend-para-historial-y-administración)).
**Sigue abierto:** el guardado es lento por diseño del libro. Ver la mejora posible en D2.

## E4. Todo falla: `Identifier 'SPREADSHEET_ID' has already been declared`

**Síntoma:** la zona de subida mostraba "Se asignará la referencia **...**" y al subir salía "⚠️ Drive no confirma la factura ... en Septiembre 2026. No se ha guardado: revisa que exista la carpeta del trimestre." Las carpetas sí existían.
**Causa:** en el proyecto de Apps Script había **dos archivos `.gs`** con el mismo código (el original y uno nuevo llamado `incidencia2026`). Apps Script junta todos los `.gs` en un único ámbito, así que las constantes quedaban declaradas dos veces y el script entero no cargaba. Google respondía a cualquier llamada con:
```
SyntaxError: Identifier 'SPREADSHEET_ID' has already been declared (línea 1, archivo "incidencia2026")
```
**Solución:** dejar un solo `.gs` con el código y redesplegar.
**Lección:** el aviso "revisa la carpeta del trimestre" sale siempre que la subida no se confirma, sea cual sea la causa. Antes de mirar Drive, comprobar que el backend responde JSON.

## E5. Facturas subidas con REF `...`

**Síntoma:** en Drive, `tv valdelinares 066 FAC-MUCJSL1O-6PP0 ....pdf`.
**Causa:** mientras el backend no respondía ([E4](#e4-todo-falla-identifier-spreadsheet_id-has-already-been-declared)), `nextRef` se quedaba en su valor inicial `"..."` y la subida lo enviaba tal cual.
**Solución:** el frontend bloquea la subida hasta tener una REF numérica ("Esperando la referencia de Drive..."). Si al backend le llega una REF que no es un número, usa la siguiente libre.
**Limpieza pendiente:** ese archivo sigue en Drive ([operacion.md](operacion.md#pendientes-manuales)).

## E6. La caché se pasaba del límite con acentos

**Síntoma:** en la prueba local, `putAll` fallaba con trozos de 90.000 caracteres.
**Causa:** el límite de `CacheService` es de 100 KB **en bytes**, y `ñ`, `é` o `€` ocupan 2–3 bytes en UTF-8.
**Solución:** trozos de 30.000 caracteres (peor caso: 90 KB) y `putAll` dentro de `try` para que un fallo de la caché nunca rompa el historial.
**Detectado por:** prueba con un `CacheService` simulado que mide bytes, antes de desplegar.

## E7. Facturas borradas que seguían apareciendo

**Síntoma:** archivos enviados a la papelera de Drive seguían en el selector de referencias.
**Causa:** `Folder.getFiles()` y `getFolders()` de DriveApp también devuelven lo que está en la papelera.
**Solución:** `getMonthFiles` salta archivos, carpetas de propiedad y carpetas de mes con `isTrashed()`.

## E8. El selector muestra facturas que "ya no están"

**Síntoma:** "ya no tengo nada en septiembre porque lo borré y me sigue mostrando".
**Causa:** el usuario había vaciado `APARTAMENTO ALMAZORA II / SEPTIEMBRE`, pero el selector listaba septiembre de **todas** las propiedades. Los archivos estaban en otras propiedades (comprobado en Drive: `AGUA MARINA 3Ç … 007.jpg` en `APARTAMENTO OROPESA AGUA MARINA III / SEPTIEMBRE`).
**Solución:** selector filtrado por propiedad ([D7](decisiones.md#d7-selector-de-referencias-filtrado-por-propiedad)).
**Duplicados reales encontrados:** `001 Informe de Gestión de Propiedad Portofino.docx` subido dos veces (REF 003 y 004); `AGUA MARINA 3Ç … 007.jpg` y `AGUA MARINA 3 … 007.pdf` con la misma REF. Se evitan desde [D6](decisiones.md#d6-orden-obligatorio-y-bloqueo-de-duplicados-al-subir).

## E9. `findInvoiceSmart` mostraba la factura de otra propiedad

**Síntoma:** "Ver factura" abría una factura de otro alojamiento.
**Causa:** si no encontraba coincidencia por ID, nombre o REF, devolvía el primer archivo del mes, fuera de la propiedad que fuera.
**Solución (2026-09-21):** ese último recurso exige que la propiedad coincida. El botón "Ver factura" solo aparece si la incidencia tiene REF o ID de factura.

## E10. Administración decía "creado" aunque fallara

**Síntoma:** "✅ Estructura 2026 creada en Drive" sin que se hubiera creado nada.
**Causa:** las acciones usaban `fetch(..., { mode: 'no-cors' })`, que no permite leer la respuesta, y el mensaje de éxito era fijo.
**Solución:** `requestAdmin` lee la respuesta y solo muestra éxito con `success: true` ([D9](decisiones.md#d9-administración-confirma-con-la-respuesta-del-servidor)).

## E11. Administración ignoraba la carpeta trimestral sin año

**Síntoma (detectado en la prueba real, antes de llegar a producción):** abril–junio de 2026 vive en la carpeta `ABRIL-MAYO-JUNIO`, **sin año**, y la subida la usa. El escaneo nuevo solo aceptaba carpetas con año, así que la marcaba "Pendiente de crear". Pulsar "Preparar" habría creado `PERIODO ABRIL-MAYO-JUNIO 2026` vacía, y desde entonces la app habría usado esa y dejado de ver las facturas de abril–junio.
**Solución:** escaneo y preparación siguen la misma regla que la subida ([D8](decisiones.md#d8-una-sola-regla-para-elegir-la-carpeta-del-trimestre)).
**Verificado con:** simulación de Drive con los nombres reales de las carpetas. Las 4 tarjetas muestran la misma carpeta que usa la subida y "Preparar" no crea ninguna.

## E12. Un GET que escribe: `ensureMonths`

**Síntoma:** durante la prueba real (2026-09-23), una llamada GET de "solo lectura" a `ensureMonths` creó una carpeta vacía `ABRIL` dentro de `ABRIL-MAYO-JUNIO` (ID `1Xt0bllIrXMYZPzvgHlBjJy4UmCUFoMxX`).
**Causa:** `ensureMonthFolders` crea carpetas de mes que faltan y se exponía por GET.
**Solución:** función y acción eliminadas del código ([D11](decisiones.md#d11-eliminado-ensuremonthfolders)). Hasta el próximo redespliegue siguen existiendo en producción.
**Limpieza pendiente:** borrar esa carpeta `ABRIL` vacía ([operacion.md](operacion.md#pendientes-manuales)).
**Regla:** una acción GET nunca debe crear ni modificar nada.

## E13. Lodgify devolvía 0 propiedades sin error

**Síntoma:** Administración mostraba "0 de Lodgify · 0 manuales · 0 en total", sin ningún aviso. `?action=getProperties` devolvía `{"error":null,"lodgify":[],"manual":[],"all":[]}`.
**Causa:** el código leía la lista en `body.data`, y la API v2 de Lodgify la devuelve en `body.items`. La API key existe (si no, el error sería "Falta LODGIFY_API_KEY…").
**Solución:** leer `items` (con `data` de respaldo), paginar hasta una página incompleta, y devolver un error visible si llegan 0 propiedades, para que no se cachee en silencio.
**Pendiente de verificar:** no se ha podido probar contra Lodgify real (la key solo está en Apps Script). Tras redesplegar, `?action=getProperties` debe devolver nombres.

## E14. Respuestas 404 intermitentes del Web App

**Síntoma:** en la prueba con navegador, algunas llamadas (`getNextRef`, `getAllRefs`, `read`) devolvieron `404` tras la redirección a `script.googleusercontent.com`. En consola: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. En otra llamada, Google devolvió la página "No se puede abrir el archivo en estos momentos."
**Causa:** no confirmada. Pasó cuando el navegador lanzaba varias peticiones a la vez, y no se repitió con llamadas sueltas unos minutos después.
**Cómo actuar:** el Historial y Administración muestran el error y un botón para reintentar. Si se vuelve frecuente, reducir las llamadas en paralelo al abrir "Nuevo Reporte", que hoy lanza `getNextRef` y `getAllRefs` varias veces.

## E15. Administración cortaba el escaneo a los 60 s

**Síntoma (prueba real, 2026-09-23):** Administración mostraba "La consulta está tardando demasiado. Vuelve a intentarlo." y no aparecían los trimestres.
**Causa:** `requestAdmin` abortaba las consultas GET a los 60 s, y `scanStructure` en producción tardó 64 s medidos con curl. Consulta las carpetas de la raíz de Drive y el color de cada una.
**Solución:** mismo límite de 180 s para lecturas y escrituras.
**Mejora posible:** que `scanDriveStructure` solo pida el color de las carpetas del año elegido, no de todas las de la raíz.
