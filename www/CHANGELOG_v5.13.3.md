# Changelog v5.13.3 — Fusión visual de Inversión + Deudas

**Fecha:** 2025
**Versión:** 5.13.3
**Tipo:** Mejora de interfaz (fusión visual)

---

## Resumen

Esta versión completa el **Paso 5** del plan de refactorización de la sección finanzas: la **fusión visual** de las dos pestañas separadas "Inversión" y "Deudas" en una **única vista unificada** llamada "Inversiones y deudas".

Anteriormente (v5.13.2) se había fusionado la lógica interna (código, modelos, funciones), pero la interfaz seguía mostrando dos subpestañas separadas. Ahora el usuario ve todo en un solo lugar.

---

## Cambios realizados

### 1. Interfaz unificada (`index.html`)

- **Eliminada** la subpestaña "Deudas" del grupo Finanzas.
- **Renombrada** la subpestaña "Inversión" → "Inversiones y deudas".
- **Eliminada** la sección completa `view-deudas` (que tenía su propio KPI grid y listas).
- **Rediseñada** la sección `view-inversion` para contener tres bloques:
  1. **KPIs combinados** (`#kpi-inversion`): 8 indicadores en una sola grid (4 de inversión + 4 de deudas).
  2. **Bloque "Inversiones"** (`#lista-inversion`): capital invertido en equipos con clientes vinculados.
  3. **Bloque "Deudas personales activas"** (`#lista-deudas-activas`): préstamos externos por devolver.
  4. **Bloque "Deudas concluidas"** (`#lista-deudas-concluidas`): historial de deudas totalmente liquidadas (se muestra solo si hay).
- Se conserva la **barra de recuperación global** de la inversión.

### 2. Render unificado (`js/ui/render.js`)

- `render.inversion()` ahora renderiza **TODO** el contenido de la vista unificada:
  - KPIs combinados (inversión + deudas) en `#kpi-inversion`.
  - Barra de recuperación global.
  - Lista de inversiones en `#lista-inversion`.
  - Lista de deudas activas en `#lista-deudas-activas` (vía `_renderDeudasActivas()`).
  - Lista de deudas concluidas en `#lista-deudas-concluidas` (vía `_renderDeudasConcluidas()`).
- **Eliminado** `case 'deudas'` del switch de `render.vista()` — ya no existe la vista independiente.

### 3. Compatibilidad (`js/cobros/inversion.js`)

- `renderDeudas()` ahora **delega** en `render.inversion()` en lugar de renderizar por separado.
- Esto mantiene la compatibilidad con todas las llamadas existentes (guardar, eliminar, devoluciones de préstamo) que siguen llamando `renderDeudas()` tras una operación.
- Las funciones `_renderDeudasActivas()` y `_renderDeudasConcluidas()` se conservan y son llamadas desde `render.inversion()`.

### 4. Navegación (`js/ui/tabs.js`)

- **Eliminada** la entrada `deudas: 'finanzas'` del mapeo `_vistaAGrupo`.
- Ya no es posible navegar a una vista "deudas" independiente.

---

## KPIs combinados (8 indicadores)

La grid de KPIs ahora muestra en una sola vista:

| # | Etiqueta | Color | Descripción |
|---|----------|-------|-------------|
| 1 | Total invertido | Azul | Capital total invertido en equipos |
| 2 | Recuperado (neto) | Verde | Capital recuperado neto |
| 3 | % recuperación | Ámbar | Porcentaje global de recuperación |
| 4 | Por recuperar | Rojo | Saldo pendiente de recuperar |
| 5 | Deudas activas | Azul | Cantidad de préstamos externos activos |
| 6 | Saldo por devolver | Rojo | Total pendiente de devolver a prestamistas |
| 7 | Ya devuelto (activas) | Ámbar | Total ya devuelto de deudas activas |
| 8 | Concluidas | Verde | Cantidad + monto de deudas liquidadas |

---

## Verificación

- ✅ Sintaxis JS verificada (`node -c`) en todos los archivos modificados.
- ✅ No quedan referencias a `view-deudas` en el código.
- ✅ No quedan referencias a `data-view="deudas"` en el HTML.
- ✅ `case 'deudas'` eliminado del switch de render.
- ✅ Mapeo `deudas: 'finanzas'` eliminado de tabs.js.
- ✅ Las funciones de guardar/eliminar/devoluciones siguen funcionando (delegan a `render.inversion()`).

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `index.html` | Subpestaña Deudas eliminada, subpestaña Inversión renombrada, sección view-deudas eliminada, view-inversion rediseñada con 3 bloques |
| `js/ui/render.js` | `render.inversion()` ahora renderiza KPIs combinados + listas de deudas; `case 'deudas'` eliminado |
| `js/cobros/inversion.js` | `renderDeudas()` delega en `render.inversion()` |
| `js/ui/tabs.js` | `deudas: 'finanzas'` eliminado de `_vistaAGrupo` |
| `js/version.js` | Versión bump 5.13.2 → 5.13.3 |

---

## Fix: Duplicación de préstamos en la vista unificada

### Problema
Al fusionar las dos vistas en una sola página, los préstamos externos (`prestado_externo`) aparecían **duplicados**: una vez en el bloque "Inversiones" (porque tienen clientes vinculados) y otra vez en el bloque "Deudas personales activas" (porque son préstamos por devolver).

### Solución (Opción A — separar por tipo)
- **Bloque "Inversiones"**: ahora muestra **solo inversiones con capital propio** (`origenCapital !== 'prestado_externo'`). Los préstamos externos se excluyen de este bloque.
- **Bloque "Deudas personales activas"**: muestra los préstamos externos con **toda la información de recuperación integrada**:
  - Clientes vinculados (cantidad)
  - Recuperado (neto, automático)
  - Margen neto mensual (bruto)
  - Aporte neto mensual a recuperación
  - Tiempo restante para recuperar
  - Ganancia por cliente (desglose)
- Cada elemento aparece **una sola vez** en la vista.

### Cambios técnicos
- `js/ui/render.js`: `render.inversion()` filtra `_inversionesPropias` excluyendo `prestado_externo` del bloque Inversiones.
- `js/cobros/inversion.js`: `_cardDeuda()` ahora incluye una sección "Recuperación de la inversión" con todos los datos de recuperación y clientes vinculados.
