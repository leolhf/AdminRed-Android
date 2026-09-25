/**
 * cobros/caja.js — Gestión de retiros/extracciones y depósitos del fondo de caja.
 * v5.10.2: Permite al administrador retirar dinero del fondo de caja
 * (ganancia acumulada) para uso personal o del negocio.
 *
 * Los retiros se guardan como gastos con categoria "Retiro de caja"
 * para que se resten automaticamente del fondo de caja calculado
 * (fondoInicial + ingresosTotales - gastosTotales).
 *
 * Funciones publicas:
 *   RN.caja.extraer()      — abre el modal para registrar un retiro
 *   RN.caja.guardar()      — guarda el retiro
 *   RN.caja.listar()       — muestra el historial de retiros
 *   RN.caja.totalRetiros() — suma total de retiros historicos
 *
 * v5.19.0: MODELO "DOS BOLSILLOS". Cada mes la ganancia del mes (ingresos −
 * gastos, SIN retiros) se reparte: un % (default 70) va al bolsillo RESERVA
 * (intocable) y el resto al bolsillo LIBRE. Los retiros se descuentan SOLO del
 * bolsillo libre. Además, los retiros ya NO se guardan como gastos: viven en
 * RN.state.retiros (antes ensuciaban la utilidad). Ver RN.calc.bolsillos().
 *
 * v5.17.0: DEPÓSITOS a la caja (aportes de dinero al fondo). A diferencia de los
 * retiros (que restan), los depósitos se guardan en RN.state.depositos y SUMAN
 * al fondo de caja.
 *   RN.caja.depositar()        — abre el modal para registrar un depósito
 *   RN.caja.guardarDeposito()  — guarda el depósito
 *   RN.caja.listarDepositos()  — muestra el historial de depósitos
 *   RN.caja.eliminarDeposito() — elimina un depósito
 *
 * v5.13.2: RESPONSABILIDAD ÚNICA — Las funciones de DEVOLUCIÓN DE PRÉSTAMO
 * (devolucionPrestamo, guardarDevolucion, historialDevoluciones,
 * eliminarDevolucion, _validarDevolucion) se movieron a inversion.js porque
 * son responsabilidad del módulo de inversión, no de la caja. caja.js ahora
 * solo gestiona retiros de caja personales. Esto elimina la mezcla de dos
 * conceptos distintos (retiros de ganancia vs. repagos de capital prestado)
 * que antes coexistían en este archivo.
 *
 * v5.20.0: DOBLE MONEDA CUP/USD. Los retiros y depósitos ahora usan el mismo
 * bloque de pago CUP/USD/Mixto de core/moneda.js (RN.moneda.bloquePagoHTML,
 * modo "derivado" porque no hay un "monto a pagar" predefinido: el monto se
 * calcula a partir de lo que el usuario ingresa). Cada movimiento guarda
 * `moneda`, `montoOriginal` (USD físico, si aplica), `montoCUPDirecto` y
 * `tasaUsada`, además de `monto` que sigue siendo SIEMPRE el equivalente en
 * CUP (así fondoCaja()/gastosTotales()/etc. no cambian). Ver también
 * RN.calc.usdEnCaja(), que suma el USD físico entrado por depósitos Y por
 * cobros de clientes pagados en USD (modal-cobro.js).
 *
 * v5.30.0: CAJA MULTIMONEDA REAL (corrección del bug de MIXTO).
 * Un movimiento "Mixto" (ej: $20 + 3.000 CUP) se contabilizaba ENTERO como
 * CUP: la parte en dólares nunca entraba a la gaveta de USD y su equivalente
 * se sumaba al CUP físico, dejando los dos saldos descuadrados. Ahora:
 *   - El desglose real de cada movimiento vive en RN.calc.desgloseMovimiento().
 *   - RN.calc.usdEnCaja()/totalDepositosPorMoneda()/totalRetirosPorMoneda()
 *     SÍ separan la parte en USD de los movimientos mixtos.
 *   - Un retiro no puede sacar más billetes de los que hay DE ESA MONEDA
 *     (RN.calc.validarMovimientoCaja()), no solo del total en CUP: antes se
 *     podía retirar $50 físicos sin tener ninguno.
 *   - Los modales se abren dirigidos a una moneda: depositar('USD').
 */
