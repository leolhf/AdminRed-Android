# Changelog — AdminRed (RedNet)

## v5.20.0 — Fix crítico: importar contacto del teléfono dejaba nombre y dirección en blanco

### Resumen
Al agregar un cliente y usar el botón **📍 Contactos** para importar un contacto del teléfono, **solo se rellenaba el número** y los campos **Nombre** y **Dirección** quedaban en blanco. Ocurría siempre que se abría un diálogo intermedio (contacto con **varios números** → prompt, o **nombre ya escrito** → confirm). Causa: el sistema de pila de modales (`ui-components.js`) restauraba el formulario desde `innerHTML`, que **no conserva los valores escritos por JS** (`input.value = ...`), borrando el nombre y la dirección recién llenados. Solución: `ui-components.js` ahora **captura y re-aplica los valores vivos** de los campos al apilar/restaurar modales (fix global), y `modal-cliente.js` re-aplica los datos del contacto en los callbacks. Verificado con 15/15 tests end-to-end (jsdom). Sin cambios de esquema (sigue 10).

Detalle completo en `CHANGELOG_v5.20.0.md`.

## v5.15.0 — Gestión centralizada de bonificaciones/descuentos

### Resumen
Las **bonificaciones/descuentos** dejan de crearse dentro del modal de cobro y pasan a un **centro de gestión** en **Finanzas → Descuentos** (botón "🎁 + Nueva bonificación" con selector de cliente, "Por lote" mudado a esa vista, mini-resumen de KPIs: activas · pendientes · impacto CUP del mes) más un **botón 🎁 de acceso rápido por cliente** en "Cobros del mes" (destacado en verde con contador y tooltip de impacto cuando hay bonificaciones vigentes). El modal de cobro queda en **solo lectura** para descuentos y, al anular desde él, la tabla se refresca **in-place** sin reconstruir el modal — se corrige así la pérdida de datos tecleados (USD/CUP/notas) al anular desde el propio cobro. Nuevo **registro de eventos** (`descuento_crear`/`descuento_anular`) en la ventana de Auditoría. Sin cambios de modelo ni de esquema (los backups v5.14.x cargan directo).

Detalle completo en `CHANGELOG_v5.15.md`.

## v5.14.4 — Bonificaciones permanentes y de N meses

### Resumen
Las **bonificaciones** dejan de limitarse a "un mes o un solo pago": ahora soportan **Duración** *permanente* (aplica todos los meses hasta anularla), *N meses* (rango de calendario, ej. jun–ago 2025) y *1 solo pago* (el viejo `soloPago`). Cada mes cobrado se registra en `aplicaciones[]` con el **valor congelado** (los cobros ya emitidos no cambian si luego se edita el descuento). La condición de vigencia — antes duplicada en 4 sitios — se centraliza en `RN.descuentos.vigenteEnMes()` con fallbacks que mantienen operativos los backups del esquema 7 (migración 7→8). El cierre de mes ya no anula permanentes/N-meses; anular una bonificación aplicada revierte **todos** los cobros afectados. 7 tests nuevos (115/115 pasan).

Detalle completo en `CHANGELOG_v5.14.4.md`.

## v5.14.3 — Historial de cobros (Reportes) agrupado por mes y colapsable

### Resumen
En la sección **Reportes → "Historial de cobros"**, la tabla plana que mostraba solo 50 cobros se sustituye por una vista **agrupada por mes en cintillas colapsables**, donde cada mes aparece contraído por defecto (solo el más reciente queda abierto) y cada cobro es una tarjeta colapsable. El modal "Ver todos" se actualiza al mismo formato. (Entrada añadida a este archivo en v5.14.4; el detalle vivía hasta ahora solo en `CHANGELOG_v5.14.3.md`.)

## v5.14.2 — Auditoría de Reportes: 22 de 23 hallazgos corregidos

