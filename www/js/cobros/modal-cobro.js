/**
 * cobros/modal-cobro.js — Registro de cobro mensual, cálculo de precio neto,
 * cobro de cuota de equipo en el mismo flujo, sub-panel de descuentos puntuales
 * con recálculo en vivo, pago COMBINADO USD + CUP (ambos coexisten),
 * desglose detallado del pago (monto a pagar, conversión USD→CUP, faltante,
 * excedente/vuelto que se descuenta del fondo de caja), pagos parciales,
 * y envío de comprobante por WhatsApp.
 *
 * LÓGICA DE PAGO COMBINADO:
 * - El campo CUP siempre muestra "lo que falta" considerando lo cubierto por USD.
 * - Al ingresar USD, el campo CUP se recalcula automáticamente (total - USD convertido).
 * - Al volver a CUP, el USD se mantiene y CUP muestra lo que falta (editable).
 * - Si (USD×tasa + CUP) < total → pago parcial.
 * - Si (USD×tasa + CUP) > total → excedente/vuelto (se descuenta del fondo).
 * - Si (USD×tasa + CUP) = total → pago completo.
 */
RN.modalCobro = RN.modalCobro || {};

RN.modalCobro._clienteId = null;
/** Moneda "activa" (enfocada) para el toggle visual: 'CUP' o 'USD'. */
RN.modalCobro._moneda = 'CUP';
/** Estado interno: monto USD ingresado (se mantiene al cambiar de moneda). */
RN.modalCobro._usdIngresado = 0;
/** Estado interno: monto CUP ingresado (se mantiene al cambiar de moneda). */
RN.modalCobro._cupIngresado = 0;

/**
 * v5.13.8 (BUG-1/LOG-1): Calcula el total a pagar incluyendo la mora
 * (meses de atraso sin pagar). Antes solo sumaba neto + eq, divergiendo
 * de deudaTotalCliente() que si incluye mora (netoMes * (mora + 1) + eq).
 * Ahora coincide: total = neto * (mora + 1) + eq.
 */
RN.modalCobro._totalAPagar = function () {
  var c = RN.state.clients.find(x => x.id === RN.modalCobro._clienteId);
  if (!c) return 0;
  var mes = RN.calc.mesActualStr();
  var neto = RN.calc.getPrecioNeto(c, mes);
  var mora = RN.calc.getMora(c);
  var inpEq = document.getElementById('cobro-monto-equipo');
  var eq = inpEq ? (parseFloat(inpEq.value) || 0) : 0;
  return +(neto * (mora + 1) + eq).toFixed(2);
};

