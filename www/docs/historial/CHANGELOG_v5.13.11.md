# Changelog AdminRed v5.13.11 — UI Móvil (Realizados + Calendario)

**Fecha:** 31 ago 2025  
**Versión:** 5.13.10 → 5.13.11  
**Sección:** Realizados (listado de cobros) + Calendario de cobros  
**Archivos modificados:** 3 (`styles.css`, `index.html`, `js/reportes/calendario.js`)

---

## Resumen

Se corrigieron los problemas de visualización en **pantallas móviles estrechas** (~360–420px) reportados por el usuario, que es el dispositivo de uso principal. Las dos secciones afectadas — **Realizados** (listado de cobros en tarjetas accordion agrupadas por mes) y **Calendario** (grilla mensual + leyenda de estados) — presentaban contenido comprimido, solapado o cortado en el borde derecho. Esta versión introduce **7 bloques de CSS responsive** nuevos y **2 ajustes de marcado** para que todo el contenido respire y se reorganice correctamente en móvil, **sin alterar el comportamiento en escritorio** (las reglas usan `@media (max-width: ...)` que solo aplican en pantallas pequeñas).

---

## Mejoras de UI móvil (7)

### UI-movil-1: Tarjetas accordion (`.acc-summary`) en 2 filas en móvil
**Archivo:** `styles.css` (query `@media (max-width: 640px)` reescrita)  
Antes: el resumen de cada cobro era una sola fila horizontal con `[punto] [nombre + badge] [fecha · concepto] [monto + moneda] [chevron]`. En ~360px el nombre se comprimía con `text-overflow:ellipsis`, la línea `fecha · concepto` se solapaba con el monto, y los badges "Adelantado"/"USD+CUP" se montaban encima del texto. Ahora el resumen usa `flex-wrap: wrap` y se divide en **dos filas**:  
- **Fila 1:** `[punto] nombre + badge ……… monto` (nombre con ellipsis, monto a la derecha, hasta 40% del ancho)  
- **Fila 2:** `fecha · concepto` a ancho completo, truncable con ellipsis si excede  

Los badges `.badge`/`.pill` se reducen a 9px en móvil para que quepan junto al nombre. El chevron permanece en la fila 1 junto al monto.

### UI-movil-2: Cintilla de mes más compacta en teléfono
**Archivo:** `styles.css` (query `@media (max-width: 640px)` de `.cintilla-mes`)  
Se redujeron paddings (`10px 11px`), tamaños de fuente (`13.5px`/`11px`) y gaps (`7px`) de la cabecera y el cuerpo de la cintilla mensual para aprovechar mejor el espacio vertical en móvil.

### UI-movil-3: Toolbar de filtros en 2 filas en pantallas estrechas
**Archivo:** `styles.css` (query `@media (max-width: 600px)`, bloque `.toolbar`)  
Antes: el buscador + 2 `<select>` (mes/tipo) + botón "Exportar CSV" competían en una sola fila con `flex-wrap`, pero los selects tenían `max-width:180px` que los hacía muy anchos y el botón se comprimía. Ahora en móvil el buscador ocupa **toda la fila 1** (`flex: 1 1 100%`), los dos selects comparten la **fila 2** (`flex: 1 1 40%`, sin max-width) y el botón "Exportar CSV" va en **fila 3** a ancho completo. Resultado legible y tocable sin amontonamiento.

### UI-movil-4: Grilla del calendario legible en móvil (sin contenido cortado)
**Archivo:** `styles.css` (query nueva `@media (max-width: 599px)`) + `js/reportes/calendario.js`  
Antes: `.cal-grid` usaba `repeat(7, 1fr)` con `aspect-ratio: 1` en `.cal-day`, dando celdas de ~48px en una pantalla de 360px. Dentro de cada celda había que meter: número (12px), etiqueta "✂ Corte" (9px), fila de puntos de estado, y texto "N pago(s)" (10px) — todo se solapaba y se cortaba. Ahora:  
- La grilla usa `repeat(7, minmax(50px, 1fr))` con `overflow-x: auto` — si el teléfono es muy estrecho (<372px) la grilla hace **scroll horizontal suave** en vez de aplastar el contenido.  
- Se elimina `aspect-ratio: 1` en móvil → la celda **crece verticalmente** (`min-height: 52px`) para acomodar número + etiqueta + puntos + cuenta sin solapamientos.  
- Se reducen tamaños de fuente (`num` 11px, `cal-corte-tag` 8px, `cal-count` 9px, `cal-head` 10px).  

