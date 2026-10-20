/**
 * cobros/inventario.js — Compra de inventario (con moneda CUP/USD/MIXTO),
 * asignación/venta a clientes con precio de venta auto-calculado (20% sobre
 * costo, editable) y pago en diferentes monedas, y método FIFO para el
 * descuento de stock entre múltiples lotes del mismo producto.
 *
 * v5.12.0 (Decisiones 1a, 2b, 3b, 4a, 5a):
 *  - Compra: bloque de moneda CUP/USD/MIXTO (cómo se pagó la compra).
 *  - Agrupación por producto (material): se puede "comprar más del mismo
 *    producto", creando un nuevo lote que se añade al producto existente.
 *  - FIFO: al vender, se descuenta primero del lote más antiguo con stock.
 *    El precio de costo es el del lote que se está vendiendo (4a).
 *  - Ganancia: precio de venta pre-llenado = costo × (1 + pct/100), editable (2b).
 *    El % es configurable en Ajustes (default 20) (3b).
 *  - Venta: el usuario elige el PRODUCTO (no el lote); el sistema reparte
 *    la cantidad entre lotes con FIFO y calcula la ganancia real por lote.
 *  - Pago de la venta: bloque de moneda CUP/USD/MIXTO (igual que cobros).
 */
RN.inventario = RN.inventario || {};

/* ============================================================
   COMPRA DE INVENTARIO (NUEVO LOTE)
   ============================================================ */

/** Recalcula el costo total del lote a partir de cantidad × costo unitario. */
RN.inventario._recalcCostoLote = function () {
  var cant = parseFloat((document.getElementById('lot-cant') || {}).value) || 0;
  var costoU = parseFloat((document.getElementById('lot-costo-u') || {}).value) || 0;
  var total = +(cant * costoU).toFixed(2);
  var elTot = document.getElementById('lot-costo-tot');
  if (elTot) elTot.value = total ? RN.calc.formatCUP(total) : '';
  RN.moneda.recalcBloquePago('lot-pago');
  RN.inventario._actualizarAvisoCaja();
};

/** Muestra saldos de caja y aviso si no alcanza (propuesta mixto). */
RN.inventario._actualizarAvisoCaja = function () {
  var box = document.getElementById('lot-caja-aviso');
  if (!box) return;
  var credito = !!(document.getElementById('lot-a-credito') || {}).checked;
  if (credito) {
    box.innerHTML = '<div class="muted" style="font-size:12px">A crédito: el stock entra y <strong>no sale dinero de caja</strong> hasta que registres el pago.</div>';
    box.style.display = 'block';
    return;
  }
  var cant = parseFloat((document.getElementById('lot-cant') || {}).value) || 0;
  var costoU = parseFloat((document.getElementById('lot-costo-u') || {}).value) || 0;
  var total = +(cant * costoU).toFixed(2);
  var s = RN.calc.saldosMoneda ? RN.calc.saldosMoneda() : { cup: 0, usd: 0, tasa: RN.moneda.tasa() };
  var pago = RN.moneda.leerBloquePago('lot-pago', total);
  var html = '<div class="muted" style="font-size:12px;margin-bottom:6px">En caja ahora: <strong>' +
    RN.calc.formatCUP(s.cup || 0) + '</strong> CUP · <strong>$' + (+(s.usd || 0)).toFixed(2) + '</strong> USD</div>';
  if (total <= 0) {
    box.innerHTML = html;
    box.style.display = 'block';
    return;
  }
  var falta = +(total - (pago.totalRecibidoCUP || 0)).toFixed(2);
  if (falta > 0.01) {
    var tasa = pago.tasaUsd || RN.moneda.tasa() || 0;
    html += '<div style="font-size:12px;color:var(--amber)">Falta cubrir ' + RN.calc.formatCUP(falta);
    if (tasa > 0) {
      html += ' · ≈ $' + (falta / tasa).toFixed(2) + ' USD a tasa ' + tasa;
      html += ' <button type="button" class="btn sm" style="margin-left:6px" onclick="RN.inventario.completarConOtraMoneda()">Completar con otra moneda</button>';
    }
    html += '</div>';
  }
  // Validación física
  var val = RN.inventario._validarSalidaCaja(pago, total);
  if (!val.ok && val.motivo) {
    html += '<div style="font-size:12px;color:var(--danger);margin-top:4px">' + RN.render.esc(val.motivo) + '</div>';
    if (val.sugerencia) {
      html += '<div style="font-size:12px;margin-top:4px">' + val.sugerencia +
        ' <button type="button" class="btn sm primary" onclick="RN.inventario.completarConOtraMoneda()">Aplicar sugerencia</button></div>';
    }
  } else if (falta <= 0.01) {
    html += '<div style="font-size:12px;color:var(--success)">✓ Pago cubierto; al guardar <strong>sale de caja</strong>.</div>';
  }
  box.innerHTML = html;
  box.style.display = 'block';
};

