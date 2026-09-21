/**
 * notificaciones/notifications.js — Notificaciones locales.
 *
 * v5.25.0 — Soporte NATIVO (APK) + WEB:
 *   - Dentro del APK (Capacitor) usa el plugin @capacitor/local-notifications,
 *     que lanza notificaciones REALES del sistema Android (con permiso real,
 *     canales de alta prioridad y programación en segundo plano).
 *   - En el navegador (PWA) sigue usando la Web Notifications API.
 *
 * Recordatorios de pago:
 *   - Se revisan cada 4 HORAS (RN.notify.INTERVALO_MS).
 *   - Prioridad PERMANENTE: canal de importancia MÁXIMA (5) y notificaciones
 *     "ongoing" (no se pueden deslizar para descartar) mientras haya clientes
 *     pendientes de pago.
 *   - Además, se programan avisos en SEGUNDO PLANO cada 4 h para que sigan
 *     llegando aunque la app esté cerrada.
 *
 * v5.26.0 (Opción B) — 4.º GRUPO "INICIO DE CICLO" + resolución por ciclo:
 *   - Al abrirse el ciclo del corte vigente (inicioCiclo) se avisa a sus
 *     clientes (RN.ciclos.corteVigente()/clientesPorCorte()).
 *   - notify-state.js guarda por ciclo si el aviso está resuelto: 'wa' (enviado
 *     por WhatsApp hoy -> se suprime 1 día), 'pagado'/'visto' (resuelto el ciclo).
 *   - IDs por hash de cliente (RN.notify._idCliente) y cancelación individual
 *     (RN.notify.cancelarCliente) al enviar WhatsApp o registrar el cobro.
 *
 * v5.25.1 — Recordatorios en 3 GRUPOS (alineados con el modelo v5.10.5):
 *   1. MOROSOS (getMora > 0): clientes con meses completos de atraso — prioridad
 *      máxima, con deuda TOTAL (servicio + equipo) vía deudaTotalCliente().
 *   2. COBRANZA HOY (diaPago === hoy): el recordatorio clásico del corte.
 *   3. VENCE MAÑANA (diaPago = mañana, clampado a meses cortos 29/30/31):
 *      aviso anticipado para adelantar la cobranza.
 *   Cada cliente+grupo se notifica UNA sola vez al día (deduplicación persistida
 *   en localStorage, clave 'rn_notify_ultimo'), con IDs e textos distintos por
 *   grupo. La clasificación REUTILIZA getStatus()/getMora() de calculations.js,
 *   no duplica su lógica.
 */
RN.notify = RN.notify || {};

// --- Configuración ---
// Intervalo de revisión de recordatorios: 4 horas.
RN.notify.INTERVALO_MS = 4 * 60 * 60 * 1000;

// Canales nativos (Android 8+).
RN.notify.CANAL_RECORDATORIOS = 'adminred-recordatorios';
RN.notify.CANAL_AVISOS = 'adminred-avisos';

// Rangos de IDs de notificación (Android usa enteros de 32 bits).
RN.notify.ID_RECORDATORIO_BASE = 2000; // 2000 + índice de cliente
RN.notify.ID_FONDO_BASE = 2100;        // 2100 + índice (avisos en segundo plano)
RN.notify.ID_AVISO = 3000;             // avisos generales

/** Devuelve el plugin nativo LocalNotifications, o null. */
RN.notify._ln = function () {
  return (RN.platform && RN.platform.plugin) ? RN.platform.plugin('LocalNotifications') : null;
};

/** ¿Podemos usar notificaciones nativas? (APK con el plugin disponible) */
RN.notify._esNativo = function () {
  return !!(RN.platform && RN.platform.esNativo && RN.platform.esNativo() && RN.notify._ln());
};

/**
 * Crea los canales de notificación nativos (idempotente).
 * El canal de recordatorios usa importancia MÁXIMA (5) = prioridad permanente.
 */
