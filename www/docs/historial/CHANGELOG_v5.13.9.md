# Changelog AdminRed v5.13.9 — Sección Realizados

**Fecha:** 31 ago 2025  
**Versión:** 5.13.8 → 5.13.9  
**Sección:** Realizados (Cobros realizados / Historial)  
**Archivos modificados:** 9

---

## Resumen

Se aplicaron **30 correcciones** del informe de revisión de Realizados, distribuidas en 9 archivos. Las correcciones abarcan 6 bugs, 4 errores de lógica, 3 duplicaciones resueltas, 10 mejoras de UI y 7 mejoras de código.

---

## Helpers nuevos creados

### `RN.calc.totalCobro(h)` — `js/core/calculations.js`
Centraliza el patrón repetido 8+ veces: `h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0))`. Usado ahora en render.realizados(), render.reportes(), historial.js, historial-mensual.js, client-history.js.

### `RN.calc.clientePorId(id)` — `js/core/calculations.js`
Centraliza la búsqueda de cliente por ID: `RN.state.clients.find(c => c.id === id)`. Devuelve `null` si no se encuentra. Usado en render.realizados(), render.reportes(), historial.js, client-history.js.

### `RN.render.badgeTipoPago(h)` — `js/ui/render.js`
Badge unificado de tipo de pago para cobros del historial. Devuelve HTML consistente: "Completo", "Parcial · Falta X", "Con vuelto X". Usado en render.realizados() y render.reportes().

### `RN.render._fmtFechaCobro(fecha, conHora)` — `js/ui/render.js`
Formatea una fecha de cobro en formato legible localizado (`es-CU`), en lugar del ISO crudo. Soporta formato con o sin hora.

---

## Bugs corregidos (6)

### BUG-1: Concepto incorrecto para ventas de inventario
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
Antes: las ventas de inventario (`h.tipo === 'venta-inventario'`) mostraban "Servicio mensual" como concepto. Ahora muestran `h.concepto` (ej: "Venta: Router TP-Link (2 uds.)").

### BUG-2: Ventas de inventario sin tipoPago → KPIs incorrectos
**Archivo:** `js/cobros/inventario.js` + `js/ui/render.js` (`_kpisRealizados`)  
Añadido `tipoPago: 'completo'`, `totalAPagar`, `falta: 0`, `excedente: 0` al objeto de venta de inventario. Además, los KPIs ahora tratan `tipoPago` undefined como 'completo' (fallback), así las ventas antiguas también se cuentan.

### BUG-3: Filtro de mes inconsistente (fecha vs mes de servicio)
**Archivo:** `js/ui/render.js` (`_fillFiltroMes`, `realizados`)  
Antes: el dropdown y el filtro usaban `(h.fecha || '').slice(0, 7)` (mes calendario del cobro). Ahora usan `h.mes || (h.fecha || '').slice(0, 7)` (mes de servicio facturado con fallback a fecha). Un cobro adelantado de junio hecho en mayo ahora se encuentra al filtrar por "junio".

### BUG-4: Fecha mostrada en formato ISO crudo
**Archivo:** `js/ui/render.js` (`_fmtFechaCobro`, `_cardCobroRealizado`)  
Antes: "2025-06-15T14:30". Ahora: "15/06/2025, 02:30 p. m." (formato localizado `es-CU` con `toLocaleString`).

### BUG-5: `historial.filtrar()` no se usaba (código muerto)
**Archivo:** `js/reportes/historial.js`  
La función existía pero `render.realizados()` reimplementaba el filtrado inline. Ahora `historial.filtrar()` se usa en `render.realizados()` y en `exportCSV()`, resolviendo el código muerto.

### BUG-6: Búsqueda no filtraba por concepto ni por mes
**Archivo:** `js/reportes/historial.js` (`filtrar`) + `index.html`  
Antes: la búsqueda solo filtraba por nombre de cliente y número de recibo. Ahora también busca por concepto (ej: "venta", "equipo") y por mes de servicio (ej: "2025-06"). Placeholder actualizado en el HTML.

---

## Errores de lógica corregidos (4)

