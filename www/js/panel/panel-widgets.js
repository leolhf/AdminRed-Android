/**
 * panel/panel-widgets.js — Widgets enriquecidos del Panel del negocio (v5.16.0).
 *
 * Añade al Panel, sin cambiar el esquema de datos (sigue 8), los siguientes
 * bloques que reutilizan funciones de negocio ya existentes:
 *
 *   1. Tendencia de 6 meses (ingresos vs gastos) — mini-gráfico de barras.
 *   2. Comparativa mes actual vs mes anterior — helper `deltaHTML()` que
 *      render.js usa para anotar cada KPI con ▲/▼ %.
 *   4. "Requiere tu atención" — alertas accionables (morosos, paquete sin
 *      pagar, capacidad de red al tope, tasa USD vencida, inversión pendiente).
 *   5. Próximos cortes — agenda de cortes con clientes y monto esperado.
 *   8. Ganancia por mega vendido — rentabilidad por mega.
 *   9. Aporte de la sobreventa — megas sin costo = ganancia directa.
 *  11. Caja proyectada — fondo actual + por cobrar − por pagar.
 *  12. Caja — Dos bolsillos (v5.19.0) — cada mes la ganancia del mes se reparte:
 *      un % (default 70) al bolsillo RESERVA (intocable) y el resto al bolsillo
 *      LIBRE; los retiros salen solo del libre. Incluye depósitos/retiros.
 *
 * Depende de: calculations.js, ciclos.js, moneda.js, models/investment.js,
 *             ui/render.js, ui/tasa-aviso.js, reportes/ganancia-cortes.js
 *             (todos cargan antes). Debe cargarse DESPUÉS de ganancia-cortes.js.
 */
RN.panelWidgets = RN.panelWidgets || {};

/* ============================================================
 * 2. Comparativa mes actual vs mes anterior (delta ▲/▼)
 * ============================================================ */

/**
 * Devuelve el HTML de un badge de variación respecto al mes anterior.
 * @param {number} actual   — valor del mes actual
 * @param {number} anterior — valor del mes anterior (null/undefined → '')
 * @param {object} [opts]   — { invertir: true } si bajar es bueno (ej. gastos)
 * @returns {string} HTML del badge (o '' si no hay comparación)
 */
RN.panelWidgets.deltaHTML = function (actual, anterior, opts) {
  opts = opts || {};
  if (anterior === null || anterior === undefined) return '';
  var a = +actual || 0;
  var b = +anterior || 0;
  var diff = a - b;
  if (Math.abs(diff) < 0.01) {
    return '<span class="delta flat">= igual que el mes anterior</span>';
  }
  var pct = b !== 0 ? Math.round(diff / Math.abs(b) * 100) : null;
  var sube = diff > 0;
  var bueno = opts.invertir ? !sube : sube;
  var cls = bueno ? 'up' : 'down';
  var arrow = sube ? '\u25b2' : '\u25bc';
  // Si la base es casi nula el % se dispara (ej. 102600%): en ese caso es más
  // útil mostrar la diferencia absoluta en CUP que un porcentaje absurdo.
  var txt;
  if (pct !== null && Math.abs(pct) <= 999) {
    txt = Math.abs(pct) + '%';
  } else {
    txt = RN.calc.formatCUP(Math.abs(diff));
  }
  return '<span class="delta ' + cls + '">' + arrow + ' ' + txt + ' vs mes ant.</span>';
};

/* ============================================================
 * 1. Tendencia de 6 meses (ingresos vs gastos)
 * ============================================================ */