/** Abre el modal de cobro para un cliente (desde cualquier vista). */
RN.modalCobro.abrir = function (clienteId) {
  const c = RN.state.clients.find(x => x.id === clienteId);
  if (!c) { RN.notifyUI.toast('Cliente no encontrado', 'error'); return; }
  RN.modalCobro._clienteId = clienteId;
  RN.modalCobro._moneda = 'CUP';
  RN.modalCobro._usdIngresado = 0;
  RN.modalCobro._cupIngresado = 0;
  const mes = RN.calc.mesActualStr();
  const base = RN.calc.getPrecioBase(c);
  const rec = RN.calc.getDescuentoRecurrente(c);
  const cuotaEq = RN.investment.getCuotaEquipoCliente(c);
  const deudaEq = RN.investment.getDeudaEquipoCliente(c);
  // v5.13.8 (CODE-2/UI-1): usar resumenCliente para mora y deuda total
  const resumen = RN.calc.resumenCliente(c, mes);
  // v5.14.4: vigencia centralizada en RN.descuentos.vigenteEnMes (helper único)
  const descPunt = RN.state.descuentos.filter(d => d.clienteId === clienteId && RN.descuentos.vigenteEnMes(d, mes));
  const tasa = RN.moneda.tasa();
  const fondo = RN.calc.fondoCaja();

  const descRows = descPunt.length ? descPunt.map(d => `<tr>
    <td>${d.tipo}</td><td>${RN.render.esc(d.motivo)}</td><td>${d.modo}</td><td>${RN.descuentos._badgeVigencia(d) || '<span class="muted">Este mes</span>'}</td>
    <td>${RN.calc.formatCUP(RN.calc.valorDescuento(d, clienteId))}</td>
    <td><button class="btn sm danger" onclick="RN.descuentos.eliminar('${RN.render.escAttr(d.id)}', true)">🗑</button></td>
  </tr>`).join('') : '<tr><td colspan="6" class="muted center">Sin descuentos ni bonificaciones este mes</td></tr>';

  // v5.13.8 (BUG-1): totalAPagar ahora incluye mora
  const moraVal = RN.calc.getMora(c);
  const totalAPagar = +(RN.calc.getPrecioNeto(c, mes) * (moraVal + 1) + cuotaEq).toFixed(2);

  const html = `
    <div class="modal-header"><h3>Cobro — ${RN.render.esc(c.nombre)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="card" style="margin:0 0 16px;padding:12px">
        <div class="flex" style="justify-content:space-between"><span class="muted">Plan / Precio base</span><strong>${RN.render.nombrePlan(c)} · ${RN.calc.formatCUP(base)}</strong></div>
        <div class="flex" style="justify-content:space-between"><span class="muted">Descuento recurrente</span><span>− ${RN.calc.formatCUP(rec)}</span></div>
        <div class="flex" style="justify-content:space-between"><span class="muted">Descuentos puntuales</span><span id="cobro-desc-punt">− ${RN.calc.formatCUP(RN.calc.getDescuentosPuntualesMes(clienteId, mes))}</span></div>
        <div class="divider"></div>
        <div class="flex" style="justify-content:space-between"><strong>Neto servicio (este mes)</strong><strong id="cobro-neto" style="font-size:18px">${RN.calc.formatCUP(RN.calc.getPrecioNeto(c, mes))}</strong></div>
        ${resumen.mora > 0 ? `<div class="flex" style="justify-content:space-between"><span class="muted">Mora (${resumen.mora} mes${resumen.mora !== 1 ? 'es' : ''} de atraso)</span><span class="badge due" id="cobro-mora-display">+ ${RN.calc.formatCUP(resumen.neto * resumen.mora)}</span></div>` : ''}
        ${resumen.mora > 0 ? `<div class="flex" style="justify-content:space-between"><strong>Deuda total (servicio + mora)</strong><strong id="cobro-deuda-total" style="font-size:18px;color:var(--danger)">${RN.calc.formatCUP(resumen.neto * (resumen.mora + 1))}</strong></div>` : ''}
      </div>

      ${deudaEq > 0 ? `<div class="card" style="margin:0 0 16px;padding:12px">
        <div class="flex" style="justify-content:space-between"><span class="muted">Deuda equipo pendiente</span><span class="badge due">${RN.calc.formatCUP(deudaEq)}</span></div>
        <div class="flex" style="justify-content:space-between"><span class="muted">Cuota mensual sugerida</span><span>${RN.calc.formatCUP(cuotaEq)}</span></div>
        <label style="margin-top:8px">Monto a cobrar de equipo en este pago (CUP)</label>
        <input id="cobro-monto-equipo" type="number" step="0.01" value="${cuotaEq}" max="${deudaEq}">
      </div>` : ''}

      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted)">Descuentos y bonificaciones del mes</h3>
      <div class="table-wrap mb-16"><table><thead><tr><th>Tipo</th><th>Motivo</th><th>Modo</th><th>Vigencia</th><th>Valor</th><th></th></tr></thead><tbody id="cobro-desc-tbody">${descRows}</tbody></table></div>
      <p class="muted" id="cobro-desc-hint" style="font-size:12px;margin:0 0 8px${descPunt.length ? ';display:none' : ''}">Se gestionan desde <strong>Finanzas → Descuentos</strong> o con el botón 🎁 de la lista de Cobros.</p>

      <div class="divider"></div>

      <!-- ====== Sección de pago combinado USD + CUP ====== -->
      <div class="card" style="margin:0 0 16px;padding:14px;background:var(--bg)">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong style="font-size:14px">💵 Pago del cliente</strong>
          <div class="moneda-toggle" id="cobro-moneda-toggle">
            <button type="button" class="btn sm primary" data-moneda="CUP" onclick="RN.modalCobro.setMoneda('CUP')">CUP</button>
            <button type="button" class="btn sm" data-moneda="USD" onclick="RN.modalCobro.setMoneda('USD')" ${tasa ? '' : 'disabled title="Configura la tasa USD en Ajustes"'}>USD</button>
          </div>
        </div>
        ${tasa ? `<div class="muted" style="font-size:12px;margin-bottom:10px">Tasa vigente: <strong>1 USD = ${tasa} CUP</strong> · Fondo de caja: <strong>${RN.calc.formatCUP(fondo)}</strong></div>` : `<div class="muted" style="font-size:12px;margin-bottom:10px;color:var(--danger)">⚠ No hay tasa USD configurada. Configúrala en Ajustes para aceptar pagos en USD.</div>`}

        <!-- Monto a pagar (siempre visible, referencia) -->
        <div class="cobro-desglose-row" style="border-bottom:1px dashed var(--border);padding-bottom:8px;margin-bottom:10px">
          <span class="muted">Monto a pagar</span>
          <strong id="cobro-a-pagar" style="font-size:16px">${RN.calc.formatCUP(totalAPagar)}</strong>
        </div>

        <!-- ====== Campo USD (siempre visible si hay tasa) ====== -->
        <div id="cobro-row-usd" style="${tasa ? '' : 'display:none'};margin-bottom:10px">
          <label>💵 Cantidad en USD <span class="muted" style="font-size:11px">(opcional)</span></label>
          <input id="cobro-monto-usd" type="number" step="0.01" placeholder="0.00" oninput="RN.modalCobro.onUSDChange()">
          <div class="muted" style="font-size:11px;margin-top:2px" id="cobro-usd-conv">↳ Equivale a 0.00 CUP</div>
        </div>

        <!-- ====== Campo CUP (siempre visible) ====== -->
        <div id="cobro-row-cup">
          <label>🪙 Cantidad en CUP <span class="muted" style="font-size:11px" id="cobro-cup-hint">(monto a pagar)</span></label>
          <input id="cobro-monto-cup" type="number" step="0.01" placeholder="0.00" oninput="RN.modalCobro.onCUPChange()">
        </div>

        <!-- ====== Desglose detallado del pago ====== -->
        <div id="cobro-desglose" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <!-- Fila: Total pagado en CUP (USD convertido + CUP) -->
          <div class="cobro-desglose-row">
            <span class="muted">🧮 Total pagado en CUP</span>
            <span id="cobro-desglose-pagado"><strong>—</strong></span>
          </div>
          <!-- Fila: Faltante (pago parcial) -->
          <div class="cobro-desglose-row" id="cobro-fila-falta" style="display:none">
            <span class="muted">⏳ Falta para completar</span>
            <span id="cobro-desglose-falta"><strong style="color:var(--amber)">—</strong></span>
          </div>
          <!-- Fila: Excedente / vuelto (en rojo) -->
          <div class="cobro-desglose-row" id="cobro-fila-excede" style="display:none">
            <span class="muted">⚠ Excedente a devolver</span>
            <span id="cobro-desglose-excede"><strong style="color:var(--danger)">—</strong></span>
          </div>
          <!-- Fila: Estado del pago -->
          <div class="cobro-desglose-row" id="cobro-fila-estado" style="display:none">
            <span class="muted">Estado</span>
            <span id="cobro-desglose-estado"><strong>—</strong></span>
          </div>
          <!-- Aviso de fondo insuficiente para vuelto -->
          <div id="cobro-aviso-fondo" style="display:none;margin-top:8px;padding:8px 10px;background:#fff3cd;border-radius:6px;font-size:12px;color:#856404">
            ⚠ El fondo de caja no tiene suficiente efectivo para el vuelto. Fondo actual: ${RN.calc.formatCUP(fondo)}
          </div>
        </div>
      </div>

      <div class="flex" style="justify-content:space-between;align-items:center">
        <strong style="font-size:18px">Total a cobrar</strong>
        <strong id="cobro-total" style="font-size:22px;color:var(--primary)">${RN.calc.formatCUP(totalAPagar)}</strong>
      </div>
      <div id="cobro-total-usd" style="text-align:right;margin-top:2px"></div>

      <div class="mt-16"><label>Notas (opcional)</label><input id="cobro-notas" placeholder="Ej: pagó en efectivo"></div>
      <label style="margin-top:12px"><input type="checkbox" id="cobro-enviar-wa" ${c.telefono ? '' : 'disabled'}> Enviar comprobante por WhatsApp ${c.telefono ? '' : '(sin teléfono)'}</label>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn success" onclick="RN.modalCobro.confirmar()">✓ Registrar cobro</button>
    </div>`;
  RN.uiComponents.modal(html, { lg: true });

  // Recalcular en vivo al cambiar monto de equipo
  const inpEq = document.getElementById('cobro-monto-equipo');
  if (inpEq) {
    inpEq.addEventListener('input', () => RN.modalCobro.recalcular());
  }

  // Inicializar: el campo CUP arranca con el monto total sugerido
  var inpCup = document.getElementById('cobro-monto-cup');
  if (inpCup) {
    inpCup.value = totalAPagar.toFixed(2);
    RN.modalCobro._cupIngresado = totalAPagar;
  }

  // v5.13.8 (UI-5): Atajo de teclado Ctrl/Cmd+Enter para confirmar cobro
  const modalEl = document.querySelector('.modal');
  if (modalEl) {
    modalEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        RN.modalCobro.confirmar();
      }
    });
  }

  // Mostrar equivalencia USD inicial
  RN.modalCobro._actualizarEquivalenciaUSD(totalAPagar);
  // Recalcular desglose inicial
  RN.modalCobro.recalcularDesdePago();
};

