/**
 * cobros/cuadre.js — Cuadre de caja.
 *
 * v5.14.0: Permite introducir el saldo real contado físicamente y registra
 * automáticamente la diferencia contra el saldo calculado por la app.
 *
 * Decisión de diseño (ver recomendacion_cuadre_caja.txt):
 *   La diferencia NUNCA se mezcla con "Gasto personal" ni con "Retiro de
 *   caja". Se usa una categoría dedicada "Descuadre de caja" para mantener
 *   trazabilidad y permitir detectar patrones (ej: descuadres recurrentes).
 *
 * v5.31.0 — CUADRE POR MONEDA (CUP y USD por separado).
 *   Antes había UN solo campo ("Saldo real contado (CUP)") que se comparaba
 *   contra el fondo total: no se podía contar los dólares y los pesos por
 *   separado, y un descuadre en dólares se registraba como si fuese en pesos
 *   (la gaveta de USD no se movía ni un dólar y el CUP físico absorbía todo).
 *
 *   Ahora el modal pide DOS conteos independientes:
 *     - 🪙 Saldo real contado — CUP (pesos)
 *     - 💵 Saldo real contado — USD (dólares)
 *   Cada uno se compara contra su propia cifra calculada por la app
 *   (RN.calc.cupEnCaja() y RN.calc.usdEnCaja()), y se registra un movimiento
 *   por moneda con la diferencia REAL de esa moneda:
 *     - CUP: monto en pesos (± según falte o sobre).
 *     - USD: monto en CUP equivalente + `montoCuadreUSD` FIRMADO (+ faltan USD,
 *       − sobran USD). RN.calc.usdEnCaja() resta ese valor, de modo que la
 *       gaveta de dólares también queda cuadrada.
 *   Un campo VACÍO significa "esa moneda no se contó" y no genera movimiento,
 *   así que se puede cuadrar solo el CUP, solo el USD, o los dos a la vez.
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
 *   RN.cuadre.abrir()                — abre el modal para cuadrar CUP y USD
 *   RN.cuadre.diferencia()           — diferencia pura de una moneda (sin DOM)
 *   RN.cuadre.construirMovimientos() — construye los movimientos por moneda
 *   RN.cuadre.guardar()              — calcula las diferencias y las registra
 *   RN.cuadre.listar()               — historial de cuadres realizados
 *   RN.cuadre.eliminar()             — elimina un cuadre (si el usuario se equivocó al contar)
 */
RN.cuadre = RN.cuadre || {};

/** Categoría dedicada — nunca se mezcla con "Gasto personal" ni "Retiro de caja". */
RN.cuadre.CATEGORIA = 'Descuadre de caja';

/** Tolerancia (en la unidad de la moneda contada) para considerar un cuadre exacto. */
RN.cuadre.TOLERANCIA = 0.01;

/** Snapshot de los saldos calculados al abrir el modal (para que no cambien al escribir). */
RN.cuadre._snapshot = null;

/** ¿El usuario escribió un saldo contado? (0 es un conteo válido: gaveta vacía; '' = no contado). */
RN.cuadre.esContado = function (valor) {
  return valor !== null && valor !== undefined && String(valor).trim() !== '';
};

/**
 * v5.31.0 — Diferencia PURA de una moneda (sin DOM: testeable desde Node).
 * @param {number|string} contado   saldo real contado (null/'' = esa moneda no se contó)
 * @param {number|string} calculado saldo que dice la app para esa misma moneda
 * @returns {{contado:number, calculado:number, diferencia:number, exacto:boolean, tipo:string}|null}
 *   diferencia = contado − calculado  (negativa = faltante, positiva = sobrante)
 */
RN.cuadre.diferencia = function (contado, calculado) {
  if (!RN.cuadre.esContado(contado)) return null;
  var c = +(+contado || 0);
  var k = +(+calculado || 0);
  var d = +(c - k).toFixed(2);
  var exacto = Math.abs(d) < RN.cuadre.TOLERANCIA;
  return {
    contado: +c.toFixed(2),
    calculado: +k.toFixed(2),
    diferencia: d,
    exacto: exacto,
    tipo: exacto ? 'exacto' : (d < 0 ? 'faltante' : 'sobrante')
  };
};

