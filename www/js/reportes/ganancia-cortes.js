/**
 * reportes/ganancia-cortes.js — Modales de resumen de los KPIs del Panel.
 * v5.15.1 — Hace clicables las tarjetas del Panel del negocio:
 *   - Ingresos del mes        -> RN.ingresosMes.abrir()
 *   - Costo del paquete       -> RN.paqueteProveedor.abrir()  (📡 Gestionar servicio)
 *   - Ganancia proyectada     -> RN.gananciaCortes.abrirProyectada()
 *   - Ganancia del mes        -> RN.gananciaCortes.abrirReal()
 *   - Utilidad neta           -> RN.utilidadMes.abrir()
 *
 * Todos los resúmenes se agrupan por CORTE (día de pago del cliente), igual
 * que la cobranza y el calendario, reutilizando RN.ciclos y RN.calc. No se
 * duplica ningún cálculo de negocio: se apoyan en las funciones existentes
 * (ingresosMes, ingresoEsperadoMes, montoPaqueteProveedor, getPrecioNeto,
 * getMora, resumenCliente...).
 *
 * v5.15.2 (CORRECCIÓN CLAVE del costo del mega):
 *   Antes el costo del mega se cobraba a CADA cliente (megas × precioMega), lo
 *   que inflaba el costo total por encima del costo REAL del paquete. Con
 *   sobreventa, los megas que exceden el paquete NO tienen costo: son ganancia
 *   directa. El paquete es un COSTO FIJO (proveedorMegas × precioMega) y los
 *   primeros `proveedorMegas` megas vendidos lo "consumen" en orden de corte.
 *   Así, el primer corte puede cubrir todo el paquete y los siguientes son
 *   ganancia directa. El total por corte ahora coincide con el del panel.
 *
 * Depende de: calculations.js, ciclos.js, models/investment.js, ui/render.js,
 *             ui/ui-components.js, ui/notify-ui.js (todos cargan antes).
 */
RN.gananciaCortes = RN.gananciaCortes || {};
RN.ingresosMes = RN.ingresosMes || {};
RN.utilidadMes = RN.utilidadMes || {};

/* ============================================================
 * Helpers de cálculo por corte
 * ============================================================ */

/**
 * Agrupa los clientes activos que YA deben pagar este mes (mesInicio <= mes)
 * por su día de pago (corte). Devuelve [{ diaPago, clientes: [...] }] asc.
 * Es la base de la ganancia PROYECTADA (lo que deberían pagar).
 */
RN.gananciaCortes._cortesProyectados = function (mes) {
  var map = {};
  RN.calc.clientesActivos().forEach(function (c) {
    if (RN.calc.mesInicioCliente(c) > mes) return; // aún no le toca pagar
    var dp = c.diaPago || 1;
    if (!map[dp]) map[dp] = [];
    map[dp].push(c);
  });
  return Object.keys(map).map(function (dp) {
    return { diaPago: parseInt(dp, 10), clientes: map[dp] };
  }).sort(function (a, b) { return a.diaPago - b.diaPago; });
};

/**
 * v5.15.2 — Reparte el COSTO FIJO del paquete del proveedor entre los cortes,
 * en orden de día de pago (el que paga primero "consume" el paquete primero).
 *
 * El paquete es un costo fijo: `proveedorMegas × proveedorPrecioMega`. Los
 * primeros `proveedorMegas` megas vendidos consumen el paquete; los megas que
 * lo exceden (sobreventa) NO tienen costo → son GANANCIA DIRECTA.
 *
 * @param {Array} cortes — [{ diaPago, megas }] (se ordena por diaPago asc)
 * @returns {{
 *   filas: Array<{diaPago, megas, megasEnPaquete, megasSobreventa, costo}>,
 *   totalCosto, totalMegas, megasPaquete, megasSobreventa,
 *   costoPaquete, costoNoCubierto, precioMega
 * }}
 */
