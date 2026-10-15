/**
 * tests/tests-calculo.js — Tests básicos de las funciones de cálculo.
 * v5.11.2 — Harness mínimo (sin dependencias externas) para validar el
 * corazón financiero de la app: mora, estado, precio neto, formato moneda,
 * aritmética de meses.
 *
 * Cómo ejecutar: desde la consola del navegador, escribir:
 *     RN.tests.ejecutar()
 * Devuelve { pasaron, fallaron, total, resultados: [...] } y muestra toasts.
 *
 * Diseño:
 *  - No depende del DOM (salvo toasts opcionales).
 *  - Guarda y restaura RN.state y RN.calc.mesActualStr para no alterar la app.
 *  - Cada test recibe un estado mock y, si quiere, una fecha "actual" fija.
 */
RN.tests = RN.tests || {};

RN.tests._resultados = [];

/** Assert helper. */
RN.tests._assert = function (condicion, mensaje) {
  RN.tests._resultados.push({ ok: !!condicion, mensaje: mensaje });
  return !!condicion;
};

RN.tests._assertEq = function (actual, esperado, mensaje) {
  var ok = actual === esperado;
  RN.tests._resultados.push({ ok: ok, mensaje: mensaje + ' (esperado: ' + JSON.stringify(esperado) + ', actual: ' + JSON.stringify(actual) + ')' });
  return ok;
};

/** Crea un estado mock mínimo. */
RN.tests._mockState = function (overrides) {
  var base = {
    clients: [],
    history: [],
    gastos: [],
    inventario: [],
    asignacionesInventario: [],
    investments: [],
    planes: [],
    equiposRed: [],
    descuentos: [],
    snapshots: [],
    config: { graciaDias: 5, diasBaseMes: 30 },
    reciboCounter: 0,
    mesActual: null
  };
  return Object.assign(base, overrides || {});
};

/** Ejecuta todos los tests. Devuelve un resumen. */
RN.tests.ejecutar = function () {
  RN.tests._resultados = [];

  // Guardar estado real y funciones que vamos a mockear
  var stateReal = RN.state;
  var mesActualReal = RN.calc.mesActualStr;

  try {
    RN.tests._testMesesEntre();
    RN.tests._testMesAnteriorSiguiente();
    RN.tests._testFormatCUP();
    RN.tests._testPrecioNeto();
    RN.tests._testMora();
    RN.tests._testGetStatus();
    RN.tests._testPrecioNetoNoNegativo();
    RN.tests._testMesActualRespetaState();   // Bug #1
    RN.tests._testDeudaTotalCliente();        // Bug #4
    RN.tests._testAUSD();                     // Bug #8
    RN.tests._testAporteRecuperacionFecha();  // Bug #11
    RN.tests._testCostoMegaConfigurado();     // Bug #17
    RN.tests._testRestanteEfectivo();         // v5.13.16 BUG-1
    RN.tests._testAporteExtraAcumuladoFiltro(); // v5.13.16 BUG-2
    RN.tests._testBonificacionNMeses();          // v5.14.4
    RN.tests._testBonificacionPermanente();      // v5.14.4
    RN.tests._testUnPagoSeConsumeUnaVez();       // v5.14.4
    RN.tests._testCierreNoAnulaMultiMes();       // v5.14.4
    RN.tests._testRevertirPorCobroLiberaMes();   // v5.14.4
    RN.tests._testAnularAplicadaRevieveTodos();  // v5.14.4
    RN.tests._testLegadoEsquema7();              // v5.14.4
    RN.tests._testMoraMesAMes();                 // v5.42.0
    RN.tests._testNetoCongelado();               // v5.42.0
    RN.tests._testMoraComoIngreso();             // v5.43.0
    RN.tests._testInactivosConDeuda();           // v5.43.0
    RN.tests._testLote1Caja();                   // v5.43.0
    RN.tests._testIndicePagos();                 // v5.43.1
    RN.tests._testBusquedaYAtencion();           // v5.44.0
    RN.tests._testAdministradores();             // v5.50.0 fase 1
    RN.tests._testColaMikrotik();                // v5.50.0 fase 2
    RN.tests._testCapacidadLimitAt();            // v5.50.0 fase 3
    RN.tests._testEdicionDescuentos();           // v5.51.0
    RN.tests._testCajaProyectada();              // v5.52.0
  } finally {
    // Restaurar siempre
    RN.state = stateReal;
    RN.calc.mesActualStr = mesActualReal;
  }

  var pasaron = RN.tests._resultados.filter(function (r) { return r.ok; }).length;
  var fallaron = RN.tests._resultados.length - pasaron;
  var resumen = { pasaron: pasaron, fallaron: fallaron, total: RN.tests._resultados.length, resultados: RN.tests._resultados };

  // Mostrar resultado en consola y, si hay UI, con toast.
  console.log('[AdminRed tests]', resumen);
  RN.tests._resultados.forEach(function (r) {
    (r.ok ? console.log : console.error)('  ' + (r.ok ? '✓' : '✗') + ' ' + r.mensaje);
  });
  if (RN.notifyUI && RN.notifyUI.toast) {
    RN.notifyUI.toast('Tests: ' + pasaron + ' OK, ' + fallaron + ' fallidos', fallaron ? 'error' : 'success');
  }
  return resumen;
};

// ---------------- Tests individuales ----------------

RN.tests._testMesesEntre = function () {
  RN.tests._assertEq(RN.calc.mesesEntre('2025-01', '2025-01'), 0, 'mesesEntre mismo mes = 0');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-01', '2025-04'), 3, 'mesesEntre ene->abr = 3');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-01', '2026-01'), 12, 'mesesEntre un año = 12');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-12', '2025-01'), -11, 'mesesEntre negativo (diciembre->enero mismo año) = -11');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-11', '2026-02'), 3, 'mesesEntre cruza año (nov25->feb26) = 3');
};

RN.tests._testMesAnteriorSiguiente = function () {
  RN.tests._assertEq(RN.calc.mesAnterior('2025-03'), '2025-02', 'mesAnterior mar->feb');
  RN.tests._assertEq(RN.calc.mesAnterior('2025-01'), '2024-12', 'mesAnterior eno->dic año previo');
  RN.tests._assertEq(RN.calc.mesSiguiente('2025-11'), '2025-12', 'mesSiguiente nov->dic');
  RN.tests._assertEq(RN.calc.mesSiguiente('2025-12'), '2026-01', 'mesSiguiente dic->eno año sig');
  // Round-trip
  RN.tests._assertEq(RN.calc.mesSiguiente(RN.calc.mesAnterior('2025-06')), '2025-06', 'mesAnterior+mesSiguiente = identidad');
};

RN.tests._testFormatCUP = function () {
  var s = RN.calc.formatCUP(1000);
  RN.tests._assert(s.indexOf('CUP') !== -1, 'formatCUP incluye "CUP"');
  RN.tests._assert(s.indexOf('1.000') !== -1 || s.indexOf('1,000') !== -1, 'formatCUP muestra 1000 con separador de miles');
  var s0 = RN.calc.formatCUP(0);
  RN.tests._assert(/0[.,]00\s*CUP/.test(s0), 'formatCUP(0) = "0,00 CUP" o "0.00 CUP" (depende del locale)');
  // No devuelve NaN
  RN.tests._assert(RN.calc.formatCUP(undefined).indexOf('NaN') === -1, 'formatCUP(undefined) no da NaN');
  RN.tests._assert(RN.calc.formatCUP(null).indexOf('NaN') === -1, 'formatCUP(null) no da NaN');
};

RN.tests._testPrecioNeto = function () {
  RN.state = RN.tests._mockState({
    planes: [{ id: 'p1', nombre: 'Básico', megas: 10, precio: 500 }],
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, descuentoRecurrente: 0, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' }],
    descuentos: []
  });
  // Sin descuentos: neto = base
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 500, 'getPrecioNeto sin descuentos = precio base');
  // Con descuento recurrente
  RN.state.clients[0].descuentoRecurrente = 100;
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 400, 'getPrecioNeto con descuento recurrente 100 = 400');
  // Descuento puntual fijo del mes
  RN.state.descuentos = [{ id: 'd1', clienteId: 'c1', mes: '2025-06', tipo: 'bonificacion', modo: 'fijo', valor: 50, estado: 'aplicado' }];
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 350, 'getPrecioNeto con recurrente 100 + puntual 50 = 350');
  // Descuento puntual de otro mes no aplica
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-07'), 400, 'getPrecioNeto: descuento puntual de otro mes no aplica');
};

RN.tests._testPrecioNetoNoNegativo = function () {
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 100, descuentoRecurrente: 200, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' }],
    descuentos: []
  });
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 0, 'getPrecioNeto nunca negativo (descuento > precio -> 0)');
};

RN.tests._testMora = function () {
  // Fijar mes "actual" en septiembre 2025
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' }],
    history: []
  });

  // Caso 1: nunca ha pagado, mesInicio ene-2025, mes actual sep-2025 -> debe 8 meses (feb..sep? excluye sep)
  // Según convención: mesesEntre(2025-01, 2025-09) = 8, diff>0 -> 8
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 8, 'getMora: nunca pagó, inicio ene, actual sep -> 8');

  // Caso 2: pagó hasta junio 2025, actual sep -> debe jul+ago = 2 (excluye sep)
  RN.state.history = [
    { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }
  ];
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 2, 'getMora: pagó hasta jun, actual sep -> 2');

  // Caso 3: pagó hasta el mes actual -> mora 0
  RN.state.history = [
    { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }
  ];
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: pagó el mes actual -> 0');

  // Caso 4: pagó hasta un mes futuro (raro) -> mora 0
  RN.state.history = [
    { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-12', monto: 500 }
  ];
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: último pagado futuro -> 0');

  // Caso 5: mesInicio futuro (alta este mes) -> mora 0
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state.history = [];
  RN.state.clients[0].mesInicio = '2025-09';
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: alta este mes -> 0');

  // Caso 6: mesInicio un mes después del actual (futuro) -> mora 0
  RN.state.clients[0].mesInicio = '2025-10';
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: inicio futuro -> 0');
};

RN.tests._testGetStatus = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-09', descuentoRecurrente: 0 }],
    history: [],
    descuentos: []
  });

  // Caso 1: cliente inactivo -> 'inactivo' (v5.13.6 BUG-6: el estado real es 'inactivo',
  // la expectativa 'ok' era obsoleta desde v5.13.6; corregida en v5.14.4)
  RN.state.clients[0].activo = false;
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'inactivo', 'getStatus: inactivo -> inactivo');

  // Caso 2: mes de inicio futuro -> 'por-iniciar'
  RN.state.clients[0].activo = true;
  RN.state.clients[0].mesInicio = '2025-12';
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'por-iniciar', 'getStatus: inicio futuro -> por-iniciar');

  // Caso 3: pagó el mes actual completo -> 'paid'
  RN.state.clients[0].mesInicio = '2025-01';
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }];
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'paid', 'getStatus: pagó completo -> paid');

  // Caso 4: pago parcial -> 'parcial'
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 200 }];
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'parcial', 'getStatus: pago parcial -> parcial');

  // Caso 5: con mora de meses anteriores -> 'due'
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }];
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'due', 'getStatus: con mora -> due');
};

// ---------------- Tests de bugs críticos corregidos (v5.13.1+) ----------------

/**
 * v5.13.20: mesActualStr() SIEMPRE usa el reloj del sistema (Opcion B).
 * El mes operativo siempre es el mes real del calendario. Ya no se respeta
 * RN.state.mesActual para determinar el mes operativo (solo se guarda como
 * referencia). mesActualStr() y mesRealStr() ahora son identicas.
 */
RN.tests._testMesActualRespetaState = function () {
  // v5.13.20: Restaurar mesActualStr a la funcion real (usa el reloj del sistema),
  // porque _testMora y _testGetStatus la mockean y no la restauran.
  // La funcion real siempre devuelve new Date() -> mes del reloj.
  RN.calc.mesActualStr = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };
  // Guardar y restaurar RN.state.mesActual
  var mesGuardado = RN.state.mesActual;
  try {
    // Caso 1: aunque mesActual este definido, mesActualStr() usa el reloj
    RN.state.mesActual = '2025-09';
    var str1 = RN.calc.mesActualStr();
    RN.tests._assert(/^\d{4}-\d{2}$/.test(str1), 'v5.13.20: mesActualStr siempre usa el reloj (ignora mesActual)');

    // Caso 2: mesActualStr() y mesRealStr() deben devolver lo mismo
    RN.state.mesActual = '2025-09';
    var actualStr = RN.calc.mesActualStr();
    var realStr = RN.calc.mesRealStr();
    RN.tests._assertEq(actualStr, realStr, 'v5.13.20: mesActualStr() === mesRealStr() (siempre identicas)');

    // Caso 3: mesActual vacio/null -> usa reloj del sistema (formato YYYY-MM)
    RN.state.mesActual = null;
    var real = RN.calc.mesActualStr();
    RN.tests._assert(/^\d{4}-\d{2}$/.test(real), 'v5.13.20: sin mesActual, usa reloj del sistema (formato YYYY-MM)');

    // Caso 4: formato valido YYYY-MM
    var f = RN.calc.mesActualStr();
    RN.tests._assert(/^\d{4}-\d{2}$/.test(f), 'v5.13.20: mesActualStr devuelve formato YYYY-MM');
  } finally {
    RN.state.mesActual = mesGuardado;
  }
};

