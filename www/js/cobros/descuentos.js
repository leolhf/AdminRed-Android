/**
 * cobros/descuentos.js — Núcleo de descuentos puntuales (v5.14.4).
 * Tipos: afectacion, bonificacion, ajuste.
 * Modos: fijo (CUP), porcentaje (% del precio mensual), dias (proporcional a días sin servicio).
 * Aplicacion: 'mes' (vigente solo este mes) o 'soloPago' (se consume en el próximo cobro).
 * v5.14.4 — Bonificaciones con Duración: vigencia 'permanente' | 'meses' (N meses) | 'unPago',
 * con desde/durMeses/aplicaciones[] (valores congelados por cobro, regla R2).
 * Vigencia centralizada en RN.descuentos.vigenteEnMes (calculations.js) con fallbacks esquema 7.
 * Operaciones: crear, eliminar (revierte todos los cobros con valores congelados),
 * revertir (al eliminar cobro libera solo ese mes), lote.
 */
RN.descuentos = RN.descuentos || {};

RN.descuentos.TIPOS = {
  afectacion: 'Afectación (interrupción/degradación del servicio)',
  bonificacion: 'Bonificación (promoción/fidelización)',
  ajuste: 'Ajuste (administrativo)'
};

RN.descuentos.MODOS = {
  fijo: 'Monto fijo (CUP)',
  porcentaje: 'Porcentaje del precio mensual',
  dias: 'Proporcional a días sin servicio'
};

/* v5.14.4 — D5: el modo 'dias' solo es coherente con vigencia puntual
 * (una afectación proporcional a días sin servicio no puede ser permanente). */
RN.descuentos._modoPermiteDuracion = function (modo) {
  return modo !== 'dias';
};

/** v5.14.4 — Badge de vigencia para paneles/vistas: "Permanente", "3 meses (jun–ago)", "1 solo pago". */
RN.descuentos._badgeVigencia = function (d) {
  var vig = RN.descuentos.vigenciaDe(d);
  var cls = vig === 'permanente' ? 'ok' : (vig === 'unPago' ? 'warn' : 'por');
  if (vig === 'permanente') return ' <span class="badge ' + cls + '" style="font-size:10px">Permanente</span>';
  if (vig === 'unPago') return ' <span class="badge ' + cls + '" style="font-size:10px">1 solo pago</span>';
  var n = Math.max(1, parseInt(d.durMeses, 10) || 1);
  if (n === 1) return ''; // puntual de 1 mes: sin badge (comportamiento previo)
  var rango = RN.descuentos.rangoVigencia(d);
  return ' <span class="badge ' + cls + '" style="font-size:10px">' + n + ' meses (' + rango + ')</span>';
};

/**
 * v5.14.4 — HTML del bloque de Duración (permanente / N meses / 1 solo pago)
 * + select binario legado para afectación/ajuste (D1: solo bonificación
 * recibe Duración; afectación y ajuste son inherentemente puntuales).
 * Se muestra/oculta dinámicamente según el tipo seleccionado.
 */
RN.descuentos._htmlDuracion = function (mes) {
  return `
      <div class="form-row cols-2" id="dc-row-duracion">
        <div><label>Duración *</label><select id="dc-duracion">
          <option value="meses1">Solo este mes</option>
          <option value="mesesN">Varios meses (N)</option>
          <option value="permanente">Permanente (hasta anulación)</option>
          <option value="unPago">1 solo pago (se consume en el próximo cobro)</option>
        </select></div>
        <div id="dc-wrap-durmeses" style="display:none"><label>N.º de meses *</label><input id="dc-durmeses" type="number" min="2" step="1" value="3"></div>
      </div>
      <div class="form-row cols-2" id="dc-row-aplicacion" style="display:none">
        <div><label>Aplicación *</label><select id="dc-aplicacion">
          <option value="mes">Este mes (se anula si no se usa al cerrar el mes)</option>
          <option value="soloPago">Solo próximo pago (se consume en el próximo cobro, sin importar el mes)</option>
        </select></div>
        <div><span class="muted" style="display:block;margin-top:28px;font-size:12px" id="dc-aplicacion-info"></span></div>
      </div>
      <p class="muted" id="dc-duracion-info"></p>`;
};

