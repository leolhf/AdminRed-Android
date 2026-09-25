/**
 * tools/test-cuadre-monedas.js — Verificación del cuadre de caja POR MONEDA (v5.31.0).
 *
 *     node tools/test-cuadre-monedas.js
 *
 * Carga los módulos REALES de la app (calculations.js, moneda.js, cuadre.js) en un
 * contexto aislado con un DOM mínimo, y ejecuta el flujo COMPLETO del modal
 * (RN.cuadre.abrir() → escribir lo contado → RN.cuadre.guardar()), es decir el mismo
 * camino que se pulsa en la app, para comprobar que:
 *   - un faltante de pesos y un faltante de dólares se registran por separado;
 *   - la gaveta de USD (usdEnCaja) y la de CUP (cupEnCaja) quedan CUADRADAS después
 *     de registrar (volver a contar da diferencia cero);
 *   - se puede cuadrar una sola moneda dejando la otra vacía;
 *   - no se registra un descuadre en dólares sin tasa configurada;
 *   - los cuadres antiguos (en CUP, sin campo cuadreMoneda) siguen igual que antes.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');

// --- DOM mínimo: solo los campos del modal de cuadre ---
const els = {};
function mkEl(valor) {
  return {
    value: valor === undefined ? '' : valor,
    innerHTML: '', textContent: '',
    style: {}, dataset: {}, disabled: false,
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    querySelectorAll() { return []; }
  };
}
const toasts = [];
const todos = [];

const ctx = {};
ctx.console = console;
ctx.document = { getElementById(id) { return els[id] || null; }, querySelectorAll() { return []; } };
ctx.RN = {
  state: {
    config: { tasaUsd: 120, fondoInicial: 98000, pctReservaCaja: 70, graciaDias: 5, diasBaseMes: 30 },
    history: [], gastos: [], depositos: [], retiros: [],
    clients: [], planes: [], investments: [], descuentos: [], mesActual: '2026-09'
  },
  notifyUI: { toast(m, t) { toasts.push((t || 'info') + ': ' + m); } },
  config: { persistir() {} },
  storageLocal: { guardar() {} },
  render: { todo() { todos.push(Date.now()); } },
  uiComponents: { modal() {}, cerrarModal() {}, confirm() {} }
};
vm.createContext(ctx);
['js/core/calculations.js', 'js/core/moneda.js', 'js/cobros/cuadre.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(WWW, f), 'utf8'), ctx, { filename: f });
});

const RN = ctx.RN;
let pasaron = 0, fallaron = 0;
function ok(cond, msg, detalle) {
  if (cond) { pasaron++; console.log('  \u2713 ' + msg); }
  else { fallaron++; console.log('  \u2717 ' + msg + (detalle ? '  \u2192 ' + detalle : '')); }
}
function eq(actual, esperado, msg) {
  ok(Math.abs(actual - esperado) < 0.011, msg, 'esperado ' + esperado + ', obtenido ' + actual);
}

/** Prepara los campos del modal con lo contado (null = campo vacío ⇒ moneda no contada). */
function setCampos(contadoCUP, contadoUSD, fecha) {
  els['cuadre-real-cup'] = mkEl(contadoCUP === null ? '' : contadoCUP);
  els['cuadre-real-usd'] = mkEl(contadoUSD === null ? '' : contadoUSD);
  els['cuadre-nota'] = mkEl('');
  els['cuadre-fecha'] = mkEl(fecha || '2026-09-25');
  els['cuadre-resultado'] = mkEl('');
  els['cuadre-btn-guardar'] = mkEl('');
}

/**
 * Ciclo real del modal: abrir (fija el snapshot de saldos calculados) → recalcular
 * → guardar. Devuelve los movimientos que guardar() añadió a RN.state.gastos.
 */
function cuadrar(contadoCUP, contadoUSD, fecha) {
  setCampos(contadoCUP, contadoUSD, fecha);
  const antes = RN.state.gastos.length;
  RN.cuadre.abrir();
  RN.cuadre._recalcular();
  const snapshot = RN.cuadre._snapshot;
  const btnDisabled = els['cuadre-btn-guardar'].disabled;
  RN.cuadre.guardar();
  return {
    snapshot, btnDisabled,
    movimientos: RN.state.gastos.slice(antes),
    btn: els['cuadre-btn-guardar'],
    resultadoHTML: els['cuadre-resultado'].innerHTML
  };
}

