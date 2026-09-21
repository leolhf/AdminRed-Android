# Changelog AdminRed v5.13.12 — Botón de versión + FIX crítico de botones

**Fecha:** 31 ago 2025  
**Versión:** 5.13.11 → 5.13.12  
**Sección:** Header / PWA / render  
**Archivos modificados:** 5 (`index.html`, `styles.css`, `js/pwa.js`, `js/init.js`, `js/ui/render.js`) + `js/version.js`

---

## FIX CRÍTICO — Los botones de la app dejaron de funcionar

### BUG: `ReferenceError: abiertas is not defined` abortaba `arrancar()` antes de conectar los botones
**Archivo:** `js/ui/render.js` (`RN.render.clientes`, línea 488)  
**Origen:** v5.13.7 (CODE-4) — bug latente desde hace varias versiones.  
**Síntoma:** ningún botón del header (Guardar, Deshacer, Tema, Instalar, Menú) ni el FAB respondía al clic; la app cargaba el dashboard pero quedaba "muerta" interactivamente.

**Causa raíz:** la función `RN.render.clientes` terminaba con un bloque para **restaurar las tarjetas abiertas** tras un re-render:
```js
abiertas.forEach(function (cardId) { ... });  // línea 488
```
Pero la variable `abiertas` **nunca se declaraba** dentro de la función. La intención del comentario "v5.13.7 (CODE-4): restaurar tarjetas que estaban abiertas antes del re-render" era capturarlas ANTES de sobreescribir `cont.innerHTML`, pero esa captura faltaba. Al no haber `const abiertas = [...]`, el nombre `abiertas` resolvía a una variable global inexistente → `ReferenceError`.

**Por qué mataba todos los botones:** `RN.render.clientes` se ejecuta en el **paso 11** de `RN.init.arrancar()` (durante `RN.render.todo()`), mientras que los `addEventListener` de los botones del header se registran en el **paso 13**. El `ReferenceError` abortaba `arrancar()` en el paso 11, así que el paso 13 nunca corría y los botones quedaban sin listener.

**Fix:** declarar `abiertas` al inicio de la función, capturando las tarjetas con clase `.open` antes de reescribir el HTML:
```js
const abiertas = Array.prototype.slice.call(cont.querySelectorAll('.acc-card.open'))
  .map(function (el) { return el.id; });
```
Ahora el bloque final `abiertas.forEach(...)` reabre correctamente las tarjetas que el usuario había expandido, cumpliendo la intención original de CODE-4, y `arrancar()` completa hasta el paso 17 conectando todos los botones.

**Verificación:** cargada la app en Chromium (modo claro y oscuro), el `ReferenceError` desaparece, el dashboard renderiza completo y los botones Menú (⋮), Tema (🌙) y el nuevo badge de versión responden al clic.

---

## Resumen

El badge de versión del header (`v5.13.x`), que hasta ahora era puramente informativo, ahora es **clickeable como un botón** para forzar la búsqueda y aplicación de actualizaciones de la app. Al pulsarlo, la app pide al Service Worker que busque una nueva versión en la red; si existe, la descarga, la activa (`skipWaiting`) y recarga la página con los assets nuevos. Si ya hay una actualización esperando (el navegador la descargó en segundo plano pero no la aplicó), la aplica de inmediato. Si todo está al día, avisa con un toast "Tienes la última versión". Además, cuando hay una actualización pendiente, el badge se resalta con un pulso animado (`↻ v…`) para que el usuario sepa que puede pulsarlo.

Esto cubre el caso en que la app **no se actualiza** aunque se hayan subido cambios al servidor (caché del Service Worker, pestaña abierta hace mucho tiempo, o el `visibilitychange` no disparó): el usuario tiene ahora un mecanismo manual y visible para forzarlo.

---

## Cambios

### UI-1: Badge de versión convertido en botón clickeable
**Archivo:** `index.html` + `styles.css`  
Antes: `<span class="ver">v<span id="app-version">—</span></span>` era un span plano sin interacción. Ahora tiene `id="btn-version"`, `title="Buscar actualizaciones de la app"`, `cursor:pointer`, estados `:hover` (fondo azul suave + borde primario) y `:active` (escala .95), coherentes con el resto de botones del header (`.icon-btn`). Respeta `user-select:none` y `-webkit-tap-highlight-color:transparent` para que se sienta como botón en móvil.

