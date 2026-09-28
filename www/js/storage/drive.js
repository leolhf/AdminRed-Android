/**
 * storage/drive.js — Copia automática en Google Drive vía Apps Script (v5.32.0).
 *
 * REEMPLAZA al plugin nativo Android (AccountManager + appDataFolder), que
 * daba error 403 "insufficient permissions for this file" de forma persistente.
 *
 * La sincronización pasa por un Web App de Google Apps Script (ver Code.gs)
 * que corre siempre con la cuenta configurada en drive-config.js — no
 * depende del cliente OAuth Android, del SHA-1 del APK firmado, ni de
 * scopes/appDataFolder. Funciona igual en la APK y en el navegador/PWA.
 *
 * ============================================================
 * CONFIGURACIÓN
 * ============================================================
 * La URL y el TOKEN del Web App se introducen en la propia app (Ajustes →
 * ☁️ Copia en Google Drive → 🔑 Configurar) y se guardan solo en el
 * dispositivo (localStorage). NO van dentro de la APK/.exe, que son públicos.
 * 'js/storage/drive-config.js' queda como respaldo opcional para desarrollo.
 * ============================================================
 *
 * Complementa al almacenamiento local: cada cambio de datos se sube (con
 * debounce de 15 s) al respaldo remoto.
 *
 * v5.32.0 — COMPARACIÓN Y FUSIÓN GRANULAR (antes: "todo local" o "toda la
 * nube", con riesgo de perder registros si había cambios a ambos lados).
 * Ahora, al detectar diferencias, se comparan las 13 secciones de datos
 * (clientes, cobros, gastos, depósitos, retiros, inventario, asignaciones,
 * inversiones, planes, equipos de red, descuentos, eventos y snapshots) por
 * cantidad de registros y por contenido (id a id), y se ofrece:
 *   - Reemplazar local con la copia de Drive.
 *   - Sobrescribir Drive con la copia local.
 *   - Fusionar: combina ambos lados sin perder ningún registro (si un mismo
 *     id cambió en los dos lados, gana la versión de Drive).
 * Se puede entrar al detalle de cada sección para ver, registro a registro,
 * qué cambió, campo por campo.
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
// CONFIGURACIÓN — la URL/token se guardan en localStorage del dispositivo
// (los introduce el usuario). Respaldo opcional para desarrollo: un archivo
// 'js/storage/drive-config.js' (en .gitignore) con window.RN_DRIVE_CONFIG.
// ---------------------------------------------------------------
RN.drive.KEY_URL = 'rn_drive_url';     // URL del Web App, guardada SOLO en este dispositivo
RN.drive.KEY_TOKEN = 'rn_drive_token'; // token, guardado SOLO en este dispositivo

RN.drive._leerCred = function (key, campoCfg) {
  var v = '';
  try { v = (localStorage.getItem(key) || '').trim(); } catch (e) {}
  if (v) return v;
  return (window.RN_DRIVE_CONFIG && window.RN_DRIVE_CONFIG[campoCfg]) || ('PEGA_AQUI_' + campoCfg.toUpperCase());
};
Object.defineProperty(RN.drive, 'APPS_SCRIPT_URL', { configurable: true, get: function () { return RN.drive._leerCred(RN.drive.KEY_URL, 'url'); } });
Object.defineProperty(RN.drive, 'APPS_SCRIPT_TOKEN', { configurable: true, get: function () { return RN.drive._leerCred(RN.drive.KEY_TOKEN, 'token'); } });

RN.drive.KEY_ACTIVO = 'rn_drive_activo'; // '1' si la sincronización está activada
RN.drive.KEY_ULT_SINCRO = 'rn_drive_ultima_sincro'; // fechaISO que hay en la nube
RN.drive.KEY_ULT_CAMBIO = 'rn_ultimo_cambio_local'; // fechaISO del último cambio local
RN.drive.DEBOUNCE_MS = 15000; // sube como máx. 1 vez cada 15 s tras un cambio

RN.drive._timer = null;
RN.drive._pendiente = false;
RN.drive._ultimoError = null;
RN.drive._datosRemotosPendientes = null; // paquete {fechaISO, data} en conflicto, a la espera de resolución
RN.drive._conflictoAbierto = false; // evita subir por encima de un conflicto sin resolver

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
// Configuración de credenciales (URL + token) desde la app
// ---------------------------------------------------------------

/** Diálogo para introducir/cambiar/borrar la URL y el token del Apps Script. */
RN.drive.configurar = function () {
  var esc = RN.render.esc;
  var tieneGuardado = false;
  try { tieneGuardado = !!(localStorage.getItem(RN.drive.KEY_URL) || localStorage.getItem(RN.drive.KEY_TOKEN)); } catch (e) {}
  var urlAct = RN.drive._configurado() ? RN.drive.APPS_SCRIPT_URL : '';
  var html =
    '<div class="modal-header"><h3>🔑 Credenciales de Google Drive</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<label>URL del Web App (termina en /exec)</label>' +
      '<input id="drive-cfg-url" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/.../exec" value="' + esc(urlAct) + '">' +
      '<label class="mt-16">Token</label>' +
      '<input id="drive-cfg-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (RN.drive._configurado() ? '•••••••• (déjalo vacío para conservar el actual)' : 'Pega aquí tu token') + '">' +
      '<p class="muted mt-16" style="font-size:12px">Se guardan únicamente en este dispositivo. No forman parte de la app instalada ni de ningún archivo compartido.</p>' +
    '</div>' +
    '<div class="modal-footer" style="flex-wrap:wrap">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
      (tieneGuardado ? '<button class="btn danger" onclick="RN.drive._borrarCredenciales()">Borrar</button>' : '') +
      '<button class="btn primary" onclick="RN.drive._guardarCredenciales()">Guardar</button>' +
    '</div>';
  RN.uiComponents.modal(html);
};