RN.panelWidgets.renderTendencia = function () {
  var cont = document.getElementById('panel-tendencia');
  if (!cont) return;
  var data = RN.calc.tendenciaMensual(6);
  if (!data.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">\ud83d\udcc8</div>Sin datos de meses anteriores.</div>';
    return;
  }
  var max = 0;
  data.forEach(function (d) { max = Math.max(max, d.ingresos, d.gastos); });
  if (max <= 0) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">\ud83d\udcc8</div>A\u00fan no hay ingresos ni gastos registrados.</div>';
    return;
  }
  var mesActual = RN.calc.mesActualStr();
  var barras = data.map(function (d) {
    var hIng = Math.round(d.ingresos / max * 100);
    var hGas = Math.round(d.gastos / max * 100);
    var esActual = d.mes === mesActual;
    var etiqueta = RN.calc.mesTexto(d.mes).split(' ')[0].slice(0, 3);
    return '<div class="tend-col' + (esActual ? ' actual' : '') + '">' +
      '<div class="tend-bars">' +
        '<div class="tend-bar ing" style="height:' + Math.max(2, hIng) + '%" title="Ingresos ' + RN.calc.formatCUP(d.ingresos) + '"></div>' +
        '<div class="tend-bar gas" style="height:' + Math.max(2, hGas) + '%" title="Gastos ' + RN.calc.formatCUP(d.gastos) + '"></div>' +
      '</div>' +
      '<div class="tend-lbl">' + RN.render.esc(etiqueta) + '</div>' +
    '</div>';
  }).join('');
  var totalIng = data.reduce(function (s, d) { return s + d.ingresos; }, 0);
  var totalGas = data.reduce(function (s, d) { return s + d.gastos; }, 0);
  cont.innerHTML =
    '<div class="tend-legend">' +
      '<span class="tend-key"><i class="dot ing"></i> Ingresos</span>' +
      '<span class="tend-key"><i class="dot gas"></i> Gastos</span>' +
    '</div>' +
    '<div class="tend-chart">' + barras + '</div>' +
    '<div class="tend-foot muted">' +
      '6 meses \u00b7 Ingresos ' + RN.calc.formatCUP(totalIng) +
      ' \u00b7 Gastos ' + RN.calc.formatCUP(totalGas) +
      ' \u00b7 Balance ' + RN.calc.formatCUP(totalIng - totalGas) +
    '</div>';
};

/* ============================================================
 * 4. "Requiere tu atención" (alertas accionables)
 * ============================================================ */

RN.panelWidgets._alertas = function () {
  var mes = RN.calc.mesActualStr();
  var out = [];
  var activos = RN.calc.clientesActivos();

  // Morosos
  var morosos = activos.filter(function (c) { return RN.calc.getMora(c) > 0; });
  if (morosos.length) {
    out.push({
      nivel: 'red', icono: '\ud83d\udd34',
      texto: morosos.length + ' cliente' + (morosos.length > 1 ? 's' : '') + ' con mora pendiente',
      accion: 'RN.mora.abrir()', accionTxt: 'Ver morosos'
    });
  }

  // Paquete del proveedor sin pagar este mes
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  if (costoPaquete > 0 && !RN.calc.pagoProveedorMes(mes)) {
    out.push({
      nivel: 'amber', icono: '\ud83d\udce1',
      texto: 'Paquete del proveedor sin pagar este mes (' + RN.calc.formatCUP(costoPaquete) + ')',
      accion: 'RN.paqueteProveedor.abrir()', accionTxt: 'Pagar'
    });
  }

  // Capacidad de red
  var cap = RN.calc.estadoCapacidad();
  if (cap.tope > 0 && cap.excedido) {
    out.push({
      nivel: 'red', icono: '\ud83d\udcf6',
      texto: 'Capacidad de red EXCEDIDA: ' + cap.vendidos + 'M vendidos / ' + cap.tope + 'M tope',
      accion: 'RN.paqueteProveedor.abrir()', accionTxt: 'Ampliar'
    });
  } else if (cap.tope > 0 && cap.pct >= 80) {
    out.push({
      nivel: 'amber', icono: '\ud83d\udcf6',
      texto: 'Capacidad de red al ' + cap.pct + '% (' + cap.vendidos + 'M / ' + cap.tope + 'M)',
      accion: 'RN.paqueteProveedor.abrir()', accionTxt: 'Revisar'
    });
  }

  // Tasa USD vencida
  if (RN.tasaAviso && RN.tasaAviso.estadoTasa) {
    var est = RN.tasaAviso.estadoTasa();
    if (est === 'urgente' || est === 'aviso') {
      out.push({
        nivel: est === 'urgente' ? 'red' : 'amber', icono: '\ud83d\udcb1',
        texto: 'Tasa USD ' + (est === 'urgente' ? 'desactualizada' : 'por actualizar') +
               ' (' + RN.tasaAviso.tiempoTranscurrido() + ')',
        accion: 'RN.tasaAviso.abrirModal()', accionTxt: 'Actualizar'
      });
    }
  }

  // Inversión sin recuperar
  var totalInv = RN.investment.totalInvertido();
  if (totalInv > 0) {
    var pct = RN.investment.porcentajeRecuperacion();
    if (pct < 100) {
      out.push({
        nivel: 'blue', icono: '\ud83d\udcb0',
        texto: 'Inversi\u00f3n recuperada al ' + pct + '% \u2014 falta ' +
               RN.calc.formatCUP(Math.max(0, totalInv - RN.investment.totalRecuperado())),
        accion: 'RN.inversion.abrirNueva()', accionTxt: 'Ver'
      });
    }
  }

  // v5.19.0: Reserva de caja no cubierta (el fondo está por debajo de la reserva)
  if (RN.calc.bolsillos) {
    var res = RN.calc.bolsillos(mes);
    if (res.reserva > 0 && !res.cubierta) {
      out.push({
        nivel: 'amber', icono: '\ud83d\udd12',
        texto: 'Caja por debajo de la reserva (' + res.pct + '%): faltan ' +
               RN.calc.formatCUP(res.reserva - res.fondo) + ' para cubrirla',
        accion: 'RN.caja.extraer()', accionTxt: 'Ver caja'
      });
    }
  }

  return out;
};

