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
  const map = { ok: ['ok', 'Al día'], warn: ['warn', 'Por vencer'], due: ['due', 'Atrasado'], paid: ['paid', 'Pagado'], parcial: ['parcial', 'Pago parcial'], 'por-iniciar': ['por-iniciar', 'Por iniciar'], inactivo: ['muted', 'Inactivo'] };
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
  ['dashboard', 'clientes', 'cobros', 'realizados', 'inversion', 'inventario', 'gastos', 'reportes', 'calendario', 'descuentos', 'salud'].forEach(v => {
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
    case 'inventario': RN.render.inventario(); break;
    case 'gastos': RN.render.gastos(); break;
    case 'reportes': RN.render.reportes(); break;
    case 'calendario': RN.calendario && RN.calendario.render(); break;
    case 'descuentos': RN.descuentosView && RN.descuentosView.render(); break;
    case 'salud': RN.salud && RN.salud.render(); break;
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

  // Limitar el ancho visual a 100% aunque el % supere 100 (recuperada)
  var pctVisual = Math.min(100, Math.max(0, pct));
  var faltante = Math.max(0, +(invertido - recuperado).toFixed(2));

  // Color de la barra según progreso
  var cls = 'recup-green';
  if (pct >= 100) cls = 'recup-green';
  else if (pct >= 60) cls = 'recup-green';
  else if (pct >= 30) cls = 'recup-amber';
  else cls = 'recup-red';

  var estadoTxt;
  if (invertido <= 0) estadoTxt = '<span class="muted">' + textoVacio + '</span>';
  else if (pct >= 100) estadoTxt = '<span style="color:var(--green)">' + textoCompleto + '</span>';
  else estadoTxt = '<span class="muted">' + textoProceso + '</span>';

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