/**
 * Cambia la moneda "activa" (para el toggle visual).
 * Ambos campos (USD y CUP) siguen visibles y editables.
 * El USD se mantiene; el CUP se recalcula mostrando "lo que falta".
 */
RN.modalCobro.setMoneda = function (moneda) {
  RN.modalCobro._moneda = moneda;

  // Actualizar botones toggle
  document.querySelectorAll('#cobro-moneda-toggle button').forEach(function (b) {
    b.classList.toggle('primary', b.dataset.moneda === moneda);
  });

  // Al cambiar a USD: si el CUP tenía el monto total (pago completo sugerido),
  // limpiarlo para que el usuario empiece ingresando USD y el CUP se auto-recalcule.
  // Al volver a CUP: mantener el USD ingresado y recalcular el CUP (lo que falta).
  var inpCup = document.getElementById('cobro-monto-cup');
  var inpUsd = document.getElementById('cobro-monto-usd');
  var aPagar = RN.modalCobro._totalAPagar();

  if (moneda === 'USD') {
    // Si el CUP tiene exactamente el monto a pagar (valor por defecto/sugerido),
    // lo limpiamos para que el usuario ingrese USD y el CUP se auto-recalcule.
    if (inpCup) {
      var cupVal = parseFloat(inpCup.value) || 0;
      if (Math.abs(cupVal - aPagar) < 0.01) {
        inpCup.value = '';
        RN.modalCobro._cupIngresado = 0;
      }
    }
    if (inpUsd) inpUsd.focus();
  } else {
    // Al volver a CUP: recalcular el CUP con "lo que falta" considerando el USD
    RN.modalCobro._recalcularCUPFaltante();
    if (inpCup) inpCup.focus();
  }

  RN.modalCobro.recalcularDesdePago();
};

