/**
 * undo.js — Deshacer / rehacer sobre los checkpoints.
 * Depende de checkpoint.js.
 */

RN.undo = RN.undo || {};

RN.undo.deshacer = function () {
  if (RN.state.undoIndex <= 0) {
    RN.notifyUI.toast('No hay nada que deshacer', 'info');
    return;
  }
  RN.checkpoint.restaurar(RN.state.undoIndex - 1);
  RN.storageLocal.persistir();
  RN.render.todo();
  RN.notifyUI.toast('Deshecho', 'info');
};

RN.undo.rehacer = function () {
  if (RN.state.undoIndex >= RN.state.checkpoints.length - 1) {
    RN.notifyUI.toast('No hay nada que rehacer', 'info');
    return;
  }
  RN.checkpoint.restaurar(RN.state.undoIndex + 1);
  RN.storageLocal.persistir();
  RN.render.todo();
  RN.notifyUI.toast('Rehecho', 'info');
};

RN.undo.puedeDeshacer = function () { return RN.state.undoIndex > 0; };
RN.undo.puedeRehacer = function () { return RN.state.undoIndex < RN.state.checkpoints.length - 1; };
