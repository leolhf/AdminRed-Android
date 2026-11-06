/**
 * reportes/tendencia.js — Tendencias de ingresos (chart de barras simple con divs).
 */
RN.tendencia = RN.tendencia || {};

RN.tendencia.render = function () {
  const cont = document.getElementById('tendencia-chart');
  if (!cont) return;
  const data = RN.calc.tendenciaMensual(6);
  if (!data.length) { cont.innerHTML = '<p class="muted">Sin datos suficientes</p>'; return; }
  const max = Math.max(...data.map(d => Math.max(d.ingresos, d.gastos)), 1);

  // v5.14.2 (Auditoría Reportes — DUP-1): barras construidas con el helper
  // compartido RN.chart.barra (antes duplicado con prediccion.js).
  cont.innerHTML = `<div class="flex" style="gap:12px;align-items:flex-end;height:160px;justify-content:space-around">` +
    data.map(d => {
      const barras = '<div style="display:flex;gap:3px;align-items:flex-end;height:140px">' +
        RN.chart.barra(d.ingresos / max * 140, 'var(--success)', 'Ingresos: ' + RN.calc.formatCUP(d.ingresos)) +
        RN.chart.barra(d.gastos / max * 140, 'var(--danger)', 'Gastos: ' + RN.calc.formatCUP(d.gastos)) +
        '</div>';
      return RN.chart.grupoMes(barras, d.mes.slice(5));
    }).join('') +
    `</div><div class="flex mt-8" style="gap:16px;font-size:12px;justify-content:center">
      <span class="flex" style="gap:6px"><span style="width:12px;height:12px;background:var(--success);border-radius:3px"></span> Ingresos</span>
      <span class="flex" style="gap:6px"><span style="width:12px;height:12px;background:var(--danger);border-radius:3px"></span> Gastos</span>
    </div>`;
};
