/**
 * ui/tasa-aviso.js — Aviso de tasa USD vencida (v5.12.7).
 *
 * Al iniciar la app, comprueba cuánto tiempo pasó desde la última
 * actualización de la tasa USD (RN.state.config.fechaTasaUsd).
 *
 * Estados (degradado):
 *   - OK     (< 24 h):  sin aviso, indicador 🟢
 *   - AVISO  (24–72 h): botón flotante 🟡 "Recordar más tarde" reaparece a 24 h
 *   - URGENTE(> 72 h):  botón flotante 🔴 con animación pulse
 *
 * El botón flotante abre un modal con 3 opciones:
 *   1. Posponer 24 h  — guarda fechaPosponerTasa; el aviso reaparece pasadas 24 h
 *   2. Ingresar tasa  — prompt numérico; al guardar registra fechaTasaUsd y persiste
 *   3. Visitar elToque — abre https://tasa-cambio-cuba.vercel.app (proxy sin Cloudflare, con aviso si no hay conexión)
 *
 * Además, RN.tasaAviso.estadoTasa() devuelve 'ok'|'aviso'|'urgente'|'sintasa'
 * y RN.tasaAviso.indicadorHTML() devuelve el punto de color para mostrar en Ajustes.
 *
 * Dependencias: RN.state, RN.config, RN.moneda, RN.notifyUI, RN.uiComponents
 * Debe cargarse DESPUÉS de ui-components.js y ANTES de init.js.
 */
RN.tasaAviso = RN.tasaAviso || {};

/** Umbral en milisegundos. */
RN.tasaAviso._UMBRAL_AVISO = 24 * 60 * 60 * 1000;    // 24 h
RN.tasaAviso._UMBRAL_URGENTE = 72 * 60 * 60 * 1000;  // 72 h

/**
 * Devuelve los ms transcurridos desde la última actualización de la tasa.
 * Si nunca se actualizó (fechaTasaUsd null) devuelve Infinity (urgente).
 */
RN.tasaAviso._msTranscurridos = function () {
  var fecha = RN.state.config.fechaTasaUsd;
  if (!fecha) return Infinity;
  var t = Date.parse(fecha);
  if (isNaN(t)) return Infinity;
  return Date.now() - t;
};

/**
 * Devuelve el estado de la tasa:
 *   'sintasa'  — no hay tasa configurada (tasaUsd == 0)
 *   'ok'       — actualizada hace < 24 h
 *   'aviso'    — 24–72 h
 *   'urgente'  — > 72 h o nunca actualizada
 */
RN.tasaAviso.estadoTasa = function () {
  var tasa = RN.state.config.tasaUsd || 0;
  if (!tasa) return 'sintasa';
  var ms = RN.tasaAviso._msTranscurridos();
  if (ms < RN.tasaAviso._UMBRAL_AVISO) return 'ok';
  if (ms < RN.tasaAviso._UMBRAL_URGENTE) return 'aviso';
  return 'urgente';
};

/**
 * Devuelve true si el aviso debe mostrarse ahora (considera la posposición).
 * El usuario puede posponer el aviso 24 h; mientras no venza la posposición,
 * el botón no se muestra (pero el estado sigue siendo aviso/urgente para el
 * indicador visual).
 */
RN.tasaAviso._estaPospuesto = function () {
  var pos = RN.state.config.fechaPosponerTasa;
  if (!pos) return false;
  var t = Date.parse(pos);
  if (isNaN(t)) return false;
  return (Date.now() - t) < RN.tasaAviso._UMBRAL_AVISO;
};

/** Texto humano del tiempo transcurrido ("hace 2 h", "hace 3 días", "Nunca"). */
RN.tasaAviso.tiempoTranscurrido = function () {
  var fecha = RN.state.config.fechaTasaUsd;
  if (!fecha) return 'Nunca';
  var ms = RN.tasaAviso._msTranscurridos();
  if (ms === Infinity) return 'Nunca';
  var h = Math.floor(ms / 3600000);
  if (h < 1) {
    var m = Math.floor(ms / 60000);
    return m <= 1 ? 'Hace un momento' : 'Hace ' + m + ' min';
  }
  if (h < 24) return 'Hace ' + h + ' h';
  var d = Math.floor(h / 24);
  return d === 1 ? 'Hace 1 día' : 'Hace ' + d + ' días';
};

