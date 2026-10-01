# Changelog v5.14.1 — Cuadre de caja

## Resumen

Se implementó la funcionalidad de **Cuadre de caja**, evaluada en `recomendacion_cuadre_caja.txt`, siguiendo la opción recomendada (Opción B): la diferencia entre el saldo calculado por la app y el saldo real contado físicamente se registra con una **categoría dedicada "Descuadre de caja"**, separada de "Gasto personal" y de "Retiro de caja".

### Qué hace

Nuevo módulo `js/cobros/cuadre.js`:

- **`RN.cuadre.abrir()`** — modal que muestra el saldo calculado (`RN.calc.fondoCaja()`), permite introducir el saldo real contado y calcula la diferencia en tiempo real.
- **`RN.cuadre.guardar()`** — registra la diferencia:
  - **Faltante** (real < calculado): se guarda como gasto normal (categoría "Descuadre de caja", monto positivo). Resta del fondo de caja.
  - **Sobrante** (real > calculado): se guarda con monto **negativo** bajo la misma categoría. Como `gastosTotales()` lo suma con signo negativo, el efecto neto es sumar al fondo de caja — es el "ingreso de ajuste" descrito en la recomendación, sin necesitar un modelo de datos nuevo para ingresos sueltos (los ingresos reales solo existen ligados a un cliente en `RN.state.history`).
  - Si el cuadre es exacto (diferencia < 0.01 CUP), no se registra ningún movimiento.
- **`RN.cuadre.listar()`** — historial de cuadres con badge Faltante/Sobrante, total neto perdido/a favor, y opción de eliminar (por si el usuario se equivocó al contar).
- **`RN.cuadre.eliminar()`** — elimina un cuadre y revierte su efecto en el fondo de caja.

### Por qué esta categoría y no "Gasto personal"

Un descuadre es dinero que **no se sabe dónde fue** — no es un retiro consciente. Mezclarlo con "Gasto personal" o "Retiro de caja" impediría distinguir en los reportes cuánto se retiró intencionalmente vs. cuánto se perdió por error, y ocultaría patrones (ej: un descuadre recurrente de ~500 CUP cada mes puede indicar un error sistemático al cobrar).

### Cambios en la UI

- `index.html`: nuevos botones "🧮 Cuadre de caja" e "Historial de cuadres" en la vista de Gastos.
- `js/ui/render.js` (`RN.render.gastos`): los movimientos de cuadre ahora muestran su propio ícono (🧮), badge ("Faltante de caja" / "Sobrante de caja") y color (verde para sobrante, rojo para faltante) en vez de mostrarse genéricamente como "Gasto" con un monto negativo.

### Archivos modificados

- `js/cobros/cuadre.js` (nuevo)
- `js/ui/render.js` — render de gastos distingue cuadres de gastos normales
- `index.html` — botones de la nueva funcionalidad + carga del script
- `sw.js` — se agregó `cuadre.js` al precache
- `js/version.js` — `APP_VERSION` → `5.14.1`
