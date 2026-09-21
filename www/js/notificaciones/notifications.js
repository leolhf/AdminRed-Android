/**
 * notificaciones/notifications.js — Notificaciones locales.
 *
 * v5.25.0 — Soporte NATIVO (APK) + WEB:
 *   - Dentro del APK (Capacitor) usa el plugin @capacitor/local-notifications,
 *     que lanza notificaciones REALES del sistema Android (con permiso real,
 *     canales de alta prioridad y programación en segundo plano).
 *   - En el navegador (PWA) sigue usando la Web Notifications API.
 *
 * Recordatorios de pago:
 *   - Se revisan cada 4 HORAS (RN.notify.INTERVALO_MS).
 *   - Prioridad PERMANENTE: canal de importancia MÁXIMA (5) y notificaciones
 *     "ongoing" (no se pueden deslizar para descartar) mientras haya clientes
 *     pendientes de pago.
 *   - Además, se programan avisos en SEGUNDO PLANO cada 4 h para que sigan
 *     llegando aunque la app esté cerrada.
 */
RN.notify = RN.notify || {};

// --- Configuración ---
// Intervalo de revisión de recordatorios: 4 horas.
RN.notify.INTERVALO_MS = 4 * 60 * 60 * 1000;

// Canales nativos (Android 8+).
RN.notify.CANAL_RECORDATORIOS = 'adminred-recordatorios';
RN.notify.CANAL_AVISOS = 'adminred-avisos';

// Rangos de IDs de notificación (Android usa enteros de 32 bits).
RN.notify.ID_RECORDATORIO_BASE = 2000; // 2000 + índice de cliente
RN.notify.ID_FONDO_BASE = 2100;        // 2100 + índice (avisos en segundo plano)
RN.notify.ID_AVISO = 3000;             // avisos generales

/** Devuelve el plugin nativo LocalNotifications, o null. */
RN.notify._ln = function () {
  return (RN.platform && RN.platform.plugin) ? RN.platform.plugin('LocalNotifications') : null;
};

/** ¿Podemos usar notificaciones nativas? (APK con el plugin disponible) */
RN.notify._esNativo = function () {
  return !!(RN.platform && RN.platform.esNativo && RN.platform.esNativo() && RN.notify._ln());
};

/**
 * Crea los canales de notificación nativos (idempotente).
 * El canal de recordatorios usa importancia MÁXIMA (5) = prioridad permanente.
 */
RN.notify._crearCanales = async function () {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    await ln.createChannel({
      id: RN.notify.CANAL_RECORDATORIOS,
      name: 'Recordatorios de pago',
      description: 'Avisos de clientes que deben pagar (prioridad alta)',
      importance: 5,      // MAX: aparece como aviso emergente, con sonido y vibración
      visibility: 1,      // visible en pantalla de bloqueo
      vibration: true,
      lights: true,
      lightColor: '#2563eb'
    });
  } catch (e) { /* el canal ya existe */ }
  try {
    await ln.createChannel({
      id: RN.notify.CANAL_AVISOS,
      name: 'Avisos de AdminRed',
      description: 'Confirmaciones y avisos generales de la app',
      importance: 3,      // DEFAULT
      visibility: 1,
      vibration: true
    });
  } catch (e) { /* el canal ya existe */ }
};

/**
 * Pide permiso para mostrar notificaciones.
 *  - APK: permiso real de Android (POST_NOTIFICATIONS en Android 13+).
 *  - Web: Web Notifications API.
 */
RN.notify.requestPermiso = async function () {
  var ln = RN.notify._ln();
  if (ln) {
    try {
      var perm = await ln.checkPermissions();
      if (!perm || perm.display !== 'granted') {
        perm = await ln.requestPermissions();
      }
      if (perm && perm.display === 'granted') {
        await RN.notify._crearCanales();
        RN.notifyUI.toast('Notificaciones activadas', 'success');
        await RN.notify.local('AdminRed', 'Notificaciones activadas correctamente', {
          canal: RN.notify.CANAL_AVISOS, id: RN.notify.ID_AVISO
        });
      } else {
        RN.notifyUI.toast('Permiso de notificaciones denegado', 'warn');
      }
      return;
    } catch (e) {
      console.warn('[notify] permiso nativo falló, usando web:', e);
    }
  }

  // Web (navegador / PWA)
  if (!('Notification' in window)) { RN.notifyUI.toast('Tu navegador no soporta notificaciones', 'warn'); return; }
  var p = await Notification.requestPermission();
  if (p === 'granted') {
    RN.notifyUI.toast('Notificaciones activadas', 'success');
    RN.notify.local('AdminRed', 'Notificaciones activadas correctamente');
  } else {
    RN.notifyUI.toast('Permiso de notificaciones denegado', 'warn');
  }
};

/**
 * Lanza una notificación local.
 *  - APK: notificación nativa del sistema (plugin LocalNotifications).
 *  - Web: Web Notifications API.
 *
 * @param {string} titulo
 * @param {string} cuerpo
 * @param {object} [opts]
 *   - id       {number}  identificador (para reemplazar/actualizar)
 *   - canal    {string}  id del canal nativo (default: avisos)
 *   - ongoing  {boolean} si true, no se puede descartar (prioridad permanente)
 *   - extra    {object}  datos extra (p. ej. { tipo: 'recordatorio' })
 */
