/**
 * modal-paquete-proveedor.js — Hub de gestión del proveedor de internet.
 * v5.12.4 — Ya no es solo "pagar al proveedor". Aquí se gestiona TODO el paquete:
 *           ajustar megas, precio por mega, sobreventa y pagar.
 *           Al hacer un cambio se decide si es vigente para el mes actual o
 *           para el próximo mes (paquetePendiente que se aplica al cerrar mes).
 *           La sección "Mi paquete de internet" de Ajustes se elimina; este
 *           modal comanda toda la configuración del proveedor.
 *
 * Dos acciones (Opción A):
 *   1. "Guardar cambios"  — guarda megas/precio/sobreventa/proveedor sin pagar.
 *      Si vigencia = "este mes" → aplica inmediatamente a RN.state.config.
 *      Si vigencia = "próximo mes" → guarda en RN.state.config.paquetePendiente.
 *   2. "Registrar pago"   — paga el paquete vigente actual como gasto.
 */
RN.paqueteProveedor = RN.paqueteProveedor || {};

RN.paqueteProveedor._moneda = 'CUP';
RN.paqueteProveedor._vigencia = 'este'; // 'este' o 'proximo'

/** Calcula el monto del paquete a partir de megas × precio por mega. */
RN.paqueteProveedor.calcMontoPaquete = function () {
  var megas = parseFloat((document.getElementById('prov-megas') || {}).value) || 0;
  var precioMega = parseFloat((document.getElementById('prov-precio-mega') || {}).value) || 0;
  return +(megas * precioMega).toFixed(2);
};

/** Lee los campos del modal y devuelve un objeto {proveedor, megas, precioMega, reserva, monto}. */
RN.paqueteProveedor.leerCampos = function () {
  return {
    proveedor: ((document.getElementById('prov-nombre') || {}).value || '').trim(),
    megas: parseFloat((document.getElementById('prov-megas') || {}).value) || 0,
    precioMega: parseFloat((document.getElementById('prov-precio-mega') || {}).value) || 0,
    plus: parseFloat((document.getElementById('prov-plus') || {}).value) || 0,
    reserva: parseFloat((document.getElementById('prov-reserva') || {}).value),
    monto: RN.paqueteProveedor.calcMontoPaquete()
  };
};

/** Detecta si los campos del modal difieren de la config vigente actual. */
RN.paqueteProveedor.hayCambios = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var cfg = RN.state.config;
  return c.proveedor !== (cfg.proveedorInternet || '') ||
         c.megas !== (+cfg.proveedorMegas || 0) ||
         c.precioMega !== (+cfg.proveedorPrecioMega || 0) ||
         c.plus !== (+cfg.plusMegas || 0) ||
         (isNaN(c.reserva) ? 1 : c.reserva) !== (+cfg.reservaMegas || 0);
};

