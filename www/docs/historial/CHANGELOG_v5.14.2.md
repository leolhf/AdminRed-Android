# Changelog v5.14.2 — Auditoría de Reportes: 22 de 23 hallazgos corregidos

## Resumen

Se implementaron todas las correcciones propuestas en `AUDITORIA_Reportes_v5_13_20.md` (23 hallazgos sobre `js/reportes/*` y archivos relacionados). De los 23, **22 requerían cambios de código** y quedaron implementados; **UI-4** (leyenda de colores del calendario) ya estaba implementada desde v5.13.11 y no requirió cambios — la auditoría quedó desactualizada en ese punto.

---

## BUG (7/7 corregidos)

- **BUG-1** (`calendario.js`): `_recordarTodosDia` ahora usa el mes **visualizado** (`ym`) en vez del mes operativo real para filtrar clientes pendientes y `mesInicioCliente`. Antes, al navegar el calendario a un mes pasado/futuro, el recordatorio masivo del día usaba criterios del mes actual.
- **BUG-2** (`calculations.js`): `RN.calc.getStatus(cliente, mes)` ahora acepta un parámetro `mes` **opcional** (100% retrocompatible — fallback al mes operativo). Antes siempre usaba `mesActualStr()` internamente, así que `resumenCliente(cliente, mesPasado)` ignoraba el mes solicitado y el calendario mostraba el estado del mes actual en TODAS las celdas. Para un mes distinto al operativo: un mes pasado sin cobro → `due`; un mes futuro → `ok` (la lógica de "día de pago + gracia", que depende del reloj de hoy, solo aplica al mes operativo actual).
- **BUG-3** (`salud.js`): `esperado` e `ingresos` ya no son código muerto — alimentan el nuevo KPI **"Cobranza real vs esperado"**.
- **BUG-4** (`reporte-mensual.js`): ya no se genera un snapshot "fantasma" solo para comprobarlo (gastaba CPU sin usarse). Ahora se verifica con `RN.state.snapshots.some(...)` y se muestra un badge **"Mes cerrado"** en el título cuando corresponde.
- **BUG-5** (`salud.js`): semáforo reescrito con umbrales `umbralVerde`/`umbralAmbar` nombrados según su función real (antes `okMax`/`warnMax` sugerían lo contrario de lo que hacían).
- **BUG-6** (`calculations.js`): `proxReciboNum()` documentada explícitamente como función **pura de solo lectura** — no muta `RN.state.reciboCounter`. El incremento atómico real sigue ocurriendo en `modal-cobro.js` al guardar el cobro.
- **BUG-7** (`reporte-mensual.js`): `cmp()` ya no muestra `+0 CUP (+0%)` en verde cuando no hay cambio (ahora dice "sin cambios" en gris), ni `(0%)` engañoso cuando el mes anterior fue 0 y el actual es positivo (ahora dice "(nuevo)").

## LOG (4/4 corregidos/documentados)

- **LOG-1** (`calculations.js`): `cobranzaMes(mes)` ahora pasa `mes` a `getStatus()` al calcular `parciales` — antes ese campo siempre reflejaba el mes operativo actual aunque se pidiera cobranza de otro mes.
- **LOG-2** (`historial-mensual.js`): documentado explícitamente que la agrupación usa el mes de **servicio** (`h.mes`), no la fecha real de pago — es intencional y consistente con `historial.filtrar()`.
- **LOG-3** (`estadisticas.js`): los KPIs ahora indican en su etiqueta si son **"(acumulado)"** o **"(mes actual)"**, para no mezclar periodos sin distinción.
- **LOG-4** (`prediccion.js`): corregido el texto del modal — decía "media móvil de 3 meses", la implementación real usa regresión lineal de 6 meses.

## DUP (4/4 extraídos a helpers)

- **DUP-1**: nuevo `RN.chart.barra()` / `RN.chart.grupoMes()` en `calculations.js`, usado por `prediccion.js` y `tendencia.js` (antes duplicaban la lógica de barras con divs).
- **DUP-2**: nuevo `RN.export.toCSV(rows)` en `export.js`, usado por `historial.js`, `descuentos-view.js` y `export.js` (antes cada uno repetía su propio escape CSV).
- **DUP-3**: reemplazadas todas las instancias de `RN.state.clients.find(x => x.id === ...)` por `RN.calc.clientePorId(...)` en `recibo.js` y `descuentos-view.js`.
- **DUP-4**: nuevos `RN.calc.listaMeses(n)` (últimos N meses) y `RN.calc.mesesConDatos(arr, campo)` (meses únicos de un array), usados en `render.js` (selector de reporte mensual) y `descuentos-view.js` (filtro de meses).

## CODE (4/4 corregidos)

- **CODE-1** (`recibo.js`): `ver()` cachea el cobro en `RN.recibo._ultimoRecibo`; `imprimir()` lo reutiliza si el id coincide, evitando una segunda búsqueda lineal.
- **CODE-2** (`calendario.js`): evaluado — el diseño actual (`_rnCalClick` con limpieza previa del handler) ya es correcto y de bajo riesgo; se documentó la decisión en vez de forzar un refactor mayor de bajo beneficio.
- **CODE-3** (`salud.js`): `_semaforo` y `_card` se movieron fuera de `render()` (ya no se recrean como closures en cada llamada).
- **CODE-4** (`export.js`): `RN.export.descargar()` ahora antepone BOM UTF-8 (`\uFEFF`) a los CSV, para que Excel muestre correctamente los acentos.

## UI (3/4 corregidos, 1 ya implementado)

- **UI-1** (`reporte-mensual.js`): la exportación genera un texto plano **estructurado** (`RN.reporteMensual._generarTexto`) en vez de volcar el `innerText` del HTML renderizado.
- **UI-2** (`render.js` + `historial.js`): cuando hay más de 50 cobros, se muestra "Mostrando 50 de N cobros" con un botón **"Ver todos"** (`RN.historial.verTodos()`) que abre el historial completo en un modal, con exportación CSV incluida.
- **UI-3** (`salud.js`): se añadió "Mes operativo: {mes}" en el encabezado del dashboard de salud.
- **UI-4**: ya implementada desde v5.13.11 (leyenda de colores del calendario en `index.html`) — sin cambios necesarios.

---

## Archivos modificados

- `js/core/calculations.js` — `getStatus`, `resumenCliente`, `cobranzaMes`, `proxReciboNum`, nuevos `listaMeses`, `mesesConDatos`, `RN.chart.barra`/`grupoMes`
- `js/reportes/calendario.js` — `_recordarTodosDia`, comentario en `_bindModalAcciones`
- `js/reportes/salud.js` — reescrito (semáforo, KPI nuevo, periodo visible)
- `js/reportes/reporte-mensual.js` — reescrito (badge "Mes cerrado", cmp() corregido, export estructurado)
- `js/reportes/estadisticas.js` — etiquetas de periodo
- `js/reportes/prediccion.js` — texto corregido + helper de chart
- `js/reportes/tendencia.js` — helper de chart
- `js/reportes/historial-mensual.js` — comentario de diseño
- `js/reportes/historial.js` — CSV centralizado + `RN.historial.verTodos()`
- `js/reportes/descuentos-view.js` — CSV centralizado, `clientePorId`, `mesesConDatos`
- `js/reportes/recibo.js` — `clientePorId`, cache de recibo
- `js/storage/export.js` — BOM UTF-8, `RN.export.toCSV`
- `js/ui/render.js` — selector de meses con `listaMeses`, aviso + botón "Ver todos"
- `index.html` — aviso de límite del historial
- `js/version.js` — `APP_VERSION` → `5.14.2`
