# Changelog AdminRed v5.13.10 — Sección Calendario

**Fecha:** 31 ago 2025  
**Versión:** 5.13.9 → 5.13.10  
**Sección:** Calendario de cobros  
**Archivos modificados:** 5

---

## Resumen

Se aplicaron **22 correcciones** del informe de revisión de Calendario, distribuidas en 5 archivos. Las correcciones abarcan 4 bugs, 3 errores de lógica, 3 duplicaciones resueltas, 7 mejoras de UI y 5 mejoras de código.

---

## Helpers nuevos creados

### `RN.ciclos.cortesOficiales()` — `js/core/ciclos.js`
Centraliza los días de corte oficiales del negocio en una sola fuente de verdad. Antes el array `[5, 15, 25]` estaba hardcodeado en `calendario.js`, `modal-cliente.js` (x2) y la leyenda del HTML. Ahora lee de `RN.state.config.cortesPago` (con fallback `[5,15,25]`) y devuelve una copia ordenada asc. Usado en `calendario.js` (render + abrirDia) y `modal-cliente.js` (select de día de pago + validación al guardar).

### `RN.whatsapp.enviarMasivoLista(clienteIds)` — `js/notificaciones/whatsapp.js`
Envía recordatorios masivos a una lista **explícita** de IDs de cliente. Antes `_recordarTodosDia` del calendario llamaba a `enviarMasivo()` (global), que enviaba a TODOS los pendientes de la red en vez del día abierto. Esta versión recibe la lista ya filtrada por el llamador, confirma con el usuario y abre las pestañas escalonadas.

### `RN.calendario._estadoDominante(estados)` — `js/reportes/calendario.js`
Lógica pura extraída y testeable: devuelve el estado dominante de un conjunto de estados para colorear un día. Prioridad: `due > warn > parcial > paid > por-iniciar > ok > inactivo`. Antes estaba inline en `render()` con una cadena de `if/else` y mapeaba `por-iniciar` a `ok` (BUG-4).

### `RN.calendario._diaEfectivo(diaPago, diasMes)` — `js/reportes/calendario.js`
Reasigna un `diaPago` al último día del mes si lo excede (BUG-3). Un cliente con `diaPago=31` en febrero se muestra el día 28/29 en vez de ser invisible.

### Helpers de render del modal — `js/reportes/calendario.js`
`_filaCliente(c, r, ym)`, `_headerDia(dia, ym, ctx)`, `_kpiDia(totales)`, `_dotsPorEstado(items)`, `_bindGrid(grid)`, `_bindModalAcciones()`. Cada uno devuelve/instala una pieza acotada y testeable, en lugar de ~45 líneas de concatenación de strings en una sola función.

---

## Bugs corregidos (4)

### BUG-1: "Recordar a todos (WhatsApp)" enviaba a TODA la red, no al día abierto
**Archivo:** `js/reportes/calendario.js` (`_recordarTodosDia`) + `js/notificaciones/whatsapp.js`  
Antes: la función filtraba correctamente los clientes del día, pero luego **los descartaba** y llamaba a `RN.whatsapp.enviarMasivo()`, que envía recordatorios a todos los clientes activos pendientes de toda la red. El usuario creía avisar solo a un corte, pero se abrían pestañas de WhatsApp para toda la cartera. Ahora filtra los pendientes del día con teléfono y `mesInicio <= mes actual`, y llama a `enviarMasivoLista(ids)` que respeta la lista del día.