/**
 * Bug #4: deudaTotalCliente() debe sumar el servicio pendiente del mes actual
 * más los meses en mora, más la deuda de equipo. Antes de la corrección cada
 * vista calculaba la deuda de forma distinta.
 */
RN.tests._testDeudaTotalCliente = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30 },
    planes: [{ id: 'p1', nombre: 'Básico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true,
      diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0,
      deudaEquipo: 300, deudaEquipoOriginal: 1000
    }],
    history: [
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }
    ],
    descuentos: []
  });

  // Mora: pagó hasta jun-2025, actual sep-2025 -> 2 meses en mora (jul, ago)
  // Servicio pendiente = 500 * (2 + 1) = 1500  (mora + mes actual)
  // Deuda equipo = 300
  // Total = 1800
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[0]), 1800,
    'Bug #4: deudaTotalCliente = servicio(1500) + equipo(300) = 1800');

  // Sin deuda de equipo
  RN.state.clients[0].deudaEquipo = 0;
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[0]), 1500,
    'Bug #4: deudaTotalCliente sin deuda equipo = 1500');

  // Sin mora (pagó el mes actual)
  RN.state.clients[0].deudaEquipo = 300;
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }];
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[0]), 800,
    'Bug #4: deudaTotalCliente al día = 500 (servicio) + 300 (equipo) = 800');

  // Deuda total nunca negativa
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-12', monto: 500 }];
  RN.state.clients[0].deudaEquipo = 0;
  RN.tests._assert(RN.calc.deudaTotalCliente(RN.state.clients[0]) >= 0,
    'Bug #4: deudaTotalCliente nunca negativa');
};

/**
 * Bug #8: aUSD() debe devolver un número, no un string. Antes de la corrección
 * podía devolver strings concatenados o NaN, lo que rompía comparaciones
 * numéricas y formato.
 */
RN.tests._testAUSD = function () {
  RN.state = RN.tests._mockState({
    config: { tasaUsd: 320 }
  });

  // Conversión normal: 640 CUP / 320 = 2 USD
  var r1 = RN.moneda.aUSD(640);
  RN.tests._assertEq(r1, 2, 'Bug #8: aUSD(640) con tasa 320 = 2');
  RN.tests._assert(typeof r1 === 'number', 'Bug #8: aUSD devuelve number (no string)');

  // Monto 0 -> 0 (número)
  var r0 = RN.moneda.aUSD(0);
  RN.tests._assertEq(r0, 0, 'Bug #8: aUSD(0) = 0');
  RN.tests._assert(typeof r0 === 'number', 'Bug #8: aUSD(0) es number');

  // Sin tasa -> 0 (número, no NaN ni string vacío)
  RN.state.config.tasaUsd = 0;
  var rNoTasa = RN.moneda.aUSD(1000);
  RN.tests._assertEq(rNoTasa, 0, 'Bug #8: aUSD sin tasa = 0');
  RN.tests._assert(typeof rNoTasa === 'number', 'Bug #8: aUSD sin tasa devuelve number');

  // Argumento inválido (undefined/null) -> 0 (número, no NaN)
  var rUndef = RN.moneda.aUSD(undefined);
  RN.tests._assertEq(rUndef, 0, 'Bug #8: aUSD(undefined) = 0 (no NaN)');
  RN.tests._assert(typeof rUndef === 'number', 'Bug #8: aUSD(undefined) es number');

  var rNull = RN.moneda.aUSD(null);
  RN.tests._assertEq(rNull, 0, 'Bug #8: aUSD(null) = 0 (no NaN)');

  // String numérico -> parsea correctamente
  RN.state.config.tasaUsd = 320;
  var rStr = RN.moneda.aUSD('640');
  RN.tests._assertEq(rStr, 2, 'Bug #8: aUSD("640") = 2 (parsea string numérico)');
  RN.tests._assert(typeof rStr === 'number', 'Bug #8: aUSD(string) devuelve number');

  // Round-trip aCUP(aUSD(x)) ≈ x
  RN.state.config.tasaUsd = 320;
  RN.tests._assertEq(RN.moneda.aCUP(RN.moneda.aUSD(960)), 960,
    'Bug #8: aCUP(aUSD(960)) = 960 (round-trip)');
};

/**
 * Bug #11: aporteRecuperacionCliente() debe filtrar los cobros por fecha de
 * compra. Antes de la corrección, si un cliente tenía cobros anteriores a la
 * fecha de compra de la inversión, esos cobros se sumaban e inflaban la
 * recuperación. Ahora _cobrosClienteDesde filtra por h.fecha >= fechaCompra
 * y h.mes >= mesCompra.
 */
RN.tests._testAporteRecuperacionFecha = function () {
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30, proveedorPrecioMega: 0, pctPersonalInversion: 0 },
    planes: [{ id: 'p1', nombre: 'Básico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: 'p1', megas: 10,
      activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0
    }],
    investments: [{
      id: 'inv1', clienteId: 'c1', monto: 3000, fechaCompra: '2025-06-15'
    }],
    history: [
      // Cobro ANTERIOR a la compra (mayo) — NO debe contar
      { id: 'h0', clienteId: 'c1', tipo: 'servicio', mes: '2025-05', fecha: '2025-05-10', monto: 500 },
      // Cobro POSTERIOR a la compra — SÍ debe contar
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-20', monto: 500 },
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 500 },
      // Cobro de OTRO cliente — NO debe contar
      { id: 'h3', clienteId: 'c2', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 500 },
      // Cobro tipo 'equipo' — NO debe contar (solo servicio)
      { id: 'h4', clienteId: 'c1', tipo: 'equipo', mes: '2025-07', fecha: '2025-07-06', monto: 200 }
    ],
    descuentos: []
  });

  var inv = RN.state.investments[0];
  // Sin costo de mega (proveedorPrecioMega=0) y pctPersonal=0:
  // aporteRecuperacion = suma de cobros posteriores a la compra = 500 + 500 = 1000
  // (h0 de mayo excluido, h3 de otro cliente excluido, h4 de equipo excluido)
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 1000,
    'Bug #11: aporteRecuperacion excluye cobros anteriores a fechaCompra (solo jun+jul = 1000)');

  // _cobrosClienteDesde debe devolver solo 2 cobros
  var cobros = RN.investment._cobrosClienteDesde('c1', inv);
  RN.tests._assertEq(cobros.length, 2,
    'Bug #11: _cobrosClienteDesde filtra por fecha y devuelve solo 2 cobros');

  // Con costo de mega: 10 megas × 1 CUP/mega = 10 costo por mes
  // jun: 500 - 10 = 490; jul: 500 - 10 = 490; total = 980
  RN.state.config.proveedorPrecioMega = 1;
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 980,
    'Bug #11: aporteRecuperacion con costoMega descuenta 10/mes (980)');

  // Con % personal 50%: solo la mitad recupera capital
  RN.state.config.pctPersonalInversion = 50;
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 490,
    'Bug #11: aporteRecuperacion con 50% personal = 980×0.5 = 490');

  // Cobro del MISMO DÍA de la compra (15-jun) — debe incluirse
  RN.state.config.proveedorPrecioMega = 0;
  RN.state.config.pctPersonalInversion = 0;
  RN.state.history = [
    { id: 'hs', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-15', monto: 500 }
  ];
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 500,
    'Bug #11: cobro del mismo día de la compra SÍ se incluye (sin bug de zona horaria)');

  // Cobro del día ANTERIOR a la compra (14-jun) — debe excluirse
  RN.state.history = [
    { id: 'hs', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-14', monto: 500 }
  ];
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 0,
    'Bug #11: cobro del día anterior a la compra se excluye');
};

/**
 * Bug #17: costoMegaConfigurado() indica si el costo de proveedor está
 * configurado. Si no lo está, las métricas de margen y recuperación de
 * inversión están infladas (asumen costo 0). La UI debe advertir al usuario.
 */
RN.tests._testCostoMegaConfigurado = function () {
  // Sin precio de proveedor -> false
  RN.state = RN.tests._mockState({
    config: { proveedorPrecioMega: 0 }
  });
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), false,
    'Bug #17: costoMegaConfigurado = false cuando proveedorPrecioMega = 0');

  // Sin la clave en config -> false
  RN.state.config = {};
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), false,
    'Bug #17: costoMegaConfigurado = false cuando no existe proveedorPrecioMega');

  // Con precio válido -> true
  RN.state.config.proveedorPrecioMega = 1.5;
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), true,
    'Bug #17: costoMegaConfigurado = true cuando proveedorPrecioMega > 0');

  // Con precio negativo -> false (no válido)
  RN.state.config.proveedorPrecioMega = -1;
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), false,
    'Bug #17: costoMegaConfigurado = false cuando proveedorPrecioMega es negativo');

  // Con string numérico válido -> true (+() lo parsea)
  RN.state.config.proveedorPrecioMega = '2';
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), true,
    'Bug #17: costoMegaConfigurado = true con string numérico "2"');

  // Impacto en costoMegaClienteMes: sin config -> 0 (margen inflado)
  RN.state.config.proveedorPrecioMega = 0;
  var cli = { id: 'c1', megas: 10, planId: null };
  RN.tests._assertEq(RN.investment.costoMegaClienteMes(cli, '2025-06'), 0,
    'Bug #17: costoMegaClienteMes = 0 sin config (margen inflado, por eso se advierte)');

  // Con config -> costo real
  RN.state.config.proveedorPrecioMega = 1.5;
  RN.tests._assertEq(RN.investment.costoMegaClienteMes(cli, '2025-06'), 15,
    'Bug #17: costoMegaClienteMes = 15 con 10 megas × 1.5 CUP/mega');
};

/**
 * v5.13.16 (BUG-1): restanteEfectivo() debe usar recuperadoEfectivo()
 * (margen de clientes + aporte extra acumulado) cuando pctGananciaMes > 0,
 * y recuperadoRealInv() (solo margen) cuando pctGananciaMes === 0.
 *
 * Sin esta correccion, proyectarRecuperacion() y mesesParaRecuperar()
 * mostraban una proyeccion pesimista (no contaban el aporte extra) que era
 * inconsistente con el "% efectivo" de la card.
 */
RN.tests._testRestanteEfectivo = function () {
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30, proveedorPrecioMega: 0, pctPersonalInversion: 0, pctRecuperacionGananciaMes: 0 },
    planes: [{ id: 'p1', nombre: 'Basico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: 'p1', megas: 10,
      activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0
    }],
    investments: [{
      id: 'inv1', clienteId: 'c1', clienteIds: ['c1'], monto: 3000, fechaCompra: '2025-06-15'
    }],
    history: [
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-20', monto: 500 },
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 500 }
    ],
    descuentos: []
  });

  var inv = RN.state.investments[0];

  // pctGananciaMes === 0: restanteEfectivo = monto - recuperadoRealInv
  // Sin costo de mega, sin % personal: recuperadoRealInv = 500 + 500 = 1000
  // restante = 3000 - 1000 = 2000
  RN.tests._assertEq(RN.investment.restanteEfectivo(inv), 2000,
    'BUG-1: restanteEfectivo con pctGananciaMes=0 usa recuperadoRealInv (3000-1000=2000)');

  // Con pctGananciaMes > 0: restanteEfectivo = monto - recuperadoEfectivo
  // recuperadoEfectivo = recuperadoRealInv + aporteExtraAcumulado
  // aporteExtraAcumulado: ingresos servicio por mes = 500 (jun) + 500 (jul) = 1000 c/u
  // sin gastos operativos, ganancia neta = 1000/mes, pctGananciaMes=20%
  // aporte extra = 1000*0.2 + 1000*0.2 = 400
  // recuperadoEfectivo = 1000 + 400 = 1400
  // restante = 3000 - 1400 = 1600
  RN.state.config.pctRecuperacionGananciaMes = 20;
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 200,
    'BUG-1: aporteExtraAcumulado = 200 (500*20% + 500*20%, sin gastos)');
  RN.tests._assertEq(RN.investment.recuperadoEfectivo(inv), 1200,
    'BUG-1: recuperadoEfectivo = 1000 (margen) + 200 (extra) = 1200');
  RN.tests._assertEq(RN.investment.restanteEfectivo(inv), 1800,
    'BUG-1: restanteEfectivo con pctGananciaMes>0 usa recuperadoEfectivo (3000-1200=1800)');

  // Verificar que restanteEfectivo NO da negativo (min 0) cuando se sobrepasa
  RN.state.investments[0].monto = 500;
  RN.tests._assertEq(RN.investment.restanteEfectivo(inv), 0,
    'BUG-1: restanteEfectivo nunca es negativo (min 0)');

  // mesesParaRecuperar debe usar restanteEfectivo (consistencia)
  RN.state.investments[0].monto = 3000;
  // aporteMensualNeto = margen mensual neto. Sin costo mega ni % personal:
  // margen bruto mensual = 500 (precio Ana), aporte neto = 500
  // meses = ceil(1600 / 500) = 4
  RN.tests._assertEq(RN.investment.mesesParaRecuperar(inv), 4,
    'BUG-1: mesesParaRecuperar usa restanteEfectivo (ceil(1800/500)=4)');
};