console.log('\n=== 1. Escenario de la captura: fondo 98.000 CUP y 20 USD en la gaveta ===');
RN.state.history.push({ mes: '2026-09', monto: 0, montoEquipo: 0, montoPagadoUSD: 20, tipo: 'servicio' });
eq(RN.calc.fondoCaja(), 98000, 'El fondo total es 98.000 CUP (saldo inicial + ingresos)');
eq(RN.calc.usdEnCaja(), 20, 'La app calcula 20 USD físicos en la gaveta');
eq(RN.calc.cupEnCaja(), 95600, 'La app calcula 95.600 CUP físicos (98.000 \u2212 20\u00d7120)');
const s0 = RN.calc.saldosMoneda();
ok(s0.usd === 20 && s0.cup === 95600 && s0.totalCUP === 98000, 'saldosMoneda separa las dos monedas', JSON.stringify(s0));

console.log('\n=== 2. Faltante SIMULTÁNEO: 95.000 CUP contados y 15 USD contados ===');
const r1 = cuadrar(95000, 15);
eq(r1.snapshot.cup, 95600, 'El modal compara el CUP contra el CUP físico calculado (95.600)');
eq(r1.snapshot.usd, 20, 'El modal compara el USD contra el USD físico calculado (20)');
ok(r1.movimientos.length === 2, 'guardar() registra 2 movimientos (uno por moneda)', 'n=' + r1.movimientos.length);
const mCUP = r1.movimientos.find(m => m.cuadreMoneda === 'CUP');
const mUSD = r1.movimientos.find(m => m.cuadreMoneda === 'USD');
ok(!!mCUP && mCUP.tipoCuadre === 'faltante' && mCUP.monto === 600, 'El movimiento de CUP registra un faltante de 600 CUP', JSON.stringify(mCUP && mCUP.monto));
ok(!!mUSD && mUSD.tipoCuadre === 'faltante' && mUSD.monto === 600 && mUSD.montoCuadreUSD === 5,
   'El movimiento de USD registra 5 USD faltantes (equivalente 600 CUP)', JSON.stringify(mUSD && { monto: mUSD.monto, usd: mUSD.montoCuadreUSD }));
ok(!!mCUP && mCUP.categoria === 'Descuadre de caja' && mCUP.esCuadreCaja === true, 'Se mantiene la categoría dedicada "Descuadre de caja"');
ok(r1.resultadoHTML.indexOf('CUP (pesos)') !== -1 && r1.resultadoHTML.indexOf('USD (d\u00f3lares)') !== -1,
   'El resultado en vivo muestra una línea por moneda');
eq(RN.calc.fondoCaja(), 98000 - 600 - 600, 'El fondo baja por el equivalente de las dos monedas (96.800)');
eq(RN.calc.usdEnCaja(), 15, 'La gaveta de USD baja a 15 (el faltante en dólares SÍ mueve el USD)');
eq(RN.calc.cupEnCaja(), 95000, 'La gaveta de CUP baja a 95.000');
const d1 = RN.calc.descuadresPorMoneda();
ok(d1.cup === 600 && d1.usd === 5 && d1.usdEnCUP === 600 && d1.totalCUP === 1200 && d1.cantidad === 2,
   'descuadresPorMoneda separa CUP (600) y USD (5 = 600 CUP)', JSON.stringify(d1));

console.log('\n=== 3. Volver a contar deja TODO en cero (el cuadre quedó bien) ===');
const r2 = cuadrar(RN.calc.cupEnCaja(), RN.calc.usdEnCaja());
ok(r2.movimientos.length === 0, 'Contando exactamente lo calculado no se registra nada');
ok(r2.resultadoHTML.indexOf('Todo cuadra') !== -1, 'El modal dice que todo cuadra');
eq(RN.calc.usdEnCaja(), 15, 'La gaveta de USD sigue en 15');
eq(RN.calc.cupEnCaja(), 95000, 'La gaveta de CUP sigue en 95.000');

console.log('\n=== 4. Sobrante solo en CUP (se deja USD vacío) ===');
const r3 = cuadrar(RN.calc.cupEnCaja() + 250, null);
ok(r3.movimientos.length === 1 && r3.movimientos[0].cuadreMoneda === 'CUP', 'Solo se registra el movimiento de la moneda contada');
ok(r3.movimientos[0].tipoCuadre === 'sobrante' && r3.movimientos[0].monto === -250, 'El sobrante se guarda con monto NEGATIVO (250)', JSON.stringify(r3.movimientos[0].monto));
eq(RN.calc.cupEnCaja(), 95250, 'La gaveta de CUP sube a 95.250');
eq(RN.calc.usdEnCaja(), 15, 'La gaveta de USD no se toca');
const d2 = RN.calc.descuadresPorMoneda();
ok(d2.cup === 350 && d2.usd === 5, 'El neto en CUP descuenta el sobrante (350) y el neto USD sigue en 5', JSON.stringify(d2));