/** Actualiza el aviso de capacidad dentro del modal (en vivo). v5.12.4 */
RN.paqueteProveedor.actualizarAviso = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var reserva = isNaN(c.reserva) ? 1 : c.reserva;
  var aviso = document.getElementById('prov-aviso-capacidad');
  if (!aviso) return;

  // Monto calculado
  var montoEl = document.getElementById('prov-monto-calc');
  if (montoEl) montoEl.textContent = RN.calc.formatCUP(c.monto);

  if (!c.megas) {
    aviso.innerHTML = 'Ingresa los megas de tu paquete para ver el control de capacidad.';
    aviso.className = 'prov-cap-aviso muted';
    return;
  }

  // v5.52.3: tope = (pagados + plus) − reserva
  var comprometido = RN.cola.sumaLimitAtKbps().kbps / 1000;
  var plus = Math.max(0, +c.plus || 0);
  var tope = Math.max(0, c.megas + plus - reserva);
  var excedido = tope > 0 && comprometido > tope;
  var pct = tope > 0 ? Math.min(100, Math.round(comprometido / tope * 100)) : 0;
  var cM = RN.cola.txtM(comprometido), tM = RN.cola.txtM(tope);
  var estadoTxt = excedido
    ? '<strong style="color:var(--danger)">\u26a0 Excedido: ' + cM + ' comprometidos y tu tope es ' + tM + '</strong>. Reduce clientes o baja la reserva.'
    : (pct >= 80
        ? '<strong style="color:var(--warn)">Cerca del tope: ' + cM + ' / ' + tM + ' (' + pct + '%)</strong>. Vigila tu capacidad.'
        : '<strong style="color:var(--success)">\u2713 Capacidad ok: ' + cM + ' comprometidos / ' + tM + ' disponibles (' + pct + '%)</strong>.');
  var desgloseCap = c.megas + 'M pagados' + (plus > 0 ? ' + ' + plus + 'M plus' : '') + ' \u2212 ' + reserva + 'M reserva';
  aviso.innerHTML = 'Tope: <strong>' + tM + '</strong> (' + desgloseCap + ') \u00b7 ' + estadoTxt;
  aviso.className = 'prov-cap-aviso' + (excedido ? ' prov-cap-alert' : (pct >= 80 ? ' prov-cap-warn' : ' prov-cap-ok'));

  // Actualizar tambien el desglose del pago si existe
  RN.paqueteProveedor.recalcular();
};

