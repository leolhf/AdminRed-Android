/**
 * update.js — Verificación automática de actualizaciones de la app.
 *
 * La app (PWA web y APK nativo) consulta las releases publicadas por GitHub
 * Actions para saber si existe una versión más reciente.
 *
 *   Repo Android: https://github.com/leolhf/AdminRed-Android
 *
 * v5.31.0 — DETECCIÓN DE ACTUALIZACIONES REPARADA. Se corrigieron cinco fallos
 * que hacían que el APK "no detectara" las versiones nuevas:
 *
 *   1. UN FALLO SE GUARDABA COMO ÉXITO. `_marcarComprobado()` se llamaba ANTES
 *      de validar la respuesta, así que una sola consulta fallida (muy frecuente
 *      en el APK al arrancar en frío, cuando la red todavía no está lista)
 *      silenciaba las comprobaciones automáticas durante 6 horas. Ahora se
 *      separa "última comprobación CORRECTA" de "último intento", y tras un
 *      fallo se reintenta con espera corta (5 → 10 → 20 → 40 → 60 min).
 *   2. UNA SOLA FUENTE. Dependía únicamente de la API de GitHub
 *      (`releases/latest`), limitada a 60 peticiones/hora por IP y que devuelve
 *      404 si la última release es borrador o preliminar. Ahora hay DOS fuentes:
 *      la API (que solo publica una versión cuando el APK ya existe) y
 *      `version.json` servido por raw.githubusercontent (sin límite de peticiones);
 *      si una falla, se usa la otra y se recuerda la que funcionó.
 *   3. CERO FEEDBACK VISIBLE. La comprobación automática es silenciosa y la
 *      notificación dependía del permiso POST_NOTIFICATIONS; si no estaba
 *      concedido, `_notificar()` devolvía false y el usuario no veía NADA. Ahora
 *      se muestra una BANDA visible en la app, además de la notificación del sistema.
 *   4. SIN DIAGNÓSTICO. Ahora hay `RN.update.diagnostico()` (Ajustes →
 *      "🧩 Diagnóstico de actualizaciones"), que consulta las dos fuentes,
 *      muestra el código HTTP de cada una, la versión instalada, la publicada,
 *      el último error y cuándo fue la última comprobación.
 *   5. DESCARGAS QUE ABRÍAN LA PÁGINA, NO EL APK. Ahora se usa la URL directa del
 *      archivo `.apk` del release cuando la API la informa.
 *
 * Comportamiento:
 *   - Comprueba al arrancar (con retardo), al recuperar la conexión, al volver a
 *     primer plano y al reanudar la app (plugin App de Capacitor, si está).
 *   - `cache: 'no-store'` + parámetro anti-caché para que el WebView no sirva
 *     respuestas viejas.
 *   - Se avisa UNA vez por versión nueva detectada.
 *   - Todo se puede consultar en Ajustes; "Buscar ahora" ignora cualquier límite.
 *
 * Sin dependencias duras: si el plugin nativo no existe, cae a la Web
 * Notifications API y a la banda visible. Debe cargarse después de platform.js
 * y antes de init.js. Es compatible con Node (tests) gracias a los guards de DOM.
 */
RN.update = RN.update || {};

// --- Configuración del repositorio de releases ---
RN.update.REPO = 'leolhf/AdminRed-Android';
RN.update.API_LATEST = 'https://api.github.com/repos/leolhf/AdminRed-Android/releases/latest';
RN.update.URL_RAW_VERSION = 'https://raw.githubusercontent.com/leolhf/AdminRed-Android/main/version.json';
RN.update.URL_RELEASES = 'https://github.com/leolhf/AdminRed-Android/releases';
RN.update.URL_RELEASE = 'https://github.com/leolhf/AdminRed-Android/releases/latest';

// Claves de localStorage.
RN.update.KEY_ULTIMA = 'adminred:update-last-check';        // última comprobación CORRECTA
RN.update.KEY_INTENTO = 'adminred:update-last-attempt';     // último intento (aunque fallara)
RN.update.KEY_FALLOS = 'adminred:update-fails';             // fallos consecutivos
RN.update.KEY_NOTIFICADA = 'adminred:update-notified';      // última versión ya avisada
RN.update.KEY_FUENTE = 'adminred:update-source';            // fuente que funcionó
RN.update.KEY_ERROR = 'adminred:update-last-error';         // último error (texto)
RN.update.KEY_VERSION_REMOTA = 'adminred:update-latest-version';
RN.update.KEY_BANDA_CERRADA = 'adminred:update-banner-dismissed';