RN.caja = RN.caja || {};

/** Categoría especial para distinguir retiros de caja de gastos normales. */
RN.caja.CATEGORIA_RETIRO = 'Retiro de caja';

/**
 * v5.30.0 — Texto del monto de un movimiento respetando su moneda real
 * (CUP, USD o MIXTO). Usa el desglose, no el total en CUP.
 */
RN.caja._montoTxt = function (m) {
  var x = RN.calc.desgloseMovimiento(m);
  var eq = '<span class="muted" style="font-size:11px">(' + RN.calc.formatCUP(m.monto) + ')</span>';
  if (x.moneda === 'USD') return '$' + x.usd.toFixed(2) + ' USD ' + eq;
  if (x.moneda === 'MIXTO') return '$' + x.usd.toFixed(2) + ' + ' + RN.calc.formatCUP(x.cup) + ' ' + eq;
  return RN.calc.formatCUP(m.monto);
};

/**
 * v5.30.0 — Tarjeta con los saldos FÍSICOS por moneda que hay AHORA en la caja.
 * Se inserta en los modales de depósito y retiro para que el usuario sepa de
 * qué moneda puede disponer realmente.
 */
RN.caja._saldosHTML = function () {
  var s = RN.calc.saldosMoneda();
  return ''
    + '<div class="flex wrap" style="gap:8px;margin-bottom:14px">'
    +   '<div class="kpi blue" style="flex:1;min-width:130px;margin:0">'
    +     '<div class="label">💵 USD en la gaveta</div>'
    +     '<div class="value">$' + s.usd.toFixed(2) + '</div>'
    +   '</div>'
    +   '<div class="kpi" style="flex:1;min-width:130px;margin:0">'
    +     '<div class="label">🪙 CUP en la gaveta</div>'
    +     '<div class="value">' + RN.calc.formatCUP(s.cup) + '</div>'
    +   '</div>'
    + '</div>';
};

/**
 * v5.17.0 — Abre el modal para registrar un DEPÓSITO a la caja.
 * Un depósito es un aporte de dinero al fondo (inyección de capital,
 * devolución de un préstamo hecho a un tercero, venta externa, etc.).
 * A diferencia de los gastos, los depósitos SUMAN al fondo de caja.
 * v5.20.0: admite CUP, USD o mixto, vía el bloque de moneda reutilizable.
 */
RN.caja.depositar = function (monedaInicial) {
  var fondoActual = RN.calc.fondoCaja();
  var html = `
    <div class="modal-header">
      <h3>💰 Depositar en la caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi green" style="margin-bottom:16px">
        <div class="label">Fondo de caja actual</div>
        <div class="value">${RN.calc.formatCUP(fondoActual)}</div>
        <div class="sub" id="deposito-fondo-preview">El depósito se sumará a este fondo</div>
      </div>
      ${RN.caja._saldosHTML()}
      ${RN.moneda.bloquePagoHTML('deposito', { titulo: 'Monto a depositar' })}
      <div class="form-row">
        <div>
          <label>Concepto / Origen</label>
          <input id="deposito-concepto" placeholder="Ej: Aporte de capital, devolución de préstamo, venta externa...">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Fecha</label>
          <input id="deposito-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal(); RN.caja.resumenMonedas()">💱 Por moneda</button>
      <button class="btn primary" onclick="RN.caja.guardarDeposito()" id="deposito-btn-guardar">
        💰 Depositar
      </button>
    </div>`;
  RN.uiComponents.modal(html);
  RN.moneda.initBloquePago('deposito', monedaInicial);
  RN.moneda.configModoDerivado('deposito', function (montoCUP) {
    var prev = document.getElementById('deposito-fondo-preview');
    if (prev) {
      prev.textContent = montoCUP > 0
        ? 'Fondo después del depósito: ' + RN.calc.formatCUP(+(fondoActual + montoCUP).toFixed(2))
        : 'El depósito se sumará a este fondo';
    }
  });
};

