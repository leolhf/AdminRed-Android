/**
 * cobros/inversion.js — Inversión personal, recuperación y deudas personales.
 *
 * v5.13.2: FUSIÓN — Este módulo ahora integra también la vista de "Deudas
 * personales" que antes estaba en el archivo separado deudas.js. Ambas vistas
 * gestionan el mismo modelo (RN.state.investments) y solo se diferencian por
 * el filtro origenCapital. Al fusionarlas se elimina:
 *   - El archivo deudas.js (201 líneas redundantes)
 *   - La función RN.deudas.eliminar() divergente que SIEMPRE borraba las
 *     devoluciones (incluso para capital propio) — BUG corregido.
 *   - La confusión conceptual de tener dos módulos para el mismo dato.
 *
 * Pivote de diseño: los clientes vinculados a una inversión ya no cargan deuda
 * directamente, solo contribuyen su ingreso neto de servicio a la proyección.
 *
 * v5.11.0: Se añade la FECHA DE COMPRA de la inversión, lo que permite saber
 * qué clientes influyen en la recuperación (aporte desde esa fecha) y cuántos
 * días han transcurrido.
 *
 * v5.11.3: La recuperación se calcula AUTOMÁTICAMENTE a partir del margen neto
 * de los clientes vinculados (descuenta el costo del mega y la retención
 * personal). Se eliminan los campos manuales "Recuperado hasta ahora" y
 * "Aporte mensual estimado" del formulario.
 *
 * v5.12.0: Se añade el BLOQUE DE MONEDA (CUP/USD/MIXTO) para registrar cómo se
 * pagó la compra de la inversión. El monto invertido se guarda en CUP como
 * referencia principal, y los campos de pago (moneda, USD, CUP, tasa) quedan
 * como metadata del pago real.
 *
 * v5.12.1: CAMBIO DE PARADIGMA — El monto invertido ya NO es un campo editable.
 * Se CALCULA automáticamente a partir de lo que el usuario ingresa en el bloque
 * de moneda (USD×tasa + CUP). El bloque de pago pasa a ser la FUENTE de verdad
 * del monto, no meramente informativo. El campo "Monto invertido" es readonly.
 * Decisiones: 1a (USD deshabilitado sin tasa), 2a (precargar monto anterior en
 * CUP al editar), 3a (sin "a pagar", solo total desembolsado).
 *
 * v5.12.9: ORIGEN DEL CAPITAL — Cada inversión se marca como "Capital propio"
 * o "Préstamo externo" (dinero que debo devolver). Cuando es préstamo externo,
 * la app lleva un saldo a devolver y permite registrar devoluciones desde este
 * módulo (RN.inversion.devolucionPrestamo). Se integra el % de ganancia del mes
 * real.
 *
 * v5.13.16 (auditoría): BUG-3 (botón devolución se deshabilita al exceder saldo),
 * BUG-4 (recuperado neto muestra valor real con negativos), BUG-5 (eliminado
 * _renderKPIsDeudas código muerto), CODE-2 (renderDeudas→render.inversion),
 * CODE-3 (data-attributes + addEventListener en modal devolución), CODE-4
 * (JSDoc reordenado), CODE-5 (documentado comportamiento de eliminar),
 * DUP-1 (_htmlDetalleRecuperacion helper compartido), DUP-2 (_cardInversion
 * unificada), LOG-2 (sub-header muestra generado por negocio), UI-1 (barra de
 * progreso en inversiones propias), UI-2 (generado X CUP en sub-header deuda),
 * UI-4 (badge saldo junto a botón Devolver préstamo), UI-5 (animación al
 * liquidar deuda), UI-6 (preview saldo al cambiar origen a préstamo).
 */
RN.inversion = RN.inversion || {};

RN.inversion._editId = null;

RN.inversion.abrirNueva = function () {
  RN.inversion._editId = null;
  RN.inversion._form();
};

RN.inversion.abrirEditar = function (id) {
  RN.inversion._editId = id;
  RN.inversion._form();
};