RN.notify.local = async function (titulo, cuerpo, opts) {
  opts = opts || {};
  var ln = RN.notify._ln();
  if (ln) {
    try {
      var perm = await ln.checkPermissions();
      if (!perm || perm.display !== 'granted') return;
      await ln.schedule({
        notifications: [{
          id: opts.id || RN.notify.ID_AVISO,
          title: titulo,
          body: cuerpo,
          channelId: opts.canal || RN.notify.CANAL_AVISOS,
          smallIcon: 'ic_stat_adminred',
          ongoing: !!opts.ongoing,
          autoCancel: !opts.ongoing,
          extra: opts.extra || null
        }]
      });
      return;
    } catch (e) {
      console.warn('[notify] notificación nativa falló, usando web:', e);
    }
  }

  // Web
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, { body: cuerpo, icon: 'icons/icon-192.png' });
  } catch (e) { /* silencioso */ }
};

/**
 * Revisa los clientes cuyo día de pago es HOY y aún no han pagado.
 *  - Muestra una notificación por cliente (prioridad permanente).
 *  - Programa (o cancela) los avisos en segundo plano cada 4 h.
 * Se llama al arrancar y cada 4 horas.
 */
RN.notify.revisarRecordatorios = async function () {
  try {
    var mes = RN.calc.mesActualStr();
    var hoy = new Date().getDate();
    var pendientes = RN.calc.clientesActivos().filter(function (c) {
      return c.diaPago === hoy && RN.calc.getStatus(c) !== 'paid';
    });

    if (!pendientes.length) {
      // No hay pendientes: cancelar recordatorios previos (específicos y de fondo).
      await RN.notify._cancelarRecordatorios();
      return;
    }

    // Notificación específica por cada cliente pendiente (prioridad permanente).
    for (var i = 0; i < pendientes.length; i++) {
      var c = pendientes[i];
      await RN.notify.local(
        'Recordatorio de pago',
        c.nombre + ' debe pagar hoy (' + RN.calc.formatCUP(RN.calc.getPrecioNeto(c, mes)) + ')',
        {
          id: RN.notify.ID_RECORDATORIO_BASE + i,
          canal: RN.notify.CANAL_RECORDATORIOS,
          ongoing: true,
          extra: { tipo: 'recordatorio', clienteId: c.id }
        }
      );
    }

    // Programar avisos en segundo plano cada 4 h (por si la app se cierra).
    await RN.notify.programarRecordatoriosFondo(pendientes.length);
  } catch (e) {
    console.warn('[notify] revisarRecordatorios:', e);
  }
};

/**
 * Programa avisos en SEGUNDO PLANO cada 4 horas (6 al día: 00, 04, 08, 12, 16, 20).
 * Se repiten a diario. Prioridad permanente (canal de importancia máxima).
 * @param {number} [cantidad] número de clientes pendientes (para el texto)
 */
RN.notify.programarRecordatoriosFondo = async function (cantidad) {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    var perm = await ln.checkPermissions();
    if (!perm || perm.display !== 'granted') return;
    await RN.notify._crearCanales();

    // Cancelar programaciones de fondo previas para no duplicar.
    await RN.notify._cancelarFondo();

    var horas = [0, 4, 8, 12, 16, 20];
    var texto = (cantidad && cantidad > 0)
      ? (cantidad + ' cliente' + (cantidad === 1 ? '' : 's') + ' por cobrar hoy. Revisa AdminRed.')
      : 'Revisa los cobros pendientes de hoy en AdminRed.';

    var notifs = horas.map(function (h, i) {
      var at = new Date();
      at.setHours(h, 0, 0, 0);
      if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
      return {
        id: RN.notify.ID_FONDO_BASE + i,
        title: 'Recordatorio de cobros',
        body: texto,
        channelId: RN.notify.CANAL_RECORDATORIOS,
        smallIcon: 'ic_stat_adminred',
        ongoing: true,
        autoCancel: false,
        schedule: { at: at, repeats: true, allowWhileIdle: true },
        extra: { tipo: 'recordatorio-fondo' }
      };
    });

    await ln.schedule({ notifications: notifs });
  } catch (e) {
    console.warn('[notify] programarRecordatoriosFondo:', e);
  }
};

/** Cancela los recordatorios específicos (por cliente). */
RN.notify._cancelarRecordatorios = async function () {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    var pend = await ln.getPending();
    if (!pend || !pend.notifications || !pend.notifications.length) return;
    var aCancelar = pend.notifications
      .filter(function (n) {
        return n.id >= RN.notify.ID_RECORDATORIO_BASE && n.id < RN.notify.ID_RECORDATORIO_BASE + 100;
      })
      .map(function (n) { return { id: n.id }; });
    if (aCancelar.length) await ln.cancel({ notifications: aCancelar });
  } catch (e) { /* silencioso */ }
};

/** Cancela los avisos de fondo programados. */
RN.notify._cancelarFondo = async function () {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    var pend = await ln.getPending();
    if (!pend || !pend.notifications || !pend.notifications.length) return;
    var aCancelar = pend.notifications
      .filter(function (n) {
        return n.id >= RN.notify.ID_FONDO_BASE && n.id < RN.notify.ID_FONDO_BASE + 100;
      })
      .map(function (n) { return { id: n.id }; });
    if (aCancelar.length) await ln.cancel({ notifications: aCancelar });
  } catch (e) { /* silencioso */ }
};

/**
 * Inicializa las notificaciones:
 *  - Crea los canales nativos.
 *  - Escucha el toque sobre un recordatorio para abrir la pestaña de Cobros.
 */
RN.notify.init = function () {
  RN.notify._crearCanales();

  var ln = RN.notify._ln();
  if (ln && ln.addListener) {
    try {
      ln.addListener('localNotificationActionPerformed', function (ev) {
        var extra = ev && ev.notification && ev.notification.extra;
        if (extra && (extra.tipo === 'recordatorio' || extra.tipo === 'recordatorio-fondo')) {
          try { RN.tabs.ir('cobros'); } catch (e) {}
        }
      });
    } catch (e) { /* no soportado */ }
  }
};
