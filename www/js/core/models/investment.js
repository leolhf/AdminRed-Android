/**
 * models/investment.js — Modelo de deuda de equipo / recuperación de inversión.
 * Debe cargar antes de render.js, inversion.js y migration.js.
 * Nota de diseño: deudaEquipo se modela como número simple (saldo pendiente).
 *
 * v5.11.3 — Recuperación basada en GANANCIA REAL (margen neto):
 *   - El aporte de cada cliente a la recuperación descuenta el costo del mega
 *     que a mí me cuesta proveer el servicio (proveedorPrecioMega × megas).
 *   - Se aplica un % de ganancia personal (config.pctPersonalInversion) que se
 *     retiene y NO computa como recuperación de capital.
 *   - El campo "recuperado" pasa a ser AUTOMÁTICO (suma de aportes netos
 *     reales desde la fecha de compra), no manual.
 */

RN.investment = RN.investment || {};

/**
 * v5.12.2 — Normaliza una fecha a medianoche LOCAL en milisegundos.
 * Evita el bug de zona horaria donde new Date("2025-06-15") se interpreta como
 * UTC medianoche, pero los cobros tienen horas locales. Al normalizar ambos
 * lados a medianoche local, la comparación t >= desde incluye correctamente
 * los cobros del mismo día de la compra.
 * @param {string|Date} f — fecha (YYYY-MM-DD o ISO)
 * @returns {number} timestamp en ms a medianoche local, o 0 si inválida
 */
