/**
 * ui/render.js — Render principal de tablas/tarjetas de clientes y vistas.
 * Depende de calculations.js (usa funciones de cálculo).
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
RN.render.barraRecuperacion = function (inv, rec, pctParam) {
  // v5.13.6 (DUP-3): acepta valores pre-calculados para evitar recalcular.
  // Si no se pasan, calcula aquí (compatibilidad con llamadas externas).
  var invertido = (inv !== undefined) ? inv : RN.investment.totalInvertido();
  var recuperado = (rec !== undefined) ? rec : RN.investment.totalRecuperado();
  var pct = (pctParam !== undefined) ? pctParam : RN.investment.porcentajeRecuperacion();
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
  if (invertido <= 0) estadoTxt = '<span class="muted">Sin inversiones registradas</span>';
  else if (pct >= 100) estadoTxt = '<span style="color:var(--green)">✓ Inversión recuperada</span>';
  else estadoTxt = '<span class="muted">En proceso de recuperación</span>';

  // v5.13.4: Bug #17 - Advertencia visible cuando no hay precio de proveedor
  // configurado. Sin ese dato, el margen y el % de recuperacion se calculan
  // asumiendo costo 0, por lo que estan inflados. La auditoria v5.13.0 (Bug #17)
  // pedia que la UI advirtiera al usuario; la funcion costoMegaConfigurado()
  // ya existia desde v5.13.1 pero no se usaba en la UI.
  var sinCosto = !RN.investment.costoMegaConfigurado();

  var html = '';
  html += '<div class="recup-card">';
  html += '  <div class="recup-head">';
  html += '    <div class="recup-titulo"><span class="recup-ico">📈</span> <strong>Recuperación de la inversión</strong></div>';
  html += '    <div class="recup-pct"><strong>' + pct + '%</strong>' + (sinCosto ? ' <span class="muted" style="font-size:11px">(estimado)</span>' : '') + '</div>';
  html += '  </div>';
  html += '  <div class="recup-bar"><div class="recup-fill ' + cls + '" data-pct="' + pctVisual + '" style="width:0%"></div></div>';
  html += '  <div class="recup-datos">';
  html += '    <div class="recup-dato"><span class="muted">Invertido</span><strong>' + RN.calc.formatCUP(invertido) + '</strong></div>';
  html += '    <div class="recup-dato"><span class="muted">Recuperado</span><strong style="color:var(--green)">' + RN.calc.formatCUP(recuperado) + '</strong></div>';
  html += '    <div class="recup-dato"><span class="muted">Por recuperar</span><strong style="color:var(--danger)">' + RN.calc.formatCUP(faltante) + '</strong></div>';
  html += '  </div>';
  html += '  <div class="recup-estado">' + estadoTxt + '</div>';
  if (sinCosto) {
    html += '  <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:12px;color:#e6a700">';
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

RN.render.dashboard = function () {
  const cont = document.getElementById('kpi-dashboard');
  if (!cont) return;
  // v5.13.20: El mes operativo SIEMPRE es el mes real del reloj.
  // Ya no hay comparacion mesAct vs mesReal porque siempre son iguales.
  const mesOper = document.getElementById('dashboard-mes');
  if (mesOper) {
    const mesAct = RN.calc.mesActualStr();
    mesOper.innerHTML = 'Mes: <strong>' + RN.calc.mesTexto(mesAct) + '</strong>';
    mesOper.className = 'mes-badge muted';
  }
  const cob = RN.calc.cobranzaMes();
  const ingresos = RN.calc.ingresosMes();
  const gastos = RN.calc.gastosMes();
  const utilidad = ingresos - gastos;
  const esperado = RN.calc.ingresoEsperadoMes();
  // v5.13.6 (BUG-5): tasa de cobro basada en ingresos de SERVICIO del mes
  // (sin equipo ni mora de otros meses) para que no supere 100% de forma
  // enga\u00f1osa. Antes usaba ingresosMes() que incluye h.montoEquipo.
  const ingresoServMes = RN.calc.ingresosServicioMes();
  const tasaCob = esperado ? Math.round(ingresoServMes / esperado * 100) : 0;
  // v5.13.6 (DUP-1): cachear clientesActivos() una sola vez.
  // Antes se llamaba 2 veces (aquí y en el resumen) + 1 dentro de cobranzaMes.
  const activos = RN.calc.clientesActivos();
  // v5.10.5: mora real = clientes con meses de atraso (getMora > 0).
  const morosos = activos.filter(c => RN.calc.getMora(c) > 0).length;

  const parciales = cob.parciales || 0;
  const fondoCaja = RN.calc.fondoCaja();
  // v5.12.3: costo del paquete del proveedor y ganancia bruta del mes
  const costoPaquete = RN.calc.montoPaqueteProveedor();
  const gananciaBruta = ingresos - costoPaquete;
  // v5.12.6: ganancia proyectada del mes = ingreso esperado (lo que deberían
  // pagar todos los clientes activos) − costo del paquete del proveedor.
  const gananciaProyectada = esperado - costoPaquete;
  // v5.10.4: KPIs clicables. Cobranza, Clientes morosos y Fondo de caja
  // abren ventanas superpuestas al hacer click. Las demas no son clicables.
  // v5.12.6 (propuesta A): orden lógico — esperado antes que real.
  //   Ingresos del mes → Costo del paquete → Ganancia proyectada
  //   → Ganancia del mes (real cobrada) → Utilidad neta → ...
  // v5.12.6: todas las tarjetas con monto CUP muestran su equivalente en USD
  // (en letras pequeñas) cuando hay tasa configurada.
  // v5.15.1: las 4 primeras tarjetas son clicables y abren un resumen:
  //   Ingresos del mes      -> resumen de ingresos (por concepto y por corte)
  //   Costo del paquete     -> modal 📡 Gestionar servicio (RN.paqueteProveedor)
  //   Ganancia proyectada   -> resumen de la ganancia esperada por corte
  //   Ganancia del mes      -> resumen de la ganancia real cobrada por corte
  // v5.16.0: cada KPI con monto muestra su variación ▲/▼ vs el mes anterior
  // (RN.panelWidgets.deltaHTML). Los gastos se comparan invertidos (bajar = bueno).
  const mesAnt = RN.calc.mesAnterior(RN.calc.mesActualStr());
  const ingresosAnt = RN.calc.ingresosMes(mesAnt);
  const gastosAnt = RN.calc.gastosMes(mesAnt);
  const utilidadAnt = ingresosAnt - gastosAnt;
  const esperadoAnt = RN.calc.ingresoEsperadoMes(mesAnt);
  const gananciaProyAnt = esperadoAnt - costoPaquete;
  const gananciaBrutaAnt = ingresosAnt - costoPaquete;
  const delta = (RN.panelWidgets && RN.panelWidgets.deltaHTML) ? RN.panelWidgets.deltaHTML : function () { return ''; };
  const kpis = [
    { label: 'Ingresos del mes', value: RN.calc.formatCUP(ingresos), sub: RN.render.subUSD(ingresos, 'Toca para ver el resumen') + delta(ingresos, ingresosAnt), cls: 'green', click: 'RN.ingresosMes.abrir()' },
    { label: 'Costo del paquete', value: RN.calc.formatCUP(costoPaquete), sub: costoPaquete > 0 ? RN.render.subUSD(costoPaquete, RN.render.descPaquete()) : 'Sin paquete configurado', cls: 'amber', click: 'RN.paqueteProveedor.abrir()' },
    { label: 'Ganancia proyectada del mes', value: RN.calc.formatCUP(gananciaProyectada), sub: RN.render.subUSD(gananciaProyectada, 'Ingreso esperado − Costo del paquete') + delta(gananciaProyectada, gananciaProyAnt), cls: gananciaProyectada >= 0 ? 'green' : 'red', click: 'RN.gananciaCortes.abrirProyectada()' },
    { label: 'Ganancia del mes', value: RN.calc.formatCUP(gananciaBruta), sub: RN.render.subUSD(gananciaBruta, 'Cobrado − Costo del paquete') + delta(gananciaBruta, gananciaBrutaAnt), cls: gananciaBruta >= 0 ? 'blue' : 'red', click: 'RN.gananciaCortes.abrirReal()' },
    { label: 'Utilidad neta', value: RN.calc.formatCUP(utilidad), sub: RN.render.subUSD(utilidad, 'Ingresos − Gastos — toca para ver el detalle') + delta(utilidad, utilidadAnt), cls: utilidad >= 0 ? 'blue' : 'red', click: 'RN.utilidadMes.abrir()' },
    { label: 'Cobranza', value: cob.pagaron + '/' + cob.total, sub: 'Faltan ' + cob.faltan + ' clientes' + (parciales ? ' · ' + parciales + ' parcial' : '') + ' — toca para ver corte vigente', cls: 'blue', click: 'RN.cobranza.abrir()' },
    { label: 'Tasa de cobro', value: tasaCob + '%', sub: 'Servicio cobrado sobre lo esperado', cls: tasaCob >= 70 ? 'green' : (tasaCob >= 40 ? 'amber' : 'red') },
    { label: 'Clientes morosos', value: morosos, sub: morosos ? 'Atrasados — toca para ver detalles' : 'Ninguno atrasado', cls: morosos ? 'red' : 'green', click: 'RN.mora.abrir()' },
    { label: 'Fondo de caja', value: RN.calc.formatCUP(fondoCaja), sub: RN.render.subUSD(fondoCaja, 'Dos bolsillos (reserva + libre) — toca para retirar'), cls: fondoCaja > 0 ? 'green' : (fondoCaja < 0 ? 'red' : 'muted'), click: 'RN.caja.extraer()' }
  ];
  cont.innerHTML = kpis.map(k => {
    const attr = k.click ? ` role="button" tabindex="0" onclick="${k.click}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${k.click}}" class="kpi ${k.cls} kpi-click"` : ` class="kpi ${k.cls}"`;
    return `<div${attr}><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`;
  }).join('');
  // v5.13.6 (DUP-3): cachear funciones de inversión una sola vez.
  // Antes totalInvertido() se llamaba 4x, totalRecuperado() 3x y
  // porcentajeRecuperacion() 2x (cada una recalcula internamente).
  const totalInv = RN.investment.totalInvertido();
  const recInv = RN.investment.totalRecuperado();
  const pctRecup = totalInv ? +(recInv / totalInv * 100).toFixed(1) : 0;
  const res = document.getElementById('dashboard-resumen');
  if (res) {
    res.innerHTML = `
      <div class="flex wrap" style="gap:24px">
        <div><strong>Clientes activos:</strong> ${activos.length}</div>
        <div><strong>Planes:</strong> ${RN.state.planes.length}</div>
        <div><strong>Inversión recuperada:</strong> ${pctRecup}%${RN.investment.costoMegaConfigurado() ? '' : ' <span class="muted" style="font-size:12px">(estimado, sin costo de proveedor)</span>'}</div>
        <div><strong>Predicción próximo mes:</strong> ${RN.calc.formatCUP(RN.calc.prediccionIngresos())}</div>
      </div>`;
  }

  // v5.12.6: Barra animada de recuperación de la inversión.
  // Se oculta la card completa si no hay inversiones registradas.
  const recupEl = document.getElementById('dashboard-recuperacion');
  const recupCard = document.getElementById('card-recuperacion');
  if (recupEl && recupCard) {
    if (totalInv > 0) {
      recupCard.style.display = '';
      recupEl.innerHTML = RN.render.barraRecuperacion(totalInv, recInv, pctRecup);
    } else {
      // v5.13.6 (UI-3): estado vacío en vez de ocultar la card completamente.
      recupCard.style.display = '';
      recupEl.innerHTML = '<div class="acc-empty"><div class="icon">💰</div>No hay inversiones registradas aún. <button class="btn sm primary" style="margin-top:8px" onclick="RN.investment.abrirModal()">Registrar inversión</button></div>';
    }
  }

  // Widget: Pago del servicio de internet al proveedor (v5.8.6)
  const prov = document.getElementById('dashboard-proveedor');
  if (prov) {
    const cfg = RN.state.config;
    // v5.13.6 (DUP-2): reutilizar costoPaquete ya calculado arriba.
    const montoPaquete = costoPaquete;
    const pagoMes = RN.calc.pagoProveedorMes();
    const tieneConfig = montoPaquete > 0 || cfg.proveedorInternet;
    let html = '<div class="prov-widget-head">📡 <strong>Servicio de internet</strong> <span class="muted" style="font-size:11px;font-weight:400">(gestiona y paga aquí)</span></div>';
    if (cfg.proveedorInternet) {
      html += '<div class="prov-widget-row"><span class="muted">Proveedor:</span> <strong>' + RN.render.esc(cfg.proveedorInternet) + '</strong></div>';
    }
    if (cfg.proveedorMegas > 0 || cfg.proveedorPrecioMega > 0) {
      html += '<div class="prov-widget-row"><span class="muted">Paquete:</span> <strong>' + (cfg.proveedorMegas || 0) + ' Megas × ' + (cfg.proveedorPrecioMega || 0) + ' CUP/M = ' + RN.calc.formatCUP(montoPaquete) + '</strong></div>';
    }
    if (pagoMes) {
      const fecha = pagoMes.fecha ? new Date(pagoMes.fecha).toLocaleDateString('es-CU') : '';
      // v5.12.3: Detectar si el paquete config cambio desde el ultimo pago.
      // Mostrar el paquete actual (config) claramente y senalar la diferencia.
      const megasPagados = +pagoMes.megas || 0;
      const precioPagado = +pagoMes.precioMega || 0;
      const paqueteCambio = (megasPagados !== (+cfg.proveedorMegas || 0)) || (precioPagado !== (+cfg.proveedorPrecioMega || 0));
      html += '<div class="prov-widget-row prov-paid"><span class="badge paid">✓ Pagado este mes</span> <span class="muted">' + RN.calc.formatCUP(pagoMes.monto) + ' · ' + fecha + '</span></div>';
      if (paqueteCambio) {
        html += '<div class="prov-widget-row" style="color:#e6a700"><span class="badge warn" style="margin-right:6px">Paquete actualizado</span> <span class="muted">Pagaste ' + megasPagados + 'M × ' + precioPagado + ' CUP/M. El paquete actual es ' + (cfg.proveedorMegas || 0) + 'M × ' + (cfg.proveedorPrecioMega || 0) + ' CUP/M = ' + RN.calc.formatCUP(montoPaquete) + '.</span></div>';
        html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">Gestionar y pagar</button></div>';
      } else {
        html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">Gestionar servicio</button></div>';
      }
    } else if (tieneConfig) {
      html += '<div class="prov-widget-row prov-due"><span class="badge due">Pendiente este mes</span> <span class="muted">' + (montoPaquete > 0 ? 'A pagar: ' + RN.calc.formatCUP(montoPaquete) : 'Configura megas y precio') + '</span></div>';
      html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">📡 Gestionar servicio</button></div>';
    } else {
      html += '<div class="prov-widget-row"><span class="muted">Aún no has registrado el servicio de tu proveedor.</span></div>';
      html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">📡 Registrar mi servicio</button></div>';
    }

    // Indicador de capacidad vendida vs tope (v5.8.7)
    if (cfg.proveedorMegas > 0) {
      const cap = RN.calc.estadoCapacidad();
      const cls = cap.excedido ? 'bar-red' : (cap.pct >= 80 ? 'bar-amber' : 'bar-green');
      const estadoTxt = cap.excedido
        ? '<span style="color:#c62828">⚠ Excedido</span>'
        : (cap.pct >= 80 ? '<span style="color:#e6a700">Cerca del tope</span>' : '<span style="color:#2e7d32">✓ Capacidad ok</span>');
      html += '<div class="prov-cap">';
      html += '<div class="prov-cap-label"><span class="muted">Capacidad de red</span> <strong>' + cap.vendidos + 'M vendidos / ' + cap.tope + 'M</strong> (' + cap.pct + '%) ' + estadoTxt + '</div>';
      html += '<div class="prov-cap-bar"><div class="prov-cap-fill ' + cls + '" style="width:' + (cap.pct || 1) + '%"></div></div>';
      html += '<div class="prov-cap-sub muted">' + cap.paquete + 'M paquete + ' + cap.sobreventa + 'M sobreventa = ' + cap.tope + 'M tope vendible</div>';
      html += '</div>';
    }

    // v5.12.4: Aviso de paquete pendiente para el próximo mes
    if (cfg.paquetePendiente) {
      const pp = cfg.paquetePendiente;
      const mesProx = RN.calc.mesSiguiente(RN.calc.mesActualStr());
      html += '<div class="prov-widget-row" style="color:#1565c0;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">';
      html += '<span class="badge" style="background:#e3f2fd;color:#1565c0;margin-right:6px">⏳ Pendiente para ' + RN.calc.mesTexto(mesProx) + '</span>';
      html += '<span class="muted">Próximo paquete: ' + (pp.megas || 0) + 'M × ' + (pp.precioMega || 0) + ' CUP/M';
      if (pp.sobreventa !== undefined) html += ' · sobreventa ' + pp.sobreventa + 'M';
      html += '. Se aplicará al cerrar el mes.</span></div>';
    }
    prov.innerHTML = html;
  }

  // v5.10.4: El widget grande "💵 Fondo de caja" se elimina del panel principal.
  // El acceso al fondo de caja (retiros) ahora se hace desde la KPI clicable.

  // v5.12.6: disparar la animación de las barras de recuperación tras pintarlas.
  // requestAnimationFrame asegura que el DOM ya tenga width:0% antes de animar.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(RN.render.animarBarrasRecuperacion);
  } else {
    RN.render.animarBarrasRecuperacion();
  }

  // v5.16.0: widgets enriquecidos del Panel (tendencia, atención, cortes,
  // rentabilidad y caja proyectada). Se renderizan al final para no bloquear
  // los KPIs si algún widget fallara.
  if (RN.panelWidgets && RN.panelWidgets.renderAll) {
    RN.panelWidgets.renderAll();
  }
};

// ---------- CLIENTES ----------
RN.render.clientes = function () {
  const cont = document.getElementById('lista-clientes');
  if (!cont) return;
  // v5.13.7 (CODE-4) / FIX v5.13.12: capturar qué tarjetas estaban abiertas
  // ANTES de sobreescribir el innerHTML, para poder reabrirlas tras el
  // re-render. Sin esto, la línea `abiertas.forEach(...)` del final lanzaba
  // un ReferenceError ("abiertas is not defined") que abortaba arrancar()
  // antes de conectar los botones del header (pasos 11 vs 13 de init.js),
  // dejando todos los botones de la app sin funcionar.
  const abiertas = Array.prototype.slice.call(cont.querySelectorAll('.acc-card.open'))
    .map(function (el) { return el.id; });
  const q = (document.getElementById('search-clientes') || {}).value || '';
  const fe = (document.getElementById('filter-estado') || {}).value || '';
  let lista = RN.state.clients.filter(c => {
    if (q) {
      const s = (c.nombre + ' ' + (c.telefono || '') + ' ' + (c.direccion || '') + ' ' + (c.ip || '')).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    if (fe && RN.calc.getStatus(c) !== fe) return false;
    return true;
  });

  // v5.12.6: ordenar siempre por IP (orden natural numérico).
  // Los clientes sin IP van al final, ordenados por nombre entre sí.
  lista.sort(RN.render.compararClientePorIP);

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">👥</div>No hay clientes. Crea el primero con "+ Nuevo cliente".</div>';
    return;
  }

  // v5.13.1: Bug #4 — mes explícito para descuentos puntuales.
  const mes = RN.calc.mesActualStr();
  cont.innerHTML = lista.map(c => {
    // v5.13.7 (DUP-2): usar resumenCliente para centralizar todos los calculos.
    const r = RN.calc.resumenCliente(c, mes);
    const estado = r.estado;
    const deuda = r.deuda;
    const neto = r.neto;
    const mora = r.mora;
    // v5.13.7 (LOG-1): si hay mora, el total incluye los meses atrasados.
    const total = mora > 0 ? r.totalDeuda : r.totalMes;
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const telHtml = c.telefono ? RN.render.esc(c.telefono) : '';
    const subParts = [];
    if (telHtml) subParts.push(telHtml);
    if (ipHtml) subParts.push(ipHtml);
    if (!subParts.length) subParts.push('<span class="muted">Sin datos</span>');

    return '<div class="acc-card" id="acc-cli-' + c.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cli-' + c.id + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + (mora > 0 ? ' <span class="badge due" style="font-size:10px;vertical-align:middle">' + mora + ' mes' + (mora > 1 ? 'es' : '') + '</span>' : '') + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (estado === 'paid' ? 'Este mes' : (mora > 0 ? 'Deuda total' : 'Total')) + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Dirección</span><span class="acc-value">' + (c.direccion ? RN.render.esc(c.direccion) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Pago día</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-actions">' +
          '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar</button>' +
          '<button class="btn sm" onclick="RN.clientHistory.abrir(\'' + c.id + '\')">Historial</button>' +
          '<button class="btn sm" onclick="RN.whatsapp.enviarRecordatorio(\'' + c.id + '\')">WhatsApp</button>' +
          '<button class="btn sm" onclick="RN.equiposRed.abrir(\'' + c.id + '\')">Equipos</button>' +
          '<button class="btn sm" onclick="RN.modalCliente.editar(\'' + c.id + '\')">Editar</button>' +
          '<button class="btn sm danger" onclick="RN.confirmDelete.cliente(\'' + c.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  // v5.13.7 (CODE-4): restaurar tarjetas que estaban abiertas antes del re-render.
  abiertas.forEach(function (cardId) {
    var el = document.getElementById(cardId);
    if (el) el.classList.add('open');
  });
};
// ---------- COBROS ----------
RN.render.cobros = function () {
  const cont = document.getElementById('lista-cobros');
  if (!cont) return;
  const q = (document.getElementById('search-cobros') || {}).value || '';
  let lista = RN.calc.clientesActivos();
  if (q) lista = lista.filter(c => c.nombre.toLowerCase().includes(q.toLowerCase()));

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💳</div>No hay clientes activos.</div>';
    return;
  }
  // ordenar: morosos primero
  lista.sort((a, b) => {
    const oa = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5 }[RN.calc.getStatus(a)];
    const ob = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5 }[RN.calc.getStatus(b)];
    return oa - ob;
  });

  // v5.13.1: Bug #4 — mes explícito para descuentos puntuales.
  const mes = RN.calc.mesActualStr();
  cont.innerHTML = lista.map(c => {
    // v5.13.7 (DUP-2): usar resumenCliente para centralizar calculos.
    const r = RN.calc.resumenCliente(c, mes);
    const estado = r.estado;
    const neto = r.neto;
    const cuotaEq = r.cuotaEq;
    const total = r.totalMes;
    const deuda = r.deuda;
    const mora = r.mora;
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const planSub = RN.render.nombrePlan(c) + ' · ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c));
    const subParts = [planSub];
    if (ipHtml) subParts.push(ipHtml);

    var accBtn;
    if (estado === 'paid') {
      accBtn = '<span class="badge paid">Pagado</span>';
    } else if (estado === 'parcial') {
      accBtn = '<span class="badge parcial">Pago parcial</span> <button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Completar pago</button>';
    } else {
      accBtn = '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar ' + RN.calc.formatCUP(total) + '</button>';
    }

    // v5.15 (C. acceso rápido): descuentos vigentes del mes para este cliente.
    // Gift-button 🎁 abre RN.descuentos.abrirParaCliente() (gestión, no cobro).
    var descsMes = (RN.state.descuentos || []).filter(function (d) {
      return d.clienteId === c.id && d.estado !== 'anulado' && RN.descuentos.vigenteEnMes(d, mes);
    });
    var impactoDesc = descsMes.reduce(function (acc, d) { return acc + (RN.calc.valorDescuento(d, c.id) || 0); }, 0);
    var GIFT = String.fromCodePoint(0x1F381);
    var giftTitle = 'Gestionar bonificaciones/descuentos de ' + RN.render.esc(c.nombre) +
      (descsMes.length ? ' — impacto este mes: ' + RN.calc.formatCUP(impactoDesc) : '');
    var giftBtn = '<button class="btn sm gift-btn' + (descsMes.length ? ' has-desc' : '') + '" title="' + giftTitle + '" onclick="RN.descuentos.abrirParaCliente(\'' + RN.render.escAttr(c.id) + '\')">' + GIFT + (descsMes.length ? ' <span class="gift-count">' + descsMes.length + '</span>' : '') + '</button>';
    var descRowsHtml = '';
    if (descsMes.length) {
      descRowsHtml = descsMes.map(function (d) {
        var mtxt = d.motivo ? RN.render.esc(d.motivo) : '';
        return '<span class="badge ok" title="' + mtxt + '">' + RN.render.esc(d.tipo) + (mtxt ? ': ' + mtxt : '') + ' (−' + RN.calc.formatCUP(RN.calc.valorDescuento(d, c.id)) + ')</span>';
      }).join(' ');
    } else {
      descRowsHtml = '<span class="muted">Ninguna este mes</span>';
    }

    return '<div class="acc-card" id="acc-cob-' + RN.render.escAttr(c.id) + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cob-' + RN.render.escAttr(c.id) + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + (mora > 0 ? ' <span class="badge due" style="font-size:10px;vertical-align:middle">Mora: ' + mora + 'm</span>' : '') + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (cuotaEq > 0 ? 'Total (+equipo)' : 'A cobrar') + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan / Precio</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">Base: ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Día de pago</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Neto a cobrar</span><span class="acc-value">' + RN.calc.formatCUP(neto) + (cuotaEq > 0 ? ' <span class="pill">+ equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Bonificaciones</span><span class="acc-value">' + descRowsHtml + '</span></div>' +
        '<div class="acc-actions">' + accBtn + ' ' + giftBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
// ---------- REALIZADOS (Historial de cobros) ----------
// v5.12.3: Historial agrupado por mes en cintillas colapsables.
// v5.13.9 (BUG-4): Formatear fecha de cobro en formato legible localizado
RN.render._fmtFechaCobro = function (fecha, conHora) {
  if (!fecha) return '—';
  var d = new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha).slice(0, 10);
  if (conHora) {
    return d.toLocaleString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// v5.13.9 (CODE-2/UI-3/UI-5/UI-6/UI-9/UI-10): Render de una card de cobro realizado.
// Extraido de render.realizados() para reutilizacion y legibilidad.
RN.render._cardCobroRealizado = function (h) {
  var cli = RN.calc.clientePorId(h.clienteId);
  // v5.13.9 (UI-4): Nombre clickeable para ver historial del cliente
  // v5.13.15 (BUG-1): Escaping de onclick corregido (antes usaba String.fromCharCode(0x5c)
  // que generaba JS invalido y el handler nunca disparaba).
  var nombre = cli
    ? '<a href="#" onclick="RN.clientHistory.abrir(\'' + RN.render.escAttr(cli.id) + '\');return false" style="color:inherit;text-decoration:none">' + RN.render.esc(cli.nombre) + '</a>'
    : '<span class="muted">Cliente eliminado</span>';
  var total = RN.calc.totalCobro(h);

  // v5.13.9 (BUG-1): Concepto correcto segun tipo de cobro
  var concepto;
  if (h.tipo === 'venta-inventario') {
    concepto = RN.render.esc(h.concepto || 'Venta inventario');
  } else if (h.tipo === 'equipo') {
    concepto = 'Pago de equipo';
  } else {
    concepto = 'Servicio mensual' + (h.mes ? ' ' + RN.render.esc(RN.calc.mesTexto(h.mes)) : '');
  }
  if (h.montoEquipo > 0 && h.tipo === 'servicio') concepto += ' + equipo';

  // v5.13.9 (DUP-2): Badge unificado de tipo de pago
  var tipoBadge = RN.render.badgeTipoPago(h);

  // v5.13.9 (UI-10): Badge "Adelantado" si el mes de servicio es futuro
  var mesActual = RN.calc.mesActualStr();
  var esAdelantado = h.mes && h.mes > mesActual && h.tipo === 'servicio';
  var adelantadoBadge = esAdelantado
    ? ' <span class="badge" style="background:#e3f2fd;color:#1565c0;font-size:10px;vertical-align:middle">Adelantado</span>'
    : '';

  var monedaTxt = h.moneda || 'CUP';

  // v5.13.9 (UI-6): Badge de pago combinado USD+CUP
  var monedaBadge = '';
  if (h.moneda === 'MIXTO' && (h.montoPagadoUSD || 0) > 0 && (h.montoPagadoCUP || 0) > 0) {
    monedaBadge = ' <span class="pill" style="background:#e8f5e9;color:#2e7d32;font-size:10px">USD+CUP</span>';
  } else if ((h.montoPagadoUSD || 0) > 0 && (h.montoPagadoCUP || 0) > 0) {
    monedaBadge = ' <span class="pill" style="background:#e8f5e9;color:#2e7d32;font-size:10px">USD+CUP</span>';
  }

  // v5.13.9 (UI-9): Pill de recibo clickeable
  // v5.13.15 (BUG-1): Escaping de onclick corregido (ver nota arriba).
  var reciboHtml = h.reciboNum
    ? '<button class="btn sm" style="padding:2px 8px" onclick="RN.recibo.ver(\'' + RN.render.escAttr(h.id) + '\')">#' + RN.render.esc(h.reciboNum) + '</button>'
    : '<span class="muted">—</span>';

  // v5.13.9 (BUG-4): Fecha localizada
  var fechaTxt = RN.render._fmtFechaCobro(h.fecha, true);

  // v5.13.9 (UI-3): data-estado segun tipo de pago
  var estadoCard = h.tipoPago === 'parcial' ? 'parcial' : 'paid';

  // v5.13.9 (UI-5): Filas de desglose servicio/equipo/mora
  var desgloseHtml = '';
  if (h.tipo === 'servicio') {
    desgloseHtml += '<div class="acc-row"><span class="acc-label">Servicio</span><span class="acc-value">' + RN.calc.formatCUP(h.monto || 0) + '</span></div>';
    if (h.montoMora && h.montoMora > 0) {
      desgloseHtml += '<div class="acc-row"><span class="acc-label">Mora</span><span class="acc-value" style="color:#c62828">' + RN.calc.formatCUP(h.montoMora) + ' (' + (h.mora || 0) + 'm)</span></div>';
    }
    if (h.descuentoRecurrente) {
      desgloseHtml += '<div class="acc-row"><span class="acc-label">Desc. recurrente</span><span class="acc-value muted">− ' + RN.calc.formatCUP(h.descuentoRecurrente) + '</span></div>';
    }
  }
  if (h.montoEquipo > 0) {
    desgloseHtml += '<div class="acc-row"><span class="acc-label">Equipo</span><span class="acc-value">' + RN.calc.formatCUP(h.montoEquipo) + '</span></div>';
  }

  return '<div class="acc-card" data-estado="' + estadoCard + '" id="acc-real-' + RN.render.escAttr(h.id) + '">' +
    '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-real-' + RN.render.escAttr(h.id) + '\')">' +
      '<span class="acc-dot ' + estadoCard + '"></span>' +
      '<div class="acc-summary-main">' +
        '<div class="acc-summary-name">' + nombre + adelantadoBadge + '</div>' +
        '<div class="acc-summary-sub">' + RN.render.esc(fechaTxt) + ' · ' + concepto + '</div>' +
      '</div>' +
      '<div class="acc-summary-total">' +
        '<div class="amt">' + RN.calc.formatCUP(total) + '</div>' +
        '<div class="lbl">' + RN.render.esc(monedaTxt) + monedaBadge + '</div>' +
      '</div>' +
      '<span class="acc-chevron">▼</span>' +
    '</div>' +
    '<div class="acc-details">' +
      '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc(fechaTxt) + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Cliente</span><span class="acc-value">' + nombre + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + concepto + '</span></div>' +
      desgloseHtml +
      '<div class="acc-row"><span class="acc-label">Total</span><span class="acc-value"><strong>' + RN.calc.formatCUP(total) + '</strong>' + (h.excedente ? ' <span class="muted" style="font-size:11px">(vuelto ' + RN.calc.formatCUP(h.excedente) + ')</span>' : '') + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Moneda</span><span class="acc-value">' + RN.render.esc(monedaTxt) + monedaBadge + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Tipo</span><span class="acc-value">' + tipoBadge + '</span></div>' +
      '<div class="acc-row"><span class="acc-label">Recibo</span><span class="acc-value">' + reciboHtml + '</span></div>' +
    '</div>' +
  '</div>';
};

// v5.13.9 (CODE-7): Construye una cintilla de mes con sus cobros.
RN.render._cintillaMes = function (mesKey, cobros, esPrimera) {
  var totalMes = cobros.reduce(function (s, h) { return s + RN.calc.totalCobro(h); }, 0);
  var nombreMes = mesKey === 'sin-fecha' ? 'Sin fecha' : RN.calc.mesTexto(mesKey);
  var cintillaId = 'cintilla-mes-' + mesKey;
  var abierta = esPrimera ? ' cintilla-mes-open' : '';
  var chevron = esPrimera ? ' ▲' : ' ▼';
  var cobrosHtml = cobros.map(RN.render._cardCobroRealizado).join('');

  return '<div class="cintilla-mes' + abierta + '" id="' + cintillaId + '">' +
    '<div class="cintilla-mes-head" onclick="RN.render.toggleCintillaMes(\'' + cintillaId + '\')">' +
      '<span class="cintilla-mes-icon">📅</span>' +
      '<div class="cintilla-mes-titulo">' +
        '<div class="cintilla-mes-nombre">' + RN.render.esc(nombreMes) + '</div>' +
        '<div class="cintilla-mes-sub">' + cobros.length + ' cobro' + (cobros.length !== 1 ? 's' : '') + ' · ' + RN.calc.formatCUP(totalMes) + '</div>' +
      '</div>' +
      '<span class="cintilla-mes-chevron">' + chevron + '</span>' +
    '</div>' +
    '<div class="cintilla-mes-body">' + cobrosHtml + '</div>' +
  '</div>';
};

// v5.13.9 (CODE-7/LOG-1): KPIs calculados sobre la lista ya filtrada.
RN.render._kpisRealizados = function (lista) {
  var cont = document.getElementById('kpi-realizados');
  if (!cont) return;
  var total = lista.reduce(function (s, h) { return s + RN.calc.totalCobro(h); }, 0);
  var count = lista.length;
  // v5.13.9 (BUG-2): Ventas de inventario (tipoPago 'completo' por defecto) cuentan como completos
  var completos = lista.filter(function (h) { return (h.tipoPago || 'completo') === 'completo'; }).length;
  var parciales = lista.filter(function (h) { return h.tipoPago === 'parcial'; }).length;
  var excedentes = lista.filter(function (h) { return h.tipoPago === 'excedente'; }).length;
  cont.innerHTML = [
    { label: 'Total cobrado', value: RN.calc.formatCUP(total), cls: 'green' },
    { label: 'Cobros realizados', value: count, cls: 'blue' },
    { label: 'Completos', value: completos, cls: 'green' },
    { label: 'Parciales', value: parciales, cls: 'amber' },
    { label: 'Con excedente', value: excedentes, cls: 'blue' }
  ].map(function (k) { return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>'; }).join('');
};

// v5.13.9 (CODE-7/LOG-2): Llenar dropdown de meses, reconstruyendo cada vez.
RN.render._fillFiltroMes = function () {
  var selMes = document.getElementById('filtro-realizados-mes');
  if (!selMes) return '';
  // v5.13.9 (LOG-2): Preservar seleccion actual antes de reconstruir
  var mesSelActual = selMes.value || '';
  selMes.innerHTML = '<option value="">Todos los meses</option>';
  var meses = {};
  RN.state.history.forEach(function (h) {
    // v5.13.9 (BUG-3): Usar h.mes (mes de servicio) con fallback a fecha
    var m = h.mes || (h.fecha || '').slice(0, 7);
    if (m) meses[m] = true;
  });
  Object.keys(meses).sort().reverse().forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = RN.calc.mesTexto(m);
    selMes.appendChild(opt);
  });
  // Restaurar seleccion si sigue existiendo
  selMes.value = mesSelActual;
  return selMes.value || '';
};

// v5.13.9 (CODE-7): Render principal de la vista Realizados.
RN.render.realizados = function () {
  var listEl = document.getElementById('lista-realizados');
  if (!listEl) return;

  // v5.13.9 (LOG-2/BUG-3): Dropdown se reconstruye cada vez, usa h.mes
  var mesSel = RN.render._fillFiltroMes();
  var q = (document.getElementById('search-realizados') || {}).value || '';
  // v5.13.9 (UI-2): Filtro por tipo de pago
  var tipoSel = (document.getElementById('filtro-realizados-tipo') || {}).value || '';

  // v5.13.9 (CODE-1/BUG-6): Filtrado centralizado con historial.filtrar()
  var lista = RN.historial.filtrar({ mes: mesSel, tipoPago: tipoSel, q: q });

  // v5.13.9 (LOG-1): KPIs sobre la lista filtrada, no sobre todo el historial
  RN.render._kpisRealizados(lista);

  if (!lista.length) {
    listEl.innerHTML = '<div class="acc-empty"><div class="icon">💰</div>No hay cobros que coincidan con el filtro.</div>';
    return;
  }

  // v5.13.9 (BUG-3): Agrupar por mes de servicio (h.mes), fallback a fecha
  var grupos = {};
  var ordenMeses = [];
  lista.forEach(function (h) {
    var mesKey = h.mes || (h.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
    grupos[mesKey].push(h);
  });
  // ordenMeses ya viene ordenado descendente porque lista esta ordenada por fecha desc
  ordenMeses.sort().reverse();

  // v5.13.9 (CODE-7): Construir cintillas usando _cintillaMes()
  var htmlCintillas = ordenMeses.map(function (mesKey, idx) {
    return RN.render._cintillaMes(mesKey, grupos[mesKey], idx === 0);
  }).join('');

  listEl.innerHTML = htmlCintillas;
};

// v5.12.3: Alterna la expansion de una cintilla de mes en el historial de cobros.
RN.render.toggleCintillaMes = function (cintillaId) {
  var el = document.getElementById(cintillaId);
  if (!el) return;
  var isOpen = el.classList.toggle('cintilla-mes-open');
  var chev = el.querySelector('.cintilla-mes-chevron');
  if (chev) chev.textContent = isOpen ? ' ▲' : ' ▼';
};

// v5.13.2: Helper para generar filas de detalle (.acc-row) en las tarjetas
// de inversión. Centraliza el patrón repetido ~20 veces en render.inversion().
//   label: texto de la etiqueta (ya escapado por el llamador)
//   valor: HTML del valor (puede incluir <strong>, <span class="badge">, etc.)
//   opts:  { bold: true, strong: true, color: 'var(--warn)', cond: false }
//     bold   → aplica font-weight:600 a toda la fila
//     strong → envuelve el valor en <strong> (útil para valores planos)
//     color  → style="color:VAR" dentro del <strong>
//     cond   → si es false, devuelve '' (fila omitida). Útil para filas condicionales.
RN.render._filaDetalle = function (label, valor, opts) {
  opts = opts || {};
  if (opts.cond === false) return '';
  var style = opts.bold ? ' style="font-weight:600"' : '';
  var valHtml = valor;
  if (opts.strong) {
    var colorStyle = opts.color ? ' style="color:' + opts.color + '"' : '';
    valHtml = '<strong' + colorStyle + '>' + valor + '</strong>';
  }
  return '<div class="acc-row"' + style + '><span class="acc-label">' + label + '</span><span class="acc-value">' + valHtml + '</span></div>';
};

// ---------- INVERSION ----------
RN.render.inversion = function () {
  const kpi = document.getElementById('kpi-inversion');
  const pctPersonal = RN.investment.pctPersonal();
  // v5.13.2 (fusión visual): KPIs combinados de inversión + deudas en una sola grid.
  // v5.27.0: Vista principal de caja en la parte superior (sólo si hay caja).
  if (kpi) {
    kpi.innerHTML = '<div class="kpi-group-title">Caja (USD/CUP unificado en CUP)</div>'
      + '<div class="kpi-grid">'
      + RN.render._kpiCajaDobleMonedaBlock()
      + '</div>'
      + RN.render._kpiInversionesBlock(_deudasActivas, _deudasConcluidas)
      + '</div>';
  }

  // v5.13.16 (UI-3): KPIs agrupados en dos bloques con sub-títulos para reducir
  //   el scroll vertical en móvil y dar contexto visual inmediato.
  var _deudasActivas = RN.investment.deudasActivas();
  var _deudasConcluidas = RN.investment.deudasConcluidas();
  var _saldoDeudas = _deudasActivas.reduce(function (s, i) { return s + RN.investment.saldoADevolver(i); }, 0);
  var _devueltoActivas = _deudasActivas.reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
  var _devueltoConcluidas = _deudasConcluidas.reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
  var _pctGananciaMes = RN.investment.pctGananciaMes();
  var _pctRecKPI = _pctGananciaMes > 0 ? RN.investment.porcentajeRecuperacionEfectiva() : RN.investment.porcentajeRecuperacion();
  var _totalRecKPI = _pctGananciaMes > 0 ? RN.investment.totalRecuperadoEfectivo() : RN.investment.totalRecuperado();

  if (false && kpi) {
    var _deudasActivas = RN.investment.deudasActivas();
    var _deudasConcluidas = RN.investment.deudasConcluidas();
    var _saldoDeudas = _deudasActivas.reduce(function (s, i) { return s + RN.investment.saldoADevolver(i); }, 0);
    var _devueltoActivas = _deudasActivas.reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
    var _devueltoConcluidas = _deudasConcluidas.reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
    var _pctGananciaMes = RN.investment.pctGananciaMes();
    // v5.13.16 (LOG-1): usar % efectivo cuando hay aporte extra de ganancia del mes
    var _pctRecKPI = _pctGananciaMes > 0
      ? RN.investment.porcentajeRecuperacionEfectiva()
      : RN.investment.porcentajeRecuperacion();
    var _totalRecKPI = _pctGananciaMes > 0
      ? RN.investment.totalRecuperadoEfectivo()
      : RN.investment.totalRecuperado();
    var _estimadoTxt = RN.investment.costoMegaConfigurado() ? '' : ' (estimado)';
    var _pctLabel = _pctGananciaMes > 0 ? '% recuperación efectiva' + _estimadoTxt : '% recuperación' + _estimadoTxt;
    var _kpiInversiones = [
      { label: 'Total invertido', value: RN.calc.formatCUP(RN.investment.totalInvertido()), cls: 'blue' },
      { label: 'Recuperado', value: RN.calc.formatCUP(_totalRecKPI), cls: 'green' },
      { label: _pctLabel, value: _pctRecKPI + '%', cls: 'amber' },
      { label: 'Por recuperar', value: RN.calc.formatCUP(Math.max(0, RN.investment.totalInvertido() - _totalRecKPI)), cls: 'red' }
    ];
    var _kpiDeudas = [
      { label: 'Deudas activas', value: String(_deudasActivas.length), cls: 'blue' },
      { label: 'Saldo por devolver', value: RN.calc.formatCUP(_saldoDeudas), cls: 'red' },
      { label: 'Ya devuelto (activas)', value: RN.calc.formatCUP(_devueltoActivas), cls: 'amber' },
      { label: 'Concluidas', value: String(_deudasConcluidas.length) + ' · ' + RN.calc.formatCUP(_devueltoConcluidas), cls: 'green' }
    ];
    var _kpiHtml = '<div class="kpi-group-title">Inversiones</div>'
      + '<div class="kpi-grid">'
      + _kpiInversiones.map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('')
      + '</div>'
      + '<div class="kpi-group-title" style="margin-top:12px">Deudas personales</div>'
      + '<div class="kpi-grid">'
      + _kpiDeudas.map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('')
      + '</div>';
    kpi.innerHTML = _kpiHtml;
  }

  // v5.12.6 (propuesta B): barra animada de recuperación global de la inversión.
  // Se muestra solo si hay inversiones registradas (la card viene oculta por defecto).
  const recupInvEl = document.getElementById('inversion-recuperacion');
  const recupInvCard = document.getElementById('card-recuperacion-inv');
  if (recupInvEl && recupInvCard) {
    if (RN.investment.totalInvertido() > 0) {
      recupInvCard.style.display = '';
      recupInvEl.innerHTML = RN.render.barraRecuperacion();
    } else {
      recupInvCard.style.display = 'none';
    }
  }

  const cont = document.getElementById('lista-inversion');
  if (!cont) return;
  if (!RN.state.investments.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📈</div>No hay inversiones registradas.</div>';
    return;
  }
  // v5.13.3 (fix duplicación): el bloque "Inversiones" solo muestra capital propio.
  // Los préstamos externos (prestado_externo) se muestran en el bloque "Deudas personales activas"
  // con toda su información de recuperación integrada, para evitar duplicados.
  var _inversionesPropias = RN.state.investments.filter(function (inv) {
    return RN.investment.origenCapital(inv) !== 'prestado_externo';
  });
  if (!_inversionesPropias.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📈</div>No hay inversiones con capital propio registradas.</div>';
  } else {
  // v5.13.16 (DUP-2): Se reemplaza el card inline (~80 lineas) por la funcion
  // unificada RN.inversion._cardInversion(inv, {esDeuda: false}), que comparte
  // la misma estructura HTML con las cards de deuda. Los campos adicionales
  // (ingreso bruto, margen neto, aporte extra, etc.) se migraron a
  // _htmlDetalleRecuperacion con renderizado condicional.
  cont.innerHTML = _inversionesPropias.map(inv => {
    return RN.inversion._cardInversion(inv, { esDeuda: false });
  }).join('');
  }

  // v5.12.6: disparar la animación de la barra de recuperación tras pintarla.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(RN.render.animarBarrasRecuperacion);
  } else {
    RN.render.animarBarrasRecuperacion();
  }

  // v5.13.2 (fusión visual): renderizar también las listas de deudas
  // (activas y concluidas) dentro de esta misma vista unificada.
  // Los KPIs de deudas ya se integraron arriba en la grid combinada.
  var _act = RN.investment.deudasActivas();
  var _conc = RN.investment.deudasConcluidas();
  RN.inversion._renderDeudasActivas(_act);
  RN.inversion._renderDeudasConcluidas(_conc);
};
// ---------- INVENTARIO ----------
RN.render.inventario = function () {
  const cont = document.getElementById('lista-inventario');
  if (!cont) return;
  // v5.12.0: vista agrupada por producto (material), con lotes FIFO
  var productos = RN.inventarioModel.productosAgrupados();
  if (!productos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📦</div>No hay productos en inventario.</div>';
    return;
  }
  // KPI de inventario: valor total del stock, ganancia potencial
  var valorStock = 0, gananciaPotencial = 0;
  productos.forEach(function (p) {
    p.lotes.forEach(function (l) {
      var disp = RN.inventarioModel.stockDisponibleLote(l.id);
      valorStock += disp * (l.costoUnitario || 0);
    });
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    gananciaPotencial += p.stockDisponible * (precioSug - costoVig);
  });
  cont.innerHTML = productos.map(function (p) {
    var dotCls = p.stockDisponible > 0 ? 'ok' : 'due';
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    var pct = RN.inventarioModel.pctGanancia();
    var claveId = 'acc-invprod-' + p.key.replace(/[^a-z0-9]/g, '-');
    // Lotes del producto (ordenados por fecha = FIFO)
    var lotesHtml = p.lotes.map(function (l, idx) {
      var dispLote = RN.inventarioModel.stockDisponibleLote(l.id);
      var esVigente = dispLote > 0 && costoVig === (l.costoUnitario || 0) && idx === p.lotes.findIndex(function (x) { return RN.inventarioModel.stockDisponibleLote(x.id) > 0; });
      var badgeVigente = esVigente ? ' <span class="badge ok">vigente FIFO</span>' : '';
      var badgeAgotado = dispLote === 0 ? ' <span class="badge due">agotado</span>' : '';
      var fechaStr = l.fecha ? new Date(l.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      // Asignaciones de este lote
      var asigs = RN.state.asignacionesInventario.filter(function (a) { return a.loteId === l.id; });
      var asigsHtml = asigs.length ? asigs.map(function (a) {
        var cli = RN.state.clients.find(function (c) { return c.id === a.clienteId; });
        var cliNom = cli ? RN.render.esc(cli.nombre) : '<span class="muted">— cliente eliminado —</span>';
        var estado = a.vendida ? '<span class="badge ok">vendida</span>' : '<span class="badge warn">asignada</span>';
        return '<div class="acc-row"><span class="acc-label">' + a.cantidad + ' ud. → ' + cliNom + '</span><span class="acc-value">' + estado + ' ' + RN.calc.formatCUP(a.precioTotal || 0) + '</span></div>';
      }).join('') : '<div class="acc-row"><span class="acc-value muted">Sin asignaciones</span></div>';
      // Desglose de pago del lote (si tiene)
      var pagoHtml = '';
      if (l.monedaPago) {
        pagoHtml = '<div class="acc-row"><span class="acc-label">Pago (' + l.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({
          moneda: l.monedaPago,
          montoUSD: l.montoPagoUSD,
          montoCUP: l.montoPagoCUP,
          montoCUPDesdeUSD: l.montoPagoCUPDesdeUSD,
          totalRecibidoCUP: l.totalPagoCUP,
          tasaUsd: l.tasaUsdCompra
        }) + '</span></div>';
      }
      return '<div style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:8px">'
        + '<div class="acc-row"><span class="acc-label">Lote ' + (idx + 1) + ' · ' + fechaStr + badgeVigente + badgeAgotado + '</span><span class="acc-value">' + l.cantidad + ' compradas · ' + dispLote + ' disp.</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo unitario</span><span class="acc-value">' + RN.calc.formatCUP(l.costoUnitario || 0) + '</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo total</span><span class="acc-value">' + RN.calc.formatCUP(l.costoTotal || (l.cantidad * (l.costoUnitario || 0))) + '</span></div>'
        + (l.notas ? '<div class="acc-row"><span class="acc-label">Notas</span><span class="acc-value">' + RN.render.esc(l.notas) + '</span></div>' : '')
        + pagoHtml
        + '<div class="divider" style="margin:6px 0"></div>'
        + asigsHtml
        + '<div class="acc-actions" style="margin-top:8px">'
        +   '<button class="btn sm" onclick="RN.inventario.eliminarLote(\'' + RN.render.escAttr(l.id) + '\')">🗑 Eliminar lote</button>'
        + '</div>'
        + '</div>';
    }).join('');
    return '<div class="acc-card" id="' + claveId + '">'
      + '<div class="acc-summary" onclick="RN.render.toggleCard(\'' + claveId + '\')">'
      +   '<span class="acc-dot ' + dotCls + '"></span>'
      +   '<div class="acc-summary-main">'
      +     '<div class="acc-summary-name">' + RN.render.esc(p.nombre) + '</div>'
      +     '<div class="acc-summary-sub">' + p.lotes.length + ' lote' + (p.lotes.length > 1 ? 's' : '') + ' · ' + p.stockDisponible + ' disp. · costo vigente ' + RN.calc.formatCUP(costoVig) + '/ud · venta sug. ' + RN.calc.formatCUP(precioSug) + '</div>'
      +   '</div>'
      +   '<div class="acc-summary-total">'
      +     '<div class="amt">' + p.stockDisponible + '</div>'
      +     '<div class="lbl">Disponible</div>'
      +   '</div>'
      +   '<span class="acc-chevron">▼</span>'
      + '</div>'
      + '<div class="acc-details">'
      +   '<div class="acc-row"><span class="acc-label">Producto</span><span class="acc-value">' + RN.render.esc(p.nombre) + '</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Stock total comprado</span><span class="acc-value">' + p.stockTotal + ' ud.</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Stock disponible</span><span class="acc-value"><span class="badge ' + (p.stockDisponible > 0 ? 'ok' : 'due') + '">' + p.stockDisponible + '</span></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Costo vigente (FIFO)</span><span class="acc-value">' + RN.calc.formatCUP(costoVig) + '/ud</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Precio de venta sugerido (' + pct + '%)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(precioSug) + '/ud</strong></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Ganancia potencial</span><span class="acc-value" style="color:var(--green)">' + RN.calc.formatCUP(p.stockDisponible * (precioSug - costoVig)) + '</span></div>'
      +   '<div class="divider" style="margin:8px 0"></div>'
      +   '<div class="acc-row" style="font-weight:600"><span class="acc-label">Lotes (' + p.lotes.length + ') — FIFO (más antiguo primero)</span></div>'
      +   lotesHtml
      +   '<div class="acc-actions">'
      +     '<button class="btn sm primary" onclick="RN.inventario.asignar(\'' + RN.render.escAttr(p.nombre) + '\')">Asignar / vender</button>'
      +     '<button class="btn sm" onclick="RN.inventario.abrirNuevoLote(\'' + RN.render.escAttr(p.nombre) + '\')">📋 Comprar más</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
};
// ---------- GASTOS ----------
RN.render.gastos = function () {
  const kpi = document.getElementById('kpi-gastos');
  if (kpi) {
    const total = RN.calc.gastosTotales();
    kpi.innerHTML = [
      { label: 'Gastos totales', value: RN.calc.formatCUP(total), cls: 'red' },
      { label: 'Gastos del mes', value: RN.calc.formatCUP(RN.calc.gastosMes()), cls: 'amber' }
    ].map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('');
  }
  const cont = document.getElementById('lista-gastos');
  if (!cont) return;
  if (!RN.state.gastos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay gastos registrados.</div>';
    return;
  }
  const gastos = [...RN.state.gastos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  cont.innerHTML = gastos.map(g => {
    var catBadge = '<span class="pill">' + RN.render.esc(g.categoria || 'General') + '</span>';
    var provIcon = g.esPagoProveedor ? ' 📡' : '';
    var retiroIcon = g.esRetiroCaja ? ' 💵' : '';
    var retiroBadge = g.esRetiroCaja ? '<span class="badge warn" style="margin-left:4px">Retiro de caja</span>' : '';
    // v5.14.0: los cuadres de caja se guardan en RN.state.gastos igual que
    // los gastos normales, pero con esCuadreCaja=true. El sobrante se guarda
    // con monto NEGATIVO (ver cuadre.js), así que aquí se muestra con su
    // propio ícono/etiqueta y el signo/color correctos en vez de "Gasto".
    var esCuadre = !!g.esCuadreCaja;
    var esSobrante = esCuadre && g.tipoCuadre === 'sobrante';
    var cuadreIcon = esCuadre ? ' 🧮' : '';
    var cuadreBadge = esCuadre ? '<span class="badge ' + (esSobrante ? 'ok' : 'due') + '" style="margin-left:4px">' + (esSobrante ? 'Sobrante de caja' : 'Faltante de caja') + '</span>' : '';
    var montoAbs = esCuadre ? Math.abs(g.monto) : g.monto;
    var montoLabel = esCuadre ? (esSobrante ? 'Sobrante' : 'Faltante') : 'Gasto';
    var montoColor = esSobrante ? 'style="color:var(--green,#16a34a)"' : '';
    return '<div class="acc-card" id="acc-gas-' + g.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-gas-' + g.id + '\')">' +
        '<span class="acc-dot due"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(g.concepto) + provIcon + retiroIcon + cuadreIcon + '</div>' +
          '<div class="acc-summary-sub">' + RN.render.esc((g.fecha || '').slice(0, 10)) + ' · ' + RN.render.esc(g.categoria || 'General') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt" ' + montoColor + '>' + (esSobrante ? '+' : '') + RN.calc.formatCUP(montoAbs) + '</div>' +
          '<div class="lbl">' + montoLabel + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc((g.fecha || '').slice(0, 10)) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + RN.render.esc(g.concepto) + provIcon + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Categoría</span><span class="acc-value">' + catBadge + retiroBadge + cuadreBadge + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Monto</span><span class="acc-value" ' + montoColor + '>' + (esSobrante ? '+' : '') + RN.calc.formatCUP(montoAbs) + '</span></div>' +
        '<div class="acc-actions">' +
          '<button class="btn sm danger" onclick="RN.gastos.eliminar(\'' + g.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
// ---------- REPORTES ----------
// v5.14.3: Render del "Historial de cobros" de la vista Reportes, agrupado por
// mes en cintillas colapsables (cada mes contraído por defecto; al hacer clic
// se expande). Dentro de cada mes, cada cobro es una acc-card colapsable cuyo
// detalle solo aparece al hacer clic. Reutiliza _cintillaMes() y
// _cardCobroRealizado() de la vista Realizados para consistencia visual.
// Nota: el primer mes (más reciente) se muestra abierto por defecto para dar
// contexto inmediato; el resto queda contraído.
RN.render._renderHistorialReportes = function () {
  var listEl = document.getElementById('lista-historial-reportes');
  if (!listEl) return;

  // v5.14.3: llenar el dropdown de meses (reconstruido cada render).
  var selMes = document.getElementById('filtro-historial-rep-mes');
  var mesSel = '';
  if (selMes) {
    var mesSelActual = selMes.value || '';
    selMes.innerHTML = '<option value="">Todos los meses</option>';
    var meses = {};
    RN.state.history.forEach(function (h) {
      var m = h.mes || (h.fecha || '').slice(0, 7);
      if (m) meses[m] = true;
    });
    Object.keys(meses).sort().reverse().forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = RN.calc.mesTexto(m);
      selMes.appendChild(opt);
    });
    selMes.value = mesSelActual;
    mesSel = selMes.value || '';
  }

  var q = (document.getElementById('search-historial-rep') || {}).value || '';
  // v5.14.3: filtrado centralizado (mismo criterio que la vista Realizados).
  var lista = RN.historial.filtrar({ mes: mesSel, q: q });

  // Aviso de límite (informativo; ya no se trunca a 50 porque el render
  // agrupado colapsado escala bien en el DOM).
  var aviso = document.getElementById('historial-limite-aviso');
  if (aviso) aviso.style.display = 'none';

  if (!lista.length) {
    listEl.innerHTML = '<div class="acc-empty"><div class="icon">💰</div>No hay cobros que coincidan con el filtro.</div>';
    return;
  }

  // v5.14.3: agrupar por mes de servicio (h.mes), fallback a fecha.
  var grupos = {};
  var ordenMeses = [];
  lista.forEach(function (h) {
    var mesKey = h.mes || (h.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
    grupos[mesKey].push(h);
  });
  ordenMeses.sort().reverse();

  // Construir cintillas: solo el primer mes abierto por defecto.
  var htmlCintillas = ordenMeses.map(function (mesKey, idx) {
    return RN.render._cintillaMes(mesKey, grupos[mesKey], idx === 0);
  }).join('');

  listEl.innerHTML = htmlCintillas;
};

RN.render.reportes = function () {
  const kpi = document.getElementById('kpi-reportes');
  if (kpi) {
    kpi.innerHTML = [
      { label: 'Ingresos totales', value: RN.calc.formatCUP(RN.calc.ingresosTotales()), cls: 'green' },
      { label: 'Gastos totales', value: RN.calc.formatCUP(RN.calc.gastosTotales()), cls: 'red' },
      { label: 'Utilidad acumulada', value: RN.calc.formatCUP(RN.calc.ingresosTotales() - RN.calc.gastosTotales()), cls: 'blue' },
      { label: 'Predicción próximo mes', value: RN.calc.formatCUP(RN.calc.prediccionIngresos()), cls: 'amber' }
    ].map(k => `<div class="kpi ${k.cls}"><div class="label">${k.label}</div><div class="value">${k.value}</div></div>`).join('');
  }

  // Historial (v5.14.3): agrupado por mes en cintillas colapsables,
  // cada cobro es una acc-card colapsable (reutiliza _cintillaMes / _cardCobroRealizado).
  const histList = document.getElementById('lista-historial-reportes');
  if (histList) {
    RN.render._renderHistorialReportes();
  }

  // Tendencia (chart simple con barras div)
  RN.tendencia && RN.tendencia.render();

  // Selector de mes para reporte mensual
  // v5.14.2 (Auditoría Reportes — DUP-4): usa el helper compartido RN.calc.listaMeses
  // en lugar de reconstruir la lista de últimos 12 meses aquí (duplicado con descuentos-view.js).
  const sel = document.getElementById('select-mes-reporte');
  if (sel) {
    const meses = RN.calc.listaMeses(12);
    sel.innerHTML = meses.map(m => `<option value="${m}">${RN.calc.mesTexto(m)}</option>`).join('');
  }
};
