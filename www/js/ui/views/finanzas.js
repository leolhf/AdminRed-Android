/**
 * ui/views/finanzas.js — Vistas de Finanzas: Capital en red, Por pagar, Inventario y Gastos.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */

/** v5.55.13 — Vista Dinero → Caja: Ahora · Movimientos · Al cierre. */
RN.render.caja = function () {
  var b = RN.calc.bolsillos ? RN.calc.bolsillos() : { retirable: 0, libre: 0, reserva: 0, fondo: 0 };
  var libre = Math.max(0, +(b.retirable != null ? b.retirable : b.libre) || 0);
  var reserva = +(b.reserva || 0);
  var fondo = +(b.fondo != null ? b.fondo : (RN.calc.fondoCaja ? RN.calc.fondoCaja() : 0));
  var saldos = RN.calc.saldosMoneda ? RN.calc.saldosMoneda() : { cup: 0, usd: 0, totalCUP: fondo };
  var saldoProv = RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes() : 0;

  // --- Alertas locales ---
  var alertas = document.getElementById('caja-alertas');
  if (alertas) {
    var items = [];
    if (libre <= 0.01) {
      items.push({ cls: 'bad', txt: 'No hay libre retirable. La reserva está protegida.' });
    } else if (libre < fondo * 0.1 && fondo > 0) {
      items.push({ cls: 'warn', txt: 'Libre bajo respecto al fondo total.' });
    }
    if (saldoProv > 0.01) {
      items.push({
        cls: 'warn',
        txt: 'Paquete proveedor pendiente: ' + RN.calc.formatCUP(saldoProv) + '.',
        accion: 'RN.paqueteProveedor.abrir()',
        accionTxt: 'Pagar'
      });
    }
    try {
      if (RN.calc.usdEnCaja && RN.calc.usdEnCaja() < 0.01) {
        var deudasUsd = (RN.investment.deudasActivas ? RN.investment.deudasActivas() : []).some(function (i) {
          return RN.investment.monedaDeuda && RN.investment.monedaDeuda(i) === 'USD' && RN.investment.saldoADevolverMoneda(i) > 0;
        });
        if (deudasUsd) {
          items.push({ cls: 'warn', txt: 'Hay deudas en USD y no hay dólares físicos en caja.' });
        }
      }
    } catch (e) {}
    alertas.innerHTML = items.map(function (a) {
      return '<div class="caja-alerta ' + a.cls + '">' + RN.render.esc(a.txt)
        + (a.accion ? ' <button type="button" class="btn sm" style="margin-left:6px" onclick="' + a.accion + '">' + RN.render.esc(a.accionTxt || 'Ver') + '</button>' : '')
        + '</div>';
    }).join('');
  }

  // --- Zona AHORA ---
  var ahora = document.getElementById('caja-ahora');
  if (ahora) {
    ahora.innerHTML =
      '<div class="caja-hero">' +
        '<div class="caja-hero-label">Puedes retirar (bolsillo libre)</div>' +
        '<div class="caja-hero-value' + (libre <= 0.01 ? ' is-zero' : '') + '">' + RN.calc.formatCUP(libre) + '</div>' +
        '<div class="caja-hero-sub">' + (RN.render.subUSD ? RN.render.subUSD(libre, 'Disponible sin tocar la reserva') : 'Disponible sin tocar la reserva') + '</div>' +
        '<div class="caja-hero-grid">' +
          '<div class="caja-mini reserva"><div class="lbl">🔒 Reserva (intocable)</div><div class="val">' + RN.calc.formatCUP(reserva) + '</div></div>' +
          '<div class="caja-mini"><div class="lbl">Fondo total</div><div class="val">' + RN.calc.formatCUP(fondo) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="caja-fisicos">' +
        '<div class="caja-mini"><div class="lbl">CUP físico</div><div class="val">' + RN.calc.formatCUP(saldos.cup || 0) + '</div></div>' +
        '<div class="caja-mini"><div class="lbl">USD físico</div><div class="val">$' + (+(saldos.usd || 0)).toFixed(2) + '</div></div>' +
      '</div>' +
      '<div class="caja-acciones">' +
        '<button type="button" class="btn primary" onclick="RN.caja.extraer()">💵 Retirar</button>' +
        '<button type="button" class="btn" onclick="RN.caja.depositar()">＋ Depositar</button>' +
        '<button type="button" class="btn" onclick="RN.cuadre.abrir()">🧮 Cuadrar</button>' +
        '<button type="button" class="btn" onclick="RN.modalCobro.abrirDesdeCobros()">+ Cobrar</button>' +
      '</div>';
  }

  // --- Movimientos ---
  var movBox = document.getElementById('caja-movimientos');
  if (movBox && RN.caja.movimientosUnificados) {
    var movs = RN.caja.movimientosUnificados(8);
    if (!movs.length) {
      movBox.innerHTML = '<div class="acc-empty" style="padding:12px"><div class="icon">📋</div>Sin movimientos de caja aún.</div>';
    } else {
      movBox.innerHTML = movs.map(function (m) {
        var fecha = (m.fecha || '').slice(0, 10);
        var amtCls = m.signo > 0 ? 'in' : 'out';
        var sign = m.signo > 0 ? '+' : '−';
        var amtTxt = sign + RN.calc.formatCUP(Math.abs(m.montoCUP));
        try {
          if (RN.caja._montoTxt && m.raw) amtTxt = (m.signo > 0 ? '+' : '−') + RN.caja._montoTxt(m.raw).replace(/<[^>]+>/g, '');
        } catch (e) {}
        return '<div class="caja-mov-row">' +
          '<div class="mov-main"><strong>' + RN.render.esc(RN.caja._tipoMovLabel(m.tipo)) + '</strong> · ' + RN.render.esc(m.concepto) + '</div>' +
          '<div class="mov-amt ' + amtCls + '">' + amtTxt + '</div>' +
          '<div class="mov-meta">' + RN.render.esc(fecha) + (m.moneda && m.moneda !== 'CUP' ? ' · ' + m.moneda : '') + '</div>' +
        '</div>';
      }).join('');
    }
  }

  // --- Al cierre (compacto) ---
  var cierre = document.getElementById('caja-cierre');
  if (cierre && RN.calc.cajaProyeccion) {
    try {
      var mes = RN.calc.mesActualStr();
      var p = RN.calc.cajaProyeccion(mes);
      var base = p.base || {};
      var cierreVal = base.cierre != null ? base.cierre : (p.hoy || 0);
      var estado = p.estado || 'ok';
      var chip = estado === 'ok' ? 'Mes cubierto' : (estado === 'ajustada' ? 'Ajustado si no cobras todo' : 'Reserva en riesgo al cierre');
      var color = estado === 'ok' ? 'var(--success)' : (estado === 'ajustada' ? 'var(--warn, #d97706)' : 'var(--danger)');
      cierre.innerHTML =
        '<div class="muted" style="font-size:12px">Si cobras lo pendiente y pagas lo que falta al proveedor</div>' +
        '<div class="caja-cierre-hero" style="color:' + color + '">' + RN.calc.formatCUP(cierreVal) + '</div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:8px">' + RN.render.esc(chip) + '</div>' +
        '<div class="acc-row"><span class="acc-label">Hoy en caja</span><span class="acc-value">' + RN.calc.formatCUP(p.hoy || fondo) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">+ Por cobrar</span><span class="acc-value" style="color:var(--success)">' + RN.calc.formatCUP(p.pendiente || 0) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">− Por pagar (proveedor)</span><span class="acc-value" style="color:var(--danger)">' + RN.calc.formatCUP(p.porPagar != null ? p.porPagar : saldoProv) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Reserva al cierre (est.)</span><span class="acc-value">' + RN.calc.formatCUP(base.reservaCierre != null ? base.reservaCierre : reserva) + '</span></div>';
    } catch (e) {
      cierre.innerHTML = '<div class="muted">No se pudo calcular la proyección.</div>';
    }
  }

  // Si el detalle estaba abierto, refrescarlo
  var det = document.getElementById('panel-caja');
  if (det && det.style.display !== 'none' && det.style.display !== '' && RN.panelWidgets && RN.panelWidgets.renderCajaProyectada) {
    RN.panelWidgets.renderCajaProyectada();
  }
};

