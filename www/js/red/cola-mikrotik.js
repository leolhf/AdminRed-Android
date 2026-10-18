/**
 * red/cola-mikrotik.js — v5.50.0
 * Colas MikroTik (Max Limit / Limit At / prioridad) y capacidad de red por Limit At.
 *
 * La app NO se conecta al router: solo calcula valores y genera comandos de
 * texto para pegar en la terminal de Winbox.
 *
 * Unidades: las velocidades se guardan y calculan en kbps (1 M = 1000 k).
 * Sin dependencias de DOM en las funciones de cálculo (se prueban en Node).
 *
 * Config (RN.state.config):
 *   colaPadre            nombre de la cola padre (default 'LEO')
 *   colaPadreMaxLimit    Max Limit del padre en Mbps (default 44)
 *   reservaMegas         reserva que se resta al paquete para el tope (default 1)
 *   colaAdminPrioridad   prioridad de los administradores (default 1)
 *   colaReglas           [{ minMegas, pct, prioridad }] de mayor a menor minMegas
 */
RN.cola = RN.cola || {};

/** Reglas por defecto (se aplican de arriba hacia abajo por minimo de megas). */
RN.cola.REGLAS_DEFECTO = [
  { minMegas: 8, pct: 45, prioridad: 3 },
  { minMegas: 5, pct: 35, prioridad: 4 },
  { minMegas: 4, pct: 35, prioridad: 6 },
  { minMegas: 3, pct: 35, prioridad: 7 },
  { minMegas: 0, pct: 35, prioridad: 8 }
];

RN.cola.DEFECTOS = {
  colaPadre: 'LEO',
  colaPadreMaxLimit: 44,
  reservaMegas: 1,
  colaAdminPrioridad: 1
};

/** Copia profunda de las reglas por defecto. */
RN.cola.reglasDefecto = function () {
  return RN.cola.REGLAS_DEFECTO.map(function (r) { return { minMegas: r.minMegas, pct: r.pct, prioridad: r.prioridad }; });
};

/** Aplica valores por defecto a la config (migración y arranque). Idempotente. */
RN.cola.asegurarConfig = function (cfg) {
  if (!cfg) return cfg;
  if (!cfg.colaPadre || typeof cfg.colaPadre !== 'string') cfg.colaPadre = RN.cola.DEFECTOS.colaPadre;
  if (!(+cfg.colaPadreMaxLimit > 0)) cfg.colaPadreMaxLimit = RN.cola.DEFECTOS.colaPadreMaxLimit;
  if (cfg.reservaMegas === undefined || cfg.reservaMegas === null || isNaN(+cfg.reservaMegas) || +cfg.reservaMegas < 0) {
    cfg.reservaMegas = RN.cola.DEFECTOS.reservaMegas;
  }
  if (!(+cfg.colaAdminPrioridad >= 1)) cfg.colaAdminPrioridad = RN.cola.DEFECTOS.colaAdminPrioridad;
  if (!Array.isArray(cfg.colaReglas) || !cfg.colaReglas.length) cfg.colaReglas = RN.cola.reglasDefecto();
  return cfg;
};

/** Reglas válidas ordenadas de mayor a menor minMegas. */
RN.cola.reglas = function () {
  var cfg = (RN.state && RN.state.config) || {};
  var lista = (Array.isArray(cfg.colaReglas) && cfg.colaReglas.length) ? cfg.colaReglas : RN.cola.REGLAS_DEFECTO;
  return lista
    .map(function (r) { return { minMegas: +r.minMegas || 0, pct: +r.pct || 0, prioridad: Math.max(1, Math.round(+r.prioridad || 8)) }; })
    .sort(function (a, b) { return b.minMegas - a.minMegas; });
};

/** Regla que corresponde a un plan de `megas` Mbps (la primera con minMegas <= megas). */
RN.cola.reglaParaMegas = function (megas) {
  var rs = RN.cola.reglas();
  for (var i = 0; i < rs.length; i++) {
    if (megas >= rs[i].minMegas) return rs[i];
  }
  return rs[rs.length - 1];
};

/** Redondea kbps a multiplos de 50k (1400k, 1750k, 5400k). */
RN.cola.redondear50k = function (kbps) {
  return Math.round((+kbps || 0) / 50 + 1e-9) * 50;
};

