/**
 * ui/views/realizados.js — Vista Realizados: historial de cobros, cintillas por mes y detalle.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */
// ---------- REALIZADOS (Historial de cobros) ----------
// v5.12.3: Historial agrupado por mes en cintillas colapsables.
// v5.13.9 (BUG-4): Formatear fecha de cobro en formato legible localizado
RN.render._fmtFechaCobro = function (fecha, conHora) {
  if (!fecha) return '—';
  var d = new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha).slice(0, 10);
  if (conHora) {
    return d.toLocaleString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// v5.13.9 (CODE-2/UI-3/UI-5/UI-6/UI-9/UI-10): Render de una card de cobro realizado.
// Extraido de render.realizados() para reutilizacion y legibilidad.
RN.render._cardCobroRealizado = function (h) {
  var cli = RN.calc.clientePorId(h.clienteId);
  // v5.13.9 (UI-4): Nombre clickeable para ver historial del cliente
  // v5.13.15 (BUG-1): Escaping de onclick corregido (antes usaba String.fromCharCode(0x5c)
  // que generaba JS invalido y el handler nunca disparaba).
  var nombre = cli
    ? '<a href="#" onclick="RN.clientHistory.abrir(\'' + RN.render.escAttr(cli.id) + '\');return false" style="color:inherit;text-decoration:none">' + RN.render.esc(cli.nombre) + '</a>'
    : '<span class="muted">Cliente eliminado</span>';
  var total = RN.calc.totalCobro(h);

  // v5.13.9 (BUG-1): Concepto correcto segun tipo de cobro
  var concepto;
  if (h.tipo === 'venta-inventario') {
    concepto = RN.render.esc(h.concepto || 'Venta inventario');
  } else if (h.tipo === 'equipo') {
    concepto = 'Pago de equipo';
  } else {
    concepto = 'Servicio mensual' + (h.mes ? ' ' + RN.render.esc(RN.calc.mesTexto(h.mes)) : '');
  }
  if (h.montoEquipo > 0 && h.tipo === 'servicio') concepto += ' + equipo';

  // v5.13.9 (DUP-2): Badge unificado de tipo de pago
  var tipoBadge = RN.render.badgeTipoPago(h);

  // v5.13.9 (UI-10): Badge "Adelantado" si el mes de servicio es futuro
  var mesActual = RN.calc.mesActualStr();
  var esAdelantado = h.mes && h.mes > mesActual && h.tipo === 'servicio';
  var adelantadoBadge = esAdelantado
    ? ' <span class="badge" style="background:var(--primary-soft);color:var(--primary);font-size:10px;vertical-align:middle">Adelantado</span>'
    : '';

  var monedaTxt = h.moneda || 'CUP';

  // v5.13.9 (UI-6): Badge de pago combinado USD+CUP
  var monedaBadge = '';
  if (h.moneda === 'MIXTO' && (h.montoPagadoUSD || 0) > 0 && (h.montoPagadoCUP || 0) > 0) {
    monedaBadge = ' <span class="pill" style="background:var(--success-soft);color:var(--success);font-size:10px">USD+CUP</span>';
  } else if ((h.montoPagadoUSD || 0) > 0 && (h.montoPagadoCUP || 0) > 0) {
    monedaBadge = ' <span class="pill" style="background:var(--success-soft);color:var(--success);font-size:10px">USD+CUP</span>';
  }

  // v5.13.9 (UI-9): Pill de recibo clickeable
  // v5.13.15 (BUG-1): Escaping de onclick corregido (ver nota arriba).
  var reciboHtml = h.reciboNum
    ? '<button class="btn sm" style="padding:2px 8px" onclick="RN.recibo.ver(\'' + RN.render.escAttr(h.id) + '\')">#' + RN.render.esc(h.reciboNum) + '</button>'
    : '<span class="muted">—</span>';

  // v5.13.9 (BUG-4): Fecha localizada
  var fechaTxt = RN.render._fmtFechaCobro(h.fecha, true);

  // v5.13.9 (UI-3): data-estado segun tipo de pago
  var estadoCard = h.tipoPago === 'parcial' ? 'parcial' : 'paid';

  // v5.13.9 (UI-5): Filas de desglose servicio/equipo/mora
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

  return '<div class="acc-card" data-estado="' + estadoCard + '" id="acc-real-' + RN.render.escAttr(h.id) + '">' +
    '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-real-' + RN.render.escAttr(h.id) + '\')">' +
      '<span class="acc-dot ' + estadoCard + '"></span>' +
      '<div class="acc-summary-main">' +
        '<div class="acc-summary-name">' + nombre + adelantadoBadge + '</div>' +
        '<div class="acc-summary-sub">' + RN.render.esc(fechaTxt) + ' · ' + concepto + '</div>' +
      '</div>' +
      '<div class="acc-summary-total">' +
        '<div class="amt">' + RN.calc.formatCUP(total) + '</div>' +
        '<div class="lbl">' + RN.render.esc(monedaTxt) + monedaBadge + '</div>' +
      '</div>' +
      '<span class="acc-chevron">▼</span>' +
    '</div>' +
    '<div class="acc-details">' +
      '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc(fechaTxt) + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Cliente</span><span class="acc-value">' + nombre + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + concepto + '</span></div>' +
      desgloseHtml +
      '<div class="acc-row"><span class="acc-label">Total</span><span class="acc-value"><strong>' + RN.calc.formatCUP(total) + '</strong>' + (h.excedente ? ' <span class="muted" style="font-size:11px">(vuelto ' + RN.calc.formatCUP(h.excedente) + ')</span>' : '') + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Moneda</span><span class="acc-value">' + RN.render.esc(monedaTxt) + monedaBadge + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Tipo</span><span class="acc-value">' + tipoBadge + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Recibo</span><span class="acc-value">' + reciboHtml + '</span></div>' +
    '</div>' +
  '</div>';
};

// v5.13.9 (CODE-7): Construye una cintilla de mes con sus cobros.
RN.render._cintillaMes = function (mesKey, cobros, esPrimera) {
  var totalMes = cobros.reduce(function (s, h) { return s + RN.calc.totalCobro(h); }, 0);
  var nombreMes = mesKey === 'sin-fecha' ? 'Sin fecha' : RN.calc.mesTexto(mesKey);
  var cintillaId = 'cintilla-mes-' + mesKey;
  var abierta = esPrimera ? ' cintilla-mes-open' : '';
  var chevron = esPrimera ? ' ▲' : ' ▼';
  var cobrosHtml = cobros.map(RN.render._cardCobroRealizado).join('');

  return '<div class="cintilla-mes' + abierta + '" id="' + cintillaId + '">' +
    '<div class="cintilla-mes-head" onclick="RN.render.toggleCintillaMes(\'' + cintillaId + '\')">' +
      '<span class="cintilla-mes-icon">📅</span>' +
      '<div class="cintilla-mes-titulo">' +
        '<div class="cintilla-mes-nombre">' + RN.render.esc(nombreMes) + '</div>' +
        '<div class="cintilla-mes-sub">' + cobros.length + ' cobro' + (cobros.length !== 1 ? 's' : '') + ' · ' + RN.calc.formatCUP(totalMes) + '</div>' +
      '</div>' +
      '<span class="cintilla-mes-chevron">' + chevron + '</span>' +
    '</div>' +
    '<div class="cintilla-mes-body">' + cobrosHtml + '</div>' +
  '</div>';
};

// v5.13.9 (CODE-7/LOG-1): KPIs calculados sobre la lista ya filtrada.
RN.render._kpisRealizados = function (lista) {
  var cont = document.getElementById('kpi-realizados');
  if (!cont) return;
  var total = lista.reduce(function (s, h) { return s + RN.calc.totalCobro(h); }, 0);
  var count = lista.length;
  // v5.13.9 (BUG-2): Ventas de inventario (tipoPago 'completo' por defecto) cuentan como completos
  var completos = lista.filter(function (h) { return (h.tipoPago || 'completo') === 'completo'; }).length;
  var parciales = lista.filter(function (h) { return h.tipoPago === 'parcial'; }).length;
  var excedentes = lista.filter(function (h) { return h.tipoPago === 'excedente'; }).length;
  cont.innerHTML = [
    { label: 'Total cobrado', value: RN.calc.formatCUP(total), cls: 'green' },
    { label: 'Cobros realizados', value: count, cls: 'blue' },
    { label: 'Completos', value: completos, cls: 'green' },
    { label: 'Parciales', value: parciales, cls: 'amber' },
    { label: 'Con excedente', value: excedentes, cls: 'blue' }
  ].map(function (k) { return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>'; }).join('');
};

// v5.13.9 (CODE-7/LOG-2): Llenar dropdown de meses, reconstruyendo cada vez.
RN.render._fillFiltroMes = function () {
  var selMes = document.getElementById('filtro-realizados-mes');
  if (!selMes) return '';
  // v5.13.9 (LOG-2): Preservar seleccion actual antes de reconstruir
  var mesSelActual = selMes.value || '';
  selMes.innerHTML = '<option value="">Todos los meses</option>';
  var meses = {};
  RN.state.history.forEach(function (h) {
    // v5.13.9 (BUG-3): Usar h.mes (mes de servicio) con fallback a fecha
    var m = h.mes || (h.fecha || '').slice(0, 7);
    if (m) meses[m] = true;
  });
  Object.keys(meses).sort().reverse().forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = RN.calc.mesTexto(m);
    selMes.appendChild(opt);
  });
  // Restaurar seleccion si sigue existiendo
  selMes.value = mesSelActual;
  return selMes.value || '';
};

// v5.13.9 (CODE-7): Render principal de la vista Realizados.
RN.render.realizados = function () {
  var listEl = document.getElementById('lista-realizados');
  if (!listEl) return;

  // v5.13.9 (LOG-2/BUG-3): Dropdown se reconstruye cada vez, usa h.mes
  var mesSel = RN.render._fillFiltroMes();
  var q = (document.getElementById('search-realizados') || {}).value || '';
  // v5.13.9 (UI-2): Filtro por tipo de pago
  var tipoSel = (document.getElementById('filtro-realizados-tipo') || {}).value || '';

  // v5.13.9 (CODE-1/BUG-6): Filtrado centralizado con historial.filtrar()
  var lista = RN.historial.filtrar({ mes: mesSel, tipoPago: tipoSel, q: q });

  // v5.13.9 (LOG-1): KPIs sobre la lista filtrada, no sobre todo el historial
  RN.render._kpisRealizados(lista);

  if (!lista.length) {
    listEl.innerHTML = '<div class="acc-empty"><div class="icon">💰</div>No hay cobros que coincidan con el filtro.</div>';
    return;
  }

  // v5.13.9 (BUG-3): Agrupar por mes de servicio (h.mes), fallback a fecha
  var grupos = {};
  var ordenMeses = [];
  lista.forEach(function (h) {
    var mesKey = h.mes || (h.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
    grupos[mesKey].push(h);
  });
  // ordenMeses ya viene ordenado descendente porque lista esta ordenada por fecha desc
  ordenMeses.sort().reverse();

  // v5.13.9 (CODE-7): Construir cintillas usando _cintillaMes()
  var htmlCintillas = ordenMeses.map(function (mesKey, idx) {
    return RN.render._cintillaMes(mesKey, grupos[mesKey], idx === 0);
  }).join('');

  listEl.innerHTML = htmlCintillas;
};

// v5.12.3: Alterna la expansion de una cintilla de mes en el historial de cobros.
RN.render.toggleCintillaMes = function (cintillaId) {
  var el = document.getElementById(cintillaId);
  if (!el) return;
  var isOpen = el.classList.toggle('cintilla-mes-open');
  var chev = el.querySelector('.cintilla-mes-chevron');
  if (chev) chev.textContent = isOpen ? ' ▲' : ' ▼';
};

// v5.13.2: Helper para generar filas de detalle (.acc-row) en las tarjetas
// de inversión. Centraliza el patrón repetido ~20 veces en render.inversion().
//   label: texto de la etiqueta (ya escapado por el llamador)
//   valor: HTML del valor (puede incluir <strong>, <span class="badge">, etc.)
//   opts:  { bold: true, strong: true, color: 'var(--warn)', cond: false }
//     bold   → aplica font-weight:600 a toda la fila
//     strong → envuelve el valor en <strong> (útil para valores planos)
//     color  → style="color:VAR" dentro del <strong>
//     cond   → si es false, devuelve '' (fila omitida). Útil para filas condicionales.
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