/** Abre el modal de gestión del proveedor. */
RN.paqueteProveedor.abrir = function () {
  var cfg = RN.state.config;
  var reserva = (cfg.reservaMegas === undefined || cfg.reservaMegas === null) ? 1 : cfg.reservaMegas;
  var html =
    '<div class="modal-header"><h3>\ud83d\udce1 Gestionar mi servicio de internet</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>' +
    '<div class="modal-body">' +
      '<p class="muted" style="margin-bottom:12px;font-size:13px">Aquí ajustas el paquete: <strong>megas que pagas, precio, plus de cortesía y reserva</strong>. Si haces un cambio, decide si es <strong>vigente desde este mes</strong> o <strong>desde el próximo</strong>. También puedes registrar el pago mensual.</p>' +

      '<div class="form-row"><div><label>Proveedor de internet</label>' +
      '<input type="text" id="prov-nombre" placeholder="Ej: ETECSA, FiberNet..." value="' + RN.render.esc(cfg.proveedorInternet || '') + '" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div></div>' +

      '<div class="form-row cols-2"><div><label>Megas que pagas (Mbps)</label>' +
      '<input type="number" id="prov-megas" step="1" min="0" placeholder="Ej: 40" value="' + (cfg.proveedorMegas || 0) + '" oninput="RN.paqueteProveedor.actualizarAviso()"></div>' +
      '<div><label>Precio por mega (CUP/Mbps)</label>' +
      '<input type="number" id="prov-precio-mega" step="0.01" min="0" placeholder="Ej: 1250" value="' + (cfg.proveedorPrecioMega || 0) + '" oninput="RN.paqueteProveedor.actualizarAviso()"></div></div>' +

      '<div class="form-row cols-2"><div><label>Plus de cortesía (Mbps gratis)</label>' +
      '<input type="number" id="prov-plus" step="1" min="0" placeholder="Ej: 5" value="' + ((cfg.plusMegas !== undefined && cfg.plusMegas !== null) ? cfg.plusMegas : (cfg.sobreventaMegas || 0)) + '" oninput="RN.paqueteProveedor.actualizarAviso()" title="Megas que el proveedor te da sin costo (ej: pagas 40 y te dan 5 de plus)"></div>' +
      '<div><label>Reserva (Mbps que no se comprometen)</label>' +
      '<input type="number" id="prov-reserva" step="0.5" min="0" placeholder="1" value="' + reserva + '" oninput="RN.paqueteProveedor.actualizarAviso()"></div></div>' +

      '<div class="form-row"><div><label>Monto mensual del paquete (solo megas pagados)</label>' +
      '<div id="prov-monto-calc" style="font-size:18px;font-weight:700;padding-top:6px">' + RN.calc.formatCUP(RN.calc.montoPaqueteProveedor()) + '</div>' +
      '<p class="muted" style="font-size:12px;margin-top:4px">Costo = megas que pagas × precio. El plus no se cobra.</p></div></div>' +

      '<div id="prov-aviso-capacidad" class="prov-cap-aviso muted" style="margin-bottom:16px"></div>' +

      // --- Sección de vigencia ---
      '<div class="form-row" id="prov-seccion-vigencia"><div><label>\u23f1 Vigencia de los cambios</label>' +
      '<div style="display:flex;gap:8px;margin-top:4px">' +
        '<button class="cobro-moneda-btn active" id="prov-vig-este" onclick="RN.paqueteProveedor.setVigencia(\'este\')">Vigente desde este mes</button>' +
        '<button class="cobro-moneda-btn" id="prov-vig-proximo" onclick="RN.paqueteProveedor.setVigencia(\'proximo\')">Vigente desde el pr\u00f3ximo mes</button>' +
      '</div>' +
      '<p class="muted" id="prov-vig-info" style="margin-top:6px;font-size:12px">Los cambios se aplican inmediatamente al paquete actual.</p>' +
      '</div></div>' +

      // --- Sección de pago (v5.55.10: parcial, descuento, multi-moneda) ---
      '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">' +
      '<div class="muted" style="font-size:13px;margin-bottom:8px" id="prov-saldo-mes"></div>' +
      '<div class="form-row"><div><label>Fecha de pago</label>' +
      '<input type="date" id="prov-fecha" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>' +

      '<div class="form-row"><div><label>Moneda de pago</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="cobro-moneda-btn active" id="prov-moneda-cup" onclick="RN.paqueteProveedor.setMoneda(\'CUP\')">CUP</button>' +
        '<button type="button" class="cobro-moneda-btn" id="prov-moneda-usd" onclick="RN.paqueteProveedor.setMoneda(\'USD\')">USD</button>' +
        '<button type="button" class="cobro-moneda-btn" id="prov-moneda-mixto" onclick="RN.paqueteProveedor.setMoneda(\'MIXTO\')">Mixto</button>' +
      '</div></div></div>' +

      '<div class="form-row" id="prov-grupo-usd" style="display:none"><div><label>Monto en USD</label>' +
      '<input type="number" id="prov-monto-usd" step="0.01" min="0" inputmode="decimal" placeholder="0" value="0" oninput="RN.paqueteProveedor.recalcular()"></div></div>' +

      '<div class="form-row" id="prov-grupo-cup"><div><label>Monto en CUP</label>' +
      '<input type="number" id="prov-monto-cup" step="0.01" min="0" inputmode="decimal" placeholder="0" value="0" oninput="RN.paqueteProveedor.recalcular()"></div></div>' +

      '<div class="form-row"><div><label>Descuento (CUP, opcional)</label>' +
      '<input type="number" id="prov-descuento" step="0.01" min="0" inputmode="decimal" placeholder="0" value="0" oninput="RN.paqueteProveedor.recalcular()">' +
      '<small class="muted">Reduce el saldo del paquete sin salir de caja (acuerdo con el proveedor).</small></div></div>' +

      '<div class="flex wrap" style="gap:8px;margin-bottom:10px">' +
        '<button type="button" class="btn sm" onclick="RN.paqueteProveedor.usarSaldoCompleto()">Cubrir saldo</button>' +
        '<button type="button" class="btn sm" id="prov-btn-completar-otra" style="display:none" onclick="RN.paqueteProveedor.completarConOtraMoneda()">Completar con otra moneda</button>' +
      '</div>' +

      '<div id="prov-desglose" style="background:var(--bg-alt,var(--surface-2));padding:12px;border-radius:8px;margin-bottom:12px;display:none"></div>' +
      '<div id="prov-aviso-moneda" style="margin-bottom:8px"></div>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
      '<button class="btn" onclick="RN.paqueteProveedor.guardarCambios()">\ud83d\udcbe Guardar cambios</button>' +
      '<button class="btn primary" id="prov-btn-pagar" onclick="RN.paqueteProveedor.confirmar()">\ud83d\udcb3 Registrar pago</button>' +
    '</div>';

  RN.uiComponents.modal(html);
  RN.paqueteProveedor._moneda = 'CUP';
  RN.paqueteProveedor._vigencia = 'este';
  // Precargar con el SALDO pendiente (permite parciales; no fuerza el total si ya hubo pagos)
  var saldo = RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes() : RN.paqueteProveedor.calcMontoPaquete();
  var cupInput = document.getElementById('prov-monto-cup');
  if (cupInput) cupInput.value = saldo > 0 ? saldo : 0;
  RN.paqueteProveedor.actualizarAviso();
  RN.paqueteProveedor.recalcular();
};

