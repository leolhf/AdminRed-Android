/**
 * update.js — Verificación automática de actualizaciones de la app.
 *
 * La app (tanto la PWA web como el APK nativo) consulta la API pública de
 * GitHub Releases del repositorio Android para saber si existe una versión
 * más reciente publicada por GitHub Actions.
 *
 *   Repo Android: https://github.com/leolhf/AdminRed-Android
 *   API:          https://api.github.com/repos/leolhf/AdminRed-Android/releases/latest
 *
 * Comportamiento:
 *   - Solo comprueba si hay conexión a internet (navigator.onLine).
 *   - Se ejecuta al arrancar (con un pequeño retardo) y cuando el dispositivo
 *     recupera la conexión o la app vuelve a primer plano.
 *   - Si hay una versión nueva, lanza una NOTIFICACIÓN:
 *       · En el APK nativo: notificación del sistema (Capacitor LocalNotifications).
 *       · En el navegador: Web Notifications API.
 *   - La comprobación automática se puede DESACTIVAR desde Ajustes
 *     (config.autoCheckUpdates). El botón "Buscar ahora" siempre funciona.
 *   - Se limita la frecuencia (throttle) para no agotar el rate-limit de GitHub
 *     y solo se notifica UNA vez por cada versión nueva detectada.
 *
 * Sin dependencias duras: si el plugin nativo no está disponible, cae a la
 * Web Notifications API. Debe cargarse después de platform.js y antes de init.js.
 */
RN.update = RN.update || {};

// --- Configuración del repositorio de releases ---
RN.update.REPO = 'leolhf/AdminRed-Android';
RN.update.API = 'https://api.github.com/repos/leolhf/AdminRed-Android/releases/latest';
RN.update.URL_RELEASE = 'https://github.com/leolhf/AdminRed-Android/releases/latest';

// Claves de localStorage para el estado de la comprobación.
RN.update.KEY_ULTIMA = 'adminred:update-last-check';   // timestamp de la última comprobación
RN.update.KEY_NOTIFICADA = 'adminred:update-notified'; // última versión ya notificada

// Intervalo mínimo entre comprobaciones automáticas (6 horas).
RN.update.INTERVALO_MS = 6 * 60 * 60 * 1000;

// Estado en memoria.
RN.update._comprobando = false;
RN.update._ultimaVersion = null; // última versión remota conocida

/**
 * Normaliza una versión: quita la "v" inicial y espacios.
 * "v5.24.0" -> "5.24.0"
 */
RN.update._limpiar = function (v) {
  return String(v == null ? '' : v).trim().replace(/^v/i, '');
};

/**
 * Compara dos versiones semánticas simples (major.minor.patch).
 * Devuelve:
 *   -1 si a < b
 *    0 si a === b
 *    1 si a > b
 * Ignora sufijos no numéricos (p. ej. "5.24.0-beta" -> 5.24.0).
 */
RN.update._comparar = function (a, b) {
  var pa = RN.update._limpiar(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
  var pb = RN.update._limpiar(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var na = pa[i] || 0;
    var nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
};

/** ¿Hay conexión a internet? */
RN.update._hayConexion = function () {
  try { return navigator.onLine !== false; } catch (e) { return true; }
};

/** ¿Está activada la comprobación automática en Ajustes? (default: sí) */
RN.update._autoActivado = function () {
  try {
    var c = RN.state && RN.state.config;
    if (!c) return true;
    return c.autoCheckUpdates !== false;
  } catch (e) { return true; }
};

/** ¿Ha pasado suficiente tiempo desde la última comprobación automática? */
RN.update._throttleOk = function () {
  try {
    var ult = parseInt(localStorage.getItem(RN.update.KEY_ULTIMA) || '0', 10) || 0;
    return (Date.now() - ult) >= RN.update.INTERVALO_MS;
  } catch (e) { return true; }
};

RN.update._marcarComprobado = function () {
  try { localStorage.setItem(RN.update.KEY_ULTIMA, String(Date.now())); } catch (e) {}
};

/** ¿Ya se notificó esta versión? (para no repetir el aviso) */
RN.update._yaNotificada = function (version) {
  try {
    return localStorage.getItem(RN.update.KEY_NOTIFICADA) === RN.update._limpiar(version);
  } catch (e) { return false; }
};

RN.update._marcarNotificada = function (version) {
  try { localStorage.setItem(RN.update.KEY_NOTIFICADA, RN.update._limpiar(version)); } catch (e) {}
};

/**
 * Consulta la API de GitHub y devuelve la última versión publicada, o null.
 * Usa AbortController para no colgarse si no hay red.
 */
RN.update._consultarRemoto = async function () {
  var ctrl = null;
  var opts = {
    headers: { 'Accept': 'application/vnd.github+json' },
    cache: 'no-store'
  };
  try {
    if (typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 12000);
    }
    var res = await fetch(RN.update.API, opts);
    if (!res.ok) return null;
    var data = await res.json();
    var tag = data && (data.tag_name || data.name);
    if (!tag) return null;
    return {
      version: RN.update._limpiar(tag),
      nombre: data.name || tag,
      url: data.html_url || RN.update.URL_RELEASE,
      publicado: data.published_at || null,
      notas: data.body || ''
    };
  } catch (e) {
    // Sin conexión, timeout o error de red: silencioso.
    return null;
  }
};

/**
 * Lanza la notificación de "nueva versión disponible".
 * Intenta primero la notificación nativa (APK) y, si no, la web.
 */
RN.update._notificar = async function (info) {
  var titulo = '⬆️ Actualización disponible';
  var cuerpo = 'AdminRed v' + info.version + ' está disponible. Toca para descargarla.';

  // 1) Notificación nativa (Capacitor LocalNotifications) — dentro del APK.
  var ln = RN.platform && RN.platform.plugin ? RN.platform.plugin('LocalNotifications') : null;
  if (ln) {
    try {
      var perm = await ln.checkPermissions();
      if (!perm || perm.display !== 'granted') {
        perm = await ln.requestPermissions();
      }
      if (perm && perm.display === 'granted') {
        // Canal en Android 8+ (idempotente).
        try {
          await ln.createChannel({
            id: 'adminred-updates',
            name: 'Actualizaciones de AdminRed',
            description: 'Avisos de nuevas versiones de la app',
            importance: 4,
            visibility: 1
          });
        } catch (e) { /* canal ya existe o no soportado */ }
        await ln.schedule({
          notifications: [{
            id: 1001,
            title: titulo,
            body: cuerpo,
            channelId: 'adminred-updates',
            smallIcon: 'ic_stat_adminred',
            extra: { url: info.url, tipo: 'update' }
          }]
        });
        return true;
      }
    } catch (e) {
      console.warn('[update] notificación nativa falló:', e);
    }
  }

  // 2) Web Notifications API (navegador / PWA).
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      var n = new Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        tag: 'adminred-update'
      });
      n.onclick = function () {
        try { window.open(info.url, '_blank', 'noopener'); } catch (e) {}
        try { n.close(); } catch (e) {}
      };
      return true;
    }
  } catch (e) { /* silencioso */ }

  return false;
};

