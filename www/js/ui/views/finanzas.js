/**
 * ui/views/finanzas.js — Vistas de Finanzas: Capital en red, Por pagar, Inventario y Gastos.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */

/** v5.55.11 — Vista Dinero → Caja (detalle; el Panel solo enlaza aquí). */
RN.render.caja = function () {
  var kpi = document.getElementById('kpi-caja');
  if (kpi && RN.calc.bolsillos) {
    var b = RN.calc.bolsillos();
    var libre = Math.max(0, +(b.retirable != null ? b.retirable : b.libre) || 0);
    var kpis = [
      { label: 'Libre (retirable)', value: RN.calc.formatCUP(libre), cls: libre > 0 ? 'green' : 'red' },
      { label: 'Reserva', value: RN.calc.formatCUP(b.reserva || 0), cls: 'amber' },
      { label: 'Fondo total', value: RN.calc.formatCUP(b.fondo != null ? b.fondo : RN.calc.fondoCaja()), cls: 'blue' },
      { label: 'Por pagar proveedor', value: RN.calc.formatCUP(RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes() : 0), cls: 'red' }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
    }).join('');
  }
  if (RN.panelWidgets) {
    if (RN.panelWidgets.renderCajaProyectada) RN.panelWidgets.renderCajaProyectada();
    if (RN.panelWidgets.renderCajaReal) RN.panelWidgets.renderCajaReal();
  }
};

// ---------- INVERSION ----------
RN.render.inversion = function () {
  // v5.55.7: solo capital propio (ya no mezcla pasivos)
  const kpi = document.getElementById('kpi-inversion');
  if (kpi) {
    var _pctGananciaMes = RN.investment.pctGananciaMes();
    var _pctRecKPI = _pctGananciaMes > 0
      ? RN.investment.porcentajeRecuperacionEfectiva()
      : RN.investment.porcentajeRecuperacion();
    var _totalRecKPI = _pctGananciaMes > 0
      ? RN.investment.totalRecuperadoEfectivo()
      : RN.investment.totalRecuperado();
    var _estimadoTxt = RN.investment.costoMegaConfigurado() ? '' : ' (estimado)';
    var _pctLabel = _pctGananciaMes > 0 ? '% recuperación efectiva' + _estimadoTxt : '% recuperación' + _estimadoTxt;
    var _kpiInversiones = [
      { label: 'Total invertido', value: RN.calc.formatCUP(RN.investment.totalInvertido()), cls: 'blue' },
      { label: 'Recuperado', value: RN.calc.formatCUP(_totalRecKPI), cls: 'green' },
      { label: _pctLabel, value: _pctRecKPI + '%', cls: 'amber' },
      { label: 'Por recuperar', value: RN.calc.formatCUP(Math.max(0, RN.investment.totalInvertido() - _totalRecKPI)), cls: 'red' }
    ];
    kpi.innerHTML = '<div class="kpi-group-title">Capital en red</div><div class="kpi-grid">'
      + _kpiInversiones.map(function (k) {
        return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
      }).join('') + '</div>';
  }

  const recupInvEl = document.getElementById('inversion-recuperacion');
  const recupInvCard = document.getElementById('card-recuperacion-inv');
  if (recupInvEl && recupInvCard) {
    if (RN.investment.totalInvertido() > 0) {
      recupInvCard.style.display = '';
      recupInvEl.innerHTML = RN.render.barraRecuperacion();
    } else {
      recupInvCard.style.display = 'none';
    }
  }

  const cont = document.getElementById('lista-inversion');
  var _invActivas = RN.investment.inversionesActivas
    ? RN.investment.inversionesActivas()
    : (RN.state.investments || []).filter(function (i) {
        return RN.investment.origenCapital(i) !== 'prestado_externo' && !i.inversionRecuperada;
      });
  var _invRecuperadas = RN.investment.inversionesRecuperadas
    ? RN.investment.inversionesRecuperadas()
    : (RN.state.investments || []).filter(function (i) {
        return RN.investment.origenCapital(i) !== 'prestado_externo' && !!i.inversionRecuperada;
      });

  if (cont) {
    if (!_invActivas.length && !_invRecuperadas.length) {
      cont.innerHTML = '<div class="acc-empty"><div class="icon">📈</div>No hay inversiones con capital propio. Usa “+ Nueva inversión”.</div>';
    } else if (!_invActivas.length) {
      cont.innerHTML = '<div class="acc-empty"><div class="icon">✓</div>Todo el capital propio está recuperado. El margen actual es ganancia.</div>';
    } else {
      cont.innerHTML = _invActivas.map(function (inv) {
        return RN.inversion._cardInversion(inv, { esDeuda: false, esRecuperada: false });
      }).join('');
    }
  }

  var contRec = document.getElementById('lista-inversiones-recuperadas');
  var cardRec = document.getElementById('card-inversiones-recuperadas');
  if (contRec && cardRec) {
    if (!_invRecuperadas.length) {
      cardRec.style.display = 'none';
      contRec.innerHTML = '';
    } else {
      cardRec.style.display = '';
      var ordenadas = _invRecuperadas.slice().sort(function (a, b) {
        var fa = a.fechaRecuperacion || a.fechaCompra || '';
        var fb = b.fechaRecuperacion || b.fechaCompra || '';
        return fa < fb ? 1 : (fa > fb ? -1 : 0);
      });
      contRec.innerHTML = ordenadas.map(function (inv) {
        return RN.inversion._cardInversion(inv, { esDeuda: false, esRecuperada: true });
      }).join('');
    }
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(RN.render.animarBarrasRecuperacion);
  } else if (RN.render.animarBarrasRecuperacion) {
    RN.render.animarBarrasRecuperacion();
  }
};

