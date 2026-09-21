# Changelog v5.13.5 — Corrección exhaustiva de los 26 issues de la auditoría v5.13.4

**Fecha:** 29 de agosto de 2025
**Versión:** 5.13.5
**Tipo:** Correcciones de bugs + mejoras de robustez
**Base:** Auditoría exhaustiva `auditoria-v5.13.4.md` (26 problemas identificados)

---

## Resumen

Esta versión implementa las **26 correcciones** identificadas en la auditoría
exhaustiva del código v5.13.4. Los problemas se clasificaron por severidad:

| Severidad | Cantidad | Estado |
|---|---|---|
| 🔴 Crítico | 1 | ✅ Corregido |
| 🟠 Alto | 2 | ✅ Corregidos |
| 🟡 Medio | 13 | ✅ Corregidos |
| 🟢 Bajo | 10 | ✅ Corregidos |
| **Total** | **26** | **✅ 26/26** |

El problema más grave fue **ISSUE #14**: al guardar el archivo de datos cifrado
sin PIN en memoria, `createWritable()` truncaba el archivo a 0 bytes antes de
verificar el PIN, provocando pérdida total de datos. Ahora la verificación se
realiza **antes** de abrir el writable.

---

## 🔴 Problema Crítico

### ISSUE #14 — Pérdida de datos: archivo truncado a 0 bytes al guardar sin PIN
**Archivo:** `js/storage/storage-file.js` · **Función:** `guardarAhora()`

**Problema:** La API File System Access `createWritable()` trunca el archivo a
0 bytes inmediatamente. Si el archivo estaba marcado como cifrado pero el PIN no
estaba en memoria (p. ej. tras reiniciar el navegador), el código entraba en la
rama de error, ejecutaba `await w.close()` sin escribir nada y dejaba el archivo
vacío.

**Corrección:** Se movió la verificación del PIN **antes** de `createWritable()`.
Si falta el PIN, se muestra un toast, se persiste en localStorage como respaldo,
y se hace `return` sin truncar el archivo:

```javascript
if (RN.state.pinHash && RN.state.fileIsEncrypted && !RN.pin._pinActual) {
  RN.notifyUI.toast('Se necesita el PIN para cifrar. Desbloquea la app primero.', 'warn');
  RN.storageLocal.persistir();
  return;  // NO se llama createWritable() → archivo intacto
}
const w = await RN.state.fileHandle.createWritable();
```

---

## 🟠 Problemas de Severidad Alta

### ISSUE #6 — Pago parcial ignora el monto de equipo ingresado por el usuario
**Archivo:** `js/cobros/modal-cobro.js` · **Función:** `confirmar()`

**Problema:** En pago parcial, el código sobrescribía `montoEquipoPagado` con
`Math.max(0, pagadoCUP - neto)`, ignorando el `montoEq` que el usuario ingresó
explícitamente en el campo `cobro-monto-equipo`.

**Corrección:** Si el usuario especificó `montoEq > 0`, se respeta: el pago al
equipo es `Math.min(montoEq, pagadoCUP)` y el resto va al servicio. Si no
especificó, se mantiene la lógica original (servicio primero).

### ISSUE #11 — Venta de inventario almacenada como pago de equipo
**Archivos:** `js/cobros/inventario.js`, `js/reportes/recibo.js`

**Problema:** Las ventas de inventario se registraban con `monto: 0` y
`montoEquipo: precioTotal`, confundiendo una venta de material con un pago de
deuda de equipo. El campo `montoEquipo` semánticamente significa "pago de deuda
de equipo", no "venta de inventario".

**Corrección:** Se cambió a `monto: precioTotal, montoEquipo: 0` conservando el
tipo `'venta-inventario'`. Se actualizó `recibo.js` para renderizar correctamente
el tipo `venta-inventario`, mostrando el concepto en la línea de monto en lugar
de la línea de cuota de equipo.

---

## 🟡 Problemas de Severidad Media

