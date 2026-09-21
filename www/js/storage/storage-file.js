/**
 * storage/storage-file.js — Persistencia en archivo (File System Access API).
 * Con cifrado AES-GCM opcional ligado al PIN.
 * IndexedDB guarda el handle del archivo para recordarlo entre sesiones.
 *
 * Funciones públicas:
 *   RN.storageFile.restaurarHandle()  — recupera el handle de IndexedDB al iniciar
 *   RN.storageFile.vincular()         — crea/vincula un archivo nuevo
 *   RN.storageFile.abrir()            — abre un archivo existente
 *   RN.storageFile.guardarAhora()     — guarda el estado en el archivo vinculado
 *   RN.storageFile.desvincular()      — quita la vinculacion del archivo
 *   RN.storageFile.actualizarStatus() — actualiza el texto de estado en Ajustes
 */
RN.storageFile = RN.storageFile || {};

// --- IndexedDB helpers para el handle ---
function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB.NAME, IDB.VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB.STORE_FILE)) {
        req.result.createObjectStore(IDB.STORE_FILE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB.STORE_FILE)) { resolve(null); return; }
      const tx = db.transaction(IDB.STORE_FILE, 'readonly');
      const r = tx.objectStore(IDB.STORE_FILE).get(key);
      r.onsuccess = () => resolve(r.result ? r.result.value : null);
      r.onerror = () => reject(r.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbSet(store, key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB.NAME, IDB.VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB.STORE_FILE)) {
        req.result.createObjectStore(IDB.STORE_FILE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB.STORE_FILE, 'readwrite');
      tx.objectStore(IDB.STORE_FILE).put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB.NAME, IDB.VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB.STORE_FILE)) {
        req.result.createObjectStore(IDB.STORE_FILE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB.STORE_FILE)) { resolve(true); return; }
      const tx = db.transaction(IDB.STORE_FILE, 'readwrite');
      tx.objectStore(IDB.STORE_FILE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Intenta restaurar el handle del archivo guardado en IndexedDB.
 * v5.10.3: Persistencia robustosa de la vinculación entre reinicios.
 *  - Recupera el handle de IndexedDB.
 *  - Verifica/renueva el permiso (readwrite).
 *  - Si tiene permiso, VALIDA que el archivo siga accesible leyéndolo.
 *    Si el archivo fue movido/borrado, avisa y ofrece re-vincular en vez de
 *    dejar un handle "fantasma" que falla al guardar.
 *  - Si el permiso no estaba concedido, intenta solicitarlo; si requiere gesto,
 *    muestra el banner flotante (el DOM ya estará listo tras el render en init).
 *
 * NOTA: Esta función NO pinta el estado visual de forma fiable si se llama antes
 * de que exista #archivo-status. init.js la llama en el paso 6 y vuelve a pintar
 * el estado en el paso 11b (tras render.todo()). Por eso aquí solo se encarga de
 * dejar RN.state.fileHandle correcto; la UI se refresca aparte.
 */
RN.storageFile.restaurarHandle = async function () {
  if (!window.showOpenFilePicker) return;
  try {
    const handle = await idbGet(IDB.STORE_FILE, 'fileHandle');
    if (!handle) return;

    // Verificar permiso de lectura/escritura
    let perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';

    if (perm === 'granted') {
      // Permiso OK: validar que el archivo siga accesible (no movido/borrado).
      const ok = await RN.storageFile._validarHandleAccesible(handle);
      if (ok) {
        RN.state.fileHandle = handle;
        // El estado visual lo pinta init.js paso 11b; aquí no forzamos actualizarStatus.
        return;
      } else {
        // El archivo ya no está accesible. Avisar y dejar el handle para que el
        // usuario re-vincule desde Ajustes. No se borra de IndexedDB por si fue
        // un error transitorio (ej. almacenamiento removible).
        RN.state.fileHandle = handle;
        RN.notifyUI.toast('El archivo vinculado no está accesible. Re-vincúlalo en Ajustes.', 'warn');
        return;
      }
    }

    // El permiso no estaba concedido: dejar el handle en memoria e intentar pedirlo.
    // requestPermission puede funcionar al inicio en algunos navegadores,
    // pero en WebView móviles (ej. com.microsoft.emmx) suele requerir gesto.
    if (handle.requestPermission) {
      try {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      } catch (e) {
        perm = 'prompt'; // requería gesto
      }
    }
    if (perm === 'granted') {
      const ok = await RN.storageFile._validarHandleAccesible(handle);
      if (ok) {
        RN.state.fileHandle = handle;
        RN.notifyUI.toast('Archivo re-vinculado: ' + handle.name, 'success');
      } else {
        RN.state.fileHandle = handle;
        RN.notifyUI.toast('El archivo vinculado no está accesible. Re-vincúlalo en Ajustes.', 'warn');
      }
    } else {
      // Permiso denegado o pendiente de gesto: guardamos el handle para que el
      // banner (que init.js paso 11b muestra) pueda concederlo con un toque.
      RN.state.fileHandle = handle;
    }
  } catch (e) {
    console.warn('storageFile.restaurarHandle:', e);
  }
};

/**
 * v5.10.3: Comprueba que un handle sigue siendo accesible intentando leer su
 * archivo. Devuelve true si se puede leer (aunque esté vacío o corrupto JSON,
 * devuelve true porque lo importante es el acceso al archivo; la corrupción de
 * contenido se maneja en abrir()). Devuelve false si el archivo fue
 * movido/renombrado/borrado o no hay permiso efectivo.
 */
RN.storageFile._validarHandleAccesible = async function (handle) {
  try {
    const file = await handle.getFile();
    // Leer al menos 1 byte para forzar el acceso real al disco.
    if (file.size > 0) {
      const buf = await file.arrayBuffer();
      return buf != null;
    }
    return true; // archivo vacío pero accesible (recién creado)
  } catch (e) {
    console.warn('storageFile._validarHandleAccesible:', e);
    return false;
  }
};

/**
 * v5.10.2: Muestra un banner flotante invitando al usuario a conceder
 * permiso para el archivo vinculado. El banner desaparece al concederlo.
 */
RN.storageFile._mostrarBannerPermiso = function (nombreArchivo) {
  // Evitar duplicados
  var existente = document.getElementById('banner-permiso-archivo');
  if (existente) existente.remove();

  var banner = document.createElement('div');
  banner.id = 'banner-permiso-archivo';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;' +
    'background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;' +
    'padding:12px 16px;display:flex;align-items:center;gap:12px;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;cursor:pointer;' +
    'animation:slideDown 0.3s ease';
  banner.innerHTML =
    '<span style="font-size:20px">📁</span>' +
    '<span style="flex:1"><strong>Archivo vinculado:</strong> ' + RN.render.esc(nombreArchivo) +
    '<br><span style="opacity:0.9;font-size:12px">Toca aqui para conceder permiso de acceso al archivo</span></span>' +
    '<span style="font-size:18px">✓</span>';

  banner.onclick = async function () {
    if (!RN.state.fileHandle) return;
    try {
      var perm = await RN.state.fileHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        RN.storageFile.actualizarStatus();
        RN.notifyUI.toast('Permiso concedido. Archivo re-vinculado: ' + RN.state.fileHandle.name, 'success');
        banner.remove();
        // Guardar inmediatamente para confirmar que funciona
        RN.storageFile.guardarAhora();
      } else {
        RN.notifyUI.toast('Permiso denegado. Podras intentarlo de nuevo mas tarde.', 'warn');
        banner.remove();
      }
    } catch (e) {
      console.warn('solicitarPermiso:', e);
      banner.remove();
    }
  };

  document.body.appendChild(banner);

  // Auto-ocultar despues de 15 segundos si no se interactua
  setTimeout(function () {
    if (document.getElementById('banner-permiso-archivo')) {
      var b = document.getElementById('banner-permiso-archivo');
      b.style.transition = 'opacity 0.5s';
      b.style.opacity = '0';
      setTimeout(function () { if (b.parentNode) b.remove(); }, 500);
    }
  }, 15000);
};

