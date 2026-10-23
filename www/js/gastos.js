/**
 * gastos.js — Gastos del negocio.
 * v5.11.0: Soporte para registrar gastos pagados en USD al cambio vigente
 *          (toggle CUP/USD/Mixto con conversión automática a CUP para el fondo).
 */
RN.gastos = RN.gastos || {};

RN.gastos.CATEGORIAS = ['General', 'Internet proveedor', 'Electricidad', 'Equipos', 'Mantenimiento', 'Transporte', 'Salarios', 'Otros'];

RN.gastos._moneda = 'CUP';

RN.gastos.abrirNuevo = function () {
  // Si no venimos de abrirEditar, es alta nueva
  if (RN.gastos._editId && !RN.gastos._keepEdit) RN.gastos._editId = null;
  RN.gastos._keepEdit = false;
  const tasa = RN.moneda.tasa();
  const html = `
    <div class="modal-header"><h3>Nuevo gasto</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Concepto *</label><input id="g-concepto" placeholder="Ej: Pago mensual a proveedor" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div></div>
      <div class="form-row cols-2">
        <div><label>Categor\u00eda</label><select id="g-cat">${RN.gastos.CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div><label>Fecha</label><input id="g-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>

            <div class="card" style="margin:0 0 16px;padding:14px;background:var(--bg)">
        <div style="margin-bottom:8px"><strong style="font-size:14px">💰 Pago del gasto</strong>
          <span class="muted" style="font-size:12px;margin-left:6px">USD y/o CUP</span></div>
        ${tasa ? `<div class="muted" style="font-size:12px;margin-bottom:10px">Tasa vigente: <strong>1 USD = ${tasa} CUP</strong></div>` : `<div class="muted" style="font-size:12px;margin-bottom:10px;color:var(--danger)">⚠ Configura la tasa USD en Ajustes para pagar en dólares.</div>`}
        <div class="form-row cols-2" style="margin:0">
          <div id="g-row-usd">
            <label>💵 Cantidad en USD</label>
            <input id="g-monto-usd" type="number" step="0.01" min="0" placeholder="0.00" ${tasa ? '' : 'disabled'} oninput="RN.gastos.recalcular()">
          </div>
          <div>
            <label>🪙 Cantidad en CUP</label>
            <input id="g-monto-cup" type="number" step="0.01" min="0" value="0" oninput="RN.gastos.recalcular()">
          </div>
        </div>
        <div id="g-desglose" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)"></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.gastos.guardar()">Guardar</button></div>`;
  RN.uiComponents.modal(html);
  RN.gastos._moneda = 'CUP';
  RN.gastos.recalcular();
};

/** Cambia la moneda activa del gasto. */
RN.gastos.setMoneda = function (moneda) {
  RN.gastos._moneda = moneda || 'CUP';
  var rowUsd = document.getElementById('g-row-usd');
  if (rowUsd) rowUsd.style.display = '';
  RN.gastos.recalcular();
};

