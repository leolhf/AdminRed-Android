/**
 * red/nodos.js — v5.55.20
 * Nodos de red (AP / router / switch / sector) con jerarquía padre→hijos.
 * Agrega megas y Limit At (clientes directos + rama) para decidir 100M vs 1G.
 */
RN.nodos = RN.nodos || {};

RN.nodos.TIPOS = ['AP', 'Router', 'Switch', 'Sector', 'Otro'];
RN.nodos.PUERTOS = [
  { v: 100, label: '100 M' },
  { v: 1000, label: '1 G (1000 M)' },
  { v: 2500, label: '2.5 G' },
  { v: 10000, label: '10 G' }
];

RN.nodos.asegurarState = function () {
  if (!RN.state.nodos) RN.state.nodos = [];
};

RN.nodos.lista = function () {
  RN.nodos.asegurarState();
  return RN.state.nodos || [];
};

RN.nodos.porId = function (id) {
  if (!id) return null;
  return RN.nodos.lista().find(function (n) { return n.id === id; }) || null;
};

/** Evita ciclos: no puede ser padre de sí mismo ni de un ancestro. */
RN.nodos.padresPosibles = function (nodoId) {
  var todos = RN.nodos.lista();
  if (!nodoId) return todos.slice();
  var prohibidos = {};
  prohibidos[nodoId] = true;
  // todos los descendientes de nodoId no pueden ser padre
  var stack = [nodoId];
  while (stack.length) {
    var cur = stack.pop();
    todos.forEach(function (n) {
      if (n.padreId === cur && !prohibidos[n.id]) {
        prohibidos[n.id] = true;
        stack.push(n.id);
      }
    });
  }
  return todos.filter(function (n) { return !prohibidos[n.id]; });
};

RN.nodos.hijosDirectos = function (nodoId) {
  return RN.nodos.lista().filter(function (n) { return n.padreId === nodoId; });
};

/** IDs de toda la rama (nodo + descendientes). */
RN.nodos.idsRama = function (nodoId) {
  var ids = [nodoId];
  var stack = [nodoId];
  while (stack.length) {
    var cur = stack.pop();
    RN.nodos.hijosDirectos(cur).forEach(function (h) {
      ids.push(h.id);
      stack.push(h.id);
    });
  }
  return ids;
};

RN.nodos.clientesDirectos = function (nodoId) {
  return (RN.state.clients || []).filter(function (c) {
    return c && c.activo !== false && c.nodoId === nodoId;
  });
};

RN.nodos.clientesRama = function (nodoId) {
  var set = {};
  RN.nodos.idsRama(nodoId).forEach(function (id) { set[id] = true; });
  return (RN.state.clients || []).filter(function (c) {
    return c && c.activo !== false && c.nodoId && set[c.nodoId];
  });
};

/**
 * Totales de un nodo.
 * - directos: solo clientes colgados en este nodo
 * - rama: directos + todos los de nodos hijos (para decisión del equipo del principal)
 */
RN.nodos.totales = function (nodoId) {
  var sumar = function (clientes) {
    var megas = 0, limitAtKbps = 0, n = 0;
    (clientes || []).forEach(function (c) {
      n++;
      var m = 0;
      try { m = RN.cola && RN.cola.megasDe ? RN.cola.megasDe(c) : (RN.calc.getMegasCliente ? RN.calc.getMegasCliente(c) : 0); } catch (e) { m = 0; }
      megas += (+m || 0);
      var kbps = 0;
      try {
        if (RN.cola && RN.cola.tieneCola && RN.cola.tieneCola(c) && RN.cola.datos) {
          kbps = RN.cola.datos(c).limitAtKbps || 0;
        }
      } catch (e2) { kbps = 0; }
      limitAtKbps += kbps;
    });
    return {
      clientes: n,
      megas: Math.round(megas * 100) / 100,
      limitAtM: Math.round((limitAtKbps / 1000) * 100) / 100,
      limitAtKbps: limitAtKbps
    };
  };
  return {
    directo: sumar(RN.nodos.clientesDirectos(nodoId)),
    rama: sumar(RN.nodos.clientesRama(nodoId))
  };
};

/**
 * Recomendación de puerto/equipo según carga de la RAMA vs capacidad del nodo.
 * @returns {{ usoPct, estado, texto, sugeridoM }}
 */