### LOG-1: KPIs no respetaban el filtro de mes (ALTA)
**Archivo:** `js/ui/render.js` (`_kpisRealizados`)  
Antes: los KPIs ("Total cobrado", "Completos", "Parciales", etc.) se calculaban siempre sobre TODO `RN.state.history`, sin importar el filtro seleccionado. Ahora se calculan sobre la lista ya filtrada, dando consistencia entre los KPIs y la lista visible.

### LOG-2: Dropdown de meses no se actualizaba dinámicamente
**Archivo:** `js/ui/render.js` (`_fillFiltroMes`)  
Antes: el dropdown solo se llenaba la primera vez (`if selMes.children.length <= 1`). Si se agregaban/eliminaban cobros, el dropdown no se actualizaba. Ahora se reconstruye cada vez, preservando la selección actual del usuario.

### LOG-3: `historialMensual.agrupar()` — documentación
**Archivo:** `js/reportes/historial-mensual.js`  
La lógica ya era correcta (`h.mes || fecha.slice(0,7)`). Se actualizó para usar `RN.calc.totalCobro(h)` y se documentó que `h.mes` es la fuente de verdad.

### LOG-4: Mes en formato ISO en recibo e historial de cliente
**Archivo:** `js/reportes/recibo.js` + `js/clientes/client-history.js` + `js/ui/render.js` (reportes)  
Antes: "Servicio mensual 2025-06". Ahora: "Servicio mensual junio 2025" (usando `RN.calc.mesTexto(h.mes)`).

---

## Duplicaciones resueltas (3)

### DUP-1: Helper `totalCobro(h)` creado
**Archivos:** `js/core/calculations.js` + 5 archivos que ahora lo usan  
El patrón `h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0))` se repetía en calculations.js (ingresosMes, ingresosTotales), render.js (realizados, reportes), historial.js, historial-mensual.js, client-history.js. Ahora todos usan `RN.calc.totalCobro(h)`.

### DUP-2: Helper `badgeTipoPago(h)` creado
**Archivo:** `js/ui/render.js`  
El badge de tipo de pago se construía en 3 lugares con textos/estilos inconsistentes: render.realizados(), render.reportes(), recibo._html(). Ahora render.realizados() y render.reportes() usan `RN.render.badgeTipoPago(h)` con formato unificado.

### DUP-3: Helper `clientePorId(id)` creado
**Archivo:** `js/core/calculations.js` + 4 archivos que ahora lo usan  
El patrón `RN.state.clients.find(c => c.id === h.clienteId)` se repetía decenas de veces. Ahora se usa `RN.calc.clientePorId(id)` en render.realizados(), render.reportes(), historial.js, client-history.js.

---

## Mejoras de UI (10)

### UI-1: Botón "Exportar CSV" en la vista de Realizados
**Archivo:** `index.html`  
Añadido botón en el toolbar que exporta el CSV respetando los filtros activos (mes, tipo, búsqueda). Antes solo era accesible desde el menú "Más opciones".

### UI-2: Filtro por tipo de pago (dropdown)
**Archivo:** `index.html` + `js/ui/render.js`  
Nuevo dropdown "Todos los tipos / Completos / Parciales / Con excedente" que filtra la lista y los KPIs simultáneamente.

### UI-3: Bordes de color en cards según tipo de pago
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
Las cards ahora tienen `data-estado="paid"` (verde) o `data-estado="parcial"` (ámbar), mostrando borde de color lateral como las cards de clientes.

### UI-4: Nombre de cliente clickeable en cards de realizados
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
El nombre del cliente en cada card es ahora un enlace que abre el historial completo del cliente (`RN.clientHistory.abrir(id)`).

### UI-5: Desglose servicio/equipo/mora en card expandida
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
Al expandir una card, ahora se muestran filas separadas para Servicio, Mora (con meses), Descuento recurrente y Equipo, además del Total.

### UI-6: Badge de pago combinado USD+CUP
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
Cuando un cobro fue pagado con USD+CUP combinado, se muestra un badge verde "USD+CUP" junto a la moneda.

### UI-7: (No implementado — funcionalidad nueva pendiente de confirmación)
Botón "Eliminar cobro" del historial. Requiere lógica de reversión compleja (deudaEquipo, descuentos, reciboCounter). Se deja para una versión futura.

