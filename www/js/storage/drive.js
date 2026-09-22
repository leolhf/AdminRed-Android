/**
 * storage/drive.js — Copia automática en Google Drive (v5.28.0).
 *
 * Complementa al almacenamiento local: cada cambio de datos se sube (con
 * debounce de 15 s) a "Datos de aplicaciones ocultos" del Drive del usuario
 * (appDataFolder, privado de AdminRed), usando la cuenta de Google del
 * teléfono vía el plugin nativo GoogleDrive.
 *
 * Al abrir la APK compara la copia LOCAL con la de la NUBE:
 *   - IGUALES (ninguna cambió desde la última sincronización) → solo un toast.
 *   - La nube es más nueva → diálogo para elegir qué copia trabajará la APK.
 *   - Ambas cambiaron (conflicto) → diálogo con las 2 fechas y 3 opciones:
 *     usar la nube / usar esta APK / cancelar.
 *   - La local es más nueva → se sube sola (silencioso).
 *
 * Nunca bloquea el arranque: sin cuenta, sin red o con error de Drive la app
 * funciona igual con sus datos locales y reintenta después.
 *
 * API pública (Ajustes → ☁️ Copia en Google Drive):
 *   RN.drive.conectar()        — elige cuenta de Google y hace 1.ª sincronización
 *   RN.drive.desconectar()     — olvida la cuenta (NO borra la copia en Drive)
 *   RN.drive.sincronizarAhora()— sube el estado actual a la nube
 *   RN.drive.estado()          — texto de estado para la UI
 */
RN.drive = RN.drive || {};

RN.drive.KEY_CUENTA = 'rn_drive_cuenta';
RN.drive.KEY_ULT_SINCRO = 'rn_drive_ultima_sincro'; // fechaISO que hay en la nube
RN.drive.KEY_ULT_CAMBIO = 'rn_ultimo_cambio_local'; // fechaISO del último cambio local
RN.drive.DEBOUNCE_MS = 15000; // sube como máx. 1 vez cada 15 s tras un cambio

RN.drive._timer = null;
RN.drive._pendiente = false;

/** Cuenta de Google conectada (o null). */
RN.drive.cuenta = function () {
  try { return localStorage.getItem(RN.drive.KEY_CUENTA) || null; }
  catch (e) { return null; }
};

/** Plugin nativo GoogleDrive (o null fuera del APK). */
RN.drive.plugin = function () {
  return (RN.platform && RN.platform.plugin) ? RN.platform.plugin('GoogleDrive') : null;
};

// ------- v5.28.2: vinculación DURADERA -------
// Antes la cuenta vivía solo en localStorage del WebView; si el sistema
// (HyperOS forzando la app, actualización de la APK, limpieza del WebView)
// borraba ese storage, la vinculación se perdía y con ella TODAS las subidas.
// Ahora se guarda además en SharedPreferences nativas y se restaura al arrancar.
RN.drive._cuentaNativa = async function () {
  var p = RN.drive.plugin();
  if (!p || typeof p.leerCuenta !== 'function') return null;
  try {
    var r = await p.leerCuenta();
    return (r && r.cuenta) ? r.cuenta : null;
  } catch (e) { return null; }
};

RN.drive._guardarCuentaDurable = async function (cuenta) {
  try { localStorage.setItem(RN.drive.KEY_CUENTA, cuenta); } catch (e) {}
  var p = RN.drive.plugin();
  if (p && typeof p.guardarCuenta === 'function') {
    try { await p.guardarCuenta({ cuenta: cuenta }); } catch (e) {}
  }
};

RN.drive._borrarCuentaDurable = async function () {
  try { localStorage.removeItem(RN.drive.KEY_CUENTA); } catch (e) {}
  try { localStorage.removeItem(RN.drive.KEY_ULT_SINCRO); } catch (e) {}
  var p = RN.drive.plugin();
  if (p && typeof p.borrarCuenta === 'function') {
    try { await p.borrarCuenta(); } catch (e) {}
  }
};

/** ¿Hay red? (best-effort; si el API no existe asumimos que sí). */
RN.drive.hayRed = function () {
  try { return navigator.onLine !== false; } catch (e) { return true; }
};

/** Envuelve el estado local en un sobre con fecha y esquema. */
RN.drive._sobre = function () {
  return JSON.stringify({
    app: 'AdminRed',
    esquema: (RN.migration && RN.migration.VERSION_ESQUEMA) || 1,
    fechaISO: new Date().toISOString(),
    data: JSON.parse(RN.storageLocal.serializar())
  });
};