// ---------- INVERSION ----------
RN.render.inversion = function () {
  // v5.55.15: solo capital propio; hero de estado; KPIs filtrados
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

  var total = RN.investment.totalInvertido() || 0;
  var _pctGananciaMes = RN.investment.pctGananciaMes ? RN.investment.pctGananciaMes() : 0;
  var recuperado = _pctGananciaMes > 0 && RN.investment.totalRecuperadoEfectivo
    ? RN.investment.totalRecuperadoEfectivo()
    : RN.investment.totalRecuperado();
  var pct = total > 0
    ? +((Math.min(recuperado, total) / total) * 100).toFixed(1)
    : 0;
  var porRecuperar = Math.max(0, +(total - Math.min(recuperado, total)).toFixed(2));
  var gananciaExtra = recuperado > total ? +(recuperado - total).toFixed(2) : 0;

  // Tiempo estimado global (máximo entre activas con proyección)
  var tiempoTxt = '';
  try {
    var mesesMax = 0;
    (_invActivas || []).forEach(function (inv) {
      var rest = RN.investment.restanteEfectivo ? RN.investment.restanteEfectivo(inv) : 0;
      var ap = RN.investment.aporteMensualNeto ? RN.investment.aporteMensualNeto(inv) : 0;
      if (rest > 0 && ap > 0) {
        var m = Math.ceil(rest / ap);
        if (m > mesesMax) mesesMax = m;
      }
    });
    if (porRecuperar <= 0.01) tiempoTxt = 'Capital cubierto';
    else if (mesesMax > 0) tiempoTxt = '≈ ' + mesesMax + (mesesMax === 1 ? ' mes' : ' meses') + ' (estimación)';
    else tiempoTxt = 'Sin proyección (vincula clientes o revisa precios)';
  } catch (e) {
    tiempoTxt = '';
  }

  // --- Hero estado ---
  var hero = document.getElementById('cap-estado');
  if (hero) {
    if (total <= 0) {
      hero.innerHTML = '<div class="acc-empty" style="padding:12px"><div class="icon">📈</div>Aún no hay capital propio registrado. '
        + '<button type="button" class="btn sm primary" style="margin-top:8px" onclick="RN.inversion.abrirNuevaPropia()">+ Nueva inversión</button></div>';
    } else {
      hero.innerHTML =
        '<div class="cap-hero">' +
          '<div class="muted" style="font-size:12px;font-weight:600">Recuperado del capital propio</div>' +
          '<div class="cap-pct' + (porRecuperar <= 0.01 ? ' is-done' : '') + '">' + pct + '%</div>' +
          '<div class="cap-sub">' + RN.calc.formatCUP(Math.min(recuperado, total)) + ' de ' + RN.calc.formatCUP(total)
            + (gananciaExtra > 0 ? ' · extra ' + RN.calc.formatCUP(gananciaExtra) + ' (ganancia)' : '')
            + '</div>' +
          '<div class="cap-hero-grid">' +
            '<div class="cap-mini"><div class="lbl">Por recuperar</div><div class="val">' + RN.calc.formatCUP(porRecuperar) + '</div></div>' +
            '<div class="cap-mini"><div class="lbl">Tiempo estimado</div><div class="val" style="font-size:13px">' + RN.render.esc(tiempoTxt || '—') + '</div></div>' +
          '</div>' +
          (porRecuperar <= 0.01
            ? '<div class="muted" style="font-size:12px;margin-top:10px">Todo el capital está cubierto. El margen actual es ganancia.</div>'
            : '<div class="muted" style="font-size:12px;margin-top:10px">No es una deuda: es capital tuyo aún no cubierto por el margen de la red.</div>') +
        '</div>';
    }
  }

  // --- KPIs ---
  var kpi = document.getElementById('kpi-inversion');
  if (kpi) {
    var _estimadoTxt = RN.investment.costoMegaConfigurado && !RN.investment.costoMegaConfigurado() ? ' (est.)' : '';
    var kpis = [
      { label: 'Capital propio', value: RN.calc.formatCUP(total), cls: 'blue' },
      { label: 'Recuperado' + _estimadoTxt, value: RN.calc.formatCUP(Math.min(recuperado, total)), cls: 'green' },
      { label: '% recuperado', value: pct + '%', cls: 'blue' },
      { label: 'Por recuperar', value: RN.calc.formatCUP(porRecuperar), cls: porRecuperar > 0 ? 'amber' : 'green' }
    ];
    kpi.innerHTML = '<div class="kpi-grid">' + kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
    }).join('') + '</div>';
  }

  // Barra global (opcional, bajo KPIs)
  var recupInvEl = document.getElementById('inversion-recuperacion');
  var recupInvCard = document.getElementById('card-recuperacion-inv');
  if (recupInvEl && recupInvCard) {
    if (total > 0 && RN.render.barraRecuperacion) {
      recupInvCard.style.display = '';
      // Preferir totales ya filtrados
      recupInvEl.innerHTML = RN.render.barraRecuperacion(
        total,
        Math.min(recuperado, total),
        pct,
        {
          labelFaltante: 'Por recuperar',
          textoVacio: 'Sin capital propio',
          textoProceso: 'En recuperación',
          avisoCosto: false
        }
      );
    } else {
      recupInvCard.style.display = 'none';
    }
  }

  // Lista activas
  var cont = document.getElementById('lista-inversion');
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

  // Recuperadas
  var contRec = document.getElementById('lista-inversiones-recuperadas');
  var cardRec = document.getElementById('card-inversiones-recuperadas');
  var vacioRec = document.getElementById('cap-recuperadas-vacio');
  if (contRec && cardRec) {
    if (!_invRecuperadas.length) {
      cardRec.style.display = 'none';
      contRec.innerHTML = '';
      if (vacioRec) vacioRec.style.display = total > 0 ? '' : 'none';
    } else {
      cardRec.style.display = '';
      if (vacioRec) vacioRec.style.display = 'none';
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
    requestAnimationFrame(function () {
      if (RN.render.animarBarrasRecuperacion) RN.render.animarBarrasRecuperacion();
    });
  }
};

