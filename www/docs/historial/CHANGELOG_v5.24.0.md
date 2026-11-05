# AdminRed v5.24.0 — Verificación automática de actualizaciones

**Fecha:** 2026
**Tipo:** Nueva funcionalidad (Actualizaciones / Notificaciones)
**Esquema de datos:** sin cambios (sigue **10**)

---

## ✨ Qué cambia

La app ahora **avisa cuando existe una versión nueva** disponible, tanto en la
versión web (PWA) como dentro del **APK Android**.

### 1. Comprobación automática con conexión a internet
- Al **arrancar** la app, al **recuperar la conexión** y al **volver a primer
  plano**, la app consulta el repositorio de releases de GitHub para saber si
  hay una versión más reciente.
- Solo se comprueba si hay **conexión a internet** (`navigator.onLine`).
- Se limita la frecuencia (**máximo una comprobación cada 6 horas**) para no
  agotar el límite de peticiones de GitHub.

### 2. Notificación al detectar una versión nueva
- **En el APK nativo:** notificación del **sistema Android** (plugin
  `@capacitor/local-notifications`). Al tocarla, se abre la página de descarga.
- **En el navegador (PWA):** notificación web (Web Notifications API).
- Solo se notifica **una vez por cada versión nueva** (no repite el aviso).

### 3. Se puede desactivar desde Ajustes
- Nueva tarjeta **🔄 Actualizaciones** en Ajustes con un selector
  **"Comprobar actualizaciones automáticamente"** (Sí / No).
- Botón **"🔍 Buscar actualizaciones ahora"** para comprobar manualmente en
  cualquier momento (funciona aunque la comprobación automática esté desactivada).
- Muestra la **versión instalada** y la **fecha de la última comprobación**.

### 4. Badge de versión del encabezado
- En el APK, tocar el número de versión del encabezado ahora **busca
  actualizaciones** directamente en el repositorio de releases.
- En la web sigue funcionando como antes (actualización del Service Worker).

---

## 🔧 Detalles técnicos

- Nuevo módulo `js/update.js` (namespace `RN.update`):
  - `RN.update.comprobar(opts)` — consulta la API de GitHub Releases y compara
    versiones (semver simple).
  - `RN.update.buscarAhora()` — comprobación manual con feedback y oferta de
    descarga.
  - `RN.update.init()` — engancha la comprobación al arranque y a los eventos
    `online` / `visibilitychange`.
  - Throttle de 6 h y registro de la última versión notificada en
    `localStorage` (`adminred:update-last-check`, `adminred:update-notified`).
- Nueva opción de configuración `config.autoCheckUpdates` (default `true`),
  con migración en `js/core/config.js` y persistencia en el estado.
- `js/init.js`: se inicializa `RN.update.init()` y se muestra el estado en
  Ajustes.
- `index.html`: nueva tarjeta de Ajustes y carga de `js/update.js`.
- `sw.js`: se añaden `js/apk.js` y `js/update.js` a los recursos cacheados.
- Android:
  - Dependencia `@capacitor/local-notifications@6.1.3`.
  - Permiso `POST_NOTIFICATIONS` (Android 13+), `SCHEDULE_EXACT_ALARM` y
    `WAKE_LOCK` en `AndroidManifest.xml`.
  - Icono de notificación `ic_stat_adminred` (vector blanco).
  - Canal de notificaciones `adminred-updates`.

---

## 📦 Cómo actualizar

- **Web (PWA):** se actualiza sola al recargar (Service Worker).
- **APK Android:** cuando aparezca la notificación de nueva versión, tócala
  para abrir la descarga, o entra en Ajustes → 🔄 Actualizaciones →
  "Buscar actualizaciones ahora".
