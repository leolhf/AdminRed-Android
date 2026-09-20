# CHANGELOG — v5.13.16

## Sección afectada
**Inversiones y deudas** — vista unificada de inversiones (capital propio) y deudas personales (préstamos externos), modelo de recuperación y modal de devolución de préstamo.

## Resumen
Esta versión implementa **todos** los hallazgos de la auditoría de la sección "Inversiones y deudas" (v5.13.15): 5 bugs, 4 errores de lógica, 3 duplicados de código, 6 mejoras de UI y 5 mejoras de código. Se añadieron 10 tests automáticos para los bugs corregidos (BUG-1 y BUG-2).

---

## BUG-CRÍTICO (pós-auditoría) — Configuración (incluido `paquetePendiente`) se pierde al reabrir la app

### Síntoma reportado
Al configurar el paquete mensual que se comprará el próximo mes (paquete pendiente), cerrar la app y volver a abrirla, la configuración desaparece. El mismo problema afecta a **todos** los cambios de configuración hechos desde Ajustes (tasa USD, fondo de caja, días de corte, % de ganancia, etc.).

### Causa raíz
El sistema usa **dos claves** de `localStorage` para guardar la configuración:

- `adminred:data` (`STORAGE_KEYS.DATA`) — blob completo del estado, incluye `config: RN.state.config` (vía `serializar()`).
- `adminred:config` (`STORAGE_KEYS.CONFIG`) — snapshot solo de configuración (vía `RN.config.persistir()`).