/**
 * v5.10.2: Solicita permiso para el archivo vinculado mediante un gesto.
 * Llamado desde el banner flotante o desde el boton de Ajustes.
 */
RN.storageFile.solicitarPermisoConGesto = async function () {
  if (!RN.state.fileHandle) {
    RN.notifyUI.toast('No hay archivo vinculado', 'info');
    return;
  }
  try {
    var perm = await RN.state.fileHandle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      RN.storageFile.actualizarStatus();
      var banner = document.getElementById('banner-permiso-archivo');
      if (banner) banner.remove();
      RN.notifyUI.toast('Permiso concedido: ' + RN.state.fileHandle.name, 'success');
    } else {
      RN.notifyUI.toast('Permiso denegado', 'warn');
    }
  } catch (e) {
    RN.notifyUI.toast('Error al solicitar permiso: ' + e.message, 'error');
  }
};

/** Vincula o crea un archivo de datos. */
RN.storageFile.vincular = async function () {
  if (!window.showSaveFilePicker) {
    RN.notifyUI.toast('Tu navegador no soporta File System Access API. Usa Chrome/Edge.', 'warn');
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'adminred-datos.json',
      types: [{ description: 'Archivo de datos AdminRed', accept: { 'application/json': ['.json'] } }]
    });
    RN.state.fileHandle = handle;
    await idbSet(IDB.STORE_FILE, 'fileHandle', handle);
    await RN.storageFile.guardarAhora();
    RN.notifyUI.toast('Archivo vinculado y guardado', 'success');
    RN.storageFile.actualizarStatus();
  } catch (e) {
    if (e.name !== 'AbortError') RN.notifyUI.toast('Error al vincular archivo: ' + e.message, 'error');
  }
};

