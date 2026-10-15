/**
 * cobros/month-reset.js — Cierre de mes (asistente + validación).
 * v5.13.20: el mes operativo es el del reloj; el cierre solo genera snapshot.
 * v5.52.9: checklist guiado.
 * v5.53.0: checkbox obligatorio + bloqueo si hay pendientes (solo "Forzar cierre").
 */
RN.monthReset = RN.monthReset || {};

RN.monthReset._datosChecklist = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var costoPaquete = RN.calc.montoPaqueteProveedor
    ? RN.calc.montoPaqueteProveedor()
    : (+(RN.state.config.proveedorMonto) || 0);
  var ingresos = RN.calc.ingresosMes(mes);
  var gastosMes = RN.calc.gastosMes(mes);
  var gastosProv = (RN.state.gastos || []).filter(function (g) {
    if (g.mes !== mes) return false;
    var cat = (g.categoria || '').toLowerCase();
    var con = (g.concepto || '').toLowerCase();
    return cat.indexOf('proveedor') >= 0 || cat.indexOf('internet') >= 0
      || con.indexOf('paquete') >= 0 || con.indexOf('proveedor') >= 0;
  });
  var montoProv = gastosProv.reduce(function (s, g) { return s + (g.monto || 0); }, 0);
  var paqueteCubiertoIngresos = costoPaquete > 0 && ingresos >= costoPaquete - 0.005;
  var paquetePagadoGasto = montoProv >= costoPaquete - 0.005 && costoPaquete > 0;

  var pendientes = [];
  try {
    if (RN.ciclos.clientesCobranzaPendientes) {
      RN.ciclos.clientesCobranzaPendientes().forEach(function (g) {
        g.clientes.forEach(function (c) { pendientes.push(c); });
      });
    }
  } catch (e) {}

  var parciales = (RN.state.history || []).filter(function (h) {
    return h.mes === mes && h.tipoPago === 'parcial';
  });

  var prestamoTotal = 0, prestamoDevuelto = 0, prestamoFalta = 0;
  try {
    if (RN.investment.totalPrestadoActivas) {
      prestamoTotal = RN.investment.totalPrestadoActivas();
      prestamoDevuelto = RN.investment.totalDevueltoActivas();
      prestamoFalta = Math.max(0, prestamoTotal - prestamoDevuelto);
    }
  } catch (e) {}

  var sinAplicar = (RN.state.descuentos || []).filter(function (d) {
    return RN.descuentos && RN.descuentos.esPuntualDeMes && RN.descuentos.esPuntualDeMes(d, mes);
  }).length;

  var sm = RN.calc.saldosMoneda ? RN.calc.saldosMoneda() : { cup: 0, usd: 0 };
  var rc = RN.calc.resumenCierre ? RN.calc.resumenCierre(mes) : {};

  return {
    mes: mes,
    mesTexto: RN.calc.mesTexto(mes),
    costoPaquete: costoPaquete,
    ingresos: ingresos,
    gastosMes: gastosMes,
    montoProv: montoProv,
    paqueteCubiertoIngresos: paqueteCubiertoIngresos,
    paquetePagadoGasto: paquetePagadoGasto,
    pendientes: pendientes,
    nPendientes: pendientes.length,
    parciales: parciales.length,
    prestamoTotal: prestamoTotal,
    prestamoDevuelto: prestamoDevuelto,
    prestamoFalta: prestamoFalta,
    sinAplicar: sinAplicar,
    saldoCajaCUP: sm.cup || rc.saldoCajaCUP || 0,
    saldoCajaUSD: sm.usd || rc.saldoCajaUSD || 0,
    clientesEnMora: rc.clientesEnMora || 0,
    moraGenerada: rc.moraGenerada || 0
  };
};

RN.monthReset.confirmar = function () {
  var mes = RN.calc.mesActualStr();
  var yaCerrado = (RN.state.snapshots || []).some(function (s) { return s.mes === mes; });
  if (yaCerrado) {
    RN.notifyUI.toast('El mes de ' + RN.calc.mesTexto(mes) + ' ya fue cerrado. No puedes cerrarlo dos veces.', 'warn', 6000);
    return;
  }
  RN.monthReset._abrirAsistente(mes);
};

RN.monthReset._onCheckRevisado = function () {
  var ck = document.getElementById('cierre-check-revisado');
  var ok = !!(ck && ck.checked);
  var btnNormal = document.getElementById('cierre-btn-normal');
  var btnForzar = document.getElementById('cierre-btn-forzar');
  var nPend = +(document.getElementById('cierre-n-pendientes') || {}).value || 0;
  if (btnNormal) {
    btnNormal.disabled = !ok || nPend > 0;
  }
  if (btnForzar) {
    btnForzar.disabled = !ok || nPend === 0;
    btnForzar.style.display = nPend > 0 ? '' : 'none';
  }
};