/** v5.14.4 — Estado UI del bloque de duración según tipo/modo. */
RN.descuentos._actualizarDuracionUI = function () {
  const tipoSel = document.getElementById('dc-tipo');
  const modoSel = document.getElementById('dc-modo');
  if (!tipoSel) return;
  const esBonificacion = tipoSel.value === 'bonificacion';
  const modo = modoSel ? modoSel.value : 'fijo';
  const modoPermite = RN.descuentos._modoPermiteDuracion(modo);
  const rowDur = document.getElementById('dc-row-duracion');
  const rowApl = document.getElementById('dc-row-aplicacion');
  const info = document.getElementById('dc-duracion-info');
  // D1: Duración solo para bonificación. D5: modo 'dias' fuerza puntual.
  const usarDuracion = esBonificacion && modoPermite;
  if (rowDur) rowDur.style.display = usarDuracion ? '' : 'none';
  if (rowApl) rowApl.style.display = usarDuracion ? 'none' : '';
  if (!usarDuracion && info) {
    info.textContent = modoPermite
      ? 'Las afectaciones y ajustes son puntuales (un solo mes).'
      : '⚠ El modo "días" solo admite descuentos puntuales de un mes.';
  }
  const durSel = document.getElementById('dc-duracion');
  const wrapN = document.getElementById('dc-wrap-durmeses');
  if (durSel && wrapN) {
    wrapN.style.display = durSel.value === 'mesesN' ? '' : 'none';
  }
  if (usarDuracion && info) {
    const v = durSel ? durSel.value : 'meses1';
    if (v === 'permanente') info.textContent = 'Vigente todos los meses desde el mes de inicio hasta que la anules. No se anula al cerrar mes. Se registra una aplicación por cada cobro mensual.';
    else if (v === 'unPago') info.textContent = '⚠ Se aplicará al próximo cobro del cliente y se consumirá. No se anula al cerrar el mes.';
    else if (v === 'mesesN') info.textContent = 'Vigente N meses consecutivos por calendario desde el mes de inicio (aunque el cliente no pague alguno).';
    else info.textContent = 'Válido solo para este mes. Se anula si el cliente no paga antes del cierre.';
  }
};

/* v5.15 — GESTIÓN CENTRALIZADA (mudanza A+C):
 * El centro de creación/gestión pasa a la vista Finanzas → Descuentos y al
 * acceso rápido 🎁 de la lista de cobros. El modal de cobro pasa a solo
 * lectura (ver panel bonificaciones del mes, pero decidir fuera). */

/**
 * v5.15 — Abre un selector de cliente y luego el formulario de descuento.
 * Punto de entrada desde la vista de gestión (Finanzas → Descuentos),
 * donde no hay un cliente pre-seleccionado por contexto.
 */
RN.descuentos.abrirNuevoSelector = function () {
  var activos = RN.calc.clientesActivos();
  if (!activos.length) { RN.notifyUI.toast('No hay clientes activos', 'warn'); return; }
  var opts = activos.map(function (c) {
    return '<option value="' + c.id + '">' + RN.render.esc(c.nombre) + '</option>';
  }).join('');
  var html =
    '<div class="modal-header"><h3>Nueva bonificación / descuento</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body"><label>Selecciona cliente</label>' +
    '<select id="desc-select-cliente">' + opts + '</select></div>' +
    '<div class="modal-footer"><button class="btn ghost" id="desc-select-cancel">Cancelar</button>' +
    '<button class="btn primary" id="desc-select-ok">Continuar</button></div>';
  RN.uiComponents.modal(html);
  document.getElementById('desc-select-ok').onclick = function () {
    var v = document.getElementById('desc-select-cliente').value;
    RN.uiComponents.cerrarModal();
    if (v) RN.descuentos.abrirNuevo(v, RN.calc.mesActualStr());
  };
  document.getElementById('desc-select-cancel').onclick = function () {
    RN.uiComponents.cerrarModal();
  };
};

/**
 * v5.15 — Nombre público (alias) para uso desde onclicks de la UI.
 * Abre el formulario de descuento para un cliente SIN pasar por el cobro.
 */
RN.descuentos.abrirParaCliente = function (clienteId) {
  RN.descuentos.abrirNuevo(clienteId, RN.calc.mesActualStr());
};

/**
 * v5.15 — Mini-resumen de impacto para la vista de gestión (Finanzas → Descuentos).
 * KPIs: activas (permanentes + N meses vivas) · pendientes de este mes ·
 * impacto CUP total de lo vigente este mes.
 */
