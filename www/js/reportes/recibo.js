/**
 * reportes/recibo.js — Generación de recibos con numeración auto-incremental (R-YYYY-0000).
 * Soporta pagos combinados USD + CUP con desglose detallado.
 */
RN.recibo = RN.recibo || {};

/** Construye el HTML imprimible de un recibo a partir de un cobro. */
RN.recibo._html = function (h) {
  // v5.14.2 (Auditoría Reportes — DUP-3): usar el helper centralizado.
  const c = RN.calc.clientePorId(h.clienteId);
  const neto = h.monto || 0;
  const eq = h.montoEquipo || 0;
  const total = h.totalCUP || (neto + eq);
  const aPagar = h.totalAPagar || total;
  const cfg = RN.state.config;
  const tasa = h.tasaUsd || RN.moneda.tasa();

  // ====== Campos de pago combinado ======
  const usd = h.montoPagadoUSD || 0;
  const cup = h.montoPagadoCUP || 0;
  const cupDesdeUSD = h.montoPagadoCUPDesdeUSD || RN.moneda.aCUP(usd);
  const pagadoCUP = h.totalPagadoCUP || (cupDesdeUSD + cup);
  const tipoPago = h.tipoPago || 'completo';
  const falta = h.falta || 0;
  const excedente = h.excedente || 0;
  const moneda = h.moneda || 'CUP';

  const lineas = [];
  // v5.13.5 (ISSUE #11): Las ventas de inventario ahora guardan el precio en
  // h.monto (no en h.montoEquipo). Mostrar el concepto de venta correctamente.
  if (h.tipo === 'venta-inventario') {
    lineas.push(`<div class="row"><span>${h.concepto || 'Venta inventario'}</span><span>${RN.calc.formatCUP(neto)}</span></div>`);
  } else if (h.tipo === 'servicio' || neto > 0) {
    // v5.13.9 (LOG-4): Mes legible (mesTexto) en lugar de ISO crudo
    var mesTxt = h.mes ? RN.calc.mesTexto(h.mes) : '';
    lineas.push(`<div class="row"><span>Servicio mensual ${RN.render.esc(mesTxt)}</span><span>${RN.calc.formatCUP(neto)}</span></div>`);
    // v5.13.8: Mostrar mora (meses atrasados) si el cobro incluye mora
    if (h.montoMora && h.montoMora > 0) {
      lineas.push(`<div class="row" style="color:#c62828"><span>Mora (${h.mora || 0} mes${(h.mora || 0) !== 1 ? 'es' : ''} de atraso)</span><span>${RN.calc.formatCUP(h.montoMora)}</span></div>`);
    }
    if (h.descuentoRecurrente) lineas.push(`<div class="row muted" style="font-size:12px"><span>Descuento recurrente</span><span>− ${RN.calc.formatCUP(h.descuentoRecurrente)}</span></div>`);
  }
  if (eq > 0) {
    lineas.push(`<div class="row"><span>Cuota de equipo</span><span>${RN.calc.formatCUP(eq)}</span></div>`);
  }

  // ====== Sección de moneda y desglose del pago ======
  var seccionPago = '';

  // Total a pagar
  seccionPago += `<div class="row" style="background:#f0f4f8;padding:6px 10px;border-radius:6px;margin:4px 0">
    <span><strong>Total a pagar</strong></span>
    <span><strong>${RN.calc.formatCUP(aPagar)}</strong></span>
  </div>`;

  // ====== Mostrar desglose de lo recibido (USD y/o CUP) ======
  if (usd > 0) {
    seccionPago += `<div class="row" style="background:#e8f5e9;padding:6px 10px;border-radius:6px;margin:4px 0">
      <span><strong>💵 Recibido en USD</strong> <span class="muted" style="font-size:11px">(tasa ${tasa})</span></span>
      <span><strong>${RN.moneda.formatUSD(usd)}</strong></span>
    </div>
    <div class="row muted" style="font-size:12px"><span>↳ Convertido a CUP</span><span>${RN.calc.formatCUP(cupDesdeUSD)}</span></div>`;
  }

  if (cup > 0) {
    if (usd > 0) {
      // Pago combinado: mostrar CUP adicional
      seccionPago += `<div class="row" style="background:#e8f5e9;padding:6px 10px;border-radius:6px;margin:4px 0">
        <span><strong>🪙 Recibido en CUP</strong> <span class="muted" style="font-size:11px">(complemento)</span></span>
        <span><strong>${RN.calc.formatCUP(cup)}</strong></span>
      </div>`;
    } else {
      // Solo CUP
      seccionPago += `<div class="row"><span>Recibido en CUP</span><span>${RN.calc.formatCUP(cup)}</span></div>`;
    }
  }

  // Total pagado en CUP (suma de USD convertido + CUP)
  if (usd > 0 && cup > 0) {
    seccionPago += `<div class="row" style="border-top:1px dashed #ccc;padding-top:4px;margin-top:4px">
      <span><strong>Total pagado en CUP</strong></span>
      <span><strong>${RN.calc.formatCUP(pagadoCUP)}</strong></span>
    </div>`;
  } else if (usd > 0) {
    seccionPago += `<div class="row muted" style="font-size:12px"><span>Total pagado en CUP</span><span>${RN.calc.formatCUP(pagadoCUP)}</span></div>`;
  }

  // ====== Estado del pago: completo, parcial o excedente ======
  if (tipoPago === 'parcial' && falta > 0) {
    seccionPago += `<div class="row" style="background:#fff3cd;padding:6px 10px;border-radius:6px;margin:4px 0">
      <span><strong>⏳ Pago parcial</strong></span>
      <span><strong style="color:#856404">${RN.calc.formatCUP(pagadoCUP)}</strong></span>
    </div>
    <div class="row" style="color:#856404"><span>Falta por pagar</span><span><strong>${RN.calc.formatCUP(falta)}</strong></span></div>`;
  } else if (tipoPago === 'excedente' && excedente > 0) {
    seccionPago += `<div class="row" style="background:#fee;border:1px solid #e53935;padding:6px 10px;border-radius:6px;margin:4px 0">
      <span><strong>⚠ Excedente / vuelto</strong></span>
      <span><strong style="color:#c62828">${RN.calc.formatCUP(excedente)}</strong></span>
    </div>
    <div class="row muted" style="font-size:11px;color:#c62828"><span>Descontado del fondo de caja</span><span>Fondo: ${RN.calc.formatCUP(h.fondoDespues || 0)}</span></div>`;
  } else {
    seccionPago += `<div class="row" style="background:#e8f5e9;padding:6px 10px;border-radius:6px;margin:4px 0">
      <span><strong>✓ Pago completo</strong></span>
      <span><strong style="color:#2e7d32">${RN.calc.formatCUP(aPagar)}</strong></span>
    </div>`;
  }

  return `<div class="recibo">
    <h2>${RN.render.esc(cfg.nombreNegocio || 'AdminRed')}</h2>
    <p style="text-align:center;font-size:13px">Comprobante de pago</p>
    <div class="line"></div>
    <div class="row"><strong>Recibo N°</strong><strong>${h.reciboNum}</strong></div>
    <div class="row"><span>Fecha</span><span>${new Date(h.fecha).toLocaleString('es-CU')}</span></div>
    <div class="row"><span>Cliente</span><span>${RN.render.esc(c ? c.nombre : '—')}</span></div>
    ${c && c.direccion ? `<div class="row"><span>Dirección</span><span>${RN.render.esc(c.direccion)}</span></div>` : ''}
    <div class="line"></div>
    ${lineas.join('')}
    <div class="line"></div>
    <div class="row total"><span>TOTAL</span><span>${RN.calc.formatCUP(total)}</span></div>
    <div class="line"></div>
    ${seccionPago}
    <div class="line"></div>
    <p style="text-align:center;font-size:11px;color:#888">Gracias por su pago. Este comprobante es válido como recibo.</p>
  </div>`;
};

