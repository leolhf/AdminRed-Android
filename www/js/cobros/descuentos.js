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
 * v5.51.0 — Edición de descuentos/bonificaciones (ver bloque al final del archivo).
 * v5.47.0 — Lote táctil: el select múltiple de clientes se sustituye por una
 * lista de checkboxes (mejor en móvil, donde no existe Ctrl/Cmd).
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

/** v5.55.18 — Etiquetas cortas para UI */
RN.descuentos.tipoLabelCorto = function (tipo) {
  return ({ bonificacion: 'Bonificación', afectacion: 'Afectación', ajuste: 'Ajuste' })[tipo] || tipo || '—';
};
RN.descuentos.modoLabelCorto = function (modo) {
  return ({ fijo: 'Monto fijo', porcentaje: '% del plan', dias: 'Días sin servicio' })[modo] || modo || '—';
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
    '<div class="modal-header"><h3>Nuevo descuento</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<p class="muted" style="font-size:13px;margin:0 0 10px">Elige el tipo y el cliente. Luego defines monto y vigencia.</p>' +
      '<div class="desc-tipo-grid" id="desc-tipo-grid">' +
        '<button type="button" class="desc-tipo-card" data-tipo="bonificacion"><strong>Bonificación</strong><span>Promo o fidelización</span></button>' +
        '<button type="button" class="desc-tipo-card" data-tipo="afectacion"><strong>Afectación</strong><span>Falla o degradación del servicio</span></button>' +
        '<button type="button" class="desc-tipo-card" data-tipo="ajuste"><strong>Ajuste</strong><span>Corrección administrativa</span></button>' +
      '</div>' +
      '<label>Cliente</label>' +
      '<select id="desc-select-cliente">' + opts + '</select>' +
      '<input type="hidden" id="desc-select-tipo" value="bonificacion">' +
    '</div>' +
    '<div class="modal-footer"><button class="btn ghost" id="desc-select-cancel">Cancelar</button>' +
    '<button class="btn primary" id="desc-select-ok">Continuar</button></div>';
  RN.uiComponents.modal(html);
  var tipoHidden = document.getElementById('desc-select-tipo');
  document.querySelectorAll('#desc-tipo-grid .desc-tipo-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#desc-tipo-grid .desc-tipo-card').forEach(function (b) {
        b.style.borderColor = '';
      });
      btn.style.borderColor = 'var(--primary, #2563eb)';
      tipoHidden.value = btn.getAttribute('data-tipo') || 'bonificacion';
    });
  });
  // highlight default
  var first = document.querySelector('#desc-tipo-grid .desc-tipo-card[data-tipo="bonificacion"]');
  if (first) first.style.borderColor = 'var(--primary, #2563eb)';
  document.getElementById('desc-select-ok').onclick = function () {
    var v = document.getElementById('desc-select-cliente').value;
    var tipoPref = (document.getElementById('desc-select-tipo') || {}).value || 'bonificacion';
    RN.uiComponents.cerrarModal();
    if (v) {
      RN.descuentos.abrirNuevo(v, RN.calc.mesActualStr());
      setTimeout(function () {
        var sel = document.getElementById('dc-tipo');
        if (sel) {
          sel.value = tipoPref;
          if (typeof RN.descuentos._actualizarDuracionUI === 'function') RN.descuentos._actualizarDuracionUI();
        }
      }, 40);
    }
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
  var hero = document.getElementById('desc-estado');
  var urgZone = document.getElementById('desc-urgente-zone');
  var urgBox = document.getElementById('desc-urgente');

  var activas = 0, pendientesMes = 0, impactoCUP = 0, vencEsteMes = 0, unPagoPend = 0;
  var urgentes = [];

  (RN.state.descuentos || []).forEach(function (d) {
    if (d.estado === 'anulado') return;
    if (!RN.descuentos.vigenteEnMes(d, mes)) return;
    var vig = RN.descuentos.vigenciaDe(d);
    if (vig === 'permanente' || (vig === 'meses' && (parseInt(d.durMeses, 10) || 1) > 1)) {
      activas++;
    } else {
      pendientesMes++;
    }
    if (vig === 'unPago' && d.estado === 'pendiente') unPagoPend++;
    if (vig === 'meses') {
      var vence = RN.descuentos.venceEnMes(d);
      if (vence === mes) {
        vencEsteMes++;
        urgentes.push({ d: d, motivo: 'Vence este mes' });
      }
    }
    if (vig === 'unPago' && d.estado === 'pendiente') {
      urgentes.push({ d: d, motivo: 'Próximo cobro' });
    }
    impactoCUP += (RN.calc.valorDescuento(d, d.clienteId) || 0);
  });

  if (hero) {
    hero.innerHTML =
      '<div class="desc-hero">' +
        '<div class="muted" style="font-size:12px;font-weight:600">Impacto estimado · ' + RN.render.esc(mes) + '</div>' +
        '<div class="desc-impacto">' + RN.calc.formatCUP(impactoCUP) + '</div>' +
        '<div class="desc-sub">Lo que dejan de pagar los clientes este mes por descuentos vigentes</div>' +
        '<div class="desc-hero-actions">' +
          '<button type="button" class="btn primary" onclick="RN.descuentos.abrirNuevoSelector()">+ Nuevo descuento</button>' +
          '<button type="button" class="btn" onclick="RN.descuentos.abrirLote()">Por lote</button>' +
        '</div>' +
      '</div>';
  }

  if (cont) {
    var kpis = [
      { label: 'Impacto del mes', value: RN.calc.formatCUP(impactoCUP), cls: 'blue' },
      { label: 'Activas', value: String(activas), cls: 'green' },
      { label: 'Vencen este mes', value: String(vencEsteMes), cls: vencEsteMes ? 'amber' : 'green' },
      { label: 'Pend. próximo cobro', value: String(unPagoPend), cls: unPagoPend ? 'amber' : 'green' }
    ];
    cont.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
    }).join('');
  }

  if (urgZone && urgBox) {
    if (!urgentes.length) {
      urgZone.style.display = 'none';
      urgBox.innerHTML = '';
    } else {
      urgZone.style.display = '';
      // dedupe by id
      var seen = {};
      urgentes = urgentes.filter(function (u) {
        if (seen[u.d.id]) return false;
        seen[u.d.id] = true;
        return true;
      });
      urgBox.innerHTML = urgentes.slice(0, 8).map(function (u) {
        var d = u.d;
        var c = RN.calc.clientePorId ? RN.calc.clientePorId(d.clienteId) : null;
        var nom = c ? c.nombre : '—';
        var val = d.modo === 'porcentaje' ? (d.valor + '%') : (d.modo === 'dias' ? (d.valor + ' d') : RN.calc.formatCUP(d.valor));
        return '<div class="acc-row" style="padding:8px 0;border-bottom:1px solid var(--border)">'
          + '<span class="acc-label"><strong>' + RN.render.esc(nom) + '</strong> · '
          + RN.render.esc(RN.descuentos.tipoLabelCorto(d.tipo)) + ' · ' + RN.render.esc(val)
          + ' <span class="badge warn" style="font-size:10px">' + RN.render.esc(u.motivo) + '</span></span>'
          + '<span class="acc-value">'
          + (RN.descuentos.puedeEditar(d) ? '<button type="button" class="btn sm" onclick="RN.descuentos.abrirEditar(\'' + d.id + '\')">Editar</button> ' : '')
          + '</span></div>';
      }).join('');
    }
  }
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
        <div><label>Motivo *</label><input id="dc-motivo" placeholder="Ej: 2 días sin servicio" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div>
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