RN.inversion._form = function () {
  const id = RN.inversion._editId;
  const inv = id ? RN.state.investments.find(x => x.id === id) : null;
  const clientesOpts = RN.state.clients.map(c =>
    `<option value="${c.id}" ${inv && (inv.clienteIds || []).includes(c.id) ? 'selected' : ''}>${RN.render.esc(c.nombre)}</option>`
  ).join('');

  // Fecha de compra: prioriza fechaCompra, si no usa la fecha de creación
  // v5.12.2: normalizar a YYYY-MM-DD (el input type=date requiere este formato)
  // inv.fechaCompra puede estar guardado como ISO completo o como YYYY-MM-DD
  var fechaRaw = inv ? (inv.fechaCompra || (inv.fecha ? inv.fecha.slice(0, 10) : '')) : '';
  const fechaCompraVal = fechaRaw ? String(fechaRaw).slice(0, 10) : new Date().toISOString().slice(0, 10);

  // v5.11.3: mostrar el cálculo automático (solo informativo, no editable)
  const pctPersonal = RN.investment.pctPersonal();
  const recuAuto = inv ? RN.investment.recuperadoRealInv(inv) : 0;
  const aporteMes = inv ? RN.investment.aporteMensualNeto(inv) : 0;

  // v5.12.9: origen del capital (propio / préstamo externo)
  const origenVal = inv ? RN.investment.origenCapital(inv) : 'propio';
  const aporteExtraMes = inv ? RN.investment.aporteExtraMes(inv) : 0;
  const pctGananciaMes = RN.investment.pctGananciaMes();

  const html = `
    <div class="modal-header"><h3>${inv ? 'Editar inversión' : 'Nueva inversión personal'}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Concepto *</label><input id="inv-concepto" value="${RN.render.esc(inv ? inv.concepto : '')}" placeholder="Ej: Compra de 5 routers"></div></div>
      <div class="form-row">
        <div><label>Fecha de compra *</label><input id="inv-fecha-compra" type="date" value="${fechaCompraVal}"><small class="muted" style="display:block;margin-top:4px">Desde esta fecha se miden los aportes de los clientes a la recuperación.</small></div>
      </div>
      <div class="form-row">
        <div><label>Origen del capital *</label>
          <select id="inv-origen" onchange="RN.inversion._toggleOrigen()">
            <option value="propio" ${origenVal === 'propio' ? 'selected' : ''}>Capital propio (no hay que devolverlo)</option>
            <option value="prestado_externo" ${origenVal === 'prestado_externo' ? 'selected' : ''}>Préstamo externo (dinero que debo devolver)</option>
          </select>
          <small class="muted" style="display:block;margin-top:4px" id="inv-origen-ayuda">Si el dinero lo prestó un banco, familiar u otra persona y debes devolverlo, elige "Préstamo externo". La app llevará un saldo a devolver y podrás registrar devoluciones desde la caja.</small>
          <small class="muted" style="display:block;margin-top:4px" id="inv-origen-preview"></small>
        </div>
      </div>
      <div class="form-row"><div><label>Clientes vinculados (Ctrl/Cmd para varios)</label>
        <select id="inv-clientes" multiple style="height:120px">${clientesOpts}</select>
        <small class="muted" style="display:block;margin-top:4px">Solo el margen neto de estos clientes (ingreso − costo del mega) recupera la inversión. El ${pctPersonal}% de ganancia personal configurado NO computa como recuperación.</small>
      </div></div>
      <div class="divider"></div>
      <div class="muted" style="font-size:13px;margin-bottom:8px">¿Cómo se pagó esta compra? Ingresa cuánto pagaste en USD y/o CUP — el monto invertido se calcula automáticamente.</div>
      ${RN.moneda.bloquePagoHTML('inv-pago', { titulo: 'Pago de la compra' })}
      <div class="form-row">
        <div><label>Monto invertido (CUP) — calculado automáticamente</label><input id="inv-monto" type="text" readonly style="font-weight:700;font-size:16px;color:var(--blue);background:var(--bg)" value="${inv ? RN.calc.formatCUP(inv.monto) : ''}"><small class="muted" style="display:block;margin-top:4px">Este es el capital a recuperar. Se deriva del pago ingresado arriba.</small></div>
      </div>
      ${pctGananciaMes > 0 ? `
      <div class="form-row">
        <div><label>Aporte extra del mes (% ganancia real: ${pctGananciaMes}%)</label><input type="text" value="${RN.calc.formatCUP(aporteExtraMes)}" readonly style="font-weight:700"><small class="muted" style="display:block;margin-top:4px">Cada mes, el ${pctGananciaMes}% de la ganancia neta real del negocio se destina a acelerar la recuperación del capital.</small></div>
      </div>` : ''}
      ${inv ? `
      <div class="form-row cols-2">
        <div><label>Recuperado (automático)</label><input type="text" value="${RN.calc.formatCUP(recuAuto)}" readonly style="font-weight:700"></div>
        <div><label>Aporte neto mensual estimado</label><input type="text" value="${RN.calc.formatCUP(aporteMes)}" readonly style="font-weight:700"></div>
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.inversion.guardar()">Guardar</button>
    </div>`;
  RN.uiComponents.modal(html);
  // v5.12.1: Modo derivado — el monto se calcula desde los campos de pago
  RN.moneda.initBloquePago('inv-pago');
  RN.moneda.configModoDerivado('inv-pago', function (pagadoCUP) {
    var montoIn = document.getElementById('inv-monto');
    if (montoIn) montoIn.value = pagadoCUP > 0 ? RN.calc.formatCUP(pagadoCUP) : '';
    // v5.13.16 (UI-6): actualizar el preview del saldo a devolver si es préstamo
    RN.inversion._actualizarPreviewSaldo(pagadoCUP);
  });
  // Si editando, precargar los campos de pago guardados (o el monto anterior en CUP)
  if (inv) {
    if (inv.monedaPago) {
      // Inversión creada con v5.12.0+: precargar campos de pago guardados
      RN.moneda.setMonedaBloque('inv-pago', inv.monedaPago);
      var usdIn = document.getElementById('inv-pago-monto-usd');
      var cupIn = document.getElementById('inv-pago-monto-cup');
      if (usdIn) usdIn.value = inv.montoPagoUSD || 0;
      if (cupIn) cupIn.value = inv.montoPagoCUP || 0;
    } else {
      // Inversión anterior (sin monedaPago): precargar el monto en CUP (decisión 2a)
      var cupIn2 = document.getElementById('inv-pago-monto-cup');
      if (cupIn2) cupIn2.value = inv.monto || 0;
    }
  }
  RN.moneda.recalcBloquePago('inv-pago');
  RN.inversion._toggleOrigen();
};

/** v5.12.9 — Actualiza la ayuda y el label del monto según el origen del capital. */
/** v5.13.16 (UI-6) — Muestra un preview del saldo a devolver cuando el origen es préstamo. */
RN.inversion._toggleOrigen = function () {
  var sel = document.getElementById('inv-origen');
  if (!sel) return;
  var esPrestamo = sel.value === 'prestado_externo';
  var ayuda = document.getElementById('inv-origen-ayuda');
  var montoLabel = document.querySelector('#inv-monto').closest('.form-row').querySelector('label');
  var montoSmall = document.querySelector('#inv-monto + .muted');
  if (ayuda) {
    ayuda.textContent = esPrestamo
      ? 'Este dinero lo prestó un banco, familiar u otra persona y debes devolverlo. La app llevará un saldo a devolver y podrás registrar devoluciones desde la caja (extraer dinero y marcarlo como devolución de préstamo).'
      : 'Si el dinero lo prestó un banco, familiar u otra persona y debes devolverlo, elige "Préstamo externo". La app llevará un saldo a devolver y podrás registrar devoluciones desde la caja.';
  }
  if (montoLabel) {
    montoLabel.textContent = esPrestamo
      ? 'Monto a devolver (CUP) — calculado automáticamente'
      : 'Monto invertido (CUP) — calculado automáticamente';
  }
  if (montoSmall) {
    montoSmall.textContent = esPrestamo
      ? 'Este es el capital a devolver al prestamista. Se deriva del pago ingresado arriba.'
      : 'Este es el capital a recuperar. Se deriva del pago ingresado arriba.';
  }
  // v5.13.16 (UI-6): preview del saldo a devolver
  RN.inversion._actualizarPreviewSaldo();
};

/**
 * v5.13.16 (UI-6) — Actualiza el preview del saldo a devolver cuando el origen
 * es préstamo externo. Lee el monto actual del campo inv-monto y lo muestra
 * como "Saldo a devolver estimado: X CUP". Si el origen es propio, limpia el
 * preview.
 * @param {number} [pagadoCUP] — monto opcional ya calculado (desde el callback
 *   del bloque de pago); si se omite, se lee del campo inv-monto.
 */
RN.inversion._actualizarPreviewSaldo = function (pagadoCUP) {
  var sel = document.getElementById('inv-origen');
  var preview = document.getElementById('inv-origen-preview');
  if (!preview) return;
  if (!sel || sel.value !== 'prestado_externo') {
    preview.textContent = '';
    return;
  }
  if (pagadoCUP === undefined) {
    var montoIn = document.getElementById('inv-monto');
    if (!montoIn) { preview.textContent = ''; return; }
    var txt = (montoIn.value || '').replace(/[^\d.\-]/g, '');
    pagadoCUP = parseFloat(txt) || 0;
  }
  if (pagadoCUP > 0) {
    preview.innerHTML = '<strong style="color:var(--warn)">Saldo a devolver estimado: ' + RN.calc.formatCUP(pagadoCUP) + '</strong> · Podrás registrar devoluciones desde la caja.';
  } else {
    preview.textContent = '';
  }
};

RN.inversion.guardar = function () {
  const concepto = document.getElementById('inv-concepto').value.trim();
  if (!concepto) { RN.notifyUI.toast('El concepto es obligatorio', 'error'); return; }
  // v5.12.1: el monto se deriva del bloque de pago (modo derivado)
  const pago = RN.moneda.leerBloquePago('inv-pago', 0);
  const monto = pago.totalRecibidoCUP || 0;
  // v5.13.4 (Mejora #5): Validar montos no negativos
  if ((pago.montoUSD || 0) < 0 || (pago.montoCUP || 0) < 0) {
    RN.notifyUI.toast('Los montos de pago no pueden ser negativos', 'error');
    return;
  }
  // v5.13.4 (Mejora #5): Advertir si la tasa parece irreal y hay pago en USD
  if ((pago.montoUSD || 0) > 0 && pago.tasaUsd > 0 && (pago.tasaUsd < 1 || pago.tasaUsd > 100000)) {
    RN.notifyUI.toast('La tasa USD (' + pago.tasaUsd + ') parece irreal. Revísala en Ajustes.', 'warn');
  }
  if (monto <= 0) { RN.notifyUI.toast('Ingresa cuánto pagaste en USD y/o CUP para calcular el monto invertido', 'error'); return; }
  // v5.13.4 (Mejora #5): Validar monto de inversión razonable (no más de 100 millones CUP)
  if (monto > 100000000) {
    RN.notifyUI.toast('El monto invertido (' + RN.calc.formatCUP(monto) + ') parece excesivo. Verifica los datos.', 'warn');
  }
  const clientes = Array.from(document.getElementById('inv-clientes').selectedOptions).map(o => o.value);
  const fechaCompraRaw = document.getElementById('inv-fecha-compra').value;
  if (!fechaCompraRaw) { RN.notifyUI.toast('La fecha de compra es obligatoria', 'error'); return; }
  // v5.12.2: guardar como YYYY-MM-DD (sin hora) para evitar problemas de zona horaria
  const fechaCompra = fechaCompraRaw.slice(0, 10);
  // v5.12.9: origen del capital
  const origenCapital = document.getElementById('inv-origen').value || 'propio';

  const data = {
    concepto, monto, clienteIds: clientes, fechaCompra,
    origenCapital,
    monedaPago: pago.moneda,
    montoPagoUSD: pago.montoUSD,
    montoPagoCUP: pago.montoCUP,
    montoPagoCUPDesdeUSD: pago.montoCUPDesdeUSD,
    totalPagoCUP: pago.totalRecibidoCUP,
    tasaUsdCompra: pago.tasaUsd
  };
  const id = RN.inversion._editId;
  if (id) {
    Object.assign(RN.state.investments.find(x => x.id === id), data);
  } else {
    data.id = RN.calc.uid('inv');
    data.fecha = new Date().toISOString();
    RN.state.investments.push(data);
  }
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(id ? 'Inversión actualizada' : 'Inversión creada', 'success');
};

/**
 * v5.13.2 — Eliminar unificado (FUNCIÓN ÚNICA, bug corregido).
 *
 * Antes (v5.13.0-v5.13.1) existían DOS funciones eliminar divergentes:
 *   - RN.inversion.eliminar (inversion.js): solo borraba devoluciones si era préstamo ✅
 *   - RN.deudas.eliminar (deudas.js): SIEMPRE borraba las devoluciones, incluso
 *     para capital propio ❌ BUG — podía eliminar gastos legítimos por error.
 *
 * Ahora hay una sola función que aplica la lógica correcta: las devoluciones
 * solo se eliminan cuando la inversión es un préstamo externo (origenCapital
 * === 'prestado_externo'), porque esas devoluciones son repagos del capital
 * prestado y no tienen sentido sin la deuda. Para capital propio, las
 * devoluciones se conservan en el historial de gastos.
 *
 * v5.13.16 (CODE-5): NOTA DE MANTENIMIENTO — Eliminar una inversión NO afecta:
 *   1. Los cobros del historial (RN.state.history): los cobros reales de los
 *      clientes siguen registrados; son datos contables independientes.
 *   2. El margen de OTRAS inversiones: cada inversión calcula su
 *      recuperadoRealInv filtrando cobros por su propia fechaCompra, así que
 *      eliminar una inversión no cambia la recuperación de otra aunque
 *      compartan clientes. La dependencia es por fecha de compra, no por
 *      referencia directa.
 *   3. Los gastos legítimos (para capital propio): las devoluciones asociadas
 *      se conservan porque son movimientos reales de caja.
 */
RN.inversion.eliminar = function (id) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === id; });
  if (!inv) return;
  var esPrestamo = RN.investment.origenCapital(inv) === 'prestado_externo';
  var devs = RN.investment.devolucionesInv(inv);
  var tipoTxt = esPrestamo ? 'deuda personal' : 'inversión';
  var msg = '¿Eliminar esta ' + tipoTxt + ' del registro?';
  if (esPrestamo && devs.length) {
    msg = '¿Eliminar esta deuda personal (préstamo externo)? Se eliminarán también ' + devs.length + ' devoluciones asociadas (' + RN.calc.formatCUP(RN.investment.totalDevuelto(inv)) + '). Esta acción no se puede deshacer.';
  } else {
    msg += ' Las devoluciones asociadas se conservarán en el historial de gastos. Los cobros del historial no se ven afectados.';
  }
  RN.uiComponents.confirm('Eliminar ' + tipoTxt, msg, () => {
    RN.state.investments = RN.state.investments.filter(x => x.id !== id);
    // Solo si es préstamo, eliminar también sus devoluciones
    if (esPrestamo) {
      RN.state.gastos = (RN.state.gastos || []).filter(g => !(g.esDevolucionInversion && g.inversionId === id));
    }
    RN.storageLocal.guardar();
    RN.render.todo();
    RN.notifyUI.toast(esPrestamo ? 'Deuda personal eliminada' : 'Inversión eliminada', 'warn');
  }, { danger: true });
};

/* ============================================================
 * v5.13.2 — DEVOLUCIÓN DE PRÉSTAMO (movida desde caja.js)
 * ------------------------------------------------------------
 * Antes las devoluciones de préstamo estaban en caja.js, mezcladas con los
 * retiros de caja (dos responsabilidades distintas en un solo archivo). Ahora
 * se mueven aquí, junto a la inversión que originan, respetando el principio
 * de responsabilidad única. RN.caja queda solo con los retiros de caja.
 * ============================================================ */

/**
 * Abre el modal para registrar una devolución de préstamo de una inversión.
 * @param {string} inversionId — ID de la inversión (préstamo externo).
 */
RN.inversion.devolucionPrestamo = function (inversionId) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) {
    RN.notifyUI.toast('Inversión no encontrada', 'error');
    return;
  }
  if (RN.investment.origenCapital(inv) !== 'prestado_externo') {
    RN.notifyUI.toast('Esta inversión es capital propio, no requiere devolución', 'info');
    return;
  }
  var saldoDevolver = RN.investment.saldoADevolver(inv);
  var recuperadoNeto = RN.investment.recuperadoNetoInv(inv);
  var fondoDisponible = RN.calc.fondoCaja();
  // Lo máximo que se puede devolver es el menor entre: saldo a devolver,
  // lo recuperado neto (no devuelves lo que aún no generó el negocio) y
  // el fondo de caja disponible. Pero permitimos pasar del recuperado neto
  // (advertimos) porque el dueño puede usar otros fondos.
  var sugerido = Math.min(saldoDevolver, Math.max(0, recuperadoNeto));

  // v5.13.16 (BUG-4): Mostrar el recuperado neto REAL (puede ser negativo)
  // en lugar de ocultarlo con Math.max(0, ...). El usuario necesita saber si
  // está devolviendo más de lo que el negocio ha generado.
  var recNetoColor = recuperadoNeto < 0 ? 'var(--danger)' : 'var(--green)';
  var recNetoTxt = recuperadoNeto < 0
    ? '<strong style="color:' + recNetoColor + '">' + RN.calc.formatCUP(recuperadoNeto) + '</strong>'
      + ' <span class="muted" style="font-size:11px">(has devuelto más de lo generado)</span>'
    : '<strong style="color:' + recNetoColor + '">' + RN.calc.formatCUP(recuperadoNeto) + '</strong>';

  var html =
    '<div class="modal-header">' +
      '<h3>💨 Devolver préstamo — ' + RN.render.esc(inv.concepto) + '</h3>' +
      '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<div class="kpi blue" style="margin-bottom:12px">' +
        '<div class="label">Saldo a devolver al prestamista</div>' +
        '<div class="value">' + RN.calc.formatCUP(saldoDevolver) + '</div>' +
        '<div class="sub">De un préstamo de ' + RN.calc.formatCUP(inv.monto) + ' · ya devuelto ' + RN.calc.formatCUP(RN.investment.totalDevuelto(inv)) + '</div>' +
      '</div>' +
      '<div class="acc-row" style="margin-bottom:12px">' +
        '<span class="acc-label">Recuperado neto (generado por el negocio, aún sin devolver)</span>' +
        '<span class="acc-value">' + recNetoTxt + '</span>' +
      '</div>' +
      '<div class="acc-row" style="margin-bottom:16px">' +
        '<span class="acc-label">Fondo de caja disponible ahora</span>' +
        '<span class="acc-value">' + RN.calc.formatCUP(fondoDisponible) + '</span>' +
      '</div>' +
      '<div class="form-row"><div>' +
        '<label>Monto a devolver (CUP) *</label>' +
        // v5.13.16 (CODE-3): data-attributes en lugar de oninput inline
        '<input id="dev-monto" type="number" step="0.01" min="0.01" placeholder="0.00" value="' + (sugerido > 0 ? sugerido.toFixed(2) : '') + '"' +
          ' data-saldo="' + saldoDevolver + '" data-fondo="' + fondoDisponible + '" data-recuperado="' + recuperadoNeto + '">' +
        '<small class="muted" style="display:block;margin-top:4px">Sugerido: lo recuperado del negocio que aún no has devuelto (' + RN.calc.formatCUP(Math.max(0, recuperadoNeto)) + ').</small>' +
      '</div></div>' +
      '<div class="form-row"><div>' +
        '<label>Concepto (opcional)</label>' +
        '<input id="dev-concepto" placeholder="Ej: Pago de cuota del préstamo a Juan">' +
      '</div></div>' +
      '<div class="form-row"><div>' +
        '<label>Fecha</label>' +
        '<input id="dev-fecha" type="date" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '</div></div>' +
      '<div id="dev-aviso" style="margin-top:8px"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
      '<button class="btn primary" onclick="RN.inversion.guardarDevolucion(\'' + RN.render.escAttr(inv.id) + '\')" id="dev-btn-guardar">💨 Registrar devolución</button>' +
    '</div>';
  RN.uiComponents.modal(html);
  // v5.13.16 (CODE-3): event delegation vía addEventListener en lugar de oninput inline
  var montoInput = document.getElementById('dev-monto');
  if (montoInput) {
    montoInput.addEventListener('input', function () {
      RN.inversion._validarDevolucion(this);
    });
  }
  // Validación inicial
  RN.inversion._validarDevolucion(document.getElementById('dev-monto'));
};

/**
 * v5.13.2 — Validación en tiempo real del monto a devolver (movida desde caja.js).
 * v5.13.16 (BUG-3): El botón se deshabilita cuando monto > saldoDevolver
 *   (antes se mostraba la advertencia pero el botón seguía habilitado,
 *   creando una UX inconsistente: el usuario hacía clic y recibía un error
 *   solo en guardarDevolucion).
 * v5.13.16 (CODE-3): Los valores de validación se leen de los data-attributes
 *   del input (data-saldo, data-fondo, data-recuperado) en lugar de recibirse
 *   como parámetros inline, evitando problemas con formatos exponenciales.
 * @param {HTMLInputElement} input — el campo de monto con data-attributes.
 */
RN.inversion._validarDevolucion = function (input) {
  if (!input) return;
  var monto = parseFloat(input.value) || 0;
  var aviso = document.getElementById('dev-aviso');
  var btn = document.getElementById('dev-btn-guardar');
  if (!aviso) return;
  // v5.13.16 (CODE-3): leer valores desde data-attributes
  var saldoDevolver = parseFloat(input.getAttribute('data-saldo')) || 0;
  var fondoDisponible = parseFloat(input.getAttribute('data-fondo')) || 0;
  var recuperadoNeto = parseFloat(input.getAttribute('data-recuperado')) || 0;

  if (monto <= 0) {
    aviso.innerHTML = '<span class="badge warn">Ingresa un monto válido mayor que 0</span>';
    if (btn) btn.disabled = true;
  } else if (monto > saldoDevolver) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el saldo a devolver (' + RN.calc.formatCUP(saldoDevolver) + ').</span>';
    if (btn) btn.disabled = true;  // v5.13.16 (BUG-3): deshabilitar, era false
  } else if (monto > fondoDisponible) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el fondo de caja disponible (' + RN.calc.formatCUP(fondoDisponible) + '). El fondo quedará negativo.</span>';
    if (btn) btn.disabled = false;
  } else if (monto > recuperadoNeto) {
    aviso.innerHTML = '<span class="badge warn">ℹ️ Devuelves más de lo recuperado del negocio (' + RN.calc.formatCUP(recuperadoNeto) + '). Estás usando otros fondos para adelantar el pago.</span>';
    if (btn) btn.disabled = false;
  } else {
    aviso.innerHTML = '<span class="badge ok">✓ Saldo a devolver restante: ' + RN.calc.formatCUP(+(saldoDevolver - monto).toFixed(2)) + '</span>';
    if (btn) btn.disabled = false;
  }
};

/**
 * v5.13.2 — Guarda la devolución de préstamo como un gasto marcado
 * (esDevolucionInversion + inversionId). Sale de la caja.
 * (Movida desde caja.js, referencias RN.caja.* actualizadas a RN.inversion.*)
 * v5.13.16 (CODE-2): Reemplazada la llamada RN.inversion.renderDeudas() por
 *   RN.render.inversion() directamente (renderDeudas era un wrapper vacío).
 * v5.13.16 (UI-5): Añade una animación de destaque cuando la deuda se liquida
 *   (verificarConclusion devuelve true) antes de re-renderizar.
 */
RN.inversion.guardarDevolucion = function (inversionId) {
  var monto = parseFloat(document.getElementById('dev-monto').value) || 0;
  if (monto < 0) {
    RN.notifyUI.toast('El monto no puede ser negativo', 'error');
    return;
  }
  if (monto <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
    return;
  }
  // v5.13.4 (Mejora #5): Validar que la devolución no exceda el saldo pendiente
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) return;
  var totalDevuelto = RN.investment.totalDevuelto(inv);
  var saldoPendiente = inv.monto - totalDevuelto;
  if (monto > saldoPendiente + 0.01) {
    RN.notifyUI.toast('La devolución (' + RN.calc.formatCUP(monto) +
      ') excede el saldo pendiente (' + RN.calc.formatCUP(saldoPendiente) + ')', 'error');
    return;
  }
  var concepto = document.getElementById('dev-concepto').value.trim();
  var fecha = document.getElementById('dev-fecha').value || new Date().toISOString().slice(0, 10);
  // v5.13.5 (ISSUE #12): Construir fecha ISO sin conversión de timezone.
  var fechaISO = fecha + 'T00:00:00';
  var mes = fecha.slice(0, 7);

  if (!concepto) {
    concepto = 'Devolución de préstamo: ' + inv.concepto;
  }

  RN.state.gastos.push({
    id: RN.calc.uid('devinv'),
    concepto: concepto,
    monto: monto,
    categoria: 'Devolución de préstamo',
    esDevolucionInversion: true,
    inversionId: inversionId,
    fecha: fechaISO,
    mes: mes
  });

  // v5.13.1: Bug #6 — eliminado el guardado duplicado dentro de if(concluida).
  var concluida = RN.investment.verificarConclusion(inv);

  RN.storageLocal.guardar();

  // v5.13.16 (UI-5): Animación de destaque al liquidar una deuda.
  // Antes de cerrar el modal y re-renderizar, aplicamos un efecto visual
  // a la card de la deuda liquidada para dar feedback inmediato del logro.
  if (concluida) {
    var cardLiquidada = document.getElementById('acc-deuda-' + inv.id);
    if (cardLiquidada) {
      cardLiquidada.style.transition = 'background 0.6s ease, box-shadow 0.6s ease';
      cardLiquidada.style.background = 'var(--green, #16a34a)';
      cardLiquidada.style.boxShadow = '0 0 16px var(--green, #16a34a)';
    }
  }

  RN.uiComponents.cerrarModal();
  RN.render.dashboard();
  RN.render.inversion();
  RN.render.gastos();
  // v5.13.16 (CODE-2): RN.render.inversion() ya pinta todo (inversiones + deudas + KPIs).
  // Se elimina la llamada a RN.inversion.renderDeudas() (wrapper vacío).
  // v5.13.5 (ISSUE #13): Consolidar los dos toasts consecutivos en uno solo.
  // Antes se mostraba "¡Deuda liquidada!" y luego "Devolución registrada: X",
  // lo que podía confundir o solaparse visualmente.
  var msg = 'Devolución registrada: ' + RN.calc.formatCUP(monto);
  if (concluida) {
    msg = '🎉 ¡Deuda liquidada! (' + RN.calc.formatCUP(monto) + ') · Trasladada al historial de deudas concluidas.';
  }
  RN.notifyUI.toast(msg, 'success');
};

/**
 * v5.13.2 — Muestra el historial de devoluciones de una inversión.
 * (Movida desde caja.js, referencias actualizadas a RN.inversion.*)
 */
RN.inversion.historialDevoluciones = function (inversionId) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) return;
  var devs = RN.investment.devolucionesInv(inv)
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  var total = RN.investment.totalDevuelto(inv);

  var filas = devs.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay devoluciones registradas</p>'
    : devs.map(function (d) {
        var fecha = new Date(d.fecha).toLocaleDateString('es-CU');
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(d.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--red,#dc2626)">-' + RN.calc.formatCUP(d.monto) + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.inversion.eliminarDevolucion(\'' + RN.render.escAttr(d.id) + '\',\'' + RN.render.escAttr(inv.id) + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html =
    '<div class="modal-header">' +
      '<h3>💨 Devoluciones — ' + RN.render.esc(inv.concepto) + '</h3>' +
      '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<div class="kpi blue" style="margin-bottom:16px">' +
        '<div class="label">Total devuelto</div>' +
        '<div class="value">' + RN.calc.formatCUP(total) + '</div>' +
        '<div class="sub">Saldo a devolver: ' + RN.calc.formatCUP(RN.investment.saldoADevolver(inv)) + ' · ' + devs.length + ' devolución(es)</div>' +
      '</div>' +
      '<table class="table" style="width:100%">' +
        '<thead><tr><th>Fecha</th><th>Concepto</th><th style="text-align:right">Monto</th><th style="text-align:center">Acción</th></tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.inversion.devolucionPrestamo(\'' + RN.render.escAttr(inv.id) + '\')">💨 Nueva devolución</button>' +
    '</div>';
  RN.uiComponents.modal(html);
};

/**
 * v5.13.2 — Elimina una devolución (devuelve el dinero al saldo a devolver y a la caja).
 * (Movida desde caja.js, referencias actualizadas a RN.inversion.*)
 * v5.13.16 (CODE-2): Reemplazada RN.inversion.renderDeudas() por RN.render.inversion().
 */
RN.inversion.eliminarDevolucion = function (gastoId, inversionId) {
  RN.uiComponents.confirm('Eliminar devolución',
    '¿Eliminar esta devolución? El dinero volverá al saldo a devolver y al fondo de caja.',
    function () {
      RN.state.gastos = RN.state.gastos.filter(function (g) { return g.id !== gastoId; });
      RN.storageLocal.guardar();
      RN.inversion.historialDevoluciones(inversionId);
      RN.render.dashboard();
      RN.render.inversion();
      RN.render.gastos();
      // v5.13.16 (CODE-2): RN.render.inversion() ya pinta todo unificado.
      RN.notifyUI.toast('Devolución eliminada. Saldo actualizado.', 'success');
    }, { danger: true });
};

/* ============================================================
 * v5.13.2 — VISTA DE DEUDAS PERSONALES (fusionada desde deudas.js)
 * ------------------------------------------------------------
 * Antes existía un archivo separado deudas.js que duplicaba la lógica de
 * inversión con solo un filtro de diferencia (origenCapital === 'prestado_externo').
 * Ahora la vista de deudas se renderiza desde este mismo módulo, eliminando
 * el archivo deudas.js y su función eliminar() divergente con bug.
 * ============================================================ */

/**
 * Render principal de la vista "Deudas personales".
 * Pinta los KPIs, la lista de deudas activas y el historial de concluidas.
 */
// v5.13.16 (CODE-2): renderDeudas es un alias de compatibilidad que delega en
// render.inversion() (vista unificada de inversiones + deudas + KPIs).
// Se conserva por compatibilidad con posibles llamadas externas, pero las
// llamadas internas ya usan RN.render.inversion() directamente.
RN.inversion.renderDeudas = function () {
  RN.render.inversion();
};

// v5.13.16 (BUG-5): Eliminado _renderKPIsDeudas — era código muerto que
// referenciaba el ID 'kpi-deudas' (inexistente en index.html; la vista
// unificada usa 'kpi-inversion') y no tenía ningún caller. Los KPIs de
// deudas están integrados directamente en RN.render.inversion() (render.js).

/**
 * Pinta la lista de deudas activas (préstamos con saldo pendiente).
 */
RN.inversion._renderDeudasActivas = function (activas) {
  var cont = document.getElementById('lista-deudas-activas');
  if (!cont) return;

  if (!activas.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay deudas personales activas. Toda deuda pendiente aparecerá aquí.</div>';
    return;
  }

  cont.innerHTML = activas.map(function (inv) {
    return RN.inversion._cardInversion(inv, { esDeuda: true, esConcluida: false });
  }).join('');
};

/**
 * Pinta el historial de deudas concluidas.
 */
RN.inversion._renderDeudasConcluidas = function (concluidas) {
  var cont = document.getElementById('lista-deudas-concluidas');
  var card = document.getElementById('card-deudas-concluidas');
  if (!cont || !card) return;

  if (!concluidas.length) {
    card.style.display = 'none';
    cont.innerHTML = '';
    return;
  }

  card.style.display = '';
  // Ordenar por fecha de conclusión (más reciente primero)
  var ordenadas = concluidas.slice().sort(function (a, b) {
    var fa = a.fechaConclusion || a.fechaCompra || '';
    var fb = b.fechaConclusion || b.fechaCompra || '';
    return new Date(fb) - new Date(fa);
  });

  cont.innerHTML = ordenadas.map(function (inv) {
    return RN.inversion._cardInversion(inv, { esDeuda: true, esConcluida: true });
  }).join('');
};

/* ============================================================
 * v5.13.16 (DUP-1) — Helper compartido para la sección de recuperación.
 * ------------------------------------------------------------
 * Extrae la lógica de "Recuperación de la inversión" que antes estaba
 * duplicada entre _htmlRecuperacion (deudas) y render.inversion (propias).
 * Centraliza ~80 líneas duplicadas en una sola función parametrizable.
 * ============================================================ */

/**
 * v5.13.16 (DUP-1) — Genera el HTML de la sección "Recuperación de la
 * inversión" dentro de una tarjeta. Usado tanto por las deudas como por las
 * inversiones propias, eliminando la duplicación entre _htmlRecuperacion y
 * el bloque inline de render.inversion.
 * @param {object} inv — la inversión.
 * @param {object} [opts] — opciones de renderizado:
 *   {boolean} esDeuda — si es true, muestra "Recuperación de la inversión";
 *     si es false, muestra "Recuperación" (para inversión propia).
 * @returns {string} HTML de las filas de detalle de recuperación.
 */
RN.inversion._htmlDetalleRecuperacion = function (inv, opts) {
  opts = opts || {};
  var esDeuda = !!opts.esDeuda;
  var pctPersonal = RN.investment.pctPersonal();
  var _aportes = RN.investment.aportesPorCliente(inv);
  var _recuperado = RN.investment.recuperadoRealInv(inv);
  var _pctRec = inv.monto ? Math.round(_recuperado / inv.monto * 100) : 0;
  var _margenMes = RN.investment.margenMensualBruto(inv);
  var _aporteMes = RN.investment.aporteMensualNeto(inv);
  var _proyeccion = RN.investment.proyectarRecuperacion(inv);
  var _nClientes = (inv.clienteIds || []).length;
  var tituloRecuperacion = esDeuda ? 'Recuperación de la inversión' : 'Recuperación';
  var _html = '<div class="acc-row" style="font-weight:600"><span class="acc-label">' + tituloRecuperacion + '</span><span class="acc-value">' + _pctRec + '%</span></div>'
    + '<div class="acc-row"><span class="acc-label">Clientes vinculados</span><span class="acc-value">' + _nClientes + '</span></div>'
    + '<div class="acc-row"><span class="acc-label">Recuperado (neto, automático)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(_recuperado) + '</strong></span></div>';

  // v5.13.16 (DUP-2): Campos adicionales para inversiones propias (no deudas).
  // Estos campos estaban en el card inline de render.inversion y se migran
  // aquí para centralizar todo en _cardInversion.
  if (!esDeuda) {
    var _totalAporteBruto = RN.investment.totalAporteClientes(inv);
    var _totalMargenNeto = RN.investment.totalMargenNetoClientes(inv);
    var _acumRetenido = RN.investment.acumuladoRetenido(inv);
    var _retiroMes = RN.investment.retiroMensualEstimado(inv);
    var _pctGananciaMes = RN.investment.pctGananciaMes();
    var _aporteExtraMes = RN.investment.aporteExtraMes(inv);
    var _aporteExtraAcum = RN.investment.aporteExtraAcumulado(inv);
    var _recuperadoEfectivo = RN.investment.recuperadoEfectivo(inv);
    var _pctEfectivo = inv.monto ? Math.round(_recuperadoEfectivo / inv.monto * 100) : 0;
    _html += '<div class="acc-row"><span class="acc-label">Ingreso bruto de clientes</span><span class="acc-value">' + RN.calc.formatCUP(_totalAporteBruto) + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Margen neto (− costo del mega)</span><span class="acc-value">' + (_totalMargenNeto >= 0 ? '' : '<span style="color:#c62828">') + RN.calc.formatCUP(_totalMargenNeto) + (_totalMargenNeto >= 0 ? '' : '</span>') + '</span></div>'
      + (_acumRetenido && pctPersonal > 0 ? '<div class="acc-row"><span class="acc-label">Ganancia personal retenida acumulada (' + pctPersonal + '%)</span><span class="acc-value">' + RN.calc.formatCUP(_acumRetenido) + '</span></div>' : '')
      + '<div class="acc-row"><span class="acc-label">Margen neto mensual (bruto)</span><span class="acc-value">' + RN.calc.formatCUP(_margenMes) + '</span></div>'
      + (pctPersonal > 0 ? '<div class="acc-row"><span class="acc-label">Disponible para retirar/mes (' + pctPersonal + '% del margen)</span><span class="acc-value"><strong style="color:var(--green)">' + RN.calc.formatCUP(_retiroMes) + '</strong></span></div>' : '')
      + '<div class="acc-row"><span class="acc-label">Aporte neto mensual a recuperación</span><span class="acc-value">' + RN.calc.formatCUP(_aporteMes) + '</span></div>'
      + (_pctGananciaMes > 0 ? '<div class="acc-row"><span class="acc-label">Aporte extra del mes (' + _pctGananciaMes + '% de la ganancia neta)</span><span class="acc-value"><strong style="color:var(--green)">+' + RN.calc.formatCUP(_aporteExtraMes) + '</strong></span></div>' : '')
      + (_pctGananciaMes > 0 ? '<div class="acc-row"><span class="acc-label">Aporte extra acumulado</span><span class="acc-value">' + RN.calc.formatCUP(_aporteExtraAcum) + '</span></div>' : '')
      + (_pctGananciaMes > 0 ? '<div class="acc-row" style="font-weight:600"><span class="acc-label">Recuperado efectivo (cobrado + aporte extra)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(_recuperadoEfectivo) + '</strong> <span class="badge ' + (_pctEfectivo >= 100 ? 'ok' : 'warn') + '">' + _pctEfectivo + '%</span></span></div>' : '')
      + '<div class="acc-row"><span class="acc-label">Tiempo restante para recuperar</span><span class="acc-value"><strong>' + RN.render.esc(_proyeccion) + '</strong></span></div>';
  } else {
    _html += '<div class="acc-row"><span class="acc-label">Margen neto mensual (bruto)</span><span class="acc-value">' + RN.calc.formatCUP(_margenMes) + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Aporte neto mensual a recuperación</span><span class="acc-value">' + RN.calc.formatCUP(_aporteMes) + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Tiempo restante para recuperar</span><span class="acc-value"><strong>' + RN.render.esc(_proyeccion) + '</strong></span></div>';
  }

  if (_aportes.length) {
    _html += '<div class="acc-row" style="font-weight:600"><span class="acc-label">Ganancia por cliente</span><span class="acc-value">' + RN.calc.formatCUP(RN.investment.totalRecuperacionClientes(inv)) + '</span></div>';
    if (!esDeuda) {
      // v5.13.16 (DUP-2): desglose detallado por cliente para inversiones propias
      _aportes.forEach(function (a) {
        var _nom = a.cliente ? RN.render.esc(a.cliente.nombre) : '<span class="muted">— eliminado —</span>';
        var _pctCli = inv.monto ? Math.round(a.recuperacion / inv.monto * 100) : 0;
        var _signoMargen = a.margenNeto >= 0 ? '' : '<span style="color:#c62828">';
        var _cierreSigno = a.margenNeto >= 0 ? '' : '</span>';
        _html += '<div class="acc-row"><span class="acc-label">' + _nom + '<br><span class="muted" style="font-size:11px">Bruto: ' + RN.calc.formatCUP(a.aporte) + ' · Margen neto: ' + _signoMargen + RN.calc.formatCUP(a.margenNeto) + _cierreSigno + '</span></span><span class="acc-value"><strong>' + RN.calc.formatCUP(a.recuperacion) + '</strong> <span class="muted" style="font-size:11px">(' + _pctCli + '%)</span></span></div>';
      });
    } else {
      _aportes.forEach(function (a) {
        var _nom = a.cliente ? RN.render.esc(a.cliente.nombre) : '<span class="muted">— eliminado —</span>';
        _html += '<div class="acc-row"><span class="acc-label">' + _nom + '</span><span class="acc-value"><strong>' + RN.calc.formatCUP(a.recuperacion) + '</strong></span></div>';
      });
    }
  } else {
    _html += '<div class="acc-row"><span class="acc-value muted">Sin clientes vinculados</span></div>';
  }
  return _html;
};

/**
 * v5.13.16 (DUP-1/CODE-4) — Wrapper de compatibilidad que delega en
 * _htmlDetalleRecuperacion. Se conserva para no romper llamadas existentes.
 * @param {object} inv — la inversión.
 * @returns {string} HTML de la sección de recuperación.
 */
RN.inversion._htmlRecuperacion = function (inv) {
  return RN.inversion._htmlDetalleRecuperacion(inv, { esDeuda: true });
};

/* ============================================================
 * v5.13.16 (DUP-2) — Tarjeta unificada de inversión/deuda.
 * ------------------------------------------------------------
 * Unifica _cardDeuda (deudas) y la card inline de render.inversion (propias)
 * en una sola función con renderizado condicional según el tipo. Reduce
 * ~400 líneas de HTML duplicado a ~250 y elimina las divergencias sutiles.
 * Incluye: UI-1 (barra de progreso en propias), UI-2 (generado en sub-header
 * de deuda), UI-4 (badge saldo junto a botón Devolver), LOG-2 (aclaración
 * "generado por el negocio" en sub-header de deuda).
 * ============================================================ */

/**
 * v5.13.16 (DUP-2) — Genera el HTML de una tarjeta de inversión o deuda
 * (activa o concluida) con renderizado condicional según el tipo.
 * @param {object} inv — la inversión.
 * @param {object} opts — opciones de renderizado:
 *   {boolean} esDeuda — true para deuda (préstamo externo), false para
 *     inversión propia.
 *   {boolean} esConcluida — true si la deuda ya está liquidada (solo
 *     aplicable cuando esDeuda es true).
 * @returns {string} HTML de la tarjeta accordion.
 */
RN.inversion._cardInversion = function (inv, opts) {
  opts = opts || {};
  var esDeuda = !!opts.esDeuda;
  var esConcluida = !!opts.esConcluida;

  var fechaC = RN.investment.fechaCompra(inv);
  var fechaTxt = fechaC ? new Date(fechaC).toLocaleDateString('es-CU') : '—';
  var dias = RN.investment.diasDesdeCompra(inv);

  // --- Variables comunes ---
  var totalDevuelto = RN.investment.totalDevuelto(inv);
  var saldoDevolver = RN.investment.saldoADevolver(inv);
  var recuperadoReal = RN.investment.recuperadoRealInv(inv);
  var pctRecuperacion = inv.monto ? Math.round(recuperadoReal / inv.monto * 100) : 0;
  var pctDevuelto = inv.monto ? Math.round(totalDevuelto / inv.monto * 100) : 0;
  var cardId = esDeuda ? ('acc-deuda-' + inv.id) : ('acc-inv-' + inv.id);
  var toggleFn = 'RN.render.toggleCard';

  // --- Variables específicas de deuda ---
  var dotCls, estadoTxt, fechaConclusionTxt;
  if (esDeuda) {
    dotCls = esConcluida ? 'ok' : 'warn';
    estadoTxt = esConcluida ? '✅ Concluida' : '💨 Activa';
    fechaConclusionTxt = '';
    if (esConcluida && inv.fechaConclusion) {
      fechaConclusionTxt = new Date(inv.fechaConclusion).toLocaleDateString('es-CU');
    }
  } else {
    dotCls = 'blue';
    estadoTxt = 'Capital propio';
  }

  // --- Barra de progreso ---
  // v5.13.16 (UI-1): barra de progreso tanto en deudas (% devuelto) como en
  // inversiones propias (% recuperación).
  var barraPct, barraColor;
  if (esDeuda) {
    barraPct = Math.min(100, Math.max(0, pctDevuelto));
    barraColor = esConcluida ? 'var(--green)' : 'var(--warn)';
  } else {
    barraPct = Math.min(100, Math.max(0, pctRecuperacion));
    barraColor = 'var(--blue)';
  }
  var barraHtml = '<div class="progress-bar" style="margin:6px 0">'
    + '<div class="progress-fill" style="width:' + barraPct + '%;background:' + barraColor + '"></div>'
    + '</div>';

  // --- Sub-header ---
  // v5.13.16 (UI-2/LOG-2): el sub-header de la deuda muestra "generado X CUP"
  // para distinguir el saldo con el prestamista del generado por el negocio.
  var subTxt;
  if (esDeuda) {
    subTxt = estadoTxt + ' · debe ' + RN.calc.formatCUP(saldoDevolver) + ' · generado ' + RN.calc.formatCUP(recuperadoReal) + ' · ' + pctDevuelto + '% devuelto' + (fechaC ? ' · ' + dias + ' días' : '');
  } else {
    subTxt = estadoTxt + ' · recuperado ' + RN.calc.formatCUP(recuperadoReal) + ' · ' + pctRecuperacion + '%' + (fechaC ? ' · ' + dias + ' días' : '');
  }

  // --- Monto total en el summary ---
  var montoAmt, montoLbl;
  if (esDeuda) {
    montoAmt = RN.calc.formatCUP(inv.monto);
    montoLbl = 'Prestado';
  } else {
    montoAmt = RN.calc.formatCUP(inv.monto);
    montoLbl = 'Invertido';
  }

  // --- Historial de devoluciones (solo deudas) ---
  var devsHtml = '';
  if (esDeuda) {
    var devs = RN.investment.devolucionesInv(inv)
      .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    if (devs.length) {
      devsHtml = '<div class="divider" style="margin:8px 0"></div>'
        + '<div class="acc-row" style="font-weight:600"><span class="acc-label">Devoluciones registradas (' + devs.length + ')</span><span class="acc-value">' + RN.calc.formatCUP(totalDevuelto) + '</span></div>';
      devs.forEach(function (d) {
        var dFecha = new Date(d.fecha).toLocaleDateString('es-CU');
        devsHtml += '<div class="acc-row"><span class="acc-label" style="padding-left:12px">' + dFecha + ' · ' + RN.render.esc(d.concepto || 'Devolución') + '</span><span class="acc-value">' + RN.calc.formatCUP(d.monto) + '</span></div>';
      });
    }
  }

  // --- Filas de detalle específicas ---
  var detalleEspecifico = '';
  if (esDeuda) {
    detalleEspecifico =
      '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value"><span class="badge ' + (esConcluida ? 'ok' : 'warn') + '">' + estadoTxt + '</span></span></div>'
      + '<div class="acc-row"><span class="acc-label">Fecha de creación</span><span class="acc-value">' + fechaTxt + '</span></div>'
      + (esConcluida && fechaConclusionTxt ? '<div class="acc-row"><span class="acc-label">Fecha de conclusión</span><span class="acc-value"><strong style="color:var(--green)">' + fechaConclusionTxt + '</strong></span></div>' : '')
      + '<div class="acc-row"><span class="acc-label">Días transcurridos</span><span class="acc-value">' + (fechaC ? dias + ' días' : '—') + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Monto del préstamo</span><span class="acc-value">' + RN.calc.formatCUP(inv.monto) + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Total devuelto</span><span class="acc-value"><strong style="color:var(--green)">' + RN.calc.formatCUP(totalDevuelto) + '</strong></span></div>'
      + (esConcluida
          ? '<div class="acc-row" style="font-weight:600"><span class="acc-label">Saldo final</span><span class="acc-value"><span class="badge ok">0 · Liquidado</span></span></div>'
          : '<div class="acc-row" style="font-weight:600"><span class="acc-label">Saldo por devolver</span><span class="acc-value"><strong style="color:var(--warn)">' + RN.calc.formatCUP(saldoDevolver) + '</strong></span></div>')
      + '<div class="acc-row"><span class="acc-label">% devuelto</span><span class="acc-value">' + pctDevuelto + '%</span></div>'
      + barraHtml;
  } else {
    detalleEspecifico =
      '<div class="acc-row"><span class="acc-label">Origen del capital</span><span class="acc-value"><span class="badge ok">Capital propio</span></span></div>'
      + '<div class="acc-row"><span class="acc-label">Fecha de compra</span><span class="acc-value">' + fechaTxt + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Días transcurridos</span><span class="acc-value">' + (fechaC ? dias + ' días' : '—') + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">Monto invertido</span><span class="acc-value">' + RN.calc.formatCUP(inv.monto) + '</span></div>'
      + '<div class="acc-row"><span class="acc-label">% recuperación</span><span class="acc-value">' + pctRecuperacion + '%</span></div>'
      + barraHtml;
  }

  // --- Bloque de pago (común, si existe monedaPago) ---
  var pagoHtml = inv.monedaPago
    ? '<div class="acc-row"><span class="acc-label">Pago (' + inv.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({ moneda: inv.monedaPago, montoUSD: inv.montoPagoUSD, montoCUP: inv.montoPagoCUP, montoCUPDesdeUSD: inv.montoPagoCUPDesdeUSD, totalRecibidoCUP: inv.totalPagoCUP, tasaUsd: inv.tasaUsdCompra }) + '</span></div>'
    : '';

  // --- Botones de acción ---
  // v5.13.16 (UI-4): badge con saldo junto al botón "Devolver préstamo".
  var accionesHtml;
  if (esDeuda) {
    if (esConcluida) {
      accionesHtml =
        '<button class="btn sm" onclick="RN.inversion.historialDevoluciones(\'' + RN.render.escAttr(inv.id) + '\')">📋 Ver devoluciones</button>'
        + '<button class="btn sm" onclick="RN.inversion.abrirEditar(\'' + RN.render.escAttr(inv.id) + '\')">Editar</button>'
        + '<button class="btn sm danger" onclick="RN.inversion.eliminar(\'' + RN.render.escAttr(inv.id) + '\')">🗑</button>';
    } else {
      accionesHtml =
        '<button class="btn sm primary" onclick="RN.inversion.devolucionPrestamo(\'' + RN.render.escAttr(inv.id) + '\')">💨 Devolver préstamo</button>'
        + '<span class="badge warn" style="margin-left:4px">Saldo: ' + RN.calc.formatCUP(saldoDevolver) + '</span>'
        + '<button class="btn sm" onclick="RN.inversion.historialDevoluciones(\'' + RN.render.escAttr(inv.id) + '\')">📋 Devoluciones</button>'
        + '<button class="btn sm" onclick="RN.inversion.abrirEditar(\'' + RN.render.escAttr(inv.id) + '\')">Editar</button>'
        + '<button class="btn sm danger" onclick="RN.inversion.eliminar(\'' + RN.render.escAttr(inv.id) + '\')">🗑</button>';
    }
  } else {
    accionesHtml =
      '<button class="btn sm" onclick="RN.inversion.abrirEditar(\'' + RN.render.escAttr(inv.id) + '\')">Editar</button>'
      + '<button class="btn sm danger" onclick="RN.inversion.eliminar(\'' + RN.render.escAttr(inv.id) + '\')">🗑</button>';
  }

  // --- Ensamblaje de la tarjeta ---
  return '<div class="acc-card" id="' + cardId + '">'
    + '<div class="acc-summary" onclick="' + toggleFn + '(\'' + cardId + '\')">'
    +   '<span class="acc-dot ' + dotCls + '"></span>'
    +   '<div class="acc-summary-main">'
    +     '<div class="acc-summary-name">' + RN.render.esc(inv.concepto) + '</div>'
    +     '<div class="acc-summary-sub">' + subTxt + '</div>'
    +   '</div>'
    +   '<div class="acc-summary-total">'
    +     '<div class="amt">' + montoAmt + '</div>'
    +     '<div class="lbl">' + montoLbl + '</div>'
    +   '</div>'
    +   '<span class="acc-chevron">▼</span>'
    + '</div>'
    + '<div class="acc-details">'
    +   detalleEspecifico
    +   pagoHtml
    +   devsHtml
    +   '<div class="divider" style="margin:8px 0"></div>'
    +   RN.inversion._htmlDetalleRecuperacion(inv, { esDeuda: esDeuda })
    +   '<div class="divider" style="margin:8px 0"></div>'
    +   '<div class="acc-actions">'
    +     accionesHtml
    +   '</div>'
    + '</div>'
    + '</div>';
};

/**
 * v5.13.16 (DUP-2) — Wrapper de compatibilidad que delega en _cardInversion.
 * Se conserva para no romper llamadas existentes que usan _cardDeuda.
 * @param {object} inv — la inversión (préstamo externo)
 * @param {boolean} esConcluida — true si la deuda ya está liquidada
 * @returns {string} HTML de la tarjeta de deuda.
 */
RN.inversion._cardDeuda = function (inv, esConcluida) {
  return RN.inversion._cardInversion(inv, { esDeuda: true, esConcluida: esConcluida });
};
