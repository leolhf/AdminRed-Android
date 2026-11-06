# Changelog AdminRed v5.13.2

Versión de **refactorización y fusión** de la sección Deuda e Inversión.
Se unifican los módulos `deudas.js` e `inversion.js` (que gestionaban el
mismo modelo de datos con solo un filtro de diferencia), se consolida la
responsabilidad de las devoluciones de préstamo en un único módulo, se
extraen helpers compartidos para eliminar código duplicado, y se corrige
un bug en la función `eliminar()` que borraba devoluciones incluso para
inversiones de capital propio.

**Sin cambios en el modelo de datos ni en la interfaz de usuario.**
Todos los cambios son internos (arquitectura y mantenibilidad) y son
totalmente compatibles hacia atrás. El usuario no percibe diferencia
visual ni funcional.

---

## Paso 1 — Extraer helpers compartidos en `investment.js`

### Helper `_cobrosClienteDesde(clienteId, inv)`
Centraliza el filtro de cobros que estaba duplicado **3 veces** en
`aporteCliente()`, `aporteRecuperacionCliente()` y `margenNetoCliente()`.
El filtro selecciona los cobros de un cliente desde la fecha de compra de
la inversión, respetando la comparación por mes para no inflar con cobros
de meses anteriores.

### Helper `_margenMensualClientes(inv, mes)`
Centraliza el bucle de cálculo de margen mensual que estaba duplicado
**3 veces** en `aporteMensualNeto()`, `margenMensualBruto()` y
`retiroMensualEstimado()`. Itera los clientes vinculados, calcula el
precio neto y el costo del mega, y suma el margen cuando es positivo.

### Resultado
- **6 funciones simplificadas** que ahora delegan a 2 helpers.
- `investment.js`: 646 → 638 líneas (−8 líneas, menor complejidad ciclomática).
- Eliminada la duplicación del filtro de cobros (3×) y del bucle de margen (3×).

---

## Paso 2 — Fusionar `deudas.js` en `inversion.js`

### Problema
`deudas.js` (201 líneas) y `inversion.js` gestionaban **el mismo modelo
de datos** (`RN.state.investments`). La única diferencia era un filtro:
`deudas.js` mostraba solo préstamos externos (`origenCapital === 'prestado_externo'`),
mientras `inversion.js` mostraba todas las inversiones. Esto producía:

- **Dos funciones `eliminar()` divergentes** con lógica contradictoria.
- **Código duplicado** en render, KPIs y tarjetas.
- **Confusión arquitectónica**: dos módulos para el mismo dato.

### Solución
- Se movieron las funciones de vista de deudas (`renderDeudas()`,
  `_renderKPIsDeudas()`, `_renderDeudasActivas()`, `_renderDeudasConcluidas()`,
  `_cardDeuda()`) de `deudas.js` a `inversion.js`.
- Se **eliminó el archivo `deudas.js`** (201 líneas eliminadas).
- Se actualizó `index.html`: eliminado el `<script src="js/cobros/deudas.js">`.
- Se actualizó `render.js`: `RN.deudas.render()` → `RN.inversion.renderDeudas()`.

### Bug corregido: `eliminar()` divergente
**Antes (v5.13.0–v5.13.1):** Existían DOS funciones `eliminar()` con lógica
contradictoria:

- `inversion.eliminar()` (inversion.js): solo borraba devoluciones si era
  préstamo externo (lógica correcta).
- `deudas.eliminar()` (deudas.js): **SIEMPRE** borraba las devoluciones
  asociadas, incluso para capital propio.

**Ahora (v5.13.2):** Existe una **única función `eliminar()`** unificada
con la lógica correcta: solo elimina las devoluciones asociadas cuando
`origenCapital === 'prestado_externo'`. Para capital propio, las
devoluciones se conservan en el historial de gastos. El mensaje de
confirmación se adapta automáticamente: "deuda personal" vs "inversión".

---

## Paso 3 — Mover devoluciones de `caja.js` a `inversion.js`

### Problema
`caja.js` (421 líneas) mezclaba **dos responsabilidades distintas**:

1. **Retiros de caja** (extracciones de efectivo del negocio).
2. **Devoluciones de préstamo** (pagos para liquidar deuda personal).

Las devoluciones de préstamo son conceptualmente parte del módulo de
inversión/deuda, no de la caja general. Esta mezcla violaba el principio
de responsabilidad única.

### Solución
- Se movieron las funciones de devoluciones (`devolucionPrestamo()`,
  `_validarDevolucion()`, `guardarDevolucion()`, `historialDevoluciones()`,
  `eliminarDevolucion()`) de `caja.js` a `inversion.js`.
- `caja.js`: 421 → 212 líneas (−209 líneas, −50%). Ahora solo contiene
  retiros de caja.
- Se actualizaron las referencias en `render.js`:
  `RN.caja.devolucionPrestamo` → `RN.inversion.devolucionPrestamo`,
  `RN.caja.historialDevoluciones` → `RN.inversion.historialDevoluciones`.
