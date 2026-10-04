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

/* ============================================================
 * v5.46.0 — Submenú plegable con cierre automático.
 * Al tocar 🏠 Operación / 💰 Finanzas / 📊 Análisis se despliega el menú de ese
 * grupo; se pliega solo tras RN.tabs.MENU_MS (3 s) sin actividad en la barra de
 * pestañas (toques, desplazamiento del submenú, teclado), al tocar fuera o con Esc.
 * ============================================================ */
RN.tabs.MENU_MS = 3000;
RN.tabs._menuTimer = null;

/** ¿Hay un submenú desplegado? Devuelve el grupo abierto o null. */
RN.tabs.menuAbierto = function () {
  var g = document.querySelector('.tab-group.abierto');
  return g ? g.dataset.group : null;
};

/** Pliega el submenú (y cancela el temporizador). */
RN.tabs.cerrarMenu = function () {
  clearTimeout(RN.tabs._menuTimer);
  RN.tabs._menuTimer = null;
  document.querySelectorAll('.tab-group').forEach(function (g) {
    g.classList.remove('abierto');
    var t = g.querySelector('.tab');
    if (t) t.setAttribute('aria-expanded', 'false');
  });
};

/** Reinicia la cuenta de inactividad (solo si hay un menú abierto). */
RN.tabs.reiniciarTemporizadorMenu = function () {
  if (!RN.tabs.menuAbierto()) return;
  clearTimeout(RN.tabs._menuTimer);
  RN.tabs._menuTimer = setTimeout(RN.tabs.cerrarMenu, RN.tabs.MENU_MS);
};

/** Despliega el submenú de un grupo (cierra el de los demás). */
RN.tabs.abrirMenu = function (grupo) {
  document.querySelectorAll('.tab-group').forEach(function (g) {
    var abre = g.dataset.group === grupo;
    g.classList.toggle('abierto', abre);
    var t = g.querySelector('.tab');
    if (t) t.setAttribute('aria-expanded', abre ? 'true' : 'false');
  });
  RN.tabs.reiniciarTemporizadorMenu();
};

/** Toque en 🏠 / 💰 / 📊: abre (y navega si cambia de grupo) o pliega si ya estaba abierto. */
RN.tabs.alTocarGrupo = function (grupo) {
  if (RN.tabs.grupoActivo !== grupo) {
    RN.tabs.irGrupo(grupo);
    RN.tabs.abrirMenu(grupo);
  } else if (RN.tabs.menuAbierto() === grupo) {
    RN.tabs.cerrarMenu();
  } else {
    RN.tabs.abrirMenu(grupo);
  }
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

  // v5.44.0: breadcrumb "Grupo → Vista"
  var bc = document.getElementById('breadcrumb');
  if (bc) {
    var gNom = { operacion: 'Operación', finanzas: 'Finanzas', analisis: 'Análisis' }[grupo] || '';
    var sel = document.querySelector('.subtab[data-view="' + view + '"]');
    bc.textContent = 'Estás en: ' + gNom + ' \u2192 ' + (sel ? sel.textContent : view);
  }

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
  // Click en tabs principales (grupos): despliega/pliega el submenú.
  document.querySelectorAll('.tab-group .tab').forEach(function (t) {
    // Accesibilidad: son <div>; se exponen como botones con estado desplegado/plegado.
    t.setAttribute('role', 'button');
    t.setAttribute('tabindex', '0');
    t.setAttribute('aria-haspopup', 'true');
    t.setAttribute('aria-expanded', 'false');
    t.addEventListener('click', function () {
      RN.tabs.alTocarGrupo(t.parentElement.dataset.group);
    });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); }
    });
  });

  // Click en subtabs: navega y mantiene el menú abierto 3 s más.
  document.querySelectorAll('.subtab').forEach(function (s) {
    s.addEventListener('click', function (e) {
      e.stopPropagation();
      RN.tabs.ir(s.dataset.view);
      RN.tabs.reiniciarTemporizadorMenu();
    });
  });

  // Cualquier actividad en la barra reinicia los 3 s (toque, arrastre, rueda, teclado, foco).
  var barra = document.getElementById('tabs');
  if (barra) {
    ['pointerdown', 'pointermove', 'touchmove', 'wheel', 'keydown', 'focusin'].forEach(function (ev) {
      barra.addEventListener(ev, RN.tabs.reiniciarTemporizadorMenu, { passive: true });
    });
    // El desplazamiento horizontal del submenú no burbujea: escuchar `scroll` en cada uno.
    barra.querySelectorAll('.subtabs').forEach(function (st) {
      st.addEventListener('scroll', RN.tabs.reiniciarTemporizadorMenu, { passive: true });
    });
  }

  // Tocar fuera de la barra, o Esc: plegar de inmediato.
  document.addEventListener('pointerdown', function (e) {
    if (RN.tabs.menuAbierto() && barra && !barra.contains(e.target)) RN.tabs.cerrarMenu();
  }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && RN.tabs.menuAbierto()) RN.tabs.cerrarMenu();
  });
};
