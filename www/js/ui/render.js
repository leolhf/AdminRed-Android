/**
 * ui/render.js — Núcleo del render: helpers compartidos (esc, badges, nombrePlan,
 * toggleCard, comparadores de IP, barra de recuperación, subUSD) y el despachador
 * RN.render.vista()/todo().
 * Depende de calculations.js (usa funciones de cálculo).
 *
 * v5.45.0: las vistas se extrajeron a js/ui/views/ (dashboard, clientes, cobros,
 * realizados, finanzas, reportes). Todas siguen colgando de RN.render.*, así que
 * el resto del código no cambia. Esas vistas se cargan DESPUÉS de este archivo.
 */
RN.render = RN.render || {};

/** Escape HTML. */
RN.render.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
};

/** v5.13.5 (ISSUE #26): Escape de un string para atributos onclick="...('STR')".
 * Escapa comillas simples (contexto JS) y dobles (contexto HTML) para evitar
 * que nombres con " o ' rompan el HTML. */
RN.render.escAttr = function (s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '"');
}

// v5.13.9 (DUP-2): Badge unificado de tipo de pago para cobros del historial.
// Centraliza el patron repetido en render.realizados(), render.reportes() y recibo._html().
// Devuelve HTML con badge consistente: Completo / Parcial (falta) / Con vuelto.
RN.render.badgeTipoPago = function (h) {
  var t = h.tipoPago || 'completo';
  if (t === 'parcial') {
    return '<span class="badge parcial">Parcial \u00b7 Falta ' + RN.calc.formatCUP(h.falta || 0) + '</span>';
  }
  if (t === 'excedente') {
    return '<span class="badge paid">Con vuelto ' + RN.calc.formatCUP(h.excedente || 0) + '</span>';
  }
  return '<span class="badge paid">Completo</span>';
};

/** Badge de estado de cliente. */
RN.render.badgeEstado = function (estado) {
  const map = { ok: ['ok', 'Al día'], warn: ['warn', 'Por vencer'], due: ['due', 'Atrasado'], paid: ['paid', 'Pagado'], parcial: ['parcial', 'Pago parcial'], 'por-iniciar': ['por-iniciar', 'Por iniciar'], inactivo: ['muted', 'Inactivo'], admin: ['admin', 'Administrador'] };
  const [cls, txt] = map[estado] || ['muted', estado];
  return `<span class="badge ${cls}">${txt}</span>`;
};

/** Busca plan por id. v5.8.8: el personalizado muestra sus megas si los tiene. */
RN.render.nombrePlan = function (cliente) {
  if (cliente.planId) {
    const p = RN.state.planes.find(pl => pl.id === cliente.planId);
    if (p) return `${RN.render.esc(p.nombre)} · ${p.megas || '?'}M`;
  }
  const m = RN.calc.getMegasCliente(cliente);
  if (RN.calc.esPrecioUSD(cliente)) return `Personalizado · ${m}M · ${+cliente.precioMega} USD/M`;
  return m > 0 ? `Personalizado · ${m}M` : 'Personalizado';
};

/** Alterna la expansión de una tarjeta accordion (cintilla colapsable). */
RN.render.toggleCard = function (cardId) {
  var el = document.getElementById(cardId);
  if (!el) return;
  el.classList.toggle('open');
};

/**
 * v5.12.6 — Compara dos direcciones IP (IPv4) en orden natural numérico.
 * Convierte cada octeto a número para que 10.10.10.2 vaya antes que
 * 10.10.10.10 (a diferencia del orden alfabético de strings).
 * Soporta IPs parciales (1, 2 o 3 octetos) comparando octeto a octeto;
 * los octetos ausentes se tratan como 0.
 * @returns {number} -1, 0, 1 (estilo sort)
 */
RN.render.compararIP = function (a, b) {
  var pa = String(a || '').split('.');
  var pb = String(b || '').split('.');
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var na = parseInt(pa[i], 10);
    var nb = parseInt(pb[i], 10);
    if (isNaN(na)) na = 0;
    if (isNaN(nb)) nb = 0;
    if (na !== nb) return na - nb;
  }
  return 0;
};

/**
 * v5.12.6 — Compara dos clientes por IP (orden natural de IP).
 * Los clientes SIN ip van al final. Entre los que no tienen ip, se
 * ordenan por nombre (ascendente) como criterio secundario estable.
 * @returns {number} -1, 0, 1 (estilo sort)
 */
