/**
 * ui/views/dashboard.js — Panel (Inicio) v5.55.8
 * Zonas: Hoy (acción) · Mes (resultado) · Caja y capital.
 * Modo Día a día / Análisis. KPIs mínimos + detalle. Bandeja unificada.
 */
RN.panel = RN.panel || {};

RN.panel.getModo = function () {
  try {
    var m = localStorage.getItem('RN_panel_modo');
    if (m === 'analisis' || m === 'operacion') return m;
  } catch (e) {}
  return 'operacion';
};

RN.panel.setModo = function (modo) {
  if (modo !== 'analisis' && modo !== 'operacion') modo = 'operacion';
  try { localStorage.setItem('RN_panel_modo', modo); } catch (e) {}
  document.body.classList.toggle('panel-modo-operacion', modo === 'operacion');
  document.body.classList.toggle('panel-modo-analisis', modo === 'analisis');
  var bOp = document.getElementById('panel-modo-operacion');
  var bAn = document.getElementById('panel-modo-analisis');
  if (bOp) bOp.classList.toggle('active', modo === 'operacion');
  if (bAn) bAn.classList.toggle('active', modo === 'analisis');
  if (RN.render && RN.render.dashboard) RN.render.dashboard();
};

RN.panel.toggleKpiExtra = function () {
  var el = document.getElementById('kpi-dashboard-extra');
  var btn = document.getElementById('btn-kpi-extra');
  if (!el) return;
  var visible = el.style.display !== 'none' && el.style.display !== '';
  if (visible) {
    el.style.display = 'none';
    if (btn) btn.textContent = 'Ver más indicadores';
  } else {
    el.style.display = '';
    if (btn) btn.textContent = 'Ocultar indicadores';
  }
};

RN.panel._kpiHtml = function (kpis) {
  return (kpis || []).map(function (k) {
    var attr = k.click
      ? ' role="button" tabindex="0" onclick="' + k.click + '" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + k.click + '}" class="kpi ' + k.cls + ' kpi-click"'
      : ' class="kpi ' + (k.cls || '') + '"';
    return '<div' + attr + '><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div>'
      + (k.sub ? '<div class="sub">' + k.sub + '</div>' : '') + '</div>';
  }).join('');
};

/** Bandeja del día: alertas + deudas + resumen cobranza. */
RN.panel.renderBandeja = function () {
  var box = document.getElementById('panel-bandeja');
  if (!box) return;
  var items = [];

  try {
    var cob = RN.calc.cobranzaMes();
    if (cob && cob.faltan > 0) {
      items.push({
        nivel: cob.faltan > cob.total * 0.5 ? 'red' : 'amber',
        texto: 'Cobranza: faltan ' + cob.faltan + ' de ' + cob.total + ' clientes'
          + (cob.parciales ? ' · ' + cob.parciales + ' parcial' : ''),
        accion: 'RN.cobranza.abrir()',
        accionTxt: 'Ver cobranza'
      });
    }
  } catch (e) {}

  try {
    if (RN.panelWidgets && RN.panelWidgets._alertas) {
      (RN.panelWidgets._alertas() || []).forEach(function (a) { items.push(a); });
    }
  } catch (e) {}

  try {
    if (RN.investment && RN.investment.colaDeudasOrdenada) {
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      var en7 = new Date(hoy.getTime() + 7 * 86400000);
      RN.investment.colaDeudasOrdenada().slice(0, 4).forEach(function (inv) {
        var plan = RN.investment.planDevolucion(inv);
        var fo = plan.fechaObjetivo || '';
        var tag = 'Por pagar';
        var nivel = 'amber';
        if (fo) {
          var d = new Date(fo + 'T00:00:00');
          if (!isNaN(d.getTime())) {
            if (d < hoy) { tag = 'Deuda vencida'; nivel = 'red'; }
            else if (d <= en7) { tag = 'Pagar esta semana'; nivel = 'amber'; }
          }
        }
        items.push({
          nivel: nivel,
          texto: tag + ': ' + (inv.concepto || 'Préstamo') + ' · ' + RN.investment.fmtSaldoDeuda(inv),
          accion: 'RN.tabs.ir(\'deudas\');setTimeout(function(){RN.inversion.devolucionPrestamo(\'' + inv.id + '\');},120)',
          accionTxt: 'Pagar'
        });
      });
    }
  } catch (e) {}

  if (!items.length) {
    box.innerHTML = '<div class="acc-empty" style="padding:12px"><div class="icon">✓</div>Nada urgente por ahora.</div>';
    return;
  }

  items.sort(function (a, b) {
    var wa = a.nivel === 'red' ? 2 : (a.nivel === 'amber' ? 1 : 0);
    var wb = b.nivel === 'red' ? 2 : (b.nivel === 'amber' ? 1 : 0);
    return wb - wa;
  });

  box.innerHTML = items.slice(0, 10).map(function (a) {
    var cls = a.nivel === 'red' ? 'due' : (a.nivel === 'amber' ? 'warn' : 'ok');
    return '<div class="acc-row" style="align-items:center;gap:8px">'
      + '<span class="acc-label"><span class="badge ' + cls + '">' + (a.nivel === 'red' ? 'Urgente' : (a.nivel === 'amber' ? 'Atención' : 'Info')) + '</span> '
      + RN.render.esc(a.texto) + '</span>'
      + (a.accion
        ? '<span class="acc-value"><button type="button" class="btn sm primary" onclick="' + a.accion + '">' + RN.render.esc(a.accionTxt || 'Ver') + '</button></span>'
        : '')
      + '</div>';
  }).join('');
};

