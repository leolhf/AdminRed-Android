/**
 * notificaciones/wa-templates.js — Plantillas de texto para WhatsApp con marcadores.
 * Marcadores: {nombre}, {precioBase}, {descuentoRecurrente}, {descuentoLinea},
 * {precioNeto}, {reciboNum}, {mes}, {negocio}, {telefonoNegocio}
 * v5.48.0: {precioUSD}, {precioCUP}, {tasa}. Para clientes con precio fijo en USD,
 * {precioNeto} y {precioBase} salen siempre en ambas monedas ("18,800.00 CUP / $35.00 USD (1 USD = 537 CUP)").
 */
RN.waTemplates = RN.waTemplates || {};

RN.waTemplates.DEFAULTS = {
  recordatorio: 'Hola {nombre} 👋\n\nTu servicio de internet ({negocio}) — {mes}.\n\n📅 Ciclo de cobro: {cicloCobro}\n   (días hábiles para realizar el pago)\n\n💰 Monto: {precioNeto}\n\nPuedes pagar dentro de esa ventana. Si ya pagaste, ignora este mensaje.\n\nGracias.',
  comprobante: '✅ {negocio}\nComprobante de pago N° {reciboNum}\nCliente: {nombre}\nMes: {mes}\nTotal: {precioNeto}\nGracias por tu pago.',
  mora: 'Hola {nombre}, tu servicio tiene {mora} mes(es) de atraso.\n\n💰 Saldo pendiente: {precioNeto}\n📅 Tu ciclo de cobro era {cicloCobro}.\n\nRegulariza tu pago para evitar suspensión. — {negocio}'
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
    .replace(/{precioUSD}/g, ctx.precioUSD || '')
    .replace(/{precioCUP}/g, ctx.precioCUP || '')
    .replace(/{tasa}/g, ctx.tasa || '')
    .replace(/{reciboNum}/g, ctx.reciboNum || '')
    .replace(/{mes}/g, ctx.mes || '')
    .replace(/{diaPago}/g, ctx.diaPago || '')
    .replace(/{cicloCobro}/g, ctx.cicloCobro || '')
    .replace(/{ventanaCobro}/g, ctx.cicloCobro || '')
    .replace(/{mora}/g, ctx.mora || '0')
    .replace(/{negocio}/g, ctx.negocio || RN.state.config.nombreNegocio || 'AdminRed')
    .replace(/{telefonoNegocio}/g, ctx.telefonoNegocio || RN.state.config.telefonoNegocio || '');
};

/**
 * v5.55.36: monto del servicio siempre en las dos monedas.
 * Formato: "X CUP / $Y USD (tasa Z)" — si no hay tasa, solo CUP.
 */
RN.waTemplates.montoDual = function (usd, cup, tasa) {
  var cupTxt = RN.calc.formatCUP(+cup || 0);
  var tasaN = +tasa || 0;
  var usdN = +usd || 0;
  if (!(tasaN > 0) && usdN <= 0) return cupTxt;
  if (usdN <= 0 && tasaN > 0) usdN = +((+cup || 0) / tasaN).toFixed(2);
  var usdTxt = '$' + usdN.toFixed(2) + ' USD';
  if (tasaN > 0) return cupTxt + ' / ' + usdTxt + ' (1 USD = ' + tasaN + ' CUP)';
  return cupTxt + ' / ' + usdTxt;
};

/** Helper: formatea un monto CUP siempre dual (usa tasa vigente o la indicada). */
RN.waTemplates.montoDesdeCUP = function (cup, tasa) {
  tasa = +tasa || (RN.moneda && RN.moneda.tasa ? RN.moneda.tasa() : 0) || 0;
  var usd = tasa > 0 ? +((+cup || 0) / tasa).toFixed(2) : 0;
  return RN.waTemplates.montoDual(usd, cup, tasa);
};

RN.waTemplates.abrir = function () {
  const tpls = RN.waTemplates.cargar();
  const html = `
    <div class="modal-header"><h3>Plantillas de WhatsApp</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <p class="muted mb-16">Marcadores: {nombre} {precioBase} {descuentoRecurrente} {descuentoLinea} {precioNeto} {precioUSD} {precioCUP} {tasa} {reciboNum} {mes} {diaPago} {cicloCobro} {mora} {negocio}</p>
      <div class="form-row"><div><label>Recordatorio de pago</label><textarea lang="es" id="wa-rec" rows="3" spellcheck="true" autocorrect="on" autocapitalize="sentences">${RN.render.esc(tpls.recordatorio)}</textarea></div></div>
      <div class="form-row"><div><label>Comprobante de pago</label><textarea lang="es" id="wa-comp" rows="4" spellcheck="true" autocorrect="on" autocapitalize="sentences">${RN.render.esc(tpls.comprobante)}</textarea></div></div>
      <div class="form-row"><div><label>Aviso de mora</label><textarea lang="es" id="wa-mora" rows="3" spellcheck="true" autocorrect="on" autocapitalize="sentences">${RN.render.esc(tpls.mora)}</textarea></div></div>
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
