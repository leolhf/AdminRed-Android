/**
 * ui/views/realizados.js — Vista Realizados v5.55.23
 * Resumen del filtro · chips de periodo · historial por mes · recibo a un toque.
 */
RN.realizadosUI = RN.realizadosUI || {};
RN.realizadosUI.periodo = 'este-mes'; // este-mes | anterior | todos | custom
RN.realizadosUI._initMes = false;

RN.realizadosUI.filtroActual = function () {
  return {
    mes: (document.getElementById('filtro-realizados-mes') || {}).value || '',
    tipoPago: (document.getElementById('filtro-realizados-tipo') || {}).value || '',
    q: (document.getElementById('search-realizados') || {}).value || '',
    origen: (document.getElementById('filtro-realizados-origen') || {}).value || ''
  };
};

RN.realizadosUI.onMesChange = function () {
  var v = (document.getElementById('filtro-realizados-mes') || {}).value || '';
  if (!v) RN.realizadosUI.periodo = 'todos';
  else {
    var mes = RN.calc.mesActualStr();
    var ant = RN.realizadosUI.mesAnterior(mes);
    if (v === mes) RN.realizadosUI.periodo = 'este-mes';
    else if (v === ant) RN.realizadosUI.periodo = 'anterior';
    else RN.realizadosUI.periodo = 'custom';
  }
  RN.render.realizados();
};

RN.realizadosUI.setPeriodo = function (p) {
  RN.realizadosUI.periodo = p || 'todos';
  var sel = document.getElementById('filtro-realizados-mes');
  if (!sel) { RN.render.realizados(); return; }
  var mes = RN.calc.mesActualStr();
  if (p === 'este-mes') sel.value = mes;
  else if (p === 'anterior') sel.value = RN.realizadosUI.mesAnterior(mes);
  else if (p === 'todos') sel.value = '';
  // custom: leave select
  RN.render.realizados();
};

RN.realizadosUI.mesAnterior = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var p = mes.split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
};