RN.notify._crearCanales = async function () {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    await ln.createChannel({
      id: RN.notify.CANAL_RECORDATORIOS,
      name: 'Recordatorios de pago',
      description: 'Avisos de clientes que deben pagar (prioridad alta)',
      importance: 5,      // MAX: aparece como aviso emergente, con sonido y vibración
      visibility: 1,      // visible en pantalla de bloqueo
      vibration: true,
      lights: true,
      lightColor: '#2563eb'
    });
  } catch (e) { /* el canal ya existe */ }
  try {
    await ln.createChannel({
      id: RN.notify.CANAL_AVISOS,
      name: 'Avisos de AdminRed',
      description: 'Confirmaciones y avisos generales de la app',
      importance: 3,      // DEFAULT
      visibility: 1,
      vibration: true
    });
  } catch (e) { /* el canal ya existe */ }
};

/**
 * Pide permiso para mostrar notificaciones.
 *  - APK: permiso real de Android (POST_NOTIFICATIONS en Android 13+).
 *  - Web: Web Notifications API.
 */
RN.notify.requestPermiso = async function () {
  var ln = RN.notify._ln();
  if (ln) {
    try {
      var perm = await ln.checkPermissions();
      if (!perm || perm.display !== 'granted') {
        perm = await ln.requestPermissions();
      }
      if (perm && perm.display === 'granted') {
        await RN.notify._crearCanales();
        RN.notifyUI.toast('Notificaciones activadas', 'success');
        await RN.notify.local('AdminRed', 'Notificaciones activadas correctamente', {
          canal: RN.notify.CANAL_AVISOS, id: RN.notify.ID_AVISO
        });
      } else {
        RN.notifyUI.toast('Permiso de notificaciones denegado', 'warn');
      }
      return;
    } catch (e) {
      console.warn('[notify] permiso nativo falló, usando web:', e);
    }
  }

  // Web (navegador / PWA)
  if (!('Notification' in window)) { RN.notifyUI.toast('Tu navegador no soporta notificaciones', 'warn'); return; }
  var p = await Notification.requestPermission();
  if (p === 'granted') {
    RN.notifyUI.toast('Notificaciones activadas', 'success');
    RN.notify.local('AdminRed', 'Notificaciones activadas correctamente');
  } else {
    RN.notifyUI.toast('Permiso de notificaciones denegado', 'warn');
  }
};

/**
 * Lanza una notificación local.
 *  - APK: notificación nativa del sistema (plugin LocalNotifications).
 *  - Web: Web Notifications API.
 *
 * @param {string} titulo
 * @param {string} cuerpo
 * @param {object} [opts]
 *   - id       {number}  identificador (para reemplazar/actualizar)
 *   - canal    {string}  id del canal nativo (default: avisos)
 *   - ongoing  {boolean} si true, no se puede descartar (prioridad permanente)
 *   - extra    {object}  datos extra (p. ej. { tipo: 'recordatorio' })
 */
RN.notify.local = async function (titulo, cuerpo, opts) {
  opts = opts || {};
  var ln = RN.notify._ln();
  if (ln) {
    try {
      var perm = await ln.checkPermissions();
      if (!perm || perm.display !== 'granted') return;
      await ln.schedule({
        notifications: [{
          id: opts.id || RN.notify.ID_AVISO,
          title: titulo,
          body: cuerpo,
          channelId: opts.canal || RN.notify.CANAL_AVISOS,
          smallIcon: 'ic_stat_adminred',
          ongoing: !!opts.ongoing,
          autoCancel: !opts.ongoing,
          extra: opts.extra || null
        }]
      });
      return;
    } catch (e) {
      console.warn('[notify] notificación nativa falló, usando web:', e);
    }
  }

  // Web
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(titulo, { body: cuerpo, icon: 'icons/icon-192.png' });
  } catch (e) { /* silencioso */ }
};

/**
 * Revisa los clientes cuyo día de pago es HOY y aún no han pagado.
 *  - Muestra una notificación por cliente (prioridad permanente).
 *  - Programa (o cancela) los avisos en segundo plano cada 4 h.
 * Se llama al arrancar y cada 4 horas.
 */
