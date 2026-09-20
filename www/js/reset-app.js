/**
 * reset-app.js — Reseteo completo de la app.
 */
RN.resetApp = RN.resetApp || {};

RN.resetApp.confirmar = function () {
  // v5.13.5 (ISSUE #25): Documentar que la configuración (tasa USD, proveedor,
  // fondo de caja, días de gracia, etc.) se MANTIENE tras el reset. Solo se
  // borran los datos de negocio (clientes, cobros, gastos, inventario, etc.).
  // Esto es intencional: el usuario no tiene que reconfigurar la app al resetear.
  RN.uiComponents.confirm(
    '¿Resetear toda la app?',
    'Se borrarán TODOS los clientes, cobros, gastos, inventario e inversiones. Esta acción no se puede deshacer.\n\nLa configuración (tasa USD, proveedor, fondo de caja) se mantendrá.',
    () => {
      RN.state.clients = [];
      RN.state.history = [];
      RN.state.gastos = [];
      RN.state.depositos = [];
      RN.state.retiros = [];
      RN.state.inventario = [];
      RN.state.asignacionesInventario = [];
      RN.state.investments = [];
      RN.state.planes = [];
      RN.state.equiposRed = [];
      RN.state.descuentos = [];
      RN.state.snapshots = [];
      RN.state.reciboCounter = 0;
      RN.state.mesActual = RN.calc.mesActualStr();
      RN.state.checkpoints = [];
      RN.state.undoIndex = -1;
      // NOTA: RN.state.config se preserva intencionalmente (tasa, proveedor, etc.)
      localStorage.removeItem(STORAGE_KEYS.DATA);
      RN.storageLocal.guardar();  // v5.13.5: persistir el estado reseteado (con config intacta)
      RN.render.todo();
      RN.notifyUI.toast('App reseteada (configuración preservada)', 'warn');
    },
    { danger: true }
  );
};
