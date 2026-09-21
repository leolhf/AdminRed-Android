# Changelog v5.14.4 — Bonificaciones permanentes y de N meses

## Resumen

Se implementa el análisis completo de `Informe_Analisis_Bonificaciones.md`: las **bonificaciones** dejan de estar limitadas a "un mes o un solo pago" y ahora soportan **tres duraciones**: *permanente* (aplica todos los meses hasta que se anule), *N meses* (un rango de calendario, ej. jun–ago 2025) y *1 solo pago* (equivalente al viejo `soloPago`). Cada mes en que la bonificación descuenta en un cobro se registra en `aplicaciones[]` con el **valor congelado** (regla R2), de modo que los cobros ya emitidos no cambian si luego se edita el descuento.

La condición de vigencia, que estaba duplicada en 4 sitios, se centraliza en `RN.descuentos.vigenteEnMes()` con fallbacks que mantienen operativos los backups del esquema 7 y los checkpoints de undo (que no pasan por la migración). El cierre de mes ya no anula permanentes/N-meses, y anular una bonificación aplicada revierte su efecto en **todos** los cobros afectados.

**Migración de esquema 7 → 8**: los descuentos existentes reciben `vigencia` (`unPago` si `soloPago`, si no `meses`), `desde = mes`, `durMeses = 1` y `aplicaciones` (reconstruidas desde `cobroHid` si ya estaban aplicadas). La migración es reversible por los fallbacks: los datos viejos (backup v7 o undo) funcionan igual sin migrar.

**Decisiones del informe asumidas**: D1 (Duración solo para tipo `bonificacion`; afectación/ajuste conservan el select "Aplicación" clásico), D2 (N meses por calendario), D3 (el lote también recibe Duración), D4 (se mantiene "1 solo pago" como opción), D5 (modo `dias` solo puntuales de 1 mes).

---

## Modelo de datos

- **Nuevo registro de bonificación** (por descuento): `vigencia: 'permanente'|'meses'|'unPago'`, `desde: 'YYYY-MM'` (primer mes, por defecto el mes en curso), `durMeses: N` (solo para `meses`), `aplicaciones: [{ mes, cobroHid, valor }]` — una entrada por mes cobrado, con el valor congelado del momento del cobro (R2).
- **Nueva semántica de `estado: 'aplicado'`**: una bonificación pasa a `aplicado` **solo cuando ya no aplica a futuro** — los puntuales clásicos y `unPago` al primer cobro; las de N meses, al cobrar el último mes del rango; las permanentes, nunca (siempre `pendiente`/activa). Mientras aplica a futuro, cada cobro añade su aplicación y el estado sigue `pendiente`.
- **Fallbacks de lectura** ("regla de oro" para esquema 7): `vigenciaDe = vigencia || (soloPago ? 'unPago' : 'meses')`, `desdeDe = desde || mes`, y `aplicaciones` vacías + `cobroHid` legado se unifican vía `_aplicacionesDe()`.

## Núcleo — helpers de vigencia (`js/core/calculations.js`)

Se añade `RN.descuentos.*` junto a `RN.calc.getDescuentoRecurrente`:

- `vigenciaDe(d)`, `desdeDe(d)`, `venceEnMes(d)` (null para permanente/unPago; `desde + (durMeses-1)` para meses), `vigenteEnMes(d, mes)`, `aplicaAFuturo(d, mes)`, `aplicarEnMes(d, mes, cobroId, valor)`, `rangoVigencia(d)` (texto legible: "Permanente", "1 solo pago", "jun–ago 2025 (3 meses)"), `esPuntualDeMes(d, mes)`.
- `RN.calc.getDescuentosPuntualesMes(clienteId, mes)` refactorizado para filtrar con `vigenteEnMes()`. **Se conserva a propósito** que las `aplicado` de su propio mes sigan contando: el precio neto de un mes ya pagado debe cuadrar con lo que se cobró.
- La condición de vigencia antes duplicada en **4 sitios** (calculations.js, modal-cobro.js ×2, month-reset.js) ahora vive en un único helper.

