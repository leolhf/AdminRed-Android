/**
 * core/auditoria.js — Panel de auditoría financiera (Mejora #2, auditoría v5.13.0).
 *
 * Verifica la coherencia interna de los datos financieros para detectar
 * silenciosamente inconsistencias que los cálculos normales no revelan:
 *
 *   1. Que la suma de (h.monto + h.montoEquipo) por mes coincida con
 *      RN.calc.ingresosMes(mes) para cada mes con cobros.
 *   2. Que las deudas de equipo sean coherentes: 0 <= deudaEquipo <=
 *      deudaEquipoOriginal (no negativas, no mayores al original).
 *   3. Que no haya cobros con montos negativos ni con campos inválidos.
 *   4. Que los snapshots mensuales coincidan razonablemente con los datos
 *      reales recalculados del mes (ingresos, gastos, utilidad).
 *   5. Que los clientes marcados como 'paid' realmente hayan pagado el neto.
 *   6. Que no haya cobros de servicio duplicados (mismo cliente + mes) que
 *      pudieran inflar ingresos.
 *
 * La auditoría no modifica datos; solo reporta. La UI la invoca bajo
 * demanda desde Ajustes → Diagnóstico.
 */
RN.auditoria = RN.auditoria || {};

/* ============================================================
 * v5.15 — Registro de eventos de bonificaciones/descuentos
 * (trazabilidad para el "mejor control" de la mudanza A+C).
 * No modifica datos: solo deja constancia de quién/cuándo/qué.
 * ============================================================ */

/** Máximo de eventos conservados (se recorta la más vieja). */
RN.auditoria.EVENTOS_MAX = 200;

/**
 * Registra un evento de trazabilidad en RN.state.eventos.
 * @param {string} tipo_evento  'descuento_crear' | 'descuento_anular'
 * @param {object} detalle      Datos del descuento afectado.
 */
RN.auditoria.logEvento = function (tipo_evento, detalle) {
  try {
    RN.state.eventos = RN.state.eventos || [];
    var c = detalle && detalle.clienteId ? RN.calc.clientePorId(detalle.clienteId) : null;
    RN.state.eventos.push({
      fecha: new Date().toISOString(),
      tipo_evento: tipo_evento,
      id: detalle ? detalle.id : null,
      clienteId: detalle ? detalle.clienteId : null,
      cliente: c ? c.nombre : null,
      tipo: detalle ? detalle.tipo : null,
      modo: detalle ? detalle.modo : null,
      valor: detalle ? detalle.valor : null,
      vigencia: detalle ? detalle.vigencia : null,
      durMeses: detalle ? detalle.durMeses : null,
      motivo: detalle ? detalle.motivo : null
    });
    if (RN.state.eventos.length > RN.auditoria.EVENTOS_MAX) {
      RN.state.eventos = RN.state.eventos.slice(-RN.auditoria.EVENTOS_MAX);
    }
  } catch (e) {
    /* la trazabilidad nunca debe romper el flujo de negocio */
  }
};

/**
 * v5.15 — HTML con los últimos eventos de descuentos/bonificaciones
 * (máx. 10, del más reciente al más viejo), para el modal de auditoría.
 */
RN.auditoria._htmlEventosDescuentos = function () {
  var evs = (RN.state.eventos || []).filter(function (e) {
    return e.tipo_evento === 'descuento_crear' || e.tipo_evento === 'descuento_anular';
  }).slice(-10).reverse();
  if (!evs.length) return '';
  var filas = evs.map(function (e) {
    var cuando = (e.fecha || '').slice(0, 16).replace('T', ' ');
    var cliente = e.cliente || e.clienteId || '—';
    var accion = e.tipo_evento === 'descuento_crear' ? '➕ Creó' : '🗑️ Anuló';
    var vigTxt = e.vigencia === 'permanente' ? 'permanente'
      : (e.vigencia === 'unPago' ? '1 solo pago'
      : (e.vigencia === 'meses' ? ((e.durMeses || 1) + ' mes(es)') : '—'));
    return '<div style="font-size:12px;padding:6px 10px;border-bottom:1px dashed var(--border)">' +
      '<strong>' + accion + '</strong> ' + String(cliente) + ' · ' + String(e.tipo || '') +
      ' · ' + String(e.modo || '') + ' ' + String(e.valor != null ? e.valor : '') +
      ' · ' + vigTxt + '<br><span class="muted">' + cuando +
      (e.motivo ? ' · "' + String(e.motivo).slice(0, 40) + '"' : '') + '</span></div>';
  }).join('');
  return '<h4 style="color:var(--primary);margin-top:16px">Últimos eventos de bonificaciones/descuentos</h4>' +
    '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">' + filas + '</div>';
};

