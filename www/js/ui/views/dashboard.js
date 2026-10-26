/**
 * ui/views/dashboard.js — Panel (Inicio) v5.55.29
 * Hoy (acción) · Mes compacto · Dinero (señales). Sin modo Análisis.
 */
RN.panel = RN.panel || {};

/** Compat: el modo análisis ya no se usa; siempre operación. */
RN.panel.getModo = function () { return 'operacion'; };
RN.panel.setModo = function () {
  try {
    document.body.classList.add('panel-modo-operacion');
    document.body.classList.remove('panel-modo-analisis');
  } catch (e) {}
};
RN.panel.toggleKpiExtra = function () {};

RN.panel._kpiHtml = function (kpis) {
  return (kpis || []).map(function (k) {
    var attr = k.click
      ? ' role="button" tabindex="0" onclick="' + k.click + '" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + k.click + '}" class="kpi ' + k.cls + ' kpi-click"'
      : ' class="kpi ' + (k.cls || '') + '"';
    return '<div' + attr + '><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div>'
      + (k.sub ? '<div class="sub">' + k.sub + '</div>' : '') + '</div>';
  }).join('');
};

/** Clientes que cobran hoy (día de pago = hoy). */
/**
 * v5.55.40 — Clientes que PUEDEN pagar hoy: están dentro de su ventana de cobro
 * (ej. corte 25 → del 21 al 25) y aún no pagaron el mes.
 * Antes solo se miraba diaPago === hoy; por eso el día 23 salía vacío aunque
 * el ciclo del 25 ya estuviera abierto.
 */
RN.panel._cobranHoy = function () {
  var lista = [];
  try {
    var hoy = RN.ciclos && RN.ciclos.diaHoyNum ? RN.ciclos.diaHoyNum() : new Date().getDate();
    var mes = RN.calc.mesActualStr();
    var base = RN.calc.clientesCobrables ? RN.calc.clientesCobrables() : RN.calc.clientesActivos();
    base.forEach(function (c) {
      if (RN.calc.esAdmin && RN.calc.esAdmin(c)) return;
      var st = RN.calc.getStatus(c, mes);
      if (st === 'paid' || st === 'admin') return;
      var dp = c.diaPago || 1;
      var ven = (RN.ciclos && RN.ciclos.ventanaCobro)
        ? RN.ciclos.ventanaCobro(dp)
        : { inicio: dp, fin: dp };
      // Dentro de la ventana hábil de su corte (inicio … día de pago)
      if (hoy < ven.inicio || hoy > ven.fin) return;
      lista.push(c);
    });
  } catch (e) {}
  return lista;
};

