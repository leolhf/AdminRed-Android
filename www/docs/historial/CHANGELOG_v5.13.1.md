# Changelog AdminRed v5.13.1

Versión de corrección de errores detectados en la auditoría de v5.13.0.
Se corrigen los 18 bugs identificados sin cambiar la arquitectura ni el
modelo de datos existente. Todos los cambios son compatibles hacia atrás.

---

## Bug #1 — `mesActual` guardado pero nunca leído
**Archivo:** `js/core/calculations.js`, `js/cobros/month-reset.js`

`RN.state.mesActual` se persistía en localStorage pero ninguna función de
cálculo lo leía; `mesActualStr()` siempre devolvía el mes del reloj del
sistema. Al cerrar un mes (month-reset), se avanzaba `mesActual` pero las
vistas seguían mostrando el mes real del sistema, produciendo
incoherencias entre lo que el usuario veía y lo que se calculaba.

**Corrección:** `mesActualStr()` ahora devuelve `RN.state.mesActual` si
existe y tiene formato `YYYY-MM` válido; solo si no existe cae al reloj
del sistema. Se añadieron helpers `sincronizarMesReal()` y `mesRealStr()`.
En `month-reset.js` se precomputa `mesSiguiente` y se usa tanto en el
texto de confirmación como en la asignación `RN.state.mesActual`.

---

## Bug #2 — Pago parcial mezclaba servicio y equipo en `h.monto`
**Archivo:** `js/cobros/modal-cobro.js`

En pagos parciales, el historial registraba `h.monto = pagadoCUP` (que
incluía servicio + equipo mezclados), pero `ingresosMes()` suma
`h.monto`, causando doble conteo: el equipo se contaba como ingreso de
servicio. Además, el equipo no se descontaba de `c.deudaEquipo`.

**Corrección:** Se separan `montoServicioRegistrado` (siempre solo
servicio) y `montoEquipoPagado` (siempre solo equipo). En pago parcial, el
pago se asigna primero al servicio (`Math.min(pagadoCUP, neto)`) y el
resto al equipo (`Math.max(0, pagadoCUP - neto)`). El historial ahora
registra `h.monto = montoServicioRegistrado` y
`h.montoEquipo = montoEquipoPagado` por separado.

---

## Bug #3 — Descuento de equipo no aplicaba en pago parcial
**Archivo:** `js/cobros/modal-cobro.js`

La condición `if (montoEq > 0 && c.deudaEquipo > 0 && tipoPago !== 'parcial')`
excluía los pagos parciales, por lo que si el usuario pagaba parcialmente
y parte iba al equipo, `c.deudaEquipo` nunca se reducía.

**Corrección:** La condición ahora es `if (montoEquipoPagado > 0 && c.deudaEquipo > 0)`,
sin excluir pagos parciales, y usa `montoEquipoPagado` (el equipo
realmente pagado) en lugar de `montoEq`.

---

## Bug #4 — `getPrecioNeto(c)` sin mes: descuentos puntuales del mes equivocado
**Archivos:** `calculations.js`, `mora.js`, `cobranza.js`, `render.js`, `calendario.js`, `whatsapp.js`, `notifications.js`

`getPrecioNeto(c)` se llamaba sin parámetro `mes` en múltiples vistas.
Esto hacía que `getDescuentosPuntualesMes` usara el mes del sistema en
lugar del mes operativo (`RN.state.mesActual`), aplicando descuentos del
mes equivocado. Afectaba: mora, cobranza, render de clientes/cobros,
calendario, plantillas de WhatsApp y notificaciones.

**Corrección:** Todas las llamadas ahora pasan el mes explícito:
`getPrecioNeto(c, mes)` donde `mes = RN.calc.mesActualStr()`. En
calendario.js se usa `ym = RN.calendario._mesActual()`. Se añadió
`deudaTotalCliente(cliente, mes)` como función centralizada para que
todas las vistas usen el mismo cálculo de deuda total (servicio pendiente
+ deuda de equipo).

---

## Bug #5 — Importar archivo sobreescribía la tasa USD actual
**Archivo:** `js/storage/storage-local.js`

Al importar un archivo de backup viejo, `Object.assign(RN.state.config, data.config)`
sobreescribía la tasa USD actual con la tasa vieja del archivo. La lógica
de preservación existente tenía un defecto: después de decidir qué tasa
preservar, una llamada posterior a `Object.assign(RN.state.config, savedConfig)`
la volvía a sobreescribir.

**Corrección:** Se recopilan candidatos de tasa de 3 fuentes (estado
actual, archivo importado, localStorage) en un array `candidatos`, se
ordenan por `fechaTasaUsd` descendente, y la tasa más reciente se aplica
al FINAL, después de todas las llamadas a `Object.assign`.

---

## Bug #6 — Guardado duplicado en `guardarDevolucion`
**Archivo:** `js/cobros/caja.js`

`guardarDevolucion()` llamaba `RN.storageLocal.guardar()` dentro de
`if (concluida)` y luego incondicionalmente otra vez. El guardado dentro
del `if` era redundante y causaba doble checkpoint + doble I/O asíncrono.