/** Formatea kbps como lo espera RouterOS: 4M, 1400k, 5400k. */
RN.cola.formatoVel = function (kbps) {
  kbps = Math.round(+kbps || 0);
  if (kbps >= 1000 && kbps % 1000 === 0) return (kbps / 1000) + 'M';
  return kbps + 'k';
};

/**
 * Interpreta texto de velocidad ("2M", "1400k", "1.5M", "2") -> kbps.
 * Sin unidad se asume Mbps. Devuelve 0 si no es valido.
 */
RN.cola.parseVelocidad = function (texto) {
  var t = String(texto == null ? '' : texto).trim().toLowerCase().replace(',', '.');
  if (!t) return 0;
  var m = t.match(/^(\d+(?:\.\d+)?)\s*([mk]?)(?:bps)?$/);
  if (!m) return 0;
  var n = parseFloat(m[1]);
  if (!(n > 0)) return 0;
  return Math.round(m[2] === 'k' ? n : n * 1000);
};

/** Limit At manual guardado en el cliente (kbps) o 0. */
RN.cola.limitAtManual = function (cliente) {
  var v = cliente ? +cliente.limitAtManual : 0;
  return v > 0 ? Math.round(v) : 0;
};

/** Megas de un cliente (plan o personalizado). */
RN.cola.megasDe = function (cliente) {
  return RN.calc.getMegasCliente(cliente);
};

/**
 * Datos de cola de un cliente:
 *  { megas, maxLimitKbps, limitAtKbps, prioridad, esAdmin, manual, falta }
 * `falta` lista lo que impide generar un comando completo ('limitAt', 'megas').
 * - Administrador: Limit At manual obligatorio, prioridad fija, sin max-limit.
 * - Resto: Limit At = % del plan segun regla (redondeado a 50k) salvo que haya limitAtManual.
 */
RN.cola.datos = function (cliente) {
  var cfg = RN.state.config;
  var esAdmin = RN.calc.esAdmin(cliente);
  var megas = RN.cola.megasDe(cliente);
  var manual = RN.cola.limitAtManual(cliente);
  var falta = [];
  var limitAt = 0, prioridad;

  if (esAdmin) {
    prioridad = Math.max(1, Math.round(+cfg.colaAdminPrioridad || 1));
    limitAt = manual;
    if (!limitAt) falta.push('limitAt');
  } else {
    var regla = RN.cola.reglaParaMegas(megas);
    prioridad = regla.prioridad;
    if (manual) limitAt = manual;
    else if (megas > 0) limitAt = RN.cola.redondear50k(megas * 1000 * regla.pct / 100);
    if (!(megas > 0)) falta.push('megas');
  }
  return {
    megas: megas,
    maxLimitKbps: esAdmin ? 0 : megas * 1000,
    limitAtKbps: limitAt,
    prioridad: prioridad,
    esAdmin: esAdmin,
    manual: manual > 0,
    falta: falta
  };
};

/** ¿Un cliente participa en las colas? (administradores y clientes con megas) */
RN.cola.tieneCola = function (cliente) {
  if (!cliente) return false;
  if (RN.calc.esAdmin(cliente)) return true;
  return RN.cola.megasDe(cliente) > 0;
};

/** IPv4 estricta (para usar como /32). */
RN.cola.ipValida = function (ip) {
  if (!ip || typeof ip !== 'string') return false;
  var partes = ip.trim().split('.');
  if (partes.length !== 4) return false;
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(partes[i])) return false;
    var n = parseInt(partes[i], 10);
    if (n < 0 || n > 255) return false;
  }
  return true;
};

/**
 * Nombre de cola seguro: sin tildes ni caracteres raros (RouterOS los escapa
 * mal al pegar por terminal). Conserva letras, numeros, espacio, guion y punto.
 */