RN.gananciaCortes._repartoCosto = function (cortes) {
  var cfg = RN.state.config;
  var megasPaquete = +cfg.proveedorMegas || 0;
  var precioMega = +cfg.proveedorPrecioMega || 0;
  var orden = (cortes || []).slice().sort(function (a, b) { return a.diaPago - b.diaPago; });
  var restante = megasPaquete;
  var totalCosto = 0, totalMegas = 0, totalSobreventa = 0;
  var filas = orden.map(function (c) {
    var m = +c.megas || 0;
    var enPaquete = Math.max(0, Math.min(m, restante));
    var sobreventa = m - enPaquete;
    restante -= enPaquete;
    var costo = +(enPaquete * precioMega).toFixed(2);
    totalCosto += costo;
    totalMegas += m;
    totalSobreventa += sobreventa;
    return {
      diaPago: c.diaPago,
      megas: m,
      megasEnPaquete: enPaquete,
      megasSobreventa: sobreventa,
      costo: costo
    };
  });
  var costoPaquete = +(megasPaquete * precioMega).toFixed(2);
  // Capacidad del paquete que no se vendió (pérdida): el paquete se paga igual.
  var costoNoCubierto = +Math.max(0, costoPaquete - totalCosto).toFixed(2);
  return {
    filas: filas,
    totalCosto: +totalCosto.toFixed(2),
    totalMegas: totalMegas,
    megasPaquete: megasPaquete,
    megasSobreventa: totalSobreventa,
    costoPaquete: costoPaquete,
    costoNoCubierto: costoNoCubierto,
    precioMega: precioMega
  };
};

/**
 * Resumen de la ganancia PROYECTADA por corte.
 * Por cada corte: ingreso esperado (suma de netos), megas de sus clientes y
 * costo del paquete asignado (secuencial). Ganancia = ingreso − costo.
 * El total de costo = costo del paquete (fijo), igual que el panel.
 */
RN.gananciaCortes._resumenProyectado = function (mes) {
  var cortes = RN.gananciaCortes._cortesProyectados(mes);
  var base = cortes.map(function (g) {
    var ingreso = 0, megas = 0;
    g.clientes.forEach(function (c) {
      ingreso += RN.calc.getPrecioNeto(c, mes);
      megas += RN.calc.getMegasCliente(c);
    });
    return { diaPago: g.diaPago, clientes: g.clientes.length, ingreso: +ingreso.toFixed(2), megas: megas };
  });
  var reparto = RN.gananciaCortes._repartoCosto(base);
  var porDia = {};
  reparto.filas.forEach(function (f) { porDia[f.diaPago] = f; });
  var totalIngreso = 0, totalClientes = 0;
  var filas = base.map(function (b) {
    var r = porDia[b.diaPago] || { megasEnPaquete: 0, megasSobreventa: b.megas, costo: 0 };
    totalIngreso += b.ingreso;
    totalClientes += b.clientes;
    return {
      diaPago: b.diaPago,
      clientes: b.clientes,
      megas: b.megas,
      megasEnPaquete: r.megasEnPaquete,
      megasSobreventa: r.megasSobreventa,
      ingreso: b.ingreso,
      costo: r.costo,
      ganancia: +(b.ingreso - r.costo).toFixed(2)
    };
  });
  // El costo total es el del paquete (fijo). Si no se vendió toda la capacidad,
  // la parte no cubierta se muestra aparte para que el total cuadre con el panel.
  var totalCosto = reparto.costoPaquete;
  return {
    filas: filas,
    totalIngreso: +totalIngreso.toFixed(2),
    totalCosto: +totalCosto.toFixed(2),
    totalGanancia: +(totalIngreso - totalCosto).toFixed(2),
    totalClientes: totalClientes,
    totalMegas: reparto.totalMegas,
    megasPaquete: reparto.megasPaquete,
    megasSobreventa: reparto.megasSobreventa,
    costoNoCubierto: reparto.costoNoCubierto,
    precioMega: reparto.precioMega
  };
};

