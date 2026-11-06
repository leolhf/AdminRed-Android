/**
 * tools/test-update-check.js — Verificación de la detección de actualizaciones (v5.31.0).
 *
 *     node tools/test-update-check.js
 *
 * Carga el módulo REAL www/js/update.js en un contexto aislado con localStorage,
 * navigator y fetch simulados, y comprueba los fallos que hacían que el APK
 * "no detectara" las versiones nuevas:
 *
 *   1. La comparación de versiones es NUMÉRICA ("5.9" es anterior a "5.10").
 *   2. Un fallo de red NO se guarda como comprobación válida: se reintenta en
 *      minutos (antes un solo fallo bloqueaba los avisos 6 horas).
 *   3. Si la API de GitHub falla, se usa version.json (y se recuerda la fuente).
 *   4. Se avisa una sola vez por versión y se avisa de nuevo al salir otra.
 *   5. La app genera una banda visible, no solo la notificación del sistema.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');

const store = {};
const toasts = [];
const fetchCalls = [];
let plan = {};

const ctx = {};
ctx.console = console;
ctx.APP_VERSION = '5.31.0';
ctx.navigator = { onLine: true };
ctx.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
// DOM mínimo: la banda de actualización no puede romper nada si no hay DOM real.
ctx.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ id: '', style: {}, innerHTML: '', setAttribute() {}, appendChild() {} }),
  body: null,
  addEventListener() {}
};
ctx.window = { addEventListener() {}, open() {}, localStorage: ctx.localStorage };
ctx.RN = {
  state: { config: { autoCheckUpdates: true } },
  notifyUI: { toast: (m, t) => { toasts.push((t || 'info') + ': ' + m); } },
  uiComponents: { modal() {}, cerrarModal() {} }
};

// fetch simulado: cada clave de `plan` es el prefijo de URL a interceptar.
const API = 'https://api.github.com/repos/leolhf/AdminRed-Android/releases/latest';
const RAW = 'https://raw.githubusercontent.com/leolhf/AdminRed-Android/main/version.json';
ctx.fetch = async function (url) {
  fetchCalls.push(url);
  const key = Object.keys(plan).find((p) => url.indexOf(p) === 0);
  const r = (key && plan[key]) || { status: 404 };
  if (r.throws) { const e = new Error('Network request failed'); e.name = 'TypeError'; throw e; }
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    text: async () => JSON.stringify(r.body === undefined ? {} : r.body)
  };
};

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, 'js', 'update.js'), 'utf8'), ctx, { filename: 'update.js' });
const RN = ctx.RN;

let pasaron = 0, fallaron = 0;
function ok(cond, msg, detalle) {
  if (cond) { pasaron++; console.log('  \u2713 ' + msg); }
  else { fallaron++; console.log('  \u2717 ' + msg + (detalle ? '  \u2192 ' + detalle : '')); }
}
function eq(a, b, msg) { ok(a === b, msg, 'esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a)); }

// Contador de avisos: intercepta _notificar (la banda + notificación real).
let avisos = 0;
const notificarOriginal = RN.update._notificar;
RN.update._notificar = async function (info) { avisos++; return notificarOriginal.call(RN.update, info); };

async function main() {
  console.log('\n=== 1. Comparación de versiones (numérica, no alfabética) ===');
  eq(RN.update._comparar('5.31.0', '5.30.0'), 1, '5.31.0 es más nueva que 5.30.0');
  eq(RN.update._comparar('5.30.0', '5.31.0'), -1, '5.30.0 es más antigua que 5.31.0');
  eq(RN.update._comparar('5.31.0', '5.31.0'), 0, 'la misma versión da 0');
  eq(RN.update._comparar('5.9', '5.10'), -1, '5.9 es ANTERIOR a 5.10 (fallo típico al comparar texto)');
  eq(RN.update._comparar('5.13.10', '5.13.9'), 1, '5.13.10 es más nueva que 5.13.9');
  eq(RN.update._comparar('5.31', '5.31.0'), 0, 'una versión de dos partes equivale a la misma con .0');
  eq(RN.update._limpiar('v5.30.0'), '5.30.0', '_limpiar quita la "v"');
  eq(RN.update._limpiar('AdminRed v5.30.0'), '5.30.0', '_limpiar extrae la versión de un nombre compuesto');

  console.log('\n=== 2. Comprobación correcta: detecta la versión nueva por la API ===');
  plan = {};
  plan[API] = {
    status: 200,
    body: {
      tag_name: 'v5.31.0', name: 'AdminRed v5.31.0',
      html_url: 'https://github.com/leolhf/AdminRed-Android/releases/tag/v5.31.0',
      published_at: '2026-09-25T04:13:46Z',
      assets: [{ name: 'AdminRed_v5.31.0.apk', browser_download_url: 'https://github.com/leolhf/AdminRed-Android/releases/download/v5.31.0/AdminRed_v5.31.0.apk' }]
    }
  };
  plan[RAW] = { status: 200, body: { version: '5.31.0' } };
  ctx.APP_VERSION = '5.30.0';   // la app instalada es la 5.30.0; se publica la 5.31.0
  let avisosAntes = avisos;
  let r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(r.hay, true, 'instalada 5.30.0 vs publicada 5.31.0 → hay actualización');
  eq(r.version, '5.31.0', 'la versión detectada es 5.31.0');
  ok(String(r.fuente).indexOf('api') === 0, 'la fuente usada es la API de GitHub', r.fuente);
  eq(avisos - avisosAntes, 1, 'se lanzó el aviso una vez');
  eq(store['adminred:update-notified'], '5.31.0', 'la versión avisada queda registrada');
  eq(store['adminred:update-latest-version'], '5.31.0', 'se guarda la última versión conocida');
  eq(store['adminred:update-fails'], '0', 'sin fallos acumulados');
  ok(store['adminred:update-last-check'] > 0, 'una comprobación CORRECTA sí arma el intervalo de 6 h');
  ok(RN.update.proximoIntentoMs() > 0 && RN.update.proximoIntentoMs() <= RN.update.INTERVALO_MS,
     'tras un éxito la próxima comprobación automática queda a 6 h como máximo', RN.update.proximoIntentoMs() + ' ms');

  console.log('\n=== 3. No se avisa dos veces de la misma versión ===');
  avisosAntes = avisos;
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(avisos - avisosAntes, 0, 'sigue habiendo solo 1 aviso para 5.31.0');
  eq(r.hay, true, 'pero sigue informando de que hay actualización');
  ctx.APP_VERSION = '5.31.0';
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(r.hay, false, 'si la instalada es igual a la publicada NO hay actualización');
  eq(r.version, '5.31.0', 'y se informa de la versión publicada');
  ctx.APP_VERSION = '5.30.0';

  console.log('\n=== 4. UN FALLO NO BLOQUEA 6 HORAS (el bug principal del APK) ===');
  Object.keys(store).forEach((k) => delete store[k]);
  plan = { [API]: { status: 500 }, [RAW]: { status: 404 } };
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(r.hay, false, 'con las dos fuentes caídas no hay actualización que anunciar');
  ok(!!r.error, 'se informa del error', r.error);
  eq(store['adminred:update-last-check'], undefined, 'el fallo NO se guarda como comprobación correcta');
  eq(store['adminred:update-fails'], '1', 'se cuenta 1 fallo');
  const espera = RN.update.proximoIntentoMs();
  ok(espera > 0 && espera <= RN.update.REINTENTO_BASE_MS,
     'el reintento automático llega en 5 min o menos (antes: 6 horas de silencio)', espera + ' ms');
  const antes = fetchCalls.length;
  r = await RN.update.comprobar({ silencioso: true });
  ok(fetchCalls.length === antes, 'la comprobación automática espera el reintento corto (no vuelve a pedir ya)');
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  ok(fetchCalls.length > antes, 'el botón "Buscar ahora" reintenta igualmente (forzar)');

  console.log('\n=== 5. Si la API falla, entra version.json y se recuerda la fuente ===');
  Object.keys(store).forEach((k) => delete store[k]);
  plan = { [API]: { status: 403 }, [RAW]: { status: 200, body: { version: '5.31.0', url: 'https://github.com/leolhf/AdminRed-Android/releases/tag/v5.31.0' } } };
  fetchCalls.length = 0;
  const avisosAntes5 = avisos;
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(r.hay, true, 'aunque la API devuelva 403 (límite de peticiones), detecta la versión');
  ok(String(r.fuente).indexOf('version.json') === 0, 'la fuente usada es version.json', r.fuente);
  eq(avisos - avisosAntes5, 1, 'el aviso se lanza igualmente por la vía de respaldo');
  eq(store['adminred:update-source'], 'version.json (raw.githubusercontent)', 'la fuente que funciona queda recordada');
  fetchCalls.length = 0;
  await RN.update.comprobar({ forzar: true, silencioso: true });
  ok(String(fetchCalls[0]).indexOf(RAW) === 0, 'la siguiente comprobación intenta primero version.json');

  console.log('\n=== 6. Una versión nueva vuelve a avisar ===');
  plan = { [API]: { status: 200, body: { tag_name: 'v5.32.0', name: 'AdminRed v5.32.0', assets: [] } } };
  ctx.APP_VERSION = '5.30.0';
  const avisosAntes6 = avisos;
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(r.version, '5.32.0', 'detecta 5.32.0 como más nueva que 5.30.0');
  eq(avisos - avisosAntes6, 1, 'se lanza un aviso nuevo por cada versión distinta');
  eq(store['adminred:update-notified'], '5.32.0', 'queda registrada la nueva versión avisada');

  console.log('\n=== 7. Estado y diagnóstico ===');
  const e = RN.update.estado();
  eq(e.instalada, '5.30.0', 'estado() informa de la versión instalada');
  eq(e.ultimaVersion, '5.32.0', 'estado() informa de la última publicada');
  ok(e.ultimaOk > 0, 'estado() informa de la última comprobación correcta');
  eq(e.fallos, 0, 'estado() informa de 0 fallos tras una comprobación correcta');
  const d = await RN.update._filasDiagnostico();
  eq(d.filas.length, 2, 'el diagnóstico consulta las DOS fuentes');
  ok(d.filas[0].ok === true && d.filas[1].ok === false, 'y reporta el resultado de cada una por separado',
     JSON.stringify(d.filas.map((f) => f.fuente + '=' + f.ok)));

  console.log('\n=== 8. Sin conexión no se marca nada ===');
  Object.keys(store).forEach((k) => delete store[k]);
  ctx.navigator.onLine = false;
  r = await RN.update.comprobar({ forzar: true, silencioso: true });
  eq(r.motivo, 'sin conexión', 'sin red no se intenta la consulta');
  eq(store['adminred:update-fails'], undefined, 'sin red no se cuenta como fallo de la nube');
  ctx.navigator.onLine = true;

  console.log('\n---------------------------------------------');
  console.log('  ' + pasaron + ' pruebas OK, ' + fallaron + ' fallidas');
  console.log('---------------------------------------------\n');
  process.exit(fallaron ? 1 : 0);
}

main().catch((e) => { console.error('FALLO DEL TEST:', e); process.exit(1); });
