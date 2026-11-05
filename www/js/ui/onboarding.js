/**
 * ui/onboarding.js — Primeras 3 configuraciones (v5.54.2 Fase C).
 * Paquete proveedor → tasa USD → cola padre LEO.
 */
RN.onboarding = RN.onboarding || {};
RN.onboarding.KEY = 'rn_onboarding_v1_done';

RN.onboarding.yaHecho = function () {
  try { return localStorage.getItem(RN.onboarding.KEY) === '1'; } catch (e) { return false; }
};

RN.onboarding.marcarHecho = function () {
  try { localStorage.setItem(RN.onboarding.KEY, '1'); } catch (e) {}
};

RN.onboarding.necesita = function () {
  if (RN.onboarding.yaHecho()) return false;
  var cfg = RN.state.config || {};
  var sinPaquete = !(+cfg.proveedorMegas > 0) && !(+cfg.proveedorMonto > 0);
  var sinTasa = !(+cfg.tasaUsd > 0);
  var sinCola = !cfg.colaPadre;
  return sinPaquete || sinTasa || sinCola;
};

RN.onboarding.mostrarSiCorresponde = function () {
  if (!RN.onboarding.necesita()) return;
  var cfg = RN.state.config || {};
  var html = '<div class="modal-header"><h3>👋 Configuración inicial</h3>' +
    '<button class="close" onclick="RN.onboarding.saltar()">×</button></div>' +
    '<div class="modal-body">' +
    '<p class="muted">Tres datos para que la app cuadre con tu red y tus cobros:</p>' +
    '<ol style="font-size:14px;line-height:1.5;padding-left:1.2em">' +
    '<li><strong>Paquete del proveedor</strong> (megas y precio)' +
    (!(+cfg.proveedorMegas > 0) ? ' <span class="estado-pill ciclo">Falta</span>' : ' <span class="estado-pill pagado">OK</span>') + '</li>' +
    '<li><strong>Tasa USD</strong> (CUP por dólar)' +
    (!(+cfg.tasaUsd > 0) ? ' <span class="estado-pill ciclo">Falta</span>' : ' <span class="estado-pill pagado">OK</span>') + '</li>' +
    '<li><strong>Cola padre MikroTik</strong> (ej. LEO)' +
    (!cfg.colaPadre ? ' <span class="estado-pill ciclo">Falta</span>' : ' <span class="estado-pill pagado">OK</span>') + '</li>' +
    '</ol>' +
    '<p class="muted" style="font-size:12px">Puedes completarlos ahora o más tarde en Ajustes / Gestionar servicio.</p>' +
    '</div><div class="modal-footer" style="flex-wrap:wrap;gap:8px">' +
    '<button class="btn ghost" onclick="RN.onboarding.saltar()">Ahora no</button>' +
    '<button class="btn" onclick="RN.onboarding.irPaquete()">📡 Paquete</button>' +
    '<button class="btn" onclick="RN.onboarding.irTasa()">💱 Tasa</button>' +
    '<button class="btn primary" onclick="RN.onboarding.irCola()">⚙️ Cola padre</button>' +
    '</div>';
  RN.uiComponents.modal(html, {});
};

RN.onboarding.saltar = function () {
  RN.onboarding.marcarHecho();
  RN.uiComponents.cerrarModal({ todo: true });
};

RN.onboarding.irPaquete = function () {
  RN.uiComponents.cerrarModal({ todo: true });
  setTimeout(function () {
    if (RN.paqueteProveedor && RN.paqueteProveedor.abrir) RN.paqueteProveedor.abrir();
  }, 80);
};

RN.onboarding.irTasa = function () {
  RN.uiComponents.cerrarModal({ todo: true });
  setTimeout(function () {
    if (RN.tasaAviso && RN.tasaAviso.abrirModal) RN.tasaAviso.abrirModal();
    else if (RN.ajustes) RN.ajustes.abrir();
  }, 80);
};

RN.onboarding.irCola = function () {
  RN.uiComponents.cerrarModal({ todo: true });
  setTimeout(function () {
    if (RN.cola && RN.cola.abrirAjustes) RN.cola.abrirAjustes();
    else if (RN.ajustes) RN.ajustes.abrir();
  }, 80);
};
