/**
 * paquete/modal-paquete.js — Gestión de planes/paquetes de servicio (CRUD).
 */
RN.modalPaquete = RN.modalPaquete || {};

RN.modalPaquete.abrir = function () {
  const planes = RN.state.planes;
  const rows = planes.length ? planes.map(p => `<tr>
    <td><strong>${RN.render.esc(p.nombre)}</strong></td>
    <td>${p.megas} Mbps</td>
    <td>${RN.calc.formatCUP(p.precio)}</td>
    <td>${p.precio && p.megas ? (p.precio / p.megas).toFixed(2) + ' CUP/M' : '—'}</td>
    <td><button class="btn sm" onclick="RN.modalPaquete.editar('${p.id}')">Editar</button>
        <button class="btn sm danger" onclick="RN.modalPaquete.eliminar('${p.id}')">🗑</button></td>
  </tr>`).join('') : '<tr><td colspan="5"><div class="empty">Sin planes. Crea el primero.</div></td></tr>';

  const html = `
    <div class="modal-header"><h3>Planes de servicio</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="table-wrap mb-16"><table><thead><tr><th>Nombre</th><th>Megas</th><th>Precio</th><th>Precio/M</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted)">Nuevo plan</h3>
      <div class="form-row cols-3">
        <div><label>Nombre *</label><input id="pl-nombre" placeholder="Ej: Hogar 10M"></div>
        <div><label>Megas (Mbps) *</label><input id="pl-megas" type="number" value="10"></div>
        <div><label>Precio (CUP) *</label><input id="pl-precio" type="number" step="0.01" value="0"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn primary" onclick="RN.modalPaquete.guardar()">Guardar plan</button>
    </div>`;
  RN.uiComponents.modal(html);
  RN.modalPaquete._editId = null;
};

RN.modalPaquete.editar = function (id) {
  const p = RN.state.planes.find(x => x.id === id);
  if (!p) return;
  RN.modalPaquete._editId = id;
  document.getElementById('pl-nombre').value = p.nombre;
  document.getElementById('pl-megas').value = p.megas;
  document.getElementById('pl-precio').value = p.precio;
};

RN.modalPaquete.guardar = function () {
  const nombre = document.getElementById('pl-nombre').value.trim();
  if (!nombre) { RN.notifyUI.toast('El nombre es obligatorio', 'error'); return; }
  const megas = parseInt(document.getElementById('pl-megas').value, 10) || 0;
  const precio = parseFloat(document.getElementById('pl-precio').value) || 0;
  const id = RN.modalPaquete._editId;
  if (id) {
    Object.assign(RN.state.planes.find(x => x.id === id), { nombre, megas, precio });
  } else {
    RN.state.planes.push({ id: RN.calc.uid('plan'), nombre, megas, precio });
  }
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(id ? 'Plan actualizado' : 'Plan creado', 'success');
};

RN.modalPaquete.eliminar = function (id) {
  const usados = RN.state.clients.filter(c => c.planId === id).length;
  if (usados) { RN.notifyUI.toast(`${usados} cliente(s) usan este plan. Reasigna antes de eliminar.`, 'warn'); return; }
  RN.uiComponents.confirm('Eliminar plan', '¿Eliminar este plan de servicio?', () => {
    RN.state.planes = RN.state.planes.filter(x => x.id !== id);
    RN.storageLocal.guardar();
    RN.modalPaquete.abrir();
    RN.notifyUI.toast('Plan eliminado', 'warn');
  }, { danger: true });
};