### UI-2: Indicador visual de actualización pendiente (pulso animado)
**Archivo:** `styles.css` (clase nueva `.ver.ver-update` + `@keyframes ver-pulse`)  
Cuando hay un Service Worker esperando (nueva versión descargada pero no aplicada), el badge recibe la clase `ver-update`: fondo azul suave, borde y texto primario, prefijo `↻ ` y un pulso suave (`box-shadow`) cada 1.4 s. Así el usuario ve de un vistazo que puede pulsar para aplicar la novedad. La clase se añade automáticamente desde `RN.pwa._notificarActualizacion` (que ya existía) y se quita al confirmar que está al día.

### FEAT-1: `RN.pwa.forzarActualizacion()` — búsqueda/aplicación manual de actualizaciones
**Archivo:** `js/pwa.js` (función nueva)  
Al pulsar el badge ejecuta el siguiente flujo:
1. Si **no** hay Service Worker registrado → avisa con toast.
2. Si ya hay un SW **esperando** (`reg.waiting`) → aplica `SKIP_WAITING` y recarga (con salvaguarda de recarga manual a los 3 s por si el `controllerchange` no dispara).
3. Si no hay nada esperando → llama `reg.update()` para buscar nuevas versiones en la red, y luego reevalúa:
   - Si apareció un `waiting` → lo aplica y recarga.
   - Si hay un `installing` → avisa "Descargando nueva versión… se aplicará al terminar".
   - Si sigue sin haber nada → quita el badge `ver-update` y muestra "✅ Tienes la última versión (5.13.12)".

Es la versión **manual** del mismo mecanismo automático que ya corría en `updatefound`/`visibilitychange`. Reutiliza el mensaje `SKIP_WAITING` que `sw.js` ya soportaba y el `controllerchange` → `reload` que ya estaba conectado en `pwa.init`.

### FEAT-2: Helper `RN.pwa._marcarPendiente(bool)` para el badge
**Archivo:** `js/pwa.js`  
Centraliza añadir/quitar la clase `ver-update` del badge. Lo usa `_notificarActualizacion` (al detectar update pendiente) y `forzarActualizacion` (al confirmar que está al día). Evita dispersar la manipulación del DOM del badge.

### BIND-1: Listener del botón de versión en `init.js`
**Archivo:** `js/init.js` (sección "13. Botones de header")  
Se añade `addEventListener('click')` sobre `#btn-version` → `RN.pwa.forzarActualizacion()`, siguiendo el mismo patrón que los demás botones del header (`btn-save`, `btn-undo`, `btn-theme`, `btn-install`, `btn-menu`).

---

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `js/ui/render.js` | **FIX crítico:** declarar `abiertas` en `RN.render.clientes` (captura de `.acc-card.open` antes del re-render). Resuelve `ReferenceError` que mataba todos los botones. |
| `index.html` | Span `.ver` con `id="btn-version"` y `title`. |
| `styles.css` | `.ver` ahora clickeable (cursor, hover, active); clase nueva `.ver.ver-update` + `@keyframes ver-pulse`. |
| `js/pwa.js` | Nuevo `forzarActualizacion()`, `_marcarPendiente()`; `_notificarActualizacion` ahora marca el badge. |
| `js/init.js` | Listener click en `#btn-version` (sección 13). |
| `js/version.js` | 5.13.11 → 5.13.12. |

---

## Notas técnicas

- **Sin cambios en `sw.js`**: el Service Worker ya soportaba `SKIP_WAITING` (message handler) y `skipWaiting()` en `install`. No fue necesario tocarlo.
- **Reutiliza la recarga automática existente**: el `controllerchange` → `window.location.reload()` gestionado en `pwa.init` es el que aplica la recarga final tras `skipWaiting`. `forzarActualizacion` solo dispara el mensaje; no duplica la lógica de recarga.
- **Salvaguarda de recarga**: si por alguna razón el `controllerchange` no se dispara tras `SKIP_WAITING` (p. ej. primer SW sin controlador previo), hay un `setTimeout(reload, 3000)` de respaldo controlado por `RN.pwa._recargaPendiente` para no recargar dos veces.
- **Offline / sin SW**: si el navegador no soporta SW o no hay registro, se avisa con un toast en vez de fallar silenciosamente.
- **Sin cambios de lógica de negocio**: no se tocó `RN.calc`, `RN.render`, cobros ni almacenamiento. Es puramente una mejora de UX/PWA.