## Migración (`js/core/migration.js`)

- `VERSION_ESQUEMA` 7 → 8. Bloque `v < 8`: asigna `vigencia`/`desde`/`durMeses` a cada descuento y reconstruye `aplicaciones` desde el `cobroHid` legado cuando `estado === 'aplicado'`.

## Cobro — aplicación multi-mes (`js/cobros/modal-cobro.js`)

- `confirmar()` registra `aplicaciones.push({ mes, cobroHid, valor })` con el valor congelado y marca `aplicado` solo cuando la bonificación ya no aplica a futuro (el cambio "más delicado" del informe: no matar una bonificación de N meses tras su primer mes).
- Panel de descuentos: encabezado "Descuentos y bonificaciones del mes", columna **Vigencia** con badges (Permanente = ok verde, N meses = por azul con rango, 1 solo pago = warn ámbar), tabla a 6 columnas y fila vacía ajustada.
- Ambos filtros de descuentos del mes (`descPunt` del panel y `descuentosAplicar` de confirmar) usan ahora `vigenteEnMes()`.

## Cierre de mes (`js/cobros/month-reset.js`)

- Solo se anulan los **puntuales clásicos** del mes no aplicados (`esPuntualDeMes`: `pendiente` + `meses` + `durMeses 1` + `desde === mes`). Las permanentes y N-meses **no se anulan**.
- El mensaje de confirmación aclara el conteo solo de puntuales y añade el aviso (R11): "ℹ️ Hay N bonificación(es) activa(s) que continúan en meses siguientes (no se anulan)."

## UI de descuentos (`js/cobros/descuentos.js`)

- **Modal nuevo/editar**: para tipo `bonificacion` (y modo que no sea `dias`, D5), el select binario "Aplicación" se sustituye por **"Duración"**: *Permanente / N meses (input ≥ 2) / 1 solo pago*. Para afectación/ajuste (y modo `dias`) se mantiene el select clásico mes/solo pago (D1).
- **Lote** (D3): mismo selector de Duración; cada cliente del lote recibe su registro con vigencia/desde/durMeses.
- **`eliminar()`**: si la bonificación tiene aplicaciones (permanente activa o aplicada), pregunta "¿Anularlo y revertir su efecto en el/los cobro(s)? Se revertirá en N cobro(s) por un total aproximado de X CUP" y revierte **todos** los cobros usando los valores congelados (`aplicaciones[].valor`, con fallback al cálculo actual solo si el valor congelado es nulo, p. ej. registros migrados). La reversión recalcula `monto/totalCUP/totalAPagar/tipoPago/falta/excedente` del cobro (lógica BUG-2).
- **`revertirPorCobro(cobroId)`** (al eliminar un cobro): quita solo la aplicación de ese mes; si no quedan aplicaciones, restaura `pendiente`. Una bonificación de 3 meses con el mes de julio liberado puede volver a aplicar si se re-cobra julio.

## Vista de Gestión (`js/reportes/descuentos-view.js` + `index.html`)

- Columna **"Mes"** sustituida por **"Vigencia"** (texto `rangoVigencia`: "Permanente", "jun–ago 2025 (3 meses)", "jun 2025"). La celda Tipo incorpora el badge de vigencia.
- El filtro por mes pasa a semántica "aplica a ese mes" (`vigenteEnMes`), y el selector de meses se construye también desde `desde` (`mesesConDatos(descuentos, 'desde')`).
- Estado: `permanente` pendiente = "Activa" (ok verde), N-meses pendiente = "Activa" (por azul).
- **CSV** (`exportCSV`): nuevas columnas `vigencia, desde, vence, durMeses, aplicaciones`. ⚠️ Cambia el orden de columnas del CSV exportado — los análisis externos que dependan del orden anterior deben actualizarse.

## Validación (`js/core/validacion.js`)