/** Clave del día de HOY (YYYY-MM-DD) para la deduplicación de recordatorios. */
RN.notify._claveHoy = function () {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
};

/** ¿Ya se le notificó hoy a este cliente en este grupo? (mora | hoy | manana) */
RN.notify._yaNotificado = function (clienteId, grupo) {
  try {
    var reg = JSON.parse(localStorage.getItem('rn_notify_ultimo') || '{}');
    return reg[clienteId + '|' + grupo] === RN.notify._claveHoy();
  } catch (e) { return false; }
};

/** Marca cliente+grupo como notificado HOY (y poda las claves de días pasados). */
RN.notify._marcarNotificado = function (clienteId, grupo) {
  try {
    var reg = JSON.parse(localStorage.getItem('rn_notify_ultimo') || '{}');
    var hoy = RN.notify._claveHoy();
    Object.keys(reg).forEach(function (k) { if (reg[k] !== hoy) delete reg[k]; });
    reg[clienteId + '|' + grupo] = hoy;
    localStorage.setItem('rn_notify_ultimo', JSON.stringify(reg));
  } catch (e) { /* silencioso */ }
};

/** Días del mes actual (para el clamp del "vence mañana" en meses de 28/29/30). */
RN.notify._diasDelMes = function () {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

/**
 * v5.26.0 (Opción B): ID ESTABLE por cliente+grupo (2000..2099).
 * Antes se usaba 2000 + índice del array, lo que reasignaba una notificación
 * a otro cliente cuando cambiaba la composición del grupo (ln.schedule
 * reemplaza por id). Con un hash del clienteId, cada aviso es del mismo dueño.
 */
RN.notify._idCliente = function (clienteId, grupo) {
  var s = String(clienteId) + '|' + grupo;
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 100; }
  return RN.notify.ID_RECORDATORIO_BASE + h; // 2000..2099
};

/** IDs de los 4 grupos de un cliente (para cancelar todos sus avisos). */
RN.notify._idsCliente = function (clienteId) {
  return ['mora', 'hoy', 'manana', 'ciclo'].map(function (g) {
    return { id: RN.notify._idCliente(clienteId, g) };
  });
};

/**
 * v5.26.0 (Opción B): cancela los recordatorios de UN cliente concreto.
 * Se llama al enviar por WhatsApp y al registrar el cobro, para que su aviso
 * permanente desaparezca de inmediato (antes sólo se cancelaba si el total
 * global quedaba en 0).
 */
RN.notify.cancelarCliente = async function (clienteId) {
  var ln = RN.notify._ln();
  if (!ln || !ln.cancel) return;
  try { await ln.cancel({ notifications: RN.notify._idsCliente(clienteId) }); }
  catch (e) { /* silencioso */ }
};

/**
 * Revisa los clientes y lanza recordatorios en 3 grupos (v5.25.1):
 *   - MOROSOS: getMora(c) > 0 (meses completos de atraso, modelo v5.10.5).
 *   - HOY: su día de pago es HOY y no han pagado (getStatus ≠ paid).
 *   - MAÑANA: su día de pago es mañana (clampado al último día del mes)
 *     y aún no han pagado nada este mes.
 * La clasificación reutiliza getStatus()/getMora()/deudaTotalCliente() de
 * calculations.js. Cada cliente+grupo se notifica máx. 1 vez por día.
 * Se llama al arrancar y cada 4 horas.
 */