### UI-8: (No implementado — optimización de rendimiento)
Paginación / "load more" para listas con cientos de cobros. Se deja para una versión futura.

### UI-9: Pill de recibo clickeable en realizados
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
El número de recibo ahora es un botón clickeable que abre el recibo directamente, igual que en la tabla de reportes. Unifica el comportamiento entre vistas.

### UI-10: Badge "Adelantado" para cobros de mes futuro
**Archivo:** `js/ui/render.js` (`_cardCobroRealizado`)  
Cuando un cobro de servicio tiene `h.mes` posterior al mes actual, se muestra un badge azul "Adelantado" en el nombre del cliente.

---

## Mejoras de código (7)

### CODE-1: Filtrado centralizado con `historial.filtrar()`
**Archivo:** `js/reportes/historial.js` + `js/ui/render.js`  
`historial.filtrar()` ahora soporta `mes`, `tipoPago` y `q` (búsqueda por nombre, recibo, concepto, mes). `render.realizados()` usa esta función en lugar de reimplementar el filtrado.

### CODE-2: `renderCobro()` extraído a `_cardCobroRealizado(h)`
**Archivo:** `js/ui/render.js`  
La función anidada `renderCobro(h)` dentro de `render.realizados()` se extrajo a `RN.render._cardCobroRealizado(h)`, permitiendo reutilización y evitando recrear la función en cada render.

### CODE-3: `exportCSV` mejorado
**Archivo:** `js/reportes/historial.js`  
Ahora respeta el filtro activo, incluye 8 columnas nuevas (concepto, mora, tipoPago, falta, excedente, moneda, usd, cup), usa el nombre real del cliente y muestra el conteo de cobros exportados.

### CODE-4: Escapar output en `historial-mensual.ver()`
**Archivo:** `js/reportes/historial-mensual.js`  
`RN.calc.mesTexto(m.mes)` ahora se envuelve con `RN.render.esc()` para prevenir inyección HTML.

### CODE-5: Cachear `ingresosTotales`/`gastosTotales` en estadísticas
**Archivo:** `js/reportes/estadisticas.js`  
Antes se llamaban 2 veces cada una. Ahora se calculan una vez y se reutilizan.

### CODE-6: `escAttr` en onclick de WhatsApp en client-history
**Archivo:** `js/clientes/client-history.js`  
`c.id` ahora se escapa con `RN.render.escAttr()` en el onclick de WhatsApp, igual que ya se hacía con el botón de recibo.

### CODE-7: `render.realizados()` dividido en 5 funciones
**Archivo:** `js/ui/render.js`  
La función monolítica de ~135 líneas se dividió en:
- `_fmtFechaCobro(fecha, conHora)` — formatear fecha
- `_cardCobroRealizado(h)` — render de una card
- `_cintillaMes(mesKey, cobros, esPrimera)` — render de una cintilla
- `_kpisRealizados(lista)` — KPIs sobre lista filtrada
- `_fillFiltroMes()` — dropdown dinámico
- `realizados()` — orquestador (~40 líneas)

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `js/version.js` | 5.13.8 → 5.13.9 |
| `js/core/calculations.js` | +2 helpers: `totalCobro()`, `clientePorId()` |
| `js/ui/render.js` | +`badgeTipoPago()`, +`_fmtFechaCobro()`, +`_cardCobroRealizado()`, +`_cintillaMes()`, +`_kpisRealizados()`, +`_fillFiltroMes()`, refactor `realizados()`, fix tabla reportes |
| `js/reportes/historial.js` | `filtrar()` ampliado, `exportCSV()` mejorado |
| `js/reportes/historial-mensual.js` | `esc()`, `totalCobro()` |
| `js/reportes/estadisticas.js` | Cachear ingresos/gastos |
| `js/reportes/recibo.js` | Mes legible en línea de servicio |
| `js/clientes/client-history.js` | `escAttr()`, `totalCobro()`, `clientePorId()`, mes legible |
| `js/cobros/inventario.js` | `tipoPago: 'completo'` en venta |
| `index.html` | +botón exportar CSV, +filtro por tipo |