### UI-movil-5: Etiqueta "Corte" compacta en teléfonos muy estrechos (<380px)
**Archivo:** `js/reportes/calendario.js` (`render`) + `styles.css` (query nueva `@media (max-width: 379px)`)  
En teléfonos de ≤379px (p. ej. 360px) incluso el tag "✂ Corte" a 8px consumía demasiado ancho de celda. Ahora el tag se renderiza como `✂<span class="cut-word"> Corte</span>` y la regla `@media (max-width: 379px) { .cal-corte-tag .cut-word { display: none } }` **oculta la palabra "Corte"** dejando solo el icono ✂. En pantallas ≥380px sigue mostrándose "✂ Corte" completo. Además, en <380px las columnas bajan a `minmax(44px, 1fr)` para evitar scroll excesivo.

### UI-movil-6: Leyenda del calendario responsive (wrap limpio, sin desbordamiento horizontal)
**Archivo:** `index.html` (leyenda reescrita) + `styles.css` (clase nueva `.cal-legend`)  
Antes: la leyenda usaba `<div class="flex" style="gap:16px;flex-wrap:wrap">` con 7 items en línea. En móvil los items no cabían y se cortaban en el borde derecho de la pantalla (visible en el screenshot: "Atrasado", "Pago parcial", "Por iniciar" y "Día de corte" quedaban fuera). Ahora:  
- Se reemplazó el `<div class="flex">` por `<div class="cal-legend mt-16">` con clase propia.  
- `.cal-legend` usa `display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))` → los 7 items se acomodan solos en **2–4 columnas** según el ancho, sin desbordar.  
- En `<380px` baja a `minmax(92px, 1fr)` y fuente 11px para más densidad.  
- Cada `.cal-legend-item` es un chip compacto con `white-space: nowrap` + ellipsis.

### UI-movil-7: Cabecera del calendario (etiqueta de mes) sin overflow en móvil
**Archivo:** `index.html` (atributo `style` inline eliminado) + `styles.css` (clase nueva `.cal-mes-label`)  
Antes: `<span id="cal-mes-label" style="min-width:160px">` forzaba un ancho mínimo de 160px que, sumado a los botones ‹, › y "Hoy" del `.view-header`, desbordaba la fila en pantallas <380px. Ahora el estilo inline se movió a la clase `.cal-mes-label` y se añadió `@media (max-width: 599px) { .cal-mes-label { min-width: 0; flex: 1 1 auto } }` para que la etiqueta se contraiga y ocupe el espacio disponible sin forzar overflow.

---

## Archivos modificados (3)

| Archivo | Cambios |
|---|---|
| `styles.css` | 7 bloques nuevos/modyficados: `.cal-legend` + `.cal-legend-item` (nuevo), `.cal-mes-label` (nuevo), query `@media (max-width: 599px)` para `.cal-grid`/`.cal-day`/`.cal-corte-tag`/`.cal-count`/`.cal-head` (nueva), query `@media (max-width: 379px)` para `.cut-word` oculto + columnas 44px (nueva), query `@media (max-width: 600px)` para `.toolbar` (ampliada), query `@media (max-width: 640px)` para `.acc-summary` (reescrita a 2 filas), query `@media (max-width: 640px)` para `.cintilla-mes` (compactada). |
| `index.html` | Leyenda del calendario reescrita con clases `.cal-legend`/`.cal-legend-item` (quitando `style` inline); etiqueta `#cal-mes-label` cambiada a clase `.cal-mes-label` (quitando `style` inline). |
| `js/reportes/calendario.js` | `corteTag` ahora renderiza `✂<span class="cut-word"> Corte</span>` para permitir ocultar la palabra en pantallas muy estrechas vía CSS. |

---

## Notas técnicas

- **Sin regresiones en escritorio**: todas las reglas móviles usan `@media (max-width: ...)` (≤640px, ≤600px, ≤599px, ≤379px). En pantallas ≥641px el render es idéntico a v5.13.10. La query `@media (min-width: 600px)` existente para `.cal-day` (48px/12px) se mantiene intacta.
- **Accesibilidad preservada**: el `aria-label` de cada día clickeable sigue incluyendo el número de clientes; el `role="button"` y `tabindex="0"` no se modificaron.
- **Sin cambios de lógica de negocio**: no se tocó `RN.calc`, `RN.ciclos`, `RN.render` (salvo el marcado del tag de corte) ni el flujo de cobros/recordatorios. Esta versión es **puramente de presentación responsive**.
- **Verificación visual**: se renderizó la app con Playwright a 380px y 360px (tema oscuro) confirmando: tarjetas en 2 filas sin solapamiento, toolbar apilado, grilla del calendario legible con scroll horizontal solo si hace falta, tag "✂" solo en <380px, y leyenda envuelta en grid sin desbordar.