/** v5.47.3: resalta las filas marcadas del lote y actualiza el contador. */
RN.descuentos._refrescarMarcasLote = function () {
  const items = document.querySelectorAll('#lot-cli .lot-cli-item');
  let n = 0;
  items.forEach(function (it) {
    const on = !!(it.querySelector('input') && it.querySelector('input').checked);
    it.classList.toggle('marcado', on);
    if (on) n++;
  });
  const c = document.getElementById('lot-cli-count');
  if (c) c.textContent = n + (n === 1 ? ' marcado' : ' marcados');
};

/** v5.47.3: marcar o desmarcar todos los clientes del lote. */
RN.descuentos.marcarLote = function (marcar) {
  document.querySelectorAll('#lot-cli input[type="checkbox"]').forEach(function (el) { el.checked = !!marcar; });
  RN.descuentos._refrescarMarcasLote();
};

/** Descuento por lote: aplicar el mismo descuento a varios clientes. */
RN.descuentos.abrirLote = function () {
  const activos = RN.calc.clientesActivos();
  if (!activos.length) { RN.notifyUI.toast('No hay clientes activos', 'warn'); return; }
  const cliOpts = activos.map(c => `<label class="lot-cli-item"><input type="checkbox" value="${c.id}"><span>${RN.render.esc(c.nombre)}</span></label>`).join('');
  const html = `
    <div class="modal-header"><h3>Descuento por lote</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <p class="muted mb-16">Aplica el mismo descuento puntual a varios clientes a la vez.</p>
      <div class="form-row"><div><label>Clientes (toca para marcar) *</label>
        <div class="lot-cli-bar"><span class="lot-cli-count" id="lot-cli-count">0 marcados</span>
          <span><button type="button" class="btn" onclick="RN.descuentos.marcarLote(true)">Todos</button>
          <button type="button" class="btn" onclick="RN.descuentos.marcarLote(false)">Ninguno</button></span></div>
        <div id="lot-cli" style="max-height:200px;overflow:auto;border:1px solid var(--neo-stroke);border-radius:8px;padding:4px 8px">${cliOpts}</div></div></div>
      <div class="form-row cols-2">
        <div><label>Tipo</label><select id="lot-tipo">${Object.keys(RN.descuentos.TIPOS).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
        <div><label>Modo</label><select id="lot-modo">${Object.keys(RN.descuentos.MODOS).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Valor</label><input id="lot-valor" type="number" step="0.01" value="0"></div>
        <div><label>Motivo *</label><input id="lot-motivo" placeholder="Ej: interrupción general" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div>
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
  const lotCli = document.getElementById('lot-cli');
  if (lotCli) lotCli.addEventListener('change', RN.descuentos._refrescarMarcasLote);
  const lotDur = document.getElementById('lot-duracion');
  if (lotDur) {
    lotDur.addEventListener('change', function () {
      const wrap = document.getElementById('lot-wrap-durmeses');
      if (wrap) wrap.style.display = lotDur.value === 'mesesN' ? '' : 'none';
    });
  }
};

RN.descuentos.guardarLote = function () {
  // v5.47.0: los clientes llegan de la lista de checkboxes (táctil)
  const clientes = Array.from(document.querySelectorAll('#lot-cli input[type="checkbox"]:checked')).map(el => el.value);
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

/* ============================================================
 * v5.51.0 — EDICIÓN de descuentos y bonificaciones.
 *
 * Regla de oro: los meses ANTERIORES al actual no se tocan nunca (ya se
 * cobraron). Un cambio rige siempre desde el mes actual hacia adelante:
 *  - Sin cobro este mes ('directo'): el cambio rige desde este mes.
 *  - Con el mes ya cobrado:
 *      'corregir' → se corrige también el cobro de este mes (se cobró por error).
 *      'proximo'  → este mes queda como se cobró; el cambio rige desde el mes siguiente.
 * Si el descuento viene de meses anteriores se PARTE en dos: el viejo se
 * cierra en el último mes que no cambia (conserva sus aplicaciones y valores
 * congelados) y se crea uno nuevo (reemplazaA) con los valores editados.
 * ============================================================ */

/** Cobro vivo de ESTE mes que ya aplicó el descuento, o null. */
RN.descuentos._cobroDelMes = function (d, mes) {
  var apps = RN.descuentos._aplicacionesDe(d);
  for (var i = 0; i < apps.length; i++) {
    if (apps[i].mes !== mes) continue;
    var cobro = (RN.state.history || []).find(function (h) { return h.id === apps[i].cobroHid; });
    if (cobro) return { app: apps[i], cobro: cobro };
  }
  return null;
};

/** Situación del descuento respecto al mes actual (para decidir qué preguntar). */
RN.descuentos.infoEdicion = function (d) {
  var mes = RN.calc.mesActualStr();
  var hit = RN.descuentos._cobroDelMes(d, mes);
  var aFuturo = RN.descuentos.aplicaAFuturo(d, mes);
  return {
    mes: mes,
    cobro: hit ? hit.cobro : null,
    app: hit ? hit.app : null,
    aplicaAFuturo: aFuturo,
    ofreceProximo: !!hit && aFuturo
  };
};

/** ¿Se puede editar? Vigente este mes, cobrado este mes o aún por empezar. */
RN.descuentos.puedeEditar = function (d) {
  if (!d || d.estado === 'anulado') return false;
  var mes = RN.calc.mesActualStr();
  if (RN.descuentos.vigenteEnMes(d, mes)) return true;
  if (RN.descuentos._cobroDelMes(d, mes)) return true;
  return RN.descuentos.desdeDe(d) > mes;
};

/** Valida los cambios ya resueltos. Devuelve un texto de error o null. */
RN.descuentos._validarCambios = function (c) {
  if (!c || !c.motivo) return 'El motivo es obligatorio';
  if (!(c.valor > 0)) return 'El valor debe ser mayor que 0';
  if (['fijo', 'porcentaje', 'dias'].indexOf(c.modo) < 0) return 'Modo de cálculo no válido';
  if (['meses', 'permanente', 'unPago'].indexOf(c.vigencia) < 0) return 'Duración no válida';
  if (c.vigencia === 'meses' && !(c.durMeses >= 1)) return 'Indica la duración en meses';
  return null;
};

/**
 * Cierra el descuento d: deja de regir DESPUÉS de `hasta` (YYYY-MM). Los meses
 * hasta `hasta` conservan su efecto y sus aplicaciones. Queda finalizado.
 */
RN.descuentos._cerrarEnMes = function (d, hasta) {
  var vig = RN.descuentos.vigenciaDe(d);
  if (vig === 'meses') {
    var vence = RN.descuentos.venceEnMes(d);
    if (!vence || vence > hasta) {
      d.durMeses = Math.max(1, RN.calc.mesesEntre(RN.descuentos.desdeDe(d), hasta) + 1);
    }
  } else if (vig === 'permanente') {
    d.vigencia = 'meses';
    d.durMeses = Math.max(1, RN.calc.mesesEntre(RN.descuentos.desdeDe(d), hasta) + 1);
  }
  d.soloPago = false;
  d.estado = 'aplicado';
  d.cobroHid = (d.aplicaciones && d.aplicaciones.length) ? d.aplicaciones[d.aplicaciones.length - 1].cobroHid : null;
};

/** Crea el descuento nuevo que continúa a d con los valores editados. */
RN.descuentos._crearSegmento = function (d, cambios, desde) {
  var nuevo = {
    id: RN.calc.uid('desc'),
    clienteId: d.clienteId,
    tipo: d.tipo,
    motivo: cambios.motivo,
    modo: cambios.modo,
    valor: cambios.valor,
    mes: desde,
    soloPago: !!cambios.soloPago,
    vigencia: cambios.vigencia,
    desde: desde,
    durMeses: cambios.durMeses,
    aplicaciones: [],
    fecha: new Date().toISOString(),
    estado: 'pendiente',
    cobroHid: null,
    reemplazaA: d.id
  };
  d.reemplazadoPor = nuevo.id;
  RN.state.descuentos.push(nuevo);
  return nuevo;
};

/**
 * Cálculo (sin modificar nada) de cómo queda el cobro de un mes si el
 * descuento pasa de valorViejo a valorNuevo (CUP). Usa el neto congelado del
 * cobro, así que NO arrastra cambios posteriores de plan o descuento recurrente.
 */
RN.descuentos._calcularCobroCorregido = function (cobro, valorViejo, valorNuevo) {
  var ajuste = +cobro.ajusteRedondeo || 0;
  var netoViejo = (typeof cobro.precioNetoAplicado === 'number')
    ? cobro.precioNetoAplicado
    : +((+cobro.monto || 0) + ajuste).toFixed(2); // cobros antiguos sin neto congelado
  var netoNuevo = Math.max(0, +(netoViejo + (valorViejo || 0) - (valorNuevo || 0)).toFixed(2));
  var aPagarViejo = (typeof cobro.totalAPagar === 'number') ? cobro.totalAPagar : netoViejo;
  var aPagar = Math.max(0, +(aPagarViejo + (netoNuevo - netoViejo)).toFixed(2));
  var pagado = +cobro.totalPagadoCUP || 0;
  var eq = +cobro.montoEquipo || 0;
  var mora = +cobro.montoMora || 0;

  var dif = +(pagado + ajuste - aPagar).toFixed(2);
  var tipoPago = 'completo', falta = 0, excedente = 0;
  if (Math.abs(dif) < 0.01) tipoPago = 'completo';
  else if (dif < 0) { tipoPago = 'parcial'; falta = Math.abs(dif); }
  else { tipoPago = 'excedente'; excedente = dif; }

  var servicio, moraCobrada;
  if (tipoPago === 'parcial') {
    var resto = Math.max(0, pagado - eq);
    servicio = Math.min(resto, netoNuevo);
    moraCobrada = Math.min(Math.max(0, resto - servicio), mora);
  } else {
    servicio = netoNuevo;
    moraCobrada = mora;
  }
  if (ajuste) servicio = Math.max(0, +(servicio - ajuste).toFixed(2));
  servicio = +servicio.toFixed(2);
  moraCobrada = +moraCobrada.toFixed(2);
  return {
    netoViejo: netoViejo, netoNuevo: netoNuevo, aPagar: aPagar,
    tipoPago: tipoPago, tipoPagoAntes: cobro.tipoPago, falta: falta, excedente: excedente,
    monto: servicio, moraCobrada: moraCobrada,
    totalCUP: +(servicio + moraCobrada + eq).toFixed(2)
  };
};

/** Aplica el resultado de _calcularCobroCorregido al cobro (queda anotado). */
RN.descuentos._aplicarCorreccionACobro = function (cobro, r, descuentoId) {
  cobro.precioNetoAplicado = r.netoNuevo;
  cobro.totalAPagar = r.aPagar;
  cobro.monto = r.monto;
  cobro.montoMoraCobrada = r.moraCobrada;
  cobro.totalCUP = r.totalCUP;
  cobro.tipoPago = r.tipoPago;
  cobro.falta = r.falta;
  cobro.excedente = r.excedente;
  if (typeof cobro.fondoAntes === 'number') {
    cobro.fondoDespues = +(cobro.fondoAntes + r.monto + r.moraCobrada + (+cobro.montoEquipo || 0)).toFixed(2);
  }
  if (!Array.isArray(cobro.ediciones)) cobro.ediciones = [];
  cobro.ediciones.push({
    fecha: new Date().toISOString(), origen: 'edicion_descuento', descuentoId: descuentoId,
    netoAntes: r.netoViejo, netoDespues: r.netoNuevo
  });
  if (RN.calc.invalidarIndicePagos) RN.calc.invalidarIndicePagos();
};

/**
 * Aplica la edición de un descuento. `cambios` = {modo, valor, motivo,
 * vigencia, durMeses, soloPago}; `opcion` = 'directo' | 'corregir' | 'proximo'.
 * Devuelve {ok, error?, msg?, delta?, reemplazo?}.
 */
RN.descuentos.aplicarEdicion = function (id, cambios, opcion) {
  var d = RN.state.descuentos.find(function (x) { return x.id === id; });
  if (!d || d.estado === 'anulado') return { ok: false, error: 'El descuento ya no existe o está anulado' };
  var err = RN.descuentos._validarCambios(cambios);
  if (err) return { ok: false, error: err };

  var info = RN.descuentos.infoEdicion(d);
  var mes = info.mes;
  opcion = opcion || 'directo';
  if (info.cobro && opcion === 'directo') {
    return { ok: false, error: 'Este mes ya está cobrado: elige corregir el cobro o aplicar desde el próximo mes' };
  }
  if (!info.cobro) opcion = 'directo';
  if (opcion === 'proximo') {
    if (!info.ofreceProximo) return { ok: false, error: 'Este descuento no continúa el mes próximo' };
    if (cambios.vigencia === 'unPago') return { ok: false, error: '"1 solo pago" no se puede programar para el mes próximo' };
  }

  var vigAnt = RN.descuentos.vigenciaDe(d);
  var desdeAnt = RN.descuentos.desdeDe(d);
  var antes = { modo: d.modo, valor: d.valor, motivo: d.motivo, vigencia: vigAnt, durMeses: d.durMeses };

  // Normalizar el dato legado (un único cobroHid) a aplicaciones[] para poder editarlas.
  if (!Array.isArray(d.aplicaciones)) d.aplicaciones = [];
  if (!d.aplicaciones.length) d.aplicaciones = RN.descuentos._aplicacionesDe(d);

  var valorViejoMes = 0, valorNuevoMes = 0, resCobro = null;
  if (info.cobro) {
    var ap0 = d.aplicaciones.find(function (a) { return a.mes === mes && a.cobroHid === info.cobro.id; });
    valorViejoMes = (ap0 && ap0.valor != null) ? +ap0.valor : (RN.calc.valorDescuento(d, d.clienteId, mes) || 0);
    valorNuevoMes = RN.calc.valorDescuento({ modo: cambios.modo, valor: cambios.valor }, d.clienteId, mes) || 0;
  }

  var reemplazo = null;
  if (opcion === 'proximo') {
    // Este mes queda tal cual se cobró; el cambio rige desde el mes siguiente.
    RN.descuentos._cerrarEnMes(d, mes);
    reemplazo = RN.descuentos._crearSegmento(d, cambios, RN.calc.mesSiguiente(mes));
  } else if (vigAnt !== 'unPago' && desdeAnt < mes) {
    // Viene de meses anteriores: se parte en dos para no tocarlos.
    var movida = null;
    if (info.cobro) {
      movida = d.aplicaciones.find(function (a) { return a.mes === mes && a.cobroHid === info.cobro.id; });
      d.aplicaciones = d.aplicaciones.filter(function (a) { return a !== movida; });
    }
    RN.descuentos._cerrarEnMes(d, RN.calc.mesAnterior(mes));
    reemplazo = RN.descuentos._crearSegmento(d, cambios, mes);
    if (info.cobro) {
      RN.descuentos.aplicarEnMes(reemplazo, mes, info.cobro.id, valorNuevoMes);
      if (Array.isArray(info.cobro.descuentosPuntualesIds)) {
        info.cobro.descuentosPuntualesIds = info.cobro.descuentosPuntualesIds.map(function (x) { return x === d.id ? reemplazo.id : x; });
      }
    }
  } else {
    // Nace este mes (o es de un solo pago): se edita en su sitio.
    d.modo = cambios.modo; d.valor = cambios.valor; d.motivo = cambios.motivo;
    d.vigencia = cambios.vigencia; d.durMeses = cambios.durMeses; d.soloPago = !!cambios.soloPago;
    if (vigAnt === 'unPago' && cambios.vigencia !== 'unPago' && desdeAnt < mes) d.desde = mes; // sin retroactividad
    if (info.cobro) {
      var ap1 = d.aplicaciones.find(function (a) { return a.mes === mes && a.cobroHid === info.cobro.id; });
      if (ap1) ap1.valor = valorNuevoMes;
    }
    var ultimoMes = d.aplicaciones.reduce(function (m, a) { return a.mes > m ? a.mes : m; }, '');
    d.estado = (d.aplicaciones.length && !RN.descuentos.aplicaAFuturo(d, ultimoMes)) ? 'aplicado' : 'pendiente';
    d.cobroHid = d.aplicaciones.length ? d.aplicaciones[d.aplicaciones.length - 1].cobroHid : null;
  }

  // Corrección del cobro de este mes (solo si se eligió 'corregir').
  if (info.cobro && opcion === 'corregir') {
    resCobro = RN.descuentos._calcularCobroCorregido(info.cobro, valorViejoMes, valorNuevoMes);
    RN.descuentos._aplicarCorreccionACobro(info.cobro, resCobro, reemplazo ? reemplazo.id : d.id);
  }

  if (RN.auditoria && typeof RN.auditoria.logEvento === 'function') {
    RN.auditoria.logEvento('descuento_editar', {
      id: d.id, nuevoId: reemplazo ? reemplazo.id : null, clienteId: d.clienteId, opcion: opcion,
      antes: antes,
      despues: { modo: cambios.modo, valor: cambios.valor, motivo: cambios.motivo, vigencia: cambios.vigencia, durMeses: cambios.durMeses },
      cobroCorregido: !!resCobro, netoAntes: resCobro ? resCobro.netoViejo : undefined, netoDespues: resCobro ? resCobro.netoNuevo : undefined
    });
  }
  return {
    ok: true, opcion: opcion, reemplazo: reemplazo, cobro: resCobro,
    delta: resCobro ? +(resCobro.netoNuevo - resCobro.netoViejo).toFixed(2) : 0
  };
};

/* ---------------------- Interfaz de edición ---------------------- */


/** Meses que le quedan a un descuento de N meses contando desde este mes (para precargar el formulario). */
RN.descuentos._durRestante = function (d) {
  var mes = RN.calc.mesActualStr();
  var n = Math.max(1, parseInt(d.durMeses, 10) || 1);
  if (RN.descuentos.vigenciaDe(d) !== 'meses' || RN.descuentos.desdeDe(d) >= mes) return n;
  var vence = RN.descuentos.venceEnMes(d);
  return vence ? Math.max(1, RN.calc.mesesEntre(mes, vence) + 1) : 1;
};

/** Lee el formulario de edición y devuelve {cambios} o {error}. */
RN.descuentos._leerFormEdicion = function (d) {
  var modo = document.getElementById('dc-modo').value;
  var valor = parseFloat(document.getElementById('dc-valor').value) || 0;
  var motivo = document.getElementById('dc-motivo').value.trim();
  var esBonif = d.tipo === 'bonificacion' && RN.descuentos._modoPermiteDuracion(modo);
  var vigencia = 'meses', durMeses = 1, soloPago = false;
  if (esBonif) {
    var dur = document.getElementById('dc-duracion').value;
    if (dur === 'permanente') vigencia = 'permanente';
    else if (dur === 'unPago') { vigencia = 'unPago'; soloPago = true; }
    else if (dur === 'mesesN') {
      durMeses = parseInt(document.getElementById('dc-durmeses').value, 10) || 0;
      if (durMeses < 2) return { error: 'Para "Varios meses" indica al menos 2 meses (usa "Solo este mes" para 1)' };
    }
  } else {
    var apl = document.getElementById('dc-aplicacion') ? document.getElementById('dc-aplicacion').value : 'mes';
    if (apl === 'soloPago') { vigencia = 'unPago'; soloPago = true; }
  }
  return { cambios: { modo: modo, valor: valor, motivo: motivo, vigencia: vigencia, durMeses: durMeses, soloPago: soloPago } };
};

/** Abre el formulario para editar un descuento o bonificación. */
RN.descuentos.abrirEditar = function (id) {
  var d = RN.state.descuentos.find(function (x) { return x.id === id; });
  if (!d) return;
  if (!RN.descuentos.puedeEditar(d)) { RN.notifyUI.toast('Este descuento ya finalizó y no se puede editar', 'warn'); return; }
  var c = RN.state.clients.find(function (x) { return x.id === d.clienteId; });
  var mes = RN.calc.mesActualStr();
  var vig = RN.descuentos.vigenciaDe(d);
  var info = RN.descuentos.infoEdicion(d);
  var html =
    '<div class="modal-header"><h3>Editar descuento — ' + RN.render.esc(c ? c.nombre : '—') + '</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="form-row cols-2">' +
        '<div><label>Tipo</label><select id="dc-tipo" disabled><option value="' + d.tipo + '">' + RN.render.esc(RN.descuentos.TIPOS[d.tipo] || d.tipo) + '</option></select></div>' +
        '<div><label>Modo de cálculo *</label><select id="dc-modo">' +
          Object.keys(RN.descuentos.MODOS).map(function (k) { return '<option value="' + k + '"' + (k === d.modo ? ' selected' : '') + '>' + RN.descuentos.MODOS[k] + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="form-row cols-2">' +
        '<div><label id="dc-valor-label">Valor (CUP) *</label><input id="dc-valor" type="number" step="0.01" value="' + (+d.valor || 0) + '"></div>' +
        '<div><label>Motivo *</label><input id="dc-motivo" value="' + RN.render.escAttr(d.motivo || '') + '" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div>' +
      '</div>' +
      RN.descuentos._htmlDuracion(mes) +
      '<p class="muted" id="dc-preview"></p>' +
      '<p class="muted" style="font-size:12px">Los meses anteriores ya cobrados no se modifican. ' +
        (info.cobro ? 'Este mes ya fue cobrado: al guardar te preguntaré cómo aplicar el cambio.' : 'El cambio rige desde este mes.') +
        ' «N meses» cuenta desde que el cambio empieza a regir.</p>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
      '<button class="btn primary" onclick="RN.descuentos.guardarEdicion(\'' + RN.render.escAttr(d.id) + '\')">Guardar cambios</button></div>';
  RN.uiComponents.modal(html);

  // Valores iniciales de duración/aplicación
  var restantes = RN.descuentos._durRestante(d);
  var durSel = document.getElementById('dc-duracion');
  if (durSel) {
    durSel.value = vig === 'permanente' ? 'permanente' : (vig === 'unPago' ? 'unPago' : (restantes > 1 ? 'mesesN' : 'meses1'));
    document.getElementById('dc-durmeses').value = Math.max(2, restantes);
  }
  var aplSel = document.getElementById('dc-aplicacion');
  if (aplSel) aplSel.value = vig === 'unPago' ? 'soloPago' : 'mes';

  var modoSel = document.getElementById('dc-modo');
  var actualizarLabel = function () {
    var m = modoSel.value;
    document.getElementById('dc-valor-label').textContent = m === 'fijo' ? 'Valor (CUP) *' : (m === 'porcentaje' ? 'Valor (%) *' : 'Días sin servicio *');
    RN.descuentos._actualizarDuracionUI();
    RN.descuentos._preview(d.clienteId);
  };
  modoSel.addEventListener('change', actualizarLabel);
  document.getElementById('dc-valor').addEventListener('input', function () { RN.descuentos._preview(d.clienteId); });
  if (durSel) durSel.addEventListener('change', function () { RN.descuentos._actualizarDuracionUI(); });
  if (aplSel) aplSel.addEventListener('change', function () { RN.descuentos._actualizarDuracionUI(); });
  actualizarLabel();
};

/** Guarda la edición; si el mes ya se cobró, pregunta cómo aplicarla. */
RN.descuentos.guardarEdicion = function (id) {
  var d = RN.state.descuentos.find(function (x) { return x.id === id; });
  if (!d) return;
  var lec = RN.descuentos._leerFormEdicion(d);
  if (lec.error) { RN.notifyUI.toast(lec.error, 'error'); return; }
  var cambios = lec.cambios;
  var err = RN.descuentos._validarCambios(cambios);
  if (err) { RN.notifyUI.toast(err, 'error'); return; }

  var igual = cambios.modo === d.modo && +cambios.valor === +d.valor && cambios.motivo === d.motivo &&
    cambios.vigencia === RN.descuentos.vigenciaDe(d) &&
    (cambios.vigencia !== 'meses' || cambios.durMeses === RN.descuentos._durRestante(d));
  if (igual) { RN.uiComponents.cerrarModal(); RN.notifyUI.toast('Sin cambios', 'info'); return; }

  var info = RN.descuentos.infoEdicion(d);
  if (!info.cobro) { RN.descuentos._confirmarEdicion(id, cambios, 'directo'); return; }
  RN.descuentos._elegirAlcanceEdicion(d, cambios, info);
};

/** Pregunta cómo aplicar el cambio cuando el mes actual ya está cobrado. */
RN.descuentos._elegirAlcanceEdicion = function (d, cambios, info) {
  var c = RN.state.clients.find(function (x) { return x.id === d.clienteId; });
  var mes = info.mes;
  var valorViejo = (info.app && info.app.valor != null) ? +info.app.valor : (RN.calc.valorDescuento(d, d.clienteId, mes) || 0);
  var valorNuevo = RN.calc.valorDescuento({ modo: cambios.modo, valor: cambios.valor }, d.clienteId, mes) || 0;
  var r = RN.descuentos._calcularCobroCorregido(info.cobro, valorViejo, valorNuevo);
  var etiquetaPago = { completo: 'completo', parcial: 'parcial (falta ' + RN.calc.formatCUP(r.falta) + ')', excedente: 'con vuelto de ' + RN.calc.formatCUP(r.excedente) };
  var puedeProximo = info.ofreceProximo && cambios.vigencia !== 'unPago';
  RN.descuentos._edicionPend = { id: d.id, cambios: cambios };
  var html =
    '<div class="modal-header"><h3>' + RN.render.esc(RN.calc.mesTexto(mes)) + ' ya fue cobrado</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<p><strong>' + RN.render.esc(c ? c.nombre : '—') + '</strong>: el cobro de este mes' + (info.cobro.reciboNum ? ' (recibo ' + RN.render.esc(info.cobro.reciboNum) + ')' : '') +
        ' incluye este descuento por <strong>' + RN.calc.formatCUP(valorViejo) + '</strong>. Con el cambio sería <strong>' + RN.calc.formatCUP(valorNuevo) + '</strong>.</p>' +
      '<p class="muted">Los meses anteriores no se modifican. ¿Cómo aplico el cambio?</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' +
        '<button class="btn primary" onclick="RN.descuentos._confirmarEdicionPend(\'corregir\')">✏️ Corregir también el cobro de este mes</button>' +
        '<span class="muted" style="font-size:12px">Se cobró por error. El neto del mes pasa de ' + RN.calc.formatCUP(r.netoViejo) + ' a ' + RN.calc.formatCUP(r.netoNuevo) +
          ' y el cobro queda ' + etiquetaPago[r.tipoPago] + '.</span>' +
        (puedeProximo
          ? '<button class="btn" onclick="RN.descuentos._confirmarEdicionPend(\'proximo\')">📅 Solo desde ' + RN.render.esc(RN.calc.mesTexto(RN.calc.mesSiguiente(mes))) + '</button>' +
            '<span class="muted" style="font-size:12px">Este mes queda como se cobró; el valor nuevo rige desde el mes siguiente.</span>'
          : '<span class="muted" style="font-size:12px">Este descuento no continúa el mes próximo, por eso solo se puede corregir el cobro de este mes.</span>') +
      '</div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Volver</button></div>';
  RN.uiComponents.modal(html);
};

RN.descuentos._confirmarEdicionPend = function (opcion) {
  var p = RN.descuentos._edicionPend;
  if (!p) return;
  RN.descuentos._confirmarEdicion(p.id, p.cambios, opcion);
};

/** Ejecuta la edición, guarda, cierra los modales y refresca las vistas. */
RN.descuentos._confirmarEdicion = function (id, cambios, opcion) {
  var res = RN.descuentos.aplicarEdicion(id, cambios, opcion);
  if (!res.ok) { RN.notifyUI.toast(res.error, 'error'); return; }
  RN.descuentos._edicionPend = null;
  RN.storageLocal.guardar();
  // Cierra el selector de alcance y el formulario (modales apilados)
  var guard = 0;
  while (RN.uiComponents._modalStack && RN.uiComponents._modalStack.length && guard++ < 5) RN.uiComponents.cerrarModal();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  var msg;
  if (opcion === 'corregir') {
    msg = 'Descuento editado y cobro de este mes corregido (' + (res.delta >= 0 ? '+' : '−') + RN.calc.formatCUP(Math.abs(res.delta)) + ' al neto)';
  } else if (opcion === 'proximo') {
    msg = 'Descuento editado: rige desde ' + RN.calc.mesTexto(RN.calc.mesSiguiente(RN.calc.mesActualStr()));
  } else {
    msg = 'Descuento editado: rige desde este mes';
  }
  RN.notifyUI.toast(msg, 'success');
};
