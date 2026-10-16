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
    '<div class="form-row"><div><label>Notas (opcional)</label><textarea id="baja-notas" rows="2"></textarea></div></div>' +
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
  return (RN.calc.clientesCobrables || RN.calc.clientesActivos)().filter(function (c) {
    return !c.esAdmin && RN.calc.getMora(c) > 0;
  });
};

RN.lifecycle.renderPanel = function () {
  var out = document.getElementById('lifecycle-out');
  if (!out) return;
  var f = RN.calc.formatCUP;
  var morosos = RN.lifecycle.morosos();
  var inactivos = (RN.state.clients || []).filter(function (c) { return c.activo === false; });
  var html = '<h3 style="margin-top:0">Morosos activos</h3>';
  if (!morosos.length) html += '<p class="muted">Nadie en mora.</p>';
  else {
    html += '<ul class="lista-simple">';
    morosos.forEach(function (c) {
      var m = RN.calc.getMora(c);
      html += '<li><strong>' + RN.render.esc(c.nombre) + '</strong> · ' + m + ' mes(es) · ' +
        f(RN.calc.deudaTotalCliente(c)) +
        ' <button class="btn sm" onclick="RN.lifecycle.abrirBaja(\'' + RN.render.escAttr(c.id) + '\')">Dar de baja</button></li>';
    });
    html += '</ul>';
  }
  html += '<h3>Inactivos</h3>';
  if (!inactivos.length) html += '<p class="muted">Ningún cliente dado de baja.</p>';
  else {
    html += '<ul class="lista-simple">';
    inactivos.forEach(function (c) {
      html += '<li><strong>' + RN.render.esc(c.nombre) + '</strong>' +
        (c.motivoBaja ? ' · ' + RN.render.esc(c.motivoBaja) : '') +
        ' <button class="btn sm primary" onclick="RN.lifecycle.reactivar(\'' + RN.render.escAttr(c.id) + '\')">Reactivar</button></li>';
    });
    html += '</ul>';
  }
  out.innerHTML = html;
};