/**
 * v5.31.0 — Construye los movimientos de cuadre (uno por moneda con diferencia),
 * SIN tocar DOM ni estado: es una función pura para poder verificarla desde Node.
 *
 * @param {object} opts
 *   - diferenciaCUP  objeto de RN.cuadre.diferencia() para el CUP (o null)
 *   - diferenciaUSD  objeto de RN.cuadre.diferencia() para el USD (o null)
 *   - tasa           tasa USD→CUP vigente (necesaria si hay descuadre en USD)
 *   - nota           nota opcional del usuario
 *   - fecha          'YYYY-MM-DD'
 *   - idFn           generador de ids (por defecto RN.calc.uid)
 * @returns {Array<object>} movimientos listos para RN.state.gastos
 */
RN.cuadre.construirMovimientos = function (opts) {
  opts = opts || {};
  var out = [];
  var fecha = opts.fecha || new Date().toISOString().slice(0, 10);
  var fechaISO = fecha + 'T00:00:00';
  var mes = fecha.slice(0, 7);
  var tasa = +opts.tasa || 0;
  var idFn = opts.idFn || function (p) { return RN.calc.uid(p); };

  // ---- CUP (pesos) ----
  var dc = opts.diferenciaCUP;
  if (dc && !dc.exacto) {
    var esFaltanteCup = dc.diferencia < 0;
    out.push({
      id: idFn('cuadre'),
      concepto: opts.nota || (esFaltanteCup ? 'Faltante de caja (CUP)' : 'Sobrante de caja (CUP)'),
      // Faltante: monto positivo (resta del fondo, como cualquier gasto).
      // Sobrante: monto negativo (al sumarse a gastosTotales() con signo
      // negativo, efectivamente suma al fondo de caja).
      monto: esFaltanteCup ? Math.abs(dc.diferencia) : -Math.abs(dc.diferencia),
      categoria: RN.cuadre.CATEGORIA,
      esCuadreCaja: true,
      cuadreMoneda: 'CUP',
      tipoCuadre: esFaltanteCup ? 'faltante' : 'sobrante',
      saldoCalculado: dc.calculado,
      saldoReal: dc.contado,
      moneda: 'CUP',
      fecha: fechaISO,
      mes: mes
    });
  }

  // ---- USD (dólares) ----
  var du = opts.diferenciaUSD;
  if (du && !du.exacto) {
    var esFaltanteUsd = du.diferencia < 0;
    var equivalenteCUP = +Math.abs(du.diferencia * tasa).toFixed(2);
    out.push({
      id: idFn('cuadre'),
      concepto: opts.nota || (esFaltanteUsd ? 'Faltante de caja (USD)' : 'Sobrante de caja (USD)'),
      // Impacto en el fondo de caja: el equivalente en CUP de los dólares que
      // faltan (positivo) o que sobran (negativo).
      monto: esFaltanteUsd ? equivalenteCUP : -equivalenteCUP,
      categoria: RN.cuadre.CATEGORIA,
      esCuadreCaja: true,
      cuadreMoneda: 'USD',
      tipoCuadre: esFaltanteUsd ? 'faltante' : 'sobrante',
      /**
       * Dólares FIRMADOS que se movieron en la gaveta de USD:
       *   +X → faltaron X USD   ·   −X → sobraron X USD
       * RN.calc.usdEnCaja() lo resta, así la gaveta de dólares queda cuadrada.
       * No se usa `montoOriginal` para no confundirlo con los movimientos
       * de caja (depósitos/retiros), que sí lo usan por moneda.
       */
      montoCuadreUSD: esFaltanteUsd ? Math.abs(du.diferencia) : -Math.abs(du.diferencia),
      tasaUsada: tasa,
      saldoCalculadoUSD: du.calculado,
      saldoRealUSD: du.contado,
      moneda: 'USD',
      montoPagadoUSD: 0, // no es un pago: se deja explícito para otros módulos
      montoPagadoCUP: 0,
      fecha: fechaISO,
      mes: mes
    });
  }
  return out;
};

/**
 * v5.31.0 — Lee un campo del modal y devuelve su diferencia, o null si está vacío.
 */
