/**
 * ui/ajustes-modal.js — Ajustes como modal con pestañas (v5.55.28).
 * Grupos: Negocio · Datos · Comunicación · Sistema.
 */
RN.ajustes = RN.ajustes || {};
RN.ajustes._tab = 'negocio';
RN.ajustes._dirty = false;

RN.ajustes.estaAbierto = function () {
  var ov = document.getElementById('ajustes-overlay');
  return !!(ov && ov.classList.contains('open'));
};

RN.ajustes.tab = function (name) {
  RN.ajustes._tab = name || 'negocio';
  var panes = document.querySelectorAll('#ajustes-overlay .aj-pane');
  for (var i = 0; i < panes.length; i++) {
    var p = panes[i];
    p.style.display = (p.getAttribute('data-aj-pane') === RN.ajustes._tab) ? 'block' : 'none';
  }
  var chips = document.querySelectorAll('#ajustes-overlay .aj-tabs .chip');
  for (var j = 0; j < chips.length; j++) {
    var ch = chips[j];
    if (ch.getAttribute('data-aj-tab') === RN.ajustes._tab) ch.classList.add('active');
    else ch.classList.remove('active');
  }
  var body = document.querySelector('#ajustes-overlay .modal-body');
  if (body) body.scrollTop = 0;
};

RN.ajustes.markDirty = function () {
  RN.ajustes._dirty = true;
};

RN.ajustes.markClean = function () {
  RN.ajustes._dirty = false;
};

RN.ajustes._bindDirty = function () {
  var ov = document.getElementById('ajustes-overlay');
  if (!ov || ov._rnDirtyBound) return;
  ov._rnDirtyBound = true;
  ov.addEventListener('change', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
      RN.ajustes.markDirty();
    }
  });
  ov.addEventListener('input', function (e) {
    if (e.target && e.target.id && e.target.id.indexOf('cfg-') === 0) {
      RN.ajustes.markDirty();
    }
  });
};

RN.ajustes.abrir = function () {
  var ov = document.getElementById('ajustes-overlay');
  if (!ov) return;
  if (RN.config && RN.config.rellenarForm) RN.config.rellenarForm();
  RN.ajustes.markClean();
  RN.ajustes._bindDirty();
  RN.ajustes.tab(RN.ajustes._tab || 'negocio');
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  ov.onclick = function (e) {
    if (e.target === ov) RN.ajustes.cerrar();
  };
  var body = ov.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
};

RN.ajustes.cerrar = function () {
  if (RN.ajustes._dirty) {
    var ok = true;
    try {
      ok = window.confirm('Hay cambios de configuración sin guardar. ¿Cerrar de todos modos?');
    } catch (e) { ok = true; }
    if (!ok) return;
  }
  var ov = document.getElementById('ajustes-overlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
  RN.ajustes.markClean();
};

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || !RN.ajustes.estaAbierto()) return;
  var otro = document.getElementById('modal-overlay');
  if (otro && otro.classList.contains('open')) return;
  RN.ajustes.cerrar();
});
