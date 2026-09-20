/**
 * cobros/cuadre.js — Cuadre de caja.
 * v5.14.0: Permite introducir el saldo real contado físicamente y registra
 * automáticamente la diferencia contra el saldo calculado por la app.
 *
 * Decisión de diseño (ver recomendacion_cuadre_caja.txt):
 *   La diferencia NUNCA se mezcla con "Gasto personal" ni con "Retiro de
 *   caja". Se usa una categoría dedicada "Descuadre de caja" para mantener
 *   trazabilidad y permitir detectar patrones (ej: descuadres recurrentes).
 *
 * Se registra como un movimiento en RN.state.gastos, igual que los retiros
 * de caja (ver caja.js), reutilizando gastosTotales()/fondoCaja():
 *   - Faltante (real < calculado): gasto normal, monto positivo. Resta del fondo.
 *   - Sobrante (real > calculado): "gasto" con monto NEGATIVO. Al sumarse a
 *     gastosTotales() con signo negativo, efectivamente SUMA al fondo — es
 *     el ingreso de ajuste que describe la recomendación, sin necesitar un
 *     segundo modelo de datos para "ingresos sueltos" (los ingresos reales
 *     solo existen ligados a un cliente en RN.state.history).
 *
 * Funciones publicas:
 *   RN.cuadre.abrir()     — abre el modal para cuadrar la caja
 *   RN.cuadre.guardar()   — calcula la diferencia y la registra
 *   RN.cuadre.listar()    — historial de cuadres realizados
 *   RN.cuadre.eliminar()  — elimina un cuadre (si el usuario se equivocó al contar)
 */
RN.cuadre = RN.cuadre || {};

/** Categoría dedicada — nunca se mezcla con "Gasto personal" ni "Retiro de caja". */
RN.cuadre.CATEGORIA = 'Descuadre de caja';

/**
 * Abre el modal de cuadre de caja. Muestra el saldo calculado por la app
 * y permite introducir el saldo real contado físicamente.
 */