RN.render.compararClientePorIP = function (a, b) {
  var aIp = a && a.ip ? String(a.ip).trim() : '';
  var bIp = b && b.ip ? String(b.ip).trim() : '';
  if (!aIp && !bIp) {
    // Sin IP ambos: orden por nombre
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  }
  if (!aIp) return 1;   // a sin IP → va al final
  if (!bIp) return -1;  // b sin IP → va al final
  return RN.render.compararIP(aIp, bIp);
};

/** Render completo: refresca todas las vistas. */
RN.render.todo = function () {
  ['dashboard', 'clientes', 'cobros', 'realizados', 'caja', 'inversion', 'deudas', 'inventario', 'gastos', 'reportes', 'calendario', 'descuentos', 'salud', 'margen', 'morosos', 'incidencias'].forEach(v => {
    RN.render.vista(v);
  });
  RN.config.rellenarForm();
  // v5.12.7: refrescar el indicador visual de estado de la tasa en Ajustes
  if (RN.tasaAviso) RN.tasaAviso.actualizarIndicador();
  RN.storageFile.actualizarStatus();
};

/** Render de una vista específica. */
RN.render.vista = function (view) {
  switch (view) {
    case 'dashboard': RN.render.dashboard(); break;
    case 'clientes': RN.render.clientes(); break;
    case 'cobros': RN.render.cobros(); break;
    case 'realizados': RN.render.realizados(); break;
    case 'inversion': RN.render.inversion(); break;
    case 'caja': RN.render.caja && RN.render.caja(); break;
    case 'deudas': RN.render.deudas && RN.render.deudas(); break;
    case 'inventario': RN.render.inventario(); break;
    case 'gastos': RN.render.gastos(); break;
    case 'reportes': RN.render.reportes(); break;
    case 'calendario': RN.calendario && RN.calendario.render(); break;
    case 'descuentos': RN.descuentosView && RN.descuentosView.render(); break;
    case 'salud': RN.salud && RN.salud.render(); break;
    case 'margen': RN.margenClientes && RN.margenClientes.render(); break;
    case 'morosos': RN.lifecycle && RN.lifecycle.renderPanel(); break;
    case 'incidencias': RN.incidencias && RN.incidencias.render(); break;
    case 'red': RN.render.red && RN.render.red(); break;
  }
};

