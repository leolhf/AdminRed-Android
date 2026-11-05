/**
 * storage/storage-native.js — Persistencia en archivo NATIVO (Capacitor Filesystem).
 *
 * Reemplaza a storage-file.js (File System Access API) cuando la app corre
 * dentro del APK. El archivo se gestiona automáticamente en la carpeta privada
 * de la app (Directory.Data), sin pickers ni permisos manuales.
 *
 * Mantiene el MISMO contrato que RN.storageFile para que el resto de la app
 * (init.js, pin.js, storage-local.js) funcione sin cambios:
 *   RN.storageNative.restaurarHandle()
 *   RN.storageNative.vincular()
 *   RN.storageNative.abrir()
 *   RN.storageNative.guardarAhora()
 *   RN.storageNative.desvincular()
 *   RN.storageNative.actualizarStatus()
 *
 * El cifrado AES-GCM ligado al PIN se conserva idéntico (RN.crypto).
 */
RN.storageNative = RN.storageNative || {};

// Nombre del archivo de datos dentro de la carpeta privada de la app.
RN.storageNative.ARCHIVO = 'adminred-datos.json';
// Directory.Data = carpeta privada de la app (no accesible por otras apps).
RN.storageNative.DIR = 'DATA';

/** Devuelve el plugin Filesystem o null. */
RN.storageNative._fs = function () {
  return RN.platform.plugin('Filesystem');
};

