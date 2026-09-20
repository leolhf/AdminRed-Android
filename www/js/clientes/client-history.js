/**
 * clientes/client-history.js — Historial de pagos por cliente.
 * v5.13.9: escAttr en onclicks (CODE-6), totalCobro (DUP-1), clientePorId (DUP-3),
 * mes legible en concepto (LOG-4).
 */
RN.clientHistory = RN.clientHistory || {};

RN.clientHistory.abrir = function (id) {
  const c = RN.calc.clientePorId(id);
  if (!c) return;
  const hist = RN.state.history.filter(h => h.clienteId === id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const total = hist.reduce((s, h) => s + RN.calc.totalCobro(h), 0);
  // v5.13.7 (LOG-2): clientes inactivos no muestran mora (ya no se espera pago).
  const mora = c.activo === false ? 0 : RN.calc.getMora(c);
  const deudaEq = RN.investment.getDeudaEquipoCliente(c);

  const rows = hist.length ? hist.map(h => {
    // v5.13.9 (LOG-4): Mes legible en concepto de servicio
    var conceptoTxt;
    if (h.tipo === 'servicio') {
      conceptoTxt = 'Servicio ' + (h.mes ? RN.calc.mesTexto(h.mes) : '');
    } else if (h.tipo === 'equipo') {
      conceptoTxt = 'Cuota equipo';
    } else {
      conceptoTxt = RN.render.esc(h.concepto || h.tipo);
    }
    return `<tr>
    <td>${RN.render.esc((h.fecha || '').slice(0, 10))}</td>
    <td>${conceptoTxt}</td>
    <td>${RN.calc.formatCUP(RN.calc.totalCobro(h))}</td>
    <td>${h.reciboNum ? `<button class="btn sm" onclick="RN.recibo.ver('${RN.render.escAttr(h.id)}')">${RN.render.esc(h.reciboNum)}</button>` : '—'}</td>
  </tr>`;
  }).join('') : `<tr><td colspan="4"><div class="empty">Sin pagos registrados</div></td></tr>`;

  const html = `
    <div class="modal-header"><h3>Historial — ${RN.render.esc(c.nombre)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="kpi-grid mb-16">
        <div class="kpi green"><div class="label">Total pagado</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(total)}</div></div>
        <div class="kpi ${mora ? 'red' : 'ok'}"><div class="label">Mora</div><div class="value" style="font-size:18px">${mora} mes(es)</div></div>
        <div class="kpi ${deudaEq ? 'amber' : 'ok'}"><div class="label">Deuda equipo</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(deudaEq)}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Recibo</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="RN.whatsapp.enviarRecordatorio('${RN.render.escAttr(c.id)}')">WhatsApp</button>
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
    </div>`;
  RN.uiComponents.modal(html, { lg: true });
};
