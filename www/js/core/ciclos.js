/**
 * core/ciclos.js — Ciclos de cobro por corte (día de pago).
 * v5.10.4: Modelo de cortes con ciclo de recordatorios previo al pago.
 *
 * Modelo:
 *   Cada corte = un día de pago (diaPago) distinto entre los clientes activos.
 *   Inicio del ciclo (cuándo se empieza a mandar recordatorios) =
 *       max(1, diaPago - graciaDias)   (graciaDias default 5).
 *   Ejemplo con gracia=5:
 *     Corte 5  -> inicio día 1   (recordatorios del 1 al 5)
 *     Corte 15 -> inicio día 10  (recordatorios del 10 al 15)
 *     Corte 25 -> inicio día 20  (recordatorios del 20 al 25)
 *
 * Para el día D del mes actual:
 *   - Corte vigente  = corte con inicioCiclo <= D <= diaPago  (ciclo activo, no vencido).
 *   - Corte vencido  = corte con diaPago < D  (ya pasó su fecha de pago).
 *
 * Funciones públicas:
 *   RN.ciclos.gracia()
 *   RN.ciclos.inicioCiclo(diaPago)
 *   RN.ciclos.diaHoyNum()
 *   RN.ciclos.cortesDefinidos()
 *   RN.ciclos.corteVigente()
 *   RN.ciclos.clientesPorCorte(diaPago, mes)
 *   RN.ciclos.clientesCorteVigentePendientes()
 *   RN.ciclos.clientesMorososPorCorte()
 *   RN.ciclos.diasParaPago(diaPago)
 *   RN.ciclos.totalMorosos()
 */
RN.ciclos = RN.ciclos || {};

/** Días de gracia configurados (default 5). */
RN.ciclos.gracia = function () {
  var g = RN.state.config.graciaDias;
  return (typeof g === 'number' && g >= 0) ? g : 5;
};

/**
 * v5.13.10 (DUP-1): Cortes de pago oficiales del negocio, centralizados.
 * Antes el array [5, 15, 25] estaba hardcodeado en calendario.js,
 * modal-cliente.js (x2) y styles/leyenda. Ahora una sola fuente de verdad.
 * Orden: 1) config.cortesPago si está definido y no vacío; 2) default [5,15,25].
 * Devuelve una copia ordenada asc para no mutar la config.
 */
RN.ciclos.cortesOficiales = function () {
  var cfg = RN.state && RN.state.config && RN.state.config.cortesPago;
  var arr = (Array.isArray(cfg) && cfg.length) ? cfg.slice() : [5, 15, 25];
  arr.sort(function (a, b) { return a - b; });
  return arr;
};

/** Día de inicio del ciclo de un corte (mínimo 1, no retrocede al mes anterior). */
RN.ciclos.inicioCiclo = function (diaPago) {
  var d = diaPago || 1;
  var ini = d - RN.ciclos.gracia();
  return ini < 1 ? 1 : ini;
};

/** Número de día del mes actual (1..31). */
RN.ciclos.diaHoyNum = function () {
  return RN.calc.hoy().getDate();
};

/** Días de pago únicos de los clientes activos, ordenados ascendente. */
RN.ciclos.cortesDefinidos = function () {
  var seen = {};
  var arr = [];
  RN.calc.clientesActivos().forEach(function (c) {
    var dp = c.diaPago || 1;
    if (!seen[dp]) { seen[dp] = true; arr.push(dp); }
  });
  arr.sort(function (a, b) { return a - b; });
  return arr;
};

/**
 * Corte vigente para el día actual: el corte cuyo ciclo está activo
 * (inicioCiclo <= hoy <= diaPago). Devuelve { diaPago, inicioCiclo } o null.
 */
RN.ciclos.corteVigente = function () {
  var hoy = RN.ciclos.diaHoyNum();
  var cortes = RN.ciclos.cortesDefinidos();
  var candidatos = cortes.filter(function (dp) {
    var ini = RN.ciclos.inicioCiclo(dp);
    return hoy >= ini && hoy <= dp;
  });
  if (!candidatos.length) return null;
  candidatos.sort(function (a, b) { return a - b; });
  for (var i = 0; i < candidatos.length; i++) {
    if (candidatos[i] >= hoy) return { diaPago: candidatos[i], inicioCiclo: RN.ciclos.inicioCiclo(candidatos[i]) };
  }
  var last = candidatos[candidatos.length - 1];
  return { diaPago: last, inicioCiclo: RN.ciclos.inicioCiclo(last) };
};