// --- Conversión ArrayBuffer <-> base64 (el plugin escribe/lee base64) ---
RN.storageNative._ab2b64 = function (buf) {
  var bytes = new Uint8Array(buf);
  var bin = '';
  var chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

RN.storageNative._b642ab = function (b64) {
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

/** ¿Existe el archivo de datos nativo? */
RN.storageNative._existe = async function () {
  var fs = RN.storageNative._fs();
  if (!fs) return false;
  try {
    await fs.stat({ path: RN.storageNative.ARCHIVO, directory: RN.storageNative.DIR });
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Al iniciar: comprueba si existe el archivo nativo. Si existe, marca el
 * "handle" sentinela para que guardarAhora() escriba en él. Si NO existe,
 * lo crea automáticamente (el usuario eligió gestión automática, sin picker).
 */
RN.storageNative.restaurarHandle = async function () {
  if (!RN.platform.tieneFilesystem()) return;
  try {
    var existe = await RN.storageNative._existe();
    if (existe) {
      RN.state.fileHandle = { name: RN.storageNative.ARCHIVO, _native: true };
      return;
    }
    // Primera ejecución: crear el archivo automáticamente con el estado actual.
    RN.state.fileHandle = { name: RN.storageNative.ARCHIVO, _native: true };
    await RN.storageNative.guardarAhora(true); // silencioso
  } catch (e) {
    console.warn('storageNative.restaurarHandle:', e);
  }
};

/** Crea/asegura el archivo de datos nativo (equivale a "vincular"). */
RN.storageNative.vincular = async function () {
  if (!RN.platform.tieneFilesystem()) {
    RN.notifyUI.toast('Almacenamiento nativo no disponible', 'warn');
    return;
  }
  try {
    RN.state.fileHandle = { name: RN.storageNative.ARCHIVO, _native: true };
    await RN.storageNative.guardarAhora();
    RN.notifyUI.toast('Archivo de datos creado en la app', 'success');
    RN.storageNative.actualizarStatus();
  } catch (e) {
    RN.notifyUI.toast('Error al crear el archivo: ' + e.message, 'error');
  }
};

/**
 * Abre (lee) el archivo nativo y aplica su contenido al estado.
 * Si está cifrado, pide el PIN.
 */
RN.storageNative.abrir = async function () {
  var fs = RN.storageNative._fs();
  if (!fs) {
    RN.notifyUI.toast('Almacenamiento nativo no disponible', 'warn');
    return;
  }
  try {
    var res = await fs.readFile({ path: RN.storageNative.ARCHIVO, directory: RN.storageNative.DIR });
    var buf = RN.storageNative._b642ab(res.data);
    var texto;
    if (RN.state.fileIsEncrypted) {
      var pin = RN.pin._pinActual || prompt('Ingresa el PIN para descifrar el archivo:');
      if (!pin) return;
      texto = await RN.crypto.descifrar(buf, pin);
    } else {
      texto = new TextDecoder().decode(buf);
    }
    var data = JSON.parse(texto);
    data = RN.migration.migrar(data);
    RN.storageLocal._aplicarData(data);
    RN.state.fileHandle = { name: RN.storageNative.ARCHIVO, _native: true };
    RN.checkpoint.crear();
    RN.render.todo();
    RN.notifyUI.toast('Datos cargados desde el archivo de la app', 'success');
    RN.storageNative.actualizarStatus();
  } catch (e) {
    RN.notifyUI.toast('Error al abrir: ' + e.message, 'error');
  }
};

/**
 * Guarda el estado en el archivo nativo (cifrado si hay PIN).
 * @param {boolean} silencioso — si true, no muestra toasts (uso interno al iniciar).
 */
RN.storageNative.guardarAhora = async function (silencioso) {
  var fs = RN.storageNative._fs();
  if (!fs) {
    RN.storageLocal.persistir();
    if (!silencioso) RN.notifyUI.toast('Guardado en almacenamiento local', 'info');
    return;
  }
  try {
    // Igual que en web: si el archivo está cifrado y no hay PIN en memoria,
    // NO tocar el archivo (evita corromperlo). Respaldo en localStorage.
    if (RN.state.pinHash && RN.state.fileIsEncrypted && !RN.pin._pinActual) {
      if (!silencioso) RN.notifyUI.toast('Se necesita el PIN para cifrar. Desbloquea la app primero.', 'warn');
      RN.storageLocal.persistir();
      return;
    }

    var json = RN.storageLocal.serializar();
    var b64;
    if (RN.state.pinHash && RN.state.fileIsEncrypted) {
      var cifrado = await RN.crypto.cifrar(json, RN.pin._pinActual);
      b64 = RN.storageNative._ab2b64(cifrado);
    } else {
      // Texto plano: codificar UTF-8 a base64 para escritura uniforme.
      var bytes = new TextEncoder().encode(json);
      b64 = RN.storageNative._ab2b64(bytes.buffer);
    }

    await fs.writeFile({
      path: RN.storageNative.ARCHIVO,
      data: b64,
      directory: RN.storageNative.DIR,
      recursive: true
    });

    RN.validacion.marcarLimpio();
    if (!silencioso) RN.notifyUI.toast('Guardado en el archivo de la app', 'success');
  } catch (e) {
    RN.storageLocal.persistir();
    if (!silencioso) RN.notifyUI.toast('Error al guardar (respaldo local OK): ' + e.message, 'error');
  }
};

/** Elimina el archivo de datos nativo (los datos siguen en localStorage). */
RN.storageNative.desvincular = function () {
  RN.uiComponents.confirm(
    'Borrar archivo de datos',
    'Se eliminará el archivo de datos de la app. Los datos seguirán guardándose en el almacenamiento interno. ¿Continuar?',
    async function () {
      var fs = RN.storageNative._fs();
      try {
        if (fs) await fs.deleteFile({ path: RN.storageNative.ARCHIVO, directory: RN.storageNative.DIR });
      } catch (e) { /* no crítico */ }
      RN.state.fileHandle = null;
      RN.storageLocal.persistir();
      RN.storageNative.actualizarStatus();
      RN.notifyUI.toast('Archivo de datos eliminado. Datos en almacenamiento interno.', 'info');
    }
  );
};

/** Actualiza el texto de estado del archivo en Ajustes. */
RN.storageNative.actualizarStatus = function () {
  var el = document.getElementById('archivo-status');
  if (!el) return;
  if (RN.state.fileHandle) {
    el.textContent = '✅ Archivo de datos de la app: ' + RN.storageNative.ARCHIVO +
      (RN.state.fileIsEncrypted ? ' (cifrado)' : '') + ' — gestionado automáticamente';
  } else {
    el.textContent = '⚠️ Sin archivo de datos. Los datos se guardan en el almacenamiento interno.';
  }
};
