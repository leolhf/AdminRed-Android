/**
 * ui/tabs.js — Navegación por pestañas agrupadas (v5.54 estructura).
 * Grupos: Inicio · Operación · Dinero · Red · Análisis
 * Principio: operación diaria arriba; Red separada de cobros; Análisis = consulta.
 */
RN.tabs = RN.tabs || {};

RN.tabs.actual = 'dashboard';
RN.tabs.grupoActivo = 'inicio';

/** Mapeo de vistas a su grupo. */
RN.tabs._vistaAGrupo = {
  dashboard:   'inicio',
  clientes:    'operacion',
  cobros:      'operacion',
  calendario:  'operacion',
  realizados:  'operacion',
  caja:        'dinero',
  inversion:   'dinero',
  deudas:      'dinero',
  inventario:  'dinero',
  gastos:      'dinero',
  descuentos:  'dinero',
  red:         'red',
  reportes:    'analisis',
  salud:       'analisis',
  margen:      'analisis',
  morosos:     'analisis',
  incidencias: 'analisis'
};

/** Nombres legibles de grupo (breadcrumb). */
RN.tabs._nombreGrupo = {
  inicio:    'Inicio',
  operacion: 'Operación',
  dinero:    'Dinero',
  red:       'Red',
  analisis:  'Análisis'
};

/* ============================================================
 * v5.46.0 — Submenú plegable con cierre automático.
 * Al tocar un grupo se despliega su menú; se pliega tras RN.tabs.MENU_MS (3 s)
 * sin actividad en la barra, al tocar fuera o con Esc.
 * ============================================================ */
RN.tabs.MENU_MS = 3000;
RN.tabs._menuTimer = null;

/** ¿Hay un submenú desplegado? Devuelve el grupo abierto o null. */
RN.tabs.menuAbierto = function () {
  var s = document.querySelector('.subtabs.abierto');
  return s ? s.dataset.group : null;
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
  document.querySelectorAll('.subtabs').forEach(function (s) {
    s.classList.remove('abierto');
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
  // Paneles de submenú viven fuera de .tabs-track (v5.55.4)
  document.querySelectorAll('.subtabs').forEach(function (s) {
    s.classList.toggle('abierto', s.dataset.group === grupo);
  });
  RN.tabs.reiniciarTemporizadorMenu();
};

/** Toque en un grupo (Inicio / Operación / Dinero / Red / Análisis): abre menú o pliega. */
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
  // v5.52.0: Ajustes ya no es una pestaña, es un modal (⚡ Acciones rápidas → ⚙️ Ajustes).
  if (view === 'ajustes') { if (RN.ajustes) RN.ajustes.abrir(); return; }
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

  // Centrar el grupo activo en la barra desplazable (pantallas pequeñas)
  var grupoEl = document.querySelector('.tab-group[data-group="' + grupo + '"]');
  if (grupoEl && grupoEl.scrollIntoView) {
    try {
      grupoEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch (e) {
      grupoEl.scrollIntoView(false);
    }
  }

  // Activar subtab correspondiente
  document.querySelectorAll('.subtab').forEach(function (s) {
    s.classList.toggle('active', s.dataset.view === view);
  });

  // Mostrar la vista
  document.querySelectorAll('.view').forEach(function (v) {
    v.classList.toggle('active', v.id === 'view-' + view);
  });

  // Breadcrumb "Grupo → Vista"
  var bc = document.getElementById('breadcrumb');
  if (bc) {
    var gNom = (RN.tabs._nombreGrupo && RN.tabs._nombreGrupo[grupo]) || grupo || '';
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
    inicio:    'dashboard',
    operacion: 'clientes',
    dinero:    'caja',
    red:       'red',
    analisis:  'reportes'
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
    // Scroll de submenús y de la pista de grupos
    barra.querySelectorAll('.subtabs').forEach(function (st) {
      st.addEventListener('scroll', RN.tabs.reiniciarTemporizadorMenu, { passive: true });
    });
    var track = document.getElementById('tabs-track');
    if (track) track.addEventListener('scroll', RN.tabs.reiniciarTemporizadorMenu, { passive: true });
  }

  // Tocar fuera de la barra, o Esc: plegar de inmediato.
  document.addEventListener('pointerdown', function (e) {
    if (RN.tabs.menuAbierto() && barra && !barra.contains(e.target)) RN.tabs.cerrarMenu();
  }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && RN.tabs.menuAbierto()) RN.tabs.cerrarMenu();
  });
};