**Corrección:** Se eliminó el guardado dentro de `if (concluida)`,
dejando solo el guardado incondicional. El toast de "Deuda liquidada" se
mantiene dentro del bloque `if (concluida)`.

---

## Bug #7 — Ticket promedio mezclaba todo el historial y tipos de cobro
**Archivo:** `js/reportes/estadisticas.js`

El ticket promedio se calculaba sobre TODO el historial (todos los meses)
e incluía `h.monto + h.montoEquipo` (servicio + equipo + ventas), lo que
diluía el ticket real del mes y mezclaba conceptos. El usuario veía un
ticket promedio que no reflejaba el cobro típico del mes actual.

**Corrección:** El ticket promedio ahora se calcula solo sobre los cobros
del mes actual (`h.mes === mesActual`) y solo de tipo servicio
(`h.tipo === 'servicio'` o sin tipo), usando solo `h.monto`. La etiqueta
cambió de "Ticket promedio" a "Ticket promedio (mes)".

---

## Bug #8 — `aUSD()` devolvía string vacío en lugar de 0
**Archivo:** `js/core/moneda.js`

`aUSD()` devolvía `''` (string) cuando no había tasa, y `toFixed(2)`
(string) cuando sí la había. Esto causaba errores de tipo: comparaciones
numéricas como `usd > 0` fallaban (`'' > 0` es `false` pero `'0.00' > 0`
es `false` por coerción), y concatenaciones producían resultados
inesperados.

**Corrección:** `aUSD()` ahora devuelve `0` (number) cuando no hay tasa, y
`+((+cup || 0) / tasa).toFixed(2)` (number) cuando sí la hay. `mostrar()`
usa `RN.moneda.formatUSD(usd)` y verifica `usd > 0` (comparación numérica
correcta).

---

## Bug #9 — `gastosMes()` comparación de mes con `startsWith` frágil
**Archivo:** `js/core/calculations.js`

`gastosMes()` usaba `(g.mes || '').startsWith(mes.slice(0, 7) || mes)`
para filtrar gastos del mes. Si `mes` era `undefined` o vacío, el
comportamiento era impredecible. `startsWith` también podía matchear
prefijos parciales no intencionados.

**Corrección:** Se reemplazó con `(g.mes || '').slice(0, 7) === mesNorm`
donde `mesNorm = (mes || '').slice(0, 7)`, una comparación exacta de
strings que es robusta y predecible.

---

## Bug #10 — `prediccionIngresos()` usaba promedio móvil simple de 3 meses
**Archivo:** `js/core/calculations.js`

La predicción usaba un promedio móvil simple de los últimos 3 meses, que
no captura tendencias (crecimiento o decrecimiento). Si los ingresos
venían subiendo, la predicción subestimaba; si venían bajando,
sobreestimaba.

**Corrección:** Se reemplazó por regresión lineal sobre los últimos 6
meses (`tendenciaMensual(6)`). Se calculan pendiente (`b`) e
intercepto (`a`) con las fórmulas de mínimos cuadrados, y la predicción
es `a + b * n` (proyección al mes siguiente). Si hay menos de 2 puntos,
devuelve el último valor. La predicción nunca es negativa.

---

## Bug #11 — Recuperación de inversión incluía cobros anteriores a la compra
**Archivo:** `js/core/models/investment.js`

`aporteCliente()`, `aporteRecuperacionCliente()` y `margenNetoCliente()`
filtraban cobros solo por fecha (`h.fecha >= fechaCompra`), pero no por
mes. Un cobro registrado con fecha posterior a la compra pero con `h.mes`
anterior al mes de compra se incluía, inflando el aporte y la
recuperación de inversión.

**Corrección:** Las tres funciones ahora filtran también por
`h.mes >= mesCompra` (donde `mesCompra = fechaCompra.slice(0, 7)`), en
adición al filtro de fecha existente.

---

## Bug #12 — `actualizarTasaAuto()` dependía de un único proxy CORS
**Archivo:** `js/core/moneda.js`

La consulta automática de tasa usaba solo `corsproxy.io`. Si este proxy
caía o cambiaba su API, la tasa automática nunca se actualizaba,
silenciosamente.

**Corrección:** Se implementaron múltiples proxies CORS en cascada:
`corsproxy.io` → `api.allorigins.win` → `cors-anywhere.herokuapp.com` →
conexión directa. Se itera sobre la lista y se usa el primer proxy que
devuelva una tasa válida. Si todos fallan, se muestra un toast solo si no
hay tasa manual configurada.

---

## Bug #13 — Sin validación financiera de datos inconsistentes
**Archivo:** `js/core/validacion.js`

La función `validar()` solo verificaba integridad referencial (IDs,
nombres, tipos de descuento) pero no validaba coherencia financiera:
precios negativos, deudas negativas, montos negativos, cobros duplicados
(mismo cliente + mes), gastos negativos, o tasa USD inválida con tasaAuto
activada.

**Corrección:** Se añadieron validaciones financieras:
- Clientes: precio negativo, `deudaEquipo` negativa
- Historial: `monto` negativo, `montoEquipo` negativo, cobros duplicados
  (mismo `clienteId` + `mes` + tipo servicio)