/**
 * Valida que haya billetes suficientes de cada moneda para la salida.
 * @returns {{ok:boolean, motivo:string, sugerencia:string, faltaCUP:number, sugerir:string}}
 */
RN.inventario._validarSalidaCaja = function (pago, totalCUP) {
  pago = pago || {};
  var usd = +(pago.montoUSD || 0);
  var cup = +(pago.montoCUP || 0);
  var s = RN.calc.saldosMoneda ? RN.calc.saldosMoneda() : { cup: 0, usd: 0, tasa: 0 };
  var tasa = pago.tasaUsd || s.tasa || RN.moneda.tasa() || 0;
  var res = { ok: true, motivo: '', sugerencia: '', faltaCUP: 0, sugerir: '' };

  if (usd > (s.usd || 0) + 0.01) {
    res.ok = false;
    res.motivo = 'Solo hay $' + (+(s.usd || 0)).toFixed(2) + ' USD en caja y quieres usar $' + usd.toFixed(2) + ' USD.';
    var faltanU = +(usd - (s.usd || 0)).toFixed(2);
    if (tasa > 0) {
      var costo = +(faltanU * tasa).toFixed(2);
      if (cup + costo <= (s.cup || 0) + 0.01) {
        res.sugerencia = 'Puedes bajar a $' + (+(s.usd || 0)).toFixed(2) + ' USD y completar ' + RN.calc.formatCUP(costo) + ' en CUP.';
        res.sugerir = 'CUP';
        res.faltaCUP = costo;
      }
    }
    return res;
  }
  if (cup > (s.cup || 0) + 0.01) {
    res.ok = false;
    res.motivo = 'Solo hay ' + RN.calc.formatCUP(s.cup || 0) + ' CUP en caja y quieres usar ' + RN.calc.formatCUP(cup) + '.';
    var faltanC = +(cup - (s.cup || 0)).toFixed(2);
    if (tasa > 0) {
      var usdNec = +(faltanC / tasa).toFixed(2);
      if (usd + usdNec <= (s.usd || 0) + 0.01) {
        res.sugerencia = 'Puedes usar todo el CUP disponible (' + RN.calc.formatCUP(s.cup || 0) +
          ') y completar ≈ $' + usdNec + ' USD.';
        res.sugerir = 'USD';
        res.faltaCUP = faltanC;
      }
    }
    return res;
  }
  // Cubrir total en equivalente
  var pagado = +(pago.totalRecibidoCUP || 0);
  if (totalCUP > 0 && pagado + 0.01 < totalCUP) {
    res.ok = false;
    res.motivo = 'El pago no cubre el total de la compra (' + RN.calc.formatCUP(totalCUP) + ').';
    res.faltaCUP = +(totalCUP - pagado).toFixed(2);
    res.sugerir = (cup >= (s.cup || 0) - 0.01 && tasa > 0) ? 'USD' : 'CUP';
  }
  return res;
};

