/**
 * reportes/margen-clientes.js — Margen por cliente v5.55.27
 */
RN.margenClientes = RN.margenClientes || {};
RN.margenClientes.orden = RN.margenClientes.orden || 'mejor'; // mejor | peor

RN.margenClientes.costoMegaEfectivo = function () {
  var megas = +(RN.state.config.proveedorMegas || 0);
  var plus = +(RN.state.config.plusMegas || 0);
  if (RN.calc && RN.calc.plusMegas) {
    try { plus = RN.calc.plusMegas() || plus; } catch (e) {}
  }
  var monto = RN.calc.montoPaqueteProveedor
    ? RN.calc.montoPaqueteProveedor()
    : (+(RN.state.config.proveedorMonto) || 0);
  var totalM = megas + Math.max(0, plus);
  if (totalM <= 0) return +(RN.state.config.proveedorPrecioMega || RN.state.config.costoPorMega || 0);
  return +(monto / totalM).toFixed(4);
};

RN.margenClientes.lista = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var costoM = RN.margenClientes.costoMegaEfectivo();
  var rows = [];
  var base = (RN.calc.clientesCobrables || RN.calc.clientesActivos)();
  base.forEach(function (c) {
    if (RN.calc.esAdmin && RN.calc.esAdmin(c)) return;
    if (c.esAdmin) return;
    var megas = 0;
    try { megas = RN.calc.getMegasCliente ? RN.calc.getMegasCliente(c) : +(c.megas || 0); } catch (e) { megas = +(c.megas || 0); }
    var neto = RN.calc.getPrecioNeto(c, mes);
    var costo = megas * costoM;
    var margen = neto - costo;
    var nodoNom = '';
    if (c.nodoId && RN.nodos && RN.nodos.porId) {
      var nd = RN.nodos.porId(c.nodoId);
      if (nd) nodoNom = nd.nombre;
    }
    rows.push({
      id: c.id,
      nombre: c.nombre,
      megas: megas,
      neto: neto,
      costo: +costo.toFixed(2),
      margen: +margen.toFixed(2),
      margenPorMega: megas > 0 ? +(margen / megas).toFixed(2) : 0,
      nodo: nodoNom || c.direccion || ''
    });
  });
  return rows;
};

RN.margenClientes._fillMes = function () {
  var sel = document.getElementById('margen-mes');
  if (!sel) return RN.calc.mesActualStr();
  var cur = sel.value || RN.calc.mesActualStr();
  var meses = {};
  meses[RN.calc.mesActualStr()] = true;
  var m = RN.calc.mesActualStr();
  for (var i = 0; i < 11; i++) {
    if (RN.calc.mesAnterior) m = RN.calc.mesAnterior(m);
    meses[m] = true;
  }
  var keys = Object.keys(meses).sort().reverse();
  sel.innerHTML = '';
  keys.forEach(function (k) {
    var opt = document.createElement('option');
    opt.value = k;
    opt.textContent = (RN.calc.mesTexto ? RN.calc.mesTexto(k) : k) + (k === RN.calc.mesActualStr() ? ' (actual)' : '');
    sel.appendChild(opt);
  });
  if (keys.indexOf(cur) >= 0) sel.value = cur;
  else sel.value = RN.calc.mesActualStr();
  return sel.value;
};

RN.margenClientes.setOrden = function (o) {
  RN.margenClientes.orden = o || 'mejor';
  RN.margenClientes.render();
};

RN.margenClientes.render = function () {
  var out = document.getElementById('margen-clientes-out');
  if (!out) return;
  var mes = RN.margenClientes._fillMes();
  var badge = document.getElementById('margen-mes-badge');
  if (badge) badge.textContent = RN.calc.mesTexto ? RN.calc.mesTexto(mes) : mes;

  var rows = RN.margenClientes.lista(mes);
  var f = RN.calc.formatCUP;
  var costoM = RN.margenClientes.costoMegaEfectivo();

  if (!rows.length) {
    out.innerHTML = '<div class="acc-empty"><div class="icon">📈</div>No hay clientes para calcular margen.</div>';
    return;
  }

  var orden = RN.margenClientes.orden || 'mejor';
  rows = rows.slice().sort(function (a, b) {
    return orden === 'peor' ? (a.margen - b.margen) : (b.margen - a.margen);
  });

  var totalMargen = rows.reduce(function (s, r) { return s + r.margen; }, 0);
  var negativos = rows.filter(function (r) { return r.margen < 0; }).length;
  var totalNeto = rows.reduce(function (s, r) { return s + r.neto; }, 0);

  var html = '';
  html += '<div class="ana-zone"><div class="ana-zone-label">Resumen</div><div class="card">';
  html += '<div class="muted" style="font-size:12px;font-weight:600">Periodo · ' + RN.render.esc(RN.calc.mesTexto ? RN.calc.mesTexto(mes) : mes) + '</div>';
  html += '<div style="font-size:20px;font-weight:800;margin:4px 0">' + f(totalMargen) + ' <span class="muted" style="font-size:13px;font-weight:500">margen total</span></div>';
  html += '<div class="muted" style="font-size:12px">Costo/M ' + f(costoM) + ' · Neto ' + f(totalNeto) + ' · ' + negativos + ' en rojo</div>';
  html += '</div>';
  html += '<div class="kpi-grid mt-16">';
  html += '<div class="kpi green"><div class="label">Margen total</div><div class="value" style="font-size:14px">' + f(totalMargen) + '</div></div>';
  html += '<div class="kpi blue"><div class="label">Clientes</div><div class="value">' + rows.length + '</div></div>';
  html += '<div class="kpi ' + (negativos ? 'red' : 'green') + '"><div class="label">Margen negativo</div><div class="value">' + negativos + '</div></div>';
  html += '<div class="kpi blue"><div class="label">Costo / M</div><div class="value" style="font-size:14px">' + f(costoM) + '</div></div>';
  html += '</div></div>';

  html += '<div class="ana-zone"><div class="ana-zone-label">Ranking</div>';
  html += '<div class="chips" style="margin-bottom:10px">';
  html += '<button type="button" class="chip' + (orden === 'mejor' ? ' active' : '') + '" onclick="RN.margenClientes.setOrden(\'mejor\')">Mejor margen</button>';
  html += '<button type="button" class="chip' + (orden === 'peor' ? ' active' : '') + '" onclick="RN.margenClientes.setOrden(\'peor\')">Peor margen</button>';
  html += '</div>';

  rows.forEach(function (r, i) {
    var color = r.margen >= 0 ? 'var(--success)' : 'var(--danger)';
    html += '<div class="ana-row">';
    html += '<div class="ana-row-head">';
    html += '<div><strong>#' + (i + 1) + ' ' + RN.render.esc(r.nombre) + '</strong>';
    html += '<div class="ana-row-sub">' + r.megas + 'M · neto ' + f(r.neto) + ' · costo ' + f(r.costo);
    if (r.nodo) html += ' · ' + RN.render.esc(r.nodo);
    html += '</div></div>';
    html += '<div class="amt" style="color:' + color + '">' + f(r.margen) + '<div class="ana-row-sub" style="text-align:right">' + f(r.margenPorMega) + '/M</div></div>';
    html += '</div>';
    html += '<div class="ana-row-actions">';
    html += '<button type="button" class="btn sm" onclick="RN.modalCliente.editar(\'' + RN.render.escAttr(r.id) + '\')">Editar cliente</button>';
    html += '</div></div>';
  });
  html += '</div>';
  out.innerHTML = html;
};