/**
 * Ejecuta todas las verificaciones de coherencia financiera.
 * @returns {object} { ok: boolean, total: number, errores: [], avisos: [] }
 *   - errores: problemas que indican datos inconsistentes (rojo).
 *   - avisos:  anomalías menores o advertencias (ámbar).
 */
RN.auditoria.verificarCoherencia = function () {
  var errores = [];
  var avisos = [];
  var state = RN.state || {};
  var history = state.history || [];
  var gastos = state.gastos || [];
  var clients = state.clients || [];
  var snapshots = state.snapshots || [];

  // ---- 1. Montos negativos en historial ----
  history.forEach(function (h, i) {
    if (typeof h.monto === 'number' && h.monto < 0) {
      errores.push('Cobro #' + (h.id || i) + ' (cliente ' + (h.clienteId || '?') +
        ', mes ' + (h.mes || '?') + ') tiene monto negativo: ' + h.monto);
    }
    if (typeof h.montoEquipo === 'number' && h.montoEquipo < 0) {
      errores.push('Cobro #' + (h.id || i) + ' tiene montoEquipo negativo: ' + h.montoEquipo);
    }
  });

  // ---- 2. Coherencia de deudas de equipo ----
  clients.forEach(function (c) {
    if (c.deudaEquipo !== undefined && c.deudaEquipo !== null) {
      var d = +c.deudaEquipo;
      var orig = +(c.deudaEquipoOriginal || d);
      if (d < 0) {
        errores.push('Cliente ' + (c.nombre || c.id) + ' tiene deudaEquipo negativa: ' + d);
      }
      if (orig > 0 && d > orig + 0.01) {
        errores.push('Cliente ' + (c.nombre || c.id) + ' tiene deudaEquipo (' + d +
          ') mayor que el original (' + orig + ')');
      }
    }
  });

  // ---- 3. Coherencia ingresosMes vs suma de cobros por mes ----
  // Recalcular por mes y comparar con ingresosMes() (que usa el mismo filtro).
  var mesesConCobros = {};
  history.forEach(function (h) {
    if (h.mes) mesesConCobros[h.mes] = true;
  });
  Object.keys(mesesConCobros).forEach(function (mes) {
    var sumaDirecta = history
      .filter(function (h) { return h.mes === mes; })
      .reduce(function (s, h) { return s + (h.monto || 0) + (h.montoEquipo || 0); }, 0);
    var viaFuncion = RN.calc.ingresosMes(mes);
    if (Math.abs(sumaDirecta - viaFuncion) > 0.01) {
      errores.push('Ingresos del mes ' + mes + ' incoherentes: suma directa=' +
        sumaDirecta + ' vs ingresosMes()=' + viaFuncion);
    }
  });

  // ---- 4. Cobros de servicio duplicados (mismo cliente + mes) ----
  var vistos = {};
  history.forEach(function (h) {
    if (h.tipo !== 'servicio') return;
    var key = (h.clienteId || '?') + '|' + (h.mes || '?');
    if (vistos[key]) {
      avisos.push('Cobro de servicio duplicado para cliente ' + (h.clienteId || '?') +
        ' en mes ' + (h.mes || '?') + ' (puede inflar ingresos o marcar paid erróneamente)');
    }
    vistos[key] = true;
  });

  // ---- 5. Snapshots vs datos reales recalculados ----
  snapshots.forEach(function (snap) {
    if (!snap || !snap.mes) return;
    var ingReal = RN.calc.ingresosMes(snap.mes);
    var gasReal = RN.calc.gastosMes(snap.mes);
    // Tolerancia: snapshots son inmutables y pueden haberse tomado antes de
    // ediciones posteriores del mismo mes, pero una discrepancia grande indica
    // que el snapshot no refleja la realidad final del mes.
    var tolIng = Math.max(1, Math.abs(ingReal) * 0.05);
    var tolGas = Math.max(1, Math.abs(gasReal) * 0.05);
    if (typeof snap.ingresos === 'number' && Math.abs(snap.ingresos - ingReal) > tolIng) {
      avisos.push('Snapshot del mes ' + snap.mes + ': ingresos=' + snap.ingresos +
        ' pero reales=' + ingReal + ' (discrepancia > 5%)');
    }
    if (typeof snap.gastos === 'number' && Math.abs(snap.gastos - gasReal) > tolGas) {
      avisos.push('Snapshot del mes ' + snap.mes + ': gastos=' + snap.gastos +
        ' pero reales=' + gasReal + ' (discrepancia > 5%)');
    }
  });

  // ---- 6. Clientes 'paid' que no cubren el neto esperado ----
  var mesActual = RN.calc.mesActualStr();
  clients.forEach(function (c) {
    if (!c.activo) return;
    if (RN.calc.getStatus(c) !== 'paid') return;
    var netoEsperado = RN.calc.getPrecioNeto(c, mesActual);
    var cobrosMes = history.filter(function (h) {
      return h.clienteId === c.id && h.tipo === 'servicio' && h.mes === mesActual;
    });
    var totalServicio = cobrosMes.reduce(function (s, h) { return s + (h.monto || 0); }, 0);
    if (totalServicio < netoEsperado - 0.01) {
      avisos.push('Cliente ' + (c.nombre || c.id) + ' marcado como "paid" pero solo pagó ' +
        totalServicio + ' de ' + netoEsperado + ' (mes ' + mesActual + ')');
    }
  });

  // ---- 7. Gastos con montos negativos o sin mes ----
  gastos.forEach(function (g, i) {
    if (typeof g.monto === 'number' && g.monto < 0) {
      errores.push('Gasto #' + (g.id || i) + ' tiene monto negativo: ' + g.monto);
    }
    if (!g.mes) {
      avisos.push('Gasto #' + (g.id || i) + ' sin mes asignado (no se contabiliza en gastosMes)');
    }
  });

  // ---- 8. Tasa USD sin fecha o inválida ----
  var cfg = state.config || {};
  if (cfg.tasaUsd && (cfg.tasaUsd < 1 || cfg.tasaUsd > 100000)) {
    errores.push('Tasa USD fuera de rango realista: ' + cfg.tasaUsd + ' (debe estar entre 1 y 100000)');
  }
  if (cfg.tasaUsd && !cfg.fechaTasaUsd) {
    avisos.push('Tasa USD configurada pero sin fechaTasaUsd (no se puede saber si está desactualizada)');
  }

  return {
    ok: errores.length === 0,
    total: errores.length + avisos.length,
    errores: errores,
    avisos: avisos
  };
};

