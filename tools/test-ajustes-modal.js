#!/usr/bin/env node
/**
 * tools/test-ajustes-modal.js — Prueba (jsdom) de Ajustes como modal (v5.52.0).
 * Uso:  npm i --no-save jsdom && node tools/test-ajustes-modal.js
 * Si jsdom no está instalado, se omite (sale con código 0).
 */
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('jsdom no instalado: prueba omitida (npm i --no-save jsdom).');
  process.exit(0);
}
const WWW = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window; const doc = w.document;
w.scrollTo = () => {};
let ok = 0, mal = 0;
const chk = (c, m) => { if (c) ok++; else { mal++; console.log('  ✗ ' + m); } };

// 1) Estructura: ya no hay pestaña ni vista Ajustes; sí hay modal con todos sus campos
chk(!doc.querySelector('.subtab[data-view="ajustes"]'), 'no debe quedar la pestaña Ajustes');
chk(!doc.getElementById('view-ajustes'), 'no debe quedar la vista view-ajustes');
const ov = doc.getElementById('ajustes-overlay');
chk(!!ov, 'debe existir #ajustes-overlay');
['cfg-tasa-usd', 'cfg-dias-base', 'cfg-gracia-dias', 'cfg-pct-reserva-caja', 'cfg-redondeo-mixto', 'drive-estado',
 'archivo-status', 'autobackup-status', 'tasa-indicator', 'update-status', 'apk-status', 'card-apk', 'cfg-auto-updates']
  .forEach(id => chk(doc.querySelectorAll('#' + id).length === 1 && ov.contains(doc.getElementById(id)), id + ' debe estar una sola vez dentro del modal'));
const idx = doc.getElementById('modal-overlay');
chk(ov.compareDocumentPosition(idx) & 4, '#ajustes-overlay debe ir antes que #modal-overlay (los modales hijos quedan encima)');

// 2) Comportamiento
let rellenos = 0;
w.eval('var RN = { render: { vista: function () {} }, config: { rellenarForm: function () { window.__rell = (window.__rell || 0) + 1; } } };');
w.eval(fs.readFileSync(path.join(WWW, 'js/ui/ajustes-modal.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(WWW, 'js/ui/tabs.js'), 'utf8'));
chk(w.eval('RN.ajustes.estaAbierto()') === false, 'arranca cerrado');
w.eval('RN.ajustes.abrir()');
chk(ov.classList.contains('open') && ov.getAttribute('aria-hidden') === 'false', 'abrir() lo muestra');
chk(w.__rell === 1, 'abrir() refresca el formulario');
w.eval('RN.ajustes.cerrar()');
chk(!ov.classList.contains('open') && ov.getAttribute('aria-hidden') === 'true', 'cerrar() lo oculta');
const esc = () => doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
w.eval('RN.ajustes.abrir()'); esc();
chk(!ov.classList.contains('open'), 'Esc lo cierra');
w.eval('RN.ajustes.abrir()'); idx.classList.add('open'); esc();
chk(ov.classList.contains('open'), 'Esc no lo cierra si hay otro modal encima');
idx.classList.remove('open');
ov.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
chk(!ov.classList.contains('open'), 'tocar fuera lo cierra');
w.eval('RN.ajustes.abrir()');
ov.querySelector('.modal-body').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
chk(ov.classList.contains('open'), 'tocar dentro no lo cierra');
w.eval('RN.ajustes.cerrar()');
w.eval("RN.tabs.ir('ajustes')");
chk(ov.classList.contains('open') && w.eval('RN.tabs.actual') === 'dashboard', "RN.tabs.ir('ajustes') abre el modal sin cambiar de vista");

// 3) Acciones rápidas trae el botón
const init = fs.readFileSync(path.join(WWW, 'js/init.js'), 'utf8');
chk(/menuRapido[\s\S]*?RN\.ajustes\.abrir\(\)[\s\S]*?Acciones|Acciones rápidas[\s\S]*?RN\.ajustes\.abrir\(\)/.test(init), 'Acciones rápidas incluye el botón ⚙️ Ajustes');
console.log('Ajustes como modal: ' + ok + '/' + (ok + mal) + ' OK');
process.exit(mal ? 1 : 0);