/** v5.55.7 — Vista Por pagar (pasivos): agenda, política, KPIs de deuda. */
RN.render.deudas = function () {
  var kpi = document.getElementById('kpi-deudas');
  var _act = RN.investment.colaDeudasOrdenada
    ? RN.investment.colaDeudasOrdenada()
    : RN.investment.deudasActivas();
  var _conc = RN.investment.deudasConcluidas();
  var _saldo = (_act || []).reduce(function (s, i) {
    return s + (RN.investment.saldoADevolverMoneda ? RN.investment.monedaDeudaACup(i, RN.investment.saldoADevolverMoneda(i)) : RN.investment.saldoADevolver(i));
  }, 0);
  var _devAct = (_act || []).reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
  var _devConc = (_conc || []).reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
  if (kpi) {
    var kpis = [
      { label: 'Deudas activas', value: String((_act || []).length), cls: 'blue' },
      { label: 'Saldo por devolver', value: RN.calc.formatCUP(_saldo), cls: 'red' },
      { label: 'Ya devuelto (activas)', value: RN.calc.formatCUP(_devAct), cls: 'amber' },
      { label: 'Liquidadas', value: String((_conc || []).length) + ' · ' + RN.calc.formatCUP(_devConc), cls: 'green' }
    ];
    kpi.innerHTML = '<div class="kpi-group-title">Pasivos (por pagar)</div><div class="kpi-grid">'
      + kpis.map(function (k) {
        return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
      }).join('') + '</div>';
  }

  var polEl = document.getElementById('politica-deudas-resumen');
  if (polEl && RN.investment.textoPoliticaDeudas) {
    polEl.innerHTML = RN.investment.textoPoliticaDeudas()
      + ' <button type="button" class="btn sm" style="margin-left:6px" onclick="RN.investment.abrirPoliticaDeudas()">Editar en Ajustes</button>';
  }

  var recupDeudasEl = document.getElementById('deudas-recuperacion');
  var recupDeudasCard = document.getElementById('card-recuperacion-deudas');
  if (recupDeudasEl && recupDeudasCard) {
    var totalPrestadoActivas = RN.investment.totalPrestadoActivas
      ? RN.investment.totalPrestadoActivas()
      : 0;
    if (totalPrestadoActivas > 0 && RN.render.barraRecuperacion) {
      recupDeudasCard.style.display = '';
      recupDeudasEl.innerHTML = RN.render.barraRecuperacion(
        totalPrestadoActivas,
        RN.investment.totalDevueltoActivas ? RN.investment.totalDevueltoActivas() : 0,
        RN.investment.porcentajeDevueltoDeudas ? RN.investment.porcentajeDevueltoDeudas() : 0,
        {
          labelFaltante: 'Por devolver',
          textoVacio: 'Sin deudas personales activas',
          textoProceso: 'En proceso de devolución',
          avisoCosto: false
        }
      );
      if (RN.investment.htmlMetaDevolucion) {
        recupDeudasEl.innerHTML += RN.investment.htmlMetaDevolucion();
      }
    } else {
      recupDeudasCard.style.display = 'none';
    }
  }

  if (RN.inversion && RN.inversion._renderDeudasActivas) {
    RN.inversion._renderDeudasActivas(_act || []);
  }
  if (RN.inversion && RN.inversion._renderDeudasConcluidas) {
    RN.inversion._renderDeudasConcluidas(_conc || []);
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(RN.render.animarBarrasRecuperacion);
  } else if (RN.render.animarBarrasRecuperacion) {
    RN.render.animarBarrasRecuperacion();
  }
};