/** Recalcula el total del gasto y muestra el desglose. */
RN.gastos.recalcular = function () {
  var usd = parseFloat((document.getElementById('g-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById('g-monto-cup') || {}).value) || 0;
  var tasa = RN.moneda.tasa();
  var totalCUP = +((usd * tasa) + cup).toFixed(2);
  var desg = document.getElementById('g-desglose');
  if (!desg) return;
  var html = '';
  if (usd > 0) {
    html += '<div class="cobro-desglose-row">\ud83d\udcb5 USD ' + usd + ' \u00d7 ' + tasa + ' = ' + RN.calc.formatCUP(usd * tasa) + '</div>';
  }
  if (cup > 0) {
    html += '<div class="cobro-desglose-row">\ud83e\ude99 ' + RN.calc.formatCUP(cup) + '</div>';
  }
  html += '<div class="cobro-desglose-row"><strong>Total: ' + RN.calc.formatCUP(totalCUP) + '</strong></div>';
  desg.innerHTML = html;
  desg.style.display = (usd > 0 || cup > 0) ? 'block' : 'none';
};

RN.gastos._editId = null;

RN.gastos.abrirEditar = function (id) {
  var g = (RN.state.gastos || []).find(function (x) { return x.id === id; });
  if (!g) { RN.notifyUI.toast('Gasto no encontrado', 'error'); return; }
  if (g.esCuadreCaja || g.esDevolucionInversion || g.esAplicacionPrestamo) {
    RN.notifyUI.toast('Este movimiento se gestiona desde Caja o Por pagar', 'info');
    return;
  }
  RN.gastos._editId = id;
  RN.gastos._keepEdit = true;
  RN.gastos.abrirNuevo();
  setTimeout(function () {
    var c = document.getElementById('g-concepto');
    if (c) c.value = g.concepto || '';
    var cat = document.getElementById('g-cat');
    if (cat) cat.value = g.categoria || 'General';
    var f = document.getElementById('g-fecha');
    if (f) f.value = (g.fecha || '').slice(0, 10);
    var moneda = g.moneda || 'CUP';
    if (RN.gastos.setMoneda) RN.gastos.setMoneda(moneda === 'MIXTO' ? 'CUP' : moneda);
    var usdIn = document.getElementById('g-monto-usd');
    var cupIn = document.getElementById('g-monto-cup');
    if (moneda === 'USD' && usdIn) {
      usdIn.value = g.montoPagadoUSD || 0;
      if (cupIn) cupIn.value = 0;
    } else {
      if (cupIn) cupIn.value = g.montoPagadoCUP != null ? g.montoPagadoCUP : (g.monto || 0);
      if (usdIn) usdIn.value = g.montoPagadoUSD || 0;
    }
    if (RN.gastos.recalcular) RN.gastos.recalcular();
    var h = document.querySelector('#modal-root .modal-header h3, .modal-header h3');
    if (h) h.textContent = 'Editar gasto';
  }, 30);
};

RN.gastos.guardar = function () {
  const concepto = document.getElementById('g-concepto').value.trim();
  if (!concepto) { RN.notifyUI.toast('El concepto es obligatorio', 'error'); return; }
  const usd = parseFloat((document.getElementById('g-monto-usd') || {}).value) || 0;
  const cup = parseFloat((document.getElementById('g-monto-cup') || {}).value) || 0;
  if (usd < 0 || cup < 0) {
    RN.notifyUI.toast('Los montos no pueden ser negativos', 'error');
    return;
  }
  const tasa = RN.moneda.tasa();
  if (usd > 0 && tasa > 0 && (tasa < 1 || tasa > 100000)) {
    RN.notifyUI.toast('La tasa USD (' + tasa + ') parece irreal. Revísala en Ajustes.', 'warn');
  }
  const totalCUP = +((usd * (tasa || 0)) + cup).toFixed(2);
  if (totalCUP <= 0) { RN.notifyUI.toast('El monto debe ser mayor que 0', 'error'); return; }

  const fecha = document.getElementById('g-fecha').value || new Date().toISOString().slice(0, 10);
  var moneda = RN.gastos._moneda || 'CUP';
  if (usd > 0 && cup > 0) moneda = 'MIXTO';
  else if (usd > 0 && cup <= 0) moneda = 'USD';
  else moneda = 'CUP';

  var data = {
    concepto: concepto,
    monto: totalCUP,
    categoria: document.getElementById('g-cat').value,
    fecha: fecha + 'T00:00:00',
    mes: fecha.slice(0, 7),
    moneda: moneda,
    montoPagadoUSD: usd,
    montoPagadoCUP: cup,
    tasaUsd: tasa
  };

  var editId = RN.gastos._editId;
  if (editId) {
    var existing = (RN.state.gastos || []).find(function (x) { return x.id === editId; });
    if (existing) {
      // conservar flags de sistema
      data.esPagoProveedor = existing.esPagoProveedor;
      data.id = existing.id;
      Object.assign(existing, data);
    }
    RN.gastos._editId = null;
  } else {
    data.id = RN.calc.uid('gasto');
    RN.state.gastos.push(data);
  }

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.gastos();
  if (RN.render.dashboard) RN.render.dashboard();
  RN.notifyUI.toast(editId ? 'Gasto actualizado' : ('Gasto registrado: ' + RN.calc.formatCUP(totalCUP)), 'success');
};

RN.gastos.eliminar = function (id) {
  var g = (RN.state.gastos || []).find(function (x) { return x.id === id; });
  var msg = '¿Eliminar este gasto?';
  if (g) {
    if (g.esCuadreCaja) msg = '¿Eliminar este ajuste de cuadre? Afectará el historial de caja.';
    else if (g.esPagoProveedor) msg = '¿Eliminar este pago a proveedor? El saldo del paquete puede quedar desactualizado.';
    else if (g.esDevolucionInversion) msg = '¿Eliminar esta devolución de deuda? El saldo a devolver volverá a subir.';
    else if (g.esAplicacionPrestamo) msg = '¿Eliminar esta aplicación de préstamo? Puede descuadrar el flujo del préstamo.';
  }
  RN.uiComponents.confirm('Eliminar movimiento', msg, function () {
    RN.state.gastos = RN.state.gastos.filter(function (x) { return x.id !== id; });
    RN.storageLocal.guardar();
    RN.render.gastos();
    if (RN.render.dashboard) RN.render.dashboard();
    RN.notifyUI.toast('Movimiento eliminado', 'warn');
  }, { danger: true });
};
