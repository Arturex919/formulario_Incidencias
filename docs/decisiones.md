# Decisiones

Cada entrada dice qué se decidió, por qué y qué se descartó. Si una decisión cambia, se añade una entrada nueva que la sustituye; la antigua no se borra.

---

## D1. Apps Script desplegado a mano

**Decisión:** el backend vive en script.google.com y se publica a mano. `google-apps-script/Code.gs` es un espejo del código.
**Por qué:** así se montó desde el principio; no hay clasp ni credenciales de CI configuradas.
**Consecuencia:** cualquier cambio de `Code.gs` **no llega a producción** hasta pegarlo y redesplegar la implementación existente ([operacion.md](operacion.md#desplegar-el-backend-apps-script)). Ya causó dos incidentes ([E1](errores-y-soluciones.md#e1-la-app-seguía-con-una-versión-vieja-del-backend), [E4](errores-y-soluciones.md#e4-todo-falla-identifier-spreadsheet_id-has-already-been-declared)).
**Descartado de momento:** clasp + GitHub Actions. Evitaría pegar a mano, pero pide credenciales de la cuenta de Google en CI.

## D2. Seguir en el spreadsheet viejo y cachear

**Fecha:** 2026-09-23. **Sustituye a:** la migración a un spreadsheet dedicado "INCIDENCIAS" (2026-09-22).
**Decisión:** las incidencias siguen en "PAGO A PROPIETARIOS NUEVO". La lentitud se ataca con `CacheService`: `read` sirve el historial desde caché durante 5 minutos y solo abre el libro si la caché está vacía. Guardar o borrar vacía la caché.
**Por qué:** la migración rompió las fórmulas `VLOOKUP` de `PROPIEDAD` y `OPERARIO`, que dependen de tablas del libro viejo ([E2](errores-y-soluciones.md#e2-ref-al-copiar-la-pestaña-a-otro-spreadsheet)). Se decidió quedarse con un solo libro, el viejo, y atacar la lentitud desde el código.
**Consecuencias:**
- Cargar el historial por segunda vez es casi instantáneo. La primera vez después de un guardado sigue siendo lenta.
- **Guardar sigue siendo lento:** Google recalcula unas 7.500 fórmulas del libro en cada escritura. Eso no se arregla desde el código.
- Lo que se cambia a mano en la hoja tarda hasta 5 minutos en verse.
- `CacheService` limita cada valor a 100 KB, así que el JSON se guarda en trozos de 30.000 caracteres ([E6](errores-y-soluciones.md#e6-la-caché-se-pasaba-del-límite-con-acentos)).
**Si hace falta más velocidad al guardar:** convertir a valores las pestañas históricas que ya no cambian (PAGO PROPIETARIOS 2025, ANTIGUA PAGO PROPIETARIOS 2025, INCIDENCIA). Lo tiene que decidir el equipo, porque esas fórmulas dejarían de actualizarse.

## D3. Estructura de Drive: Trimestre / INCIDENCIAS / Propiedad / Mes

**Fecha:** 2026-09-11.
**Decisión:** las facturas de incidencias van en una subcarpeta `INCIDENCIAS`, separada de `GASTO DE EMPRESA`, y dentro por propiedad y mes. Además se hace una copia espejo por propiedad (`Facturas-Incidencias/<Propiedad>/<Año>/<Trimestre>`).
**Por qué:** poder encontrar las facturas por alojamiento sin perder la organización por trimestre que ya existía en Drive (commit `c9e6ed2`).
**Consecuencia:** las facturas del esquema viejo (`Trimestre/Mes`, sin `INCIDENCIAS`) no aparecen en la app hasta ejecutar `migrateOldInvoicesToIncidencias(año)`. Si se borra una factura a mano, hay que borrarla en los dos sitios.

## D4. El nombre del archivo en Drive es el nombre que escribe el usuario

**Fecha:** 2026-09-23.
**Decisión:** archivo = `<Nombre de la factura> <FAC-ID> <REF>.<ext>`. El nombre original del archivo (p. ej. `image003.png`) solo se usa si el nombre llega vacío.
**Por qué:** los archivos se llamaban `image003 …` o `001 Informe … .docx …` y no había forma de encontrarlos.
**Restricción:** la REF va **siempre al final**, porque `refFromFileName` la lee de ahí. El `FAC-ID` va delante.

## D5. REF por mes, compartida entre propiedades

**Decisión:** la REF es el máximo de las REF del mes (todas las propiedades) + 1.
**Por qué:** es como funciona el código desde la v12 (`getNextInvoiceRef`); no se ha cambiado.
**Consecuencia:** el selector de referencias filtra por propiedad ([D7](#d7-selector-de-referencias-filtrado-por-propiedad)), pero el número sigue siendo del mes completo, así que dentro de una propiedad verás saltos (p. ej. 003, 007, 012).

## D6. Orden obligatorio y bloqueo de duplicados al subir

**Fecha:** 2026-09-23.
**Decisión:** no se puede subir una factura hasta que (1) haya una REF numérica, (2) haya propiedad y (3) haya nombre. Además se bloquea si ese nombre ya existe para la misma propiedad y mes, o si la incidencia ya tiene factura.
**Por qué:** se subían facturas duplicadas (el mismo informe con REF 003 y 004) y con REF `...` ([E5](errores-y-soluciones.md#e5-facturas-subidas-con-ref-)).
**Descartado:** detectar duplicados comparando el contenido del archivo (hash). Es más código del que pide el problema; el nombre + propiedad + mes cubre los casos reales.

## D7. Selector de referencias filtrado por propiedad

**Fecha:** 2026-09-23.
**Decisión:** con una propiedad elegida, el desplegable solo muestra sus facturas del mes. Sin propiedad, muestra todas.
**Por qué:** mostraba las de todas las propiedades y parecía que había duplicados o que no se habían borrado ([E8](errores-y-soluciones.md#e8-el-selector-muestra-facturas-que-ya-no-están)).

## D8. Una sola regla para elegir la carpeta del trimestre

**Fecha:** 2026-09-23.
**Decisión:** la subida (`findQuarterFolder`), el escaneo de Administración (`scanDriveStructure`) y "Preparar trimestres" (`createQuarterlyStructure`) usan la misma regla: la carpeta con el año exacto manda; si no hay, la genérica sin año; nunca una de otro año.
**Por qué:** si Administración usa otra regla, puede crear una carpeta nueva y la app deja de ver las facturas de la antigua ([E11](errores-y-soluciones.md#e11-administración-ignoraba-la-carpeta-trimestral-sin-año)).
**Mejora futura:** renombrar `ABRIL-MAYO-JUNIO` a `PERIODO ABRIL-MAYO-JUNIO 2026` en Drive y dejar de depender de carpetas sin año.

## D9. Administración confirma con la respuesta del servidor

**Fecha:** 2026-09-23.
**Decisión:** las acciones de Administración usan `requestAdmin` (POST `text/plain`, sin `no-cors`) y solo muestran éxito si el servidor devuelve `success: true`. Hay un `LockService` para que no corran dos a la vez, y se validan año, trimestres y colores.
**Por qué:** antes usaban `no-cors`, no podían leer la respuesta y mostraban "✅ creado" aunque fallara ([E10](errores-y-soluciones.md#e10-administración-decía-creado-aunque-fallara)).
**Por qué no se aplica igual a guardar incidencia y subir factura:** funcionan y se comprueban de otra forma (la subida se verifica pidiendo la lista del mes). Cambiarlas no tiene beneficio claro y sí riesgo.

## D10. Caché en el frontend para Historial y Administración

**Decisión:** el historial se reutiliza durante 1 minuto al volver a la pestaña; el escaneo de Drive, 1 minuto; las propiedades, 5 minutos. Los botones "Actualizar historial", "Escanear Drive" y "Actualizar propiedades" fuerzan la recarga. Guardar o borrar invalida el historial.
**Por qué:** cada consulta al Apps Script tarda entre 2 y 60 segundos, y cambiar de pestaña no debería repetirla.

## D11. Eliminado `ensureMonthFolders`

**Fecha:** 2026-09-23.
**Decisión:** se eliminó la acción `ensureMonths` y su función.
**Por qué:** nadie la llamaba. Era un **GET que crea carpetas** y, según la versión, las creaba en el sitio equivocado (`Trimestre/<MES>` o `INCIDENCIAS/<MES>`). En este último caso la app las habría tomado por una propiedad llamada "ENERO". Ver [E12](errores-y-soluciones.md#e12-un-get-que-escribe-ensuremonths).