/** Guarda el depósito en el estado y refresca la UI. v5.20.0: CUP/USD/mixto. */
RN.caja.guardarDeposito = function () {
  var datos = RN.moneda.leerBloquePago('deposito', 0);
  if (datos.totalRecibidoCUP <= 0) {
    RN.notifyUI.toast('Ingresa un monto válido mayor que 0', 'error');
    return;
  }
  // v5.30.0: coherencia del desglose (montos no negativos).
  var chkDep = RN.calc.validarMovimientoCaja(datos, 'deposito');
  if (!chkDep.ok) {
    RN.notifyUI.toast(chkDep.motivo, 'error');
    return;
  }
  var concepto = document.getElementById('deposito-concepto').value.trim() || 'Depósito a caja';
  var fecha = document.getElementById('deposito-fecha').value || new Date().toISOString().slice(0, 10);
  var fechaISO = fecha + 'T00:00:00';
  var mes = fecha.slice(0, 7);

  RN.state.depositos = RN.state.depositos || [];
  RN.state.depositos.push({
    id: RN.calc.uid('deposito'),
    concepto: concepto,
    monto: datos.totalRecibidoCUP,   // equivalente en CUP — lo que usan fondoCaja()/totalDepositos()
    moneda: datos.moneda,            // 'CUP' | 'USD' | 'MIXTO'
    montoOriginal: datos.montoUSD,   // USD físico depositado (0 si no aplica)
    montoCUPDirecto: datos.montoCUP, // CUP directo depositado
    tasaUsada: datos.tasaUsd,
    fecha: fechaISO,
    mes: mes
  });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  var msg = 'Depósito registrado: ' + RN.calc.formatCUP(datos.totalRecibidoCUP);
  if (datos.montoUSD > 0) msg += ' (incluye $' + datos.montoUSD.toFixed(2) + ' USD)';
  RN.notifyUI.toast(msg, 'success');
};

