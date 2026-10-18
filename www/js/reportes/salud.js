/**
 * reportes/salud.js — Diagnóstico del negocio (semáforos).
 * v5.55.26: integrado en Reportes; la subpestaña Salud ya no es el destino principal.
 */
RN.salud = RN.salud || {};

/**
 * invertir=false (mayor es mejor): >= verde, >= ámbar, si no rojo
 * invertir=true (menor es mejor): <= verde, <= ámbar, si no rojo
 */
RN.salud._semaforo = function (valor, umbralVerde, umbralAmbar, invertir) {
  var cls, txt;
  if (invertir) {
    if (valor <= umbralVerde) { cls = 'green'; txt = 'Saludable'; }
    else if (valor <= umbralAmbar) { cls = 'amber'; txt = 'Atención'; }
    else { cls = 'red'; txt = 'Crítico'; }
  } else {
    if (valor >= umbralVerde) { cls = 'green'; txt = 'Saludable'; }
    else if (valor >= umbralAmbar) { cls = 'amber'; txt = 'Atención'; }
    else { cls = 'red'; txt = 'Crítico'; }
  }
  return { cls: cls, txt: txt };
};

RN.salud._badgeClass = function (cls) {
  return cls === 'green' ? 'ok' : (cls === 'amber' ? 'warn' : 'due');
};

RN.salud._colorVar = function (cls) {
  return cls === 'green' ? 'var(--success)' : (cls === 'amber' ? 'var(--warn)' : 'var(--danger)');
};

/**
 * Calcula indicadores del mes y HTML de diagnóstico con acciones.
 * @param {string} [mes]
 * @returns {{ html: string, general: object }}
 */