RN.cuadre._leerDiferencia = function (idInput, calculado) {
  var el = document.getElementById(idInput);
  return RN.cuadre.diferencia(el ? el.value : null, calculado);
};

/**
 * Abre el modal de cuadre de caja (CUP y USD por separado). Muestra los saldos
 * calculados por la app para cada moneda y permite introducir lo contado
 * físicamente en cada una.
 */
RN.cuadre.abrir = function () {
  var s = RN.calc.saldosMoneda(); // { usd, cup, tasa, usdEnCUP, totalCUP }
  RN.cuadre._snapshot = { cup: s.cup, usd: s.usd, tasa: s.tasa, totalCUP: s.totalCUP };
  var avisoTasa = s.tasa
    ? '<div class="muted" style="font-size:12px;margin-bottom:10px">Tasa vigente: <strong>1 USD = ' + s.tasa + ' CUP</strong></div>'
    : '<div class="muted" style="font-size:12px;margin-bottom:10px;color:var(--danger)">⚠ No hay tasa USD configurada: puedes cuadrar el CUP y el USD físico, pero un descuadre en dólares no podrá valorarse en CUP. Configúrala en Ajustes.</div>';

  var html = `
    <div class="modal-header">
      <h3>🧮 Cuadre de caja (CUP / USD)</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="flex wrap" style="gap:8px;margin-bottom:12px">
        <div class="kpi muted" style="flex:1;min-width:140px;margin:0">
          <div class="label">💵 USD calculado por la app</div>
          <div class="value">$${s.usd.toFixed(2)}</div>
          <div class="sub">Dólares físicos en la gaveta</div>
        </div>
        <div class="kpi muted" style="flex:1;min-width:140px;margin:0">
          <div class="label">🪙 CUP calculado por la app</div>
          <div class="value">${RN.calc.formatCUP(s.cup)}</div>
          <div class="sub">Pesos físicos en la gaveta</div>
        </div>
      </div>
      <div class="kpi muted" style="margin-bottom:16px">
        <div class="label">Fondo total (equivalente CUP)</div>
        <div class="value">${RN.calc.formatCUP(s.totalCUP)}</div>
        <div class="sub">Saldo inicial + ingresos + depósitos − gastos − retiros</div>
      </div>
      ${avisoTasa}
      <div class="form-row cols-2">
        <div>
          <label>🪙 Saldo real contado — CUP (pesos)</label>
          <input id="cuadre-real-cup" type="number" step="0.01" placeholder="0.00"
                 oninput="RN.cuadre._recalcular()">
        </div>
        <div>
          <label>💵 Saldo real contado — USD (dólares)</label>
          <input id="cuadre-real-usd" type="number" step="0.01" placeholder="0.00"
                 oninput="RN.cuadre._recalcular()">
        </div>
      </div>
      <div class="muted" style="font-size:12px;margin:-4px 0 12px">
        Deja vacía la moneda que no hayas contado: se registrará solo la que tenga diferencia.
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
      <button class="btn primary" onclick="RN.cuadre.guardar()" id="cuadre-btn-guardar" disabled style="opacity:0.5;cursor:not-allowed">
        🧮 Registrar cuadre
      </button>
    </div>`;
  RN.uiComponents.modal(html);
};

/** v5.31.0 — HTML del resultado de una moneda (faltante / sobrante / exacto). */
RN.cuadre._filaResultado = function (etiqueta, d, esUSD, tasa) {
  var t = +tasa || 0;
  var montoTxt;
  if (esUSD) {
    montoTxt = RN.moneda.formatUSD(Math.abs(d.diferencia)) +
      (t ? ' (' + RN.calc.formatCUP(Math.abs(d.diferencia) * t) + ')' : '');
  } else {
    montoTxt = RN.calc.formatCUP(Math.abs(d.diferencia));
  }
  var badge;
  if (d.exacto) {
    badge = '<span class="badge ok">✓ Cuadre exacto — no hay diferencia que registrar</span>';
  } else if (d.diferencia < 0) {
    badge = '<span class="badge due">⚠️ Faltante: ' + montoTxt +
      '. Se registrará como gasto (categoría "' + RN.cuadre.CATEGORIA + '").</span>';
  } else {
    badge = '<span class="badge ok">💰 Sobrante: ' + montoTxt +
      '. Se registrará como ingreso de ajuste (categoría "' + RN.cuadre.CATEGORIA + '").</span>';
  }
  var detalle = '<div class="muted" style="font-size:11px;margin-top:3px">Contado: ' +
    (esUSD ? RN.moneda.formatUSD(d.contado) : RN.calc.formatCUP(d.contado)) +
    ' · App: ' + (esUSD ? RN.moneda.formatUSD(d.calculado) : RN.calc.formatCUP(d.calculado)) +
    '</div>';
  return '<div style="margin-bottom:10px"><strong style="font-size:13px">' + etiqueta + '</strong><br>' + badge + detalle + '</div>';
};

