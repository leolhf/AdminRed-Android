/**
 * gastos.js — Gastos del negocio.
 * v5.11.0: Soporte para registrar gastos pagados en USD al cambio vigente
 *          (toggle CUP/USD/Mixto con conversión automática a CUP para el fondo).
 */
RN.gastos = RN.gastos || {};

RN.gastos.CATEGORIAS = ['General', 'Internet proveedor', 'Electricidad', 'Equipos', 'Mantenimiento', 'Transporte', 'Salarios', 'Otros'];

RN.gastos._moneda = 'CUP';

RN.gastos.abrirNuevo = function () {
  const tasa = RN.moneda.tasa();
  const html = `
    <div class="modal-header"><h3>Nuevo gasto</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Concepto *</label><input id="g-concepto" placeholder="Ej: Pago mensual a proveedor"></div></div>
      <div class="form-row cols-2">
        <div><label>Categor\u00eda</label><select id="g-cat">${RN.gastos.CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div><label>Fecha</label><input id="g-fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>

      <div class="card" style="margin:0 0 16px;padding:14px;background:var(--bg)">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong style="font-size:14px">\ud83d\udcb0 Moneda de pago</strong>
          <div class="moneda-toggle" id="g-moneda-toggle">
            <button type="button" class="btn sm primary" data-moneda="CUP" onclick="RN.gastos.setMoneda('CUP')">CUP</button>
            <button type="button" class="btn sm" data-moneda="USD" onclick="RN.gastos.setMoneda('USD')" ${tasa ? '' : 'disabled title=\"Configura la tasa USD en Ajustes\"'}>USD</button>
            <button type="button" class="btn sm" data-moneda="MIXTO" onclick="RN.gastos.setMoneda('MIXTO')" ${tasa ? '' : 'disabled title=\"Configura la tasa USD en Ajustes\"'}>Mixto</button>
          </div>
        </div>
        ${tasa ? `<div class="muted" style="font-size:12px;margin-bottom:10px">Tasa vigente: <strong>1 USD = ${tasa} CUP</strong></div>` : `<div class="muted" style="font-size:12px;margin-bottom:10px;color:var(--danger)">\u26a0 No hay tasa USD configurada. Config\u00farala en Ajustes para pagar en USD.</div>`}

        <div id="g-row-usd" style="display:none;margin-bottom:10px">
          <label>\ud83d\udcb5 Cantidad en USD</label>
          <input id="g-monto-usd" type="number" step="0.01" placeholder="0.00" oninput="RN.gastos.recalcular()">
        </div>
        <div>
          <label>\ud83e\ude99 Cantidad en CUP</label>
          <input id="g-monto-cup" type="number" step="0.01" value="0" oninput="RN.gastos.recalcular()">
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
  RN.gastos._moneda = moneda;
  document.querySelectorAll('#g-moneda-toggle button').forEach(function (b) {
    b.classList.toggle('primary', b.dataset.moneda === moneda);
  });
  var rowUsd = document.getElementById('g-row-usd');
  if (rowUsd) rowUsd.style.display = (moneda === 'USD' || moneda === 'MIXTO') ? '' : 'none';
  if (moneda === 'CUP') {
    var usdIn = document.getElementById('g-monto-usd');
    if (usdIn) usdIn.value = 0;
  } else if (moneda === 'USD') {
    var cupIn = document.getElementById('g-monto-cup');
    if (cupIn) cupIn.value = 0;
  }
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

RN.gastos.guardar = function () {
  const concepto = document.getElementById('g-concepto').value.trim();
  if (!concepto) { RN.notifyUI.toast('El concepto es obligatorio', 'error'); return; }
  const usd = parseFloat((document.getElementById('g-monto-usd') || {}).value) || 0;
  const cup = parseFloat((document.getElementById('g-monto-cup') || {}).value) || 0;
  // v5.13.4 (Mejora #5): Validar montos no negativos
  if (usd < 0 || cup < 0) {
    RN.notifyUI.toast('Los montos no pueden ser negativos', 'error');
    return;
  }
  const tasa = RN.moneda.tasa();
  // v5.13.4 (Mejora #5): Advertir si la tasa parece irreal y hay pago en USD
  if (usd > 0 && tasa > 0 && (tasa < 1 || tasa > 100000)) {
    RN.notifyUI.toast('La tasa USD (' + tasa + ') parece irreal. Revísala en Ajustes.', 'warn');
  }
  const totalCUP = +((usd * tasa) + cup).toFixed(2);
  if (totalCUP <= 0) { RN.notifyUI.toast('El monto debe ser mayor que 0', 'error'); return; }

  const fecha = document.getElementById('g-fecha').value || new Date().toISOString().slice(0, 10);
  var moneda = RN.gastos._moneda;
  if (usd > 0 && cup > 0) moneda = 'MIXTO';
  else if (usd > 0 && cup <= 0) moneda = 'USD';
  else moneda = 'CUP';

  RN.state.gastos.push({
    id: RN.calc.uid('gasto'),
    concepto,
    monto: totalCUP,
    categoria: document.getElementById('g-cat').value,
    // v5.13.5 (ISSUE #23): Construir fecha ISO sin conversión de timezone.
    fecha: fecha + 'T00:00:00',
    mes: fecha.slice(0, 7),
    moneda: moneda,
    montoPagadoUSD: usd,
    montoPagadoCUP: cup,
    tasaUsd: tasa
  });
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.gastos();
  RN.render.dashboard();
  RN.notifyUI.toast('Gasto registrado: ' + RN.calc.formatCUP(totalCUP) + (usd > 0 ? ' (' + RN.moneda.formatUSD(usd) + (cup > 0 ? ' + ' + RN.calc.formatCUP(cup) : '') + ')' : ''), 'success');
};

RN.gastos.eliminar = function (id) {
  RN.uiComponents.confirm('Eliminar gasto', '\u00bfEliminar este gasto?', () => {
    RN.state.gastos = RN.state.gastos.filter(x => x.id !== id);
    RN.storageLocal.guardar();
    RN.render.gastos();
    RN.render.dashboard();
    RN.notifyUI.toast('Gasto eliminado', 'warn');
  }, { danger: true });
};