/** Pasa a MIXTO y precarga la otra moneda con el faltante. */
RN.inventario.completarConOtraMoneda = function () {
  var cant = parseFloat((document.getElementById('lot-cant') || {}).value) || 0;
  var costoU = parseFloat((document.getElementById('lot-costo-u') || {}).value) || 0;
  var total = +(cant * costoU).toFixed(2);
  var s = RN.calc.saldosMoneda ? RN.calc.saldosMoneda() : { cup: 0, usd: 0, tasa: 0 };
  var tasa = RN.moneda.tasa() || 0;
  if (tasa <= 0) {
    RN.notifyUI.toast('Configura la tasa USD en Ajustes para completar en la otra moneda', 'warn');
    return;
  }
  var cupDisp = Math.max(0, +(s.cup || 0));
  var usdDisp = Math.max(0, +(s.usd || 0));

  // Mostrar botón Mixto del bloque (viene oculto por defecto)
  var mixBtn = document.querySelector('#lot-pago-moneda-toggle [data-moneda="MIXTO"]');
  if (mixBtn) mixBtn.style.display = '';

  RN.moneda.setMonedaBloque('lot-pago', 'MIXTO');

  // Estrategia: usar CUP disponible hasta el total; resto en USD
  var cupUsar = Math.min(cupDisp, total);
  var falta = +(total - cupUsar).toFixed(2);
  var usdUsar = falta > 0 ? +(falta / tasa).toFixed(2) : 0;
  if (usdUsar > usdDisp + 0.01) {
    usdUsar = Math.min(usdDisp, +(total / tasa).toFixed(2));
    cupUsar = Math.min(cupDisp, Math.max(0, +(total - usdUsar * tasa).toFixed(2)));
  }

  var cupIn = document.getElementById('lot-pago-monto-cup');
  var usdIn = document.getElementById('lot-pago-monto-usd');
  if (cupIn) cupIn.value = cupUsar > 0 ? cupUsar : '';
  if (usdIn) usdIn.value = usdUsar > 0 ? usdUsar : '';
  RN.moneda.recalcBloquePago('lot-pago');
  RN.inventario._actualizarAvisoCaja();
  RN.notifyUI.toast('Pago mixto según lo disponible en caja', 'info', 4000);
};

/**
 * Abre el modal para comprar un nuevo lote de inventario.
 * Si se pasa `materialExistente`, precarga ese material (flujo "comprar más").
 */
RN.inventario.abrirNuevoLote = function (materialExistente) {
  var precargarMat = materialExistente || '';
  var s = RN.calc.saldosMoneda ? RN.calc.saldosMoneda() : { cup: 0, usd: 0 };
  var html = '\
    <div class="modal-header"><h3>Compra de inventario</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>\
    <div class="modal-body">\
      <div class="form-row"><div><label>Material / Producto *</label><input id="lot-material" placeholder="Ej: Cable UTP cat6, Router TP-Link..." value="' + RN.render.esc(precargarMat) + '" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div></div>\
      ' + (precargarMat ? '<div class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:12px"><span class="muted">Comprando más de <strong>' + RN.render.esc(precargarMat) + '</strong>. Nuevo lote (FIFO).</span></div>' : '') + '\
      <div class="form-row cols-2">\
        <div><label>Cantidad comprada *</label><input id="lot-cant" type="number" min="1" step="1" value="1" oninput="RN.inventario._recalcCostoLote()"></div>\
        <div><label>Notas</label><input id="lot-notas" placeholder="proveedor, factura..." spellcheck="true" autocorrect="on" autocapitalize="sentences"></div>\
      </div>\
      <div class="form-row cols-2">\
        <div><label>Costo unitario (CUP) *</label><input id="lot-costo-u" type="number" step="0.01" min="0" placeholder="0.00" oninput="RN.inventario._recalcCostoLote()"></div>\
        <div><label>Costo total de la compra</label><input id="lot-costo-tot" readonly placeholder="0.00 CUP" style="font-weight:700"></div>\
      </div>\
      <div class="divider"></div>\
      <label class="flex" style="align-items:center;gap:8px;margin-bottom:10px;font-size:13px">\
        <input type="checkbox" id="lot-a-credito" onchange="RN.inventario._actualizarAvisoCaja()">\
        <span>A crédito (no sale de caja ahora)</span>\
      </label>\
      <div class="muted" style="font-size:13px;margin-bottom:8px">¿Cómo se paga esta compra? (sale de caja)</div>\
      ' + RN.moneda.bloquePagoHTML('lot-pago', { titulo: 'Pago de la compra', autoCUP: true }) + '\
      <div id="lot-caja-aviso" class="cobro-desglose" style="margin-top:10px;display:none"></div>\
    </div>\
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>\
      <button class="btn primary" onclick="RN.inventario.guardarLote()">Guardar compra</button></div>';
  RN.uiComponents.modal(html);
  RN.inventario._recalcCostoLote();
  RN.moneda.configBloquePago('lot-pago', function () {
    var cant = parseFloat((document.getElementById('lot-cant') || {}).value) || 0;
    var costoU = parseFloat((document.getElementById('lot-costo-u') || {}).value) || 0;
    return +(cant * costoU).toFixed(2);
  }, true);
  // Recalcular aviso al cambiar montos
  ['lot-pago-monto-cup', 'lot-pago-monto-usd'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function () { RN.inventario._actualizarAvisoCaja(); });
    }
  });
  var mixBtn = document.querySelector('#lot-pago-moneda-toggle [data-moneda="MIXTO"]');
  if (mixBtn) mixBtn.style.display = '';
  RN.moneda.recalcBloquePago('lot-pago');
  RN.inventario._actualizarAvisoCaja();
};

