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
 *   8. Rentabilidad (v5.52.3) — paquete pagado + plus + margen y cobertura.
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
      texto: 'Capacidad de red EXCEDIDA: ' + RN.cola.txtM(cap.comprometido) + ' comprometidos / ' + RN.cola.txtM(cap.tope) + ' (' + cap.pctReal + '%)',
      accion: 'RN.cola.abrirResumen()', accionTxt: 'Ver resumen'
    });
  } else if (cap.tope > 0 && cap.aviso) {
    out.push({
      nivel: 'amber', icono: '\ud83d\udcf6',
      texto: 'Capacidad de red al ' + cap.pctReal + '% (' + RN.cola.txtM(cap.comprometido) + ' / ' + RN.cola.txtM(cap.tope) + ')',
      accion: 'RN.cola.abrirResumen()', accionTxt: 'Revisar'
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
    var esperado = clientes.reduce(function (s, c) { return s + RN.calc.netoEsperadoMes(c, mes); }, 0);
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
 * 8. Rentabilidad (v5.52.3) — paquete pagado + plus + margen real
 * ============================================================ */

RN.panelWidgets.renderRentabilidad = function () {
  var cont = document.getElementById('panel-rentabilidad');
  if (!cont) return;
  var mes = RN.calc.mesActualStr();
  var cfg = RN.state.config;
  var f = RN.calc.formatCUP;
  var precioMega = +cfg.proveedorPrecioMega || 0;
  var megasPagados = +cfg.proveedorMegas || 0;
  var plus = (RN.calc.plusMegas) ? RN.calc.plusMegas() : (+cfg.plusMegas || 0);
  var capacidad = megasPagados + plus;
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var megasVendidos = RN.calc.megasVendidos();
  var ingresos = RN.calc.ingresosMes(mes);
  var ingresosEsp = (RN.calc.ingresoEsperadoMes) ? RN.calc.ingresoEsperadoMes(mes) : 0;
  var ganancia = +(ingresos - costoPaquete).toFixed(2);

  // Megas sin costo = vendidos por encima de lo que pagas al proveedor
  var megasSinCosto = Math.max(0, megasVendidos - megasPagados);
  var plusUsado = Math.min(plus, megasSinCosto);
  var sobreventaNeta = Math.max(0, megasSinCosto - plus);
  var ahorroCosto = +(megasSinCosto * precioMega).toFixed(2);

  // --- Precios de venta (NO usar ingresos parciales ÷ todos los megas) ---
  // 1) Precio medio de lista / contrato: lo que deberían pagar ÷ megas vendidos
  // 2) Precio medio cobrado: solo sobre clientes que ya pagaron este mes
  var listaTotal = 0, listaMegas = 0;
  var cobradoMegas = 0, cobradoMonto = 0;
  RN.calc.clientesActivos().forEach(function (c) {
    if (c.esAdmin) return;
    if (RN.calc.mesInicioCliente(c) > mes) return;
    var m = RN.calc.getMegasCliente(c);
    var esperado = RN.calc.netoEsperadoMes ? RN.calc.netoEsperadoMes(c, mes) : (+c.precio || 0);
    listaTotal += esperado;
    listaMegas += m;
    var cobros = RN.calc.cobrosServicio ? RN.calc.cobrosServicio(c.id, mes) : [];
    var cob = cobros.reduce(function (s, h) { return s + (h.monto || 0); }, 0);
    if (cob > 0.009) {
      cobradoMonto += cob;
      cobradoMegas += m;
    }
  });
  var precioMedioLista = listaMegas > 0 ? +(listaTotal / listaMegas).toFixed(2) : 0;
  var precioMedioCobrado = cobradoMegas > 0 ? +(cobradoMonto / cobradoMegas).toFixed(2) : 0;
  var gananciaPorMega = megasVendidos > 0 ? +(ganancia / megasVendidos).toFixed(2) : 0;

  var cubierto = costoPaquete > 0 && ingresos >= costoPaquete - 0.005;
  var faltaCubrir = Math.max(0, +(costoPaquete - ingresos).toFixed(2));

  // Cobertura por cortes (cobros reales acumulados)
  var coberturaCortes = '';
  try {
    var cortes = RN.gananciaCortes._cortesProyectados(mes);
    var acumIng = 0;
    var filas = [];
    cortes.forEach(function (g) {
      var ing = 0;
      g.clientes.forEach(function (c) {
        if (c.esAdmin) return;
        var cob = RN.calc.cobrosServicio
          ? RN.calc.cobrosServicio(c.id, mes).reduce(function (s, h) { return s + (h.monto || 0); }, 0)
          : 0;
        ing += cob;
      });
      acumIng += ing;
      filas.push({ dia: g.diaPago, ing: +ing.toFixed(2), acum: +acumIng.toFixed(2) });
    });
    if (filas.length && costoPaquete > 0) {
      var corteCubre = null;
      for (var i = 0; i < filas.length; i++) {
        if (filas[i].acum >= costoPaquete - 0.005) { corteCubre = filas[i]; break; }
      }
      if (corteCubre) {
        coberturaCortes = 'Con los cobros hasta el corte día <strong>' + corteCubre.dia +
          '</strong> ya cubres el paquete (' + f(corteCubre.acum) + ').';
      } else if (filas.length) {
        var last = filas[filas.length - 1];
        coberturaCortes = 'Aún no cubres el paquete con lo cobrado (vas en ' + f(last.acum) +
          ' de ' + f(costoPaquete) + ').';
      }
    }
  } catch (e) { /* silencioso */ }

  var html = '';

  // Resumen del paquete
  html += '<div class="caja-proy" style="margin-bottom:12px">';
  html += '<div class="caja-linea"><span>Paquete que pagas</span><strong>' + megasPagados + 'M × ' +
    (precioMega ? precioMega.toLocaleString('es-CU') : '—') + ' = ' + f(costoPaquete) + '</strong></div>';
  html += '<div class="caja-linea"><span>Plus de cortesía (gratis)</span><strong>' + plus + 'M</strong></div>';
  html += '<div class="caja-linea"><span>Capacidad sin costo extra</span><strong>' + capacidad + 'M</strong></div>';
  html += '<div class="caja-linea total"><span>Megas vendidos</span><strong>' + megasVendidos + 'M</strong></div>';
  if (megasSinCosto > 0) {
    html += '<div class="caja-linea"><span class="muted">De ellos sin costo</span><strong style="color:var(--success)">' +
      megasSinCosto + 'M</strong>' +
      (plus > 0 || sobreventaNeta > 0
        ? '<small class="cp-sub">' +
          (plusUsado > 0 ? plusUsado + 'M plus' : '') +
          (plusUsado > 0 && sobreventaNeta > 0 ? ' + ' : '') +
          (sobreventaNeta > 0 ? sobreventaNeta + 'M sobreventa' : '') +
          '</small>'
        : '') +
      '</div>';
  }
  html += '</div>';

  // Cobertura del paquete
  html += '<div class="cp-sec" style="margin-bottom:12px"><div class="cp-tit">¿Ya cubriste el paquete este mes?</div>';
  html += '<div class="caja-linea"><span>Ingresos cobrados</span><strong>' + f(ingresos) + '</strong></div>';
  html += '<div class="caja-linea"><span>Costo del paquete</span><strong>' + f(costoPaquete) + '</strong></div>';
  if (costoPaquete > 0) {
    html += '<div class="caja-linea total"><span>' + (cubierto ? '✓ Paquete cubierto' : 'Falta para cubrir') +
      '</span><strong style="color:' + (cubierto ? 'var(--success)' : 'var(--danger)') + '">' +
      (cubierto ? f(ganancia) + ' de margen' : f(faltaCubrir)) + '</strong></div>';
  }
  if (coberturaCortes) {
    html += '<p class="muted" style="font-size:12px;margin-top:8px">' + coberturaCortes + '</p>';
  }
  html += '</div>';

  // KPIs de precio / margen
  html += '<div class="kpi-grid" style="margin-bottom:0">';

  // Precio medio de LISTA (lo que vendes, no lo cobrado parcial)
  var okLista = precioMedioLista >= precioMega;
  html += '<div class="kpi ' + (okLista ? 'green' : 'red') + '">' +
    '<div class="label">Precio medio de venta</div>' +
    '<div class="value" style="font-size:18px">' + f(precioMedioLista) + '</div>' +
    '<div class="sub">Neto esperado ÷ ' + listaMegas + 'M · vs costo ' +
      (precioMega ? precioMega.toLocaleString('es-CU') : '—') + ' CUP/M</div></div>';

  // Precio medio COBRADO (solo quienes ya pagaron)
  if (cobradoMegas > 0) {
    var okCob = precioMedioCobrado >= precioMega;
    html += '<div class="kpi ' + (okCob ? 'green' : 'muted') + '">' +
      '<div class="label">Precio medio cobrado</div>' +
      '<div class="value" style="font-size:18px">' + f(precioMedioCobrado) + '</div>' +
      '<div class="sub">Lo cobrado ÷ ' + cobradoMegas + 'M de quienes ya pagaron este mes</div></div>';
  }

  html += '<div class="kpi ' + (gananciaPorMega >= 0 ? 'green' : 'red') + '">' +
    '<div class="label">Ganancia por mega</div>' +
    '<div class="value" style="font-size:18px">' + f(gananciaPorMega) + '</div>' +
    '<div class="sub">(Ingresos cobrados − paquete) ÷ ' + megasVendidos + 'M vendidos</div></div>';

  html += '<div class="kpi ' + (megasSinCosto > 0 ? 'green' : 'muted') + '">' +
    '<div class="label">Ahorro por megas sin costo</div>' +
    '<div class="value" style="font-size:18px">' + f(ahorroCosto) + '</div>' +
    '<div class="sub">' + (megasSinCosto > 0
      ? megasSinCosto + 'M × ' + (precioMega ? precioMega.toLocaleString('es-CU') : '0') + ' CUP/M (no los pagaste al proveedor)'
      : 'Sin megas por encima del paquete pagado') + '</div></div>';

  if (megasSinCosto > 0 && precioMedioLista > 0) {
    var ingresoSobre = +(megasSinCosto * precioMedioLista).toFixed(2);
    html += '<div class="kpi green">' +
      '<div class="label">Ingreso de megas sin costo</div>' +
      '<div class="value" style="font-size:18px">' + f(ingresoSobre) + '</div>' +
      '<div class="sub">' + megasSinCosto + 'M × precio medio de venta ' + f(precioMedioLista) + '</div></div>';
  }
  html += '</div>';

  if (precioMega <= 0 || megasPagados <= 0) {
    html += '<p class="muted" style="margin-top:10px;font-size:12px">⚠️ Configura megas que pagas y precio en <strong>Gestionar servicio</strong>. Si hay plus gratis, indícalo ahí (ej: 40 pagados + 5 de plus).</p>';
  } else {
    html += '<p class="muted" style="margin-top:10px;font-size:12px">' +
      'Pagas <strong>' + megasPagados + 'M</strong> a <strong>' + precioMega.toLocaleString('es-CU') + ' CUP/M</strong>' +
      (plus > 0 ? ' y recibes <strong>' + plus + 'M de plus</strong> sin costo' : '') +
      '. El <strong>precio medio de venta</strong> usa lo que deben pagar los clientes (planes/precios), no solo lo cobrado a mitad de mes. ' +
      'El <strong>precio medio cobrado</strong> solo mira a quienes ya pagaron.' +
      '</p>';
  }

  cont.innerHTML = html;
};

/* ============================================================
 * 11. Caja unificada (v5.52.1) — proyectada + dos bolsillos
 * Combina la proyección al cierre del mes con el estado actual
 * de reserva/libre, saldos físicos y acciones de depósito/retiro.
 * ============================================================ */

RN.panelWidgets.renderCajaProyectada = function () {
  var cont = document.getElementById('panel-caja');
  if (!cont) return;
  var mes = RN.calc.mesActualStr();
  var p = RN.calc.cajaProyeccion(mes);
  var f = RN.calc.formatCUP;
  var b = p.base;
  var bol = RN.calc.bolsillos(mes);

  var chips = {
    ok: ['ok', 'Mes cubierto: la reserva queda completa'],
    ajustada: ['warn', 'Ajustado: si no cobras todo, la reserva no se completa'],
    bajo: ['bad', 'La reserva no se completa al cierre (faltan ' + f(Math.max(0, b.reservaCierre - b.cierre)) + ')']
  };
  var chip = chips[p.estado] || chips.ok;

  var html = '<div class="cp">';

  // 1. Resultado grande al cierre
  html += '<div class="cp-hero">' +
    '<div class="muted">Al cerrar ' + RN.render.esc(RN.calc.mesTexto(mes)) + ' tendrás</div>' +
    '<div class="cp-big ' + chip[0] + '">' + f(b.cierre) + '</div>' +
    '<span class="cp-chip ' + chip[0] + '">' + chip[1] + '</span>' +
    '</div>';

  // 2. La cuenta en cuatro líneas
  var paquetePagado = p.costoPaquete > 0 && p.porPagar === 0;
  html += '<div class="caja-proy">' +
    '<div class="caja-linea"><span>Hoy en caja</span><strong>' + f(p.hoy) + '</strong></div>' +
    '<div class="caja-linea"><span>+ Te falta cobrar<small class="cp-sub">' +
      (p.nPend > 0 ? 'faltan ' + p.nPend + ' de ' + p.nTotal + ' clientes' : 'todos pagaron este mes') +
      '</small></span><strong style="color:var(--success)">' + f(p.pendiente) + '</strong></div>' +
    '<div class="caja-linea"><span>\u2212 Te falta pagar<small class="cp-sub">' +
      (p.costoPaquete <= 0 ? 'sin paquete configurado' : (paquetePagado ? 'el paquete ya está pagado' : 'paquete del proveedor, sin pagar')) +
      '</small></span><strong style="color:var(--danger)">' + f(p.porPagar) + '</strong></div>' +
    '<div class="caja-linea total"><span>= Al cierre</span><strong>' + f(b.cierre) + '</strong></div>' +
    '</div>';

  // 3. ¿Cuánto es tuyo al cierre? (barra + reserva/libre proyectados)
  var totalBarra = Math.max(0, b.cierre);
  var resBarra = totalBarra > 0 ? Math.max(0, Math.min(100, Math.min(b.reservaCierre, totalBarra) / totalBarra * 100)) : 0;
  html += '<div class="cp-sec"><div class="cp-tit">¿Cuánto es tuyo al cierre?</div>' +
    '<div class="cp-bar"><div class="cp-bar-res" style="width:' + resBarra + '%"></div><div class="cp-bar-lib" style="width:' + (totalBarra > 0 ? 100 - resBarra : 0) + '%"></div></div>' +
    '<div class="caja-linea"><span>\ud83d\udd12 Reserva (' + p.pct + ' %)<small class="cp-sub">la que traes + ' + p.pct + ' % de la ganancia del mes</small></span><strong>' + f(b.reservaCierre) + '</strong></div>' +
    '<div class="caja-linea"><span>\ud83d\udcb8 Libre para retirar</span><strong style="color:' + (b.libreCierre >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + f(b.libreCierre) + '</strong></div>' +
    '</div>';

  // 4. Cuánto se puede sacar hoy sin comprometer la reserva
  html += '<div class="cp-puedes"><div class="cp-puedes-t">Puedes sacar hoy sin comprometer la reserva</div>' +
    '<div class="cp-puedes-v">' + f(b.retirableHoy) + '</div>' +
    '<div class="cp-puedes-s">' + (b.retirableHoy > 0
      ? 'Es lo que aguanta hasta fin de mes. Si sacas más, la reserva se recorta a lo que quede en caja y el mes siguiente arranca desde ahí.'
      : 'Hoy no hay margen: lo que sacaras dejaría la reserva incompleta al cierre. Se recorta a lo que quede en caja y el mes siguiente arranca desde ahí.') +
    '</div></div>';

  // 5. Estado actual de los dos bolsillos + saldos físicos
  var colorRes = bol.cubierta ? 'var(--success)' : 'var(--danger)';
  var totalHoy = Math.max(0, bol.fondo);
  var pctResHoy = totalHoy > 0 ? Math.max(0, Math.min(100, bol.reserva / totalHoy * 100)) : 0;
  var pctLibHoy = totalHoy > 0 ? Math.max(0, Math.min(100, bol.libre / totalHoy * 100)) : 0;

  html += '<div class="cp-sec"><div class="cp-tit">Ahora mismo (gaveta)</div>';
  html += '<div class="caja-proy">';
  html += '<div class="caja-linea"><span class="muted">\ud83d\udd12 Reserva actual (intocable, ' + bol.pct + '%)</span><strong style="color:' + colorRes + '">' + f(bol.reserva) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">\ud83d\udcb8 Libre actual (' + (100 - bol.pct) + '%)</span><strong style="color:' + (bol.libre >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + f(bol.libre) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">Fondo de caja total</span><strong>' + f(bol.fondo) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">\ud83d\udcb5 USD físico en la gaveta</span><strong>$' + RN.calc.usdEnCaja().toFixed(2) + '</strong></div>';
  html += '<div class="caja-linea"><span class="muted">\ud83e\ude99 CUP físico en la gaveta</span><strong>' + f(RN.calc.cupEnCaja()) + '</strong></div>';
  html += '<div class="caja-linea total"><span>Puedes retirar (del bolsillo libre)</span><strong style="color:' + (bol.retirable > 0 ? 'var(--success)' : 'var(--danger)') + '">' + f(bol.retirable) + '</strong></div>';
  html += '</div>';

  // Barras visuales actuales
  html += '<div style="margin-top:10px">' +
    '<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--border)">' +
    '<div style="width:' + pctResHoy + '%;background:var(--success)" title="Reserva"></div>' +
    '<div style="width:' + pctLibHoy + '%;background:var(--primary,#2563eb)" title="Libre"></div>' +
    '</div>' +
    '<div class="flex" style="justify-content:space-between;font-size:11px;margin-top:4px">' +
    '<span class="muted">\ud83d\udd12 Reserva ' + Math.round(pctResHoy) + '%</span>' +
    '<span class="muted">\ud83d\udcb8 Libre ' + Math.round(pctLibHoy) + '%</span>' +
    '</div></div>';

  if (bol.reserva > 0 && !bol.cubierta) {
    html += '<p class="muted" style="margin-top:10px;font-size:12px;color:var(--danger)">\u26a0\ufe0f El fondo está por debajo de la reserva. Te faltan ' +
      f(bol.reserva - bol.fondo) + ' para cubrirla.</p>';
  } else {
    html += '<p class="muted" style="margin-top:10px;font-size:12px">' +
      'Cada mes, de la ganancia del mes se reserva el ' + bol.pct + '% (\ud83d\udd12 intocable) y el ' + (100 - bol.pct) +
      '% queda libre para ti (\ud83d\udcb8). Los retiros salen solo del bolsillo libre. Ajusta el % en Ajustes.</p>';
  }
  html += '</div>';

  // 6. Botones de acción
  // v5.52.1: solo botones generales. La moneda (CUP/USD/Mixto) se elige dentro del modal.
  html += '<div class="flex wrap" style="gap:8px;margin-top:12px">' +
    '<button class="btn sm primary" onclick="RN.caja.depositar()">\ud83d\udcb0 Depositar</button>' +
    '<button class="btn sm" onclick="RN.caja.extraer()">\ud83d\udcb5 Retirar</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.listarDepositos()">\ud83d\udccb Depósitos</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.listar()">\ud83d\udccb Retiros</button>' +
    '<button class="btn sm ghost" onclick="RN.caja.resumenMonedas()">\ud83d\udcb1 Por moneda</button>' +
    '</div>';

  // 7. Lo que falta cobrar por corte
  if (p.cortes.length) {
    html += '<div class="cp-sec" style="margin-top:14px"><div class="cp-tit">Lo que falta cobrar, por corte</div>';
    p.cortes.forEach(function (c) {
      html += '<div class="caja-linea"><span>Corte ' + c.dia + '<small class="cp-sub">faltan ' + c.clientes + (c.clientes === 1 ? ' cliente' : ' clientes') + '</small></span><strong>' + f(c.monto) + '</strong></div>';
    });
    html += '</div>';
  }

  // 8. Escenario con tasa de cobro histórica
  if (p.escenario) {
    var pctCobro = Math.round(p.tasa * 100);
    html += '<div class="cp-sec"><div class="caja-linea"><span>Si de lo que falta cobras el ' + pctCobro + ' %<small class="cp-sub">promedio de los últimos 3 meses · podrías sacar hoy</small></span><strong>\u2248 ' + f(p.escenario.retirableHoy) + '</strong></div></div>';
  }

  // 9. Nota de exclusiones
  html += '<p class="muted cp-nota">' + (p.nAtrasos > 0
    ? 'No incluye: atrasos de meses anteriores (' + f(p.atrasos) + ' en ' + p.nAtrasos + (p.nAtrasos === 1 ? ' cliente' : ' clientes') + ') ni gastos que aún no has registrado.'
    : 'No incluye gastos que aún no has registrado.') + '</p>';

  html += '</div>';
  cont.innerHTML = html;
};

/* renderReserva queda como no-op (tarjeta eliminada en v5.52.1; se unificó en renderCajaProyectada) */
RN.panelWidgets.renderReserva = function () {};

/* ============================================================
 * v5.44.0 — Atención priorizada con chips y Caja en tiempo real
 * ============================================================ */

RN.panelWidgets._filtroAtencion = '';

/** Activa/desactiva un chip de filtro ('morosos' | 'hoy' | 'parciales' | 'inactivos'). */
RN.panelWidgets.setFiltroAtencion = function (f) {
  RN.panelWidgets._filtroAtencion = (RN.panelWidgets._filtroAtencion === f) ? '' : f;
  RN.panelWidgets.renderAtencionClientes();
};

RN.panelWidgets.renderAtencionClientes = function () {
  var chipsEl = document.getElementById('atencion-chips');
  var lista = document.getElementById('panel-atencion-clientes');
  if (!chipsEl || !lista) return;
  var activo = RN.panelWidgets._filtroAtencion;
  var defs = [
    ['morosos', '🔴 Morosos'], ['hoy', '📅 Por cobrar hoy'],
    ['parciales', '⏳ Parciales'], ['inactivos', '💤 Inactivos con deuda']
  ];
  chipsEl.innerHTML = defs.map(function (d) {
    var n = RN.calc.clientesAtencion(d[0]).length;
    return '<button type="button" class="chip' + (activo === d[0] ? ' active' : '') + '" aria-pressed="' +
      (activo === d[0]) + '" onclick="RN.panelWidgets.setFiltroAtencion(\'' + d[0] + '\')">' +
      d[1] + ' <span class="chip-n">' + n + '</span></button>';
  }).join('');

  var items = RN.calc.clientesAtencion(activo);
  if (!items.length) {
    lista.innerHTML = activo ? '<div class="muted" style="font-size:13px;padding:8px 0">Ningún cliente en este filtro.</div>' : '';
    return;
  }
  var MAX = 8;
  lista.innerHTML = items.slice(0, MAX).map(function (it) {
    var c = it.cliente;
    var det = it.mora > 0 ? it.mora + ' mes' + (it.mora > 1 ? 'es' : '') + ' de mora · ' : '';
    return '<div class="atencion-cli">' +
      '<div class="atencion-cli-info"><strong>' + RN.render.esc(c.nombre) + '</strong>' +
      '<div class="muted" style="font-size:12px">' + det + RN.render.esc(it.motivo) + '</div></div>' +
      '<div class="atencion-cli-monto">' + RN.calc.formatCUP(it.deuda) + '</div>' +
      '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + c.id + '\')">Cobrar</button>' +
    '</div>';
  }).join('') + (items.length > MAX ? '<div class="muted" style="font-size:12px;padding-top:6px">y ' + (items.length - MAX) + ' más…</div>' : '');
};

RN.panelWidgets.renderCajaReal = function () {
  var cont = document.getElementById('panel-caja-real');
  if (!cont) return;
  var s = RN.calc.saldosMoneda();
  cont.innerHTML =
    '<h3>💵 Caja ahora</h3>' +
    '<div class="caja-real">' +
      '<div class="caja-real-saldo"><span class="muted">Pesos (CUP)</span><strong>' + RN.calc.formatCUP(s.cup) + '</strong></div>' +
      '<div class="caja-real-saldo"><span class="muted">Dólares (USD)</span><strong>$' + s.usd.toFixed(2) + '</strong></div>' +
    '</div>' +
    '<div class="muted" style="font-size:12px;margin:6px 0 10px">Total equivalente: ' + RN.calc.formatCUP(s.totalCUP) + '</div>' +
    '<div class="flex wrap">' +
      '<button class="btn primary" onclick="RN.cuadre.abrir()">🧮 Cuadrar caja</button>' +
      '<button class="btn" onclick="RN.modalCobro.abrirDesdeCobros()">+ Cobrar ahora</button>' +
    '</div>';
};

/* ============================================================
 * Orquestador
 * ============================================================ */

RN.panelWidgets.renderAll = function () {
  // v5.55.29: el Panel ya no pinta tendencia/caja embebida; solo atención a clientes.
  try {
    if (RN.panelWidgets.renderAtencionClientes) RN.panelWidgets.renderAtencionClientes();
  } catch (e) {}
}
