# Changelog AdminRed v5.13.14 — Fix del fondo de la tabla/cintilla de mes (estética)

**Fecha:** 31 ago 2025  
**Versión:** 5.13.12 → 5.13.14  
**Sección:** Estilos / Realizados (historial de cobros)  
**Archivos modificados:** 1 (`styles.css`) + `js/version.js`

---

## Resumen

Se corrigió un **bug estético** que rompía la armonía visual de la app, especialmente en **tema oscuro**: la "cintilla de mes" del historial de cobros (vista *Realizados* — la tarjeta agrupadora que dice p. ej. "Agosto 2026 · 9 cobros · 88,500.00 CUP") aparecía con un **fondo gris claro (#f5f5f5)** sobre el fondo navy oscuro, descuadrando totalmente la interfaz. La causa era una variable CSS (`--bg-alt`) que se usaba en toda la app pero **nunca se definía**, por lo que el navegador caía en un *fallback* hardcoded de color claro. Esta versión define `--bg-alt` en ambos temas con un tono coherente de la paleta, arreglando de paso todos los demás componentes (desgloses de cobro, avisos de capacidad, badge USD) que usaban la misma variable y quedaban sin fondo o con fondo erróneo.

---

## BUG: variable `--bg-alt` indefinida → fondo desentonado en cintillas y desgloses

**Archivo:** `styles.css`  
**Síntoma (tema oscuro):** la cintilla de mes de *Realizados* se veía con fondo gris claro (`#f5f5f5`) sobre fondo navy (`#0f172a`), rompiendo la estética. En tema claro el problema era más sutil (un gris neutro `#f5f5f5` que no encajaba con la paleta azulada `#f1f5f9`/`#ffffff`).

**Causa raíz:** la regla `.cintilla-mes` usaba `background: var(--bg-alt, #f5f5f5)`, pero la variable `--bg-alt` **no estaba definida** en `:root` ni en `[data-theme="dark"]`. Al no resolverse, el navegador aplicaba el *fallback* literal `#f5f5f5` (gris claro) en **ambos** temas. La variable se usaba además en otros 4 sitios del CSS y 5 del JS (badge USD, avisos de capacidad del proveedor, desgloses de cobro/inventario, desglose personalizado de cliente) que quedaban sin fondo definido o, donde había *fallback*, con el mismo gris desentonado.

**Fix:**
1. **Definir `--bg-alt`** con un tono coherente en cada tema:
   - Tema claro (`:root`): `--bg-alt: #eef2f7` (gris-azulado suave, entre `--bg: #f1f5f9` y `--surface-2: #f8fafc`).
   - Tema oscuro (`[data-theme="dark"]`): `--bg-alt: #172033` (slate oscuro, igual que `--surface-2`, coherente con el fondo navy).
2. **Quitar el *fallback* hardcoded** `#f5f5f5` de `.cintilla-mes` → `background: var(--bg-alt)`, ya que la variable ahora siempre está definida. Esto garantiza que la cintilla respete el tema activo y nunca vuelva a caer en un gris claro genérico.

**Resultado:**
- Tema oscuro: cintilla con fondo `#172033` (slate oscuro) que se integra con el fondo navy. Verificado: `getComputedStyle` pasa de `rgb(245,245,245)` a `rgb(23,32,51)`.
- Tema claro: cintilla con fondo `#eef2f7` (gris-azulado) coherente con la paleta clara. Verificado: pasa a `rgb(238,242,247)`.
- Efecto secundario positivo: todos los componentes que usaban `var(--bg-alt)` (badge USD en KPIs, `.prov-cap-aviso`, desgloses en modales de cobro/inventario/cliente, desglose de proveedor) ahora tienen un fondo correcto en ambos temas, en vez de fondo transparente o gris genérico.

---

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `styles.css` | Definir `--bg-alt` en `:root` (`#eef2f7`) y `[data-theme="dark"]` (`#172033`); quitar *fallback* `#f5f5f5` de `.cintilla-mes`. |
| `js/version.js` | 5.13.12 → 5.13.14. |

---

## Notas técnicas

- **Sin cambios de lógica:** es una corrección puramente de estilos (variables CSS). No se tocó `render.js`, `init.js`, ni ningún módulo de negocio. El render de la cintilla y las tarjetas es idéntico; solo cambia el color de fondo.
- **Una sola variable, muchos beneficiados:** al definir `--bg-alt` se arregla a la vez la cintilla de mes (lo reportado) y los 8 sitios más que la referenciaban, sin tocarlos individualmente.
- **Verificación visual:** se renderizó la vista *Realizados* con un cobro de prueba en Chromium, en tema claro y oscuro, confirmando el color de fondo computado de `.cintilla-mes` y la armonía con el resto de la paleta.
- **Por qué 5.13.14 y no 5.13.13:** salto de versión a petición explícita del usuario (la 5.13.13 queda reservada/no publicada).