### Resumen
Se implementaron todas las correcciones de `AUDITORIA_Reportes_v5_13_20.md`: los 7 BUG (estado del calendario en meses pasados/futuros, código muerto, semáforo confuso, comparaciones engañosas), los 4 LOG, los 4 DUP (extraídos a helpers compartidos: `RN.chart`, `RN.export.toCSV`, `RN.calc.clientePorId`, `RN.calc.listaMeses`/`mesesConDatos`), los 4 CODE (incluye BOM UTF-8 en CSV) y 3 de 4 UI (la leyenda de colores del calendario, UI-4, ya existía desde v5.13.11).

El cambio de mayor impacto: **`RN.calc.getStatus()` ahora acepta un mes opcional**, lo que repara el color/estado de las celdas del calendario al navegar a meses pasados o futuros, además de `cobranzaMes()` y todos los reportes que dependen de ella.

Detalle completo en `CHANGELOG_v5.14.2.md`.

## v5.14.1 — Cuadre de caja

### Resumen
Nueva funcionalidad de **Cuadre de caja**: permite introducir el saldo real contado físicamente; la diferencia contra el saldo calculado por la app se registra automáticamente con la categoría dedicada **"Descuadre de caja"** (nunca mezclada con "Gasto personal" ni "Retiro de caja"), siguiendo la recomendación evaluada en `recomendacion_cuadre_caja.txt`.

- **Faltante** (real < calculado): se registra como gasto (categoría "Descuadre de caja").
- **Sobrante** (real > calculado): se registra como ajuste de ingreso (mismo módulo, monto negativo internamente) que suma al fondo.
- Nuevos botones "🧮 Cuadre de caja" e "Historial de cuadres" en la vista de Gastos.
- Los cuadres se muestran en el listado de gastos con su propio ícono y badge (Faltante/Sobrante), en vez de aparecer como un "Gasto" genérico.
- Permite eliminar un cuadre si el usuario se equivocó al contar.

Detalle completo en `CHANGELOG_v5.14.1.md`.

## v5.13.20 — El mes operativo SIEMPRE es el mes real del reloj

### Resumen
Se rediseó el sistema de mes operativo para que **siempre coincida con el mes real del reloj del sistema**. El mes ya no se puede adelantar al cerrar — avanza solo con el calendario. Se añadió validación de **doble cierre**: si ya existe un snapshot del mes actual, se bloquea el cierre.

- **`mesActualStr()` siempre usa el reloj:** Ya no prioriza `RN.state.mesActual`. Es idéntica a `mesRealStr()`.
- **`monthReset.confirmar()` no adelanta el mes:** Solo genera snapshot, anula descuentos y aplica `paquetePendiente`. El mes cambia automáticamente cuando avanza el calendario.
- **Validación de doble cierre:** Si ya hay un snapshot del mes actual, el botón "Cerrar mes" muestra un aviso y bloquea la acción.
- **Sincronización al arrancar:** `init.js` llama `sincronizarMesReal()` al inicio para que `mesActual` refleje el mes del calendario.
- **Eliminado `avisoSincronizarMes` (v5.13.19):** Ya no se necesita; el mes siempre es el real.

Detalle completo en `CHANGELOG_v5.13.20.md`.

## v5.13.19 — Sincronización automática de mes operativo

### Resumen
El mes operativo no cambiaba automáticamente al avanzar el mes calendario real. Era 100% manual (botón "Cerrar mes"). Ahora la app **detecta al arrancar** si el mes real está por delante del mes operativo y ofrece sincronizar, generando **snapshots automáticos** para cada mes intermedio.

- **Mejora UX:** Aviso modal al arrancar con resumen de KPIs por mes a cerrar. Opciones: sincronizar (con snapshot automático) o mantener el mes operativo actual.
- **Multi-mes:** Si hay varios meses de diferencia (ej: operativo=Julio, real=Septiembre), se cierran todos los meses intermedios en una sola acción, generando un snapshot por cada mes.
- **Paquete pendiente:** Se aplica correctamente al sincronizar, igual que el cierre manual.

Detalle completo en `CHANGELOG_v5.13.19.md`.

## v5.13.18 — Bug crítico: importar contactos del teléfono cerraba el modal de cliente

### Resumen
Al usar el botón "Contactos" para importar un contacto guardado del teléfono dentro del modal de cliente, el modal **se cerraba** al agregar el nombre o número de teléfono, perdiéndose el formulario entero.