RN.investment._medianocheLocal = function (f) {
  if (!f) return 0;
  var d = new Date(f);
  if (isNaN(d.getTime())) {
    // Intentar parsear como YYYY-MM-DD
    var parts = String(f).slice(0, 10).split('-');
    if (parts.length === 3) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }
  if (isNaN(d.getTime())) return 0;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Saldo pendiente de deuda de equipo de un cliente. Exige deudaEquipo > 0 explícitamente. */
RN.investment.getDeudaEquipoCliente = function (cliente) {
  if (!cliente) return 0;
  if (typeof cliente.deudaEquipo !== 'number') return 0;
  return cliente.deudaEquipo > 0 ? cliente.deudaEquipo : 0;
};

/** Cuota mensual de equipo de un cliente (si tiene deuda y cuota definida). */
RN.investment.getCuotaEquipoCliente = function (cliente) {
  if (RN.investment.getDeudaEquipoCliente(cliente) <= 0) return 0;
  return cliente.cuotaEquipo || 0;
};

/** Progreso de pago de equipo de un cliente (0-100). */
RN.investment.getProgresoEquipoCliente = function (cliente) {
  const deuda = RN.investment.getDeudaEquipoCliente(cliente);
  if (deuda <= 0) return 100;
  const original = cliente.deudaEquipoOriginal || deuda;
  if (original <= 0) return 100;
  const pagado = original - deuda;
  return Math.max(0, Math.min(100, Math.round(pagado / original * 100)));
};

/** Inversión personal: total invertido. */
RN.investment.totalInvertido = function () {
  return RN.state.investments.reduce((s, i) => s + (i.monto || 0), 0);
};

/**
 * Inversión personal: total recuperado (AUTOMÁTICO, v5.11.3).
 * = suma del recuperado real de cada inversión (aporte neto de los clientes
 * vinculados desde la fecha de compra, descontando costo del mega y retención
 * personal). Para inversiones sin clientes vinculados, conserva el valor
 * manual histórico inv.recuperado.
 */
RN.investment.totalRecuperado = function () {
  return RN.state.investments.reduce((s, i) => s + RN.investment.recuperadoRealInv(i), 0);
};

/** Porcentaje global de recuperación (basado en el recuperado automático). */
RN.investment.porcentajeRecuperacion = function () {
  const total = RN.investment.totalInvertido();
  if (!total) return 0;
  return +(RN.investment.totalRecuperado() / total * 100).toFixed(1);
};

/**
 * v5.13.16 (BUG-1) — Restante EFECTIVO de una inversión por recuperar.
 *
 * Cuando pctGananciaMes > 0, el "recuperado efectivo" incluye el aporte extra
 * acumulado de la ganancia del mes (además del margen de los clientes). Antes,
 * proyectarRecuperacion() y mesesParaRecuperar() usaban recuperadoRealInv()
 * (solo margen de clientes), lo que producía una proyección pesimista e
 * inconsistente con el "% efectivo" que muestra la card.
 *
 * Cuando pctGananciaMes === 0, se comporta igual que antes (restante sobre
 * recuperadoRealInv), preservando el comportamiento histórico.
 *
 * @param {object} inv — inversión
 * @returns {number} monto restante efectivo, mínimo 0
 */
RN.investment.restanteEfectivo = function (inv) {
  var monto = inv.monto || 0;
  var rec = RN.investment.pctGananciaMes() > 0
    ? RN.investment.recuperadoEfectivo(inv)
    : RN.investment.recuperadoRealInv(inv);
  return Math.max(0, +(monto - rec).toFixed(2));
};

/**
 * Proyecta la fecha de recuperación total de una inversión según el aporte
 * neto mensual de los clientes vinculados (v5.11.3: usa ganancia real, no bruta).
 *
 * v5.13.16 (BUG-1): usa restanteEfectivo() para ser consistente con el
 * "% efectivo" de la card cuando pctGananciaMes > 0.
 * v5.13.16 (LOG-3): añade nota aclarativa de que la estimación se basa en el
 * precio esperado mensual, no en el histórico real de cobros.
 */
RN.investment.proyectarRecuperacion = function (inv) {
  const restante = RN.investment.restanteEfectivo(inv);
  const aporteMensual = RN.investment.aporteMensualNeto(inv);
  if (restante <= 0) return 'Recuperada';
  if (aporteMensual <= 0) return '—';
  const meses = Math.ceil(restante / aporteMensual);
  const dias = Math.ceil(restante / (aporteMensual / 30));
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  const fechaTxt = fecha.toLocaleDateString('es-CU', { month: 'long', year: 'numeric' });
  // v5.13.16 (LOG-3): aclaración de que es una estimación basada en el precio esperado.
  return 'Faltan ' + meses + ' mes' + (meses === 1 ? '' : 'es') + ' (≈' + dias + ' días) · ' + fechaTxt
    + ' · estimación según precio esperado mensual';
};

/**
 * v5.12.1 — Meses restantes para recuperar la inversión (número entero).
 * Devuelve null si no se puede calcular (sin aporte mensual o ya recuperada).
 * v5.13.16 (BUG-1): usa restanteEfectivo() para consistencia con la card.
 */
RN.investment.mesesParaRecuperar = function (inv) {
  const restante = RN.investment.restanteEfectivo(inv);
  if (restante <= 0) return 0;
  const aporteMensual = RN.investment.aporteMensualNeto(inv);
  if (aporteMensual <= 0) return null;
  return Math.ceil(restante / aporteMensual);
};

/**
 * v5.11.0 — Fecha de compra de la inversión (YYYY-MM-DD o ISO).
 * Si no existe, se deduce del campo fecha de creación.
 */
RN.investment.fechaCompra = function (inv) {
  if (!inv) return '';
  return inv.fechaCompra || inv.fecha || '';
};

/** v5.11.0 — Días transcurridos desde la fecha de compra hasta hoy. */
RN.investment.diasDesdeCompra = function (inv) {
  const f = RN.investment.fechaCompra(inv);
  if (!f) return 0;
  const desdeMs = RN.investment._medianocheLocal(f);
  if (!desdeMs) return 0;
  const hoyMs = RN.investment._medianocheLocal(new Date());
  return Math.max(0, Math.floor((hoyMs - desdeMs) / 86400000));
};

/**
 * v5.13.2 — Helper compartido: filtra los cobros de un cliente desde la fecha
 * de compra de la inversión. Centraliza la lógica que antes estaba duplicada
 * en aporteCliente(), aporteRecuperacionCliente() y margenNetoCliente().
 *
 * Filtros aplicados:
 *   - h.clienteId === clienteId
 *   - h.tipo es 'servicio' o undefined
 *   - h.fecha >= fechaCompra (medianoche local, evita bug de zona horaria)
 *   - h.mes >= mesCompra (v5.13.1 Bug #11: evita inflar con cobros de mes anterior)
 *
 * @param {string} clienteId — ID del cliente
 * @param {object} inv — inversión (para obtener fechaCompra)
 * @returns {Array} cobros filtrados (orden del history original)
 */
RN.investment._cobrosClienteDesde = function (clienteId, inv) {
  var f = RN.investment.fechaCompra(inv);
  var desde = f ? RN.investment._medianocheLocal(f) : 0;
  var mesCompra = f ? f.slice(0, 7) : null;
  return (RN.state.history || []).filter(function (h) {
    if (h.clienteId !== clienteId) return false;
    if (h.tipo && h.tipo !== 'servicio') return false;
    if (!desde) return true;
    var t = RN.investment._medianocheLocal(h.fecha);
    if (t < desde) return false;
    if (mesCompra && h.mes && h.mes < mesCompra) return false;
    return true;
  });
};

/**
 * v5.11.0 — Aporte BRUTO de un cliente vinculado (ingreso cobrado) desde la
 * fecha de compra. Se mantiene por compatibilidad. Para la ganancia real
 * (aporte neto) usar aporteRecuperacionCliente().
 */
RN.investment.aporteCliente = function (inv, clienteId) {
  if (!inv || !clienteId) return 0;
  return RN.investment._cobrosClienteDesde(clienteId, inv)
    .reduce(function (s, h) { return s + (h.monto || 0); }, 0);
};

/**
 * v5.11.3 — Costo del mega que a mí me cuesta proveer el servicio a un cliente
 * en un mes dado = proveedorPrecioMega × megas del cliente.
 * Si no hay precio de proveedor configurado, el costo es 0 (no se puede
 * determinar el margen real; se asume costo 0).
 */
RN.investment.costoMegaClienteMes = function (cliente, mes) {
  if (!cliente) return 0;
  const precioMegaProv = +(RN.state.config.proveedorPrecioMega || 0);
  if (precioMegaProv <= 0) return 0;
  const megas = RN.calc.getMegasCliente(cliente);
  return +(megas * precioMegaProv).toFixed(2);
};

/**
 * v5.13.1: Bug #17 — Indica si el costo del mega está configurado.
 * Si es false, las métricas de margen y recuperación de inversión están
 * infladas (asumen costo 0). La UI debería advertir al usuario.
 */
RN.investment.costoMegaConfigurado = function () {
  var precioMegaProv = +(RN.state.config.proveedorPrecioMega || 0);
  return precioMegaProv > 0;
};

/** v5.11.3 — % de ganancia personal retenida (no recupera inversión). Global, 0-100. */
RN.investment.pctPersonal = function () {
  const p = +(RN.state.config.pctPersonalInversion || 0);
  return Math.max(0, Math.min(100, p));
};

/**
 * v5.11.3 — APORTE NETO a la recuperación de un cliente vinculado, desde la
 * fecha de compra. Por cada mes en que el cliente pagó (decisión 2=a):
 *   margenMes    = montoCobrado - costoMega(mes)
 *   recuperacion = margenMes * (1 - pctPersonal/100)   [lo que recupera el capital]
 * Si el margen es negativo ese mes, el aporte a recuperación es 0 (la pérdida
 * es del negocio, no se carga contra el capital invertido).
 */
RN.investment.aporteRecuperacionCliente = function (inv, clienteId) {
  if (!inv || !clienteId) return 0;
  const cli = (RN.state.clients || []).find(function (c) { return c.id === clienteId; });
  const pct = RN.investment.pctPersonal();
  const factorRec = 1 - pct / 100;
  const cobros = RN.investment._cobrosClienteDesde(clienteId, inv);
  // Agrupar cobros por mes: restar el costo del mes una sola vez por mes.
  const porMes = {};
  cobros.forEach(function (h) {
    const mes = h.mes || '__sinmes__';
    if (!porMes[mes]) porMes[mes] = { cobrado: 0, costo: 0 };
    porMes[mes].cobrado += (h.monto || 0);
  });
  let total = 0;
  Object.keys(porMes).forEach(function (mes) {
    const costoMes = (mes !== '__sinmes__') ? RN.investment.costoMegaClienteMes(cli, mes) : 0;
    const margen = porMes[mes].cobrado - costoMes;
    if (margen > 0) total += margen * factorRec;
  });
  return +total.toFixed(2);
};

/**
 * v5.11.3 — Margen neto total de un cliente vinculado desde la compra (sin
 * aplicar retención personal). Útil para mostrar el desglose.
 */
RN.investment.margenNetoCliente = function (inv, clienteId) {
  if (!inv || !clienteId) return 0;
  const cli = (RN.state.clients || []).find(function (c) { return c.id === clienteId; });
  const cobros = RN.investment._cobrosClienteDesde(clienteId, inv);
  const porMes = {};
  cobros.forEach(function (h) {
    const mes = h.mes || '__sinmes__';
    if (!porMes[mes]) porMes[mes] = 0;
    porMes[mes] += (h.monto || 0);
  });
  let total = 0;
  Object.keys(porMes).forEach(function (mes) {
    const costoMes = (mes !== '__sinmes__') ? RN.investment.costoMegaClienteMes(cli, mes) : 0;
    total += porMes[mes] - costoMes;
  });
  return +total.toFixed(2);
};

/**
 * v5.13.2 — Helper compartido: suma el margen mensual de los clientes activos
 * vinculados a una inversión para un mes dado. Centraliza el bucle que antes
 * estaba duplicado en aporteMensualNeto(), margenMensualBruto() y
 * retiroMensualEstimado().
 *
 * El margen de cada cliente = precioNeto − costoMega. Solo se suma si es > 0.
 *
 * @param {object} inv — inversión con clienteIds
 * @param {string} mes — mes en formato YYYY-MM
 * @returns {number} suma de márgenes positivos de los clientes activos vinculados
 */
RN.investment._margenMensualClientes = function (inv, mes) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  var total = 0;
  inv.clienteIds.forEach(function (cid) {
    var cli = (RN.state.clients || []).find(function (c) { return c.id === cid; });
    if (!cli || cli.activo === false) return;
    var precioNeto = RN.calc.getPrecioNeto(cli, mes);
    var costo = RN.investment.costoMegaClienteMes(cli, mes);
    var margen = precioNeto - costo;
    if (margen > 0) total += margen;
  });
  return total;
};