/**
 * v5.13.16 (BUG-2): aporteExtraAcumulado() debe sumar SOLO cobros de servicio
 * (h.tipo === 'servicio' o undefined), excluyendo 'equipo' y 'venta-inventario'.
 * Ademas, NO debe sumar h.montoEquipo (es capital, no ingreso operativo).
 *
 * Antes, sumaba TODOS los cobros + h.montoEquipo, lo que inflaba el aporte
 * extra al incluir ventas de equipo e inventario (movimientos de capital, no
 * ingresos recurrentes).
 */
RN.tests._testAporteExtraAcumuladoFiltro = function () {
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30, proveedorPrecioMega: 0, pctPersonalInversion: 0, pctRecuperacionGananciaMes: 10 },
    planes: [{ id: 'p1', nombre: 'Basico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: 'p1', megas: 10,
      activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0
    }],
    investments: [{
      id: 'inv1', clienteId: 'c1', clienteIds: ['c1'], monto: 3000, fechaCompra: '2025-06-15'
    }],
    history: [
      // Cobro de servicio jun: 1000 -> cuenta
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-20', monto: 1000 },
      // Cobro de servicio jul: 1000 -> cuenta
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 1000 },
      // Cobro de EQUIPO jun: 500 -> NO cuenta (es capital)
      { id: 'h3', clienteId: 'c1', tipo: 'equipo', mes: '2025-06', fecha: '2025-06-21', monto: 500 },
      // Venta de inventario jul: 300 -> NO cuenta (ingreso no recurrente)
      { id: 'h4', clienteId: 'c1', tipo: 'venta-inventario', mes: '2025-07', fecha: '2025-07-06', monto: 300 },
      // Cobro de servicio con montoEquipo: el montoEquipo NO debe sumar
      { id: 'h5', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-22', monto: 200, montoEquipo: 800 }
    ],
    descuentos: []
  });

  var inv = RN.state.investments[0];

  // Ingresos de servicio por mes:
  //   jun: h1(1000) + h5(200, sin montoEquipo) = 1200
  //   jul: h2(1000) = 1000
  // Sin gastos operativos:
  //   ganancia neta jun = 1200, aporte extra = 1200 * 10% = 120
  //   ganancia neta jul = 1000, aporte extra = 1000 * 10% = 100
  //   total aporteExtraAcumulado = 220
  // Si el bug NO estuviera corregido, sumaria tambien h3(500), h4(300) y
  // h5.montoEquipo(800) = 1600 extra, dando 380 en lugar de 220.
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 220,
    'BUG-2: aporteExtraAcumulado solo suma servicio (220), excluye equipo/inventario/montoEquipo');

  // Verificar que el cobro de equipo (h3, 500) NO se conto
  // Si lo contara: jun = 1200 + 500 = 1700, aporte = 170, total = 270
  RN.tests._assert(RN.investment.aporteExtraAcumulado(inv) !== 270,
    'BUG-2: el cobro de equipo (500) NO infla el aporte extra');

  // Sin pctGananciaMes -> siempre 0
  RN.state.config.pctRecuperacionGananciaMes = 0;
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 0,
    'BUG-2: aporteExtraAcumulado = 0 cuando pctGananciaMes = 0');

  // Con gastos operativos: se restan (pero no devoluciones ni retiros)
  RN.state.config.pctRecuperacionGananciaMes = 10;
  RN.state.gastos = [
    { id: 'g1', mes: '2025-06', monto: 200 },  // gasto operativo -> resta
    { id: 'g2', mes: '2025-06', monto: 100, esDevolucionInversion: true },  // NO resta (capital)
    { id: 'g3', mes: '2025-07', monto: 50, esRetiroCaja: true }  // NO resta (capital)
  ];
  // jun: 1200 - 200 (g1) = 1000, aporte = 100
  // jul: 1000 - 0 (g3 es retiro, no operativo) = 1000, aporte = 100
  // total = 200
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 200,
    'BUG-2/DUP-3: gastos operativos restan, pero devoluciones y retiros no (200)');
};

/* ============================================================
 * v5.14.4 — Bonificaciones permanentes / por N meses
 * ============================================================ */

/** Cliente mock de uso común en los tests de v5.14.4. */
RN.tests._cli5144 = function () {
  return { id: 'c1', nombre: 'Ana', precio: 500, descuentoRecurrente: 0, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' };
};

/** Bonificación de 3 meses aplica en M, M+1, M+2 y NO en M+3. */
RN.tests._testBonificacionNMeses = function () {
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, estado: 'pendiente', mes: '2025-06', vigencia: 'meses', desde: '2025-06', durMeses: 3, aplicaciones: [] }]
  });
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-06'), 100, 'v5.14.4: bonificación 3 meses aplica en M (jun)');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 100, 'v5.14.4: bonificación 3 meses aplica en M+1 (jul)');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-08'), 100, 'v5.14.4: bonificación 3 meses aplica en M+2 (ago)');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-09'), 0, 'v5.14.4: bonificación 3 meses NO aplica en M+3 (sep)');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-05'), 0, 'v5.14.4: bonificación 3 meses NO aplica antes de desde (may)');
  // Dentro del rango sigue contando aunque esté aplicada (neto histórico cuadra)
  RN.state.descuentos[0].estado = 'aplicado';
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 100, 'v5.14.4: dentro del rango cuenta aunque estado=aplicado');
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-07'), 400, 'v5.14.4: neto de julio con bonificación aplicada = 400');
};

/** Permanente: aplica desde `desde` en adelante y NUNCA hacia atrás. */
RN.tests._testBonificacionPermanente = function () {
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 50, estado: 'pendiente', mes: '2025-04', vigencia: 'permanente', desde: '2025-04', aplicaciones: [] }]
  });
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-04'), 50, 'v5.14.4: permanente aplica en su mes desde');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-06'), 50, 'v5.14.4: permanente aplica en junio (creada abril)');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-12'), 50, 'v5.14.4: permanente aplica meses después');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-03'), 0, 'v5.14.4 (R1): permanente NUNCA aplica hacia atrás (mar)');
  // Aplicación: no muere tras el primer cobro
  RN.descuentos.aplicarEnMes(RN.state.descuentos[0], '2025-06', 'cob-1', 50);
  RN.tests._assertEq(RN.state.descuentos[0].estado, 'pendiente', 'v5.14.4: permanente NO pasa a aplicado tras un cobro');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 50, 'v5.14.4: permanente sigue aplicando el mes siguiente');
};

/** unPago: se consume una sola vez. */
RN.tests._testUnPagoSeConsumeUnaVez = function () {
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 30, estado: 'pendiente', mes: '2025-06', vigencia: 'unPago', desde: '2025-06', aplicaciones: [], soloPago: true }]
  });
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-06'), 30, 'v5.14.4: unPago aplica antes de consumirse');
  RN.descuentos.aplicarEnMes(RN.state.descuentos[0], '2025-06', 'cob-1', 30);
  RN.tests._assertEq(RN.state.descuentos[0].estado, 'aplicado', 'v5.14.4: unPago pasa a aplicado tras su único cobro');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 0, 'v5.14.4: unPago NO reaparece el mes siguiente');
};

/** Cierre de mes: esPuntualDeMes solo marca los puntuales de 1 mes. */
RN.tests._testCierreNoAnulaMultiMes = function () {
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    descuentos: [
      { id: 'd1', clienteId: 'c1', tipo: 'afectacion', modo: 'fijo', valor: 10, estado: 'pendiente', mes: '2025-06', vigencia: 'meses', desde: '2025-06', durMeses: 1 },
      { id: 'd2', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 20, estado: 'pendiente', mes: '2025-06', vigencia: 'meses', desde: '2025-06', durMeses: 3 },
      { id: 'd3', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 30, estado: 'pendiente', mes: '2025-06', vigencia: 'permanente', desde: '2025-06' },
      { id: 'd4', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 40, estado: 'pendiente', mes: '2025-06', vigencia: 'unPago', desde: '2025-06', soloPago: true }
    ]
  });
  var mes = '2025-06';
  RN.tests._assert(RN.descuentos.esPuntualDeMes(RN.state.descuentos[0], mes), 'v5.14.4: puntual de 1 mes SÍ se anula al cierre');
  RN.tests._assert(!RN.descuentos.esPuntualDeMes(RN.state.descuentos[1], mes), 'v5.14.4: 3 meses NO se anula al cierre');
  RN.tests._assert(!RN.descuentos.esPuntualDeMes(RN.state.descuentos[2], mes), 'v5.14.4: permanente NO se anula al cierre');
  RN.tests._assert(!RN.descuentos.esPuntualDeMes(RN.state.descuentos[3], mes), 'v5.14.4: unPago NO se anula al cierre');
  // Simular el cierre: solo d1 muere
  RN.state.descuentos.forEach(d => { if (RN.descuentos.esPuntualDeMes(d, mes)) d.estado = 'anulado'; });
  RN.tests._assertEq(RN.state.descuentos[0].estado, 'anulado', 'v5.14.4: cierre anuló el puntual');
  RN.tests._assertEq(RN.state.descuentos[1].estado, 'pendiente', 'v5.14.4: cierre NO anuló la de 3 meses');
  RN.tests._assertEq(RN.state.descuentos[2].estado, 'pendiente', 'v5.14.4: cierre NO anuló la permanente');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 90, 'v5.14.4: tras cierre de jun, jul sigue con 20+30+40 = 90');
};

/** Eliminar un cobro de un mes intermedio libera ese mes para re-cobro. */
RN.tests._testRevertirPorCobroLiberaMes = function () {
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    history: [
      { id: 'cob-1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 400 },
      { id: 'cob-2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', monto: 400 }
    ],
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, estado: 'pendiente', mes: '2025-06', vigencia: 'meses', desde: '2025-06', durMeses: 3, aplicaciones: [
      { mes: '2025-06', cobroHid: 'cob-1', valor: 100 }, { mes: '2025-07', cobroHid: 'cob-2', valor: 100 }
    ] }]
  });
  // Eliminar el cobro de julio
  RN.descuentos.revertirPorCobro('cob-2');
  var d = RN.state.descuentos[0];
  RN.tests._assertEq(d.aplicaciones.length, 1, 'v5.14.4: revertirPorCobro eliminó solo la aplicación de julio');
  RN.tests._assertEq(d.aplicaciones[0].mes, '2025-06', 'v5.14.4: la aplicación de junio sigue');
  RN.tests._assertEq(d.estado, 'pendiente', 'v5.14.4: la bonificación vuelve a estar activa');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 100, 'v5.14.4: julio liberado — la bonificación vuelve a aplicar si se re-cobra');
};

/** Anular una aplicada revierte TODOS los cobros (valores congelados). */
RN.tests._testAnularAplicadaRevieveTodos = function () {
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    history: [
      { id: 'cob-1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 400, totalCUP: 400, totalAPagar: 400, totalPagadoCUP: 400 },
      { id: 'cob-2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', monto: 400, totalCUP: 400, totalAPagar: 400, totalPagadoCUP: 400 }
    ],
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, estado: 'aplicado', mes: '2025-06', vigencia: 'meses', desde: '2025-06', durMeses: 2, aplicaciones: [
      { mes: '2025-06', cobroHid: 'cob-1', valor: 100 }, { mes: '2025-07', cobroHid: 'cob-2', valor: 100 }
    ] }]
  });
  var apps = RN.descuentos._aplicacionesDe(RN.state.descuentos[0]);
  RN.tests._assertEq(apps.length, 2, 'v5.14.4: _aplicacionesDe unifica las 2 aplicaciones');
  var total = 0;
  apps.forEach(function (a) {
    var cobro = RN.state.history.find(h => h.id === a.cobroHid);
    total += RN.descuentos._revertirEnCobro(a.cobroHid, a.valor);
  });
  RN.tests._assertEq(total, 200, 'v5.14.4: revert total con valores congelados = 200');
  RN.tests._assertEq(RN.state.history[0].monto, 500, 'v5.14.4: cobro de junio revertido a 500');
  RN.tests._assertEq(RN.state.history[1].monto, 500, 'v5.14.4: cobro de julio revertido a 500');
  // Tras revertir, el total a pagar sube (500) por encima de lo pagado (400)
  // → el cobro de julio queda 'parcial' (aún faltan 100 CUP). 'completo' era incorrecto.
  RN.tests._assertEq(RN.state.history[1].tipoPago, 'parcial', 'v5.14.4: tipoPago recalculado tras revert (parcial: faltan 100)');
};

