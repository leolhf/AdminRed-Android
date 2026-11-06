/**
 * ui/views/reportes.js — Vista Reportes v5.55.25
 * Tablero del periodo: hero · tendencia · ejecutivo · accesos · últimos cobros.
 */
RN.reportesUI = RN.reportesUI || {};

RN.reportesUI.mes = function () {
  var sel = document.getElementById('select-mes-reporte');
  return (sel && sel.value) ? sel.value : RN.calc.mesActualStr();
};

RN.reportesUI.onMes = function () {
  RN.render.reportes();
};

RN.reportesUI.mesActual = function () {
  var sel = document.getElementById('select-mes-reporte');
  if (sel) sel.value = RN.calc.mesActualStr();
  RN.render.reportes();
};

RN.reportesUI._fillMeses = function () {
  var sel = document.getElementById('select-mes-reporte');
  if (!sel) return;
  var actual = sel.value || RN.calc.mesActualStr();
  var meses = {};
  meses[RN.calc.mesActualStr()] = true;
  (RN.state.history || []).forEach(function (h) {
    var m = h.mes || (h.fecha || '').slice(0, 7);
    if (m) meses[m] = true;
  });
  (RN.state.snapshots || []).forEach(function (s) {
    if (s && s.mes) meses[s.mes] = true;
  });
  // 12 meses hacia atrás
  var cur = RN.calc.mesActualStr();
  for (var i = 0; i < 12; i++) {
    meses[cur] = true;
    if (RN.calc.mesAnterior) cur = RN.calc.mesAnterior(cur);
    else break;
  }
  var keys = Object.keys(meses).sort().reverse();
  sel.innerHTML = '';
  keys.forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = (RN.calc.mesTexto ? RN.calc.mesTexto(m) : m) + (m === RN.calc.mesActualStr() ? ' (actual)' : '');
    sel.appendChild(opt);
  });
  if (keys.indexOf(actual) >= 0) sel.value = actual;
  else sel.value = RN.calc.mesActualStr();
};

RN.reportesUI.exportarResumen = function () {
  var mes = RN.reportesUI.mes();
  if (RN.reporteMensual && RN.reporteMensual.exportar) {
    RN.reporteMensual.exportar(mes);
    RN.notifyUI.toast('Resumen exportado', 'success');
  } else {
    RN.notifyUI.toast('Exportación no disponible', 'warn');
  }
};

RN.reportesUI.copiarResumen = function () {
  var mes = RN.reportesUI.mes();
  var texto = (RN.reporteMensual && RN.reporteMensual._generarTexto)
    ? RN.reporteMensual._generarTexto(mes)
    : '';
  if (!texto) {
    RN.notifyUI.toast('Nada que copiar', 'warn');
    return;
  }
  var ok = function () { RN.notifyUI.toast('Resumen copiado', 'success'); };
  var fallback = function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var done = document.execCommand('copy');
      document.body.removeChild(ta);
      if (done) ok(); else RN.notifyUI.toast('No se pudo copiar', 'error');
    } catch (e) {
      RN.notifyUI.toast('No se pudo copiar', 'error');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(ok, fallback);
  } else fallback();
};

/** Últimos N cobros (enlace a Realizados, no duplicar el historial completo). */
RN.render._renderHistorialReportes = function () {
  var listEl = document.getElementById('lista-historial-reportes');
  if (!listEl) return;
  var mes = RN.reportesUI.mes();
  var lista = RN.historial.filtrar({ mes: mes }).slice(0, 8);
  if (!lista.length) {
    listEl.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Sin cobros en este periodo. <button type="button" class="btn sm" onclick="RN.tabs&&RN.tabs.ir(\'realizados\')">Ir a Realizados</button></p>';
    return;
  }
  if (RN.render._cardCobroRealizado) {
    listEl.innerHTML = lista.map(function (h) { return RN.render._cardCobroRealizado(h); }).join('');
  } else {
    listEl.innerHTML = '<p class="muted">Vista de cobros no disponible.</p>';
  }
};