- Descuentos: `vigencia` ∈ {meses, permanente, unPago}; `desde` formato `YYYY-MM`; `durMeses` entero ≥ 1 cuando `vigencia === 'meses'`; `modo 'dias'` exige vigencia puntual de 1 mes (D5); `aplicaciones` dentro del rango de vigencia (`venceEnMes`) y referenciando cobros existentes.

## Tests (`js/tests/tests-calculo.js`)

7 tests nuevos (115 pasan / 0 fallan en el harness Node):

1. `_testBonificacionNMeses` — 3 meses: aplica en M, M+1, M+2 y **no** en M+3; estado `pendiente` en intermedios, `aplicado` al último; `getDescuentosPuntualesMes` incluye aplicadas dentro del rango.
2. `_testBonificacionPermanente` — aplica desde `desde` en adelante, nunca hacia atrás; sigue `pendiente` tras cobros; en modo `%`, aplica sobre el precio base de cada mes (500 y luego 450).
3. `_testUnPagoSeConsumeUnaVez` — se consume al primer cobro (estado `aplicado`), no reaparece al mes siguiente; `aplicaciones.length === 1`.
4. `_testCierreNoAnulaMultiMes` — `monthReset`-lógica `esPuntualDeMes`: la de 3 meses y la permanente no se anulan; el puntual clásico sí.
5. `_testRevertirPorCobroLiberaMes` — al eliminar el cobro de julio, la aplicación de julio se quita, vuelve a `pendiente` y julio vuelve a aplicar.
6. `_testAnularAplicadaRevieveTodos` — anular una aplicada con 2 aplicaciones revierte ambos cobros con los valores congelados (100 + 100) y recalcula `tipoPago` (el cobro pasa a `parcial`: faltan 100).
7. `_testLegadoEsquema7` — registros sin campos nuevos (backup v7 / undo) quedan operativos: `d1` puntual clásico de junio, `d2` `soloPago` interpretado como `unPago`, `d3` aplicado cuenta en su propio mes (cuadre con lo pagado) pero no revive en julio; `_aplicacionesDe` reconstruye la aplicación legada desde `cobroHid`.

## Correcciones incluidas

- **Expectativa obsoleta en tests** (pre-existente, detectada al ejecutar los tests de v5.14.3 en el harness): `getStatus: inactivo -> ok` esperaba `'ok'`, pero el código devuelve correctamente `'inactivo'` desde v5.13.6 (BUG-6). Corregida a `'inactivo'` con comentario explicativo.

## Documentación

- `MODELO.md` §6: nueva subsección **6.1 Vigencia de las bonificaciones** (modelo, R2 valores congelados, semántica de `aplicado`, cierre de mes, anulación/reversión, vista y decisiones D1/D5).
- `README.md`: sección "Qué pasa cuando cambia de mes" actualizada — "Descuentos puntuales y bonificaciones" explica duraciones y no-anulación al cierre; "Resumen" menciona que las permanentes/N-meses no se anulan.
- `js/cobros/descuentos.js`: comentario de cabecera actualizado a v5.14.4.

## Otros

- **VERSION**: `APP_VERSION` sube de `5.14.3` a `5.14.4` (`js/version.js`). El Service Worker (`sw.js`) toma la versión dinámicamente, así que la caché se invalida automáticamente al actualizar.
- **Docs técnicas** (sin cambio de código): `js/tests/_harness.js` — harness Node para ejecutar `RN.tests.ejecutar()` fuera del navegador (stubs de `RN.notifyUI/render` + módulos reales `investment/moneda/calculations/migration/descuentos`). Es un archivo de desarrollo, no se referencia desde `index.html`.

## Archivos modificados

`js/version.js` · `js/core/calculations.js` · `js/core/migration.js` · `js/core/validacion.js` · `js/cobros/descuentos.js` · `js/cobros/modal-cobro.js` · `js/cobros/month-reset.js` · `js/reportes/descuentos-view.js` · `js/tests/tests-calculo.js` · `index.html` · `MODELO.md` · `README.md` · `CHANGELOG.md`
