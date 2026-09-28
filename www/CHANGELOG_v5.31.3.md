# Changelog v5.31.3

## Correcciones de lógica (mora y contabilidad)

### BUG-1 (crítico): El cobro de mora no entraba en ingresos ni en la caja
Al cobrar a un cliente con meses de atraso, el sistema calculaba correctamente
`aPagar = neto × (mora + 1)`, pero solo registraba `h.monto = neto` (mes actual).
El dinero de la mora aparecía en el recibo y en el toast, pero **desaparecía**
de `ingresosMes()`, `ingresosTotales()` y `fondoCaja()`.

**Fix:** En pagos completos/excedentes se registra `monto = neto × (mora + 1)`.
En pagos parciales se registra lo realmente aplicado al servicio (incluyendo
la parte de mora). El fondo de caja se actualiza con el monto real ingresado.

### BUG-2 (alto): Un pago parcial del mes actual borraba toda la mora
`getMora()` consideraba “pagado” cualquier mes que tuviera al menos un
registro de tipo `servicio`, sin mirar el monto. Un abono pequeño en el mes
actual hacía que `ultimoPagado = mes actual` y la mora pasaba a 0, aunque
siguieran debiendo meses anteriores.

**Fix:** Un mes solo cuenta como pagado completo si la suma de montos de
servicio de ese mes es ≥ neto esperado (con tolerancia de 0,01). Un pago
parcial del mes actual ya no borra la mora de meses previos.

### BUG-3: Recibo mostraba la mora dos veces (tras el fix de contabilidad)
Con el fix de BUG-1, `h.monto` pasó a incluir la mora. El recibo seguía
mostrando una línea de “Servicio mensual” con el monto completo **más**
otra línea de “Mora”, duplicando visualmente el importe.

**Fix:** En `recibo.js` se detecta si `h.monto` ya incluye la mora y se
parte en dos líneas (servicio del mes + mora) sin duplicar. Compatible
con registros antiguos (donde `h.monto` era solo el neto del mes).

### BUG-4: La deuda total ignoraba abonos parciales
`deudaTotalCliente` devolvía siempre `neto × (mora+1) + equipo`, aunque el
cliente hubiera abonado parte del mes. Un cliente con neto 500 que pagó 200
seguía mostrando 500 de servicio pendiente.

**Fix:** Nueva `pagadoServicioMes()` y `deudaTotalCliente` resta lo ya pagado:
`max(0, esperado − pagadoEsteMes) + deudaEquipo`. Un cliente al día solo
conserva la deuda de equipo.

### Documentación (`MODELO.md`)
- Mes operativo = reloj del sistema (v5.13.20), no `RN.state.mesActual`.
- Sección de mora y deuda actualizada al modelo de saldo real en CUP.
- Cobros: `h.monto` puede incluir mora; asignación parcial documentada.
- Tabla de referencia y historial de versiones al día.

### Notificaciones / WhatsApp
- Recordatorio de mora: `{precioNeto}` ahora usa la **deuda total pendiente**
  (`deudaTotalCliente`), no solo el neto del mes actual.
- Revisión de notificaciones locales, ciclos y PWA: sin bugs críticos
  adicionales (diseño de grupos mora/hoy/mañana/ciclo coherente; SW con
  `importScripts('js/version.js')` correcto).

### Tests
- Caso 7 en `_testMora`: parcial del mes actual no borra mora.
- `_testDeudaTotalCliente`: al día → solo equipo; parcial → saldo en CUP.

---

Versión: **5.31.3**