RN.descuentos.resumenGestion = function () {
  var mes = RN.calc.mesActualStr();
  var cont = document.getElementById('descuentos-resumen');
  if (!cont) return;
  var activas = 0, pendientesMes = 0, impactoCUP = 0;
  RN.state.descuentos.forEach(function (d) {
    if (d.estado === 'anulado') return;
    if (!RN.descuentos.vigenteEnMes(d, mes)) return;
    if (RN.descuentos.vigenciaDe(d) === 'permanente' ||
        (RN.descuentos.vigenciaDe(d) === 'meses' && (parseInt(d.durMeses, 10) || 1) > 1)) {
      activas++;
    } else {
      pendientesMes++;
    }
    impactoCUP += (RN.calc.valorDescuento(d, d.clienteId) || 0);
  });
  var kpis = [
    { label: 'Bonificaciones activas', value: String(activas), cls: 'green' },
    { label: 'Pendientes de este mes', value: String(pendientesMes), cls: 'amber' },
    { label: 'Impacto total este mes', value: RN.calc.formatCUP(impactoCUP), cls: 'blue' }
  ];
  cont.innerHTML = kpis.map(function (k) {
    return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
  }).join('');
};

/** Abre el modal para crear un descuento puntual. */
RN.descuentos.abrirNuevo = function (clienteId, mes) {
  const c = RN.state.clients.find(x => x.id === clienteId);
  if (!c) return;
  const html = `
    <div class="modal-header"><h3>Descuento — ${RN.render.esc(c.nombre)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row cols-2">
        <div><label>Tipo *</label><select id="dc-tipo">${Object.entries(RN.descuentos.TIPOS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label>Modo de cálculo *</label><select id="dc-modo">${Object.entries(RN.descuentos.MODOS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div>
      <div class="form-row cols-2">
        <div><label id="dc-valor-label">Valor (CUP) *</label><input id="dc-valor" type="number" step="0.01" value="0"></div>
        <div><label>Motivo *</label><input id="dc-motivo" placeholder="Ej: 2 días sin servicio"></div>
      </div>
      ${RN.descuentos._htmlDuracion(mes)}
      <p class="muted" id="dc-preview"></p>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.descuentos.guardar('${RN.render.escAttr(clienteId)}', '${RN.render.escAttr(mes)}')">Agregar</button></div>`;
  RN.uiComponents.modal(html);

  const modoSel = document.getElementById('dc-modo');
  const tipoSel = document.getElementById('dc-tipo');
  const actualizarLabel = () => {
    const lbl = document.getElementById('dc-valor-label');
    const m = modoSel.value;
    lbl.textContent = m === 'fijo' ? 'Valor (CUP) *' : (m === 'porcentaje' ? 'Valor (%) *' : 'Días sin servicio *');
    RN.descuentos._actualizarDuracionUI();
    RN.descuentos._preview(clienteId);
  };
  modoSel.addEventListener('change', actualizarLabel);
  document.getElementById('dc-valor').addEventListener('input', () => RN.descuentos._preview(clienteId));
  // v5.14.4: tipo y duración gobiernan la vigencia
  tipoSel.addEventListener('change', () => RN.descuentos._actualizarDuracionUI());
  const durSel = document.getElementById('dc-duracion');
  if (durSel) durSel.addEventListener('change', () => RN.descuentos._actualizarDuracionUI());
  // v5.14.4: select legado de aplicación (afectación/ajuste) mantiene su info
  const aplSel = document.getElementById('dc-aplicacion');
  const actualizarAplInfo = () => {
    const info = document.getElementById('dc-aplicacion-info');
    if (!info) return;
    if (aplSel.value === 'soloPago') {
      info.textContent = '⚠ Se aplicará al próximo cobro del cliente y se consumirá. No se anula al cerrar el mes.';
    } else {
      info.textContent = 'Válido solo para este mes. Se anula si el cliente no paga antes del cierre.';
    }
    RN.descuentos._actualizarDuracionUI();
  };
  aplSel.addEventListener('change', actualizarAplInfo);
  actualizarLabel();
};

RN.descuentos._preview = function (clienteId) {
  const modo = document.getElementById('dc-modo').value;
  const valor = parseFloat(document.getElementById('dc-valor').value) || 0;
  const el = document.getElementById('dc-preview');
  if (!el) return;
  const d = { modo, valor };
  el.textContent = 'Descuento aplicado: ' + RN.calc.formatCUP(RN.calc.valorDescuento(d, clienteId));
};