### ISSUE #1 — Paréntesis sin cerrar en `moneda.mostrar()`
**Archivo:** `js/core/moneda.js`

**Problema:** El HTML generado tenía un paréntesis de apertura `(` que nunca se
cerraba antes de `</span>`, produciendo `(USD 5.00</span>`.

**Corrección:** Se cerró el paréntesis: `formatUSD(usd) + ')</span>'`.

### ISSUE #4 — Doble guardado redundante de configuración
**Archivo:** `js/core/config.js`

**Problema:** `guardar()` llamaba tanto `RN.config.persistir()` como
`RN.storageLocal.guardar()`, escribiendo la configuración dos veces.

**Corrección:** Se eliminó `RN.config.persistir()` redundante, manteniendo solo
`RN.storageLocal.guardar()`.

### ISSUE #9 — Error de timezone en retiro de caja
**Archivo:** `js/cobros/caja.js`

**Problema:** `new Date(fecha).toISOString()` desplaza la fecha un día atrás
para usuarios en UTC-5 (Cuba), guardando los retiros de caja un día antes.

**Corrección:** Reemplazado por `fecha + 'T00:00:00'` que preserva la fecha local.

### ISSUE #10 — Anular descuento aplicado no revierte el efecto financiero
**Archivo:** `js/cobros/descuentos.js`

**Problema:** Al anular un descuento que ya fue aplicado a un cobro, el efecto
financiero (reducción del monto del cobro) no se revertía, dejando el cobro con
un monto menor al real.

**Corrección:** Al anular, se busca el cobro asociado (`d.cobroHid`), se calcula
el valor del descuento y se suma de vuelta a `cobro.monto`, `cobro.totalCUP` y
`cobro.totalAPagar`.

### ISSUE #12 — Error de timezone en devolución de inversión
**Archivo:** `js/cobros/inversion.js`

**Problema:** Mismo patrón de timezone que ISSUE #9 en `guardarDevolucion()`.

**Corrección:** Reemplazado `new Date(fecha).toISOString()` por
`fecha + 'T00:00:00'`.

### ISSUE #16 — `confirm()` con 5 argumentos: Promise colgada al cancelar
**Archivos:** `js/ui/ui-components.js`, `js/storage/autobackup.js`

**Problema:** `autobackup.js` llamaba `RN.uiComponents.confirm()` pasando un
quinto argumento `onCancel` que la función no soportaba. Al cancelar, la Promise
nunca se resolvía, dejando el flujo colgado indefinidamente.

**Corrección:** Se añadió soporte para `opts.onCancel` en ambas funciones
`confirm()` y `prompt()` de `ui-components.js`. `autobackup.js` ahora usa
`{ onCancel: function () { resolve(false); } }` para resolver la Promise al
cancelar.

### ISSUE #18 — Doble guardado en `ingresarTasa()` + posposición no persistida
**Archivo:** `js/ui/tasa-aviso.js`

**Problema:** `ingresarTasa()` llamaba redundante `persistir()` además de
`guardar()`. Además, `posponer24h()` no persistía el estado completo tras
posponer, por lo que la posposición podía perderse.

**Corrección:** Se eliminó `persistir()` redundante en `ingresarTasa()`. Se
añadió `RN.storageLocal.guardar()` en `posponer24h()` para que la posposición
persista en el estado completo.

### ISSUE #20 — `normalizarTel()` produce número inválido
**Archivo:** `js/notificaciones/whatsapp.js`

**Problema:** La función solo aceptaba teléfonos de exactamente 8 dígitos para
anteponer el prefijo `53` (Cuba). Los teléfonos de 7 dígitos (formato antiguo
cubano) no se normalizaban correctamente.

**Corrección:** Se modificó para aceptar 7 u 8 dígitos:
`if ((t.length === 7 || t.length === 8) && !t.startsWith('53')) t = '53' + t;`