RN.nodos.recomendacion = function (nodo) {
  var t = RN.nodos.totales(nodo.id);
  var cargaM = t.rama.limitAtM > 0 ? t.rama.limitAtM : t.rama.megas;
  var cap = +nodo.capacidadPuertoM || 1000;
  var usoPct = cap > 0 ? Math.round((cargaM / cap) * 100) : 0;
  var sugeridoM = 100;
  if (cargaM > 100) sugeridoM = 1000;
  else if (cargaM > 80) sugeridoM = 1000;
  else sugeridoM = 100;

  var estado = 'ok';
  var texto = '';
  if (cargaM <= 0) {
    estado = 'ok';
    texto = 'Sin carga de clientes en la rama.';
  } else if (usoPct >= 100) {
    estado = 'bad';
    texto = 'Carga de la rama (' + cargaM + 'M) supera el puerto de ' + cap + 'M. Recomendado: equipo/puerto ≥ ' + sugeridoM + 'M'
      + (sugeridoM >= 1000 ? ' (1 G)' : '') + '.';
  } else if (usoPct >= 80 || (cap <= 100 && cargaM > 80)) {
    estado = 'warn';
    texto = 'Carga de la rama ~' + cargaM + 'M en puerto de ' + cap + 'M (' + usoPct + '%). '
      + (sugeridoM > cap ? 'Conviene subir a ' + (sugeridoM >= 1000 ? '1 G' : sugeridoM + 'M') + '.' : 'Vigilar crecimiento.');
  } else {
    estado = 'ok';
    texto = 'Carga de la rama ~' + cargaM + 'M · puerto ' + cap + 'M (' + usoPct + '%). Adecuado.';
  }
  return { usoPct: usoPct, estado: estado, texto: texto, sugeridoM: sugeridoM, cargaM: cargaM, cap: cap, totales: t };
};

RN.nodos.abrirNuevo = function (padreId) {
  RN.nodos._editId = null;
  RN.nodos._formModal(null, padreId || null);
};

RN.nodos.abrirEditar = function (id) {
  var n = RN.nodos.porId(id);
  if (!n) { RN.notifyUI.toast('Nodo no encontrado', 'error'); return; }
  RN.nodos._editId = id;
  RN.nodos._formModal(n, n.padreId || null);
};

