/**
 * pin.js — PIN de acceso a la app.
 * El PIN se guarda hasheado (SHA-256 / PBKDF2). El PIN en claro se mantiene en
 * memoria solo durante la sesión para cifrar/descifrar el archivo.
 *
 * v5.23.0 — Nuevo comportamiento:
 *   - El campo SOLO acepta números (se filtran letras y símbolos al escribir).
 *   - No hay botón de confirmación: al completar la longitud correcta el PIN se
 *     verifica automáticamente.
 *   - Si el PIN es correcto, se desbloquea. Si es incorrecto, el campo se borra
 *     (con una pequeña animación) para poder intentarlo de nuevo.
 *   - En modo "configurar PIN" (no hay longitud conocida todavía) se guarda
 *     automáticamente al dejar de escribir (mínimo 4 dígitos).
 */
RN.pin = RN.pin || {};

RN.pin._pinActual = null;   // PIN en claro en memoria (para cifrado)
RN.pin._esSetup = false;    // true = configurando un PIN nuevo
RN.pin._pinLen = null;      // longitud esperada del PIN (para auto-confirmar)
RN.pin._timer = null;       // temporizador de auto-guardado (modo setup)
RN.pin._verificando = false;

/** Verifica si hay PIN configurado. */
RN.pin.hayPin = function () {
  return !!localStorage.getItem(STORAGE_KEYS.PIN);
};

/** Longitud esperada del PIN guardado (o null si no se conoce). */
RN.pin._longitudGuardada = function () {
  const n = parseInt(localStorage.getItem(STORAGE_KEYS.PIN_LEN), 10);
  return (n >= 4 && n <= 8) ? n : null;
};

/** Muestra la pantalla de bloqueo. */
RN.pin.mostrarLock = function (esSetup) {
  const lock = document.getElementById('pin-lock');
  const label = document.getElementById('pin-label');
  const toggle = document.getElementById('pin-setup-toggle');
  const hint = document.getElementById('pin-hint');
  const inp = document.getElementById('pin-input');

  if (esSetup) {
    label.textContent = 'Configura tu nuevo PIN (4-8 dígitos)';
    toggle.style.display = 'none';
    hint.textContent = 'Solo números. Se guardará automáticamente al terminar de escribir. Este PIN cifrará tu archivo de datos: si lo olvidas, no será posible recuperar el contenido.';
    RN.pin._pinLen = null; // en setup aún no conocemos la longitud
  } else {
    label.textContent = 'Ingresa tu PIN para acceder';
    toggle.style.display = RN.pin.hayPin() ? 'none' : 'inline-flex';
    hint.textContent = 'Solo números. Se verifica automáticamente al completar el PIN. Si olvidas el PIN no es posible recuperar el contenido.';
    RN.pin._pinLen = RN.pin._longitudGuardada();
  }

  lock.style.display = 'flex';
  inp.value = '';
  inp.classList.remove('shake');
  inp.disabled = false;
  inp.focus();
  RN.pin._esSetup = esSetup;
  RN.pin._verificando = false;
};

/** Oculta la pantalla de bloqueo. */
RN.pin.ocultarLock = function () {
  document.getElementById('pin-lock').style.display = 'none';
};

/** Limpia el campo y muestra la animación de error. */
RN.pin._limpiarConError = function () {
  const inp = document.getElementById('pin-input');
  inp.value = '';
  inp.classList.remove('shake');
  // Forzar reflow para reiniciar la animación si se repite.
  void inp.offsetWidth;
  inp.classList.add('shake');
  inp.focus();
};

/**
 * Se ejecuta en cada pulsación del campo PIN.
 * Filtra a solo dígitos y decide cuándo verificar automáticamente.
 */
