# AdminRed v5.13.6 — Correcciones del Panel (Dashboard)

**Fecha:** 31 agosto 2026
**Sección revisada:** Panel del negocio (dashboard)

## Resumen

Revisión exhaustiva del Panel que identificó y corrigió **5 bugs**, **4 casos de código duplicado/performance** y **3 mejoras de UI**. Todos los archivos JS pasan `node --check` con 0 errores.

---

## Bugs corregidos

### BUG-1 — Comentario JSDoc duplicado en `calculations.js` (línea 64)
- **Problema:** Había un `/**` duplicado consecutivo antes de `mesInicioCliente()`.
- **Corrección:** Eliminado el `/**` sobrante, dejando un solo bloque de comentario.

### BUG-2 — Doble punto y coma tras `esc()` en `render.js` (línea 10)
- **Problema:** `};;` al final de la función `esc()` (sentencia vacía innecesaria).
- **Corrección:** Cambiado a `};`.

### BUG-3 — Emoji 📈 corrupto (CESU-8) en `barraRecuperacion()` (línea 168)
- **Problema:** El emoji 📈 del título "Recuperación de la inversión" estaba codificado como CESU-8 malformado (`\xed\xa0\xbd\xed\xb3\x88`), mostrándose como caracteres basura (`í ½í³ˆ`) en el navegador.
- **Corrección:** Reemplazado por UTF-8 correcto (`\xf0\x9f\x93\x88`). También se corrigió otra ocurrencia del mismo emoji CESU-8 en la vista de inversión.

### BUG-4 — Escapes Unicode en aviso "inflado" (línea 180)
- **Estado:** **Verificado — no era bug.** Los escapes `\u26a0` (⚠️) y `\u2192` (→) funcionan correctamente en JavaScript. La confusión inicial se debió a que la terminal mostraba los caracteres escapados en lugar de renderizados.

### BUG-5 — `tasaCob` podía mostrar >100% de forma engañosa
- **Problema:** `tasaCob` usaba `ingresosMes()` que incluye `h.montoEquipo` y cobros de meses anteriores (mora), pero `esperado` solo contaba el servicio del mes actual. Si se cobraba equipo o mora, la tasa superaba 100%.
- **Corrección:** Nueva función `RN.calc.ingresosServicioMes(mes)` que solo suma `h.monto` de cobros tipo 'servicio' del mes. El dashboard ahora usa esta función para calcular `tasaCob`. Subtítulo actualizado a "Servicio cobrado sobre lo esperado".

### BUG-6 — `getStatus()` devolvía 'ok' para clientes inactivos
- **Problema:** `if (!cliente || !cliente.activo) return 'ok'` hacía que clientes dados de baja (`activo: false`) mostraran badge verde "Al día".
- **Corrección:** Separado en dos condiciones: `if (!cliente) return 'ok'` (null/undefined) e `if (cliente.activo === false) return 'inactivo'`. Añadido el badge `'inactivo': ['muted', 'Inactivo']` en `badgeEstado()`.

---

## Código duplicado / performance

### DUP-1 — `clientesActivos()` cacheado en `dashboard()`
- **Problema:** Se llamaba 3 veces (morosos, resumen, y dentro de cobranzaMes).
- **Corrección:** `const activos = RN.calc.clientesActivos();` al inicio, reutilizado en morosos y resumen.

### DUP-2 — `montoPaqueteProveedor()` reutilizado en widget proveedor
- **Problema:** Se llamaba 2 veces con el mismo resultado (KPI + widget).
- **Corrección:** `const montoPaquete = costoPaquete;` reutiliza el valor ya calculado.

### DUP-3 — Funciones de inversión cacheadas
- **Problema:** `totalInvertido()` se calculaba 4×, `totalRecuperado()` 3×, `porcentajeRecuperacion()` 2× (cada una recalcula internamente).
- **Corrección:** Cacheadas en variables `totalInv`, `recInv`, `pctRecup` al inicio del dashboard. `barraRecuperacion()` ahora acepta parámetros opcionales `(inv, rec, pctParam)` para recibir los valores pre-calculados.

### CODE-6 — Nueva función `RN.render.descPaquete()`
- **Problema:** El string `"Mm × P CUP/M"` se construía manualmente en múltiples sitios.
- **Corrección:** Extraído a `RN.render.descPaquete()` reutilizable, usado en el KPI "Costo del paquete".

---

## Mejoras UI

### UI-3 — Estado vacío en card de inversión
- **Antes:** La card de recuperación se ocultaba completamente (`display: none`) si no había inversiones.
- **Ahora:** Muestra un estado vacío con icono 💰, mensaje "No hay inversiones registradas aún" y botón "Registrar inversión" que abre el modal.

### UI-5 — Mes operativo visible en el header del panel
- **Antes:** No se mostraba en ningún lugar qué mes se estaba visualizando.
- **Ahora:** Badge en el header: "Mes: **agosto 2026**". Si el mes operativo difiere del mes real del reloj (tras un cierre de mes), muestra "⚠ Mes operativo: **agosto 2026**" con estilo de aviso amarillo.
- **CSS:** Nuevas clases `.mes-badge`, `.mes-badge.muted`, `.mes-badge.mes-cerrado`.

### UI-6 — Badge visual distintivo para equivalencia USD
- **Antes:** El USD aparecía como texto plano separado por `·` en el subtítulo, difícil de distinguir.
- **Ahora:** Envuelto en un `<span class="usd-badge">≈ 8.59 USD</span>` con fondo, borde y peso de fuente distintos.
- **CSS:** Nueva clase `.kpi .sub .usd-badge` con estilo de badge.

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `js/version.js` | Bump 5.13.5 → 5.13.6 |
| `js/core/calculations.js` | BUG-1 (comentario duplicado), BUG-5 (`ingresosServicioMes()`), BUG-6 (`getStatus` inactivo) |
| `js/ui/render.js` | BUG-2 (`;;`), BUG-3 (emoji CESU-8), BUG-5 (tasaCob), BUG-6 (badge inactivo), DUP-1/2/3 (caching), CODE-6 (`descPaquete`), UI-3/5/6 |
| `index.html` | UI-5 (elemento `dashboard-mes` en header) |
| `styles.css` | UI-5 (`.mes-badge`), UI-6 (`.usd-badge`) |
