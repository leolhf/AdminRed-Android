/**
 * calculations.js — Cálculos de negocio puros (sin UI).
 * Funciones: estado de cliente, precios, mora, descuentos, snapshots, recibos.
 * Debe cargar antes de render.js (render usa estas funciones).
 */

RN.calc = RN.calc || {};

/**
 * Tipos compartidos (JSDoc). Detalle de cada campo en MODELO.md → "Esquema de datos".
 *
 * @typedef {Object} Cliente
 * @property {string} id
 * @property {string} nombre
 * @property {string|null} planId       null = plan personalizado
 * @property {number} precio            precio mensual base (CUP)
 * @property {number} diaPago           día de corte (1-31)
 * @property {string} [mesInicio]       primer mes facturable, 'YYYY-MM'
 * @property {number} descuentoRecurrente
 * @property {number} deudaEquipo
 * @property {number} cuotaEquipo
 * @property {boolean} activo
 *
 * @typedef {Object} Cobro              entrada de RN.state.history (tipo 'servicio')
 * @property {string} id
 * @property {string} clienteId
 * @property {string} mes               'YYYY-MM'
 * @property {number} monto             SOLO servicio del mes
 * @property {number} [montoEquipo]     SOLO equipo pagado
 * @property {number} [montoMoraCobrada] mora de meses anteriores cobrada (ingreso real)
 * @property {number} [precioNetoAplicado] neto congelado al cobrar
 * @property {'completo'|'parcial'|'excedente'} tipoPago
 *
 * @typedef {Object} ResumenCliente
 * @property {string} estado            'paid'|'parcial'|'ok'|'warn'|'due'|'por-iniciar'|'inactivo'
 * @property {number} neto              precio neto del mes
 * @property {number} cuotaEq           cuota de equipo
 * @property {number} mora              meses de mora
 * @property {number} moraMonto         deuda de mora mes a mes (CUP)
 * @property {Array<{mes:string, neto:number}>} detalleMora
 * @property {number} totalMes          neto + cuota de equipo
 * @property {number} totalDeuda        deuda total del cliente
 */

/** Devuelve el día de hoy (1-31). */
RN.calc.hoy = function () { return new Date(); };

/**
 * Devuelve el mes actual en formato YYYY-MM.
 * v5.13.20: El mes operativo SIEMPRE es el mes real del reloj del sistema.
 * Antes (v5.13.1) priorizaba RN.state.mesActual, lo que permitía adelantar
 * el mes operativo al cerrar mes. Pero esto causaba problemas: el usuario
 * podía quedarse estancado en un mes anterior (si no cerraba mes) o cerrar
 * dos veces el mismo mes (si lo adelantaba). Ahora mesActualStr() siempre
 * devuelve el mes del reloj, igual que mesRealStr(). El cierre de mes solo
 * genera el snapshot; el mes avanza automáticamente cuando cambia el calendario.
 */
