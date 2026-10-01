/**
 * ui/views/reportes.js — Vista Reportes (incluye el historial dentro de Reportes).
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */
// ---------- REPORTES ----------
// v5.14.3: Render del "Historial de cobros" de la vista Reportes, agrupado por
// mes en cintillas colapsables (cada mes contraído por defecto; al hacer clic
// se expande). Dentro de cada mes, cada cobro es una acc-card colapsable cuyo
// detalle solo aparece al hacer clic. Reutiliza _cintillaMes() y
// _cardCobroRealizado() de la vista Realizados para consistencia visual.
// Nota: el primer mes (más reciente) se muestra abierto por defecto para dar
// contexto inmediato; el resto queda contraído.
RN.render._renderHistorialReportes = function () {
  var listEl = document.getElementById('lista-historial-reportes');
  if (!listEl) return;

  // v5.14.3: llenar el dropdown de meses (reconstruido cada render).
  var selMes = document.getElementById('filtro-historial-rep-mes');
  var mesSel = '';
  if (selMes) {
    var mesSelActual = selMes.value || '';
    selMes.innerHTML = '<option value="">Todos los meses</option>';
    var meses = {};
    RN.state.history.forEach(function (h) {
      var m = h.mes || (h.fecha || '').slice(0, 7);
      if (m) meses[m] = true;
    });
    Object.keys(meses).sort().reverse().forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = RN.calc.mesTexto(m);
      selMes.appendChild(opt);
    });
    selMes.value = mesSelActual;
    mesSel = selMes.value || '';
  }

  var q = (document.getElementById('search-historial-rep') || {}).value || '';
  // v5.14.3: filtrado centralizado (mismo criterio que la vista Realizados).
  var lista = RN.historial.filtrar({ mes: mesSel, q: q });

  // Aviso de límite (informativo; ya no se trunca a 50 porque el render
  // agrupado colapsado escala bien en el DOM).
  var aviso = document.getElementById('historial-limite-aviso');
  if (aviso) aviso.style.display = 'none';

  if (!lista.length) {
    listEl.innerHTML = '<div class="acc-empty"><div class="icon">💰</div>No hay cobros que coincidan con el filtro.</div>';
    return;
  }

  // v5.14.3: agrupar por mes de servicio (h.mes), fallback a fecha.
  var grupos = {};
  var ordenMeses = [];
  lista.forEach(function (h) {
    var mesKey = h.mes || (h.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
    grupos[mesKey].push(h);
  });
  ordenMeses.sort().reverse();

  // Construir cintillas: solo el primer mes abierto por defecto.
  var htmlCintillas = ordenMeses.map(function (mesKey, idx) {
    return RN.render._cintillaMes(mesKey, grupos[mesKey], idx === 0);
  }).join('');

  listEl.innerHTML = htmlCintillas;
};

RN.render.reportes = function () {
  const kpi = document.getElementById('kpi-reportes');
  if (kpi) {
    kpi.innerHTML = [
      { label: 'Ingresos totales', value: RN.calc.formatCUP(RN.calc.ingresosTotales()), cls: 'green' },
      { label: 'Gastos totales', value: RN.calc.formatCUP(RN.calc.gastosTotales()), cls: 'red' },
      { label: 'Utilidad acumulada', value: RN.calc.formatCUP(RN.calc.ingresosTotales() - RN.calc.gastosTotales()), cls: 'blue' },
      { label: 'Predicción próximo mes', value: RN.calc.formatCUP(RN.calc.prediccionIngresos()), cls: 'amber' }
    ].map(k => `<div class="kpi ${k.cls}"><div class="label">${k.label}</div><div class="value">${k.value}</div></div>`).join('');
  }

  // Historial (v5.14.3): agrupado por mes en cintillas colapsables,
  // cada cobro es una acc-card colapsable (reutiliza _cintillaMes / _cardCobroRealizado).
  const histList = document.getElementById('lista-historial-reportes');
  if (histList) {
    RN.render._renderHistorialReportes();
  }

  // Tendencia (chart simple con barras div)
  RN.tendencia && RN.tendencia.render();

  // Selector de mes para reporte mensual
  // v5.14.2 (Auditoría Reportes — DUP-4): usa el helper compartido RN.calc.listaMeses
  // en lugar de reconstruir la lista de últimos 12 meses aquí (duplicado con descuentos-view.js).
  const sel = document.getElementById('select-mes-reporte');
  if (sel) {
    const meses = RN.calc.listaMeses(12);
    sel.innerHTML = meses.map(m => `<option value="${m}">${RN.calc.mesTexto(m)}</option>`).join('');
  }
};
