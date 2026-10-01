#!/usr/bin/env node
/**
 * tools/test-tabs-menu.js — Prueba del submenú plegable (ui/tabs.js) con jsdom.
 * Uso:  npm i --no-save jsdom && node tools/test-tabs-menu.js
 * Si jsdom no está instalado, se omite (sale con código 0).
 * Usa el HTML y el CSS reales (www/index.html, www/styles.css) y un reloj falso.
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
const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.scrollTo = () => {};
const doc = w.document;
const st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st);

// Reloj falso controlable
let ahora = 0, nextId = 1; const pend = new Map();
w.setTimeout = (fn, ms) => { const id = nextId++; pend.set(id, { fn, at: ahora + ms }); return id; };
w.clearTimeout = (id) => { pend.delete(id); };
function avanzar(ms) {
  const fin = ahora + ms;
  for (;;) {
    let sig = null;
    pend.forEach((v, k) => { if (v.at <= fin && (!sig || v.at < sig.v.at)) sig = { k, v }; });
    if (!sig) break;
    ahora = sig.v.at; pend.delete(sig.k); sig.v.fn();
  }
  ahora = fin;
}

w.eval('var RN = { render: { vista: function () {} } };');
w.eval(fs.readFileSync(path.join(WWW, 'js/ui/tabs.js'), 'utf8'));
w.eval('RN.tabs.init();');

let ok = 0, mal = 0;
function chk(cond, msg) { if (cond) { ok++; } else { mal++; console.log('  ✗ ' + msg); } }
const tab = (g) => doc.querySelector('.tab-group[data-group="' + g + '"] .tab');
const grupo = (g) => doc.querySelector('.tab-group[data-group="' + g + '"]');
const abierto = () => w.eval('RN.tabs.menuAbierto()');
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const evt = (el, tipo) => el.dispatchEvent(new w.Event(tipo, { bubbles: true }));
const visible = (g) => w.getComputedStyle(grupo(g).querySelector('.subtabs')).visibility;

chk(abierto() === null, 'al iniciar no hay menú abierto');
chk(tab('operacion').getAttribute('aria-expanded') === 'false', 'aria-expanded=false al iniciar');
chk(tab('operacion').getAttribute('role') === 'button', 'los grupos son role=button');
chk(visible('operacion') === 'hidden', 'CSS: submenú oculto por defecto aunque el grupo esté activo');

click(tab('finanzas'));
chk(w.eval('RN.tabs.actual') === 'inversion', 'tocar Finanzas navega a su primera vista');
chk(abierto() === 'finanzas', 'tocar Finanzas abre su menú');
chk(tab('finanzas').getAttribute('aria-expanded') === 'true', 'aria-expanded=true al abrir');
chk(visible('finanzas') === 'visible', 'CSS: submenú visible con .active.abierto');
chk(visible('operacion') === 'hidden', 'CSS: el menú de otro grupo sigue oculto');

avanzar(2999); chk(abierto() === 'finanzas', 'a los 2999 ms sigue abierto');
avanzar(1);    chk(abierto() === null, 'a los 3000 ms se pliega solo');
chk(visible('finanzas') === 'hidden', 'CSS: oculto tras plegarse');

// Reinicio por actividad
click(tab('finanzas')); // mismo grupo, estaba cerrado → abre
chk(abierto() === 'finanzas', 'tocar el grupo activo cerrado lo abre (sin navegar)');
avanzar(2000); evt(grupo('finanzas').querySelector('.subtabs'), 'pointerdown');
avanzar(2999); chk(abierto() === 'finanzas', 'la actividad reinicia los 3 s');
avanzar(1);    chk(abierto() === null, 'tras 3 s sin actividad se pliega');

// Scroll horizontal del submenú también cuenta como actividad
click(tab('finanzas')); avanzar(2500);
evt(grupo('finanzas').querySelector('.subtabs'), 'scroll');
avanzar(2999); chk(abierto() === 'finanzas', 'el scroll del submenú reinicia los 3 s');
avanzar(1);    chk(abierto() === null, 'se pliega tras el último scroll + 3 s');

// Toggle: tocar el grupo abierto lo pliega
click(tab('finanzas')); chk(abierto() === 'finanzas', 'abre');
click(tab('finanzas')); chk(abierto() === null, 'tocar el grupo abierto lo pliega');

// Elegir un subtab navega y mantiene el menú
click(tab('operacion'));
chk(abierto() === 'operacion' && w.eval('RN.tabs.actual') === 'dashboard', 'Operación abre y navega al Panel');
avanzar(2500);
click(doc.querySelector('.subtab[data-view="cobros"]'));
chk(w.eval('RN.tabs.actual') === 'cobros', 'elegir un subtab navega');
avanzar(2999); chk(abierto() === 'operacion', 'elegir un subtab reinicia los 3 s');
avanzar(1);    chk(abierto() === null, 'y luego se pliega');

// Tocar fuera / Esc
click(tab('analisis'));
chk(abierto() === 'analisis', 'Análisis abre');
doc.querySelector('main').dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
chk(abierto() === null, 'tocar fuera de la barra pliega de inmediato');
click(tab('analisis'));
grupo('analisis').querySelector('.subtab').dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
chk(abierto() === 'analisis', 'tocar dentro de la barra no pliega');
doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
chk(abierto() === null, 'Esc pliega');

// Teclado en el grupo
tab('operacion').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
chk(abierto() === 'operacion' || w.eval('RN.tabs.grupoActivo') === 'operacion', 'Enter sobre el grupo lo activa');

// Navegar por código no abre el menú
w.eval('RN.tabs.cerrarMenu()');
w.eval("RN.tabs.ir('reportes')");
chk(abierto() === null, 'RN.tabs.ir() desde código no despliega el menú');
avanzar(10000); chk(pend.size === 0, 'no quedan temporizadores pendientes');

console.log('Submenú plegable: ' + ok + '/' + (ok + mal) + ' OK' + (mal ? ' — ' + mal + ' FALLARON' : ''));
process.exit(mal ? 1 : 0);
