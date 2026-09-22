/**
 * storage/drive.js — Copia automática en Google Drive vía Apps Script (v5.29.0).
 *
 * REEMPLAZA al plugin nativo Android (AccountManager + appDataFolder), que
 * daba error 403 "insufficient permissions for this file" de forma persistente.
 *
 * Ahora la sincronización pasa por un Web App de Google Apps Script (ver
 * Code.gs) que corre siempre con la cuenta hfleo975@gmail.com — ya no
 * depende del cliente OAuth Android, del SHA-1 del APK firmado, ni de
 * scopes/appDataFolder. Funciona igual en la APK y en el navegador/PWA.
 *
 * ============================================================
 * CONFIGURACIÓN (rellenar antes de compilar)
 * ============================================================
 * Después de desplegar Code.gs como Web App (ver instrucciones en ese
 * archivo), pega aquí abajo:
 *   - APPS_SCRIPT_URL: la URL que termina en /exec
 *   - APPS_SCRIPT_TOKEN: el mismo valor que pusiste en la propiedad TOKEN
 *     del script
 * ============================================================
 *
 * Complementa al almacenamiento local: cada cambio de datos se sube (con
 * debounce de 15 s) al respaldo remoto.
 *
 * Al abrir la APK compara la copia LOCAL con la de la NUBE:
 *   - IGUALES (ninguna cambió desde la última sincronización) → solo un toast.
 *   - La nube es más nueva → diálogo para elegir qué copia trabajará la APK.
 *   - Ambas cambiaron (conflicto) → diálogo con las 2 fechas y 3 opciones:
 *     usar la nube / usar esta APK / cancelar.
 *   - La local es más nueva → se sube sola (silencioso).
 *
 * Nunca bloquea el arranque: sin red o con error de Drive la app funciona
 * igual con sus datos locales y reintenta después.
 *
 * API pública (Ajustes → ☁️ Copia en Google Drive):
 *   RN.drive.conectar()        — activa la sincronización y hace la 1.ª subida
 *   RN.drive.desconectar()     — desactiva la sincronización en este equipo
 *   RN.drive.sincronizarAhora()— sube el estado actual a la nube
 *   RN.drive.estado()          — texto de estado para la UI
 */
RN.drive = RN.drive || {};

// ---------------------------------------------------------------
// CONFIGURACIÓN — rellenar con los datos de tu implementación de Apps Script
// ---------------------------------------------------------------
RN.drive.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxte9-ihN7WxoIBKDB5ie4yO0G8sbvBLBTpLJVUez8mVJ47bEsRTd-pohlitfoHiCa6/exec';
RN.drive.APPS_SCRIPT_TOKEN = 'AshrdfgmdfkgdfkljglOOLJMBJGfngdfng23423ndf,jngfd,5860968';

RN.drive.KEY_ACTIVO = 'rn_drive_activo'; // '1' si la sincronización está activada
RN.drive.KEY_ULT_SINCRO = 'rn_drive_ultima_sincro'; // fechaISO que hay en la nube
RN.drive.KEY_ULT_CAMBIO = 'rn_ultimo_cambio_local'; // fechaISO del último cambio local
RN.drive.DEBOUNCE_MS = 15000; // sube como máx. 1 vez cada 15 s tras un cambio

RN.drive._timer = null;
RN.drive._pendiente = false;
RN.drive._ultimoError = null;

/** ¿Sincronización activada en este equipo? */
RN.drive.cuenta = function () {
  try { return localStorage.getItem(RN.drive.KEY_ACTIVO) === '1' ? 'hfleo975@gmail.com (Apps Script)' : null; }
  catch (e) { return null; }
};

/** ¿Está configurada la URL/token? (evita subir a la URL placeholder por error). */
RN.drive._configurado = function () {
  return RN.drive.APPS_SCRIPT_URL && RN.drive.APPS_SCRIPT_URL.indexOf('PEGA_AQUI') === -1 &&
         RN.drive.APPS_SCRIPT_TOKEN && RN.drive.APPS_SCRIPT_TOKEN.indexOf('PEGA_AQUI') === -1;
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
// Transporte: llamadas al Web App de Apps Script
// ---------------------------------------------------------------

/** Sube el respaldo. Lanza excepción con el mensaje de error si falla. */
RN.drive._apiSubir = async function (json) {
  // Content-Type text/plain a propósito: evita el preflight CORS (OPTIONS)
  // que Apps Script no maneja bien con application/json desde WebView/fetch.
  var resp = await fetch(RN.drive.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: RN.drive.APPS_SCRIPT_TOKEN, accion: 'subir', json: json })
  });
  var data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data; // { ok: true, fechaRemota }
};