/**
 * Resumen de la ganancia REAL por corte (lo efectivamente cobrado este mes).
 * Agrupa los cobros del mes por el corte del cliente. Por cada corte:
 * cobrado (servicio + equipo), megas de los clientes que pagaron y costo del
 * paquete asignado (secuencial). Ganancia = cobrado − costo.
 */
RN.gananciaCortes._resumenReal = function (mes) {
  var map = {}; // diaPago -> { cobrado, clientes:Set }
  RN.state.history.filter(function (h) { return h.mes === mes; }).forEach(function (h) {
    var cli = RN.calc.clientePorId(h.clienteId);
    var dp = (cli && cli.diaPago) ? cli.diaPago : 0;
    if (!map[dp]) map[dp] = { cobrado: 0, clientes: {} };
    map[dp].cobrado += (h.monto || 0) + (h.montoEquipo || 0);
    if (cli) map[dp].clientes[cli.id] = true;
  });
  // Megas por corte (de los clientes que pagaron), una sola vez por cliente.
  var base = Object.keys(map).map(function (dp) {
    var g = map[dp];
    var megas = 0;
    Object.keys(g.clientes).forEach(function (cid) {
      var cli = RN.calc.clientePorId(cid);
      if (cli) megas += RN.calc.getMegasCliente(cli);
    });
    return { diaPago: parseInt(dp, 10), clientes: Object.keys(g.clientes).length, cobrado: +g.cobrado.toFixed(2), megas: megas };
  }).sort(function (a, b) { return a.diaPago - b.diaPago; });
  var reparto = RN.gananciaCortes._repartoCosto(base);
  var porDia = {};
  reparto.filas.forEach(function (f) { porDia[f.diaPago] = f; });
  var totalCobrado = 0, totalClientes = 0;
  var filas = base.map(function (b) {
    var r = porDia[b.diaPago] || { megasEnPaquete: 0, megasSobreventa: b.megas, costo: 0 };
    totalCobrado += b.cobrado;
    totalClientes += b.clientes;
    return {
      diaPago: b.diaPago,
      clientes: b.clientes,
      megas: b.megas,
      megasEnPaquete: r.megasEnPaquete,
      megasSobreventa: r.megasSobreventa,
      cobrado: b.cobrado,
      costo: r.costo,
      ganancia: +(b.cobrado - r.costo).toFixed(2)
    };
  });
  var totalCosto = reparto.costoPaquete;
  return {
    filas: filas,
    totalCobrado: +totalCobrado.toFixed(2),
    totalCosto: +totalCosto.toFixed(2),
    totalGanancia: +(totalCobrado - totalCosto).toFixed(2),
    totalClientes: totalClientes,
    totalMegas: reparto.totalMegas,
    megasPaquete: reparto.megasPaquete,
    megasSobreventa: reparto.megasSobreventa,
    costoNoCubierto: reparto.costoNoCubierto,
    precioMega: reparto.precioMega
  };
};

/**
 * Desglose de los ingresos REALES del mes por concepto y por corte.
 * - servicio: h.monto (solo servicio, incluye mora cobrada)
 * - equipo:   h.montoEquipo (pagos de deuda de equipo)
 * - inventario: ventas de inventario (h.tipo === 'venta-inventario')
 * - mora:     subconjunto de servicio (h.montoMora), informativo
 */