RN.salud.diagnostico = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var cob = { total: 0, pagaron: 0, faltan: 0 };
  try { cob = RN.calc.cobranzaMes(mes) || cob; } catch (e) {}
  var tasaCob = cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0;

  var ingresos = 0, gastos = 0, utilidad = 0, esperado = 0;
  try { ingresos = RN.calc.ingresosMes(mes) || 0; } catch (e2) {}
  try {
    gastos = (RN.calc.gastosOperativosMes ? RN.calc.gastosOperativosMes(mes) : RN.calc.gastosMes(mes)) || 0;
  } catch (e3) {
    try { gastos = RN.calc.gastosMes(mes) || 0; } catch (e4) { gastos = 0; }
  }
  utilidad = ingresos - gastos;
  try { esperado = RN.calc.ingresoEsperadoMes ? RN.calc.ingresoEsperadoMes(mes) : 0; } catch (e5) { esperado = 0; }

  var morosos = 0;
  try {
    morosos = (RN.calc.clientesCobrables ? RN.calc.clientesCobrables() : RN.calc.clientesActivos())
      .filter(function (c) { return RN.calc.getStatus(c, mes) === 'due'; }).length;
  } catch (e6) { morosos = 0; }
  var pctMorosos = cob.total ? Math.round(morosos / cob.total * 100) : 0;

  var recInv = 0;
  try {
    if (RN.investment && RN.investment.porcentajeRecuperacion) {
      recInv = RN.investment.porcentajeRecuperacion() || 0;
    }
  } catch (e7) { recInv = 0; }

  var ratioCobranza = esperado > 0 ? Math.round((ingresos / esperado) * 100) : (ingresos > 0 ? 100 : 0);

  // Umbrales: cobranza, utilidad (>0), morosos (invertir), recuperación inv, real vs esperado
  var s1 = RN.salud._semaforo(tasaCob, 70, 50, false);
  var s2 = RN.salud._semaforo(utilidad, 1, 0, false);
  var s3 = RN.salud._semaforo(pctMorosos, 15, 30, true);
  var s4 = RN.salud._semaforo(recInv, 60, 30, false);
  var s5 = RN.salud._semaforo(ratioCobranza, 90, 70, false);

  var puntos = [s1.cls, s2.cls, s3.cls, s4.cls, s5.cls];
  var general;
  if (puntos.indexOf('red') >= 0) {
    general = { cls: 'due', txt: 'Crítico — requiere atención prioritaria' };
  } else if (puntos.indexOf('amber') >= 0) {
    general = { cls: 'warn', txt: 'Atención — hay puntos a mejorar' };
  } else {
    general = { cls: 'ok', txt: 'Saludable — el periodo marcha bien' };
  }

  function card(titulo, valor, s, desc, accionesHtml) {
    return '<div class="diag-card">' +
      '<div class="diag-title"><span>' + titulo + '</span>' +
        '<span class="badge ' + RN.salud._badgeClass(s.cls) + '">' + s.txt + '</span></div>' +
      '<div class="diag-value" style="color:' + RN.salud._colorVar(s.cls) + '">' + valor + '</div>' +
      '<p class="diag-desc">' + desc + '</p>' +
      (accionesHtml ? '<div class="diag-actions">' + accionesHtml + '</div>' : '') +
      '</div>';
  }

  var actCobros = '<button type="button" class="btn sm primary" onclick="RN.tabs&&RN.tabs.ir(\'cobros\')">Ir a Cobros</button>';
  var actMorosos = '<button type="button" class="btn sm primary" onclick="RN.tabs&&RN.tabs.ir(\'morosos\')">Ver morosos</button>';
  var actGastos = '<button type="button" class="btn sm" onclick="RN.tabs&&RN.tabs.ir(\'gastos\')">Ver gastos</button>';
  var actInv = '<button type="button" class="btn sm" onclick="RN.tabs&&RN.tabs.ir(\'inversion\')">Capital / inversión</button>';

  var cards =
    card('Tasa de cobranza', tasaCob + '%', s1,
      cob.pagaron + ' de ' + cob.total + ' clientes pagaron en el periodo',
      s1.cls !== 'green' ? actCobros : '') +
    card('Utilidad del periodo', RN.calc.formatCUP(utilidad), s2,
      'Ingresos − gastos operativos',
      s2.cls === 'red' ? actGastos : '') +
    card('% Clientes morosos', pctMorosos + '%', s3,
      morosos + ' atrasado(s) de ' + cob.total,
      s3.cls !== 'green' ? actMorosos : '') +
    card('Cobranza vs esperado', ratioCobranza + '%', s5,
      RN.calc.formatCUP(ingresos) + ' de ' + RN.calc.formatCUP(esperado) + ' esperados',
      s5.cls !== 'green' ? actCobros : '') +
    card('Recuperación de inversión', recInv + '%', s4,
      'Progreso sobre el capital invertido',
      s4.cls !== 'green' ? actInv : '');

  var html =
    '<div class="card">' +
      '<div class="diag-status">' +
        '<div class="muted" style="font-size:12px">Periodo · ' + RN.render.esc(RN.calc.mesTexto ? RN.calc.mesTexto(mes) : mes) + '</div>' +
        '<p class="diag-label"><span class="badge ' + general.cls + '">' + general.txt + '</span></p>' +
      '</div>' +
      '<div class="diag-grid">' + cards + '</div>' +
    '</div>';

  return { html: html, general: general, mes: mes };
};

/** Pinta diagnóstico en un contenedor (Reportes). */
RN.salud.renderInto = function (el, mes) {
  if (!el) return;
  try {
    el.innerHTML = RN.salud.diagnostico(mes).html;
  } catch (e) {
    el.innerHTML = '<p class="muted">No se pudo calcular el diagnóstico.</p>';
  }
};

/** Vista residual: redirige mentalmente a Reportes. */
RN.salud.render = function () {
  var out = document.getElementById('salud-out');
  if (out) {
    out.innerHTML = '<div class="card"><p class="muted">El diagnóstico está en Análisis → Reportes.</p>' +
      '<button type="button" class="btn primary" onclick="RN.tabs&&RN.tabs.ir(\'reportes\')">Ir a Reportes</button></div>';
  }
};
