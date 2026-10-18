/**
 * clientes/lifecycle.js — Baja / reactivación / motivos (v5.53.0 Fase 6).
 */
RN.lifecycle = RN.lifecycle || {};

RN.lifecycle.MOTIVOS_BAJA = [
  'No paga / mora',
  'Se mudó',
  'Cambio de proveedor',
  'Solicitud del cliente',
  'Servicio técnico no viable',
  'Otro'
];

RN.lifecycle.abrirBaja = function (clienteId) {
  var c = RN.calc.clientePorId ? RN.calc.clientePorId(clienteId) : RN.state.clients.find(function (x) { return x.id === clienteId; });
  if (!c) return;
  var opts = RN.lifecycle.MOTIVOS_BAJA.map(function (m) {
    return '<option value="' + RN.render.esc(m) + '">' + RN.render.esc(m) + '</option>';
  }).join('');
  var html = '<div class="modal-header"><h3>Dar de baja — ' + RN.render.esc(c.nombre) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
    '<p class="muted">El cliente quedará inactivo. La deuda pendiente se conserva.</p>' +
    '<div class="form-row"><div><label>Motivo</label><select id="baja-motivo">' + opts + '</select></div></div>' +
    '<div class="form-row"><div><label>Notas (opcional)</label><textarea id="baja-notas" rows="2" lang="es" spellcheck="true" autocorrect="on" autocapitalize="sentences"></textarea></div></div>' +
    '</div><div class="modal-footer">' +
    '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
    '<button class="btn danger" onclick="RN.lifecycle.confirmarBaja(\'' + RN.render.escAttr(c.id) + '\')">Confirmar baja</button></div>';
  RN.uiComponents.modal(html, {});
};

RN.lifecycle.confirmarBaja = function (clienteId) {
  var c = RN.state.clients.find(function (x) { return x.id === clienteId; });
  if (!c) return;
  var motivo = (document.getElementById('baja-motivo') || {}).value || 'Otro';
  var notas = (document.getElementById('baja-notas') || {}).value || '';
  c.activo = false;
  c.fechaBaja = new Date().toISOString();
  c.motivoBaja = motivo;
  c.notasBaja = notas;
  try { RN.storageLocal.guardar(); } catch (e) {}
  RN.uiComponents.cerrarModal();
  if (RN.render && RN.render.todo) RN.render.todo();
  RN.notifyUI.toast(c.nombre + ' dado de baja', 'success');
  try {
    if (RN.cola && RN.cola.comandoEliminar && c.ip) {
      var r = RN.cola.comandoEliminar(c);
      if (r.ok) {
        setTimeout(function () {
          RN.notifyUI.toast('Cola MikroTik: copia el comando de borrado desde Capacidad de red o Terminal', 'info', 5000);
          RN.cola.copiar(r.comando);
        }, 400);
      }
    }
  } catch (e) {}
};

RN.lifecycle.reactivar = function (clienteId) {
  var c = RN.state.clients.find(function (x) { return x.id === clienteId; });
  if (!c) return;
  c.activo = true;
  c.fechaReactivacion = new Date().toISOString();
  try { RN.storageLocal.guardar(); } catch (e) {}
  if (RN.render && RN.render.todo) RN.render.todo();
  RN.notifyUI.toast(c.nombre + ' reactivado', 'success');
};


RN.lifecycle.morosos = function () {
  return (RN.calc.clientesCobrables ? RN.calc.clientesCobrables() : RN.calc.clientesActivos())
    .filter(function (c) {
      try { return RN.calc.getMora(c) > 0; } catch (e) { return false; }
    });
};

RN.lifecycle.filtro = RN.lifecycle.filtro || 'todos'; // todos | 1 | 2plus | sin-tel

RN.lifecycle.setFiltro = function (f) {
  RN.lifecycle.filtro = f || 'todos';
  RN.lifecycle.renderPanel();
};

