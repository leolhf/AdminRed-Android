/**
 * notificaciones/notify-state.js — Estado de recordatorios por CICLO (v5.26.0).
 *
 * Modelo (Opción B): por cada cliente y cada ciclo de cobro
 * (clave = clienteId @ año-mes-diaPago) se guarda si el recordatorio está RESUELTO:
 *   - 'wa'     → se le abrió un recordatorio por WhatsApp; suprime el aviso
 *                SOLO durante el día en que se envió.
 *   - 'pagado' → pagó; suprime y cancela el aviso durante TODO el ciclo.
 *   - 'visto'  → lo gestionó manualmente el operador; igual que 'pagado'.
 *
 * Persistencia: localStorage 'rn_notify_estado' (mismo patrón que
 * 'rn_notify_ultimo' en notifications.js). No requiere backend.
 *
 * Depende de: notifications.js (_claveHoy) — sólo en tiempo de ejecución.
 */
RN.notifyState = RN.notifyState || {};

RN.notifyState.KEY = 'rn_notify_estado';

/** Lee el registro completo (objeto plano). */
RN.notifyState._leer = function () {
  try { return JSON.parse(localStorage.getItem(RN.notifyState.KEY) || '{}'); }
  catch (e) { return {}; }
};

/** Persiste el registro. */
RN.notifyState._escribir = function (reg) {
  try { localStorage.setItem(RN.notifyState.KEY, JSON.stringify(reg)); }
  catch (e) { /* silencioso */ }
};

/** Clave del ciclo actual para un día de pago: 'YYYY-MM-DD'. */
RN.notifyState.cycleKey = function (diaPago) {
  var d = new Date();
  return d.getFullYear() + '-'
    + ('0' + (d.getMonth() + 1)).slice(-2) + '-'
    + ('0' + (diaPago || 1)).slice(-2);
};

RN.notifyState._key = function (clienteId, diaPago) {
  return clienteId + '@' + RN.notifyState.cycleKey(diaPago);
};

/** Devuelve { estado, fecha } del cliente en ese ciclo, o null. */
RN.notifyState.get = function (clienteId, diaPago) {
  return RN.notifyState._leer()[RN.notifyState._key(clienteId, diaPago)] || null;
};

/** Marca el estado ('wa' | 'pagado' | 'visto') del cliente en ese ciclo. */
RN.notifyState.marcar = function (clienteId, diaPago, estado) {
  var reg = RN.notifyState._leer();
  reg[RN.notifyState._key(clienteId, diaPago)] = {
    estado: estado,
    fecha: (RN.notify && RN.notify._claveHoy) ? RN.notify._claveHoy() : ''
  };
  RN.notifyState._podar(reg);
  RN.notifyState._escribir(reg);
};

/** Quita la marca (p. ej. si se deshace una acción). */
RN.notifyState.limpiar = function (clienteId, diaPago) {
  var reg = RN.notifyState._leer();
  delete reg[RN.notifyState._key(clienteId, diaPago)];
  RN.notifyState._escribir(reg);
};

/**
 * ¿El recordatorio de este cliente en este ciclo está resuelto (no debe mostrarse)?
 *   - 'pagado' / 'visto' → resuelto permanentemente en el ciclo.
 *   - 'wa'               → resuelto SOLO si la fecha coincide con HOY.
 */
RN.notifyState.estaResuelto = function (clienteId, diaPago) {
  var e = RN.notifyState.get(clienteId, diaPago);
  if (!e) return false;
  if (e.estado === 'pagado' || e.estado === 'visto') return true;
  if (e.estado === 'wa') {
    var hoy = (RN.notify && RN.notify._claveHoy) ? RN.notify._claveHoy() : '';
    return e.fecha === hoy;
  }
  return false;
};

/** Poda entradas de ciclos anteriores (más de ~40 días). */
RN.notifyState._podar = function (reg) {
  var hoy = (RN.notify && RN.notify._claveHoy) ? RN.notify._claveHoy() : '';
  Object.keys(reg).forEach(function (k) {
    var f = reg[k] && reg[k].fecha;
    if (!f) { delete reg[k]; return; }
    var d1 = new Date(f + 'T00:00:00');
    var d2 = new Date(hoy + 'T00:00:00');
    if (isNaN(d1) || isNaN(d2)) return;
    if ((d2 - d1) > 40 * 24 * 3600 * 1000) delete reg[k];
  });
};