RN.ingresosMes._desglose = function (mes) {
  var servicio = 0, equipo = 0, inventario = 0, mora = 0, total = 0;
  var porCorte = {}; // diaPago -> { servicio, equipo, inventario, total, clientes:Set }
  RN.state.history.filter(function (h) { return h.mes === mes; }).forEach(function (h) {
    var monto = h.monto || 0;
    var montoEq = h.montoEquipo || 0;
    var esInv = h.tipo === 'venta-inventario' || h.ventaInventario;
    var t = monto + montoEq;
    total += t;
    if (esInv) { inventario += monto; }
    else { servicio += monto; equipo += montoEq; mora += (h.montoMora || 0); }

    var cli = RN.calc.clientePorId(h.clienteId);
    var dp = (cli && cli.diaPago) ? cli.diaPago : 0;
    if (!porCorte[dp]) porCorte[dp] = { servicio: 0, equipo: 0, inventario: 0, total: 0, clientes: {} };
    porCorte[dp].total += t;
    if (esInv) { porCorte[dp].inventario += monto; }
    else { porCorte[dp].servicio += monto; porCorte[dp].equipo += montoEq; }
    if (cli) porCorte[dp].clientes[cli.id] = true;
  });
  return {
    servicio: +servicio.toFixed(2),
    equipo: +equipo.toFixed(2),
    inventario: +inventario.toFixed(2),
    mora: +mora.toFixed(2),
    total: +total.toFixed(2),
    porCorte: porCorte
  };
};

/* ============================================================
 * Modal: Ingresos del mes
 * ============================================================ */