### ISSUE #21 — Error de timezone en confirmación de paquete proveedor
**Archivo:** `js/paquete/modal-paquete-proveedor.js`

**Problema:** Mismo patrón de timezone al confirmar un paquete de proveedor.

**Corrección:** Reemplazado `new Date(fecha).toISOString()` por
`fecha + 'T00:00:00'`.

### ISSUE #22 — Triple guardado redundante en `confirmar()` del proveedor
**Archivo:** `js/paquete/modal-paquete-proveedor.js`

**Problema:** `confirmar()` ejecutaba tres veces la secuencia
`RN.config.persistir(); RN.storageLocal.guardar();`, escribiendo la
configuración seis veces en una sola operación.

**Corrección:** Se consolidaron los tres bloques en un único `guardar()`.

### ISSUE #23 — Error de timezone en registro de gasto
**Archivo:** `js/gastos.js`

**Problema:** Mismo patrón de timezone al registrar un gasto.

**Corrección:** Reemplazado `new Date(fecha).toISOString()` por
`fecha + 'T00:00:00'`.

### ISSUE #24 — Configuración de PIN no cifra el archivo existente
**Archivo:** `js/pin.js`

**Problema:** Tras configurar un PIN por primera vez, el flag `fileIsEncrypted`
se establecía en `true` pero el archivo de datos existente no se cifraba
inmediatamente, quedando en texto plano con un flag que indicaba cifrado. Al
reabrir la app, se intentaba descifrar un archivo en texto plano, causando error.

**Corrección:** Tras configurar el PIN, se llama inmediatamente
`await RN.storageFile.guardarAhora()` para cifrar el archivo existente.

### ISSUE #26 — Escapado incompleto de nombres de producto (XSS potencial)
**Archivo:** `js/ui/render.js`

**Problema:** Los nombres de producto se escapaban solo para comillas simples
(`replace(/'/g, "\\'")`) al insertarlos en atributos `onclick`, pero no se
escapaban comillas dobles, permitiendo potencial HTML injection/XSS si un nombre
contenía `"`.

**Corrección:** Se añadió `RN.render.escAttr()` que escapa tanto comillas
simples (contexto JS) como dobles (contexto HTML). Se reemplazaron los 2 patrones
de escapado manual con `RN.render.escAttr(p.nombre)`.

### ISSUE EXTRA — elToque.com bloqueado por Cloudflare (403/404)
**Archivo:** `js/ui/tasa-aviso.js`

**Problema:** El botón “Visitar elToque” abría `https://eltoque.com/` que
devuelve error 404. Al cambiar la URL a `https://eltoque.com/tasas-de-cambio-cuba`
se descubrió que **todas las páginas de eltoque.com están protegidas por
Cloudflare con verificación anti-bot** que bloquea el acceso cuando se abre
vía `window.open()` desde otro sitio (github.io), devolviendo status 403.
En el celular del usuario, esto se manifestaba como error 404 o página de
verificación interminable.

**Corrección:** Se cambió la URL a `https://tasa-cambio-cuba.vercel.app`,
un proxy público que muestra las mismas tasas del TRMI (Tasa Representativa del
Mercado Informal) de elToque, pero sin el bloqueo de Cloudflare. Verificado que
responde correctamente (status 200) y muestra las tasas en tiempo real
(USD, EUR, MLC). También se actualizó el texto del botón a
“Ver tasa de cambio en elToque (TRMI)”.

---

## 🟢 Problemas de Severidad Baja

### ISSUE #2 — `reciboCounter` en snapshots puede retroceder al deshacer
**Archivo:** `js/core/checkpoint.js`

**Problema:** `reciboCounter` se incluía en los snapshots. Al deshacer (undo),
el contador podía retroceder a un valor menor, causando recibos duplicados.

**Corrección:** Se excluyó `reciboCounter` de los snapshots. Al restaurar, se usa
`Math.max(reciboActual, reciboSnap)` para garantizar un contador monótono
creciente.