### BUG-2: Inconsistencia en el cálculo de "esMesActual" entre render() y abrirDia()
**Archivo:** `js/reportes/calendario.js` (`render`, `abrirDia`)  
Antes: `render()` calculaba `esMesActual` con `new Date()` (reloj real del sistema), mientras que `abrirDia()` lo calculaba con `RN.calc.mesActualStr()` (que respeta `RN.state.mesActual`, el mes operativo). Tras un cierre de mes, el resaltado de "hoy" y los badges "Vigente/Vencido" del modal se contradecían con la grilla. Ahora ambas usan `RN.calc.mesActualStr()`, coherente con la corrección v5.13.1 (Bug #1).

### BUG-3: Clientes con diaPago mayor que los días del mes eran invisibles
**Archivo:** `js/reportes/calendario.js` (`render`, `abrirDia`, `_diaEfectivo`)  
Antes: el mapa `porDia` agrupaba clientes por `diaPago` (cualquier valor), pero el bucle de render solo iteraba `d = 1..diasMes`. Un cliente con `diaPago=31` en febrero (28/29 días) nunca aparecía en el calendario — era invisible y no se podía gestionar desde esta vista. Ahora `_diaEfectivo` reasigna al último día del mes, tanto en `render` como en `abrirDia` y `_recordarTodosDia`.

### BUG-4: Estado "por-iniciar" se mostraba como "ok" (verde "Al día") — engañoso
**Archivo:** `js/reportes/calendario.js` (`_estadoDominante`) + `styles.css`  
Antes: el estado `por-iniciar` (cliente cuyo mes de inicio es futuro, aún no le toca pagar) se mapeaba a `'ok'` en el cálculo del color dominante, pintando el día de verde ("Al día"), indistinguible de un cliente que ya debe y está al corriente. Ahora `por-iniciar` tiene su propia clase CSS (punto gris + borde punteado + opacidad reducida), consistente con el badge `badge.por-iniciar` que ya existía en `render.js` y `styles.css`.

---

## Errores de lógica corregidos (3)

### LOG-1: "esCorteVigente" usaba el reloj real pero comparaba con el mes en vista
**Archivo:** `js/reportes/calendario.js` (`abrirDia`)  
Antes: `esCorteVigente = esMesActual && cv && cv.diaPago === dia` donde `cv = corteVigente()` usaba `diaHoyNum()` (reloj real). Si el mes operativo difiere del real, el corte "vigente" se calculaba sobre el día real aunque se viera el mes operativo. Ahora solo se calcula `corteVigente()` cuando `esMesActual` es verdadero (alineado con BUG-2), evitando la contradicción.

### LOG-2: "Total a cobrar" del modal no incluía la mora de meses anteriores
**Archivo:** `js/reportes/calendario.js` (`abrirDia`, `_filaCliente`, `_kpiDia`)  
Antes: el total por cliente se calculaba como `neto + cuotaEq` (solo el mes en curso). El badge de mora se mostraba si `getMora(c) > 0`, pero el KPI "Total a cobrar este día" no sumaba los meses en mora, dando una cifra engañosamente baja para clientes atrasados. Ahora usa `resumenCliente(c, ym).totalDeuda` que equivale a `neto*(mora+1) + deudaEquipo` (función creada en v5.13.1, Bug #4). El desglose del modal aclara "servicio + cuotas de equipo + mora acumulada" cuando corresponde, y el KPI indica "incluye mora acumulada".

### LOG-3: Filtro de pendientes en _recordarTodosDia duplicaba el de clientesCorteVigentePendientes
**Archivo:** `js/reportes/calendario.js` (`_recordarTodosDia`)  
Antes: el filtro `getStatus(c) !== 'paid' && mesInicioCliente(c) <= mesActualStr()` se reimplementaba a mano, cuando `ciclos.js` ya tenía `clientesCorteVigentePendientes()` con la misma lógica. Ahora se aplica el mismo criterio de forma consistente (dos implementaciones = riesgo de divergencia eliminado).

---

## Duplicaciones resueltas (3)

### DUP-1: Array de cortes [5, 15, 25] hardcodeado en 3 sitios
**Archivo:** `js/core/ciclos.js` + `js/reportes/calendario.js` + `js/clientes/modal-cliente.js`  
Antes: los días de corte oficiales estaban escritos literalmente en `calendario.js` (`RN.calendario.CORTES = [5,15,25]`), `modal-cliente.js` línea 189 (`var cortes = [5,15,25]`) y línea 264 (`const CORTES_PAGO = [5,15,25]`). Si el negocio cambiaba sus cortes, había que editar 3 sitios. Ahora `RN.ciclos.cortesOficiales()` es la única fuente (lee `config.cortesPago` con fallback `[5,15,25]`). `RN.calendario.CORTES` se mantiene como accessor legacy vía `Object.defineProperty` getter para no romper código externo.

### DUP-2: El calendario no usaba resumenCliente() — la única vista sin migrar
**Archivo:** `js/reportes/calendario.js` (`render`, `abrirDia`, `_filaCliente`)  
Antes: el calendario llamaba por separado a `getStatus`, `getPrecioNeto`, `getCuotaEquipoCliente`, `getMora` — el mismo patrón que `calculations.js` documenta como "dispersos" (v5.13.1, Bug #4) y que `resumenCliente()` (v5.13.7) centralizó. Todas las demás vistas (mora, cobranza, render, modal-cobro) ya migraron; el calendario era la única que no. Ahora usa `resumenCliente(c, ym)` en una sola llamada por cliente, obteniendo `{estado, neto, cuotaEq, deuda, mora, totalMes, totalDeuda}`. Esto resolvió LOG-2 automáticamente.

### DUP-3: _clientesDelDia() duplicaba clientesPorCorte() de ciclos.js
**Archivo:** `js/reportes/calendario.js`  
Antes: `_clientesDelDia(dia)` hacía exactamente lo mismo que `RN.ciclos.clientesPorCorte(dia)`: filtrar activos por `diaPago === dia`. Dos funciones idénticas. Eliminada `_clientesDelDia`; el filtrado ahora se hace inline con `_diaEfectivo` (BUG-3) en `abrirDia` y `_recordarTodosDia`, ya que además necesita el reasigno de día.

---

## Mejoras de UI (7)

### UI-1: Botón "Hoy" para volver al mes en curso
**Archivo:** `js/reportes/calendario.js` (`irHoy`) + `index.html`  
Antes: el usuario podía navegar meses con ‹ › pero, si avanzaba varios, no había forma rápida de volver al actual. Ahora hay un botón "Hoy" junto a las flechas que reinicia `_mes` al mes operativo y refresca.

### UI-2: Soporte de teclado (Enter/Space) en días clickeables
**Archivo:** `js/reportes/calendario.js` (`_bindGrid`)  
Antes: los días tenían `tabindex="0"` y `role="button"` para accesibilidad, pero **no había listener de teclado**. Un usuario de teclado podía tabular hasta el día pero no abrirlo con Enter o Espacio. Ahora hay delegación de eventos `keydown` en la grilla que abre el día con Enter/Space.

### UI-3: Leyenda de estados completa (añadido Pago parcial y Por iniciar)
**Archivo:** `index.html`  
Antes: la leyenda mostraba Al día / Por vencer / Atrasado / Pagado / Corte, pero el código pinta también `parcial` y `por-iniciar`. El usuario veía un día amarillo punteado y no sabía qué significaba. Ahora la leyenda incluye ambos estados.

### UI-4: Un punto por estado presente en el día (en vez de uno solo dominante)
**Archivo:** `js/reportes/calendario.js` (`_dotsPorEstado`) + `styles.css`  
Antes: se renderizaba un único `.dot` coloreado por el estado dominante, lo que ocultaba que un día tenía clientes en varios estados. Ahora se muestra un punto por cada estado presente (con `title` accesible indicando el conteo), envuelto en un contenedor flex `.cal-dots` para alinearlos.

### UI-5: El modal indica cuántos clientes tienen/sin teléfono
**Archivo:** `js/reportes/calendario.js` (`_kpiDia`)  
Antes: el botón "Recordar a todos (WhatsApp)" podía fallar silenciosamente para clientes sin teléfono, y el KPI no aclaraba cuántos eran contactables. Ahora el subtexto del KPI muestra "X con teléfono · Y sin teléfono" cuando hay pendientes, y el botón masivo solo aparece si hay pendientes con teléfono; si no, se muestra una nota explicativa.

### UI-6: Estilos inline del modal extraídos a clases CSS semánticas
**Archivo:** `js/reportes/calendario.js` + `styles.css`  
Antes: ~10 estilos inline (`style="font-size:12px"`, `style="text-align:center"`, `style="white-space:nowrap"`, etc.) ensuciaban el DOM y dificultaban el mantenimiento. Ahora se usan clases: `.cal-col-right`, `.cal-col-center`, `.cal-modal-plan`, `.cal-modal-ip`, `.cal-modal-note`, `.cal-modal-desglose`, `.cal-modal-actions`, `.cal-deuda-total`.

### UI-7: Aviso de mes sin cobros programados
**Archivo:** `js/reportes/calendario.js` (`render`) + `index.html`  
Antes: si un mes futuro no tenía clientes asignados, la grilla se renderizaba vacía (solo números) sin explicación, y el usuario podía pensar que falló. Ahora se muestra un aviso "Sin cobros programados para este mes" debajo de la grilla (`#cal-empty-aviso`).

---

## Mejoras de código (5)

### CODE-1: Estilo unificado const/let + arrow functions
**Archivo:** `js/reportes/calendario.js`  
Antes: `render()` usaba `const/let` y arrow functions, mientras `abrirDia()` y `_recordarTodosDia()` usaban `var` y `function`. Inconsistencia estilística. Ahora todo el archivo usa `const/let` + arrow functions.

### CODE-2: Helpers de render extraídos de abrirDia()
**Archivo:** `js/reportes/calendario.js`  
Antes: el modal se construía con ~45 líneas de concatenación de strings con operador `+`, mezclando HTML, valores dinámicos, clases condicionales y escapes. Frágil y difícil de auditar. Ahora se extrae en `_filaCliente`, `_headerDia`, `_kpiDia` — cada uno devuelve un string acotado y testeable.

### CODE-3: Lógica pura extraída y testeable (_estadoDominante)
**Archivo:** `js/reportes/calendario.js`  
Antes: la lógica de "color dominante" estaba inline en `render()` con una cadena de `if/else`, mezclada con la generación de HTML. Ahora `_estadoDominante(estados)` es una función pura sin dependencias del DOM, candidata a tests unitarios.

### CODE-4: resumenCliente precalculado una sola vez por render
**Archivo:** `js/reportes/calendario.js` (`render`)  
Antes: `render()` iteraba `clientesActivos()` para construir `porDia`, y luego por cada día volvía a iterar los clientes llamando `getStatus(c)` (que filtra `history` cada vez) — O(días × clientes/día). Ahora `resumenCliente` se precalcula una vez por cliente al construir `porDia` y se guarda en el mapa, evitando recalcular. Esto resolvió DUP-2 y CODE-4 de un golpe.

### CODE-5: Delegación de eventos elimina onclick inline con escape manual (XSS)
**Archivo:** `js/reportes/calendario.js` (`_bindGrid`, `_bindModalAcciones`)  
Antes: los botones usaban `onclick="RN.calendario._cobrar(\' + c.id + \')"` con escape manual de comillas. Si un `c.id` contenía una comilla simple, se rompía el handler o abría un vector de XSS. Ahora los botones usan `data-id="${RN.render.escAttr(c.id)}"` y `data-accion`, con un listener delegado que lee los atributos. Los días de la grilla usan `data-dia` + delegación de click/teclado. (Los botones `×`/Cerrar del modal conservan `onclick="RN.uiComponents.cerrarModal()"` por ser función global segura y consistente con el resto de la app.)

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `js/reportes/calendario.js` | Reescritura completa: 4 bugs, 3 lógica, 2 duplicaciones, 7 UI, 5 código |
| `js/core/ciclos.js` | Nuevo `cortesOficiales()` (DUP-1) |
| `js/notificaciones/whatsapp.js` | Nuevo `enviarMasivoLista()` (BUG-1) |
| `js/clientes/modal-cliente.js` | Usa `cortesOficiales()` en select + validación (DUP-1) |
| `styles.css` | Clases `por-iniciar`, `cal-dots`, `cal-col-*`, `cal-modal-*`, `cal-empty-aviso` (BUG-4, UI-4, UI-6, UI-7) |
| `index.html` | Botón Hoy, leyenda completa, aviso vacío (UI-1, UI-3, UI-7) |
| `js/version.js` | 5.13.9 → 5.13.10 |

---

## Correcciones que se resuelven en cadena

- Migrar a `resumenCliente()` (**DUP-2**) arregló automáticamente **LOG-2** (mora en el total) y mejoró el rendimiento (**CODE-4**).
- Centralizar cortes en `cortesOficiales()` (**DUP-1**) permitió que **BUG-3**, el calendario y el modal de cliente compartieran la misma fuente.
- Usar delegación de eventos (**UI-2**) habilitó corregir **CODE-5** (XSS) con el mismo patrón.
- Corregir **BUG-4** (color por-iniciar) fue de la mano con **UI-3** (leyenda completa).