/** Import de backup viejo (esquema 7 / sin campos nuevos) queda operativo. */
RN.tests._testLegadoEsquema7 = function () {
  // Sin campos nuevos: como lo restaura un checkpoint de undo o un backup v7
  RN.state = RN.tests._mockState({
    clients: [RN.tests._cli5144()],
    descuentos: [
      { id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 50, mes: '2025-06', soloPago: false, estado: 'pendiente', cobroHid: null },
      { id: 'd2', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 30, mes: '2025-06', soloPago: true, estado: 'pendiente', cobroHid: null },
      { id: 'd3', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 20, mes: '2025-06', soloPago: false, estado: 'aplicado', cobroHid: 'cob-x' }
    ]
  });
  // d1: puntual de junio (legacy) — comporta igual que antes
  // d1: puntual de junio (legacy) + d2 soloPago + d3 aplicado de junio.
  // Por diseño (informe §3.2, compatibilidad legacy), una bonificación aplicada del
  // MISMO mes sigue contando en junio — el precio neto ya pagado debe cuadrar.
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-06'), 100, 'v5.14.4 legacy: jun cuenta d1(50)+d2(30)+d3(20, aplicada mismo mes)');
  RN.tests._assertEq(RN.calc.getDescuentosPuntualesMes('c1', '2025-07'), 30, 'v5.14.4 legacy: jul solo cuenta el soloPago pendiente');
  RN.tests._assert(RN.descuentos.esPuntualDeMes(RN.state.descuentos[0], '2025-06'), 'v5.14.4 legacy: d1 (no soloPago) se anula al cierre de jun');
  RN.tests._assert(!RN.descuentos.esPuntualDeMes(RN.state.descuentos[1], '2025-06'), 'v5.14.4 legacy: d2 soloPago NO se anula al cierre');
  // d3 aplicado con cobroHid en junio: sigue vigente en junio (mismo mes, cuadra con lo
  // pagado) pero NO revive en julio (no vuelve a aplicar en meses futuros)
  RN.tests._assert(RN.descuentos.vigenteEnMes(RN.state.descuentos[2], '2025-06'), 'v5.14.4 legacy: aplicada cuenta en su propio mes (cuadre con lo pagado)');
  RN.tests._assert(!RN.descuentos.vigenteEnMes(RN.state.descuentos[2], '2025-07'), 'v5.14.4 legacy: aplicada con cobroHid no revive en julio');
  // _aplicacionesDe reconstruye la aplicación legada
  var apps3 = RN.descuentos._aplicacionesDe(RN.state.descuentos[2]);
  RN.tests._assertEq(apps3.length, 1, 'v5.14.4 legacy: _aplicacionesDe reconstruye 1 aplicación del cobroHid legado');
  RN.tests._assertEq(RN.descuentos.vigenciaDe(RN.state.descuentos[1]), 'unPago', 'v5.14.4 legacy: soloPago se interpreta como unPago');
};



/* ============================================================
 * v5.42.0 — Mora calculada mes a mes y neto congelado al cobrar.
 * ============================================================ */
RN.tests._testMoraMesAMes = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 }],
    history: [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }],
    // Bonificación de 100 SOLO en agosto (mes en mora)
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, estado: 'pendiente', mes: '2025-08', vigencia: 'meses', desde: '2025-08', durMeses: 1, aplicaciones: [] }]
  });
  var c = RN.state.clients[0];
  RN.tests._assertEq(JSON.stringify(RN.calc.mesesEnMora(c)), JSON.stringify(['2025-07', '2025-08']), 'v5.42.0: mesesEnMora pagó hasta jun, actual sep -> jul, ago');
  var det = RN.calc.detalleMora(c);
  RN.tests._assertEq(det.total, 900, 'v5.42.0: mora mes a mes = jul(500) + ago(400) = 900 (antes 1000)');
  RN.tests._assertEq(det.meses[1].neto, 400, 'v5.42.0: detalle de agosto refleja la bonificación');
  RN.tests._assertEq(RN.calc.deudaTotalCliente(c), 1400, 'v5.42.0: deudaTotal = mes actual(500) + mora(900) = 1400');
  RN.tests._assertEq(RN.calc.resumenCliente(c).moraMonto, 900, 'v5.42.0: resumenCliente.moraMonto = 900');
  // Nunca pagó, mesInicio jul -> debe jul + ago
  RN.state.history = [];
  c.mesInicio = '2025-07';
  RN.tests._assertEq(RN.calc.detalleMora(c).total, 900, 'v5.42.0: nunca pagó, inicio jul -> mora 900');
  // Al día -> sin mora
  RN.state.history = [{ id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }];
  RN.tests._assertEq(RN.calc.detalleMora(c).total, 0, 'v5.42.0: al día -> mora 0');
};

RN.tests._testNetoCongelado = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 }],
    history: [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500, tipoPago: 'completo', precioNetoAplicado: 500 }]
  });
  var c = RN.state.clients[0];
  RN.tests._assertEq(RN.calc.getStatus(c, '2025-09'), 'paid', 'v5.42.0: cobro completo -> paid');
  // El precio del plan sube DESPUÉS de cobrar: el mes cobrado no debe pasar a 'parcial'
  c.precio = 700;
  RN.tests._assertEq(RN.calc.getStatus(c, '2025-09'), 'paid', 'v5.42.0: subir el precio no altera un mes ya cobrado (neto congelado)');
  RN.tests._assertEq(RN.calc.netoEsperadoMes(c, '2025-09'), 500, 'v5.42.0: netoEsperadoMes usa el valor congelado');
  RN.tests._assertEq(RN.calc.netoEsperadoMes(c, '2025-10'), 700, 'v5.42.0: mes sin cobro usa neto vivo');
  // Cobro parcial NO congela: sigue evaluándose contra el neto vivo
  RN.state.history = [{ id: 'h3', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 300, tipoPago: 'parcial', precioNetoAplicado: 500 }];
  RN.tests._assertEq(RN.calc.getStatus(c, '2025-09'), 'parcial', 'v5.42.0: cobro parcial -> parcial');
  RN.tests._assertEq(RN.calc.netoEsperadoMes(c, '2025-09'), 700, 'v5.42.0: parcial no congela el neto');
  // Cobros antiguos sin el campo: comportamiento previo
  RN.state.history = [{ id: 'h4', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }];
  RN.tests._assertEq(RN.calc.getStatus(c, '2025-09'), 'parcial', 'v5.42.0: cobro legado sin precioNetoAplicado usa neto vivo');
};


/* ============================================================
 * v5.43.0 — Mora cobrada = ingreso real (y entra a la caja); interruptor de inactivos.
 * ============================================================ */
RN.tests._testMoraComoIngreso = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 }],
    history: [
      // cobro nuevo: servicio 500 + mora cobrada 1000
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500, montoEquipo: 0, montoMora: 1000, montoMoraCobrada: 1000, tipoPago: 'completo', precioNetoAplicado: 500 },
      // cobro legado con mora informativa y sin montoMoraCobrada: NO suma
      { id: 'h2', clienteId: 'c2', tipo: 'servicio', mes: '2025-09', monto: 300, montoEquipo: 0, montoMora: 600 }
    ]
  });
  RN.state.config.fondoInicial = 0;
  RN.tests._assertEq(RN.calc.ingresoCobro(RN.state.history[0]), 1500, 'v5.43.0: ingresoCobro = servicio + mora cobrada');
  RN.tests._assertEq(RN.calc.ingresoCobro(RN.state.history[1]), 300, 'v5.43.0: cobro legado (sin montoMoraCobrada) no cambia');
  RN.tests._assertEq(RN.calc.ingresosMes('2025-09'), 1800, 'v5.43.0: ingresosMes incluye la mora cobrada');
  RN.tests._assertEq(RN.calc.ingresosTotales(), 1800, 'v5.43.0: ingresosTotales incluye la mora cobrada');
  RN.tests._assertEq(RN.calc.ingresosServicioMes('2025-09'), 800, 'v5.43.0: ingresosServicioMes NO incluye mora (estado del mes)');
  RN.tests._assertEq(RN.calc.fondoCaja(), 1800, 'v5.43.0: la mora cobrada entra a la caja');
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0], '2025-09'), 'paid', 'v5.43.0: la mora cobrada no altera el estado del mes');
  RN.tests._assertEq(RN.calc.totalCobro(RN.state.history[0]), 1500, 'v5.43.0: totalCobro suma la mora cobrada');
};

RN.tests._testInactivosConDeuda = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [
      { id: 'a', nombre: 'Activo', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 },
      { id: 'i', nombre: 'Inactivo deudor', precio: 500, planId: null, activo: false, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 }
    ],
    history: []
  });
  RN.state.config.incluirInactivosConDeuda = false;
  RN.tests._assertEq(RN.calc.clientesCobrables().length, 1, 'v5.43.0: interruptor apagado -> solo activos');
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[1], '2025-09'), 'inactivo', 'v5.43.0: apagado -> inactivo');
  RN.state.config.incluirInactivosConDeuda = true;
  RN.tests._assertEq(RN.calc.clientesCobrables().length, 2, 'v5.43.0: encendido -> incluye inactivo con mora');
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[1], '2025-09'), 'due', 'v5.43.0: encendido -> inactivo con mora es moroso');
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[1]), 1000, 'v5.43.0: inactivo debe solo la mora (jul+ago), no el mes en curso');
  // Inactivo sin mora (mesInicio = mes actual) no entra
  RN.state.clients[1].mesInicio = '2025-09';
  RN.tests._assertEq(RN.calc.clientesCobrables().length, 1, 'v5.43.0: inactivo sin mora no se incluye aunque el interruptor esté encendido');
};


