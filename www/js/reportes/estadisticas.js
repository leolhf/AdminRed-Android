/**
 * reportes/estadisticas.js — Estadísticas del negocio.
 */
RN.estadisticas = RN.estadisticas || {};

RN.estadisticas.calcular = function () {
  const clientes = RN.calc.clientesActivos();
  const totalClientes = RN.state.clients.length;
  // v5.13.1: Bug #7 — Ticket promedio del mes actual, solo cobros de servicio.
  // Antes usaba TODO el historial (todos los meses + cobros de equipo/venta),
  // lo que diluía el ticket real y mezclaba conceptos.
  var mesActual = RN.calc.mesActualStr();
  var cobrosMes = RN.state.history.filter(function (h) {
    return h.mes === mesActual && (!h.tipo || h.tipo === 'servicio');
  });
  var ticketPromedio = cobrosMes.length
    ? cobrosMes.reduce(function (s, h) { return s + (h.monto || 0); }, 0) / cobrosMes.length
    : 0;
  // v5.13.9 (CODE-5): Cachear ingresos/gastos para evitar recalcular 2 veces
  var ing = RN.calc.ingresosTotales();
  var gas = RN.calc.gastosTotales();
  return {
    totalClientes,
    clientesActivos: clientes.length,
    ingresosTotales: ing,
    gastosTotales: gas,
    utilidadAcumulada: ing - gas,
    cobrosRegistrados: RN.state.history.length,
    ticketPromedio,
    inversionRecuperada: RN.investment.porcentajeRecuperacion(),
    planesCount: RN.state.planes.length
  };
};

RN.estadisticas.ver = function () {
  const s = RN.estadisticas.calcular();
  // v5.14.2 (Auditoría Reportes — LOG-3): etiquetas aclaran qué KPIs son
  // acumulados (todos los meses) y cuáles son solo del mes actual, para no
  // mezclar ambos periodos sin distinción en la misma tarjeta.
  const kpis = [
    { label: 'Clientes totales', value: s.totalClientes, cls: 'blue' },
    { label: 'Clientes activos', value: s.clientesActivos, cls: 'green' },
    { label: 'Cobros registrados (acumulado)', value: s.cobrosRegistrados, cls: 'blue' },
    { label: 'Ticket promedio (mes actual)', value: RN.calc.formatCUP(s.ticketPromedio), cls: 'amber' },
    { label: 'Ingresos totales (acumulado)', value: RN.calc.formatCUP(s.ingresosTotales), cls: 'green' },
    { label: 'Gastos totales (acumulado)', value: RN.calc.formatCUP(s.gastosTotales), cls: 'red' },
    { label: 'Utilidad acumulada (todo el historial)', value: RN.calc.formatCUP(s.utilidadAcumulada), cls: 'blue' },
    { label: 'Inversión recuperada', value: s.inversionRecuperada + '%', cls: 'amber' },
    { label: 'Planes de servicio', value: s.planesCount, cls: 'blue' }
  ];
  const html = `
    <div class="modal-header"><h3>Estadísticas del negocio</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><div class="kpi-grid">${kpis.map(k => `<div class="kpi ${k.cls}"><div class="label">${k.label}</div><div class="value" style="font-size:18px">${k.value}</div></div>`).join('')}</div></div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};
