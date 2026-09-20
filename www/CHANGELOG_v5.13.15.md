# CHANGELOG — v5.13.15

## Sección afectada
**Realizados** (Cobros realizados) — vista de historial agrupado por mes.

## Problemas reportados
1. **La agrupación por mes (cintilla) no se expande ni se contrae al tocarla.**
2. **La barra de búsqueda no está separada del widget (cuadrícula de KPIs) que se encuentra arriba.**

---

## BUG-1 — Onclick inválido en cintillas de mes y tarjetas de cobro (crítico)

### Causa raíz
Las funciones `RN.render._cintillaMes` y `RN.render._cardCobroRealizado`
(`js/ui/render.js`) construían los atributos `onclick` usando un patrón de
escaping basado en `String.fromCharCode(0x5c)` (barra invertida `\`) combinado
con `String.fromCharCode(0x27)` (comilla simple `'`).

El resultado era un atributo HTML **malformado y asimétrico**:

```html
onclick="RN.render.toggleCintillaMes(\'cintilla-mes-2026-08'\')"
```

Cuando el navegador parsea ese atributo y lo evalúa como JavaScript, se produce
un **`SyntaxError: Invalid or unexpected token`** porque `\'` no abre una cadena
válida (la barra invertida es un carácter literal fuera de un string) y la
comilla simple final queda suelta. El handler **nunca dispara**, por lo que
tocar la cintilla no expande ni contrae nada.

Este mismo patrón afectaba a **4 handlers** dentro de la vista Realizados:

| Línea | Handler | Acción |
|-------|---------|--------|
| `_cardCobroRealizado` ~591 | `RN.clientHistory.abrir(...)` | Abrir historial del cliente al tocar su nombre |
| `_cardCobroRealizado` ~628 | `RN.recibo.ver(...)` | Ver recibo al tocar el pill `#NNN` |
| `_cardCobroRealizado` ~653 | `RN.render.toggleCard(...)` | Expandir/contraer tarjeta de cobro individual |
| `_cintillaMes` ~690 | `RN.render.toggleCintillaMes(...)` | Expandir/contraer agrupación por mes |

### Solución
Se reemplazó el patrón roto por el escaping inline `'\\''` (comilla simple
escapada dentro de comillas dobles del atributo HTML), que es el mismo patrón
que ya funciona correctamente en el resto de la app (p. ej. `toggleCard` en
las vistas Clientes, Cobros pendientes, Inversión y Gastos).

**Antes** (roto):
```js
var sq = String.fromCharCode(0x27);
onclick="RN.render.toggleCintillaMes(' + String.fromCharCode(0x5c) + sq + cintillaId + sq + String.fromCharCode(0x5c) + sq + ')"
// → onclick="RN.render.toggleCintillaMes(\'cintilla-mes-2026-08'\')"  ← JS inválido
```

**Después** (correcto):
```js
onclick="RN.render.toggleCintillaMes(\'' + cintillaId + '\')"
// → onclick="RN.render.toggleCintillaMes('cintilla-mes-2026-08')"  ← JS válido
```

Se eliminaron las declaraciones `var sq = String.fromCharCode(0x27)` que
quedaron sin uso en ambas funciones.

### Verificación (Chromium, tema oscuro)
- onclick generado: `RN.render.toggleCintillaMes('cintilla-mes-2026-08')` — **JS válido**.
- Tocar la cintilla de **agosto 2026**: pasa de `▲` (abierta) a `▼` (cerrada) ✓
- Tocar la cintilla de **julio 2026**: pasa de `▼` (cerrada) a `▲` (abierta) ✓
- Tarjetas de cobro individuales: `toggleCard` alterna `.open` correctamente ✓
- Pills de recibo: `RN.recibo.ver('t2')` — JS válido ✓
- Nombre de cliente: `RN.clientHistory.abrir(...)` — JS válido ✓

---

## UI-1 — Separación entre cuadrícula de KPIs y barra de búsqueda

### Causa raíz
En `styles.css`, la clase `.kpi-grid` no tenía `margin-bottom`, por lo que la
cuadrícula de KPIs (Total cobrado, Cobros realizados, Completos, Parciales…)
quedaba **pegada** a la `.toolbar` (barra de búsqueda + filtros) inmediatamente
debajo, sin separación visual.

La `.toolbar` sí tenía `margin-bottom: 12px` (hacia la lista inferior) pero
**ningún `margin-top`** (hacia los KPIs superiores), de modo que la barra de
búsqueda aparecía "soldada" al widget de arriba.

### Solución
Se añadió `margin-bottom: 14px` a `.kpi-grid`, consistente con el `margin-bottom:
14px` que ya usa `.view-header`. Esto separa visualmente la cuadrícula de KPIs
del contenido inferior (barra de búsqueda, tarjetas, listas) en **todas** las
vistas que la usan (Panel, Realizados, Inversión, Gastos, Reportes), no solo en
Realizados, manteniendo una jerarquía visual uniforme.

```css
.kpi-grid {
  display: grid; gap: 10px;
  grid-template-columns: repeat(2, 1fr);
  margin-bottom: 14px;   /* v5.13.15 (UI-1) */
}
```

### Verificación (Chromium, tema oscuro)
- `getComputedStyle(.kpi-grid).marginBottom` = `14px` (antes `0px`).
- Distancia real entre el borde inferior de la cuadrícula y el borde superior
  de la toolbar: **14.0 px** (medido con `getBoundingClientRect`).

---

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `js/version.js` | `APP_VERSION` 5.13.14 → **5.13.15** |
| `js/ui/render.js` | BUG-1: 4 onclick corregidos en `_cardCobroRealizado` y `_cintillaMes`; `var sq` eliminado |
| `styles.css` | UI-1: `margin-bottom: 14px` añadido a `.kpi-grid` |
