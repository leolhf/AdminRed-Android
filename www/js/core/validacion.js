/**
 * validacion.js — Validación de integridad de datos antes/después de guardar.
 */
RN.validacion = RN.validacion || {};

/** Valida la integridad del estado. Devuelve { ok, errores: [] }. */
RN.validacion.validar = function () {
  const errores = [];
  const ids = new Set();

  // Clientes
  RN.state.clients.forEach((c, i) => {
    if (!c.id) { errores.push(`Cliente #${i} sin id`); return; }
    if (ids.has(c.id)) errores.push(`Cliente con id duplicado: ${c.id}`);
    ids.add(c.id);
    if (!c.nombre) errores.push(`Cliente ${c.id} sin nombre`);
    if (typeof c.precio !== 'number' && !c.planId) errores.push(`Cliente ${c.id} sin precio ni plan`);
  });

  // Historial
  RN.state.history.forEach((h, i) => {
    if (!h.id) errores.push(`Historial #${i} sin id`);
    if (h.clienteId && !RN.state.clients.find(c => c.id === h.clienteId) && !h.ventaInventario) {
      errores.push(`Historial ${h.id} referencia cliente inexistente ${h.clienteId}`);
    }
  });

  // Descuentos puntuales
  RN.state.descuentos.forEach(d => {
    if (!['afectacion', 'bonificacion', 'ajuste'].includes(d.tipo)) {
      errores.push(`Descuento ${d.id} con tipo inválido: ${d.tipo}`);
    }
    if (!['fijo', 'porcentaje', 'dias'].includes(d.modo)) {
      errores.push(`Descuento ${d.id} con modo inválido: ${d.modo}`);
    }
    // v5.14.4 — Validación del modelo de vigencia (tolera datos legados:
    // si falta `vigencia` se deduce de soloPago, como en los helpers).
    const vig = d.vigencia || (d.soloPago ? 'unPago' : 'meses');
    if (!['meses', 'permanente', 'unPago'].includes(vig)) {
      errores.push(`Descuento ${d.id} con vigencia inválida: ${d.vigencia}`);
    }
    const desde = d.desde || d.mes;
    if (desde && !/^\d{4}-\d{2}$/.test(desde)) {
      errores.push(`Descuento ${d.id} con mes/desde inválido (se espera YYYY-MM): ${desde}`);
    }
    if (vig === 'meses') {
      const n = parseInt(d.durMeses, 10);
      if (!Number.isInteger(n) || n < 1) {
        errores.push(`Descuento ${d.id} con durMeses inválido (entero >= 1): ${d.durMeses}`);
      }
    }
    // D5/R9: el modo 'dias' (afectación proporcional) solo es coherente con
    // vigencia puntual — no con permanentes ni N meses.
    if (d.modo === 'dias' && vig !== 'meses') {
      errores.push(`Descuento ${d.id} con modo 'dias' solo admite vigencia puntual (un mes), no ${vig}`);
    }
    // Coherencia: aplicaciones dentro del rango de vigencia
    if (Array.isArray(d.aplicaciones) && d.aplicaciones.length) {
      d.aplicaciones.forEach(a => {
        if (vig === 'meses' && desde && a.mes) {
          const vence = RN.descuentos.venceEnMes(d);
          if (a.mes < desde || (vence && a.mes > vence)) {
            errores.push(`Descuento ${d.id} con aplicación fuera del rango de vigencia: ${a.mes} (${desde}–${vence || '∞'})`);
          }
        }
        if (a.cobroHid && !RN.state.history.find(h => h.id === a.cobroHid)) {
          errores.push(`Descuento ${d.id} con aplicación que referencia cobro inexistente ${a.cobroHid}`);
        }
      });
    }
  });

  // v5.13.1: Bug #13 — Validación financiera de datos.
  // Detecta valores negativos imposibles y duplicados que corrompen cálculos.

  // Clientes: precios negativos o deuda de equipo negativa
  RN.state.clients.forEach((c, i) => {
    if (typeof c.precio === 'number' && c.precio < 0) {
      errores.push(`Cliente ${c.id} tiene precio negativo: ${c.precio}`);
    }
    if (c.deudaEquipo !== undefined && c.deudaEquipo !== null && +c.deudaEquipo < 0) {
      errores.push(`Cliente ${c.id} tiene deudaEquipo negativa: ${c.deudaEquipo}`);
    }
  });

  // Historial: montos negativos y cobros duplicados (mismo cliente + mes)
  var cobrosVistos = {};
  RN.state.history.forEach((h, i) => {
    if (typeof h.monto === 'number' && h.monto < 0) {
      errores.push(`Historial ${h.id || '#' + i} con monto negativo: ${h.monto}`);
    }
    if (h.montoEquipo !== undefined && +h.montoEquipo < 0) {
      errores.push(`Historial ${h.id || '#' + i} con montoEquipo negativo: ${h.montoEquipo}`);
    }
    // Detectar cobros duplicados: mismo cliente + mismo mes + tipo servicio
    if (h.clienteId && h.mes && (!h.tipo || h.tipo === 'servicio')) {
      var key = h.clienteId + '|' + h.mes;
      if (cobrosVistos[key]) {
        errores.push(`Cobro duplicado: cliente ${h.clienteId} ya tiene cobro de servicio para ${h.mes} (hist ${h.id || '#' + i})`);
      }
      cobrosVistos[key] = true;
    }
  });

  // Gastos: montos negativos
  RN.state.gastos.forEach((g, i) => {
    if (typeof g.monto === 'number' && g.monto < 0) {
      errores.push(`Gasto ${g.id || '#' + i} con monto negativo: ${g.monto}`);
    }
  });

  // Config: tasa USD inválida si tasaAuto está activada
  if (RN.state.config.tasaAuto && (!RN.state.config.tasaUsd || RN.state.config.tasaUsd <= 0)) {
    errores.push('Tasa automática activada pero no hay tasa USD válida configurada');
  }
  if (RN.state.config.tasaUsd !== undefined && RN.state.config.tasaUsd !== null) {
    if (+RN.state.config.tasaUsd < 0) {
      errores.push(`Tasa USD negativa: ${RN.state.config.tasaUsd}`);
    }
  }

  return { ok: errores.length === 0, errores };
};