RN.render.reportes = function () {
  RN.reportesUI._fillMeses();
  var mes = RN.reportesUI.mes();
  var badge = document.getElementById('reportes-periodo-badge');
  if (badge) badge.textContent = RN.calc.mesTexto ? RN.calc.mesTexto(mes) : mes;

  // KPIs del periodo
  var ingresos = 0, gastos = 0, utilidad = 0, esperado = 0;
  try { ingresos = RN.calc.ingresosMes(mes) || 0; } catch (e) { ingresos = 0; }
  try {
    gastos = (RN.calc.gastosOperativosMes ? RN.calc.gastosOperativosMes(mes) : RN.calc.gastosMes(mes)) || 0;
  } catch (e2) {
    try { gastos = RN.calc.gastosMes(mes) || 0; } catch (e3) { gastos = 0; }
  }
  try { utilidad = ingresos - gastos; } catch (e4) { utilidad = 0; }
  try { esperado = RN.calc.ingresoEsperadoMes ? RN.calc.ingresoEsperadoMes(mes) : 0; } catch (e5) { esperado = 0; }

  var cob = { total: 0, pagaron: 0, faltan: 0, parciales: 0 };
  try { cob = RN.calc.cobranzaMes(mes) || cob; } catch (e6) {}

  var tasaCob = cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0;
  var ticket = 0;
  try {
    var cobrosMes = (RN.state.history || []).filter(function (h) {
      return h.mes === mes && (!h.tipo || h.tipo === 'servicio');
    });
    if (cobrosMes.length) {
      ticket = cobrosMes.reduce(function (s, h) { return s + (RN.calc.totalCobro ? RN.calc.totalCobro(h) : (h.monto || 0)); }, 0) / cobrosMes.length;
    }
  } catch (e7) { ticket = 0; }

  // Delta vs mes anterior
  var mesAnt = RN.calc.mesAnterior ? RN.calc.mesAnterior(mes) : null;
  var utilAnt = null;
  if (mesAnt) {
    try {
      var ingA = RN.calc.ingresosMes(mesAnt) || 0;
      var gasA = (RN.calc.gastosOperativosMes ? RN.calc.gastosOperativosMes(mesAnt) : RN.calc.gastosMes(mesAnt)) || 0;
      utilAnt = ingA - gasA;
    } catch (e8) { utilAnt = null; }
  }
  var deltaTxt = '';
  if (utilAnt != null) {
    var d = utilidad - utilAnt;
    deltaTxt = (d >= 0 ? '+' : '') + RN.calc.formatCUP(d) + ' vs mes anterior';
  }

  var hero = document.getElementById('reportes-hero');
  if (hero) {
    hero.innerHTML =
      '<div class="rep-hero">' +
        '<div class="muted" style="font-size:12px;font-weight:600">Periodo · ' + RN.render.esc(RN.calc.mesTexto ? RN.calc.mesTexto(mes) : mes) + '</div>' +
        '<div class="rep-util">' + RN.calc.formatCUP(utilidad) + ' <span class="muted" style="font-size:13px;font-weight:500">utilidad</span></div>' +
        '<div class="rep-sub">Ingresos ' + RN.calc.formatCUP(ingresos) + ' · Gastos ' + RN.calc.formatCUP(gastos) +
          (esperado ? ' · Esperado ' + RN.calc.formatCUP(esperado) : '') + '</div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px">Cobranza ' + cob.pagaron + '/' + cob.total +
          ' (' + tasaCob + '%)' + (deltaTxt ? ' · ' + deltaTxt : '') + '</div>' +
      '</div>';
  }

  var kpi = document.getElementById('kpi-reportes');
  if (kpi) {
    var kpis = [
      { label: 'Ingresos', value: RN.calc.formatCUP(ingresos), cls: 'green' },
      { label: 'Gastos', value: RN.calc.formatCUP(gastos), cls: 'red' },
      { label: 'Utilidad', value: RN.calc.formatCUP(utilidad), cls: utilidad >= 0 ? 'green' : 'red' },
      { label: '% cobranza', value: tasaCob + '%', cls: tasaCob >= 80 ? 'green' : (tasaCob >= 50 ? 'amber' : 'red') },
      { label: 'Ticket prom.', value: RN.calc.formatCUP(ticket), cls: 'blue' },
      { label: 'Pendientes', value: String(cob.faltan != null ? cob.faltan : (cob.total - cob.pagaron)), cls: (cob.faltan || (cob.total - cob.pagaron)) ? 'amber' : 'green' }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value" style="font-size:14px">' + k.value + '</div></div>';
    }).join('');
  }

  // Diagnóstico (ex Salud)
  var diagEl = document.getElementById('reportes-diagnostico');
  if (diagEl && RN.salud && RN.salud.renderInto) {
    RN.salud.renderInto(diagEl, mes);
  }

  // Tendencia
  try {
    if (RN.tendencia && RN.tendencia.render) RN.tendencia.render();
  } catch (e9) {
    var ch = document.getElementById('tendencia-chart');
    if (ch) ch.innerHTML = '<p class="muted">No se pudo cargar la tendencia.</p>';
  }

  // Reporte ejecutivo automático
  var out = document.getElementById('reporte-mensual-out');
  if (out && RN.reporteMensual && RN.reporteMensual._generarTexto) {
    var texto = RN.reporteMensual._generarTexto(mes);
    out.innerHTML =
      '<pre class="rep-exec">' + RN.render.esc(texto) + '</pre>' +
      '<div class="flex wrap mt-16" style="gap:8px">' +
        '<button type="button" class="btn sm" onclick="RN.reportesUI.copiarResumen()">Copiar</button>' +
        '<button type="button" class="btn sm" onclick="RN.reportesUI.exportarResumen()">Exportar .txt</button>' +
      '</div>';
  } else if (out && RN.reporteMensual && RN.reporteMensual.generar) {
    try { RN.reporteMensual.generar(); } catch (e10) {}
  }

  // Últimos cobros del periodo
  RN.render._renderHistorialReportes();
};