- **BUG-CRÍTICO:** El sistema de modales no soportaba modales anidados. `confirm()`/`prompt()` sobrescribían el modal-box destruyendo el formulario del cliente, y al cerrar el diálogo se ocultaba el overlay entero.
- **Solución:** Se implementó un **sistema de pila de modales** en `ui-components.js` que preserva y restaura el modal padre. Se reestructuró `importarDeContactos()` para llenar campos directos antes de abrir diálogos, y los callbacks re-query los elementos por ID.
- **Beneficio global:** Cualquier `confirm()`/`prompt()` llamado desde dentro de un modal (descuentos, exportación, inventario, etc.) ahora preserva el modal padre.

Detalle completo en `CHANGELOG_v5.13.18.md`.

## v5.13.16 — Auditoría Inversiones (24 hallazgos) + Bug crítico persistencia de configuración

### Resumen
- **Auditoría Inversiones:** 24 hallazgos implementados (5 bugs, 4 lógica, 3 duplicados, 6 UI, 5 código) de la auditoría v5.13.15.
- **BUG-CRÍTICO (post-auditoría):** La configuración (incluido `paquetePendiente`) se perdía al reabrir la app. Causa: `STORAGE_KEYS.CONFIG` quedó desactualizada tras ISSUE #22/#4, y `init.js` paso 4b re-aplicaba la config stale sobre la config fresca de `STORAGE_KEYS.DATA`. Fix: eliminado paso 4b, sincronización de ambas claves en `guardar()`.

Detalle completo en `CHANGELOG_v5.13.16.md`.

## v5.13.15 — Arreglos en Realizados (cintilla expandible + separación KPIs)

### Resumen
Dos arreglos en la sección **Cobros realizados**:
- **BUG-1 (crítico):** Las agrupaciones por mes (cintillas) no se expandían ni
  contraían al tocarlas. La causa era un patrón de escaping de `onclick`
  (`String.fromCharCode(0x5c)`) que generaba JavaScript inválido
  (`SyntaxError: Invalid or unexpected token`), por lo que el handler nunca
  disparaba. El mismo bug afectaba a 4 handlers de la vista (toggleCintillaMes,
  toggleCard de cobro, ver recibo y abrir historial del cliente). Corregido con
  el patrón inline `'\\''` consistente con el resto de la app.
- **UI-1:** La barra de búsqueda estaba pegada a la cuadrícula de KPIs de arriba.
  Se añadió `margin-bottom: 14px` a `.kpi-grid` para separar visualmente el
  widget del contenido inferior en todas las vistas.

Detalle completo en `CHANGELOG_v5.13.15.md`.

## v5.13.6 — Correcciones del Panel (Dashboard)

### Resumen
Revisión exhaustiva de la sección **Panel del negocio** que corrigió **5 bugs**,
**4 casos de código duplicado/performance** y **3 mejoras de UI**.

### Bugs corregidos
- **BUG-1:** Comentario `/**` duplicado en `calculations.js` eliminado.
- **BUG-2:** `;;` doble tras `esc()` en `render.js` eliminado.
- **BUG-3:** Emoji 📈 corrupto (CESU-8) en `barraRecuperacion()` corregido a UTF-8.
- **BUG-5:** `tasaCob` ahora usa nueva función `ingresosServicioMes()` (solo servicio del mes, sin equipo ni mora) para no superar 100% de forma engañosa.
- **BUG-6:** `getStatus()` ahora devuelve `'inactivo'` para clientes con `activo: false` (antes devolvía `'ok'`). Badge "Inactivo" añadido.

### Código duplicado / performance
- **DUP-1:** `clientesActivos()` cacheado en `dashboard()` (antes 3 llamadas).
- **DUP-2:** `montoPaqueteProveedor()` reutilizado vía `costoPaquete` (antes 2 llamadas).
- **DUP-3:** `totalInvertido/totalRecuperado/porcentajeRecuperacion` cacheados (antes 4×/3×/2×). `barraRecuperacion()` acepta parámetros opcionales.
- **CODE-6:** Nueva función `RN.render.descPaquete()` extrae el string "M × CUP/M".