RN.inventario.guardarLote = function () {
  const material = document.getElementById('lot-material').value.trim();
  if (!material) { RN.notifyUI.toast('El material es obligatorio', 'error'); return; }
  const cant = parseInt(document.getElementById('lot-cant').value, 10) || 0;
  if (cant <= 0) { RN.notifyUI.toast('La cantidad debe ser mayor que 0', 'error'); return; }
  const costoU = parseFloat(document.getElementById('lot-costo-u').value) || 0;
  if (costoU < 0) { RN.notifyUI.toast('El costo unitario no es válido', 'error'); return; }
  const costoTotal = +(cant * costoU).toFixed(2);
  const aCredito = !!(document.getElementById('lot-a-credito') || {}).checked;

  const pago = RN.moneda.leerBloquePago('lot-pago', costoTotal);

  // Pagado desde caja: validar cobertura y saldos físicos
  if (!aCredito && costoTotal > 0) {
    if (!(pago.totalRecibidoCUP > 0) || (pago.totalRecibidoCUP + 0.01 < costoTotal)) {
      RN.inventario._actualizarAvisoCaja();
      RN.notifyUI.toast('El pago no cubre el total. Completa con la otra moneda o marca a crédito.', 'warn');
      return;
    }
    var val = RN.inventario._validarSalidaCaja(pago, costoTotal);
    if (!val.ok) {
      RN.inventario._actualizarAvisoCaja();
      RN.notifyUI.toast(val.motivo || 'No hay saldo suficiente en caja', 'warn');
      return;
    }
  }

  var loteId = RN.calc.uid('lot');
  var lote = {
    id: loteId,
    material: material,
    cantidad: cant,
    costoUnitario: costoU,
    costoTotal: costoTotal,
    notas: (document.getElementById('lot-notas') || {}).value.trim(),
    fecha: new Date().toISOString(),
    monedaPago: aCredito ? 'CREDITO' : (pago.moneda || 'CUP'),
    montoPagoUSD: aCredito ? 0 : (pago.montoUSD || 0),
    montoPagoCUP: aCredito ? 0 : (pago.montoCUP || 0),
    montoPagoCUPDesdeUSD: aCredito ? 0 : (pago.montoCUPDesdeUSD || 0),
    totalPagoCUP: aCredito ? 0 : (pago.totalRecibidoCUP || 0),
    tasaUsdCompra: pago.tasaUsd || 0,
    aCredito: !!aCredito
  };

  // v5.55.32: si se paga ahora, SIEMPRE registrar gasto → rebaja caja
  if (!aCredito && costoTotal > 0) {
    RN.state.gastos = RN.state.gastos || [];
    var fecha = new Date().toISOString().slice(0, 10);
    var gastoId = RN.calc.uid('gasto');
    RN.state.gastos.push({
      id: gastoId,
      concepto: 'Compra inventario — ' + material,
      monto: costoTotal,
      categoria: 'Inventario / material',
      fecha: fecha + 'T00:00:00',
      mes: fecha.slice(0, 7),
      moneda: pago.moneda || 'CUP',
      montoPagadoUSD: pago.montoUSD || 0,
      montoPagadoCUP: pago.montoCUP || 0,
      tasaUsd: pago.tasaUsd || 0,
      esCompraInventario: true,
      loteInventarioId: loteId
    });
    lote.gastoCompraId = gastoId;
  }

  RN.state.inventario = RN.state.inventario || [];
  RN.state.inventario.push(lote);
  try { RN.storageLocal.guardar(); } catch (e) {}
  RN.uiComponents.cerrarModal();
  if (RN.render && RN.render.inventario) RN.render.inventario();
  if (RN.render && RN.render.gastos) RN.render.gastos();
  if (RN.render && RN.render.caja) RN.render.caja();
  if (RN.render && RN.render.dashboard) RN.render.dashboard();

  var msg = aCredito
    ? ('Lote a crédito: ' + cant + ' × ' + material + ' (sin salida de caja)')
    : ('Compra: ' + cant + ' × ' + material + ' · ' + RN.calc.formatCUP(costoTotal) + ' salió de caja');
  RN.notifyUI.toast(msg, 'success');
};