/**
 * v5.11.3 — Aporte mensual neto estimado de los clientes vinculados (para la
 * proyección). Basado en el ingreso neto esperado mensual de cada cliente
 * activo vinculado (precio neto - costo mega), aplicando retención personal.
 */
RN.investment.aporteMensualNeto = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  const pct = RN.investment.pctPersonal();
  const factorRec = 1 - pct / 100;
  const mes = RN.calc.mesActualStr();
  var total = RN.investment._margenMensualClientes(inv, mes);
  return +(total * factorRec).toFixed(2);
};

/**
 * v5.11.3 — Clientes vinculados con su aporte bruto, margen neto y aporte a
 * recuperación, ordenados de mayor a menor aporte de recuperación.
 */
RN.investment.aportesPorCliente = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return [];
  return inv.clienteIds.map(function (cid) {
    const cli = (RN.state.clients || []).find(function (c) { return c.id === cid; });
    return {
      cliente: cli,
      aporte: RN.investment.aporteCliente(inv, cid),               // bruto (compat)
      margenNeto: RN.investment.margenNetoCliente(inv, cid),       // ganancia real antes de retención
      recuperacion: RN.investment.aporteRecuperacionCliente(inv, cid) // lo que recupera el capital
    };
  }).sort(function (a, b) { return b.recuperacion - a.recuperacion; });
};

