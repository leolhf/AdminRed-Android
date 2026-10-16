/**
 * clientes/incidencias.js — Tickets simples (v5.53.0 Fase 7).
 * Persistidos en RN.state.incidencias[]
 */
RN.incidencias = RN.incidencias || {};

RN.incidencias._ensure = function () {
  if (!Array.isArray(RN.state.incidencias)) RN.state.incidencias = [];
};

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
    '<div class="form-row"><div><label>Tipo</label><select id="inc-tipo">' +
    '<option>Sin internet</option><option>Lento</option><option>Cambiar plan</option>' +
    '<option>Facturación</option><option>Instalación</option><option>Otro</option></select></div></div>' +
    '<div class="form-row"><div><label>Descripción</label><textarea id="inc-desc" rows="3"></textarea></div></div>' +
    '</div><div class="modal-footer">' +
    '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
    '<button class="btn primary" onclick="RN.incidencias.guardarNueva()">Guardar</button></div>';
  RN.uiComponents.modal(html, {});
};

RN.incidencias.guardarNueva = function () {
  RN.incidencias._ensure();
  var cid = (document.getElementById('inc-cliente') || {}).value;
  var tipo = (document.getElementById('inc-tipo') || {}).value || 'Otro';
  var desc = (document.getElementById('inc-desc') || {}).value || '';
  if (!cid) { RN.notifyUI.toast('Elige un cliente', 'warn'); return; }
  RN.state.incidencias.unshift({
    id: 'inc-' + Date.now().toString(36),
    clienteId: cid,
    tipo: tipo,
    descripcion: desc,
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
};

RN.incidencias.render = function () {
  var out = document.getElementById('incidencias-out');
  if (!out) return;
  RN.incidencias._ensure();
  var abiertas = RN.state.incidencias.filter(function (i) { return i.estado !== 'cerrada'; });
  var html = '<div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:8px">' +
    '<h3 style="margin:0">Incidencias abiertas</h3>' +
    '<button class="btn sm primary" onclick="RN.incidencias.abrirNueva()">+ Nueva</button></div>';
  if (!abiertas.length) {
    html += '<p class="muted">No hay incidencias abiertas.</p>';
  } else {
    html += '<ul class="lista-simple">';
    abiertas.forEach(function (inc) {
      var c = RN.calc.clientePorId ? RN.calc.clientePorId(inc.clienteId) : null;
      var nom = c ? c.nombre : inc.clienteId;
      html += '<li><strong>' + RN.render.esc(nom) + '</strong> · ' + RN.render.esc(inc.tipo) +
        (inc.descripcion ? '<br><span class="muted">' + RN.render.esc(inc.descripcion) + '</span>' : '') +
        ' <button class="btn sm" onclick="RN.incidencias.cerrar(\'' + RN.render.escAttr(inc.id) + '\')">Cerrar</button></li>';
    });
    html += '</ul>';
  }
  out.innerHTML = html;
};
