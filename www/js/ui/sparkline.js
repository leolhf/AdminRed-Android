/**
 * ui/sparkline.js — Capa visual "Neo Glass": insignias de icono y
 * micro-gráficos (sparklines) para las tarjetas KPI.
 *
 * IMPORTANTE: este módulo es PURAMENTE decorativo.
 *  - No lee ni escribe datos del negocio.
 *  - No modifica cálculos, estado ni almacenamiento.
 *  - Sólo añade nodos DOM (insignia + SVG) a las tarjetas .kpi ya
 *    renderizadas por render.js, y marca cada tarjeta con data-deco
 *    para no repetir el trabajo cuando la vista se vuelve a pintar.
 *
 * Las formas de los sparklines son deterministas (derivadas del texto
 * de la etiqueta), por lo que una misma tarjeta conserva siempre su
 * mismo trazo entre re-renderizados.
 */
(function () {
  'use strict';

  var RN = (window.RN = window.RN || {});
  RN.spark = RN.spark || {};

  /* ---------- Paleta semántica ---------- */
  var COLOR = {
    blue:  '#3B82F6',
    green: '#22C55E',
    amber: '#F59E0B',
    red:   '#EF4444'
  };
  var RELLENO = {
    blue:  'rgba(59,130,246,.30)',
    green: 'rgba(34,197,94,.30)',
    amber: 'rgba(245,158,11,.28)',
    red:   'rgba(239,68,68,.28)'
  };

  /* ---------- Iconos por palabra clave de la etiqueta ---------- */
  var ICONOS = [
    [/recuperaci|recuperad/i,              '📈'],
    [/invertid|inversi|capital/i,          '🎯'],
    [/por devolver|saldo/i,                '🧾'],
    [/deuda/i,                             '🤝'],
    [/devuelto|devoluci/i,                 '💰'],
    [/concluid|liquidad/i,                 '🏦'],
    [/caja|fondo|bolsillo/i,               '🏦'],
    [/mora|atrasad|vencid/i,               '⏰'],
    [/gasto/i,                             '🧾'],
    [/ganancia|margen|rentab/i,            '📊'],
    [/inventario|equipo|lote|producto/i,   '📦'],
    [/descuento|bonific|regalo/i,          '🎁'],
    [/mega|red|capacidad|servicio/i,       '📡'],
    [/cliente|activo|moroso/i,             '👥'],
    [/cobr|pagad|pago|recibo/i,            '💳'],
    [/ingreso|venta|factur/i,              '💵'],
    [/promedio|ticket|por cliente/i,       '🧮'],
    [/tendencia|mes|periodo/i,             '📅'],
    [/salud|índice|indice/i,               '❤️'],
    [/usd|dólar|dolar|tasa/i,              '💱']
  ];

  /* ---------- Utilidades deterministas ---------- */
  function hash(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function prng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Determina el color semántico a partir de las clases de la tarjeta. */
  RN.spark.colorDe = function (el) {
    var c = el.classList;
    if (c.contains('green') || c.contains('ok')) return 'green';
    if (c.contains('amber') || c.contains('warn') || c.contains('parcial')) return 'amber';
    if (c.contains('red') || c.contains('due') || c.contains('danger')) return 'red';
    if (c.contains('blue')) return 'blue';
    return 'blue';
  };

  RN.spark.iconoDe = function (label) {
    var i;
    for (i = 0; i < ICONOS.length; i++) {
      if (ICONOS[i][0].test(label)) return ICONOS[i][1];
    }
    return '📊';
  };

  /** Genera el SVG del sparkline (ancho 100, alto 30, escala no uniforme). */
  RN.spark.svg = function (sem, label) {
    var N = 42;
    var r = prng(hash(label + '|' + sem));
    var pts = [], i, t, base, v;

    for (i = 0; i < N; i++) {
      t = i / (N - 1);
      if (sem === 'green') {
        // casi plano con un repunte central (dinero recuperado)
        base = 0.10 + 0.72 * Math.exp(-Math.pow((t - 0.58) * 6.5, 2));
      } else if (sem === 'red') {
        // sube y baja: saldo pendiente oscilante
        base = 0.42 + 0.16 * Math.sin(t * Math.PI * 2.6) + (t > 0.7 ? 0.18 : 0);
      } else if (sem === 'amber') {
        // ruido suave y constante
        base = 0.45 + 0.14 * Math.sin(t * Math.PI * 4.2);
      } else {
        // azul: onda amplia con picos ocasionales (capital invertido)
        base = 0.34 + 0.20 * Math.sin(t * Math.PI * 2.2)
             + (t > 0.30 && t < 0.46 ? 0.30 : 0)
             + (t > 0.72 && t < 0.80 ? 0.22 : 0);
      }
      v = base + (r() - 0.5) * 0.20;
      v = Math.max(0.06, Math.min(0.95, v));
      pts.push([(t * 100).toFixed(2), (28 - v * 24).toFixed(2)]);
    }

    var linea = 'M' + pts[0][0] + ',' + pts[0][1];
    for (i = 1; i < N; i++) linea += ' L' + pts[i][0] + ',' + pts[i][1];
    var area = linea + ' L100,30 L0,30 Z';
    var id = 'sg' + (hash(label) % 100000);

    return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">' +
             '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
               '<stop offset="0%" stop-color="' + RELLENO[sem] + '"/>' +
               '<stop offset="100%" stop-color="rgba(0,0,0,0)"/>' +
             '</linearGradient></defs>' +
             '<path class="spark-area" d="' + area + '" fill="url(#' + id + ')"/>' +
             '<path class="spark-line" pathLength="100" d="' + linea + '" stroke="' + COLOR[sem] + '" ' +
               'style="filter:drop-shadow(0 0 5px ' + COLOR[sem] + '88)"/>' +
           '</svg>';
  };

  /** Anillo de porcentaje para los KPI cuyo valor contiene "%". */
  RN.spark.anillo = function (pct, sem) {
    pct = Math.max(0, Math.min(100, pct));
    return '<div class="kpi-ring-wrap">' +
      '<svg viewBox="0 0 40 40" aria-hidden="true">' +
        '<circle class="ring-bg" cx="20" cy="20" r="16"></circle>' +
        '<circle class="ring-fg" cx="20" cy="20" r="16" pathLength="100" ' +
          'stroke-dasharray="' + pct + ' 100" stroke="' + COLOR[sem] + '"></circle>' +
      '</svg>' +
      '<span class="ring-txt">' + Math.round(pct) + '%</span>' +
    '</div>';
  };

  /** Decora una tarjeta KPI concreta. */
  RN.spark.decorarKpi = function (k) {
    if (!k || k.getAttribute('data-deco') === '1') return;
    var labelEl = k.querySelector('.label');
    var valueEl = k.querySelector('.value');
    if (!labelEl) return;

    var label = (labelEl.textContent || '').trim();
    var texto = labelEl.textContent || '';

    // Si la tarjeta tiene más de una etiqueta (bloques compuestos), se omiten.
    if (!valueEl || k.querySelectorAll('.value').length !== 1) {
      k.setAttribute('data-deco', '1');
      return;
    }

    var sem = RN.spark.colorDe(k);
    var valorTxt = (valueEl.textContent || '').trim();

    // 1) Insignia de icono
    var badge = document.createElement('span');
    badge.className = 'kpi-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = RN.spark.iconoDe(label);
    k.insertBefore(badge, k.firstChild);
    k.classList.add('kpi-con-badge');

    // 2) Anillo si el valor es un porcentaje
    if (/%/.test(valorTxt) || /%/.test(texto)) {
      var num = parseFloat(String(valorTxt).replace(/[^\d.,-]/g, '').replace(',', '.'));
      if (!isNaN(num)) {
        k.insertAdjacentHTML('afterbegin', RN.spark.anillo(num > 100 ? 100 : num, sem));
        k.classList.add('kpi-con-anillo');
      }
    }

    // 3) Sparkline al pie
    k.insertAdjacentHTML('beforeend', RN.spark.svg(sem, label));
    k.setAttribute('data-deco', '1');
  };

  /** Recorre el documento (o un subárbol) y decora lo que falte. */
  RN.spark.decorar = function (root) {
    var scope = root || document;
    var lista = scope.querySelectorAll ? scope.querySelectorAll('.kpi') : [];
    var i;
    for (i = 0; i < lista.length; i++) RN.spark.decorarKpi(lista[i]);
  };

  /* ---------- Observador: decora tras cada re-render ---------- */
  RN.spark.init = function () {
    if (RN.spark._on) return;
    RN.spark._on = true;
    RN.spark.decorar(document);

    var timer = null;
    function programar() {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        RN.spark.decorar(document);
      }, 70);
    }
    try {
      new MutationObserver(programar).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch (e) { /* navegadores muy antiguos: sin observador */ }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', programar);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', RN.spark.init);
  } else {
    RN.spark.init();
  }
})();
