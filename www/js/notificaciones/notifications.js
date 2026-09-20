/**
 * notificaciones/notifications.js — Notificaciones locales (Web Notifications API).
 */
RN.notify = RN.notify || {};

RN.notify.requestPermiso = async function () {
  if (!('Notification' in window)) { RN.notifyUI.toast('Tu navegador no soporta notificaciones', 'warn'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') { RN.notifyUI.toast('Notificaciones activadas', 'success'); RN.notify.local('AdminRed', 'Notificaciones activadas correctamente'); }
  else RN.notifyUI.toast('Permiso de notificaciones denegado', 'warn');
};

RN.notify.local = function (titulo, cuerpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, { body: cuerpo, icon: 'icons/icon-192.png' });
  } catch (e) { /* silencioso */ }
};

/** Revisa clientes cuyo día de pago es hoy y notifica (llamado periódicamente). */
RN.notify.revisarRecordatorios = function () {
  const mes = RN.calc.mesActualStr();
  const hoy = new Date().getDate();
  RN.calc.clientesActivos().forEach(c => {
    if (c.diaPago === hoy && RN.calc.getStatus(c) !== 'paid') {
      RN.notify.local('Recordatorio de pago', `${c.nombre} debe pagar hoy (${RN.calc.formatCUP(RN.calc.getPrecioNeto(c, mes))})`);
    }
  });
};
