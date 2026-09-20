/**
 * reportes/calendario.js — Calendario visual mensual de cobros con código de colores.
 *
 * v5.13.10 — Revisión y correcciones:
 *   BUG-1: _recordarTodosDia ahora envía SOLO al día abierto (enviarMasivoLista).
 *   BUG-2: esMesActual unificado a RN.calc.mesActualStr() en render() y abrirDia().
 *   BUG-3: diaPago > días del mes se reasigna al último día (no más invisibles).
 *   BUG-4: estado 'por-iniciar' con color propio (gris), no confundido con 'ok'.
 *   DUP-1: cortes leídos de RN.ciclos.cortesOficiales() (una sola fuente de verdad).
 *   DUP-2: usa RN.calc.resumenCliente() (migración como el resto de vistas).
 *   DUP-3: eliminado _clientesDelDia, usa RN.ciclos.clientesPorCorte().
 *   LOG-1: corteVigente alineado con el mes operativo.
 *   LOG-2: total a cobrar incluye mora (via resumenCliente.totalDeuda).
 *   LOG-3: filtro de pendientes delega en RN.ciclos.clientesCorteVigentePendientes().
 *   UI-2: soporte de teclado (Enter/Space) + delegación de eventos (no onclick inline).
 *   CODE-1: estilo unificado const/let + arrow functions.
 *   CODE-2: helpers de render extraídos (_filaCliente, _kpiDia, _headerDia).
 *   CODE-4: resumenCliente precalculado una sola vez por render.
 *   CODE-5: delegación de eventos elimina onclick inline con escape manual (XSS).
 *
 * v5.12.9 — Calendario INTERACTIVO (heredado):
 *   - Los días de corte se resaltan con un marcador especial.
 *   - Al tocar un día con clientes se abre un modal con el detalle de cada
 *     cliente (neto + cuota de equipo), su estado, y el TOTAL a cobrar del día.
 *     Cada cliente trae botones Cobrar / WhatsApp.
 *   - Solo son clickeables los días que tienen clientes asignados.
 */
RN.calendario = RN.calendario || {};

RN.calendario._mes = null;

/**
 * Días de corte oficiales del negocio.
 * v5.13.10 (DUP-1): getter que delega en RN.ciclos.cortesOficiales() para
 * tener una sola fuente de verdad. Se mantiene CORTES como accessor legacy.
 */
Object.defineProperty(RN.calendario, 'CORTES', {
  get: function () { return RN.ciclos.cortesOficiales(); },
  enumerable: true,
  configurable: true
});

RN.calendario._mesActual = function () {
  return RN.calendario._mes || RN.calc.mesActualStr();
};

RN.calendario.mesAnterior = function () {
  RN.calendario._mes = RN.calc.mesAnterior(RN.calendario._mesActual());
  RN.calendario.render();
};

RN.calendario.mesSiguiente = function () {
  RN.calendario._mes = RN.calc.mesSiguiente(RN.calendario._mesActual());
  RN.calendario.render();
};

/** v5.13.10 (UI-1): volver al mes operativo en curso. */
RN.calendario.irHoy = function () {
  RN.calendario._mes = RN.calc.mesActualStr();
  RN.calendario.render();
};

/**
 * v5.13.10 (BUG-3): reasigna un diaPago al último día del mes si lo excede.
 * Un cliente con diaPago=31 en febrero (28/29 días) se muestra el último día.
 */
RN.calendario._diaEfectivo = function (diaPago, diasMes) {
  const d = diaPago || 1;
  return d > diasMes ? diasMes : d;
};