RN.descuentos.guardar = function (clienteId, mes) {
  const tipo = document.getElementById('dc-tipo').value;
  const modo = document.getElementById('dc-modo').value;
  const valor = parseFloat(document.getElementById('dc-valor').value) || 0;
  const motivo = document.getElementById('dc-motivo').value.trim();
  if (!motivo) { RN.notifyUI.toast('El motivo es obligatorio', 'error'); return; }
  if (valor <= 0) { RN.notifyUI.toast('El valor debe ser mayor que 0', 'error'); return; }

  // v5.14.4 — Resolver vigencia según tipo/modo (D1, D4, D5):
  //   bonificacion → selector de Duración (meses1 / mesesN / permanente / unPago)
  //   afectacion/ajuste (o modo 'dias') → select legado binario (mes / soloPago)
  const esBonificacion = tipo === 'bonificacion' && RN.descuentos._modoPermiteDuracion(modo);
  let vigencia, durMeses = 1, soloPago = false;
  if (esBonificacion) {
    const dur = document.getElementById('dc-duracion') ? document.getElementById('dc-duracion').value : 'meses1';
    if (dur === 'permanente') { vigencia = 'permanente'; }
    else if (dur === 'unPago') { vigencia = 'unPago'; soloPago = true; }
    else if (dur === 'mesesN') {
      vigencia = 'meses';
      durMeses = parseInt(document.getElementById('dc-durmeses').value, 10) || 0;
      if (durMeses < 2) { RN.notifyUI.toast('Para "Varios meses" indica al menos 2 meses (usa "Solo este mes" para 1)', 'error'); return; }
    }
    else { vigencia = 'meses'; durMeses = 1; }
  } else {
    const aplicacion = document.getElementById('dc-aplicacion') ? document.getElementById('dc-aplicacion').value : 'mes';
    if (aplicacion === 'soloPago') { vigencia = 'unPago'; soloPago = true; }
    else { vigencia = 'meses'; durMeses = 1; }
  }

  var nuevo = {
    id: RN.calc.uid('desc'),
    clienteId,
    tipo,
    motivo,
    modo,
    valor,
    mes,
    soloPago,
    // v5.14.4 — modelo unificado de vigencia
    vigencia,
    desde: mes,
    durMeses,
    aplicaciones: [],
    fecha: new Date().toISOString(),
    estado: 'pendiente',
    cobroHid: null
  };
  RN.state.descuentos.push(nuevo);
  // v5.15 — Trazabilidad (control): registrar el evento en la auditoría
  if (RN.auditoria && typeof RN.auditoria.logEvento === 'function') {
    RN.auditoria.logEvento('descuento_crear', { id: nuevo.id, clienteId: clienteId, tipo: tipo, modo: modo, valor: valor, vigencia: vigencia, durMeses: durMeses, motivo: motivo });
  }
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  const msgVigencia = vigencia === 'permanente' ? 'permanente (hasta anulación)'
    : (vigencia === 'unPago' ? 'de un solo pago (se consumirá en el próximo cobro)'
    : (durMeses > 1 ? 'por ' + durMeses + ' meses (' + RN.descuentos.rangoVigencia(nuevo) + ')' : 'puntual'));
  RN.notifyUI.toast('Descuento agregado: ' + msgVigencia, 'success');
  // v5.15 (mudanza A+C): la creación vive fuera del modal de cobro (gestión
  // centralizada y acceso rápido 🎁). Solo si el formulario se abrió desde el
  // propio cobro (flujo legado marcado con _reabrirTrasDescuento) se reconstruye
  // el cobro; en cualquier otro caso se refrescan las vistas (incluido el
  // mini-resumen de Finanzas → Descuentos).
  if (RN.modalCobro && RN.modalCobro._reabrirTrasDescuento === true) {
    RN.modalCobro._reabrirTrasDescuento = false;
    RN.modalCobro.abrir(clienteId);
  } else {
    RN.render.todo();
  }
};

/**
 * v5.14.4 — Colección de aplicaciones de un descuento, unificando el modelo
 * nuevo (d.aplicaciones[]) con el legado (un único d.cobroHid). Devuelve
 * [{mes, cobroHid, valor}] donde valor puede ser null (legado sin congelar).
 */