RN.cola.nombreSeguro = function (nombre) {
  var t = String(nombre == null ? '' : nombre);
  if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/[\u00f1]/g, 'n').replace(/[\u00d1]/g, 'N');
  t = t.replace(/[^A-Za-z0-9 _.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return t || 'Cliente';
};

/**
 * Argumentos comunes de una cola simple (limit-at, max-limit, priority, queue).
 * Estilo alineado al export de RouterOS 7.x del RB750Gr3.
 */
RN.cola._argsCola = function (cliente) {
  var d = RN.cola.datos(cliente);
  var limitAt = 'limit-at=0/' + RN.cola.formatoVel(d.limitAtKbps);
  var prio = 'priority=' + d.prioridad + '/' + d.prioridad;
  var queue = 'queue=pcq-upload-default/pcq-download-default';
  var maxLimit = d.esAdmin ? '' : ('max-limit=0/' + RN.cola.formatoVel(d.maxLimitKbps));
  return { d: d, limitAt: limitAt, prio: prio, queue: queue, maxLimit: maxLimit };
};

/**
 * Comando RouterOS de UN cliente.
 * estilo simple = add puro (como export); upsert = set si existe / add si no.
 */
RN.cola.comando = function (cliente, opts) {
  opts = opts || {};
  var cfg = RN.state.config;
  var estilo = opts.estilo || cfg.colaEstiloComando || 'upsert';
  if (!cliente) return { ok: false, comando: '', error: 'Cliente no encontrado', estilo: estilo };
  var ip = String(cliente.ip || '').trim();
  if (!RN.cola.ipValida(ip)) return { ok: false, comando: '', error: 'Falta una IP valida para ' + (cliente.nombre || 'el cliente'), estilo: estilo };
  var a = RN.cola._argsCola(cliente);
  if (a.d.falta.indexOf('limitAt') !== -1) return { ok: false, comando: '', error: 'El administrador necesita un Limit At manual', estilo: estilo };
  if (a.d.falta.indexOf('megas') !== -1) return { ok: false, comando: '', error: 'El cliente no tiene megas definidos', estilo: estilo };

  var target = ip + '/32';
  var padre = RN.cola.nombreSeguro(cfg.colaPadre || RN.cola.DEFECTOS.colaPadre);
  var nombre = RN.cola.nombreSeguro(cliente.nombre);
  var partesAdd = [a.limitAt];
  if (a.maxLimit) partesAdd.push(a.maxLimit);
  partesAdd.push('name="' + nombre + '"');
  partesAdd.push('parent=' + padre);
  partesAdd.push(a.prio);
  partesAdd.push(a.queue);
  partesAdd.push('target=' + target);

  var cmd;
  if (estilo === 'simple') {
    cmd = '/queue simple add ' + partesAdd.join(' ');
  } else {
    var setParts = [a.limitAt];
    if (a.maxLimit) setParts.push(a.maxLimit);
    setParts.push(a.prio);
    setParts.push('name="' + nombre + '"');
    setParts.push('parent=' + padre);
    setParts.push(a.queue);
    var setArgs = setParts.join(' ');
    cmd = ':if ([:len [/queue simple find target="' + target + '"]] > 0) do={ ' +
      '/queue simple set [find target="' + target + '"] ' + setArgs +
      ' } else={ ' +
      '/queue simple add ' + partesAdd.join(' ') +
      ' }';
  }
  return { ok: true, comando: cmd, error: '', estilo: estilo };
};

/** Borrar cola por IP (baja o cambio de IP). */
RN.cola.comandoEliminar = function (cliente) {
  if (!cliente) return { ok: false, comando: '', error: 'Sin cliente' };
  var ip = String(cliente.ip || '').trim();
  if (!RN.cola.ipValida(ip)) return { ok: false, comando: '', error: 'IP invalida' };
  var target = ip + '/32';
  var cmd = ':if ([:len [/queue simple find target="' + target + '"]] > 0) do={ ' +
    '/queue simple remove [find target="' + target + '"] }';
  return { ok: true, comando: cmd, error: '' };
};

/** Clientes que entran al script completo: activos con cola, ordenados por IP. */
RN.cola.clientesConCola = function () {
  var lista = RN.calc.clientesEnRed().filter(RN.cola.tieneCola);
  return lista.sort(function (a, b) {
    var pa = String(a.ip || '').split('.').map(Number), pb = String(b.ip || '').split('.').map(Number);
    if (!a.ip && !b.ip) return String(a.nombre).localeCompare(String(b.nombre));
    if (!a.ip) return 1;
    if (!b.ip) return -1;
    for (var i = 0; i < 4; i++) { if (pa[i] !== pb[i]) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  });
};

/**
 * Script completo de todos los clientes activos con cola.
 * @returns {{script:string, incluidos:number, omitidos:Array<{nombre:string, motivo:string}>}}
 */
RN.cola.scriptCompleto = function (opts) {
  opts = opts || {};
  var estilo = opts.estilo || (RN.state.config && RN.state.config.colaEstiloComando) || 'upsert';
  var omitidos = [], lineas = [], n = 0;
  RN.cola.clientesConCola().forEach(function (c) {
    var r = RN.cola.comando(c, { estilo: estilo });
    if (!r.ok) { omitidos.push({ nombre: c.nombre || '(sin nombre)', motivo: r.error }); return; }
    lineas.push('# ' + RN.cola.nombreSeguro(c.nombre) + ' — ' + (c.ip || '') + ' / ' + (RN.cola.megasDe(c) || 0) + 'M');
    lineas.push(r.comando);
    n++;
  });
  var cab = [
    '# AdminRed → MikroTik /queue simple',
    '# Estilo: ' + estilo + ' · ' + n + ' colas',
    '# Antes: /system backup save name=respaldo-colas',
    '# Pegar en Terminal Winbox o SSH',
    ''
  ];
  if (estilo === 'simple') cab.push('/queue simple');
  return { script: cab.concat(lineas).join(String.fromCharCode(10)) + String.fromCharCode(10), incluidos: n, omitidos: omitidos, estilo: estilo };
};

/* ============================================================
 * Capacidad de red por suma de Limit At (v5.50.0)
 * ============================================================ */

/** Tope de la suma de Limit At en kbps: paquete menos reserva (o Max Limit del padre si no hay paquete). */
RN.cola.topeKbps = function () {
  var cfg = RN.state.config;
  var paquete = +cfg.proveedorMegas || 0;
  var plus = (RN.calc && RN.calc.plusMegas) ? RN.calc.plusMegas() : (+cfg.plusMegas || 0);
  var reserva = Math.max(0, +cfg.reservaMegas || 0);
  // v5.52.3: capacidad real = megas pagados + plus de cortesía
  var base = paquete > 0 ? (paquete + Math.max(0, plus)) : (+cfg.colaPadreMaxLimit || 0);
  return Math.max(0, Math.round((base - reserva) * 1000));
};

/** Suma de Limit At de clientes activos (administradores incluidos), en kbps. */
RN.cola.sumaLimitAtKbps = function () {
  var total = 0, sinLimitAt = [];
  RN.calc.clientesEnRed().forEach(function (c) {
    if (!RN.cola.tieneCola(c)) return;
    var d = RN.cola.datos(c);
    if (d.limitAtKbps > 0) total += d.limitAtKbps;
    else sinLimitAt.push(c.nombre);
  });
  return { kbps: total, sinLimitAt: sinLimitAt };
};

/**
 * Cuantos clientes mas de cada plan caben con el margen libre
 * (margen / Limit At del plan). Solo planes con megas.
 * @returns {Array<{planId, nombre, megas, limitAtKbps, caben}>}
 */
RN.cola.cuantosCaben = function (margenKbps) {
  margenKbps = Math.max(0, +margenKbps || 0);
  var planes = (RN.state.planes || []).filter(function (p) { return +p.megas > 0; });
  return planes.map(function (p) {
    var regla = RN.cola.reglaParaMegas(+p.megas);
    var la = RN.cola.redondear50k(+p.megas * 1000 * regla.pct / 100);
    return { planId: p.id, nombre: p.nombre, megas: +p.megas, limitAtKbps: la, caben: la > 0 ? Math.floor(margenKbps / la) : 0 };
  }).sort(function (a, b) { return a.megas - b.megas; });
};

/**
 * Estado de capacidad por Limit At. Reemplaza al indicador por megas vendidos.
 * Devuelve (en Mbps salvo `*Kbps`):
 *  { paquete, reserva, tope, comprometido, margen, pct, excedido, aviso,
 *    vendidos, megasAdmin, relacionVenta, sinLimitAt, topeKbps, comprometidoKbps, margenKbps }
 * aviso: pct >= 80 sin exceder. excedido: comprometido > tope.
 * relacionVenta: megas vendidos / capacidad del paquete (ej. 2.5 => 2.5 a 1).
 */
RN.cola.estadoCapacidad = function () {
  var cfg = RN.state.config;
  var paquete = +cfg.proveedorMegas || 0;
  var plus = (RN.calc && RN.calc.plusMegas) ? RN.calc.plusMegas() : (+cfg.plusMegas || 0);
  var reserva = Math.max(0, +cfg.reservaMegas || 0);
  var topeKbps = RN.cola.topeKbps();
  var suma = RN.cola.sumaLimitAtKbps();
  var comp = suma.kbps;
  var margenKbps = topeKbps - comp;
  var excedido = topeKbps > 0 && comp > topeKbps;
  var pctReal = topeKbps > 0 ? comp / topeKbps * 100 : 0;
  var vendidos = RN.calc.megasVendidos();
  var capacidadBase = paquete > 0 ? paquete : (+cfg.colaPadreMaxLimit || 0);
  return {
    paquete: paquete,
    plus: plus,
    reserva: reserva,
    tope: topeKbps / 1000,
    comprometido: comp / 1000,
    margen: margenKbps / 1000,
    pct: topeKbps > 0 ? Math.min(100, Math.round(pctReal)) : 0,
    pctReal: Math.round(pctReal),
    excedido: excedido,
    aviso: !excedido && pctReal >= 80,
    vendidos: vendidos,
    megasAdmin: RN.calc.megasAdmin(),
    relacionVenta: capacidadBase > 0 ? +((vendidos) / capacidadBase).toFixed(1) : 0,
    sinLimitAt: suma.sinLimitAt,
    topeKbps: topeKbps,
    comprometidoKbps: comp,
    margenKbps: margenKbps
  };
};

/* ============================================================
 * UI (solo navegador): copiar, resumen de capacidad y ajustes
 * ============================================================ */

/** Copia texto al portapapeles (con alternativa para webviews sin Clipboard API). */
RN.cola.copiar = function (texto) {
  var ok = function () { RN.notifyUI.toast('Comando copiado. Pegalo en la terminal de Winbox', 'success'); };
  var fallback = function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var done = document.execCommand('copy');
      document.body.removeChild(ta);
      if (done) ok(); else RN.notifyUI.toast('No se pudo copiar. Selecciona el texto y copialo a mano', 'error');
    } catch (e) {
      RN.notifyUI.toast('No se pudo copiar. Selecciona el texto y copialo a mano', 'error');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(ok, fallback);
  } else {
    fallback();
  }
};

/** v5.55.19 — Copia el script completo desde la vista Red (toast fiable). */
RN.cola.copiarScriptVista = function (estilo) {
  estilo = estilo || (RN.state.config && RN.state.config.colaEstiloComando) || 'upsert';
  var r = RN.cola.scriptCompleto({ estilo: estilo });
  if (!r || !r.script) {
    RN.notifyUI.toast('No hay script que copiar', 'warn');
    return;
  }
  RN.cola._ultimoScript = r.script;
  var msgExtra = r.omitidos && r.omitidos.length
    ? ' (' + r.omitidos.length + ' omitidos)'
    : '';
  // Reutilizar copiar + mensaje enriquecido
  var texto = r.script;
  var ok = function () {
    RN.notifyUI.toast('Script copiado: ' + r.incluidos + ' colas' + msgExtra + '. Pégalo en Winbox (haz backup antes)', 'success');
  };
  var fallback = function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var done = document.execCommand('copy');
      document.body.removeChild(ta);
      if (done) ok();
      else RN.notifyUI.toast('No se pudo copiar. Abre Resumen y copia a mano', 'error');
    } catch (e) {
      RN.notifyUI.toast('No se pudo copiar. Abre Resumen y copia a mano', 'error');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(ok, fallback);
  } else {
    fallback();
  }
};