/**
 * Comprobación al iniciar la app. Muestra el botón flotante si la tasa está
 * vencida (aviso o urgente) y no está pospuesta. Llama a actualizarIndicador()
 * para pintar el punto de color en Ajustes.
 */
RN.tasaAviso.comprobarAlIniciar = function () {
  RN.tasaAviso.actualizarIndicador();
  var estado = RN.tasaAviso.estadoTasa();
  if (estado === 'aviso' || estado === 'urgente') {
    if (!RN.tasaAviso._estaPospuesto()) {
      RN.tasaAviso.mostrarFab();
    }
  }
};

/**
 * Muestra el botón flotante de aviso de tasa.
 * Aplica la clase de color según el estado (aviso=amber, urgente=danger).
 */
RN.tasaAviso.mostrarFab = function () {
  var fab = document.getElementById('fab-tasa');
  if (!fab) return;
  var estado = RN.tasaAviso.estadoTasa();
  fab.classList.remove('fab-tasa-aviso', 'fab-tasa-urgente');
  if (estado === 'urgente') {
    fab.classList.add('fab-tasa-urgente');
  } else {
    fab.classList.add('fab-tasa-aviso');
  }
  fab.style.display = 'flex';
};

/** Oculta el botón flotante de aviso. */
RN.tasaAviso.ocultarFab = function () {
  var fab = document.getElementById('fab-tasa');
  if (fab) fab.style.display = 'none';
};

/**
 * Abre el modal de aviso con las 3 opciones.
 * Muestra la tasa actual y el tiempo transcurrido como contexto.
 */
RN.tasaAviso.abrirModal = function () {
  var estado = RN.tasaAviso.estadoTasa();
  var tasa = RN.moneda.tasa();
  var tiempo = RN.tasaAviso.tiempoTranscurrido();
  var titulo, icono, msg;
  if (estado === 'urgente') {
    titulo = 'Tasa USD desactualizada';
    icono = '🔴';
    msg = 'La tasa USD lleva más de 72 horas sin actualizarse (' + tiempo + '). ' +
          'Los valores en USD mostrados en toda la app pueden ser incorrectos. ' +
          'Se recomienda actualizarla ahora.';
  } else {
    titulo = 'Recordatorio de tasa USD';
    icono = '🟡';
    msg = 'La tasa USD lleva más de 24 horas sin actualizarse (' + tiempo + '). ' +
          'Para mantener los cálculos en USD precisos, conviene revisarla.';
  }
  var tasaTxt = tasa
    ? 'Tasa actual: <strong>1 USD = ' + tasa + ' CUP</strong>'
    : '<strong style="color:var(--danger)">No hay tasa USD configurada</strong>';

  var html =
    '<div class="modal-header"><h3>' + icono + ' ' + RN.render.esc(titulo) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
    '<p>' + msg + '</p>' +
    '<p class="muted" style="font-size:13px;margin-bottom:16px">' + tasaTxt + '</p>' +
    '<div class="flex" style="flex-direction:column;gap:10px">' +
      '<button class="btn primary" onclick="RN.tasaAviso.ingresarTasa()">' +
        '✏️ Ingresar tasa nueva</button>' +
      '<button class="btn" onclick="RN.tasaAviso.visitarElToque()">' +
        '🌐 Ver tasa de cambio en elToque (TRMI)</button>' +
      '<button class="btn ghost" onclick="RN.tasaAviso.posponer24h()">' +
        '⏰ Recordar más tarde (en 24 h)</button>' +
    '</div>' +
    '</div>';

  RN.uiComponents.modal(html);
};

/**
 * Opción 1: Ingresar tasa nueva. Usa RN.uiComponents.prompt.
 * Al confirmar, guarda la tasa, registra la fecha y refresca todo.
 */
