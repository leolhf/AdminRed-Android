/**
 * ui/busqueda-global.js — Buscador global (v5.54.1 Fase B).
 * Busca por nombre, teléfono o IP y navega al cliente / cobros.
 */
RN.busquedaGlobal = RN.busquedaGlobal || {};

RN.busquedaGlobal.buscar = function (q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return [];
  var lista = RN.state.clients || [];
  return lista.filter(function (c) {
    if (c.activo === false && q.indexOf('inactivo') < 0) {
      // include inactive only if query matches name strongly
    }
    var nom = String(c.nombre || '').toLowerCase();
    var tel = String(c.telefono || '').replace(/\s+/g, '');
    var ip = String(c.ip || '');
    var qq = q.replace(/\s+/g, '');
    return nom.indexOf(q) >= 0
      || tel.indexOf(qq) >= 0
      || ip.indexOf(q) >= 0
      || (c.direccion && String(c.direccion).toLowerCase().indexOf(q) >= 0);
  }).slice(0, 12);
};

RN.busquedaGlobal.renderResultados = function (items) {
  var box = document.getElementById('busqueda-global-resultados');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<div class="bg-empty muted">Sin resultados</div>';
    box.hidden = false;
    return;
  }
  box.innerHTML = items.map(function (c) {
    var st = '';
    try { st = RN.calc.getStatus(c); } catch (e) {}
    var sub = [];
    if (c.ip) sub.push(RN.render.esc(c.ip));
    if (c.telefono) sub.push(RN.render.esc(c.telefono));
    return '<button type="button" class="bg-item" data-id="' + RN.render.escAttr(c.id) + '">' +
      '<span class="bg-name">' + RN.render.esc(c.nombre) +
      (c.activo === false ? ' <span class="muted">(inactivo)</span>' : '') + '</span>' +
      '<span class="bg-sub muted">' + sub.join(' · ') +
      (st ? ' · ' + st : '') + '</span></button>';
  }).join('');
  box.hidden = false;
  box.querySelectorAll('.bg-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      RN.busquedaGlobal.abrirCliente(btn.getAttribute('data-id'));
    });
  });
};

RN.busquedaGlobal.abrirCliente = function (id) {
  RN.busquedaGlobal.cerrar();
  try {
    RN.tabs.ir('clientes');
    setTimeout(function () {
      if (RN.modalCliente && RN.modalCliente.editar) RN.modalCliente.editar(id);
    }, 100);
  } catch (e) {
    if (RN.modalCliente) RN.modalCliente.editar(id);
  }
};

RN.busquedaGlobal.cerrar = function () {
  var box = document.getElementById('busqueda-global-resultados');
  var inp = document.getElementById('busqueda-global');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  if (inp) inp.value = '';
};

RN.busquedaGlobal.init = function () {
  var inp = document.getElementById('busqueda-global');
  var box = document.getElementById('busqueda-global-resultados');
  if (!inp) return;
  var timer;
  inp.addEventListener('input', function () {
    clearTimeout(timer);
    var v = inp.value;
    timer = setTimeout(function () {
      if (!String(v).trim()) { RN.busquedaGlobal.cerrar(); if (inp) inp.value = v; return; }
      RN.busquedaGlobal.renderResultados(RN.busquedaGlobal.buscar(v));
    }, 180);
  });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') RN.busquedaGlobal.cerrar();
    if (e.key === 'Enter') {
      var items = RN.busquedaGlobal.buscar(inp.value);
      if (items.length) RN.busquedaGlobal.abrirCliente(items[0].id);
    }
  });
  document.addEventListener('click', function (e) {
    var wrap = document.getElementById('busqueda-global-wrap');
    if (wrap && !wrap.contains(e.target)) {
      if (box) box.hidden = true;
    }
  });
};
