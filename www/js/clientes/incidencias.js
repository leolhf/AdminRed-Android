/**
 * clientes/incidencias.js — Tickets v5.55.27
 */
RN.incidencias = RN.incidencias || {};

RN.incidencias._ensure = function () {
  if (!Array.isArray(RN.state.incidencias)) RN.state.incidencias = [];
};

RN.incidencias.PRIORIDADES = ['normal', 'alta', 'baja'];

RN.incidencias.abrirNueva = function (clienteId) {
  RN.incidencias._ensure();
  var clientes = (RN.state.clients || []).filter(function (c) { return c.activo !== false; });
  var opts = clientes.map(function (c) {
    var sel = c.id === clienteId ? ' selected' : '';
    return '<option value="' + RN.render.escAttr(c.id) + '"' + sel + '>' + RN.render.esc(c.nombre) + '</option>';
  }).join('');
  var html = '<div class="modal-header"><h3>Nueva incidencia</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
    '<div class="form-row"><div><label>Cliente</label><select id="inc-cliente">' + opts + '</select></div></div>' +
    '<div class="form-row cols-2">' +
    '<div><label>Tipo</label><select id="inc-tipo">' +
    '<option>Sin internet</option><option>Lento</option><option>Cambiar plan</option>' +
    '<option>Facturación</option><option>Instalación</option><option>Otro</option></select></div>' +
    '<div><label>Prioridad</label><select id="inc-prioridad">' +
    '<option value="normal">Normal</option><option value="alta">Alta</option><option value="baja">Baja</option></select></div>' +
    '</div>' +
    '<div class="form-row"><div><label>Descripción</label><textarea id="inc-desc" rows="3" lang="es" spellcheck="true" autocorrect="on" autocapitalize="sentences"></textarea></div></div>' +
    '</div><div class="modal-footer">' +
    '<button type="button" class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
    '<button type="button" class="btn primary" onclick="RN.incidencias.guardarNueva()">Guardar</button></div>';
  RN.uiComponents.modal(html, {});
};

RN.incidencias.guardarNueva = function () {
  RN.incidencias._ensure();
  var cid = (document.getElementById('inc-cliente') || {}).value;
  var tipo = (document.getElementById('inc-tipo') || {}).value || 'Otro';
  var desc = (document.getElementById('inc-desc') || {}).value || '';
  var pri = (document.getElementById('inc-prioridad') || {}).value || 'normal';
  if (!cid) { RN.notifyUI.toast('Elige un cliente', 'warn'); return; }
  RN.state.incidencias.unshift({
    id: 'inc-' + Date.now().toString(36),
    clienteId: cid,
    tipo: tipo,
    descripcion: desc,
    prioridad: pri,
    estado: 'abierta',
    fecha: new Date().toISOString()
  });
  try { RN.storageLocal.guardar(); } catch (e) {}
  RN.uiComponents.cerrarModal();
  RN.incidencias.render();
  RN.notifyUI.toast('Incidencia registrada', 'success');
};

RN.incidencias.cerrar = function (id) {
  RN.incidencias._ensure();
  var inc = RN.state.incidencias.find(function (x) { return x.id === id; });
  if (!inc) return;
  inc.estado = 'cerrada';
  inc.fechaCierre = new Date().toISOString();
  try { RN.storageLocal.guardar(); } catch (e) {}
  RN.incidencias.render();
  RN.notifyUI.toast('Incidencia cerrada', 'success');
};

RN.incidencias.reabrir = function (id) {
  RN.incidencias._ensure();
  var inc = RN.state.incidencias.find(function (x) { return x.id === id; });
  if (!inc) return;
  inc.estado = 'abierta';
  delete inc.fechaCierre;
  try { RN.storageLocal.guardar(); } catch (e) {}
  RN.incidencias.render();
};

RN.incidencias._fmtFecha = function (iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(iso).slice(0, 16); }
};