RN.notify.revisarRecordatorios = async function () {
  try {
    var mes = RN.calc.mesActualStr();
    var hoy = new Date().getDate();
    var diasMes = RN.notify._diasDelMes();
    var manana = (hoy + 1 <= diasMes) ? hoy + 1 : 0; // 0 = cruzamos de mes: sin aviso de "mañana"

    var morosos = [], cobranHoy = [], venceManana = [], enCiclo = [];

    // v5.26.0 (Opción B): CORTE VIGENTE -> clientes de ese corte que van a pagar.
    // Se avisa desde el INICIO del ciclo (inicioCiclo <= hoy < diaPago); el día
    // de pago lo cubre el grupo 'hoy'. Se saltan los ya resueltos (wa/pagado/visto).
    var cv = (RN.ciclos && RN.ciclos.corteVigente) ? RN.ciclos.corteVigente() : null;
    if (cv) {
      var iniC = RN.ciclos.inicioCiclo(cv.diaPago);
      if (hoy >= iniC && hoy < cv.diaPago) {
        RN.ciclos.clientesPorCorte(cv.diaPago, mes).forEach(function (c) {
          var stc = RN.calc.getStatus(c);
          if (stc === 'paid' || stc === 'inactivo' || stc === 'por-iniciar') return;
          if (RN.notifyState && RN.notifyState.estaResuelto(c.id, c.diaPago)) return;
          enCiclo.push(c);
        });
      }
    }

    RN.calc.clientesActivos().forEach(function (c) {
      var st = RN.calc.getStatus(c);
      if (st === 'paid' || st === 'inactivo' || st === 'por-iniciar') return;
      // 1) Morosos: prioridad máxima (incluye a los que además cobran hoy).
      if (RN.calc.getMora(c) > 0) { morosos.push(c); return; }
      // 2) Cobranza de hoy.
      if (c.diaPago === hoy) { cobranHoy.push(c); return; }
      // 3) Vence mañana: día de pago clampado a meses cortos (29/30/31).
      //    Incluye 'ok' (no ha pagado nada) y 'parcial' (pagó incompleto).
      var diaPagoEfectivo = Math.min(c.diaPago || 1, diasMes);
      if (manana && diaPagoEfectivo === manana && (st === 'ok' || st === 'parcial')) {
        venceManana.push(c);
      }
    });

    var total = morosos.length + cobranHoy.length + venceManana.length + enCiclo.length;
    if (!total) {
      // Nada que recordar: cancelar recordatorios previos (específicos y de fondo).
      await RN.notify._cancelarRecordatorios();
      return;
    }

    // Grupo 1: MOROSOS (IDs 2000+i). Deuda TOTAL (servicio pendiente + equipo).
    for (var i = 0; i < morosos.length; i++) {
      var cm = morosos[i];
      if (RN.notify._yaNotificado(cm.id, 'mora')) continue;
      if (RN.notifyState && RN.notifyState.estaResuelto(cm.id, cm.diaPago)) continue;
      var m = RN.calc.getMora(cm);
      await RN.notify.local(
        'Mora: ' + m + ' mes' + (m === 1 ? '' : 'es') + ' de atraso',
        cm.nombre + ' debe ' + RN.calc.formatCUP(RN.calc.deudaTotalCliente(cm, mes)) + ' en total. Toca para ver Cobranza.',
        {
          id: RN.notify._idCliente(cm.id, 'mora'),
          canal: RN.notify.CANAL_RECORDATORIOS,
          ongoing: true,
          extra: { tipo: 'recordatorio', grupo: 'mora', clienteId: cm.id }
        }
      );
      RN.notify._marcarNotificado(cm.id, 'mora');
    }

    // Grupo 2: COBRANZA HOY (IDs 2020+j).
    for (var j = 0; j < cobranHoy.length; j++) {
      var ch = cobranHoy[j];
      if (RN.notify._yaNotificado(ch.id, 'hoy')) continue;
      if (RN.notifyState && RN.notifyState.estaResuelto(ch.id, ch.diaPago)) continue;
      await RN.notify.local(
        'Pago de hoy',
        ch.nombre + ' debe pagar hoy (' + RN.calc.formatCUP(RN.calc.getPrecioNeto(ch, mes)) + ')',
        {
          id: RN.notify._idCliente(ch.id, 'hoy'),
          canal: RN.notify.CANAL_RECORDATORIOS,
          ongoing: true,
          extra: { tipo: 'recordatorio', grupo: 'hoy', clienteId: ch.id }
        }
      );
      RN.notify._marcarNotificado(ch.id, 'hoy');
    }

    // Grupo 3: VENCE MAÑANA (IDs 2040+k).
    for (var k = 0; k < venceManana.length; k++) {
      var vm = venceManana[k];
      if (RN.notify._yaNotificado(vm.id, 'manana')) continue;
      if (RN.notifyState && RN.notifyState.estaResuelto(vm.id, vm.diaPago)) continue;
      var diaCorte = Math.min(vm.diaPago || 1, diasMes);
      await RN.notify.local(
        'Vence mañana: día ' + diaCorte,
        vm.nombre + ' debe ' + RN.calc.formatCUP(RN.calc.getPrecioNeto(vm, mes)) + '. Puedes cobrarle desde hoy.',
        {
          id: RN.notify._idCliente(vm.id, 'manana'),
          canal: RN.notify.CANAL_RECORDATORIOS,
          ongoing: true,
          extra: { tipo: 'recordatorio', grupo: 'manana', clienteId: vm.id }
        }
      );
      RN.notify._marcarNotificado(vm.id, 'manana');
    }

    // Grupo 4 (v5.26.0): INICIO DE CICLO — recordatorio permanente del corte vigente.
    for (var m2 = 0; m2 < enCiclo.length; m2++) {
      var ec = enCiclo[m2];
      if (RN.notify._yaNotificado(ec.id, 'ciclo')) continue;
      await RN.notify.local(
        'Inicia tu corte (día ' + cv.diaPago + ')',
        ec.nombre + ': tu ciclo de pago está abierto. Debes ' +
          RN.calc.formatCUP(RN.calc.getPrecioNeto(ec, mes)) +
          ' antes del día ' + cv.diaPago + '.',
        {
          id: RN.notify._idCliente(ec.id, 'ciclo'),
          canal: RN.notify.CANAL_RECORDATORIOS,
          ongoing: true,
          extra: { tipo: 'recordatorio', grupo: 'ciclo', clienteId: ec.id }
        }
      );
      RN.notify._marcarNotificado(ec.id, 'ciclo');
    }

    // Avisos en segundo plano con un resumen real de los grupos.
    var nPorCobrar = cobranHoy.length + venceManana.length + enCiclo.length;
    var resumen = nPorCobrar
      ? (nPorCobrar + ' cliente' + (nPorCobrar === 1 ? '' : 's') + ' por cobrar')
      : '';
    if (morosos.length) {
      resumen += (resumen ? ' y ' : '') + morosos.length + ' en mora';
    }
    await RN.notify.programarRecordatoriosFondo(resumen);
  } catch (e) {
    console.warn('[notify] revisarRecordatorios:', e);
  }
};

