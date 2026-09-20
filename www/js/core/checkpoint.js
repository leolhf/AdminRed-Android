/**
 * checkpoint.js — Checkpoints automáticos del estado.
 * Debe cargar antes de undo.js (undo depende de los checkpoints).
 */

RN.checkpoint = RN.checkpoint || {};

const MAX_CHECKPOINTS = 30;

/** Serializa el estado actual (solo datos de negocio, no handles). */
RN.checkpoint.serializar = function () {
  return JSON.stringify({
    clients: RN.state.clients,
    history: RN.state.history,
    gastos: RN.state.gastos,
    depositos: RN.state.depositos,
    retiros: RN.state.retiros,
    inventario: RN.state.inventario,
    asignacionesInventario: RN.state.asignacionesInventario,
    investments: RN.state.investments,
    planes: RN.state.planes,
    equiposRed: RN.state.equiposRed,
    descuentos: RN.state.descuentos,
    snapshots: RN.state.snapshots,
    config: RN.state.config,
    // v5.13.5 (ISSUE #2): Excluir reciboCounter de los snapshots. Antes se
    // incluía y al deshacer un cobro el contador retrocedía, pudiendo reutilizar
    // un número de recibo ya emitido. Ahora reciboCounter es monótono creciente.
    mesActual: RN.state.mesActual,
    esquema: RN.migration.VERSION_ESQUEMA
  });
};

/** Crea un checkpoint y lo empuja al stack. */
RN.checkpoint.crear = function () {
  const snap = RN.checkpoint.serializar();
  const stack = RN.state.checkpoints;
  // Si estamos en medio del stack (se hizo undo), truncar el futuro
  if (RN.state.undoIndex < stack.length - 1) {
    stack.splice(RN.state.undoIndex + 1);
  }
  stack.push(snap);
  if (stack.length > MAX_CHECKPOINTS) stack.shift();
  RN.state.undoIndex = stack.length - 1;
};

/** Restaura un checkpoint por índice. */
RN.checkpoint.restaurar = function (idx) {
  const snap = RN.state.checkpoints[idx];
  if (!snap) return false;
  const data = JSON.parse(snap);
  RN.state.clients = data.clients || [];
  RN.state.history = data.history || [];
  RN.state.gastos = data.gastos || [];
  RN.state.depositos = data.depositos || [];
  RN.state.retiros = data.retiros || [];
  RN.state.inventario = data.inventario || [];
  RN.state.asignacionesInventario = data.asignacionesInventario || [];
  RN.state.investments = data.investments || [];
  RN.state.planes = data.planes || [];
  RN.state.equiposRed = data.equiposRed || [];
  RN.state.descuentos = data.descuentos || [];
  RN.state.snapshots = data.snapshots || [];
  // v5.13.1: Bug #14 — Al restaurar un checkpoint, preservar la tasaUsd y
  // fechaTasaUsd más recientes. Antes, restaurar un snapshot viejo
  // sobreescribía la tasa actual con una tasa desactualizada del checkpoint.
  var tasaActual = RN.state.config.tasaUsd || 0;
  var fechaTasaActual = RN.state.config.fechaTasaUsd || null;
  if (data.config) {
    RN.state.config = data.config;
  }
  // Preservar la tasa más reciente entre la actual y la del checkpoint.
  var tasaSnap = (data.config && data.config.tasaUsd) || 0;
  var fechaTasaSnap = (data.config && data.config.fechaTasaUsd) || null;
  if (fechaTasaActual && (!fechaTasaSnap || fechaTasaActual > fechaTasaSnap)) {
    RN.state.config.tasaUsd = tasaActual;
    RN.state.config.fechaTasaUsd = fechaTasaActual;
  } else if (fechaTasaSnap && !fechaTasaActual) {
    // Si no teníamos tasa pero el snapshot sí, usar la del snapshot.
    RN.state.config.tasaUsd = tasaSnap;
    RN.state.config.fechaTasaUsd = fechaTasaSnap;
  }
  // v5.13.5 (ISSUE #2): reciboCounter ya no se serializa en los snapshots.
  // Mantener el valor actual (monótono creciente) para evitar reutilizar
  // números de recibo al deshacer. Se toma el máximo entre el actual y el del
  // snapshot (por compatibilidad con checkpoints antiguos que sí lo incluían).
  var reciboActual = RN.state.reciboCounter || 0;
  var reciboSnap = data.reciboCounter || 0;
  RN.state.reciboCounter = Math.max(reciboActual, reciboSnap);
  RN.state.mesActual = data.mesActual || RN.calc.mesActualStr();
  RN.state.undoIndex = idx;
  return true;
};