RN.calendario.render = function () {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-mes-label');
  if (!grid) return;

  const ym = RN.calendario._mesActual();
  const [y, m] = ym.split('-').map(Number);
  if (label) label.textContent = RN.calc.mesTexto(ym);

  const primerDia = new Date(y, m - 1, 1).getDay(); // 0=domingo
  const diasMes = new Date(y, m, 0).getDate();

  // v5.13.10 (BUG-2): esMesActual unificado con el mes operativo.
  const esMesActual = (ym === RN.calc.mesActualStr());
  // Solo tiene sentido resaltar "hoy" si el mes en vista es el operativo actual.
  const diaHoy = esMesActual ? RN.calc.hoy().getDate() : null;

  const cortes = RN.ciclos.cortesOficiales();           // v5.13.10 (DUP-1)
  const esCorte = {};
  cortes.forEach((d) => { esCorte[d] = true; });

  // v5.13.10 (BUG-3 + CODE-4): mapa día -> resúmenes precalculados.
  // resumenCliente ya centraliza estado, neto, cuotaEq, mora, totalMes, totalDeuda.
  const porDia = {};
  RN.calc.clientesActivos().forEach((c) => {
    const dia = RN.calendario._diaEfectivo(c.diaPago, diasMes); // BUG-3
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push({ c, r: RN.calc.resumenCliente(c, ym) }); // DUP-2 + CODE-4
  });

  const heads = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  let html = heads.map((h) => `<div class="cal-head">${h}</div>`).join('');
  for (let i = 0; i < primerDia; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= diasMes; d++) {
    const cls = [];
    if (esMesActual && d === diaHoy) cls.push('today');
    const esCorteDia = !!esCorte[d];
    if (esCorteDia) cls.push('corte');

    const items = porDia[d] || [];
    const hayClientes = items.length > 0;

    // v5.13.10 (BUG-4): color dominante — 'por-iniciar' ya NO se mapea a 'ok'.
    const estadoDom = RN.calendario._estadoDominante(items.map((it) => it.r.estado));
    if (estadoDom) cls.push(estadoDom);
    if (hayClientes) cls.push('clickable');

    // v5.13.11 (UI-movil): tag compacto con capa oculta ".cut-word"
    // que se oculta en pantallas muy estrechas (ver CSS @media max-width:599px).
    const corteTag = esCorteDia
      ? '<span class="cal-corte-tag">✂<span class="cut-word"> Corte</span></span>'
      : '';
    const dots = RN.calendario._dotsPorEstado(items); // v5.13.10 (UI-4)
    const attrAria = hayClientes
      ? ' aria-label="Día ' + d + ': ' + items.length + ' cliente(s) para cobro"'
      : '';

    // v5.13.10 (UI-2 + CODE-5): data-dia + delegación de eventos (sin onclick inline).
    html += `<div class="cal-day ${cls.join(' ')}"` +
      (hayClientes ? ' role="button" tabindex="0" data-dia="' + d + '"' : '') +
      attrAria + '>' +
      `<span class="num">${d}</span>` +
      corteTag +
      (dots ? `<span class="cal-dots">${dots}</span>` : '') +
      (hayClientes ? `<span class="cal-count">${items.length} pago(s)</span>` : '') +
    `</div>`;
  }
  grid.innerHTML = html;

  // v5.13.10 (UI-7): aviso de mes sin cobros programados.
  const aviso = document.getElementById('cal-empty-aviso');
  if (aviso) {
    aviso.style.display = Object.keys(porDia).length === 0 ? 'block' : 'none';
  }

  // v5.13.10 (UI-2 + CODE-5): delegación de eventos (click + teclado).
  RN.calendario._bindGrid(grid);
};

/**
 * v5.13.10 (UI-2 + CODE-5): listeners delegados en la grilla.
 * Maneja click y teclado (Enter/Space) para abrir el día.
 */
RN.calendario._bindGrid = function (grid) {
  if (grid._rnBound) return; // evitar doble binding si render se llama varias veces
  grid._rnBound = true;
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-day.clickable');
    if (cell && grid.contains(cell)) RN.calendario.abrirDia(+cell.dataset.dia);
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cell = e.target.closest('.cal-day.clickable');
    if (cell && grid.contains(cell)) { e.preventDefault(); RN.calendario.abrirDia(+cell.dataset.dia); }
  });
};

/**
 * v5.13.10 (BUG-4 + CODE-3): estado dominante para colorear el día.
 * Prioridad: due > warn > parcial > paid > por-iniciar > ok.
 * 'por-iniciar' ya tiene su propia clase (antes se confundía con 'ok').
 */
RN.calendario._estadoDominante = function (estados) {
  const peso = { due: 5, warn: 4, parcial: 3, paid: 2, 'por-iniciar': 1, ok: 0, inactivo: 0 };
  let dom = null;
  let maxP = -1;
  estados.forEach((e) => {
    const p = peso[e] != null ? peso[e] : -1;
    if (p > maxP) { maxP = p; dom = e; }
  });
  return dom;
};

/**
 * v5.13.10 (UI-4): un punto por cada estado presente en el día.
 * Da una visión más fiel que un solo punto del estado dominante.
 */
