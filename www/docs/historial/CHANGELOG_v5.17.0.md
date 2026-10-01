# AdminRed v5.17.0 — Reserva de caja + Depósitos

**Fecha:** 19 de septiembre de 2026
**Esquema de datos:** 8 → **9** (migración automática)

## Resumen

Se añade el concepto de **Reserva de caja**: de la utilidad neta del mes, un
porcentaje configurable (por defecto **70%**) se reserva en la caja y no debería
tocarse; el resto queda libre para el administrador. Además, ahora se pueden
registrar **depósitos** a la caja (aportes de dinero al fondo), que antes no
existían.

Decisiones de diseño acordadas con el usuario:
- **1-B:** la reserva se calcula sobre la **utilidad neta del mes**
  (ingresos − todos los gastos), no sobre la ganancia bruta.
- **2-B:** modelo **"reparto del mes"**: 70% se queda como reserva, 30% es libre.
- **3-A:** al retirar por debajo de la reserva se **solo advierte** (no se bloquea).

## Cambios

### 1. Nuevo ajuste: % de reserva de caja
- **Ajustes → "% de la utilidad neta del mes a mantener como reserva en caja"**
  (default **70**, rango 0–100).
- Se guarda en `config.pctReservaCaja` y se lee/rellena en `config.js`.

### 2. Cálculo de la reserva (`calculations.js`)
- `RN.calc.reservaCaja(mes)` devuelve:
  - `utilidad` — utilidad neta del mes (ingresos − gastos).
  - `reserva` — utilidad × pct/100 (0 si la utilidad es negativa).
  - `libre` — utilidad − reserva (lo retirable del mes).
  - `fondo` — fondo de caja actual.
  - `retirable` — `max(0, fondo − reserva)` (lo que la caja permite retirar hoy).
  - `cubierta` — `fondo >= reserva`.
- `RN.calc.totalDepositos()` — suma de depósitos históricos.
- `RN.calc.fondoCaja()` ahora incluye los depósitos:
  `saldoInicial + ingresos + depósitos − gastos`.

### 3. Depósitos a la caja (`caja.js`)
- `RN.caja.depositar()` — modal para registrar un depósito (monto, concepto, fecha).
- `RN.caja.guardarDeposito()` — guarda en `state.depositos` y refresca la UI.
- `RN.caja.listarDepositos()` — historial de depósitos con total.
- `RN.caja.eliminarDeposito(id)` — elimina un depósito (resta del fondo).
- Los depósitos **suman** al fondo (a diferencia de los gastos, que restan).

### 4. Aviso de reserva en el modal de retiro
- El modal **"Extraer del fondo de caja"** ahora muestra un bloque con la
  utilidad neta, la reserva a mantener, lo libre para ti y cuánto puedes retirar
  sin tocar la reserva.
- Al escribir un monto que deja la caja por debajo de la reserva, se muestra una
  advertencia (🔒) pero **se permite continuar** (decisión 3-A).
- El desglose del fondo ahora incluye la línea de **Depósitos**.

### 5. Widget "🔒 Reserva de caja" en el Panel
- Nuevo bloque en el Panel con: utilidad neta del mes, reserva (%), libre (%),
  fondo actual y "puedes retirar sin tocar la reserva".
- Botones rápidos: **Depositar**, **Retirar**, **Depósitos**, **Retiros**.
- Si el fondo está por debajo de la reserva, muestra cuánto falta para cubrirla.

### 6. Alerta en "Requiere tu atención"
- Si el fondo de caja está por debajo de la reserva, aparece una alerta ámbar
  con el monto que falta y un botón "Ver caja".

### 7. Migración de datos (esquema 8 → 9)
- `migration.js` añade `state.depositos = []` y `config.pctReservaCaja = 70`
  para datos de versiones anteriores.
- `storage-local.js`, `checkpoint.js` (undo), `reset-app.js` y `export.js`
  incluyen `depositos` en serialización, restauración, reset y validación de
  respaldos.

## Archivos modificados
- `js/version.js` — `APP_VERSION = '5.17.0'`
- `js/core/state.js` — `depositos: []`, `config.pctReservaCaja: 70`
- `js/core/calculations.js` — `totalDepositos()`, `reservaCaja()`, `fondoCaja()`
- `js/core/config.js` — default, guardar y rellenar `pctReservaCaja`
- `js/core/migration.js` — esquema 9 + migración v8→v9
- `js/core/checkpoint.js` — `depositos` en snapshots de undo
- `js/storage/storage-local.js` — `depositos` en serializar/cargar/aplicar
- `js/storage/export.js` — `depositos` en validación y resumen de respaldo
- `js/reset-app.js` — limpiar `depositos` al resetear
- `js/cobros/caja.js` — depósitos + aviso de reserva en retiro
- `js/panel/panel-widgets.js` — `renderReserva()` + alerta de reserva
- `index.html` — contenedor `#panel-reserva` + campo en Ajustes
- `js/DEPENDENCIAS.md` — nota v5.17.0

## Notas
- Sin cambios en el modelo de cortes ni en el reparto de costo del paquete
  (v5.15.2). La reserva es un concepto independiente sobre la utilidad neta.
- Los depósitos no afectan la utilidad del mes (no son ingresos de servicio ni
  gastos); solo mueven el fondo de caja.