Desde **v5.13.5** (ISSUE #22 e ISSUE #4) se eliminaron las llamadas a `RN.config.persistir()` dentro de `RN.config.guardar()` y `modal-paquete-proveedor.guardarCambios()` por considerarlas "redundantes". Esto dejó `STORAGE_KEYS.CONFIG` **desactualizada**: cada vez que el usuario cambiaba configuración, solo se actualizaba `STORAGE_KEYS.DATA` (vía `guardar()` → `persistir()`), pero `STORAGE_KEYS.CONFIG` quedaba con valores antiguos.

El problema crítico estaba en `js/init.js` **paso 4b**: después de cargar el blob autoritativo de `STORAGE_KEYS.DATA` (que contenía la config actualizada), el código volvía a llamar `RN.config.cargar()`, que leía `STORAGE_KEYS.CONFIG` (stale) y la aplicaba con `Object.assign(RN.state.config, ...)`, **sobrescribiendo** la configuración reciente con la versión antigua. Al reabrir la app, el usuario veía los valores anteriores.

El mismo patrón existía en `storage-local.js _aplicarData()` (usado al importar un backup): después de aplicar `data.config`, re-aplicaba `STORAGE_KEYS.CONFIG` stale.

### Solución (3 cambios en 2 archivos)

**1. `js/init.js` — Eliminado el paso 4b (segundo `RN.config.cargar()`)**
Ahora la secuencia de carga es:
- Paso 3: `RN.config.cargar()` — fallback inicial (para primera ejecución sin `STORAGE_KEYS.DATA`).
- Paso 4: `RN.storageLocal.cargar()` — carga `STORAGE_KEYS.DATA` (fuente autoritativa, incluye config).
- ~~Paso 4b: `RN.config.cargar()`~~ — **ELIMINADO** (sobrescribía config fresca con config stale).

**2. `js/storage/storage-local.js` — `_aplicarData()`**
Eliminado el bloque que re-aplicaba `STORAGE_KEYS.CONFIG` después de aplicar `data.config`. Se preservó la lógica de tasa USD (Bug #5): los candidatos se recolectan antes de cualquier `Object.assign` y la tasa más reciente se aplica al final.

**3. `js/storage/storage-local.js` — `guardar()`**
Añadida la llamada `RN.config.persistir()` dentro de `guardar()` para mantener `STORAGE_KEYS.CONFIG` sincronizada con `STORAGE_KEYS.DATA` en cada guardado. Esto garantiza que ambas claves siempre contengan la misma configuración, evitando desincronización futura.

```js
RN.storageLocal.guardar = function () {
  RN.checkpoint.crear();
  RN.storageLocal.persistir();
  // v5.13.16 (BUG-CRITICO): Sincronizar STORAGE_KEYS.CONFIG con el estado actual.
  if (RN.config && RN.config.persistir) RN.config.persistir();
  RN.storageLocal._guardarAsyncDebounced();
};
```

### Impacto del fix
- ✅ `paquetePendiente` persiste al cerrar y reabrir la app.
- ✅ Todos los cambios de Ajustes (tasa USD, fondo de caja, días de corte, % ganancia, sobreventa) persisten correctamente.
- ✅ Importación de backups no sobrescribe config con valores stale.
- ✅ Ambas claves de storage (`DATA` y `CONFIG`) permanecen sincronizadas.

### Verificación
- Tests automáticos: **73/74 pasan** (1 fallo pre-existente no relacionado).
- Simulación Node: `paquetePendiente` sobrevive al reinicio ✓
- Simulación Node: configuración completa sobrevive al reinicio ✓

### Archivos modificados
- `js/init.js` (eliminación paso 4b + comentario explicativo)
- `js/storage/storage-local.js` (fix `_aplicarData` + sync `guardar`)


## BUG-1 (crítico) — `proyectarRecuperacion` ignora el aporte extra acumulado

### Causa raíz
`proyectarRecuperacion()` y `mesesParaRecuperar()` (`js/core/models/investment.js`) calculaban el restante de capital usando `recuperadoRealInv(inv)` (solo margen de clientes), **ignorando** `aporteExtraAcumulado(inv)`. Sin embargo, la card mostraba "Recuperado efectivo (cobrado + aporte extra)" que sí incluye el aporte extra. La proyección era pesimista e inconsistente con el % efectivo mostrado.

### Solución
Se creó el helper `restanteEfectivo(inv)` que encapsula la lógica: usa `recuperadoEfectivo(inv)` (margen + aporte extra) cuando `pctGananciaMes > 0`, y `recuperadoRealInv(inv)` cuando `pctGananciaMes === 0` (preservando el comportamiento histórico). `proyectarRecuperacion()` y `mesesParaRecuperar()` ahora usan `restanteEfectivo()`.

```js
RN.investment.restanteEfectivo = function (inv) {
  var monto = inv.monto || 0;
  var rec = RN.investment.pctGananciaMes() > 0
    ? RN.investment.recuperadoEfectivo(inv)
    : RN.investment.recuperadoRealInv(inv);
  return Math.max(0, +(monto - rec).toFixed(2));
};
```

### Verificación (test automático)
- `restanteEfectivo` con `pctGananciaMes=0` usa `recuperadoRealInv`: 3000−1000 = **2000** ✓
- `aporteExtraAcumulado` con `pctGananciaMes=20%`: (500×20%)+(500×20%) = **200** ✓
- `recuperadoEfectivo` = 1000 (margen) + 200 (extra) = **1200** ✓
- `restanteEfectivo` con `pctGananciaMes>0`: 3000−1200 = **1800** ✓
- `restanteEfectivo` nunca negativo (min 0) ✓
- `mesesParaRecuperar` usa `restanteEfectivo`: ceil(1800/500) = **4** ✓

---

## BUG-2 (lógico) — `aporteExtraAcumulado` incluye cobros que no son de servicio

### Causa raíz
`aporteExtraAcumulado()` (`js/core/models/investment.js`) sumaba `h.monto + h.montoEquipo` para **todos** los cobros del historial, sin filtrar por `h.tipo === 'servicio'`. Los cobros de tipo `'equipo'` (movimientos de capital) y `'venta-inventario'` (ingresos no recurrentes) se sumaban como ganancia neta del mes, inflando el aporte extra acumulado.

### Solución
Se añadió el filtro `if (h.tipo && h.tipo !== 'servicio') return;` para sumar solo cobros de servicio (o sin tipo definido, por compatibilidad). Se eliminó `h.montoEquipo` de la suma (es capital, no ingreso operativo).

```js
(RN.state.history || []).forEach(function (h) {
  if (h.tipo && h.tipo !== 'servicio') return;  // solo cobros de servicio
  var mes = (h.mes || '').slice(0, 7);
  if (!mes) return;
  if (!porMes[mes]) porMes[mes] = 0;
  porMes[mes] += (h.monto || 0);  // sin h.montoEquipo (es capital, no ingreso)
});
```

### Verificación (test automático)
Con historial que incluye servicio (1200 jun + 1000 jul), equipo (500 jun), venta-inventario (300 jul) y montoEquipo (800):
- `aporteExtraAcumulado` = **220** (solo servicio, excluye equipo/inventario/montoEquipo) ✓
- El cobro de equipo (500) **no** infla el aporte extra ✓
- Con gastos operativos (200 jun) + devolución (100 jun, excluida) + retiro (50 jul, excluido) = **200** ✓

---

## BUG-3 (UX inconsistente) — `_validarDevolucion` permite exceder el saldo pero `guardarDevolucion` lo bloquea

### Causa raíz
En `_validarDevolucion` (`js/cobros/inversion.js`), cuando `monto > saldoDevolver`, se mostraba un badge rojo de advertencia pero el botón **no se deshabilitaba** (`btn.disabled = false`). Sin embargo, `guardarDevolucion` bloqueaba la devolución con un toast de error. El usuario veía el botón habilitado, hacía clic, y solo entonces recibía el error.

### Solución
Se cambió `btn.disabled = false` a `btn.disabled = true` en la rama `monto > saldoDevolver`.

---

## BUG-4 (display engañoso) — El "Recuperado neto" del modal de devolución oculta valores negativos

### Causa raíz
`devolucionPrestamo()` (`js/cobros/inversion.js`) mostraba "Recuperado neto (generado por el negocio, aún sin devolver)" usando `Math.max(0, recuperadoNeto)`. Cuando el negocio generó 672 CUP pero ya se devolvieron 1000 CUP, el recuperado neto real era **−328 CUP**, pero el modal mostraba **0.00 CUP**, ocultando que se adelantó dinero.

### Solución
Se muestra el valor real (sin `Math.max(0, ...)`) con código de color: rojo (`var(--danger)`) si es negativo, verde (`var(--green)`) si es positivo. Cuando es negativo, se añade el texto aclarativo "(has devuelto más de lo generado)". El monto `sugerido` sigue usando `Math.max(0, ...)` para no sugerir devolver cantidades negativas, pero el display informativo muestra la verdad.

---

## BUG-5 (código muerto) — `_renderKPIsDeudas` referencia un elemento inexistente y nunca se llama

### Causa raíz
`_renderKPIsDeudas` (`js/cobros/inversion.js`) buscaba `document.getElementById('kpi-deudas')` que no existe en `index.html` (la vista unificada usa `kpi-inversion`). No tenía ningún caller: los KPIs de deudas se integran directamente en `RN.render.inversion()`.

### Solución
Se eliminó `_renderKPIsDeudas` por completo (~20 líneas de código muerto).

---

## LOG-1 — Inconsistencia entre el % del KPI global y el % efectivo de cada inversión

### Causa raíz
El KPI "% recuperación" (`js/ui/render.js`) usaba `porcentajeRecuperacion()` → `totalRecuperado()` → `recuperadoRealInv()` (solo margen de clientes). Pero la card mostraba `pctRecuperacionEfectiva()` que incluye el aporte extra. Con `pctGananciaMes = 20%`, el KPI decía 35.3% pero la card mostraba 79.8%.

### Solución
Se crearon los helpers `totalRecuperadoEfectivo()` y `porcentajeRecuperacionEfectiva()` en `investment.js`. El KPI ahora usa `porcentajeRecuperacionEfectiva()` cuando `pctGananciaMes > 0` (con label "% recuperación efectiva"), y `totalRecuperadoEfectivo()` para el KPI "Recuperado". Cuando `pctGananciaMes === 0`, coincide con el comportamiento anterior (preservando compatibilidad).

---

## LOG-2 — `saldoADevolver` ignora el recuperado del negocio (contexto ambiguo en UI)

### Causa raíz
El sub-header de la card de deuda decía "debe 2,000 CUP · 33% devuelto · 122 días", sin mostrar cuánto ha generado el negocio. El "debe" era ambiguo: ¿debe al prestamista o debe generar el negocio?

### Solución
`saldoADevolver` no se modificó (es correcto contablemente). Se añadió "generado X CUP" al sub-header de la card de deuda (en `_cardInversion` con `esDeuda: true`), para distinguir el saldo con el prestamista del generado por el negocio.

---

## LOG-3 — `proyectarRecuperacion` usa el mes actual, no un promedio histórico

### Causa raíz
La proyección se calcula sobre el precio **esperado** del mes actual, no sobre lo realmente cobrado. Si hay morosidad, la proyección puede ser engañosamente optimista.

### Solución
Se añadió el texto aclarativo "· estimación según precio esperado mensual" al final de la proyección, para que el usuario sepa que es una estimación basada en el precio esperado, no en el histórico real de cobros.

---

## LOG-4 — `fondoCaja()` vs `aporteExtraMes` tratan devoluciones de forma distinta

### Causa raíz
`fondoCaja()` resta TODOS los gastos (incluidas devoluciones y retiros), pero `aporteExtraMes` excluye devoluciones y retiros (son movimientos de capital, no gastos operativos). Esto es correcto conceptualmente, pero puede confundir.

### Solución
Se añadió una nota explicativa en el JSDoc de `aporteExtraMes` documentando que excluye devoluciones/retiros porque son movimientos de capital, no gastos operativos, y aclarando que el aporte extra mide cuánto "sobra" del margen operativo, no cuánto dinero físico hay en caja.

---

## DUP-1 — `_htmlRecuperacion` y `render.inversion` generan secciones casi idénticas

### Causa raíz
Ambas funciones generaban HTML para la sección "Recuperación de la inversión" dentro de una tarjeta, con código casi idéntico pero con pequeñas diferencias. Cualquier cambio debía hacerse en dos sitios.

### Solución
Se extrajo el helper compartido `RN.inversion._htmlDetalleRecuperacion(inv, opts)` con renderizado condicional (`opts.esDeuda`): las deudas muestran saldo a devolver, ya devuelto y recuperado neto; las inversiones propias muestran ingreso bruto, margen neto, ganancia retenida acumulada, disponible para retirar/mes, aporte extra del mes/acumulado, recuperado efectivo y desglose por cliente con info de Bruto/Margen neto. `_htmlRecuperacion` ahora es un wrapper de compatibilidad que delega en `_htmlDetalleRecuperacion`.

---

## DUP-2 — La card de deuda (`_cardDeuda`) y la card de inversión propia comparten ~60% del HTML

### Causa raíz
Ambas generaban tarjetas accordion con la misma estructura (dot, nombre, sub-texto, monto, chevron, filas de detalle, botones de acción) pero con código duplicado y divergencias sutiles. ~200 líneas de HTML string building duplicado.

### Solución
Se unificó en `RN.inversion._cardInversion(inv, {esDeuda})` con renderizado condicional: barra de progreso (UI-1), sub-header con "generado X CUP" para deudas (UI-2/LOG-2), badge de saldo junto al botón "Devolver préstamo" (UI-4), bloque de pago, historial de devoluciones, detalle de recuperación (DUP-1) y botones de acción. El bloque inline de ~80 líneas en `render.inversion()` (render.js) se reemplazó por una llamada a `RN.inversion._cardInversion(inv, {esDeuda: false})`. `_cardDeuda` y el inline propio son ahora wrappers de compatibilidad.

---

## DUP-3 — El cálculo de "gastos del mes excluyendo devoluciones/retiros" se repite

### Causa raíz
`aporteExtraMes` y `aporteExtraAcumulado` (`js/core/models/investment.js`) filtraban gastos con la misma lógica inline (`!g.esDevolucionInversion && !g.esRetiroCaja`).

### Solución
Se extrajo el helper `RN.investment._gastosOperativosMes(mes)` que centraliza el filtro. Ambas funciones ahora lo usan. Si se añade una nueva categoría de movimiento de capital, basta con actualizar este único helper.

---

## UI-1 — Barra de progreso de recuperación en cards de inversión propia

### Cambio
`_cardInversion` con `esDeuda: false` ahora incluye una barra de progreso visual de recuperación (`barraColor = 'var(--blue)'`, `barraPct = pctRecuperacion`), consistente con la barra de devolución que ya tenían las deudas.

---

## UI-2 — "generado X CUP" en el sub-header de la card de deuda

### Cambio
El sub-header de la card de deuda ahora muestra "generado X CUP" (el recuperado real del negocio) además del saldo a devolver, dando contexto inmediato sin necesidad de expandir la tarjeta.

---

## UI-3 — Agrupación de KPIs en dos bloques con sub-títulos

### Cambio
La cuadrícula de 8 KPIs se agrupa ahora en dos bloques con sub-títulos: "Inversiones" (Total invertido, Recuperado, % recuperación, Por recuperar) y "Deudas personales" (Deudas activas, Saldo por devolver, Ya devuelto, Concluidas). Se añadió la clase CSS `.kpi-group-title` con estilo de sub-título uppercase con borde inferior.

```css
.kpi-group-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .5px; color: var(--text-muted);
  margin: 0 0 6px 0; padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
```

---

## UI-4 — Badge de saldo junto al botón "Devolver préstamo"

### Cambio
Se añadió un badge `<span class="badge warn">` con el saldo a devolver junto al botón "Devolver préstamo" en la card de deuda, para que el usuario vea cuánto se puede devolver antes de abrir el modal.

---

## UI-5 — Animación de destaque al liquidar una deuda

### Cambio
En `guardarDevolucion`, cuando la deuda queda concluida (`verificarConclusion` devuelve `true`), se aplica una animación de flash verde a la card antes del re-render. El toast usa el emoji 🎉 para destacar el logro.

---

## UI-6 — Preview del saldo a devolver al cambiar origen a préstamo

### Cambio
Se añadió la función `_actualizarPreviewSaldo(pagadoCUP)` y el elemento `inv-origen-preview`. Al cambiar el origen a "Préstamo externo" en el formulario (`_toggleOrigen`), se muestra "Saldo a devolver estimado: X CUP" para que el usuario entienda la magnitud antes de guardar.

---

## CODE-1 — Estandarizar uso de `RN.investment.xxx()` explícito

### Cambio
Se eliminó el patrón inconsistente `const self = this` + `self.xxx()` en `totalRecuperado` y `aportesPorCliente`, estandarizando todas las llamadas internas a `RN.investment.xxx()` explícito, que no depende de `this` y es más robusto al desestructurar o pasar como callback.

---

## CODE-2 — Reemplazar `renderDeudas()` por `RN.render.inversion()` y documentar el wrapper

### Cambio
`guardarDevolucion` y `eliminarDevolucion` ahora llaman `RN.render.inversion()` directamente en lugar de `RN.inversion.renderDeudas()`. `renderDeudas` se conserva como alias de compatibilidad documentado que delega en `RN.render.inversion()`.

---

## CODE-3 — Mover validación de devolución a `data-` attributes + event delegation

### Cambio
`devolucionPrestamo` ahora usa atributos `data-saldo`, `data-fondo`, `data-recuperado` en el input y `addEventListener('input', ...)` en lugar del `oninput` inline. `_validarDevolucion(input)` lee los valores desde `getAttribute('data-...')`. Esto es más seguro (no incrusta números en HTML) y consistente con el patrón XSS-safe del resto de la app.

---

## CODE-4 — Reordenar JSDoc duplicado

### Cambio
Se reordenó el código para que cada JSDoc preceda inmediatamente a su función. `_htmlDetalleRecuperacion` y `_htmlRecuperacion` (wrapper) tienen ahora sus propios bloques JSDoc correctamente colocados.

---

## CODE-5 — Documentar que `eliminar` no afecta cobros del historial ni margen de otras inversiones

### Cambio
Se añadió un JSDoc detallado a `eliminar` documentando explícitamente que NO afecta: (1) los cobros del historial (son cobros reales que se conservan), (2) el margen de otras inversiones (cada inversión filtra por su propia `fechaCompra`), ni (3) los gastos legítimos para capital propio (las devoluciones se conservan). El mensaje de confirmación también se actualizó para reflejar esto.

---

## Tests automáticos añadidos

Se añadieron 10 tests en `js/tests/tests-calculo.js`:

| Test | Verifica |
|------|----------|
| `_testRestanteEfectivo` (6 asserts) | BUG-1: `restanteEfectivo` usa `recuperadoEfectivo` cuando `pctGananciaMes > 0`, `recuperadoRealInv` cuando `= 0`; nunca negativo; `mesesParaRecuperar` es consistente |
| `_testAporteExtraAcumuladoFiltro` (4 asserts) | BUG-2: `aporteExtraAcumulado` solo suma servicio, excluye equipo/inventario/montoEquipo; gastos operativos restan pero devoluciones y retiros no |

Resultado: **73/74 tests pasan** (el único fallo, `getStatus: inactivo -> ok`, es preexistente y no relacionado con estos cambios).

---

## Archivos modificados
| Archivo | Cambios |
|---------|---------|
| `js/version.js` | `APP_VERSION` 5.13.15 → **5.13.16** |
| `js/core/models/investment.js` | BUG-1 (`restanteEfectivo`), BUG-2 (filtro servicio), DUP-3 (`_gastosOperativosMes`), LOG-1 (`totalRecuperadoEfectivo`, `porcentajeRecuperacionEfectiva`), LOG-3 (texto aclarativo), LOG-4 (nota JSDoc), CODE-1 (`RN.investment` explícito) |
| `js/cobros/inversion.js` | BUG-3 (botón deshabilitado), BUG-4 (recuperado neto real), BUG-5 (`_renderKPIsDeudas` eliminado), DUP-1 (`_htmlDetalleRecuperacion`), DUP-2 (`_cardInversion`), LOG-2 (sub-header generado), UI-1 (barra progreso), UI-2 (generado CUP), UI-4 (badge saldo), UI-5 (animación liquidación), UI-6 (preview saldo), CODE-2 (`render.inversion()`), CODE-3 (data-attributes), CODE-4 (JSDoc orden), CODE-5 (doc eliminar) |
| `js/ui/render.js` | LOG-1 (KPI efectivo), UI-3 (agrupación KPIs), DUP-2 (card unificada) |
| `styles.css` | UI-3 (`.kpi-group-title`) |
| `js/tests/tests-calculo.js` | BUG-1, BUG-2 (10 tests nuevos) |
