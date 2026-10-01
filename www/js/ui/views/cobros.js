/**
 * ui/views/cobros.js — Vista Cobros del mes.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */
// ---------- COBROS ----------
RN.render.cobros = function () {
  const cont = document.getElementById('lista-cobros');
  if (!cont) return;
  const q = (document.getElementById('search-cobros') || {}).value || '';
  let lista = RN.calc.clientesActivos();
  if (q) lista = RN.calc.filtrarClientes(lista, q); // v5.44.0: plan, teléfono y deuda>X

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💳</div>No hay clientes activos.</div>';
    return;
  }
  // ordenar: morosos primero
  lista.sort((a, b) => {
    const oa = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5 }[RN.calc.getStatus(a)];
    const ob = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5 }[RN.calc.getStatus(b)];
    return oa - ob;
  });

  // v5.13.1: Bug #4 — mes explícito para descuentos puntuales.
  const mes = RN.calc.mesActualStr();
  cont.innerHTML = lista.map(c => {
    // v5.13.7 (DUP-2): usar resumenCliente para centralizar calculos.
    const r = RN.calc.resumenCliente(c, mes);
    const estado = r.estado;
    const neto = r.neto;
    const cuotaEq = r.cuotaEq;
    const total = r.totalMes;
    const deuda = r.deuda;
    const mora = r.mora;
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const planSub = RN.render.nombrePlan(c) + ' · ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c));
    const subParts = [planSub];
    if (ipHtml) subParts.push(ipHtml);

    var accBtn;
    if (estado === 'paid') {
      accBtn = '<span class="badge paid">Pagado</span>';
    } else if (estado === 'parcial') {
      accBtn = '<span class="badge parcial">Pago parcial</span> <button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Completar pago</button>';
    } else {
      accBtn = '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar ' + RN.calc.formatCUP(total) + '</button>';
    }

    // v5.15 (C. acceso rápido): descuentos vigentes del mes para este cliente.
    // Gift-button 🎁 abre RN.descuentos.abrirParaCliente() (gestión, no cobro).
    var descsMes = (RN.state.descuentos || []).filter(function (d) {
      return d.clienteId === c.id && d.estado !== 'anulado' && RN.descuentos.vigenteEnMes(d, mes);
    });
    var impactoDesc = descsMes.reduce(function (acc, d) { return acc + (RN.calc.valorDescuento(d, c.id) || 0); }, 0);
    var GIFT = String.fromCodePoint(0x1F381);
    var giftTitle = 'Gestionar bonificaciones/descuentos de ' + RN.render.esc(c.nombre) +
      (descsMes.length ? ' — impacto este mes: ' + RN.calc.formatCUP(impactoDesc) : '');
    var giftBtn = '<button class="btn sm gift-btn' + (descsMes.length ? ' has-desc' : '') + '" title="' + giftTitle + '" onclick="RN.descuentos.abrirParaCliente(\'' + RN.render.escAttr(c.id) + '\')">' + GIFT + (descsMes.length ? ' <span class="gift-count">' + descsMes.length + '</span>' : '') + '</button>';
    var descRowsHtml = '';
    if (descsMes.length) {
      descRowsHtml = descsMes.map(function (d) {
        var mtxt = d.motivo ? RN.render.esc(d.motivo) : '';
        return '<span class="badge ok" title="' + mtxt + '">' + RN.render.esc(d.tipo) + (mtxt ? ': ' + mtxt : '') + ' (−' + RN.calc.formatCUP(RN.calc.valorDescuento(d, c.id)) + ')</span>';
      }).join(' ');
    } else {
      descRowsHtml = '<span class="muted">Ninguna este mes</span>';
    }

    return '<div class="acc-card" id="acc-cob-' + RN.render.escAttr(c.id) + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cob-' + RN.render.escAttr(c.id) + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + (mora > 0 ? ' <span class="badge due" style="font-size:10px;vertical-align:middle">Mora: ' + mora + 'm</span>' : '') + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (cuotaEq > 0 ? 'Total (+equipo)' : 'A cobrar') + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan / Precio</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">Base: ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Día de pago</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Neto a cobrar</span><span class="acc-value">' + RN.calc.formatCUP(neto) + (cuotaEq > 0 ? ' <span class="pill">+ equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Bonificaciones</span><span class="acc-value">' + descRowsHtml + '</span></div>' +
        '<div class="acc-actions">' + accBtn + ' ' + giftBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