RN.calendario._dotsPorEstado = function (items) {
  const presentes = {};
  items.forEach((it) => { presentes[it.r.estado] = (presentes[it.r.estado] || 0) + 1; });
  const orden = ['due', 'warn', 'parcial', 'paid', 'por-iniciar', 'ok', 'inactivo'];
  let dots = '';
  orden.forEach((e) => {
    if (presentes[e]) {
      dots += `<span class="dot ${e}" title="${presentes[e]} ${e}"></span>`;
    }
  });
  return dots;
};

/**
 * Abre la ventana superpuesta con el detalle de los clientes de un día de corte.
 * Muestra cada cliente, su monto a pagar (neto + cuota de equipo), su estado,
 * y un resumen con el total a cobrar. Botones Cobrar / WhatsApp por cliente.
 *
 * v5.13.10: usa resumenCliente (DUP-2), total incluye mora (LOG-2),
 *           delegación de eventos en botones (CODE-5), helpers de render (CODE-2).
 */
RN.calendario.abrirDia = function (dia) {
  const ym = RN.calendario._mesActual();
  const diasMes = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();

  // v5.13.10 (DUP-3 + BUG-3): clientes cuyo día efectivo coincide con 'dia'.
  // Se recorre una sola vez con resumenCliente precalculado (DUP-2 + CODE-4).
  const items = [];
  RN.calc.clientesActivos().forEach((c) => {
    if (RN.calendario._diaEfectivo(c.diaPago, diasMes) === dia) {
      items.push({ c, r: RN.calc.resumenCliente(c, ym) });
    }
  });
  if (!items.length) return;

  const cortes = RN.ciclos.cortesOficiales();
  const esCorte = cortes.indexOf(dia) !== -1;                       // DUP-1
  const esMesActual = (ym === RN.calc.mesActualStr());               // BUG-2
  // v5.13.10 (LOG-1): corteVigente alineado con el mes operativo.
  const cv = esMesActual ? RN.ciclos.corteVigente() : null;
  const esCorteVigente = esMesActual && cv && cv.diaPago === dia;

  // Calcular totales (LOG-2: totalDeuda incluye mora de meses anteriores).
  let totalACobrar = 0, totalNeto = 0, totalEquipo = 0;
  let pagados = 0, pendientes = 0, conTel = 0;
  items.forEach((it) => {
    const { r } = it;
    totalACobrar += r.totalDeuda;     // LOG-2: deuda real (mora + equipo)
    totalNeto += r.neto;
    totalEquipo += r.cuotaEq;
    if (r.estado === 'paid') pagados++; else pendientes++;
    if (it.c.telefono) conTel++;
  });
  const conMora = +(totalACobrar - (totalNeto + totalEquipo)).toFixed(2);

  const filas = items.map((it) =>
    RN.calendario._filaCliente(it.c, it.r, ym)
  ).join('');

  const titulo = RN.calendario._headerDia(dia, ym, { esCorte, esCorteVigente, cv, esMesActual });
  const kpi = RN.calendario._kpiDia({
    totalACobrar, totalNeto, totalEquipo, pagados, pendientes,
    total: items.length, conTel, conMora
  });

  const html =
    '<div class="modal-header"><h3>' + titulo.titulo + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="cal-modal-badges" style="margin-bottom:12px">' + titulo.badges + '</div>' +
      kpi +
      (totalEquipo > 0
        ? '<div class="acc-row cal-modal-desglose"><span class="acc-label muted">Desglose: servicio ' +
            RN.calc.formatCUP(totalNeto) + ' + cuotas de equipo ' + RN.calc.formatCUP(totalEquipo) +
            (conMora > 0 ? ' + mora acumulada ' + RN.calc.formatCUP(conMora) : '') +
          '</span></div>'
        : (conMora > 0
            ? '<div class="acc-row cal-modal-desglose"><span class="acc-label muted">Incluye mora acumulada de meses anteriores: ' +
                RN.calc.formatCUP(conMora) + '</span></div>'
            : '')) +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Cliente</th><th>Estado</th><th>Teléfono</th>' +
        '<th class="cal-col-right">A pagar</th><th class="cal-col-center">Acciones</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      (pendientes > 0 && conTel > 0
        ? '<div class="cal-modal-actions"><button class="btn primary" data-accion="recordar-todos" data-dia="' + dia + '">💬 Recordar a todos (WhatsApp)</button></div>'
        : (pendientes > 0
            ? '<p class="muted cal-modal-note">Los pendientes de este día no tienen teléfono registrado.</p>'
            : '')) +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
    '</div>';

  RN.calendario._diaAbierto = dia;
  RN.uiComponents.modal(html, { lg: true });

  // v5.13.10 (CODE-5): delegación de eventos para los botones de la tabla.
  RN.calendario._bindModalAcciones();
};