/**
 * v5.13.4 (Mejora #2) — Ejecuta validar() y muestra el resultado en un modal.
 * Wrapper de UI para que el usuario pueda ver los errores de integridad sin
 * abrir la consola. Se invoca desde Ajustes → Diagnóstico.
 */
RN.validacion.verificar = function () {
  var res = RN.validacion.validar();
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  var color = res.ok ? 'var(--success)' : 'var(--danger)';
  var ico = res.ok ? '\u2705' : '\u26a0\ufe0f';
  var body = res.ok
    ? '<p style="text-align:center;font-weight:700;color:' + color + ';margin:20px 0">' + ico + ' No se detectaron errores de integridad.</p>'
    : '<h4 style="color:var(--danger)">Errores de integridad (' + res.errores.length + ')</h4>' +
      res.errores.map(function (e) {
        return '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:13px">' + esc(e) + '</div>';
      }).join('');
  var html =
    '<div class="modal-header"><h3>\ud83e\uddea Validaci\u00f3n de integridad</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>' +
    '<div class="modal-body">' + body + '</div>' +
    '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>';
  RN.uiComponents.modal(html, { lg: true });
  return res;
};

// v5.11.2: indicador visual de "cambios sin guardar" (punto rojo en header + beforeunload).
// Evita pérdidas accidentales al cerrar la pestaña con cambios sin guardar.
RN.validacion._beforeunloadInstalado = false;

/** Actualiza el punto rojo de "sin guardar" en el header. */
RN.validacion._actualizarPunto = function (sucio) {
  var punto = document.getElementById('dirty-dot');
  if (!punto) {
    // Crear el punto dinámicamente si no existe en el DOM
    var header = document.querySelector('header');
    if (!header) return;
    punto = document.createElement('span');
    punto.id = 'dirty-dot';
    punto.title = 'Tienes cambios sin guardar';
    punto.style.cssText = 'display:none;width:10px;height:10px;border-radius:50%;background:#e53935;margin-left:8px;align-self:center;box-shadow:0 0 6px #e53935;animation:rnpulse 1.4s infinite;';
    header.appendChild(punto);
  }
  punto.style.display = sucio ? 'inline-block' : 'none';
};

/** Instala el aviso beforeunload (una sola vez). */
RN.validacion._instalarBeforeUnload = function () {
  if (RN.validacion._beforeunloadInstalado) return;
  RN.validacion._beforeunloadInstalado = true;
  window.addEventListener('beforeunload', function (e) {
    if (RN.state && RN.state.isDirty) {
      e.preventDefault();
      e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
      return e.returnValue;
    }
  });
};

/** Marca el estado como sucio (cambios sin guardar). */
RN.validacion.marcarSucio = function () {
  RN.state.isDirty = true;
  const btn = document.getElementById('btn-save');
  if (btn) btn.style.background = 'var(--warn)';
  RN.validacion._instalarBeforeUnload();
  RN.validacion._actualizarPunto(true);
};

/** Marca como limpio. */
RN.validacion.marcarLimpio = function () {
  RN.state.isDirty = false;
  const btn = document.getElementById('btn-save');
  if (btn) btn.style.background = '';
  RN.validacion._actualizarPunto(false);
};