### ISSUE #3 — `graciaDias` no persiste ni tiene campo en UI
**Archivos:** `js/core/config.js`, `js/core/state.js`, `index.html`

**Problema:** El campo `graciaDias` (días de gracia antes de aplicar mora) no se
cargaba ni guardaba en la configuración, y no existía campo en la UI de ajustes
para configurarlo.

**Corrección:** Se añadió `graciaDias: 5` al estado por defecto en `state.js`.
Se añadió carga/guardado en `config.js` (`rellenarForm()` y `guardar()`). Se
añadió campo `<input type="number" id="cfg-gracia-dias">` en la UI de ajustes.

### ISSUE #5 — Lógica frágil de validación de teléfono
**Archivo:** `js/core/validate-fields.js`

**Problema:** La validación usaba una variable `ok` con lógica de flujo frágil
que era difícil de seguir y propensa a errores.

**Corrección:** Se simplificó con `return` tempranos para cada caso de validación.

### ISSUE #7 — Reducción de deuda de equipo usa monto recalculado
**Archivo:** `js/cobros/modal-cobro.js`

**Problema:** Consecuencia directa de ISSUE #6. Al recalcular `montoEquipoPagado`
en pago parcial, la deuda de equipo no se reducía según la intención del usuario.

**Corrección:** Resuelto junto con ISSUE #6 al respetar el `montoEq` del usuario.

### ISSUE #8 — `abrirDesdeCobros()` usa reemplazo hacky con prompt
**Archivo:** `js/cobros/modal-cobro.js`

**Problema:** `abrirDesdeCobros()` usaba un `prompt()` nativo seguido de un
reemplazo hacky del DOM para simular un selector de cliente, en lugar de usar un
modal estilizado con dropdown.

**Corrección:** Se reescribió para usar `RN.uiComponents` con un modal estilizado
que incluye un `<select>` dropdown para seleccionar el cliente.

### ISSUE #13 — Doble `toast()` consecutivo al concluir deuda
**Archivo:** `js/cobros/inversion.js`

**Problema:** Al concluir una deuda de equipo, se mostraban dos `toast()`
consecutivos con mensajes similares, creando una experiencia confusa.

**Corrección:** Se consolidaron en un único `toast()` con un mensaje combinado.

### ISSUE #15 — `importarBackup` usa `confirm()` nativo
**Archivo:** `js/storage/export.js`

**Problema:** `importarBackup()` usaba `confirm()` nativo del navegador en lugar
del modal estilizado `RN.uiComponents.confirm()`, rompiendo la consistencia
visual.

**Corrección:** Se reestructuró para usar `RN.uiComponents.confirm()` asíncrono
con callback. La lógica post-confirmación se extrajo a una función
`aplicarImport()`.

### ISSUE #17 — Uso de variable global `event` deprecada
**Archivo:** `js/ui/inline-edit.js`

**Problema:** La función usaba la variable global `event` (deprecada en
navegadores modernos) en lugar de recibir el evento como parámetro.

**Corrección:** Se añadió parámetro `ev` con fallback:
`const cell = (ev && ev.target) || (window.event && window.event.target);`

### ISSUE #19 — `importarDeContactos()` usa `confirm()` y `prompt()` nativos
**Archivo:** `js/clientes/modal-cliente.js`

**Problema:** `importarDeContactos()` usaba `confirm()` y `prompt()` nativos en
lugar de los modales estilizados de `RN.uiComponents`.

**Corrección:** Se reemplazaron por `RN.uiComponents.confirm()` y
`RN.uiComponents.prompt()`.

### ISSUE #25 — Reset de la app no limpia la configuración
**Archivo:** `js/reset-app.js`

**Problema:** El reset de la app preservaba la configuración (tasa, mes, etc.)
sin documentarlo claramente, lo cual podía confundir al usuario que esperaba un
reset completo.