RN.calc.mesActualStr = function () {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/**
 * Establece RN.state.mesActual al mes del reloj del sistema.
 * v5.13.20: Ahora esto es redundante con mesActualStr() (que siempre usa el reloj),
 * pero se mantiene para compatibilidad y para sincronizar el campo guardado.
 */
RN.calc.sincronizarMesReal = function () {
  var d = new Date();
  RN.state.mesActual = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  return RN.state.mesActual;
};

/** Devuelve el mes REAL del reloj del sistema. v5.13.20: ahora idéntico a mesActualStr(). */
RN.calc.mesRealStr = function () {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/** Mes actual en texto legible (ej: "agosto 2025"). */
RN.calc.mesTexto = function (ym) {
  const [y, m] = (ym || RN.calc.mesActualStr()).split('-').map(Number);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${meses[m - 1]} ${y}`;
};

/** Días transcurridos desde el último pago del mes actual (o desde el día de pago). */
RN.calc.diasDesdePago = function (cliente) {
  const hoy = RN.calc.hoy();
  const diaPago = cliente.diaPago || 1;
  // Fecha del día de pago del mes actual
  const fechaPagoMes = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago);
  if (hoy.getDate() < diaPago) {
    // aún no llegó el día de pago este mes: contar desde el mes anterior
    fechaPagoMes.setMonth(fechaPagoMes.getMonth() - 1);
  }
  return Math.floor((hoy - fechaPagoMes) / 86400000);
};

/**
 * Mes de inicio de cobro de un cliente: a partir de qué mes se le empieza a
 * esperar pago. v5.10.5. Orden de prioridad:
 *   1. cliente.mesInicio (campo explícito, "YYYY-MM")
 *   2. mes derivado de cliente.createdAt (mes de alta)
 *   3. mes actual (fallback seguro)
 */
RN.calc.mesInicioCliente = function (cliente) {
  if (!cliente) return RN.calc.mesActualStr();
  if (cliente.mesInicio && /^\d{4}-\d{2}$/.test(cliente.mesInicio)) return cliente.mesInicio;
  if (cliente.createdAt) {
    var d = new Date(cliente.createdAt);
    if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  return RN.calc.mesActualStr();
};

/**
 * Estado del cliente: por-iniciar / ok / warn / due / paid / parcial.
 * v5.10.5: añade "por-iniciar" (mes actual anterior al mes de inicio de cobro)
 * y redefine "due" como mora REAL (meses de atraso > 0).
 *  - por-iniciar: aún no le toca pagar (mes actual < mesInicio)
 *  - paid: tiene un cobro de servicio completo registrado en el mes actual
 *  - parcial: tiene un cobro de servicio pero el monto pagado es menor al neto a pagar
 *  - ok: al día (aún no llegó su día de pago este mes)
 *  - warn: pasó el día de pago pero dentro de gracia (≤ config.graciaDias, default 5)
 *  - due: atrasado / mora real (getMora > 0) o se pasó del día de pago + gracia este mes
 *
 * @param {Cliente} cliente
 * @param {string} [mes] 'YYYY-MM' (por defecto, el mes actual)
 * @returns {string} 'paid'|'parcial'|'ok'|'warn'|'due'|'por-iniciar'|'inactivo'
 */
RN.calc.getStatus = function (cliente, mes) {
  // v5.13.6 (BUG-6): clientes inactivos (activo === false) devuelven 'inactivo'
  // en vez de 'ok'. Antes devolvia 'ok' (al d\u00eda) para clientes dados de baja,
  // lo que mostraba badge verde en clientes inactivos.
  if (!cliente) return 'ok';
  // v5.50.0: administrador (no paga): estado propio, nunca por vencer ni moroso.
  if (RN.calc.esAdmin(cliente)) return cliente.activo === false ? 'inactivo' : 'admin';
  // v5.43.0: interruptor "incluir inactivos con deuda" — un inactivo con mora
  // sigue debiendo: se muestra como 'due' (moroso) en vez de 'inactivo'.
  if (cliente.activo === false) {
    return (RN.state.config.incluirInactivosConDeuda && RN.calc.getMora(cliente) > 0) ? 'due' : 'inactivo';
  }
  // v5.14.2 (Auditoría Reportes — BUG-2): 'mes' es opcional y por defecto usa
  // el mes operativo actual (100% compatible con las llamadas existentes).
  // Antes esta función SIEMPRE usaba mesActualStr() internamente, por lo que
  // resumenCliente(cliente, mesPasado) ignoraba el mes visualizado y el
  // calendario mostraba el estado del mes operativo en TODAS las celdas,
  // incluso al navegar a meses pasados/futuros.
  var mesActual = RN.calc.mesActualStr();
  mes = mes || mesActual;

  // v5.10.5: si el mes consultado es anterior al mes de inicio de cobro, no debe todavía.
  var mesInicio = RN.calc.mesInicioCliente(cliente);
  if (RN.calc.mesesEntre(mesInicio, mes) < 0) return 'por-iniciar';

  const cobrosMes = RN.calc.cobrosServicio(cliente.id, mes);
  if (cobrosMes.length > 0) {
    // v5.13.1: Bug #15 — coherencia confirmada con Bug #2.
    // h.monto es SIEMPRE solo servicio, netoEsperado también es solo servicio.
    const netoEsperado = RN.calc.netoEsperadoMes(cliente, mes);
    const totalServicio = cobrosMes.reduce((s, h) => s + (h.monto || 0), 0);
    if (totalServicio >= netoEsperado - 0.01) return 'paid';
    return 'parcial';
  }

  // v5.14.2 (BUG-2): la lógica de "día de pago + días de gracia" depende del
  // reloj de HOY, así que solo tiene sentido cuando se consulta el mes
  // operativo actual. Para un mes distinto al actual (navegación del
  // calendario): un mes pasado sin cobro ya venció → 'due'; un mes futuro
  // aún no corresponde → 'ok'.
  if (mes !== mesActual) {
    return mes < mesActual ? 'due' : 'ok';
  }

  // v5.10.5: si tiene mora real de meses anteriores, es 'due' aunque el día
  // de pago de este mes aún no haya llegado.
  if (RN.calc.getMora(cliente) > 0) return 'due';

  const gracia = RN.state.config.graciaDias || 5;
  const diaPago = cliente.diaPago || 1;
  const hoy = RN.calc.hoy();
  const diaHoy = hoy.getDate();
  const diff = diaHoy - diaPago;
  if (diff <= 0) return 'ok';
  if (diff <= gracia) return 'warn';
  return 'due';
};

/**
 * Meses de mora (atraso) real de un cliente. v5.10.5: corregido.
 * Mora = meses completos que el cliente DEBE sin pagar (excluyendo el mes
 * actual, que está en curso y se gestiona vía getStatus/diaPago/gracia):
 *   - Si ha pagado algún mes: meses posteriores al último pagado, menos 1
 *     (excluye el mes actual). Ej: pagó hasta junio, en septiembre → jul+ago = 2.
 *     Si el último pagado >= mes actual, mora = 0.
 *   - Si nunca ha pagado: meses desde su mesInicio (incluido como primer mes
 *     esperado) hasta el mes actual (excluido). Convención aprobada:
 *     mesInicio=2026-09 → sep:0, oct:1 (debe sep), nov:2 (debe sep+oct).
 *     Mínimo 0. Así un cliente dado de alta este mes o con mesInicio futuro
 *     no aparece como moroso.
 */
/* ============================================================
 * v5.43.1 — Índice de pagos por cliente (rendimiento).
 *
 * getStatus/getMora/cobranzaMes recorrían RN.state.history completo por cada
 * cliente (O(clientes × historial)). El índice agrupa UNA vez los cobros de
 * servicio por cliente y mes:
 *   { porCliente: { [clienteId]: { meses: { 'YYYY-MM': [h, ...] }, ultimo: 'YYYY-MM'|null } } }
 * Se reconstruye solo cuando cambia el historial. Detección automática por firma
 * (referencia del array + longitud + primer/último cobro), más invalidación
 * explícita (RN.calc.invalidarIndicePagos) en los puntos donde se agrega un cobro
 * o se cargan datos. Si se EDITA en sitio el mes/cliente de un cobro ya existente,
 * hay que llamar a invalidarIndicePagos().
 * ============================================================ */
RN.calc._idxPagos = null;
RN.calc._idxPagosFirma = null;

RN.calc._firmaHistorial = function () {
  var h = RN.state.history || [];
  return { ref: h, n: h.length, primero: h[0], ultimo: h[h.length - 1] };
};

/** Fuerza la reconstrucción del índice en la próxima consulta. */
RN.calc.invalidarIndicePagos = function () {
  RN.calc._idxPagos = null;
  RN.calc._idxPagosFirma = null;
};

/** Reconstruye el índice de pagos por cliente a partir de RN.state.history. */
RN.calc.rebuildIndexPagos = function () {
  var porCliente = {};
  (RN.state.history || []).forEach(function (h) {
    if (!h || h.tipo !== 'servicio' || !h.clienteId || !h.mes) return;
    var e = porCliente[h.clienteId] || (porCliente[h.clienteId] = { meses: {}, ultimo: null });
    (e.meses[h.mes] || (e.meses[h.mes] = [])).push(h);
    if (e.ultimo === null || h.mes > e.ultimo) e.ultimo = h.mes;
  });
  RN.calc._idxPagos = { porCliente: porCliente };
  RN.calc._idxPagosFirma = RN.calc._firmaHistorial();
  return RN.calc._idxPagos;
};

/** Devuelve el índice vigente (lo reconstruye si el historial cambió). */
RN.calc.indexPagos = function () {
  var f = RN.calc._idxPagosFirma;
  var a = RN.calc._firmaHistorial();
  if (!RN.calc._idxPagos || !f || f.ref !== a.ref || f.n !== a.n || f.primero !== a.primero || f.ultimo !== a.ultimo) {
    return RN.calc.rebuildIndexPagos();
  }
  return RN.calc._idxPagos;
};

var _SIN_COBROS = [];
/** Cobros de servicio de un cliente en un mes (array, vacío si no hay). */
RN.calc.cobrosServicio = function (clienteId, mes) {
  var e = RN.calc.indexPagos().porCliente[clienteId];
  return (e && e.meses[mes]) || _SIN_COBROS;
};

/** Último mes (YYYY-MM) con un cobro de servicio del cliente, o null si nunca pagó. */
RN.calc.ultimoMesPagado = function (clienteId) {
  var e = RN.calc.indexPagos().porCliente[clienteId];
  return e ? e.ultimo : null;
};

/**
 * Meses completos de atraso del cliente (sin contar el mes en curso).
 * @param {Cliente} cliente
 * @returns {number} 0 si está al día
 */
RN.calc.getMora = function (cliente) {
  // v5.50.0: un administrador nunca tiene mora.
  if (RN.calc.esAdmin(cliente)) return 0;
  const mes = RN.calc.mesActualStr();
  // v5.43.1: último mes pagado desde el índice (antes: filter+map+sort del historial).
  const ultimoPagado = RN.calc.ultimoMesPagado(cliente.id);
  if (ultimoPagado !== null) {
    if (ultimoPagado >= mes) return 0;
    // Meses debidos = meses posteriores al último pagado, excluyendo el mes
    // actual (en curso). Ej: pagó hasta junio, en septiembre debe jul+ago = 2.
    var d = RN.calc.mesesEntre(ultimoPagado, mes) - 1;
    return d > 0 ? d : 0;
  }
  // Nunca ha pagado: contar desde el mes de inicio de cobro (incluido como
  // primer mes esperado), excluyendo el mes actual (en curso).
  // Convención aprobada: mesInicio=2026-09 → sep:0, oct:1 (debe sep), nov:2 (debe sep+oct).
  var mesInicio = RN.calc.mesInicioCliente(cliente);
  var diff = RN.calc.mesesEntre(mesInicio, mes);
  return diff > 0 ? diff : 0;
};

/**
 * v5.42.0: lista (YYYY-MM, orden cronológico) de los meses que componen la
 * mora. Son los `getMora()` meses inmediatamente anteriores al mes actual
 * (en ambos casos del modelo —pagó alguna vez / nunca pagó— la mora es un
 * bloque contiguo que termina en el mes previo al actual).
 */
RN.calc.mesesEnMora = function (cliente) {
  var n = RN.calc.getMora(cliente);
  var lista = [];
  var m = RN.calc.mesActualStr();
  for (var i = 0; i < n; i++) { m = RN.calc.mesAnterior(m); lista.push(m); }
  return lista.reverse();
};

/**
 * v5.42.0: deuda de mora calculada MES A MES. Suma getPrecioNeto(cliente, mes)
 * de cada mes en atraso, en lugar de multiplicar el neto del mes actual por
 * la cantidad de meses (que distorsiona si hubo descuentos puntuales o
 * bonificaciones distintas en meses anteriores).
 * @returns {{meses: Array<{mes:string, neto:number}>, total:number}}
 */
RN.calc.detalleMora = function (cliente) {
  var meses = RN.calc.mesesEnMora(cliente).map(function (m) {
    return { mes: m, neto: RN.calc.getPrecioNeto(cliente, m) };
  });
  var total = meses.reduce(function (s, x) { return s + x.neto; }, 0);
  return { meses: meses, total: +total.toFixed(2) };
};

/**
 * v5.42.0: neto de servicio esperado para un mes. Si el mes ya se cerró con un
 * cobro completo (no parcial) que guardó `precioNetoAplicado`, se usa ese valor
 * congelado: editar luego el plan o el descuento recurrente no cambia lo ya
 * cobrado. Sin cobro cerrado (o cobros antiguos sin el campo) → neto vivo.
 */
RN.calc.netoEsperadoMes = function (cliente, mes) {
  mes = mes || RN.calc.mesActualStr();
  var cerrado = RN.calc.cobrosServicio(cliente.id, mes).find(function (h) {
    return h.tipoPago !== 'parcial' && typeof h.precioNetoAplicado === 'number';
  });
  return cerrado ? cerrado.precioNetoAplicado : RN.calc.getPrecioNeto(cliente, mes);
};

/**
 * v5.14.2 (Auditoría Reportes — DUP-1): helpers compartidos para los charts
 * de barras "hechos a mano" con divs (antes prediccion.js y tendencia.js
 * duplicaban esta lógica con ligeras variaciones).
 */
RN.chart = RN.chart || {};

/** Una barra vertical individual. */
RN.chart.barra = function (altura, color, tooltip, ancho) {
  return `<div title="${RN.render.escAttr(tooltip || '')}" style="width:${ancho || 14}px;height:${Math.max(2, Math.round(altura))}px;background:${color};border-radius:3px"></div>`;
};

/** Agrupa una o más barras bajo una etiqueta de mes (columna del chart). */
RN.chart.grupoMes = function (barrasHtml, etiqueta) {
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">${barrasHtml}<span class="muted" style="font-size:11px">${etiqueta}</span></div>`;
};

/** Diferencia en meses entre dos YYYY-MM (b - a). */
RN.calc.mesesEntre = function (a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

/**
 * Deuda total de un cliente = servicio pendiente (mes actual + meses en mora)
 * + deuda de equipo. v5.13.1: Bug #4 — nueva función centralizada para que
 * todas las vistas (mora, cobranza, render, calendario) usen el mismo cálculo
 * en lugar de getPrecioNeto(c) sin mes + getCuotaEquipo dispersos.
 * @param {Cliente} cliente
 * @param {string} [mes] 'YYYY-MM'
 * @returns {number} CUP (un cliente inactivo solo debe su mora)
 */
RN.calc.deudaTotalCliente = function (cliente, mes) {
  mes = mes || RN.calc.mesActualStr();
  var mora = RN.calc.getMora(cliente);
  var netoMes = RN.calc.getPrecioNeto(cliente, mes);
  // v5.42.0: mora mes a mes (antes: netoMes * (mora + 1)).
  // v5.43.0: un cliente inactivo no debe el mes en curso, solo su mora.
  var servicioPendiente = (cliente.activo === false ? 0 : netoMes) + RN.calc.detalleMora(cliente).total;
  var deudaEquipo = RN.investment.getDeudaEquipoCliente(cliente);
  return +(servicioPendiente + deudaEquipo).toFixed(2);
};

/**
 * v5.13.7 (DUP-2): Resumen consolidado de un cliente para todas las vistas.
 * Centraliza estado, neto, cuota, deuda, mora y totales en un solo objeto
 * para evitar que cada vista recalcule por separado.
 * @param {Cliente} cliente
 * @param {string} [mes] 'YYYY-MM'
 * @returns {ResumenCliente}
 */
RN.calc.resumenCliente = function (cliente, mes) {
  mes = mes || RN.calc.mesActualStr();
  // v5.14.2 (BUG-2): propagar 'mes' a getStatus — antes siempre reflejaba el
  // mes operativo actual sin importar qué mes se estuviera consultando.
  var estado = RN.calc.getStatus(cliente, mes);
  var neto = RN.calc.getPrecioNeto(cliente, mes);
  var cuotaEq = RN.investment.getCuotaEquipoCliente(cliente);
  var deuda = RN.investment.getDeudaEquipoCliente(cliente);
  var mora = RN.calc.getMora(cliente);
  var totalMes = neto + cuotaEq;
  var totalDeuda = RN.calc.deudaTotalCliente(cliente, mes);
  var detMora = RN.calc.detalleMora(cliente);
  return { estado: estado, neto: neto, cuotaEq: cuotaEq, deuda: deuda, mora: mora, moraMonto: detMora.total, detalleMora: detMora.meses, totalMes: totalMes, totalDeuda: totalDeuda, mes: mes };
};

/** Mes anterior a un YYYY-MM. */
RN.calc.mesAnterior = function (ym) {
  let [y, m] = ym.split('-').map(Number);
  m--; if (m < 1) { m = 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
};

/**
 * v5.14.2 (Auditoría Reportes — DUP-4): últimos N meses (YYYY-MM), empezando
 * por el mes operativo actual hacia atrás. Antes esta lista se construía por
 * separado en render.js (selector de reportes) y en descuentos-view.js con
 * fuentes de datos distintas — se deja aquí como helper único para el caso
 * "últimos N meses del calendario" (no confundir con RN.calc.mesesConDatos,
 * que extrae los meses que realmente tienen registros en un array).
 */
RN.calc.listaMeses = function (n) {
  n = n || 12;
  var meses = [];
  var m = RN.calc.mesActualStr();
  for (var i = 0; i < n; i++) { meses.push(m); m = RN.calc.mesAnterior(m); }
  return meses;
};

/**
 * v5.14.2 (DUP-4): meses únicos presentes en un array de registros (ej.
 * descuentos), ordenados descendente. Útil para selectores de filtro cuyas
 * opciones deben reflejar solo los meses que realmente tienen datos.
 */
RN.calc.mesesConDatos = function (arr, campo) {
  campo = campo || 'mes';
  var set = {};
  (arr || []).forEach(function (item) { if (item[campo]) set[item[campo]] = true; });
  return Object.keys(set).sort().reverse();
};

/** Mes siguiente a un YYYY-MM. */
RN.calc.mesSiguiente = function (ym) {
  let [y, m] = ym.split('-').map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return y + '-' + String(m).padStart(2, '0');
};

/** v5.50.0: ¿es un cliente administrador (no paga, solo consume red)? */
RN.calc.esAdmin = function (cliente) {
  return !!(cliente && cliente.esAdmin === true);
};

/** Precio mensual del plan de un cliente (busca por planId o usa precio directo). */
RN.calc.getPrecioBase = function (cliente, mes) {
  // v5.50.0: un administrador no paga; puede tener plan solo para definir sus megas.
  if (RN.calc.esAdmin(cliente)) return 0;
  if (cliente.planId) {
    const plan = RN.state.planes.find(p => p.id === cliente.planId);
    if (plan) return plan.precio;
  }
  // v5.48.0: cliente con precio fijo en USD -> el CUP se deriva de la tasa que le toca.
  if (RN.calc.esPrecioUSD(cliente)) {
    const info = RN.calc.infoTasa(cliente, mes);
    if (info.tasa > 0) return RN.calc.redondearCobroCUP(RN.calc.totalUSD(cliente) * info.tasa);
  }
  return cliente.precio || 0;
};

/* ============================================================
 * v5.48.0 — Precio fijo en USD por mega (clientes "Personalizado").
 *
 * El cliente guarda megas + precioMega en USD (precioMoneda = 'USD'). El CUP del
 * mes se deriva de la tasa que le corresponde:
 *   - tasa del mensaje: la tasa vigente cuando se le envió el recordatorio del mes
 *     (cliente.tasasMensaje[mes] = { tasa, fecha }).
 *   - A TIEMPO (hasta el día de pago/corte del mes, inclusive): la MENOR entre la tasa
 *     del mensaje y la de hoy (nunca paga más de lo que decía el mensaje).
 *   - TARDE (pasado el día de pago): la MAYOR de las dos.
 *   - Sin tasa de mensaje guardada: la tasa de hoy.
 * El CUP se redondea hacia ARRIBA al múltiplo de 100 (a favor del negocio).
 * ============================================================ */

/** ¿El cliente tiene precio fijo en USD por mega? (solo personalizados con megas y precio) */
RN.calc.esPrecioUSD = function (cliente) {
  return !!cliente && cliente.precioMoneda === 'USD' && !cliente.planId &&
    (+cliente.megas || 0) > 0 && (+cliente.precioMega || 0) > 0;
};

/** Total mensual del cliente en USD (megas × USD por mega), 2 decimales. */
RN.calc.totalUSD = function (cliente) {
  return +((+cliente.megas || 0) * (+cliente.precioMega || 0)).toFixed(2);
};

/** Redondea un monto CUP hacia ARRIBA al múltiplo de 100 (con tolerancia de coma flotante). */
RN.calc.redondearCobroCUP = function (v) {
  v = +v || 0;
  if (v <= 0) return 0;
  return Math.ceil((v - 1e-9) / 100) * 100;
};

/** Fin del día de pago (corte) del cliente en el mes 'YYYY-MM' (hora local). */
RN.calc.fechaLimiteMes = function (cliente, mes) {
  const m = /^(\d{4})-(\d{2})/.exec(mes || '');
  if (!m) return null;
  const diasMes = new Date(+m[1], +m[2], 0).getDate();
  const dia = Math.min(Math.max(1, parseInt(cliente.diaPago, 10) || 1), diasMes);
  return new Date(+m[1], +m[2] - 1, dia, 23, 59, 59, 999);
};

/** Tasa guardada cuando se envió el mensaje del mes (0 si no hay). */
RN.calc.tasaMensajeMes = function (cliente, mes) {
  const t = cliente && cliente.tasasMensaje && cliente.tasasMensaje[mes];
  return t && +t.tasa > 0 ? +t.tasa : 0;
};

/**
 * Tasa que corresponde al cliente (USD) para el mes, según la regla a tiempo/tarde.
 * @param {Cliente} cliente
 * @param {string} [mes] 'YYYY-MM' (default: mes actual)
 * @param {Date} [ahora] solo para pruebas
 * @returns {{tasa:number, tasaMensaje:number, tasaHoy:number, aTiempo:boolean, motivo:string}}
 */
RN.calc.infoTasa = function (cliente, mes, ahora) {
  mes = mes || RN.calc.mesActualStr();
  ahora = ahora || new Date();
  const hoy = +RN.state.config.tasaUsd || 0;
  const msg = RN.calc.tasaMensajeMes(cliente, mes);
  const limite = RN.calc.fechaLimiteMes(cliente, mes);
  const aTiempo = !limite || ahora.getTime() <= limite.getTime();
  let tasa, motivo;
  if (!msg) {
    tasa = hoy; motivo = 'sin mensaje enviado: tasa de hoy';
  } else if (!hoy) {
    tasa = msg; motivo = 'tasa del mensaje';
  } else if (aTiempo) {
    tasa = Math.min(msg, hoy);
    motivo = hoy < msg ? 'a tiempo: bajó la tasa, se usa la de hoy' : 'a tiempo: se mantiene la tasa del mensaje';
  } else {
    tasa = Math.max(msg, hoy);
    motivo = hoy > msg ? 'pago tarde: subió la tasa, se usa la de hoy' : 'pago tarde: se usa la tasa más alta (la del mensaje)';
  }
  return { tasa: tasa, tasaMensaje: msg, tasaHoy: hoy, aTiempo: aTiempo, motivo: motivo };
};

/** Neto del mes en USD para un cliente con precio USD (descuentos CUP convertidos a la tasa aplicada). */
RN.calc.getPrecioNetoUSD = function (cliente, mes) {
  if (!RN.calc.esPrecioUSD(cliente)) return 0;
  mes = mes || RN.calc.mesActualStr();
  const info = RN.calc.infoTasa(cliente, mes);
  const total = RN.calc.totalUSD(cliente);
  if (!(info.tasa > 0)) return total;
  const desc = RN.calc.getDescuentoRecurrente(cliente) + RN.calc.getDescuentosPuntualesMes(cliente.id, mes);
  return Math.max(0, +(total - desc / info.tasa).toFixed(2));
};

/* ============================================================
 * v5.49.0 — Redondeo del resto en CUP de pagos mixtos (USD + CUP).
 * Modo (config.redondeoPagoMixto): 'cliente' (default: el resto se redondea hacia ABAJO al
 * múltiplo de 100, a favor del cliente), 'negocio' (hacia ARRIBA) o 'exacto' (sin redondeo).
 * La diferencia queda registrada en el cobro (h.ajusteRedondeo) para que caja y reportes cuadren:
 *   ajuste > 0 = perdonado al cliente · ajuste < 0 = cobrado de más (modo negocio).
 * Solo afecta pagos con USD de por medio; todo en CUP o todo en USD no se redondea.
 * ============================================================ */
RN.calc.modoRedondeoMixto = function () {
  const m = RN.state.config && RN.state.config.redondeoPagoMixto;
  return (m === 'negocio' || m === 'exacto') ? m : 'cliente';
};

/** Resto en CUP sugerido según el modo (solo si hubo USD; si no, el resto exacto). */
RN.calc.restoCUPRedondeado = function (falta, usd, modo) {
  falta = +falta || 0;
  modo = modo || RN.calc.modoRedondeoMixto();
  if (!(usd > 0) || falta <= 0 || modo === 'exacto') return +falta.toFixed(2);
  if (modo === 'negocio') return Math.ceil((falta - 1e-9) / 100) * 100;
  return Math.floor((falta + 1e-9) / 100) * 100;
};

/**
 * Ajuste por redondeo de un pago: diferencia (aPagar - pagadoCUP) que se da por saldada.
 * Positivo = perdonado al cliente; negativo = cobrado de más (cabe < 100 CUP); 0 = nada.
 */
RN.calc.ajusteRedondeoPago = function (usd, pagadoCUP, aPagar, modo) {
  modo = modo || RN.calc.modoRedondeoMixto();
  if (!(usd > 0) || modo === 'exacto') return 0;
  const dif = +((+aPagar || 0) - (+pagadoCUP || 0)).toFixed(2);
  if (modo === 'cliente' && dif > 0.005 && dif < 100) return dif;
  if (modo === 'negocio' && dif < -0.005 && dif > -100) return dif;
  return 0;
};

/** Suma de ajustes por redondeo de un mes: { perdonado, cobrado, neto } en CUP. */
RN.calc.totalAjustesRedondeoMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  let perdonado = 0, cobrado = 0;
  (RN.state.history || []).forEach(function (h) {
    if (!h || h.mes !== mes || !h.ajusteRedondeo) return;
    if (h.ajusteRedondeo > 0) perdonado += h.ajusteRedondeo; else cobrado += -h.ajusteRedondeo;
  });
  return { perdonado: +perdonado.toFixed(2), cobrado: +cobrado.toFixed(2), neto: +(cobrado - perdonado).toFixed(2) };
};

/**
 * Tasa de conversión interna para el cobro: neto CUP ÷ neto USD. Así pagar exactamente
 * el neto en USD cubre el neto en CUP aunque éste se haya redondeado hacia arriba.
 */
RN.calc.tasaConversionCobro = function (cliente, mes) {
  mes = mes || RN.calc.mesActualStr();
  const usd = RN.calc.getPrecioNetoUSD(cliente, mes);
  const cup = RN.calc.getPrecioNeto(cliente, mes);
  if (usd > 0 && cup > 0) return +(cup / usd).toFixed(6);
  return RN.calc.infoTasa(cliente, mes).tasa;
};

/**
 * Guarda la tasa del mensaje del mes (solo la primera vez que se envía ese mes).
 * Conserva solo los últimos 12 meses. Devuelve true si guardó algo.
 */
RN.calc.fijarTasaMensaje = function (cliente, mes) {
  const hoy = +RN.state.config.tasaUsd || 0;
  if (!RN.calc.esPrecioUSD(cliente) || !(hoy > 0)) return false;
  mes = mes || RN.calc.mesActualStr();
  if (!cliente.tasasMensaje) cliente.tasasMensaje = {};
  if (cliente.tasasMensaje[mes] && +cliente.tasasMensaje[mes].tasa > 0) return false;
  cliente.tasasMensaje[mes] = { tasa: hoy, fecha: new Date().toISOString() };
  Object.keys(cliente.tasasMensaje).sort().slice(0, -12).forEach(function (k) { delete cliente.tasasMensaje[k]; });
  return true;
};

/** Descuento recurrente (permanente por cliente) en CUP. */
RN.calc.getDescuentoRecurrente = function (cliente) {
  return cliente.descuentoRecurrente || 0;
};

/* ============================================================
 * v5.14.4 — Bonificaciones permanentes / por N meses.
 * Helpers centralizados de vigencia. ÚNICA fuente de verdad para
 * decidir si un descuento aplica a un mes (antes la condición estaba
 * duplicada en calculations.js, modal-cobro.js y month-reset.js).
 * Todos los helpers toleran datos viejos (esquema ≤7, checkpoints sin
 * migrar, backups importados): si falta `vigencia` se deduce de
 * `soloPago`, y si falta `desde` se usa `d.mes`.
 * ============================================================ */
RN.descuentos = RN.descuentos || {};

/** Vigencia normalizada: 'meses' | 'permanente' | 'unPago'. */
RN.descuentos.vigenciaDe = function (d) {
  if (d.vigencia) return d.vigencia;
  return d.soloPago ? 'unPago' : 'meses'; // legacy: soloPago === unPago
};

/** Mes de inicio normalizado (fallback: d.mes). */
RN.descuentos.desdeDe = function (d) {
  return d.desde || d.mes;
};

/** Último mes del rango de vigencia, o null (permanente / unPago). */
RN.descuentos.venceEnMes = function (d) {
  var vig = RN.descuentos.vigenciaDe(d);
  if (vig === 'permanente' || vig === 'unPago') return null;
  var n = Math.max(1, parseInt(d.durMeses, 10) || 1);
  var desde = RN.descuentos.desdeDe(d);
  if (!desde) return null;
  var ym = desde;
  for (var i = 1; i < n; i++) ym = RN.calc.mesSiguiente(ym);
  return ym;
};

/**
 * ¿El descuento d cuenta para el mes M?
 * - anulados: nunca.
 * - permanente: M >= desde (nunca hacia atrás — R1).
 * - meses (N): desde <= M <= desde + N - 1 (por calendario — D2).
 *   Dentro del rango cuenta aunque estado='aplicado' (propiedad que hay
 *   que preservar para que el neto de meses ya cobrados siga cuadrando).
 * - unPago: mientras no se haya consumido (estado 'pendiente', sin
 *   aplicaciones aún) — equivale al soloPago legado.
 */
RN.descuentos.vigenteEnMes = function (d, mes) {
  if (!d || !mes || d.estado === 'anulado') return false;
  var vig = RN.descuentos.vigenciaDe(d);
  var desde = RN.descuentos.desdeDe(d);
  if (!desde) return false;
  if (vig === 'permanente') return mes >= desde;
  if (vig === 'unPago') {
    var consumido = d.estado !== 'pendiente' ||
      (Array.isArray(d.aplicaciones) && d.aplicaciones.length > 0) || d.cobroHid;
    return !consumido;
  }
  // 'meses'
  var hasta = RN.descuentos.venceEnMes(d);
  return !!(hasta && mes >= desde && mes <= hasta);
};

/** ¿Aún aplicará a algún mes posterior a `mes`? (para decidir estado) */
RN.descuentos.aplicaAFuturo = function (d, mes) {
  var vig = RN.descuentos.vigenciaDe(d);
  if (vig === 'permanente') return true;
  if (vig === 'unPago') return false;
  var hasta = RN.descuentos.venceEnMes(d);
  return !!(hasta && hasta > mes);
};

/**
 * Registra la aplicación del mes M en un cobro (v5.14.4).
 * Guarda el valor COBRADO congelado (R2) para que el revert no dependa
 * del precio del plan actual. Solo pasa a 'aplicado' cuando ya no aplica
 * a ningún mes futuro (puntual/unPago: inmediato; N-meses: al último mes
 * del rango; permanente: nunca — queda activa hasta anulación).
 */
RN.descuentos.aplicarEnMes = function (d, mes, cobroId, valor) {
  if (!d.aplicaciones || !Array.isArray(d.aplicaciones)) d.aplicaciones = [];
  // Evitar duplicar la aplicación del mismo mes en el mismo cobro
  var ya = d.aplicaciones.some(function (a) { return a.mes === mes && a.cobroHid === cobroId; });
  if (!ya) d.aplicaciones.push({ mes: mes, cobroHid: cobroId, valor: +valor || 0 });
  // Compatibilidad legada: cobroHid apunta a la última aplicación
  d.cobroHid = cobroId;
  if (!RN.descuentos.aplicaAFuturo(d, mes)) {
    d.estado = 'aplicado';
  }
  return d;
};

/** Texto de vigencia legible: "Permanente", "jun–ago 2025 (3 meses)" o "1 solo pago". */
RN.descuentos.rangoVigencia = function (d) {
  var vig = RN.descuentos.vigenciaDe(d);
  if (vig === 'permanente') return 'Permanente';
  if (vig === 'unPago') return '1 solo pago';
  var n = Math.max(1, parseInt(d.durMeses, 10) || 1);
  var desde = RN.descuentos.desdeDe(d);
  if (!desde) return '—';
  if (n === 1) return RN.calc.mesTexto(desde);
  var hasta = RN.descuentos.venceEnMes(d);
  var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var _m = function (ym, conAnio) {
    var partes = ym.split('-');
    return meses[parseInt(partes[1], 10) - 1] + (conAnio ? ' ' + partes[0] : '');
  };
  var mismoAnio = desde.split('-')[0] === hasta.split('-')[0];
  return _m(desde, !mismoAnio) + '–' + _m(hasta, true) + ' (' + n + ' meses)';
};

/**
 * ¿Es un descuento puramente puntual de ese mes (se anula al cierre)?
 * true solo para vigencia 'meses' con durMeses=1 creado para ese mes.
 * Las permanentes, N>1 meses y unPago NO se anulan al cierre (R4).
 */
RN.descuentos.esPuntualDeMes = function (d, mes) {
  if (!d || d.estado !== 'pendiente') return false;
  var vig = RN.descuentos.vigenciaDe(d);
  if (vig !== 'meses') return false;
  var n = Math.max(1, parseInt(d.durMeses, 10) || 1);
  return n === 1 && RN.descuentos.desdeDe(d) === mes;
};

/**
 * Descuentos puntuales del mes para un cliente (suma de valores en CUP).
 * Solo los que estén "aplicado" o "pendiente" (no anulados).
 * v5.14.4: la condición de vigencia vive en RN.descuentos.vigenteEnMes.
 */
RN.calc.getDescuentosPuntualesMes = function (clienteId, mes) {
  mes = mes || RN.calc.mesActualStr();
  let total = 0;
  RN.state.descuentos.forEach(d => {
    if (d.clienteId === clienteId && RN.descuentos.vigenteEnMes(d, mes)) {
      total += RN.calc.valorDescuento(d, clienteId, mes);
    }
  });
  return total;
};

/** Calcula el valor en CUP de un descuento puntual según su modo. */
/**
 * v5.43.0: cantidad de días REALES de un mes 'YYYY-MM' (feb 28/29, abr 30...).
 * Devuelve 0 si el mes no es válido.
 */
RN.calc.diasDelMes = function (ym) {
  var m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return 0;
  return new Date(+m[1], +m[2], 0).getDate();
};

/**
 * v5.47.2: redondea un descuento CALCULADO (porcentaje / días) HACIA ABAJO al
 * múltiplo de 100, sin centavos. Siempre a favor del negocio (el descuento
 * nunca supera al calculado) y deja cifras redondas para facilitar el pago.
 * El epsilon evita que errores de coma flotante (p. ej. 299.99999) bajen 100.
 */
RN.calc.redondearDescuento = function (v) {
  v = +v || 0;
  if (v <= 0) return 0;
  return Math.floor((v + 1e-9) / 100) * 100;
};

RN.calc.valorDescuento = function (d, clienteId, mes) {
  const cliente = RN.state.clients.find(c => c.id === clienteId);
  const base = cliente ? RN.calc.getPrecioBase(cliente, mes) : 0;
  switch (d.modo) {
    // El modo fijo lo escribe el usuario: no se redondea.
    case 'fijo': return d.valor || 0;
    case 'porcentaje': return RN.calc.redondearDescuento(base * (d.valor || 0) / 100);
    case 'dias': {
      // v5.43.0: proporcional a días sin servicio sobre los días REALES del mes
      // (mes indicado, o el del descuento). Si no hay mes válido: días base (30).
      const dias = RN.calc.diasDelMes(mes || d.mes || d.desde) || RN.state.config.diasBaseMes || 30;
      return RN.calc.redondearDescuento((base / dias) * (d.valor || 0));
    }
    default: return 0;
  }
};

/**
 * Precio neto a cobrar = precioBase - descuentoRecurrente - descuentosPuntuales.
 * Nunca negativo.
 * @param {Cliente} cliente
 * @param {string} [mes] 'YYYY-MM' (por defecto, el mes actual)
 * @returns {number} CUP
 */
RN.calc.getPrecioNeto = function (cliente, mes) {
  const base = RN.calc.getPrecioBase(cliente, mes);
  const rec = RN.calc.getDescuentoRecurrente(cliente);
  const punt = RN.calc.getDescuentosPuntualesMes(cliente.id, mes);
  return Math.max(0, +(base - rec - punt).toFixed(2));
};

/**
 * Próximo número de recibo (R-YYYY-0000).
 * v5.14.2 (Auditoría Reportes — BUG-6): función de SOLO LECTURA — no muta
 * RN.state.reciboCounter. El incremento real y atómico del contador ocurre
 * al guardar el cobro (modal-cobro.js: RN.state.reciboCounter++), después de
 * confirmar que el cobro se registró. Antes esta función incrementaba una
 * copia local del contador sin persistirla, lo que separaba (de forma
 * confusa) la responsabilidad de "generar el número" de "reservarlo".
 * Llamar a esta función varias veces sin guardar un cobro siempre retorna el
 * mismo número siguiente — es el comportamiento correcto para una función pura.
 */
RN.calc.proxReciboNum = function () {
  const y = new Date().getFullYear();
  const counter = (RN.state.reciboCounter || 0) + 1;
  return 'R-' + y + '-' + String(counter).padStart(4, '0');
};

/** Genera un ID único. */
RN.calc.uid = function (prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
};

/** Formatea un número como moneda CUP. */
RN.calc.formatCUP = function (n) {
  return (+n || 0).toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CUP';
};

/** Formatea como USD informativo (requiere tasa configurada). */
RN.calc.formatUSD = function (cup) {
  const tasa = RN.state.config.tasaUsd || 0;
  if (!tasa) return '';
  return '$' + (cup / tasa).toFixed(2) + ' USD';
};

/**
 * v5.43.0: ingreso total de un cobro = servicio (h.monto) + equipo
 * (h.montoEquipo) + mora de meses anteriores efectivamente cobrada
 * (h.montoMoraCobrada). Antes la mora pagada solo quedaba como dato
 * informativo (h.montoMora) y no entraba en ingresos ni en la caja.
 * Los cobros anteriores a v5.43.0 no traen el campo y suman 0 (sin cambios).
 */
RN.calc.ingresoCobro = function (h) {
  return (h.monto || 0) + (h.montoEquipo || 0) + (h.montoMoraCobrada || 0);
};

/** Total ingresos del mes (servicio + equipo + mora cobrada). */
RN.calc.ingresosMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.state.history
    .filter(h => h.mes === mes)
    .reduce((s, h) => s + RN.calc.ingresoCobro(h), 0);
};

/**
 * v5.13.6 (BUG-5): Ingresos SOLO de servicio del mes (sin equipo ni mora de
 * otros meses). Se usa para calcular la tasa de cobro real del mes, comparando
 * lo cobrado en servicio contra lo esperado. Antes se usaba ingresosMes() que
 * incluye h.montoEquipo y cobros de meses anteriores, lo que podía hacer que
 * la tasa de cobro superara el 100% de forma engañosa.
 */
RN.calc.ingresosServicioMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.state.history
    .filter(h => h.mes === mes && h.tipo === 'servicio')
    .reduce((s, h) => s + (h.monto || 0), 0);
};

/** Total ingresos históricos. */
RN.calc.ingresosTotales = function () {
  return RN.state.history.reduce((s, h) => s + RN.calc.ingresoCobro(h), 0);
};

/** Total gastos históricos. */
RN.calc.gastosTotales = function () {
  return RN.state.gastos.reduce((s, g) => s + (g.monto || 0), 0);
};

/** Total de depósitos históricos a la caja (v5.17.0). */
RN.calc.totalDepositos = function () {
  return (RN.state.depositos || []).reduce((s, d) => s + (d.monto || 0), 0);
};

/** Total de retiros de caja históricos (v5.19.0). */
RN.calc.totalRetiros = function () {
  return (RN.state.retiros || []).reduce((s, r) => s + (r.monto || 0), 0);
};

/** v5.20.0: Convierte un monto a CUP según la moneda indicada, usando la tasa configurada (o la pasada explícitamente). */
RN.calc.aCUP = function (monto, moneda, tasa) {
  monto = +monto || 0;
  if (moneda !== 'USD') return monto;
  tasa = tasa || RN.state.config.tasaUsd || 0;
  return +(monto * tasa).toFixed(2);
};

/**
 * v5.30.0 — Normaliza la moneda de un movimiento de caja.
 * Los registros antiguos (antes de v5.20.0) no traen `moneda`: se asumen CUP.
 * Solo hay tres valores válidos: 'CUP', 'USD' y 'MIXTO'.
 */
RN.calc.monedaMovimiento = function (m) {
  var x = (m || {}).moneda;
  return (x === 'USD' || x === 'MIXTO') ? x : 'CUP';
};

/**
 * v5.30.0 — Desglose REAL de un movimiento de caja (depósito o retiro) en sus
 * dos componentes físicas: { usd, cup }.
 *
 * Corrección del bug "MIXTO": antes todo lo que no fuese exactamente 'USD'
 * caía en la rama CUP, así que la parte en dólares de un movimiento mixto
 * NUNCA entraba a la gaveta de USD y su equivalente se contaba como si fuese
 * CUP puro (inflando el CUP físico y descuadrando los dos saldos).
 *
 *  - 'CUP'   → { usd: 0, cup: monto }
 *  - 'USD'   → { usd: montoOriginal, cup: 0 }
 *  - 'MIXTO' → { usd: montoOriginal, cup: montoCUPDirecto }
 *    (si el registro es antiguo y no trae montoCUPDirecto, se reconstruye
 *     como monto − usd×tasa para no perder el dato)
 */
RN.calc.desgloseMovimiento = function (m) {
  m = m || {};
  var moneda = RN.calc.monedaMovimiento(m);
  var tasa = (m.tasaAlMomento || m.tasaUsada || RN.state.config.tasaUsd || 0);
  if (moneda === 'MIXTO') {
    var usd = +(m.montoOriginal || 0);
    var cup = (m.montoCUPDirecto === undefined || m.montoCUPDirecto === null)
      ? +Math.max(0, (+(m.monto || 0)) - (usd * tasa)).toFixed(2)
      : +(m.montoCUPDirecto || 0);
    return { moneda: 'MIXTO', usd: usd, cup: cup, cupDesdeUSD: +(usd * tasa).toFixed(2) };
  }
  if (moneda === 'USD') {
    return { moneda: 'USD', usd: +(m.montoOriginal || 0), cup: 0, cupDesdeUSD: +(m.monto || 0) };
  }
  return { moneda: 'CUP', usd: 0, cup: +(m.monto || 0), cupDesdeUSD: 0 };
};

/**
 * v5.43.0: tasa USD vigente CUANDO se hizo el movimiento de caja (tasaAlMomento),
 * para convertir a USD en reportes históricos sin que un cambio posterior de tasa
 * los distorsione. Movimientos viejos: tasaUsada; sin ninguna: la tasa actual.
 */
RN.calc.tasaMovimiento = function (m) {
  m = m || {};
  return m.tasaAlMomento || m.tasaUsada || RN.state.config.tasaUsd || 0;
};

/** v5.20.0 / v5.30.0: Desglose de depósitos por moneda (CUP puro, USD original y su equivalente en CUP). */
RN.calc.totalDepositosPorMoneda = function () {
  var cup = 0, usdOriginal = 0, usdCUP = 0;
  (RN.state.depositos || []).forEach(function (d) {
    var x = RN.calc.desgloseMovimiento(d);
    var tasa = RN.calc.tasaMovimiento(d);
    cup += x.cup;
    usdOriginal += x.usd;
    usdCUP += +(x.usd * tasa).toFixed(2);
  });
  return { cup: +cup.toFixed(2), usdOriginal: +usdOriginal.toFixed(2), usdCUP: +usdCUP.toFixed(2), total: +(cup + usdCUP).toFixed(2) };
};

/** v5.20.0 / v5.30.0: Desglose de retiros por moneda. */
RN.calc.totalRetirosPorMoneda = function () {
  var cup = 0, usdOriginal = 0, usdCUP = 0;
  (RN.state.retiros || []).forEach(function (r) {
    var x = RN.calc.desgloseMovimiento(r);
    var tasa = RN.calc.tasaMovimiento(r);
    cup += x.cup;
    usdOriginal += x.usd;
    usdCUP += +(x.usd * tasa).toFixed(2);
  });
  return { cup: +cup.toFixed(2), usdOriginal: +usdOriginal.toFixed(2), usdCUP: +usdCUP.toFixed(2), total: +(cup + usdCUP).toFixed(2) };
};

/**
 * v5.30.0 — Saldos físicos por moneda de la caja AHORA MISMO.
 *   usd : dólares físicos en la gaveta (cobros + depósitos − retiros, incluido MIXTO)
 *   cup : pesos físicos en la gaveta (fondo total − equivalente del USD a la tasa vigente)
 *   totalCUP : fondo de caja total en su equivalente CUP (RN.calc.fondoCaja())
 * Es el objeto que usan los modales de depositar/retirar para validar moneda
 * por moneda y para mostrar "cuánto hay de cada una".
 */
RN.calc.saldosMoneda = function () {
  var usd = RN.calc.usdEnCaja();
  var cup = RN.calc.cupEnCaja();
  var tasa = RN.state.config.tasaUsd || 0;
  return {
    usd: usd,
    cup: cup,
    tasa: tasa,
    usdEnCUP: +(usd * tasa).toFixed(2),
    totalCUP: RN.calc.fondoCaja()
  };
};

/**
 * v5.30.0 — Valida un movimiento de caja (depósito o retiro) contra los saldos
 * FÍSICOS reales de cada moneda. Un retiro no puede sacar más billetes de los
 * que hay de esa moneda (ni más dólares ni más pesos), independientemente del
 * monto total en CUP-equivalente. Un depósito nunca se bloquea.
 *
 * Función pura (sin DOM) para poder testearla desde Node.
 * @param {{montoUSD:number, montoCUP:number}} datos componentes del movimiento
 * @param {'deposito'|'retiro'} tipo
 * @returns {{ok:boolean, motivo:string}}
 */
RN.calc.validarMovimientoCaja = function (datos, tipo) {
  datos = datos || {};
  var usd = +(datos.montoUSD || 0);
  var cup = +(datos.montoCUP || 0);
  if (usd < 0 || cup < 0) return { ok: false, motivo: 'El monto no puede ser negativo' };
  if (tipo !== 'retiro') return { ok: true, motivo: '' };
  var s = RN.calc.saldosMoneda();
  if (usd > s.usd + 0.01) {
    var res = { ok: false, motivo: 'Solo hay $' + s.usd.toFixed(2) + ' USD físico en caja y quieres retirar $' + usd.toFixed(2) + ' USD' };
    // v5.43.0: si hay tasa y alcanzan los pesos, se puede OFRECER convertir desde CUP
    // (el usuario lo confirma). `conversion` = dólares a comprar y su costo en CUP.
    var faltanUSD = +(usd - s.usd).toFixed(2);
    var costoCUP = s.tasa ? +(faltanUSD * s.tasa).toFixed(2) : 0;
    if (s.tasa > 0 && costoCUP + cup <= s.cup + 0.01) {
      res.conversion = { usd: faltanUSD, cup: costoCUP, tasa: s.tasa };
    }
    return res;
  }
  if (cup > s.cup + 0.01) {
    return { ok: false, motivo: 'Solo hay ' + RN.calc.formatCUP(s.cup) + ' CUP físico en caja y quieres retirar ' + RN.calc.formatCUP(cup) };
  }
  return { ok: true, motivo: '' };
};

/**
 * v5.29.0: CUP físico disponible en la caja ahora mismo = fondo total en
 * CUP-equivalente menos el valor (a la tasa vigente) del USD físico que
 * hay guardado. Es la contraparte de usdEnCaja(): entre los dos dan el
 * desglose real de qué moneda tienes físicamente en la gaveta.
 */
RN.calc.cupEnCaja = function () {
  var tasa = RN.state.config.tasaUsd || 0;
  var usdFisico = RN.calc.usdEnCaja();
  var equivalenteEnCUP = tasa ? +(usdFisico * tasa).toFixed(2) : 0;
  return +Math.max(0, RN.calc.fondoCaja() - equivalenteEnCUP).toFixed(2);
};

/**
 * v5.20.0: Cuánto USD físico hay en la caja ahora mismo: lo cobrado a clientes
 * en USD (h.montoPagadoUSD) + depósitos en USD − retiros en USD. El vuelto de
 * un cobro en USD se devuelve en CUP (se descuenta del fondo en CUP, ver
 * modal-cobro.js), así que el USD recibido de un cliente se queda íntegro en
 * la gaveta y no hay que restarle nada aquí.
 *
 * v5.30.0 (BUG MIXTO): también cuenta la parte en dólares de los movimientos
 * MIXTO. Antes solo se miraba `moneda === 'USD'`, por lo que un depósito/retiro
 * mixto (ej: $20 + 3.000 CUP) no movía ni un dólar en la gaveta de USD y su
 * equivalente se quedaba sumado al CUP físico. Ahora se usa el desglose real
 * (RN.calc.desgloseMovimiento).
 */
RN.calc.usdEnCaja = function () {
  var deCobros = (RN.state.history || []).reduce(function (s, h) { return s + (h.montoPagadoUSD || 0); }, 0);
  var deDepositos = (RN.state.depositos || []).reduce(function (s, d) { return s + RN.calc.desgloseMovimiento(d).usd; }, 0);
  var deRetiros = (RN.state.retiros || []).reduce(function (s, r) { return s + RN.calc.desgloseMovimiento(r).usd; }, 0);
  // v5.31.0: un cuadre de caja hecho en dólares también mueve la gaveta de USD.
  var deCuadres = RN.calc.usdCuadreAjuste();
  // v5.55.32: gastos pagados en USD (compra inventario, proveedor, etc.) también sacan dólares físicos.
  // Los cuadres ya se restan arriba; aquí solo gastos normales con montoPagadoUSD.
  var deGastosUSD = (RN.state.gastos || []).reduce(function (s, g) {
    if (!g || g.esCuadreCaja) return s;
    return s + (+(g.montoPagadoUSD || 0));
  }, 0);
  return +(deCobros + deDepositos - deRetiros - deCuadres - deGastosUSD).toFixed(2);
};

/**
 * v5.31.0 — Ajuste de USD físico provocado por los cuadres de caja en dólares.
 *
 * Un cuadre con `cuadreMoneda === 'USD'` guarda `montoCuadreUSD` FIRMADO:
 *   +X → faltaron X USD (salen de la gaveta)
 *   −X → sobraron X USD (entran a la gaveta)
 * Por eso usdEnCaja() lo RESTA. Los cuadres anteriores a v5.31.0 no traen
 * `cuadreMoneda` (eran siempre en CUP) y no tocan esta gaveta, así que los
 * datos ya guardados siguen cuadrando igual que antes.
 */
RN.calc.usdCuadreAjuste = function () {
  return +(RN.state.gastos || []).reduce(function (s, g) {
    if (!g || !g.esCuadreCaja || g.cuadreMoneda !== 'USD') return s;
    return s + (+(g.montoCuadreUSD || 0));
  }, 0).toFixed(2);
};

/**
 * v5.31.0 — Neto de descuadres de caja POR MONEDA (lo usa el historial de cuadres).
 *   cup      : neto en PESOS       (+ faltante CUP, − sobrante CUP)
 *   usd      : neto en DÓLARES     (+ faltante USD, − sobrante USD)
 *   usdEnCUP : equivalente en CUP del neto en dólares (a la tasa de cada registro)
 *   totalCUP : neto equivalente en CUP (coincide con el impacto en fondoCaja())
 *   cantidad : número de cuadres registrados
 * Los registros anteriores a v5.31.0 (sin `cuadreMoneda`) se cuentan como CUP.
 */
RN.calc.descuadresPorMoneda = function () {
  var cup = 0, usd = 0, usdEnCUP = 0, n = 0;
  (RN.state.gastos || []).forEach(function (g) {
    if (!g || !g.esCuadreCaja) return;
    n++;
    if (g.cuadreMoneda === 'USD') {
      usd += +(g.montoCuadreUSD || 0);
      usdEnCUP += +(g.monto || 0); // ya está en CUP, a la tasa usada al registrar
    } else {
      cup += +(g.monto || 0);
    }
  });
  return {
    cup: +cup.toFixed(2),
    usd: +usd.toFixed(2),
    usdEnCUP: +usdEnCUP.toFixed(2),
    totalCUP: +(cup + usdEnCUP).toFixed(2),
    cantidad: n
  };
};

/** Excedentes (vueltos) totales entregados a clientes. */
RN.calc.excedentesTotales = function () {
  return RN.state.history.reduce(function (s, h) { return s + (h.excedente || 0); }, 0);
};

/**
 * Fondo de caja automatico = saldo inicial + ingresos reales - gastos.
 * v5.10.1: Los ingresos (h.monto) ya registran solo el neto cobrado (no el total
 * pagado por el cliente). El excedente (vuelto) es dinero que entra y sale
 * inmediatamente, por lo que NO se resta del fondo. Antes se restaba, lo que
 * hacía que el fondo bajara cada vez que un cliente pagaba con vuelto.
 */
RN.calc.fondoCaja = function () {
  var saldoInicial = RN.state.config.fondoInicial || 0;
  var ingresos = RN.calc.ingresosTotales();
  var gastos = RN.calc.gastosTotales();
  var depositos = RN.calc.totalDepositos();
  var retiros = RN.calc.totalRetiros();
  return +((saldoInicial + ingresos + depositos - gastos - retiros).toFixed(2));
};

/**
 * v5.19.0 — Modelo "DOS BOLSILLOS" de la caja.
 *
 * Cada mes, la GANANCIA del mes (ingresos − gastos, SIN retiros) se reparte:
 *   - 🔒 Reserva += gananciaMes × pct%      (intocable)
 *   - 💸 Libre   += gananciaMes × (100−pct)%
 * Los meses con pérdida NO tocan la reserva (solo reducen el bolsillo libre).
 * Los RETIROS se descuentan SOLO del bolsillo libre.
 *
 * Definición consistente (los dos bolsillos siempre suman el fondo):
 *   - reserva = Σ max(0, gananciaMes) × pct/100   (acumulado, mes a mes)
 *   - fondo   = fondoCaja()  (saldo inicial + ingresos + depósitos − gastos − retiros)
 *   - libre   = fondo − reserva   (todo lo que no está reservado)
 *   - retirable = max(0, libre)   (solo se puede retirar del bolsillo libre)
 *   - cubierta  = fondo >= reserva  (equivale a libre >= 0)
 *
 * Devuelve { mes, pct, reserva, libre, fondo, retirable, cubierta,
 *           reservaAcum, libreAcum, gananciaTotal, retiros, depositos,
 *           saldoInicial, meses }.
 */
/*
 * v5.52.0 — REINICIO MENSUAL DE LA RESERVA.
 * Si en un mes se retira más de lo que había libre (se toca la reserva), al
 * CERRAR ese mes la reserva se recorta a lo que realmente quedó en caja y el mes
 * siguiente arranca desde ahí, sin arrastrar un bolsillo libre negativo. Dentro
 * del mes en curso la reserva no se recorta (se sigue avisando el faltante).
 * Además devuelve `reservaInicioMes` (reserva con la que arrancó el mes pedido).
 */
RN.calc.bolsillos = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var pct = +RN.state.config.pctReservaCaja;
  if (isNaN(pct)) pct = 70;
  pct = Math.max(0, Math.min(100, pct));

  // Rango de meses: desde el primer mes con actividad hasta el mes pedido.
  var todos = [];
  (RN.state.history || []).forEach(function (h) { if (h.mes) todos.push(String(h.mes).slice(0, 7)); });
  (RN.state.gastos || []).forEach(function (g) { if (g.mes) todos.push(String(g.mes).slice(0, 7)); });
  todos.sort();
  var inicio = todos.length ? todos[0] : mes;
  if (inicio > mes) inicio = mes;

  var reservaAcum = 0, libreAcum = 0, gananciaTotal = 0, nMeses = 0;
  var reservaInicioMes = 0;
  // v5.52.0: movimiento neto de caja por mes (ingresos + depósitos − gastos − retiros)
  // para conocer el fondo al cierre de cada mes. Sin mes ('') se cuenta desde el inicio.
  var netoMes = {};
  var sumarNeto = function (lista, signo, valor) {
    (lista || []).forEach(function (x) {
      var k = x.mes ? String(x.mes).slice(0, 7) : '';
      netoMes[k] = (netoMes[k] || 0) + signo * valor(x);
    });
  };
  sumarNeto(RN.state.history, 1, RN.calc.ingresoCobro);
  sumarNeto(RN.state.depositos, 1, function (d) { return d.monto || 0; });
  sumarNeto(RN.state.gastos, -1, function (x) { return x.monto || 0; });
  sumarNeto(RN.state.retiros, -1, function (x) { return x.monto || 0; });
  var fondoCorrido = +(RN.state.config.fondoInicial || 0);
  Object.keys(netoMes).forEach(function (k) { if (k < inicio) fondoCorrido += netoMes[k]; });
  var m = inicio, guard = 0;
  while (m <= mes && guard < 1200) {
    fondoCorrido += (netoMes[m] || 0);
    if (m === mes) reservaInicioMes = reservaAcum;
    var g = RN.calc.utilidadMes(m); // ingresos − gastos (los retiros ya no son gastos)
    gananciaTotal += g;
    if (g > 0) {
      var r = g * pct / 100;
      reservaAcum += r;
      libreAcum += (g - r);
    } else {
      libreAcum += g; // la pérdida reduce el bolsillo libre, no la reserva
    }
    // v5.52.0: al cerrar un mes (no el actual) la reserva no puede exceder lo que quedó en caja.
    if (m < mes) {
      var tope = Math.max(0, fondoCorrido);
      if (reservaAcum > tope) reservaAcum = tope;
    }
    nMeses++;
    // mes siguiente
    var p = m.split('-').map(Number);
    var yy = p[0], mm = p[1] + 1;
    if (mm > 12) { mm = 1; yy++; }
    m = yy + '-' + String(mm).padStart(2, '0');
    guard++;
  }

  var fondo = RN.calc.fondoCaja();
  var reserva = +reservaAcum.toFixed(2);
  var libre = +(fondo - reserva).toFixed(2);
  var retirable = +Math.max(0, libre).toFixed(2);

  return {
    mes: mes,
    pct: pct,
    reserva: reserva,
    libre: libre,
    fondo: fondo,
    retirable: retirable,
    cubierta: fondo >= reserva,
    reservaAcum: reserva,
    libreAcum: libre,
    gananciaTotal: +gananciaTotal.toFixed(2),
    retiros: RN.calc.totalRetiros(),
    depositos: RN.calc.totalDepositos(),
    saldoInicial: +(RN.state.config.fondoInicial || 0).toFixed(2),
    meses: nMeses,
    reservaInicioMes: +reservaInicioMes.toFixed(2),
    gananciaMes: +RN.calc.utilidadMes(mes).toFixed(2)
  };
};