/** Vista Red: capacidad Limit At + accesos a comandos MikroTik (v5.54). */
RN.render.red = function () {
  // v5.55.19 — Estado · Alertas · Planificación · MikroTik
  var hero = document.getElementById('red-estado');
  var kpi = document.getElementById('kpi-red');
  var alertZone = document.getElementById('red-alertas-zone');
  var alertBox = document.getElementById('red-alertas');
  var planBox = document.getElementById('red-planificacion');
  var mtBox = document.getElementById('red-mikrotik');
  var legacy = document.getElementById('panel-red-capacidad');

  if (!RN.cola) {
    if (hero) hero.innerHTML = '<p class="muted">Módulo de colas no disponible.</p>';
    return;
  }

  var cap = null;
  try {
    cap = (RN.calc && RN.calc.estadoCapacidad) ? RN.calc.estadoCapacidad() : RN.cola.estadoCapacidad();
  } catch (e) {
    cap = null;
  }

  var txtM = RN.cola.txtM || function (v) { return (Math.round((+v || 0) * 100) / 100) + 'M'; };

  // Empty / no config
  if (!cap || !(cap.tope > 0 || cap.paquete > 0)) {
    var empty = '<div class="acc-empty" style="padding:12px"><div class="icon">📡</div>'
      + '<p>Configura el <strong>paquete del proveedor</strong> y la cola padre en Ajustes.</p>'
      + '<button type="button" class="btn sm primary" style="margin-top:8px" onclick="RN.cola.abrirAjustes()">Abrir reglas Limit At</button></div>';
    if (hero) hero.innerHTML = empty;
    if (kpi) kpi.innerHTML = '';
    if (alertZone) alertZone.style.display = 'none';
    if (planBox) planBox.innerHTML = '<p class="muted" style="font-size:13px">Sin datos de capacidad.</p>';
    if (mtBox) mtBox.innerHTML = '<p class="muted" style="font-size:13px">Configura la red para generar scripts.</p>';
    if (legacy) legacy.innerHTML = '';
    return;
  }

  var pct = cap.pctReal != null ? cap.pctReal : (cap.pct || 0);
  var estadoCls = cap.excedido ? 'is-bad' : (cap.aviso ? 'is-warn' : 'is-ok');
  var fillCls = cap.excedido ? 'bad' : (cap.aviso ? 'warn' : 'ok');
  var estadoTxt = cap.excedido ? 'Excedido' : (cap.aviso ? 'Cerca del tope' : 'Capacidad ok');
  var barW = Math.min(100, Math.max(1, pct));

  // --- Hero ---
  if (hero) {
    hero.innerHTML =
      '<div class="red-hero">' +
        '<div class="muted" style="font-size:12px;font-weight:600">Uso del tope (suma Limit At)</div>' +
        '<div class="red-pct ' + estadoCls + '">' + pct + '%</div>' +
        '<div class="red-sub"><strong>' + txtM(cap.comprometido) + '</strong> comprometidos / <strong>' + txtM(cap.tope) + '</strong> tope · ' + estadoTxt + '</div>' +
        '<div class="red-cap-bar"><div class="red-cap-fill ' + fillCls + '" style="width:' + barW + '%"></div></div>' +
        '<div class="muted" style="font-size:12px">' +
          (cap.paquete || 0) + 'M paquete' + (cap.plus > 0 ? ' + ' + cap.plus + 'M plus' : '') +
          ' − ' + (cap.reserva || 0) + 'M reserva · margen <strong>' + txtM(cap.margen) + '</strong>' +
        '</div>' +
        '<div class="red-hero-actions">' +
          '<button type="button" class="btn primary" onclick="RN.cola.abrirResumen()">Resumen detallado</button>' +
          '<button type="button" class="btn" onclick="RN.cola.abrirAjustes()">Reglas Limit At</button>' +
        '</div>' +
      '</div>';
  }

  // --- KPIs ---
  if (kpi) {
    var nCola = 0;
    try {
      nCola = (RN.cola.clientesConCola && RN.cola.clientesConCola().length) || 0;
    } catch (e2) { nCola = 0; }
    var kpis = [
      { label: 'Comprometido', value: txtM(cap.comprometido), cls: cap.excedido ? 'red' : 'blue' },
      { label: 'Margen libre', value: txtM(cap.margen), cls: cap.excedido ? 'red' : (cap.aviso ? 'amber' : 'green') },
      { label: 'Clientes en cola', value: String(nCola), cls: 'blue' },
      { label: 'Estado', value: estadoTxt, cls: cap.excedido ? 'red' : (cap.aviso ? 'amber' : 'green') }
    ];
    kpi.innerHTML = kpis.map(function (k) {
      var fs = k.label === 'Estado' ? ' style="font-size:14px"' : '';
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value"' + fs + '>' + k.value + '</div></div>';
    }).join('');
  }

  // --- Alertas: excedido, sin Limit At, top consumidores, sin IP ---
  var alertas = [];
  if (cap.excedido) {
    alertas.push({ tipo: 'bad', txt: 'Te pasas del tope por ' + txtM(-cap.margen) + '. Baja Limit At o sube el paquete/reserva.' });
  } else if (cap.aviso) {
    alertas.push({ tipo: 'warn', txt: 'Cerca del tope (≥80%). Revisa altas nuevas antes de vender más.' });
  }
  if (cap.sinLimitAt && cap.sinLimitAt.length) {
    alertas.push({ tipo: 'warn', txt: 'Sin Limit At (no suman al tope): ' + cap.sinLimitAt.slice(0, 6).join(', ') + (cap.sinLimitAt.length > 6 ? '…' : '') });
  }

  // Top Limit At
  var top = [];
  try {
    (RN.calc.clientesEnRed ? RN.calc.clientesEnRed() : (RN.state.clients || [])).forEach(function (c) {
      if (!RN.cola.tieneCola(c)) return;
      var d = RN.cola.datos(c);
      if (d.limitAtKbps > 0) top.push({ c: c, kbps: d.limitAtKbps, nombre: c.nombre || '—' });
    });
    top.sort(function (a, b) { return b.kbps - a.kbps; });
    top = top.slice(0, 6);
  } catch (e3) { top = []; }

  // Omitidos script (sin IP etc.)
  var omitidosPreview = [];
  try {
    var scr = RN.cola.scriptCompleto({ estilo: (RN.state.config && RN.state.config.colaEstiloComando) || 'upsert' });
    omitidosPreview = scr.omitidos || [];
  } catch (e4) { omitidosPreview = []; }

  if (omitidosPreview.length) {
    alertas.push({
      tipo: 'warn',
      txt: omitidosPreview.length + ' cliente(s) omitidos del script (IP o datos inválidos).'
    });
  }

  if (alertZone && alertBox) {
    if (!alertas.length && !top.length) {
      alertZone.style.display = 'none';
      alertBox.innerHTML = '';
    } else {
      alertZone.style.display = '';
      var h = '';
      alertas.forEach(function (a) {
        var col = a.tipo === 'bad' ? 'var(--danger)' : 'var(--warn)';
        h += '<div style="font-size:13px;margin-bottom:8px;color:' + col + '">' + RN.render.esc(a.txt) + '</div>';
      });
      if (top.length) {
        h += '<div class="muted" style="font-size:12px;font-weight:600;margin:8px 0 4px">Mayor Limit At</div>';
        top.forEach(function (t) {
          h += '<div class="acc-row" style="padding:6px 0;border-bottom:1px solid var(--border)">'
            + '<span class="acc-label">' + RN.render.esc(t.nombre) + '</span>'
            + '<span class="acc-value">' + RN.cola.formatoVel(t.kbps) + '</span></div>';
        });
      }
      alertBox.innerHTML = h;
    }
  }

  // --- Planificación: cuántos caben ---
  if (planBox) {
    var caben = [];
    try {
      caben = RN.cola.cuantosCaben(cap.excedido ? 0 : cap.margenKbps) || [];
    } catch (e5) { caben = []; }
    if (!caben.length) {
      planBox.innerHTML = '<p class="muted" style="font-size:13px">' +
        (cap.excedido
          ? 'Sin margen libre: no caben clientes adicionales con el tope actual.'
          : 'No hay planes con megas para estimar cuántos caben.') + '</p>';
    } else {
      planBox.innerHTML = '<p class="muted" style="font-size:12px;margin:0 0 8px">Con el margen libre actual, estimación por plan:</p>' +
        caben.map(function (x) {
          return '<div class="acc-row" style="padding:6px 0;border-bottom:1px solid var(--border)">'
            + '<span class="acc-label">' + RN.render.esc(x.nombre) + ' · ' + x.megas + 'M</span>'
            + '<span class="acc-value"><strong>' + x.caben + '</strong> más</span></div>';
        }).join('') +
        '<p class="muted" style="font-size:11px;margin:8px 0 0">Informativo: ' + txtM(cap.vendidos) + ' vendidos'
        + (cap.relacionVenta > 0 ? ' (relación ' + cap.relacionVenta + ' a 1)' : '')
        + (cap.megasAdmin > 0 ? ' · ' + txtM(cap.megasAdmin) + ' admin' : '') + '</p>';
    }
  }

  // --- MikroTik ---
  if (mtBox) {
    var estilo = (RN.state.config && RN.state.config.colaEstiloComando) || 'upsert';
    var nInc = 0;
    try {
      var s2 = RN.cola.scriptCompleto({ estilo: estilo });
      nInc = s2.incluidos || 0;
      omitidosPreview = s2.omitidos || omitidosPreview;
    } catch (e6) {}

    var omHtml = '';
    if (omitidosPreview.length) {
      omHtml = '<div style="margin-top:10px"><div class="muted" style="font-size:12px;font-weight:600">Omitidos del script</div>' +
        omitidosPreview.slice(0, 8).map(function (o) {
          return '<div class="acc-row" style="padding:4px 0"><span class="acc-label">' + RN.render.esc(o.nombre) + '</span>'
            + '<span class="acc-value muted" style="font-size:12px">' + RN.render.esc(o.motivo) + '</span></div>';
        }).join('') + '</div>';
    }

    mtBox.innerHTML =
      '<p class="muted" style="font-size:13px;margin:0 0 10px">Genera comandos <code>/queue simple</code> para pegar en Winbox. Haz <strong>backup</strong> antes de aplicar.</p>' +
      '<div class="flex wrap" style="gap:8px;margin-bottom:8px">' +
        '<button type="button" class="btn primary" onclick="RN.cola.copiarScriptVista(\'upsert\')">Copiar script (upsert)</button>' +
        '<button type="button" class="btn" onclick="RN.cola.copiarScriptVista(\'simple\')">Copiar estilo export</button>' +
        '<button type="button" class="btn" onclick="RN.cola.abrirResumen()">Ver en resumen</button>' +
      '</div>' +
      '<p class="muted" style="font-size:12px">Estilo actual en config: <strong>' + RN.render.esc(estilo) + '</strong> · ~' + nInc + ' colas en el script</p>' +
      omHtml +
      '<p class="muted" style="font-size:11px;margin-top:10px">Equipos instalados en el cliente se gestionan desde la ficha del cliente.</p>';
  }

  if (legacy) {
    legacy.innerHTML = '';
  }

  // Nodos (jerarquía + recomendación de equipo)
  var nodosBox = document.getElementById('red-nodos');
  if (nodosBox && RN.nodos && RN.nodos.renderPanel) {
    RN.nodos.renderPanel(nodosBox);
  } else if (nodosBox) {
    nodosBox.innerHTML = '<p class="muted">Módulo de nodos no cargado.</p>';
  }
};