/**
 * Programa avisos en SEGUNDO PLANO cada 4 horas (6 al día: 00, 04, 08, 12, 16, 20).
 * Se repiten a diario. Prioridad permanente (canal de importancia máxima).
 * @param {number} [cantidad] número de clientes pendientes (para el texto)
 */
RN.notify.programarRecordatoriosFondo = async function (textoResumen) {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    var perm = await ln.checkPermissions();
    if (!perm || perm.display !== 'granted') return;
    await RN.notify._crearCanales();

    // Cancelar programaciones de fondo previas para no duplicar.
    await RN.notify._cancelarFondo();

    var horas = [0, 4, 8, 12, 16, 20];
    // v5.25.1: acepta un resumen real ("2 clientes por cobrar y 1 en mora")
    // en lugar de solo una cantidad.
    var texto = (typeof textoResumen === 'string' && textoResumen)
      ? (textoResumen + '. Revisa AdminRed.')
      : 'Revisa los cobros pendientes de hoy en AdminRed.';

    var notifs = horas.map(function (h, i) {
      var at = new Date();
      at.setHours(h, 0, 0, 0);
      if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
      return {
        id: RN.notify.ID_FONDO_BASE + i,
        title: 'Recordatorio de cobros',
        body: texto,
        channelId: RN.notify.CANAL_RECORDATORIOS,
        smallIcon: 'ic_stat_adminred',
        ongoing: true,
        autoCancel: false,
        // FIX v5.25.1: 'repeats: true' sin 'every' en @capacitor/local-notifications
        // se comporta como avisos de UNA SOLA VEZ en Android (el plugin programa
        // una alarma y no la repite). Con every:'day' las 6 franjas horarias
        // se repiten a diario de verdad.
        schedule: { at: at, every: 'day', repeats: true, allowWhileIdle: true },
        extra: { tipo: 'recordatorio-fondo' }
      };
    });

    await ln.schedule({ notifications: notifs });
  } catch (e) {
    console.warn('[notify] programarRecordatoriosFondo:', e);
  }
};

