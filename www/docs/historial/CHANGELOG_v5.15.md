# Changelog v5.15.0 — Gestión centralizada de bonificaciones/descuentos (mudanza fuera del cobro)

## Resumen

Las **bonificaciones y descuentos** dejan de crearse dentro del modal de cobro y pasan a gestionarse desde **dos puntos de entrada dedicados**, respondiendo al análisis UX que detectó que meter la creación dentro del flujo de cobro producía un modal excesivamente largo, dispersión de control y —lo más grave— **pérdida de datos tecleados** al anular/crear descuentos desde el propio cobro (el stack de modales de la app restaura `innerHTML`, no los valores de los inputs).

La solución adoptada es la **combinación recomendada** de tres capas:

1. **A. Centro de gestión completo en Finanzas → Descuentos** — botón "🎁 + Nueva bonificación / descuento" con selector de cliente, "🏷️ Descuento por lote" movido desde Cobros a esta vista, y mini-resumen de KPIs (activas · pendientes · impacto CUP del mes).
2. **C. Acceso rápido 🎁 por cliente en "Cobros del mes"** — cada tarjeta de cliente de la vista Cobros incorpora un botón 🎁 que abre directamente la gestión de bonificaciones de ese cliente (sin pasar por el modal de cobro), con **contador e indicador verde** cuando ya tiene bonificaciones vigentes ese mes, tooltip con el impacto en CUP y una fila "Bonificaciones" en los detalles de la tarjeta con los badges de cada descuento activo.
3. **Cobro en solo lectura** — el modal de cobro ya no crea descuentos: solo muestra los aplicables del mes, permite anularlos (trash) y apunta a los nuevos puntos de creación. Al anular desde el cobro, la tabla se **refresca in-place** (sin reconstruir el modal), de modo que lo tecleado (USD/CUP/notas/equipo) **se conserva** y los totales se recalculan al instante.

Además, se añade un **registro de eventos** (`descuento_crear` / `descuento_anular`) visible en la ventana de **Auditoría**, para que quede rastro de quién/cuándo/cómo se creó o anuló cada bonificación — el "control" que motivaba la mudanza.

**Sin cambios de modelo de datos ni de esquema**: no hay migración (el esquema sigue siendo 8). El registro de eventos usa un array nuevo `RN.state.eventos` que se persiste junto al resto del estado con **fallback seguro** (`data.eventos || []`), de modo que los backups y undos anteriores siguen cargando sin problema.

---

## Finanzas → Descuentos: centro de gestión (`js/reportes/descuentos-view.js` + `js/cobros/descuentos.js` + `index.html`)

- **Botón "🎁 + Nueva bonificación / descuento"** en el encabezado de la vista. Al pulsarlo abre un **modal de selector de cliente** (lista con nombre, zona/equipo y estado) y, tras elegir, el formulario clásico de `abrirNuevo(clienteId, mes)` ya precargado para ese cliente. No hay que abrir el cobro de nadie para meter una bonificación.
- **"🏷️ Descuento por lote"** se muda desde la vista de Cobros a esta vista (junto a "⬇️ Exportar CSV"): el lote es una operación de gestión masiva, no de cobro.
- **Mini-resumen de KPIs** (`#descuentos-resumen`) en 3 tarjetas encima de la tabla: **Activas este mes** (verde), **Pendientes de aplicar** (ámbar) e **Impacto CUP del mes** (azul, suma de `valorDescuento` de las vigentes). Se recalcula en cada render de la vista.
- El **estado vacío** de la vista (cuando no hay descuentos) ahora es orientativo: explica que se pueden crear desde el botón 🎁 de esta vista o desde el botón 🎁 de cada cliente en Cobros del mes.

## Acceso rápido 🎁 por cliente (`js/ui/render.js`)

En la vista **Cobros → "Cobros del mes"**, cada tarjeta de cliente incluye:

- **Botón 🎁** en la fila de acciones (junto al botón de cobro). Abre directamente `RN.descuentos.abrirParaCliente(clienteId)` → selector de tipo (bonificación/afectación/ajuste) → formulario precargado con el cliente y el mes en curso. **No abre el modal de cobro.**
- **Indicador de bonificación activa**: si el cliente tiene descuentos vigentes este mes, el botón pasa a estilo verde (`has-desc`) con un **contador** (n.º de descuentos vigentes) y el **tooltip** muestra el impacto total en CUP del mes.
- **Fila "Bonificaciones"** en los detalles expandidos de la tarjeta (solo en la vista de cobros): un **badge por cada descuento vigente** con tipo, motivo (en el tooltip) e importe con signo menos (p. ej. `bonificacion: Fidelización 6 meses (−100.00 CUP)`), o "Ninguna este mes" si no tiene.

La lógica de vigencia reutiliza los helpers de v5.14.4 (`RN.descuentos.vigenteEnMes`, `RN.calc.valorDescuento`), sin duplicar condiciones.

## Cobro en solo lectura + refresco in-place (`js/cobros/modal-cobro.js` + `js/cobros/descuentos.js`)