/** Muestra el historial de depósitos a la caja en un modal. v5.20.0: muestra moneda original. */
RN.caja.listarDepositos = function () {
  var depositos = (RN.state.depositos || [])
    .slice()
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var total = RN.calc.totalDepositos();
  var pm = RN.calc.totalDepositosPorMoneda();

  var filas = depositos.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay depósitos registrados</p>'
    : depositos.map(function (d) {
        var fecha = new Date(d.fecha).toLocaleDateString('es-CU');
        var montoTxt = RN.caja._montoTxt(d);
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(d.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--success,#16a34a)">+' + montoTxt + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.caja.eliminarDeposito(\'' + RN.render.escAttr(d.id) + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html = `
    <div class="modal-header">
      <h3>💰 Historial de depósitos a la caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi green" style="margin-bottom:16px">
        <div class="label">Total depositado</div>
        <div class="value">${RN.calc.formatCUP(total)}</div>
        <div class="sub">${depositos.length} depósito(s) · CUP físico: ${RN.calc.formatCUP(pm.cup)} · USD físico: $${pm.usdOriginal.toFixed(2)} (${RN.calc.formatCUP(pm.usdCUP)})</div>
      </div>
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th style="text-align:right">Monto</th>
            <th style="text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.caja.depositar()">💰 Nuevo depósito</button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * v5.29.0 — Modal "Caja por moneda": muestra cuánto USD físico y cuánto CUP
 * tienes disponibles EN ESTE MOMENTO en la caja (no un historial acumulado),
 * para decidir en cuál retirar/depositar. También permite CONVERTIR de una
 * moneda a otra dentro de la caja (ej: 20 USD → CUP a la tasa vigente), lo
 * cual sí mueve dinero de verdad, no es solo una calculadora.
 */
RN.caja.resumenMonedas = function () {
  var usd = RN.calc.usdEnCaja();
  var cup = RN.calc.cupEnCaja();
  var tasa = RN.moneda.tasa();

  var html = `
    <div class="modal-header">
      <h3>💱 Caja por moneda</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="flex wrap" style="gap:10px;margin-bottom:8px">
        <div class="kpi blue" style="flex:1;min-width:140px">
          <div class="label">💵 USD físico</div>
          <div class="value">$${usd.toFixed(2)}</div>
        </div>
        <div class="kpi" style="flex:1;min-width:140px">
          <div class="label">🪙 CUP</div>
          <div class="value">${RN.calc.formatCUP(cup)}</div>
        </div>
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:18px">
        ${tasa ? 'Tasa vigente: 1 USD = ' + tasa + ' CUP' : '⚠ No hay tasa USD configurada — configúrala en Ajustes'}
      </div>

      <div class="flex wrap" style="gap:8px;margin-bottom:20px">
        <button class="btn sm" onclick="RN.uiComponents.cerrarModal(); RN.caja.extraer('USD')">💵 Retirar USD</button>
        <button class="btn sm" onclick="RN.uiComponents.cerrarModal(); RN.caja.extraer('CUP')">🪙 Retirar CUP</button>
        <button class="btn sm ghost" onclick="RN.uiComponents.cerrarModal(); RN.caja.depositar('USD')">💵 Depositar USD</button>
        <button class="btn sm ghost" onclick="RN.uiComponents.cerrarModal(); RN.caja.depositar('CUP')">🪙 Depositar CUP</button>
        <button class="btn sm ghost" onclick="RN.uiComponents.cerrarModal(); RN.caja.extraer('MIXTO')">🔀 Retirar mixto</button>
        <button class="btn sm ghost" onclick="RN.uiComponents.cerrarModal(); RN.caja.depositar('MIXTO')">🔀 Depositar mixto</button>
      </div>

      <div class="card" style="margin:0;padding:14px;background:var(--bg)">
        <strong style="font-size:14px">🔁 Convertir moneda en caja</strong>
        <p class="muted" style="font-size:12px;margin:6px 0 12px">Cambia billetes físicos de una moneda a otra dentro de la caja (no entra ni sale dinero del negocio, solo cambia cuánto tienes en cada moneda).</p>
        <div class="moneda-toggle" id="rm-conv-dir" style="margin-bottom:10px">
          <button type="button" class="btn sm primary" data-dir="USD_A_CUP" onclick="RN.caja._setDireccionConversion('USD_A_CUP')">USD → CUP</button>
          <button type="button" class="btn sm" data-dir="CUP_A_USD" onclick="RN.caja._setDireccionConversion('CUP_A_USD')">CUP → USD</button>
        </div>
        <label id="rm-conv-label">Monto en USD a convertir</label>
        <input id="rm-conv-monto" type="number" step="0.01" placeholder="0.00" oninput="RN.caja._previsualizarConversion()">
        <div id="rm-conv-preview" class="muted" style="margin-top:8px;font-size:14px">Ingresa un monto para convertir</div>
        <button class="btn primary sm" style="margin-top:12px" onclick="RN.caja._confirmarConversion()">🔁 Confirmar conversión</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
    </div>`;
  RN.caja._conversionDir = 'USD_A_CUP';
  RN.uiComponents.modal(html);
};

/** Cambia la dirección seleccionada del conversor (USD→CUP o CUP→USD). */
RN.caja._setDireccionConversion = function (dir) {
  RN.caja._conversionDir = dir;
  var toggle = document.getElementById('rm-conv-dir');
  if (toggle) {
    toggle.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('primary', b.dataset.dir === dir);
    });
  }
  var label = document.getElementById('rm-conv-label');
  if (label) label.textContent = dir === 'USD_A_CUP' ? 'Monto en USD a convertir' : 'Monto en CUP a convertir';
  RN.caja._previsualizarConversion();
};

/** Vista previa en vivo del resultado de la conversión (sin guardar nada todavía). */
RN.caja._previsualizarConversion = function () {
  var out = document.getElementById('rm-conv-preview');
  if (!out) return;
  var monto = parseFloat((document.getElementById('rm-conv-monto') || {}).value) || 0;
  var dir = RN.caja._conversionDir || 'USD_A_CUP';
  var tasa = RN.moneda.tasa();
  if (!tasa) { out.innerHTML = '<span style="color:var(--danger)">⚠ Configura la tasa USD en Ajustes.</span>'; return; }
  if (monto <= 0) { out.innerHTML = 'Ingresa un monto para convertir'; return; }
  if (dir === 'USD_A_CUP') {
    var dispUsd = RN.calc.usdEnCaja();
    var resultadoCup = +(monto * tasa).toFixed(2);
    out.innerHTML = '$' + monto.toFixed(2) + ' USD = <strong>' + RN.calc.formatCUP(resultadoCup) + '</strong>' +
      (monto > dispUsd ? ' <span style="color:var(--danger)">— solo hay $' + dispUsd.toFixed(2) + ' USD en caja</span>' : '');
  } else {
    var dispCup = RN.calc.cupEnCaja();
    var resultadoUsd = +(monto / tasa).toFixed(2);
    out.innerHTML = RN.calc.formatCUP(monto) + ' = <strong>$' + resultadoUsd.toFixed(2) + ' USD</strong>' +
      (monto > dispCup ? ' <span style="color:var(--danger)">— solo hay ' + RN.calc.formatCUP(dispCup) + ' en caja</span>' : '');
  }
};

/**
 * Ejecuta la conversión de verdad: se registra como un retiro + un depósito
 * simultáneos por el mismo valor en CUP (mismo mecanismo que ya usan
 * fondoCaja()/usdEnCaja()/cupEnCaja()), así el fondo total NO cambia, pero
 * sí se mueve cuánto hay en USD físico vs CUP. Queda en los historiales de
 * Depósitos y Retiros con el concepto "🔁 Cambio USD→CUP" / "🔁 Cambio CUP→USD".
 */
RN.caja._confirmarConversion = function () {
  var monto = parseFloat((document.getElementById('rm-conv-monto') || {}).value) || 0;
  var dir = RN.caja._conversionDir || 'USD_A_CUP';
  var tasa = RN.moneda.tasa();
  if (!tasa) { RN.notifyUI.toast('Configura la tasa USD en Ajustes primero', 'error'); return; }
  if (monto <= 0) { RN.notifyUI.toast('Ingresa un monto válido', 'error'); return; }

  var fechaISO = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  var mes = fechaISO.slice(0, 7);
  RN.state.retiros = RN.state.retiros || [];
  RN.state.depositos = RN.state.depositos || [];

  if (dir === 'USD_A_CUP') {
    if (monto > RN.calc.usdEnCaja() + 0.01) {
      RN.notifyUI.toast('No hay suficiente USD físico en caja', 'error');
      return;
    }
    var montoCUP = +(monto * tasa).toFixed(2);
    RN.state.retiros.push({ id: RN.calc.uid('retiro'), concepto: '🔁 Cambio USD→CUP', monto: montoCUP, moneda: 'USD', montoOriginal: monto, montoCUPDirecto: 0, tasaUsada: tasa, fecha: fechaISO, mes: mes });
    RN.state.depositos.push({ id: RN.calc.uid('deposito'), concepto: '🔁 Cambio USD→CUP', monto: montoCUP, moneda: 'CUP', montoOriginal: 0, montoCUPDirecto: montoCUP, tasaUsada: tasa, fecha: fechaISO, mes: mes });
    RN.notifyUI.toast('Convertidos $' + monto.toFixed(2) + ' USD a ' + RN.calc.formatCUP(montoCUP), 'success');
  } else {
    if (monto > RN.calc.cupEnCaja() + 0.01) {
      RN.notifyUI.toast('No hay suficiente CUP en caja', 'error');
      return;
    }
    var montoUSD = +(monto / tasa).toFixed(2);
    RN.state.retiros.push({ id: RN.calc.uid('retiro'), concepto: '🔁 Cambio CUP→USD', monto: monto, moneda: 'CUP', montoOriginal: 0, montoCUPDirecto: monto, tasaUsada: tasa, fecha: fechaISO, mes: mes });
    RN.state.depositos.push({ id: RN.calc.uid('deposito'), concepto: '🔁 Cambio CUP→USD', monto: monto, moneda: 'USD', montoOriginal: montoUSD, montoCUPDirecto: 0, tasaUsada: tasa, fecha: fechaISO, mes: mes });
    RN.notifyUI.toast('Convertidos ' + RN.calc.formatCUP(monto) + ' a $' + montoUSD.toFixed(2) + ' USD', 'success');
  }

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
};

/** Elimina un depósito del historial. */
RN.caja.eliminarDeposito = function (id) {
  RN.uiComponents.confirm('Eliminar depósito', '¿Eliminar este depósito? El dinero se restará del fondo de caja.', function () {
    RN.state.depositos = (RN.state.depositos || []).filter(function (d) { return d.id !== id; });
    RN.storageLocal.guardar();
    RN.caja.listarDepositos();
    RN.render.todo();
    RN.notifyUI.toast('Depósito eliminado. Fondo de caja actualizado.', 'success');
  }, { danger: true });
};

/**
 * Abre el modal para registrar una extraccion/retiro del fondo de caja.
 * Muestra el fondo disponible y permite ingresar el monto a retirar.
 * v5.20.0: admite CUP, USD o mixto, y muestra cuánto USD físico hay en caja.
 */
RN.caja.extraer = function (monedaInicial) {
  var fondoDisponible = RN.calc.fondoCaja();
  var fondoFormateado = RN.calc.formatCUP(fondoDisponible);
  // v5.19.0: modelo "dos bolsillos". Solo se puede retirar del bolsillo LIBRE.
  var b = RN.calc.bolsillos();
  var puedeRetirar = b.retirable > 0;
  var colorRes = b.cubierta ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)';
  var usdC = RN.calc.usdEnCaja();
  var bolsillosHTML = `
      <div class="card" style="margin:0 0 16px;padding:14px;background:var(--bg)">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:14px">🔒 Dos bolsillos (${b.pct}% reserva / ${100 - b.pct}% libre)</strong>
        </div>
        <div class="caja-linea"><span class="muted">🔒 Reserva (intocable)</span><strong style="color:${colorRes}">${RN.calc.formatCUP(b.reserva)}</strong></div>
        <div class="caja-linea"><span class="muted">💸 Libre para ti</span><strong style="color:${b.libre >= 0 ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)'}">${RN.calc.formatCUP(b.libre)}</strong></div>
        <div class="caja-linea total"><span>Puedes retirar (del bolsillo libre)</span><strong style="color:${b.retirable > 0 ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)'}">${RN.calc.formatCUP(b.retirable)}</strong></div>
        <div class="caja-linea"><span class="muted">💵 USD físico en caja</span><strong>$${usdC.toFixed(2)} USD</strong></div>
        ${b.cubierta ? '' : '<div class="muted" style="font-size:12px;margin-top:6px;color:var(--danger,#dc2626)">⚠️ El fondo está por debajo de la reserva. Te faltan ' + RN.calc.formatCUP(b.reserva - b.fondo) + ' para cubrirla.</div>'}
      </div>`;

  var html = `
    <div class="modal-header">
      <h3>💵 Extraer del fondo de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi ${puedeRetirar ? 'green' : 'red'}" style="margin-bottom:16px">
        <div class="label">Fondo de caja total</div>
        <div class="value">${fondoFormateado}</div>
        <div class="sub">${puedeRetirar ? 'Puedes retirar hasta ' + RN.calc.formatCUP(b.retirable) + ' (bolsillo libre)' : 'No hay bolsillo libre disponible'}</div>
        <div class="sub" style="font-size:11px;margin-top:4px;color:#666">
          Saldo inicial: ${RN.calc.formatCUP(RN.state.config.fondoInicial || 0)} ·
          Ingresos: ${RN.calc.formatCUP(RN.calc.ingresosTotales())} ·
          Depósitos: ${RN.calc.formatCUP(RN.calc.totalDepositos())} ·
          Gastos: ${RN.calc.formatCUP(RN.calc.gastosTotales())} ·
          Retiros: ${RN.calc.formatCUP(RN.calc.totalRetiros())}
        </div>
      </div>
      ${bolsillosHTML}
      ${RN.caja._saldosHTML()}
      ${RN.moneda.bloquePagoHTML('retiro', { titulo: 'Monto a retirar' })}
      <div id="retiro-aviso" style="margin-top:8px"></div>
      <div class="form-row">
        <div>
          <label>Concepto / Motivo</label>
          <input id="retiro-concepto" placeholder="Ej: Retiro personal, compra de equipos, pago de servicios...">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Fecha</label>
          <input id="retiro-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal(); RN.caja.resumenMonedas()">💱 Por moneda</button>
      <button class="btn primary" onclick="RN.caja.guardar()" id="retiro-btn-guardar"
              ${puedeRetirar ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
        💵 Retirar
      </button>
    </div>`;
  RN.uiComponents.modal(html);
  RN.moneda.initBloquePago('retiro', monedaInicial);
  RN.moneda.configModoDerivado('retiro', function (montoCUP) {
    RN.caja._validarRetiroDerivado(montoCUP, b.retirable);
  });
};

/**
 * v5.20.0 — Validación en tiempo real del monto de retiro (modo derivado del
 * bloque de moneda). El límite es el bolsillo LIBRE (retirable). Si el monto
 * lo supera, se advierte que se estaría tocando la reserva (solo advierte,
 * no bloquea).
 */
RN.caja._validarRetiroDerivado = function (montoCUP, retirable) {
  var aviso = document.getElementById('retiro-aviso');
  var btn = document.getElementById('retiro-btn-guardar');
  if (!aviso) return;

  var b = RN.calc.bolsillos();
  var avisoReserva = '';
  if (montoCUP > 0 && montoCUP > retirable) {
    avisoReserva = '<div style="margin-top:6px"><span class="badge due">🔒 Este retiro toca la reserva (' +
      RN.calc.formatCUP(b.reserva) + '). Estás sacando ' + RN.calc.formatCUP(montoCUP - retirable) +
      ' del bolsillo reservado.</span></div>';
  }

  // v5.30.0: además del bolsillo libre, se valida el dinero FÍSICO por moneda.
  var datos = RN.moneda.leerBloquePago('retiro', 0);
  var chk = RN.calc.validarMovimientoCaja(datos, 'retiro');
  var fisicoTxt = '';
  if (datos.montoUSD > 0) fisicoTxt += 'Sacarás $' + datos.montoUSD.toFixed(2) + ' USD de la gaveta de dólares. ';
  if (datos.montoCUP > 0) fisicoTxt += 'Sacarás ' + RN.calc.formatCUP(datos.montoCUP) + ' de la gaveta de pesos. ';
  fisicoTxt = fisicoTxt ? '<div class="muted" style="font-size:12px;margin-top:4px">' + fisicoTxt + '</div>' : '';

  if (montoCUP <= 0) {
    aviso.innerHTML = '<span class="badge warn">Ingresa un monto válido mayor que 0</span>';
    if (btn) btn.disabled = true;
  } else if (!chk.ok) {
    aviso.innerHTML = '<span class="badge due">🚫 ' + chk.motivo + '</span>' + avisoReserva;
    if (btn) btn.disabled = true; // v5.30.0: bloquea — no hay billetes de esa moneda
  } else if (montoCUP > retirable) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el bolsillo libre (' +
      RN.calc.formatCUP(retirable) + ').</span>' + avisoReserva + fisicoTxt;
    if (btn) btn.disabled = false; // permitimos pero advertimos
  } else {
    var restante = +(retirable - montoCUP).toFixed(2);
    aviso.innerHTML = '<span class="badge ok">✓ Bolsillo libre restante después del retiro: ' +
      RN.calc.formatCUP(restante) + '</span>' + avisoReserva + fisicoTxt;
    if (btn) btn.disabled = false;
  }
};

/**
 * Guarda el retiro en state.retiros (v5.19.0).
 * Antes se guardaba como gasto con esRetiroCaja=true, lo que ensuciaba la
 * utilidad. Ahora los retiros viven aparte y se restan SOLO del bolsillo libre.
 * v5.20.0: admite CUP, USD o mixto.
 */
RN.caja.guardar = function () {
  var datos = RN.moneda.leerBloquePago('retiro', 0);
  if (datos.totalRecibidoCUP <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
    return;
  }

  // v5.30.0: bloqueo real por moneda — no se retiran billetes que no existen.
  var chkRet = RN.calc.validarMovimientoCaja(datos, 'retiro');
  if (!chkRet.ok) {
    RN.notifyUI.toast(chkRet.motivo, 'error');
    return;
  }

  var concepto = document.getElementById('retiro-concepto').value.trim() || 'Retiro de caja';
  var fecha = document.getElementById('retiro-fecha').value || new Date().toISOString().slice(0, 10);
  // v5.13.5 (ISSUE #9): Construir fecha ISO sin conversión de timezone.
  // new Date('YYYY-MM-DD').toISOString() interpreta la fecha como medianoche
  // UTC, desplazándola un día atrás para usuarios en UTC-5 (Cuba).
  var fechaISO = fecha + 'T00:00:00';
  var mes = fecha.slice(0, 7);

  RN.state.retiros = RN.state.retiros || [];
  RN.state.retiros.push({
    id: RN.calc.uid('retiro'),
    concepto: concepto,
    monto: datos.totalRecibidoCUP,   // equivalente en CUP
    moneda: datos.moneda,
    montoOriginal: datos.montoUSD,   // USD físico retirado
    montoCUPDirecto: datos.montoCUP,
    tasaUsada: datos.tasaUsd,
    fecha: fechaISO,
    mes: mes
  });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  // v5.13.8 (LOG-6/CODE-7): Usar render.todo() para refrescar todas las vistas
  // que dependen del fondo de caja (dashboard, gastos, inversion, etc.)
  RN.render.todo();
  var msg = 'Retiro de caja registrado: ' + RN.calc.formatCUP(datos.totalRecibidoCUP);
  if (datos.montoUSD > 0) msg += ' (incluye $' + datos.montoUSD.toFixed(2) + ' USD)';
  RN.notifyUI.toast(msg, 'success');
};

/**
 * Muestra el historial de retiros de caja en un modal. v5.20.0: muestra moneda original.
 */
RN.caja.listar = function () {
  var retiros = (RN.state.retiros || [])
    .slice()
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var total = RN.caja.totalRetiros();
  var pm = RN.calc.totalRetirosPorMoneda();

  var filas = retiros.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay retiros registrados</p>'
    : retiros.map(function (r) {
        var fecha = new Date(r.fecha).toLocaleDateString('es-CU');
        var montoTxt = RN.caja._montoTxt(r);
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(r.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--red,#dc2626)">-' + montoTxt + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.caja.eliminar(\'' + RN.render.escAttr(r.id) + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html = `
    <div class="modal-header">
      <h3>💵 Historial de retiros de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi red" style="margin-bottom:16px">
        <div class="label">Total retirado</div>
        <div class="value">${RN.calc.formatCUP(total)}</div>
        <div class="sub">${retiros.length} retiro(s) · CUP físico: ${RN.calc.formatCUP(pm.cup)} · USD físico: $${pm.usdOriginal.toFixed(2)} (${RN.calc.formatCUP(pm.usdCUP)})</div>
      </div>
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th style="text-align:right">Monto</th>
            <th style="text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.caja.extraer()">💵 Nuevo retiro</button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * Elimina un retiro de caja del historial.
 */
RN.caja.eliminar = function (id) {
  RN.uiComponents.confirm('Eliminar retiro', '¿Eliminar este retiro de caja? El dinero volverá al bolsillo libre.', function () {
    RN.state.retiros = (RN.state.retiros || []).filter(function (r) { return r.id !== id; });
    RN.storageLocal.guardar();
    RN.caja.listar();
    // v5.13.8 (LOG-6/CODE-7): Usar render.todo() para refrescar todas las vistas
    RN.render.todo();
    RN.notifyUI.toast('Retiro eliminado. Fondo de caja actualizado.', 'success');
  }, { danger: true });
};

/**
 * Suma total de todos los retiros de caja históricos (v5.19.0: desde state.retiros).
 */
RN.caja.totalRetiros = function () {
  return RN.calc.totalRetiros();
};