/**
 * v5.13.10 (CODE-2): fila HTML de un cliente en el modal del día.
 * Usa resumenCliente (r) para todos los cálculos.
 * v5.13.10 (CODE-5): botones con data-* en vez de onclick inline (XSS).
 */
RN.calendario._filaCliente = function (c, r, ym) {
  const tel = c.telefono
    ? RN.render.esc(c.telefono)
    : '<span class="muted">—</span>';
  const planTxt = RN.render.esc(RN.render.nombrePlan(c));
  const estadoBadge = RN.render.badgeEstado(r.estado);
  // LOG-2: mostrar totalMes (mes en curso) y, si hay mora, el total con mora.
  const moraBadge = r.mora > 0
    ? ' <span class="badge due">' + r.mora + ' mes' + (r.mora !== 1 ? 'es' : '') + ' de atraso</span>'
    : '';
  let totalTxt = RN.calc.formatCUP(r.totalMes);
  if (r.cuotaEq > 0) {
    totalTxt += ' <span class="pill">+equipo ' + RN.calc.formatCUP(r.cuotaEq) + '</span>';
  }
  if (r.mora > 0) {
    totalTxt += '<br><span class="muted cal-deuda-total">Deuda total: ' +
      RN.calc.formatCUP(r.totalDeuda) + '</span>';
  }
  const ipLine = c.ip
    ? '<br><span class="muted cal-modal-ip">IP: ' + RN.render.esc(c.ip) + '</span>'
    : '';

  return '<tr>' +
    '<td><strong>' + RN.render.esc(c.nombre) + '</strong>' +
      '<br><span class="muted cal-modal-plan">' + planTxt + '</span>' + ipLine +
    '</td>' +
    '<td class="cal-col-center">' + estadoBadge + moraBadge + '</td>' +
    '<td>' + tel + '</td>' +
    '<td class="cal-col-right">' + totalTxt + '</td>' +
    '<td class="cal-col-center">' +
      '<button class="btn sm primary" data-accion="cobrar" data-id="' + RN.render.escAttr(c.id) + '">Cobrar</button> ' +
      '<button class="btn sm" data-accion="recordar" data-id="' + RN.render.escAttr(c.id) + '"' +
        (c.telefono ? '' : ' disabled title="Sin teléfono"') + '>WhatsApp</button>' +
    '</td>' +
  '</tr>';
};

/**
 * v5.13.10 (CODE-2): cabecera + badges del modal del día.
 */
RN.calendario._headerDia = function (dia, ym, ctx) {
  const tituloIcono = ctx.esCorte ? '✂️' : '📅';
  const titulo = tituloIcono + ' Día ' + dia + ' de ' + RN.calc.mesTexto(ym);
  let badges = '';
  if (ctx.esCorte) badges += ' <span class="badge paid">Corte</span>';
  if (ctx.esCorteVigente) {
    const diasFaltan = RN.ciclos.diasParaPago(dia);
    badges += ' <span class="badge ok">● Vigente</span>';
    if (diasFaltan > 0) {
      badges += ' <span class="muted cal-modal-note">— faltan ' + diasFaltan +
        ' día' + (diasFaltan > 1 ? 's' : '') + ' para el pago</span>';
    } else {
      badges += ' <span class="muted cal-modal-note">— hoy es la fecha de pago</span>';
    }
  } else if (ctx.esCorte && ctx.esMesActual) {
    const hoyNum = RN.ciclos.diaHoyNum();
    if (dia < hoyNum) badges += ' <span class="badge due">Vencido</span>';
  }
  return { titulo, badges };
};

/**
 * v5.13.10 (CODE-2 + UI-5): KPI de resumen del día.
 * Indica cuántos clientes tienen/sin teléfono (UI-5).
 */
