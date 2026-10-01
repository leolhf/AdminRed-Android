# Changelog v5.13.20 — El mes operativo SIEMPRE es el mes real del reloj

## Resumen

Se rediseñó el sistema de mes operativo para que **siempre coincida con el mes real del reloj del sistema**. Esto elimina la posibilidad de cerrar un mes dos veces por error y simplifica la lógica de la app.

### Problema
El sistema anterior (v5.13.1) permitía que el mes operativo (`RN.state.mesActual`) se "adelantara" al cerrar mes. Por ejemplo, si cerrabas enero el día 31, el mes operativo pasaba a febrero aunque el reloj siguiera en enero. Esto causaba dos problemas:

1. **Doble cierre:** Si el usuario cerraba enero y luego volvía a pulsar "Cerrar mes", podía cerrar febrero antes de tiempo (incluso estando aún en enero calendario).
2. **Mes estancado:** Si el usuario NO cerraba el mes, la app se quedaba "estancada" en un mes anterior indefinidamente (ej: julio cuando ya era agosto).

### Solución (Opción B)

**El mes operativo SIEMPRE es el mes real del reloj del sistema.** Ya no se puede adelantar ni atrasar.

#### Cambios:

1. **`RN.calc.mesActualStr()`** (`calculations.js`):
   - Antes: priorizaba `RN.state.mesActual` si era válido, sino usaba el reloj.
   - Ahora: **siempre** usa el reloj del sistema (`new Date()`), igual que `mesRealStr()`.
   - `mesActualStr()` y `mesRealStr()` ahora son idénticas en comportamiento.

2. **`RN.monthReset.confirmar()`** (`month-reset.js`):
   - Antes: generaba snapshot, anulaba descuentos y **adelantaba** `RN.state.mesActual` al mes siguiente.
   - Ahora: genera snapshot, anula descuentos, aplica `paquetePendiente` pero **NO adelanta el mes**. El mes cambia automáticamente cuando avanza el calendario del sistema.
   - **Nueva validación de doble cierre:** Si ya existe un snapshot para el mes actual, el botón "Cerrar mes" muestra un aviso "El mes de [mes] ya fue cerrado. No puedes cerrarlo dos veces." y no permite el cierre.

3. **`RN.init.arrancar()`** (`init.js`):
   - Al arrancar, llama `RN.calc.sincronizarMesReal()` para asegurar que `RN.state.mesActual` refleje el mes actual del calendario (por si cambió mientras la app estuvo cerrada).
   - Se eliminó el aviso de sincronización de v5.13.19 (`avisoSincronizarMes`) — ya no se necesita porque el mes siempre es el real.

4. **`RN.render.dashboard()`** (`render.js`):
   - Ya no compara `mesAct !== mesReal` (siempre son iguales). El badge del dashboard simplemente muestra "Mes: [mes actual]".

5. **Tests** (`tests-calculo.js`):
   - Actualizado `_testMesActualRespetaState` para verificar el nuevo comportamiento: `mesActualStr()` siempre usa el reloj e ignora `RN.state.mesActual`.

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `js/core/calculations.js` | `mesActualStr()` siempre usa el reloj del sistema |
| `js/cobros/month-reset.js` | `confirmar()` solo genera snapshot, NO adelanta mes. Validación de doble cierre. |
| `js/init.js` | `sincronizarMesReal()` al arrancar. Eliminado `avisoSincronizarMes`. |
| `js/ui/render.js` | Dashboard no compara mesAct vs mesReal |
| `js/tests/tests-calculo.js` | Test actualizado para nuevo comportamiento |
| `js/version.js` | `5.13.19` → `5.13.20` |

### Beneficios

- **No más doble cierre:** Es imposible cerrar un mes dos veces. La app detecta si ya existe un snapshot del mes actual y bloquea el cierre.
- **No más mes estancado:** El mes operativo siempre avanza con el calendario real. Si abres la app en agosto, el mes operativo es agosto.
- **Simplicidad:** Ya no hay distinción entre "mes operativo" y "mes real". Todo el sistema usa el mes del reloj, eliminando casos borde y bugs relacionados con meses desincronizados.
- **El snapshot sigue siendo manual:** El usuario decide cuándo generar el snapshot del mes (botón "Cerrar mes"), pero el mes operativo avanza solo con el calendario. Si el usuario no genera el snapshot, puede hacerlo después — pero no puede generar dos snapshots del mismo mes.

### Comportamiento esperado

1. **Inicio de mes (ej: 1 de agosto):** La app muestra agosto como mes operativo. El usuario trabaja normalmente (registra cobros, gastos, etc.).
2. **Cierre de mes (ej: 31 de agosto):** El usuario pulsa "Cerrar mes". Se genera el snapshot de agosto. Los descuentos puntuales no aplicados se anulan. El `paquetePendiente` se aplica si existe. **El mes operativo sigue siendo agosto.**
3. **Cambio de mes (ej: 1 de septiembre):** Al abrir la app, el mes operativo es ahora septiembre (porque el reloj del sistema cambió). El usuario trabaja en septiembre.
4. **Intento de doble cierre:** Si el usuario pulsa "Cerrar mes" en agosto y ya hay un snapshot de agosto, la app muestra: "El mes de agosto 2025 ya fue cerrado. No puedes cerrarlo dos veces."