/** Copia el comando de un cliente de la lista. */
RN.cola.copiarDeCliente = function (id, estilo) {
  var c = RN.state.clients.find(function (x) { return x.id === id; });
  var r = RN.cola.comando(c, { estilo: estilo || (RN.state.config && RN.state.config.colaEstiloComando) || 'simple' });
  if (!r.ok) { RN.notifyUI.toast(r.error, 'error'); return; }
  RN.cola.copiar(r.comando);
};

RN.cola.mostrarComandoCliente = function (clienteId) {
  var c = RN.state.clients.find(function (x) { return x.id === clienteId; });
  if (!c || !RN.cola.tieneCola(c)) return;
  var simple = RN.cola.comando(c, { estilo: 'simple' });
  var upsert = RN.cola.comando(c, { estilo: 'upsert' });
  if (!simple.ok && !upsert.ok) {
    RN.notifyUI.toast(simple.error || upsert.error, 'warn');
    return;
  }

  // ¿Otra ficha en la app usa la misma IP?
  var ip = String(c.ip || '').trim();
  var otros = (RN.state.clients || []).filter(function (x) {
    return x.id !== c.id && x.activo !== false && String(x.ip || '').trim() === ip;
  });
  var avisoIpApp = otros.length
    ? '<p class="cierre-bloqueo" style="font-size:13px">⚠️ La IP <strong>' + RN.render.esc(ip) +
      '</strong> también está en: <strong>' + RN.render.esc(otros.map(function (o) { return o.nombre; }).join(', ')) +
      '</strong>. En el router solo puede haber <em>una</em> cola por target /32.</p>'
    : '';

  // Si la IP ya existe en el MikroTik (ej. cola "28"), el ADD falla;
  // UPSERT actualiza esa cola: cambia name → Pepe, limit-at y max-limit a 2M.
  var avisoRouter =
    '<div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:10px">' +
    '<strong>Si esa IP ya tiene cola en el router</strong> (por ejemplo el nombre <code>28</code>):' +
    '<ul style="margin:6px 0 0;padding-left:1.2em">' +
    '<li><strong>Recomendado — Actualizar (upsert):</strong> cambia el nombre a <em>' +
    RN.render.esc(RN.cola.nombreSeguro(c.nombre)) + '</em> y pone los límites de ' +
    (RN.cola.megasDe(c) || 0) + 'M. No crea duplicado.</li>' +
    '<li><strong>Solo ADD:</strong> sirve si la IP está <em>libre</em>. Si ya existe, el terminal dará error.</li>' +
    '</ul></div>';

  var cmdUpsert = upsert.ok ? upsert.comando : '';
  var cmdSimple = simple.ok ? simple.comando : '';

  var html = '<div class="modal-header"><h3>📡 Comando MikroTik</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
    '<p class="muted" style="margin-top:0">Cliente <strong>' + RN.render.esc(c.nombre) + '</strong> · IP ' +
    RN.render.esc(ip) + ' · ' + (RN.cola.megasDe(c) || 0) + 'M · parent ' +
    RN.render.esc((RN.state.config && RN.state.config.colaPadre) || 'LEO') + '</p>' +
    avisoIpApp + avisoRouter +
    '<label class="muted" style="font-size:12px">Actualizar si existe (recomendado)</label>' +
    '<textarea id="cola-cmd-upsert" readonly rows="4" style="width:100%;font-family:monospace;font-size:11px;margin-bottom:10px">' +
    RN.render.esc(cmdUpsert) + '</textarea>' +
    '<label class="muted" style="font-size:12px">ADD puro (solo IP libre)</label>' +
    '<textarea id="cola-cmd-simple" readonly rows="3" style="width:100%;font-family:monospace;font-size:11px">' +
    RN.render.esc(cmdSimple) + '</textarea>' +
    '</div><div class="modal-footer" style="flex-wrap:wrap;gap:8px">' +
    '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
    '<button class="btn" onclick="RN.cola.copiar(document.getElementById(\'cola-cmd-simple\').value)">📋 Copiar ADD</button>' +
    '<button class="btn primary" onclick="RN.cola.copiar(document.getElementById(\'cola-cmd-upsert\').value)">📋 Copiar actualizar</button>' +
    '</div>';

  if (RN.uiComponents.reemplazarModal) RN.uiComponents.reemplazarModal(html, { lg: true });
  else RN.uiComponents.modal(html, { lg: true, replace: true });
};

