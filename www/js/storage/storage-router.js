/**
 * storage/storage-router.js — Enruta las llamadas de almacenamiento en archivo
 * a la implementación correcta según la plataforma:
 *   - Web (PWA):    RN.storageFile   (File System Access API)
 *   - Nativo (APK): RN.storageNative (Capacitor Filesystem)
 *
 * Se carga DESPUÉS de storage-file.js y storage-native.js. Si corre en nativo,
 * sustituye los métodos de RN.storageFile por los de RN.storageNative, de modo
 * que el resto de la app (init.js, pin.js, storage-local.js, index.html) siga
 * llamando a RN.storageFile.* sin cambios.
 */
(function () {
  if (!RN.platform || !RN.platform.esNativo()) return; // en web no hace nada

  var metodos = ['restaurarHandle', 'vincular', 'abrir', 'guardarAhora', 'desvincular', 'actualizarStatus'];
  metodos.forEach(function (m) {
    if (RN.storageNative && typeof RN.storageNative[m] === 'function') {
      RN.storageFile[m] = RN.storageNative[m].bind(RN.storageNative);
    }
  });

  // Marca para que storage-local.js sepa que hay archivo nativo (sin showSaveFilePicker).
  RN.storageFile._esNativo = true;

  console.log('[AdminRed] Almacenamiento nativo (Capacitor Filesystem) activado.');
})();