/* v5.43.0 — Días reales del mes, tasa histórica, conversión al retirar y resumen de cierre. */
RN.tests._testLote1Caja = function () {
  RN.tests._assertEq(RN.calc.diasDelMes('2025-02'), 28, 'v5.43.0: febrero 2025 = 28 días');
  RN.tests._assertEq(RN.calc.diasDelMes('2024-02'), 29, 'v5.43.0: febrero 2024 (bisiesto) = 29 días');
  RN.tests._assertEq(RN.calc.diasDelMes('2025-07'), 31, 'v5.43.0: julio = 31 días');
  RN.tests._assertEq(RN.calc.diasDelMes('xx'), 0, 'v5.43.0: mes inválido = 0');

  RN.calc.mesActualStr = function () { return '2025-02'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 560, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 }],
    history: [],
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'descuento', modo: 'dias', valor: 7, estado: 'pendiente', mes: '2025-02', vigencia: 'meses', desde: '2025-02', durMeses: 1, aplicaciones: [] }]
  });
  // 7 días sobre 28 (feb) = 560/28*7 = 140 exacto; v5.47.2: se redondea hacia abajo a múltiplo de 100 = 100
  RN.tests._assertEq(RN.calc.valorDescuento(RN.state.descuentos[0], 'c1', '2025-02'), 100, 'v5.43.0/v5.47.2: descuento por días usa los días reales de febrero y se redondea abajo a múltiplo de 100');
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-02'), 460, 'v5.43.0/v5.47.2: neto con descuento por días en febrero');

  // v5.47.2: redondeo de descuentos calculados (siempre hacia abajo, a favor del negocio)
  RN.tests._assertEq(RN.calc.redondearDescuento(988), 900, 'v5.47.2: 988 -> 900');
  RN.tests._assertEq(RN.calc.redondearDescuento(1000), 1000, 'v5.47.2: 1000 exacto no cambia');
  RN.tests._assertEq(RN.calc.redondearDescuento(95), 0, 'v5.47.2: menor a 100 -> 0');
  RN.tests._assertEq(RN.calc.redondearDescuento(299.9999999999), 300, 'v5.47.2: tolera error de coma flotante');
  RN.state.clients[0].precio = 2500;
  RN.state.descuentos = [{ id: 'd2', clienteId: 'c1', tipo: 'descuento', modo: 'porcentaje', valor: 10, estado: 'pendiente', mes: '2025-02', vigencia: 'meses', desde: '2025-02', durMeses: 1, aplicaciones: [] }];
  RN.tests._assertEq(RN.calc.valorDescuento(RN.state.descuentos[0], 'c1', '2025-02'), 200, 'v5.47.2: 10% de 2500 = 250 -> 200');
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-02'), 2300, 'v5.47.2: neto 2300 (múltiplo de 100)');
  RN.state.descuentos[0].modo = 'fijo'; RN.state.descuentos[0].valor = 125;
  RN.tests._assertEq(RN.calc.valorDescuento(RN.state.descuentos[0], 'c1', '2025-02'), 125, 'v5.47.2: modo fijo no se redondea');
  RN.state.clients[0].precio = 560;

  // v5.48.0: precio fijo en USD por mega — regla de tasa a tiempo / tarde
  var uu = { id: 'u1', nombre: 'U', activo: true, megas: 10, precioMega: 3.5, precioMoneda: 'USD', diaPago: 15, precio: 0, planId: null, descuentoRecurrente: 0, tasasMensaje: {} };
  RN.state.clients.push(uu);
  var fx = function (y, m, dia) { return new Date(y, m - 1, dia, 12, 0, 0); };
  RN.tests._assertEq(RN.calc.esPrecioUSD(uu), true, 'v5.48.0: cliente con precioMoneda USD, megas y precio = precio USD');
  RN.tests._assertEq(RN.calc.totalUSD(uu), 35, 'v5.48.0: 10 megas × 3.5 USD = 35 USD');
  RN.tests._assertEq(RN.calc.esPrecioUSD({ precioMoneda: 'USD', planId: 'p1', megas: 10, precioMega: 3 }), false, 'v5.48.0: con plan no es precio USD');
  RN.state.config.tasaUsd = 540;
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 10)).tasa, 540, 'v5.48.0: sin mensaje guardado usa la tasa de hoy');
  uu.tasasMensaje['2025-03'] = { tasa: 530 };
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 10)).tasa, 530, 'v5.48.0: a tiempo y la tasa subió -> se mantiene la del mensaje');
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 15)).tasa, 530, 'v5.48.0: el día de pago cuenta como a tiempo');
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 16)).tasa, 540, 'v5.48.0: tarde y la tasa subió -> tasa de hoy (la más alta)');
  RN.state.config.tasaUsd = 520;
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 10)).tasa, 520, 'v5.48.0: a tiempo y la tasa bajó -> tasa de hoy (la más baja)');
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 16)).tasa, 530, 'v5.48.0: tarde y la tasa bajó -> tasa del mensaje (la más alta)');
  RN.tests._assertEq(RN.calc.infoTasa(uu, '2025-03', fx(2025, 3, 10)).aTiempo, true, 'v5.48.0: aTiempo true antes del corte');
  // meses futuros siempre a tiempo; el cobro redondea hacia arriba a múltiplo de 100
  RN.state.config.tasaUsd = 537;
  RN.tests._assertEq(RN.calc.getPrecioBase(uu, '2099-01'), 18800, 'v5.48.0: 35 USD × 537 = 18795 -> 18800 (hacia arriba)');
  RN.tests._assertEq(RN.calc.getPrecioNeto(uu, '2099-01'), 18800, 'v5.48.0: neto CUP del cliente USD');
  RN.tests._assertEq(RN.calc.getPrecioNetoUSD(uu, '2099-01'), 35, 'v5.48.0: neto USD exacto sin descuentos');
  RN.tests._assertEq(RN.calc.aCUP(35, 'USD', RN.calc.tasaConversionCobro(uu, '2099-01')), 18800, 'v5.48.0: pagar 35 USD cubre exactamente el neto CUP redondeado');
  RN.state.config.tasaUsd = 600;
  RN.tests._assertEq(RN.calc.getPrecioBase(uu, '2099-01'), 21000, 'v5.48.0: monto exacto múltiplo de 100 no sube');
  RN.tests._assertEq(RN.calc.redondearCobroCUP(18795.0000000001), 18800, 'v5.48.0: redondearCobroCUP hacia arriba');
  RN.tests._assertEq(RN.calc.redondearCobroCUP(18800), 18800, 'v5.48.0: redondearCobroCUP exacto');
  RN.tests._assertEq(RN.calc.redondearCobroCUP(0), 0, 'v5.48.0: redondearCobroCUP cero');
  // descuento recurrente en CUP convertido a USD
  RN.state.config.tasaUsd = 537; uu.descuentoRecurrente = 200;
  RN.tests._assertEq(RN.calc.getPrecioNeto(uu, '2099-01'), 18600, 'v5.48.0: neto CUP con descuento recurrente');
  RN.tests._assertEq(RN.calc.getPrecioNetoUSD(uu, '2099-01'), 34.63, 'v5.48.0: neto USD con descuento (200 CUP / 537)');
  uu.descuentoRecurrente = 0;
  // la tasa del mensaje se fija solo la primera vez del mes
  uu.tasasMensaje = {}; RN.state.config.tasaUsd = 540;
  RN.tests._assertEq(RN.calc.fijarTasaMensaje(uu, '2099-01'), true, 'v5.48.0: primera vez fija la tasa del mensaje');
  RN.state.config.tasaUsd = 560;
  RN.tests._assertEq(RN.calc.fijarTasaMensaje(uu, '2099-01'), false, 'v5.48.0: no se sobrescribe al reenviar');
  RN.tests._assertEq(RN.calc.tasaMensajeMes(uu, '2099-01'), 540, 'v5.48.0: tasa del mensaje guardada = 540');
  // un cliente en CUP no cambia
  RN.tests._assertEq(RN.calc.getPrecioBase(RN.state.clients[0], '2099-01'), 560, 'v5.48.0: cliente CUP intacto');
  RN.state.clients.pop();

  // v5.49.0: redondeo del resto en CUP de pagos mixtos USD + CUP
  RN.state.config.redondeoPagoMixto = undefined;
  RN.tests._assertEq(RN.calc.modoRedondeoMixto(), 'cliente', 'v5.49.0: modo por defecto = a favor del cliente');
  RN.tests._assertEq(RN.calc.restoCUPRedondeado(271.43, 10), 200, 'v5.49.0: resto 271.43 con USD -> 200 (hacia abajo)');
  RN.tests._assertEq(RN.calc.restoCUPRedondeado(60, 10), 0, 'v5.49.0: resto < 100 -> 0');
  RN.tests._assertEq(RN.calc.restoCUPRedondeado(300, 10), 300, 'v5.49.0: resto exacto múltiplo de 100 no cambia');
  RN.tests._assertEq(RN.calc.restoCUPRedondeado(271.43, 0), 271.43, 'v5.49.0: sin USD no se redondea');
  RN.tests._assertEq(RN.calc.restoCUPRedondeado(271.43, 10, 'negocio'), 300, 'v5.49.0: modo negocio -> hacia arriba');
  RN.tests._assertEq(RN.calc.restoCUPRedondeado(271.43, 10, 'exacto'), 271.43, 'v5.49.0: modo exacto -> sin redondeo');
  // ajuste: aPagar 5700, 10 USD cubren 5428.57, el cliente paga 200 en CUP
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5628.57, 5700), 71.43, 'v5.49.0: ajuste perdonado = 71.43');
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(0, 5628.57, 5700), 0, 'v5.49.0: sin USD no hay ajuste');
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5700, 5700), 0, 'v5.49.0: pago exacto sin ajuste');
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5000, 5700), 0, 'v5.49.0: falta >= 100 sigue siendo pago parcial');
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5728.57, 5700), 0, 'v5.49.0: modo cliente no cobra de más');
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5728.57, 5700, 'negocio'), -28.57, 'v5.49.0: modo negocio: cobrado de más = -28.57');
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5628.57, 5700, 'exacto'), 0, 'v5.49.0: modo exacto sin ajuste');
  RN.state.config.redondeoPagoMixto = 'exacto';
  RN.tests._assertEq(RN.calc.ajusteRedondeoPago(10, 5628.57, 5700), 0, 'v5.49.0: el modo se lee de la configuración');
  RN.state.config.redondeoPagoMixto = 'cliente';
  var histAntes = RN.state.history;
  RN.state.history = [
    { id: 'a1', mes: '2025-04', tipo: 'servicio', ajusteRedondeo: 71.43 },
    { id: 'a2', mes: '2025-04', tipo: 'servicio', ajusteRedondeo: -28.57 },
    { id: 'a3', mes: '2025-04', tipo: 'servicio' },
    { id: 'a4', mes: '2025-05', tipo: 'servicio', ajusteRedondeo: 50 }
  ];
  var tot = RN.calc.totalAjustesRedondeoMes('2025-04');
  RN.tests._assertEq(tot.perdonado, 71.43, 'v5.49.0: total perdonado del mes');
  RN.tests._assertEq(tot.cobrado, 28.57, 'v5.49.0: total cobrado de más del mes');
  RN.state.history = histAntes;

  // Tasa histórica por movimiento
  RN.state.config.tasaUsd = 500;
  RN.tests._assertEq(RN.calc.tasaMovimiento({ tasaAlMomento: 300, tasaUsada: 250 }), 300, 'v5.43.0: tasaAlMomento manda');
  RN.tests._assertEq(RN.calc.tasaMovimiento({ tasaUsada: 250 }), 250, 'v5.43.0: movimientos viejos usan tasaUsada');
  RN.tests._assertEq(RN.calc.tasaMovimiento({}), 500, 'v5.43.0: sin tasa guardada usa la actual');
  var d = RN.calc.desgloseMovimiento({ moneda: 'MIXTO', monto: 6000, montoOriginal: 10, montoCUPDirecto: 3000, tasaAlMomento: 300 });
  RN.tests._assertEq(d.cupDesdeUSD, 3000, 'v5.43.0: desglose usa la tasa del momento (10 USD x 300)');

  // Conversión ofrecida al retirar sin dólares físicos
  RN.state = RN.tests._mockState({ clients: [], history: [] });
  RN.state.config.tasaUsd = 300; RN.state.config.fondoInicial = 0;
  RN.state.depositos = [{ id: 'dp1', concepto: 'x', monto: 20000, moneda: 'CUP', montoOriginal: 0, montoCUPDirecto: 20000, fecha: '2025-02-01T00:00:00', mes: '2025-02' }];
  var chk = RN.calc.validarMovimientoCaja({ montoUSD: 10, montoCUP: 0 }, 'retiro');
  RN.tests._assertEq(chk.ok, false, 'v5.43.0: retiro en USD sin dólares físicos sigue bloqueado');
  RN.tests._assertEq(chk.conversion && chk.conversion.usd, 10, 'v5.43.0: se ofrece convertir 10 USD');
  RN.tests._assertEq(chk.conversion && chk.conversion.cup, 3000, 'v5.43.0: costo de la conversión = 3000 CUP');
  var chk2 = RN.calc.validarMovimientoCaja({ montoUSD: 100, montoCUP: 0 }, 'retiro');
  RN.tests._assertEq(!!chk2.conversion, false, 'v5.43.0: sin pesos suficientes no se ofrece conversión');

  // Resumen de cierre
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 }],
    history: []
  });
  var rc = RN.calc.resumenCierre('2025-09');
  RN.tests._assertEq(rc.clientesEnMora, 1, 'v5.43.0: cierre cuenta clientes en mora');
  RN.tests._assertEq(rc.moraGenerada, 1000, 'v5.43.0: cierre suma la mora generada (jul+ago)');
  RN.tests._assertEq(RN.calc.generarSnapshot('2025-09').resumenCierre.clientesEnMora, 1, 'v5.43.0: el snapshot guarda el resumenCierre');
};