/** Bandeja priorizada (máx. 7). */
RN.panel.renderBandeja = function () {
  var box = document.getElementById('panel-bandeja');
  if (!box) return;
  var items = [];
  var mes = RN.calc.mesActualStr();

  // Cobran hoy
  try {
    var hoyCli = RN.panel._cobranHoy();
    if (hoyCli.length) {
      items.push({
        nivel: 'amber',
        texto: hoyCli.length + ' cobran hoy',
        accion: 'RN.tabs.ir(\'cobros\');setTimeout(function(){RN.cobros&&RN.cobros.setFiltro&&RN.cobros.setFiltro(\'hoy\');},80)',
        accionTxt: 'Cobros hoy'
      });
    }
  } catch (e0) {}

  // Cobranza mes
  try {
    var cob = RN.calc.cobranzaMes(mes);
    if (cob && cob.faltan > 0) {
      items.push({
        nivel: cob.faltan > cob.total * 0.5 ? 'red' : 'amber',
        texto: 'Pendientes del mes: ' + cob.faltan + ' de ' + cob.total,
        accion: 'RN.tabs.ir(\'cobros\');setTimeout(function(){RN.cobros&&RN.cobros.setFiltro&&RN.cobros.setFiltro(\'pendientes\');},80)',
        accionTxt: 'Ver pendientes'
      });
    }
  } catch (e1) {}

  // Alertas de widgets (tasa, etc.)
  try {
    if (RN.panelWidgets && RN.panelWidgets._alertas) {
      (RN.panelWidgets._alertas() || []).forEach(function (a) { items.push(a); });
    }
  } catch (e2) {}

  // Deudas urgentes
  try {
    if (RN.investment && RN.investment.colaDeudasOrdenada) {
      var hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
      var en7 = new Date(hoyD.getTime() + 7 * 86400000);
      RN.investment.colaDeudasOrdenada().slice(0, 3).forEach(function (inv) {
        var plan = RN.investment.planDevolucion ? RN.investment.planDevolucion(inv) : {};
        var fo = plan.fechaObjetivo || '';
        var tag = 'Por pagar';
        var nivel = 'amber';
        if (fo) {
          var d = new Date(fo + 'T00:00:00');
          if (!isNaN(d.getTime())) {
            if (d < hoyD) { tag = 'Deuda vencida'; nivel = 'red'; }
            else if (d <= en7) { tag = 'Pagar esta semana'; nivel = 'amber'; }
            else return; // no urgente: no llenar bandeja
          }
        }
        items.push({
          nivel: nivel,
          texto: tag + ': ' + (inv.concepto || 'Préstamo') + ' · ' + (RN.investment.fmtSaldoDeuda ? RN.investment.fmtSaldoDeuda(inv) : ''),
          accion: 'RN.tabs.ir(\'deudas\');setTimeout(function(){RN.inversion&&RN.inversion.devolucionPrestamo&&RN.inversion.devolucionPrestamo(\'' + inv.id + '\');},120)',
          accionTxt: 'Pagar'
        });
      });
    }
  } catch (e3) {}

  // Morosos 2+
  try {
    if (RN.lifecycle && RN.lifecycle.morosos) {
      var m2 = RN.lifecycle.morosos().filter(function (c) { return (RN.calc.getMora(c) || 0) >= 2; });
      if (m2.length) {
        items.push({
          nivel: 'red',
          texto: m2.length + ' moroso' + (m2.length !== 1 ? 's' : '') + ' con 2+ meses',
          accion: 'RN.tabs.ir(\'morosos\')',
          accionTxt: 'Morosos'
        });
      }
    }
  } catch (e4) {}

  // Incidencias abiertas
  try {
    if (RN.state.incidencias && RN.state.incidencias.length) {
      var ab = RN.state.incidencias.filter(function (i) { return i.estado !== 'cerrada'; });
      if (ab.length) {
        items.push({
          nivel: ab.some(function (i) { return i.prioridad === 'alta'; }) ? 'red' : 'amber',
          texto: ab.length + ' incidencia' + (ab.length !== 1 ? 's' : '') + ' abierta' + (ab.length !== 1 ? 's' : ''),
          accion: 'RN.tabs.ir(\'incidencias\')',
          accionTxt: 'Ver'
        });
      }
    }
  } catch (e5) {}

  if (!items.length) {
    box.innerHTML = '<div class="acc-empty" style="padding:12px"><div class="icon">✓</div>Nada urgente por ahora.</div>';
    return;
  }

  items.sort(function (a, b) {
    var wa = a.nivel === 'red' ? 2 : (a.nivel === 'amber' ? 1 : 0);
    var wb = b.nivel === 'red' ? 2 : (b.nivel === 'amber' ? 1 : 0);
    return wb - wa;
  });

  box.innerHTML = items.slice(0, 7).map(function (a) {
    var cls = a.nivel === 'red' ? 'due' : (a.nivel === 'amber' ? 'warn' : 'ok');
    var btn = a.accion
      ? ' <button type="button" class="btn sm primary" onclick="' + a.accion + '">' + RN.render.esc(a.accionTxt || 'Ir') + '</button>'
      : '';
    return '<div class="acc-row" style="align-items:center;gap:8px">'
      + '<span class="acc-label"><span class="badge ' + cls + '">' + (a.nivel === 'red' ? 'Urgente' : (a.nivel === 'amber' ? 'Atención' : 'Info')) + '</span> '
      + RN.render.esc(a.texto) + '</span>'
      + '<span class="acc-value">' + btn + '</span></div>';
  }).join('');
};