// Tiempos.
RN.update.INTERVALO_MS = 6 * 60 * 60 * 1000;   // entre comprobaciones CORRECTAS (6 h)
RN.update.REINTENTO_BASE_MS = 5 * 60 * 1000;   // primer reintento tras un fallo (5 min)
RN.update.REINTENTO_MAX_MS = 60 * 60 * 1000;   // techo del reintento (60 min)
RN.update.TIMEOUT_MS = 12000;                  // corte de cada petición

// Estado en memoria.
RN.update._comprobando = false;
RN.update._ultimaVersion = null;

/** Acceso seguro a localStorage (en tests/Node puede no existir). */
RN.update._ls = {
  get: function (k) {
    try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage.getItem(k) : null; } catch (e) { return null; }
  },
  set: function (k, v) {
    try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(k, String(v)); } catch (e) {}
  },
  del: function (k) {
    try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem(k); } catch (e) {}
  }
};

/**
 * Normaliza una versión a "X.Y.Z".
 *   "v5.30.0"            -> "5.30.0"
 *   "AdminRed v5.30.0"   -> "5.30.0"
 *   "5.30"               -> "5.30"
 */
RN.update._limpiar = function (v) {
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/(\d+(?:\.\d+)+)/);   // primera secuencia numérica con puntos
  if (m) return m[1];
  return s.replace(/^v/i, '').trim();
};

/**
 * Compara dos versiones de forma NUMÉRICA por componentes (major.minor.patch).
 * Importante: la comparación no puede ser de texto, porque "5.9" > "5.10"
 * en orden alfabético, mientras que numéricamente 5.9 < 5.10.
 * Devuelve -1 si a < b, 0 si son iguales, 1 si a > b.
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
  try {
    if (typeof navigator === 'undefined' || !navigator) return true;
    return navigator.onLine !== false;
  } catch (e) { return true; }
};

/** ¿Está activada la comprobación automática en Ajustes? (default: sí) */
RN.update._autoActivado = function () {
  try {
    var c = RN.state && RN.state.config;
    if (!c) return true;
    return c.autoCheckUpdates !== false;
  } catch (e) { return true; }
};

/** Versión que corre ahora mismo (la que compara). */
RN.update._versionInstalada = function () {
  try { return (typeof APP_VERSION !== 'undefined') ? RN.update._limpiar(APP_VERSION) : '0.0.0'; } catch (e) { return '0.0.0'; }
};

/** Fallos consecutivos registrados. */
RN.update._fallos = function () {
  return parseInt(RN.update._ls.get(RN.update.KEY_FALLOS) || '0', 10) || 0;
};

/**
 * v5.31.0 — ¿Se puede comprobar ahora?
 *  - Si la última comprobación fue CORRECTA, espera INTERVALO_MS (6 h).
 *  - Si hubo fallos, espera una espera corta creciente (5/10/20/40/60 min),
 *    en lugar de bloquear 6 horas por un fallo puntual.
 * IMPORTANTE: el throttle se basa en KEY_ULTIMA (correcta) y KEY_INTENTO (intento),
 * nunca en marcar un fallo como si fuese una comprobación válida.
 */
RN.update._puedeComprobar = function () {
  return RN.update.proximoIntentoMs() === 0;
};

/** v5.31.0 — Milisegundos que faltan para la próxima comprobación automática (0 = ahora). */
RN.update.proximoIntentoMs = function () {
  var ahora = Date.now();
  var ok = parseInt(RN.update._ls.get(RN.update.KEY_ULTIMA) || '0', 10) || 0;
  var fallos = RN.update._fallos();
  var intento = parseInt(RN.update._ls.get(RN.update.KEY_INTENTO) || '0', 10) || 0;

  var espera = 0;
  if (ok && (ahora - ok) < RN.update.INTERVALO_MS) {
    espera = RN.update.INTERVALO_MS - (ahora - ok);
  }
  if (fallos > 0) {
    var backoff = Math.min(RN.update.REINTENTO_BASE_MS * Math.pow(2, fallos - 1), RN.update.REINTENTO_MAX_MS);
    var resta = backoff - (ahora - intento);
    if (resta > espera) espera = resta;
  }
  return Math.max(0, espera);
};

