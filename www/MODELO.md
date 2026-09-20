# MODELO.md — Modelo financiero de AdminRed (RedNet)

Documento central que explica el modelo de negocio y los cálculos financieros
de AdminRed. Sirve de referencia para futuros desarrolladores (y para el propio
autor) a la hora de mantener la coherencia del modelo. Los comentarios dispersos
en el código se complementan aquí con una visión de conjunto.

---

## 1. Contexto del negocio

AdminRed es una PWA para **reventa de internet en Cuba**. Un administrador
(revendedor) compra un paquete de megas a un proveedor y lo reparte entre sus
clientes, cobrando mensualmente. Además puede vender equipos (routers, antenas)
a sus clientes a crédito (deuda de equipo) y gestionar el capital invertido
(propio o prestado).

El sistema maneja **doble moneda**: CUP (moneda nacional cubana) y USD, con una
tasa de cambio configurable (manual o automática vía mdiv.pro).

---

## 2. Conceptos clave

### 2.1 Precio base, recurrente y puntual

El **precio neto** a cobrar a un cliente en un mes se calcula así:

```
precioNeto = max(0, precioBase - descuentoRecurrente - descuentosPuntualesDelMes)
```

- **precioBase**: el precio del plan del cliente (buscado por `planId`) o el
  campo `cliente.precio` directo. Definido en `RN.calc.getPrecioBase()`.
- **descuentoRecurrente** (`cliente.descuentoRecurrente`): descuento fijo que se
  aplica todos los meses. Ej: cliente con plan 500 y recurrente 100 → cobra 400.
- **descuentos puntuales**: descuentos de un solo mes (`RN.state.descuentos`).
  Cada uno tiene `mes`, `tipo` (afectación, bonificación, ajuste) y `modo`
  (fijo, porcentaje, días). Se aplican solo al mes indicado.
  Función: `RN.calc.getDescuentosPuntualesMes(clienteId, mes)`.