RN.drive._guardarCredenciales = function () {
  var url = (document.getElementById('drive-cfg-url').value || '').trim();
  var token = (document.getElementById('drive-cfg-token').value || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+/.test(url)) {
    RN.notifyUI.toast('La URL debe empezar por https://script.google.com/', 'error', 6000);
    return;
  }
  if (!token && !RN.drive._configurado()) {
    RN.notifyUI.toast('Falta el token', 'error');
    return;
  }
  try {
    localStorage.setItem(RN.drive.KEY_URL, url);
    if (token) localStorage.setItem(RN.drive.KEY_TOKEN, token);
  } catch (e) {
    RN.notifyUI.toast('No se pudieron guardar las credenciales', 'error');
    return;
  }
  RN.uiComponents.cerrarModal();
  RN.drive._ultimoError = null;
  RN.notifyUI.toast('Credenciales guardadas en este dispositivo', 'success');
  RN.drive._refrescarUI();
  if (!RN.drive.cuenta()) RN.drive.conectar();
};

RN.drive._borrarCredenciales = function () {
  try {
    localStorage.removeItem(RN.drive.KEY_URL);
    localStorage.removeItem(RN.drive.KEY_TOKEN);
    localStorage.removeItem(RN.drive.KEY_ACTIVO);
  } catch (e) {}
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('Credenciales borradas de este dispositivo', 'success');
  RN.drive._refrescarUI();
};

// ---------------------------------------------------------------
// Activar / desactivar sincronización
// ---------------------------------------------------------------

