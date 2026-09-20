/**
 * pin.js — PIN de acceso a la app.
 * El PIN se guarda hasheado (SHA-256). El PIN en claro se mantiene en memoria
 * solo durante la sesión para cifrar/descifrar el archivo.
 */
RN.pin = RN.pin || {};

RN.pin._pinActual = null; // PIN en claro en memoria (para cifrado)

/** Verifica si hay PIN configurado. */
RN.pin.hayPin = function () {
  return !!localStorage.getItem(STORAGE_KEYS.PIN);
};

/** Muestra la pantalla de bloqueo. */
RN.pin.mostrarLock = function (esSetup) {
  const lock = document.getElementById('pin-lock');
  const label = document.getElementById('pin-label');
  const toggle = document.getElementById('pin-setup-toggle');
  const hint = document.getElementById('pin-hint');
  if (esSetup) {
    label.textContent = 'Configura tu nuevo PIN (4-8 dígitos)';
    toggle.style.display = 'none';
    hint.textContent = 'Este PIN cifrará tu archivo de datos. Si lo olvidas, no será posible recuperar el contenido.';
  } else {
    label.textContent = 'Ingresa tu PIN para acceder';
    toggle.style.display = RN.pin.hayPin() ? 'none' : 'inline-flex';
    hint.textContent = 'El archivo de datos puede estar cifrado. Si olvidas el PIN no es posible recuperar el contenido.';
  }
  lock.style.display = 'flex';
  const inp = document.getElementById('pin-input');
  inp.value = '';
  inp.focus();
  RN.pin._esSetup = esSetup;
};

/** Oculta la pantalla de bloqueo. */
RN.pin.ocultarLock = function () {
  document.getElementById('pin-lock').style.display = 'none';
};

/** Intenta desbloquear con el PIN ingresado. */
RN.pin.desbloquear = async function () {
  const inp = document.getElementById('pin-input');
  const pin = inp.value;
  if (!pin) { RN.notifyUI.toast('Ingresa el PIN', 'warn'); return; }

  if (RN.pin._esSetup) {
    // Configurando nuevo PIN (siempre con hash nuevo PBKDF2+sal)
    if (pin.length < 4) { RN.notifyUI.toast('El PIN debe tener al menos 4 dígitos', 'error'); return; }
    const hash = await RN.crypto.hashPin(pin);
    localStorage.setItem(STORAGE_KEYS.PIN, hash);
    RN.pin._pinActual = pin;
    RN.state.fileIsEncrypted = true;
    localStorage.setItem(STORAGE_KEYS.FILE_ENCRYPTED, 'true');
    // v5.13.5 (ISSUE #24): Cifrar y re-guardar el archivo existente inmediatamente.
    // Antes el archivo quedaba en texto plano hasta el próximo guardarAhora(),
    // pero fileIsEncrypted = true, causando error de descifrado al reabrir la app
    // si el usuario cerraba sin realizar ninguna operación que disparara guardado.
    if (RN.state.fileHandle && RN.storageFile && RN.storageFile.guardarAhora) {
      try {
        await RN.storageFile.guardarAhora();
      } catch (e) {
        // Si falla el cifrado del archivo, al menos el respaldo local queda OK
        RN.storageLocal.persistir();
        RN.notifyUI.toast('PIN configurado. El archivo se cifrará al próximo guardado: ' + e.message, 'warn');
      }
    } else {
      RN.storageLocal.persistir();
    }
    RN.pin.ocultarLock();
    RN.notifyUI.toast('PIN configurado. Archivo cifrado.', 'success');
    return;
  }

  // Verificando PIN existente (formato nuevo o legacy)
  const hashGuardado = localStorage.getItem(STORAGE_KEYS.PIN);
  const res = await RN.crypto.verificarPin(pin, hashGuardado);
  if (res.ok) {
    RN.pin._pinActual = pin;
    RN.pin.ocultarLock();
    RN.notifyUI.toast('Acceso concedido', 'success');
    RN.storageFile.actualizarStatus();
    // v5.11.2: si el hash era legacy (SHA-256 sin sal), re-hashear con PBKDF2+sal ahora.
    if (res.legacy) {
      try {
        const nuevoHash = await RN.crypto.hashPin(pin);
        localStorage.setItem(STORAGE_KEYS.PIN, nuevoHash);
        console.log('PIN migrado a hash PBKDF2+sal.');
      } catch (e) { /* no bloquear el desbloqueo por esto */ }
    }
  } else {
    RN.notifyUI.toast('PIN incorrecto', 'error');
    inp.value = '';
    inp.focus();
  }
};

/** Configura un nuevo PIN. */
RN.pin.configurar = function () {
  RN.pin.mostrarLock(true);
};

/** Quita el PIN. */
RN.pin.quitar = function () {
  RN.uiComponents.confirm(
    'Quitar PIN',
    'Se eliminará el PIN y el archivo ya no se cifrará. ¿Continuar?',
    () => {
      localStorage.removeItem(STORAGE_KEYS.PIN);
      localStorage.removeItem(STORAGE_KEYS.FILE_ENCRYPTED);
      RN.pin._pinActual = null;
      RN.state.fileIsEncrypted = false;
      RN.storageFile.actualizarStatus();
      RN.notifyUI.toast('PIN eliminado', 'warn');
    },
    { danger: true }
  );
};

/** Inicializa el flujo de PIN al arrancar. */
RN.pin.init = function () {
  document.getElementById('pin-unlock').addEventListener('click', RN.pin.desbloquear);
  document.getElementById('pin-setup-toggle').addEventListener('click', () => RN.pin.mostrarLock(true));
  document.getElementById('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') RN.pin.desbloquear(); });

  if (RN.pin.hayPin()) {
    RN.state.fileIsEncrypted = localStorage.getItem(STORAGE_KEYS.FILE_ENCRYPTED) === 'true';
    RN.pin.mostrarLock(false);
  }
};