**Importante:** `getPrecioNeto(cliente, mes)` SIEMPRE debe recibir el `mes`
explícito (corregido en v5.13.1, Bug #4). Sin el mes, los descuentos
puntuales se evaluarían contra el mes del sistema en lugar del mes operativo.

### 2.2 Mes operativo vs mes real

- **`RN.state.mesActual`**: mes operativo, establecido por el botón "Cerrar mes".
  Formato `YYYY-MM`. Se persiste en localStorage.
- **`RN.calc.mesActualStr()`**: devuelve `RN.state.mesActual` si es válido,
  si no cae al reloj del sistema (`new Date()`). Desde v5.13.1 (Bug #1) este
  campo es funcional: al cerrar mes, la app avanza de verdad.
- **`RN.calc.mesRealStr()`**: siempre el mes del reloj (ignora `mesActual`).
- **`RN.calc.sincronizarMesReal()`**: iguala `mesActual` al mes real.

### 2.3 Mes de inicio de cobro

`RN.calc.mesInicioCliente(cliente)` determina desde qué mes se le empieza a
esperar pago a un cliente:

1. `cliente.mesInicio` (campo explícito `YYYY-MM`) si existe y es válido.
2. Mes derivado de `cliente.createdAt` (mes de alta).
3. Mes actual (fallback seguro).

Un cliente cuyo `mesInicio` es futuro tiene estado **"por-iniciar"** (aún no
le toca pagar).

---

## 3. Estados de cliente (`getStatus`)

`RN.calc.getStatus(cliente)` devuelve uno de:

| Estado       | Significado                                                        |
|--------------|--------------------------------------------------------------------|
| `ok`         | Al día, aún no llegó su día de pago este mes.                      |
| `warn`       | Pasó el día de pago pero dentro del período de gracia.             |
| `due`        | Mora real: debe meses anteriores sin pagar, o se pasó de gracia.   |
| `paid`       | Tiene un cobro de servicio completo en el mes actual.              |
| `parcial`    | Tiene un cobro de servicio pero el monto es menor al neto esperado.|
| `por-iniciar`| El mes actual es anterior a su mes de inicio de cobro.             |

**Coherencia (v5.13.1, Bugs #2 y #15):** `getStatus` compara
`totalServicio` (suma de `h.monto` de los cobros del mes) contra
`netoEsperado = getPrecioNeto(cliente, mes)`. Para que funcione,
`h.monto` debe ser **siempre solo servicio** (no incluir equipo). Esto se
garantiza en `modal-cobro.js` separando `montoServicioRegistrado` y
`montoEquipoPagado`.

---

## 4. Mora

`RN.calc.getMora(cliente)` cuenta los **meses de atraso** (meses que el cliente
debió pagar pero no pagó), excluyendo el mes actual (en curso):

- Si ha pagado alguna vez: `mesesEntre(ultimoMesPagado, mesActual) - 1`.
  Ej: pagó hasta junio, en septiembre → debe julio+agosto = 2.
- Si nunca ha pagado: `mesesEntre(mesInicio, mesActual)`.
  Ej: inicio enero, en septiembre → debe 8 meses.

La **deuda total** del cliente combina mora de servicio + deuda de equipo:

```
deudaTotal = precioNeto(mes) × (mora + 1) + deudaEquipo
```

Función centralizada: `RN.calc.deudaTotalCliente(cliente, mes)` (v5.13.1, Bug #4).
Todas las vistas (mora, cobranza, render, calendario) deben usar esta función
en lugar de calcular la deuda de forma dispersa.

---

## 5. Cobros y registro en historial

Al confirmar un cobro (`modal-cobro.js → confirmar()`), se crea una entrada en
`RN.state.history` con:

- `h.monto`: **siempre solo el servicio** pagado (v5.13.1, Bug #2).
- `h.montoEquipo`: **siempre solo el equipo** realmente pagado (v5.13.1, Bug #2/#3).
- `h.tipo`: `'servicio'` (cobro mensual), o tipo de venta de inventario.
- `h.mes`: mes al que corresponde el cobro (`YYYY-MM`).
- `h.tipoPago`: `'completo'`, `'parcial'` o `'excedente'`.

### 5.1 Pago parcial: asignación servicio → equipo

En un pago parcial, el monto pagado se asigna **primero al servicio** y el
resto al equipo:

```
montoServicioRegistrado = min(pagadoCUP, neto)
montoEquipoPagado       = max(0, pagadoCUP - neto)
```

### 5.2 Descuento de deuda de equipo

La deuda de equipo se descuenta por el monto realmente pagado, **incluso en
pagos parciales** (v5.13.1, Bug #3):

```
if (montoEquipoPagado > 0 && cliente.deudaEquipo > 0) {
  cliente.deudaEquipo = max(0, cliente.deudaEquipo - montoEquipoPagado);
}
```

### 5.3 Ingresos mensuales

`RN.calc.ingresosMes(mes)` suma `h.monto + h.montoEquipo` de todos los cobros
del mes. Como `h.monto` es solo servicio y `h.montoEquipo` es solo equipo, no
hay doble conteo (corregido en v5.13.1, Bug #2).

---

## 6. Descuentos

Los descuentos viven en `RN.state.descuentos` y tienen tres tipos:

- **afectación**: reduce el precio (descuento a favor del cliente).
- **bonificación**: añade valor (ej: megas extra).
- **ajuste**: corrección puntual del precio.

Y tres modos:

- **fijo**: cantidad en CUP.
- **porcentaje**: % del precio base.
- **días**: descuento proporcional a los días del mes.

Los descuentos puntuales no aplicados al cerrar mes se **anulan**
(`estado = 'anulado'`), salvo los `soloPago` que pasan al mes siguiente hasta
que se usen. El cierre de mes lo gestiona `RN.monthReset.confirmar()`.

### 6.1 Vigencia de las bonificaciones (v5.14.4)

Desde v5.14.4, las **bonificaciones** tienen un campo `vigencia` que define
cuántos meses aplican:

- **`'permanente'`**: aplica **todos los meses** desde `desde` en adelante.
  Nunca se anula al cerrar mes. El estado permanece `pendiente` (nunca pasa a
  `aplicado`, porque siempre aplica a futuro).
- **`'meses'` con `durMeses: N`**: aplica **N meses de calendario** contando
  `desde` como el primero (jun–ago 2025 con `durMeses: 3`). Al cobrar el
  último mes del rango pasa a `aplicado`; en los meses intermedios sigue
  `pendiente`.
- **`'unPago'`**: reemplaza al viejo `soloPago` (se mantiene por compatibilidad
  y se interpreta igual). Se consume **una sola vez**: al primer cobro pasa a
  `aplicado`.

Cada vez que la bonificación descuenta en un cobro, se registra una
aplicación en `d.aplicaciones.push({ mes, cobroHid, valor })`, donde `valor`
es el **valor congelado** en el momento del cobro (regla R2 del informe): si
después se edita el descuento (o el precio del plan), los cobros ya emitidos
**no cambian**. Las bonificaciones permanentes/N-meses solo pasan a
`aplicado` cuando ya no aplican a ningún mes futuro; hasta entonces cada
cobro les añade una aplicación y su estado sigue siendo `pendiente` (los
cobros las aplican aunque no estén "consumidas", a diferencia de los
puntuales clásicos).

La vigencia se centraliza en `RN.descuentos.vigenteEnMes(d, mes)`, que
sustituye la antigua condición duplicada en 4 sitios (calculations.js,
modal-cobro.js ×2, month-reset.js). Incluye fallbacks para datos del esquema
7 (backups viejos o checkpoints de undo, que **no** pasan por la migración):
`vigencia || (soloPago ? 'unPago' : 'meses')` y `desde || mes`.

Al cerrar mes solo se anulan los **puntuales clásicos** del mes no aplicados
(`RN.descuentos.esPuntualDeMes`: estado `pendiente`, vigencia `meses`,
`durMeses 1` y `desde === mes`); las permanentes y N-meses **no se anulan**.
Anular (`RN.descuentos.eliminar`) una bonificación con aplicaciones revierte
**todos** los cobros afectados usando los valores congelados; eliminar un
cobro (`RN.descuentos.revertirPorCobro`) solo libera el mes de ese cobro y
restaura `pendiente` si no quedan aplicaciones.

En la vista de Gestión de descuentos, la columna "Mes" fue sustituida por
**"Vigencia"** (ej: "Permanente", "jun–ago 2025 (3 meses)"), y el filtro por
mes ahora usa la semántica "aplica a ese mes" (`vigenteEnMes`) en vez del mes
de creación. Los tipos **afectación** y **ajuste** conservan el select
"Aplicación" clásico (mes/solo pago) — la Duración es exclusiva del tipo
**bonificación** (decisión D1 del informe); en modo **días** solo se permiten
puntuales de 1 mes (D5).

---

## 7. Ciclos y cortes de pago

Los clientes se agrupan por **corte** (día de pago, `cliente.diaPago`).
`RN.ciclos` gestiona:

- **Corte vigente**: corte cuyo ciclo está activo (`inicioCiclo ≤ hoy ≤ diaPago`).
- **Corte vencido**: ya pasó su `diaPago`.
- **Período de gracia**: `config.graciaDias` (default 5). Dentro de gracia el
  estado es `warn`; pasado gracia y sin pago, `due`.

El ciclo de un corte va desde `max(1, diaPago - graciaDias)` hasta `diaPago`.
La cobranza del mes (`RN.cobranza.abrir()`) lista los pendientes agrupados por
corte, con el vigente destacado.

---

## 8. Inventario (modelo FIFO)

El inventario usa **FIFO** (First In, First Out):

- Los lotes se ordenan por fecha de compra.
- Al vender, se descuenta del lote más antiguo primero
  (`RN.inventarioModel.repartirFIFO`).
- El **costo vigente** de un producto es el costo unitario del lote más antiguo
  con stock (`RN.inventarioModel.costoVigenteProducto`).
- La **ganancia real** de una venta = precio de venta − costo FIFO del lote
  descargado.
- El precio de venta sugerido = costo × (1 + `config.pctGananciaInv`/100),
  pero queda editable en cada venta.

---

## 9. Inversión y recuperación de capital

### 9.1 Origen del capital

Cada inversión (`RN.state.investments`) tiene un `origenCapital`:

- **Capital propio**: dinero del administrador. No hay nada que devolver.
- **Préstamo externo** (`prestado_externo`): capital prestado por un tercero,
  con `montoADevolver` y `devoluciones` trazables. Se verifica la conclusión
  automática de la deuda con `RN.investment.verificarConclusion()`.

### 9.2 Recuperación basada en ganancia real (margen neto)

Desde v5.11.3, la recuperación de capital se calcula sobre el **margen neto**
(ingreso − costo del mega), no sobre el ingreso bruto:

```
margenNetoCliente = precioNeto(cliente) - costoMega(cliente)
                  = precioNeto - (megas × proveedorPrecioMega)
```

- **`RN.investment.costoMegaClienteMes(cliente, mes)`**: costo de proveer el
  servicio al cliente ese mes. Si no hay `proveedorPrecioMega` configurado,
  devuelve 0 (costo asumido 0 → margen inflado).
- **`RN.investment.costoMegaConfigurado()`** (v5.13.1, Bug #17): devuelve
  `true` si hay precio de proveedor. La UI muestra una advertencia y el
  sufijo "(estimado)" en el % de recuperación cuando es `false`.

### 9.3 Aporte de cada cliente a la recuperación

```
aporteRecuperacion = margenNetoCliente × (1 - pctPersonal/100)
```

- **`pctPersonal`** (`config.pctPersonalInversion`): % de ganancia personal que
  el administrador se retira cada mes y NO recupera capital. Ej: 20% → de 20mil
  de margen, retira 4mil y 16mil recuperan la inversión.
- Los cobros se filtran **desde la fecha de compra** de la inversión
  (`_cobrosClienteDesde`, v5.13.1, Bug #11), tanto por fecha como por mes, para
  no contar como recuperación el margen generado antes de que existiera la
  inversión.

### 9.4 Aporte extra (préstamos externos)

Para préstamos externos, además de lo cobrado a clientes, un % de la ganancia
neta real del mes se suma como aporte extra a la recuperación:

```
aporteExtra = gananciaNetaMes × (config.pctGananciaMes / 100)
```

donde `gananciaNetaMes = ingresosMes − gastosMes`. Así se refleja la utilidad
real del negocio y se recupera el préstamo más rápido. Default 0 (solo cuenta
lo cobrado a clientes).

### 9.5 Recuperación global

- **`RN.investment.totalInvertido()`**: suma de `inv.monto` de todas las
  inversiones.
- **`RN.investment.totalRecuperado()`**: suma del recuperado real de cada
  inversión (automático desde v5.11.3).
- **`RN.investment.porcentajeRecuperacion()`**: `totalRecuperado /
  totalInvertido × 100`.
- **`RN.investment.recuperadoNetoInv(inv)`**: recuperado − devuelto (lo generado
  pero aún no retirado del capital propio).

---

## 10. Predicción de ingresos

`RN.calc.prediccionIngresos()` (v5.13.1, Bug #10) usa **regresión lineal**
sobre los últimos 6 meses (`tendenciaMensual(6)`) en lugar de un promedio
móvil simple. Calcula la pendiente (`b`) e intercepto (`a`) por mínimos
cuadrados y proyecta `a + b × n` (mes siguiente). La predicción nunca es
negativa. Si hay menos de 2 meses de datos, devuelve el último valor.

---

## 11. Snapshots mensuales

Al cerrar mes (`RN.monthReset.confirmar()`), se genera un snapshot inmutable
(`RN.calc.generarSnapshot(mes)`) con:

- `ingresos`, `gastos`, `utilidad` del mes.
- `clientesPagaron` / `clientesTotal` (cobranza).

Los snapshots permiten ver la evolución histórica sin recalcular desde el
historial (que puede haber sido editado después). La auditoría financiera
(`RN.auditoria.verificarCoherencia()`) compara los snapshots con los datos
reales recalculados para detectar discrepancias > 5%.

---

## 12. Almacenamiento y persistencia

- **localStorage**: almacenamiento primario síncrono (rápido, limitado a
  ~5-10MB).
- **File System Access API**: archivo vinculado opcional (`.json`), guardado
  asíncrono.
- **IndexedDB**: backups automáticos (autobackup.js).

El guardado (`RN.storageLocal.guardar()`) hace checkpoint + persistir
(localStorage, síncrono) y agrupa los guardados asíncronos (archivo + IndexedDB)
con un **debounce de 500ms** (v5.13.1, Bug #16) para evitar picos de I/O y
race conditions.

### 12.1 Preservación de tasa USD al importar

Al importar un archivo viejo (`_aplicarData`), la tasa USD actual se
preserva tomando la más reciente entre tres fuentes: estado actual, archivo
importado y localStorage. Se ordenan por `fechaTasaUsd` y se aplica la más
reciente DESPUÉS de todos los `Object.assign` (v5.13.1, Bug #5).

### 12.2 Checkpoints (undo/redo)

El sistema guarda hasta 30 checkpoints (`RN.checkpoint`). Al restaurar
(undo/redo), se preservan `tasaUsd` y `fechaTasaUsd` más recientes para no
revertir cambios de configuración que el usuario no intentaba deshacer
(v5.13.1, Bug #14).

---

## 13. Referencia rápida de funciones clave

| Función | Archivo | Descripción |
|---------|---------|-------------|
| `RN.calc.mesActualStr()` | calculations.js | Mes operativo (respeta `mesActual`) |
| `RN.calc.getPrecioNeto(c, mes)` | calculations.js | Precio neto a cobrar (con descuentos) |
| `RN.calc.getMora(c)` | calculations.js | Meses de atraso |
| `RN.calc.deudaTotalCliente(c, mes)` | calculations.js | Servicio pendiente + deuda equipo |
| `RN.calc.getStatus(c)` | calculations.js | Estado del cliente (paid/parcial/due...) |
| `RN.calc.ingresosMes(mes)` | calculations.js | Ingresos del mes |
| `RN.calc.prediccionIngresos()` | calculations.js | Predicción (regresión lineal) |
| `RN.investment.aporteRecuperacionCliente(inv, cid)` | investment.js | Aporte neto de un cliente |
| `RN.investment.costoMegaConfigurado()` | investment.js | ¿Hay precio de proveedor? |
| `RN.investment.porcentajeRecuperacion()` | investment.js | % global de recuperación |
| `RN.auditoria.verificarCoherencia()` | auditoria.js | Auditoría financiera (Mejora #2) |
| `RN.validacion.validar()` | validacion.js | Integridad estructural + financiera |

---

## 14. Historial de correcciones del modelo

- **v5.13.1**: Corrección de los 18 bugs de la auditoría v5.13.0 (ver
  `CHANGELOG_v5.13.1.md`). Cambios clave en el modelo: `mesActual` funcional,
  separación servicio/equipo en pago parcial, descuento de equipo en parcial,
  `getPrecioNeto` con mes explícito, `deudaTotalCliente` centralizada,
  preservación de tasa USD, validación financiera, regresión lineal en
  predicción, debounce en guardados, validación de IP en migración.
- **v5.13.4**: Advertencia visible de costo de proveedor no configurado
  (Bug #17, parte UI), panel de auditoría financiera (Mejora #2), este
  documento (Mejora #7), validación al importar (Mejora #8), tests ampliados
  (Mejora #1).