RN.descuentos._aplicacionesDe = function (d) {
  var apps = [];
  if (Array.isArray(d.aplicaciones) && d.aplicaciones.length) {
    apps = d.aplicaciones.slice();
  }
  // Legado: cobroHid único sin aplicaciones registradas
  if (d.cobroHid && d.estado === 'aplicado' && !apps.some(a => a.cobroHid === d.cobroHid)) {
    apps.push({ mes: d.mes, cobroHid: d.cobroHid, valor: null });
  }
  return apps;
};

/**
 * v5.14.4 — Revierte una aplicación concreta en un cobro (R2: usa el valor
 * COBRADO congelado en aplicaciones[].valor; si es null — dato legado —
 * recalcula como antes). Reconstruye tipoPago/falta/excedente del cobro.
 * Devuelve el valor revertido en CUP (0 si no se pudo revertir).
 */
RN.descuentos._revertirEnCobro = function (cobroHid, valorDesc) {
  if (!cobroHid || !(valorDesc > 0)) return 0;
  var cobro = RN.state.history.find(h => h.id === cobroHid);
  if (!cobro || typeof cobro.monto !== 'number') return 0;
  // Sumar el descuento de vuelta al monto del servicio del cobro
  cobro.monto = +(cobro.monto + valorDesc).toFixed(2);
  // Actualizar totalCUP si existe para mantener consistencia
  if (typeof cobro.totalCUP === 'number') {
    cobro.totalCUP = +(cobro.totalCUP + valorDesc).toFixed(2);
  }
  if (typeof cobro.totalAPagar === 'number') {
    cobro.totalAPagar = +(cobro.totalAPagar + valorDesc).toFixed(2);
  }
  // v5.13.8 (BUG-2): Recalcular tipoPago/falta/excedente tras revertir.
  var _pagadoCUP = cobro.totalPagadoCUP || 0;
  var _diferencia = +(_pagadoCUP - (cobro.totalAPagar || cobro.totalCUP || 0)).toFixed(2);
  if (Math.abs(_diferencia) < 0.01) {
    cobro.tipoPago = 'completo'; cobro.falta = 0; cobro.excedente = 0;
  } else if (_diferencia < 0) {
    cobro.tipoPago = 'parcial'; cobro.falta = Math.abs(_diferencia); cobro.excedente = 0;
  } else {
    cobro.tipoPago = 'excedente'; cobro.excedente = _diferencia; cobro.falta = 0;
  }
  return valorDesc;
};

/**
 * v5.15 — Refresca el sub-panel de descuentos del modal de cobro IN-PLACE
 * (sin reconstruir el modal), para que anular un descuento desde el propio
 * cobro NO borre los montos USD/CUP/notas que el usuario ya tecleó.
 * Reconstruye la tabla del panel, la línea de descuentos puntuales, el neto
 * y los totales usando los valores actuales de los inputs.
 */