RN.render.dashboard = function () {
  var modo = RN.panel.getModo();
  document.body.classList.toggle('panel-modo-operacion', modo === 'operacion');
  document.body.classList.toggle('panel-modo-analisis', modo === 'analisis');
  var bOp = document.getElementById('panel-modo-operacion');
  var bAn = document.getElementById('panel-modo-analisis');
  if (bOp) bOp.classList.toggle('active', modo === 'operacion');
  if (bAn) bAn.classList.toggle('active', modo === 'analisis');

  var mesOper = document.getElementById('dashboard-mes');
  if (mesOper) {
    var mesAct = RN.calc.mesActualStr();
    mesOper.innerHTML = 'Mes: <strong>' + RN.calc.mesTexto(mesAct) + '</strong>';
    mesOper.className = 'mes-badge muted';
  }

  var cob = RN.calc.cobranzaMes();
  var ingresos = RN.calc.ingresosMes();
  var gastos = RN.calc.gastosMes();
  var utilidad = ingresos - gastos;
  var esperado = RN.calc.ingresoEsperadoMes();
  var ingresoServMes = RN.calc.ingresosServicioMes();
  var tasaCob = esperado ? Math.round(ingresoServMes / esperado * 100) : 0;
  var activos = RN.calc.clientesActivos();
  var morosos = activos.filter(function (c) { return RN.calc.getMora(c) > 0; }).length;
  var parciales = cob.parciales || 0;
  var fondoCaja = RN.calc.fondoCaja();
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var gananciaBruta = ingresos - costoPaquete;
  var gananciaProyectada = esperado - costoPaquete;

  var b = RN.calc.bolsillos ? RN.calc.bolsillos() : { retirable: 0, libre: 0, reserva: 0 };
  var libre = Math.max(0, +(b.retirable != null ? b.retirable : b.libre) || 0);

  var mesAnt = RN.calc.mesAnterior(RN.calc.mesActualStr());
  var ingresosAnt = RN.calc.ingresosMes(mesAnt);
  var gastosAnt = RN.calc.gastosMes(mesAnt);
  var utilidadAnt = ingresosAnt - gastosAnt;
  var delta = (RN.panelWidgets && RN.panelWidgets.deltaHTML) ? RN.panelWidgets.deltaHTML : function () { return ''; };

  var kpiHoy = document.getElementById('kpi-dashboard-hoy');
  if (kpiHoy) {
    kpiHoy.innerHTML = RN.panel._kpiHtml([
      { label: 'Cobranza', value: cob.pagaron + '/' + cob.total, sub: 'Faltan ' + cob.faltan + (parciales ? ' · ' + parciales + ' parcial' : '') + ' — toca', cls: 'blue', click: 'RN.cobranza.abrir()' },
      { label: 'Tasa de cobro', value: tasaCob + '%', sub: 'Servicio cobrado sobre esperado', cls: tasaCob >= 70 ? 'green' : (tasaCob >= 40 ? 'amber' : 'red') },
      { label: 'Clientes morosos', value: String(morosos), sub: morosos ? 'Atrasados — toca' : 'Ninguno atrasado', cls: morosos ? 'red' : 'green', click: 'RN.mora.abrir()' },
      { label: 'Libre en caja', value: RN.calc.formatCUP(libre), sub: RN.render.subUSD ? RN.render.subUSD(libre, 'Bolsillo retirable') : 'Bolsillo retirable', cls: libre > 0 ? 'green' : 'red', click: 'RN.caja.extraer()' }
    ]);
  }

  var cont = document.getElementById('kpi-dashboard');
  if (cont) {
    cont.innerHTML = RN.panel._kpiHtml([
      { label: 'Ingresos del mes', value: RN.calc.formatCUP(ingresos), sub: (RN.render.subUSD ? RN.render.subUSD(ingresos, 'Toca para resumen') : '') + delta(ingresos, ingresosAnt), cls: 'green', click: 'RN.ingresosMes.abrir()' },
      { label: 'Ganancia del mes', value: RN.calc.formatCUP(gananciaBruta), sub: (RN.render.subUSD ? RN.render.subUSD(gananciaBruta, 'Cobrado − paquete') : ''), cls: gananciaBruta >= 0 ? 'blue' : 'red', click: 'RN.gananciaCortes && RN.gananciaCortes.abrirReal()' },
      { label: 'Utilidad neta', value: RN.calc.formatCUP(utilidad), sub: (RN.render.subUSD ? RN.render.subUSD(utilidad, 'Ingresos − Gastos') : '') + delta(utilidad, utilidadAnt), cls: utilidad >= 0 ? 'blue' : 'red', click: 'RN.utilidadMes.abrir()' },
      { label: 'Gastos del mes', value: RN.calc.formatCUP(gastos), sub: (RN.render.subUSD ? RN.render.subUSD(gastos, 'Toca para ver') : '') + delta(gastos, gastosAnt, { invertido: true }), cls: 'amber', click: 'RN.tabs.ir(\'gastos\')' }
    ]);
  }

  var contExtra = document.getElementById('kpi-dashboard-extra');
  if (contExtra) {
    contExtra.innerHTML = RN.panel._kpiHtml([
      { label: 'Costo del paquete', value: RN.calc.formatCUP(costoPaquete), sub: costoPaquete > 0 ? 'Proveedor' : 'Sin paquete', cls: 'amber', click: 'RN.paqueteProveedor.abrir()' },
      { label: 'Ganancia proyectada', value: RN.calc.formatCUP(gananciaProyectada), sub: 'Esperado − paquete', cls: gananciaProyectada >= 0 ? 'green' : 'red', click: 'RN.gananciaCortes && RN.gananciaCortes.abrirProyectada()' },
      { label: 'Ingreso esperado', value: RN.calc.formatCUP(esperado), sub: 'Si cobran todos', cls: 'blue' },
      { label: 'Fondo de caja', value: RN.calc.formatCUP(fondoCaja), sub: 'Total (reserva + libre)', cls: fondoCaja >= 0 ? 'green' : 'red', click: 'RN.caja.extraer()' }
    ]);
    if (modo === 'operacion') {
      contExtra.style.display = 'none';
      var btn = document.getElementById('btn-kpi-extra');
      if (btn) btn.textContent = 'Ver más indicadores';
    }
  }

  var contCart = document.getElementById('kpi-dashboard-carteras');
  if (contCart) {
    var porCobrar = 0;
    try {
      if (RN.investment && RN.investment.porCobrarTotal) porCobrar = RN.investment.porCobrarTotal();
      else {
        var mes = RN.calc.mesActualStr();
        (RN.state.clients || []).forEach(function (c) {
          porCobrar += RN.calc.deudaTotalCliente ? RN.calc.deudaTotalCliente(c, mes) : 0;
        });
      }
    } catch (e) {}
    var saldoDeudas = 0;
    try {
      (RN.investment.deudasActivas() || []).forEach(function (i) {
        saldoDeudas += RN.investment.saldoADevolver(i);
      });
    } catch (e) {}
    contCart.innerHTML = RN.panel._kpiHtml([
      { label: 'Por cobrar', value: RN.calc.formatCUP(porCobrar), sub: 'Cartera de clientes', cls: 'blue', click: 'RN.tabs.ir(\'cobros\')' },
      { label: 'Por pagar', value: RN.calc.formatCUP(saldoDeudas), sub: 'Préstamos externos', cls: saldoDeudas > 0 ? 'red' : 'green', click: 'RN.tabs.ir(\'deudas\')' },
      { label: 'En caja (libre)', value: RN.calc.formatCUP(libre), sub: 'Reserva ' + RN.calc.formatCUP(b.reserva || 0), cls: 'green', click: 'RN.caja.extraer()' }
    ]);
  }

  var totalInv = RN.investment.totalInvertido();
  var recInv = RN.investment.totalRecuperado();
  var pctRecup = totalInv ? +(recInv / totalInv * 100).toFixed(1) : 0;
  var res = document.getElementById('dashboard-resumen');
  if (res) {
    res.innerHTML = '<div class="flex wrap" style="gap:24px">'
      + '<div><strong>Clientes activos:</strong> ' + activos.length + '</div>'
      + '<div><strong>Planes:</strong> ' + (RN.state.planes || []).length + '</div>'
      + '<div><strong>Capital en red recuperado:</strong> ' + pctRecup + '%</div>'
      + '<div><strong>Predicción próximo mes:</strong> ' + RN.calc.formatCUP(RN.calc.prediccionIngresos()) + '</div>'
      + '</div>';
  }

  var recupEl = document.getElementById('dashboard-recuperacion');
  var recupCard = document.getElementById('card-recuperacion');
  if (recupEl && recupCard) {
    if (totalInv > 0 && RN.render.barraRecuperacion) {
      recupCard.style.display = '';
      recupEl.innerHTML = RN.render.barraRecuperacion();
    } else {
      recupCard.style.display = 'none';
    }
  }

  var prov = document.getElementById('dashboard-proveedor');
  if (prov) {
    var htmlP = '<h3 style="margin-top:0">Proveedor / paquete</h3>';
    if (costoPaquete > 0) {
      htmlP += '<div class="acc-row"><span class="acc-label">Costo del mes</span><span class="acc-value">' + RN.calc.formatCUP(costoPaquete) + '</span></div>';
      htmlP += '<div style="margin-top:8px"><button class="btn sm" onclick="RN.paqueteProveedor.abrir()">Gestionar servicio</button></div>';
    } else {
      htmlP += '<div class="muted">Sin paquete configurado.</div>';
      htmlP += '<div style="margin-top:8px"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">Configurar</button></div>';
    }
    prov.innerHTML = htmlP;
  }

  (function () {
    var card = document.getElementById('card-por-pagar');
    var box = document.getElementById('dashboard-por-pagar');
    if (!card || !box || !RN.investment || !RN.investment.colaDeudasOrdenada) return;
    var cola = RN.investment.colaDeudasOrdenada();
    if (!cola.length) { card.style.display = 'none'; box.innerHTML = ''; return; }
    card.style.display = '';
    box.innerHTML = cola.slice(0, 5).map(function (inv) {
      var plan = RN.investment.planDevolucion(inv);
      return '<div class="acc-row" style="align-items:center">'
        + '<span class="acc-label">' + RN.render.esc(inv.concepto || 'Deuda')
        + (plan.tiempoTxt ? ' <span class="muted">· ' + plan.tiempoTxt + '</span>' : '') + '</span>'
        + '<span class="acc-value"><strong>' + RN.investment.fmtSaldoDeuda(inv) + '</strong> '
        + '<button class="btn sm primary" onclick="RN.tabs.ir(\'deudas\');setTimeout(function(){RN.inversion.devolucionPrestamo(\'' + inv.id + '\');},120)">Pagar</button></span></div>';
    }).join('') + '<div style="margin-top:10px"><button class="btn sm" onclick="RN.tabs.ir(\'deudas\')">Agenda completa</button></div>';
  })();

  RN.panel.renderBandeja();

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () {
      if (RN.render.animarBarrasRecuperacion) RN.render.animarBarrasRecuperacion();
    });
  } else if (RN.render.animarBarrasRecuperacion) {
    RN.render.animarBarrasRecuperacion();
  }

  if (RN.panelWidgets && RN.panelWidgets.renderAll) {
    RN.panelWidgets.renderAll();
  }
};