RN.panelWidgets.renderAtencion = function () {
  var cont = document.getElementById('panel-atencion');
  if (!cont) return;
  var alertas = RN.panelWidgets._alertas();
  if (!alertas.length) {
    cont.innerHTML = '<div class="atencion-ok">\u2705 Todo en orden \u2014 no hay nada que requiera tu atenci\u00f3n.</div>';
    return;
  }
  cont.innerHTML = alertas.map(function (a) {
    return '<div class="atencion-item ' + a.nivel + '">' +
      '<span class="atencion-ico">' + a.icono + '</span>' +
      '<span class="atencion-txt">' + RN.render.esc(a.texto) + '</span>' +
      '<button class="btn sm" onclick="' + a.accion + '">' + RN.render.esc(a.accionTxt) + '</button>' +
    '</div>';
  }).join('');
};

/* ============================================================
 * 5. Próximos cortes (agenda)
 * ============================================================ */

RN.panelWidgets.renderCortes = function () {
  var cont = document.getElementById('panel-cortes');
  if (!cont) return;
  var mes = RN.calc.mesActualStr();
  var cortes = RN.ciclos.cortesOficiales();
  var cv = RN.ciclos.corteVigente();
  var cvDia = cv ? cv.diaPago : null;
  var hoy = RN.ciclos.diaHoyNum();

  var filas = cortes.map(function (dp) {
    var clientes = RN.ciclos.clientesPorCorte(dp, mes).filter(function (c) {
      return RN.calc.mesInicioCliente(c) <= mes;
    });
    var esperado = clientes.reduce(function (s, c) { return s + RN.calc.getPrecioNeto(c, mes); }, 0);
    var pagaron = clientes.filter(function (c) {
      return RN.state.history.some(function (h) {
        return h.clienteId === c.id && h.tipo === 'servicio' && h.mes === mes;
      });
    }).length;
    var esVigente = dp === cvDia;
    var pasado = dp < hoy;
    var estado, cls;
    if (esVigente) { estado = 'Vigente'; cls = 'vigente'; }
    else if (pasado) { estado = 'Pasado'; cls = 'pasado'; }
    else { estado = 'En ' + (dp - hoy) + ' d\u00eda' + ((dp - hoy) !== 1 ? 's' : ''); cls = 'proximo'; }
    return '<div class="corte-row ' + cls + '">' +
      '<div class="corte-dia"><strong>' + dp + '</strong><span class="muted">d\u00eda</span></div>' +
      '<div class="corte-info">' +
        '<div>' + clientes.length + ' cliente' + (clientes.length !== 1 ? 's' : '') +
          ' \u00b7 ' + pagaron + ' pagaron</div>' +
        '<div class="muted" style="font-size:11px">Esperado ' + RN.calc.formatCUP(esperado) + '</div>' +
      '</div>' +
      '<div class="corte-estado ' + cls + '">' + estado + '</div>' +
    '</div>';
  }).join('');

  cont.innerHTML = filas || '<div class="acc-empty"><div class="icon">\ud83d\udcc5</div>Sin cortes definidos.</div>';
};

/* ============================================================
 * 8 y 9. Rentabilidad: ganancia por mega + aporte de la sobreventa
 * ============================================================ */

