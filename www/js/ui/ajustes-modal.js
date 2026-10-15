/**
 * ui/ajustes-modal.js — v5.52.0: Ajustes como modal.
 * Antes era una pestaña (Análisis → Ajustes). Ahora se abre desde
 * ⚡ Acciones rápidas → ⚙️ Ajustes. El contenido sigue siempre en el DOM
 * (dentro de #ajustes-overlay), así que todos sus ids y funciones siguen
 * funcionando; aquí solo se muestra/oculta. Los modales que se abren desde
 * dentro (Drive, PIN, etc.) quedan por encima porque #modal-overlay va después.
 */
RN.ajustes = RN.ajustes || {};

/** ¿Está abierto el modal de Ajustes? */
RN.ajustes.estaAbierto = function () {
  var ov = document.getElementById('ajustes-overlay');
  return !!(ov && ov.classList.contains('open'));
};

/** Abre Ajustes como modal (refresca el formulario con los valores actuales). */
RN.ajustes.abrir = function () {
  var ov = document.getElementById('ajustes-overlay');
  if (!ov) return;
  if (RN.config && RN.config.rellenarForm) RN.config.rellenarForm();
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  ov.onclick = function (e) { if (e.target === ov) RN.ajustes.cerrar(); };
  var body = ov.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
};

/** Cierra el modal de Ajustes. */
RN.ajustes.cerrar = function () {
  var ov = document.getElementById('ajustes-overlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
};

// Esc cierra Ajustes, salvo que haya otro modal encima (ese se cierra primero).
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || !RN.ajustes.estaAbierto()) return;
  var otro = document.getElementById('modal-overlay');
  if (otro && otro.classList.contains('open')) return;
  RN.ajustes.cerrar();
});