/**
 * v5.31.0 — Recalcula en tiempo real la diferencia de CADA moneda entre lo
 * contado y lo calculado, mostrando si hay faltante, sobrante o cuadre exacto,
 * y habilita/deshabilita el botón de registrar.
 */
RN.cuadre._recalcular = function () {
  var s = RN.cuadre._snapshot || RN.calc.saldosMoneda();
  var resultado = document.getElementById('cuadre-resultado');
  var btn = document.getElementById('cuadre-btn-guardar');
  var dc = RN.cuadre._leerDiferencia('cuadre-real-cup', s.cup);
  var du = RN.cuadre._leerDiferencia('cuadre-real-usd', s.usd);

  var hayQueRegistrar = (!!dc && !dc.exacto) || (!!du && !du.exacto);
  var faltaTasa = (!!du && !du.exacto && !s.tasa);

  var html = '';
  if (dc) html += RN.cuadre._filaResultado('🪙 CUP (pesos)', dc, false, s.tasa);
  if (du) html += RN.cuadre._filaResultado('💵 USD (dólares)', du, true, s.tasa);
  if (faltaTasa) {
    html += '<div class="badge due">⚠️ Hay un descuadre en dólares y no hay tasa USD configurada. ' +
      'Configúrala en Ajustes para poder registrarlo.</div>';
  } else if (hayQueRegistrar) {
    html += '<div class="badge warn">Se registrará como un ajuste en la categoría "' + RN.cuadre.CATEGORIA + '".</div>';
  } else if (dc || du) {
    html += '<div class="badge ok">✓ Todo cuadra — no hay nada que registrar.</div>';
  }
  if (resultado) resultado.innerHTML = html;
  if (btn) {
    btn.disabled = !hayQueRegistrar || faltaTasa;
    btn.style.opacity = btn.disabled ? '0.5' : '1';
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
  }
};

/**
 * v5.31.0 — Calcula las diferencias POR MONEDA y las guarda como movimientos
 * de caja (uno por moneda con diferencia). Si todo cuadra, no registra nada.
 */
RN.cuadre.guardar = function () {
  var s = RN.cuadre._snapshot || RN.calc.saldosMoneda();
  var dc = RN.cuadre._leerDiferencia('cuadre-real-cup', s.cup);
  var du = RN.cuadre._leerDiferencia('cuadre-real-usd', s.usd);

  if ((dc && dc.contado < 0) || (du && du.contado < 0)) {
    RN.notifyUI.toast('El saldo contado no puede ser negativo', 'error');
    return;
  }

  var hayCUP = !!dc && !dc.exacto;
  var hayUSD = !!du && !du.exacto;

  if (!hayCUP && !hayUSD) {
    RN.uiComponents.cerrarModal();
    RN.notifyUI.toast('Cuadre exacto — no había diferencia que registrar', 'success');
    return;
  }
  if (hayUSD && !s.tasa) {
    RN.notifyUI.toast('Configura la tasa USD en Ajustes para registrar un descuadre en dólares', 'error');
    return;
  }

  var notaEl = document.getElementById('cuadre-nota');
  var fechaEl = document.getElementById('cuadre-fecha');
  var nota = notaEl ? notaEl.value.trim() : '';
  var fecha = (fechaEl && fechaEl.value) || new Date().toISOString().slice(0, 10);

  var movimientos = RN.cuadre.construirMovimientos({
    diferenciaCUP: dc,
    diferenciaUSD: du,
    tasa: s.tasa,
    nota: nota,
    fecha: fecha
  });

  movimientos.forEach(function (m) { RN.state.gastos.push(m); });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();

  var partes = movimientos.map(function (m) {
    var esFaltante = m.tipoCuadre === 'faltante';
    var txt = m.cuadreMoneda === 'USD'
      ? RN.moneda.formatUSD(Math.abs(m.montoCuadreUSD || 0))
      : RN.calc.formatCUP(Math.abs(m.monto || 0));
    return (esFaltante ? 'Faltante ' : 'Sobrante ') + txt + ' (' + m.cuadreMoneda + ')';
  });
  var hayFaltante = movimientos.some(function (m) { return m.tipoCuadre === 'faltante'; });
  RN.notifyUI.toast('Cuadre registrado — ' + partes.join(' · '), hayFaltante ? 'warn' : 'success');
};