RN.descuentos._refrescarPanelCobro = function (clienteId) {
  var tbody = document.querySelector('.modal-overlay #cobro-desc-tbody');
  if (!tbody) return false; // no hay modal de cobro abierto
  var c = RN.state.clients.find(function (x) { return x.id === clienteId; });
  if (!c) return false;
  var mes = RN.calc.mesActualStr();
  var descPunt = RN.state.descuentos.filter(function (d) {
    return d.clienteId === clienteId && RN.descuentos.vigenteEnMes(d, mes);
  });
  var rows = descPunt.length ? descPunt.map(function (d) {
    return '<tr>' +
      '<td>' + d.tipo + '</td><td>' + RN.render.esc(d.motivo) + '</td><td>' + d.modo + '</td>' +
      '<td>' + (RN.descuentos._badgeVigencia(d) || '<span class="muted">Este mes</span>') + '</td>' +
      '<td>' + RN.calc.formatCUP(RN.calc.valorDescuento(d, clienteId)) + '</td>' +
      '<td><button class="btn sm danger" onclick="RN.descuentos.eliminar(\'' + RN.render.escAttr(d.id) + '\', true)">\ud83d\uddd1</button></td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="6" class="muted center">Sin descuentos ni bonificaciones este mes</td></tr>';
  tbody.innerHTML = rows;
  // v5.15: mostrar/ocultar la pista de gestión según quede vacía o no la tabla
  var hint = document.querySelector('.modal-overlay #cobro-desc-hint');
  if (hint) hint.style.display = descPunt.length ? 'none' : '';
  // Refrescar línea de resumen, neto y totales (usa RN.modalCobro.recalcular,
  // que relee los inputs actuales y por tanto conserva lo tecleado)
  if (RN.modalCobro && RN.modalCobro.recalcular) RN.modalCobro.recalcular();
  return true;
};

/** Elimina un descuento puntual (o lo anula si ya fue aplicado). */
RN.descuentos.eliminar = function (id, reabrirCobro) {
  const d = RN.state.descuentos.find(x => x.id === id);
  if (!d) return;
  if (d.estado === 'aplicado') {
    // v5.14.4 — MULTI-COBRO: al anular un descuento ya aplicado, revertir el
    // efecto financiero en TODOS los cobros donde se aplicó (el legado solo
    // revertía un único d.cobroHid). El valor revertido por cobro es el
    // COBRADO congelado en aplicaciones[].valor (R2) — no depende del precio
    // del plan actual. Si el dato es legado (valor null), se recalcula.
    var apps = RN.descuentos._aplicacionesDe(d);
    var revertible = apps.filter(a => {
      var cobro = RN.state.history.find(h => h.id === a.cobroHid);
      return cobro && typeof cobro.monto === 'number';
    });
    var totalEstimado = apps.reduce(function (s, a) {
      return s + (a.valor != null ? +a.valor : (RN.calc.valorDescuento(d, d.clienteId) || 0));
    }, 0);
    var msgCobros = revertible.length
      ? 'Se revertirá su efecto en ' + revertible.length + ' cobro(s) por un total aproximado de ' + RN.calc.formatCUP(totalEstimado) + '.'
      : 'No se encontraron cobros vivos donde revertir (ya fueron eliminados).';
    RN.uiComponents.confirm('Anular descuento aplicado',
      'Este descuento ya fue aplicado en cobro(s). ¿Anularlo y revertir su efecto en el/los cobro(s)? ' + msgCobros,
      function () {
        var totalRevertido = 0;
        revertible.forEach(function (a) {
          var valor = a.valor != null ? +a.valor : RN.calc.valorDescuento(d, d.clienteId);
          totalRevertido += RN.descuentos._revertirEnCobro(a.cobroHid, valor || 0);
        });
        d.estado = 'anulado';
        if (RN.auditoria && typeof RN.auditoria.logEvento === 'function') {
          RN.auditoria.logEvento('descuento_anular', { id: d.id, clienteId: d.clienteId, tipo: d.tipo, modo: d.modo, valor: d.valor, vigencia: RN.descuentos.vigenciaDe(d), durMeses: d.durMeses, motivo: d.motivo });
        }
        RN.storageLocal.guardar();
        // v5.15: refresco in-place — si el cobro está abierto, actualizar su
        // panel sin reconstruir el modal (no se pierde lo tecleado).
        if (reabrirCobro && RN.descuentos._refrescarPanelCobro(d.clienteId)) {
          RN.render.vista('cobros'); RN.render.vista('descuentos');
        } else {
          RN.render.todo();
        }
        RN.notifyUI.toast('Descuento anulado y efecto revertido en ' + revertible.length + ' cobro(s) (+' + RN.calc.formatCUP(totalRevertido) + ')', 'warn');
      }, { danger: true });
  } else if (RN.descuentos.vigenciaDe(d) === 'permanente') {
    // v5.14.4: una bonificación PERMANENTE activa no está "aplicada" (vive en
    // pendiente). Anularla detiene su efecto a futuro; si ya tiene meses
    // cobrados, se revierten igual que las aplicadas.
    var appsP = RN.descuentos._aplicacionesDe(d);
    var revertibleP = appsP.filter(function (a) {
      var cobro = RN.state.history.find(h => h.id === a.cobroHid);
      return cobro && typeof cobro.monto === 'number';
    });
    if (appsP.length) {
      var msgP = revertibleP.length
        ? 'Se revertirá su efecto en ' + revertibleP.length + ' cobro(s) (meses ya cobrados con esta bonificación).'
        : 'Sus cobros asociados ya no existen; solo se detendrá su efecto futuro.';
      RN.uiComponents.confirm('Anular bonificación permanente',
        'Esta bonificación está activa permanentemente. ¿Anularla? ' + msgP,
        function () {
          var totalRevertidoP = 0;
          revertibleP.forEach(function (a) {
            var valor = a.valor != null ? +a.valor : RN.calc.valorDescuento(d, d.clienteId);
            totalRevertidoP += RN.descuentos._revertirEnCobro(a.cobroHid, valor || 0);
          });
          d.estado = 'anulado';
          if (RN.auditoria && typeof RN.auditoria.logEvento === 'function') {
            RN.auditoria.logEvento('descuento_anular', { id: d.id, clienteId: d.clienteId, tipo: d.tipo, modo: d.modo, valor: d.valor, vigencia: 'permanente', durMeses: d.durMeses, motivo: d.motivo });
          }
          RN.storageLocal.guardar();
          if (reabrirCobro && RN.descuentos._refrescarPanelCobro(d.clienteId)) {
            RN.render.vista('cobros'); RN.render.vista('descuentos');
          } else {
            RN.render.todo();
          }
          RN.notifyUI.toast('Bonificación permanente anulada (revertido +' + RN.calc.formatCUP(totalRevertidoP) + ' en ' + revertibleP.length + ' cobro(s))', 'warn');
        }, { danger: true });
    } else {
      RN.state.descuentos = RN.state.descuentos.filter(x => x.id !== id);
      if (RN.auditoria && typeof RN.auditoria.logEvento === 'function') {
        RN.auditoria.logEvento('descuento_anular', { id: d.id, clienteId: d.clienteId, tipo: d.tipo, modo: d.modo, valor: d.valor, vigencia: 'permanente', durMeses: d.durMeses, motivo: d.motivo });
      }
      RN.storageLocal.guardar();
      if (reabrirCobro && RN.descuentos._refrescarPanelCobro(d.clienteId)) {
        RN.render.vista('cobros'); RN.render.vista('descuentos');
      } else {
        RN.render.todo();
      }
      RN.notifyUI.toast('Bonificación permanente eliminada', 'warn');
    }
  } else {
    RN.state.descuentos = RN.state.descuentos.filter(x => x.id !== id);
    if (RN.auditoria && typeof RN.auditoria.logEvento === 'function') {
      RN.auditoria.logEvento('descuento_anular', { id: d.id, clienteId: d.clienteId, tipo: d.tipo, modo: d.modo, valor: d.valor, vigencia: RN.descuentos.vigenciaDe(d), durMeses: d.durMeses, motivo: d.motivo });
    }
    RN.storageLocal.guardar();
    if (reabrirCobro && RN.descuentos._refrescarPanelCobro(d.clienteId)) {
      RN.render.vista('cobros'); RN.render.vista('descuentos');
    } else {
      RN.render.todo();
    }
    RN.notifyUI.toast('Descuento eliminado', 'warn');
  }
};

/**
 * Revierte descuentos asociados a un cobro al eliminar ese cobro (v5.14.4).
 * - MULTI-MES: elimina la aplicación de ese mes de aplicaciones[] (así, si se
 *   vuelve a cobrar ese mes, la bonificación vuelve a aplicar) y recalcula el
 *   estado (sigue activa si le quedan meses o es permanente).
 * - PUNTUAL/unPago legado: restaura estado='pendiente' y limpia cobroHid
 *   (comportamiento previo exacto).
 */
RN.descuentos.revertirPorCobro = function (cobroId) {
  RN.state.descuentos.forEach(d => {
    // Caso multi-mes: aplicaciones registradas que apunten a este cobro
    if (Array.isArray(d.aplicaciones) && d.aplicaciones.length) {
      var antes = d.aplicaciones.length;
      d.aplicaciones = d.aplicaciones.filter(a => a.cobroHid !== cobroId);
      if (d.aplicaciones.length < antes) {
        // El mes queda liberado: si el descuento sigue vigente a futuro (o es
        // permanente), continúa pendiente/activo; si era el último mes aplicado
        // de un rango cerrado, también vuelve a pendiente para permitir re-cobro.
        d.estado = 'pendiente';
        // Recalcular cobroHid legado a la última aplicación restante
        d.cobroHid = d.aplicaciones.length ? d.aplicaciones[d.aplicaciones.length - 1].cobroHid : null;
      }
      return;
    }
    // Caso legado (puntual/unPago con único cobroHid)
    if (d.cobroHid === cobroId) {
      d.estado = 'pendiente';
      d.cobroHid = null;
    }
  });
};

/** Descuento por lote: aplicar el mismo descuento a varios clientes. */
RN.descuentos.abrirLote = function () {
  const activos = RN.calc.clientesActivos();
  if (!activos.length) { RN.notifyUI.toast('No hay clientes activos', 'warn'); return; }
  const cliOpts = activos.map(c => `<option value="${c.id}">${RN.render.esc(c.nombre)}</option>`).join('');
  const html = `
    <div class="modal-header"><h3>Descuento por lote</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <p class="muted mb-16">Aplica el mismo descuento puntual a varios clientes a la vez.</p>
      <div class="form-row"><div><label>Clientes (Ctrl/Cmd para varios) *</label>
        <select id="lot-cli" multiple style="height:140px">${cliOpts}</select></div></div>
      <div class="form-row cols-2">
        <div><label>Tipo</label><select id="lot-tipo">${Object.keys(RN.descuentos.TIPOS).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
        <div><label>Modo</label><select id="lot-modo">${Object.keys(RN.descuentos.MODOS).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Valor</label><input id="lot-valor" type="number" step="0.01" value="0"></div>
        <div><label>Motivo *</label><input id="lot-motivo" placeholder="Ej: interrupción general"></div>
      </div>
      <!-- v5.14.4 (D3): el lote también recibe Duración -->
      <div class="form-row cols-2">
        <div><label>Duración</label><select id="lot-duracion">
          <option value="meses1">Solo este mes</option>
          <option value="mesesN">Varios meses (N)</option>
          <option value="permanente">Permanente (hasta anulación)</option>
          <option value="unPago">1 solo pago (se consume en el próximo cobro)</option>
        </select></div>
        <div id="lot-wrap-durmeses" style="display:none"><label>N.º de meses *</label><input id="lot-durmeses" type="number" min="2" step="1" value="3"></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.descuentos.guardarLote()">Aplicar lote</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
  // v5.14.4: mostrar/ocultar input de N meses según duración elegida
  const lotDur = document.getElementById('lot-duracion');
  if (lotDur) {
    lotDur.addEventListener('change', function () {
      const wrap = document.getElementById('lot-wrap-durmeses');
      if (wrap) wrap.style.display = lotDur.value === 'mesesN' ? '' : 'none';
    });
  }
};

RN.descuentos.guardarLote = function () {
  const clientes = Array.from(document.getElementById('lot-cli').selectedOptions).map(o => o.value);
  if (!clientes.length) { RN.notifyUI.toast('Selecciona al menos un cliente', 'error'); return; }
  const tipo = document.getElementById('lot-tipo').value;
  const modo = document.getElementById('lot-modo').value;
  const valor = parseFloat(document.getElementById('lot-valor').value) || 0;
  const motivo = document.getElementById('lot-motivo').value.trim();
  if (!motivo) { RN.notifyUI.toast('El motivo es obligatorio', 'error'); return; }
  // v5.13.8 (LOG-5): Validar que el valor sea > 0 (igual que guardar() individual)
  if (valor <= 0) { RN.notifyUI.toast('El valor debe ser mayor que 0', 'error'); return; }
  const mes = RN.calc.mesActualStr();

  // v5.14.4 (D3): el lote recibe Duración. D5: modo 'dias' fuerza puntual.
  let vigencia = 'meses', durMeses = 1, soloPago = false;
  if (RN.descuentos._modoPermiteDuracion(modo)) {
    const dur = document.getElementById('lot-duracion') ? document.getElementById('lot-duracion').value : 'meses1';
    if (dur === 'permanente') { vigencia = 'permanente'; }
    else if (dur === 'unPago') { vigencia = 'unPago'; soloPago = true; }
    else if (dur === 'mesesN') {
      vigencia = 'meses';
      durMeses = parseInt(document.getElementById('lot-durmeses').value, 10) || 0;
      if (durMeses < 2) { RN.notifyUI.toast('Para "Varios meses" indica al menos 2 meses', 'error'); return; }
    } else { vigencia = 'meses'; durMeses = 1; }
  }

  clientes.forEach(cid => {
    RN.state.descuentos.push({
      id: RN.calc.uid('desc'), clienteId: cid, tipo, motivo, modo, valor,
      mes, soloPago: soloPago,
      // v5.14.4 — modelo unificado de vigencia
      vigencia, desde: mes, durMeses, aplicaciones: [],
      fecha: new Date().toISOString(), estado: 'pendiente', cobroHid: null
    });
  });
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  var msg = 'Descuento aplicado a ' + clientes.length + ' cliente(s)';
  if (vigencia === 'permanente') msg += ' (permanente)';
  else if (vigencia === 'unPago') msg += ' (1 solo pago)';
  else if (durMeses > 1) msg += ' (' + durMeses + ' meses)';
  RN.notifyUI.toast(msg, 'success');
};