RN.incidencias.render = function () {
  var out = document.getElementById('incidencias-out');
  if (!out) return;
  RN.incidencias._ensure();
  var abiertas = RN.state.incidencias.filter(function (i) { return i.estado !== 'cerrada'; });
  var cerradas = RN.state.incidencias.filter(function (i) { return i.estado === 'cerrada'; }).slice(0, 20);
  var altas = abiertas.filter(function (i) { return i.prioridad === 'alta'; }).length;

  // prioridad alta primero
  abiertas.sort(function (a, b) {
    var pa = a.prioridad === 'alta' ? 0 : (a.prioridad === 'normal' ? 1 : 2);
    var pb = b.prioridad === 'alta' ? 0 : (b.prioridad === 'normal' ? 1 : 2);
    if (pa !== pb) return pa - pb;
    return (b.fecha || '').localeCompare(a.fecha || '');
  });

  var html = '';
  html += '<div class="ana-zone"><div class="ana-zone-label">Resumen</div>';
  html += '<div class="kpi-grid">';
  html += '<div class="kpi ' + (abiertas.length ? 'amber' : 'green') + '"><div class="label">Abiertas</div><div class="value">' + abiertas.length + '</div></div>';
  html += '<div class="kpi ' + (altas ? 'red' : 'green') + '"><div class="label">Prioridad alta</div><div class="value">' + altas + '</div></div>';
  html += '<div class="kpi blue"><div class="label">Cerradas (recientes)</div><div class="value">' + cerradas.length + '</div></div>';
  html += '</div></div>';

  html += '<div class="ana-zone"><div class="ana-zone-label">Abiertas</div>';
  if (!abiertas.length) {
    html += '<div class="card"><p class="muted" style="margin:0">No hay incidencias abiertas. <button type="button" class="btn sm" onclick="RN.incidencias.abrirNueva()">+ Nueva</button></p></div>';
  } else {
    abiertas.forEach(function (inc) {
      var c = RN.calc.clientePorId ? RN.calc.clientePorId(inc.clienteId) : null;
      var nom = c ? c.nombre : '(cliente)';
      var priBadge = '';
      if (inc.prioridad === 'alta') priBadge = ' <span class="badge due">Alta</span>';
      else if (inc.prioridad === 'baja') priBadge = ' <span class="badge muted">Baja</span>';
      html += '<div class="ana-row">';
      html += '<div class="ana-row-head"><div><strong>' + RN.render.esc(nom) + '</strong>' + priBadge;
      html += '<div class="ana-row-sub">' + RN.render.esc(inc.tipo) + ' · ' + RN.incidencias._fmtFecha(inc.fecha) + '</div>';
      if (inc.descripcion) html += '<div class="ana-row-sub">' + RN.render.esc(inc.descripcion) + '</div>';
      html += '</div></div>';
      html += '<div class="ana-row-actions">';
      html += '<button type="button" class="btn sm primary" onclick="RN.incidencias.cerrar(\'' + RN.render.escAttr(inc.id) + '\')">Cerrar</button>';
      if (c) html += '<button type="button" class="btn sm" onclick="RN.modalCliente.editar(\'' + RN.render.escAttr(c.id) + '\')">Cliente</button>';
      html += '</div></div>';
    });
  }
  html += '</div>';

  html += '<div class="ana-zone"><div class="ana-zone-label">Cerradas recientes</div>';
  if (!cerradas.length) {
    html += '<div class="card"><p class="muted" style="margin:0">Aún no hay incidencias cerradas.</p></div>';
  } else {
    html += '<details class="card"><summary class="muted" style="cursor:pointer;font-size:13px">Ver ' + cerradas.length + ' cerradas</summary><div style="margin-top:10px">';
    cerradas.forEach(function (inc) {
      var c = RN.calc.clientePorId ? RN.calc.clientePorId(inc.clienteId) : null;
      var nom = c ? c.nombre : '(cliente)';
      html += '<div class="ana-row">';
      html += '<div class="ana-row-head"><div><strong>' + RN.render.esc(nom) + '</strong>';
      html += '<div class="ana-row-sub">' + RN.render.esc(inc.tipo) + ' · cerrada ' + RN.incidencias._fmtFecha(inc.fechaCierre || inc.fecha) + '</div></div></div>';
      html += '<div class="ana-row-actions">';
      html += '<button type="button" class="btn sm" onclick="RN.incidencias.reabrir(\'' + RN.render.escAttr(inc.id) + '\')">Reabrir</button>';
      html += '</div></div>';
    });
    html += '</div></details>';
  }
  html += '</div>';

  out.innerHTML = html;
};