console.log('\n=== 5. Sobrante en USD (conteo de las dos monedas a la vez) ===');
const r4 = cuadrar(RN.calc.cupEnCaja(), RN.calc.usdEnCaja() + 2);
const mUSD2 = r4.movimientos.find(m => m.cuadreMoneda === 'USD');
ok(!!mUSD2 && mUSD2.tipoCuadre === 'sobrante' && mUSD2.montoCuadreUSD === -2 && mUSD2.monto === -240,
   'Un sobrante de 2 USD se guarda como \u22122 USD (\u2212240 CUP)', JSON.stringify(mUSD2 && { monto: mUSD2.monto, usd: mUSD2.montoCuadreUSD }));
eq(RN.calc.usdEnCaja(), 17, 'La gaveta de USD sube a 17');
eq(RN.calc.cupEnCaja(), 95250, 'La gaveta de CUP no se mueve (95.250)');

console.log('\n=== 6. Descuadre en USD sin tasa configurada ===');
const tasaGuardada = RN.state.config.tasaUsd;
RN.state.config.tasaUsd = 0;
const gastosAntes6 = RN.state.gastos.length;
const r6 = cuadrar(null, 1);
ok(r6.btnDisabled === true, 'El botón queda bloqueado si hay descuadre USD y no hay tasa');
ok(RN.state.gastos.length === gastosAntes6, 'No se registra ningún movimiento sin tasa');
ok(toasts.some(t => t.indexOf('tasa USD') !== -1 && t.indexOf('error') === 0), 'Se avisa al usuario que configure la tasa USD', toasts[toasts.length - 1]);
RN.state.config.tasaUsd = tasaGuardada;

console.log('\n=== 7. Conteo negativo y campos vacíos ===');
const gastosAntes7 = RN.state.gastos.length;
const rNeg = cuadrar(-5, null);
ok(RN.state.gastos.length === gastosAntes7, 'Un saldo contado negativo no registra nada', 'n=' + rNeg.movimientos.length);
ok(toasts.some(t => t.indexOf('no puede ser negativo') !== -1), 'guardar() rechaza un saldo contado negativo', toasts[toasts.length - 1]);
const rVacio = cuadrar(null, null);
ok(rVacio.movimientos.length === 0, 'Sin contar ninguna moneda no hay movimientos que registrar');
eq(RN.calc.cupEnCaja(), 95250, 'El estado sigue intacto tras los intentos rechazados');
eq(RN.calc.usdEnCaja(), 17, 'La gaveta de USD sigue intacta');

console.log('\n=== 8. Compatibilidad con cuadres antiguos (CUP, sin cuadreMoneda) ===');
const usdAntes = RN.calc.usdEnCaja();
const cupAntes = RN.calc.cupEnCaja();
RN.state.gastos.push({
  id: 'cuadre-viejo', concepto: 'Faltante de caja', monto: 300,
  categoria: 'Descuadre de caja', esCuadreCaja: true, tipoCuadre: 'faltante',
  saldoCalculado: 1000, saldoReal: 700, fecha: '2026-08-31T00:00:00', mes: '2026-08'
});
eq(RN.calc.usdEnCaja(), usdAntes, 'Un cuadre antiguo no altera la gaveta de dólares');
eq(RN.calc.cupEnCaja(), cupAntes - 300, 'Un cuadre antiguo sigue bajando el CUP físico como antes (94.950)');
const d3 = RN.calc.descuadresPorMoneda();
ok(d3.cup === 650 && d3.usd === 3, 'Los cuadres antiguos se cuentan como CUP (350 + 300) y el neto USD sigue en 3', JSON.stringify(d3));
ok(RN.cuadre.totalNeto() === d3.totalCUP, 'totalNeto() devuelve el neto equivalente en CUP', 'totalNeto=' + RN.cuadre.totalNeto());

console.log('\n---------------------------------------------');
console.log('  ' + pasaron + ' pruebas OK, ' + fallaron + ' fallidas');
console.log('---------------------------------------------\n');
process.exit(fallaron ? 1 : 0);