/** Cambia la vigencia seleccionada. */
RN.paqueteProveedor.setVigencia = function (vig) {
  RN.paqueteProveedor._vigencia = vig;
  var btnEste = document.getElementById('prov-vig-este');
  var btnProx = document.getElementById('prov-vig-proximo');
  var info = document.getElementById('prov-vig-info');
  if (btnEste) btnEste.classList.toggle('active', vig === 'este');
  if (btnProx) btnProx.classList.toggle('active', vig === 'proximo');
  if (info) {
    if (vig === 'este') {
      info.innerHTML = 'Los cambios se aplican inmediatamente al paquete actual.';
    } else {
      info.innerHTML = 'Los cambios se guardan como <strong>pendientes</strong> y se aplican autom\u00e1ticamente al cerrar el mes actual.';
    }
  }
};

/** Cambia la moneda de pago seleccionada. */
RN.paqueteProveedor.setMoneda = function (moneda) {
  RN.paqueteProveedor._moneda = moneda;
  ['cup', 'usd', 'mixto'].forEach(function (m) {
    var btn = document.getElementById('prov-moneda-' + m);
    if (btn) btn.classList.toggle('active', m.toUpperCase() === moneda);
  });
  var grupoUsd = document.getElementById('prov-grupo-usd');
  var grupoCup = document.getElementById('prov-grupo-cup');
  if (grupoUsd) grupoUsd.style.display = (moneda === 'USD' || moneda === 'MIXTO') ? '' : 'none';
  if (grupoCup) grupoCup.style.display = (moneda === 'CUP' || moneda === 'MIXTO') ? '' : 'none';
  // No pisar montos al cambiar moneda (respeta parciales); solo limpiar la no usada
  if (moneda === 'CUP') {
    var usdInput = document.getElementById('prov-monto-usd');
    if (usdInput) usdInput.value = 0;
  } else if (moneda === 'USD') {
    var cupInput2 = document.getElementById('prov-monto-cup');
    if (cupInput2) cupInput2.value = 0;
  }
  RN.paqueteProveedor.recalcular();
};

/** Rellena el pago para cubrir el saldo pendiente (en la moneda activa). */
RN.paqueteProveedor.usarSaldoCompleto = function () {
  var saldo = RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes() : RN.paqueteProveedor.calcMontoPaquete();
  var desc = parseFloat((document.getElementById('prov-descuento') || {}).value) || 0;
  var neto = Math.max(0, +(saldo - desc).toFixed(2));
  var mon = RN.paqueteProveedor._moneda;
  var tasa = RN.moneda.tasa();
  if (mon === 'CUP') {
    var cupIn = document.getElementById('prov-monto-cup');
    var usdIn = document.getElementById('prov-monto-usd');
    if (cupIn) cupIn.value = neto;
    if (usdIn) usdIn.value = 0;
  } else if (mon === 'USD') {
    var usdIn2 = document.getElementById('prov-monto-usd');
    var cupIn2 = document.getElementById('prov-monto-cup');
    if (usdIn2) usdIn2.value = tasa > 0 ? +(neto / tasa).toFixed(2) : 0;
    if (cupIn2) cupIn2.value = 0;
  } else {
    // Mixto: deja CUP con el neto (usuario reparte)
    var cupIn3 = document.getElementById('prov-monto-cup');
    if (cupIn3) cupIn3.value = neto;
  }
  RN.paqueteProveedor.recalcular();
};

