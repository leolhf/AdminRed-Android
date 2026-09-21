# Changelog v5.13.4 — Correcciones de auditoría y mejoras de robustez

**Fecha:** 2025
**Versión:** 5.13.4
**Tipo:** Correcciones de auditoría + mejoras de calidad

---

## Resumen

Esta versión aplica las **correcciones pendientes** identificadas en la auditoría
del código v5.13.0, ejecutada sobre el código v5.13.3. Los 18 bugs reportados ya
habían sido corregidos en v5.13.1 (verificado en código y CHANGELOG_v5.13.1.md),
pero quedaban **aspectos parciales** y **propuestas de mejora** sin completar.

v5.13.4 completa esos gaps:

1. **Bug #17 (parcial)** — La función `costoMegaConfigurado()` existía pero la UI
   nunca la usaba. Ahora `render.js` muestra advertencia visible "(estimado)" y un
   aviso cuando el costo de proveedor no está configurado.
2. **Mejora #1** — Tests unitarios ampliados para cubrir los bugs críticos
   corregidos (7 nuevos grupos de tests en `tests-calculo.js`).
3. **Mejora #2** — Panel de auditoría financiera (`auditoria.js`) accesible desde
   Ajustes → Diagnóstico.
4. **Mejora #5** — Validación visual de campos financieros en modales de cobro,
   gasto e inversión (montos negativos, deuda equipo ≤ original, tasas realistas).
5. **Mejora #7** — Documentación `MODELO.md` del modelo financiero completo.
6. **Mejora #8** — Export/import con validación de estructura, modo seguro
   (confirmación antes de sobreescribir) y validación de integridad post-import.

---

## Cambios realizados

### 1. Bug #17 — Advertencia visible de costo de proveedor (`js/ui/render.js`)

- `barraRecuperacion()`: añade `var sinCosto = !RN.investment.costoMegaConfigurado()`,
  muestra sufijo "(estimado)" en el % de recuperación, y un `<div>` de advertencia
  cuando `sinCosto` es true.
- `render.inversion()`: el KPI "% recuperación" muestra sufijo "(estimado)" cuando
  no hay costo de proveedor configurado.
- Dashboard: el span de % recuperación incluye "(estimado, sin costo de proveedor)".

### 2. Mejora #1 — Tests ampliados (`js/tests/tests-calculo.js`)

7 nuevos grupos de tests (41 asserts nuevos) cubriendo los bugs críticos:

- **Bug #1**: `mesActualStr()` respeta `RN.state.mesActual` (4 casos: válido, null,
  inválido, `mesRealStr` siempre usa reloj).
- **Bug #4**: `deudaTotalCliente()` = servicio(mora+1)×neto + deudaEquipo (4 casos:
  con mora+equipo, sin equipo, al día, nunca negativa).
- **Bug #8**: `aUSD()` devuelve `number` no `string` (8 casos: normal, 0, sin tasa,
  undefined, null, string numérico, round-trip aCUP).
- **Bug #11**: `aporteRecuperacionCliente()` filtra por fecha de compra (6 casos:
  excluye cobros anteriores, otros clientes, tipo equipo; mismo día incluido;
  día anterior excluido; con costoMega; con % personal).
- **Bug #17**: `costoMegaConfigurado()` (6 casos: 0, sin clave, >0, negativo,
  string; impacto en `costoMegaClienteMes`).

### 3. Mejora #2 — Panel de auditoría financiera (`js/core/auditoria.js`)

Nuevo módulo `RN.auditoria` con:

- `verificarCoherencia()`: ejecuta 8 verificaciones:
  1. Montos negativos en historial.
  2. Coherencia de deudas (deudaEquipo ≤ deudaEquipoOriginal).
  3. `ingresosMes()` consistente con suma de `h.monto + h.montoEquipo`.
  4. Cobros de servicio duplicados (mismo cliente + mes).
  5. Snapshots vs datos reales (count mismatch).
  6. Clientes pagados cubriendo neto del mes.
  7. Gastos sin mes asignado.
  8. Tasa USD en rango razonable (1–100000).
- `mostrar()`: abre un modal con el resultado detallado.

- `RN.validacion.verificar()`: wrapper de UI que ejecuta `validar()` y muestra el
  resultado en un modal (Ajustes → Diagnóstico → Validar integridad).