/** Días que faltan para el día de pago del corte vigente (>=0). */
RN.ciclos.diasParaPago = function (diaPago) {
  var dp = diaPago || (RN.ciclos.corteVigente() || {}).diaPago;
  if (!dp) return 0;
  var rest = dp - RN.ciclos.diaHoyNum();
  return rest < 0 ? 0 : rest;
};

/** Clientes activos cuyo diaPago coincide con el dado. */
RN.ciclos.clientesPorCorte = function (diaPago, mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.calc.clientesActivos().filter(function (c) {
    return (c.diaPago || 1) === diaPago;
  });
};

/**
 * Pendientes del corte vigente: clientes del corte vigente cuyo estado
 * NO es 'paid' y cuyo mesInicio <= mes actual. Devuelve [] si no hay corte vigente.
 */
RN.ciclos.clientesCorteVigentePendientes = function () {
  var cv = RN.ciclos.corteVigente();
  if (!cv) return [];
  var mes = RN.calc.mesActualStr();
  return RN.ciclos.clientesPorCorte(cv.diaPago, mes).filter(function (c) {
    return RN.calc.getStatus(c) !== 'paid' && RN.calc.mesInicioCliente(c) <= mes;
  });
};

/**
 * v5.10.5: Todos los pendientes de cobranza de este mes (clientes activos que
 * no han pagado este mes y cuyo mesInicio <= mes actual), agrupados por corte.
 * El corte vigente va primero, luego los demas cortes ordenados por diaPago asc.
 * Devuelve array de { diaPago, vigente: bool, clientes: [...] }.
 */
RN.ciclos.clientesCobranzaPendientes = function () {
  var mes = RN.calc.mesActualStr();
  var cv = RN.ciclos.corteVigente();
  var cvDia = cv ? cv.diaPago : null;
  var activos = RN.calc.clientesActivos().filter(function (c) {
    return RN.calc.getStatus(c) !== 'paid' && RN.calc.mesInicioCliente(c) <= mes;
  });
  // agrupar por diaPago
  var gruposMap = {};
  activos.forEach(function (c) {
    var dp = c.diaPago || 1;
    if (!gruposMap[dp]) gruposMap[dp] = [];
    gruposMap[dp].push(c);
  });
  var grupos = Object.keys(gruposMap).map(function (dp) {
    var dia = parseInt(dp, 10);
    return { diaPago: dia, vigente: dia === cvDia, clientes: gruposMap[dp] };
  });
  // ordenar: corte vigente primero, luego el resto asc
  grupos.sort(function (a, b) {
    if (a.vigente && !b.vigente) return -1;
    if (!a.vigente && b.vigente) return 1;
    return a.diaPago - b.diaPago;
  });
  return grupos;
};

/**
 * v5.10.5: Morosos por corte = clientes con mora REAL (getMora > 0, deben meses
 * anteriores sin pagar), agrupados por diaPago. Ordenado por diaPago asc.
 * Los que solo se pasaron de su dia de pago este mes NO son morosos (van en cobranza).
 * Devuelve array de { diaPago, clientes: [...] }.
 */
RN.ciclos.clientesMorososPorCorte = function () {
  var morosos = RN.calc.clientesActivos().filter(function (c) {
    return RN.calc.getMora(c) > 0;
  });
  var gruposMap = {};
  morosos.forEach(function (c) {
    var dp = c.diaPago || 1;
    if (!gruposMap[dp]) gruposMap[dp] = [];
    gruposMap[dp].push(c);
  });
  var grupos = Object.keys(gruposMap).map(function (dp) {
    return { diaPago: parseInt(dp, 10), clientes: gruposMap[dp] };
  });
  grupos.sort(function (a, b) { return a.diaPago - b.diaPago; });
  return grupos;
};

/** Total de morosos (suma de clientes de todos los cortes vencidos no pagados). */
RN.ciclos.totalMorosos = function () {
  return RN.ciclos.clientesMorososPorCorte().reduce(function (s, g) {
    return s + g.clientes.length;
  }, 0);
};
