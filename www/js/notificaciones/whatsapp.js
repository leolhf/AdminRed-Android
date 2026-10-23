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
  // v5.48.0: cliente con precio fijo en USD -> se fija la tasa del mensaje (1.ª vez del mes)
  // y el mensaje sale en USD y CUP según la tasa que le corresponde.
  const esUSD = RN.calc.esPrecioUSD(c);
  if (esUSD && RN.calc.fijarTasaMensaje(c, mes)) {
    try { RN.storageLocal.guardar(); } catch (e) { /* silencioso */ }
  }
  // v5.55.36: el monto del servicio se muestra SIEMPRE en CUP y USD
  const tasaMsg = esUSD
    ? (RN.calc.infoTasa(c, mes).tasa || RN.moneda.tasa() || 0)
    : (RN.moneda.tasa() || 0);
  const baseCUP = RN.calc.getPrecioBase(c, mes);
  const netoCUP = RN.calc.getPrecioNeto(c, mes);
  // Incluir mora en el total a comunicar si hay atraso
  var totalCUP = netoCUP;
  try {
    var r = RN.calc.resumenCliente(c, mes);
    if (r && r.moraMonto > 0) totalCUP = +(netoCUP + r.moraMonto).toFixed(2);
  } catch (e) {}
  const baseUSD = esUSD
    ? (RN.calc.totalUSD(c) || 0)
    : (tasaMsg ? +(baseCUP / tasaMsg).toFixed(2) : 0);
  const netoUSD = esUSD
    ? (RN.calc.getPrecioNetoUSD(c, mes) || 0)
    : (tasaMsg ? +(netoCUP / tasaMsg).toFixed(2) : 0);
  const totalUSD = tasaMsg ? +(totalCUP / tasaMsg).toFixed(2) : netoUSD;
  const ctx = {
    nombre: c.nombre,
    precioBase: RN.waTemplates.montoDual(baseUSD, baseCUP, tasaMsg),
    descuentoRecurrente: RN.waTemplates.montoDesdeCUP(RN.calc.getDescuentoRecurrente(c), tasaMsg),
    descuentoLinea: RN.waTemplates.montoDesdeCUP(RN.calc.getDescuentosPuntualesMes(c.id, mes), tasaMsg),
    precioNeto: RN.waTemplates.montoDual(totalUSD, totalCUP, tasaMsg),
    precioUSD: totalUSD ? ('$' + (+totalUSD).toFixed(2) + ' USD') : '',
    precioCUP: RN.calc.formatCUP(totalCUP),
    tasa: tasaMsg ? String(tasaMsg) : '',
    mes: RN.calc.mesTexto(RN.calc.mesActualStr()),
    diaPago: String(c.diaPago || 1),
    cicloCobro: (RN.ciclos && RN.ciclos.ventanaCobro)
      ? RN.ciclos.ventanaCobro(c.diaPago || 1).textoLargo
      : ('día ' + (c.diaPago || 1)),
    mora: String(mora)
  };
  RN.whatsapp.enviar(c.telefono, RN.waTemplates.rellenar(tpl, ctx));

  // v5.26.0 (Opción B): puente WhatsApp -> notificaciones. Al abrir el envío se
  // marca el ciclo como 'wa' (hoy) y se cancela el recordatorio permanente del
  // cliente, para que no reaparezca más en el día. wa.me no da callback de
  // "enviado", así que la marca representa "se abrió el envío".
  try {
    if (RN.notifyState) RN.notifyState.marcar(c.id, c.diaPago, 'wa');
    if (RN.notify && RN.notify.cancelarCliente) RN.notify.cancelarCliente(c.id);
    // v5.52.7: refrescar lista de cobros para mostrar marca visual "notificado"
    if (RN.render && RN.render.cobros) {
      try { RN.render.cobros(); } catch (e2) { /* silencioso */ }
    }
  } catch (e) { /* silencioso */ }
};

/** Envía comprobante de pago por WhatsApp tras registrar un cobro. */
RN.whatsapp.enviarComprobante = function (cobroId) {
  const h = RN.state.history.find(x => x.id === cobroId);
  if (!h) return;
  const c = RN.state.clients.find(x => x.id === h.clienteId);
  if (!c || !c.telefono) { RN.notifyUI.toast('El cliente no tiene teléfono', 'warn'); return; }
  const tpls = RN.waTemplates.cargar();
  const total = RN.calc.ingresoCobro(h);
  const tasa = +(h.tasaUsd || h.tasa || 0) || (RN.moneda && RN.moneda.tasa ? RN.moneda.tasa() : 0) || 0;
  var usd = +(h.montoPagadoUSD || 0);
  if (!(usd > 0) && tasa > 0) usd = +(total / tasa).toFixed(2);
  const ctx = {
    nombre: c.nombre,
    precioNeto: RN.waTemplates.montoDual(usd, total, tasa),
    precioCUP: RN.calc.formatCUP(total),
    precioUSD: usd ? ('$' + usd.toFixed(2) + ' USD') : '',
    tasa: tasa ? String(tasa) : '',
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
