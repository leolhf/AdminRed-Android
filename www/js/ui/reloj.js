/**
 * ui/reloj.js — Reloj/fecha en la interfaz.
 */
RN.reloj = RN.reloj || {};

RN.reloj.actualizar = function () {
  const el = document.getElementById('reloj');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('es-CU', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
};

RN.reloj.init = function () {
  RN.reloj.actualizar();
  setInterval(RN.reloj.actualizar, 30000);
};