/** Marca el INTENTO (se llama siempre, falle o no). */
RN.update._marcarIntento = function () {
  RN.update._ls.set(RN.update.KEY_INTENTO, Date.now());
};

/** Registra un fallo con espera corta para el reintento. */
RN.update._registrarFallo = function (error) {
  RN.update._ls.set(RN.update.KEY_FALLOS, RN.update._fallos() + 1);
  RN.update._ls.set(RN.update.KEY_ERROR, String(error || 'Error desconocido'));
  RN.update._marcarIntento();
};

/** Registra una comprobación CORRECTA: solo aquí se arma el intervalo de 6 h. */
RN.update._registrarExito = function (info) {
  RN.update._ls.set(RN.update.KEY_ULTIMA, Date.now());
  RN.update._ls.set(RN.update.KEY_FALLOS, 0);
  RN.update._ls.set(RN.update.KEY_INTENTO, Date.now());
  if (info && info.version) RN.update._ls.set(RN.update.KEY_VERSION_REMOTA, info.version);
  if (info && info.fuente) RN.update._ls.set(RN.update.KEY_FUENTE, info.fuente);
  RN.update._ls.del(RN.update.KEY_ERROR);
};

/** ¿Ya se avisó de esta versión? */
RN.update._yaNotificada = function (version) {
  return RN.update._ls.get(RN.update.KEY_NOTIFICADA) === RN.update._limpiar(version);
};

RN.update._marcarNotificada = function (version) {
  RN.update._ls.set(RN.update.KEY_NOTIFICADA, RN.update._limpiar(version));
};

/**
 * Petición JSON robusta: timeout propio, sin caché y sin cabeceras personalizadas
 * (así la petición es "simple" para CORS y nunca dispara un preflight).
 * Devuelve {ok, status, data, error}.
 */
