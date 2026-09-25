/**
 * tools/test-caja-monedas.js — Verificación automática de la caja multimoneda.
 *
 * Se ejecuta con Node (no necesita navegador ni base de datos):
 *     node tools/test-caja-monedas.js
 *
 * Carga los módulos REALES de la app (js/core/calculations.js y js/core/moneda.js)
 * dentro de un contexto aislado y comprueba, entre otras cosas, que un depósito
 * MIXTO (USD + CUP) acredite bien las dos monedas — el bug que se corrigió en
 * la v5.30.0 — y que no se puedan retirar billetes que no existen.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');

// --- Contexto mínimo: RN con estado de prueba ---
const ctx = {};
ctx.console = console;
// DOM mínimo: leerBloquePago() lee inputs; sin DOM devuelve ceros.
ctx.document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };
ctx.RN = {
  state: {
    config: { tasaUsd: 120, fondoCaja: 0, fondoInicial: 0, pctReservaCaja: 70, graciaDias: 5, diasBaseMes: 30 },
    history: [],
    gastos: [],
    depositos: [],
    retiros: [],
    clients: [],
    planes: [],
    mesActual: null
  },
  notifyUI: { toast: function () {} },
  config: { persistir: function () {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, 'js/core/calculations.js'), 'utf8'), ctx, { filename: 'calculations.js' });
vm.runInContext(fs.readFileSync(path.join(WWW, 'js/core/moneda.js'), 'utf8'), ctx, { filename: 'moneda.js' });

const RN = ctx.RN;
let pasaron = 0, fallaron = 0;

function ok(cond, msg, detalle) {
  if (cond) { pasaron++; console.log('  \u2713 ' + msg); }
  else { fallaron++; console.log('  \u2717 ' + msg + (detalle ? '  \u2192 ' + detalle : '')); }
}

function eq(actual, esperado, msg) {
  ok(Math.abs(actual - esperado) < 0.011, msg, 'esperado ' + esperado + ', obtenido ' + actual);
}

console.log('\n=== 1. Depósito MIXTO ($20 + 3.000 CUP, tasa 120) ===');
RN.state.depositos.push({
  id: 'd1', concepto: 'Depósito mixto', monto: 2400 + 3000, moneda: 'MIXTO',
  montoOriginal: 20, montoCUPDirecto: 3000, tasaUsada: 120,
  fecha: '2026-09-01T00:00:00', mes: '2026-09'
});
eq(RN.calc.fondoCaja(), 5400, 'El fondo suma el equivalente completo (2.400 + 3.000 = 5.400 CUP)');
const pm = RN.calc.totalDepositosPorMoneda();
eq(pm.usdOriginal, 20, 'totalDepositosPorMoneda cuenta 20 USD físicos');
eq(pm.usdCUP, 2400, 'El equivalente del USD se acredita aparte (2.400 CUP)');
eq(pm.cup, 3000, 'El CUP físico directo son 3.000 (antes el mixto entero caía aquí: 5.400)');
eq(RN.calc.usdEnCaja(), 20, 'usdEnCaja SÍ recibe la parte en dólares del mixto');
eq(RN.calc.cupEnCaja(), 3000, 'cupEnCaja queda en 3.000 (5.400 \u2212 20\u00d7120)');
const d = RN.calc.desgloseMovimiento(RN.state.depositos[0]);
ok(d.moneda === 'MIXTO' && d.usd === 20 && d.cup === 3000, 'desgloseMovimiento devuelve {MIXTO, usd:20, cup:3000}', JSON.stringify(d));

console.log('\n=== 2. Retiro MIXTO ($5 + 1.000 CUP) ===');
RN.state.retiros.push({
  id: 'r1', concepto: 'Retiro mixto', monto: 600 + 1000, moneda: 'MIXTO',
  montoOriginal: 5, montoCUPDirecto: 1000, tasaUsada: 120,
  fecha: '2026-09-02T00:00:00', mes: '2026-09'
});
eq(RN.calc.usdEnCaja(), 15, 'La gaveta de dólares baja a 15 USD');
eq(RN.calc.cupEnCaja(), 2000, 'La gaveta de pesos baja a 2.000 CUP');
eq(RN.calc.fondoCaja(), 5400 - 1600, 'El fondo baja 1.600 CUP (600 + 1.000)');
const pr = RN.calc.totalRetirosPorMoneda();
eq(pr.usdOriginal, 5, 'totalRetirosPorMoneda separa 5 USD');
eq(pr.cup, 1000, 'totalRetirosPorMoneda separa 1.000 CUP');

console.log('\n=== 3. Validación por moneda del retiro ===');
ok(RN.calc.validarMovimientoCaja({ montoUSD: 30, montoCUP: 0 }, 'retiro').ok === false,
   'Bloquea retirar 30 USD teniendo 15');
ok(RN.calc.validarMovimientoCaja({ montoUSD: 10, montoCUP: 0 }, 'retiro').ok === true,
   'Permite retirar 10 USD teniendo 15');
ok(RN.calc.validarMovimientoCaja({ montoUSD: 10, montoCUP: 5000 }, 'retiro').ok === false,
   'Bloquea el MIXTO si la parte en CUP (5.000) excede la gaveta (2.000)');
ok(RN.calc.validarMovimientoCaja({ montoUSD: 10, montoCUP: 500 }, 'retiro').ok === true,
   'Permite el MIXTO $10 + 500 CUP');
ok(RN.calc.validarMovimientoCaja({ montoUSD: -1, montoCUP: 0 }, 'retiro').ok === false,
   'Bloquea montos negativos');
ok(RN.calc.validarMovimientoCaja({ montoUSD: 9999, montoCUP: 9999 }, 'deposito').ok === true,
   'Un depósito nunca se bloquea por moneda');
const s = RN.calc.saldosMoneda();
ok(s.usd === 15 && s.cup === 2000 && s.totalCUP === 3800, 'saldosMoneda devuelve {usd:15, cup:2000, total:3800}', JSON.stringify(s));

console.log('\n=== 4. Compatibilidad con registros antiguos ===');
RN.state.depositos.push({ id: 'd2', concepto: 'Depósito antiguo en USD', monto: 1200, moneda: 'USD', montoOriginal: 10, tasaUsada: 120, fecha: '2026-09-03T00:00:00', mes: '2026-09' });
eq(RN.calc.usdEnCaja(), 25, 'Un USD clásico sigue entrando a la gaveta de dólares');
RN.state.depositos.push({ id: 'd3', concepto: 'Depósito sin campo moneda', monto: 700, fecha: '2026-09-04T00:00:00', mes: '2026-09' });
eq(RN.calc.totalDepositosPorMoneda().cup, 3700, 'Un registro sin `moneda` se interpreta como CUP (3.000 + 700)');
eq(RN.calc.usdEnCaja(), 25, 'No se inventa USD en los registros sin moneda');

console.log('\n=== 5. Detección de MIXTO desde los montos (moneda.js) ===');
ok(RN.moneda.esMixto({ montoUSD: 10, montoCUP: 500 }) === true, 'esMixto() = true con USD y CUP a la vez');
ok(RN.moneda.esMixto({ montoUSD: 10, montoCUP: 0 }) === false, 'esMixto() = false si solo hay dólares (ese es USD puro)');
const leido = RN.moneda.leerBloquePago('inexistente', 0);
ok(leido.montoCUPDirecto === leido.montoCUP, 'leerBloquePago expone montoCUPDirecto (parte física en pesos)');

console.log('\n---------------------------------------------');
console.log('  ' + pasaron + ' pruebas OK, ' + fallaron + ' fallidas');
console.log('---------------------------------------------\n');
process.exit(fallaron ? 1 : 0);