### Mejoras UI
- **UI-3:** Estado vacío con botón "Registrar inversión" en card de recuperación (antes se ocultaba).
- **UI-5:** Badge del mes operativo visible en el header del panel ("Mes: agosto 2026" o "⚠ Mes operativo" si difiere del real).
- **UI-6:** Equivalencia USD con badge visual distintivo (`.usd-badge` con fondo y borde).

### Verificación
- `node --check` en los 61 archivos JS: 0 errores.
- Screenshot del dashboard confirma todos los cambios visuales.

---

## v5.13.5 — Corrección exhaustiva de 26 issues de auditoría

### Resumen
Se implementaron las **26 correcciones** identificadas en la auditoría exhaustiva
del código v5.13.4: 1 crítica (pérdida de datos), 2 altas (lógica financiera),
13 medias y 10 bajas.

### Destacados
- **ISSUE #14 (crítico):** Se evita la pérdida de datos al guardar sin PIN — la
  verificación ahora ocurre antes de `createWritable()`.
- **ISSUE #6/#7:** El pago parcial respeta el monto de equipo ingresado por el
  usuario.
- **ISSUE #11:** Las ventas de inventario usan `monto` (no `montoEquipo`) con
  tipo `venta-inventario`; recibo ajustado.
- **Patrón timezone (4 archivos):** `new Date(fecha).toISOString()` →
  `fecha + 'T00:00:00'` en caja, inversión, gastos y paquete proveedor.
- **Patrón doble guardado (3 archivos):** Eliminados `persistir()` redundantes.
- **Patrón confirm/prompt nativos (3 archivos):** Migrados a
  `RN.uiComponents.confirm()`/`prompt()` con soporte de `onCancel`.

Ver detalles completos en `CHANGELOG_v5.13.5.md`.

## v5.13.3 — Fusión visual Inversión + Deudas

### Interfaz unificada (fusión visual del Paso 5)
- **Eliminada la subpestaña "Deudas"** del grupo Finanzas. Ahora existe una sola subpestaña "Inversiones y deudas".
- **Fusionadas las dos vistas** (`view-inversion` + `view-deudas`) en una única sección con 3 bloques: inversiones, deudas activas, deudas concluidas.
- **KPIs combinados**: 8 indicadores en una sola grid (4 de inversión + 4 de deudas).
- **Render unificado**: `render.inversion()` ahora pinta todo (inversiones + deudas + KPIs combinados). `renderDeudas()` delega en `render.inversion()`.
- **Navegación limpia**: eliminado `case 'deudas'` de render.js y `deudas: 'finanzas'` de tabs.js.

Ver detalles en `CHANGELOG_v5.13.3.md`.

## v5.13.2 — Fusión Deuda + Inversión

### Refactorización arquitectónica (sin cambios visuales ni de datos)
- **Fusión de `deudas.js` en `inversion.js`**: Los dos módulos gestionaban el mismo modelo de datos (`RN.state.investments`) con solo un filtro de diferencia. Se unifican en un solo módulo. `deudas.js` eliminado (−201 líneas).
- **Devoluciones movidas de `caja.js` a `inversion.js`**: `caja.js` mezclaba retiros de caja con devoluciones de préstamo. Ahora `caja.js` tiene responsabilidad única (solo retiros). 421 → 212 líneas (−50%).
- **Helpers compartidos en `investment.js`**: Extraídos `_cobrosClienteDesde()` y `_margenMensualClientes()`, eliminando 6 funciones duplicadas (filtro de cobros 3×, bucle de margen 3×).
- **Helper `_filaDetalle()` en `render.js`**: Centraliza las ~22 filas de detalle condicionales de las tarjetas de inversión, reemplazando ternarios inline por `{ cond: … }`.
- **Bug corregido en `eliminar()`**: La versión de `deudas.js` SIEMPRE borraba las devoluciones asociadas, incluso para capital propio. Ahora la función unificada solo borra devoluciones cuando es préstamo externo.

