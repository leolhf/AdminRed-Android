/**
 * reportes/historial.js — Historial general de cobros.
 * (El render de la tabla vive en render.js; aqui helpers de filtrado/export.)
 * v5.13.9: filtrar() ahora soporta q (busqueda), tipoPago y concepto.
 */
RN.historial = RN.historial || {};

// v5.13.9 (CODE-1/BUG-5): Filtrado centralizado del historial.
// Soporta: mes (mes de servicio o calendario), tipoPago, q (busqueda por
// nombre cliente, reciboNum, concepto, mes). Ordena por fecha descendente.
RN.historial.filtrar = function (filtro) {
  filtro = filtro || {};
  var q = (filtro.q || '').toLowerCase();
  var mesSel = filtro.mes || '';
  var tipoSel = filtro.tipoPago || '';

  return RN.state.history.filter(function (h) {
    // Filtro por mes: priorizar h.mes (mes de servicio), fallback a fecha
    if (mesSel) {
      var mesCobro = h.mes || (h.fecha || '').slice(0, 7);
      if (mesCobro !== mesSel) return false;
    }
    // Filtro por tipo de pago
    if (tipoSel) {
      var tp = h.tipoPago || 'completo';
      if (tp !== tipoSel) return false;
    }
    // Busqueda por texto
    if (q) {
      var cli = RN.calc.clientePorId(h.clienteId);
      var nombre = cli ? cli.nombre : '';
      var concepto = h.concepto || h.tipo || '';
      var recibo = h.reciboNum || '';
      var mes = h.mes || '';
      if (nombre.toLowerCase().indexOf(q) < 0
        && recibo.toLowerCase().indexOf(q) < 0
        && concepto.toLowerCase().indexOf(q) < 0
        && mes.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
};

// v5.13.9 (CODE-3): exportCSV mejorado — respeta filtro, mas columnas, nombre real.
RN.historial.exportCSV = function (filtro) {
  var lista = filtro ? RN.historial.filtrar(filtro) : RN.state.history;
  var rows = [['fecha', 'cliente', 'tipo', 'mes', 'concepto', 'monto', 'montoEquipo', 'mora', 'total', 'tipoPago', 'falta', 'excedente', 'moneda', 'usd', 'cup', 'reciboNum']];
  lista.forEach(function (h) {
    var c = RN.calc.clientePorId(h.clienteId);
    rows.push([
      (h.fecha || '').slice(0, 10),
      c ? c.nombre : (h.ventaInventario ? 'Venta inventario' : ''),
      h.tipo, h.mes || '', h.concepto || '',
      h.monto || 0, h.montoEquipo || 0, h.montoMora || 0,
      RN.calc.totalCobro(h), h.tipoPago || '', h.falta || 0, h.excedente || 0,
      h.moneda || 'CUP', h.montoPagadoUSD || 0, h.montoPagadoCUP || 0,
      h.reciboNum || ''
    ]);
  });
  // v5.14.2 (Auditoría Reportes — DUP-2): escape CSV centralizado en RN.export.toCSV.
  var csv = RN.export.toCSV(rows);
  RN.export.descargar('historial-cobros.csv', csv, 'text/csv');
  RN.notifyUI.toast('Historial exportado (' + lista.length + ' cobros)', 'success');
};

/**
 * v5.14.2 (Auditoría Reportes — UI-2): muestra el historial completo de
 * cobros en un modal (la tabla de la vista Reportes se limitaba a 50 filas).
 * v5.14.3: ahora el modal agrupa por mes en cintillas colapsables (cada mes
 * contraído; el primero abierto) y cada cobro es una acc-card colapsable,
 * reutilizando RN.render._cintillaMes() / _cardCobroRealizado().
 */
RN.historial.verTodos = function () {
  var lista = RN.historial.filtrar();

  var bodyHtml;
  if (!lista.length) {
    bodyHtml = '<div class="acc-empty"><div class="icon">💰</div>Sin cobros registrados todavía.</div>';
  } else {
    // Agrupar por mes de servicio (h.mes), fallback a fecha.
    var grupos = {};
    var ordenMeses = [];
    lista.forEach(function (h) {
      var mesKey = h.mes || (h.fecha || '').slice(0, 7) || 'sin-fecha';
      if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
      grupos[mesKey].push(h);
    });
    ordenMeses.sort().reverse();

    var htmlCintillas = ordenMeses.map(function (mesKey, idx) {
      return RN.render._cintillaMes(mesKey, grupos[mesKey], idx === 0);
    }).join('');
    bodyHtml = '<div class="accordion-list">' + htmlCintillas + '</div>';
  }

  var html = '<div class="modal-header"><h3>Historial completo de cobros (' + lista.length + ')</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' + bodyHtml + '</div>' +
    '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
    '<button class="btn primary" onclick="RN.historial.exportCSV()">⬇️ Exportar CSV</button></div>';
  RN.uiComponents.modal(html, { lg: true });
};