/**
 * v5.52.0 — Fracción (0-1) de lo esperado que de verdad se cobró en los últimos `n`
 * meses CERRADOS (promedio ponderado). Aproximación: usa los clientes activos de
 * hoy. Devuelve null si no hay meses con ingreso esperado.
 */
RN.calc.tasaCobroHistorica = function (n, mes) {
  n = n || 3;
  var m = mes || RN.calc.mesActualStr();
  var cobrado = 0, esperado = 0;
  for (var i = 0; i < n; i++) {
    m = RN.calc.mesAnterior(m);
    var esp = 0;
    RN.calc.clientesActivos().forEach(function (c) {
      if (RN.calc.mesInicioCliente(c) > m) return; // aún no le tocaba pagar
      esp += RN.calc.netoEsperadoMes(c, m);
    });
    if (esp > 0) { esperado += esp; cobrado += RN.calc.ingresosServicioMes(m); }
  }
  if (esperado <= 0) return null;
  return Math.max(0, Math.min(1, cobrado / esperado));
};

/**
 * v5.52.0 — Caja proyectada al cierre del mes (todo lo que muestra la tarjeta).
 *   cierre        = fondo hoy + lo que falta cobrar − lo que falta pagar (paquete)
 *   reservaCierre = reserva con la que arrancó el mes + pct% de la ganancia proyectada
 *   retirableHoy  = lo que se puede sacar hoy sin que, al cierre, la caja quede por
 *                   debajo de la reserva (nunca más de lo que hay hoy en caja).
 * "Falta cobrar" solo cuenta a los clientes a quienes ya les toca pagar este mes
 * (mesInicio <= mes), igual que la ganancia proyectada. `escenario` aplica la tasa
 * de cobro de los últimos 3 meses a lo que falta cobrar (null si no hay datos).
 */