- Gastos: `monto` negativo
- Config: `tasaUsd` negativa, `tasaAuto` activada sin tasa válida

---

## Bug #14 — Restaurar checkpoint sobreescribía la tasa USD actual
**Archivo:** `js/core/checkpoint.js`

`restaurar()` hacía `RN.state.config = data.config || RN.state.config`,
lo que sobreescribía la tasa USD actual con la tasa del checkpoint
(vieja). Si el usuario había actualizado la tasa después del checkpoint,
la perdía al restaurar.

**Corrección:** Se preservan `tasaUsd` y `fechaTasaUsd` más recientes: se
comparan las fechas de la tasa actual vs la del checkpoint y se mantiene
la más reciente. Si solo una de las dos tiene tasa, se usa esa.

---

## Bug #15 — Comentario `getStatus()` decía "coherente con deuda" pero no lo era
**Archivo:** `js/core/calculations.js`

El comentario en `getStatus()` afirmaba que el estado era coherente con
la deuda total del cliente, pero antes del fix del Bug #2, los pagos
parciales no descontaban el equipo, por lo que `getStatus()` podía decir
"paid" cuando aún quedaba deuda de equipo.

**Corrección:** Tras el fix del Bug #2 (separación de servicio/equipo en
pagos parciales), `getStatus()` es efectivamente coherente. Se actualizó
el comentario para reflejar que la coherencia depende del correcto
registro de `h.monto` (solo servicio) y `h.montoEquipo` (solo equipo).

---

## Bug #16 — Guardados asíncronos sin debounce causaban picos de I/O
**Archivo:** `js/storage/storage-local.js`

Cada llamada a `guardar()` disparaba inmediatamente escritura a archivo
vinculado + IndexedDB. Operaciones rápidas (cobrar a 10 clientes
seguidos) acumulaban decenas de escrituras asíncronas simultáneas,
causando race conditions y picos de I/O.

**Corrección:** Los guardados asíncronos (archivo + IndexedDB) ahora se
agrupan con un debounce de 500ms (`_guardarAsyncDebounced`). Si llegan
múltiples llamadas dentro de 500ms, solo se ejecuta una escritura al
final. El checkpoint y `persistir()` (localStorage) siguen siendo
síncronos para no perder datos críticos.

---

## Bug #17 — Sin indicador de si el costo del mega está configurado
**Archivo:** `js/core/models/investment.js`

Las métricas de margen neto y recuperación de inversión asumen costo 0
cuando `proveedorPrecioMega` no está configurado, inflando los resultados.
No había forma de saber desde la UI si este costo estaba configurado.

**Corrección:** Se añadió `costoMegaConfigurado()` que devuelve `true` si
`proveedorPrecioMega > 0`. La UI puede usar esta función para advertir al
usuario que las métricas de margen/recuperación están infladas (asumen
costo 0) cuando devuelve `false`.

---

## Bug #18 — Migración de IP no validaba formato IPv4
**Archivo:** `js/core/migration.js`

La migración que convertía IPs planas (ej. `19216811`) a formato con
puntos (ej. `192.168.1.1`) no validaba el resultado. IPs malformadas
(4 octetos no numéricos, valores > 255, ceros iniciales) se aceptaban
silenciosamente, causando problemas en la gestión de red.

**Corrección:** Se añadió `_esIpValida(ip)` que valida formato IPv4
estrictamente: 4 octetos separados por puntos, cada uno 0-255, sin ceros
iniciales (excepto el propio 0). Se llama después de la migración en
ambos caminos (IPs con puntos existentes e IPs planas convertidas). Las
IPs inválidas se marcan con `c.ip = ''` y se registra una advertencia.

---

## Resumen de archivos modificados

| # | Archivo | Bugs corregidos |
|---|---------|-----------------|
| 1 | `js/version.js` | Versión → 5.13.1 |
| 2 | `js/core/calculations.js` | #1, #4, #9, #10, #15 |
| 3 | `js/cobros/modal-cobro.js` | #2, #3 |
| 4 | `js/cobros/month-reset.js` | #1 |
| 5 | `js/cobros/mora.js` | #4 |
| 6 | `js/cobros/cobranza.js` | #4 |
| 7 | `js/ui/render.js` | #4 |
| 8 | `js/reportes/calendario.js` | #4 |
| 9 | `js/notificaciones/whatsapp.js` | #4 |
| 10 | `js/notificaciones/notifications.js` | #4 |
| 11 | `js/reportes/estadisticas.js` | #7 |
| 12 | `js/core/moneda.js` | #8, #12 |
| 13 | `js/storage/storage-local.js` | #5, #16 |
| 14 | `js/cobros/caja.js` | #6 |
| 15 | `js/core/models/investment.js` | #11, #17 |
| 16 | `js/core/validacion.js` | #13 |
| 17 | `js/core/checkpoint.js` | #14 |
| 18 | `js/core/migration.js` | #18 |

**Total: 18 archivos modificados, 18 bugs corregidos.**
**Verificación: 61 archivos JS verificados con `node --check` — 0 errores de sintaxis.**
