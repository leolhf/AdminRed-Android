/**
 * pwa.js — Lógica de instalación como PWA.
 */
RN.pwa = RN.pwa || {};

RN.pwa._deferredPrompt = null;

RN.pwa.init = function () {
  // v5.21.0: En el APK nativo (Capacitor) NO registramos Service Worker.
  // Los assets ya están empaquetados localmente; el SW solo añadiría caché
  // innecesaria y posibles conflictos de actualización. La app nativa se
  // actualiza reinstalando el APK.
  if (RN.platform && RN.platform.esNativo()) {
    var btnInst = document.getElementById('btn-install');
    if (btnInst) btnInst.style.display = 'none';
    return;
  }

  // Registrar service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // v5.12.7: Detectar actualizaciones del Service Worker.
      // Cuando el navegador detecta que sw.js cambió, instala el nuevo SW
      // en segundo plano. Aquí detectamos cuando está "esperando" (waiting)
      // y avisamos al usuario para que recargue y aplique la actualización.
      if (reg.waiting) {
        RN.pwa._notificarActualizacion(reg);
      }
      reg.addEventListener('updatefound', function () {
        var nuevoSW = reg.installing;
        if (!nuevoSW) return;
        nuevoSW.addEventListener('statechange', function () {
          if (nuevoSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay un SW nuevo instalado y esperando; el usuario tiene la versión antigua activa
            RN.pwa._notificarActualizacion(reg);
          }
        });
      });
      // Si el SW actual toma el control (tras skipWaiting), recargar automáticamente
      // para que la página cargue con los assets nuevos.
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (RN.pwa._recargaPendiente) return;
        RN.pwa._recargaPendiente = true;
        window.location.reload();
      });
    }).catch(function (e) { console.warn('SW registro fallido:', e); });

    // Verificar si hay actualizaciones cada vez que la página vuelve a estar activa
    // (cambio de pestaña, regreso de background). Esto detecta nuevas versiones
    // aunque la app haya estado abierta mucho tiempo.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg) reg.update().catch(function () {});
        });
      }
    });
  }

  // Capturar evento de instalación
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    RN.pwa._deferredPrompt = e;
    const btn = document.getElementById('btn-install');
    if (btn) btn.style.display = 'inline-flex';
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-install');
    if (btn) btn.style.display = 'none';
    RN.notifyUI.toast('App instalada', 'success');
  });
};

/**
 * v5.12.7: Notifica al usuario que hay una nueva versión disponible.
 * Muestra un toast y activa el nuevo SW inmediatamente (skipWaiting) para
 * que la próxima recarga cargue los assets nuevos.
 */
RN.pwa._notificarActualizacion = function (reg) {
  // Enviar mensaje al SW esperando para que se active (skipWaiting)
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  // Marcar el badge de versión como "actualización pendiente"
  RN.pwa._marcarPendiente(true);
  // Avisar al usuario con un toast de larga duración
  RN.notifyUI.toast('⬇️ Nueva versión disponible. Recargando para actualizar…', 'info', 6000);
};

/**
 * v5.13.12: Marca/desmarca el badge de versión del header para indicar
 * visualmente que hay una actualización pendiente de aplicar.
 */
RN.pwa._marcarPendiente = function (pendiente) {
  const ver = document.getElementById('btn-version');
  if (!ver) return;
  if (pendiente) ver.classList.add('ver-update');
  else ver.classList.remove('ver-update');
};

/**
 * v5.13.12: Fuerza la búsqueda y aplicación de una actualización de la app.
 * Al pulsar el badge de versión del header:
 *  1. Pide al Service Worker que busque una nueva versión (reg.update()).
 *  2. Si ya hay un SW esperando (waiting), lo activa (SKIP_WAITING) y recarga.
 *  3. Si no hay nada esperando tras la búsqueda, avisa que está al día.
 * Es la forma manual de disparar lo mismo que ocurre automáticamente cuando
 * el navegador detecta que sw.js cambió.
 */
RN.pwa.forzarActualizacion = async function () {
  if (!('serviceWorker' in navigator)) {
    RN.notifyUI.toast('Este navegador no soporta actualizaciones automáticas', 'info');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      RN.notifyUI.toast('No hay service worker registrado. Recarga la página', 'info');
      return;
    }

    // Si ya hay un SW esperando, aplicarlo de inmediato.
    if (reg.waiting) {
      RN.notifyUI.toast('⬇️ Aplicando nueva versión…', 'info', 4000);
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      // El 'controllerchange' (gestionado en init) recarga la página solo.
      // Salvaguarda: si por algo no recarga en 3 s, forzar recarga manual.
      setTimeout(function () { if (RN.pwa._recargaPendiente) return; window.location.reload(); }, 3000);
      return;
    }

    // No hay SW esperando: buscar nuevas versiones en la red.
    RN.notifyUI.toast('🔍 Buscando actualizaciones…', 'info', 2500);
    await reg.update();

    // Tras update(), reevaluar si ahora hay un SW esperando.
    if (reg.waiting) {
      RN.notifyUI.toast('⬇️ Nueva versión encontrada. Aplicando…', 'success', 4000);
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(function () { if (RN.pwa._recargaPendiente) return; window.location.reload(); }, 3000);
    } else {
      // Nada esperando: comprobar estado instalando por si acaso.
      if (reg.installing) {
        RN.notifyUI.toast('⬇️ Descargando nueva versión… se aplicará al terminar', 'info', 4000);
      } else {
        RN.pwa._marcarPendiente(false);
        RN.notifyUI.toast('✅ Tienes la última versión (' + APP_VERSION + ')', 'success');
      }
    }
  } catch (e) {
    console.warn('forzarActualización falló:', e);
    RN.notifyUI.toast('No se pudo buscar la actualización. Revisa tu conexión', 'info');
  }
};

RN.pwa.instalar = async function () {
  if (!RN.pwa._deferredPrompt) { RN.notifyUI.toast('Usa el menú del navegador → Instalar app', 'info'); return; }
  RN.pwa._deferredPrompt.prompt();
  const choice = await RN.pwa._deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    RN.notifyUI.toast('Instalando...', 'success');
  }
  RN.pwa._deferredPrompt = null;
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'none';
};