- **Se retira el botón "+ Agregar descuento o bonificación"** del modal de cobro. La creación ya no vive en el cobro: el panel queda de consulta y anulación.
- El panel pasa a mostrar siempre una **pista de gestión** (`#cobro-desc-hint`): "Se gestionan desde **Finanzas → Descuentos** o con el botón 🎁 de la lista de Cobros", visible cuando la tabla está vacía (se oculta automáticamente si hay descuentos aplicables).
- **Fix P1 (pérdida de datos)**: al anular un descuento desde el propio cobro (botón 🗑️), ya no se reconstruye el modal (el stack de modales restaura `innerHTML` y borraba lo tecleado). Ahora `_refrescarPanelCobro()` actualiza **solo el `tbody`** (`#cobro-desc-tbody`) y la pista, y llama a `recalcular()`, que **relee los valores vivos de los inputs** (`cobro-monto-usd`, `cobro-monto-cup`, `cobro-notas`, `cobro-monto-equipo`). Verificado: con USD/notas tecleados, anular desde el cobro **conserva** esos valores y recalcula totales (A pagar / neto / descuento) al instante.
- La reversión de cobros al anular (lógica de v5.14.4, `aplicaciones[].valor` congelado) se mantiene intacta; solo cambia el **cómo se refresca la UI**.

## Registro de eventos en Auditoría (`js/core/auditoria.js` + `js/core/state.js` + `js/storage/storage-local.js`)

- **`RN.auditoria.logEvento(tipo, detalle)`**: añade `{ tipo, fecha, detalle }` a `RN.state.eventos`, con tope de **200 eventos** (los más recientes) para no engordar el estado guardado.
- Se registran `descuento_crear` (al guardar) y `descuento_anular` (en las 4 ramas de `eliminar()`), con detalle legible: cliente · tipo · modo · valor · vigencia · fecha · motivo.
- La ventana de **Auditoría** incorpora la sección **"Últimos eventos de bonificaciones/descuentos"** (los 10 más recientes, más nuevo primero) con iconos ➕/🗑️.
- **Persistencia con fallback seguro**: `storage-local.js` serializa `eventos` y, al cargar, usa `data.eventos || []`. Los backups/undos anteriores (sin el array) cargan normalmente. No hay bump de `VERSION_ESQUEMA`.

## CSS (`styles.css`)

- `.btn.gift-btn` (neutro sobre `--surface-2`) y `.btn.gift-btn.has-desc` (verde sobre `--success-soft`), con sus estados hover, usando las variables de tema — funciona igual en claro y oscuro.
- `.gift-count`: píldora de contador (verde, tipografía pequeña bold).
- `.acc-row .acc-value .badge.ok`: badges de bonificaciones de la tarjeta con margen propio para apilarse limpios.

## Documentación

- `js/DEPENDENCIAS.md`: se documenta que `render.js` genera llamadas `onclick` a `RN.descuentos.abrirParaCliente` / usa `RN.descuentos.vigenteEnMes` y `RN.calc.valorDescuento` (definidos en `calculations.js` y `descuentos.js`, que cargan antes), y que `descuentos-view.js` depende de `descuentos.js`.
- `README.md`: la sección "Qué pasa cuando cambia de mes" apunta a los nuevos puntos de gestión de bonificaciones; se describe el flujo crear → ver en Cobros (🎁) → cobrar.
- `MODELO.md` no requiere cambios: el modelo de descuentos es el mismo de v5.14.4 (solo cambia dónde se crean y cómo se refresca la UI).

## Otros

- **VERSION**: `APP_VERSION` sube de `5.14.4` a `5.15.0` (`js/version.js`); el Service Worker invalida la caché automáticamente al detectar la nueva versión. Bump de **versión menor** (no parche) por tratarse de un cambio de flujo/UX, no de una corrección.
- **Compatibilidad**: sin migración, sin cambio de esquema, sin cambio de formato de CSV (la exportación de Descuentos no varía respecto a v5.14.4). Los backups v5.14.x cargan directamente.

## Verificación realizada

- Carga de la app sin errores de consola; las 5 funciones nuevas existen en `RN` al arrancar.
- Flujo completo: **Finanzas → Descuentos → 🎁+Nueva → selector de cliente → formulario → guardar** → KPIs se actualizan (1 activa, 100 CUP de impacto) → en **Cobros del mes** el cliente aparece con 🎁 verde + contador + tooltip con impacto + fila "Bonificaciones" con badge (−100.00 CUP) → el neto del mes refleja el descuento (500 → 400 CUP).
- **Cobro en solo lectura**: sin botón de agregar; tabla de descuentos aplicables con trash; pista de gestión visible al quedar vacía.
- **P1 (test crítico, ejecutado dos veces)**: con USD y notas tecleados en el cobro, anular el descuento desde el propio cobro **conserva** USD/notas y recalcula los totales in-place; el evento `descuento_anular` queda registrado.
- **Auditoría**: la sección de eventos muestra Creó/Anuló con cliente, tipo, modo, valor, vigencia, fecha y motivo; los eventos persisten tras recargar la página.

## Archivos modificados

`js/version.js` · `js/core/state.js` · `js/core/auditoria.js` · `js/storage/storage-local.js` · `js/cobros/modal-cobro.js` · `js/cobros/descuentos.js` · `js/reportes/descuentos-view.js` · `js/ui/render.js` · `index.html` · `styles.css` · `js/DEPENDENCIAS.md` · `README.md` · `CHANGELOG.md`