/** Texto "36M" / "1.4M" para mostrar megas con maximo 2 decimales. */
RN.cola.txtM = function (m) {
  return (Math.round((+m || 0) * 100) / 100) + 'M';
};

/** Pantalla de resumen: suma de Limit At contra el tope, margen, cuantos caben y script completo. */
RN.cola.abrirResumen = function () {
  var cap = RN.cola.estadoCapacidad();
  var color = cap.excedido ? 'var(--danger)' : (cap.aviso ? 'var(--warn)' : 'var(--success)');
  var cls = cap.excedido ? 'bar-red' : (cap.aviso ? 'bar-amber' : 'bar-green');
  var esc = RN.render.esc;
  var h = '<div class="modal-header"><h3>\ud83d\udce1 Capacidad de red (Limit At)</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div><div class="modal-body">';
  h += '<div class="prov-cap-label"><strong style="color:' + color + '">' + RN.cola.txtM(cap.comprometido) + ' comprometidos / ' + RN.cola.txtM(cap.tope) + ' (' + cap.pctReal + '%)</strong></div>';
  h += '<div class="prov-cap-bar"><div class="prov-cap-fill ' + cls + '" style="width:' + (cap.pct || 1) + '%"></div></div>';
  h += '<p style="margin:8px 0;color:' + color + '">' + (cap.excedido
    ? '\u26a0 Te pasas del tope por <strong>' + RN.cola.txtM(-cap.margen) + '</strong>'
    : 'Margen libre: <strong>' + RN.cola.txtM(cap.margen) + '</strong>') + '</p>';
  h += '<p class="muted" style="font-size:12px;margin-bottom:12px">Tope = paquete ' + RN.cola.txtM(cap.paquete) + ' \u2212 reserva ' + RN.cola.txtM(cap.reserva) + '. Se suma el Limit At de los clientes activos, administradores incluidos.</p>';
  h += '<p class="muted" style="font-size:13px">Informativo: ' + RN.cola.txtM(cap.vendidos) + ' vendidos' + (cap.relacionVenta > 0 ? ' (relaci\u00f3n ' + cap.relacionVenta + ' a 1)' : '') + (cap.megasAdmin > 0 ? ' \u00b7 ' + RN.cola.txtM(cap.megasAdmin) + ' de administraci\u00f3n' : '') + '</p>';
  if (cap.sinLimitAt.length) {
    h += '<p style="color:var(--warn);font-size:13px">\u26a0 Sin Limit At (no suman): ' + cap.sinLimitAt.map(esc).join(', ') + '</p>';
  }
  var caben = RN.cola.cuantosCaben(cap.excedido ? 0 : cap.margenKbps);
  if (caben.length) {
    h += '<h4 style="margin:12px 0 6px">\u00bfCu\u00e1ntos caben?</h4><div style="font-size:13px">';
    h += caben.map(function (x) { return '<div>' + esc(x.nombre) + ' \u00b7 ' + x.megas + 'M (Limit At ' + RN.cola.formatoVel(x.limitAtKbps) + '): <strong>' + x.caben + '</strong> m\u00e1s</div>'; }).join('');
    h += '</div>';
  }
  h += '<div id="cola-script-box" style="display:none;margin-top:12px"></div>';
  h += '</div><div class="modal-footer">' +
    '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
    '<button class="btn" onclick="RN.cola.abrirAjustes()">\u2699 Reglas</button>' +
    '<button class="btn primary" onclick="RN.cola.mostrarScript(\'simple\')">Script estilo export</button> <button class="btn" onclick="RN.cola.mostrarScript(\'upsert\')">Script upsert</button></div>';
  RN.uiComponents.modal(h, { lg: true });
};