// ---------- DASHBOARD ----------

/**
 * v5.13.6 (CODE-6): Descripción reutilizable del paquete del proveedor
 * en formato "Mm × P CUP/M". Evita duplicar esta construcción de string
 * en el KPI "Costo del paquete" y en el widget del proveedor.
 * @returns {string} Descripción del paquete o '' si no hay config.
 */
RN.render.descPaquete = function () {
  var m = RN.state.config.proveedorMegas || 0;
  var p = RN.state.config.proveedorPrecioMega || 0;
  return m + 'M × ' + p + ' CUP/M';
};

/**
 * v5.12.6 — Construye el texto "sub" de una tarjeta KPI con el equivalente
 * en USD (en letras pequeñas) cuando hay tasa configurada. Si ya hay un sub
 * textual, lo antepone. Si no hay tasa, devuelve el sub original.
 * @param {number} cup - monto en CUP
 * @param {string} subTxt - texto descriptivo original (opcional)
 * @returns {string} HTML para el div .sub
 */
RN.render.subUSD = function (cup, subTxt) {
  var usd = RN.moneda.aUSD(cup);
  var parts = [];
  if (subTxt) parts.push(RN.render.esc(subTxt));
  // v5.13.6 (UI-6): envolver el USD en un badge visual distintivo.
  if (usd) parts.push('<span class="usd-badge">≈ ' + usd + ' USD</span>');
  return parts.join(' ');
};