// v5.14.2 (Auditoría Reportes — CODE-1): cache del último recibo mostrado
// para que `imprimir()` no tenga que volver a buscarlo en el historial.
RN.recibo._ultimoRecibo = null;

/** Muestra un recibo en un modal con opción de imprimir. */
RN.recibo.ver = function (cobroId) {
  const h = RN.state.history.find(x => x.id === cobroId);
  if (!h) { RN.notifyUI.toast('Cobro no encontrado', 'error'); return; }
  RN.recibo._ultimoRecibo = h;
  const html = `
    <div class="modal-header"><h3>Recibo ${h.reciboNum}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body" style="background:#f1f5f9">${RN.recibo._html(h)}</div>
    <div class="modal-footer">
      <button class="btn" onclick="RN.whatsapp.enviarComprobante('${RN.render.escAttr(h.id)}')">WhatsApp</button>
      <button class="btn primary" onclick="RN.recibo.imprimir('${RN.render.escAttr(h.id)}')">🖨️ Imprimir</button>
    </div>`;
  RN.uiComponents.modal(html);
};

/** Imprime el recibo usando la zona #print-area. */
RN.recibo.imprimir = function (cobroId) {
  // v5.14.2 (CODE-1): usar el cobro cacheado por ver() si coincide el id,
  // evitando una segunda búsqueda lineal en el historial. Si no coincide
  // (ej. se llamó imprimir directamente sin pasar por ver), busca igual.
  const h = (RN.recibo._ultimoRecibo && RN.recibo._ultimoRecibo.id === cobroId)
    ? RN.recibo._ultimoRecibo
    : RN.state.history.find(x => x.id === cobroId);
  if (!h) { RN.notifyUI.toast('Cobro no encontrado', 'error'); return; }
  const area = document.getElementById('print-area');
  area.innerHTML = RN.recibo._html(h);
  RN.uiComponents.cerrarModal();
  setTimeout(() => { window.print(); area.innerHTML = ''; }, 300);
};