/**
 * Recalcula el campo CUP para mostrar "lo que falta para completar el pago"
 * considerando lo ya cubierto por el USD ingresado.
 * Si el USD cubre todo o más, el CUP se pone en 0.
 */
RN.modalCobro._recalcularCUPFaltante = function () {
  var inpUsd = document.getElementById('cobro-monto-usd');
  var inpCup = document.getElementById('cobro-monto-cup');
  if (!inpCup) return;

  var usd = inpUsd ? (parseFloat(inpUsd.value) || 0) : 0;
  var tasa = RN.moneda.tasa();
  var aPagar = RN.modalCobro._totalAPagar();
  var cupDesdeUSD = RN.moneda.aCUP(usd); // lo que el USD cubre en CUP
  var falta = aPagar - cupDesdeUSD;

  if (falta <= 0) {
    // El USD cubre todo o más → CUP en 0
    inpCup.value = '0.00';
    RN.modalCobro._cupIngresado = 0;
  } else {
    // Mostrar lo que falta en CUP
    inpCup.value = falta.toFixed(2);
    RN.modalCobro._cupIngresado = falta;
  }
};

/**
 * Handler cuando el usuario escribe en el campo USD.
 * Recalcula automáticamente el campo CUP (lo que falta) y el desglose.
 */
RN.modalCobro.onUSDChange = function () {
  var inpUsd = document.getElementById('cobro-monto-usd');
  var usd = inpUsd ? (parseFloat(inpUsd.value) || 0) : 0;
  RN.modalCobro._usdIngresado = usd;

  // Actualizar texto de conversión USD → CUP
  var elConv = document.getElementById('cobro-usd-conv');
  if (elConv) {
    var cupEquiv = RN.moneda.aCUP(usd);
    elConv.textContent = '↳ Equivale a ' + RN.calc.formatCUP(cupEquiv);
  }

  // Auto-recalcular el CUP (lo que falta) — solo si la moneda activa es USD
  // o si el CUP está en 0/vacío (el usuario no lo ha editado manualmente)
  if (RN.modalCobro._moneda === 'USD') {
    RN.modalCobro._recalcularCUPFaltante();
  }

  RN.modalCobro.recalcularDesdePago();
};

/**
 * Handler cuando el usuario escribe en el campo CUP.
 * Actualiza el estado interno y recalcula el desglose.
 */
RN.modalCobro.onCUPChange = function () {
  var inpCup = document.getElementById('cobro-monto-cup');
  var cup = inpCup ? (parseFloat(inpCup.value) || 0) : 0;
  RN.modalCobro._cupIngresado = cup;
  RN.modalCobro.recalcularDesdePago();
};

/**
 * Recalcula el desglose completo basado en los campos USD y CUP.
 * Total pagado = (USD × tasa) + CUP.
 * Compara contra el monto a pagar para determinar: completo, parcial o excedente.
 */
