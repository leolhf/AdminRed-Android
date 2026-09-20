/**
 * clientes/confirm-delete.js — Confirmación de borrado de cliente.
 */
RN.confirmDelete = RN.confirmDelete || {};

RN.confirmDelete.cliente = function (id) {
  const c = RN.state.clients.find(x => x.id === id);
  if (!c) return;
  const cobros = RN.state.history.filter(h => h.clienteId === id).length;
  RN.uiComponents.confirm(
    'Eliminar cliente',
    `¿Eliminar a "${RN.render.esc(c.nombre)}"? Tiene ${cobros} registro(s) en el historial. Esta acción no se puede deshacer.`,
    () => {
      RN.state.clients = RN.state.clients.filter(x => x.id !== id);
      // mantener historial (referencia histórica) pero quitar descuentos activos
      RN.state.descuentos = RN.state.descuentos.filter(d => d.clienteId !== id);
      RN.storageLocal.guardar();
      RN.render.todo();
      RN.notifyUI.toast('Cliente eliminado', 'warn');
    },
    { danger: true }
  );
};
