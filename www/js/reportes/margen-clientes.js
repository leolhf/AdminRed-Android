/**
 * reportes/margen-clientes.js — Ranking de margen por cliente (v5.53.0 Fase 5).
 */
RN.margenClientes = RN.margenClientes || {};

RN.margenClientes.costoMegaEfectivo = function () {
  var megas = +(RN.state.config.proveedorMegas || 0);
  var plus = +(RN.state.config.plusMegas || 0);
  var monto = RN.calc.montoPaqueteProveedor
    ? RN.calc.montoPaqueteProveedor()
    : (+(RN.state.config.proveedorMonto) || 0);
  var totalM = megas + plus;
  if (totalM <= 0) return +(RN.state.config.proveedorPrecioMega || RN.state.config.costoPorMega || 0);
  return +(monto / totalM).toFixed(4);
};

RN.margenClientes.lista = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var costoM = RN.margenClientes.costoMegaEfectivo();
  var rows = [];
  var base = (RN.calc.clientesCobrables || RN.calc.clientesActivos)();
  base.forEach(function (c) {
    if (c.esAdmin) return;
    var megas = +(c.megas || 0);
    var neto = RN.calc.getPrecioNeto(c, mes);
    var costo = megas * costoM;
    var margen = neto - costo;
    rows.push({
      id: c.id, nombre: c.nombre, megas: megas, neto: neto,
      costo: +costo.toFixed(2), margen: +margen.toFixed(2),
      margenPorMega: megas > 0 ? +(margen / megas).toFixed(2) : 0,
      nodo: c.direccion || ''
    });
  });
  rows.sort(function (a, b) { return b.margen - a.margen; });
  return rows;
};

RN.margenClientes.render = function () {
  var out = document.getElementById('margen-clientes-out');
  if (!out) return;
  var mes = RN.calc.mesActualStr();
  var rows = RN.margenClientes.lista(mes);
  var f = RN.calc.formatCUP;
  if (!rows.length) {
    out.innerHTML = '<p class="muted">No hay clientes para calcular margen.</p>';
    return;
  }
  var html = '<p class="muted" style="font-size:12px">Costo efectivo/M (paquete+plus): <strong>' +
    f(RN.margenClientes.costoMegaEfectivo()) + '</strong> · ' + RN.calc.mesTexto(mes) + '</p>';
  html += '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Cliente</th><th>M</th><th>Neto</th><th>Costo</th><th>Margen</th><th>/M</th></tr></thead><tbody>';
  rows.forEach(function (r, i) {
    var color = r.margen >= 0 ? 'var(--success,#22c55e)' : 'var(--danger,#ef4444)';
    html += '<tr><td>' + (i+1) + '</td><td><strong>' + RN.render.esc(r.nombre) + '</strong>' +
      (r.nodo ? '<br><span class="muted" style="font-size:11px">' + RN.render.esc(r.nodo) + '</span>' : '') +
      '</td><td>' + r.megas + '</td><td>' + f(r.neto) + '</td><td>' + f(r.costo) +
      '</td><td style="color:' + color + ';font-weight:700">' + f(r.margen) + '</td><td>' + f(r.margenPorMega) + '</td></tr>';
  });
  html += '</tbody></table></div>';
  out.innerHTML = html;
};