RN.modalCobro.recalcularDesdePago = function () {
  var inpUsd = document.getElementById('cobro-monto-usd');
  var inpCup = document.getElementById('cobro-monto-cup');
  var elTot = document.getElementById('cobro-total');
  var elTotUsd = document.getElementById('cobro-total-usd');
  var elAPagar = document.getElementById('cobro-a-pagar');
  var desg = document.getElementById('cobro-desglose');
  var elCupHint = document.getElementById('cobro-cup-hint');

  if (!inpCup) return;

  var usd = inpUsd ? (parseFloat(inpUsd.value) || 0) : 0;
  var cup = parseFloat(inpCup.value) || 0;
  var tasa = RN.moneda.tasa();
  var aPagar = RN.modalCobro._totalAPagar();

  // Actualizar "monto a pagar" por si cambió el equipo
  if (elAPagar) elAPagar.textContent = RN.calc.formatCUP(aPagar);

  // Total pagado en CUP = (USD convertido) + CUP directo
  var cupDesdeUSD = RN.moneda.aCUP(usd);
  var pagadoCUP = cupDesdeUSD + cup;
  var pagadoUSD = usd + (tasa ? parseFloat(RN.moneda.aUSD(cup)) : 0);

  // Actualizar hint del campo CUP
  if (elCupHint) {
    if (usd > 0) {
      var faltaCalc = aPagar - cupDesdeUSD;
      if (faltaCalc > 0) {
        elCupHint.textContent = '(falta ' + RN.calc.formatCUP(faltaCalc) + ' después de USD)';
      } else {
        elCupHint.textContent = '(USD cubre el total)';
      }
    } else {
      elCupHint.textContent = '(monto a pagar)';
    }
  }

  // Si no hay ningún monto ingresado, mostrar total como referencia
  if (pagadoCUP <= 0 && usd <= 0 && cup <= 0) {
    if (elTot) elTot.textContent = RN.calc.formatCUP(aPagar);
    if (elTotUsd) elTotUsd.innerHTML = (tasa && aPagar > 0) ? '<span class="muted" style="font-size:13px">≈ ' + RN.moneda.formatUSD(RN.moneda.aUSD(aPagar)) + '</span>' : '';
    if (desg) desg.style.display = 'none';
    return;
  }

  // Mostrar desglose
  if (desg) desg.style.display = 'block';

  // ====== Actualizar filas del desglose ======

  // Fila total pagado en CUP (siempre visible)
  var dPagado = document.getElementById('cobro-desglose-pagado');
  if (dPagado) {
    var detalle = '';
    if (usd > 0 && cup > 0) {
      detalle = ' <span class="muted" style="font-size:11px">(' + RN.moneda.formatUSD(usd) + ' + ' + RN.calc.formatCUP(cup) + ')</span>';
    } else if (usd > 0) {
      detalle = ' <span class="muted" style="font-size:11px">(desde USD)</span>';
    }
    dPagado.innerHTML = '<strong>' + RN.calc.formatCUP(pagadoCUP) + '</strong>' + detalle;
  }

  // ====== Calcular faltante o excedente ======
  var diferencia = pagadoCUP - aPagar;
  var filaFalta = document.getElementById('cobro-fila-falta');
  var filaExcede = document.getElementById('cobro-fila-excede');
  var filaEstado = document.getElementById('cobro-fila-estado');
  var dFalta = document.getElementById('cobro-desglose-falta');
  var dExcede = document.getElementById('cobro-desglose-excede');
  var dEstado = document.getElementById('cobro-desglose-estado');
  var avisoFondo = document.getElementById('cobro-aviso-fondo');
  var fondo = RN.calc.fondoCaja();

  if (filaFalta) filaFalta.style.display = 'none';
  if (filaExcede) filaExcede.style.display = 'none';
  if (filaEstado) filaEstado.style.display = 'flex';
  if (avisoFondo) avisoFondo.style.display = 'none';

  if (Math.abs(diferencia) < 0.01) {
    // Pago exacto
    if (dEstado) dEstado.innerHTML = '<strong style="color:var(--green)">✓ Pago completo</strong>';
    if (elTot) elTot.textContent = RN.calc.formatCUP(pagadoCUP);
  } else if (diferencia < 0) {
    // Pago parcial — falta dinero
    var falta = Math.abs(diferencia);
    if (filaFalta) filaFalta.style.display = 'flex';
    if (dFalta) dFalta.innerHTML = '<strong style="color:var(--amber)">' + RN.calc.formatCUP(falta) + '</strong>';
    if (dEstado) dEstado.innerHTML = '<strong style="color:var(--amber)">⏳ Pago parcial</strong>';
    if (elTot) elTot.textContent = RN.calc.formatCUP(pagadoCUP);
  } else {
    // Excedente — hay vuelto que devolver
    var excede = diferencia;
    if (filaExcede) filaExcede.style.display = 'flex';
    if (dExcede) dExcede.innerHTML = '<strong style="color:var(--danger)">' + RN.calc.formatCUP(excede) + ' (se descuenta del fondo)</strong>';
    if (dEstado) dEstado.innerHTML = '<strong style="color:var(--danger)">⚠ Excedente — devolver ' + RN.calc.formatCUP(excede) + '</strong>';
    if (elTot) elTot.textContent = RN.calc.formatCUP(aPagar);

    // Avisar si el fondo no tiene suficiente para el vuelto
    if (avisoFondo && excede > fondo) {
      avisoFondo.style.display = 'block';
      avisoFondo.innerHTML = '⚠ El fondo de caja no tiene suficiente efectivo para el vuelto. Fondo actual: ' + RN.calc.formatCUP(fondo) + ' · Vuelto: ' + RN.calc.formatCUP(excede);
    }
  }

  // Equivalencia USD del total
  if (elTotUsd) {
    var totalDisplay = (diferencia > 0) ? aPagar : pagadoCUP;
    if (tasa && totalDisplay > 0) {
      elTotUsd.innerHTML = '<span class="muted" style="font-size:13px">≈ ' + RN.moneda.formatUSD(RN.moneda.aUSD(totalDisplay)) + '</span>';
    } else {
      elTotUsd.innerHTML = '';
    }
  }
};