RN.calc.cajaProyeccion = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var hoy = RN.calc.fondoCaja();
  var b = RN.calc.bolsillos(mes);
  var pct = b.pct;
  var cortesMap = {};
  var pendiente = 0, nPend = 0, nTotal = 0;
  RN.calc.clientesActivos().forEach(function (c) {
    if (RN.calc.mesInicioCliente(c) > mes) return;
    nTotal++;
    var esperado = RN.calc.netoEsperadoMes(c, mes);
    var cobrado = RN.calc.cobrosServicio(c.id, mes).reduce(function (s, h) { return s + (h.monto || 0); }, 0);
    var falta = +(esperado - cobrado).toFixed(2);
    if (falta > 0.009) {
      var dia = c.diaPago || 1;
      if (!cortesMap[dia]) cortesMap[dia] = { dia: dia, clientes: 0, monto: 0 };
      cortesMap[dia].clientes++;
      cortesMap[dia].monto = +(cortesMap[dia].monto + falta).toFixed(2);
      pendiente += falta;
      nPend++;
    }
  });
  pendiente = +pendiente.toFixed(2);
  var cortes = Object.keys(cortesMap).map(function (k) { return cortesMap[k]; })
    .sort(function (x, y) { return x.dia - y.dia; });

  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var porPagar = (costoPaquete > 0 && RN.calc.saldoProveedorMes)
    ? RN.calc.saldoProveedorMes(mes)
    : ((costoPaquete > 0 && !RN.calc.pagoProveedorMes(mes)) ? costoPaquete : 0);
  var utilHoy = RN.calc.utilidadMes(mes);

  var resolver = function (fraccion) {
    var cobra = +(pendiente * fraccion).toFixed(2);
    var cierre = +(hoy + cobra - porPagar).toFixed(2);
    var ganancia = +(utilHoy + cobra - porPagar).toFixed(2);
    var reservaCierre = +(b.reservaInicioMes + Math.max(0, ganancia) * pct / 100).toFixed(2);
    var libreCierre = +(cierre - reservaCierre).toFixed(2);
    return {
      cobra: cobra, cierre: cierre, ganancia: ganancia,
      reservaCierre: reservaCierre, libreCierre: libreCierre,
      retirableHoy: +Math.max(0, Math.min(hoy, libreCierre)).toFixed(2),
      cubierta: cierre >= reservaCierre - 0.005
    };
  };
  var base = resolver(1);
  var tasa = RN.calc.tasaCobroHistorica(3, mes);
  var escenario = (tasa !== null && pendiente > 0) ? resolver(tasa) : null;

  var atrasos = 0, nAtrasos = 0;
  RN.calc.clientesActivos().forEach(function (c) {
    var d = RN.calc.detalleMora(c);
    if (d && d.total > 0) { atrasos += d.total; nAtrasos++; }
  });

  var estado = 'ok';
  if (!base.cubierta || base.cierre < 0) estado = 'bajo';
  else if (escenario && !escenario.cubierta) estado = 'ajustada';

  return {
    mes: mes, pct: pct, hoy: hoy, pendiente: pendiente, nPend: nPend, nTotal: nTotal,
    cortes: cortes, costoPaquete: costoPaquete, porPagar: porPagar,
    reservaInicio: b.reservaInicioMes, base: base, tasa: tasa, escenario: escenario,
    atrasos: +atrasos.toFixed(2), nAtrasos: nAtrasos, estado: estado
  };
};

