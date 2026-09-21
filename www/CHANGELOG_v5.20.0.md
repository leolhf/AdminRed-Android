# AdminRed v5.20.0 — Fix crítico: importar contacto del teléfono dejaba nombre y dirección en blanco

**Fecha:** 2026
**Tipo:** Corrección de bug crítico (Clientes / Importar contactos)
**Esquema de datos:** sin cambios (sigue **10**)

---

## 🐞 El problema

Al agregar un cliente y usar el botón **📍 Contactos** para importar un contacto guardado
en el teléfono, **solo se rellenaba el número de teléfono**. Los campos **Nombre** y
**Dirección** quedaban **en blanco**, aunque el contacto sí tuviera esos datos.

Esto ocurría **siempre** que, durante la importación, se abría un diálogo intermedio:

- el contacto tenía **varios números de teléfono** (se abre el prompt "Varios números"), o
- el campo **Nombre ya tenía texto** (se abre el confirm "¿Reemplazar nombre?").

En esos casos, el nombre y la dirección desaparecían y solo sobrevivía el teléfono.

---

## 🔎 Causa raíz

El sistema de **pila de modales** (`js/ui/ui-components.js`, introducido en v5.13.18 para
permitir modales anidados) guarda el contenido del modal padre así:

```js
RN.uiComponents._modalStack.push({ html: box.innerHTML, className: box.className });
```

y al cerrar el diálogo anidado lo restaura con `box.innerHTML = prev.html`.

El problema: **`innerHTML` no conserva los valores vivos de los campos**. Serializa el
**atributo** `value` (el valor por defecto con el que se creó el input), **no** la
propiedad `.value` que JavaScript modifica en tiempo de ejecución.

Secuencia del bug al importar un contacto con varios teléfonos:

1. `importarDeContactos()` escribe el **nombre** y la **dirección** con `input.value = ...`.
2. Como hay varios teléfonos, se abre el **prompt** anidado → `modal()` apila el
   formulario guardando su `innerHTML` (que **no** incluye el nombre ni la dirección
   recién escritos).
3. El usuario elige un número → `cerrarModal()` **restaura** el formulario desde ese
   `innerHTML` → **nombre y dirección vuelven a estar vacíos**.
4. El callback del prompt escribe el **teléfono** (después de restaurar) → por eso el
   teléfono sí aparecía.

Resultado: **solo el teléfono** quedaba relleno. Exactamente el síntoma reportado.

---

## ✅ La solución

### 1. Fix global en `js/ui/ui-components.js` (raíz del problema)

Se añadieron dos helpers y se integraron en la pila de modales:

- **`_capturarValores(root)`**: recorre todos los `input`, `select` y `textarea` con `id`
  dentro del modal y guarda su **valor vivo** (`value`, o `checked` para checkbox/radio).
- **`_restaurarValores(root, vals)`**: al restaurar un modal apilado, re-aplica esos
  valores sobre los campos ya presentes en el DOM (por `id`).

Ahora, al apilar un modal se guarda `{ html, className, valores }`, y al restaurar se
re-aplican los valores. Esto **corrige el bug para toda la app**, no solo para los
contactos: cualquier `confirm()`/`prompt()` abierto sobre un modal con campos rellenos
por JS ya no pierde esos datos.

### 2. Robustez en `js/clientes/modal-cliente.js`

Se refactorizó `importarDeContactos()` con helpers **idempotentes** que re-consultan el
DOM por `id` y re-aplican los datos del contacto:

- `setNombre(forzar)`, `setDireccion()`, `setTel(valor)`.
- Los callbacks del prompt de teléfono y del confirm de nombre **re-aplican** nombre y
  dirección después de restaurar el modal, como red de seguridad adicional.
- **Normalización tolerante a formatos**: el nombre puede venir como array (`['Leo']`) o
  como string (`'Leo'`); el teléfono como array o string; la dirección como array de
  objetos. Ahora se normalizan antes de usarse.
- **Fallback de propiedades**: si `getProperties()` falla o devuelve vacío, se piden
  `name`, `tel` y `address` por defecto (el picker ignora las que no soporte).
- Avisos informativos si el contacto no tiene nombre o no tiene teléfono.

Así, aunque cambie el orden de los diálogos o se encadenen (confirm → prompt), los tres
campos (nombre, teléfono y dirección) quedan correctamente rellenos.

---

## 🧪 Verificación

- **Reproducción del bug** (jsdom): se confirmó que, con el código anterior, tras abrir el
  prompt anidado el nombre y la dirección quedaban en `""` y solo el teléfono sobrevivía.
- **Test del fix** (jsdom, cargando el `ui-components.js` real): nombre, dirección,
  teléfono, checkbox y select se conservan tras abrir/cerrar un modal anidado.
- **Test end-to-end** (jsdom, cargando `ui-components.js` + `modal-cliente.js` reales con
  la Contact Picker API simulada): **15/15 casos PASS**, incluyendo:
  - contacto con nombre + dirección + **un** teléfono (sin diálogos),
  - contacto con nombre + dirección + **varios** teléfonos (prompt),
  - nombre ya escrito → **confirm + prompt encadenados**,
  - contacto **sin** dirección.
- **Test en navegador real** (Chromium, con la Contact Picker API simulada): los 4 casos
  (nombre array/string, 1 o varios teléfonos, nombre pre-llenado, sin dirección) rellenan
  correctamente **nombre, teléfono y dirección**.
- `node --check` OK en los archivos modificados.

---

## 📦 Archivos modificados

- `js/ui/ui-components.js` — captura/restauración de valores vivos en la pila de modales.
- `js/clientes/modal-cliente.js` — `importarDeContactos()` reforzado (helpers idempotentes).
- `js/version.js` — `APP_VERSION` → `5.20.0`.
- `js/DEPENDENCIAS.md` — nota v5.20.0.
- `CHANGELOG_v5.20.0.md` — este documento.

---

## 📝 Notas

- **Sin cambios de esquema** (sigue 10): no hay migración de datos.
- El fix es **retrocompatible** y beneficia a cualquier modal con campos rellenos por JS.