/** Muestra la equivalencia en USD del total calculado (modo automático, sin input manual). */
RN.modalCobro._actualizarEquivalenciaUSD = function (totalCUP) {
  var el = document.getElementById('cobro-total-usd');
  if (!el) return;
  var tasa = RN.moneda.tasa();
  if (tasa && totalCUP > 0) {
    el.innerHTML = '<span class="muted" style="font-size:13px">≈ ' + RN.moneda.formatUSD(RN.moneda.aUSD(totalCUP)) + '</span>';
  }
};

/**
 * v5.13.8 (BUG-1/CODE-2): Recalcula el total mostrado en el modal incluyendo mora.
 * Usa resumenCliente para centralizar calculos y actualizar mora/deuda total.
 */
RN.modalCobro.recalcular = function () {
  const c = RN.state.clients.find(x => x.id === RN.modalCobro._clienteId);
  if (!c) return;
  const mes = RN.calc.mesActualStr();
  // v5.13.8: usar resumenCliente para incluir mora
  const r = RN.calc.resumenCliente(c, mes);
  const neto = r.neto;
  const mora = r.mora;
  const inpEq = document.getElementById('cobro-monto-equipo');
  const eq = inpEq ? (parseFloat(inpEq.value) || 0) : 0;
  // Total con mora: neto * (mora + 1) + eq
  const totalConMora = +(neto * (mora + 1) + eq).toFixed(2);
  const elNeto = document.getElementById('cobro-neto');
  const elDesc = document.getElementById('cobro-desc-punt');
  const elTot = document.getElementById('cobro-total');
  const elAPagar = document.getElementById('cobro-a-pagar');
  // v5.13.8 (UI-1): actualizar mora y deuda total si existen
  var elMora = document.getElementById('cobro-mora-display');
  var elDeudaTotal = document.getElementById('cobro-deuda-total');
  if (elNeto) elNeto.textContent = RN.calc.formatCUP(neto);
  if (elDesc) elDesc.textContent = '\u2212 ' + RN.calc.formatCUP(RN.calc.getDescuentosPuntualesMes(c.id, mes));
  if (elMora && mora > 0) elMora.textContent = '+ ' + RN.calc.formatCUP(neto * mora);
  if (elDeudaTotal && mora > 0) elDeudaTotal.textContent = RN.calc.formatCUP(neto * (mora + 1));
  if (elAPagar) elAPagar.textContent = RN.calc.formatCUP(totalConMora);
  if (elTot) elTot.textContent = RN.calc.formatCUP(totalConMora);

  // Recalcular desglose con los valores actuales
  RN.modalCobro.recalcularDesdePago();
};

/** Abre el modal de cobro eligiendo cliente (desde la vista de cobros / dashboard). */
RN.modalCobro.abrirDesdeCobros = function () {
  if (!RN.state.clients.length) { RN.notifyUI.toast('No hay clientes', 'warn'); return; }
  // v5.13.5 (ISSUE #8): Usar un modal estilizado con select de clientes en
  // lugar del enfoque hacky anterior (prompt + reemplazo de input por select).
  var activos = RN.calc.clientesActivos();
  if (!activos.length) { RN.notifyUI.toast('No hay clientes activos', 'warn'); return; }
  var opts = activos.map(function (c) {
    return '<option value="' + c.id + '">' + RN.render.esc(c.nombre) + '</option>';
  }).join('');
  var html =
    '<div class="modal-header"><h3>Registrar cobro</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body"><label>Selecciona cliente</label>' +
    '<select id="cobro-select-cliente">' + opts + '</select></div>' +
    '<div class="modal-footer"><button class="btn ghost" id="cobro-select-cancel">Cancelar</button>' +
    '<button class="btn primary" id="cobro-select-ok">Continuar</button></div>';
  RN.uiComponents.modal(html);
  document.getElementById('cobro-select-ok').onclick = function () {
    var v = document.getElementById('cobro-select-cliente').value;
    RN.uiComponents.cerrarModal();
    if (v) RN.modalCobro.abrir(v);
  };
  document.getElementById('cobro-select-cancel').onclick = function () {
    RN.uiComponents.cerrarModal();
  };
};

/**
 * Confirma el cobro: registra en historial, marca descuentos aplicados, descuenta equipo,
 * descuenta excedente/vuelto del fondo de caja.
 * Pago combinado: total = (USD × tasa) + CUP.
 * Detecta pago parcial (total < a pagar) o excedente (total > a pagar).
 */
