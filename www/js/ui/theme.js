/**
 * ui/theme.js — Temas visuales claro/oscuro.
 */
RN.theme = RN.theme || {};

RN.theme.actual = function () {
  return document.documentElement.getAttribute('data-theme') || 'light';
};

RN.theme.aplicar = function (t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(STORAGE_KEYS.THEME, t);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
};

RN.theme.toggle = function () {
  RN.theme.aplicar(RN.theme.actual() === 'dark' ? 'light' : 'dark');
};

RN.theme.init = function () {
  // El lenguaje visual "Neo Glass" está diseñado sobre fondo oscuro, por lo
  // que el tema oscuro es el predeterminado. La preferencia guardada del
  // usuario tiene prioridad sobre este valor.
  const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  RN.theme.aplicar(saved);
};
