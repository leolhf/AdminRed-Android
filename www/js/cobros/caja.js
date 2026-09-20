/**
 * cobros/caja.js — Gestión de retiros/extracciones del fondo de caja.
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
 */
RN.caja = RN.caja || {};

/** Categoría especial para distinguir retiros de caja de gastos normales. */
RN.caja.CATEGORIA_RETIRO = 'Retiro de caja';

/**
 * v5.17.0 — Abre el modal para registrar un DEPÓSITO a la caja.
 * Un depósito es un aporte de dinero al fondo (inyección de capital,
 * devolución de un préstamo hecho a un tercero, venta externa, etc.).
 * A diferencia de los gastos, los depósitos SUMAN al fondo de caja.
 */
RN.caja.depositar = function () {
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
        <div class="sub">El depósito se sumará a este fondo</div>
      </div>
      <div class="form-row">
        <div>
          <label>Monto a depositar (CUP) *</label>
          <input id="deposito-monto" type="number" step="0.01" min="0.01" placeholder="0.00"
                 oninput="RN.caja._validarDeposito(this)">
        </div>
      </div>
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
      <div id="deposito-aviso" style="margin-top:8px"></div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.caja.guardarDeposito()" id="deposito-btn-guardar">
        💰 Depositar
      </button>
    </div>`;
  RN.uiComponents.modal(html);
};

/** Validación en tiempo real del monto del depósito. */
RN.caja._validarDeposito = function (input) {
  var monto = parseFloat(input.value) || 0;
  var aviso = document.getElementById('deposito-aviso');
  var btn = document.getElementById('deposito-btn-guardar');
  if (!aviso) return;
  if (monto <= 0) {
    aviso.innerHTML = '<span class="badge warn">Ingresa un monto válido mayor que 0</span>';
    if (btn) btn.disabled = true;
  } else {
    var nuevoFondo = +(RN.calc.fondoCaja() + monto).toFixed(2);
    aviso.innerHTML = '<span class="badge ok">✓ Fondo después del depósito: ' +
      RN.calc.formatCUP(nuevoFondo) + '</span>';
    if (btn) btn.disabled = false;
  }
};

/** Guarda el depósito en el estado y refresca la UI. */
RN.caja.guardarDeposito = function () {
  var monto = parseFloat(document.getElementById('deposito-monto').value) || 0;
  if (monto <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
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
    monto: monto,
    fecha: fechaISO,
    mes: mes
  });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast('Depósito registrado: ' + RN.calc.formatCUP(monto), 'success');
};

/** Muestra el historial de depósitos a la caja en un modal. */
RN.caja.listarDepositos = function () {
  var depositos = (RN.state.depositos || [])
    .slice()
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var total = RN.calc.totalDepositos();

  var filas = depositos.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay depósitos registrados</p>'
    : depositos.map(function (d) {
        var fecha = new Date(d.fecha).toLocaleDateString('es-CU');
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(d.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--success,#16a34a)">+' + RN.calc.formatCUP(d.monto) + '</td>' +
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
        <div class="sub">${depositos.length} depósito(s) en total</div>
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
 */
RN.caja.extraer = function () {
  var fondoDisponible = RN.calc.fondoCaja();
  var fondoFormateado = RN.calc.formatCUP(fondoDisponible);
  // v5.19.0: modelo "dos bolsillos". Solo se puede retirar del bolsillo LIBRE.
  var b = RN.calc.bolsillos();
  var puedeRetirar = b.retirable > 0;
  var colorRes = b.cubierta ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)';
  var bolsillosHTML = `
      <div class="card" style="margin:0 0 16px;padding:14px;background:var(--bg)">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:14px">🔒 Dos bolsillos (${b.pct}% reserva / ${100 - b.pct}% libre)</strong>
        </div>
        <div class="caja-linea"><span class="muted">🔒 Reserva (intocable)</span><strong style="color:${colorRes}">${RN.calc.formatCUP(b.reserva)}</strong></div>
        <div class="caja-linea"><span class="muted">💸 Libre para ti</span><strong style="color:${b.libre >= 0 ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)'}">${RN.calc.formatCUP(b.libre)}</strong></div>
        <div class="caja-linea total"><span>Puedes retirar (del bolsillo libre)</span><strong style="color:${b.retirable > 0 ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)'}">${RN.calc.formatCUP(b.retirable)}</strong></div>
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
      <div class="form-row">
        <div>
          <label>Monto a retirar (CUP) *</label>
          <input id="retiro-monto" type="number" step="0.01" min="0.01" placeholder="0.00"
                 oninput="RN.caja._validarMonto(this, ${b.retirable})">
        </div>
      </div>
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
      <div id="retiro-aviso" style="margin-top:8px"></div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.caja.guardar()" id="retiro-btn-guardar"
              ${puedeRetirar ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
        💵 Retirar
      </button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * Validación en tiempo real del monto introducido.
 * v5.19.0: el límite es el bolsillo LIBRE (retirable). Si el monto lo supera,
 * se advierte que se estaría tocando la reserva (solo advierte, no bloquea).
 */
RN.caja._validarMonto = function (input, retirable) {
  var monto = parseFloat(input.value) || 0;
  var aviso = document.getElementById('retiro-aviso');
  var btn = document.getElementById('retiro-btn-guardar');
  if (!aviso) return;

  var b = RN.calc.bolsillos();
  var avisoReserva = '';
  if (monto > 0 && monto > retirable) {
    avisoReserva = '<div style="margin-top:6px"><span class="badge due">🔒 Este retiro toca la reserva (' +
      RN.calc.formatCUP(b.reserva) + '). Estás sacando ' + RN.calc.formatCUP(monto - retirable) +
      ' del bolsillo reservado.</span></div>';
  }

  if (monto <= 0) {
    aviso.innerHTML = '<span class="badge warn">Ingresa un monto válido mayor que 0</span>';
    if (btn) btn.disabled = true;
  } else if (monto > retirable) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el bolsillo libre (' +
      RN.calc.formatCUP(retirable) + ').</span>' + avisoReserva;
    if (btn) btn.disabled = false; // permitimos pero advertimos
  } else {
    var restante = +(retirable - monto).toFixed(2);
    aviso.innerHTML = '<span class="badge ok">✓ Bolsillo libre restante después del retiro: ' +
      RN.calc.formatCUP(restante) + '</span>' + avisoReserva;
    if (btn) btn.disabled = false;
  }
};

/**
 * Guarda el retiro en state.retiros (v5.19.0).
 * Antes se guardaba como gasto con esRetiroCaja=true, lo que ensuciaba la
 * utilidad. Ahora los retiros viven aparte y se restan SOLO del bolsillo libre.
 */
RN.caja.guardar = function () {
  var monto = parseFloat(document.getElementById('retiro-monto').value) || 0;
  if (monto <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
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
    monto: monto,
    fecha: fechaISO,
    mes: mes
  });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  // v5.13.8 (LOG-6/CODE-7): Usar render.todo() para refrescar todas las vistas
  // que dependen del fondo de caja (dashboard, gastos, inversion, etc.)
  RN.render.todo();
  RN.notifyUI.toast('Retiro de caja registrado: ' + RN.calc.formatCUP(monto), 'success');
};

/**
 * Muestra el historial de retiros de caja en un modal.
 */
RN.caja.listar = function () {
  var retiros = (RN.state.retiros || [])
    .slice()
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var total = RN.caja.totalRetiros();

  var filas = retiros.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay retiros registrados</p>'
    : retiros.map(function (r) {
        var fecha = new Date(r.fecha).toLocaleDateString('es-CU');
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(r.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--red,#dc2626)">-' + RN.calc.formatCUP(r.monto) + '</td>' +
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
        <div class="sub">${retiros.length} retiro(s) en total</div>
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