/**
 * Abre un modal con el resultado de la auditoría financiera.
 * Versión amigable para el usuario: lista errores en rojo y avisos en ámbar.
 */
RN.auditoria.mostrar = function () {
  var res = RN.auditoria.verificarCoherencia();

  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var colorEstado = res.ok ? 'var(--success)' : 'var(--danger)';
  var icoEstado = res.ok ? '\u2705' : '\u26a0\ufe0f';
  var txtEstado = res.ok
    ? 'No se detectaron errores. Los datos financieros son coherentes.'
    : (res.errores.length + ' error(es) y ' + res.avisos.length + ' aviso(s) encontrados.');

  var erroresHtml = res.errores.length
    ? '<h4 style="color:var(--danger);margin-top:16px">Errores (' + res.errores.length + ')</h4>' +
      res.errores.map(function (e) {
        return '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:13px">' + esc(e) + '</div>';
      }).join('')
    : '<p class="muted" style="margin-top:16px">No hay errores.</p>';

  var avisosHtml = res.avisos.length
    ? '<h4 style="color:var(--warn);margin-top:16px">Avisos (' + res.avisos.length + ')</h4>' +
      res.avisos.map(function (a) {
        return '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:13px">' + esc(a) + '</div>';
      }).join('')
    : '<p class="muted" style="margin-top:12px">No hay avisos.</p>';

  var html =
    '<div class="modal-header"><h3>\ud83d\udd0d Auditor\u00eda financiera</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>' +
    '<div class="modal-body">' +
      '<div style="text-align:center;padding:16px 0">' +
        '<div style="font-size:40px">' + icoEstado + '</div>' +
        '<p style="font-weight:700;color:' + colorEstado + ';margin-top:8px">' + esc(txtEstado) + '</p>' +
      '</div>' +
      '<p class="muted" style="font-size:12px">Verifica: montos no negativos, coherencia de deudas de equipo, ingresos por mes vs funci\u00f3n, cobros duplicados, snapshots vs datos reales, clientes "paid" que cubren el neto, gastos sin mes, y tasa USD v\u00e1lida.</p>' +
      erroresHtml + avisosHtml +
      RN.auditoria._htmlEventosDescuentos() +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.auditoria.mostrar()">Volver a verificar</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};