/* ============================================================
   ASIGNAR / VENDER INVENTARIO (por producto, FIFO)
   ============================================================ */

/**
 * Recalcula el total de venta y la ganancia al asignar (cantidad × precio unitario).
 * Ahora usa el costo vigente FIFO del producto (lote más antiguo con stock).
 */
RN.inventario._recalcVentaAsig = function () {
  var cant = parseInt((document.getElementById('asig-cant') || {}).value, 10) || 0;
  var precioU = parseFloat((document.getElementById('asig-precio-u') || {}).value) || 0;
  var total = +(cant * precioU).toFixed(2);
  var elTot = document.getElementById('asig-precio-tot');
  if (elTot) elTot.value = total ? RN.calc.formatCUP(total) : '';
  // Ganancia estimada: costo vigente FIFO del producto
  var material = (document.getElementById('asig-material') || {}).value || '';
  var costoVigente = RN.inventarioModel.costoVigentePorNombre(material);
  // Si la cantidad excede el lote más antiguo, estimar con costo promedio FIFO
  var desgloseEstim = RN.inventarioModel.repartirFIFO(material, cant);
  var costoEstim = desgloseEstim ? RN.inventarioModel.costoTotalDesglose(desgloseEstim) : (cant * costoVigente);
  var ganancia = +(total - costoEstim).toFixed(2);
  var elGan = document.getElementById('asig-ganancia');
  if (elGan) {
    if (total > 0 && cant > 0) {
      var color = ganancia >= 0 ? 'var(--green)' : 'var(--danger)';
      var pctInfo = '';
      var pct = RN.inventarioModel.pctGanancia();
      var precioSugerido = RN.inventarioModel.precioVentaSugerido(costoVigente);
      if (Math.abs(precioU - precioSugerido) < 0.01) {
        pctInfo = ' (' + pct + '% sobre costo)';
      }
      elGan.innerHTML = '<span style="color:' + color + '">Ganancia real (FIFO): ' + RN.calc.formatCUP(ganancia) + ' · costo ' + RN.calc.formatCUP(costoVigente) + '/ud' + pctInfo + '</span>';
    } else {
      elGan.innerHTML = '<span class="muted">Ingresa precio de venta para ver la ganancia</span>';
    }
  }
  // Recalcular el bloque de pago
  RN.moneda.recalcBloquePago('asig-pago');
};

/**
 * Abre el modal para asignar/vender inventario de un producto.
 * El usuario elige el producto (no el lote individual); el sistema reparte
 * la cantidad entre los lotes usando FIFO.
 * @param {string} material — nombre del producto a vender
 */