/**
 * v5.12.6 — Genera el HTML de la barra horizontal animada de recuperación
 * de la inversión, con los datos resumidos (invertido, recuperado, %, faltante).
 * Reutiliza los estilos .recup-* definidos en styles.css.
 * @returns {string} HTML del bloque
 */
RN.render.barraRecuperacion = function (inv, rec, pctParam, opts) {
  // v5.13.6 (DUP-3): acepta valores pre-calculados para evitar recalcular.
  // Si no se pasan, calcula aquí (compatibilidad con llamadas externas).
  var invertido = (inv !== undefined) ? inv : RN.investment.totalInvertido();
  var recuperado = (rec !== undefined) ? rec : RN.investment.totalRecuperado();
  var pct = (pctParam !== undefined) ? pctParam : RN.investment.porcentajeRecuperacion();
  // v5.32.0: opts permite reutilizar esta misma barra para otros totales
  // (ej. deudas personales) cambiando solo los textos, sin duplicar el HTML.
  opts = opts || {};
  var icono = opts.icono || '📈';
  var titulo = opts.titulo || 'Recuperación de la inversión';
  var labelInvertido = opts.labelInvertido || 'Invertido';
  var labelRecuperado = opts.labelRecuperado || 'Recuperado';
  var labelFaltante = opts.labelFaltante || 'Por recuperar';
  var textoVacio = opts.textoVacio || 'Sin inversiones registradas';
  var textoCompleto = opts.textoCompleto || '✓ Inversión recuperada';
  var textoProceso = opts.textoProceso || 'En proceso de recuperación';
  var avisoCosto = (opts.avisoCosto !== false); // por defecto muestra el aviso de costo de mega sin configurar

  // v5.52.6: el capital recuperado se cierra en 100 %. Lo que pase de ahí
  // es ganancia extra del negocio, no "más recuperación".
  var recuperadoBruto = +(recuperado || 0);
  var recuperadoCapital = Math.min(recuperadoBruto, invertido); // tope = capital
  var excedente = Math.max(0, +(recuperadoBruto - invertido).toFixed(2));
  var pctReal = invertido > 0 ? +((recuperadoBruto / invertido) * 100).toFixed(1) : 0;
  // % mostrado nunca pasa de 100 (capital ya cubierto)
  var pct = Math.min(100, Math.max(0, pctReal));
  var pctVisual = pct;
  var faltante = Math.max(0, +(invertido - recuperadoCapital).toFixed(2));
  // Para la UI usamos el capital recuperado (topeado), no el bruto
  recuperado = recuperadoCapital;

  // Color de la barra según progreso
  var cls = 'recup-green';
  if (pct >= 100) cls = 'recup-green';
  else if (pct >= 60) cls = 'recup-green';
  else if (pct >= 30) cls = 'recup-amber';
  else cls = 'recup-red';

  var estadoTxt;
  if (invertido <= 0) estadoTxt = '<span class="muted">' + textoVacio + '</span>';
  else if (pct >= 100) {
    estadoTxt = '<span style="color:var(--green)">' + textoCompleto + '</span>';
    if (excedente > 0.009 && avisoCosto !== false) {
      // Solo en barra de inversión (no en deudas): mostrar ganancia extra
      estadoTxt += ' <span class="muted" style="font-size:12px">· Ganancia extra ' + RN.calc.formatCUP(excedente) + '</span>';
    }
  } else {
    estadoTxt = '<span class="muted">' + textoProceso + '</span>';
  }

  // v5.13.4: Bug #17 - Advertencia visible cuando no hay precio de proveedor
  // configurado. Sin ese dato, el margen y el % de recuperacion se calculan
  // asumiendo costo 0, por lo que estan inflados. La auditoria v5.13.0 (Bug #17)
  // pedia que la UI advirtiera al usuario; la funcion costoMegaConfigurado()
  // ya existia desde v5.13.1 pero no se usaba en la UI.
  // v5.32.0: solo aplica a la barra de inversión (avisoCosto=false para deudas,
  // que no dependen del costo del mega).
  var sinCosto = avisoCosto && !RN.investment.costoMegaConfigurado();

  var html = '';
  html += '<div class="recup-card">';
  html += '  <div class="recup-head">';
  html += '    <div class="recup-titulo"><span class="recup-ico">' + icono + '</span> <strong>' + titulo + '</strong></div>';
  html += '    <div class="recup-pct"><strong>' + pct + '%</strong>' + (sinCosto ? ' <span class="muted" style="font-size:11px">(estimado)</span>' : '') + '</div>';
  html += '  </div>';
  html += '  <div class="recup-bar"><div class="recup-fill ' + cls + '" data-pct="' + pctVisual + '" style="width:0%"></div></div>';
  html += '  <div class="recup-datos">';
  html += '    <div class="recup-dato"><span class="muted">' + labelInvertido + '</span><strong>' + RN.calc.formatCUP(invertido) + '</strong></div>';
  html += '    <div class="recup-dato"><span class="muted">' + labelRecuperado + '</span><strong style="color:var(--green)">' + RN.calc.formatCUP(recuperado) + '</strong></div>';
  html += '    <div class="recup-dato"><span class="muted">' + labelFaltante + '</span><strong style="color:var(--danger)">' + RN.calc.formatCUP(faltante) + '</strong></div>';
  html += '  </div>';
  html += '  <div class="recup-estado">' + estadoTxt + '</div>';
  if (sinCosto) {
    html += '  <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:12px;color:var(--warn)">';
    html += '    \u26a0\ufe0f El % de recuperación está <strong>inflado</strong>: no hay precio de proveedor por mega configurado, por lo que el margen se calcula asumiendo costo 0. Configura el precio del mega en Ajustes \u2192 Proveedor para ver la recuperación real.';
    html += '  </div>';
  }
  html += '</div>';
  return html;
};

/**
 * v5.12.6 — Dispara la animación de las barras de recuperación presentes
 * en el DOM. Busca todos los .recup-fill con data-pct y anima el ancho
 * desde 0% hasta el valor objetivo usando requestAnimationFrame.
 */
RN.render.animarBarrasRecuperacion = function () {
  var barras = document.querySelectorAll('.recup-fill[data-pct]');
  barras.forEach(function (barra) {
    var objetivo = parseFloat(barra.getAttribute('data-pct')) || 0;
    if (objetivo <= 0) { barra.style.width = '0%'; return; }
    var inicio = null;
    var duracion = 900; // ms
    function paso(ts) {
      if (!inicio) inicio = ts;
      var progreso = Math.min(1, (ts - inicio) / duracion);
      // ease-out cubic
      var eased = 1 - Math.pow(1 - progreso, 3);
      barra.style.width = (objetivo * eased) + '%';
      if (progreso < 1) requestAnimationFrame(paso);
      else barra.style.width = objetivo + '%';
    }
    requestAnimationFrame(paso);
  });
};
