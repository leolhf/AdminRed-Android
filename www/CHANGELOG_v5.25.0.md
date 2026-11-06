# AdminRed v5.25.0 — Notificaciones nativas en el APK

**Fecha:** 2025

## Resumen

Hasta ahora, el botón **"🔔 Activar notificaciones"** de *Ajustes → Seguridad*
usaba la **Web Notifications API** del navegador. Esa API **no funciona dentro
del WebView de Android**, por lo que en el APK el botón no hacía nada útil y los
recordatorios de pago nunca aparecían como notificaciones del sistema.

En esta versión se integra el plugin nativo **`@capacitor/local-notifications`**,
de modo que en el APK las notificaciones son **reales** (aparecen en la barra de
estado, en la pantalla de bloqueo, con sonido y vibración), mientras que en la
web (PWA) se sigue usando la Web Notifications API como antes.

## Novedades

### 1. Notificaciones nativas reales en el APK
- El botón **"Activar notificaciones"** ahora pide el **permiso real de Android**
  (`POST_NOTIFICATIONS` en Android 13+).
- Se crean **canales de notificación** nativos:
  - `adminred-recordatorios` — importancia **MÁXIMA (5)**, visible en pantalla de
    bloqueo, con vibración y luz.
  - `adminred-avisos` — importancia normal (3) para confirmaciones.
- Al activarlas se muestra una notificación de confirmación.

### 2. Recordatorios de pago cada 4 horas
- Los recordatorios de clientes que deben pagar hoy se revisan **cada 4 horas**
  (antes: cada 1 hora).
- Se lanza **una notificación por cada cliente pendiente** con el nombre y el
  importe a cobrar.

### 3. Prioridad permanente
- Las notificaciones de recordatorio son **`ongoing`**: no se pueden deslizar
  para descartar mientras haya clientes pendientes de pago.
- El canal de recordatorios tiene **importancia máxima**, por lo que aparece como
  aviso emergente (heads-up) con sonido y vibración.

### 4. Avisos en segundo plano (app cerrada)
- Además de la revisión en primer plano, se **programan 6 avisos diarios**
  (00:00, 04:00, 08:00, 12:00, 16:00 y 20:00) que se repiten a diario y usan
  `allowWhileIdle`, de modo que siguen llegando **aunque la app esté cerrada**.
- Al tocar un recordatorio se abre automáticamente la pestaña **Cobros**.

### 5. Avisos de cobro y snapshot
- "Cobro registrado" y "Snapshot generado" ahora también usan notificación
  nativa en el APK.

## Compatibilidad

- **Web (PWA):** sin cambios funcionales; sigue usando la Web Notifications API.
- **APK:** requiere conceder el permiso de notificaciones la primera vez.

## Detalles técnicos

- Nuevo plugin: `@capacitor/local-notifications@^6.1.3`.
- Permisos añadidos al `AndroidManifest.xml`: `POST_NOTIFICATIONS`,
  `SCHEDULE_EXACT_ALARM`, `WAKE_LOCK`.
- Icono de notificación: `ic_stat_adminred` (vector blanco).
- Constante `RN.notify.INTERVALO_MS = 4 * 60 * 60 * 1000`.
- `RN.notify.init()` crea los canales y registra el listener de acciones.