RN.cuadre.abrir = function () {
  var calculado = RN.calc.fondoCaja();

  var html = `
    <div class="modal-header">
      <h3>🧮 Cuadre de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi muted" style="margin-bottom:16px">
        <div class="label">Saldo calculado por la app</div>
        <div class="value">${RN.calc.formatCUP(calculado)}</div>
        <div class="sub">Saldo inicial + ingresos − gastos</div>
      </div>
      <div class="form-row">
        <div>
          <label>Saldo real contado (CUP) *</label>
          <input id="cuadre-real" type="number" step="0.01" placeholder="0.00"
                 oninput="RN.cuadre._recalcular(${calculado})">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Nota (opcional)</label>
          <input id="cuadre-nota" placeholder="Ej: Cuadre semanal, arqueo de fin de mes...">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Fecha</label>
          <input id="cuadre-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div id="cuadre-resultado" style="margin-top:8px"></div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.cuadre.guardar(${calculado})" id="cuadre-btn-guardar" disabled style="opacity:0.5;cursor:not-allowed">
        🧮 Registrar cuadre
      </button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * Recalcula en tiempo real la diferencia entre el saldo real introducido
 * y el saldo calculado, mostrando si hay faltante, sobrante o cuadre exacto.
 */
RN.cuadre._recalcular = function (calculado) {
  var input = document.getElementById('cuadre-real');
  var resultado = document.getElementById('cuadre-resultado');
  var btn = document.getElementById('cuadre-btn-guardar');
  if (!input || !resultado) return;

  if (input.value === '') {
    resultado.innerHTML = '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
    return;
  }

  var real = parseFloat(input.value) || 0;
  var diferencia = +(real - calculado).toFixed(2);

  if (Math.abs(diferencia) < 0.01) {
    resultado.innerHTML = '<span class="badge ok">✓ Cuadre exacto — no hay diferencia que registrar</span>';
  } else if (diferencia < 0) {
    resultado.innerHTML = '<span class="badge due">⚠️ Faltante: ' + RN.calc.formatCUP(Math.abs(diferencia)) +
      '. Se registrará como gasto (categoría "' + RN.cuadre.CATEGORIA + '").</span>';
  } else {
    resultado.innerHTML = '<span class="badge ok">💰 Sobrante: ' + RN.calc.formatCUP(diferencia) +
      '. Se registrará como ingreso de ajuste (categoría "' + RN.cuadre.CATEGORIA + '").</span>';
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
};

/**
 * Calcula la diferencia y la guarda como movimiento de caja.
 * Si el cuadre es exacto (diferencia ~0), no registra nada.
 */
RN.cuadre.guardar = function (calculado) {
  var realInput = document.getElementById('cuadre-real');
  if (!realInput || realInput.value === '') {
    RN.notifyUI.toast('Introduce el saldo real contado', 'error');
    return;
  }
  var real = parseFloat(realInput.value) || 0;
  var diferencia = +(real - calculado).toFixed(2);
  var nota = document.getElementById('cuadre-nota').value.trim();
  var fecha = document.getElementById('cuadre-fecha').value || new Date().toISOString().slice(0, 10);
  var fechaISO = fecha + 'T00:00:00';
  var mes = fecha.slice(0, 7);

  if (Math.abs(diferencia) < 0.01) {
    RN.uiComponents.cerrarModal();
    RN.notifyUI.toast('Cuadre exacto — no había diferencia que registrar', 'success');
    return;
  }

  var esFaltante = diferencia < 0;
  var concepto = nota || (esFaltante ? 'Faltante de caja' : 'Sobrante de caja');

  RN.state.gastos.push({
    id: RN.calc.uid('cuadre'),
    concepto: concepto,
    // Faltante: monto positivo (resta del fondo, como cualquier gasto).
    // Sobrante: monto negativo (al sumarse a gastosTotales() con signo
    // negativo, efectivamente suma al fondo de caja).
    monto: esFaltante ? Math.abs(diferencia) : -Math.abs(diferencia),
    categoria: RN.cuadre.CATEGORIA,
    esCuadreCaja: true,
    tipoCuadre: esFaltante ? 'faltante' : 'sobrante',
    saldoCalculado: calculado,
    saldoReal: real,
    fecha: fechaISO,
    mes: mes
  });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(
    (esFaltante ? 'Faltante registrado: ' : 'Sobrante registrado: ') + RN.calc.formatCUP(Math.abs(diferencia)),
    esFaltante ? 'warn' : 'success'
  );
};

/**
 * Suma total de faltantes menos sobrantes (dinero neto perdido por descuadres).
 */
RN.cuadre.totalNeto = function () {
  return RN.state.gastos
    .filter(function (g) { return g.esCuadreCaja; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/**
 * Muestra el historial de cuadres de caja realizados.
 */
RN.cuadre.listar = function () {
  var cuadres = RN.state.gastos
    .filter(function (g) { return g.esCuadreCaja; })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var totalNeto = RN.cuadre.totalNeto();

  var filas = cuadres.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay cuadres registrados</p>'
    : cuadres.map(function (c) {
        var fecha = new Date(c.fecha).toLocaleDateString('es-CU');
        var esFaltante = c.tipoCuadre === 'faltante';
        var signo = esFaltante ? '-' : '+';
        var color = esFaltante ? 'var(--red,#dc2626)' : 'var(--green,#16a34a)';
        var badge = esFaltante
          ? '<span class="badge due">Faltante</span>'
          : '<span class="badge ok">Sobrante</span>';
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(c.concepto) + '</td>' +
          '<td>' + badge + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:' + color + '">' + signo + RN.calc.formatCUP(Math.abs(c.monto)) + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.cuadre.eliminar(\'' + RN.render.escAttr(c.id) + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html = `
    <div class="modal-header">
      <h3>🧮 Historial de cuadres de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi ${totalNeto > 0 ? 'red' : (totalNeto < 0 ? 'green' : 'muted')}" style="margin-bottom:16px">
        <div class="label">Total neto por descuadres</div>
        <div class="value">${RN.calc.formatCUP(Math.abs(totalNeto))}</div>
        <div class="sub">${totalNeto > 0 ? 'Perdido en faltantes' : (totalNeto < 0 ? 'A favor por sobrantes' : 'Sin diferencias netas')} · ${cuadres.length} cuadre(s)</div>
      </div>
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Tipo</th>
            <th style="text-align:right">Monto</th>
            <th style="text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.cuadre.abrir()">🧮 Nuevo cuadre</button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * Elimina un cuadre de caja del historial (ej: error al contar).
 */
RN.cuadre.eliminar = function (id) {
  RN.uiComponents.confirm('Eliminar cuadre', '¿Eliminar este cuadre de caja? El fondo de caja volverá a su valor anterior.', function () {
    RN.state.gastos = RN.state.gastos.filter(function (g) { return g.id !== id; });
    RN.storageLocal.guardar();
    RN.cuadre.listar();
    RN.render.todo();
    RN.notifyUI.toast('Cuadre eliminado. Fondo de caja actualizado.', 'success');
  }, { danger: true });
};
