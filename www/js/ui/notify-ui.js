/**
 * ui/notify-ui.js — Notificaciones visuales dentro de la UI (toasts).
 */
RN.notifyUI = RN.notifyUI || {};

RN.notifyUI.toast = function (msg, tipo, duracion) {
  tipo = tipo || 'info';
  duracion = duracion || 3000;
  const cont = document.getElementById('notify-container');
  if (!cont) { console.log('[toast]', msg); return; }
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  const icono = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' }[tipo] || 'ℹ️';
  el.innerHTML = `<span>${icono}</span><span>${msg}</span>`;
  cont.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, duracion);
};
