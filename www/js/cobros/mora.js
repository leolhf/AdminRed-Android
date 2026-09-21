/**
 * cobros/mora.js — Gestión de meses de atraso (mora).
 * v5.10.5: RN.mora.abrir() muestra SOLO clientes con mora REAL (getMora > 0,
 * deben meses anteriores sin pagar), agrupados por corte. No se abre si no hay
 * morosos. v5.13.8: mora.listar() legacy eliminada (DUP-1/CODE-6).
 */
RN.mora = RN.mora || {};

/**
 * v5.10.5: Abre la ventana de clientes morosos (mora real: meses de atraso > 0).
 * NO se abre si no hay morosos (toast informativo).
 * Muestra los morosos agrupados por corte (día de pago), con meses de atraso.
 * Entrada desde la KPI "Clientes morosos" del panel.
 */
RN.mora.abrir = function () {
  var grupos = RN.ciclos.clientesMorososPorCorte();
  if (!grupos.length) {
    RN.notifyUI.toast('No hay clientes morosos', 'success');
    return;
  }

  // v5.13.1: Bug #4 — pasar mes explícito para descuentos puntuales.
  var mes = RN.calc.mesActualStr();
  var totalMorosos = RN.ciclos.totalMorosos();
  var totalDeuda = 0;
  grupos.forEach(function (g) {
    g.clientes.forEach(function (c) {
      // v5.13.8 (BUG-3/LOG-3/DUP-2): usar deudaTotalCliente que incluye mora + equipo
      totalDeuda += RN.calc.deudaTotalCliente(c, mes);
    });
  });

  var secciones = grupos.map(function (g) {
    var filas = g.clientes.map(function (c) {
      // v5.13.8 (DUP-2/CODE-2): usar resumenCliente
      var r = RN.calc.resumenCliente(c, mes);
      var mora = r.mora;
      var neto = r.neto;
      var cuotaEq = r.cuotaEq;
      // v5.13.8 (LOG-3): total incluye mora (deudaTotalCliente)
      var total = r.totalDeuda;
      var tel = c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>';
      var moraDeuda = mora > 0 ? neto * mora : 0;
      var totalTxt = RN.calc.formatCUP(total) + (moraDeuda > 0 ? ' <span class="pill" style="background:var(--danger);color:#fff">+' + mora + ' mes' + (mora !== 1 ? 'es' : '') + ' mora ' + RN.calc.formatCUP(moraDeuda) + '</span>' : '') + (cuotaEq > 0 ? ' <span class="pill">+equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '');
      // v5.13.8 (BUG-6): escAttr en IDs de onclick
      var cid = RN.render.escAttr(c.id);
      return '<tr>' +
        '<td><strong>' + RN.render.esc(c.nombre) + '</strong><br><span class="muted" style="font-size:12px">' + RN.render.esc(RN.render.nombrePlan(c)) + '</span></td>' +
        '<td>' + tel + '</td>' +
        '<td style="text-align:center"><span class="badge due">' + mora + ' mes' + (mora !== 1 ? '(es)' : '') + ' de atraso</span></td>' +
        '<td style="text-align:right">' + totalTxt + '</td>' +
        '<td style="text-align:center;white-space:nowrap">' +
          '<button class="btn sm primary" onclick="RN.mora._cobrar(\'' + cid + '\')">Cobrar</button> ' +
          '<button class="btn sm" onclick="RN.mora._recordar(\'' + cid + '\')">WhatsApp</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    return '<div style="margin-bottom:16px">' +
      '<h4 style="margin:4px 0 8px">Corte del día ' + g.diaPago + ' <span class="badge due" style="margin-left:6px">' + g.clientes.length + ' moroso' + (g.clientes.length > 1 ? 's' : '') + '</span></h4>' +
      '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Mora</th><th style="text-align:right">Debe</th><th style="text-align:center">Acciones</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '</div>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>Clientes morosos</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi red" style="margin-bottom:12px">' +
        '<div class="label">Morosos (meses de atraso sin pago)</div>' +
        '<div class="value">' + totalMorosos + '</div>' +
        '<div class="sub">' + grupos.length + ' corte' + (grupos.length > 1 ? 's' : '') + ' afectado' + (grupos.length > 1 ? 's' : '') + ' · Deuda total: ' + RN.calc.formatCUP(totalDeuda) + '</div>' +
      '</div>' +
      secciones +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'Un cliente es moroso cuando pasa de un mes a otro sin pagar. Los pendientes del mes actual (aún no vencidos) se ven en "Cobranza".' +
      '</p>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn danger" onclick="RN.mora._recordarMasivo()">Recordar a todos (WhatsApp)</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/** Abre el modal de cobro para un moroso (cierra esta ventana primero). */
RN.mora._cobrar = function (clienteId) {
  RN.uiComponents.cerrarModal();
  RN.modalCobro.abrir(clienteId);
};

/** Recordatorio WhatsApp a un moroso. */
RN.mora._recordar = function (clienteId) {
  RN.whatsapp.enviarRecordatorio(clienteId);
};

/** Recordatorio masivo a morosos. */
RN.mora._recordarMasivo = function () {
  if (!RN.ciclos.totalMorosos()) {
    RN.notifyUI.toast('No hay morosos para recordar', 'info');
    return;
  }
  RN.uiComponents.cerrarModal();
  RN.whatsapp.enviarMasivo();
};
