/**
 * apk.js — Descarga de la app Android (APK) desde el repositorio de releases.
 *
 * La app web (PWA) y el APK viven en repositorios separados:
 *   - Web:    https://github.com/leolhf/AdminRed
 *   - Android: https://github.com/leolhf/AdminRed-Android
 *
 * El APK se compila y publica automáticamente con GitHub Actions cada vez
 * que se sube un cambio al repo Android. Aquí solo enlazamos a esas releases.
 *
 * En modo nativo (dentro del APK) esta tarjeta no tiene sentido, así que se
 * oculta automáticamente.
 */
RN.apk = RN.apk || {};

// Repositorio donde GitHub Actions publica los APK.
RN.apk.REPO = 'leolhf/AdminRed-Android';
RN.apk.URL_RELEASES = 'https://github.com/leolhf/AdminRed-Android/releases';
RN.apk.URL_ULTIMA = 'https://github.com/leolhf/AdminRed-Android/releases/latest';

/**
 * Descarga la última versión del APK.
 * Enlaza a la release "latest" del repo Android, que siempre apunta al APK
 * más reciente publicado por GitHub Actions.
 */
RN.apk.descargar = function () {
  // En modo nativo ya estamos dentro de la app: no tiene sentido descargarla.
  if (RN.platform && RN.platform.esNativo && RN.platform.esNativo()) {
    RN.notifyUI.toast('Ya estás usando la app Android.', 'info');
    return;
  }

  RN.uiComponents.confirm(
    '📲 Descargar app Android',
    'Se abrirá la página de descarga del APK más reciente. ' +
    'Descarga el archivo .apk y ábrelo en tu teléfono para instalarlo.\n\n' +
    'Nota: Android puede pedirte permitir "instalar apps de origen desconocido". Es normal.',
    function () {
      window.open(RN.apk.URL_ULTIMA, '_blank', 'noopener');
      RN.apk._actualizarStatus('Abriendo la página de descarga…');
    }
  );
};

/**
 * Abre la lista completa de versiones (releases) del repo Android.
 */
RN.apk.verVersiones = function () {
  window.open(RN.apk.URL_RELEASES, '_blank', 'noopener');
  RN.apk._actualizarStatus('Abriendo el historial de versiones…');
};

/**
 * Actualiza el texto de estado bajo los botones.
 */
RN.apk._actualizarStatus = function (texto) {
  var el = document.getElementById('apk-status');
  if (el) el.textContent = texto || '';
};

/**
 * Inicializa la tarjeta: la oculta en modo nativo y muestra la versión actual.
 */
RN.apk.init = function () {
  var card = document.getElementById('card-apk');
  if (!card) return;

  // Dentro del APK no mostramos la tarjeta de descarga.
  if (RN.platform && RN.platform.esNativo && RN.platform.esNativo()) {
    card.style.display = 'none';
    return;
  }

  RN.apk._actualizarStatus(
    'Versión web actual: v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '—') +
    '. El APK se actualiza automáticamente desde el repositorio.'
  );
};