RN.pin._onInput = function () {
  const inp = document.getElementById('pin-input');

  // 1) Solo números (máx. 8 dígitos).
  const limpio = inp.value.replace(/\D/g, '').slice(0, 8);
  if (inp.value !== limpio) inp.value = limpio;

  if (RN.pin._verificando) return;

  clearTimeout(RN.pin._timer);

  if (RN.pin._esSetup) {
    // Modo configurar: guardar automáticamente al dejar de escribir (>= 4 dígitos).
    if (limpio.length >= 4) {
      RN.pin._timer = setTimeout(function () { RN.pin.desbloquear(); }, 900);
    }
    return;
  }

  // Modo desbloquear:
  if (RN.pin._pinLen) {
    // Longitud conocida: verificar en cuanto se alcanza.
    if (limpio.length === RN.pin._pinLen) {
      RN.pin.desbloquear();
    }
  } else if (limpio.length >= 4) {
    // Longitud desconocida (PIN antiguo): verificar tras una breve pausa.
    RN.pin._timer = setTimeout(function () { RN.pin.desbloquear(); }, 900);
  }
};

/** Intenta desbloquear con el PIN ingresado (o guardar, en modo setup). */
RN.pin.desbloquear = async function () {
  if (RN.pin._verificando) return;

  const inp = document.getElementById('pin-input');
  const pin = inp.value;

  if (!pin) { RN.notifyUI.toast('Ingresa el PIN', 'warn'); return; }
  if (!/^\d+$/.test(pin)) { RN.notifyUI.toast('El PIN solo admite números', 'warn'); RN.pin._limpiarConError(); return; }

  if (RN.pin._esSetup) {
    // --- Configurando nuevo PIN (siempre con hash nuevo PBKDF2+sal) ---
    if (pin.length < 4) { RN.notifyUI.toast('El PIN debe tener al menos 4 dígitos', 'error'); return; }

    RN.pin._verificando = true;
    inp.disabled = true;
    try {
      const hash = await RN.crypto.hashPin(pin);
      localStorage.setItem(STORAGE_KEYS.PIN, hash);
      localStorage.setItem(STORAGE_KEYS.PIN_LEN, String(pin.length));
      RN.pin._pinActual = pin;
      RN.state.fileIsEncrypted = true;
      localStorage.setItem(STORAGE_KEYS.FILE_ENCRYPTED, 'true');
      // v5.13.5 (ISSUE #24): Cifrar y re-guardar el archivo existente inmediatamente.
      if (RN.state.fileHandle && RN.storageFile && RN.storageFile.guardarAhora) {
        try {
          await RN.storageFile.guardarAhora();
        } catch (e) {
          RN.storageLocal.persistir();
          RN.notifyUI.toast('PIN configurado. El archivo se cifrará al próximo guardado: ' + e.message, 'warn');
        }
      } else {
        RN.storageLocal.persistir();
      }
      RN.pin.ocultarLock();
      RN.notifyUI.toast('PIN configurado. Archivo cifrado.', 'success');
    } finally {
      RN.pin._verificando = false;
      inp.disabled = false;
    }
    return;
  }

  // --- Verificando PIN existente (formato nuevo o legacy) ---
  RN.pin._verificando = true;
  inp.disabled = true;
  try {
    const hashGuardado = localStorage.getItem(STORAGE_KEYS.PIN);
    const res = await RN.crypto.verificarPin(pin, hashGuardado);
    if (res.ok) {
      RN.pin._pinActual = pin;
      // Guardar la longitud para futuros auto-confirmados.
      localStorage.setItem(STORAGE_KEYS.PIN_LEN, String(pin.length));
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
      RN.pin._limpiarConError();
    }
  } finally {
    RN.pin._verificando = false;
    inp.disabled = false;
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
      localStorage.removeItem(STORAGE_KEYS.PIN_LEN);
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
  const inp = document.getElementById('pin-input');

  // Solo números + auto-confirmado al completar la longitud.
  inp.addEventListener('input', RN.pin._onInput);
  inp.addEventListener('keydown', function (e) {
    // Bloquear cualquier tecla que no sea dígito, borrar o navegación.
    if (e.key === 'Enter') { e.preventDefault(); RN.pin.desbloquear(); return; }
    if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
  });

  document.getElementById('pin-setup-toggle').addEventListener('click', () => RN.pin.mostrarLock(true));

  if (RN.pin.hayPin()) {
    RN.state.fileIsEncrypted = localStorage.getItem(STORAGE_KEYS.FILE_ENCRYPTED) === 'true';
    RN.pin.mostrarLock(false);
  }
};