RN.lifecycle.renderPanel = function () {
  var out = document.getElementById('lifecycle-out');
  if (!out) return;
  var f = RN.calc.formatCUP;
  var morosos = RN.lifecycle.morosos();
  var inactivos = (RN.state.clients || []).filter(function (c) { return c.activo === false; });

  var deudaTotal = 0;
  morosos.forEach(function (c) {
    try { deudaTotal += RN.calc.deudaTotalCliente ? RN.calc.deudaTotalCliente(c) : 0; } catch (e) {}
  });

  var filtro = RN.lifecycle.filtro || 'todos';
  var lista = morosos.filter(function (c) {
    var m = 0;
    try { m = RN.calc.getMora(c) || 0; } catch (e2) { m = 0; }
    if (filtro === '1') return m === 1;
    if (filtro === '2plus') return m >= 2;
    if (filtro === 'sin-tel') return !c.telefono || !String(c.telefono).trim();
    return true;
  });
  // orden: más meses de mora primero
  lista.sort(function (a, b) {
    var ma = RN.calc.getMora(a) || 0, mb = RN.calc.getMora(b) || 0;
    if (mb !== ma) return mb - ma;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');
  });

  var n1 = morosos.filter(function (c) { return (RN.calc.getMora(c) || 0) === 1; }).length;
  var n2 = morosos.filter(function (c) { return (RN.calc.getMora(c) || 0) >= 2; }).length;
  var nSin = morosos.filter(function (c) { return !c.telefono || !String(c.telefono).trim(); }).length;

  var html = '';

  // Resumen
  html += '<div class="ana-zone"><div class="ana-zone-label">Riesgo</div><div class="card">';
  html += '<div class="muted" style="font-size:12px;font-weight:600">Morosos activos</div>';
  html += '<div style="font-size:20px;font-weight:800;margin:4px 0">' + morosos.length + ' <span class="muted" style="font-size:13px;font-weight:500">clientes</span></div>';
  html += '<div class="muted" style="font-size:12px">Deuda estimada ' + f(deudaTotal) + ' · ' + inactivos.length + ' de baja</div>';
  html += '</div>';
  html += '<div class="kpi-grid mt-16">';
  html += '<div class="kpi red"><div class="label">Morosos</div><div class="value">' + morosos.length + '</div></div>';
  html += '<div class="kpi amber"><div class="label">Deuda</div><div class="value" style="font-size:14px">' + f(deudaTotal) + '</div></div>';
  html += '<div class="kpi blue"><div class="label">2+ meses</div><div class="value">' + n2 + '</div></div>';
  html += '<div class="kpi amber"><div class="label">De baja</div><div class="value">' + inactivos.length + '</div></div>';
  html += '</div></div>';

  // Morosos
  html += '<div class="ana-zone"><div class="ana-zone-label">Morosos</div>';
  html += '<div class="chips" style="margin-bottom:10px">';
  [
    { id: 'todos', label: 'Todos', n: morosos.length },
    { id: '1', label: '1 mes', n: n1 },
    { id: '2plus', label: '2+ meses', n: n2 },
    { id: 'sin-tel', label: 'Sin teléfono', n: nSin }
  ].forEach(function (ch) {
    html += '<button type="button" class="chip' + (filtro === ch.id ? ' active' : '') + '" onclick="RN.lifecycle.setFiltro(\'' + ch.id + '\')">' +
      ch.label + ' <span class="chip-n">' + ch.n + '</span></button>';
  });
  html += '</div>';

  if (!lista.length) {
    html += '<div class="card"><p class="muted" style="margin:0">Nadie en este filtro.</p></div>';
  } else {
    lista.forEach(function (c) {
      var m = RN.calc.getMora(c) || 0;
      var deuda = 0;
      try { deuda = RN.calc.deudaTotalCliente ? RN.calc.deudaTotalCliente(c) : 0; } catch (e3) {}
      html += '<div class="ana-row">';
      html += '<div class="ana-row-head"><div><strong>' + RN.render.esc(c.nombre) + '</strong>';
      html += ' <span class="badge due">' + m + ' mes' + (m !== 1 ? 'es' : '') + '</span>';
      html += '<div class="ana-row-sub">Día pago ' + (c.diaPago || 1);
      if (c.telefono) html += ' · ' + RN.render.esc(c.telefono);
      else html += ' · <span class="muted">Sin teléfono</span>';
      html += '</div></div>';
      html += '<div class="amt" style="color:var(--danger)">' + f(deuda) + '</div></div>';
      html += '<div class="ana-row-actions">';
      html += '<button type="button" class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar</button>';
      if (c.telefono) {
        html += '<button type="button" class="btn sm" onclick="RN.whatsapp.enviarRecordatorio(\'' + RN.render.escAttr(c.id) + '\')">WhatsApp</button>';
      }
      html += '<button type="button" class="btn sm" onclick="RN.lifecycle.abrirBaja(\'' + RN.render.escAttr(c.id) + '\')">Dar de baja</button>';
      html += '</div></div>';
    });
  }
  html += '</div>';

  // Bajas
  html += '<div class="ana-zone"><div class="ana-zone-label">Bajas / inactivos</div>';
  if (!inactivos.length) {
    html += '<div class="card"><p class="muted" style="margin:0">Ningún cliente dado de baja.</p></div>';
  } else {
    // motivos count
    var motivos = {};
    inactivos.forEach(function (c) {
      var mot = c.motivoBaja || 'Sin motivo';
      motivos[mot] = (motivos[mot] || 0) + 1;
    });
    var motTxt = Object.keys(motivos).map(function (k) { return k + ' (' + motivos[k] + ')'; }).join(' · ');
    html += '<p class="muted" style="font-size:12px;margin:0 0 8px">Motivos: ' + RN.render.esc(motTxt) + '</p>';
    inactivos.forEach(function (c) {
      html += '<div class="ana-row">';
      html += '<div class="ana-row-head"><div><strong>' + RN.render.esc(c.nombre) + '</strong>';
      if (c.motivoBaja) html += '<div class="ana-row-sub">' + RN.render.esc(c.motivoBaja) + '</div>';
      if (c.fechaBaja) {
        try {
          html += '<div class="ana-row-sub">' + new Date(c.fechaBaja).toLocaleDateString('es-CU') + '</div>';
        } catch (e4) {}
      }
      html += '</div></div>';
      html += '<div class="ana-row-actions">';
      html += '<button type="button" class="btn sm primary" onclick="RN.lifecycle.reactivar(\'' + RN.render.escAttr(c.id) + '\')">Reactivar</button>';
      html += '</div></div>';
    });
  }
  html += '</div>';

  out.innerHTML = html;
};