/**
 * Si falta cubrir el saldo y solo hay una moneda, pasa a MIXTO y precarga
 * la otra moneda con el faltante convertido.
 */
RN.paqueteProveedor.completarConOtraMoneda = function () {
  var info = RN.paqueteProveedor._faltanteInfo;
  if (!info || !(info.faltaCUP > 0)) return;
  var tasa = RN.moneda.tasa() || 0;
  RN.paqueteProveedor.setMoneda('MIXTO');
  var usdIn = document.getElementById('prov-monto-usd');
  var cupIn = document.getElementById('prov-monto-cup');
  if (info.sugerir === 'USD' && tasa > 0) {
    if (usdIn) usdIn.value = +(info.faltaCUP / tasa).toFixed(2);
  } else if (info.sugerir === 'CUP') {
    if (cupIn) {
      var cupActual = parseFloat(cupIn.value) || 0;
      cupIn.value = +(cupActual + info.faltaCUP).toFixed(2);
    }
  }
  RN.paqueteProveedor.recalcular();
};

/** Recalcula el total del pago, descuento, parcial y aviso multi-moneda. */
RN.paqueteProveedor.recalcular = function () {
  var moneda = RN.paqueteProveedor._moneda;
  var megas = parseFloat((document.getElementById('prov-megas') || {}).value) || 0;
  var precioMega = parseFloat((document.getElementById('prov-precio-mega') || {}).value) || 0;
  var paquete = +(megas * precioMega).toFixed(2);
  var saldo = RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes() : paquete;
  // Si el usuario cambió megas/precio en el form, el saldo base es el nuevo paquete menos ya pagado
  var yaPagado = RN.calc.totalPagadoProveedorMes ? RN.calc.totalPagadoProveedorMes() : 0;
  var yaDesc = RN.calc.totalDescuentoProveedorMes ? RN.calc.totalDescuentoProveedorMes() : 0;
  if (paquete > 0) {
    saldo = Math.max(0, +(paquete - yaPagado - yaDesc).toFixed(2));
  }

  var saldoEl = document.getElementById('prov-saldo-mes');
  if (saldoEl) {
    var txt = 'Saldo pendiente este mes: <strong>' + RN.calc.formatCUP(saldo) + '</strong>';
    if (yaPagado > 0 || yaDesc > 0) {
      txt += ' <span class="muted">(ya pagado ' + RN.calc.formatCUP(yaPagado)
        + (yaDesc > 0 ? ' · descuentos ' + RN.calc.formatCUP(yaDesc) : '') + ')</span>';
    }
    saldoEl.innerHTML = txt;
  }

  var usd = parseFloat((document.getElementById('prov-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById('prov-monto-cup') || {}).value) || 0;
  var descuento = parseFloat((document.getElementById('prov-descuento') || {}).value) || 0;
  if (descuento < 0) descuento = 0;
  var tasa = RN.moneda.tasa();
  var totalCUP = +(cup + usd * tasa).toFixed(2);
  var cubre = +(totalCUP + descuento).toFixed(2);
  var falta = Math.max(0, +(saldo - cubre).toFixed(2));

  var desglose = document.getElementById('prov-desglose');
  if (!desglose) return;
  desglose.style.display = '';

  var html = '';
  if (megas > 0 && precioMega > 0) {
    html += '<div class="cobro-desglose-row"><strong>' + megas + ' Megas \u00d7 ' + precioMega + ' CUP/Mega = ' + RN.calc.formatCUP(paquete) + '</strong></div>';
  }
  if (moneda === 'MIXTO' && (usd > 0 || cup > 0)) {
    if (usd > 0) html += '<div class="cobro-desglose-row">USD ' + usd + ' \u00d7 ' + tasa + ' = ' + RN.calc.formatCUP(usd * tasa) + '</div>';
    if (cup > 0) html += '<div class="cobro-desglose-row">+ CUP ' + RN.calc.formatCUP(cup) + '</div>';
  } else if (moneda === 'USD' && usd > 0) {
    html += '<div class="cobro-desglose-row">USD ' + usd + ' \u00d7 ' + tasa + ' = ' + RN.calc.formatCUP(usd * tasa) + '</div>';
  } else if (moneda === 'CUP' && cup > 0) {
    html += '<div class="cobro-desglose-row">CUP ' + RN.calc.formatCUP(cup) + '</div>';
  }
  html += '<div class="cobro-desglose-row"><strong>Este pago: ' + RN.calc.formatCUP(totalCUP) + '</strong></div>';
  if (descuento > 0) {
    html += '<div class="cobro-desglose-row">Descuento: ' + RN.calc.formatCUP(descuento) + '</div>';
  }
  if (saldo > 0) {
    if (falta <= 0.01) {
      html += '<div class="cobro-desglose-row" style="color:var(--success)">Saldo cubierto \u2713' +
        (cubre > saldo + 0.01 ? ' (sobra ' + RN.calc.formatCUP(cubre - saldo) + ')' : '') + '</div>';
    } else if (totalCUP > 0 || descuento > 0) {
      html += '<div class="cobro-desglose-row" style="color:var(--danger)">Pago parcial · Falta ' + RN.calc.formatCUP(falta) + '</div>';
    } else {
      html += '<div class="cobro-desglose-row muted">Pendiente: ' + RN.calc.formatCUP(saldo) + '</div>';
    }
  }
  desglose.innerHTML = html;

  // Aviso: completar con la otra moneda
  var aviso = document.getElementById('prov-aviso-moneda');
  var btnComp = document.getElementById('prov-btn-completar-otra');
  RN.paqueteProveedor._faltanteInfo = null;
  if (aviso) {
    if (falta > 0.01 && (totalCUP > 0 || descuento > 0) && moneda !== 'MIXTO') {
      var sugerir = moneda === 'CUP' ? 'USD' : 'CUP';
      var detalle = '';
      if (sugerir === 'USD' && tasa > 0) {
        detalle = 'Puedes completar con \u2248 <strong>' + (falta / tasa).toFixed(2) + ' USD</strong> (tasa ' + tasa + ').';
      } else if (sugerir === 'CUP') {
        detalle = 'Puedes completar con <strong>' + RN.calc.formatCUP(falta) + '</strong> en CUP.';
      } else {
        detalle = 'Configura la tasa USD en Ajustes para convertir.';
      }
      aviso.innerHTML = '<div class="badge due" style="display:block;white-space:normal;line-height:1.4;padding:8px 10px">' +
        'Este pago en ' + moneda + ' no cubre el saldo. Faltan ' + RN.calc.formatCUP(falta) + '. ' + detalle +
        ' Usa <strong>Mixto</strong> o el botón de completar.</div>';
      RN.paqueteProveedor._faltanteInfo = { faltaCUP: falta, sugerir: sugerir };
      if (btnComp) {
        btnComp.style.display = '';
        btnComp.textContent = sugerir === 'USD' ? 'Completar con USD' : 'Completar con CUP';
      }
    } else {
      aviso.innerHTML = '';
      if (btnComp) btnComp.style.display = 'none';
    }
  }

  var btnPagar = document.getElementById('prov-btn-pagar');
  if (btnPagar) {
    if (totalCUP > 0 && falta > 0.01) btnPagar.textContent = '\ud83d\udcb3 Registrar pago parcial';
    else if (totalCUP > 0) btnPagar.textContent = '\ud83d\udcb3 Registrar pago';
    else btnPagar.textContent = '\ud83d\udcb3 Registrar pago';
  }
};

/** Confirma y registra el pago (total o parcial) del paquete. */
RN.paqueteProveedor.confirmar = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var fecha = (document.getElementById('prov-fecha') || {}).value || new Date().toISOString().slice(0, 10);
  var usd = parseFloat((document.getElementById('prov-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById('prov-monto-cup') || {}).value) || 0;
  var descuento = parseFloat((document.getElementById('prov-descuento') || {}).value) || 0;
  if (descuento < 0) descuento = 0;
  var moneda = RN.paqueteProveedor._moneda;
  var tasa = RN.moneda.tasa();
  var totalCUP = +(cup + usd * tasa).toFixed(2);

  if (!c.megas || c.megas <= 0) {
    RN.notifyUI.toast('Ingresa los megas contratados', 'error');
    return;
  }
  if (!c.precioMega || c.precioMega <= 0) {
    RN.notifyUI.toast('Ingresa el precio por mega', 'error');
    return;
  }
  if ((!totalCUP || totalCUP <= 0) && descuento <= 0) {
    RN.notifyUI.toast('Indica un monto a pagar o un descuento', 'error');
    return;
  }
  if (moneda === 'USD' && usd > 0 && !(tasa > 0)) {
    RN.notifyUI.toast('Configura la tasa USD en Ajustes', 'error');
    return;
  }

  var saldo = RN.calc.saldoProveedorMes ? RN.calc.saldoProveedorMes() : c.monto;
  // Ajustar saldo si el form cambió el paquete
  var paqueteForm = c.monto;
  var yaPagado = RN.calc.totalPagadoProveedorMes ? RN.calc.totalPagadoProveedorMes() : 0;
  var yaDesc = RN.calc.totalDescuentoProveedorMes ? RN.calc.totalDescuentoProveedorMes() : 0;
  if (paqueteForm > 0) saldo = Math.max(0, +(paqueteForm - yaPagado - yaDesc).toFixed(2));

  var cubre = +(totalCUP + descuento).toFixed(2);
  var esParcial = cubre + 0.01 < saldo;
  var falta = Math.max(0, +(saldo - cubre).toFixed(2));

  // Si paga solo en una moneda y no cubre: avisar y pedir confirmación o mixto
  if (esParcial && moneda !== 'MIXTO' && totalCUP > 0 && !RN.paqueteProveedor._parcialOk) {
    var msg = 'Pago parcial: faltan ' + RN.calc.formatCUP(falta);
    if (moneda === 'CUP' && tasa > 0) {
      msg += ' (puedes completar con \u2248 ' + (falta / tasa).toFixed(2) + ' USD).';
    } else if (moneda === 'USD') {
      msg += ' (puedes completar con ' + RN.calc.formatCUP(falta) + ' en CUP).';
    }
    msg += ' ¿Registrar igual como parcial?';
    if (RN.uiComponents && RN.uiComponents.confirm) {
      RN.uiComponents.confirm('Pago parcial del proveedor', msg, function () {
        RN.paqueteProveedor._parcialOk = true;
        RN.paqueteProveedor.confirmar();
        RN.paqueteProveedor._parcialOk = false;
      });
      return;
    }
  }

  RN.state.config.proveedorInternet = c.proveedor;
  RN.state.config.proveedorMonto = c.monto;
  RN.state.config.proveedorMegas = c.megas;
  RN.state.config.proveedorPrecioMega = c.precioMega;
  RN.state.config.plusMegas = Math.max(0, +c.plus || 0);

  var concepto = (esParcial ? 'Pago parcial servicio internet' : 'Pago servicio internet')
    + (c.proveedor ? ' \u2014 ' + c.proveedor : '');
  if (descuento > 0) concepto += ' (desc. ' + RN.calc.formatCUP(descuento) + ')';

  // Solo registrar gasto si hay salida de caja
  if (totalCUP > 0) {
    RN.state.gastos.push({
      id: RN.calc.uid('gasto'),
      fecha: fecha + 'T00:00:00',
      mes: fecha.slice(0, 7),
      concepto: concepto,
      monto: totalCUP,
      categoria: 'Internet proveedor',
      moneda: moneda,
      montoPagadoUSD: usd,
      montoPagadoCUP: cup,
      descuentoProveedor: descuento,
      montoPaquete: c.monto,
      megas: c.megas,
      precioMega: c.precioMega,
      esPagoProveedor: true,
      esParcialProveedor: esParcial,
      tasaUsd: tasa
    });
  } else if (descuento > 0) {
    // Solo descuento: registro en gastos con monto 0 para historial del saldo
    RN.state.gastos.push({
      id: RN.calc.uid('gasto'),
      fecha: fecha + 'T00:00:00',
      mes: fecha.slice(0, 7),
      concepto: 'Descuento proveedor' + (c.proveedor ? ' \u2014 ' + c.proveedor : ''),
      monto: 0,
      categoria: 'Internet proveedor',
      moneda: 'CUP',
      descuentoProveedor: descuento,
      montoPaquete: c.monto,
      megas: c.megas,
      precioMega: c.precioMega,
      esPagoProveedor: true,
      esSoloDescuentoProveedor: true
    });
  }

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  var toast = esParcial
    ? ('Pago parcial registrado. Quedan ' + RN.calc.formatCUP(falta))
    : ('Pago de servicio registrado (' + c.megas + 'M \u00d7 ' + c.precioMega + ' CUP/M)');
  RN.notifyUI.toast(toast, 'success');
  RN.render.gastos();
  RN.render.dashboard();
  RN.render.todo();
  if (RN.render.realizados) RN.render.realizados();
};

RN.paqueteProveedor.guardarCambios = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var reserva = isNaN(c.reserva) ? 1 : c.reserva;

  if (!c.megas || c.megas <= 0) {
    RN.notifyUI.toast('Ingresa los megas contratados', 'error');
    return;
  }
  if (!c.precioMega || c.precioMega <= 0) {
    RN.notifyUI.toast('Ingresa el precio por mega', 'error');
    return;
  }

  var vig = RN.paqueteProveedor._vigencia;
  if (vig === 'este') {
    // Aplicar inmediatamente
    RN.state.config.proveedorInternet = c.proveedor;
    RN.state.config.proveedorMegas = c.megas;
    RN.state.config.proveedorPrecioMega = c.precioMega;
    RN.state.config.proveedorMonto = c.monto;
    RN.state.config.plusMegas = Math.max(0, +c.plus || 0);
    RN.state.config.reservaMegas = reserva;
    // Limpiar cualquier pendiente anterior (ya se aplicó)
    RN.state.config.paquetePendiente = null;
    // v5.13.5 (ISSUE #22): Eliminar persistir() redundante.
    RN.storageLocal.guardar();
    RN.uiComponents.cerrarModal();
    RN.notifyUI.toast('Paquete actualizado para este mes: ' + c.megas + 'M \u00d7 ' + c.precioMega + ' CUP/M', 'success');
    RN.render.dashboard();
    RN.render.todo();
  } else {
    // Guardar como pendiente para el próximo mes
    RN.state.config.paquetePendiente = {
      proveedor: c.proveedor,
      megas: c.megas,
      precioMega: c.precioMega,
      plus: Math.max(0, +c.plus || 0),
      reserva: reserva
    };
    // v5.13.5 (ISSUE #22): Eliminar persistir() redundante.
    RN.storageLocal.guardar();
    var mesProx = RN.calc.mesSiguiente(RN.calc.mesActualStr());
    RN.uiComponents.cerrarModal();
    RN.notifyUI.toast('Cambio guardado para ' + RN.calc.mesTexto(mesProx) + ': ' + c.megas + 'M \u00d7 ' + c.precioMega + ' CUP/M', 'success');
    RN.render.dashboard();
    RN.render.todo();
  }
};