/** Cancela los recordatorios específicos (por cliente). */
RN.notify._cancelarRecordatorios = async function () {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    var pend = await ln.getPending();
    if (!pend || !pend.notifications || !pend.notifications.length) return;
    var aCancelar = pend.notifications
      .filter(function (n) {
        return n.id >= RN.notify.ID_RECORDATORIO_BASE && n.id < RN.notify.ID_RECORDATORIO_BASE + 100;
      })
      .map(function (n) { return { id: n.id }; });
    if (aCancelar.length) await ln.cancel({ notifications: aCancelar });
  } catch (e) { /* silencioso */ }
};

/** Cancela los avisos de fondo programados. */
RN.notify._cancelarFondo = async function () {
  var ln = RN.notify._ln();
  if (!ln) return;
  try {
    var pend = await ln.getPending();
    if (!pend || !pend.notifications || !pend.notifications.length) return;
    var aCancelar = pend.notifications
      .filter(function (n) {
        return n.id >= RN.notify.ID_FONDO_BASE && n.id < RN.notify.ID_FONDO_BASE + 100;
      })
      .map(function (n) { return { id: n.id }; });
    if (aCancelar.length) await ln.cancel({ notifications: aCancelar });
  } catch (e) { /* silencioso */ }
};

/**
 * Inicializa las notificaciones:
 *  - Crea los canales nativos.
 *  - Escucha el toque sobre un recordatorio para abrir la pestaña de Cobros.
 */
RN.notify.init = function () {
  RN.notify._crearCanales();

  // FIX v5.25.1: en la APK el permiso de notificaciones nunca se pedía solo —
  // requestPermiso() estaba atado exclusivamente al botón de Ajustes
  // (index.html "🔔 Activar notificaciones"). En Android 13+ (POST_NOTIFICATIONS)
  // sin ese toque inicial, checkPermissions() devolvía 'denied' y TODAS las
  // notificaciones se descartaban en silencio (RN.notify.local hacía
  // `if (!perm || perm.display !== 'granted') return;` sin avisar).
  // En nativo pedimos el permiso una vez al arrancar (el sistema Android
  // muestra su diálogo oficial y recuerda la respuesta; es idempotente).
  if (RN.platform && RN.platform.esNativo()) {
    RN.notify.requestPermiso().then(function () {
      // FIX v5.25.1: en Android 14 (targetSdk 34) SCHEDULE_EXACT_ALARM ya no
      // viene concedida de fábrica; sin ella las programaciones exactas se
      // aplazan o no se entregan. Avisamos al usuario con instrucción clara.
      var ln2 = RN.notify._ln();
      if (ln2 && typeof ln2.checkExactNotificationSetting === 'function') {
        ln2.checkExactNotificationSetting().then(function (s) {
          if (s && s.value === 'denied') {
            RN.notifyUI.toast(
              'Para recibir recordatorios puntuales, activa "Alarmas y recordatorios" para AdminRed en Ajustes → Aplicaciones.',
              'warn', 12000
            );
          }
        }).catch(function () {});
      }
    }).catch(function () {});
  }

  var ln = RN.notify._ln();
  if (ln && ln.addListener) {
    try {
      ln.addListener('localNotificationActionPerformed', function (ev) {
        var extra = ev && ev.notification && ev.notification.extra;
        if (extra && (extra.tipo === 'recordatorio' || extra.tipo === 'recordatorio-fondo')) {
          try { RN.tabs.ir('cobros'); } catch (e) {}
        }
      });
    } catch (e) { /* no soportado */ }
  }
};
