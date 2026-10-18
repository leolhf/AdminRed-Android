/**
 * ui/views/cobros.js — Vista Cobros v5.55.22
 * Mes (KPIs) · Cola (chips + orden) · Lista con Cobrar a un toque · Cierre aparte.
 */
RN.cobros = RN.cobros || {};
RN.cobrosFiltro = RN.cobrosFiltro || 'pendientes'; // pendientes | todos | hoy | ciclo | vencidos | notificados | pagados
RN.cobros.orden = RN.cobros.orden || 'urgencia';

RN.cobros.setFiltro = function (f) {
  RN.cobrosFiltro = f || 'pendientes';
  RN.render.cobros();
};

RN.cobros.onOrden = function () {
  var el = document.getElementById('cobros-orden');
  if (el) RN.cobros.orden = el.value || 'urgencia';
  RN.render.cobros();
};

/** Chips de cola de cobro. */
RN.cobros._pintarRecordatorios = function (res, stats) {
  var bar = document.getElementById('cobros-recordatorios');
  if (!bar) return;
  var f = RN.cobrosFiltro || 'pendientes';
  var nHoy = res ? res.hoy.length : 0;
  var nCiclo = res ? res.enCiclo.length : 0;
  var nVen = res ? res.vencidos.length : 0;
  var nWa = res ? res.notificados.length : 0;
  var nPend = stats ? stats.pendientes : 0;
  var nPag = stats ? stats.pagados : 0;

  var chips = [
    { id: 'pendientes', cls: 'chip-venc', label: 'Pendientes', n: nPend },
    { id: 'hoy', cls: 'chip-hoy', label: 'Hoy', n: nHoy },
    { id: 'ciclo', cls: 'chip-ciclo', label: 'En ciclo', n: nCiclo },
    { id: 'vencidos', cls: 'chip-venc', label: 'Vencidos', n: nVen },
    { id: 'pagados', cls: '', label: 'Pagados', n: nPag },
    { id: 'notificados', cls: 'chip-wa', label: 'Notificados WA', n: nWa },
    { id: 'todos', cls: '', label: 'Todos', n: null }
  ];
  var html = chips.map(function (ch) {
    var active = f === ch.id ? ' active' : '';
    var nHtml = ch.n != null ? '<span class="n">' + ch.n + '</span>' : '';
    return '<button type="button" class="cobros-rec-chip ' + ch.cls + active + '" onclick="RN.cobros.setFiltro(\'' + ch.id + '\')">' +
      ch.label + nHtml + '</button>';
  }).join('');

  var cv = RN.ciclos.corteVigente && RN.ciclos.corteVigente();
  var hint = '';
  if (cv && RN.ciclos.ventanaCobro) {
    var venTxt = RN.ciclos.ventanaCobro(cv.diaPago).texto;
    hint = '<p class="cobros-rec-hint">Corte: día <strong>' + cv.diaPago + '</strong> · ventana <strong>' + venTxt + '</strong></p>';
  }
  bar.innerHTML = html + hint;
  bar.style.display = '';
};

