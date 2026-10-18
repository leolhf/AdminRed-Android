/**
 * ui/theme.js — Tema fijo oscuro (v5.55.30).
 * El diseño Neo Glass asume fondo oscuro; no hay conmutador en la UI.
 */
RN.theme = RN.theme || {};

RN.theme.actual = function () {
  return 'dark';
};

RN.theme.aplicar = function () {
  document.documentElement.setAttribute('data-theme', 'dark');
  try {
    if (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.THEME) {
      localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
    } else {
      localStorage.setItem('RN_theme', 'dark');
    }
  } catch (e) {}
};

/** Compat: ignorado; siempre oscuro. */
RN.theme.toggle = function () {
  RN.theme.aplicar();
};

RN.theme.init = function () {
  RN.theme.aplicar();
};
