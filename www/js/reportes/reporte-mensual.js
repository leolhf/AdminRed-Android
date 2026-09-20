/**
 * reportes/reporte-mensual.js — Reporte ejecutivo mensual con KPIs
 * y comparación contra el snapshot del mes anterior.
 *
 * v5.14.2 (Auditoría Reportes):
 *   BUG-4: ya no se genera un snapshot "fantasma" solo para comprobar si el
 *          mes está cerrado (gastaba CPU y no se usaba). Ahora se comprueba
 *          con un simple .some() y se muestra un badge "Mes cerrado".
 *   BUG-7: cmp() ya no muestra "+0 (0%)" engañoso cuando no hay cambio, ni
 *          "0%" engañoso cuando el mes anterior fue 0 (debería leerse como
 *          "nuevo", no como "sin cambio").
 *   UI-1: la exportación genera un texto plano estructurado y legible
 *         (RN.reporteMensual._generarTexto) en vez de volcar el innerText
 *         del HTML renderizado.
 */
RN.reporteMensual = RN.reporteMensual || {};

RN.reporteMensual.generar = function () {
  const sel = document.getElementById('select-mes-reporte');
  const mes = sel ? sel.value : RN.calc.mesActualStr();
  const out = document.getElementById('reporte-mensual-out');
  if (!out) return;

  // BUG-4: solo se comprueba si el mes YA fue cerrado (existe snapshot),
  // sin generar uno nuevo de forma innecesaria.
  const yaCerrado = RN.state.snapshots.some(s => s.mes === mes);
  const mesAnt = RN.calc.mesAnterior(mes);
  const snapAnt = RN.state.snapshots.find(s => s.mes === mesAnt);
  const ingresos = RN.calc.ingresosMes(mes);
  const gastos = RN.calc.gastosMes(mes);
  const utilidad = ingresos - gastos;
  const cob = RN.calc.cobranzaMes(mes);

  // BUG-7: sin cambios se marca explícitamente en vez de "+0 (+0%)" en verde
  // (que sugiere una mejora inexistente); de 0 a algo > 0 se marca "nuevo"
  // en vez de "(0%)" (que sugiere que no hubo crecimiento).
  const cmp = (act, ant, fmt) => {
    if (ant === undefined || ant === null) return '';
    const diff = act - ant;
    if (Math.abs(diff) < 0.01) return ' <span class="badge muted">sin cambios</span>';
    const sign = diff > 0 ? '+' : '';
    const cls = diff > 0 ? 'ok' : 'due';
    const pctTxt = ant ? `(${sign}${Math.round(diff / ant * 100)}%)` : '(nuevo)';
    return ` <span class="badge ${cls}">${sign}${fmt ? fmt(diff) : diff} ${pctTxt}</span>`;
  };

  out.innerHTML = `
    <div class="card" style="margin:0">
      <h3>📋 Reporte ejecutivo — ${RN.calc.mesTexto(mes)} ${yaCerrado ? '<span class="badge muted" style="font-size:11px;vertical-align:middle">Mes cerrado</span>' : ''}</h3>
      <div class="kpi-grid">
        <div class="kpi green"><div class="label">Ingresos</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(ingresos)}</div>${snapAnt ? cmp(ingresos, snapAnt.ingresos, RN.calc.formatCUP) : ''}</div>
        <div class="kpi red"><div class="label">Gastos</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(gastos)}</div>${snapAnt ? cmp(gastos, snapAnt.gastos, RN.calc.formatCUP) : ''}</div>
        <div class="kpi blue"><div class="label">Utilidad</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(utilidad)}</div>${snapAnt ? cmp(utilidad, snapAnt.utilidad, RN.calc.formatCUP) : ''}</div>
        <div class="kpi amber"><div class="label">Cobranza</div><div class="value" style="font-size:18px">${cob.pagaron}/${cob.total}</div></div>
        <div class="kpi blue"><div class="label">Tasa cobranza</div><div class="value" style="font-size:18px">${cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0}%</div></div>
        <div class="kpi green"><div class="label">Ingreso esperado</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(RN.calc.ingresoEsperadoMes(mes))}</div></div>
      </div>
      ${snapAnt ? `<p class="mt-16 muted">Comparado con ${RN.calc.mesTexto(mesAnt)} (snapshot).</p>` : '<p class="mt-16 muted">No hay snapshot del mes anterior para comparar.</p>'}
      <button class="btn mt-16" onclick="RN.reporteMensual.exportar('${mes}')">⬇️ Exportar</button>
    </div>`;
};

/**
 * v5.14.2 (UI-1): genera un texto plano estructurado y legible del reporte
 * ejecutivo, con encabezado, KPIs alineados y comparación contra el mes
 * anterior — en vez de depender del innerText del HTML renderizado.
 */
RN.reporteMensual._generarTexto = function (mes) {
  const ingresos = RN.calc.ingresosMes(mes);
  const gastos = RN.calc.gastosMes(mes);
  const utilidad = ingresos - gastos;
  const cob = RN.calc.cobranzaMes(mes);
  const mesAnt = RN.calc.mesAnterior(mes);
  const snapAnt = RN.state.snapshots.find(s => s.mes === mesAnt);

  const lineas = [];
  lineas.push('=================================');
  lineas.push('  REPORTE EJECUTIVO - ' + RN.calc.mesTexto(mes).toUpperCase());
  lineas.push('  ' + (RN.state.config.nombreNegocio || 'AdminRed'));
  lineas.push('=================================');
  lineas.push('');
  lineas.push('Ingresos:           ' + RN.calc.formatCUP(ingresos));
  lineas.push('Gastos:             ' + RN.calc.formatCUP(gastos));
  lineas.push('Utilidad:           ' + RN.calc.formatCUP(utilidad));
  lineas.push('Ingreso esperado:   ' + RN.calc.formatCUP(RN.calc.ingresoEsperadoMes(mes)));
  lineas.push('');
  lineas.push('Cobranza:           ' + cob.pagaron + '/' + cob.total + ' clientes');
  lineas.push('Tasa de cobranza:   ' + (cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0) + '%');
  if (snapAnt) {
    lineas.push('');
    lineas.push('--- Comparación vs ' + RN.calc.mesTexto(mesAnt) + ' ---');
    lineas.push('Ingresos: ' + (ingresos >= snapAnt.ingresos ? '+' : '') + RN.calc.formatCUP(ingresos - snapAnt.ingresos));
    lineas.push('Gastos:   ' + (gastos >= snapAnt.gastos ? '+' : '') + RN.calc.formatCUP(gastos - snapAnt.gastos));
    lineas.push('Utilidad: ' + (utilidad >= snapAnt.utilidad ? '+' : '') + RN.calc.formatCUP(utilidad - snapAnt.utilidad));
  }
  lineas.push('');
  lineas.push('Generado: ' + new Date().toLocaleString('es-CU'));
  return lineas.join('\n');
};

RN.reporteMensual.exportar = function (mes) {
  const texto = RN.reporteMensual._generarTexto(mes);
  RN.export.descargar('reporte-' + mes + '.txt', texto, 'text/plain');
};