RN.panelWidgets.renderRentabilidad = function () {
  var cont = document.getElementById('panel-rentabilidad');
  if (!cont) return;
  var mes = RN.calc.mesActualStr();
  var cfg = RN.state.config;
  var precioMega = +cfg.proveedorPrecioMega || 0;
  var megasVendidos = RN.calc.megasVendidos();
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var ingresos = RN.calc.ingresosMes(mes);
  var ganancia = +(ingresos - costoPaquete).toFixed(2);

  // 8. Ganancia por mega vendido = ganancia del mes / megas vendidos.
  var gananciaPorMega = megasVendidos > 0 ? +(ganancia / megasVendidos).toFixed(2) : 0;

  // 9. Aporte de la sobreventa: megas por encima del paquete (costo 0).
  var reparto = RN.gananciaCortes._repartoCosto(
    RN.gananciaCortes._cortesProyectados(mes).map(function (g) {
      var m = 0;
      g.clientes.forEach(function (c) { m += RN.calc.getMegasCliente(c); });
      return { diaPago: g.diaPago, megas: m };
    })
  );
  var sobreventaMegas = reparto.megasSobreventa;
  // Valor de la sobreventa = megas sin costo × precio del mega (lo que te
  // ahorras al no tener que comprarlos). Es ganancia directa.
  var aporteSobreventa = +(sobreventaMegas * precioMega).toFixed(2);

  var html = '';
  html += '<div class="kpi-grid" style="margin-bottom:0">';
  html += '<div class="kpi ' + (gananciaPorMega >= 0 ? 'green' : 'red') + '">' +
    '<div class="label">Ganancia por mega vendido</div>' +
    '<div class="value" style="font-size:18px">' + RN.calc.formatCUP(gananciaPorMega) + '</div>' +
    '<div class="sub">Ganancia del mes \u00f7 ' + megasVendidos + 'M vendidos</div></div>';
  html += '<div class="kpi ' + (sobreventaMegas > 0 ? 'green' : 'muted') + '">' +
    '<div class="label">Aporte de la sobreventa</div>' +
    '<div class="value" style="font-size:18px">' + RN.calc.formatCUP(aporteSobreventa) + '</div>' +
    '<div class="sub">' + (sobreventaMegas > 0
      ? sobreventaMegas + 'M sin costo \u00d7 ' + precioMega + ' CUP/M'
      : 'Sin sobreventa este mes') + '</div></div>';
  html += '</div>';
  if (precioMega <= 0) {
    html += '<p class="muted" style="margin-top:10px;font-size:12px">\u26a0\ufe0f Configura el precio del mega del proveedor para ver la rentabilidad real.</p>';
  } else {
    html += '<p class="muted" style="margin-top:10px;font-size:12px">' +
      'La sobreventa son megas vendidos por encima del paquete contratado: no tienen costo y son <strong>ganancia directa</strong>.' +
      '</p>';
  }
  cont.innerHTML = html;
};

/* ============================================================
 * 11. Caja proyectada
 * ============================================================ */