/** Extrae {fechaISO, data} del contenido remoto (tolera respaldos legados). */
RN.drive._desempaquetar = function (contenido) {
  try {
    var o = JSON.parse(contenido);
    if (o && o.app === 'AdminRed' && o.data) {
      return { fechaISO: o.fechaISO || null, data: o.data };
    }
    return { fechaISO: null, data: o }; // respaldo antiguo sin sobre
  } catch (e) {
    throw new Error('La copia remota no es un JSON válido');
  }
};

// ---------------------------------------------------------------
// Conexión de la cuenta
// ---------------------------------------------------------------

/** Abre el selector de cuentas de Google y hace la 1.ª sincronización. */
RN.drive.conectar = async function () {
  var p = RN.drive.plugin();
  if (!p) {
    // v5.28.1: diagnóstico REAL en vez del mensaje genérico. Hay 2 causas
    // distintas con mensajes distintos:
    //   - Estar en el navegador/PWA (no hay plugin nativo, es lo esperado).
    //   - Estar en la APK pero con el plugin ausente del bridge (APK antigua
    //     a la v5.28.1, que registraba los plugins después de super.onCreate()).
    if (!(RN.platform && RN.platform.esNativo && RN.platform.esNativo())) {
      RN.notifyUI.toast('La copia en Drive solo está disponible en la APK (ahora estás en el navegador)', 'warn');
    } else {
      console.warn('[drive] window.Capacitor.Plugins.GoogleDrive no existe — ¿APK anterior a v5.28.1 o plugin sin registrar?');
      RN.notifyUI.toast('No se encontró el módulo nativo de Drive. Descarga e instala la APK v5.28.1 o superior y vuelve a intentar.', 'error', 12000);
    }
    return;
  }
  try {
    var r = await p.conectar();
    if (r && r.cuenta) {
      await RN.drive._guardarCuentaDurable(r.cuenta);
      RN.notifyUI.toast('Cuenta conectada: ' + r.cuenta, 'success');
      RN.drive._refrescarUI();
      var okSubida = await RN.drive.subirAutomatica(true);
      // v5.28.2: si la 1.ª copia falla, avisar — antes fallaba en silencio
      // (silencioso=true no mostraba nada) y parecía que no se sincronizaba.
      if (!okSubida) {
        RN.notifyUI.toast('Cuenta vinculada, pero la 1.ª copia no subió. Se reintentará solo.', 'warn', 9000);
      }
    }
  } catch (e) {
    RN.notifyUI.toast('No se conectó la cuenta: ' + (e.message || e), 'error');
  }
};

/** Olvida la cuenta en este dispositivo (la copia en Drive no se borra). */
RN.drive.desconectar = function () {
  RN.drive._borrarCuentaDurable();
  RN.drive._refrescarUI();
  RN.notifyUI.toast('Copia en Drive desconectada en este equipo', 'success');
};

// ---------------------------------------------------------------
// Subida automática en cada cambio
// ---------------------------------------------------------------

/** Llamado desde storageLocal.guardar() en CADA cambio de datos. */
RN.drive.onChange = function () {
  try { localStorage.setItem(RN.drive.KEY_ULT_CAMBIO, new Date().toISOString()); } catch (e) {}
  if (!RN.drive.cuenta()) return;
  RN.drive._pendiente = true;
  if (RN.drive._timer) return; // debounce: ya hay una subida programada
  RN.drive._timer = setTimeout(function () {
    RN.drive._timer = null;
    RN.drive.subirAutomatica();
  }, RN.drive.DEBOUNCE_MS);
};

/** Sube el estado local a la nube. silencioso=true no avisa si no hay cuenta. */
RN.drive.subirAutomatica = async function (silencioso) {
  var cuenta = RN.drive.cuenta();
  var p = RN.drive.plugin();
  if (!cuenta || !p) { if (!silencioso) RN.notifyUI.toast('Conecta primero una cuenta de Google', 'warn'); return false; }
  if (!RN.drive.hayRed()) { RN.drive._pendiente = true; return false; }
  try {
    var sobre = RN.drive._sobre();
    var fechaISO = (JSON.parse(sobre)).fechaISO;
    var r = await p.subir({ json: sobre, cuenta: cuenta });
    localStorage.setItem(RN.drive.KEY_ULT_SINCRO, fechaISO);
    RN.drive._pendiente = false;
    RN.drive._ultimoError = null;
    if (!silencioso) RN.notifyUI.toast('☁️ Copia subida a Google Drive', 'success');
    RN.drive._refrescarUI();
    return true;
  } catch (e) {
    // Sin drama: queda pendiente y se reintenta (v5.28.2: cada 5 min y al volver
    // la red). El error queda visible en el estado de Ajustes.
    RN.drive._pendiente = true;
    RN.drive._ultimoError = String((e && e.message) || e);
    console.warn('[drive] subida falló:', e);
    if (!silencioso) RN.notifyUI.toast('No se pudo subir la copia: ' + (e.message || e), 'error');
    return false;
  }
};

