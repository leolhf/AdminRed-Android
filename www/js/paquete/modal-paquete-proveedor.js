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

/** Lee los campos del modal y devuelve un objeto {proveedor, megas, precioMega, sobreventa, monto}. */
RN.paqueteProveedor.leerCampos = function () {
  return {
    proveedor: ((document.getElementById('prov-nombre') || {}).value || '').trim(),
    megas: parseFloat((document.getElementById('prov-megas') || {}).value) || 0,
    precioMega: parseFloat((document.getElementById('prov-precio-mega') || {}).value) || 0,
    sobreventa: parseFloat((document.getElementById('prov-sobreventa') || {}).value),
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
         (isNaN(c.sobreventa) ? 5 : c.sobreventa) !== (+cfg.sobreventaMegas || 0);
};

/** Actualiza el aviso de capacidad dentro del modal (en vivo). v5.12.4 */
RN.paqueteProveedor.actualizarAviso = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var sobreventa = isNaN(c.sobreventa) ? 5 : c.sobreventa;
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

  var vendidos = RN.calc.megasVendidos();
  var tope = c.megas + sobreventa;
  var excedido = tope > 0 && vendidos > tope;
  var pct = tope > 0 ? Math.min(100, Math.round(vendidos / tope * 100)) : 0;
  var estadoTxt = excedido
    ? '<strong style="color:#c62828">\u26a0 Excedido: vendes ' + vendidos + 'M y tu tope es ' + tope + 'M</strong>. Reduce clientes o sube la sobreventa.'
    : (pct >= 80
        ? '<strong style="color:#e6a700">Cerca del tope: ' + vendidos + 'M / ' + tope + 'M (' + pct + '%)</strong>. Vigila tu capacidad.'
        : '<strong style="color:#2e7d32">\u2713 Capacidad ok: ' + vendidos + 'M vendidos / ' + tope + 'M disponibles (' + pct + '%)</strong>.');
  aviso.innerHTML = 'Tope vendible: <strong>' + tope + 'M</strong> (' + c.megas + 'M paquete + ' + sobreventa + 'M sobreventa) \u00b7 ' + estadoTxt;
  aviso.className = 'prov-cap-aviso' + (excedido ? ' prov-cap-alert' : (pct >= 80 ? ' prov-cap-warn' : ' prov-cap-ok'));

  // Actualizar tambien el desglose del pago si existe
  RN.paqueteProveedor.recalcular();
};