/** Genera y muestra el script de todos los clientes activos con cola. */
RN.cola.mostrarScript = function (estilo) {
  var r = RN.cola.scriptCompleto({ estilo: estilo });
  RN.cola._ultimoScript = r.script;
  var box = document.getElementById('cola-script-box');
  if (!box) return;
  var h = '<p style="font-size:13px"><strong>' + r.incluidos + '</strong> clientes en el script. ' +
    '<span class="muted">Sintaxis sin probar en el router: la primera vez, corre un solo cliente.</span></p>';
  if (r.omitidos.length) {
    h += '<p style="color:var(--warn);font-size:13px">\u26a0 Omitidos (' + r.omitidos.length + '): ' +
      r.omitidos.map(function (o) { return RN.render.esc(o.nombre) + ' (' + RN.render.esc(o.motivo) + ')'; }).join('; ') + '</p>';
  }
  h += '<textarea readonly rows="8" style="width:100%;font-family:monospace;font-size:11px">' + RN.render.esc(r.script) + '</textarea>' +
    '<div class="mt-8"><button class="btn sm primary" onclick="RN.cola.copiar(RN.cola._ultimoScript)">\ud83d\udccb Copiar script</button></div>';
  box.innerHTML = h;
  box.style.display = '';
};

/** Ajustes de la cola: padre, reserva, prioridad de administradores y reglas de Limit At. */
RN.cola.abrirAjustes = function () {
  var cfg = RN.cola.asegurarConfig(RN.state.config);
  var reglas = RN.cola.reglas();
  var h = '<div class="modal-header"><h3>\u2699 Cola MikroTik</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div><div class="modal-body">';
  h += '<div class="form-row cols-2">' +
    '<div><label>Nombre de la cola padre</label><input id="cola-padre" value="' + RN.render.esc(cfg.colaPadre) + '" spellcheck="false" autocapitalize="off"></div>' +
    '<div><label>Max Limit del padre (Mbps)</label><input id="cola-padre-max" type="number" min="1" step="1" value="' + cfg.colaPadreMaxLimit + '"></div>' +
    '<div><label>Reserva (Mbps)</label><input id="cola-reserva" type="number" min="0" step="0.5" value="' + cfg.reservaMegas + '"></div>' +
    '<div><label>Prioridad de administradores</label><input id="cola-prio-admin" type="number" min="1" max="8" step="1" value="' + cfg.colaAdminPrioridad + '"></div></div>';
  h += '<p class="muted" style="font-size:12px;margin:6px 0 10px">Tope de capacidad = paquete del proveedor \u2212 reserva. Las reglas se aplican de arriba hacia abajo por m\u00ednimo de megas. El Limit At se redondea a m\u00faltiplos de 50k.</p>';
  h += '<table style="width:100%;font-size:13px"><thead><tr><th style="text-align:left">Desde (M)</th><th style="text-align:left">% del plan</th><th style="text-align:left">Prioridad</th></tr></thead><tbody id="cola-reglas">';
  reglas.forEach(function (r, i) {
    h += '<tr><td><input type="number" min="0" step="1" class="cola-r-min" value="' + r.minMegas + '"></td>' +
      '<td><input type="number" min="1" max="100" step="1" class="cola-r-pct" value="' + r.pct + '"></td>' +
      '<td><input type="number" min="1" max="8" step="1" class="cola-r-prio" value="' + r.prioridad + '"></td></tr>';
  });
  h += '</tbody></table>';
  h += '</div><div class="modal-footer">' +
    '<button class="btn ghost" onclick="RN.cola.restaurarReglas()">Restaurar valores</button>' +
    '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
    '<button class="btn primary" onclick="RN.cola.guardarAjustes()">Guardar</button></div>';
  RN.uiComponents.modal(h, { lg: true });
};