/**
 * Alias retrocompatible (v5.17.0/v5.18.0 usaban reservaCaja). Devuelve el mismo
 * objeto que bolsillos(), con `base` = fondo para no romper llamadas antiguas.
 */
RN.calc.reservaCaja = function (mes) {
  var b = RN.calc.bolsillos(mes);
  b.base = b.fondo;
  b.utilidad = b.fondo;
  return b;
};

/** Gastos del mes (todos los movimientos en gastos, incl. cuadres). Para fondo/compat. */
RN.calc.gastosMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  // v5.13.1: Bug #9 — simplificada la lógica de filtrado.
  var mesNorm = mes.slice(0, 7);
  return RN.state.gastos.filter(function (g) { return (g.mes || '').slice(0, 7) === mesNorm; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/**
 * v5.55.16 — ¿Cuenta como gasto operativo del negocio?
 * Excluye cuadres, devoluciones de préstamo, aplicaciones de préstamo y retiros legacy.
 * Los pagos a proveedor SÍ son operativos.
 */
RN.calc.esGastoOperativo = function (g) {
  if (!g) return false;
  if (g.esCuadreCaja) return false;
  if (g.esDevolucionInversion) return false;
  if (g.esAplicacionPrestamo) return false;
  if (g.esRetiroCaja) return false;
  return true;
};

/** Tipo de movimiento en gastos para UI. */
RN.calc.tipoGastoUI = function (g) {
  if (!g) return 'operativo';
  if (g.esCuadreCaja) return 'cuadre';
  if (g.esDevolucionInversion) return 'devolucion';
  if (g.esAplicacionPrestamo) return 'aplicacion';
  if (g.esRetiroCaja) return 'retiro';
  if (g.esPagoProveedor) return 'proveedor';
  return 'operativo';
};

/** Gastos operativos del mes (KPI profesional de costos). */
RN.calc.gastosOperativosMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var mesNorm = String(mes).slice(0, 7);
  return (RN.state.gastos || []).filter(function (g) {
    return (g.mes || '').slice(0, 7) === mesNorm && RN.calc.esGastoOperativo(g);
  }).reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/** Gastos operativos del mes anterior (para delta). */
RN.calc.gastosOperativosMesAnterior = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var parts = String(mes).slice(0, 7).split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  if (m < 1) { m = 12; y -= 1; }
  var prev = y + '-' + (m < 10 ? '0' : '') + m;
  return RN.calc.gastosOperativosMes(prev);
};

/** Pago al proveedor de internet del mes indicado (o null si no hay). v5.8.6 */
RN.calc.pagoProveedorMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.state.gastos.find(g => g.esPagoProveedor && (g.mes || '').slice(0, 7) === mes.slice(0, 7)) || null;
};

