/**
 * notificaciones/whatsapp.js — Envío de recordatorios y recibos por WhatsApp.
 * Usa enlaces wa.me (sin API paga). Abre WhatsApp con el mensaje prellenado.
 */
RN.whatsapp = RN.whatsapp || {};

/** Normaliza un teléfono a formato internacional sin + ni espacios. */
RN.whatsapp.normalizarTel = function (tel) {
  if (!tel) return '';
  let t = tel.replace(/[^\d]/g, '');
  // Si empieza con 0, quitarlo; si no tiene código de país asumir 53 (Cuba)
  if (t.startsWith('0')) t = t.slice(1);
  // v5.13.5 (ISSUE #20): Aceptar 7 u 8 dígitos (sin código de país) para añadir
  // el prefijo 53. Antes solo se verificaba t.length === 8, pero tras quitar un
  // 0 inicial de un número de 8 dígitos quedaban 7 y NO se añadía el prefijo,
  // produciendo un número inválido para WhatsApp.
  if ((t.length === 7 || t.length === 8) && !t.startsWith('53')) t = '53' + t;
  return t;
};

/** Abre WhatsApp con un número y mensaje. */
RN.whatsapp.enviar = function (tel, mensaje) {
  const num = RN.whatsapp.normalizarTel(tel);
  if (!num) { RN.notifyUI.toast('El cliente no tiene teléfono válido', 'warn'); return; }
  const url = `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
};

/** Envía recordatorio de pago a un cliente. */
RN.whatsapp.enviarRecordatorio = function (clienteId) {
  const c = RN.state.clients.find(x => x.id === clienteId);
  if (!c) return;
  if (!c.telefono) { RN.notifyUI.toast('El cliente no tiene teléfono', 'warn'); return; }
  const tpls = RN.waTemplates.cargar();
  const mes = RN.calc.mesActualStr();
  const mora = RN.calc.getMora(c);
  const tpl = mora > 0 ? tpls.mora : tpls.recordatorio;
  const ctx = {
    nombre: c.nombre,
    precioBase: RN.calc.formatCUP(RN.calc.getPrecioBase(c)),
    descuentoRecurrente: RN.calc.formatCUP(RN.calc.getDescuentoRecurrente(c)),
    descuentoLinea: RN.calc.formatCUP(RN.calc.getDescuentosPuntualesMes(c.id, mes)),
    precioNeto: RN.calc.formatCUP(RN.calc.getPrecioNeto(c, mes)),
    mes: RN.calc.mesTexto(RN.calc.mesActualStr()),
    diaPago: c.diaPago || 1,
    mora: String(mora)
  };
  RN.whatsapp.enviar(c.telefono, RN.waTemplates.rellenar(tpl, ctx));
};

/** Envía comprobante de pago por WhatsApp tras registrar un cobro. */
RN.whatsapp.enviarComprobante = function (cobroId) {
  const h = RN.state.history.find(x => x.id === cobroId);
  if (!h) return;
  const c = RN.state.clients.find(x => x.id === h.clienteId);
  if (!c || !c.telefono) { RN.notifyUI.toast('El cliente no tiene teléfono', 'warn'); return; }
  const tpls = RN.waTemplates.cargar();
  const total = (h.monto || 0) + (h.montoEquipo || 0);
  const ctx = {
    nombre: c.nombre,
    precioNeto: RN.calc.formatCUP(total),
    reciboNum: h.reciboNum || '',
    mes: h.mes || ''
  };
  RN.whatsapp.enviar(c.telefono, RN.waTemplates.rellenar(tpls.comprobante, ctx));
};

/** Envía recordatorios masivos a todos los que aún no han pagado. */
RN.whatsapp.enviarMasivo = function () {
  const pendientes = RN.calc.clientesActivos().filter(c => RN.calc.getStatus(c) !== 'paid' && c.telefono);
  if (!pendientes.length) { RN.notifyUI.toast('No hay clientes pendientes con teléfono', 'warn'); return; }
  RN.uiComponents.confirm(
    'Recordatorio masivo',
    `Se abrirán ${pendientes.length} pestañas de WhatsApp. ¿Continuar?`,
    () => {
      pendientes.forEach((c, i) => {
        setTimeout(() => RN.whatsapp.enviarRecordatorio(c.id), i * 800);
      });
      RN.notifyUI.toast(`Enviando ${pendientes.length} recordatorios...`, 'info');
    }
  );
};

/**
 * v5.13.10 (BUG-1): Envía recordatorios masivos a una lista EXPLÍCITA de IDs.
 * Antes _recordarTodosDia del calendario llamaba a enviarMasivo() (global),
 * que enviaba a TODOS los pendientes de la red en vez del día abierto.
 * Esta versión recibe la lista ya filtrada por el llamador.
 */
RN.whatsapp.enviarMasivoLista = function (clienteIds) {
  var ids = Array.isArray(clienteIds) ? clienteIds : [];
  var clientes = ids
    .map(function (id) { return RN.state.clients.find(function (c) { return c.id === id; }); })
    .filter(function (c) { return c && c.telefono; });
  if (!clientes.length) {
    RN.notifyUI.toast('Ningún cliente de la lista tiene teléfono', 'warn');
    return;
  }
  var self = this;
  RN.uiComponents.confirm(
    'Recordatorio masivo',
    'Se abrirán ' + clientes.length + ' pestaña' + (clientes.length !== 1 ? 's' : '') +
      ' de WhatsApp. ¿Continuar?',
    function () {
      clientes.forEach(function (c, i) {
        setTimeout(function () { RN.whatsapp.enviarRecordatorio(c.id); }, i * 800);
      });
      RN.notifyUI.toast('Enviando ' + clientes.length + ' recordatorio' +
        (clientes.length !== 1 ? 's' : '') + '...', 'info');
    }
  );
};