/** Abre el modal de gestión del proveedor. */
RN.paqueteProveedor.abrir = function () {
  var cfg = RN.state.config;
  var sobreventa = (cfg.sobreventaMegas === undefined || cfg.sobreventaMegas === null) ? 5 : cfg.sobreventaMegas;
  var html =
    '<div class="modal-header"><h3>\ud83d\udce1 Gestionar mi servicio de internet</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>' +
    '<div class="modal-body">' +
      '<p class="muted" style="margin-bottom:12px;font-size:13px">Aquí ajustas los datos del paquete de tu proveedor: <strong>megas, precio por mega y sobreventa</strong>. Si haces un cambio, decide si es <strong>vigente desde este mes</strong> o <strong>desde el próximo</strong>. También puedes registrar el pago mensual.</p>' +

      '<div class="form-row"><div><label>Proveedor de internet</label>' +
      '<input type="text" id="prov-nombre" placeholder="Ej: ETECSA, FiberNet..." value="' + RN.render.esc(cfg.proveedorInternet || '') + '"></div></div>' +

      '<div class="form-row cols-2"><div><label>Megas contratados (Mbps)</label>' +
      '<input type="number" id="prov-megas" step="1" min="0" placeholder="Ej: 50" value="' + (cfg.proveedorMegas || 0) + '" oninput="RN.paqueteProveedor.actualizarAviso()"></div>' +
      '<div><label>Precio por mega (CUP/Mbps)</label>' +
      '<input type="number" id="prov-precio-mega" step="0.01" min="0" placeholder="Ej: 25" value="' + (cfg.proveedorPrecioMega || 0) + '" oninput="RN.paqueteProveedor.actualizarAviso()"></div></div>' +

      '<div class="form-row cols-2"><div><label>Sobreventa permitida (Mbps extra)</label>' +
      '<input type="number" id="prov-sobreventa" step="1" min="0" placeholder="5" value="' + sobreventa + '" oninput="RN.paqueteProveedor.actualizarAviso()"></div>' +
      '<div><label>Monto mensual calculado</label>' +
      '<div id="prov-monto-calc" style="font-size:18px;font-weight:700;padding-top:6px">' + RN.calc.formatCUP(RN.calc.montoPaqueteProveedor()) + '</div></div></div>' +

      '<div id="prov-aviso-capacidad" class="prov-cap-aviso muted" style="margin-bottom:16px"></div>' +

      // --- Sección de vigencia ---
      '<div class="form-row" id="prov-seccion-vigencia"><div><label>\u23f1 Vigencia de los cambios</label>' +
      '<div style="display:flex;gap:8px;margin-top:4px">' +
        '<button class="cobro-moneda-btn active" id="prov-vig-este" onclick="RN.paqueteProveedor.setVigencia(\'este\')">Vigente desde este mes</button>' +
        '<button class="cobro-moneda-btn" id="prov-vig-proximo" onclick="RN.paqueteProveedor.setVigencia(\'proximo\')">Vigente desde el pr\u00f3ximo mes</button>' +
      '</div>' +
      '<p class="muted" id="prov-vig-info" style="margin-top:6px;font-size:12px">Los cambios se aplican inmediatamente al paquete actual.</p>' +
      '</div></div>' +

      // --- Sección de pago ---
      '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">' +
      '<div class="form-row"><div><label>Fecha de pago</label>' +
      '<input type="date" id="prov-fecha" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>' +

      '<div class="form-row"><div><label>Moneda de pago</label>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="cobro-moneda-btn active" id="prov-moneda-cup" onclick="RN.paqueteProveedor.setMoneda(\'CUP\')">CUP</button>' +
        '<button class="cobro-moneda-btn" id="prov-moneda-usd" onclick="RN.paqueteProveedor.setMoneda(\'USD\')">USD</button>' +
        '<button class="cobro-moneda-btn" id="prov-moneda-mixto" onclick="RN.paqueteProveedor.setMoneda(\'MIXTO\')">Mixto</button>' +
      '</div></div></div>' +

      '<div class="form-row" id="prov-grupo-usd" style="display:none"><div><label>Monto en USD</label>' +
      '<input type="number" id="prov-monto-usd" step="0.01" placeholder="0" value="0" oninput="RN.paqueteProveedor.recalcular()"></div></div>' +

      '<div class="form-row"><div><label>Monto en CUP</label>' +
      '<input type="number" id="prov-monto-cup" step="0.01" placeholder="0" value="0" oninput="RN.paqueteProveedor.recalcular()"></div></div>' +

      '<div id="prov-desglose" style="background:var(--bg-alt);padding:12px;border-radius:8px;margin-bottom:12px;display:none"></div>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
      '<button class="btn" onclick="RN.paqueteProveedor.guardarCambios()">\ud83d\udcbe Guardar cambios</button>' +
      '<button class="btn primary" onclick="RN.paqueteProveedor.confirmar()">\ud83d\udcb3 Registrar pago</button>' +
    '</div>';

  RN.uiComponents.modal(html);
  RN.paqueteProveedor._moneda = 'CUP';
  RN.paqueteProveedor._vigencia = 'este';
  // Precargar el monto en CUP con el cálculo automático
  var montoAuto = RN.paqueteProveedor.calcMontoPaquete();
  var cupInput = document.getElementById('prov-monto-cup');
  if (cupInput) cupInput.value = montoAuto;
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
  if (grupoUsd) grupoUsd.style.display = (moneda === 'USD' || moneda === 'MIXTO') ? '' : 'none';
  if (moneda === 'CUP') {
    var usdInput = document.getElementById('prov-monto-usd');
    if (usdInput) usdInput.value = 0;
    var cupInput = document.getElementById('prov-monto-cup');
    if (cupInput) cupInput.value = RN.paqueteProveedor.calcMontoPaquete();
  } else if (moneda === 'USD') {
    var cupInput2 = document.getElementById('prov-monto-cup');
    if (cupInput2) cupInput2.value = 0;
  }
  RN.paqueteProveedor.recalcular();
};