/** v5.11.0 — Total aportado (BRUTO) por los clientes vinculados desde la compra. */
RN.investment.totalAporteClientes = function (inv) {
  return RN.investment.aportesPorCliente(inv).reduce(function (s, x) { return s + x.aporte; }, 0);
};

/** v5.11.3 — Total que los clientes vinculados han recuperado del capital (NETO, con retención). */
RN.investment.totalRecuperacionClientes = function (inv) {
  return RN.investment.aportesPorCliente(inv).reduce(function (s, x) { return s + x.recuperacion; }, 0);
};

/** v5.11.3 — Total de margen neto generado por los clientes vinculados (antes de retención). */
RN.investment.totalMargenNetoClientes = function (inv) {
  return RN.investment.aportesPorCliente(inv).reduce(function (s, x) { return s + x.margenNeto; }, 0);
};

/**
 * v5.11.3 — Recuperado REAL de una inversión = aporte neto automático de los
 * clientes vinculados desde la fecha de compra. Reemplaza el campo manual.
 * Para inversiones sin clientes vinculados, conserva el valor manual histórico.
 */
RN.investment.recuperadoRealInv = function (inv) {
  if (!inv) return 0;
  if (!inv.clienteIds || !inv.clienteIds.length) return +(inv.recuperado || 0);
  return RN.investment.totalRecuperacionClientes(inv);
};


