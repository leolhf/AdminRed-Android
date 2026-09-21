# AdminRed v5.23.0 — PIN solo numérico con confirmación automática

**Fecha:** 2026
**Tipo:** Mejora de usabilidad (Seguridad / Pantalla de bloqueo)
**Esquema de datos:** sin cambios (sigue **10**)

---

## ✨ Qué cambia

La pantalla de bloqueo por PIN ahora es más rápida y segura de usar:

### 1. El campo solo acepta números
- Al escribir, se **filtran automáticamente** letras, espacios y símbolos.
- El teclado del teléfono abre en modo **numérico** (`inputmode="numeric"`).
- Máximo 8 dígitos.

### 2. Confirmación automática (sin botón)
- **Se eliminó el botón "Desbloquear".**
- Al completar la **longitud correcta** del PIN, este se **verifica solo**.
- Si el PIN es **correcto** → se desbloquea la app.
- Si el PIN es **incorrecto** → el campo se **borra** (con una pequeña animación
  de sacudida) para poder intentarlo de nuevo.

### 3. Longitud recordada
- La primera vez que se configura o se introduce un PIN, se guarda su longitud
  (`adminred:pin-len`) para poder auto-confirmar en los siguientes accesos.
- Para PIN antiguos (sin longitud guardada), se verifica tras una breve pausa
  al escribir 4 o más dígitos.

### 4. Modo "Configurar PIN"
- Al configurar un PIN nuevo (4-8 dígitos), se **guarda automáticamente** al
  dejar de escribir (mínimo 4 dígitos), sin botón de confirmación.

---

## 🔧 Detalles técnicos

- `js/pin.js` reescrito: nueva función `RN.pin._onInput()` que filtra a dígitos
  y decide cuándo verificar; `RN.pin._limpiarConError()` para el borrado + animación.
- `index.html`: se quitó el botón `#pin-unlock`; el input usa
  `inputmode="numeric" pattern="[0-9]*" autocomplete="off"`.
- `styles.css`: nueva animación `pin-shake` para el PIN incorrecto.
- `js/core/keys.js`: nueva clave `PIN_LEN` (`adminred:pin-len`).
- Se mantiene la compatibilidad con PIN antiguos (hash legacy SHA-256) y su
  migración automática a PBKDF2+sal.

---

## ✅ Compatibilidad

- No cambia el formato del archivo de datos ni el cifrado.
- Los PIN existentes siguen funcionando igual.
- Funciona tanto en la **web (PWA)** como en el **APK Android**.
