/**
 * moneda.js — Doble moneda CUP/USD.
 * CUP es la moneda principal. USD se muestra como equivalencia informativa
 * cuando hay una tasa configurada (manual o automática vía proxy CORS a mdiv.pro).
 */
RN.moneda = RN.moneda || {};

/**
 * Consulta automática de la tasa USD→CUP vía proxy CORS a mdiv.pro.
 * v5.13.1: Bug #12 — Intenta múltiples proxies CORS en cascada para mayor
 * resiliencia. Si corsproxy.io falla, prueba allorigins.win, luego
 * cors-anywhere, y finalmente conexión directa. Antes dependía de un único
 * proxy, por lo que si éste caía, la tasa automática nunca se actualizaba.
 */
RN.moneda.actualizarTasaAuto = async function () {
  if (!RN.state.config.tasaAuto) return;
  // v5.13.1: Bug #12 — lista de proxies CORS en orden de preferencia.
  var targetUrl = 'https://mdiv.pro/api/rate';
  var proxies = [
    function (url) { return 'https://corsproxy.io/?' + url; },
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function (url) { return 'https://cors-anywhere.herokuapp.com/' + url; },
    function (url) { return url; } // intento directo (sin proxy)
  ];
  var data = null;
  for (var i = 0; i < proxies.length; i++) {
    try {
      var proxyUrl = proxies[i](targetUrl);
      var resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      data = await resp.json();
      // v5.13.0: Validar que la tasa sea un número realista (entre 1 y 100000).
      if (data && data.rate && +data.rate > 0 && +data.rate < 100000) {
        break; // tasa válida obtenida
      } else {
        console.warn('Tasa automática: respuesta inválida de proxy #' + (i + 1), data);
        data = null;
      }
    } catch (e) {
      console.warn('Tasa automática: proxy #' + (i + 1) + ' falló:', e.message);
      data = null;
    }
  }
  if (data && data.rate && +data.rate > 0 && +data.rate < 100000) {
    RN.state.config.tasaUsd = +data.rate;
    RN.state.config.fechaTasaUsd = new Date().toISOString();
    RN.config.persistir();
    RN.notifyUI.toast('Tasa USD actualizada: ' + data.rate + ' CUP', 'success');
  } else {
    // v5.13.0: No mostrar error si ya hay una tasa manual configurada.
    if (!RN.state.config.tasaUsd) {
      RN.notifyUI.toast('No se pudo consultar la tasa automática (todos los proxies fallaron)', 'warn');
    }
  }
};

/** Devuelve el equivalente en USD de un monto CUP (o '' si no hay tasa). */
RN.moneda.aUSD = function (cup) {
  const tasa = RN.state.config.tasaUsd || 0;
  if (!tasa) return 0;
  return +((+cup || 0) / tasa).toFixed(2);
};

/** Convierte un monto en USD a CUP usando la tasa vigente (o 0 si no hay tasa). */
RN.moneda.aCUP = function (usd) {
  const tasa = RN.state.config.tasaUsd || 0;
  if (!tasa) return 0;
  return +((+usd || 0) * tasa).toFixed(2);
};

/** Devuelve la tasa vigente (0 si no configurada). */
RN.moneda.tasa = function () {
  return RN.state.config.tasaUsd || 0;
};