RN.update._fetchJSON = async function (url) {
  var ctrl = null, timer = null;
  var opts = { cache: 'no-store' };
  try {
    if (typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, RN.update.TIMEOUT_MS);
    }
    var res = await fetch(url, opts);
    if (!res || !res.ok) {
      var st = res ? res.status : 0;
      return { ok: false, status: st, error: 'HTTP ' + st };
    }
    var txt = await res.text();
    var data;
    try { data = JSON.parse(txt); } catch (e) { return { ok: false, status: res.status, error: 'Respuesta no válida (no es JSON)' }; }
    return { ok: true, status: res.status, data: data };
  } catch (e) {
    var msg = (e && e.name === 'AbortError') ? 'Tiempo de espera agotado' : ('Sin respuesta: ' + ((e && e.message) || e));
    return { ok: false, status: 0, error: msg };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * FUENTE 1 — API de GitHub (releases/latest).
 * Ventaja: solo publica una versión cuando el APK ya está subido, así que el
 * enlace de descarga siempre existe. Inconveniente: 60 peticiones/hora por IP.
 */
RN.update._consultarFuenteApi = async function () {
  var r = await RN.update._fetchJSON(RN.update.API_LATEST + '?t=' + Date.now());
  if (!r.ok) return { ok: false, error: 'API GitHub: ' + r.error, status: r.status };
  var d = r.data || {};
  var tag = d.tag_name || d.name;
  if (!tag) return { ok: false, error: 'API GitHub: la respuesta no trae versión', status: r.status };
  var apk = null;
  (d.assets || []).forEach(function (a) {
    if (!apk && a && a.name && /\.apk$/i.test(a.name)) apk = a.browser_download_url || null;
  });
  return {
    ok: true,
    version: RN.update._limpiar(tag),
    nombre: d.name || tag,
    url: d.html_url || RN.update.URL_RELEASE,
    apkUrl: apk,
    publicado: d.published_at || null,
    notas: d.body || '',
    fuente: 'api (GitHub Releases)'
  };
};

/**
 * FUENTE 2 — version.json en raw.githubusercontent (sin límite de peticiones).
 * La genera `tools/sync-version.py` en cada publicación.
 */
RN.update._consultarFuenteRaw = async function () {
  var r = await RN.update._fetchJSON(RN.update.URL_RAW_VERSION + '?t=' + Date.now());
  if (!r.ok) return { ok: false, error: 'version.json: ' + r.error, status: r.status };
  var d = r.data || {};
  if (!d.version) return { ok: false, error: 'version.json: falta el campo version', status: r.status };
  return {
    ok: true,
    version: RN.update._limpiar(d.version),
    nombre: d.nombre || ('AdminRed v' + RN.update._limpiar(d.version)),
    url: d.url || RN.update.URL_RELEASE,
    apkUrl: d.apk || null,
    publicado: d.publicado || null,
    notas: d.notas || '',
    fuente: 'version.json (raw.githubusercontent)'
  };
};

/**
 * Consulta las fuentes en orden, empezando por la que funcionó la última vez.
 * Devuelve {ok, info, errores} — con el detalle de cada intento para el diagnóstico.
 */
RN.update._consultarRemoto = async function () {
  var preferida = RN.update._ls.get(RN.update.KEY_FUENTE) || '';
  var orden = (preferida.indexOf('version.json') === 0) ? ['raw', 'api'] : ['api', 'raw'];
  var errores = [];
  for (var i = 0; i < orden.length; i++) {
    var res = (orden[i] === 'api') ? await RN.update._consultarFuenteApi() : await RN.update._consultarFuenteRaw();
    if (res && res.ok) return { ok: true, info: res, errores: errores };
    errores.push(res && res.error ? res.error : (orden[i] + ': error desconocido'));
  }
  return { ok: false, error: errores.join(' · '), errores: errores };
};

/** Abre la descarga del APK (URL directa del archivo si se conoce). */
RN.update.abrirDescarga = function (info) {
  var url = (info && (info.apkUrl || info.url)) || RN.update.URL_RELEASE;
  try {
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener');
    else if (typeof window !== 'undefined' && window.location) window.location.href = url;
  } catch (e) {}
  return url;
};

/** Abre el historial completo de versiones. */
RN.update.abrirReleases = function () {
  try {
    if (typeof window !== 'undefined' && window.open) window.open(RN.update.URL_RELEASES, '_blank', 'noopener');
  } catch (e) {}
};

/**
 * v5.31.0 — Banda visible de actualización. Se muestra cuando hay una versión
 * nueva, para que el aviso NO dependa del permiso de notificaciones del sistema
 * (que en el APK puede estar denegado y dejaba al usuario sin ninguna pista).
 */
RN.update._banner = function (info) {
  try {
    if (typeof document === 'undefined' || !document.createElement || !document.body) return false;
    if (RN.update._ls.get(RN.update.KEY_BANDA_CERRADA) === RN.update._limpiar(info.version)) return false;
    var el = document.getElementById('update-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'update-banner';
      el.style.cssText = 'position:sticky;top:0;z-index:9999;margin:0 0 8px;padding:10px 12px;' +
        'display:flex;align-items:center;gap:10px;background:#2563eb;color:#fff;font-size:13px;' +
        'border-radius:0 0 10px 10px;box-shadow:0 2px 8px rgba(0,0,0,.25)';
      var host = document.querySelector('header.app-header');
      if (host && host.parentNode) host.parentNode.insertBefore(el, host.nextSibling);
      else document.body.insertBefore(el, document.body.firstChild);
    }
    el.innerHTML = '<span style="flex:1">⬆️ Nueva versión <strong>v' + RN.update._limpiar(info.version) + '</strong> disponible</span>' +
      '<button id="update-banner-go" class="btn sm" style="background:#fff;color:#2563eb;border:0;padding:6px 10px;border-radius:8px;font-weight:600">Descargar</button>' +
      '<button id="update-banner-x" style="background:transparent;border:0;color:#fff;font-size:18px;line-height:1;cursor:pointer">×</button>';
    var go = document.getElementById('update-banner-go');
    if (go) go.onclick = function () { RN.update.abrirDescarga(info); };
    var x = document.getElementById('update-banner-x');
    if (x) x.onclick = function () {
      RN.update._ls.set(RN.update.KEY_BANDA_CERRADA, RN.update._limpiar(info.version));
      RN.update._quitarBanner();
    };
    return true;
  } catch (e) { return false; }
};

RN.update._quitarBanner = function () {
  try {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('update-banner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (e) {}
};

/**
 * Lanza el aviso: primero la banda visible (siempre funciona) y después la
 * notificación del sistema (APK: LocalNotifications; navegador: Web Notifications).
 */
RN.update._notificar = async function (info) {
  var version = RN.update._limpiar(info.version);
  var titulo = '⬆️ Actualización disponible';
  var cuerpo = 'AdminRed v' + version + ' está disponible. Toca para descargarla.';
  RN.update._banner(info);

  // 1) Notificación nativa (Capacitor LocalNotifications) — dentro del APK.
  var ln = (RN.platform && RN.platform.plugin) ? RN.platform.plugin('LocalNotifications') : null;
  if (ln) {
    try {
      var perm = await ln.checkPermissions();
      if (!perm || perm.display !== 'granted') perm = await ln.requestPermissions();
      if (perm && perm.display === 'granted') {
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
            extra: { url: (info.apkUrl || info.url || RN.update.URL_RELEASE), tipo: 'update' }
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
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification && window.Notification.permission === 'granted') {
      var n = new window.Notification(titulo, {
        body: cuerpo,
        icon: 'icons/icon-192.png',
        tag: 'adminred-update'
      });
      n.onclick = function () {
        RN.update.abrirDescarga(info);
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
 *   - silencioso {boolean}  si true, no muestra toasts (uso automático)
 *   - forzar     {boolean}  ignora el throttle (uso manual)
 * @returns {Promise<{hay:boolean, version?:string, actual?:string, fuente?:string, error?:string, motivo?:string}>}
 */
RN.update.comprobar = async function (opts) {
  opts = opts || {};
  var actual = RN.update._versionInstalada();

  if (RN.update._comprobando) return { hay: false, actual: actual, motivo: 'comprobación en curso' };
  if (!RN.update._hayConexion()) {
    if (!opts.silencioso) RN.notifyUI.toast('Sin conexión a internet', 'info');
    return { hay: false, actual: actual, motivo: 'sin conexión' };
  }
  if (!opts.forzar && !RN.update._puedeComprobar()) {
    return { hay: false, actual: actual, motivo: 'espera activa' };
  }

  RN.update._comprobando = true;
  try {
    var res = await RN.update._consultarRemoto();

    if (!res.ok) {
      // v5.31.0: un fallo NO cuenta como comprobación válida (antes sí, y
      // bloqueaba los avisos 6 horas). Se reintenta en pocos minutos.
      RN.update._registrarFallo(res.error);
      RN.update._pintarEstado();
      if (!opts.silencioso) {
        RN.notifyUI.toast('No se pudo consultar el servidor de versiones. Se reintentará automáticamente.', 'warn', 6000);
      }
      return { hay: false, actual: actual, error: res.error, errores: res.errores };
    }

    var info = res.info;
    RN.update._registrarExito(info);
    RN.update._ultimaVersion = info.version;
    var cmp = RN.update._comparar(info.version, actual);

    if (cmp > 0) {
      if (!RN.update._yaNotificada(info.version)) {
        await RN.update._notificar(info);
        RN.update._marcarNotificada(info.version);
      } else {
        RN.update._banner(info);   // ya avisada, pero la banda sigue visible
      }
      RN.update._pintarEstado();
      if (!opts.silencioso) RN.notifyUI.toast('⬆️ Nueva versión disponible: v' + info.version, 'info', 6000);
      return { hay: true, version: info.version, actual: actual, info: info, fuente: info.fuente };
    }

    RN.update._quitarBanner();
    RN.update._pintarEstado();
    if (!opts.silencioso) RN.notifyUI.toast('✅ Tienes la última versión (v' + actual + ')', 'success');
    return { hay: false, version: info.version, actual: actual, fuente: info.fuente };
  } finally {
    RN.update._comprobando = false;
  }
};

/**
 * Estado para Ajustes y diagnóstico.
 */
RN.update.estado = function () {
  var okTs = parseInt(RN.update._ls.get(RN.update.KEY_ULTIMA) || '0', 10) || 0;
  var intentoTs = parseInt(RN.update._ls.get(RN.update.KEY_INTENTO) || '0', 10) || 0;
  return {
    instalada: RN.update._versionInstalada(),
    ultimaVersion: RN.update._ls.get(RN.update.KEY_VERSION_REMOTA) || null,
    fuente: RN.update._ls.get(RN.update.KEY_FUENTE) || null,
    ultimaOk: okTs,
    ultimoIntento: intentoTs,
    fallos: RN.update._fallos(),
    error: RN.update._ls.get(RN.update.KEY_ERROR) || null,
    esperaMs: RN.update.proximoIntentoMs()
  };
};

/** Texto humano de un intervalo en ms. */
RN.update._textoEspera = function (ms) {
  if (!ms) return 'ahora';
  var min = Math.ceil(ms / 60000);
  if (min < 60) return 'en ' + min + ' min';
  return 'en ' + Math.round(min / 60) + ' h';
};

/** Pinta el estado en Ajustes (#update-status). Tolerante a DOM ausente. */
RN.update._pintarEstado = function () {
  try {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var el = document.getElementById('update-status');
    if (!el) return;
    var e = RN.update.estado();
    var lineas = [];
    lineas.push('Versión instalada: <strong>v' + e.instalada + '</strong>.');
    if (e.ultimaVersion) {
      var cmp = RN.update._comparar(e.ultimaVersion, e.instalada);
      var etiqueta = cmp > 0
        ? '<span style="color:#d97706;font-weight:600">hay una nueva: v' + e.ultimaVersion + '</span>'
        : 'estás al día (última publicada: v' + e.ultimaVersion + ')';
      var fuenteTxt = e.fuente ? ' <span class="muted">— vía ' + String(e.fuente).replace(/</g, '&lt;') + '</span>' : '';
      lineas.push(etiqueta + fuenteTxt + '.');
    }
    if (e.ultimaOk) lineas.push('Última comprobación correcta: ' + new Date(e.ultimaOk).toLocaleString() + '.');
    else if (e.ultimoIntento) lineas.push('Todavía no se ha podido comprobar correctamente.');
    if (e.error) lineas.push('<span style="color:#dc2626">Último error: ' + String(e.error).replace(/</g, '&lt;') + ' — próximo intento ' + RN.update._textoEspera(e.esperaMs) + '.</span>');
    else if (e.esperaMs) lineas.push('<span class="muted">Próxima comprobación automática ' + RN.update._textoEspera(e.esperaMs) + '.</span>');
    el.innerHTML = lineas.join('<br>');
  } catch (err) { /* nunca romper la UI por el estado */ }
};

/**
 * v5.31.0 — Diagnóstico: consulta las DOS fuentes y muestra el resultado de cada
 * una (incluido el código HTTP), para poder ver por qué no se detecta nada.
 */
RN.update._filasDiagnostico = async function () {
  var filas = [];
  var api = await RN.update._consultarFuenteApi();
  filas.push({
    fuente: 'API de GitHub (releases/latest)',
    ok: !!api.ok,
    detalle: api.ok ? ('versión ' + api.version + ' · APK: ' + (api.apkUrl ? 'sí' : 'no informado')) : api.error
  });
  var raw = await RN.update._consultarFuenteRaw();
  filas.push({
    fuente: 'version.json (raw.githubusercontent)',
    ok: !!raw.ok,
    detalle: raw.ok ? ('versión ' + raw.version) : raw.error
  });
  return { filas: filas, api: api, raw: raw };
};

RN.update.diagnostico = async function () {
  var e = RN.update.estado();
  var html = `
    <div class="modal-header">
      <h3>🧩 Diagnóstico de actualizaciones</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi muted" style="margin-bottom:12px">
        <div class="label">Versión instalada (APP_VERSION)</div>
        <div class="value">v${e.instalada}</div>
        <div class="sub">Es la versión contra la que se compara</div>
      </div>
      <div id="upd-diag-filas"><p class="muted">Consultando las dos fuentes…</p></div>
      <div class="muted" style="font-size:12px">
        Última comprobación correcta: ${e.ultimaOk ? new Date(e.ultimaOk).toLocaleString() : '—'}<br>
        Último intento: ${e.ultimoIntento ? new Date(e.ultimoIntento).toLocaleString() : '—'}<br>
        Fallos consecutivos: ${e.fallos}<br>
        Próxima comprobación automática: ${RN.update._textoEspera(e.esperaMs)}<br>
        ${e.error ? '<span style="color:#dc2626">Último error: ' + String(e.error).replace(/</g, '&lt;') + '</span>' : ''}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn" onclick="RN.update.abrirReleases()">📋 Ver versiones</button>
      <button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.update.buscarAhora()">🔍 Buscar ahora</button>
    </div>`;
  RN.uiComponents.modal(html);

  var d = await RN.update._filasDiagnostico();
  var cont = document.getElementById('upd-diag-filas');
  if (!cont) return;
  cont.innerHTML = d.filas.map(function (f) {
    var color = f.ok ? '#16a34a' : '#dc2626';
    var icono = f.ok ? '✓' : '✗';
    return '<div style="margin-bottom:10px;padding:8px;border:1px solid rgba(127,127,127,.3);border-radius:8px">' +
      '<div style="font-weight:600;font-size:13px">' + icono + ' ' + f.fuente + '</div>' +
      '<div class="muted" style="font-size:12px;color:' + color + '">' + String(f.detalle).replace(/</g, '&lt;') + '</div></div>';
  }).join('') + '<div class="muted" style="font-size:12px">Si la API falla por límite de peticiones, la app usa version.json automáticamente.</div>';
};

/** Comprobación manual (botón "Buscar ahora"): ignora el throttle y da feedback. */
RN.update.buscarAhora = async function () {
  if (RN.update._comprobando) {
    RN.notifyUI.toast('Comprobando…', 'info', 1500);
    return;
  }
  RN.notifyUI.toast('🔍 Buscando actualizaciones…', 'info', 2500);
  var r = await RN.update.comprobar({ forzar: true, silencioso: false });
  if (r && r.hay) {
    RN.uiComponents.confirm(
      '⬆️ Actualización disponible',
      'Hay una versión nueva de AdminRed (v' + r.version + '). ' +
      '¿Quieres descargar el APK ahora?',
      function () { RN.update.abrirDescarga(r.info); }
    );
  }
};

/**
 * Inicializa la comprobación automática:
 *  - Al arrancar (tras un pequeño retardo, sin bloquear la UI).
 *  - Al recuperar la conexión ('online').
 *  - Al volver a primer plano (visibilitychange / pageshow).
 *  - Al reanudar la app (plugin App de Capacitor, si está instalado).
 *  - Refresca la banda y el estado al volver a la app.
 */
RN.update.init = function () {
  // Comprobación inicial diferida.
  setTimeout(function () {
    if (RN.update._autoActivado()) RN.update.comprobar({ silencioso: true });
  }, 3000);

  // Repinta el estado una vez que init.js ya escribió el suyo (evita que lo pise).
  setTimeout(function () { RN.update._pintarEstado(); }, 1500);

  var auto = function (motivo) {
    if (!RN.update._autoActivado()) return;
    RN.update.comprobar({ silencioso: true });
    if (motivo === 'visibilidad') RN.update._pintarEstado();
  };

  try {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', function () { auto('online'); });
      window.addEventListener('pageshow', function () { auto('pageshow'); });
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') auto('visibilidad');
      });
    }
  } catch (e) {}

  // Plugin App de Capacitor (si está instalado): cambio de estado de la app.
  try {
    var appPlugin = (RN.platform && RN.platform.plugin) ? RN.platform.plugin('App') : null;
    if (appPlugin && appPlugin.addListener) {
      appPlugin.addListener('appStateChange', function (st) {
        if (st && st.isActive) auto('resume');
      });
    }
  } catch (e) {}

  // Toque sobre la notificación nativa -> descargar el APK.
  var ln = (RN.platform && RN.platform.plugin) ? RN.platform.plugin('LocalNotifications') : null;
  if (ln && ln.addListener) {
    try {
      ln.addListener('localNotificationActionPerformed', function (ev) {
        var extra = ev && ev.notification && ev.notification.extra;
        if (!extra || extra.tipo !== 'update') return;
        RN.update.abrirDescarga({ url: extra.url || RN.update.URL_RELEASE });
      });
    } catch (e) { /* no soportado */ }
  }
};