/**
 * v5.12.1 — Acumulado retenido como ganancia personal de una inversión
 * (desde la fecha de compra). = margen neto total × pctPersonal/100.
 * Representa el dinero que el inversor se "saca" del margen y que NO recupera
 * el capital invertido.
 */
RN.investment.acumuladoRetenido = function (inv) {
  if (!inv) return 0;
  const pct = RN.investment.pctPersonal();
  if (pct <= 0) return 0;
  const margenNeto = RN.investment.totalMargenNetoClientes(inv);
  return +(Math.max(0, margenNeto) * pct / 100).toFixed(2);
};

/**
 * v5.12.1 — Retiro mensual estimado como ganancia personal.
 * = aporte mensual neto BRUTO (sin retención) × pctPersonal/100.
 * Es lo que el inversor puede "retirar" cada mes del margen que generan los
 * clientes vinculados, mientras el resto recupera el capital.
 */
RN.investment.retiroMensualEstimado = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  const pct = RN.investment.pctPersonal();
  if (pct <= 0) return 0;
  const mes = RN.calc.mesActualStr();
  var totalMargenMensual = RN.investment._margenMensualClientes(inv, mes);
  return +(totalMargenMensual * pct / 100).toFixed(2);
};

/**
 * v5.12.1 — Margen neto mensual BRUTO (sin aplicar retención personal).
 * = suma de (precioNeto - costoMega) de cada cliente activo vinculado.
 * Útil para mostrar cuánto genera la inversión por mes antes de separar
 * la ganancia personal del capital.
 */
RN.investment.margenMensualBruto = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  const mes = RN.calc.mesActualStr();
  var total = RN.investment._margenMensualClientes(inv, mes);
  return +total.toFixed(2);
};

/* ============================================================
 * v5.12.9 — Modelo de ORIGEN DEL CAPITAL + DEVOLUCIONES
 * ------------------------------------------------------------
 * Nueva forma de entender la recuperación de la inversión.
 *
 * PROBLEMA que resuelve:
 *   Antes, todo el margen neto de los clientes "recuperaba" el capital
 *   invertido. Pero cuando el capital es un PRÉSTAMO EXTERNO (dinero que el
 *   dueño debe devolver), tratarlo como "recuperación propia" mezcla dos
 *   cosas distintas: (a) el capital que es tuyo y ya recuperaste, y (b) el
 *   capital prestado que tienes que DEVOLVER. Eso genera duda contable.
 *
 * NUEVO MODELO:
 *   Cada inversión tiene un "origen del capital":
 *     - 'propio'         → dinero del dueño, NO hay que devolverlo.
 *                          La "recuperación" es ganancia retenida del capital.
 *     - 'prestado_externo'→ dinero prestado (banco, familiar, etc.) que HAY
 *                          QUE DEVOLVER. La app lleva un saldo a devolver.
 *
 *   Cuando el origen es 'prestado_externo':
 *     - recuperado     = margen neto acumulado de los clientes vinculados
 *                        (lo que el negocio ha generado para cubrir el capital).
 *     - devuelto       = suma de las DEVOLUCIONES registradas (extracciones
 *                        de caja marcadas como "Devolución de préstamo").
 *     - saldoADevolver = monto invertido − devuelto (lo que aún debes al
 *                        prestamista).
 *     - recuperadoNeto = recuperado − devuelto (lo que has generado pero aún
 *                        NO has devuelto; es dinero "acumulado" en caja listo
 *                        para devolver).
 *
 *   DEVOLUCIONES: se registran como retiros de caja (RN.caja) con la marca
 *   esDevolucionInversion + inversionId, para que salgan del fondo de caja
 *   y queden trazables. Así se usa la CAJA de la app como vehículo real del
 *   dinero que sale.
 *
 *   % DE GANANCIA DEL MES REAL: además del margen de los clientes vinculados,
 *   el dueño puede destinar un porcentaje (config.pctRecuperacionGananciaMes)
 *   de la GANANCIA NETA REAL DEL MES (ingresos − gastos del mes) a acelerar la
 *   recuperación/devolución del capital. Esto se calcula automáticamente y se
 *   muestra como "aporte extra del mes" sugerido.
 * ============================================================ */

