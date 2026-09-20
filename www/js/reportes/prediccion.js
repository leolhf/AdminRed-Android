/**
 * reportes/prediccion.js — Predicción de ingresos (media móvil simple).
 */
RN.prediccion = RN.prediccion || {};

RN.prediccion.calcular = function () {
  return RN.calc.prediccionIngresos();
};

RN.prediccion.ver = function () {
  const pred = RN.prediccion.calcular();
  const tendencia = RN.calc.tendenciaMensual(6);
  const max = Math.max(...tendencia.map(t => t.ingresos), 1);
  const html = `
    <div class="modal-header"><h3>Predicción de ingresos</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="kpi-grid mb-16"><div class="kpi amber"><div class="label">Próximo mes (estimado)</div><div class="value">${RN.calc.formatCUP(pred)}</div></div></div>
      <p class="muted">Estimación basada en regresión lineal de los ingresos de los últimos 6 meses.</p>
      <div class="flex mt-16" style="gap:12px;align-items:flex-end;height:120px;justify-content:space-around">
        ${tendencia.map(t => RN.chart.grupoMes(
          RN.chart.barra(t.ingresos / max * 100, 'var(--primary)', RN.calc.formatCUP(t.ingresos), 24),
          t.mes.slice(5)
        )).join('')}
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
          ${RN.chart.barra(pred / max * 100, 'var(--warn)', RN.calc.formatCUP(pred), 24).replace('border-radius:3px', 'border-radius:3px;opacity:.7;border:2px dashed var(--warn)')}
          <span style="font-size:11px;font-weight:700">→ pred</span></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};