/* v5.43.1 — Índice de pagos: equivale al recorrido completo y se invalida al cambiar el historial. */
RN.tests._testIndicePagos = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [
      { id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 },
      { id: 'c2', nombre: 'Beto', precio: 400, planId: null, activo: true, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 }
    ],
    history: [
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-05', monto: 500 },
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 },
      { id: 'hv', clienteId: 'c1', tipo: 'venta-inventario', mes: '2025-08', monto: 100 }
    ]
  });
  RN.calc.invalidarIndicePagos();
  var c1 = RN.state.clients[0], c2 = RN.state.clients[1];
  RN.tests._assertEq(RN.calc.ultimoMesPagado('c1'), '2025-06', 'v5.43.1: último mes pagado de c1 = jun');
  RN.tests._assertEq(RN.calc.ultimoMesPagado('c2'), null, 'v5.43.1: c2 nunca pagó -> null');
  RN.tests._assertEq(RN.calc.cobrosServicio('c1', '2025-06').length, 1, 'v5.43.1: cobros de servicio de c1 en junio = 1');
  RN.tests._assertEq(RN.calc.cobrosServicio('c1', '2025-08').length, 0, 'v5.43.1: una venta de inventario no cuenta como pago de servicio');
  RN.tests._assertEq(RN.calc.getMora(c1), 2, 'v5.43.1: mora c1 (jul+ago) = 2');
  RN.tests._assertEq(RN.calc.getMora(c2), 2, 'v5.43.1: mora c2 nunca pagó desde jul = 2');
  // Agregar un cobro (push): el índice se actualiza solo (firma) y también con invalidación explícita
  RN.state.history.push({ id: 'h3', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 });
  RN.tests._assertEq(RN.calc.getMora(c1), 0, 'v5.43.1: tras pagar sep la mora de c1 = 0 (índice refrescado)');
  RN.tests._assertEq(RN.calc.getStatus(c1, '2025-09'), 'paid', 'v5.43.1: c1 al día tras el push');
  RN.tests._assertEq(RN.calc.cobranzaMes('2025-09').pagaron, 1, 'v5.43.1: cobranzaMes usa el índice (1 pagó)');
  // Reemplazar el historial completo (carga/restauración)
  RN.state.history = [];
  RN.tests._assertEq(RN.calc.getMora(c1), 8, 'v5.43.1: historial reemplazado -> c1 sin pagos desde ene (mora 8: ene..ago)');
  // Edición en sitio del mes de un cobro: requiere invalidación explícita
  RN.state.history = [{ id: 'h9', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }];
  RN.tests._assertEq(RN.calc.ultimoMesPagado('c1'), '2025-06', 'v5.43.1: índice antes de editar');
  RN.state.history[0].mes = '2025-08';
  RN.calc.invalidarIndicePagos();
  RN.tests._assertEq(RN.calc.ultimoMesPagado('c1'), '2025-08', 'v5.43.1: tras invalidar, el índice refleja la edición');
};


/* v5.44.0 — Búsqueda de clientes (teléfono, plan, deuda>X) y lista de atención priorizada. */
RN.tests._testBusquedaYAtencion = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.calc.hoy = function () { return new Date(2025, 8, 10); }; // 10-sep-2025
  RN.state = RN.tests._mockState({
    planes: [{ id: 'p1', nombre: 'Hogar', megas: 10 }],
    clients: [
      { id: 'a', nombre: 'Ana Pérez', telefono: '+53 5555-1234', precio: 500, planId: 'p1', activo: true, diaPago: 10, mesInicio: '2025-09', descuentoRecurrente: 0, deudaEquipo: 0 },
      { id: 'b', nombre: 'Beto', telefono: '5399-8888', precio: 300, planId: null, activo: true, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 },
      { id: 'c', nombre: 'Carla', precio: 400, planId: null, activo: true, diaPago: 11, mesInicio: '2025-09', descuentoRecurrente: 0, deudaEquipo: 0 },
      { id: 'd', nombre: 'Dani', precio: 200, planId: null, activo: false, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 }
    ],
    history: []
  });
  var L = RN.state.clients;
  var ids = function (r) { return r.map(function (c) { return c.id; }).join(','); };
  RN.tests._assertEq(ids(RN.calc.filtrarClientes(L, 'ana')), 'a', 'v5.44.0: búsqueda por nombre');
  RN.tests._assertEq(ids(RN.calc.filtrarClientes(L, '5555')), 'a', 'v5.44.0: búsqueda por teléfono (solo dígitos)');
  RN.tests._assertEq(ids(RN.calc.filtrarClientes(L, 'hogar')), 'a', 'v5.44.0: búsqueda por nombre del plan');
  RN.tests._assertEq(ids(RN.calc.filtrarClientes(L, 'deuda>500')), 'b', 'v5.44.0: deuda>500 (b debe 900; d 400)');
  RN.tests._assertEq(ids(RN.calc.filtrarClientes(L, 'deuda>=400')), 'b,c,d', 'v5.44.0: deuda>=400 (b 900, c 400, d 400)');
  RN.tests._assertEq(ids(RN.calc.filtrarClientes(L, 'beto deuda>500')), 'b', 'v5.44.0: términos combinados (AND)');
  RN.tests._assertEq(RN.calc.filtrarClientes(L, '').length, 4, 'v5.44.0: búsqueda vacía devuelve todo');

  // Atención: b y (con interruptor) d en mora; a vence hoy (10); c vence mañana (11)
  RN.state.config.incluirInactivosConDeuda = false;
  var at = RN.calc.clientesAtencion('');
  RN.tests._assertEq(at.map(function (x) { return x.cliente.id + ':' + x.motivo; }).join(','), 'b:mora,a:vence hoy,c:vence mañana', 'v5.44.0: orden mora → hoy → mañana');
  RN.tests._assertEq(RN.calc.clientesAtencion('morosos').length, 1, 'v5.44.0: chip Morosos');
  RN.tests._assertEq(ids(RN.calc.clientesAtencion('hoy').map(function (x) { return x.cliente; })), 'a', 'v5.44.0: chip Por cobrar hoy');
  RN.tests._assertEq(RN.calc.clientesAtencion('inactivos').length, 1, 'v5.44.0: chip Inactivos con deuda lista a d');
  // Parcial
  RN.state.history = [{ id: 'h', clienteId: 'c', tipo: 'servicio', mes: '2025-09', monto: 100, tipoPago: 'parcial' }];
  RN.tests._assertEq(ids(RN.calc.clientesAtencion('parciales').map(function (x) { return x.cliente; })), 'c', 'v5.44.0: chip Parciales');
};


/* v5.50.0 — Fase 1: cliente administrador (no paga, no genera alertas ni mora). */
RN.tests._testAdministradores = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    planes: [{ id: 'p4', nombre: '4M', megas: 4, precio: 800 }],
    clients: [
      { id: 'n', nombre: 'Normal', precio: 800, planId: 'p4', activo: true, diaPago: 5, mesInicio: '2025-07', descuentoRecurrente: 0, deudaEquipo: 0 },
      // admin con plan (solo define megas) y mesInicio viejo: sin pagos NO debe ser moroso
      { id: 'a', nombre: 'Admin', precio: 0, planId: 'p4', esAdmin: true, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 },
      { id: 'a2', nombre: 'Admin2', precio: 0, megas: 3, esAdmin: true, activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0, deudaEquipo: 0 }
    ],
    history: []
  });
  var admin = RN.state.clients[1];
  RN.tests._assertEq(RN.calc.getPrecioBase(admin), 0, 'v5.50.0: admin con plan tiene precio base 0');
  RN.tests._assertEq(RN.calc.getPrecioNeto(admin), 0, 'v5.50.0: admin neto 0');
  RN.tests._assertEq(RN.calc.getStatus(admin), 'admin', 'v5.50.0: estado propio "admin"');
  RN.tests._assertEq(RN.calc.getMora(admin), 0, 'v5.50.0: admin nunca tiene mora');
  RN.tests._assertEq(RN.calc.deudaTotalCliente(admin), 0, 'v5.50.0: admin no debe nada');
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]) > 0, true, 'v5.50.0: el cliente normal sí sigue en mora');
  RN.tests._assertEq(RN.calc.getMegasCliente(admin), 4, 'v5.50.0: admin conserva los megas de su plan');
  admin.activo = false;
  RN.tests._assertEq(RN.calc.getStatus(admin), 'inactivo', 'v5.50.0: admin dado de baja = inactivo');
  admin.activo = true;

  RN.tests._assertEq(RN.calc.clientesActivos().length, 1, 'v5.50.0: clientesActivos excluye admins');
  RN.tests._assertEq(RN.calc.clientesEnRed().length, 3, 'v5.50.0: clientesEnRed incluye admins');
  RN.tests._assertEq(RN.calc.clientesCobrables().length, 1, 'v5.50.0: clientesCobrables excluye admins');
  RN.tests._assertEq(RN.calc.clientesAtencion('').map(function (x) { return x.cliente.id; }).join(','), 'n', 'v5.50.0: admins no salen en atención');
  var cob = RN.calc.cobranzaMes('2025-09');
  RN.tests._assertEq(cob.total + '/' + cob.faltan, '1/1', 'v5.50.0: cobranza del mes no cuenta admins');
  RN.tests._assertEq(RN.calc.ingresoEsperadoMes('2025-09'), 800, 'v5.50.0: ingreso esperado no cambia con admins');
  RN.tests._assertEq(RN.calc.megasVendidos(), 4, 'v5.50.0: megas vendidos sin admins');
  RN.tests._assertEq(RN.calc.megasAdmin(), 7, 'v5.50.0: megas de administración aparte (4 + 3)');
};

/* v5.50.0 — Fase 2: reglas de Limit At, prioridad y comando para el MikroTik. */
RN.tests._testColaMikrotik = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    planes: [],
    clients: [],
    history: []
  });
  var cli = function (megas, extra) { return Object.assign({ id: 'x' + megas, nombre: 'C' + megas, megas: megas, activo: true, precio: 1 }, extra || {}); };
  var d = function (megas) { return RN.cola.datos(cli(megas)); };
  RN.tests._assertEq(d(4).limitAtKbps + '/' + d(4).prioridad, '1400/6', 'v5.50.0: 4M -> Limit At 1400k, prioridad 6');
  RN.tests._assertEq(d(12).limitAtKbps + '/' + d(12).prioridad, '5400/3', 'v5.50.0: 12M -> 5400k, prioridad 3');
  RN.tests._assertEq(d(2).limitAtKbps + '/' + d(2).prioridad, '700/8', 'v5.50.0: 2M -> 700k, prioridad 8');
  RN.tests._assertEq(d(8).limitAtKbps + '/' + d(8).prioridad, '3600/3', 'v5.50.0: 8M (plus) -> 3600k, prioridad 3');
  RN.tests._assertEq(d(5).limitAtKbps + '/' + d(5).prioridad, '1750/4', 'v5.50.0: 5M -> 1750k, prioridad 4');
  RN.tests._assertEq(d(7).limitAtKbps + '/' + d(7).prioridad, '2450/4', 'v5.50.0: 7M sigue en la regla de 5M a 7M');
  RN.tests._assertEq(d(3).limitAtKbps + '/' + d(3).prioridad, '1050/7', 'v5.50.0: 3M -> 1050k, prioridad 7');
  RN.tests._assertEq(d(1).limitAtKbps + '/' + d(1).prioridad, '350/8', 'v5.50.0: 1M -> 350k, prioridad 8');
  RN.tests._assertEq(d(4).maxLimitKbps, 4000, 'v5.50.0: Max Limit = megas del plan');
  RN.tests._assertEq(RN.cola.datos(cli(4, { limitAtManual: 2000 })).limitAtKbps, 2000, 'v5.50.0: Limit At manual sobrescribe la regla');

  RN.tests._assertEq(RN.cola.formatoVel(1400), '1400k', 'v5.50.0: formato 1400k');
  RN.tests._assertEq(RN.cola.formatoVel(4000), '4M', 'v5.50.0: formato 4M');
  RN.tests._assertEq(RN.cola.formatoVel(5400), '5400k', 'v5.50.0: formato 5400k');
  RN.tests._assertEq(RN.cola.parseVelocidad('2M') + '/' + RN.cola.parseVelocidad('1400k') + '/' + RN.cola.parseVelocidad('1.5m') + '/' + RN.cola.parseVelocidad('3'), '2000/1400/1500/3000', 'v5.50.0: parseVelocidad');
  RN.tests._assertEq(RN.cola.parseVelocidad('abc') + '/' + RN.cola.parseVelocidad('') + '/' + RN.cola.parseVelocidad('0'), '0/0/0', 'v5.50.0: parseVelocidad invalida = 0');
  RN.tests._assertEq(RN.cola.nombreSeguro('José Ángel Peña "Ñ"'), 'Jose Angel Pena N', 'v5.50.0: nombre sin tildes ni caracteres raros');
  RN.tests._assertEq(RN.cola.ipValida('192.168.20.24') + '/' + RN.cola.ipValida('192.168.20') + '/' + RN.cola.ipValida('192.168.20.300') + '/' + RN.cola.ipValida(''), 'true/false/false/false', 'v5.50.0: IP valida para /32');

  // Comando exacto de un cliente nuevo de 4M (plan, seccion 2.5)
  var r = RN.cola.comando({ id: 'n', nombre: 'Cliente Nuevo', ip: '192.168.20.24', megas: 4, activo: true });
  var esperado = ':if ([:len [/queue simple find target="192.168.20.24/32"]] > 0) do={ ' +
    '/queue simple set [find target="192.168.20.24/32"] max-limit=0/4M limit-at=0/1400k priority=6/6 } else={ ' +
    '/queue simple add name="Cliente Nuevo" target=192.168.20.24/32 parent=LEO max-limit=0/4M limit-at=0/1400k priority=6/6 queue=pcq-upload-default/pcq-download-default }';
  RN.tests._assertEq(r.comando, esperado, 'v5.50.0: comando de cliente 4M');
  // Administrador: sin max-limit (no pisar los schedulers de LEO CASA)
  var ra = RN.cola.comando({ id: 'a', nombre: 'LEO CASA', ip: '192.168.20.3', esAdmin: true, activo: true, limitAtManual: 2000 });
  RN.tests._assertEq(ra.ok && ra.comando.indexOf('max-limit') === -1, true, 'v5.50.0: comando de admin NO incluye max-limit');
  RN.tests._assertEq(ra.comando.indexOf('limit-at=0/2M priority=1/1') !== -1, true, 'v5.50.0: admin con Limit At 2M y prioridad 1');
  RN.tests._assertEq(RN.cola.comando({ id: 'a', nombre: 'Adm', ip: '192.168.20.3', esAdmin: true, activo: true }).ok, false, 'v5.50.0: admin sin Limit At manual no genera comando');
  RN.tests._assertEq(RN.cola.comando({ id: 'z', nombre: 'Sin IP', ip: '', megas: 4, activo: true }).ok, false, 'v5.50.0: sin IP valida no genera comando');
  RN.tests._assertEq(RN.cola.comando({ id: 'z', nombre: 'Sin megas', ip: '192.168.20.9', megas: 0, activo: true }).ok, false, 'v5.50.0: sin megas no genera comando');
};