### Archivos modificados
- `js/version.js` — versión 5.13.1 → 5.13.2
- `js/core/models/investment.js` — 2 helpers extraídos, 6 funciones simplificadas (646 → 638 líneas)
- `js/cobros/inversion.js` — absorbe lógica de deudas + devoluciones (módulo unificado)
- `js/cobros/deudas.js` — **ELIMINADO** (fusionado en inversion.js)
- `js/cobros/caja.js` — devoluciones movidas a inversion.js (421 → 212 líneas)
- `js/ui/render.js` — helper `_filaDetalle()` + 22 filas refactorizadas + referencias actualizadas
- `index.html` — eliminado `<script src="js/cobros/deudas.js">`
- `CHANGELOG_v5.13.2.md` — changelog detallado de esta versión

### Verificación
- Sintaxis JS: 0 errores en todos los archivos.
- Referencias rotas: 0 (cero referencias a `RN.deudas`, `RN.caja.devolucion*` o `deudas.js` en código ejecutable).
- Compatibilidad: total (sin cambios en modelo de datos ni persistencia).

---

## v5.13.1 — Corrección de 18 bugs de auditoría

Versión de corrección de errores detectados en la auditoría de v5.13.0. Se corrigen 18 bugs sin cambiar la arquitectura ni el modelo de datos. Ver `CHANGELOG_v5.13.1.md` para el detalle completo de cada bug.

### Bugs principales corregidos
- `mesActual` guardado pero nunca leído (cálculos usaban reloj del sistema).
- Pago parcial mezclaba servicio y equipo en `h.monto` (doble conteo).
- Descuento de equipo no aplicaba en pago parcial.
- `actualizarTasaAuto()` podía sobreescribir tasa con valor inválido.
- `eliminar()` divergente entre `deudas.js` e `inversion.js`.
- Validación de IPs con puntos, migración de datos, y 12 bugs más.

---

## v5.13.0 — 27 ago 2026

### Tasa USD: persistencia robusta
- **Fix `moneda.js` `actualizarTasaAuto()`**: Ahora se valida que la tasa recibida de la API automática (mdiv.pro) sea un número realista (mayor que 0 y menor que 100000) antes de sobreescribir la tasa configurada. Esto evita que una respuesta inválida o corrupta borre la tasa que el usuario configuró manualmente.
- **Fix `storage-local.js` `_aplicarData()`**: Al cargar datos desde un archivo de respaldo o backup, la configuración de tasa USD se preserva desde `STORAGE_KEYS.CONFIG` (la fuente autoritativa) si es más reciente que la del blob de datos. Esto evita que cargar un backup antiguo sobreescriba la tasa actual.

### Deudas personales — nueva sección en Finanzas
- **Nueva subpestaña "Deudas"** en el grupo Finanzas, junto a Inversión, Inventario, Gastos y Descuentos.
- **Vista de deudas personales**: Muestra los préstamos externos (capital a devolver) separados en dos grupos:
  - **Deudas activas**: Préstamos con saldo pendiente (saldoADevolver > 0)
  - **Historial de deudas concluidas**: Préstamos totalmente liquidados (saldoADevolver = 0)
- **KPIs de deudas**: Deudas activas, Saldo por devolver, Ya devuelto (activas), Concluidas (cantidad + total).
- **Tarjetas de deuda**: Cada deuda muestra estado (activa/concluida), fecha de creación, fecha de conclusión (si aplica), monto del préstamo, total devuelto, saldo por devolver o saldo final, % devuelto con barra de progreso visual, pago de la compra, historial de devoluciones, y botones de acción (Devolver préstamo, Ver devoluciones, Editar, Eliminar).
- **Auto-conclusión automática**: Cuando se registra una devolución que liquida completamente el saldo (saldoADevolver = 0), la deuda se marca automáticamente como concluida (`deudaConcluida = true`, `fechaConclusion = timestamp`) y pasa al historial de deudas concluidas. Se muestra un toast de confirmación: "¡Deuda liquidada! Trasladada al historial de deudas concluidas."

