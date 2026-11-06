# AdminRed v5.21.0 — Versión nativa Android (APK con Capacitor)

**Fecha:** 2026-09-20
**Tipo:** Nueva distribución (APK nativo) + adaptaciones de plataforma.

## Resumen

Se añade una **distribución nativa Android (APK)** construida con **Capacitor 6**,
conservando ~95 % del código vanilla original. La misma base de código sigue
funcionando como **PWA en el navegador** sin cambios de comportamiento.

La app ahora detecta en qué plataforma corre y adapta automáticamente el
almacenamiento y la importación de contactos.

## Qué cambia

### 1. Detección de plataforma (`js/core/platform.js` — NUEVO)
- `RN.platform.esNativo()` — true dentro del APK (Capacitor), false en el navegador.
- `RN.platform.plugin(nombre)` — acceso a plugins nativos.
- `RN.platform.tieneFilesystem()` / `tieneContactos()` / `tienePluginContactos()`.
- `RN.platform.etiqueta()` — texto legible para diagnóstico.

### 2. Almacenamiento nativo (`js/storage/storage-native.js` — NUEVO)
- Usa el plugin **@capacitor/filesystem** para guardar en la carpeta privada de
  la app (`Directory.Data`), **sin pickers ni permisos manuales**.
- El archivo `adminred-datos.json` se crea y gestiona automáticamente.
- **Conserva el cifrado AES-GCM ligado al PIN** (idéntico a la versión web).
- Mismo contrato que `RN.storageFile`, por lo que el resto de la app no cambia.

### 3. Enrutador de almacenamiento (`js/storage/storage-router.js` — NUEVO)
- En el APK, sustituye los métodos de `RN.storageFile` por los de
  `RN.storageNative`. En el navegador no hace nada (sigue usando File System
  Access API).

### 4. Importación de contactos nativa (`js/clientes/modal-cliente.js`)
- En el APK usa el plugin **@capacitor-community/contacts** (`pickContact`).
- En el navegador sigue usando la **Contact Picker API**.
- Ambos caminos normalizan nombre, teléfonos y dirección y rellenan los campos
  del modal (incluida la corrección v5.20.0 de la pila de modales).

### 5. Exportación de respaldos/CSV en nativo (`js/storage/export.js`)
- En el APK, los archivos se escriben en la carpeta pública **Documentos** del
  dispositivo (visibles desde el gestor de archivos), ya que la descarga por
  `<a download>` no funciona en el WebView.

### 6. PWA (`js/pwa.js`)
- En el APK **no** se registra Service Worker (los assets ya están empaquetados).
- En el navegador, comportamiento PWA normal.

### 7. UI (`js/init.js`, `index.html`)
- En el APK se oculta el botón "Instalar app" y se ajusta el texto de la
  sección "Archivo de datos" para reflejar la gestión automática.

## Configuración Android

- **Paquete:** `com.rednet.adminred`
- **Nombre:** AdminRed
- **versionCode:** 5210 · **versionName:** 5.21.0
- **minSdk:** 22 (Android 5.1) · **targetSdk/compileSdk:** 34 (Android 14)
- **Permisos:** INTERNET, READ_CONTACTS, WRITE_CONTACTS
- **Iconos:** adaptativos (fondo #0F172A) generados desde el icono de la app.
- **Splash:** fondo oscuro #0F172A con el icono centrado, por densidad.

## Verificación

- `node --check` OK en todos los archivos JS nuevos/modificados.
- PWA en navegador (Chromium): carga v5.21.0 sin errores JS; detección de
  plataforma = "Navegador (PWA)"; modal de cliente operativo.
- Rutas nativas probadas con puente Capacitor simulado:
  - Guardado/lectura en Filesystem nativo (roundtrip de 3 clientes) ✅
  - Importación de contacto nativo → nombre + teléfono + dirección ✅
  - Exportación de respaldo a Documentos ✅
- APK release firmado (v1 + v2), 4.4 MB, 110 assets web empaquetados.

## Notas de compatibilidad

- La versión web (PWA) sigue funcionando igual que v5.20.0.
- Los datos de la PWA y del APK son independientes (almacenamientos distintos).
  Para migrar, exporta un respaldo JSON desde la PWA e impórtalo en el APK.