RN.render.dashboard = function () {
  var mes = RN.calc.mesActualStr();
  var mesEl = document.getElementById('dashboard-mes');
  if (mesEl) mesEl.textContent = RN.calc.mesTexto ? RN.calc.mesTexto(mes) : mes;

  RN.panel.setModo();

  // —— Hero hoy ——
  var cobranHoy = RN.panel._cobranHoy();
  var montoHoy = 0;
  cobranHoy.forEach(function (c) {
    try {
      var r = RN.calc.resumenCliente(c, mes);
      if (r.estado !== 'paid') montoHoy += (r.totalDeuda != null ? r.totalDeuda : (r.totalMes || 0));
    } catch (e) {}
  });

  var hero = document.getElementById('panel-hero-hoy');
  if (hero) {
    hero.innerHTML =
      '<div class="muted" style="font-size:12px;font-weight:600">Hoy · en ventana de cobro</div>' +
      '<div style="font-size:20px;font-weight:800;margin:4px 0">' +
        (cobranHoy.length
          ? (cobranHoy.length + ' pueden pagar · ' + RN.calc.formatCUP(montoHoy))
          : 'Nadie en ciclo de cobro hoy') +
      '</div>' +
      '<div class="flex wrap" style="gap:8px;margin-top:10px">' +
        '<button type="button" class="btn primary sm" onclick="RN.tabs.ir(\'cobros\')">Ir a Cobros</button>' +
        '<button type="button" class="btn sm" onclick="RN.tabs.ir(\'calendario\')">Calendario</button>' +
      '</div>';
  }

  var kpiHoy = document.getElementById('kpi-dashboard-hoy');
  if (kpiHoy) {
    var cob = { total: 0, pagaron: 0, faltan: 0 };
    try { cob = RN.calc.cobranzaMes(mes) || cob; } catch (e2) {}
    kpiHoy.innerHTML = RN.panel._kpiHtml([
      { label: 'En ciclo', value: String(cobranHoy.length), cls: cobranHoy.length ? 'amber' : 'green', click: 'RN.tabs.ir(\'cobros\')' },
      { label: 'Pend. mes', value: String(cob.faltan || 0), cls: (cob.faltan || 0) ? 'red' : 'green', click: 'RN.tabs.ir(\'cobros\')' },
      { label: 'Pagaron', value: String(cob.pagaron || 0), cls: 'green' }
    ]);
  }

  // —— Mes compacto ——
  var ingresos = 0, gastos = 0, utilidad = 0, tasaCob = 0;
  try { ingresos = RN.calc.ingresosMes(mes) || 0; } catch (e3) {}
  try {
    gastos = (RN.calc.gastosOperativosMes ? RN.calc.gastosOperativosMes(mes) : RN.calc.gastosMes(mes)) || 0;
  } catch (e4) {
    try { gastos = RN.calc.gastosMes(mes) || 0; } catch (e5) { gastos = 0; }
  }
  utilidad = ingresos - gastos;
  try {
    var cob2 = RN.calc.cobranzaMes(mes);
    tasaCob = cob2.total ? Math.round(cob2.pagaron / cob2.total * 100) : 0;
  } catch (e6) {}

  var cont = document.getElementById('kpi-dashboard');
  if (cont) {
    cont.innerHTML = RN.panel._kpiHtml([
      { label: '% cobranza', value: tasaCob + '%', cls: tasaCob >= 80 ? 'green' : (tasaCob >= 50 ? 'amber' : 'red'), click: 'RN.tabs.ir(\'cobros\')' },
      { label: 'Utilidad', value: RN.calc.formatCUP(utilidad), cls: utilidad >= 0 ? 'green' : 'red', click: 'RN.tabs.ir(\'reportes\')' },
      { label: 'Ingresos', value: RN.calc.formatCUP(ingresos), cls: 'green' },
      { label: 'Gastos', value: RN.calc.formatCUP(gastos), cls: 'red' }
    ]);
  }

  // —— Dinero señales ——
  var libre = 0, reserva = 0, porCobrar = 0, saldoDeudas = 0;
  try {
    var bol = RN.calc.bolsillos ? RN.calc.bolsillos(mes) : null;
    if (bol) { libre = bol.libre || 0; reserva = bol.reserva || 0; }
  } catch (e7) {}
  try {
    if (RN.calc.porCobrarMes) porCobrar = RN.calc.porCobrarMes(mes) || 0;
  } catch (e8) {}
  try {
    if (RN.investment && RN.investment.deudasActivas) {
      (RN.investment.deudasActivas() || []).forEach(function (i) {
        saldoDeudas += RN.investment.saldoADevolver ? RN.investment.saldoADevolver(i) : 0;
      });
    }
  } catch (e9) {}

  var contCart = document.getElementById('kpi-dashboard-carteras');
  if (contCart) {
    contCart.innerHTML = RN.panel._kpiHtml([
      { label: 'Libre', value: RN.calc.formatCUP(libre), sub: 'En caja', cls: 'green', click: 'RN.tabs.ir(\'caja\')' },
      { label: 'Reserva', value: RN.calc.formatCUP(reserva), cls: 'blue', click: 'RN.tabs.ir(\'caja\')' },
      { label: 'Por cobrar', value: RN.calc.formatCUP(porCobrar), cls: 'blue', click: 'RN.tabs.ir(\'cobros\')' },
      { label: 'Por pagar', value: RN.calc.formatCUP(saldoDeudas), cls: saldoDeudas > 0 ? 'red' : 'green', click: 'RN.tabs.ir(\'deudas\')' }
    ]);
  }

  // Por pagar solo urgentes
  (function () {
    var card = document.getElementById('card-por-pagar');
    var box = document.getElementById('dashboard-por-pagar');
    if (!card || !box || !RN.investment || !RN.investment.colaDeudasOrdenada) return;
    var hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
    var en7 = new Date(hoyD.getTime() + 7 * 86400000);
    var cola = (RN.investment.colaDeudasOrdenada() || []).filter(function (inv) {
      var plan = RN.investment.planDevolucion ? RN.investment.planDevolucion(inv) : {};
      var fo = plan.fechaObjetivo || '';
      if (!fo) return true;
      var d = new Date(fo + 'T00:00:00');
      if (isNaN(d.getTime())) return true;
      return d <= en7;
    });
    if (!cola.length) { card.style.display = 'none'; box.innerHTML = ''; return; }
    card.style.display = '';
    box.innerHTML = cola.slice(0, 3).map(function (inv) {
      var plan = RN.investment.planDevolucion ? RN.investment.planDevolucion(inv) : {};
      return '<div class="acc-row" style="align-items:center">'
        + '<span class="acc-label">' + RN.render.esc(inv.concepto || 'Deuda')
        + (plan.tiempoTxt ? ' <span class="muted">· ' + plan.tiempoTxt + '</span>' : '') + '</span>'
        + '<span class="acc-value"><strong>' + (RN.investment.fmtSaldoDeuda ? RN.investment.fmtSaldoDeuda(inv) : '') + '</strong> '
        + '<button type="button" class="btn sm primary" onclick="RN.tabs.ir(\'deudas\');setTimeout(function(){RN.inversion&&RN.inversion.devolucionPrestamo&&RN.inversion.devolucionPrestamo(\'' + inv.id + '\');},120)">Pagar</button></span></div>';
    }).join('') + '<div style="margin-top:8px"><button type="button" class="btn sm" onclick="RN.tabs.ir(\'deudas\')">Agenda completa</button></div>';
  })();

  // Proveedor solo si hay costo / pendiente
  (function () {
    var card = document.getElementById('card-proveedor');
    var prov = document.getElementById('dashboard-proveedor');
    if (!card || !prov) return;
    var costo = 0;
    try {
      costo = RN.calc.montoPaqueteProveedor ? RN.calc.montoPaqueteProveedor() : (+(RN.state.config.proveedorMonto) || 0);
    } catch (e10) { costo = +(RN.state.config && RN.state.config.proveedorMonto) || 0; }
    var pendiente = false;
    try {
      if (RN.calc.saldoProveedorMes) pendiente = RN.calc.saldoProveedorMes(mes) > 0;
    } catch (e11) {}
    if (!costo && !pendiente) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    prov.innerHTML = '<h3 style="margin-top:0">Proveedor</h3>'
      + (costo ? '<div class="acc-row"><span class="acc-label">Costo mes</span><span class="acc-value">' + RN.calc.formatCUP(costo) + '</span></div>' : '')
      + '<div style="margin-top:8px"><button type="button" class="btn sm" onclick="RN.paqueteProveedor&&RN.paqueteProveedor.abrir&&RN.paqueteProveedor.abrir()">Gestionar</button></div>';
  })();

  RN.panel.renderBandeja();

  // Solo atención clientes (no análisis / caja embebida)
  if (RN.panelWidgets) {
    try {
      if (RN.panelWidgets.renderAtencionClientes) RN.panelWidgets.renderAtencionClientes();
    } catch (e12) {}
  }
};