/** Formatea un monto en USD. */
RN.moneda.formatUSD = function (usd) {
  return '$' + (+usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
};

/** Muestra un monto con su equivalente USD si hay tasa. */
RN.moneda.mostrar = function (cup) {
  let s = RN.calc.formatCUP(cup);
  const usd = RN.moneda.aUSD(cup);
  // v5.13.5 (ISSUE #1): Cerrar el paréntesis antes de </span>.
  if (usd > 0) s += ' <span class="muted" style="font-size:12px">(' + RN.moneda.formatUSD(usd) + ')</span>';
  return s;
};


/**
 * v5.12.0 — Helpers reutilizables de bloque de moneda (CUP/USD/MIXTO).
 *
 * El bloque de moneda es un patrón común a varios modales (compra de
 * inventario, inversión personal, pago del proveedor, cobros de clientes).
 * v5.55.39: un solo bloque con USD y CUP siempre visibles (sin toggle CUP/USD/Mixto).
 * Estos helpers estandarizan el HTML y la lectura de
 * los campos de pago para evitar duplicar código en cada modal.
 *
 * Flujo de uso:
 *   1. RN.moneda.bloquePagoHTML(prefix, opts) → devuelve el HTML a insertar
 *   2. RN.moneda.initBloquePago(prefix)       → inicializa el estado interno (moneda='CUP')
 *   3. RN.moneda.setMonedaBloque(prefix, m)   → compat (ya no oculta campos; siempre USD+CUP)
 *   4. RN.moneda.recalcBloquePago(prefix, aPagarCUP) → recalcula el desglose del pago
 *   5. RN.moneda.leerBloquePago(prefix, aPagarCUP)   → devuelve {moneda, usd, cup, totalRecibidoCUP, ...}
 *
 * `prefix` es un identificador único para el modal (ej: 'inv-compra', 'lot-compra').
 * Los IDs generados son: {prefix}-moneda-toggle, {prefix}-monto-usd,
 * {prefix}-monto-cup, {prefix}-desglose.
 *
 * opts (opcional):
 *   - titulo:  texto del encabezado del bloque (default "Moneda de pago")
 *   - autoCUP: si true, en modo CUP el campo CUP se auto-rellena con aPagarCUP
 */

/** Estado interno del bloque de moneda por prefix. */
RN.moneda._bloqueState = RN.moneda._bloqueState || {};

/** Genera el HTML del bloque de moneda de pago. */
RN.moneda.bloquePagoHTML = function (prefix, opts) {
  opts = opts || {};
  var titulo = opts.titulo || 'Pago (USD y/o CUP)';
  var tasa = RN.moneda.tasa();
  var avisoTasa = tasa
    ? '<div class="muted" style="font-size:12px;margin-bottom:10px">Tasa vigente: <strong>1 USD = ' + tasa + ' CUP</strong> · Puedes usar una moneda, la otra, o ambas.</div>'
    : '<div class="muted" style="font-size:12px;margin-bottom:10px;color:var(--danger)">⚠ No hay tasa USD. Configúrala en Ajustes para pagar en dólares.</div>';
  return ''
    + '<div class="card" style="margin:0 0 16px;padding:14px;background:var(--bg)" data-bloque-pago="' + prefix + '">'
    +   '<div style="margin-bottom:10px"><strong style="font-size:14px">💰 ' + titulo + '</strong></div>'
    +   avisoTasa
    +   '<div class="form-row cols-2" style="margin-bottom:0">'
    +     '<div id="' + prefix + '-row-usd">'
    +       '<label>💵 Cantidad en USD</label>'
    +       '<input id="' + prefix + '-monto-usd" type="number" step="0.01" min="0" placeholder="0.00"'
    +         (tasa ? '' : ' disabled')
    +         ' oninput="RN.moneda.recalcBloquePago(\'' + prefix + '\')">'
    +     '</div>'
    +     '<div id="' + prefix + '-row-cup">'
    +       '<label>🪙 Cantidad en CUP</label>'
    +       '<input id="' + prefix + '-monto-cup" type="number" step="0.01" min="0" placeholder="0.00" oninput="RN.moneda.recalcBloquePago(\'' + prefix + '\')">'
    +     '</div>'
    +   '</div>'
    +   '<div id="' + prefix + '-desglose" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)"></div>'
    +   '<!-- compat: toggle oculto por si algún código antiguo lo busca -->'
    +   '<div class="moneda-toggle" id="' + prefix + '-moneda-toggle" style="display:none" aria-hidden="true">'
    +     '<button type="button" data-moneda="CUP"></button>'
    +     '<button type="button" data-moneda="USD"></button>'
    +     '<button type="button" data-moneda="MIXTO"></button>'
    +   '</div>'
    + '</div>';
};

RN.moneda.initBloquePago = function (prefix, monedaInicial) {
  RN.moneda._bloqueState[prefix] = { moneda: 'CUP' };
  if (monedaInicial && monedaInicial !== 'CUP') {
    RN.moneda.setMonedaBloque(prefix, monedaInicial);
  }
};

/**
 * v5.55.39: el bloque siempre muestra USD + CUP. Esta función se mantiene
 * por compatibilidad; ya no oculta campos ni borra montos.
 */
RN.moneda.setMonedaBloque = function (prefix, moneda) {
  RN.moneda._bloqueState[prefix] = RN.moneda._bloqueState[prefix] || {};
  RN.moneda._bloqueState[prefix].moneda = moneda || 'CUP';
  var rowUsd = document.getElementById(prefix + '-row-usd');
  var rowCup = document.getElementById(prefix + '-row-cup');
  if (rowUsd) rowUsd.style.display = '';
  if (rowCup) rowCup.style.display = '';
  var usdIn = document.getElementById(prefix + '-monto-usd');
  if (usdIn && RN.moneda.tasa()) usdIn.disabled = false;
  RN.moneda.recalcBloquePago(prefix);
};

RN.moneda._aPagarBloque = function (prefix) {
  var st = RN.moneda._bloqueState[prefix] || {};
  if (typeof st.oPagarCUP === 'function') {
    try { return +(st.oPagarCUP() || 0).toFixed(2); } catch (e) { return 0; }
  }
  return 0;
};

/**
 * Recalcula el desglose del bloque de pago.
 *
 * Modos de funcionamiento:
 *  - Modo "a pagar" (por defecto): hay un callback oPagarCUP() que define cuánto
 *    se debe pagar. El bloque muestra "A pagar", "Pago completo", "Falta X", etc.
 *  - Modo "derivado" (st.modoDerivado = true): NO hay "a pagar" predefinido. El
 *    monto total se CALCULA a partir de lo que el usuario ingresa en USD/CUP.
 *    El bloque muestra "Total desembolsado: X CUP" y actualiza un campo externo
 *    (st.onMontoDerivado callback) con el monto calculado en tiempo real.
 */
RN.moneda.recalcBloquePago = function (prefix) {
  var st = RN.moneda._bloqueState[prefix];
  if (!st) return;
  var aPagar = st.modoDerivado ? 0 : RN.moneda._aPagarBloque(prefix);
  // En modo "a pagar" con CUP + autoCUP, rellenar el campo CUP con aPagar
  if (!st.modoDerivado && st.moneda === 'CUP' && st.autoCUP) {
    var cupIn0 = document.getElementById(prefix + '-monto-cup');
    if (cupIn0 && (!cupIn0.value || parseFloat(cupIn0.value) === 0)) {
      cupIn0.value = aPagar;
    }
  }
  var usd = parseFloat((document.getElementById(prefix + '-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById(prefix + '-monto-cup') || {}).value) || 0;
  var tasa = RN.moneda.tasa();
  var cupDesdeUSD = +(usd * tasa).toFixed(2);
  var pagadoCUP = +(cupDesdeUSD + cup).toFixed(2);
  // Modo derivado: notificar el monto calculado al callback externo
  if (st.modoDerivado && typeof st.onMontoDerivado === 'function') {
    try { st.onMontoDerivado(pagadoCUP); } catch (e) {}
  }
  var desg = document.getElementById(prefix + '-desglose');
  if (!desg) return;
  if (aPagar <= 0 && pagadoCUP <= 0 && !st.modoDerivado) { desg.style.display = 'none'; return; }
  if (st.modoDerivado && pagadoCUP <= 0) {
    desg.innerHTML = '<div class="cobro-desglose-row muted">Ingresa el monto pagado en USD y/o CUP</div>';
    desg.style.display = 'block';
    return;
  }
  var html = '';
  if (!st.modoDerivado && aPagar > 0) {
    html += '<div class="cobro-desglose-row"><span class="muted">A pagar</span><strong>' + RN.calc.formatCUP(aPagar) + '</strong></div>';
  }
  if (usd > 0) html += '<div class="cobro-desglose-row">💵 USD ' + usd + ' × ' + tasa + ' = ' + RN.calc.formatCUP(cupDesdeUSD) + '</div>';
  if (cup > 0) html += '<div class="cobro-desglose-row">🪙 ' + RN.calc.formatCUP(cup) + '</div>';
  if (!st.modoDerivado && aPagar > 0) {
    var diff = +(pagadoCUP - aPagar).toFixed(2);
    if (pagadoCUP <= 0) {
      html += '<div class="cobro-desglose-row muted">Ingresa el monto recibido</div>';
    } else if (Math.abs(diff) < 0.01) {
      html += '<div class="cobro-desglose-row"><strong style="color:var(--green)">✓ Pago completo</strong></div>';
    } else if (diff < 0) {
      html += '<div class="cobro-desglose-row"><strong style="color:var(--amber)">⏳ Falta ' + RN.calc.formatCUP(Math.abs(diff)) + '</strong></div>';
    } else {
      html += '<div class="cobro-desglose-row"><strong style="color:var(--danger)">⚠ Excedente ' + RN.calc.formatCUP(diff) + ' (vuelto)</strong></div>';
    }
  }
  if (st.modoDerivado) {
    html += '<div class="cobro-desglose-row"><strong style="color:var(--blue)">💰 Total desembolsado: ' + RN.calc.formatCUP(pagadoCUP) + '</strong></div>';
  } else {
    html += '<div class="cobro-desglose-row"><strong>Total recibido: ' + RN.calc.formatCUP(pagadoCUP) + '</strong></div>';
  }
  desg.innerHTML = html;
  desg.style.display = 'block';
};

/**
 * Lee los campos del bloque de pago y devuelve un objeto con todos los datos.
 * @param {string} prefix - prefijo del bloque
 * @param {number} aPagarCUP - monto total a pagar en CUP
 * @returns {{moneda:string, montoUSD:number, montoCUP:number,
 *            montoCUPDesdeUSD:number, totalRecibidoCUP:number,
 *            tasaUsd:number, completo:boolean}}
 */
RN.moneda.leerBloquePago = function (prefix, aPagarCUP) {
  var st = RN.moneda._bloqueState[prefix] || { moneda: 'CUP' };
  var usd = parseFloat((document.getElementById(prefix + '-monto-usd') || {}).value) || 0;
  var cup = parseFloat((document.getElementById(prefix + '-monto-cup') || {}).value) || 0;
  var tasa = RN.moneda.tasa();
  var cupDesdeUSD = +(usd * tasa).toFixed(2);
  var totalRecibidoCUP = +(cupDesdeUSD + cup).toFixed(2);
  var moneda = st.moneda || 'CUP';
  // Si no se ingresó nada y hay monto a pagar, asumir pago completo en CUP
  if (totalRecibidoCUP <= 0 && aPagarCUP > 0) {
    cup = aPagarCUP;
    totalRecibidoCUP = aPagarCUP;
    moneda = 'CUP';
  }
  // Detectar MIXTO si ambos > 0 (coherencia)
  if (usd > 0 && cup > 0) moneda = 'MIXTO';
  else if (usd > 0) moneda = 'USD';
  else moneda = 'CUP';
  var diff = +(totalRecibidoCUP - (aPagarCUP || 0)).toFixed(2);
  return {
    moneda: moneda,
    montoUSD: usd,
    montoCUP: cup,
    // v5.30.0: alias explícito — es la parte pagada EN PESOS (no la equivalente).
    montoCUPDirecto: cup,
    montoCUPDesdeUSD: cupDesdeUSD,
    totalRecibidoCUP: totalRecibidoCUP,
    tasaUsd: tasa,
    completo: Math.abs(diff) < 0.01
  };
};

/**
 * v5.30.0 — ¿El pago quedó partido entre USD y CUP?
 * Se calcula SIEMPRE a partir de los montos reales (no del toggle), de modo que
 * "Mixto" nunca pueda comportarse como un simple pago en dólares: si hay pesos
 * y dólares, es MIXTO, y ambas partes se contabilizan por separado.
 */
RN.moneda.esMixto = function (datos) {
  datos = datos || {};
  return (+(datos.montoUSD || 0) > 0) && (+(datos.montoCUP || 0) > 0);
};

/**
 * Registra la configuración del bloque de pago (callback para aPagar y autoCUP).
 * @param {string} prefix
 * @param {function} oPagarCUP - función que devuelve el monto a pagar en CUP
 * @param {boolean} autoCUP - si true, en modo CUP se auto-rellena el campo
 */
RN.moneda.configBloquePago = function (prefix, oPagarCUP, autoCUP) {
  RN.moneda._bloqueState[prefix] = RN.moneda._bloqueState[prefix] || { moneda: 'CUP' };
  RN.moneda._bloqueState[prefix].oPagarCUP = oPagarCUP || null;
  RN.moneda._bloqueState[prefix].autoCUP = !!autoCUP;
};

/**
 * v5.12.1 — Configura el bloque en MODO DERIVADO: el monto se calcula a partir
 * de lo que el usuario ingresa en USD/CUP (no hay "a pagar" predefinido).
 * @param {string} prefix
 * @param {function} onMontoDerivado - callback(pagadoCUP) que recibe el monto total
 *        calculado cada vez que cambian los campos. Típicamente actualiza un
 *        campo readonly externo (ej: el "Monto invertido").
 */
RN.moneda.configModoDerivado = function (prefix, onMontoDerivado) {
  RN.moneda._bloqueState[prefix] = RN.moneda._bloqueState[prefix] || { moneda: 'CUP' };
  RN.moneda._bloqueState[prefix].modoDerivado = true;
  RN.moneda._bloqueState[prefix].onMontoDerivado = onMontoDerivado || null;
  RN.moneda._bloqueState[prefix].oPagarCUP = null;
  RN.moneda._bloqueState[prefix].autoCUP = false;
};

/**
 * Genera el HTML de un desglose de pago guardado (para mostrar en tarjetas).
 * @param {object} datos - {moneda, montoUSD, montoCUP, montoCUPDesdeUSD, totalRecibidoCUP, tasaUsd}
 * @returns {string} HTML del desglose
 */
RN.moneda.desglosePagoHTML = function (datos) {
  if (!datos) return '';
  var tasa = datos.tasaUsd || RN.moneda.tasa();
  var usd = datos.montoUSD || 0;
  var cup = datos.montoCUP || 0;
  var cupDesdeUSD = datos.montoCUPDesdeUSD || (usd * tasa);
  var total = datos.totalRecibidoCUP || (cupDesdeUSD + cup);
  var moneda = datos.moneda || 'CUP';
  var html = '<span class="muted" style="font-size:12px">Pagado (' + moneda + '): </span>';
  if (usd > 0) html += '<span>💵 ' + RN.moneda.formatUSD(usd) + '</span>';
  if (usd > 0 && cup > 0) html += '<span class="muted"> + </span>';
  if (cup > 0) html += '<span>🪙 ' + RN.calc.formatCUP(cup) + '</span>';
  if (usd > 0 && cup === 0) html += ' <span class="muted">(' + RN.calc.formatCUP(cupDesdeUSD) + ')</span>';
  html += ' <span class="muted">= ' + RN.calc.formatCUP(total) + '</span>';
  return html;
};