### Deudas personales: editables y eliminables
- **Editar**: Cualquier deuda personal (activa o concluida) puede editarse usando el botón "Editar", que abre el mismo formulario de inversión con los datos cargados.
- **Eliminar desde Deudas**: El botón 🗑 en la vista de Deudas elimina la deuda personal Y todas sus devoluciones asociadas, con un diálogo de confirmación que muestra cuántas devoluciones se eliminarán y el monto total.
- **Eliminar desde Inversión mejorado**: `RN.inversion.eliminar()` ahora, para préstamos externos, también elimina las devoluciones asociadas (antes se conservaban). El mensaje de confirmación se adapta según si es préstamo o capital propio.

### Archivos modificados
- `js/version.js` — versión 5.12.9 → 5.13.0
- `js/core/moneda.js` — `actualizarTasaAuto()`: validación de tasa antes de sobreescribir
- `js/storage/storage-local.js` — `_aplicarData()`: preservar config autoritativa de tasa USD
- `js/core/models/investment.js` — nuevas funciones: `deudasActivas()`, `deudasConcluidas()`, `verificarConclusion()`, `totalDevueltoConcluidas()`
- `js/cobros/caja.js` — `guardarDevolucion()`: auto-conclusión de deuda + re-render de deudas
- `js/cobros/inversion.js` — `eliminar()`: limpia devoluciones asociadas para préstamos externos
- `js/cobros/deudas.js` — **NUEVO**: módulo `RN.deudas` con render de deudas activas/concluidas y eliminar
- `js/ui/render.js` — `vista()`: case 'deudas' → `RN.deudas.render()`
- `js/ui/tabs.js` — `_vistaAGrupo`: mapeo `deudas: 'finanzas'`
- `index.html` — nueva sección `view-deudas`, subtab "Deudas", script tag `deudas.js`
- `sw.js` — Service Worker con `importScripts('js/version.js')` (cache key usa versión real)

---

## v5.12.9 — Calendario interactivo + Recuperación de inversión rediseñada

### Calendario interactivo con días de corte
- Calendario mensual con días de corte configurables por cliente
- Click en un día de corte abre modal con clientes a cobrar, monto total, botones de cobro y WhatsApp
- Botón "Recordar a todos" para enviar recordatorios masivos

### Recuperación de inversión: origen del capital
- Nuevo campo "Origen del capital": Capital propio vs Préstamo externo
- Préstamo externo: lleva saldo a devolver, permite registrar devoluciones desde la caja
- Aporte extra del mes: porcentaje configurable de la ganancia neta se destina a acelerar la recuperación
- Funciones: `origenCapital()`, `saldoADevolver()`, `totalDevuelto()`, `recuperadoNetoInv()`, `aporteExtraMes()`, `recuperadoEfectivo()`

### Service Worker fix
- `sw.js` ahora usa `importScripts('js/version.js')` para que el cache key use la versión real
- `version.js` y `sw.js` son network-first; el resto es cache-first

## v5.13.12 — Botón de versión para forzar actualización + FIX botones (31 ago 2025)
El badge de versión del header ahora es clickeable: busca y aplica actualizaciones de la app (Service Worker) de forma manual. Indicador visual animado cuando hay una actualización pendiente. **FIX crítico:** `ReferenceError: abiertas is not defined` en `RN.render.clientes` (v5.13.7, latente) abortaba `arrancar()` antes de conectar los botones del header, dejándolos todos sin funcionar. Ver `CHANGELOG_v5.13.12.md`.

## v5.13.14 — Fix del fondo de la cintilla de mes / tabla (estética) (31 ago 2025)
La cintilla de mes del historial de cobros (vista Realizados) aparecía con fondo gris claro (#f5f5f5) sobre el tema oscuro, rompiendo la estética. Causa: la variable CSS `--bg-alt` se usaba en toda la app pero nunca se definía, cayendo en un fallback hardcoded claro. Ahora se define `--bg-alt` en ambos temas (#eef2f7 claro, #172033 oscuro), arreglando también desgloses, badges USD y avisos de capacidad. Ver `CHANGELOG_v5.13.14.md`.