RN.tasaAviso.ingresarTasa = function () {
  var tasaActual = RN.moneda.tasa();
  RN.uiComponents.cerrarModal();
  RN.uiComponents.prompt(
    'Actualizar tasa USD',
    'Nueva tasa de cambio (CUP por 1 USD)',
    tasaActual || '',
    function (valor) {
      var tasa = parseFloat(valor);
      if (!tasa || tasa <= 0 || isNaN(tasa)) {
        RN.notifyUI.toast('Ingresa un valor válido mayor que 0', 'warn');
        return;
      }
      RN.state.config.tasaUsd = tasa;
      RN.state.config.fechaTasaUsd = new Date().toISOString();
      RN.state.config.fechaPosponerTasa = null; // reset posposición
      // v5.13.5 (ISSUE #18): Eliminar persistir() redundante; storageLocal.guardar()
      // serializa el estado completo (incluye config).
      RN.storageLocal.guardar && RN.storageLocal.guardar();
      RN.render.todo();
      RN.tasaAviso.ocultarFab();
      RN.tasaAviso.actualizarIndicador();
      RN.notifyUI.toast('Tasa USD actualizada: ' + tasa + ' CUP', 'success');
    },
    { type: 'number', step: '0.01' }
  );
};

/**
 * Opción 2: Visitar elToque.com. Abre en pestaña nueva.
 * Si no hay conexión, avisa en lugar de fallar silenciosamente.
 *
 * NOTA: eltoque.com está protegido por Cloudflare con verificación anti-bot
 * que bloquea el acceso cuando se abre vía window.open() desde otro sitio
 * (status 403/404). Se usa un proxy alternativo (tasa-cambio-cuba.vercel.app)
 * que muestra las mismas tasas del TRMI de elToque sin bloqueo.
 */
RN.tasaAviso.visitarElToque = function () {
  if (navigator.onLine) {
    window.open('https://tasa-cambio-cuba.vercel.app', '_blank', 'noopener');
    RN.notifyUI.toast('Abriendo tasas de cambio — vuelve e ingresa la tasa', 'info', 5000);
  } else {
    RN.notifyUI.toast('Sin conexión a internet. Conéctate y vuelve a intentarlo', 'warn', 5000);
  }
};

/**
 * Opción 3: Posponer 24 h. Guarda la fecha de posposición y oculta el FAB.
 * El aviso reaparecerá automáticamente a las 24 h (en el próximo inicio o
 * cuando se llame a comprobarAlIniciar).
 */
RN.tasaAviso.posponer24h = function () {
  RN.state.config.fechaPosponerTasa = new Date().toISOString();
  // v5.13.5 (ISSUE #18): Llamar storageLocal.guardar() para que la posposición
  // se refleje en el estado completo (localStorage[DATA]), no solo en config.
  // Antes solo persistir() guardaba config, y restaurar desde DATA podía perder
  // la posposición.
  RN.storageLocal.guardar && RN.storageLocal.guardar();
  RN.tasaAviso.ocultarFab();
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('Aviso pospuesto. Volverá a aparecer en 24 h', 'info', 4000);
};

/**
 * Pinta el indicador visual (🟢🟡🔴) junto al campo de tasa en Ajustes.
 * Busca el contenedor #tasa-indicator y actualiza su contenido.
 */
RN.tasaAviso.actualizarIndicador = function () {
  var el = document.getElementById('tasa-indicator');
  if (!el) return;
  var estado = RN.tasaAviso.estadoTasa();
  var dot, txt;
  switch (estado) {
    case 'ok':
      dot = '🟢';
      txt = 'Actualizada';
      break;
    case 'aviso':
      dot = '🟡';
      txt = 'Hace > 24 h';
      break;
    case 'urgente':
      dot = '🔴';
      txt = 'Hace > 72 h';
      break;
    default: // sintasa
      dot = '⚪';
      txt = 'Sin tasa';
  }
  var tiempo = RN.tasaAviso.tiempoTranscurrido();
  el.innerHTML =
    '<span class="tasa-dot tasa-dot-' + estado + '" title="' + txt + '"></span>' +
    '<span class="tasa-indicator-txt">' + txt + ' (' + tiempo + ')</span>';
  el.className = 'tasa-indicator tasa-indicator-' + estado;
};