RN.calendario._kpiDia = function (t) {
  const kpiCls = t.pendientes > 0 ? 'amber' : 'green';
  const sinTel = t.total - t.conTel;
  let sub = t.total + ' cliente' + (t.total > 1 ? 's' : '') + ' en este corte · ' +
    t.pagados + ' pagado' + (t.pagados !== 1 ? 's' : '') + ' · ' +
    t.pendientes + ' pendiente' + (t.pendientes !== 1 ? 's' : '');
  // UI-5: desglose de contactabilidad solo si hay pendientes.
  if (t.pendientes > 0) {
    sub += ' · ' + t.conTel + ' con teléfono' + (sinTel > 0 ? ' · ' + sinTel + ' sin teléfono' : '');
  }
  // LOG-2: si hay mora acumulada, aclarar que el total la incluye.
  if (t.conMora > 0) {
    sub += ' · incluye mora acumulada';
  }
  return '<div class="kpi ' + kpiCls + '" style="margin-bottom:12px">' +
    '<div class="label">Total a cobrar este día</div>' +
    '<div class="value">' + RN.calc.formatCUP(t.totalACobrar) + '</div>' +
    '<div class="sub">' + sub + '</div>' +
  '</div>';
};

/**
 * v5.13.10 (CODE-5): delegación de eventos para los botones del modal.
 * Evita onclick inline con escape manual de IDs (riesgo XSS).
 *
 * v5.14.2 (Auditoría Reportes — CODE-2): la propiedad ad-hoc '_rnCalClick'
 * en el DOM es intencional y está prefijada con 'rnCal' precisamente para
 * no colisionar con otros módulos que puedan delegar eventos sobre el mismo
 * '#modal-box' (ej. otros flujos que abren modales genéricos). Se evaluó
 * migrar a un único listener global en init.js (data-accion centralizado),
 * pero como el modal se destruye/recrea en cada apertura y este handler ya
 * limpia el anterior antes de añadir uno nuevo, el riesgo real de fugas o
 * colisiones es bajo — se deja documentado en vez de refactorizar.
 */
RN.calendario._bindModalAcciones = function () {
  const box = document.getElementById('modal-box');
  if (!box) return;
  // Limpiar handler previo si el modal se reutiliza.
  if (box._rnCalClick) box.removeEventListener('click', box._rnCalClick);
  const handler = (e) => {
    const btn = e.target.closest('[data-accion]');
    if (!btn || !box.contains(btn)) return;
    const accion = btn.dataset.accion;
    const id = btn.dataset.id;
    const dia = btn.dataset.dia;
    if (accion === 'cobrar') RN.calendario._cobrar(id);
    else if (accion === 'recordar') RN.calendario._recordar(id);
    else if (accion === 'recordar-todos') RN.calendario._recordarTodosDia(+dia);
  };
  box._rnCalClick = handler;
  box.addEventListener('click', handler);
};

/** Abre el modal de cobro para un cliente (cierra esta ventana primero). */
RN.calendario._cobrar = function (clienteId) {
  RN.uiComponents.cerrarModal();
  RN.modalCobro.abrir(clienteId);
};

/** Envía recordatorio de WhatsApp a un cliente. */
RN.calendario._recordar = function (clienteId) {
  RN.whatsapp.enviarRecordatorio(clienteId);
};

/**
 * Recordatorio masivo a todos los clientes del día abierto (solo pendientes).
 * v5.13.10 (BUG-1): ahora envía SOLO a los pendientes del día, no a toda la red.
 * v5.13.10 (LOG-3): reutiliza el mismo criterio que clientesCorteVigentePendientes.
 */
RN.calendario._recordarTodosDia = function (dia) {
  const ym = RN.calendario._mesActual();
  const diasMes = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  // v5.14.2 (Auditoría Reportes — BUG-1): usar 'ym' (mes VISUALIZADO en el
  // calendario) en vez de RN.calc.mesActualStr() (mes operativo real). Antes,
  // si el usuario navegaba a un mes pasado o futuro, el filtro comparaba
  // contra el mes real y getStatus(c) sin mes SIEMPRE reflejaba el mes
  // operativo actual — ahora ambos usan 'ym' (getStatus ya acepta mes, ver BUG-2).
  const clientes = RN.calc.clientesActivos().filter((c) =>
    RN.calendario._diaEfectivo(c.diaPago, diasMes) === dia &&
    RN.calc.getStatus(c, ym) !== 'paid' &&
    RN.calc.mesInicioCliente(c) <= ym &&
    c.telefono
  );
  if (!clientes.length) {
    RN.notifyUI.toast('No hay pendientes con teléfono en este día para recordar', 'info');
    return;
  }
  const ids = clientes.map((c) => c.id);
  RN.uiComponents.cerrarModal();
  // BUG-1: enviarMasivoLista respeta la lista del día (no el masivo global).
  RN.whatsapp.enviarMasivoLista(ids);
};