RN.render.cobros = function () {
  var cont = document.getElementById('lista-cobros');
  if (!cont) return;

  var mes = RN.calc.mesActualStr();
  var badge = document.getElementById('cobros-mes-badge');
  if (badge) badge.textContent = mes;

  var ordEl = document.getElementById('cobros-orden');
  if (ordEl) ordEl.value = RN.cobros.orden || 'urgencia';

  var q = (document.getElementById('search-cobros') || {}).value || '';
  var cobrables = (RN.calc.clientesCobrables ? RN.calc.clientesCobrables() : RN.calc.clientesActivos().filter(function (c) {
    return !(RN.calc.esAdmin && RN.calc.esAdmin(c));
  }));

  // KPIs del mes
  var cobrado = 0, esperado = 0;
  try {
    cobrado = RN.calc.ingresosServicioMes ? RN.calc.ingresosServicioMes(mes) : (RN.calc.ingresosMes(mes) || 0);
  } catch (e) { cobrado = RN.calc.ingresosMes(mes) || 0; }
  cobrables.forEach(function (c) {
    try { esperado += RN.calc.netoEsperadoMes(c, mes) || 0; } catch (e2) {}
  });
  esperado = Math.round(esperado * 100) / 100;
  cobrado = Math.round(cobrado * 100) / 100;
  var pct = esperado > 0 ? Math.round((cobrado / esperado) * 100) : 0;
  var pctCls = pct >= 80 ? 'is-ok' : (pct >= 40 ? 'is-mid' : 'is-low');

  var nPagados = 0, nPendientes = 0, nParcial = 0;
  cobrables.forEach(function (c) {
    var st = RN.calc.getStatus(c, mes);
    if (st === 'paid') nPagados++;
    else if (st === 'parcial') { nParcial++; nPendientes++; }
    else nPendientes++;
  });

  var hero = document.getElementById('cobros-hero');
  if (hero) {
    hero.innerHTML =
      '<div class="cob-hero">' +
        '<div class="muted" style="font-size:12px;font-weight:600">Avance de cobranza · ' + RN.render.esc(mes) + '</div>' +
        '<div class="cob-pct ' + pctCls + '">' + pct + '%</div>' +
        '<div class="cob-sub"><strong>' + RN.calc.formatCUP(cobrado) + '</strong> cobrado / <strong>' + RN.calc.formatCUP(esperado) + '</strong> esperado</div>' +
        '<div class="muted" style="font-size:12px">' + nPendientes + ' pendiente' + (nPendientes !== 1 ? 's' : '') +
          (nParcial ? ' · ' + nParcial + ' parcial' + (nParcial !== 1 ? 'es' : '') : '') +
          ' · ' + nPagados + ' pagado' + (nPagados !== 1 ? 's' : '') + '</div>' +
        '<div class="cob-hero-actions">' +
          '<button type="button" class="btn primary" onclick="RN.cobros.setFiltro(\'pendientes\')">Ver pendientes</button>' +
          '<button type="button" class="btn" onclick="RN.cobros.setFiltro(\'hoy\')">Cobran hoy</button>' +
        '</div>' +
      '</div>';
  }

  var kpi = document.getElementById('kpi-cobros');
  if (kpi) {
    var kpis = [
      { label: 'Cobrado', value: RN.calc.formatCUP(cobrado), cls: 'green' },
      { label: 'Esperado', value: RN.calc.formatCUP(esperado), cls: 'blue' },
      { label: 'Pendientes', value: String(nPendientes), cls: nPendientes ? 'red' : 'green' },
      { label: 'Pagados', value: String(nPagados), cls: 'green' }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value" style="font-size:14px">' + k.value + '</div></div>';
    }).join('');
  }

  // Recordatorios ciclo
  var res = null;
  try {
    res = RN.ciclos.resumenRecordatorios ? RN.ciclos.resumenRecordatorios() : null;
  } catch (e3) { res = null; }
  RN.cobros._pintarRecordatorios(res, { pendientes: nPendientes, pagados: nPagados });

  // Lista base
  var lista = cobrables.slice();
  if (q) lista = RN.calc.filtrarClientes(lista, q);

  var filtro = RN.cobrosFiltro || 'pendientes';
  if (filtro === 'pendientes') {
    lista = lista.filter(function (c) {
      var st = RN.calc.getStatus(c, mes);
      return st !== 'paid' && st !== 'admin';
    });
  } else if (filtro === 'pagados') {
    lista = lista.filter(function (c) { return RN.calc.getStatus(c, mes) === 'paid'; });
  } else if (res && filtro !== 'todos') {
    var ids = {};
    var arr = filtro === 'hoy' ? res.hoy
      : filtro === 'ciclo' ? res.enCiclo
      : filtro === 'vencidos' ? res.vencidos
      : filtro === 'notificados' ? res.notificados
      : null;
    if (arr) {
      arr.forEach(function (c) { ids[c.id] = true; });
      lista = lista.filter(function (c) { return ids[c.id]; });
    }
  }

  // Orden
  var orden = RN.cobros.orden || 'urgencia';
  var hoyN = RN.ciclos.diaHoyNum ? RN.ciclos.diaHoyNum() : new Date().getDate();
  if (orden === 'nombre') {
    lista.sort(function (a, b) {
      return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
  } else if (orden === 'dia') {
    lista.sort(function (a, b) {
      return (a.diaPago || 1) - (b.diaPago || 1) || (a.nombre || '').localeCompare(b.nombre || '', 'es');
    });
  } else if (orden === 'monto') {
    lista.sort(function (a, b) {
      var ra = RN.calc.resumenCliente(a, mes);
      var rb = RN.calc.resumenCliente(b, mes);
      var ta = (ra.totalMes || 0) + (ra.moraMonto || 0);
      var tb = (rb.totalMes || 0) + (rb.moraMonto || 0);
      if (RN.calc.getStatus(a, mes) === 'paid') ta = 0;
      if (RN.calc.getStatus(b, mes) === 'paid') tb = 0;
      return tb - ta;
    });
  } else {
    lista.sort(function (a, b) {
      function urgencia(c) {
        var st = RN.calc.getStatus(c, mes);
        if (st === 'paid' || st === 'admin') return 50;
        var dp = c.diaPago || 1;
        if (dp === hoyN) return 0;
        var ven = RN.ciclos.ventanaCobro ? RN.ciclos.ventanaCobro(dp) : { inicio: dp, fin: dp };
        if (hoyN >= ven.inicio && hoyN < dp) return 1;
        if (dp < hoyN || RN.calc.getMora(c) > 0) return 2;
        return 3;
      }
      var ua = urgencia(a), ub = urgencia(b);
      if (ua !== ub) return ua - ub;
      return (a.nombre || '').localeCompare(b.nombre || '', 'es');
    });
  }

  var contador = document.getElementById('cobros-contador');
  if (contador) {
    contador.textContent = lista.length
      ? ('Mostrando ' + lista.length + ' · Filtro: ' + filtro + ' · Mes ' + mes)
      : ('Nadie en este filtro · Mes ' + mes);
  }

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💳</div>' +
      (filtro !== 'todos' && filtro !== 'pendientes'
        ? 'Nadie en este filtro. <button type="button" class="btn sm" onclick="RN.cobros.setFiltro(\'pendientes\')">Ver pendientes</button>'
        : (filtro === 'pendientes'
          ? 'No hay pendientes. <button type="button" class="btn sm" onclick="RN.cobros.setFiltro(\'todos\')">Ver todos</button>'
          : 'No hay clientes cobrables.')) +
      '</div>';
    return;
  }

  cont.innerHTML = lista.map(function (c) {
    var r = RN.calc.resumenCliente(c, mes);
    var estado = r.estado;
    var deuda = r.deuda;
    var neto = r.neto;
    var cuotaEq = r.cuotaEq;
    var mora = r.mora;
    var total = (r.totalMes || 0) + (r.moraMonto || 0);
    var ven = (RN.ciclos && RN.ciclos.ventanaCobro)
      ? RN.ciclos.ventanaCobro(c.diaPago || 1)
      : { texto: 'día ' + (c.diaPago || 1) };

    var subParts = [];
    subParts.push(RN.render.esc(RN.render.nombrePlan(c)));
    subParts.push(RN.render.esc(ven.texto || ('día ' + (c.diaPago || 1))));
    if (c.telefono) subParts.push(RN.render.esc(c.telefono));

    var notificadoWa = false;
    try {
      notificadoWa = !!(RN.notifyState && RN.notifyState.notificadoWaCiclo
        && RN.notifyState.notificadoWaCiclo(c.id, c.diaPago || 1)
        && estado !== 'paid');
    } catch (e4) { notificadoWa = false; }

    var nombreExtra = '';
    if (notificadoWa) nombreExtra += ' <span class="wa-notificado-ico" title="Notificado por WhatsApp en este ciclo">💬</span>';
    if (mora > 0) nombreExtra += ' <span class="badge due" style="font-size:10px;vertical-align:middle">Mora: ' + mora + 'm</span>';

    var accBtn = '';
    if (estado === 'paid') {
      accBtn = '';
    } else if (estado === 'parcial') {
      accBtn = '<button type="button" class="btn sm primary" onclick="event.stopPropagation();RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Completar</button>';
    } else {
      accBtn = '<button type="button" class="btn sm primary" onclick="event.stopPropagation();RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar</button>';
    }
    var cobrarWrap = accBtn
      ? '<div class="acc-summary-cob-actions">' + accBtn + '</div>'
      : '';

    var descsMes = (RN.state.descuentos || []).filter(function (d) {
      return d.clienteId === c.id && d.estado !== 'anulado' && RN.descuentos && RN.descuentos.vigenteEnMes && RN.descuentos.vigenteEnMes(d, mes);
    });
    var impactoDesc = descsMes.reduce(function (acc, d) {
      return acc + ((RN.calc.valorDescuento && RN.calc.valorDescuento(d, c.id)) || 0);
    }, 0);
    var GIFT = '\uD83C\uDF81';
    var giftTitle = 'Descuentos de ' + RN.render.esc(c.nombre) +
      (descsMes.length ? ' — ' + RN.calc.formatCUP(impactoDesc) : '');
    var giftBtn = '<button type="button" class="btn sm gift-btn' + (descsMes.length ? ' has-desc' : '') + '" title="' + giftTitle + '" onclick="RN.descuentos.abrirParaCliente(\'' + RN.render.escAttr(c.id) + '\')">' + GIFT + (descsMes.length ? ' <span class="gift-count">' + descsMes.length + '</span>' : '') + '</button>';
    var descRowsHtml = descsMes.length
      ? descsMes.map(function (d) {
          var mtxt = d.motivo ? RN.render.esc(d.motivo) : '';
          return '<span class="badge ok" title="' + mtxt + '">' + RN.render.esc(d.tipo) + (mtxt ? ': ' + mtxt : '') + ' (−' + RN.calc.formatCUP(RN.calc.valorDescuento(d, c.id)) + ')</span>';
        }).join(' ')
      : '<span class="muted">Ninguna este mes</span>';

    var waBtn = (estado !== 'paid' && c.telefono)
      ? '<button type="button" class="btn sm" onclick="event.stopPropagation(); RN.whatsapp.enviarRecordatorio(\'' + RN.render.escAttr(c.id) + '\')">WhatsApp</button>'
      : '';

    var detailCobrar = '';
    if (estado === 'paid') {
      detailCobrar = '<span class="muted">Pagado este mes</span>';
    } else if (estado === 'parcial') {
      detailCobrar = '<button type="button" class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Completar pago</button>';
    } else {
      detailCobrar = '<button type="button" class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar ' + RN.calc.formatCUP(total) + '</button>';
    }

    return '<div class="acc-card' + (notificadoWa ? ' notificado-wa' : '') + '" id="acc-cob-' + RN.render.escAttr(c.id) + '"' +
      (notificadoWa ? ' data-notificado="wa"' : '') + '>' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cob-' + RN.render.escAttr(c.id) + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + nombreExtra + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join(' · ') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (cuotaEq > 0 ? 'Total (+equipo)' : 'A cobrar') + '</div>' +
        '</div>' +
        cobrarWrap +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan / Precio</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">Base: ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Ciclo de cobro</span><span class="acc-value"><strong>' + RN.render.esc(ven.texto) + '</strong> <span class="muted">(cierra día ' + (c.diaPago || 1) + ')</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) +
          (notificadoWa ? ' <span class="badge ok">Notificado WA</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Neto a cobrar</span><span class="acc-value">' + RN.calc.formatCUP(neto) + (cuotaEq > 0 ? ' <span class="pill">+ equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Bonificaciones</span><span class="acc-value">' + descRowsHtml + '</span></div>' +
        '<div class="acc-actions">' + detailCobrar + ' ' + waBtn + ' ' + giftBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