RN.render._fmtFechaCobro = function (fecha, conHora) {
  if (!fecha) return '—';
  var d = new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha).slice(0, 10);
  if (conHora) {
    return d.toLocaleString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

RN.render._cardCobroRealizado = function (h) {
  var cli = RN.calc.clientePorId(h.clienteId);
  var nombre = cli
    ? '<button type="button" class="linkish" style="background:none;border:0;padding:0;color:inherit;font:inherit;text-align:left" onclick="event.stopPropagation();RN.clientHistory.abrir(\'' + RN.render.escAttr(h.clienteId) + '\')">' + RN.render.esc(cli.nombre) + '</button>'
    : (h.ventaInventario ? 'Venta inventario' : '<span class="muted">Cliente eliminado</span>');

  var concepto = RN.render.esc(h.concepto || h.tipo || 'Cobro');
  if (h.montoEquipo > 0 && h.tipo === 'servicio') concepto += ' + equipo';

  var tipoBadge = RN.render.badgeTipoPago(h);
  var mesActual = RN.calc.mesActualStr();
  var esAdelantado = h.mes && h.mes > mesActual && h.tipo === 'servicio';
  var adelantadoBadge = esAdelantado
    ? ' <span class="badge" style="background:var(--primary-soft);color:var(--primary);font-size:10px;vertical-align:middle">Adelantado</span>'
    : '';

  var origenBadge = '';
  if (h.ventaInventario || h.tipo === 'inventario') {
    origenBadge = ' <span class="badge muted" style="font-size:10px">Inventario</span>';
  } else if (h.tipo === 'servicio' || !h.tipo) {
    origenBadge = ' <span class="badge" style="font-size:10px;background:var(--primary-soft);color:var(--primary)">Servicio</span>';
  }

  var monedaTxt = h.moneda || 'CUP';
  var monedaBadge = '';
  if (h.moneda === 'MIXTO' || ((h.montoPagadoUSD || 0) > 0 && (h.montoPagadoCUP || 0) > 0)) {
    monedaBadge = ' <span class="pill" style="background:var(--success-soft);color:var(--success);font-size:10px">USD+CUP</span>';
  }

  var reciboHtml = h.reciboNum
    ? '<button type="button" class="btn sm" style="padding:2px 8px" onclick="event.stopPropagation();RN.recibo.ver(\'' + RN.render.escAttr(h.id) + '\')">#' + RN.render.esc(h.reciboNum) + '</button>'
    : '<span class="muted">—</span>';

  var fechaTxt = RN.render._fmtFechaCobro(h.fecha, true);
  var estadoCard = h.tipoPago === 'parcial' ? 'parcial' : 'paid';
  var total = RN.calc.totalCobro(h);

  var desgloseHtml = '';
  if (h.tipo === 'servicio') {
    desgloseHtml += '<div class="acc-row"><span class="acc-label">Servicio</span><span class="acc-value">' + RN.calc.formatCUP(h.monto || 0) + '</span></div>';
    if (h.montoMora && h.montoMora > 0) {
      desgloseHtml += '<div class="acc-row"><span class="acc-label">Mora</span><span class="acc-value" style="color:var(--danger)">' + RN.calc.formatCUP(h.montoMora) + ' (' + (h.mora || 0) + 'm)</span></div>';
    }
    if (h.descuentoRecurrente) {
      desgloseHtml += '<div class="acc-row"><span class="acc-label">Desc. recurrente</span><span class="acc-value muted">− ' + RN.calc.formatCUP(h.descuentoRecurrente) + '</span></div>';
    }
  }
  if (h.montoEquipo > 0) {
    desgloseHtml += '<div class="acc-row"><span class="acc-label">Equipo</span><span class="acc-value">' + RN.calc.formatCUP(h.montoEquipo) + '</span></div>';
  }
  if (h.montoPagadoUSD || h.montoPagadoCUP) {
    if ((h.montoPagadoUSD || 0) > 0) {
      desgloseHtml += '<div class="acc-row"><span class="acc-label">Pagado USD</span><span class="acc-value">' + (+h.montoPagadoUSD).toFixed(2) + ' USD</span></div>';
    }
    if ((h.montoPagadoCUP || 0) > 0) {
      desgloseHtml += '<div class="acc-row"><span class="acc-label">Pagado CUP</span><span class="acc-value">' + RN.calc.formatCUP(h.montoPagadoCUP) + '</span></div>';
    }
  }

  var reciboBtn = h.reciboNum
    ? '<div class="acc-summary-real-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();RN.recibo.ver(\'' + RN.render.escAttr(h.id) + '\')">#' + RN.render.esc(h.reciboNum) + '</button></div>'
    : '';

  return '<div class="acc-card" id="acc-real-' + RN.render.escAttr(h.id) + '" data-estado="' + estadoCard + '">' +
    '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-real-' + RN.render.escAttr(h.id) + '\')">' +
      '<span class="acc-dot ' + estadoCard + '"></span>' +
      '<div class="acc-summary-main">' +
        '<div class="acc-summary-name">' + nombre + adelantadoBadge + origenBadge + '</div>' +
        '<div class="acc-summary-sub">' + RN.render.esc(fechaTxt) + ' · ' + concepto + ' · ' + tipoBadge + '</div>' +
      '</div>' +
      '<div class="acc-summary-total">' +
        '<div class="amt">' + RN.calc.formatCUP(total) + '</div>' +
        '<div class="lbl">' + RN.render.esc(monedaTxt) + monedaBadge + '</div>' +
      '</div>' +
      reciboBtn +
      '<span class="acc-chevron">▼</span>' +
    '</div>' +
    '<div class="acc-details">' +
      '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc(fechaTxt) + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Cliente</span><span class="acc-value">' + nombre + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Mes servicio</span><span class="acc-value">' + RN.render.esc(h.mes || '—') + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + concepto + '</span></div>' +
      desgloseHtml +
      '<div class="acc-row"><span class="acc-label">Total</span><span class="acc-value"><strong>' + RN.calc.formatCUP(total) + '</strong>' + (h.excedente ? ' <span class="muted" style="font-size:11px">(vuelto ' + RN.calc.formatCUP(h.excedente) + ')</span>' : '') + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Moneda</span><span class="acc-value">' + RN.render.esc(monedaTxt) + monedaBadge + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Tipo</span><span class="acc-value">' + tipoBadge + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Recibo</span><span class="acc-value">' + reciboHtml + '</span></div>' +
    '</div>' +
  '</div>';
};

RN.render._cintillaMes = function (mesKey, cobros, esPrimera) {
  var totalMes = cobros.reduce(function (s, h) { return s + RN.calc.totalCobro(h); }, 0);
  var parciales = cobros.filter(function (h) { return h.tipoPago === 'parcial'; }).length;
  var nombreMes = mesKey === 'sin-fecha' ? 'Sin fecha' : (RN.calc.mesTexto ? RN.calc.mesTexto(mesKey) : mesKey);
  var cintillaId = 'cintilla-mes-' + mesKey;
  var abierta = esPrimera ? ' cintilla-mes-open' : '';
  var chevron = esPrimera ? ' ▲' : ' ▼';
  var cobrosHtml = cobros.map(function (h) { return RN.render._cardCobroRealizado(h); }).join('');
  var sub = cobros.length + ' cobro' + (cobros.length !== 1 ? 's' : '') + ' · ' + RN.calc.formatCUP(totalMes);
  if (parciales) sub += ' · ' + parciales + ' parcial' + (parciales !== 1 ? 'es' : '');

  return '<div class="cintilla-mes' + abierta + '" id="' + cintillaId + '">' +
    '<div class="cintilla-mes-head" onclick="RN.render.toggleCintillaMes(\'' + cintillaId + '\')">' +
      '<div class="cintilla-mes-titulo">' +
        '<div class="cintilla-mes-nombre">' + RN.render.esc(nombreMes) + '</div>' +
        '<div class="cintilla-mes-sub">' + sub + '</div>' +
      '</div>' +
      '<span class="cintilla-mes-chevron">' + chevron + '</span>' +
    '</div>' +
    '<div class="cintilla-mes-body">' + cobrosHtml + '</div>' +
  '</div>';
};

RN.render._fillFiltroMes = function () {
  var selMes = document.getElementById('filtro-realizados-mes');
  if (!selMes) return;
  var mesSelActual = selMes.value || '';
  var meses = {};
  (RN.state.history || []).forEach(function (h) {
    var k = h.mes || (h.fecha || '').slice(0, 7);
    if (k) meses[k] = true;
  });
  var mesAct = RN.calc.mesActualStr();
  meses[mesAct] = true;
  var keys = Object.keys(meses).sort().reverse();
  selMes.innerHTML = '<option value="">Todos los meses</option>';
  keys.forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = (RN.calc.mesTexto ? RN.calc.mesTexto(m) : m) + (m === mesAct ? ' (actual)' : '');
    selMes.appendChild(opt);
  });
  // Primera visita a la vista: default este mes
  if (!RN.realizadosUI._initMes) {
    RN.realizadosUI._initMes = true;
    RN.realizadosUI.periodo = 'este-mes';
    selMes.value = mesAct;
  } else if (mesSelActual && keys.indexOf(mesSelActual) >= 0) {
    selMes.value = mesSelActual;
  } else if (RN.realizadosUI.periodo === 'este-mes') {
    selMes.value = mesAct;
  } else if (RN.realizadosUI.periodo === 'anterior') {
    selMes.value = RN.realizadosUI.mesAnterior(mesAct);
  } else if (RN.realizadosUI.periodo === 'todos') {
    selMes.value = '';
  }
};