/** Abre un archivo existente. */
RN.storageFile.abrir = async function () {
  if (!window.showOpenFilePicker) {
    RN.notifyUI.toast('Tu navegador no soporta File System Access API', 'warn');
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Archivo de datos AdminRed', accept: { 'application/json': ['.json'] } }]
    });
    const file = await handle.getFile();
    let buf = await file.arrayBuffer();
    let texto;
    if (RN.state.fileIsEncrypted) {
      const pin = prompt('Ingresa el PIN para descifrar el archivo:');
      if (!pin) return;
      texto = await RN.crypto.descifrar(buf, pin);
    } else {
      texto = new TextDecoder().decode(buf);
    }
    let data = JSON.parse(texto);
    data = RN.migration.migrar(data);
    RN.storageLocal._aplicarData(data);
    RN.state.fileHandle = handle;
    await idbSet(IDB.STORE_FILE, 'fileHandle', handle);
    RN.checkpoint.crear();
    RN.render.todo();
    RN.notifyUI.toast('Archivo abierto correctamente', 'success');
    RN.storageFile.actualizarStatus();
  } catch (e) {
    if (e.name !== 'AbortError') RN.notifyUI.toast('Error al abrir: ' + e.message, 'error');
  }
};

/**
 * Guarda el estado en el archivo vinculado (cifrado si hay PIN).
 * Si no hay handle, guarda en localStorage como respaldo.
 */
RN.storageFile.guardarAhora = async function () {
  if (!RN.state.fileHandle) {
    RN.storageLocal.persistir();
    RN.notifyUI.toast('Guardado en almacenamiento local', 'info');
    return;
  }
  try {
    // Verificar permiso antes de escribir
    if (RN.state.fileHandle.queryPermission) {
      const perm = await RN.state.fileHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        if (RN.state.fileHandle.requestPermission) {
          const req = await RN.state.fileHandle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            RN.notifyUI.toast('Permiso denegado para el archivo. Guardando en local.', 'warn');
            RN.storageLocal.persistir();
            return;
          }
        }
      }
    }
    // v5.13.5 (ISSUE #14): Verificar el PIN ANTES de createWritable().
    // createWritable() trunca el archivo a 0 bytes inmediatamente. Si el PIN
    // no está en memoria y el archivo está marcado como cifrado, el flujo
    // anterior cerraba el writable sin escribir → archivo quedaba VACÍO (pérdida
    // total de datos). Ahora abortamos antes de tocar el archivo.
    if (RN.state.pinHash && RN.state.fileIsEncrypted && !RN.pin._pinActual) {
      RN.notifyUI.toast('Se necesita el PIN para cifrar. Desbloquea la app primero.', 'warn');
      RN.storageLocal.persistir();  // respaldo en localStorage
      return;                        // NO se llama createWritable() → archivo intacto
    }

    const w = await RN.state.fileHandle.createWritable();
    const json = RN.storageLocal.serializar();
    let data;
    if (RN.state.pinHash && RN.state.fileIsEncrypted) {
      data = await RN.crypto.cifrar(json, RN.pin._pinActual);
    } else {
      data = new TextEncoder().encode(json);
    }
    await w.write(data);
    await w.close();
    RN.validacion.marcarLimpio();
    RN.notifyUI.toast('Guardado en archivo', 'success');
  } catch (e) {
    // Si falla la escritura del archivo, al menos persistir en localStorage
    RN.storageLocal.persistir();
    RN.notifyUI.toast('Error al guardar archivo (respaldo local OK): ' + e.message, 'error');
  }
};

