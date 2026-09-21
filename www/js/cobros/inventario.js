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
  // Recalcular el bloque de pago (el monto a pagar = costo total)
  RN.moneda.recalcBloquePago('lot-pago');
};

/**
 * Abre el modal para comprar un nuevo lote de inventario.
 * Si se pasa `materialExistente`, precarga ese material (flujo "comprar más").
 */
RN.inventario.abrirNuevoLote = function (materialExistente) {
  var precargarMat = materialExistente || '';
  var precioSugerido = '';
  if (precargarMat) {
    // No sugerimos el costo anterior (cada lote tiene su propio costo)
    precioSugerido = '';
  }
  var html = '\
    <div class="modal-header"><h3>Compra de inventario</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>\
    <div class="modal-body">\
      <div class="form-row"><div><label>Material / Producto *</label><input id="lot-material" placeholder="Ej: Cable UTP cat6, Router TP-Link..." value="' + RN.render.esc(precargarMat) + '"></div></div>\
      ' + (precargarMat ? '<div class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:12px"><span class="muted">📋 Comprando más del producto <strong>' + RN.render.esc(precargarMat) + '</strong>. Se creará un nuevo lote que se añadirá al producto existente. El stock se vende por FIFO (lote más antiguo primero).</span></div>' : '') + '\
      <div class="form-row cols-2">\
        <div><label>Cantidad comprada *</label><input id="lot-cant" type="number" min="1" step="1" value="1" oninput="RN.inventario._recalcCostoLote()"></div>\
        <div><label>Notas</label><input id="lot-notas" placeholder="proveedor, factura..."></div>\
      </div>\
      <div class="form-row cols-2">\
        <div><label>Costo unitario (CUP) *</label><input id="lot-costo-u" type="number" step="0.01" min="0" placeholder="0.00" oninput="RN.inventario._recalcCostoLote()"></div>\
        <div><label>Costo total de la compra</label><input id="lot-costo-tot" readonly placeholder="0.00 CUP" style="font-weight:700"></div>\
      </div>\
      <div class="divider"></div>\
      <div class="muted" style="font-size:13px;margin-bottom:8px">¿Cómo se pagó esta compra?</div>\
      ' + RN.moneda.bloquePagoHTML('lot-pago', { titulo: 'Pago de la compra', autoCUP: true }) + '\
    </div>\
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>\
      <button class="btn primary" onclick="RN.inventario.guardarLote()">Guardar compra</button></div>';
  RN.uiComponents.modal(html);
  RN.inventario._recalcCostoLote();
  // Inicializar bloque de moneda: monto a pagar = costo total
  RN.moneda.initBloquePago('lot-pago');
  RN.moneda.configBloquePago('lot-pago', function () {
    var cant = parseFloat((document.getElementById('lot-cant') || {}).value) || 0;
    var costoU = parseFloat((document.getElementById('lot-costo-u') || {}).value) || 0;
    return +(cant * costoU).toFixed(2);
  }, true);
  RN.moneda.recalcBloquePago('lot-pago');
};

RN.inventario.guardarLote = function () {
  const material = document.getElementById('lot-material').value.trim();
  if (!material) { RN.notifyUI.toast('El material es obligatorio', 'error'); return; }
  const cant = parseInt(document.getElementById('lot-cant').value, 10) || 0;
  if (cant <= 0) { RN.notifyUI.toast('La cantidad debe ser mayor que 0', 'error'); return; }
  const costoU = parseFloat(document.getElementById('lot-costo-u').value) || 0;
  if (costoU < 0) { RN.notifyUI.toast('El costo unitario no es válido', 'error'); return; }
  const costoTotal = +(cant * costoU).toFixed(2);

  // v5.12.0: leer los campos de pago del bloque de moneda (metadata)
  const pago = RN.moneda.leerBloquePago('lot-pago', costoTotal);

  RN.state.inventario.push({
    id: RN.calc.uid('lot'),
    material,
    cantidad: cant,
    costoUnitario: costoU,
    costoTotal: costoTotal,
    notas: document.getElementById('lot-notas').value.trim(),
    fecha: new Date().toISOString(),
    // Campos de pago (metadata)
    monedaPago: pago.moneda,
    montoPagoUSD: pago.montoUSD,
    montoPagoCUP: pago.montoCUP,
    montoPagoCUPDesdeUSD: pago.montoCUPDesdeUSD,
    totalPagoCUP: pago.totalRecibidoCUP,
    tasaUsdCompra: pago.tasaUsd
  });
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.inventario();
  RN.notifyUI.toast('Compra registrada: ' + cant + ' × ' + RN.calc.formatCUP(costoU) + ' = ' + RN.calc.formatCUP(costoTotal), 'success');
};

RN.inventario.eliminarLote = function (id) {
  RN.uiComponents.confirm('Eliminar lote', '¿Eliminar este lote y sus asignaciones?', () => {
    RN.state.inventario = RN.state.inventario.filter(x => x.id !== id);
    RN.state.asignacionesInventario = RN.state.asignacionesInventario.filter(a => a.loteId !== id);
    RN.storageLocal.guardar();
    RN.render.inventario();
    RN.notifyUI.toast('Lote eliminado', 'warn');
  }, { danger: true });
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