RN.render.realizados = function () {
  var listEl = document.getElementById('lista-realizados');
  if (!listEl) return;

  RN.render._fillFiltroMes();

  var f = RN.realizadosUI.filtroActual();
  var lista = RN.historial.filtrar({
    mes: f.mes,
    tipoPago: f.tipoPago,
    q: f.q
  });

  // Filtro origen
  if (f.origen === 'inventario') {
    lista = lista.filter(function (h) { return h.ventaInventario || h.tipo === 'inventario'; });
  } else if (f.origen === 'servicio') {
    lista = lista.filter(function (h) { return !h.ventaInventario && h.tipo !== 'inventario'; });
  }

  // Chips periodo
  var chipsEl = document.getElementById('realizados-chips');
  if (chipsEl) {
    var per = RN.realizadosUI.periodo || 'todos';
    var chips = [
      { id: 'este-mes', label: 'Este mes' },
      { id: 'anterior', label: 'Mes anterior' },
      { id: 'todos', label: 'Todos' }
    ];
    chipsEl.innerHTML = chips.map(function (ch) {
      var active = per === ch.id || (per === 'custom' && ch.id === 'todos' ? false : per === ch.id);
      return '<button type="button" class="chip' + (active ? ' active' : '') + '" onclick="RN.realizadosUI.setPeriodo(\'' + ch.id + '\')">' + ch.label + '</button>';
    }).join('');
  }

  // Totales del filtro
  var total = lista.reduce(function (s, h) { return s + RN.calc.totalCobro(h); }, 0);
  var completos = lista.filter(function (h) { return (h.tipoPago || 'completo') === 'completo'; }).length;
  var parciales = lista.filter(function (h) { return h.tipoPago === 'parcial'; }).length;
  var cup = 0, usd = 0;
  lista.forEach(function (h) {
    if ((h.montoPagadoUSD || 0) > 0) usd += +h.montoPagadoUSD;
    if ((h.montoPagadoCUP || 0) > 0) cup += +h.montoPagadoCUP;
    else if (h.moneda !== 'USD' && h.moneda !== 'MIXTO') cup += RN.calc.totalCobro(h);
  });

  var periodoLabel = f.mes
    ? (RN.calc.mesTexto ? RN.calc.mesTexto(f.mes) : f.mes)
    : 'Todos los meses';
  var badge = document.getElementById('realizados-periodo');
  if (badge) badge.textContent = periodoLabel;

  var hero = document.getElementById('realizados-hero');
  if (hero) {
    hero.innerHTML =
      '<div class="real-hero">' +
        '<div class="muted" style="font-size:12px;font-weight:600">Según filtros actuales · ' + RN.render.esc(periodoLabel) + '</div>' +
        '<div class="real-total">' + RN.calc.formatCUP(total) + '</div>' +
        '<div class="real-sub">' + lista.length + ' cobro' + (lista.length !== 1 ? 's' : '') +
          (completos ? ' · ' + completos + ' completo' + (completos !== 1 ? 's' : '') : '') +
          (parciales ? ' · ' + parciales + ' parcial' + (parciales !== 1 ? 'es' : '') : '') +
        '</div>' +
        ((usd > 0 || cup > 0) ? '<div class="muted" style="font-size:12px;margin-top:4px">' +
          (cup > 0 ? 'CUP ~' + RN.calc.formatCUP(cup) : '') +
          (cup > 0 && usd > 0 ? ' · ' : '') +
          (usd > 0 ? 'USD ' + usd.toFixed(2) : '') +
        '</div>' : '') +
      '</div>';
  }

  var kpi = document.getElementById('kpi-realizados');
  if (kpi) {
    var kpis = [
      { label: 'Total filtro', value: RN.calc.formatCUP(total), cls: 'green' },
      { label: 'Cobros', value: String(lista.length), cls: 'blue' },
      { label: 'Completos', value: String(completos), cls: 'green' },
      { label: 'Parciales', value: String(parciales), cls: parciales ? 'amber' : 'green' }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value" style="font-size:14px">' + k.value + '</div></div>';
    }).join('');
  }

  var contador = document.getElementById('realizados-contador');
  if (contador) {
    contador.textContent = lista.length
      ? ('Mostrando ' + lista.length + ' cobros · ' + RN.calc.formatCUP(total) + ' · ' + periodoLabel)
      : ('Ningún cobro con estos filtros · ' + periodoLabel);
  }

  if (!lista.length) {
    var vacioHist = !(RN.state.history && RN.state.history.length);
    listEl.innerHTML = '<div class="acc-empty"><div class="icon">💰</div>' +
      (vacioHist
        ? 'Aún no hay cobros registrados. <button type="button" class="btn sm" onclick="RN.ui.tabs&&RN.ui.tabs.ir?RN.ui.tabs.ir(\'cobros\'):RN.render.ir&&RN.render.ir(\'cobros\')">Ir a Cobros</button>'
        : 'No hay cobros que coincidan. <button type="button" class="btn sm" onclick="RN.realizadosUI.setPeriodo(\'todos\')">Ver todos</button>') +
      '</div>';
    return;
  }

  var grupos = {};
  var ordenMeses = [];
  lista.forEach(function (h) {
    var mesKey = h.mes || (h.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
    grupos[mesKey].push(h);
  });
  ordenMeses.sort().reverse();

  listEl.innerHTML = ordenMeses.map(function (mesKey, idx) {
    return RN.render._cintillaMes(mesKey, grupos[mesKey], idx === 0);
  }).join('');
};

RN.render.toggleCintillaMes = function (cintillaId) {
  var el = document.getElementById(cintillaId);
  if (!el) return;
  var isOpen = el.classList.toggle('cintilla-mes-open');
  var chev = el.querySelector('.cintilla-mes-chevron');
  if (chev) chev.textContent = isOpen ? ' ▲' : ' ▼';
};

RN.render._filaDetalle = function (label, valor, opts) {
  opts = opts || {};
  if (opts.cond === false) return '';
  var style = opts.bold ? ' style="font-weight:600"' : '';
  var valHtml = valor;
  if (opts.strong) {
    var colorStyle = opts.color ? ' style="color:' + opts.color + '"' : '';
    valHtml = '<strong' + colorStyle + '>' + valor + '</strong>';
  }
  return '<div class="acc-row"' + style + '><span class="acc-label">' + label + '</span><span class="acc-value">' + valHtml + '</span></div>';
};
