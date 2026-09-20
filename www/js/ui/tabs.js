/**
 * ui/tabs.js — Navegación por pestañas agrupadas en 3 categorías.
 * Estructura: 3 grupos (Operación, Finanzas, Análisis) con subtabs.
 */
RN.tabs = RN.tabs || {};

RN.tabs.actual = 'dashboard';
RN.tabs.grupoActivo = 'operacion';

/** Mapeo de vistas a su grupo. */
RN.tabs._vistaAGrupo = {
  dashboard:   'operacion',
  clientes:    'operacion',
  cobros:      'operacion',
  calendario:  'operacion',
  realizados:  'operacion',
  inversion:   'finanzas',
  inventario:  'finanzas',
  gastos:      'finanzas',
  descuentos:  'finanzas',
  reportes:    'analisis',
  salud:       'analisis',
  ajustes:     'analisis'
};

/** Navega a una vista concreta y actualiza la UI de tabs/subtabs. */
RN.tabs.ir = function (view) {
  RN.tabs.actual = view;
  var grupo = RN.tabs._vistaAGrupo[view] || 'operacion';
  RN.tabs.grupoActivo = grupo;

  // Activar grupo correcto
  document.querySelectorAll('.tab-group').forEach(function (g) {
    g.classList.toggle('active', g.dataset.group === grupo);
  });

  // Activar tab principal del grupo
  document.querySelectorAll('.tab-group .tab').forEach(function (t) {
    t.classList.toggle('active', t.parentElement.dataset.group === grupo);
  });

  // Activar subtab correspondiente
  document.querySelectorAll('.subtab').forEach(function (s) {
    s.classList.toggle('active', s.dataset.view === view);
  });

  // Mostrar la vista
  document.querySelectorAll('.view').forEach(function (v) {
    v.classList.toggle('active', v.id === 'view-' + view);
  });

  // Render específico de la vista
  RN.render.vista(view);

  // Scroll arriba
  window.scrollTo(0, 0);
};

/** Al hacer clic en un grupo, mostrar su primera vista. */
RN.tabs.irGrupo = function (grupo) {
  var primeraVista = {
    operacion: 'dashboard',
    finanzas: 'inversion',
    analisis: 'reportes'
  };
  // Si ya estamos en ese grupo, no hacer nada (o mantener la vista actual)
  if (RN.tabs.grupoActivo === grupo) return;
  RN.tabs.ir(primeraVista[grupo] || 'dashboard');
};

RN.tabs.init = function () {
  // Click en tabs principales (grupos)
  document.querySelectorAll('.tab-group .tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var grupo = t.parentElement.dataset.group;
      RN.tabs.irGrupo(grupo);
    });
  });

  // Click en subtabs
  document.querySelectorAll('.subtab').forEach(function (s) {
    s.addEventListener('click', function (e) {
      e.stopPropagation();
      RN.tabs.ir(s.dataset.view);
    });
  });
};