**Corrección:** Se documentó explícitamente en el mensaje del modal que la
configuración se preserva intencionalmente (para comodidad del usuario). Se
actualizó el mensaje de confirmación y se añadió `RN.storageLocal.guardar()`
tras el reset para persistir el estado limpio.

---

## Archivos modificados

| Archivo | Issues corregidos |
|---|---|
| `js/version.js` | Bump 5.13.4 → 5.13.5 |
| `js/storage/storage-file.js` | #14 (crítico) |
| `js/cobros/modal-cobro.js` | #6, #7, #8 |
| `js/cobros/inventario.js` | #11 |
| `js/reportes/recibo.js` | #11 (seguimiento) |
| `js/cobros/caja.js` | #9 |
| `js/cobros/inversion.js` | #12, #13 |
| `js/gastos.js` | #23 |
| `js/paquete/modal-paquete-proveedor.js` | #21, #22 |
| `js/core/config.js` | #3, #4 |
| `js/ui/tasa-aviso.js` | #18 |
| `js/ui/ui-components.js` | #16 |
| `js/storage/autobackup.js` | #16 |
| `js/storage/export.js` | #15 |
| `js/clientes/modal-cliente.js` | #19 |
| `js/core/moneda.js` | #1 |
| `js/cobros/descuentos.js` | #10 |
| `js/notificaciones/whatsapp.js` | #20 |
| `js/pin.js` | #24 |
| `js/ui/render.js` | #26 |
| `js/core/checkpoint.js` | #2 |
| `js/core/state.js` | #3 |
| `index.html` | #3 (campo UI graciaDias) |
| `js/core/validate-fields.js` | #5 |
| `js/ui/inline-edit.js` | #17 |
| `js/reset-app.js` | #25 |

---

## Verificación

- ✅ `node --check` ejecutado en los 61 archivos JavaScript — **0 errores de sintaxis**.
- ✅ Los archivos con codificación CESU-8 (emojis como surrogate pairs) verifican
  correctamente con Node.js.
- ✅ Los 26 issues de la auditoría están implementados y verificados en código.

---

## Estado final de la auditoría v5.13.4

| Issue | Severidad | Estado |
|---|---|---|
| #14 | 🔴 Crítico | ✅ v5.13.5 |
| #6 | 🟠 Alto | ✅ v5.13.5 |
| #11 | 🟠 Alto | ✅ v5.13.5 |
| #1 | 🟡 Medio | ✅ v5.13.5 |
| #4 | 🟡 Medio | ✅ v5.13.5 |
| #9 | 🟡 Medio | ✅ v5.13.5 |
| #10 | 🟡 Medio | ✅ v5.13.5 |
| #12 | 🟡 Medio | ✅ v5.13.5 |
| #16 | 🟡 Medio | ✅ v5.13.5 |
| #18 | 🟡 Medio | ✅ v5.13.5 |
| #20 | 🟡 Medio | ✅ v5.13.5 |
| #21 | 🟡 Medio | ✅ v5.13.5 |
| #22 | 🟡 Medio | ✅ v5.13.5 |
| #23 | 🟡 Medio | ✅ v5.13.5 |
| #24 | 🟡 Medio | ✅ v5.13.5 |
| #26 | 🟡 Medio | ✅ v5.13.5 |
| #2 | 🟢 Bajo | ✅ v5.13.5 |
| #3 | 🟢 Bajo | ✅ v5.13.5 |
| #5 | 🟢 Bajo | ✅ v5.13.5 |
| #7 | 🟢 Bajo | ✅ v5.13.5 |
| #8 | 🟢 Bajo | ✅ v5.13.5 |
| #13 | 🟢 Bajo | ✅ v5.13.5 |
| #15 | 🟢 Bajo | ✅ v5.13.5 |
| #17 | 🟢 Bajo | ✅ v5.13.5 |
| #19 | 🟢 Bajo | ✅ v5.13.5 |
| #25 | 🟢 Bajo | ✅ v5.13.5 |