/** v5.55.10 — Todos los pagos al proveedor del mes. */
RN.calc.pagosProveedorMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return (RN.state.gastos || []).filter(function (g) {
    return g.esPagoProveedor && (g.mes || '').slice(0, 7) === String(mes).slice(0, 7);
  });
};

/** Total pagado al proveedor en el mes (CUP), sin descuentos. */
RN.calc.totalPagadoProveedorMes = function (mes) {
  return RN.calc.pagosProveedorMes(mes).reduce(function (s, g) {
    return s + (+g.monto || 0);
  }, 0);
};

/** Total de descuentos aplicados a pagos del proveedor en el mes (CUP). */
RN.calc.totalDescuentoProveedorMes = function (mes) {
  return RN.calc.pagosProveedorMes(mes).reduce(function (s, g) {
    return s + (+g.descuentoProveedor || 0);
  }, 0);
};

/**
 * Saldo pendiente del paquete del mes (CUP).
 * = monto paquete − pagado − descuentos. Mínimo 0.
 */
RN.calc.saldoProveedorMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var paquete = RN.calc.montoPaqueteProveedor();
  if (!(paquete > 0)) return 0;
  var pagado = RN.calc.totalPagadoProveedorMes(mes);
  var desc = RN.calc.totalDescuentoProveedorMes(mes);
  return Math.max(0, +(paquete - pagado - desc).toFixed(2));
};