RN.modalCobro.confirmar = function () {
  const c = RN.state.clients.find(x => x.id === RN.modalCobro._clienteId);
  if (!c) return;
  const mes = RN.calc.mesActualStr();
  const neto = RN.calc.getPrecioNeto(c, mes);
  const inpEq = document.getElementById('cobro-monto-equipo');
  const montoEq = inpEq ? Math.max(0, parseFloat(inpEq.value) || 0) : 0;
  const notas = (document.getElementById('cobro-notas') || {}).value || '';
  const enviarWA = document.getElementById('cobro-enviar-wa') && document.getElementById('cobro-enviar-wa').checked;

  // ====== Leer montos de ambos campos (pago combinado) ======
  var inpUsd = document.getElementById('cobro-monto-usd');
  var inpCup = document.getElementById('cobro-monto-cup');
  var usd = inpUsd ? (parseFloat(inpUsd.value) || 0) : 0;
  var cup = inpCup ? (parseFloat(inpCup.value) || 0) : 0;
  var tasa = RN.moneda.tasa();

  // ====== v5.13.4 (Mejora #5): Validación visual de campos financieros ======
  // Validar que los montos no sean negativos
  if (usd < 0 || cup < 0 || montoEq < 0) {
    RN.notifyUI.toast('Los montos no pueden ser negativos', 'error');
    return;
  }
  // Validar que el monto de equipo no exceda la deuda pendiente
  var deudaEqActual = RN.investment.getDeudaEquipoCliente(c);
  if (montoEq > deudaEqActual + 0.01) {
    RN.notifyUI.toast('El monto de equipo (' + RN.calc.formatCUP(montoEq) +
      ') excede la deuda pendiente (' + RN.calc.formatCUP(deudaEqActual) + ')', 'error');
    return;
  }
  // Validar que el neto del servicio no sea negativo (no debería pasar, pero por seguridad)
  if (neto < 0) {
    RN.notifyUI.toast('El precio neto del servicio es negativo. Revisa descuentos recurrentes.', 'error');
    return;
  }
  // Validar tasa USD razonable (entre 1 y 100000 CUP/USD) si hay pago en USD
  if (usd > 0 && tasa > 0 && (tasa < 1 || tasa > 100000)) {
    RN.notifyUI.toast('La tasa USD (' + tasa + ') parece irreal. Revísala en Ajustes.', 'warn');
    // No bloqueamos, solo advertimos (la tasa puede ser legítimamente extrema)
  }

  // v5.13.8 (BUG-1/LOG-1): Total a pagar incluye mora (meses de atraso)
  var mora = RN.calc.getMora(c);
  var aPagar = +(neto * (mora + 1) + montoEq).toFixed(2);

  // Total pagado en CUP = (USD convertido) + CUP directo
  var cupDesdeUSD = RN.moneda.aCUP(usd);
  var pagadoCUP = cupDesdeUSD + cup;
  var pagadoUSD = usd + (tasa ? parseFloat(RN.moneda.aUSD(cup)) : 0);

  // Determinar moneda principal (para compatibilidad con recibo/historial)
  var moneda = 'CUP';
  if (usd > 0 && cup <= 0) moneda = 'USD';
  else if (usd > 0 && cup > 0) moneda = 'MIXTO';

  // Si no se ingresó nada, usar el total (pago completo por defecto)
  if (pagadoCUP <= 0 && usd <= 0 && cup <= 0) {
    pagadoCUP = aPagar;
    cup = aPagar;
    pagadoUSD = tasa ? parseFloat(RN.moneda.aUSD(aPagar)) : 0;
    moneda = 'CUP';
  }

  // ====== Determinar tipo de pago: completo, parcial o excedente ======
  var diferencia = pagadoCUP - aPagar;
  var tipoPago = 'completo';
  var falta = 0;
  var excedente = 0;

  if (Math.abs(diferencia) < 0.01) {
    tipoPago = 'completo';
  } else if (diferencia < 0) {
    tipoPago = 'parcial';
    falta = Math.abs(diferencia);
  } else {
    tipoPago = 'excedente';
    excedente = diferencia;
  }

  // ====== Si hay excedente (vuelto), registrar para referencia ======
  var fondoAntes = RN.calc.fondoCaja();
  // v5.10.1: El excedente NO se descuenta del fondo porque los ingresos (h.monto)
  // ya registran solo el neto. El vuelto entra y sale, no afecta la ganancia.
  var fondoDespues = +(fondoAntes + neto).toFixed(2);

  // v5.13.1: Bug #2 y #3 — separar consistentemente servicio y equipo.
  // Antes: pago parcial registraba pagadoCUP (servicio+equipo mezclados) en h.monto,
  // causando doble conteo en ingresosMes() y equipo no descontado.
  // Ahora: h.monto SIEMPRE es solo servicio, h.montoEquipo SIEMPRE es solo equipo pagado.
  var montoServicioRegistrado = neto;
  var montoEquipoPagado = montoEq;
  if (tipoPago === 'parcial') {
    // v5.13.5 (ISSUE #6/#7): Respetar el montoEquipo ingresado por el usuario
    // cuando lo especificó explícitamente. Antes el código siempre recalculaba
    // montoEquipoPagado = max(0, pagadoCUP - neto), ignorando la intención del
    // usuario (ej: pagar solo el equipo este mes) y no reduciendo la deuda de
    // equipo como esperaba.
    if (montoEq > 0) {
      // El usuario especificó cuánto va al equipo — respetarlo
      montoEquipoPagado = Math.min(montoEq, pagadoCUP);
      montoServicioRegistrado = Math.max(0, pagadoCUP - montoEquipoPagado);
    } else {
      // Sin especificación: aplicar al servicio primero, remanente al equipo
      montoServicioRegistrado = Math.min(pagadoCUP, neto);
      montoEquipoPagado = Math.max(0, pagadoCUP - neto);
    }
  }

  // v5.13.8 (BUG-4): Pre-computar descuentos a aplicar una sola vez
  // (antes se filtraba dos veces: al construir h y al marcar como aplicado)
  // v5.14.4: vigencia centralizada en RN.descuentos.vigenteEnMes (helper único)
  var descuentosAplicar = RN.state.descuentos.filter(d => d.clienteId === c.id && RN.descuentos.vigenteEnMes(d, mes));

  // Recibo
  RN.state.reciboCounter = (RN.state.reciboCounter || 0) + 1;
  const reciboNum = RN.calc.proxReciboNum();

  const h = {
    id: RN.calc.uid('cob'),
    clienteId: c.id,
    tipo: 'servicio',
    mes,
    // v5.13.1: h.monto SIEMPRE es solo el servicio (nunca incluye equipo)
    monto: montoServicioRegistrado,
    // v5.13.1: h.montoEquipo SIEMPRE es solo el equipo realmente pagado
    montoEquipo: montoEquipoPagado,
    fecha: new Date().toISOString(),
    reciboNum,
    notas,
    descuentoRecurrente: RN.calc.getDescuentoRecurrente(c),
    descuentosPuntualesIds: descuentosAplicar.map(d => d.id),
    // ====== Campos de moneda del pago (combinado) ======
    moneda: moneda,
    montoPagadoUSD: usd,
    montoPagadoCUP: cup,
    montoPagadoCUPDesdeUSD: cupDesdeUSD,
    totalPagadoCUP: pagadoCUP,
    totalPagadoUSD: pagadoUSD,
    totalCUP: montoServicioRegistrado + montoEquipoPagado,
    totalAPagar: aPagar,
    tasaUsd: tasa,
    // ====== Campos de tipo de pago ======
    tipoPago: tipoPago,
    falta: falta,
    excedente: excedente,
    fondoAntes: fondoAntes,
    fondoDespues: fondoDespues,
    // v5.13.8 (BUG-1): guardar mora para el recibo
    mora: mora,
    montoMora: +(neto * mora).toFixed(2)
  };
  RN.state.history.push(h);

  // v5.13.8 (BUG-4): Usar el array pre-computado en lugar de re-filtrar
  // v5.14.4 — MULTI-MES (el cambio más delicado del feature):
  // Antes: d.estado='aplicado'; d.cobroHid=h.id → MATABA la bonificación tras
  // el primer mes. Ahora se registra UNA APLICACIÓN POR MES con el valor
  // COBRADO congelado (R2), y solo pasa a 'aplicado' cuando ya no aplicará a
  // ningún mes futuro (RN.descuentos.aplicarEnMes): puntual/unPago → inmediato;
  // N-meses → al cobrarse el último mes del rango; permanente → nunca (queda
  // activa/pendiente hasta que el administrador la anule).
  descuentosAplicar.forEach(d => {
    RN.descuentos.aplicarEnMes(d, mes, h.id, RN.calc.valorDescuento(d, c.id));
  });

  // v5.13.1: Bug #3 — descuenta equipo SIEMPRE que se haya pagado parte del equipo.
  // Antes: tipoPago !== 'parcial' impedía descontar equipo en pago parcial,
  // pero el equipo pagado se registraba en h.montoEquipo, quedando deuda fantasma.
  if (montoEquipoPagado > 0 && c.deudaEquipo > 0) {
    c.deudaEquipo = Math.max(0, +(c.deudaEquipo - montoEquipoPagado).toFixed(2));
  }

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();

  // Mensaje según tipo de pago
  var msg = '';
  if (tipoPago === 'completo') {
    msg = `Cobro registrado: ${RN.calc.formatCUP(aPagar)}`;
  } else if (tipoPago === 'parcial') {
    msg = `Pago parcial: ${RN.calc.formatCUP(pagadoCUP)} · Falta ${RN.calc.formatCUP(falta)}`;
  } else {
    msg = `Cobro registrado: ${RN.calc.formatCUP(aPagar)} · Vuelto: ${RN.calc.formatCUP(excedente)}`;
  }
  // Detalle de monedas si es combinado
  if (usd > 0 && cup > 0) {
    msg += ` (${RN.moneda.formatUSD(usd)} + ${RN.calc.formatCUP(cup)})`;
  } else if (usd > 0) {
    msg += ` (${RN.moneda.formatUSD(usd)})`;
  }
  msg += ` · ${reciboNum}`;
  RN.notifyUI.toast(msg, 'success');

  // Notificación local
  RN.notify.local('Cobro registrado', c.nombre + ': ' + RN.calc.formatCUP(aPagar));

  // WhatsApp
  if (enviarWA && c.telefono) {
    RN.whatsapp.enviarComprobante(h.id);
  }

  // Ver recibo
  RN.recibo.ver(h.id);
};
