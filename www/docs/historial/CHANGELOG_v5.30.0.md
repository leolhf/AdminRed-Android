# AdminRed v5.30.0 — Caja multimoneda: se corrige el pago MIXTO y se añaden movimientos por moneda

**Fecha:** 2026-09-25

## Resumen

Dos problemas detectados en la caja (retiros/depósitos del fondo):

1. **El modo MIXTO no se comportaba como mixto, sino como USD.** El desglose por
   moneda solo contemplaba la rama exacta `moneda === 'USD'`; todo lo demás caía
   en la rama CUP. Un movimiento mixto (ej: $20 + 3.000 CUP) se guardaba con su
   total en CUP (5.400) y esa cifra entera se contaba como **CUP físico**, por lo
   que:
   - la parte en dólares nunca entraba a la gaveta de USD (`usdEnCaja()`), y
   - el equivalente del USD se sumaba al CUP físico (`cupEnCaja()`).

   En la práctica, entrar $20 + 3.000 CUP dejaba la gaveta con **0 USD y 5.400 CUP**.
   Los saldos por moneda quedaban descuadrados justo después de cada movimiento mixto.

2. **No se podía extraer/depositar dirigido a una moneda concreta.** Los botones
   "Retirar USD" / "Depositar USD" del modal *Caja por moneda* abrían el modal
   genérico y luego intentaban cambiar la moneda con `setTimeout(..., 0)`, un
   parche frágil. Además un retiro solo se validaba contra el total en CUP: se
   podían **retirar 50 USD físicos sin tener ni un dólar** en la gaveta.

## Correcciones

### `js/core/calculations.js`
- Nuevo `RN.calc.monedaMovimiento(m)`: normaliza la moneda (`CUP` | `USD` | `MIXTO`; sin campo ⇒ CUP).
- Nuevo `RN.calc.desgloseMovimiento(m)`: devuelve la composición física real
  `{ moneda, usd, cup, cupDesdeUSD }`. El caso MIXTO se reconstruye desde
  `montoOriginal` + `montoCUPDirecto` (y si un registro antiguo no trae
  `montoCUPDirecto`, se deduce como `monto − usd × tasa`, sin perder el dato).
- `usdEnCaja()` ahora suma la parte en USD de los movimientos mixtos
  (depósitos y retiros), no solo los de moneda `USD`.
- `totalDepositosPorMoneda()` / `totalRetirosPorMoneda()` usan el desglose real:
  el CUP físico ya no absorbe el equivalente del USD.
- Nuevo `RN.calc.saldosMoneda()`: `{ usd, cup, tasa, usdEnCUP, totalCUP }`, la foto
  física de la gaveta ahora mismo.
- Nuevo `RN.calc.validarMovimientoCaja(datos, tipo)`: función pura que impide
  retirar más billetes de los que hay **de esa moneda** (ni dólares ni pesos de más)
  y rechaza montos negativos. Un depósito nunca se bloquea.

### `js/cobros/caja.js`
- `depositar(monedaInicial)` y `extraer(monedaInicial)`: se abren dirigidos a una
  moneda (`'CUP'`, `'USD'` o `'MIXTO'`), sin `setTimeout`.
- Ambos modales muestran ahora **"USD en la gaveta"** y **"CUP en la gaveta"**
  antes de escribir el monto, para no intentar sacar lo que no existe.
- El historial de depósitos y retiros muestra el desglose real
  (`$20.00 + 3.000,00 CUP`) y el pie separa **CUP físico** de **USD físico**.
- La validación en vivo del retiro avisa y **bloquea el botón** si el monto excede
  la existencia física de la moneda elegida (antes solo advertía por el bolsillo libre).
- `guardar()` revalida por moneda antes de registrar (defensa en profundidad).

### `js/core/moneda.js`
- `initBloquePago(prefix, monedaInicial)` acepta moneda inicial.
- `setMonedaBloque()` retrocede a CUP con aviso si no hay tasa o no se ha configurado
  USD, evitando estados imposibles.
- `leerBloquePago()` expone `montoCUPDirecto` (parte pagada en pesos) de forma explícita.
- Nuevo `RN.moneda.esMixto(datos)`: MIXTO se deduce siempre de los montos reales
  (USD > 0 **y** CUP > 0), nunca del botón pulsado.

### `js/panel/panel-widgets.js`
- La tarjeta **Caja — Dos bolsillos** muestra el USD y el CUP físicos de la gaveta.
- Botonera ampliada: Depositar / Retirar genéricos **+ Depositar USD, Retirar USD,
  Depositar CUP, Retirar CUP**.

### `js/version.js`
- `APP_VERSION` → `5.30.0` (invalida la caché del service worker).

### `tools/test-caja-monedas.js` (nuevo)
Verificación automática con Node, sin navegador: `node tools/test-caja-monedas.js`.
Cubre el depósito y el retiro mixtos, la separación de saldos, el bloqueo por
moneda, la compatibilidad con registros antiguos y la detección de MIXTO.