/** Activa la sincronización y hace la 1.ª subida/comparación. */
RN.drive.conectar = async function () {
  if (!RN.drive._configurado()) {
    RN.drive.configurar();
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
  // Si hay un conflicto sin resolver en pantalla, no auto-subir por encima:
  // podría pisar la decisión pendiente del usuario.
  if (RN.drive._conflictoAbierto) return;
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

/** Botón "Comparar con la nube ahora" de Ajustes (fuerza el chequeo de conflictos). */
RN.drive.compararAhora = function () {
  if (!RN.drive.cuenta()) { RN.drive.conectar(); return; }
  RN.notifyUI.toast('Comparando con Google Drive…', 'info');
  return RN.drive.compararAlArrancar();
};

// ---------------------------------------------------------------
// Arranque / reintentos
// ---------------------------------------------------------------

RN.drive.init = function () {
  // Reintento cuando vuelva la red (subida pendiente por estar offline).
  window.addEventListener('online', function () {
    if (RN.drive._pendiente && !RN.drive._conflictoAbierto) RN.drive.subirAutomatica(true);
  });
  // Reintento periódico — si una subida falla (red intermitente, error del
  // script) queda pendiente para siempre si solo dependiéramos de 'online'.
  setInterval(function () {
    if (RN.drive._pendiente && RN.drive.cuenta() && !RN.drive._conflictoAbierto) {
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

// ---------------------------------------------------------------
// Comparación local vs nube — v5.32.0: diff granular por sección/registro
// ---------------------------------------------------------------

/** Secciones con arrays de registros con id único, en el orden en que se muestran. */
RN.drive.SECCIONES = [
  { key: 'clients', label: 'Clientes', icon: '👤' },
  { key: 'history', label: 'Cobros', icon: '💵' },
  { key: 'gastos', label: 'Gastos', icon: '🧾' },
  { key: 'depositos', label: 'Depósitos', icon: '➕' },
  { key: 'retiros', label: 'Retiros', icon: '➖' },
  { key: 'inventario', label: 'Inventario', icon: '📦' },
  { key: 'asignacionesInventario', label: 'Asignaciones', icon: '🔧' },
  { key: 'investments', label: 'Inversiones', icon: '💰' },
  { key: 'planes', label: 'Planes', icon: '📶' },
  { key: 'equiposRed', label: 'Equipos de red', icon: '🛰️' },
  { key: 'descuentos', label: 'Descuentos', icon: '🏷️' },
  { key: 'eventos', label: 'Eventos', icon: '📋' },
  { key: 'snapshots', label: 'Snapshots', icon: '📸' }
];

/** Etiqueta legible de un registro según su sección. Tolerante a campos ausentes. */
RN.drive._labelReg = function (key, r) {
  if (!r) return '—';
  var esc = RN.render.esc;
  switch (key) {
    case 'clients':
      return '<strong>' + esc(r.nombre || '?') + '</strong> · Tel: ' + esc(r.telefono || '—') + (r.activo === false ? ' · <span class="badge muted">Inactivo</span>' : '');
    case 'history':
      return (r.fecha || '?') + ' · Cliente: ' + esc(r.clienteId || '?') + ' · $' + (r.monto ?? '?');
    case 'gastos':
      return '<strong>' + esc(r.concepto || '?') + '</strong> · ' + (r.fecha || '?') + ' · $' + (r.montoCup ?? r.monto ?? '?');
    case 'depositos':
      return '<strong>' + esc(r.concepto || '?') + '</strong> · ' + (r.fecha || '?') + ' · $' + (r.monto ?? '?');
    case 'retiros':
      return '<strong>' + esc(r.concepto || '?') + '</strong> · ' + (r.fecha || '?') + ' · $' + (r.monto ?? '?');
    case 'inventario':
      return '<strong>' + esc(r.nombre || '?') + '</strong> · Cant: ' + (r.cantidad ?? '?') + ' · Costo: $' + (r.costo ?? '?');
    case 'asignacionesInventario':
      return 'Cliente: ' + esc(r.clienteId || '?') + ' · Cant: ' + (r.cantidad ?? '?') + ' · ' + (r.fecha || '?');
    case 'investments':
      return '<strong>' + esc(r.nombre || r.concepto || '?') + '</strong> · $' + (r.monto ?? '?') + (r.externo ? ' · Préstamo externo' : '');
    case 'planes':
      return '<strong>' + esc(r.nombre || '?') + '</strong> · ' + (r.megas ?? '?') + 'M · $' + (r.precio ?? '?');
    case 'equiposRed':
      return esc(r.tipo || '?') + (r.modelo ? ' ' + esc(r.modelo) : '') + ' · Cliente: ' + esc(r.clienteId || '?');
    case 'descuentos':
      return 'Cliente: ' + esc(r.clienteId || '?') + ' · $' + (r.monto ?? '?') + ' · ' + (r.fecha || '?');
    case 'eventos':
      return (r.fecha || '?') + ' · ' + esc(r.tipo_evento || '?') + ' · Cliente: ' + esc(r.clienteId || '—');
    case 'snapshots':
      return (r.mes || r.fecha || '?') + ' · ID ' + esc(String(r.id ?? '?'));
    default:
      return JSON.stringify(r).slice(0, 80);
  }
};

/** Compara dos snapshots de datos {clients, history, ...} sección por sección. */
RN.drive._diff = function (local, remoto) {
  var resumen = [];
  var hasDiff = false;

  var filas = RN.drive.SECCIONES.map(function (s) {
    var lArr = local[s.key] || [];
    var dArr = remoto[s.key] || [];
    var d = dArr.length - lArr.length;
    var contenidoDistinto = d === 0 && JSON.stringify(lArr) !== JSON.stringify(dArr);
    var igual = d === 0 && !contenidoDistinto;
    if (d !== 0) { hasDiff = true; resumen.push(s.label + ': local ' + lArr.length + ' vs Drive ' + dArr.length); }
    else if (contenidoDistinto) { hasDiff = true; resumen.push(s.label + ': contenido distinto'); }
    return Object.assign({}, s, { local: lArr.length, drive: dArr.length, diff: d, contenidoDistinto: contenidoDistinto, igual: igual });
  });

  // Configuración del negocio (objeto único, no array de registros con id).
  var configIgual = JSON.stringify(local.config || {}) === JSON.stringify(remoto.config || {});
  if (!configIgual) { hasDiff = true; resumen.push('Configuración: distinta'); }

  return { hasDiff: hasDiff, resumen: resumen, filas: filas, configIgual: configIgual };
};

/** Muestra el modal de comparación con la tabla de secciones. */
RN.drive._mostrarConflicto = function (diff, fechaLocalISO, fechaNubeISO) {
  RN.drive._conflictoAbierto = true;
  var fmt = RN.drive._fechaCorta;

  var filasHtml = diff.filas.map(function (f) {
    var mas = f.diff > 0;
    var badge = f.igual
      ? '<span class="badge ok">Igual</span>'
      : (f.diff !== 0
          ? '<span class="badge ' + (mas ? 'paid' : 'warn') + '">' + (mas ? '+' + f.diff + ' en Drive' : (f.diff) + ' en Drive') + '</span>'
          : '<span class="badge warn">Contenido distinto</span>');
    var clickable = !f.igual;
    return '<tr' + (clickable ? ' style="cursor:pointer" onclick="RN.drive._mostrarDetalle(\'' + f.key + '\')"' : '') + '>' +
      '<td>' + f.icon + ' ' + f.label + (clickable ? ' <span class="muted" style="font-size:11px">Ver detalle →</span>' : '') + '</td>' +
      '<td style="text-align:center">' + f.drive + '</td>' +
      '<td style="text-align:center">' + f.local + '</td>' +
      '<td style="text-align:center">' + badge + '</td>' +
    '</tr>';
  }).join('');

  var filaConfig = '<tr' + (diff.configIgual ? '' : ' style="cursor:pointer" onclick="RN.drive._mostrarDetalleConfig()"') + '>' +
    '<td>⚙️ Configuración' + (diff.configIgual ? '' : ' <span class="muted" style="font-size:11px">Ver detalle →</span>') + '</td>' +
    '<td style="text-align:center" colspan="2">—</td>' +
    '<td style="text-align:center">' + (diff.configIgual ? '<span class="badge ok">Igual</span>' : '<span class="badge warn">Distinta</span>') + '</td>' +
  '</tr>';

  var html =
    '<div class="modal-header"><h3>☁️ Diferencias con Google Drive</h3><button class="close" onclick="RN.drive._cerrarConflictoSinResolver()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="flex wrap" style="gap:10px;margin-bottom:14px">' +
        '<div class="card" style="flex:1;min-width:160px;padding:10px 12px"><div class="muted" style="font-size:11px">📱 Guardado local</div><div style="font-weight:600">' + fmt(fechaLocalISO) + '</div></div>' +
        '<div class="card" style="flex:1;min-width:160px;padding:10px 12px"><div class="muted" style="font-size:11px">☁️ Guardado en Drive</div><div style="font-weight:600">' + fmt(fechaNubeISO) + '</div></div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr><th style="text-align:left">Sección</th><th>☁️ Drive</th><th>📱 Local</th><th>Estado</th></tr></thead>' +
        '<tbody>' + filasHtml + filaConfig + '</tbody>' +
      '</table>' +
      '<p class="muted mt-16" style="font-size:12px">Toca una sección con diferencias para ver el detalle registro por registro.</p>' +
    '</div>' +
    '<div class="modal-footer" style="flex-wrap:wrap">' +
      '<button class="btn ghost" onclick="RN.drive._cerrarConflictoSinResolver()">Decidir después</button>' +
      '<button class="btn" onclick="RN.drive._confirmarSobrescribirDrive()">📱 Sobrescribir Drive</button>' +
      '<button class="btn" onclick="RN.drive._confirmarReemplazarLocal()">☁️ Reemplazar local</button>' +
      '<button class="btn primary" onclick="RN.drive._confirmarFusionar()">🔀 Fusionar (recomendado)</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/** Detalle campo por campo de una sección, con registros solo-en-Drive / solo-local / modificados. */
RN.drive._mostrarDetalle = function (key) {
  if (!RN.drive._datosRemotosPendientes) return;
  var local = RN.drive._datosLocalesActuales;
  var remoto = RN.drive._datosRemotosPendientes.data;
  var lArr = local[key] || [];
  var dArr = remoto[key] || [];

  var lMap = {}; lArr.forEach(function (r) { if (r.id != null) lMap[r.id] = r; });
  var dMap = {}; dArr.forEach(function (r) { if (r.id != null) dMap[r.id] = r; });
  var todosIds = Array.from(new Set(lArr.map(function (r) { return r.id; }).concat(dArr.map(function (r) { return r.id; }))));

  var soloEnDrive = [], soloEnLocal = [], modificados = [];
  todosIds.forEach(function (id) {
    var l = lMap[id], d = dMap[id];
    if (!l && d) { soloEnDrive.push(d); return; }
    if (l && !d) { soloEnLocal.push(l); return; }
    if (JSON.stringify(l) !== JSON.stringify(d)) modificados.push({ local: l, drive: d });
  });

  var sec = RN.drive.SECCIONES.find(function (s) { return s.key === key; }) || { label: key, icon: '·' };
  var html = RN.drive._renderDetalleHtml(sec, lArr.length, dArr.length, soloEnDrive, soloEnLocal, modificados, key);
  RN.uiComponents.modal(html, { lg: true });
};

RN.drive._mostrarDetalleConfig = function () {
  if (!RN.drive._datosRemotosPendientes) return;
  var local = RN.drive._datosLocalesActuales.config || {};
  var remoto = RN.drive._datosRemotosPendientes.data.config || {};
  var html =
    '<div class="modal-header"><h3>⚙️ Configuración — detalle</h3><button class="close" onclick="RN.drive._mostrarConflicto(RN.drive._ultimoDiff, RN.drive._ultimaFechaLocal, RN.drive._ultimaFechaNube)">×</button></div>' +
    '<div class="modal-body">' + RN.drive._diffCampos(local, remoto) + '</div>' +
    '<div class="modal-footer"><button class="btn ghost" onclick="RN.drive._mostrarConflicto(RN.drive._ultimoDiff, RN.drive._ultimaFechaLocal, RN.drive._ultimaFechaNube)">← Volver</button></div>';
  RN.uiComponents.modal(html, { lg: true });
};

RN.drive._renderDetalleHtml = function (sec, nLocal, nDrive, soloEnDrive, soloEnLocal, modificados, key) {
  var esc = RN.render.esc;
  var html = '<div class="modal-header"><h3>' + sec.icon + ' ' + esc(sec.label) + ' — detalle</h3><button class="close" onclick="RN.drive._mostrarConflicto(RN.drive._ultimoDiff, RN.drive._ultimaFechaLocal, RN.drive._ultimaFechaNube)">×</button></div>';
  html += '<div class="modal-body">';
  html += '<p class="muted" style="font-size:12px">📱 Local: ' + nLocal + ' · ☁️ Drive: ' + nDrive + '</p>';

  if (soloEnDrive.length) {
    html += '<h4 style="margin-top:14px">☁️ Solo en Drive (' + soloEnDrive.length + ')</h4>';
    html += soloEnDrive.map(function (r) { return '<div class="card" style="padding:8px 12px;margin-bottom:5px;font-size:13px">' + RN.drive._labelReg(key, r) + '</div>'; }).join('');
  }
  if (soloEnLocal.length) {
    html += '<h4 style="margin-top:14px">📱 Solo en local (' + soloEnLocal.length + ')</h4>';
    html += soloEnLocal.map(function (r) { return '<div class="card" style="padding:8px 12px;margin-bottom:5px;font-size:13px">' + RN.drive._labelReg(key, r) + '</div>'; }).join('');
  }
  if (modificados.length) {
    html += '<h4 style="margin-top:14px">⚡ Modificados (' + modificados.length + ')</h4>';
    html += modificados.map(function (m) {
      return '<details style="margin-bottom:8px" class="card">' +
        '<summary style="cursor:pointer;padding:6px 0">' + RN.drive._labelReg(key, m.local) + '</summary>' +
        '<div style="padding-top:8px">' + RN.drive._diffCampos(m.local, m.drive) + '</div>' +
      '</details>';
    }).join('');
  }
  if (!soloEnDrive.length && !soloEnLocal.length && !modificados.length) {
    html += '<p class="muted">Los registros son idénticos en contenido.</p>';
  }
  html += '</div><div class="modal-footer"><button class="btn ghost" onclick="RN.drive._mostrarConflicto(RN.drive._ultimoDiff, RN.drive._ultimaFechaLocal, RN.drive._ultimaFechaNube)">← Volver</button></div>';
  return html;
};

/** Tabla de campos que cambiaron entre dos versiones de un mismo registro/objeto. */
RN.drive._diffCampos = function (l, d) {
  l = l || {}; d = d || {};
  var claves = Array.from(new Set(Object.keys(l).concat(Object.keys(d)))).filter(function (k) { return k !== 'id'; });
  var cambiadas = claves.filter(function (k) { return JSON.stringify(l[k]) !== JSON.stringify(d[k]); });
  if (!cambiadas.length) return '<p class="muted" style="font-size:12px">Sin diferencias en campos.</p>';
  return cambiadas.map(function (k) {
    var lv = l[k] !== undefined ? JSON.stringify(l[k]) : '—';
    var dv = d[k] !== undefined ? JSON.stringify(d[k]) : '—';
    return '<div style="display:grid;grid-template-columns:100px 1fr 1fr;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">' +
      '<span class="muted">' + k + '</span>' +
      '<div style="word-break:break-all"><span class="muted" style="font-size:10px">📱 Local</span><br>' + RN.render.esc(lv) + '</div>' +
      '<div style="word-break:break-all"><span class="muted" style="font-size:10px">☁️ Drive</span><br>' + RN.render.esc(dv) + '</div>' +
    '</div>';
  }).join('');
};

/** Cierra el modal de conflicto sin resolver: se vuelve a preguntar en el próximo arranque/comparación. */
RN.drive._cerrarConflictoSinResolver = function () {
  RN.uiComponents.cerrarModal();
  RN.drive._conflictoAbierto = false;
};

RN.drive._confirmarReemplazarLocal = function () {
  RN.uiComponents.confirm(
    'Reemplazar datos locales',
    '¿Seguro? Los datos de este equipo serán reemplazados con los de Google Drive. Esta acción no se puede deshacer.',
    function () { RN.drive._reemplazarLocal(); },
    { danger: true }
  );
};

RN.drive._confirmarSobrescribirDrive = function () {
  RN.uiComponents.confirm(
    'Sobrescribir Google Drive',
    '¿Seguro? Los datos en Drive serán reemplazados con los de este equipo. Los registros que solo existan en Drive se perderán.',
    function () { RN.drive._sobrescribirDrive(); },
    { danger: true }
  );
};

RN.drive._confirmarFusionar = function () {
  RN.uiComponents.confirm(
    'Fusionar datos',
    'Se combinarán los datos de Drive y los de este equipo. Si un mismo registro cambió en los dos lados, se conservará la versión de Drive. No se perderá ningún registro.',
    function () { RN.drive._fusionar(); }
  );
};

/** Reemplaza los datos locales con los de Drive. */
RN.drive._reemplazarLocal = function () {
  var paquete = RN.drive._datosRemotosPendientes;
  if (!paquete) return;
  RN.drive._aplicarDatos(paquete.data);
  var fecha = paquete.fechaISO || new Date().toISOString();
  localStorage.setItem(RN.drive.KEY_ULT_SINCRO, fecha);
  localStorage.setItem(RN.drive.KEY_ULT_CAMBIO, fecha);
  RN.drive._datosRemotosPendientes = null;
  RN.drive._conflictoAbierto = false;
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('✅ Datos reemplazados con la versión de Google Drive', 'success');
  setTimeout(function () { location.reload(); }, 800);
};

/** Sube los datos locales tal cual, sobrescribiendo Drive. */
RN.drive._sobrescribirDrive = async function () {
  RN.drive._datosRemotosPendientes = null;
  RN.drive._conflictoAbierto = false;
  RN.uiComponents.cerrarModal();
  await RN.drive.subirAutomatica(false);
};

/** Fusiona Drive + local sección por sección (unión por id; empata gana Drive). */
RN.drive._fusionar = async function () {
  var paquete = RN.drive._datosRemotosPendientes;
  if (!paquete) return;
  var remoto = paquete.data;
  var local = RN.drive._datosLocalesActuales;
  var merged = Object.assign({}, local);

  RN.drive.SECCIONES.forEach(function (s) {
    var localArr = local[s.key] || [];
    var driveArr = remoto[s.key] || [];
    if (!localArr.length && !driveArr.length) { merged[s.key] = []; return; }

    var localMap = {}; localArr.forEach(function (r) { if (r.id != null) localMap[r.id] = r; });
    var driveMap = {}; driveArr.forEach(function (r) { if (r.id != null) driveMap[r.id] = r; });
    var allIds = Array.from(new Set(localArr.map(function (r) { return r.id; }).concat(driveArr.map(function (r) { return r.id; }))));

    // Drive tiene prioridad en caso de que el mismo id exista en ambos lados con contenido distinto.
    merged[s.key] = allIds.map(function (id) { return driveMap[id] || localMap[id]; }).filter(Boolean);
  });

  // Configuración: se conserva la local (contiene tasa de cambio y ajustes que
  // se suelen tocar desde varios equipos; el usuario puede reconfigurar si
  // prefiere los valores de Drive).
  merged.config = local.config;
  merged.reciboCounter = Math.max(local.reciboCounter || 0, remoto.reciboCounter || 0);
  merged.mesActual = local.mesActual || remoto.mesActual;

  RN.drive._aplicarDatos(merged);
  RN.drive._datosRemotosPendientes = null;
  RN.drive._conflictoAbierto = false;
  RN.uiComponents.cerrarModal();

  RN.notifyUI.toast('🔀 Fusionando y guardando en Drive…', 'info');
  await RN.drive.subirAutomatica(true);
  RN.notifyUI.toast('✅ Datos fusionados correctamente', 'success');
  setTimeout(function () { location.reload(); }, 800);
};

/** Compara local vs nube al abrir la app (o al pedirlo manualmente). */
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

  var datosLocales = JSON.parse(RN.storageLocal.serializar());
  var diff = RN.drive._diff(datosLocales, paquete.data);

  if (!diff.hasDiff) {
    RN.notifyUI.toast('☁️ Copia de Google Drive al día (' + RN.drive._fechaCorta(paquete.fechaISO) + ')', 'info');
    RN.drive._refrescarUI();
    return;
  }

  // Hay diferencias: guardar el estado para el modal y mostrar comparación.
  RN.drive._datosLocalesActuales = datosLocales;
  RN.drive._datosRemotosPendientes = paquete;
  RN.drive._ultimoDiff = diff;
  RN.drive._ultimaFechaLocal = local.ultCambio;
  RN.drive._ultimaFechaNube = paquete.fechaISO;
  RN.drive._mostrarConflicto(diff, local.ultCambio, paquete.fechaISO);
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
  if (!RN.drive._configurado()) return 'Sin configurar: pulsa "🔑 Configurar URL y token" e introduce los datos de tu Web App de Apps Script.';
  if (!c) return 'Copia en Drive desactivada — la copia solo se guarda en este teléfono.';
  var ult = localStorage.getItem(RN.drive.KEY_ULT_SINCRO);
  var txt = 'Cuenta: ' + c + ' · Última copia: ' + (ult ? RN.drive._fechaCorta(ult) : 'pendiente');
  if (RN.drive._conflictoAbierto) txt += ' · ⚠️ hay diferencias sin resolver con Drive';
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