/** Origen del capital de una inversión: 'propio' o 'prestado_externo'. Default 'propio'. */
RN.investment.origenCapital = function (inv) {
  if (!inv) return 'propio';
  return inv.origenCapital === 'prestado_externo' ? 'prestado_externo' : 'propio';
};

/** Nombre legible del origen del capital. */
RN.investment.origenCapitalTxt = function (inv) {
  return RN.investment.origenCapital(inv) === 'prestado_externo'
    ? 'Préstamo externo (a devolver)'
    : 'Capital propio';
};

/**
 * Devoluciones registradas para una inversión (retiros de caja marcados como
 * devolución de préstamo de esta inversión). Devuelve el array de gastos.
 */
RN.investment.devolucionesInv = function (inv) {
  if (!inv || !inv.id) return [];
  return (RN.state.gastos || []).filter(function (g) {
    return g.esDevolucionInversion && g.inversionId === inv.id;
  });
};

/** Total devuelto de una inversión (suma de las devoluciones registradas). */
RN.investment.totalDevuelto = function (inv) {
  return RN.investment.devolucionesInv(inv).reduce(function (s, g) {
    return s + (g.monto || 0);
  }, 0);
};

/**
 * Saldo a devolver de una inversión de préstamo externo.
 * = monto invertido − total devuelto. Mínimo 0.
 * Para capital propio devuelve 0 (no hay nada que devolver).
 */
RN.investment.saldoADevolver = function (inv) {
  if (RN.investment.origenCapital(inv) !== 'prestado_externo') return 0;
  var restante = (inv.monto || 0) - RN.investment.totalDevuelto(inv);
  return Math.max(0, +restante.toFixed(2));
};

/**
 * Recuperado NETO de una inversión = lo que el negocio ha generado (margen de
 * clientes) MENOS lo que ya se ha devuelto al prestamista.
 * Para capital propio es simplemente el recuperado (no hay devoluciones).
 */
RN.investment.recuperadoNetoInv = function (inv) {
  var recuperado = RN.investment.recuperadoRealInv(inv);
  var devuelto = RN.investment.totalDevuelto(inv);
  return +(recuperado - devuelto).toFixed(2);
};

/**
 * v5.12.9 — % de ganancia del mes real destinado a recuperación/devolución.
 * Configurable en Ajustes (0-100). Default 0 (no se aplica aporte extra).
 */
RN.investment.pctGananciaMes = function () {
  var p = +(RN.state.config.pctRecuperacionGananciaMes || 0);
  return Math.max(0, Math.min(100, p));
};

/**
 * v5.13.16 (DUP-3) — Helper compartido: gastos OPERATIVOS de un mes
 * (excluyendo devoluciones de inversión y retiros de caja, que son
 * movimientos de capital, no gastos operativos).
 *
 * Centraliza el filtro que antes estaba duplicado inline en aporteExtraMes() y
 * aporteExtraAcumulado(). Si se añade una nueva categoría de movimiento de
 * capital, basta con actualizar este único helper.
 *
 * @param {string} mes — mes en formato YYYY-MM
 * @returns {number} suma de gastos operativos del mes
 */
