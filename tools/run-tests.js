#!/usr/bin/env node
/**
 * tools/run-tests.js — Ejecuta la suite RN.tests.ejecutar() en Node (sin navegador).
 * Uso:  node tools/run-tests.js        (o: npm test)
 * Sale con código 1 si falla algún test → sirve para CI (GitHub Actions).
 * Carga solo los módulos de cálculo/lógica (sin DOM); ver MODULOS abajo.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const MODULOS = [
  'js/core/keys.js',
  'js/core/calculations.js',
  'js/core/moneda.js',
  'js/core/models/investment.js',
  'js/core/models/inventario.js',
  'js/cobros/descuentos.js',
  'js/tests/tests-calculo.js'
];

const ctx = { console, setTimeout, Date, Math, JSON, Object, Array, Number, String, parseFloat, parseInt };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext('var RN = {};', ctx);

MODULOS.forEach(function (rel) {
  const file = path.join(WWW, rel);
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  } catch (e) {
    console.error('✗ No se pudo cargar ' + rel + ': ' + e.message);
    process.exit(1);
  }
});

// Silenciar el volcado verbose del harness; imprimir solo el resumen y los fallos.
const log = console.log;
ctx.console = { log: function () {}, warn: function () {}, error: log, info: function () {} };
const r = vm.runInContext('RN.tests.ejecutar()', ctx);
const fallos = (r.resultados || []).filter(function (x) { return !x.ok; });
fallos.forEach(function (x) { log('  ✗ ' + x.mensaje); });
log('Tests: ' + r.pasaron + '/' + r.total + ' OK' + (r.fallaron ? ' — ' + r.fallaron + ' FALLARON' : ''));
process.exit(r.fallaron > 0 ? 1 : 0);