RN.inventario.asignar = function (material) {
  var disp = RN.inventarioModel.stockDisponibleProducto(material);
  if (disp <= 0) { RN.notifyUI.toast('No hay unidades disponibles de este producto', 'warn'); return; }
  var costoVigente = RN.inventarioModel.costoVigentePorNombre(material);
  var precioSugerido = RN.inventarioModel.precioVentaSugerido(costoVigente);
  var pct = RN.inventarioModel.pctGanancia();
  var cliOpts = RN.state.clients.map(c => '<option value="' + c.id + '">' + RN.render.esc(c.nombre) + '</option>').join('');
  var html = '\
    <div class="modal-header"><h3>Asignar / vender inventario</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>\
    <div class="modal-body">\
      <p class="muted mb-16">Producto: <strong>' + RN.render.esc(material) + '</strong> · Disponible: <strong>' + disp + '</strong> · Costo vigente (FIFO): <strong>' + RN.calc.formatCUP(costoVigente) + '/ud</strong></p>\
      <input type="hidden" id="asig-material" value="' + RN.render.esc(material) + '">\
      <div class="form-row cols-2">\
        <div><label>Cliente *</label><select id="asig-cli"><option value="">— elegir —</option>' + cliOpts + '</select></div>\
        <div><label>Cantidad *</label><input id="asig-cant" type="number" value="1" min="1" max="' + disp + '" oninput="RN.inventario._recalcVentaAsig()"></div>\
      </div>\
      <div class="form-row cols-2">\
        <div><label>Precio de venta unitario (CUP) * <small class="muted">— sugerido al ' + pct + '% sobre costo, editable</small></label><input id="asig-precio-u" type="number" step="0.01" min="0" placeholder="0.00" value="' + precioSugerido + '" oninput="RN.inventario._recalcVentaAsig()"></div>\
        <div><label>Precio de venta total</label><input id="asig-precio-tot" readonly placeholder="0.00 CUP" style="font-weight:700"></div>\
      </div>\
      <div class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:12px" id="asig-ganancia"><span class="muted">Ingresa precio de venta para ver la ganancia</span></div>\
      <div class="divider"></div>\
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px">\
        <input type="checkbox" id="asig-vender-ahora" checked onchange="RN.inventario._toggleCobroAsig()">\
        <span><strong>Registrar la venta ahora</strong> (ingreso en caja) <span class="muted" style="font-size:12px">— si lo desmarcas, solo se asigna el material al cliente sin cobrar</span></span>\
      </label>\
      <div id="asig-cobro-grupo">\
        <div class="muted" style="font-size:13px;margin-bottom:8px">¿Cómo paga el cliente?</div>\
        ' + RN.moneda.bloquePagoHTML('asig-pago', { titulo: 'Pago de la venta', autoCUP: true }) + '\
      </div>\
    </div>\
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>\
      <button class="btn primary" onclick="RN.inventario.guardarAsignacion()">Asignar</button></div>';
  RN.uiComponents.modal(html, { lg: true });
  // Inicializar bloque de pago: monto a pagar = total de venta
  RN.moneda.initBloquePago('asig-pago');
  RN.moneda.configBloquePago('asig-pago', function () {
    return RN.inventario._totalVentaAsig();
  }, true);
  RN.inventario._recalcVentaAsig();
  RN.moneda.recalcBloquePago('asig-pago');
};

/** Muestra/oculta el bloque de cobro según el checkbox "vender ahora". */
RN.inventario._toggleCobroAsig = function () {
  var chk = document.getElementById('asig-vender-ahora');
  var grupo = document.getElementById('asig-cobro-grupo');
  if (grupo) grupo.style.display = chk && chk.checked ? '' : 'none';
};

/** Total de venta de la asignación (CUP). */
RN.inventario._totalVentaAsig = function () {
  var cant = parseInt((document.getElementById('asig-cant') || {}).value, 10) || 0;
  var precioU = parseFloat((document.getElementById('asig-precio-u') || {}).value) || 0;
  return +(cant * precioU).toFixed(2);
};

/**
 * Guarda la asignación/venta. Aplica FIFO: reparte la cantidad entre los lotes
 * más antiguos del producto y crea una asignación por lote (con su costo real).
 * Si se vende ahora, registra el ingreso en caja con los campos de moneda.
 */
