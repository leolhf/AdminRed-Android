# AdminRed v5.19.0 — Caja "Dos bolsillos"

**Fecha:** 19 de septiembre de 2026
**Esquema de datos:** 9 → **10** (migración automática)

## Resumen

Se rediseña la caja con un modelo mucho más simple y visual: **dos bolsillos**.

Cada mes, la **ganancia del mes** (ingresos − gastos) se reparte automáticamente:

- 🔒 **Reserva** — un % configurable (default **70%**) que **no se toca**.
- 💸 **Libre** — el resto (30%), que es lo que puedes retirar.

Los **retiros** salen **solo del bolsillo libre**. Además, los retiros **dejan de
guardarse como gastos** (antes ensuciaban la utilidad: un retiro tuyo no es un
gasto del negocio). Ahora viven en su propio array `state.retiros`.

### Por qué este cambio

El modelo anterior mezclaba dos escalas (fondo acumulado vs. reserva mensual) y
guardaba los retiros como gastos, lo que hacía que la utilidad no reflejara la
operación real. El modelo de dos bolsillos es consistente: **los dos bolsillos
siempre suman el fondo de caja**, y cada peso tiene un dueño claro.

## Cambios

### 1. Nuevo cálculo: `RN.calc.bolsillos(mes)` (`calculations.js`)
- Recorre los meses con actividad y reparte la ganancia de cada mes:
  - `reserva` = Σ `max(0, gananciaMes) × pct/100` (acumulado; los meses con
    pérdida no tocan la reserva).
  - `fondo` = `fondoCaja()` (saldo inicial + ingresos + depósitos − gastos − retiros).
  - `libre` = `fondo − reserva`.
  - `retirable` = `max(0, libre)`.
  - `cubierta` = `fondo >= reserva`.
- Devuelve además `reservaAcum`, `libreAcum`, `gananciaTotal`, `retiros`,
  `depositos`, `saldoInicial` y `meses`.
- `RN.calc.reservaCaja(mes)` se conserva como **alias retrocompatible** de
  `bolsillos()`.

### 2. Retiros separados de los gastos (`state.retiros`)
- Nuevo array `state.retiros` (esquema 10). Cada retiro: `{ id, concepto, monto, fecha, mes }`.
- `RN.calc.totalRetiros()` suma los retiros históricos.
- `RN.calc.fondoCaja()` ahora **resta los retiros** (antes restaban como gastos).
- `caja.js`: `guardar()`, `listar()` y `eliminar()` operan sobre `state.retiros`.
- **Migración v9→v10**: los gastos con `esRetiroCaja=true` se mueven a
  `state.retiros` y se quitan de `state.gastos`.

### 3. Modal de retiro con dos bolsillos (`caja.js`)
- Muestra el bloque **"🔒 Dos bolsillos"**: Reserva (intocable), Libre para ti y
  "Puedes retirar (del bolsillo libre)".
- El límite de retiro es el **bolsillo libre**; si el monto lo supera, se advierte
  que se está tocando la reserva (solo advierte, no bloquea).
- El desglose del fondo incluye ahora la línea de **Retiros**.

### 4. Widget "🔒 Caja — Dos bolsillos" en el Panel (`panel-widgets.js`)
- Muestra Reserva, Libre, Fondo total y "Puedes retirar".
- **Barra visual** proporcional (verde = reserva, azul = libre) con porcentajes.
- Botones rápidos: Depositar, Retirar, Depósitos, Retiros.
- Alerta en "Requiere tu atención" si el fondo está por debajo de la reserva.

### 5. Ajustes (`index.html`)
- La etiqueta del campo ahora describe el modelo de dos bolsillos.

### 6. Persistencia
- `storage-local.js`, `checkpoint.js` (undo), `reset-app.js` y `export.js`
  incluyen `retiros` en serialización, restauración, reset y validación de respaldos.

## Archivos modificados
- `js/version.js` — `APP_VERSION = '5.19.0'`
- `js/core/state.js` — `retiros: []`
- `js/core/calculations.js` — `bolsillos()`, `totalRetiros()`, `fondoCaja()` resta retiros
- `js/core/migration.js` — esquema 10 + migración v9→v10
- `js/core/checkpoint.js` — `retiros` en snapshots de undo
- `js/storage/storage-local.js` — `retiros` en serializar/cargar/aplicar
- `js/storage/export.js` — `retiros` en validación y resumen de respaldo
- `js/reset-app.js` — limpiar `retiros` al resetear
- `js/cobros/caja.js` — retiros desde `state.retiros` + modal dos bolsillos
- `js/panel/panel-widgets.js` — widget dos bolsillos con barras
- `js/ui/render.js` — sub-texto del KPI Fondo de caja
- `index.html` — título del widget + etiqueta en Ajustes
- `js/DEPENDENCIAS.md` — nota v5.19.0

## Notas
- **Migración automática**: los retiros que antes eran gastos se mueven solos al
  nuevo array; no se pierde información.
- Los depósitos siguen sumando al fondo (no cambian).
- El modelo de cortes y el reparto de costo del paquete no cambian.