/** Recalcula el total del pago y muestra el desglose. */
RN.paqueteProveedor.recalcular = function () {
  var moneda = RN.paqueteProveedor._moneda;
  var megas = parseFloat((document.getElementById('prov-megas') || {}).value) || 0;
  var precioMega = parseFloat((document.getElementById('prov-precio-mega') || {}).value) || 0;
  var paquete = +(megas * precioMega).toFixed(2);

  if (moneda === 'CUP') {
    var cupInput = document.getElementById('prov-monto-cup');
    if (cupInput) cupInput.value = paquete;
  }

  var usd = parseFloat((document.getElementById('prov-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById('prov-monto-cup') || {}).value) || 0;
  var tasa = RN.moneda.tasa();
  var totalCUP = +(cup + usd * tasa).toFixed(2);

  var desglose = document.getElementById('prov-desglose');
  if (!desglose) return;
  desglose.style.display = '';

  var html = '';
  if (megas > 0 && precioMega > 0) {
    html += '<div class="cobro-desglose-row"><strong>' + megas + ' Megas \u00d7 ' + precioMega + ' CUP/Mega = ' + RN.calc.formatCUP(paquete) + '</strong></div>';
  } else if (megas > 0 || precioMega > 0) {
    html += '<div class="cobro-desglose-row muted">Completa megas y precio por mega para calcular el monto</div>';
  }

  if (moneda === 'MIXTO' && usd > 0 && cup > 0) {
    html += '<div class="cobro-desglose-row">USD ' + usd + ' \u00d7 ' + tasa + ' = ' + (usd * tasa).toFixed(2) + ' CUP</div>';
    html += '<div class="cobro-desglose-row">+ CUP ' + cup + '</div>';
  } else if (moneda === 'USD' && usd > 0) {
    html += '<div class="cobro-desglose-row">USD ' + usd + ' \u00d7 ' + tasa + ' = ' + RN.calc.formatCUP(usd * tasa) + '</div>';
  }

  html += '<div class="cobro-desglose-row"><strong>Total a pagar: ' + RN.calc.formatCUP(totalCUP) + '</strong></div>';

  if (paquete) {
    var color = totalCUP >= paquete ? '#2e7d32' : '#c62828';
    var txt = totalCUP >= paquete ? 'Cubierto \u2713' : 'Falta ' + RN.calc.formatCUP(paquete - totalCUP);
    html += '<div class="cobro-desglose-row" style="color:' + color + '">Paquete: ' + RN.calc.formatCUP(paquete) + ' \u00b7 ' + txt + '</div>';
  }
  desglose.innerHTML = html;
};

/**
 * v5.12.4 — Guarda los cambios del paquete sin pagar.
 * Si vigencia = "este" → aplica inmediatamente a RN.state.config.
 * Si vigencia = "próximo" → guarda en RN.state.config.paquetePendiente.
 */
RN.paqueteProveedor.guardarCambios = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var sobreventa = isNaN(c.sobreventa) ? 5 : c.sobreventa;

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
    RN.state.config.sobreventaMegas = sobreventa;
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
      sobreventa: sobreventa
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

/** Confirma y registra el pago del paquete vigente actual como gasto. */
RN.paqueteProveedor.confirmar = function () {
  var c = RN.paqueteProveedor.leerCampos();
  var fecha = (document.getElementById('prov-fecha') || {}).value || new Date().toISOString().slice(0, 10);
  var usd = parseFloat((document.getElementById('prov-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById('prov-monto-cup') || {}).value) || 0;
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
  if (!totalCUP || totalCUP <= 0) {
    RN.notifyUI.toast('El total a pagar debe ser mayor que 0', 'error');
    return;
  }

  // Al pagar, también se actualiza la config vigente (el paquete que se paga
  // es el paquete actual). Si hay un cambio pendiente, no lo tocamos.
  RN.state.config.proveedorInternet = c.proveedor;
  RN.state.config.proveedorMonto = c.monto;
  RN.state.config.proveedorMegas = c.megas;
  RN.state.config.proveedorPrecioMega = c.precioMega;
  // v5.13.5 (ISSUE #22): Eliminar persistir() y guardar() aquí; se consolidará
  // en un solo guardar() tras agregar el gasto (evita triple escritura).

  var gasto = {
    id: RN.calc.uid('gasto'),
    // v5.13.5 (ISSUE #21): Construir fecha ISO sin conversión de timezone.
    fecha: fecha + 'T00:00:00',
    mes: fecha.slice(0, 7),
    concepto: 'Pago servicio internet' + (c.proveedor ? ' \u2014 ' + c.proveedor : ''),
    monto: totalCUP,
    categoria: 'Internet proveedor',
    moneda: moneda,
    montoPagadoUSD: usd,
    montoPagadoCUP: cup,
    montoPaquete: c.monto,
    megas: c.megas,
    precioMega: c.precioMega,
    esPagoProveedor: true
  };

  RN.state.gastos.push(gasto);
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('Pago de servicio registrado (' + c.megas + 'M \u00d7 ' + c.precioMega + ' CUP/M)', 'success');
  RN.render.gastos();
  RN.render.dashboard();
  RN.render.todo();
  if (RN.render.realizados) RN.render.realizados();
};