RN.ingresosMes.abrir = function () {
  var mes = RN.calc.mesActualStr();
  var d = RN.ingresosMes._desglose(mes);
  var cob = RN.calc.cobranzaMes(mes);

  // Secciones por corte (solo los cortes con cobros registrados).
  var cortes = Object.keys(d.porCorte).map(function (k) { return parseInt(k, 10); })
    .sort(function (a, b) { return a - b; });
  var secciones = cortes.map(function (dp) {
    var g = d.porCorte[dp];
    var titulo = dp > 0 ? 'Corte del día ' + dp : 'Sin corte asignado';
    var nCli = Object.keys(g.clientes).length;
    var detalle = [];
    if (g.servicio > 0) detalle.push('servicio ' + RN.calc.formatCUP(g.servicio));
    if (g.equipo > 0) detalle.push('equipo ' + RN.calc.formatCUP(g.equipo));
    if (g.inventario > 0) detalle.push('inventario ' + RN.calc.formatCUP(g.inventario));
    return '<div class="acc-row" style="border-bottom:1px solid var(--border);padding:8px 0">' +
      '<span class="acc-label"><strong>' + titulo + '</strong>' +
        (nCli ? ' <span class="muted" style="font-size:12px">· ' + nCli + ' cliente' + (nCli > 1 ? 's' : '') + '</span>' : '') +
        '<br><span class="muted" style="font-size:12px">' + (detalle.join(' · ') || '—') + '</span>' +
      '</span>' +
      '<span class="acc-value"><strong>' + RN.calc.formatCUP(g.total) + '</strong></span>' +
    '</div>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>💵 Ingresos del mes — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi green" style="margin-bottom:12px">' +
        '<div class="label">Ingresos del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(d.total) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(d.total, 'Cobros de servicio + equipo + inventario') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Servicio</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(d.servicio) + '</div><div class="sub">Cuotas de internet cobradas</div></div>' +
        '<div class="kpi blue"><div class="label">Equipo</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(d.equipo) + '</div><div class="sub">Pagos de deuda de equipo</div></div>' +
        '<div class="kpi amber"><div class="label">Inventario</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(d.inventario) + '</div><div class="sub">Ventas de inventario</div></div>' +
      '</div>' +
      (d.mora > 0
        ? '<p class="muted" style="font-size:12px;margin-bottom:12px">El servicio incluye <strong>' + RN.calc.formatCUP(d.mora) + '</strong> de mora de meses anteriores.</p>'
        : '') +
      '<h4 style="margin:4px 0 8px">Desglose por corte</h4>' +
      (secciones || '<div class="acc-empty"><div class="icon">💵</div>Sin ingresos registrados este mes todavía.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'Cobranza: ' + cob.pagaron + '/' + cob.total + ' clientes pagaron este mes' +
        (cob.parciales ? ' · ' + cob.parciales + ' con pago parcial' : '') + '. ' +
        'Los ingresos agrupan los cobros por el corte (día de pago) del cliente.' +
      '</p>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn" onclick="RN.uiComponents.cerrarModal();RN.historial.verTodos()">Ver historial completo</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/* ============================================================
 * Modal: Ganancia proyectada del mes (por corte)
 * ============================================================ */

RN.gananciaCortes.abrirProyectada = function () {
  var mes = RN.calc.mesActualStr();
  var r = RN.gananciaCortes._resumenProyectado(mes);
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var esperado = RN.calc.ingresoEsperadoMes(mes);
  var gananciaProyectada = +(esperado - costoPaquete).toFixed(2);
  var sinCosto = !RN.investment.costoMegaConfigurado();

  var filas = r.filas.map(function (f) {
    var sobre = f.megasSobreventa > 0
      ? ' <span class="muted" style="font-size:11px">(' + f.megasSobreventa + 'M sobreventa)</span>'
      : '';
    return '<tr>' +
      '<td><strong>Corte del día ' + f.diaPago + '</strong></td>' +
      '<td style="text-align:center">' + f.clientes + '</td>' +
      '<td style="text-align:center">' + f.megas + 'M' + sobre + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.ingreso) + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.costo) + '</td>' +
      '<td style="text-align:right"><strong style="color:' + (f.ganancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(f.ganancia) + '</strong></td>' +
    '</tr>';
  }).join('');

  // Fila de capacidad del paquete no vendida (pérdida): el paquete se paga igual.
  var filaNoCubierto = r.costoNoCubierto > 0
    ? '<tr>' +
        '<td><strong class="muted">Capacidad sin vender</strong></td>' +
        '<td style="text-align:center">—</td>' +
        '<td style="text-align:center">' + Math.max(0, r.megasPaquete - r.totalMegas) + 'M</td>' +
        '<td style="text-align:right">—</td>' +
        '<td style="text-align:right">' + RN.calc.formatCUP(r.costoNoCubierto) + '</td>' +
        '<td style="text-align:right"><strong style="color:var(--danger)">−' + RN.calc.formatCUP(r.costoNoCubierto) + '</strong></td>' +
      '</tr>'
    : '';

  var html =
    '<div class="modal-header"><h3>📈 Ganancia proyectada del mes — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi ' + (gananciaProyectada >= 0 ? 'green' : 'red') + '" style="margin-bottom:12px">' +
        '<div class="label">Ganancia proyectada del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(gananciaProyectada) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(gananciaProyectada, 'Ingreso esperado − Costo del paquete') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Ingreso esperado</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(esperado) + '</div><div class="sub">Lo que deberían pagar los activos</div></div>' +
        '<div class="kpi amber"><div class="label">Costo del paquete</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(costoPaquete) + '</div><div class="sub">' + (costoPaquete > 0 ? RN.render.descPaquete() : 'Sin paquete configurado') + '</div></div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi blue"><div class="label">Megas vendidos</div><div class="value" style="font-size:18px">' + r.totalMegas + 'M</div><div class="sub">Suma de los planes activos</div></div>' +
        '<div class="kpi green"><div class="label">Sobreventa (ganancia directa)</div><div class="value" style="font-size:18px">' + r.megasSobreventa + 'M</div><div class="sub">' + (r.megasSobreventa > 0 ? 'Megas por encima del paquete · costo 0' : 'Sin sobreventa') + '</div></div>' +
      '</div>' +
      '<h4 style="margin:4px 0 8px">Ganancia esperada por corte</h4>' +
      (r.filas.length
        ? '<div class="table-wrap"><table><thead><tr>' +
            '<th>Corte</th><th style="text-align:center">Clientes</th>' +
            '<th style="text-align:center">Megas</th>' +
            '<th style="text-align:right">Ingreso esperado</th>' +
            '<th style="text-align:right">Costo del paquete</th>' +
            '<th style="text-align:right">Ganancia</th>' +
          '</tr></thead><tbody>' + filas + filaNoCubierto +
          '<tr style="border-top:2px solid var(--border)">' +
            '<td><strong>Total</strong></td>' +
            '<td style="text-align:center"><strong>' + r.totalClientes + '</strong></td>' +
            '<td style="text-align:center"><strong>' + r.totalMegas + 'M</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalIngreso) + '</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalCosto) + '</strong></td>' +
            '<td style="text-align:right"><strong style="color:' + (r.totalGanancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(r.totalGanancia) + '</strong></td>' +
          '</tr></tbody></table></div>'
        : '<div class="acc-empty"><div class="icon">📈</div>No hay clientes activos con cobro esperado este mes.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'El paquete es un <strong>costo fijo</strong> (' + r.megasPaquete + 'M × ' + r.precioMega + ' = ' + RN.calc.formatCUP(costoPaquete) + '). ' +
        'Los primeros ' + r.megasPaquete + 'M vendidos lo consumen en orden de corte; los megas de <strong>sobreventa</strong> no tienen costo y son ganancia directa. ' +
        'Por eso el primer corte puede cubrir todo el paquete y los siguientes son ganancia directa.' +
      '</p>' +
      (sinCosto
        ? '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:12px;color:#e6a700">' +
            '⚠️ No hay precio de proveedor por mega configurado: el costo del paquete se asume 0 y la ganancia está <strong>inflada</strong>. Configúralo en 📡 Gestionar servicio.' +
          '</div>'
        : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal();RN.paqueteProveedor.abrir()">📡 Gestionar servicio</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/* ============================================================
 * Modal: Utilidad neta del mes (ganancia vs gastos)
 * ============================================================ */

/**
 * Desglose de los gastos del mes por categoría.
 * Excluye los movimientos de capital (retiros de caja y devoluciones de
 * inversión) para que la utilidad refleje la operación real del negocio.
 * Devuelve { filas: [{categoria, monto}], total, totalConCapital }.
 */
RN.utilidadMes._gastosPorCategoria = function (mes) {
  var mesNorm = (mes || '').slice(0, 7);
  var map = {};
  var total = 0, totalConCapital = 0;
  (RN.state.gastos || []).forEach(function (g) {
    if ((g.mes || '').slice(0, 7) !== mesNorm) return;
    var monto = g.monto || 0;
    totalConCapital += monto;
    // Movimientos de capital: no son gasto operativo.
    if (g.esRetiroCaja || g.esDevolucionInversion) return;
    var cat = g.categoria || 'General';
    if (!map[cat]) map[cat] = 0;
    map[cat] += monto;
    total += monto;
  });
  var filas = Object.keys(map).map(function (c) {
    return { categoria: c, monto: +map[c].toFixed(2) };
  }).sort(function (a, b) { return b.monto - a.monto; });
  return { filas: filas, total: +total.toFixed(2), totalConCapital: +totalConCapital.toFixed(2) };
};

RN.utilidadMes.abrir = function () {
  var mes = RN.calc.mesActualStr();
  var ingresos = RN.calc.ingresosMes(mes);
  var g = RN.utilidadMes._gastosPorCategoria(mes);
  var utilidad = +(ingresos - g.total).toFixed(2);
  var margen = ingresos > 0 ? +(utilidad / ingresos * 100).toFixed(1) : 0;
  var d = RN.ingresosMes._desglose(mes);

  var filasGasto = g.filas.map(function (f) {
    return '<tr>' +
      '<td>' + RN.render.esc(f.categoria) + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.monto) + '</td>' +
    '</tr>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>🧾 Utilidad neta — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi ' + (utilidad >= 0 ? 'blue' : 'red') + '" style="margin-bottom:12px">' +
        '<div class="label">Utilidad neta del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(utilidad) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(utilidad, 'Ingresos − Gastos · margen ' + margen + '%') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Ingresos del mes</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(ingresos) + '</div><div class="sub">Cobros de servicio + equipo + inventario</div></div>' +
        '<div class="kpi red"><div class="label">Gastos del mes</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(g.total) + '</div><div class="sub">Gastos operativos (sin retiros ni devoluciones)</div></div>' +
      '</div>' +
      '<h4 style="margin:4px 0 8px">Ingresos por concepto</h4>' +
      '<div class="table-wrap" style="margin-bottom:16px"><table><tbody>' +
        '<tr><td>Servicio</td><td style="text-align:right">' + RN.calc.formatCUP(d.servicio) + '</td></tr>' +
        '<tr><td>Equipo</td><td style="text-align:right">' + RN.calc.formatCUP(d.equipo) + '</td></tr>' +
        '<tr><td>Inventario</td><td style="text-align:right">' + RN.calc.formatCUP(d.inventario) + '</td></tr>' +
        '<tr style="border-top:2px solid var(--border)"><td><strong>Total ingresos</strong></td><td style="text-align:right"><strong>' + RN.calc.formatCUP(ingresos) + '</strong></td></tr>' +
      '</tbody></table></div>' +
      '<h4 style="margin:4px 0 8px">Gastos por categoría</h4>' +
      (g.filas.length
        ? '<div class="table-wrap"><table><thead><tr><th>Categoría</th><th style="text-align:right">Monto</th></tr></thead><tbody>' + filasGasto +
          '<tr style="border-top:2px solid var(--border)"><td><strong>Total gastos</strong></td><td style="text-align:right"><strong>' + RN.calc.formatCUP(g.total) + '</strong></td></tr>' +
          '</tbody></table></div>'
        : '<div class="acc-empty"><div class="icon">🧾</div>Sin gastos registrados este mes.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'La utilidad neta = ingresos del mes − gastos operativos del mes. ' +
        'No incluye retiros de caja ni devoluciones de inversión (son movimientos de capital, no gastos del negocio).' +
      '</p>' +
      (g.totalConCapital > g.total
        ? '<p class="muted" style="margin-top:6px;font-size:12px">Además hay <strong>' + RN.calc.formatCUP(g.totalConCapital - g.total) + '</strong> en retiros de caja / devoluciones de inversión este mes (no afectan la utilidad).</p>'
        : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn" onclick="RN.uiComponents.cerrarModal();RN.gastos.abrirNuevo()">➕ Registrar gasto</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

RN.gananciaCortes.abrirReal = function () {
  var mes = RN.calc.mesActualStr();
  var r = RN.gananciaCortes._resumenReal(mes);
  var ingresos = RN.calc.ingresosMes(mes);
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var gananciaBruta = +(ingresos - costoPaquete).toFixed(2);
  var sinCosto = !RN.investment.costoMegaConfigurado();

  var filas = r.filas.map(function (f) {
    var titulo = f.diaPago > 0 ? 'Corte del día ' + f.diaPago : 'Sin corte asignado';
    var sobre = f.megasSobreventa > 0
      ? ' <span class="muted" style="font-size:11px">(' + f.megasSobreventa + 'M sobreventa)</span>'
      : '';
    return '<tr>' +
      '<td><strong>' + titulo + '</strong></td>' +
      '<td style="text-align:center">' + f.clientes + '</td>' +
      '<td style="text-align:center">' + f.megas + 'M' + sobre + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.cobrado) + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.costo) + '</td>' +
      '<td style="text-align:right"><strong style="color:' + (f.ganancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(f.ganancia) + '</strong></td>' +
    '</tr>';
  }).join('');

  var filaNoCubierto = r.costoNoCubierto > 0
    ? '<tr>' +
        '<td><strong class="muted">Capacidad sin vender</strong></td>' +
        '<td style="text-align:center">—</td>' +
        '<td style="text-align:center">' + Math.max(0, r.megasPaquete - r.totalMegas) + 'M</td>' +
        '<td style="text-align:right">—</td>' +
        '<td style="text-align:right">' + RN.calc.formatCUP(r.costoNoCubierto) + '</td>' +
        '<td style="text-align:right"><strong style="color:var(--danger)">−' + RN.calc.formatCUP(r.costoNoCubierto) + '</strong></td>' +
      '</tr>'
    : '';

  var html =
    '<div class="modal-header"><h3>💰 Ganancia del mes — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi ' + (gananciaBruta >= 0 ? 'blue' : 'red') + '" style="margin-bottom:12px">' +
        '<div class="label">Ganancia del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(gananciaBruta) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(gananciaBruta, 'Cobrado − Costo del paquete') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Cobrado</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(ingresos) + '</div><div class="sub">Ingresos reales del mes</div></div>' +
        '<div class="kpi amber"><div class="label">Costo del paquete</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(costoPaquete) + '</div><div class="sub">' + (costoPaquete > 0 ? RN.render.descPaquete() : 'Sin paquete configurado') + '</div></div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi blue"><div class="label">Megas cobrados</div><div class="value" style="font-size:18px">' + r.totalMegas + 'M</div><div class="sub">De los clientes que pagaron</div></div>' +
        '<div class="kpi green"><div class="label">Sobreventa (ganancia directa)</div><div class="value" style="font-size:18px">' + r.megasSobreventa + 'M</div><div class="sub">' + (r.megasSobreventa > 0 ? 'Megas por encima del paquete · costo 0' : 'Sin sobreventa') + '</div></div>' +
      '</div>' +
      '<h4 style="margin:4px 0 8px">Ganancia real por corte</h4>' +
      (r.filas.length
        ? '<div class="table-wrap"><table><thead><tr>' +
            '<th>Corte</th><th style="text-align:center">Clientes</th>' +
            '<th style="text-align:center">Megas</th>' +
            '<th style="text-align:right">Cobrado</th>' +
            '<th style="text-align:right">Costo del paquete</th>' +
            '<th style="text-align:right">Ganancia</th>' +
          '</tr></thead><tbody>' + filas + filaNoCubierto +
          '<tr style="border-top:2px solid var(--border)">' +
            '<td><strong>Total</strong></td>' +
            '<td style="text-align:center"><strong>' + r.totalClientes + '</strong></td>' +
            '<td style="text-align:center"><strong>' + r.totalMegas + 'M</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalCobrado) + '</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalCosto) + '</strong></td>' +
            '<td style="text-align:right"><strong style="color:' + (r.totalGanancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(r.totalGanancia) + '</strong></td>' +
          '</tr></tbody></table></div>'
        : '<div class="acc-empty"><div class="icon">💰</div>Sin cobros registrados este mes todavía.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'El paquete es un <strong>costo fijo</strong> (' + r.megasPaquete + 'M × ' + r.precioMega + ' = ' + RN.calc.formatCUP(costoPaquete) + '). ' +
        'Los primeros ' + r.megasPaquete + 'M cobrados lo consumen en orden de corte; los megas de <strong>sobreventa</strong> no tienen costo y son ganancia directa. ' +
        'Por eso el primer corte puede cubrir todo el paquete y los siguientes son ganancia directa.' +
      '</p>' +
      (sinCosto
        ? '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:12px;color:#e6a700">' +
            '⚠️ No hay precio de proveedor por mega configurado: el costo del paquete se asume 0 y la ganancia está <strong>inflada</strong>. Configúralo en 📡 Gestionar servicio.' +
          '</div>'
        : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal();RN.paqueteProveedor.abrir()">📡 Gestionar servicio</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};
