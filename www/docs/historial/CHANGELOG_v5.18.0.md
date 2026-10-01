# AdminRed v5.18.0 — Reserva de caja sobre la ganancia proyectada

**Fecha:** 19 de septiembre de 2026
**Esquema de datos:** 9 (sin cambios — no requiere migración)

## Resumen

Se cambia la **base de cálculo de la Reserva de caja**. Antes se calculaba sobre
la **utilidad neta del mes** (ingresos − todos los gastos). Ahora se calcula
sobre la **ganancia proyectada del mes** (ingreso esperado de los clientes
activos − costo del paquete del proveedor).

Motivo: la reserva debe apartarse de lo que el negocio **espera ganar** este mes
(la ganancia proyectada, que es el indicador de rentabilidad del mes), no de la
utilidad neta ya realizada. Así la reserva es más estable y refleja la ganancia
operativa del mes antes de gastos puntuales.

## Cambios

### 1. Cálculo de la reserva (`calculations.js`)
- `RN.calc.reservaCaja(mes)` ahora usa como base la **ganancia proyectada del
  mes**:
  - `base` = `ingresoEsperadoMes(mes) − montoPaqueteProveedor()`.
  - `reserva` = `base × pct/100` (0 si la base es negativa).
  - `libre` = `base − reserva`.
  - `retirable` = `max(0, fondo − reserva)`.
  - `cubierta` = `fondo >= reserva`.
- Se añaden al objeto devuelto `base`, `esperado` y `costoPaquete` para
  transparencia. Se conserva `utilidad` como **alias retrocompatible** de `base`
  (v5.17.0 exponía `utilidad`).

### 2. Widget "🔒 Reserva de caja" en el Panel (`panel-widgets.js`)
- La primera línea pasa de "Utilidad neta del mes" a
  **"Ganancia proyectada del mes"**.
- El texto explicativo y el encabezado mencionan la ganancia proyectada.

### 3. Modal de retiro (`caja.js`)
- El bloque de reserva muestra **"Ganancia proyectada del mes"** y el título
  "Reserva de caja (% de la ganancia proyectada)".
- El aviso al retirar por debajo de la reserva sigue funcionando igual (solo
  advierte, no bloquea).

### 4. Ajustes (`index.html`)
- La etiqueta del campo "% de reserva de caja" ahora describe la **ganancia
  proyectada del mes** (ingreso esperado − costo del paquete) en lugar de la
  utilidad neta.

## Archivos modificados
- `js/version.js` — `APP_VERSION = '5.18.0'`
- `js/core/calculations.js` — `reservaCaja()` usa ganancia proyectada como base
- `js/panel/panel-widgets.js` — etiquetas del widget Reserva
- `js/cobros/caja.js` — etiquetas del modal de retiro
- `index.html` — etiqueta del campo en Ajustes
- `js/core/state.js`, `js/core/config.js`, `js/core/migration.js` — comentarios
- `js/DEPENDENCIAS.md` — nota v5.18.0

## Notas
- **Sin cambios de esquema**: `config.pctReservaCaja` y `state.depositos` siguen
  igual (esquema 9). No hay migración.
- El resto del modelo (cortes, reparto de costo del paquete, depósitos) no
  cambia. Solo cambia la base sobre la que se aplica el porcentaje de reserva.