/**
 * Suma total de faltantes menos sobrantes (dinero neto perdido por descuadres),
 * en su equivalente CUP. Se mantiene por retrocompatibilidad: el desglose por
 * moneda está en RN.calc.descuadresPorMoneda().
 */
RN.cuadre.totalNeto = function () {
  return RN.calc.descuadresPorMoneda().totalCUP;
};

/**
 * Muestra el historial de cuadres de caja realizados, separando el neto en
 * CUP del neto en USD.
 */
RN.cuadre.listar = function () {
  var cuadres = RN.state.gastos
    .filter(function (g) { return g.esCuadreCaja; })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var neto = RN.calc.descuadresPorMoneda();

  var filas = cuadres.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay cuadres registrados</p>'
    : cuadres.map(function (c) {
        var fecha = new Date(c.fecha).toLocaleDateString('es-CU');
        var esFaltante = c.tipoCuadre === 'faltante';
        var esUSD = c.cuadreMoneda === 'USD';
        var signo = esFaltante ? '-' : '+';
        var color = esFaltante ? 'var(--red,#dc2626)' : 'var(--green,#16a34a)';
        var monedaTxt = esUSD
          ? '$' + Math.abs(c.montoCuadreUSD || 0).toFixed(2) + ' USD <span class="muted" style="font-size:11px">(' + RN.calc.formatCUP(Math.abs(c.monto || 0)) + ')</span>'
          : RN.calc.formatCUP(Math.abs(c.monto || 0));
        var badge = esFaltante
          ? '<span class="badge due">Faltante</span>'
          : '<span class="badge ok">Sobrante</span>';
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(c.concepto) + '</td>' +
          '<td><span class="pill">' + (esUSD ? 'USD' : 'CUP') + '</span></td>' +
          '<td>' + badge + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:' + color + '">' + signo + monedaTxt + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.cuadre.eliminar(\'' + RN.render.escAttr(c.id) + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html = `
    <div class="modal-header">
      <h3>🧮 Historial de cuadres de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="flex wrap" style="gap:8px;margin-bottom:16px">
        <div class="kpi ${neto.cup > 0 ? 'red' : (neto.cup < 0 ? 'green' : 'muted')}" style="flex:1;min-width:150px;margin:0">
          <div class="label">🪙 Neto por descuadres en CUP</div>
          <div class="value">${RN.calc.formatCUP(Math.abs(neto.cup))}</div>
          <div class="sub">${neto.cup > 0 ? 'Perdido en faltantes de pesos' : (neto.cup < 0 ? 'A favor por sobrantes de pesos' : 'Sin diferencias en pesos')}</div>
        </div>
        <div class="kpi ${neto.usd > 0 ? 'red' : (neto.usd < 0 ? 'green' : 'muted')}" style="flex:1;min-width:150px;margin:0">
          <div class="label">💵 Neto por descuadres en USD</div>
          <div class="value">${RN.moneda.formatUSD(Math.abs(neto.usd))}</div>
          <div class="sub">${neto.usd > 0 ? 'Perdido en faltantes de dólares' : (neto.usd < 0 ? 'A favor por sobrantes de dólares' : 'Sin diferencias en dólares')} · equiv. ${RN.calc.formatCUP(Math.abs(neto.usdEnCUP))}</div>
        </div>
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:8px">${cuadres.length} cuadre(s) · Total neto equivalente: ${RN.calc.formatCUP(Math.abs(neto.totalCUP))}</div>
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Moneda</th>
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