/** Botón "Sincronizar ahora" de Ajustes. */
RN.drive.sincronizarAhora = function () {
  if (!RN.drive.cuenta()) { RN.drive.conectar(); return; }
  RN.notifyUI.toast('Subiendo copia a Drive…', 'info');
  return RN.drive.subirAutomatica(true).then(function (ok) {
    if (ok) RN.notifyUI.toast('☁️ Copia de seguridad al día', 'success');
  });
};

// ---------------------------------------------------------------
// Comparación local vs nube al abrir la APK
// ---------------------------------------------------------------

RN.drive.init = function () {
  // Reintento cuando vuelva la red (subida pendiente por estar offline).
  window.addEventListener('online', function () {
    if (RN.drive._pendiente) RN.drive.subirAutomatica(true);
  });
  // v5.28.2: reintento periódico — antes solo existía el evento 'online', así
  // que una subida fallida (token, red intermitente) quedaba pendiente para
  // siempre. Ahora cada 5 min se reintenta si hay algo pendiente.
  setInterval(function () {
    if (RN.drive._pendiente && RN.drive.cuenta() && RN.drive.plugin()) {
      RN.drive.subirAutomatica(true);
    }
  }, 5 * 60 * 1000);

  // v5.28.2: restaurar la vinculación desde el almacenamiento NATIVO si el
  // localStorage del WebView la perdió (causa de "al cerrar y abrir la APK
  // pierde la vinculación").
  RN.drive._cuentaNativa().then(function (nativa) {
    if (nativa && !RN.drive.cuenta()) {
      try { localStorage.setItem(RN.drive.KEY_CUENTA, nativa); } catch (e) {}
      RN.drive._refrescarUI();
    }
    if (!RN.drive.cuenta()) { RN.drive._refrescarUI(); return; }
    // Comparar tras cargar los datos, sin bloquear el arranque.
    setTimeout(function () { RN.drive.compararAlArrancar(); }, 4000);
  });
};

RN.drive._leerLocal = function () {
  return {
    cuenta: RN.drive.cuenta(),
    ultSincro: localStorage.getItem(RN.drive.KEY_ULT_SINCRO) || null,
    ultCambio: localStorage.getItem(RN.drive.KEY_ULT_CAMBIO) || null
  };
};

RN.drive.compararAlArrancar = async function () {
  var p = RN.drive.plugin();
  var local = RN.drive._leerLocal();
  if (!p || !local.cuenta) return;
  if (!RN.drive.hayRed()) { RN.drive._pendiente = true; return; }
  var remoto;
  try {
    remoto = await p.leer({ cuenta: local.cuenta });
  } catch (e) {
    console.warn('[drive] comparación falló (seguimos en local):', e);
    return; // sin red/token: la app trabaja en local, sin molestar
  }

  // Aún no hay copia en la nube: subir la local silenciosamente.
  if (!remoto || remoto.json === null || remoto.json === undefined) {
    await RN.drive.subirAutomatica(true);
    RN.notifyUI.toast('☁️ Primera copia subida a Google Drive', 'success');
    return;
  }

  var paquete;
  try { paquete = RN.drive._desempaquetar(remoto.json); }
  catch (e) { RN.notifyUI.toast('Copia en Drive ilegible: ' + e.message, 'error'); return; }

  var fechaNube = paquete.fechaISO || remoto.fechaRemota || null;
  var cambioLocal = local.ultCambio;
  var ultimaSincro = local.ultSincro;

  var nubeNueva = !!(fechaNube && ultimaSincro && fechaNube > ultimaSincro);
  var localNuevo = !!(cambioLocal && (!ultimaSincro || cambioLocal > ultimaSincro));

  if (!nubeNueva && !localNuevo) {
    // IGUALES: nada cambió en ningún lado desde la última sincronización.
    RN.notifyUI.toast('☁️ Copia de Google Drive al día (' + RN.drive._fechaCorta(fechaNube) + ')', 'info');
    return;
  }
  if (localNuevo && !nubeNueva) {
    // Solo cambió lo local: subir sin preguntar.
    await RN.drive.subirAutomatica(true);
    return;
  }
  // La nube es más nueva, o AMBAS cambiaron (conflicto): preguntar al usuario.
  RN.drive._dialogoEleccion(fechaNube, cambioLocal, nubeNueva && localNuevo);
};