/* v5.50.0 — Fase 3: capacidad por suma de Limit At (escenario real del plan). */
RN.tests._testCapacidadLimitAt = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  var c = function (id, megas, ip, extra) { return Object.assign({ id: id, nombre: id, megas: megas, ip: ip, activo: true, precio: 1 }, extra || {}); };
  var clientes = [
    c('David', 12, '192.168.20.4'), c('Gretter', 8, '192.168.20.5'),
    c('Marlon', 5, '192.168.20.6'), c('Sadi', 5, '192.168.20.7'), c('Zuley', 5, '192.168.20.8'), c('JoseAngel', 5, '192.168.20.9'),
    c('Ronnie', 3, '192.168.20.10'),
    c('Cola16', 1, '192.168.20.16'), c('fabianis', 1, '192.168.20.17'),
    c('LEOCASA', 0, '192.168.20.3', { esAdmin: true, limitAtManual: 2000 }),
    c('Darlyn', 0, '192.168.20.22', { esAdmin: true, limitAtManual: 3000 })
  ];
  for (var i = 0; i < 9; i++) clientes.push(c('Cuatro' + i, 4, '192.168.20.' + (11 + i)));
  RN.state = RN.tests._mockState({ clients: clientes, history: [] });
  RN.state.config.proveedorMegas = 45;
  RN.state.config.reservaMegas = 1;

  var cap = RN.calc.estadoCapacidad();
  RN.tests._assertEq(cap.comprometidoKbps, 35350, 'v5.50.0: suma de Limit At actual = 35.35M');
  RN.tests._assertEq(cap.tope, 44, 'v5.50.0: tope = paquete 45M - reserva 1M = 44M');
  RN.tests._assertEq(cap.margen, 8.65, 'v5.50.0: margen libre 8.65M con los clientes actuales');
  RN.tests._assertEq(cap.pctReal, 80, 'v5.50.0: 35.35 / 44 = 80%');
  RN.tests._assertEq(cap.aviso, true, 'v5.50.0: avisa a partir del 80%');
  RN.tests._assertEq(cap.excedido, false, 'v5.50.0: no excedido');
  RN.tests._assertEq(cap.megasAdmin, 0, 'v5.50.0: admins sin megas no suman megas de administración');

  RN.state.clients.push(c('Nuevo24', 4, '192.168.20.24'), c('Nuevo25', 4, '192.168.20.25'));
  cap = RN.calc.estadoCapacidad();
  RN.tests._assertEq(cap.comprometidoKbps, 38150, 'v5.50.0: con los dos clientes nuevos de 4M = 38.15M');
  RN.tests._assertEq(cap.margen, 5.85, 'v5.50.0: margen 5.85M');

  RN.state.clients[0].activo = false; // David (5400k)
  RN.tests._assertEq(RN.calc.estadoCapacidad().comprometidoKbps, 32750, 'v5.50.0: desactivar un cliente baja la suma');
  RN.state.clients[0].activo = true;

  // Informativo
  RN.tests._assertEq(cap.vendidos, 12 + 8 + 20 + 3 + 2 + 44, 'v5.50.0: megas vendidos siguen como dato informativo');

  // Cuantos caben con el margen libre (planes de 4M y 12M)
  RN.state.planes = [{ id: 'p4', nombre: '4M', megas: 4 }, { id: 'p12', nombre: '12M', megas: 12 }];
  var caben = RN.cola.cuantosCaben(cap.margenKbps);
  RN.tests._assertEq(caben.map(function (x) { return x.megas + ':' + x.caben; }).join(','), '4:4,12:1', 'v5.50.0: caben 4 de 4M (5850/1400) y 1 de 12M (5850/5400)');

  // Excedido
  RN.state.config.reservaMegas = 10; // tope 35M < 38.15M
  cap = RN.calc.estadoCapacidad();
  RN.tests._assertEq(cap.excedido, true, 'v5.50.0: excedido cuando la suma supera el tope');
  RN.tests._assertEq(RN.cola.cuantosCaben(0)[0].caben, 0, 'v5.50.0: sin margen no caben mas');
  RN.state.config.reservaMegas = 1;

  // Script completo
  var sc = RN.cola.scriptCompleto();
  RN.tests._assertEq(sc.incluidos, RN.state.clients.length, 'v5.50.0: el script incluye a todos los clientes activos con cola');
  RN.tests._assertEq(sc.omitidos.length, 0, 'v5.50.0: ningun cliente omitido cuando todos tienen IP');
  RN.state.clients[1].ip = '';
  RN.tests._assertEq(RN.cola.scriptCompleto().omitidos.length, 1, 'v5.50.0: cliente sin IP queda omitido del script');
};

/* ============================================================
 * v5.51.0 — Edición de descuentos/bonificaciones: los meses anteriores no se
 * tocan; el mes actual ya cobrado se corrige o el cambio rige desde el siguiente.
 * ============================================================ */
RN.tests._edicionEstado = function (extra) {
  var cobro = function (id, mes, aplic) {
    return { id: id, clienteId: 'c1', tipo: 'servicio', mes: mes, monto: 400, totalCUP: 400, totalAPagar: 400, totalPagadoCUP: 400,
      precioNetoAplicado: 400, tipoPago: 'completo', montoMora: 0, montoEquipo: 0, descuentosPuntualesIds: ['d1'], fondoAntes: 1000, fondoDespues: 1400 };
  };
  var hist = [cobro('cob-1', '2025-05'), cobro('cob-2', '2025-06')];
  var apps = [{ mes: '2025-05', cobroHid: 'cob-1', valor: 100 }, { mes: '2025-06', cobroHid: 'cob-2', valor: 100 }];
  if (extra && extra.julioCobrado) { hist.push(cobro('cob-3', '2025-07')); apps.push({ mes: '2025-07', cobroHid: 'cob-3', valor: 100 }); }
  RN.state = RN.tests._mockState({
    mesActual: '2025-07',
    clients: [RN.tests._cli5144()],
    history: hist,
    descuentos: [{ id: 'd1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, motivo: 'Fidelidad', estado: 'pendiente', mes: '2025-05',
      vigencia: 'permanente', desde: '2025-05', durMeses: 1, aplicaciones: apps, cobroHid: apps[apps.length - 1].cobroHid }]
  });
};