/**
 * Desvincula el archivo: limpia el handle del estado y de IndexedDB.
 * Los datos se siguen guardando en localStorage.
 */
RN.storageFile.desvincular = function () {
  if (!RN.state.fileHandle) {
    RN.notifyUI.toast('No hay archivo vinculado', 'info');
    return;
  }
  RN.uiComponents.confirm(
    'Desvincular archivo',
    'Se quitara la vinculacion con el archivo. Los datos seguiran guardandose en el navegador (localStorage). El archivo en el dispositivo no se borra. ¿Continuar?',
    async () => {
      RN.state.fileHandle = null;
      try {
        await idbDelete(IDB.STORE_FILE, 'fileHandle');
      } catch (e) { /* no critico */ }
      // Asegurar que los datos queden en localStorage
      RN.storageLocal.persistir();
      RN.storageFile.actualizarStatus();
      RN.notifyUI.toast('Archivo desvinculado. Datos en almacenamiento local.', 'info');
    }
  );
};

/**
 * Actualiza el texto de estado del archivo en la vista de ajustes.
 * @param {boolean} sinPermiso — si true, muestra aviso de permiso pendiente
 *
 * v5.10.3: Si se llama sin parámetro y hay handle, comprueba el permiso
 * dinámicamente (async) para pintar "permiso pendiente" correctamente al
 * reiniciar, en vez de mostrar siempre "✅ vinculado" o nada.
 */
RN.storageFile.actualizarStatus = function (sinPermiso) {
  const el = document.getElementById('archivo-status');
  if (!el) return;
  if (RN.state.fileHandle) {
    if (sinPermiso) {
      el.innerHTML = '⚠️ Archivo vinculado: ' + RN.state.fileHandle.name + ' — <b>permiso pendiente</b>. ' +
        '<button class="btn sm primary" onclick="RN.storageFile.solicitarPermisoConGesto()" style="margin-left:8px">Conceder permiso</button>' +
        ' o <a href="#" onclick="RN.storageFile.desvincular();return false" style="margin-left:8px">desvincular</a>';
      return;
    }
    // Pintar estado optimista y, si el navegador soporta queryPermission,
    // refrescarlo para reflejar "permiso pendiente" si corresponde.
    el.textContent = '✅ Archivo vinculado: ' + RN.state.fileHandle.name + (RN.state.fileIsEncrypted ? ' (cifrado)' : '');
    if (RN.state.fileHandle.queryPermission) {
      RN.state.fileHandle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        // Volver a leer el elemento (por si se re-renderizó) y solo sobreescribir
        // si sigue siendo el mismo handle (evita parpadeos).
        const el2 = document.getElementById('archivo-status');
        if (!el2) return;
        if (perm !== 'granted') {
          el2.innerHTML = '⚠️ Archivo vinculado: ' + RN.state.fileHandle.name + ' — <b>permiso pendiente</b>. ' +
            '<button class="btn sm primary" onclick="RN.storageFile.solicitarPermisoConGesto()" style="margin-left:8px">Conceder permiso</button>' +
            ' o <a href="#" onclick="RN.storageFile.desvincular();return false" style="margin-left:8px">desvincular</a>';
        }
      }).catch(function () { /* ignorar */ });
    }
  } else {
    el.textContent = '⚠️ Sin archivo vinculado. Los datos se guardan en el navegador (localStorage).';
  }
};