RN.investment._gastosOperativosMes = function (mes) {
  var mesNorm = (mes || '').slice(0, 7);
  if (!mesNorm) return 0;
  return (RN.state.gastos || [])
    .filter(function (g) { return (g.mes || '').slice(0, 7) === mesNorm; })
    .filter(function (g) { return !g.esDevolucionInversion && !g.esRetiroCaja; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/**
 * v5.12.9 — Aporte extra sugerido del mes para esta inversión, basado en la
 * GANANCIA NETA REAL del mes (ingresos del mes − gastos del mes, excluyendo
 * las propias devoluciones/retiros de caja).
 * = gananciaNetaMes × pctGananciaMes/100.
 * Esto es lo que el dueño puede "sacar" de la ganancia real del mes y
 * destinar a devolver el capital prestado (o a recuperar el propio).
 */
RN.investment.aporteExtraMes = function (inv) {
  var pct = RN.investment.pctGananciaMes();
  if (pct <= 0) return 0;
  var mes = RN.calc.mesActualStr();
  var ingresos = RN.calc.ingresosMes(mes);
  // v5.13.16 (DUP-3): usar el helper compartido _gastosOperativosMes en lugar
  // del filtro inline. Esto EXCLUYE devoluciones de inversión y retiros de
  // caja (movimientos de capital, no gastos operativos). Nota (LOG-4): por eso
  // la ganancia neta del mes NO descuenta las devoluciones, aunque el fondo de
  // caja sí se reduce por ellas (fondoCaja() resta TODOS los gastos). Son dos
  // métricas distintas: el aporte extra mide cuánto "sobra" del margen
  // operativo, no cuánto dinero físico hay en caja.
  var gastos = RN.investment._gastosOperativosMes(mes);
  var gananciaNeta = ingresos - gastos;
  if (gananciaNeta <= 0) return 0;
  return +(gananciaNeta * pct / 100).toFixed(2);
};

/**
 * v5.12.9 — Total acumulado de aportes extra (de todos los meses cerrados)
 * basados en la ganancia neta real mensual × pctGananciaMes.
 * Se aproxima sumando la ganancia neta histórica de meses ya cerrados.
 * Útil para mostrar cuánto capital se ha cubierto gracias a este aporte.
 */
RN.investment.aporteExtraAcumulado = function (inv) {
  var pct = RN.investment.pctGananciaMes();
  if (pct <= 0) return 0;
  // v5.13.16 (BUG-2): sumar SOLO cobros de servicio (h.tipo === 'servicio' o
  // undefined). Los cobros de tipo 'equipo' (pago de equipo del cliente) son
  // movimientos de capital, no ingresos operativos; y las ventas de inventario
  // ('venta-inventario') son ingresos no recurrentes que no deben computar para
  // el aporte extra de recuperación de capital. Además, se quitó h.montoEquipo
  // (es capital, no ingreso) para no inflar el aporte extra.
  var porMes = {};
  (RN.state.history || []).forEach(function (h) {
    if (h.tipo && h.tipo !== 'servicio') return;  // solo cobros de servicio
    var mes = (h.mes || '').slice(0, 7);
    if (!mes) return;
    if (!porMes[mes]) porMes[mes] = 0;
    porMes[mes] += (h.monto || 0);  // sin h.montoEquipo (es capital, no ingreso)
  });
  // v5.13.16 (DUP-3): usar el helper compartido para restar gastos operativos.
  // Construimos el set de meses con ingresos y restamos los gastos operativos
  // de cada uno.
  var mesesConIngreso = Object.keys(porMes);
  mesesConIngreso.forEach(function (mes) {
    porMes[mes] -= RN.investment._gastosOperativosMes(mes);
  });
  var total = 0;
  Object.keys(porMes).forEach(function (mes) {
    if (porMes[mes] > 0) total += porMes[mes] * pct / 100;
  });
  return +total.toFixed(2);
};

/**
 * v5.12.9 — Total "recuperado efectivo" de una inversión considerando TODO:
 *   margen neto de clientes + aporte extra acumulado de ganancia del mes.
 * Es la cifra más realista de cuánto capital se ha cubierto.
 */
RN.investment.recuperadoEfectivo = function (inv) {
  var base = RN.investment.recuperadoRealInv(inv);
  var extra = RN.investment.aporteExtraAcumulado(inv);
  return +(base + extra).toFixed(2);
};

/**
 * v5.12.9 — % de recuperación efectivo (sobre el monto invertido).
 * Usa recuperadoEfectivo (margen clientes + aporte extra).
 */
RN.investment.pctRecuperacionEfectiva = function (inv) {
  var monto = inv.monto || 0;
  if (monto <= 0) return 0;
  return +((RN.investment.recuperadoEfectivo(inv) / monto) * 100).toFixed(1);
};

/**
 * v5.13.16 (LOG-1) — Total recuperado EFECTIVO de TODAS las inversiones
 * (margen de clientes + aporte extra acumulado). Se usa para que el KPI global
 * "% recuperación" sea consistente con el "% efectivo" que muestra cada card
 * cuando pctGananciaMes > 0.
 */
RN.investment.totalRecuperadoEfectivo = function () {
  return (RN.state.investments || []).reduce(function (s, i) {
    return s + RN.investment.recuperadoEfectivo(i);
  }, 0);
};

/**
 * v5.13.16 (LOG-1) — % de recuperación EFECTIVO global (sobre el total
 * invertido). Usa totalRecuperadoEfectivo (margen clientes + aporte extra).
 * Cuando pctGananciaMes === 0, coincide con porcentajeRecuperacion().
 */
RN.investment.porcentajeRecuperacionEfectiva = function () {
  const total = RN.investment.totalInvertido();
  if (!total) return 0;
  return +((RN.investment.totalRecuperadoEfectivo() / total) * 100).toFixed(1);
};

/**
 * v5.12.9 — Total de devoluciones registradas en TODAS las inversiones.
 */
RN.investment.totalDevolucionesGlobal = function () {
  return (RN.state.gastos || [])
    .filter(function (g) { return g.esDevolucionInversion; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/**
 * v5.12.9 — Total invertido que es préstamo externo (a devolver).
 */
RN.investment.totalPrestadoExterno = function () {
  return (RN.state.investments || [])
    .filter(function (i) { return RN.investment.origenCapital(i) === 'prestado_externo'; })
    .reduce(function (s, i) { return s + (i.monto || 0); }, 0);
};

/**
 * v5.12.9 — Total que falta por devolver al prestamista (todas las inversiones).
 */
RN.investment.totalFaltaDevolver = function () {
  return (RN.state.investments || [])
    .filter(function (i) { return RN.investment.origenCapital(i) === 'prestado_externo'; })
    .reduce(function (s, i) { return s + RN.investment.saldoADevolver(i); }, 0);
};

/**
 * v5.13.0 — Lista de deudas personales activas (préstamo externo con saldo > 0
 * y no marcada como concluida).
 */
RN.investment.deudasActivas = function () {
  return (RN.state.investments || []).filter(function (i) {
    return RN.investment.origenCapital(i) === 'prestado_externo'
      && !i.deudaConcluida
      && RN.investment.saldoADevolver(i) > 0;
  });
};

/**
 * v5.13.0 — Lista de deudas personales concluidas (préstamo externo marcado
 * como deudaConcluida o con saldoADevolver === 0).
 */
RN.investment.deudasConcluidas = function () {
  return (RN.state.investments || []).filter(function (i) {
    return RN.investment.origenCapital(i) === 'prestado_externo'
      && (i.deudaConcluida || RN.investment.saldoADevolver(i) <= 0);
  });
};

/**
 * v5.13.0 — Verifica si una inversión préstamo debe marcarse como concluida.
 * Si saldoADevolver === 0 y no estaba marcada, la marca y guarda la fecha.
 * Devuelve true si se marcó como concluida en esta llamada.
 */
RN.investment.verificarConclusion = function (inv) {
  if (!inv) return false;
  if (RN.investment.origenCapital(inv) !== 'prestado_externo') return false;
  if (inv.deudaConcluida) return false;
  if (RN.investment.saldoADevolver(inv) <= 0) {
    inv.deudaConcluida = true;
    inv.fechaConclusion = new Date().toISOString();
    return true;
  }
  return false;
};

/**
 * v5.13.0 — Total de devuelto por todas las deudas concluidas.
 */
RN.investment.totalDevueltoConcluidas = function () {
  return RN.investment.deudasConcluidas().reduce(function (s, i) {
    return s + RN.investment.totalDevuelto(i);
  }, 0);
};