- Los botones de las tarjetas de deuda ahora llaman directamente a
  `RN.inversion.devolucionPrestamo()` y `RN.inversion.historialDevoluciones()`.

### Resultado
- `caja.js` tiene ahora **responsabilidad única**: solo retiros de caja.
- `inversion.js` centraliza **toda** la lógica de inversión + deuda +
  devoluciones en un solo módulo coherente.

---

## Paso 4 — Extraer helper de filas en `render.js`

### Helper `render._filaDetalle(label, valor, opts)`
Centraliza la generación de filas de detalle (`.acc-row`) en las tarjetas
de inversión. El patrón `<div class="acc-row"><span class="acc-label">…`
estaba repetido **~22 veces** en `render.inversion()`, con variantes
condicionales escritas como ternarios inline `(cond ? '…' : '')`.

### Opciones del helper
- `bold` — aplica `font-weight:600` a toda la fila.
- `strong` — envuelve el valor en `<strong>` (para valores planos).
- `color` — aplica `style="color:VAR"` dentro del `<strong>`.
- `cond` — si es `false`, devuelve `''` (fila omitida). Reemplaza los
  ternarios `(cond ? '…' : '')` por `{ cond: cond }`.

### Resultado
- **22 filas condicionales** refactorizadas a llamadas al helper.
- Las filas condicionales (`esPrestamo`, `pctPersonal > 0`,
  `pctGananciaMes > 0`, `inv.monedaPago`) ahora usan `{ cond: … }`.
- Mayor legibilidad: cada fila es una llamada de una línea en lugar de
  un string HTML inline con ternarios anidados.
- `render.barraRecuperacion()` no aplica (usa estructura `.recup-dato`,
  no `.acc-row`).

---

## Resumen de cambios arquitectónicos

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `js/version.js` | Versión 5.13.1 → 5.13.2 | — |
| `js/core/models/investment.js` | 2 helpers extraídos, 6 funciones simplificadas | 646 → 638 |
| `js/cobros/inversion.js` | Absorbe lógica de deudas + devoluciones | 628 (fusionado) |
| `js/cobros/deudas.js` | **ELIMINADO** (fusionado en inversion.js) | 201 → 0 |
| `js/cobros/caja.js` | Devoluciones movidas a inversion.js | 421 → 212 |
| `js/ui/render.js` | Helper `_filaDetalle()` + 22 filas refactorizadas | 942 → 963 |
| `index.html` | Eliminado `<script src="js/cobros/deudas.js">` | — |

**Líneas netas eliminadas: ~200** (deudas.js eliminado + caja.js reducido a la mitad).
**Código duplicado eliminado:** filtro de cobros (3×), bucle de margen (3×),
22 filas HTML inline (1 helper).
**Bug corregido:** `eliminar()` divergente (siempre borraba devoluciones → solo para préstamos).
**Referencias rotas verificadas:** 0 (cero referencias a `RN.deudas`, `RN.caja.devolucion*` o `deudas.js` en código ejecutable).

---

## Paso 5 (diferido a futura versión)

La unificación del modelo de datos (fusionar `deudaEquipo` por cliente con
el array `investments`) se evaluó como **riesgo alto** porque requiere
migración de datos existentes y cambio del esquema de persistencia. Se
diferirá a una versión futura (v5.14.0) donde se pueda realizar con
migración automática y pruebas extensas.

---

## Verificación

- **Sintaxis JS:** Todos los archivos JS verificados con `node --check` — 0 errores.
- **Referencias rotas:** Búsqueda de `RN.deudas`, `RN.caja.devolucion`,
  `RN.caja.guardarDevolucion`, `RN.caja.historialDevoluciones`,
  `RN.caja.eliminarDevolucion`, `RN.caja._validarDevolucion`, `deudas.js`
  — **cero coincidencias en código ejecutable** (solo aparecen en
  comentarios de documentación del bug corregido).
- **Compatibilidad:** Sin cambios en el modelo de datos, la persistencia
  ni la interfaz. Los datos guardados en versiones anteriores se cargan
  sin migración.

---

## Fix CSS — Botones de Editar/Eliminar no visibles en móvil

### Problema
En la sección de Inversión, al expandir una tarjeta con muchos clientes
vinculados o muchas filas condicionales activas, los botones de
**Editar** y **Eliminar** (al final del detalle) no se veían en móvil.

**Causa:** `.acc-card.open .acc-details` tenía `max-height: 1200px` con
`overflow: hidden`. Las tarjetas de inversión pueden tener hasta ~23
filas de detalle + aportes por cada cliente + botones, superando los
1200px y cortando el contenido final.

### Solución
`styles.css`: `max-height: 1200px` → `max-height: 5000px` (mismo valor
que ya usan las cintillas de mes en el historial de cobros). Esto
garantiza que todo el contenido, incluidos los botones, sea visible al
expandir cualquier tarjeta.