RN.inventario.guardarAsignacion = function () {
  var cliId = document.getElementById('asig-cli').value;
  if (!cliId) { RN.notifyUI.toast('Elige un cliente', 'error'); return; }
  var material = document.getElementById('asig-material').value;
  var disp = RN.inventarioModel.stockDisponibleProducto(material);
  var cant = parseInt(document.getElementById('asig-cant').value, 10) || 0;
  if (cant <= 0 || cant > disp) { RN.notifyUI.toast('Cantidad inválida', 'error'); return; }
  var precioU = parseFloat(document.getElementById('asig-precio-u').value) || 0;
  if (precioU < 0) { RN.notifyUI.toast('Precio de venta inválido', 'error'); return; }
  var precioTotal = +(cant * precioU).toFixed(2);

  // Repartir la cantidad entre lotes usando FIFO
  var desglose = RN.inventarioModel.repartirFIFO(material, cant);
  if (!desglose) { RN.notifyUI.toast('No hay suficiente stock disponible', 'error'); return; }

  var venderAhora = document.getElementById('asig-vender-ahora').checked;
  var costoTotal = RN.inventarioModel.costoTotalDesglose(desglose);
  var gananciaReal = +(precioTotal - costoTotal).toFixed(2);

  // Datos del cobro (si se vende ahora)
  var pago = venderAhora ? RN.moneda.leerBloquePago('asig-pago', precioTotal) : null;

  // 1) Crear una asignación por cada lote del desglose FIFO
  var primeraAsigId = null;
  var todasAsigIds = [];
  desglose.forEach(function (d) {
    var asig = {
      id: RN.calc.uid('asig'),
      loteId: d.loteId,
      clienteId: cliId,
      cantidad: d.cantidad,
      precioUnitario: precioU,
      precioTotal: +(d.cantidad * precioU).toFixed(2),
      costoUnitario: d.costoUnitario,
      ganancia: +(d.cantidad * precioU - d.cantidad * d.costoUnitario).toFixed(2),
      vendida: venderAhora,
      fecha: new Date().toISOString()
    };
    RN.state.asignacionesInventario.push(asig);
    if (!primeraAsigId) primeraAsigId = asig.id;
    todasAsigIds.push(asig.id);
  });

  // 2) Si se vende ahora, registrar el ingreso en el historial (un solo cobro)
  if (venderAhora) {
    RN.state.reciboCounter = (RN.state.reciboCounter || 0) + 1;
    var conceptoVenta = 'Venta: ' + material + ' (' + cant + ' ud' + (cant > 1 ? 's' : '') + ')';
    RN.state.history.push({
      id: RN.calc.uid('cob'),
      clienteId: cliId,
      tipo: 'venta-inventario',
      concepto: conceptoVenta,
      // v5.13.5 (ISSUE #11): El ingreso de la venta va en `monto` (precio de
      // venta), no en `montoEquipo`. Semánticamente `montoEquipo` significa
      // "pago de deuda de equipo (inversión/recuperación)", no "venta de
      // inventario". Usar `monto` evita inflar la recuperación de inversión y
      // clasifica correctamente los ingresos. ingresosMes() y todos los
      // reportes usan (h.monto + h.montoEquipo), así que el total numérico se
      // preserva.
      monto: precioTotal,
      montoEquipo: 0,
      mes: RN.calc.mesActualStr(),
      fecha: new Date().toISOString(),
      reciboNum: RN.calc.proxReciboNum(),
      ventaInventario: true,
      material: material,
      asignacionIds: todasAsigIds,
      cantidad: cant,
      desgloseFIFO: desglose,
      costoTotal: costoTotal,
      gananciaReal: gananciaReal,
      // Campos de moneda del pago
      moneda: pago.moneda,
      montoPagadoUSD: pago.montoUSD,
      montoPagadoCUP: pago.montoCUP,
      montoPagadoCUPDesdeUSD: pago.montoCUPDesdeUSD,
      totalPagadoCUP: pago.totalRecibidoCUP,
      totalCUP: precioTotal,
      // v5.13.9 (BUG-2): Anadir tipoPago para que los KPIs de Realizados
      // cuenten las ventas de inventario correctamente.
      tipoPago: 'completo',
      totalAPagar: precioTotal,
      falta: 0,
      excedente: 0,
      tasaUsd: pago.tasaUsd
    });
  RN.calc.invalidarIndicePagos(); // v5.43.1
  }

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  var cli = (RN.state.clients.find(function (c) { return c.id === cliId; }) || {}).nombre || '';
  var msg = 'Asignadas ' + cant + ' ud. a ' + cli;
  if (venderAhora) {
    msg += ' · Venta ' + RN.calc.formatCUP(precioTotal) + ' · Ganancia ' + RN.calc.formatCUP(gananciaReal);
    if (pago.montoUSD > 0) msg += ' (' + RN.moneda.formatUSD(pago.montoUSD) + (pago.montoCUP > 0 ? ' + ' + RN.calc.formatCUP(pago.montoCUP) : '') + ')';
  } else {
    msg += ' · Pendiente de cobro';
  }
  RN.notifyUI.toast(msg, 'success');
};

/**
 * Vender inventario a un cliente (flujo legacy directo desde la lista de
 * asignaciones). Equivale a asignar con venta inmediata.
 */
RN.inventario.vender = function (material, clienteId) {
  RN.inventario.asignar(material);
  // Preseleccionar el cliente si viene indicado
  if (clienteId) {
    var sel = document.getElementById('asig-cli');
    if (sel) sel.value = clienteId;
  }
};