/** Lee el respaldo remoto. Lanza excepción con el mensaje de error si falla. */
RN.drive._apiLeer = async function () {
  var url = RN.drive.APPS_SCRIPT_URL + '?token=' + encodeURIComponent(RN.drive.APPS_SCRIPT_TOKEN) + '&accion=leer';
  var resp = await fetch(url, { method: 'GET' });
  var data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data; // { json, fechaRemota } o { json: null }
};

// ---------------------------------------------------------------
// Activar / desactivar sincronización
// ---------------------------------------------------------------

/** Activa la sincronización y hace la 1.ª subida/comparación. */
RN.drive.conectar = async function () {
  if (!RN.drive._configurado()) {
    RN.notifyUI.toast('Falta configurar APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN en drive.js', 'error', 9000);
    return;
  }
  try { localStorage.setItem(RN.drive.KEY_ACTIVO, '1'); } catch (e) {}
  RN.notifyUI.toast('Copia en Google Drive activada', 'success');
  RN.drive._refrescarUI();
  await RN.drive.compararAlArrancar();
};

/** Desactiva la sincronización en este equipo (la copia en Drive no se borra). */
RN.drive.desconectar = function () {
  try { localStorage.removeItem(RN.drive.KEY_ACTIVO); } catch (e) {}
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
  var activo = RN.drive.cuenta();
  if (!activo || !RN.drive._configurado()) {
    if (!silencioso) RN.notifyUI.toast('Activa primero la copia en Google Drive', 'warn');
    return false;
  }
  if (!RN.drive.hayRed()) { RN.drive._pendiente = true; return false; }
  try {
    var sobre = RN.drive._sobre();
    var fechaISO = (JSON.parse(sobre)).fechaISO;
    await RN.drive._apiSubir(sobre);
    localStorage.setItem(RN.drive.KEY_ULT_SINCRO, fechaISO);
    RN.drive._pendiente = false;
    RN.drive._ultimoError = null;
    if (!silencioso) RN.notifyUI.toast('☁️ Copia subida a Google Drive', 'success');
    RN.drive._refrescarUI();
    return true;
  } catch (e) {
    // Sin drama: queda pendiente y se reintenta (cada 5 min y al volver la
    // red). El error queda visible en el estado de Ajustes.
    RN.drive._pendiente = true;
    RN.drive._ultimoError = String((e && e.message) || e);
    console.warn('[drive] subida falló:', e);
    RN.drive._refrescarUI();
    if (!silencioso) RN.notifyUI.toast('No se pudo subir la copia: ' + (e.message || e), 'error');
    return false;
  }
};

/** Botón "Sincronizar ahora" de Ajustes. */
RN.drive.sincronizarAhora = function () {
  if (!RN.drive.cuenta()) { RN.drive.conectar(); return; }
  RN.notifyUI.toast('Subiendo copia a Drive…', 'info');
  return RN.drive.subirAutomatica(false).then(function (ok) {
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
  // Reintento periódico — si una subida falla (red intermitente, error del
  // script) queda pendiente para siempre si solo dependiéramos de 'online'.
  setInterval(function () {
    if (RN.drive._pendiente && RN.drive.cuenta()) {
      RN.drive.subirAutomatica(true);
    }
  }, 5 * 60 * 1000);

  RN.drive._refrescarUI();
  if (!RN.drive.cuenta()) return;
  // Comparar tras cargar los datos, sin bloquear el arranque.
  setTimeout(function () { RN.drive.compararAlArrancar(); }, 4000);
};

RN.drive._leerLocal = function () {
  return {
    cuenta: RN.drive.cuenta(),
    ultSincro: localStorage.getItem(RN.drive.KEY_ULT_SINCRO) || null,
    ultCambio: localStorage.getItem(RN.drive.KEY_ULT_CAMBIO) || null
  };
};

RN.drive.compararAlArrancar = async function () {
  var local = RN.drive._leerLocal();
  if (!local.cuenta || !RN.drive._configurado()) return;
  if (!RN.drive.hayRed()) { RN.drive._pendiente = true; return; }
  var remoto;
  try {
    remoto = await RN.drive._apiLeer();
  } catch (e) {
    console.warn('[drive] comparación falló (seguimos en local):', e);
    RN.drive._ultimoError = String((e && e.message) || e);
    RN.drive._refrescarUI();
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
    try { RN.uiComponents.cerrarModal(); } catch (e) {}
    var remoto = await RN.drive._apiLeer();
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
  if (!RN.drive._configurado()) return 'Falta configurar APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN en drive.js.';
  if (!c) return 'Copia en Drive desactivada — la copia solo se guarda en este teléfono.';
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