RN.panelWidgets.renderCajaProyectada = function () {
  var cont = document.getElementById('panel-caja');
  if (!cont) return;
  var mes = RN.calc.mesActualStr();
  var cajaActual = RN.calc.fondoCaja();
  var esperado = RN.calc.ingresoEsperadoMes(mes);
  var cobradoServ = RN.calc.ingresosServicioMes(mes);
  var porCobrar = Math.max(0, +(esperado - cobradoServ).toFixed(2));
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var porPagar = (costoPaquete > 0 && !RN.calc.pagoProveedorMes(mes)) ? costoPaquete : 0;
  var proyectada = +(cajaActual + porCobrar - porPagar).toFixed(2);

  var html = '';
  html += '<div class="caja-proy">';
  html += '<div class="caja-linea"><span class="muted">Fondo de caja actual</span><strong>' + RN.calc.formatCUP(cajaActual) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">+ Por cobrar (servicio pendiente)</span><strong style="color:var(--success)">' + RN.calc.formatCUP(porCobrar) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">\u2212 Por pagar (paquete proveedor)</span><strong style="color:var(--danger)">' + RN.calc.formatCUP(porPagar) + '</strong></div>';
  html += '<div class="caja-linea total"><span>Proyecci\u00f3n al cerrar el mes</span><strong style="color:' + (proyectada >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(proyectada) + '</strong></div>';
  html += '</div>';
  html += '<p class="muted" style="margin-top:10px;font-size:12px">' +
    'Estimaci\u00f3n: fondo actual + lo que falta por cobrar de servicio este mes \u2212 el paquete del proveedor si a\u00fan no se ha pagado.' +
    '</p>';
  cont.innerHTML = html;
};

/* ============================================================
 * 12. Caja — Dos bolsillos (v5.19.0)
 * Modelo "dos bolsillos": cada mes la ganancia del mes (ingresos − gastos, SIN
 * retiros) se reparte: un % (default 70) va al bolsillo RESERVA (intocable) y
 * el resto al bolsillo LIBRE. Los retiros se descuentan solo del libre.
 * ============================================================ */
RN.panelWidgets.renderReserva = function () {
  var cont = document.getElementById('panel-reserva');
  if (!cont) return;
  var b = RN.calc.bolsillos();
  var colorRes = b.cubierta ? 'var(--success)' : 'var(--danger)';

  // Barras proporcionales (reserva vs libre) sobre el fondo total.
  var total = Math.max(0, b.fondo);
  var pctRes = total > 0 ? Math.max(0, Math.min(100, b.reserva / total * 100)) : 0;
  var pctLib = total > 0 ? Math.max(0, Math.min(100, b.libre / total * 100)) : 0;

  var html = '';
  html += '<div class="caja-proy">';
  html += '<div class="caja-linea"><span class="muted">🔒 Reserva (intocable, ' + b.pct + '%)</span><strong style="color:' + colorRes + '">' + RN.calc.formatCUP(b.reserva) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">💸 Libre para ti (' + (100 - b.pct) + '%)</span><strong style="color:' + (b.libre >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(b.libre) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">Fondo de caja total</span><strong>' + RN.calc.formatCUP(b.fondo) + '</strong></div>';
  // v5.30.0: saldos FÍSICOS por moneda que hay ahora en la gaveta (el mixto ya
  // separa su parte en dólares de su parte en pesos).
  html += '<div class="caja-linea"><span class="muted">\ud83d\udcb5 USD físico en la gaveta</span><strong>$' + RN.calc.usdEnCaja().toFixed(2) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">\ud83e\ude99 CUP físico en la gaveta</span><strong>' + RN.calc.formatCUP(RN.calc.cupEnCaja()) + '</strong></div>';
  html += '<div class="caja-linea total"><span>Puedes retirar (del bolsillo libre)</span><strong style="color:' + (b.retirable > 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(b.retirable) + '</strong></div>';
  html += '</div>';

  // Barras visuales de los dos bolsillos.
  html += '<div style="margin-top:12px">';
  html += '<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--border)">' +
    '<div style="width:' + pctRes + '%;background:var(--success)" title="Reserva"></div>' +
    '<div style="width:' + pctLib + '%;background:var(--primary,#2563eb)" title="Libre"></div>' +
    '</div>';
  html += '<div class="flex" style="justify-content:space-between;font-size:11px;margin-top:4px">' +
    '<span class="muted">🔒 Reserva ' + Math.round(pctRes) + '%</span>' +
    '<span class="muted">💸 Libre ' + Math.round(pctLib) + '%</span>' +
    '</div>';
  html += '</div>';

  if (b.reserva > 0 && !b.cubierta) {
    html += '<p class="muted" style="margin-top:10px;font-size:12px;color:var(--danger)">⚠️ El fondo está por debajo de la reserva. Te faltan ' +
      RN.calc.formatCUP(b.reserva - b.fondo) + ' para cubrirla.</p>';
  } else {
    html += '<p class="muted" style="margin-top:10px;font-size:12px">' +
      'Cada mes, de la ganancia del mes se reserva el ' + b.pct + '% (🔒 intocable) y el ' + (100 - b.pct) +
      '% queda libre para ti (💸). Los retiros salen solo del bolsillo libre. Ajusta el % en Ajustes.</p>';
  }

  html += '<div class="flex wrap" style="gap:8px;margin-top:12px">' +
    '<button class="btn sm primary" onclick="RN.caja.depositar()">\ud83d\udcb0 Depositar</button>' +
    '<button class="btn sm" onclick="RN.caja.extraer()">\ud83d\udcb5 Retirar</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.depositar(\'USD\')">\ud83d\udcb5 Depositar USD</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.extraer(\'USD\')">\ud83d\udcb5 Retirar USD</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.depositar(\'CUP\')">\ud83e\ude99 Depositar CUP</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.extraer(\'CUP\')">\ud83e\ude99 Retirar CUP</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.listarDepositos()">\ud83d\udccb Dep\u00f3sitos</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.listar()">\ud83d\udccb Retiros</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.resumenMonedas()">\ud83d\udcb1 Por moneda</button>' +
    '</div>';

  cont.innerHTML = html;
};

/* ============================================================
 * Orquestador
 * ============================================================ */

RN.panelWidgets.renderAll = function () {
  RN.panelWidgets.renderTendencia();
  RN.panelWidgets.renderAtencion();
  RN.panelWidgets.renderCortes();
  RN.panelWidgets.renderRentabilidad();
  RN.panelWidgets.renderCajaProyectada();
  RN.panelWidgets.renderReserva();
};