/** Diálogo: ¿qué copia trabajará la APK? Muestra las fechas de ambas. */
RN.drive._dialogoEleccion = function (fechaNube, fechaLocal, conflicto) {
  try { RN.uiComponents.cerrarModal(); } catch (e) {}
  var titulo = conflicto ? '⚠️ Copias distintas (conflicto)' : '☁️ Copia más nueva en Google Drive';
  var html =
    '<div class="modal-header"><h3>' + titulo + '</h3>' +
      '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<p>La copia de <b>Google Drive</b> es del <b>' + RN.drive._fechaCorta(fechaNube) + '</b>.</p>' +
      '<p>Los datos de <b>esta APK (local)</b> son del <b>' +
        (fechaLocal ? RN.drive._fechaCorta(fechaLocal) : 'nunca (sin cambios registrados)') + '</b>.</p>' +
      (conflicto ? '<p class="muted">Ambas copias cambiaron desde la última sincronización. Elige cuál quieres usar.</p>' : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar (usar local sin subir)</button>' +
      '<button class="btn" onclick="RN.drive._usarLocal()">📱 Usar esta APK (sube a la nube)</button>' +
      '<button class="btn primary" onclick="RN.drive._usarNube()">☁️ Usar la copia de Drive</button>' +
    '</div>';
  RN.uiComponents.modal(html, {});
};

/** Elige NUBE: restaura los datos remotos en la APK. */
RN.drive._usarNube = async function () {
  try {
    var p = RN.drive.plugin();
    var cuenta = RN.drive.cuenta();
    try { RN.uiComponents.cerrarModal(); } catch (e) {}
    var remoto = await p.leer({ cuenta: cuenta });
    if (!remoto || !remoto.json) { RN.notifyUI.toast('No hay copia en la nube', 'warn'); return; }
    var paquete = RN.drive._desempaquetar(remoto.json);
    RN.drive._aplicarDatos(paquete.data);
    var fecha = paquete.fechaISO || new Date().toISOString();
    localStorage.setItem(RN.drive.KEY_ULT_SINCRO, fecha);
    localStorage.setItem(RN.drive.KEY_ULT_CAMBIO, fecha); // la local ahora ES esa copia
    RN.notifyUI.toast('☁️ Datos restaurados desde Google Drive', 'success');
    setTimeout(function () { location.reload(); }, 800);
  } catch (e) {
    RN.notifyUI.toast('No se pudo restaurar: ' + (e.message || e), 'error');
  }
};

/** Elige LOCAL: sube el estado actual y deja la nube igualada. */
RN.drive._usarLocal = async function () {
  try { RN.uiComponents.cerrarModal(); } catch (e) {}
  var ok = await RN.drive.subirAutomatica(true);
  if (ok) RN.notifyUI.toast('📱 Datos de la APK subidos a la nube', 'success');
};

/** Aplica un objeto de datos (ya desempaquetado) al estado y persiste. */
RN.drive._aplicarDatos = function (data) {
  var d = RN.migration.migrar(data);
  RN.state.clients = d.clients || [];
  RN.state.history = d.history || [];
  RN.state.gastos = d.gastos || [];
  RN.state.depositos = d.depositos || [];
  RN.state.retiros = d.retiros || [];
  RN.state.inventario = d.inventario || [];
  RN.state.asignacionesInventario = d.asignacionesInventario || [];
  RN.state.investments = d.investments || [];
  RN.state.planes = d.planes || [];
  RN.state.equiposRed = d.equiposRed || [];
  RN.state.descuentos = d.descuentos || [];
  RN.state.eventos = d.eventos || [];
  RN.state.snapshots = d.snapshots || [];
  if (d.config) Object.assign(RN.state.config, d.config);
  RN.state.reciboCounter = d.reciboCounter || 0;
  RN.state.mesActual = d.mesActual || RN.calc.mesActualStr();
  RN.storageLocal.persistir();
};

// ---------------------------------------------------------------
// UI (Ajustes)
// ---------------------------------------------------------------

RN.drive._fechaCorta = function (iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
  } catch (e) { return iso; }
};

/** Texto de estado para la tarjeta de Ajustes. */
RN.drive.estado = function () {
  var c = RN.drive.cuenta();
  if (!c) return 'Sin cuenta conectada — la copia solo se guarda en este teléfono.';
  var ult = localStorage.getItem(RN.drive.KEY_ULT_SINCRO);
  var txt = 'Cuenta: ' + c + ' · Última copia: ' + (ult ? RN.drive._fechaCorta(ult) : 'pendiente');
  if (RN.drive._pendiente) txt += ' · ⏳ copia pendiente de subir';
  if (RN.drive._ultimoError) txt += ' · ⚠️ ' + RN.drive._ultimoError;
  return txt;
};

RN.drive._refrescarUI = function () {
  try {
    var el = document.getElementById('drive-estado');
    if (el) el.textContent = RN.drive.estado();
    var bCon = document.getElementById('drive-btn-conectar');
    var bDes = document.getElementById('drive-btn-desconectar');
    if (bCon) bCon.style.display = RN.drive.cuenta() ? 'none' : '';
    if (bDes) bDes.style.display = RN.drive.cuenta() ? '' : 'none';
  } catch (e) { /* silencioso */ }
};
