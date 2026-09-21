/**
 * notificaciones/wa-templates.js — Plantillas de texto para WhatsApp con marcadores.
 * Marcadores: {nombre}, {precioBase}, {descuentoRecurrente}, {descuentoLinea},
 * {precioNeto}, {reciboNum}, {mes}, {negocio}, {telefonoNegocio}
 */
RN.waTemplates = RN.waTemplates || {};

RN.waTemplates.DEFAULTS = {
  recordatorio: 'Hola {nombre}, te recordamos que tu pago mensual del servicio de internet de {mes} es de {precioNeto}. Día de pago: el {diaPago}. Gracias — {negocio}.',
  comprobante: '✅ {negocio}\nComprobante de pago N° {reciboNum}\nCliente: {nombre}\nMes: {mes}\nTotal: {precioNeto}\nGracias por tu pago.',
  mora: 'Hola {nombre}, tu servicio tiene {mora} mes(es) de atraso. Saldo pendiente: {precioNeto}. Regulariza tu pago para evitar suspensión. — {negocio}'
};

RN.waTemplates.cargar = function () {
  const raw = localStorage.getItem(STORAGE_KEYS.WA_TEMPLATES);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return { ...RN.waTemplates.DEFAULTS };
};

RN.waTemplates.guardar = function (tpls) {
  localStorage.setItem(STORAGE_KEYS.WA_TEMPLATES, JSON.stringify(tpls));
};

/** Rellena los marcadores de una plantilla con datos de cliente/cobro. */
RN.waTemplates.rellenar = function (tpl, ctx) {
  return tpl
    .replace(/{nombre}/g, ctx.nombre || '')
    .replace(/{precioBase}/g, ctx.precioBase || '')
    .replace(/{descuentoRecurrente}/g, ctx.descuentoRecurrente || '')
    .replace(/{descuentoLinea}/g, ctx.descuentoLinea || '')
    .replace(/{precioNeto}/g, ctx.precioNeto || '')
    .replace(/{reciboNum}/g, ctx.reciboNum || '')
    .replace(/{mes}/g, ctx.mes || '')
    .replace(/{diaPago}/g, ctx.diaPago || '')
    .replace(/{mora}/g, ctx.mora || '0')
    .replace(/{negocio}/g, ctx.negocio || RN.state.config.nombreNegocio || 'AdminRed')
    .replace(/{telefonoNegocio}/g, ctx.telefonoNegocio || RN.state.config.telefonoNegocio || '');
};

RN.waTemplates.abrir = function () {
  const tpls = RN.waTemplates.cargar();
  const html = `
    <div class="modal-header"><h3>Plantillas de WhatsApp</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <p class="muted mb-16">Marcadores disponibles: {nombre} {precioBase} {descuentoRecurrente} {descuentoLinea} {precioNeto} {reciboNum} {mes} {diaPago} {mora} {negocio}</p>
      <div class="form-row"><div><label>Recordatorio de pago</label><textarea id="wa-rec" rows="3">${RN.render.esc(tpls.recordatorio)}</textarea></div></div>
      <div class="form-row"><div><label>Comprobante de pago</label><textarea id="wa-comp" rows="4">${RN.render.esc(tpls.comprobante)}</textarea></div></div>
      <div class="form-row"><div><label>Aviso de mora</label><textarea id="wa-mora" rows="3">${RN.render.esc(tpls.mora)}</textarea></div></div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.waTemplates.guardarForm()">Guardar</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};

RN.waTemplates.guardarForm = function () {
  const tpls = {
    recordatorio: document.getElementById('wa-rec').value,
    comprobante: document.getElementById('wa-comp').value,
    mora: document.getElementById('wa-mora').value
  };
  RN.waTemplates.guardar(tpls);
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('Plantillas guardadas', 'success');
};