RN.monthReset._abrirAsistente = function (mes) {
  var d = RN.monthReset._datosChecklist(mes);
  var f = RN.calc.formatCUP;

  function item(ok, titulo, detalle, warn) {
    var ico = ok ? '✅' : (warn ? '⚠️' : '❌');
    var cls = ok ? 'ok' : (warn ? 'warn' : 'bad');
    return '<div class="cierre-item cierre-' + cls + '">' +
      '<div class="cierre-ico">' + ico + '</div>' +
      '<div class="cierre-body"><strong>' + titulo + '</strong>' +
      (detalle ? '<div class="muted" style="font-size:12px;margin-top:2px">' + detalle + '</div>' : '') +
      '</div></div>';
  }

  var htmlPaquete;
  if (d.costoPaquete <= 0) {
    htmlPaquete = item(true, 'Paquete del proveedor', 'Sin paquete configurado', true);
  } else if (d.paquetePagadoGasto) {
    htmlPaquete = item(true, 'Paquete del proveedor',
      'Gasto proveedor ' + f(d.montoProv) + ' (costo ' + f(d.costoPaquete) + ')');
  } else if (d.paqueteCubiertoIngresos) {
    htmlPaquete = item(false, 'Paquete del proveedor',
      'Ingresos (' + f(d.ingresos) + ') cubren el costo (' + f(d.costoPaquete) + '), pero no hay gasto de proveedor. ¿Ya lo pagaste?', true);
  } else {
    htmlPaquete = item(false, 'Paquete del proveedor',
      'Costo ' + f(d.costoPaquete) + ' · ingresos ' + f(d.ingresos));
  }

  var nombresPend = d.pendientes.slice(0, 5).map(function (c) { return RN.render.esc(c.nombre); }).join(', ');
  if (d.nPendientes > 5) nombresPend += ' y ' + (d.nPendientes - 5) + ' más';

  var htmlCobros = d.nPendientes === 0
    ? item(true, 'Cobros del mes', 'Todos los clientes al día')
    : item(false, 'Cobros del mes',
        d.nPendientes + ' pendiente(s)' +
        (d.parciales ? ' · ' + d.parciales + ' parcial(es)' : '') +
        (nombresPend ? ': ' + nombresPend : ''),
        d.nPendientes <= 3);

  var htmlPrestamo;
  if (d.prestamoTotal <= 0) {
    htmlPrestamo = item(true, 'Deudas personales', 'Sin préstamos activos');
  } else if (d.prestamoFalta <= 0.009) {
    htmlPrestamo = item(true, 'Deudas personales', 'Todo devuelto');
  } else {
    htmlPrestamo = item(false, 'Deudas personales',
      'Devuelto ' + f(d.prestamoDevuelto) + ' de ' + f(d.prestamoTotal) +
      ' · falta ' + f(d.prestamoFalta), true);
  }

  var htmlMora = d.clientesEnMora === 0
    ? item(true, 'Mora', 'Nadie en mora')
    : item(false, 'Mora', d.clientesEnMora + ' cliente(s) · ' + f(d.moraGenerada), true);

  var htmlCaja = item(true, 'Caja al cierre',
    f(d.saldoCajaCUP) + ' CUP' +
    (d.saldoCajaUSD ? ' + ' + (+d.saldoCajaUSD).toFixed(2) + ' USD' : '') +
    ' · ingresos ' + f(d.ingresos) + ' · gastos ' + f(d.gastosMes));

  var htmlDesc = d.sinAplicar === 0
    ? item(true, 'Descuentos puntuales', 'Ninguno a anular')
    : item(true, 'Descuentos puntuales', d.sinAplicar + ' se anularán al cerrar', true);

  var bloqueoMsg = d.nPendientes > 0
    ? '<p class="cierre-bloqueo">Hay <strong>' + d.nPendientes + '</strong> cliente(s) sin cobrar. El cierre normal está bloqueado. Usa <strong>Forzar cierre</strong> solo si estás seguro.</p>'
    : '';

  var html = ''
    + '<div class="modal-header"><h3>📋 Cerrar mes — ' + RN.render.esc(d.mesTexto) + '</h3>'
    + '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>'
    + '<div class="modal-body">'
    + '<p class="muted" style="margin-top:0">Revisa el checklist. Debes marcar que revisaste los avisos para habilitar el cierre.</p>'
    + '<div class="cierre-lista">'
    + htmlPaquete + htmlCobros + htmlPrestamo + htmlMora + htmlCaja + htmlDesc
    + '</div>'
    + bloqueoMsg
    + '<label class="cierre-check-label"><input type="checkbox" id="cierre-check-revisado" onchange="RN.monthReset._onCheckRevisado()"> He revisado los avisos de este cierre</label>'
    + '<input type="hidden" id="cierre-n-pendientes" value="' + d.nPendientes + '">'
    + '<p class="muted" style="font-size:12px;margin-top:12px">El mes operativo no avanza aquí: sigue el del calendario.</p>'
    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>'
    + '<button class="btn danger" id="cierre-btn-forzar" style="display:' + (d.nPendientes > 0 ? 'inline-flex' : 'none') + '" disabled onclick="RN.monthReset._confirmarForzar(' + d.nPendientes + ')">Forzar cierre</button>'
    + '<button class="btn primary" id="cierre-btn-normal" disabled onclick="RN.monthReset.ejecutarCierre(false)">Generar snapshot y cerrar</button>'
    + '</div>';

  RN.uiComponents.modal(html, { lg: true });
  setTimeout(function () { RN.monthReset._onCheckRevisado(); }, 0);
};

