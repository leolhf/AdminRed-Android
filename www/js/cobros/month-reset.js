/**
 * cobros/month-reset.js — Cierre de mes.
 * Resetea el ciclo de cobro mensual, genera snapshot inmutable de KPIs,
 * y anula automáticamente los descuentos puntuales no aplicados de ese mes.
 *
 * v5.13.20: El mes operativo SIEMPRE es el mes real del reloj del sistema.
 * El cierre de mes SOLO genera el snapshot y anula descuentos; NO adelanta
 * el mes operativo (el mes avanza solo cuando cambia el calendario).
 * Se valida que no se cierre dos veces el mismo mes (si ya existe un snapshot
 * del mes actual, se bloquea el cierre).
 */
RN.monthReset = RN.monthReset || {};

RN.monthReset.confirmar = function () {
  var mes = RN.calc.mesActualStr();

  // v5.13.20: Validar que no se haya cerrado ya este mes (doble cierre)
  var yaCerrado = RN.state.snapshots.some(function (s) { return s.mes === mes; });
  if (yaCerrado) {
    RN.notifyUI.toast('El mes de ' + RN.calc.mesTexto(mes) + ' ya fue cerrado. No puedes cerrarlo dos veces.', 'warn', 6000);
    return;
  }

  const snapshot = RN.calc.generarSnapshot(mes);
  // v5.14.4: solo se anulan los PURAMENTE puntuales de este mes (helper
  // esPuntualDeMes). Las bonificaciones permanentes / de N>1 meses / unPago
  // continúan vigentes en meses siguientes y NO se anulan al cierre.
  const sinAplicar = RN.state.descuentos.filter(d => RN.descuentos.esPuntualDeMes(d, mes)).length;
  // v5.14.4: contar bonificaciones que siguen activas más allá del cierre
  const siguenActivas = RN.state.descuentos.filter(d => d.estado !== 'anulado' &&
    !RN.descuentos.esPuntualDeMes(d, mes) && RN.descuentos.vigenteEnMes(d, mes)).length;
  // v5.13.8 (LOG-4): Verificar cobros adelantados del mes siguiente
  var mesSiguiente = RN.calc.mesSiguiente(mes);
  const cobrosAdelantados = RN.state.history.filter(h => h.mes === mesSiguiente).length;
  // v5.13.8 (UI-10): Verificar cobros parciales pendientes del mes actual
  const cobrosParciales = RN.state.history.filter(h => h.mes === mes && h.tipoPago === 'parcial').length;

  // v5.13.8: Construir mensaje con advertencias opcionales
  let advertencias = '';
  if (cobrosAdelantados > 0) {
    advertencias += `\n\n⚠️ Hay ${cobrosAdelantados} cobro(s) adelantado(s) del mes siguiente (${RN.calc.mesTexto(mesSiguiente)}). Estos cobros ya están registrados y no se verán afectados.`;
  }
  if (cobrosParciales > 0) {
    advertencias += `\n\n⚠️ Hay ${cobrosParciales} cliente(s) con pago parcial este mes. Sus saldos pendientes NO se arrastran al mes siguiente (el pago parcial ya quedó en el historial).`;
  }
  // v5.14.4 (R11): avisar que las bonificaciones multi-mes NO se anulan
  if (siguenActivas > 0) {
    advertencias += `\n\nℹ️ Hay ${siguenActivas} bonificación(es) activa(s) que continúan en meses siguientes (no se anulan).`;
  }

  RN.uiComponents.confirm(
    'Cerrar mes — ' + RN.calc.mesTexto(mes),
    `Se generará un snapshot con:\n• Ingresos: ${RN.calc.formatCUP(snapshot.ingresos)}\n• Gastos: ${RN.calc.formatCUP(snapshot.gastos)}\n• Utilidad: ${RN.calc.formatCUP(snapshot.utilidad)}\n• Cobranza: ${snapshot.clientesPagaron}/${snapshot.clientesTotal}\n\nSe anularán ${sinAplicar} descuento(s) puntual(es) de este mes no aplicado(s). Las bonificaciones permanentes o de varios meses NO se anulan.\n\nNota: El mes operativo seguirá siendo ${RN.calc.mesTexto(mes)} (el mes real del sistema). El mes cambiará automáticamente cuando avance el calendario.${advertencias}`,
    () => {
      // 1. Snapshot
      RN.state.snapshots.push(snapshot);
      // 2. Anular SOLO los descuentos puramente puntuales no aplicados del mes
      // v5.14.4: helper esPuntualDeMes — excluye permanentes, N>1 meses y unPago
      // (v5.12.5: los soloPago/unPago pasan al mes siguiente hasta que se usen)
      RN.state.descuentos.forEach(d => {
        if (RN.descuentos.esPuntualDeMes(d, mes)) d.estado = 'anulado';
      });
      // v5.13.20: NO se adelanta el mes operativo. El mes SIEMPRE es el real del reloj.
      // El mes avanzará automáticamente cuando cambie el calendario del sistema.
      // v5.12.4: Aplicar paquete pendiente si existe (cambio guardado para este mes)
      let paqueteAplicadoMsg = '';
      if (RN.state.config.paquetePendiente) {
        const pp = RN.state.config.paquetePendiente;
        RN.state.config.proveedorInternet = pp.proveedor || RN.state.config.proveedorInternet;
        RN.state.config.proveedorMegas = pp.megas;
        RN.state.config.proveedorPrecioMega = pp.precioMega;
        RN.state.config.proveedorMonto = +((pp.megas || 0) * (pp.precioMega || 0)).toFixed(2);
        RN.state.config.sobreventaMegas = pp.sobreventa;
        RN.state.config.paquetePendiente = null;
        paqueteAplicadoMsg = ' Paquete actualizado: ' + pp.megas + 'M × ' + pp.precioMega + ' CUP/M.';
      }
      RN.config.persistir();
      RN.storageLocal.guardar();
      RN.render.todo();
      RN.notifyUI.toast('Snapshot de ' + RN.calc.mesTexto(mes) + ' generado.' + paqueteAplicadoMsg, 'success');
      RN.notify.local('Snapshot generado', RN.calc.mesTexto(mes));
    },
    { danger: true }
  );
};