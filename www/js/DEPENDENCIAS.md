# DEPENDENCIAS.md — Orden de carga de scripts

Al no usar bundler, el orden de los `<script>` en `index.html` es **crítico**.
Un módulo que use funciones de otro debe cargarse **después** de él.

## Orden general

### 1. CORE
1. `js/version.js` — sin dependencias, carga primero
2. `js/core/state.js` — define variables globales (RN.state). **Debe ser el primero de core**
3. `js/core/keys.js` — constantes de storage (antes de cualquier módulo que use localStorage/IndexedDB)
4. `js/core/config.js` — configuración
5. `js/core/crypto.js` — cifrado AES-GCM
6. `js/core/calculations.js` — cálculos de negocio (antes de render.js)
7. `js/core/moneda.js` — doble moneda
8. `js/reset-app.js` — reseteo
9. `js/core/models/investment.js` — modelo de deuda de equipo (antes de render.js, inversion.js, migration.js)
10. `js/core/migration.js` — migraciones
11. `js/core/checkpoint.js` — checkpoints (antes de undo.js)
12. `js/core/undo.js` — deshacer/rehacer
13. `js/core/validacion.js` — validación de integridad

### 2. STORAGE
14. `js/storage/storage-local.js` — persistencia localStorage
15. `js/storage/storage-file.js` — File System Access API + cifrado
16. `js/storage/export.js` — export/import respaldos, CSV
16b. `js/storage/autobackup.js` — respaldo automático en IndexedDB (v5.11.2)

### 3. UI
17. `js/ui/theme.js` — temas
18. `js/ui/notify-ui.js` — toasts
19. `js/ui/reloj.js` — reloj
20. `js/ui/tabs.js` — navegación por pestañas
21. `js/ui/render.js` — render principal (usa calculations.js, investment.js; v5.15: genera onclick a `RN.descuentos.abrirParaCliente` y usa `RN.descuentos.vigenteEnMes` + `RN.calc.valorDescuento` — ver regla de abajo)
22. `js/ui/inline-edit.js` — edición inline
23. `js/ui/ui-components.js` — modal, confirm, prompt

### 4. CLIENTES
24. `js/clientes/modal-cliente.js` — CRUD clientes
25. `js/clientes/confirm-delete.js` — confirmación borrado
26. `js/clientes/client-history.js` — historial por cliente

### 5. COBROS
27. `js/cobros/modal-cobro.js` — registro de cobro
28. `js/cobros/mora.js` — mora
29. `js/cobros/inversion.js` — inversión personal (usa investment.js)
30. `js/cobros/inventario.js` — venta/asignación de inventario
31. `js/cobros/descuentos.js` — descuentos puntuales y bonificaciones (v5.15: formularios de gestión central; lo usan descuentos-view.js, render.js y modal-cobro.js)
32. `js/cobros/month-reset.js` — cierre de mes

### 6. REPORTES
33. `js/reportes/historial.js`
34. `js/reportes/historial-mensual.js`
35. `js/reportes/tendencia.js`
36. `js/reportes/prediccion.js`
37. `js/reportes/estadisticas.js`
38. `js/reportes/reporte-mensual.js`
39. `js/reportes/recibo.js`
40. `js/reportes/calendario.js`
41. `js/reportes/salud.js`
42. `js/reportes/descuentos-view.js` — vista Finanzas → Descuentos (v5.15: botón 🎁 Nueva + lote + KPIs; usa descuentos.js)
42b. `js/reportes/ganancia-cortes.js` — modales de resumen de los KPIs del Panel (v5.15.1: Ingresos del mes, Ganancia proyectada y Ganancia del mes por corte; v5.15.2: reparto del costo del paquete por corte con sobreventa como ganancia directa + modal Utilidad neta; usa calculations.js, ciclos.js, investment.js, render.js y ui-components.js)
42c. `js/panel/panel-widgets.js` — widgets enriquecidos del Panel (v5.16.0: tendencia de 6 meses, deltas ▲/▼ vs mes anterior, "Requiere tu atención", próximos cortes, rentabilidad por mega + sobreventa, caja proyectada; v5.17.0: widget "Reserva de caja" + alerta de reserva no cubierta; v5.18.0: la reserva se calcula sobre la ganancia proyectada del mes; usa calculations.js, ciclos.js, moneda.js, investment.js, render.js, tasa-aviso.js y ganancia-cortes.js)

### 7. NOTIFICACIONES
43. `js/notificaciones/notifications.js`
44. `js/notificaciones/whatsapp.js` (usa wa-templates.js)
45. `js/notificaciones/wa-templates.js`

### 8. OTROS
46. `js/red/equipos-red.js`
47. `js/paquete/modal-paquete.js`
48. `js/paquete/modal-paquete-proveedor.js` — pago al proveedor (megas × precio/mega)
49. `js/gastos.js`
50. `js/pin.js` (usa crypto.js)
51. `js/pwa.js`

### 9. INIT
52. `js/init.js` — **debe ser el último** (depende de todos los anteriores)

## Reglas explícitas