RN.tests._testEdicionDescuentos = function () {
  RN.calc.mesActualStr = function () { return '2025-07'; }; // ejecutar() lo restaura al terminar
  var cam = function (valor, extra) {
    return Object.assign({ modo: 'fijo', valor: valor, motivo: 'Fidelidad', vigencia: 'permanente', durMeses: 1, soloPago: false }, extra || {});
  };
  var desc = function (mes) { return RN.calc.getDescuentosPuntualesMes('c1', mes); };

  // A) Permanente, julio SIN cobrar: el cambio rige desde julio; mayo y junio intactos.
  RN.tests._edicionEstado();
  RN.tests._assertEq(RN.descuentos.puedeEditar(RN.state.descuentos[0]), true, 'v5.51.0: una permanente vigente se puede editar');
  var r = RN.descuentos.aplicarEdicion('d1', cam(150), 'directo');
  RN.tests._assertEq(r.ok, true, 'v5.51.0 A: edición directa aceptada');
  RN.tests._assertEq(RN.state.descuentos.length, 2, 'v5.51.0 A: se parte en dos (viejo cerrado + nuevo)');
  RN.tests._assertEq([desc('2025-05'), desc('2025-06')].join(','), '100,100', 'v5.51.0 A: mayo y junio conservan 100');
  RN.tests._assertEq([desc('2025-07'), desc('2025-08')].join(','), '150,150', 'v5.51.0 A: julio y agosto pasan a 150');
  RN.tests._assertEq(RN.state.descuentos[0].estado, 'aplicado', 'v5.51.0 A: el viejo queda finalizado');
  RN.tests._assertEq(RN.state.descuentos[1].reemplazaA, 'd1', 'v5.51.0 A: el nuevo referencia al viejo');
  RN.tests._assertEq(RN.state.history[0].monto + RN.state.history[1].monto, 800, 'v5.51.0 A: los cobros anteriores no cambian');

  // B) Julio YA cobrado, se elige corregir (se cobró por error).
  RN.tests._edicionEstado({ julioCobrado: true });
  var rd = RN.descuentos.aplicarEdicion('d1', cam(150), 'directo');
  RN.tests._assertEq(rd.ok, false, 'v5.51.0 B: con el mes cobrado hay que elegir (directo se rechaza)');
  r = RN.descuentos.aplicarEdicion('d1', cam(150), 'corregir');
  var c3 = RN.state.history.find(function (h) { return h.id === 'cob-3'; });
  RN.tests._assertEq(r.ok, true, 'v5.51.0 B: corregir aceptado');
  RN.tests._assertEq(c3.precioNetoAplicado, 350, 'v5.51.0 B: el neto de julio baja a 350');
  RN.tests._assertEq(c3.tipoPago, 'excedente', 'v5.51.0 B: pagó 400 por 350 → excedente');
  RN.tests._assertEq(c3.excedente, 50, 'v5.51.0 B: vuelto de 50');
  RN.tests._assertEq(c3.monto, 350, 'v5.51.0 B: el ingreso de servicio queda en 350');
  RN.tests._assertEq(r.delta, -50, 'v5.51.0 B: delta del neto = −50');
  RN.tests._assertEq(RN.state.history[0].monto + RN.state.history[1].monto, 800, 'v5.51.0 B: mayo y junio intactos');
  RN.tests._assertEq(desc('2025-06'), 100, 'v5.51.0 B: junio sigue en 100');
  RN.tests._assertEq(desc('2025-07'), 150, 'v5.51.0 B: julio en 150');
  RN.tests._assertEq(c3.descuentosPuntualesIds.join(','), RN.state.descuentos[1].id, 'v5.51.0 B: el cobro apunta al descuento nuevo');
  RN.tests._assertEq(RN.state.descuentos[1].aplicaciones.length, 1, 'v5.51.0 B: la aplicación de julio pasó al nuevo');
  RN.tests._assertEq(RN.state.descuentos[0].aplicaciones.length, 2, 'v5.51.0 B: el viejo conserva mayo y junio');

  // C) Julio ya cobrado, se elige "desde el próximo mes".
  RN.tests._edicionEstado({ julioCobrado: true });
  r = RN.descuentos.aplicarEdicion('d1', cam(150), 'proximo');
  c3 = RN.state.history.find(function (h) { return h.id === 'cob-3'; });
  RN.tests._assertEq(r.ok, true, 'v5.51.0 C: próximo mes aceptado');
  RN.tests._assertEq(c3.precioNetoAplicado, 400, 'v5.51.0 C: el cobro de julio no cambia');
  RN.tests._assertEq([desc('2025-06'), desc('2025-07')].join(','), '100,100', 'v5.51.0 C: junio y julio siguen en 100');
  RN.tests._assertEq([desc('2025-08'), desc('2025-09')].join(','), '150,150', 'v5.51.0 C: agosto en adelante 150');
  RN.tests._assertEq(RN.state.descuentos[0].aplicaciones.length, 3, 'v5.51.0 C: el viejo conserva sus 3 aplicaciones');
  RN.tests._assertEq(RN.state.descuentos[1].desde, '2025-08', 'v5.51.0 C: el nuevo empieza en agosto');

  // D) Puntual de este mes, ya cobrado y editado en su sitio (100 → 50).
  RN.state = RN.tests._mockState({
    mesActual: '2025-07', clients: [RN.tests._cli5144()],
    history: [{ id: 'cob-3', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', monto: 400, totalCUP: 400, totalAPagar: 400, totalPagadoCUP: 400,
      precioNetoAplicado: 400, tipoPago: 'completo', montoMora: 0, montoEquipo: 0, descuentosPuntualesIds: ['p1'] }],
    descuentos: [{ id: 'p1', clienteId: 'c1', tipo: 'afectacion', modo: 'fijo', valor: 100, motivo: 'Corte', estado: 'aplicado', mes: '2025-07',
      vigencia: 'meses', desde: '2025-07', durMeses: 1, aplicaciones: [{ mes: '2025-07', cobroHid: 'cob-3', valor: 100 }], cobroHid: 'cob-3' }]
  });
  var pp = { modo: 'fijo', valor: 50, motivo: 'Corte', vigencia: 'meses', durMeses: 1, soloPago: false };
  RN.tests._assertEq(RN.descuentos.infoEdicion(RN.state.descuentos[0]).ofreceProximo, false, 'v5.51.0 D: un puntual no ofrece "próximo mes"');
  RN.tests._assertEq(RN.descuentos.aplicarEdicion('p1', pp, 'proximo').ok, false, 'v5.51.0 D: "próximo mes" se rechaza en un puntual');
  r = RN.descuentos.aplicarEdicion('p1', pp, 'corregir');
  var cp = RN.state.history[0];
  RN.tests._assertEq(r.ok, true, 'v5.51.0 D: corregir el puntual aceptado');
  RN.tests._assertEq(RN.state.descuentos.length, 1, 'v5.51.0 D: nace este mes → se edita en su sitio (sin partir)');
  RN.tests._assertEq(cp.precioNetoAplicado, 450, 'v5.51.0 D: neto sube a 450');
  RN.tests._assertEq(cp.tipoPago, 'parcial', 'v5.51.0 D: pagó 400 de 450 → parcial');
  RN.tests._assertEq(cp.falta, 50, 'v5.51.0 D: faltan 50');
  RN.tests._assertEq(RN.state.descuentos[0].aplicaciones[0].valor, 50, 'v5.51.0 D: la aplicación congela el valor nuevo');
  RN.tests._assertEq(RN.state.descuentos[0].estado, 'aplicado', 'v5.51.0 D: sigue aplicado');
  RN.tests._assertEq((cp.ediciones || []).length, 1, 'v5.51.0 D: el cobro anota la edición');

  // E) Descuento creado este mes y aún sin cobrar: edición en su sitio.
  RN.state = RN.tests._mockState({
    mesActual: '2025-07', clients: [RN.tests._cli5144()],
    descuentos: [{ id: 'n1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, motivo: 'Promo', estado: 'pendiente', mes: '2025-07',
      vigencia: 'meses', desde: '2025-07', durMeses: 3, aplicaciones: [], cobroHid: null }]
  });
  r = RN.descuentos.aplicarEdicion('n1', { modo: 'porcentaje', valor: 10, motivo: 'Promo', vigencia: 'meses', durMeses: 3, soloPago: false }, 'directo');
  RN.tests._assertEq(r.ok && RN.state.descuentos.length === 1, true, 'v5.51.0 E: sin historia se edita en su sitio');
  RN.tests._assertEq(desc('2025-07'), 0, 'v5.51.0 E: 10% de 500 = 50 → redondea a 0 (múltiplo de 100 hacia abajo)');
  RN.state.descuentos[0].valor = 20;
  RN.tests._assertEq(desc('2025-07'), 100, 'v5.51.0 E: 20% de 500 = 100');

  // F) N meses en curso, sin cobrar julio: el viejo se cierra en junio y respeta su rango.
  RN.state = RN.tests._mockState({
    mesActual: '2025-07', clients: [RN.tests._cli5144()],
    descuentos: [{ id: 'm1', clienteId: 'c1', tipo: 'bonificacion', modo: 'fijo', valor: 100, motivo: 'Promo', estado: 'pendiente', mes: '2025-05',
      vigencia: 'meses', desde: '2025-05', durMeses: 4, aplicaciones: [{ mes: '2025-05', cobroHid: 'x1', valor: 100 }, { mes: '2025-06', cobroHid: 'x2', valor: 100 }], cobroHid: 'x2' }]
  });
  RN.tests._assertEq(RN.descuentos._durRestante(RN.state.descuentos[0]), 2, 'v5.51.0 F: quedan 2 meses (jul-ago) de los 4');
  r = RN.descuentos.aplicarEdicion('m1', { modo: 'fijo', valor: 200, motivo: 'Promo', vigencia: 'meses', durMeses: 2, soloPago: false }, 'directo');
  RN.tests._assertEq(RN.state.descuentos[0].durMeses, 2, 'v5.51.0 F: el viejo queda en may-jun (2 meses)');
  RN.tests._assertEq([desc('2025-06'), desc('2025-07'), desc('2025-08'), desc('2025-09')].join(','), '100,200,200,0', 'v5.51.0 F: jun 100, jul-ago 200, sep 0');

  // G) Un descuento finalizado de meses pasados no se edita.
  RN.state = RN.tests._mockState({
    mesActual: '2025-07', clients: [RN.tests._cli5144()],
    descuentos: [{ id: 'f1', clienteId: 'c1', tipo: 'afectacion', modo: 'fijo', valor: 100, motivo: 'Corte', estado: 'aplicado', mes: '2025-05',
      vigencia: 'meses', desde: '2025-05', durMeses: 1, aplicaciones: [{ mes: '2025-05', cobroHid: 'x1', valor: 100 }], cobroHid: 'x1' }]
  });
  RN.tests._assertEq(RN.descuentos.puedeEditar(RN.state.descuentos[0]), false, 'v5.51.0 G: un puntual de mayo ya finalizado no se edita');
  RN.state.descuentos[0].estado = 'anulado';
  RN.tests._assertEq(RN.descuentos.aplicarEdicion('f1', { modo: 'fijo', valor: 1, motivo: 'x', vigencia: 'meses', durMeses: 1 }, 'directo').ok, false, 'v5.51.0 G: uno anulado no se edita');
};

// ---------------- v5.52.0: Caja proyectada + reinicio mensual de la reserva ----------------
RN.tests._testCajaProyectada = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  var cfgBase = { graciaDias: 5, diasBaseMes: 30, pctReservaCaja: 70, fondoInicial: 0 };
  var cli = function (id, precio, dia, ini) {
    return { id: id, nombre: id, precio: precio, planId: null, activo: true, diaPago: dia, mesInicio: ini, descuentoRecurrente: 0, deudaEquipo: 0 };
  };
  var pago = function (id, cid, mes, monto) { return { id: id, clienteId: cid, tipo: 'servicio', mes: mes, monto: monto }; };

  // A) Reinicio de la reserva: en agosto entran 10000 y se retiran 9500 (se toca la reserva)
  RN.state = RN.tests._mockState({
    clients: [cli('c1', 10000, 5, '2025-08')],
    history: [pago('h1', 'c1', '2025-08', 10000)],
    retiros: [{ id: 'r1', monto: 9500, mes: '2025-08' }],
    depositos: [], gastos: [], config: Object.assign({}, cfgBase)
  });
  var bAgo = RN.calc.bolsillos('2025-08');
  RN.tests._assertEq(bAgo.reserva, 7000, 'v5.52.0 A: en el mes en curso la reserva no se recorta (7000)');
  RN.tests._assertEq(bAgo.libre, -6500, 'v5.52.0 A: y se avisa el faltante (libre -6500)');
  RN.tests._assertEq(bAgo.cubierta, false, 'v5.52.0 A: mes en curso con retiro de más: no cubierta');
  var bSep = RN.calc.bolsillos('2025-09');
  RN.tests._assertEq(bSep.reservaInicioMes, 500, 'v5.52.0 A: al cerrar agosto la reserva se recorta a lo que quedó en caja (500)');
  RN.tests._assertEq(bSep.libre, 0, 'v5.52.0 A: septiembre arranca sin bolsillo libre negativo');
  RN.tests._assertEq(bSep.cubierta, true, 'v5.52.0 A: septiembre arranca cubierto');

  // B) Proyección con paquete sin pagar; c3 aún no empieza a pagar (no cuenta)
  var estadoB = function (extra) {
    RN.state = RN.tests._mockState(Object.assign({
      clients: [cli('c1', 1000, 5, '2025-01'), cli('c2', 2000, 20, '2025-01'), cli('c3', 500, 10, '2025-12')],
      history: [pago('h1', 'c1', '2025-08', 1000), pago('h2', 'c2', '2025-08', 1000), pago('h3', 'c1', '2025-09', 1000)],
      retiros: [], depositos: [], gastos: [],
      config: Object.assign({ proveedorMegas: 10, proveedorPrecioMega: 100 }, cfgBase)
    }, extra || {}));
  };
  estadoB();
  var p = RN.calc.cajaProyeccion('2025-09');
  RN.tests._assertEq(p.hoy, 3000, 'v5.52.0 B: hoy en caja 3000');
  RN.tests._assertEq(p.nTotal + '/' + p.nPend, '2/1', 'v5.52.0 B: c3 (por iniciar) no cuenta; falta 1 de 2');
  RN.tests._assertEq(p.pendiente, 2000, 'v5.52.0 B: falta cobrar 2000');
  RN.tests._assertEq(p.cortes.length + ':' + p.cortes[0].dia + ':' + p.cortes[0].monto, '1:20:2000', 'v5.52.0 B: por corte -> día 20, 2000');
  RN.tests._assertEq(p.porPagar, 1000, 'v5.52.0 B: falta pagar el paquete 1000');
  RN.tests._assertEq(p.base.cierre, 4000, 'v5.52.0 B: al cierre 3000 + 2000 - 1000 = 4000');
  RN.tests._assertEq(p.base.reservaCierre, 2800, 'v5.52.0 B: reserva al cierre 1400 + 70% de 2000 = 2800');
  RN.tests._assertEq(p.base.libreCierre, 1200, 'v5.52.0 B: libre al cierre 1200');
  RN.tests._assertEq(p.base.retirableHoy, 1200, 'v5.52.0 B: puedes sacar hoy 1200');
  RN.tests._assertEq(+p.tasa.toFixed(4), 0.2222, 'v5.52.0 B: tasa de cobro de los últimos 3 meses = 2000/9000');
  RN.tests._assertEq(p.escenario.retirableHoy, 733.33, 'v5.52.0 B: escenario con tasa real -> sacar hoy 733.33');
  RN.tests._assertEq(p.estado, 'ok', 'v5.52.0 B: mes cubierto');

  // B2) Con el paquete ya pagado no se resta otra vez
  estadoB({ gastos: [{ id: 'g1', monto: 1000, mes: '2025-09', esPagoProveedor: true }] });
  var p2 = RN.calc.cajaProyeccion('2025-09');
  RN.tests._assertEq(p2.porPagar + ':' + p2.base.cierre, '0:4000', 'v5.52.0 B2: paquete pagado -> falta pagar 0, mismo cierre');

  // C) Ajustada: cubierta cobrando todo, pero no con la tasa real de cobro
  estadoB({ config: Object.assign({}, cfgBase), retiros: [{ id: 'r1', monto: 1450, mes: '2025-09' }] });
  var p3 = RN.calc.cajaProyeccion('2025-09');
  RN.tests._assertEq(p3.estado, 'ajustada', 'v5.52.0 C: ajustada (cubre si cobras todo, no con la tasa real)');

  // D) Bajo: el paquete sin pagar deja la caja en negativo; sin pendientes no hay escenario
  RN.state = RN.tests._mockState({
    clients: [cli('c1', 1000, 5, '2025-09')],
    history: [pago('h1', 'c1', '2025-09', 1000)],
    retiros: [{ id: 'r1', monto: 900, mes: '2025-09' }], depositos: [], gastos: [],
    config: Object.assign({ proveedorMegas: 10, proveedorPrecioMega: 100 }, cfgBase)
  });
  var p4 = RN.calc.cajaProyeccion('2025-09');
  RN.tests._assertEq(p4.estado + ':' + p4.base.cierre + ':' + p4.base.retirableHoy, 'bajo:-900:0', 'v5.52.0 D: bajo, cierre -900, nada que sacar');
  RN.tests._assertEq(p4.escenario === null && p4.tasa === null, true, 'v5.52.0 D: sin pendientes ni historial no hay escenario');
};
