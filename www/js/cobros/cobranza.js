/**
 * cobros/cobranza.js — Ventana superpuesta de Cobranza del mes.
 * v5.10.5: Muestra TODOS los clientes pendientes de este mes (que no han pagado
 * y cuyo mes de inicio de cobro <= mes actual), agrupados por corte (día de pago),
 * con el corte vigente destacado primero y luego los demás cortes.
 *
 * Reglas:
 *   - Si NO hay pendientes este mes -> NO se abre (toast "todos al día").
 *   - Si hay pendientes -> se abre la ventana listándolos por corte.
 *
 * Función pública:
 *   RN.cobranza.abrir()
 */
RN.cobranza = RN.cobranza || {};

/**
 * Abre la ventana de cobranza del mes (todos los pendientes, agrupados por corte).
 * No se abre si no hay pendientes.
 */
RN.cobranza.abrir = function () {
  var grupos = RN.ciclos.clientesCobranzaPendientes();
  var totalPend = grupos.reduce(function (s, g) { return s + g.clientes.length; }, 0);
  if (!totalPend) {
    RN.notifyUI.toast('No hay clientes pendientes este mes. ¡Todos al día!', 'success');
    return;
  }

  var mes = RN.calc.mesActualStr();
  var totalACobrar = 0;
  grupos.forEach(function (g) {
    g.clientes.forEach(function (c) {
      // v5.13.8 (LOG-2/DUP-2): usar resumenCliente que incluye mora
      var r = RN.calc.resumenCliente(c, mes);
      totalACobrar += r.totalMes + (r.mora > 0 ? r.neto * r.mora : 0);
    });
  });

  var cv = RN.ciclos.corteVigente();
  var diasFaltan = cv ? RN.ciclos.diasParaPago(cv.diaPago) : 0;

  var secciones = grupos.map(function (g) {
    var filas = g.clientes.map(function (c) {
      var estado = RN.calc.getStatus(c);
      // v5.13.8 (DUP-2): usar resumenCliente
      var r = RN.calc.resumenCliente(c, mes);
      var neto = r.neto;
      var cuotaEq = r.cuotaEq;
      var mora = r.mora;
      var total = r.totalMes + (mora > 0 ? neto * mora : 0);
      var tel = c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">\u2014</span>';
      var planTxt = RN.render.esc(RN.render.nombrePlan(c));
      var estadoBadge = RN.render.badgeEstado(estado);
      // v5.13.8 (UI-4): mostrar badge de mora si aplica
      var moraBadge = mora > 0 ? ' <span class="badge due">' + mora + ' mes' + (mora !== 1 ? 'es' : '') + ' mora</span>' : '';
      var totalTxt = RN.calc.formatCUP(total) + (cuotaEq > 0 ? ' <span class="pill">+equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '') + moraBadge;
      // v5.13.8 (BUG-6): escAttr en IDs de onclick
      var cid = RN.render.escAttr(c.id);
      return '<tr>' +
        '<td><strong>' + RN.render.esc(c.nombre) + '</strong><br><span class="muted" style="font-size:12px">' + planTxt + '</span></td>' +
        '<td style="text-align:center">' + estadoBadge + '</td>' +
        '<td>' + tel + '</td>' +
        '<td style="text-align:right">' + totalTxt + '</td>' +
        '<td style="text-align:center;white-space:nowrap">' +
          '<button class="btn sm primary" onclick="RN.cobranza._cobrar(\'' + cid + '\')">Cobrar</button> ' +
          '<button class="btn sm" onclick="RN.cobranza._recordar(\'' + cid + '\')">WhatsApp</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    var titulo = 'Corte del día ' + g.diaPago;
    var badgeVigente = g.vigente
      ? ' <span class="badge paid" style="margin-left:6px">● Vigente</span>'
      : '';
    var subGrupo = g.vigente && diasFaltan > 0
      ? ' <span class="muted" style="font-size:12px;font-weight:normal">— faltan ' + diasFaltan + ' día' + (diasFaltan > 1 ? 's' : '') + ' para el pago</span>'
      : (g.vigente ? ' <span class="muted" style="font-size:12px;font-weight:normal">— hoy es la fecha de pago</span>' : '');
    var destacado = g.vigente ? ' style="border-left:4px solid var(--primary);padding-left:10px"' : '';

    return '<div style="margin-bottom:16px"' + destacado + '>' +
      '<h4 style="margin:4px 0 8px">' + titulo + badgeVigente + subGrupo +
      ' <span class="badge warn" style="margin-left:6px">' + g.clientes.length + ' pendiente' + (g.clientes.length > 1 ? 's' : '') + '</span></h4>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Cliente</th><th>Estado</th><th>Teléfono</th>' +
        '<th style="text-align:right">A cobrar</th><th style="text-align:center">Acciones</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '</div>';
  }).join('');

  var headerTxt = cv
    ? 'Cobranza — corte vigente día ' + cv.diaPago
    : 'Cobranza del mes';
  var subResumen = cv
    ? (diasFaltan > 0
        ? 'Corte vigente: día ' + cv.diaPago + ' (faltan ' + diasFaltan + ' días). '
        : 'Corte vigente: día ' + cv.diaPago + ' (hoy es la fecha de pago). ')
    : 'No hay corte vigente hoy. ';
  subResumen += grupos.length + ' corte' + (grupos.length > 1 ? 's' : '') + ' con pendientes · Total a cobrar: ' + RN.calc.formatCUP(totalACobrar);

  var html =
    '<div class="modal-header"><h3>📋 ' + headerTxt + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi blue" style="margin-bottom:12px">' +
        '<div class="label">Clientes pendientes este mes</div>' +
        '<div class="value">' + totalPend + '</div>' +
        '<div class="sub">' + subResumen + '</div>' +
      '</div>' +
      secciones +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'Los clientes que deben meses anteriores sin pagar se muestran en "Clientes morosos". ' +
        'Los clientes "Por iniciar" (mes de inicio futuro) no aparecen aquí todavía.' +
      '</p>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.cobranza._recordarMasivo()">💬 Recordar a todos (WhatsApp)</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/** Abre el modal de cobro para un cliente (cierra esta ventana primero). */
RN.cobranza._cobrar = function (clienteId) {
  RN.uiComponents.cerrarModal();
  RN.modalCobro.abrir(clienteId);
};

/** Envía recordatorio de WhatsApp a un cliente. */
RN.cobranza._recordar = function (clienteId) {
  RN.whatsapp.enviarRecordatorio(clienteId);
};

/** Recordatorio masivo a todos los pendientes del mes. */
RN.cobranza._recordarMasivo = function () {
  var grupos = RN.ciclos.clientesCobranzaPendientes();
  var total = grupos.reduce(function (s, g) { return s + g.clientes.length; }, 0);
  if (!total) {
    RN.notifyUI.toast('No hay pendientes para recordar', 'info');
    return;
  }
  RN.uiComponents.cerrarModal();
  RN.whatsapp.enviarMasivo();
};