- `version.js` carga antes que todo, incluido `sw.js`.
- `state.js` debe cargarse primero dentro de core: define `RN.state`.
- `keys.js` antes de cualquier módulo que use `localStorage`/`IndexedDB`.
- `calculations.js` antes de `render.js`.
- **v5.15**: `render.js` (vista Cobros) emite `onclick` que llaman a `RN.descuentos.abrirParaCliente(...)` y usa en render `RN.descuentos.vigenteEnMes`/`RN.calc.valorDescuento`; `descuentos-view.js` llama a `RN.descuentos.abrirNuevoSelector/resumenGestion`. Como las llamadas `onclick` se evalúan al hacer clic (no al cargar) y `render()` sí se ejecuta tras cargar todo, basta con que `descuentos.js` esté cargado (cualquier posición) y `calculations.js` antes de `render.js` — orden actual de index.html ya lo cumple.
- **v5.15.1**: `render.js` (Panel) emite `onclick` a `RN.ingresosMes.abrir()`, `RN.paqueteProveedor.abrir()`, `RN.gananciaCortes.abrirProyectada()` y `RN.gananciaCortes.abrirReal()`. Como los `onclick` se evalúan al hacer clic, basta con que `ganancia-cortes.js` esté cargado (cualquier posición) y que `render.js`/`ui-components.js`/`investment.js`/`ciclos.js`/`calculations.js` carguen antes — orden actual de index.html ya lo cumple.
- **v5.15.2**: `render.js` (Panel) añade `onclick` a `RN.utilidadMes.abrir()` en la tarjeta **Utilidad neta**. `ganancia-cortes.js` define además `RN.gananciaCortes._repartoCosto()` (reparto del costo fijo del paquete por corte, con sobreventa a costo 0) y `RN.utilidadMes` (utilidad = ingresos − gastos operativos, excluyendo retiros de caja y devoluciones de inversión). Sin cambios de esquema (sigue 8).
- **v5.16.0**: `panel-widgets.js` (carga DESPUÉS de `ganancia-cortes.js`) añade widgets al Panel y `RN.panelWidgets.deltaHTML()`, que `render.js` usa para anotar los KPIs con la variación vs el mes anterior. `render.js` llama a `RN.panelWidgets.renderAll()` al final de `dashboard()`. Sin cambios de esquema (sigue 8).
- **v5.17.0**: **Reserva de caja + depósitos**. Esquema sube a **9** (migración v8→v9 añade `state.depositos` y `config.pctReservaCaja`). `calculations.js` añade `RN.calc.totalDepositos()` y `RN.calc.reservaCaja(mes)`; `fondoCaja()` ahora suma los depósitos. `caja.js` añade `depositar/guardarDeposito/listarDepositos/eliminarDeposito` y muestra la reserva (con aviso, sin bloquear) en el modal de retiro. `panel-widgets.js` añade `renderReserva()` y una alerta de reserva no cubierta. `config.js` lee/guarda `pctReservaCaja` (default 70). `storage-local.js`, `checkpoint.js`, `reset-app.js` y `export.js` incluyen `depositos`.
- **v5.18.0**: **Reserva de caja sobre la ganancia proyectada**. `RN.calc.reservaCaja(mes)` ahora calcula la reserva sobre la **ganancia proyectada del mes** (ingreso esperado de los clientes activos − costo del paquete del proveedor) en lugar de la utilidad neta. Devuelve `base` (ganancia proyectada) y conserva `utilidad` como alias retrocompatible. `panel-widgets.js` (widget Reserva), `caja.js` (modal de retiro) e `index.html` (Ajustes) actualizan sus etiquetas. Sin cambios de esquema.
- **v5.19.0**: **Caja "dos bolsillos"**. Nuevo modelo: cada mes la ganancia del mes (ingresos − gastos, SIN retiros) se reparte — un % (default 70) al bolsillo RESERVA (intocable) y el resto al bolsillo LIBRE. Los retiros se descuentan solo del libre. `calculations.js` añade `RN.calc.bolsillos(mes)` y `RN.calc.totalRetiros()`; `fondoCaja()` ahora resta los retiros. **Los retiros dejan de guardarse como gastos**: viven en `state.retiros` (esquema sube a **10**, migración v9→v10 mueve los gastos con `esRetiroCaja` al nuevo array). `caja.js` guarda/lista/elimina retiros desde `state.retiros` y muestra los dos bolsillos en el modal. `panel-widgets.js` muestra dos barras (reserva vs libre). `storage-local.js`, `checkpoint.js`, `reset-app.js` y `export.js` incluyen `retiros`.
- **v5.20.0**: **Fix crítico — importar contacto del teléfono dejaba nombre y dirección en blanco**. El sistema de pila de modales (`ui-components.js`) guardaba `box.innerHTML` al abrir un diálogo anidado (prompt de "varios números" o confirm de nombre); al restaurar, `innerHTML` no conserva los valores escritos por JS (`input.value = ...`), por lo que el nombre y la dirección recién llenados se borraban y solo quedaba el teléfono (escrito en el callback tras restaurar). `ui-components.js` ahora captura los valores vivos de todos los campos (`_capturarValores`) al apilar y los re-aplica (`_restaurarValores`) al restaurar. `modal-cliente.js` además re-aplica los datos del contacto en los callbacks (helpers idempotentes). Sin cambios de esquema (sigue 10).
- `core/models/investment.js` antes de `render.js`, `inversion.js` y `migration.js`.
- `checkpoint.js` antes de `undo.js`.
- `init.js` debe ser el último script clásico cargado.

## Cómo agregar un nuevo módulo

1. Decidir en qué carpeta encaja (o si se necesita una nueva bajo `js/`).
2. Si el módulo usa funciones de otro, agregarlo en `index.html` **después** de sus dependencias.
3. Actualizar este archivo (`DEPENDENCIAS.md`) con el módulo nuevo y sus dependencias.
4. Si el cambio toca el modelo de datos guardado, revisar `js/core/migration.js`.
5. Subir `APP_VERSION` en `js/version.js` para invalidar la caché del Service Worker.