// ---------- INVENTARIO ----------
RN.render.inventario = function () {
  const cont = document.getElementById('lista-inventario');
  if (!cont) return;
  // v5.12.0: vista agrupada por producto (material), con lotes FIFO
  var productos = RN.inventarioModel.productosAgrupados();
  if (!productos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📦</div>No hay productos en inventario.</div>';
    return;
  }
  // KPI de inventario: valor total del stock, ganancia potencial
  var valorStock = 0, gananciaPotencial = 0;
  productos.forEach(function (p) {
    p.lotes.forEach(function (l) {
      var disp = RN.inventarioModel.stockDisponibleLote(l.id);
      valorStock += disp * (l.costoUnitario || 0);
    });
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    gananciaPotencial += p.stockDisponible * (precioSug - costoVig);
  });
  cont.innerHTML = productos.map(function (p) {
    var dotCls = p.stockDisponible > 0 ? 'ok' : 'due';
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    var pct = RN.inventarioModel.pctGanancia();
    var claveId = 'acc-invprod-' + p.key.replace(/[^a-z0-9]/g, '-');
    // Lotes del producto (ordenados por fecha = FIFO)
    var lotesHtml = p.lotes.map(function (l, idx) {
      var dispLote = RN.inventarioModel.stockDisponibleLote(l.id);
      var esVigente = dispLote > 0 && costoVig === (l.costoUnitario || 0) && idx === p.lotes.findIndex(function (x) { return RN.inventarioModel.stockDisponibleLote(x.id) > 0; });
      var badgeVigente = esVigente ? ' <span class="badge ok">vigente FIFO</span>' : '';
      var badgeAgotado = dispLote === 0 ? ' <span class="badge due">agotado</span>' : '';
      var fechaStr = l.fecha ? new Date(l.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      // Asignaciones de este lote
      var asigs = RN.state.asignacionesInventario.filter(function (a) { return a.loteId === l.id; });
      var asigsHtml = asigs.length ? asigs.map(function (a) {
        var cli = RN.state.clients.find(function (c) { return c.id === a.clienteId; });
        var cliNom = cli ? RN.render.esc(cli.nombre) : '<span class="muted">— cliente eliminado —</span>';
        var estado = a.vendida ? '<span class="badge ok">vendida</span>' : '<span class="badge warn">asignada</span>';
        return '<div class="acc-row"><span class="acc-label">' + a.cantidad + ' ud. → ' + cliNom + '</span><span class="acc-value">' + estado + ' ' + RN.calc.formatCUP(a.precioTotal || 0) + '</span></div>';
      }).join('') : '<div class="acc-row"><span class="acc-value muted">Sin asignaciones</span></div>';
      // Desglose de pago del lote (si tiene)
      var pagoHtml = '';
      if (l.monedaPago) {
        pagoHtml = '<div class="acc-row"><span class="acc-label">Pago (' + l.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({
          moneda: l.monedaPago,
          montoUSD: l.montoPagoUSD,
          montoCUP: l.montoPagoCUP,
          montoCUPDesdeUSD: l.montoPagoCUPDesdeUSD,
          totalRecibidoCUP: l.totalPagoCUP,
          tasaUsd: l.tasaUsdCompra
        }) + '</span></div>';
      }
      return '<div style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:8px">'
        + '<div class="acc-row"><span class="acc-label">Lote ' + (idx + 1) + ' · ' + fechaStr + badgeVigente + badgeAgotado + '</span><span class="acc-value">' + l.cantidad + ' compradas · ' + dispLote + ' disp.</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo unitario</span><span class="acc-value">' + RN.calc.formatCUP(l.costoUnitario || 0) + '</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo total</span><span class="acc-value">' + RN.calc.formatCUP(l.costoTotal || (l.cantidad * (l.costoUnitario || 0))) + '</span></div>'
        + (l.notas ? '<div class="acc-row"><span class="acc-label">Notas</span><span class="acc-value">' + RN.render.esc(l.notas) + '</span></div>' : '')
        + pagoHtml
        + '<div class="divider" style="margin:6px 0"></div>'
        + asigsHtml
        + '<div class="acc-actions" style="margin-top:8px">'
        +   '<button class="btn sm" onclick="RN.inventario.eliminarLote(\'' + RN.render.escAttr(l.id) + '\')">🗑 Eliminar lote</button>'
        + '</div>'
        + '</div>';
    }).join('');
    return '<div class="acc-card" id="' + claveId + '">'
      + '<div class="acc-summary" onclick="RN.render.toggleCard(\'' + claveId + '\')">'
      +   '<span class="acc-dot ' + dotCls + '"></span>'
      +   '<div class="acc-summary-main">'
      +     '<div class="acc-summary-name">' + RN.render.esc(p.nombre) + '</div>'
      +     '<div class="acc-summary-sub">' + p.lotes.length + ' lote' + (p.lotes.length > 1 ? 's' : '') + ' · ' + p.stockDisponible + ' disp. · costo vigente ' + RN.calc.formatCUP(costoVig) + '/ud · venta sug. ' + RN.calc.formatCUP(precioSug) + '</div>'
      +   '</div>'
      +   '<div class="acc-summary-total">'
      +     '<div class="amt">' + p.stockDisponible + '</div>'
      +     '<div class="lbl">Disponible</div>'
      +   '</div>'
      +   '<span class="acc-chevron">▼</span>'
      + '</div>'
      + '<div class="acc-details">'
      +   '<div class="acc-row"><span class="acc-label">Producto</span><span class="acc-value">' + RN.render.esc(p.nombre) + '</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Stock total comprado</span><span class="acc-value">' + p.stockTotal + ' ud.</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Stock disponible</span><span class="acc-value"><span class="badge ' + (p.stockDisponible > 0 ? 'ok' : 'due') + '">' + p.stockDisponible + '</span></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Costo vigente (FIFO)</span><span class="acc-value">' + RN.calc.formatCUP(costoVig) + '/ud</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Precio de venta sugerido (' + pct + '%)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(precioSug) + '/ud</strong></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Ganancia potencial</span><span class="acc-value" style="color:var(--green)">' + RN.calc.formatCUP(p.stockDisponible * (precioSug - costoVig)) + '</span></div>'
      +   '<div class="divider" style="margin:8px 0"></div>'
      +   '<div class="acc-row" style="font-weight:600"><span class="acc-label">Lotes (' + p.lotes.length + ') — FIFO (más antiguo primero)</span></div>'
      +   lotesHtml
      +   '<div class="acc-actions">'
      +     '<button class="btn sm primary" onclick="RN.inventario.asignar(\'' + RN.render.escAttr(p.nombre) + '\')">Asignar / vender</button>'
      +     '<button class="btn sm" onclick="RN.inventario.abrirNuevoLote(\'' + RN.render.escAttr(p.nombre) + '\')">📋 Comprar más</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
};
// ---------- GASTOS ----------
RN.render.gastos = function () {
  const kpi = document.getElementById('kpi-gastos');
  if (kpi) {
    const total = RN.calc.gastosTotales();
    kpi.innerHTML = [
      { label: 'Gastos totales', value: RN.calc.formatCUP(total), cls: 'red' },
      { label: 'Gastos del mes', value: RN.calc.formatCUP(RN.calc.gastosMes()), cls: 'amber' }
    ].map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('');
  }
  const cont = document.getElementById('lista-gastos');
  if (!cont) return;
  if (!RN.state.gastos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay gastos registrados.</div>';
    return;
  }
  const gastos = [...RN.state.gastos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  cont.innerHTML = gastos.map(g => {
    var catBadge = '<span class="pill">' + RN.render.esc(g.categoria || 'General') + '</span>';
    var provIcon = g.esPagoProveedor ? ' 📡' : '';
    var retiroIcon = g.esRetiroCaja ? ' 💵' : '';
    var retiroBadge = g.esRetiroCaja ? '<span class="badge warn" style="margin-left:4px">Retiro de caja</span>' : '';
    // v5.14.0: los cuadres de caja se guardan en RN.state.gastos igual que
    // los gastos normales, pero con esCuadreCaja=true. El sobrante se guarda
    // con monto NEGATIVO (ver cuadre.js), así que aquí se muestra con su
    // propio ícono/etiqueta y el signo/color correctos en vez de "Gasto".
    var esCuadre = !!g.esCuadreCaja;
    var esSobrante = esCuadre && g.tipoCuadre === 'sobrante';
    var cuadreIcon = esCuadre ? ' 🧮' : '';
    // v5.31.0: un cuadre puede ser en CUP o en USD (cuadreMoneda). En USD se
    // muestra el monto real en dólares, con su equivalente en CUP entre
    // paréntesis, para que no se confunda con un descuadre de pesos.
    var cuadreMoneda = (esCuadre && g.cuadreMoneda === 'USD') ? 'USD' : 'CUP';
    var cuadreBadge = esCuadre ? '<span class="badge ' + (esSobrante ? 'ok' : 'due') + '" style="margin-left:4px">' + (esSobrante ? 'Sobrante de caja' : 'Faltante de caja') + ' · ' + cuadreMoneda + '</span>' : '';
    var montoAbs = esCuadre ? Math.abs(g.monto) : g.monto;
    var montoLabel = esCuadre ? (esSobrante ? 'Sobrante' : 'Faltante') : 'Gasto';
    var montoColor = esSobrante ? 'style="color:var(--green,#16a34a)"' : '';
    var montoTxt = (esCuadre && cuadreMoneda === 'USD')
      ? RN.moneda.formatUSD(Math.abs(g.montoCuadreUSD || 0)) + ' <span class="muted" style="font-size:11px">(' + RN.calc.formatCUP(montoAbs) + ')</span>'
      : RN.calc.formatCUP(montoAbs);
    return '<div class="acc-card" id="acc-gas-' + g.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-gas-' + g.id + '\')">' +
        '<span class="acc-dot due"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(g.concepto) + provIcon + retiroIcon + cuadreIcon + '</div>' +
          '<div class="acc-summary-sub">' + RN.render.esc((g.fecha || '').slice(0, 10)) + ' · ' + RN.render.esc(g.categoria || 'General') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt" ' + montoColor + '>' + (esSobrante ? '+' : '') + montoTxt + '</div>' +
          '<div class="lbl">' + montoLabel + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc((g.fecha || '').slice(0, 10)) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + RN.render.esc(g.concepto) + provIcon + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Categoría</span><span class="acc-value">' + catBadge + retiroBadge + cuadreBadge + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Monto</span><span class="acc-value" ' + montoColor + '>' + (esSobrante ? '+' : '') + montoTxt + '</span></div>' +
        '<div class="acc-actions">' +
          '<button class="btn sm danger" onclick="RN.gastos.eliminar(\'' + g.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