RN.capUI = RN.capUI || {};
RN.capUI._comoOpen = false;
RN.capUI.toggleComo = function () {
  RN.capUI._comoOpen = !RN.capUI._comoOpen;
  var el = document.getElementById('cap-como');
  var btn = document.getElementById('cap-btn-como');
  if (el) el.style.display = RN.capUI._comoOpen ? '' : 'none';
  if (btn) btn.textContent = RN.capUI._comoOpen ? 'Ocultar método' : 'Ver método de recuperación';
};

RN.render.deudas = function () {
  var _act = RN.investment.colaDeudasOrdenada
    ? RN.investment.colaDeudasOrdenada()
    : RN.investment.deudasActivas();
  var _conc = RN.investment.deudasConcluidas();

  // Totales en CUP + tramo USD de contrato
  var _saldoCUP = 0;
  var _saldoUSD = 0;
  (_act || []).forEach(function (i) {
    if (RN.investment.saldoADevolverMoneda && RN.investment.monedaDeuda) {
      var sm = RN.investment.saldoADevolverMoneda(i);
      if (RN.investment.monedaDeuda(i) === 'USD') _saldoUSD += sm;
      _saldoCUP += RN.investment.monedaDeudaACup(i, sm);
    } else {
      _saldoCUP += RN.investment.saldoADevolver(i);
    }
  });
  var _devAct = (_act || []).reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
  var _devConc = (_conc || []).reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);

  // Libre en caja (contexto para pagar)
  var libre = 0;
  try {
    var b = RN.calc.bolsillos && RN.calc.bolsillos();
    libre = Math.max(0, +((b && (b.retirable != null ? b.retirable : b.libre)) || 0));
  } catch (e) {}

  // --- Siguiente a pagar ---
  var sig = document.getElementById('deuda-siguiente');
  if (sig) {
    if (!_act || !_act.length) {
      sig.innerHTML = '<div class="acc-empty" style="padding:12px"><div class="icon">✓</div>No hay deudas activas. '
        + '<button type="button" class="btn sm primary" style="margin-top:8px" onclick="RN.inversion.abrirNuevaDeuda()">+ Nueva deuda</button></div>';
    } else {
      var inv0 = _act[0];
      var plan0 = RN.investment.planDevolucion ? RN.investment.planDevolucion(inv0) : null;
      var badge = '';
      if (plan0 && plan0.fechaObjetivo) {
        var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        var d = new Date(plan0.fechaObjetivo + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          if (d < hoy) badge = '<span class="badge due">Vencida</span> ';
          else if (d <= new Date(hoy.getTime() + 7 * 86400000)) badge = '<span class="badge due">Esta semana</span> ';
          else badge = '<span class="badge ok">Programada</span> ';
        }
      } else {
        badge = '<span class="badge warn">Sin fecha objetivo</span> ';
      }
      var metaL = [];
      if (plan0 && plan0.tiempoTxt) metaL.push(plan0.tiempoTxt);
      if (plan0 && plan0.metaCuota > 0) metaL.push('cuota ' + RN.investment.fmtMontoDeuda(inv0, plan0.metaCuota));
      metaL.push('Libre en caja: ' + RN.calc.formatCUP(libre));
      sig.innerHTML =
        '<div class="deuda-siguiente-hero">' +
          '<div class="ds-name">' + badge + RN.render.esc(inv0.concepto || 'Deuda') + '</div>' +
          '<div class="ds-saldo">' + RN.investment.fmtSaldoDeuda(inv0) + '</div>' +
          '<div class="ds-meta">' + RN.render.esc(metaL.join(' · ')) + '</div>' +
          '<div class="ds-actions">' +
            '<button type="button" class="btn primary" onclick="RN.inversion.devolucionPrestamo(\'' + inv0.id + '\')">Pagar</button>' +
            '<button type="button" class="btn" onclick="RN.tabs.ir(\'caja\')">Ver caja</button>' +
          '</div>' +
        '</div>';
    }
  }

  // --- KPIs resumen ---
  var kpi = document.getElementById('kpi-deudas');
  if (kpi) {
    var subSaldo = _saldoUSD > 0.009
      ? ('Equiv. CUP · de ello ≈ $' + _saldoUSD.toFixed(2) + ' USD contrato')
      : 'Equivalente en CUP';
    var kpis = [
      { label: 'Activas', value: String((_act || []).length), cls: 'blue' },
      { label: 'Por devolver', value: RN.calc.formatCUP(_saldoCUP), sub: subSaldo, cls: 'red' },
      { label: 'Ya devuelto', value: RN.calc.formatCUP(_devAct), cls: 'amber' },
      { label: 'Liquidadas', value: String((_conc || []).length), cls: 'green' }
    ];
    kpi.innerHTML = '<div class="kpi-grid">' + kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div>'
        + (k.sub ? '<div class="sub">' + k.sub + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  // Política (colapsada por defecto)
  var polEl = document.getElementById('politica-deudas-resumen');
  if (polEl && RN.investment.textoPoliticaDeudas) {
    polEl.innerHTML = RN.investment.textoPoliticaDeudas()
      + ' <button type="button" class="btn sm" style="margin-left:6px" onclick="RN.investment.abrirPoliticaDeudas()">Editar en Ajustes</button>';
    if (!RN.deudasUI._politicaOpen) polEl.style.display = 'none';
  }

  // Devolución global
  var recupDeudasEl = document.getElementById('deudas-recuperacion');
  var recupDeudasCard = document.getElementById('card-recuperacion-deudas');
  if (recupDeudasEl && recupDeudasCard) {
    var totalPrestadoActivas = RN.investment.totalPrestadoActivas
      ? RN.investment.totalPrestadoActivas()
      : 0;
    if (totalPrestadoActivas > 0 && RN.render.barraRecuperacion) {
      recupDeudasCard.style.display = '';
      var pct = RN.investment.porcentajeDevueltoDeudas ? RN.investment.porcentajeDevueltoDeudas() : 0;
      var devT = RN.investment.totalDevueltoActivas ? RN.investment.totalDevueltoActivas() : 0;
      recupDeudasEl.innerHTML = RN.render.barraRecuperacion(
        totalPrestadoActivas,
        devT,
        pct,
        {
          labelFaltante: 'Por devolver',
          textoVacio: 'Sin deudas activas',
          textoProceso: 'En proceso de devolución',
          avisoCosto: false
        }
      );
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
    requestAnimationFrame(function () {
      if (RN.render.animarBarrasRecuperacion) RN.render.animarBarrasRecuperacion();
    });
  }
};

RN.deudasUI = RN.deudasUI || {};
RN.deudasUI._politicaOpen = false;
RN.deudasUI.togglePolitica = function () {
  RN.deudasUI._politicaOpen = !RN.deudasUI._politicaOpen;
  var el = document.getElementById('politica-deudas-resumen');
  var btn = document.getElementById('deuda-btn-politica');
  if (el) el.style.display = RN.deudasUI._politicaOpen ? '' : 'none';
  if (btn) btn.textContent = RN.deudasUI._politicaOpen ? 'Ocultar reglas' : 'Ver reglas de pago';
};

// ---------- INVENTARIO ----------
RN.inventarioUI = RN.inventarioUI || {};
RN.inventarioUI._filtro = 'stock';
RN.inventarioUI._q = '';

RN.inventarioUI.onFiltro = function () {
  var s = document.getElementById('inv-filtro-stock');
  var q = document.getElementById('inv-filtro-q');
  if (s) RN.inventarioUI._filtro = s.value || 'todos';
  if (q) RN.inventarioUI._q = (q.value || '').trim().toLowerCase();
  RN.render.inventario();
};

RN.inventarioUI.abrirAsignarRapido = function () {
  var productos = (RN.inventarioModel.productosAgrupados() || []).filter(function (p) {
    return (p.stockDisponible || 0) > 0;
  });
  if (!productos.length) {
    RN.notifyUI.toast('No hay productos con stock para asignar', 'warn');
    return;
  }
  if (productos.length === 1) {
    RN.inventario.asignar(productos[0].nombre);
    return;
  }
  var opts = productos.map(function (p) {
    return '<option value="' + RN.render.escAttr(p.nombre) + '">' + RN.render.esc(p.nombre) + ' (' + p.stockDisponible + ' ud.)</option>';
  }).join('');
  var html = '<div class="modal-header"><h3>Asignar / vender</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>'
    + '<div class="modal-body"><label>Producto</label><select id="inv-rapido-prod">' + opts + '</select></div>'
    + '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>'
    + '<button class="btn primary" onclick="var v=document.getElementById(\'inv-rapido-prod\').value;RN.uiComponents.cerrarModal();RN.inventario.asignar(v)">Continuar</button></div>';
  RN.uiComponents.modal(html);
};

RN.render.inventario = function () {
  var cont = document.getElementById('lista-inventario');
  if (!cont) return;

  var productos = RN.inventarioModel.productosAgrupados() || [];
  var valorStock = 0;
  var udTotal = 0;
  var agotados = 0;
  var gananciaPotencial = 0;

  productos.forEach(function (p) {
    udTotal += p.stockDisponible || 0;
    if ((p.stockDisponible || 0) <= 0) agotados += 1;
    p.lotes.forEach(function (l) {
      var disp = RN.inventarioModel.stockDisponibleLote(l.id);
      valorStock += disp * (l.costoUnitario || 0);
    });
    var costoVig = p.costoVigente || 0;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    gananciaPotencial += (p.stockDisponible || 0) * (precioSug - costoVig);
  });

  // Pendientes sin cobrar
  var pendientes = (RN.state.asignacionesInventario || []).filter(function (a) {
    return !a.vendida;
  });
  var zonePend = document.getElementById('inv-pendientes-zone');
  var boxPend = document.getElementById('inv-pendientes');
  if (zonePend && boxPend) {
    if (!pendientes.length) {
      zonePend.style.display = 'none';
      boxPend.innerHTML = '';
    } else {
      zonePend.style.display = '';
      boxPend.innerHTML = pendientes.map(function (a) {
        var lote = (RN.state.inventario || []).find(function (l) { return l.id === a.loteId; });
        var mat = lote ? lote.material : 'Material';
        var cli = (RN.state.clients || []).find(function (c) { return c.id === a.clienteId; });
        var nom = cli ? cli.nombre : 'Cliente eliminado';
        return '<div class="acc-row" style="padding:8px 0;border-bottom:1px solid var(--border)">'
          + '<span class="acc-label">' + RN.render.esc(String(a.cantidad)) + ' ud. · ' + RN.render.esc(mat) + ' → ' + RN.render.esc(nom) + '</span>'
          + '<span class="acc-value"><button type="button" class="btn sm primary" onclick="RN.inventario.asignar(\'' + RN.render.escAttr(mat) + '\')">Cobrar / gestionar</button></span>'
          + '</div>';
      }).join('') + '<p class="muted" style="font-size:12px;margin:8px 0 0">Material entregado sin registrar venta en caja.</p>';
    }
  }

  // Hero + KPIs
  var hero = document.getElementById('inv-estado');
  if (hero) {
    if (!productos.length) {
      hero.innerHTML = '<div class="acc-empty" style="padding:12px"><div class="icon">📦</div>No hay productos. '
        + '<button type="button" class="btn sm primary" style="margin-top:8px" onclick="RN.inventario.abrirNuevoLote()">+ Comprar</button></div>';
    } else {
      hero.innerHTML =
        '<div class="inv-hero">' +
          '<div class="muted" style="font-size:12px;font-weight:600">Valor en stock (al costo)</div>' +
          '<div class="inv-valor">' + RN.calc.formatCUP(valorStock) + '</div>' +
          '<div class="inv-sub">' + udTotal + ' ud. disponibles · ' + productos.length + ' producto' + (productos.length === 1 ? '' : 's')
            + (agotados ? ' · ' + agotados + ' agotado' + (agotados === 1 ? '' : 's') : '') + '</div>' +
          '<div class="muted" style="font-size:12px">Margen potencial al precio sugerido: <strong style="color:var(--green)">' + RN.calc.formatCUP(Math.max(0, gananciaPotencial)) + '</strong></div>' +
          '<div class="inv-hero-actions">' +
            '<button type="button" class="btn primary" onclick="RN.inventario.abrirNuevoLote()">+ Comprar</button>' +
            '<button type="button" class="btn" onclick="RN.inventarioUI.abrirAsignarRapido()">Asignar / vender</button>' +
          '</div>' +
        '</div>';
    }
  }

  var kpi = document.getElementById('kpi-inventario');
  if (kpi) {
    var kpis = [
      { label: 'Valor en stock', value: RN.calc.formatCUP(valorStock), cls: 'blue' },
      { label: 'Unidades', value: String(udTotal), cls: 'green' },
      { label: 'Agotados', value: String(agotados), cls: agotados ? 'amber' : 'green' },
      { label: 'Margen potencial', value: RN.calc.formatCUP(Math.max(0, gananciaPotencial)), cls: 'green' }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
    }).join('');
  }

  // Sync filter controls
  var filtro = RN.inventarioUI._filtro || 'stock';
  var q = RN.inventarioUI._q || '';
  var sel = document.getElementById('inv-filtro-stock');
  if (sel) sel.value = filtro;

  var filtrados = productos.filter(function (p) {
    var disp = p.stockDisponible || 0;
    if (filtro === 'stock' && disp <= 0) return false;
    if (filtro === 'agotado' && disp > 0) return false;
    if (q && (p.nombre || '').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });

  if (!productos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📦</div>No hay productos en inventario.</div>';
    return;
  }
  if (!filtrados.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📦</div>Ningún producto coincide con el filtro.</div>';
    return;
  }

  cont.innerHTML = filtrados.map(function (p) {
    var dotCls = p.stockDisponible > 0 ? 'ok' : 'due';
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    var pct = RN.inventarioModel.pctGanancia();
    var valorP = 0;
    p.lotes.forEach(function (l) {
      valorP += RN.inventarioModel.stockDisponibleLote(l.id) * (l.costoUnitario || 0);
    });
    var claveId = 'acc-invprod-' + p.key.replace(/[^a-z0-9]/g, '-');

    var lotesHtml = p.lotes.map(function (l, idx) {
      var dispLote = RN.inventarioModel.stockDisponibleLote(l.id);
      var firstWithStock = p.lotes.findIndex(function (x) {
        return RN.inventarioModel.stockDisponibleLote(x.id) > 0;
      });
      var esVigente = dispLote > 0 && firstWithStock === idx;
      var badgeVigente = esVigente ? ' <span class="badge ok">vigente FIFO</span>' : '';
      var badgeAgotado = dispLote === 0 ? ' <span class="badge due">agotado</span>' : '';
      var fechaStr = l.fecha ? new Date(l.fecha).toLocaleDateString('es-CU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      var asigs = (RN.state.asignacionesInventario || []).filter(function (a) { return a.loteId === l.id; });
      var asigsHtml = asigs.length ? asigs.map(function (a) {
        var cli = (RN.state.clients || []).find(function (c) { return c.id === a.clienteId; });
        var cliNom = cli ? RN.render.esc(cli.nombre) : '<span class="muted">— cliente eliminado —</span>';
        var estado = a.vendida ? '<span class="badge ok">vendida</span>' : '<span class="badge warn">sin cobrar</span>';
        return '<div class="acc-row"><span class="acc-label">' + a.cantidad + ' ud. → ' + cliNom + '</span><span class="acc-value">' + estado + ' ' + RN.calc.formatCUP(a.precioTotal || 0) + '</span></div>';
      }).join('') : '<div class="acc-row"><span class="acc-value muted">Sin asignaciones</span></div>';
      var pagoHtml = '';
      if (l.monedaPago && RN.moneda && RN.moneda.desglosePagoHTML) {
        pagoHtml = '<div class="acc-row"><span class="acc-label">Pago (' + l.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({
          moneda: l.monedaPago,
          montoUSD: l.montoPagoUSD,
          montoCUP: l.montoPagoCUP,
          montoCUPDesdeUSD: l.montoPagoCUPDesdeUSD,
          totalRecibidoCUP: l.totalPagoCUP,
          tasaUsd: l.tasaUsdCompra
        }) + '</span></div>';
      }
      var hasAsig = asigs.length > 0;
      return '<div style="background:var(--bg-alt,var(--surface-2));padding:10px 12px;border-radius:8px;margin-bottom:8px">'
        + '<div class="acc-row"><span class="acc-label">Lote ' + (idx + 1) + ' · ' + fechaStr + badgeVigente + badgeAgotado + '</span><span class="acc-value">' + l.cantidad + ' compradas · ' + dispLote + ' disp.</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo unitario</span><span class="acc-value">' + RN.calc.formatCUP(l.costoUnitario || 0) + '</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo total</span><span class="acc-value">' + RN.calc.formatCUP(l.costoTotal || (l.cantidad * (l.costoUnitario || 0))) + '</span></div>'
        + (l.notas ? '<div class="acc-row"><span class="acc-label">Notas</span><span class="acc-value">' + RN.render.esc(l.notas) + '</span></div>' : '')
        + (l.gastoCompraId ? '<div class="acc-row"><span class="acc-label">Gasto ligado</span><span class="acc-value"><span class="badge ok">En gastos</span></span></div>' : '')
        + pagoHtml
        + '<div class="divider" style="margin:6px 0"></div>'
        + asigsHtml
        + '<div class="acc-actions" style="margin-top:8px">'
        +   (hasAsig
              ? '<span class="muted" style="font-size:12px">No se puede eliminar: tiene asignaciones</span>'
              : '<button class="btn sm danger" onclick="RN.inventario.eliminarLote(\'' + RN.render.escAttr(l.id) + '\')">🗑 Eliminar lote</button>')
        + '</div>'
        + '</div>';
    }).join('');

    var payBtns = '';
    if (p.stockDisponible > 0) {
      payBtns = '<div class="acc-summary-inv-actions">'
        + '<button type="button" class="btn sm primary" onclick="event.stopPropagation();RN.inventario.asignar(\'' + RN.render.escAttr(p.nombre) + '\')">Asignar</button>'
        + '</div>';
    }

    return '<div class="acc-card" id="' + claveId + '">'
      + '<div class="acc-summary" onclick="RN.render.toggleCard(\'' + claveId + '\')">'
      +   '<span class="acc-dot ' + dotCls + '"></span>'
      +   '<div class="acc-summary-main">'
      +     '<div class="acc-summary-name">' + RN.render.esc(p.nombre) + (p.stockDisponible <= 0 ? ' <span class="badge due">Agotado</span>' : '') + '</div>'
      +     '<div class="acc-summary-sub">' + p.lotes.length + ' lote' + (p.lotes.length > 1 ? 's' : '')
      +       ' · costo FIFO ' + RN.calc.formatCUP(costoVig) + '/ud · venta sug. ' + RN.calc.formatCUP(precioSug)
      +       ' · valor ' + RN.calc.formatCUP(valorP) + '</div>'
      +   '</div>'
      +   '<div class="acc-summary-total">'
      +     '<div class="amt">' + p.stockDisponible + '</div>'
      +     '<div class="lbl">Disponible</div>'
      +   '</div>'
      +   payBtns
      +   '<span class="acc-chevron">▼</span>'
      + '</div>'
      + '<div class="acc-details">'
      +   '<div class="acc-row"><span class="acc-label">Costo vigente (FIFO)</span><span class="acc-value">' + RN.calc.formatCUP(costoVig) + '/ud</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Precio sugerido (' + pct + '%)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(precioSug) + '/ud</strong></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Valor en stock</span><span class="acc-value">' + RN.calc.formatCUP(valorP) + '</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Ganancia potencial</span><span class="acc-value" style="color:var(--green)">' + RN.calc.formatCUP(p.stockDisponible * (precioSug - costoVig)) + '</span></div>'
      +   '<div class="divider" style="margin:8px 0"></div>'
      +   '<div class="acc-row" style="font-weight:600"><span class="acc-label">Lotes (' + p.lotes.length + ') — FIFO</span></div>'
      +   lotesHtml
      +   '<div class="acc-actions">'
      +     (p.stockDisponible > 0 ? '<button class="btn sm primary" onclick="RN.inventario.asignar(\'' + RN.render.escAttr(p.nombre) + '\')">Asignar / vender</button>' : '')
      +     '<button class="btn sm" onclick="RN.inventario.abrirNuevoLote(\'' + RN.render.escAttr(p.nombre) + '\')">Comprar más</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
};

// ---------- GASTOS ----------
RN.gastosUI = RN.gastosUI || {};
RN.gastosUI._mes = null;
RN.gastosUI._tipo = 'operativo';
RN.gastosUI._cat = '';
RN.gastosUI._q = '';

RN.gastosUI.onFiltro = function () {
  var mesEl = document.getElementById('gas-filtro-mes');
  var tipoEl = document.getElementById('gas-filtro-tipo');
  var catEl = document.getElementById('gas-filtro-cat');
  var qEl = document.getElementById('gas-filtro-q');
  if (mesEl) RN.gastosUI._mes = mesEl.value || null;
  if (tipoEl) RN.gastosUI._tipo = tipoEl.value || 'operativo';
  if (catEl) RN.gastosUI._cat = catEl.value || '';
  if (qEl) RN.gastosUI._q = (qEl.value || '').trim().toLowerCase();
  RN.render.gastos();
};

RN.gastosUI._mesesDisponibles = function () {
  var set = {};
  (RN.state.gastos || []).forEach(function (g) {
    var m = (g.mes || (g.fecha || '').slice(0, 7) || '').slice(0, 7);
    if (m) set[m] = true;
  });
  var actual = RN.calc.mesActualStr();
  set[actual] = true;
  return Object.keys(set).sort().reverse();
};

RN.render.gastos = function () {
  var mes = RN.gastosUI._mes || RN.calc.mesActualStr();
  RN.gastosUI._mes = mes;
  var tipo = RN.gastosUI._tipo || 'operativo';
  var cat = RN.gastosUI._cat || '';
  var q = RN.gastosUI._q || '';

  var operMes = RN.calc.gastosOperativosMes ? RN.calc.gastosOperativosMes(mes) : RN.calc.gastosMes(mes);
  var operAnt = RN.calc.gastosOperativosMesAnterior ? RN.calc.gastosOperativosMesAnterior(mes) : 0;
  var saldoProv = RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes(mes) : 0;
  var pagadoProv = RN.calc.totalPagadoProveedorMes ? RN.calc.totalPagadoProveedorMes(mes) : 0;

  var deltaTxt = '';
  if (operAnt > 0.01) {
    var dPct = ((operMes - operAnt) / operAnt) * 100;
    deltaTxt = (dPct >= 0 ? '+' : '') + dPct.toFixed(0) + '% vs mes anterior';
  } else if (operMes > 0) {
    deltaTxt = 'Sin mes anterior comparable';
  }

  var byCat = {};
  (RN.state.gastos || []).forEach(function (g) {
    if ((g.mes || '').slice(0, 7) !== mes.slice(0, 7)) return;
    if (RN.calc.esGastoOperativo && !RN.calc.esGastoOperativo(g)) return;
    if (g.esPagoProveedor) return;
    var c = g.categoria || 'General';
    byCat[c] = (byCat[c] || 0) + (g.monto || 0);
  });
  var topCat = '';
  var topCatMonto = 0;
  Object.keys(byCat).forEach(function (c) {
    if (byCat[c] > topCatMonto) { topCatMonto = byCat[c]; topCat = c; }
  });

  var hero = document.getElementById('gas-estado');
  if (hero) {
    hero.innerHTML =
      '<div class="gas-hero">' +
        '<div class="muted" style="font-size:12px;font-weight:600">Gastos operativos · ' + RN.render.esc(mes) + '</div>' +
        '<div class="gas-total">' + RN.calc.formatCUP(operMes) + '</div>' +
        '<div class="gas-sub">' + RN.render.esc(deltaTxt || 'Costos del negocio (sin cuadres ni devoluciones de deuda)') + '</div>' +
        (topCat ? '<div class="muted" style="font-size:12px">Mayor categoría: <strong>' + RN.render.esc(topCat) + '</strong> · ' + RN.calc.formatCUP(topCatMonto) + '</div>' : '') +
        '<div class="gas-hero-actions">' +
          '<button type="button" class="btn primary" onclick="RN.gastos.abrirNuevo()">+ Nuevo gasto</button>' +
          '<button type="button" class="btn" onclick="RN.paqueteProveedor.abrir()">📡 Pagar proveedor' +
            (saldoProv > 0.01 ? ' · ' + RN.calc.formatCUP(saldoProv) : '') + '</button>' +
        '</div>' +
      '</div>';
  }

  var kpi = document.getElementById('kpi-gastos');
  if (kpi) {
    var kpis = [
      { label: 'Operativos del mes', value: RN.calc.formatCUP(operMes), cls: 'amber' },
      { label: 'Proveedor pagado', value: RN.calc.formatCUP(pagadoProv), cls: 'blue' },
      { label: 'Saldo proveedor', value: RN.calc.formatCUP(saldoProv), cls: saldoProv > 0.01 ? 'red' : 'green' },
      { label: 'Mayor categoría', value: topCat ? topCat : '—', cls: 'blue' }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      var fs = k.label === 'Mayor categoría' ? ' style="font-size:14px"' : '';
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value"' + fs + '>' + RN.render.esc(String(k.value)) + '</div></div>';
    }).join('');
  }

  var mesSel = document.getElementById('gas-filtro-mes');
  if (mesSel) {
    var meses = RN.gastosUI._mesesDisponibles();
    mesSel.innerHTML = meses.map(function (m) {
      return '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + m + '</option>';
    }).join('');
  }
  var catSel = document.getElementById('gas-filtro-cat');
  if (catSel) {
    var cats = (RN.gastos.CATEGORIAS || []).slice();
    catSel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(function (c) {
      return '<option value="' + RN.render.escAttr(c) + '"' + (c === cat ? ' selected' : '') + '>' + RN.render.esc(c) + '</option>';
    }).join('');
  }
  var tipoSel = document.getElementById('gas-filtro-tipo');
  if (tipoSel) tipoSel.value = tipo;

  var lista = (RN.state.gastos || []).filter(function (g) {
    var gm = (g.mes || (g.fecha || '').slice(0, 7) || '').slice(0, 7);
    if (gm !== mes.slice(0, 7)) return false;
    var tg = RN.calc.tipoGastoUI ? RN.calc.tipoGastoUI(g) : 'operativo';
    if (tipo === 'operativo') {
      if (RN.calc.esGastoOperativo && !RN.calc.esGastoOperativo(g)) return false;
    } else if (tipo === 'proveedor') {
      if (tg !== 'proveedor') return false;
    } else if (tipo === 'cuadre') {
      if (tg !== 'cuadre') return false;
    } else if (tipo === 'otros') {
      if (tg === 'operativo' || tg === 'proveedor') return false;
    }
    if (cat && (g.categoria || 'General') !== cat) return false;
    if (q) {
      var blob = ((g.concepto || '') + ' ' + (g.categoria || '')).toLowerCase();
      if (blob.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) {
    return (b.fecha || '').localeCompare(a.fecha || '');
  });

  var cont = document.getElementById('lista-gastos');
  if (!cont) return;
  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay movimientos con estos filtros.</div>';
    return;
  }

  cont.innerHTML = lista.map(function (g) {
    var tg = RN.calc.tipoGastoUI(g);
    var esCuadre = tg === 'cuadre';
    var esSobrante = esCuadre && g.tipoCuadre === 'sobrante';
    var dotCls = tg === 'proveedor' ? 'blue' : (tg === 'cuadre' ? (esSobrante ? 'ok' : 'warn') : (tg === 'devolucion' || tg === 'aplicacion' ? 'warn' : 'due'));
    var tipoLabel = {
      operativo: 'Operativo',
      proveedor: 'Proveedor',
      cuadre: esSobrante ? 'Sobrante' : 'Faltante',
      devolucion: 'Devolución deuda',
      aplicacion: 'Aplicación préstamo',
      retiro: 'Retiro legacy'
    }[tg] || 'Gasto';

    var montoAbs = esCuadre ? Math.abs(g.monto || 0) : (g.monto || 0);
    var montoColor = esSobrante ? 'style="color:var(--green,#16a34a)"' : '';
    var cuadreMoneda = (esCuadre && g.cuadreMoneda === 'USD') ? 'USD' : 'CUP';
    var montoTxt;
    if (esCuadre && cuadreMoneda === 'USD' && RN.moneda && RN.moneda.formatUSD) {
      montoTxt = RN.moneda.formatUSD(Math.abs(g.montoCuadreUSD || 0)) + ' <span class="muted" style="font-size:11px">(' + RN.calc.formatCUP(montoAbs) + ')</span>';
    } else if (g.moneda === 'USD' && g.montoPagadoUSD > 0) {
      montoTxt = RN.calc.formatCUP(montoAbs) + ' <span class="muted" style="font-size:11px">($' + (+g.montoPagadoUSD).toFixed(2) + ')</span>';
    } else {
      montoTxt = RN.calc.formatCUP(montoAbs);
    }

    var badgeTipo = '<span class="badge ' + (tg === 'proveedor' ? 'ok' : (tg === 'cuadre' ? (esSobrante ? 'ok' : 'due') : 'warn')) + '" style="margin-left:4px">' + tipoLabel + '</span>';
    var catBadge = '<span class="pill">' + RN.render.esc(g.categoria || 'General') + '</span>';
    var canEdit = (tg === 'operativo' || tg === 'proveedor') && !esCuadre;

    return '<div class="acc-card" id="acc-gas-' + g.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-gas-' + g.id + '\')">' +
        '<span class="acc-dot ' + dotCls + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(g.concepto) + '</div>' +
          '<div class="acc-summary-sub">' + RN.render.esc((g.fecha || '').slice(0, 10)) + ' · ' + RN.render.esc(g.categoria || 'General') + ' · ' + tipoLabel + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt" ' + montoColor + '>' + (esSobrante ? '+' : '') + montoTxt + '</div>' +
          '<div class="lbl">' + tipoLabel + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc((g.fecha || '').slice(0, 10)) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Tipo</span><span class="acc-value">' + badgeTipo + ' ' + catBadge + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Monto (CUP)</span><span class="acc-value" ' + montoColor + '>' + (esSobrante ? '+' : '') + RN.calc.formatCUP(montoAbs) + '</span></div>' +
        (g.moneda && g.moneda !== 'CUP' ? '<div class="acc-row"><span class="acc-label">Moneda</span><span class="acc-value">' + RN.render.esc(g.moneda) + (g.tasaUsd ? ' · tasa ' + g.tasaUsd : '') + '</span></div>' : '') +
        '<div class="acc-actions">' +
          (canEdit ? '<button class="btn sm" onclick="RN.gastos.abrirEditar(\'' + g.id + '\')">Editar</button>' : '') +
          '<button class="btn sm danger" onclick="RN.gastos.eliminar(\'' + g.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