RN.cola.restaurarReglas = function () {
  RN.state.config.colaReglas = RN.cola.reglasDefecto();
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.cola.abrirAjustes();
  RN.notifyUI.toast('Reglas restauradas', 'success');
};

RN.cola.guardarAjustes = function () {
  var v = function (id) { return (document.getElementById(id) || {}).value; };
  var padre = RN.cola.nombreSeguro(v('cola-padre'));
  var padreMax = parseFloat(v('cola-padre-max'));
  var reserva = parseFloat(v('cola-reserva'));
  var prioAdmin = parseInt(v('cola-prio-admin'), 10);
  if (!(padreMax > 0)) { RN.notifyUI.toast('El Max Limit del padre debe ser mayor que 0', 'error'); return; }
  if (!(reserva >= 0)) { RN.notifyUI.toast('La reserva no puede ser negativa', 'error'); return; }
  if (!(prioAdmin >= 1 && prioAdmin <= 8)) { RN.notifyUI.toast('La prioridad va de 1 a 8', 'error'); return; }
  var mins = document.querySelectorAll('.cola-r-min'), pcts = document.querySelectorAll('.cola-r-pct'), prios = document.querySelectorAll('.cola-r-prio');
  var reglas = [], vistos = {};
  for (var i = 0; i < mins.length; i++) {
    var r = { minMegas: parseFloat(mins[i].value), pct: parseFloat(pcts[i].value), prioridad: parseInt(prios[i].value, 10) };
    if (!(r.minMegas >= 0) || !(r.pct > 0 && r.pct <= 100) || !(r.prioridad >= 1 && r.prioridad <= 8)) {
      RN.notifyUI.toast('Revisa las reglas: % de 1 a 100 y prioridad de 1 a 8', 'error'); return;
    }
    if (vistos[r.minMegas]) { RN.notifyUI.toast('Hay dos reglas con el mismo m\u00ednimo de megas', 'error'); return; }
    vistos[r.minMegas] = true;
    reglas.push(r);
  }
  if (!vistos[0]) { RN.notifyUI.toast('Debe haber una regla desde 0M para que ning\u00fan plan quede sin regla', 'error'); return; }
  reglas.sort(function (a, b) { return b.minMegas - a.minMegas; });
  var cfg = RN.state.config;
  cfg.colaPadre = padre; cfg.colaPadreMaxLimit = padreMax; cfg.reservaMegas = reserva;
  cfg.colaAdminPrioridad = prioAdmin; cfg.colaReglas = reglas;
  RN.config.persistir();
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast('Ajustes de cola guardados', 'success');
};
