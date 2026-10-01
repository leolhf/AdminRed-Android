# Changelog v5.14.3 — Historial de cobros (Reportes) agrupado por mes y colapsable

## Resumen

En la sección **Reportes → "Historial de cobros"**, la tabla plana que mostraba solo 50 cobros se sustituye por una vista **agrupada por mes en cintillas colapsables**, donde cada mes aparece contraído por defecto (solo el mes más reciente queda abierto) y al hacer clic se expande. Dentro de cada mes, cada cobro es una tarjeta (`acc-card`) colapsable cuyo detalle solo se muestra al hacer clic. El modal "Ver todos" (`RN.historial.verTodos`) también se actualiza al mismo formato colapsable.

Esto responde a la petición del usuario: que el historial de cobros del reporte aparezca agrupado por mes y de forma contraída, y cada cobro también contraído, mostrando su contenido solo al hacer clic.

---

## UI (2 cambios)

- **UI-1** (`index.html` + `render.js`): el bloque "Historial de cobros" de la vista Reportes deja de ser una `<table>` plana y pasa a ser un contenedor `<div class="accordion-list" id="lista-historial-reportes">`. Se añade una barra de filtros (búsqueda por texto + filtro de mes + botón Exportar CSV) coherente con la vista Realizados.

- **UI-2** (`render.js`, nueva función `RN.render._renderHistorialReportes`): renderiza el historial agrupado por mes de servicio (`h.mes`, con fallback a `h.fecha`) en cintillas colapsables, reutilizando `RN.render._cintillaMes()` y `RN.render._cardCobroRealizado()` de la vista Realizados. Solo el primer mes (más reciente) queda abierto por defecto; el resto contraído. Cada cobro es una `acc-card` colapsable (detalle al hacer clic). Ya no se trunca a 50 filas porque el render colapsado escala bien en el DOM.

- **UI-3** (`historial.js`, `RN.historial.verTodos`): el modal "Ver todos" ahora también agrupa por mes en cintillas colapsables con tarjetas colapsables, en lugar de la tabla plana anterior.

## Reutilización

Todo el comportamiento colapsable se apoya en la infraestructura existente y probada desde v5.12.3/v5.13.9:
- `.cintilla-mes` / `.cintilla-mes-open` (CSS) y `RN.render.toggleCintillaMes()` (JS) — abre/cierra cada mes.
- `.acc-card` / `.acc-card.open` (CSS) y `RN.render.toggleCard()` (JS) — abre/cierra cada cobro.
- `RN.render._cintillaMes(mesKey, cobros, esPrimera)` — construye una cintilla de mes.
- `RN.render._cardCobroRealizado(h)` — construye una tarjeta de cobro colapsable con desglose (servicio/equipo/mora, moneda, tipo de pago, recibo).

No se añade CSS nuevo (las clases ya existían); solo un comentario de versión en `styles.css`.

## Otros

- **VERSION**: `APP_VERSION` sube de `5.14.2` a `5.14.3` (`js/version.js`). El Service Worker (`sw.js`) toma la versión dinámicamente, así que la caché se invalida automáticamente al actualizar.