RN.monthReset._confirmarForzar = function (nPend) {
  var ck = document.getElementById('cierre-check-revisado');
  if (!ck || !ck.checked) {
    RN.notifyUI.toast('Marca primero que revisaste los avisos', 'warn');
    return;
  }
  var msg = 'Quedan ' + nPend + ' cliente(s) pendiente(s) de cobro. El snapshot los registrará como faltantes. ¿Forzar el cierre de todas formas?';
  if (RN.uiComponents && RN.uiComponents.confirmar) {
    RN.uiComponents.confirmar(msg, function () { RN.monthReset.ejecutarCierre(true); }, { danger: true });
  } else if (window.confirm(msg)) {
    RN.monthReset.ejecutarCierre(true);
  }
};

RN.monthReset.ejecutarCierre = function (forzado) {
  var mes = RN.calc.mesActualStr();
  var yaCerrado = (RN.state.snapshots || []).some(function (s) { return s.mes === mes; });
  if (yaCerrado) {
    RN.uiComponents.cerrarModal();
    RN.notifyUI.toast('El mes de ' + RN.calc.mesTexto(mes) + ' ya fue cerrado.', 'warn');
    return;
  }

  var d = RN.monthReset._datosChecklist(mes);
  if (d.nPendientes > 0 && !forzado) {
    RN.notifyUI.toast('Hay pendientes de cobro. Usa Forzar cierre si quieres continuar.', 'warn');
    return;
  }

  var snapshot = RN.calc.generarSnapshot(mes);
  snapshot.cierreForzado = !!forzado;
  snapshot.pendientesAlCerrar = d.nPendientes;
  RN.state.snapshots.push(snapshot);

  (RN.state.descuentos || []).forEach(function (d0) {
    if (RN.descuentos && RN.descuentos.esPuntualDeMes && RN.descuentos.esPuntualDeMes(d0, mes)) {
      d0.estado = 'anulado';
    }
  });

  var paqueteAplicadoMsg = '';
  if (RN.state.config.paquetePendiente) {
    var pp = RN.state.config.paquetePendiente;
    RN.state.config.proveedorInternet = pp.proveedor || RN.state.config.proveedorInternet;
    RN.state.config.proveedorMegas = pp.megas;
    RN.state.config.proveedorPrecioMega = pp.precioMega;
    if (pp.plus !== undefined && pp.plus !== null) RN.state.config.plusMegas = +pp.plus || 0;
    RN.state.config.proveedorMonto = +((pp.megas || 0) * (pp.precioMega || 0)).toFixed(2);
    if (pp.reserva !== undefined && pp.reserva !== null) RN.state.config.reservaMegas = pp.reserva;
    RN.state.config.paquetePendiente = null;
    paqueteAplicadoMsg = ' Paquete actualizado: ' + pp.megas + 'M × ' + pp.precioMega + ' CUP/M.';
  }

  try { RN.config.persistir(); } catch (e) {}
  try { RN.storageLocal.guardar(); } catch (e) {}

  RN.uiComponents.cerrarModal();
  if (RN.render && RN.render.todo) RN.render.todo();
  var extra = forzado ? ' (forzado, ' + d.nPendientes + ' pendientes)' : '';
  RN.notifyUI.toast('Snapshot de ' + RN.calc.mesTexto(mes) + ' generado' + extra + '.' + paqueteAplicadoMsg, 'success');
  try {
    if (RN.notify && RN.notify.local) RN.notify.local('Snapshot generado', RN.calc.mesTexto(mes) + extra);
  } catch (e) {}
};
