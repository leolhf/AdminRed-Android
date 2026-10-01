/**
 * ui/views/dashboard.js — Vista Panel (dashboard): KPIs y resumen del negocio.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */
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
        html += '<div class="prov-widget-row" style="color:var(--warn)"><span class="badge warn" style="margin-right:6px">Paquete actualizado</span> <span class="muted">Pagaste ' + megasPagados + 'M × ' + precioPagado + ' CUP/M. El paquete actual es ' + (cfg.proveedorMegas || 0) + 'M × ' + (cfg.proveedorPrecioMega || 0) + ' CUP/M = ' + RN.calc.formatCUP(montoPaquete) + '.</span></div>';
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
        ? '<span style="color:var(--danger)">⚠ Excedido</span>'
        : (cap.pct >= 80 ? '<span style="color:var(--warn)">Cerca del tope</span>' : '<span style="color:var(--success)">✓ Capacidad ok</span>');
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
      html += '<div class="prov-widget-row" style="color:var(--primary);border-top:1px solid var(--border);padding-top:8px;margin-top:4px">';
      html += '<span class="badge" style="background:var(--primary-soft);color:var(--primary);margin-right:6px">⏳ Pendiente para ' + RN.calc.mesTexto(mesProx) + '</span>';
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
