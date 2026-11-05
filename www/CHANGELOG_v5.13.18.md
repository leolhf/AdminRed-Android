# CHANGELOG — v5.13.18

## Sección afectada
**Clientes — Modal de cliente** y **sistema de modales global** (`js/ui/ui-components.js`). La funcionalidad de importar contactos guardados del teléfono (Contact Picker API) dentro del modal de cliente.

## Resumen
Esta versión corrige un **bug crítico**: al usar la opción "Contactos" para importar un contacto guardado del teléfono dentro del modal de nuevo/editar cliente, el modal del cliente **se cerraba** al agregar el nombre o número de teléfono, perdiéndose todo el formulario. El bug afectaba a todos los casos donde el contacto tenía un nombre (si el campo ya tenía valor) o múltiples números de teléfono.

---

## BUG-CRÍTICO — Importar contactos del teléfono cierra el modal del cliente

### Síntoma reportado
Al configurar un cliente y usar el botón "Contactos" para importar un contacto guardado del teléfono, el modal del cliente **se cierra** al agregar el nombre o número de teléfono. La configuración realizada desaparece y el usuario tiene que empezar de nuevo.

### Causa raíz
El sistema de modales de la app usaba **un solo modal global** (`modal-overlay` / `modal-box`). No existía soporte para modales anidados (un modal sobre otro).

Cuando `importarDeContactos()` llamaba a `RN.uiComponents.confirm()` (para preguntar si reemplazar el nombre) o `RN.uiComponents.prompt()` (para elegir entre varios números), estas funciones llamaban a `RN.uiComponents.modal(html)`, que **sobrescribía** `modal-box.innerHTML` con el diálogo de confirmación/prompt, **destruyendo** el formulario del cliente.

Peor aún: al cerrar el confirm/prompt, `cerrarModal()` **ocultaba el overlay entero** (`classList.remove('open')`), cerrando TODO, incluyendo el modal del cliente que ya no existía porque su HTML fue sobrescrito.

Había además un **segundo bug** encadenado: después de llamar `confirm()` o `prompt()`, el código continuaba ejecutándose secuencialmente e intentaba `document.getElementById('cl-tel')` y `document.getElementById('cl-dir')` — pero estos elementos **ya no existían** en el DOM porque el modal-box ahora mostraba el diálogo de confirm/prompt, no el formulario del cliente. Las búsquedas devolvían `null` y los campos de teléfono y dirección no se llenaban.

### Solución — 3 cambios en 2 archivos

#### 1. `js/ui/ui-components.js` — Sistema de pila de modales (modal stack)
Se implementó un sistema de pila (`_modalStack`) que permite modales anidados:

- **`modal()`**: Si ya hay un modal abierto, guarda su contenido HTML y `className` en la pila antes de mostrar el nuevo modal.
- **`cerrarModal()`**: Si la pila no está vacía, **restaura** el modal anterior (pop de la pila) en lugar de ocultar el overlay. Solo oculta el overlay cuando la pila está vacía (no hay modales padre).

Esto permite que `confirm()` y `prompt()` abran un diálogo **encima** del modal del cliente, y al cerrarlos, el modal del cliente se **restaura** automáticamente. Este fix beneficia a **toda la app**, no solo a los contactos: cualquier `confirm()`/`prompt()` llamado desde dentro de un modal (descuentos, exportación, inventario, etc.) ahora preserva el modal padre.

#### 2. `js/clientes/modal-cliente.js` — Reestructuración de `importarDeContactos()`
Se reestructuró el orden de ejecución de la función para resolver el segundo bug:

- **Paso 1**: Leer TODAS las referencias a elementos del DOM (`cl-nombre`, `cl-tel`, `cl-dir`) y sus valores actuales **antes** de llamar cualquier `confirm()`/`prompt()`.
- **Paso 2**: Llenar TODOS los campos directos (sin interacción) sincrónicamente: nombre vacío, teléfono único, dirección.
- **Paso 3**: Ejecutar `confirm()`/`prompt()` al **final**, después de todos los fills directos. Los callbacks re-query los elementos por ID (`document.getElementById('cl-nombre')`) en lugar de usar referencias capturadas, porque el modal stack restaura el `innerHTML` del modal padre al cerrar el diálogo, creando nuevos elementos DOM.

#### 3. `js/clientes/modal-cliente.js` — Encadenamiento de diálogos
Si tanto el nombre requiere confirmación Y el teléfono requiere selección (múltiples números), los diálogos se **encadenan**: el prompt de teléfono se abre después de cerrar el confirm de nombre (en el callback `onConfirm` y `onCancel`), no simultáneamente encima de él.

### Impacto del fix
- ✅ El modal del cliente **ya no se cierra** al importar contactos del teléfono.
- ✅ El nombre, teléfono y dirección se llenan correctamente desde el contacto.
- ✅ Si el nombre ya tenía valor, se pregunta si reemplazar (el modal del cliente se preserva).
- ✅ Si el contacto tiene varios números, se ofrece selección (el modal del cliente se preserva).
- ✅ **Beneficio global**: cualquier `confirm()`/`prompt()` llamado desde dentro de un modal ahora preserva el modal padre (descuentos, exportación, inventario, inversión, etc.).

### Verificación
- Tests automáticos: **73/74 pasan** (1 fallo pre-existente no relacionado).
- Sintaxis JS validada con `node -c` para ambos archivos.

### Archivos modificados
- `js/version.js` (versión → 5.13.18)
- `js/ui/ui-components.js` (sistema de pila de modales)
- `js/clientes/modal-cliente.js` (reestructuración de `importarDeContactos` + encadenamiento)