- `index.html`: nueva sección "Diagnóstico" en Ajustes con 3 botones:
  Auditoría financiera, Validar integridad, Ejecutar tests.

### 4. Mejora #5 — Validación visual en formularios

- **`modal-cobro.js`**: `confirmar()` valida montos no negativos (USD, CUP, equipo),
  monto de equipo ≤ deudaEquipo pendiente, neto no negativo, y advierte si tasa USD
  parece irreal. Fix: variable `montoRegistrado` indefinida → `aPagar`.
- **`gastos.js`**: `guardar()` valida montos no negativos y advierte tasa irreal.
- **`inversion.js`**: `guardar()` valida montos de pago no negativos, advierte tasa
  irreal, y advierte monto excesivo (>100M CUP). `guardarDevolucion()` valida
  monto no negativo y que la devolución no exceda el saldo pendiente.

### 5. Mejora #7 — Documentación `MODELO.md`

Documento de ~14 secciones explicando el modelo financiero completo de AdminRed:
contexto de negocio (revenda de internet en Cuba), precio base/recurrente/puntual,
mes operativo vs real, estados de cliente, mora, cobros/historial, descuentos,
ciclos/cortes, inventario FIFO, recuperación de inversión, predicción, snapshots,
almacenamiento, tabla de referencia de funciones, e historial de correcciones.

### 6. Mejora #8 — Export/import con validación (`js/storage/export.js`)

- `_validarEstructura(data)`: valida que el JSON tenga las claves mínimas
  (`clients`, `history`, `config`), que las claves de arrays sean arrays, que
  `config` sea objeto, y que cada cliente tenga `id`.
- `_resumenBackup(data)`: genera un resumen legible (clientes, cobros, inversiones,
  gastos, inventario, descuentos, snapshots, tasa, mes, esquema).
- `importarBackup()`: refactorizado a 4 pasos:
  1. Validar estructura (rechaza si inválida).
  2. Modo seguro: muestra resumen + `confirm()` antes de sobreescribir.
  3. Crear snapshot automático de datos actuales, migrar, aplicar, persistir.
  4. Ejecutar `validacion.validar()` post-import; si hay errores, mostrar modal.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `js/version.js` | Bump 5.13.3 → 5.13.4 |
| `js/ui/render.js` | Bug #17 UI: advertencia "(estimado)" + aviso sin costo |
| `js/core/auditoria.js` | **NUEVO** — Panel de auditoría financiera |
| `js/core/validacion.js` | Añadido wrapper `verificar()` con modal UI |
| `js/tests/tests-calculo.js` | 7 grupos de tests nuevos (41 asserts) |
| `js/storage/export.js` | Validación de estructura + modo seguro + validación post-import |
| `js/cobros/modal-cobro.js` | Validación de montos + fix `montoRegistrado` |
| `js/gastos.js` | Validación de montos negativos + tasa irreal |
| `js/cobros/inversion.js` | Validación de montos + devolución ≤ saldo |
| `index.html` | Script `auditoria.js` + sección Diagnóstico con 3 botones |
| `MODELO.md` | **NUEVO** — Documentación del modelo financiero |
| `CHANGELOG_v5.13.4.md` | **NUEVO** — Este archivo |

---

## Verificación

- `node --check` pasado en todos los archivos JS modificados.
- Los archivos CESU-8 (render.js) verifican correctamente con Node.js.
- Tests unitarios cubren los cálculos de los bugs #1, #4, #8, #11, #17.
- La auditoría financiera y la validación de integridad son accesibles desde la UI.

---

## Estado de la auditoría v5.13.0

| Bug | Severidad | Estado |
|---|---|---|
| #1–#16, #18 | Crítico/Alto/Medio | ✅ Corregidos en v5.13.1 |
| #17 | Medio | ✅ Completado en v5.13.4 (UI + tests) |

| Mejora | Estado |
|---|---|
| #1 Tests ampliados | ✅ v5.13.4 |
| #2 Panel auditoría financiera | ✅ v5.13.4 |
| #3 IndexedDB primario | Diferido (riesgo alto, fuera de alcance) |
| #4 Debounce en guardados | ✅ v5.13.1 (Bug #16) |
| #5 Validación visual formularios | ✅ v5.13.4 |
| #6 deudaTotalCliente() | ✅ v5.13.1 (Bug #4) |
| #7 MODELO.md | ✅ v5.13.4 |
| #8 Export/import con validación | ✅ v5.13.4 |