/**
 * Comprueba si hay actualización.
 * @param {object} opts
 *   - silencioso {boolean}  si true, no muestra toasts de resultado (uso automático)
 *   - forzar     {boolean}  ignora el throttle (uso manual)
 * @returns {Promise<{hay:boolean, version?:string, actual?:string}>}
 */
RN.update.comprobar = async function (opts) {
  opts = opts || {};
  var actual = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '0.0.0';

  if (RN.update._comprobando) return { hay: false, actual: actual };
  if (!RN.update._hayConexion()) {
    if (!opts.silencioso) RN.notifyUI.toast('Sin conexión a internet', 'info');
    return { hay: false, actual: actual };
  }
  if (!opts.forzar && !RN.update._throttleOk()) {
    return { hay: false, actual: actual };
  }

  RN.update._comprobando = true;
  try {
    var info = await RN.update._consultarRemoto();
    RN.update._marcarComprobado();

    if (!info) {
      if (!opts.silencioso) RN.notifyUI.toast('No se pudo consultar el servidor de versiones', 'info');
      return { hay: false, actual: actual };
    }

    RN.update._ultimaVersion = info.version;
    var cmp = RN.update._comparar(info.version, actual);

    if (cmp > 0) {
      // Hay una versión más nueva.
      if (!RN.update._yaNotificada(info.version)) {
        await RN.update._notificar(info);
        RN.update._marcarNotificada(info.version);
      }
      if (!opts.silencioso) {
        RN.notifyUI.toast('⬆️ Nueva versión disponible: v' + info.version, 'info', 6000);
      }
      return { hay: true, version: info.version, actual: actual, info: info };
    }

    // Estamos al día.
    if (!opts.silencioso) {
      RN.notifyUI.toast('✅ Tienes la última versión (v' + actual + ')', 'success');
    }
    return { hay: false, version: info.version, actual: actual };
  } finally {
    RN.update._comprobando = false;
  }
};

/**
 * Comprobación manual (botón "Buscar ahora"): ignora el throttle y da feedback.
 */
RN.update.buscarAhora = async function () {
  if (RN.update._comprobando) {
    RN.notifyUI.toast('Comprobando…', 'info', 1500);
    return;
  }
  RN.notifyUI.toast('🔍 Buscando actualizaciones…', 'info', 2500);
  var r = await RN.update.comprobar({ forzar: true, silencioso: false });
  if (r && r.hay) {
    // Ofrecer descarga directa.
    RN.uiComponents.confirm(
      '⬆️ Actualización disponible',
      'Hay una versión nueva de AdminRed (v' + r.version + '). ' +
      '¿Quieres abrir la página de descarga del APK?',
      function () {
        try { window.open(RN.update.URL_RELEASE, '_blank', 'noopener'); } catch (e) {}
      }
    );
  }
};

/**
 * Inicializa la comprobación automática:
 *  - Comprueba al arrancar (tras un pequeño retardo, sin bloquear la UI).
 *  - Reintenta cuando vuelve la conexión (evento 'online').
 *  - Reintenta cuando la app vuelve a primer plano (visibilitychange).
 *  - Escucha el toque sobre la notificación nativa para abrir la descarga.
 */
RN.update.init = function () {
  // Comprobación inicial diferida (no bloquea el arranque).
  setTimeout(function () {
    if (RN.update._autoActivado()) RN.update.comprobar({ silencioso: true });
  }, 4000);

  // Al recuperar la conexión.
  window.addEventListener('online', function () {
    if (RN.update._autoActivado()) RN.update.comprobar({ silencioso: true });
  });

  // Al volver la app a primer plano.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && RN.update._autoActivado()) {
      RN.update.comprobar({ silencioso: true });
    }
  });

  // Toque sobre la notificación nativa -> abrir la página de descarga.
  var ln = RN.platform && RN.platform.plugin ? RN.platform.plugin('LocalNotifications') : null;
  if (ln && ln.addListener) {
    try {
      ln.addListener('localNotificationActionPerformed', function (ev) {
        var extra = ev && ev.notification && ev.notification.extra;
        var url = (extra && extra.url) || RN.update.URL_RELEASE;
        try { window.open(url, '_blank', 'noopener'); } catch (e) {}
      });
    } catch (e) { /* no soportado */ }
  }
};