RN.nodos._formModal = function (nodo, padrePref) {
  var tipos = RN.nodos.TIPOS.map(function (t) {
    return '<option value="' + t + '"' + (nodo && nodo.tipo === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');
  var puertos = RN.nodos.PUERTOS.map(function (p) {
    var sel = nodo ? (+nodo.capacidadPuertoM === p.v) : (p.v === 1000);
    return '<option value="' + p.v + '"' + (sel ? ' selected' : '') + '>' + p.label + '</option>';
  }).join('');
  var editId = nodo ? nodo.id : null;
  var padres = RN.nodos.padresPosibles(editId);
  var padreOpts = '<option value="">— Ninguno (nodo raíz / principal) —</option>' + padres.map(function (p) {
    var sel = (padrePref && padrePref === p.id) || (nodo && nodo.padreId === p.id);
    return '<option value="' + RN.render.escAttr(p.id) + '"' + (sel ? ' selected' : '') + '>' + RN.render.esc(p.nombre) + '</option>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>' + (nodo ? 'Editar nodo' : 'Nuevo nodo') + '</h3>'
    + '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>'
    + '<div class="modal-body">'
    + '<p class="muted" style="font-size:13px;margin:0 0 12px">Punto de agregación (AP, router, switch). La carga de la <strong>rama</strong> (este nodo + hijos) decide 100M vs 1G.</p>'
    + '<div class="form-row"><div><label>Nombre *</label><input id="nodo-nombre" value="' + RN.render.esc(nodo ? nodo.nombre : '') + '" placeholder="Ej: Torre Norte, AP Centro" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div></div>'
    + '<div class="form-row cols-2">'
    +   '<div><label>Tipo</label><select id="nodo-tipo">' + tipos + '</select></div>'
    +   '<div><label>Capacidad del puerto</label><select id="nodo-cap">' + puertos + '</select></div>'
    + '</div>'
    + '<div class="form-row"><div><label>Cuelga de (nodo padre)</label><select id="nodo-padre">' + padreOpts + '</select>'
    + '<span class="muted" style="font-size:12px">El principal suma la carga de todos los hijos.</span></div></div>'
    + '<div class="form-row"><div><label>Notas</label><input id="nodo-notas" value="' + RN.render.esc(nodo ? (nodo.notas || '') : '') + '" placeholder="Modelo instalado, ubicación…" spellcheck="true"></div></div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>'
    + '<button class="btn primary" onclick="RN.nodos.guardar()">' + (nodo ? 'Guardar' : 'Crear nodo') + '</button></div>';
  RN.uiComponents.modal(html);
};

RN.nodos.guardar = function () {
  var nombre = (document.getElementById('nodo-nombre').value || '').trim();
  if (!nombre) { RN.notifyUI.toast('El nombre es obligatorio', 'error'); return; }
  var tipo = (document.getElementById('nodo-tipo') || {}).value || 'AP';
  var cap = parseInt((document.getElementById('nodo-cap') || {}).value, 10) || 1000;
  var padreId = (document.getElementById('nodo-padre') || {}).value || null;
  if (padreId === '') padreId = null;
  var notas = (document.getElementById('nodo-notas') || {}).value || '';
  notas = notas.trim();

  RN.nodos.asegurarState();
  var editId = RN.nodos._editId;
  if (editId) {
    var n = RN.nodos.porId(editId);
    if (!n) { RN.notifyUI.toast('Nodo no encontrado', 'error'); return; }
    // validar padre no crea ciclo
    if (padreId) {
      var rama = RN.nodos.idsRama(editId);
      if (rama.indexOf(padreId) >= 0) {
        RN.notifyUI.toast('No puedes colgar un nodo bajo sí mismo o un hijo', 'error');
        return;
      }
    }
    n.nombre = nombre;
    n.tipo = tipo;
    n.capacidadPuertoM = cap;
    n.padreId = padreId;
    n.notas = notas;
  } else {
    RN.state.nodos.push({
      id: RN.calc.uid('nodo'),
      nombre: nombre,
      tipo: tipo,
      capacidadPuertoM: cap,
      padreId: padreId,
      notas: notas,
      fecha: new Date().toISOString()
    });
  }
  RN.nodos._editId = null;
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  if (RN.render.red) RN.render.red();
  RN.notifyUI.toast(editId ? 'Nodo actualizado' : 'Nodo creado', 'success');
};

RN.nodos.eliminar = function (id) {
  var n = RN.nodos.porId(id);
  if (!n) return;
  var hijos = RN.nodos.hijosDirectos(id);
  var cli = RN.nodos.clientesDirectos(id);
  var msg = '¿Eliminar el nodo «' + n.nombre + '»?';
  if (hijos.length) msg += ' Tiene ' + hijos.length + ' nodo(s) hijo; pasarán a raíz.';
  if (cli.length) msg += ' ' + cli.length + ' cliente(s) quedarán sin nodo.';
  RN.uiComponents.confirm('Eliminar nodo', msg, function () {
    // reparent hijos a null (raíz)
    RN.nodos.hijosDirectos(id).forEach(function (h) { h.padreId = null; });
    // desasignar clientes
    (RN.state.clients || []).forEach(function (c) {
      if (c.nodoId === id) c.nodoId = null;
    });
    RN.state.nodos = RN.nodos.lista().filter(function (x) { return x.id !== id; });
    RN.storageLocal.guardar();
    if (RN.render.red) RN.render.red();
    RN.notifyUI.toast('Nodo eliminado', 'warn');
  }, { danger: true });
};

RN.nodos.verClientes = function (id) {
  var n = RN.nodos.porId(id);
  if (!n) return;
  var t = RN.nodos.totales(id);
  var directos = RN.nodos.clientesDirectos(id);
  var rows = directos.length ? directos.map(function (c) {
    var m = 0, la = '—';
    try { m = RN.cola.megasDe(c) || 0; } catch (e) {}
    try {
      if (RN.cola.tieneCola(c)) la = RN.cola.formatoVel(RN.cola.datos(c).limitAtKbps || 0);
    } catch (e2) {}
    return '<div class="acc-row" style="padding:6px 0;border-bottom:1px solid var(--border)">'
      + '<span class="acc-label">' + RN.render.esc(c.nombre) + '</span>'
      + '<span class="acc-value">' + m + 'M · LA ' + la + '</span></div>';
  }).join('') : '<p class="muted">Ningún cliente colgado directamente en este nodo.</p>';

  var hijos = RN.nodos.hijosDirectos(id);
  var hijosHtml = hijos.length
    ? '<p class="muted" style="font-size:12px;margin:12px 0 4px">Nodos hijos: ' + hijos.map(function (h) {
        var th = RN.nodos.totales(h.id);
        return RN.render.esc(h.nombre) + ' (' + th.rama.limitAtM + 'M rama)';
      }).join(', ') + '</p>'
    : '';

  var html =
    '<div class="modal-header"><h3>' + RN.render.esc(n.nombre) + '</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>'
    + '<div class="modal-body">'
    + '<p style="font-size:13px">Directos: <strong>' + t.directo.clientes + '</strong> cli · <strong>' + t.directo.megas + 'M</strong> · LA <strong>' + t.directo.limitAtM + 'M</strong><br>'
    + 'Rama completa: <strong>' + t.rama.clientes + '</strong> cli · <strong>' + t.rama.megas + 'M</strong> · LA <strong>' + t.rama.limitAtM + 'M</strong></p>'
    + hijosHtml
    + '<div class="muted" style="font-size:12px;font-weight:600;margin:8px 0 4px">Clientes en este nodo</div>'
    + rows
    + '</div>'
    + '<div class="modal-footer"><button class="btn" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>';
  RN.uiComponents.modal(html);
};

/** HTML de la zona Nodos para la vista Red. */
RN.nodos.renderPanel = function (container) {
  if (!container) return;
  RN.nodos.asegurarState();
  var lista = RN.nodos.lista().slice().sort(function (a, b) {
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');
  });

  var head =
    '<div class="flex wrap" style="gap:8px;margin-bottom:12px;align-items:center">'
    + '<p class="muted" style="font-size:13px;margin:0;flex:1">Puntos de agregación. El <strong>principal</strong> suma la carga de toda su rama para decidir 100M vs 1G.</p>'
    + '<button type="button" class="btn primary sm" onclick="RN.nodos.abrirNuevo()">+ Nuevo nodo</button>'
    + '</div>';

  if (!lista.length) {
    container.innerHTML = head + '<div class="acc-empty" style="padding:12px"><div class="icon">📡</div>Aún no hay nodos. Crea el principal y luego los AP/sectores que cuelgan de él.</div>';
    return;
  }

  // raíces primero, luego indentación visual por profundidad
  var byParent = {};
  lista.forEach(function (n) {
    var k = n.padreId || '_root';
    if (!byParent[k]) byParent[k] = [];
    byParent[k].push(n);
  });

  var ordered = [];
  function walk(pid, depth) {
    var arr = byParent[pid === null ? '_root' : pid] || [];
    arr.forEach(function (n) {
      ordered.push({ n: n, depth: depth });
      walk(n.id, depth + 1);
    });
  }
  walk(null, 0);
  // nodos huérfanos (padre borrado)
  lista.forEach(function (n) {
    if (n.padreId && !RN.nodos.porId(n.padreId) && !ordered.some(function (o) { return o.n.id === n.id; })) {
      ordered.push({ n: n, depth: 0 });
    }
  });

  var cards = ordered.map(function (o) {
    var n = o.n;
    var rec = RN.nodos.recomendacion(n);
    var t = rec.totales;
    var badge = rec.estado === 'bad' ? 'due' : (rec.estado === 'warn' ? 'warn' : 'ok');
    var pad = o.depth ? ('padding-left:' + Math.min(o.depth * 12, 36) + 'px') : '';
    var padreTxt = n.padreId && RN.nodos.porId(n.padreId)
      ? ' · bajo ' + RN.nodos.porId(n.padreId).nombre
      : (o.depth === 0 ? ' · raíz' : '');
    var capLabel = (+n.capacidadPuertoM >= 1000) ? ((n.capacidadPuertoM / 1000) + 'G') : (n.capacidadPuertoM + 'M');

    return '<div class="nodo-card" style="' + pad + '">'
      + '<div class="nodo-card-head">'
      +   '<div><strong>' + RN.render.esc(n.nombre) + '</strong> <span class="badge ' + badge + '">' + RN.render.esc(n.tipo || 'Nodo') + '</span>'
      +   '<div class="muted" style="font-size:12px">Puerto ' + capLabel + padreTxt + '</div></div>'
      +   '<div class="nodo-card-metrics">'
      +     '<div class="amt">' + t.rama.limitAtM + 'M</div>'
      +     '<div class="lbl">Limit At rama</div>'
      +   '</div>'
      + '</div>'
      + '<div class="muted" style="font-size:12px;margin:6px 0">'
      +   t.rama.clientes + ' cli en rama'
      +   (t.directo.clientes !== t.rama.clientes ? ' (' + t.directo.clientes + ' directos)' : '')
      +   ' · ' + t.rama.megas + 'M vendidos · uso puerto ~' + rec.usoPct + '%'
      + '</div>'
      + '<div style="font-size:12px;margin-bottom:8px;color:' + (rec.estado === 'bad' ? 'var(--danger)' : (rec.estado === 'warn' ? 'var(--warn)' : 'var(--text-muted)')) + '">'
      +   RN.render.esc(rec.texto)
      + '</div>'
      + '<div class="flex wrap" style="gap:6px">'
      +   '<button type="button" class="btn sm" onclick="RN.nodos.verClientes(\'' + RN.render.escAttr(n.id) + '\')">Ver</button>'
      +   '<button type="button" class="btn sm" onclick="RN.nodos.abrirEditar(\'' + RN.render.escAttr(n.id) + '\')">Editar</button>'
      +   '<button type="button" class="btn sm" onclick="RN.nodos.abrirNuevo(\'' + RN.render.escAttr(n.id) + '\')">+ Hijo</button>'
      +   '<button type="button" class="btn sm danger" onclick="RN.nodos.eliminar(\'' + RN.render.escAttr(n.id) + '\')">Eliminar</button>'
      + '</div>'
      + '</div>';
  }).join('');

  container.innerHTML = head + cards;
};