/** true si el paquete del mes está cubierto (pagado + descuento >= monto). */
RN.calc.paqueteProveedorCubierto = function (mes) {
  var paquete = RN.calc.montoPaqueteProveedor();
  if (!(paquete > 0)) return true;
  return RN.calc.saldoProveedorMes(mes) <= 0.01;
};


/** v5.52.3 — Megas de cortesía del proveedor (plus), sin costo. */
RN.calc.plusMegas = function () {
  var cfg = RN.state.config || {};
  var p = +cfg.plusMegas;
  if (isNaN(p) || p < 0) {
    // compat: si aún no está, usar sobreventaMegas legacy
    p = +cfg.sobreventaMegas || 0;
  }
  return Math.max(0, p);
};

/**
 * v5.52.3 — Capacidad del proveedor sin costo extra = megas pagados + plus.
 * El costo del paquete sigue siendo solo proveedorMegas × precio.
 */
RN.calc.capacidadProveedor = function () {
  var cfg = RN.state.config || {};
  return Math.max(0, (+cfg.proveedorMegas || 0) + RN.calc.plusMegas());
};

/** Monto del paquete del proveedor según la config (megas × precio por mega). v5.8.6 */
RN.calc.montoPaqueteProveedor = function () {
  const cfg = RN.state.config;
  const megas = +cfg.proveedorMegas || 0;
  const precio = +cfg.proveedorPrecioMega || 0;
  return +(megas * precio).toFixed(2);
};

/** Megas del plan de un cliente (busca por planId o usa campo megas directo). v5.8.7 */
RN.calc.getMegasCliente = function (cliente) {
  if (cliente && cliente.planId) {
    const plan = RN.state.planes.find(p => p.id === cliente.planId);
    if (plan) return +plan.megas || 0;
  }
  return +cliente.megas || 0;
};

/** Suma de megas vendidos a clientes activos que pagan (sin administradores). v5.8.7 */
RN.calc.megasVendidos = function () {
  return RN.calc.clientesActivos().reduce((s, c) => s + RN.calc.getMegasCliente(c), 0);
};

/** v5.50.0: megas de administración (consumen red real pero no se venden). */
RN.calc.megasAdmin = function () {
  return RN.calc.administradoresActivos().reduce((s, c) => s + RN.calc.getMegasCliente(c), 0);
};

/**
 * Tope de capacidad en Mbps. v5.50.0: ya no es paquete + sobreventa, sino
 * paquete - reserva (tope de la suma de Limit At). Ver RN.cola.topeKbps.
 */
RN.calc.topeMegas = function () {
  if (RN.cola && RN.cola.topeKbps) return RN.cola.topeKbps() / 1000;
  const cfg = RN.state.config;
  // v5.52.3: capacidad = (pagados + plus) − reserva
  return Math.max(0, RN.calc.capacidadProveedor() - (+cfg.reservaMegas || 0));
};

/**
 * Estado de capacidad de la red. v5.50.0: se calcula con la suma de Limit At de
 * los clientes activos (administradores incluidos) contra el tope, no con los
 * megas vendidos. Devuelve { paquete, reserva, tope, comprometido, margen, pct,
 * excedido, aviso, vendidos, megasAdmin, relacionVenta, ... } (ver RN.cola.estadoCapacidad).
 * Los megas vendidos quedan como dato informativo.
 */
RN.calc.estadoCapacidad = function () {
  if (RN.cola && RN.cola.estadoCapacidad) return RN.cola.estadoCapacidad();
  return { comprometido: 0, tope: 0, pct: 0, pctReal: 0, excedido: false, aviso: false, vendidos: 0, megasAdmin: 0, relacionVenta: 0, paquete: 0, reserva: 0, margen: 0 };
};

/** Utilidad neta del mes = ingresos - gastos. */
RN.calc.utilidadMes = function (mes) {
  return RN.calc.ingresosMes(mes) - RN.calc.gastosMes(mes);
};

/**
 * v5.44.0: búsqueda de clientes (Clientes y Cobros). Función pura.
 * `q` se separa por espacios; cada término debe cumplirse (AND):
 *   - texto libre → nombre, dirección, IP, teléfono (solo dígitos) o NOMBRE DEL PLAN
 *   - `deuda>500` / `deuda>=500` / `deuda<100` (también `>500`) → filtra por
 *     deudaTotalCliente (mes actual + mora + equipo) en CUP.
 */
RN.calc.filtrarClientes = function (lista, q) {
  var terminos = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terminos.length) return lista;
  var mes = RN.calc.mesActualStr();
  return lista.filter(function (c) {
    var plan = '';
    if (c.planId) {
      var p = (RN.state.planes || []).find(function (pl) { return pl.id === c.planId; });
      if (p) plan = String(p.nombre || '').toLowerCase();
    }
    var tel = String(c.telefono || '').replace(/\D/g, '');
    var texto = [c.nombre, c.direccion, c.ip, c.telefono].join(' ').toLowerCase();
    return terminos.every(function (t) {
      var m = /^(?:deuda)?(>=|<=|>|<)(\d+(?:[.,]\d+)?)$/.exec(t);
      if (m) {
        var x = parseFloat(m[2].replace(',', '.'));
        var d = RN.calc.deudaTotalCliente(c, mes);
        return m[1] === '>' ? d > x : m[1] === '>=' ? d >= x : m[1] === '<' ? d < x : d <= x;
      }
      var digitos = t.replace(/\D/g, '');
      if (digitos.length >= 3 && digitos === t && tel.indexOf(digitos) !== -1) return true;
      return texto.indexOf(t) !== -1 || (plan && plan.indexOf(t) !== -1);
    });
  });
};

/**
 * v5.44.0: clientes que requieren atención, priorizados. Función pura.
 * Orden: 1) mora (más meses y más deuda primero), 2) vence hoy, 3) vence mañana,
 * 4) pago parcial. `filtro`: '' (todos) | 'morosos' | 'hoy' | 'parciales' | 'inactivos'.
 * 'inactivos' devuelve los clientes inactivos con deuda (mora) pendiente.
 * @returns {Array<{cliente, motivo:string, prioridad:number, mora:number, deuda:number}>}
 */
RN.calc.clientesAtencion = function (filtro) {
  filtro = filtro || '';
  var mes = RN.calc.mesActualStr();
  var hoy = RN.calc.hoy();
  var diaHoy = hoy.getDate();
  var man = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  var diaMan = man.getDate();
  var out = [];

  if (filtro === 'inactivos') {
    RN.state.clients.forEach(function (c) {
      if (c.activo !== false) return;
      var mora = RN.calc.getMora(c);
      if (mora > 0) out.push({ cliente: c, motivo: 'inactivo con mora', prioridad: 0, mora: mora, deuda: RN.calc.deudaTotalCliente(c, mes) });
    });
    return out.sort(function (a, b) { return b.mora - a.mora || b.deuda - a.deuda; });
  }

  RN.calc.clientesCobrables().forEach(function (c) {
    if (c.activo === false) return; // los inactivos con deuda solo salen en su chip
    var mora = RN.calc.getMora(c);
    var st = RN.calc.getStatus(c, mes);
    var dia = c.diaPago || 1;
    var deuda = RN.calc.deudaTotalCliente(c, mes);
    var pagado = st === 'paid';
    var motivo = '', prio = 9;
    if (mora > 0) { motivo = 'mora'; prio = 1; }
    else if (!pagado && st !== 'por-iniciar' && dia === diaHoy) { motivo = 'vence hoy'; prio = 2; }
    else if (!pagado && st !== 'por-iniciar' && dia === diaMan) { motivo = 'vence mañana'; prio = 3; }
    else if (st === 'parcial') { motivo = 'pago parcial'; prio = 4; }
    if (!motivo) return;
    if (filtro === 'morosos' && prio !== 1) return;
    if (filtro === 'hoy' && !(dia === diaHoy && !pagado && st !== 'por-iniciar')) return;
    if (filtro === 'parciales' && st !== 'parcial') return;
    out.push({ cliente: c, motivo: motivo, prioridad: prio, mora: mora, deuda: deuda });
  });
  return out.sort(function (a, b) {
    return a.prioridad - b.prioridad || b.mora - a.mora || b.deuda - a.deuda;
  });
};

/**
 * Clientes activos QUE PAGAN (excluye administradores). v5.50.0.
 * Es la base de cobros, alertas, notificaciones, promedios y estadísticas.
 */
RN.calc.clientesActivos = function () {
  return RN.state.clients.filter(c => c.activo !== false && !RN.calc.esAdmin(c));
};

/**
 * v5.50.0: todos los clientes activos que usan la red, administradores incluidos.
 * Es la base de la capacidad (Limit At, megas comprometidos), no de los cobros.
 */
RN.calc.clientesEnRed = function () {
  return RN.state.clients.filter(c => c.activo !== false);
};

/** v5.50.0: administradores activos. */
RN.calc.administradoresActivos = function () {
  return RN.state.clients.filter(c => c.activo !== false && RN.calc.esAdmin(c));
};

/**
 * v5.43.0: clientes de los que se espera cobrar. Son los activos y, si el
 * interruptor config.incluirInactivosConDeuda está encendido, también los
 * inactivos que aún tienen mora pendiente (un inactivo que debe sigue debiendo).
 * Por defecto (interruptor apagado) equivale a clientesActivos().
 */
RN.calc.clientesCobrables = function () {
  var lista = RN.calc.clientesActivos();
  if (RN.state.config.incluirInactivosConDeuda) {
    RN.state.clients.forEach(function (c) {
      if (c.activo === false && RN.calc.getMora(c) > 0) lista.push(c);
    });
  }
  return lista;
};

/** Cobranza del mes: cuántos clientes ya pagaron. */
RN.calc.cobranzaMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  const activos = RN.calc.clientesActivos();
  const pagaron = activos.filter(c => RN.calc.cobrosServicio(c.id, mes).length > 0);
  // v5.14.2 (Auditoría Reportes — LOG-1): pasar 'mes' a getStatus. Antes
  // 'parciales' siempre reflejaba el mes operativo actual aunque se pidiera
  // cobranzaMes() de otro mes, dando datos inconsistentes con 'pagaron'
  // (que sí respetaba el mes). Afecta a salud.js, reporte-mensual.js y
  // generarSnapshot, que llaman cobranzaMes(mes).
  const parciales = activos.filter(c => RN.calc.getStatus(c, mes) === 'parcial');
  return { total: activos.length, pagaron: pagaron.length, faltan: activos.length - pagaron.length, parciales: parciales.length };
};

/** Snapshot de KPIs del mes (inmutable, para cierre de mes). */
RN.calc.generarSnapshot = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  const cob = RN.calc.cobranzaMes(mes);
  return {
    mes,
    fecha: new Date().toISOString(),
    ingresos: RN.calc.ingresosMes(mes),
    gastos: RN.calc.gastosMes(mes),
    utilidad: RN.calc.utilidadMes(mes),
    clientesTotal: cob.total,
    clientesPagaron: cob.pagaron,
    clientesFaltan: cob.faltan,
    tasaCobranza: cob.total ? +(cob.pagaron / cob.total * 100).toFixed(1) : 0,
    // v5.43.0: resumen de cierre para auditoría
    resumenCierre: RN.calc.resumenCierre(mes)
  };
};

/**
 * v5.43.0: resumen automático del cierre de mes (se guarda en el snapshot):
 * clientes en mora y monto de mora generada, mora cobrada en el mes, descuentos
 * puntuales que se anularán y saldos de caja al cierre.
 */
RN.calc.resumenCierre = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  var enMora = RN.calc.clientesCobrables().filter(function (c) { return RN.calc.getMora(c) > 0; });
  var moraGenerada = enMora.reduce(function (s, c) { return s + RN.calc.detalleMora(c).total; }, 0);
  var moraCobrada = RN.state.history.filter(function (h) { return h.mes === mes; })
    .reduce(function (s, h) { return s + (h.montoMoraCobrada || 0); }, 0);
  var anulados = (RN.descuentos && RN.descuentos.esPuntualDeMes)
    ? RN.state.descuentos.filter(function (d) { return RN.descuentos.esPuntualDeMes(d, mes); }).length : 0;
  var sm = RN.calc.saldosMoneda();
  return {
    clientesEnMora: enMora.length,
    clientesEnMoraNombres: enMora.map(function (c) { return c.nombre; }),
    moraGenerada: +moraGenerada.toFixed(2),
    moraCobrada: +moraCobrada.toFixed(2),
    descuentosAnulados: anulados,
    saldoCajaCUP: sm.cup,
    saldoCajaUSD: sm.usd,
    saldoCajaTotal: sm.totalCUP,
    tasaUsd: sm.tasa
  };
};

/** Ingreso mensual esperado (suma de precios netos de todos los activos). */
RN.calc.ingresoEsperadoMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.calc.clientesActivos().reduce((s, c) => s + RN.calc.netoEsperadoMes(c, mes), 0);
};

/** Datos para tendencia: ingresos por mes de los últimos N meses. */
RN.calc.tendenciaMensual = function (n) {
  n = n || 6;
  let mes = RN.calc.mesActualStr();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = RN.calc.restarMeses(mes, i);
    out.push({ mes: m, ingresos: RN.calc.ingresosMes(m), gastos: RN.calc.gastosMes(m) });
  }
  return out;
};

/** Resta N meses a un YYYY-MM. */
RN.calc.restarMeses = function (ym, n) {
  let [y, m] = ym.split('-').map(Number);
  for (let i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } }
  return y + '-' + String(m).padStart(2, '0');
};

/**
 * Predicción de ingresos del próximo mes.
 * v5.13.1: Bug #10 — mejorada con regresión lineal sobre los últimos 6 meses.
 */
RN.calc.prediccionIngresos = function () {
  var t = RN.calc.tendenciaMensual(6);
  if (!t.length) return 0;
  if (t.length < 2) return +t[0].ingresos.toFixed(2);
  var n = t.length;
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (var i = 0; i < n; i++) {
    var x = i;
    var y = t[i].ingresos;
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
  }
  var denom = n * sumX2 - sumX * sumX;
  var b, a;
  if (denom === 0) { b = 0; a = sumY / n; }
  else { b = (n * sumXY - sumX * sumY) / denom; a = (sumY - b * sumX) / n; }
  var prediccion = a + b * n;
  if (prediccion < 0) prediccion = 0;
  return +prediccion.toFixed(2);
};


// v5.13.9 (DUP-1): Helper para obtener el total de un cobro del historial.
// Centraliza el patron repetido ~8 veces: h.totalCUP || (h.monto + h.montoEquipo)
RN.calc.totalCobro = function (h) {
  return h.totalCUP || RN.calc.ingresoCobro(h);
};

// v5.13.9 (DUP-3): Helper para buscar un cliente por ID.
// Centraliza el patron RN.state.clients.find(c => c.id === id) repetido decenas de veces.
RN.calc.clientePorId = function (id) {
  if (!id) return null;
  for (var i = 0; i < RN.state.clients.length; i++) {
    if (RN.state.clients[i].id === id) return RN.state.clients[i];
  }
  return null;
};
