/**
 * init.js — Inicialización de la app.
 * Depende de TODOS los módulos anteriores. Debe ser el último script clásico.
 */
RN.init = RN.init || {};

RN.init.arrancar = async function () {
  // 0. Plataforma (web vs nativo). Ajusta textos y oculta controles que no
  //    aplican en el APK (instalar PWA, etc.).
  RN.init.ajustarPlataforma();

  // 1. Tema
  RN.theme.init();

  // 2. Versión en header
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = APP_VERSION;

  // 3. Config (carga desde STORAGE_KEYS.CONFIG)
  RN.config.cargar();

  // 4. Cargar datos locales (respaldo) — carga el blob combinado de STORAGE_KEYS.DATA
  RN.storageLocal.cargar();

  // 4a. v5.13.20: Sincronizar el mes operativo con el mes real del reloj del sistema.
  // El mes operativo SIEMPRE es el mes real. Al arrancar, nos aseguramos de que
  // RN.state.mesActual refleje el mes actual del calendario (por si cambió mientras
  // la app estuvo cerrada). Esto reemplaza el sistema anterior de mes adelantado.
  RN.calc.sincronizarMesReal();

  // 4b. v5.13.16 (BUG-CRITICO): Eliminado el segundo RN.config.cargar().
  // Antes, este paso re-aplicaba STORAGE_KEYS.CONFIG después de cargar el blob
  // de STORAGE_KEYS.DATA. Pero desde v5.13.5 (ISSUE #22 y ISSUE #4) se eliminó
  // la llamada a RN.config.persistir() en config.guardar() y en
  // modal-paquete-proveedor.guardarCambios(), por lo que STORAGE_KEYS.CONFIG
  // dejó de actualizarse al guardar cambios de configuración (tasa, fondo, %,
  // paquete pendiente, etc.). Al re-aplicarla aquí al final, se sobreescribía
  // la config más reciente que venía en STORAGE_KEYS.DATA con la config stale
  // de STORAGE_KEYS.CONFIG, perdiéndose los cambios al reabrir la app.
  // Ahora STORAGE_KEYS.DATA (cargada en el paso 4) es la fuente autoritativa
  // para la configuración, ya que serializar() incluye config: RN.state.config.
  // El paso 3 (RN.config.cargar()) se mantiene como fallback inicial para el
  // caso en que STORAGE_KEYS.DATA no exista todavía (primera ejecución).

  // 4c. v5.10.3: Restaurar el flag de cifrado del archivo ANTES de tocar el handle.
  // Sin esto, al reiniciar fileIsEncrypted=false y guardar sobreescribiría un archivo
  // cifrado con texto plano, corrompiéndolo (parece que se "pierde" la vinculación).
  RN.state.fileIsEncrypted = localStorage.getItem(STORAGE_KEYS.FILE_ENCRYPTED) === 'true';

  // 5. Migración ya aplicada en cargar()

  // 6. Restaurar handle de archivo si existe (recupera de IndexedDB + valida permiso).
  // v5.10.3: NO confiar en actualizarStatus() aquí porque el DOM aún no está renderizado.
  // El estado visual se pinta en el paso 11 (render.todo) y se refresca en el paso 11b.
  await RN.storageFile.restaurarHandle();

  // 7. Datos de ejemplo si está vacío (primer uso)
  if (RN.state.clients.length === 0 && RN.state.planes.length === 0 && !localStorage.getItem('adminred:seeded')) {
    RN.init.datosEjemplo();
    localStorage.setItem('adminred:seeded', '1');
  }

  // 8. Checkpoint inicial
  RN.checkpoint.crear();

  // 9. Tasa automática
  RN.moneda.actualizarTasaAuto();

  // 10. Reloj
  RN.reloj.init();

  // 11. UI: tabs, render
  RN.tabs.init();
  RN.tabs.ir(RN.tabs.actual || 'dashboard');
  RN.render.todo();

  // 10b. v5.10.5: Aviso de cambio de mes — si hay cobros pendientes del mes
  // anterior (clientes que debían pagar el mes pasado y no lo hicieron), avisar
  // al usuario para que revise mora/cobranza. Se ejecuta tras renderizar la UI.
  setTimeout(RN.init.avisoCambioMes, 800);

  // 11b. v5.12.7: Aviso de tasa USD vencida — comprueba si pasaron más de 24 h
  // desde la última actualización de la tasa y muestra el botón flotante + indicador.
  setTimeout(function () { if (RN.tasaAviso) RN.tasaAviso.comprobarAlIniciar(); }, 1000);

  // 11b. v5.10.3: Refrescar el estado del archivo vinculado DESPUÉS de renderizar.
  // restaurarHandle() corre en el paso 6, cuando #archivo-status aún no existía,
  // por lo que el "✅ Archivo vinculado" no se pintaba al reiniciar y la UI mostraba
  // "⚠️ Sin archivo vinculado" aunque el handle sí estuviera cargado en memoria.
  // Esto es la causa raíz del bug reportado. Ahora lo pintamos con el DOM listo.
  if (RN.state.fileHandle) {
    RN.storageFile.actualizarStatus();
    // Si el permiso quedó pendiente (sin gesto al inicio), mostrar el banner.
    if (RN.state.fileHandle.queryPermission) {
      RN.state.fileHandle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm !== 'granted') {
          RN.storageFile._mostrarBannerPermiso(RN.state.fileHandle.name);
        }
      }).catch(function () { /* ignorar */ });
    }
  }

  // 11c. v5.11.2: Mostrar info del último respaldo automático en Ajustes.
  if (RN.autoBackup && RN.autoBackup.info) {
    RN.autoBackup.info().then(function (info) {
      var el = document.getElementById('autobackup-status');
      if (!el) return;
      if (info) {
        el.innerHTML = '✅ Último respaldo automático: ' + info.fecha +
          ' &middot; ' + info.clientes + ' clientes &middot; ' + info.sizeKB + ' KB (guardado local en este navegador)';
      } else {
        el.innerHTML = 'Sin respaldos automáticos aún. Se guardan solos cada vez que modificas datos.';
      }
    }).catch(function () {});
  }

  // 12. Listeners de búsqueda/filtro
  const sc = document.getElementById('search-clientes');
  // v5.13.7 (UI-5): debounce de 200ms en la busqueda para listas grandes.
  var searchTimerCli;
  if (sc) sc.addEventListener('input', () => { clearTimeout(searchTimerCli); searchTimerCli = setTimeout(() => RN.render.clientes(), 200); });
  const fe = document.getElementById('filter-estado');
  if (fe) fe.addEventListener('change', () => RN.render.clientes());
  const sCo = document.getElementById('search-cobros');
  if (sCo) sCo.addEventListener('input', () => RN.render.cobros());

  // 13. Botones de header
  const btnSave = document.getElementById('btn-save');
  if (btnSave) btnSave.addEventListener('click', () => RN.storageFile.guardarAhora());
  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.addEventListener('click', () => RN.undo.deshacer());
  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.addEventListener('click', () => RN.theme.toggle());
  const btnInstall = document.getElementById('btn-install');
  if (btnInstall) btnInstall.addEventListener('click', () => RN.pwa.instalar());
  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu) btnMenu.addEventListener('click', RN.init.menuRapido);

  // v5.13.12: Badge de versión clickeable para forzar la búsqueda/aplicación
  // de actualizaciones de la app (Service Worker).
  // v5.24.0: En modo nativo (APK) no hay Service Worker; el badge consulta
  // directamente el repositorio de releases (RN.update).
  const btnVersion = document.getElementById('btn-version');
  if (btnVersion) btnVersion.addEventListener('click', () => {
    if (RN.platform && RN.platform.esNativo()) {
      if (RN.update && RN.update.buscarAhora) RN.update.buscarAhora();
    } else {
      RN.pwa.forzarActualizacion();
    }
  });

  // FAB: botón flotante de acción rápida (móvil)
  const fab = document.getElementById('fab-action');
  if (fab) fab.addEventListener('click', () => {
    const v = RN.tabs.actual;
    if (v === 'clientes') RN.modalCliente.abrir();
    else if (v === 'gastos') RN.gastos.abrirNuevo();
    else if (v === 'inversion') RN.inversion.abrirNueva();
    else if (v === 'inventario') RN.inventario.abrirNuevoLote();
    else RN.modalCobro.abrirDesdeCobros();
  });

  // 14. PWA
  RN.pwa.init();

  // 14b. v5.21.0: Tarjeta de descarga del APK (se oculta en modo nativo).
  if (RN.apk && RN.apk.init) RN.apk.init();

  // 14c. v5.24.0: Verificación automática de actualizaciones (web y APK).
  if (RN.update && RN.update.init) RN.update.init();
  // Mostrar estado de la última comprobación en Ajustes.
  (function () {
    var el = document.getElementById('update-status');
    if (!el) return;
    var ult = parseInt(localStorage.getItem('adminred:update-last-check') || '0', 10) || 0;
    var notif = localStorage.getItem('adminred:update-notified') || '';
    var txt = 'Versión instalada: v' + APP_VERSION + '. ';
    if (ult) {
      var d = new Date(ult);
      txt += 'Última comprobación: ' + d.toLocaleString() + '.';
    } else {
      txt += 'Aún no se ha comprobado.';
    }
    if (notif) txt += ' Última versión notificada: v' + notif + '.';
    el.textContent = txt;
  })();

  // 14d. v5.29.1: Copia en Google Drive (sincronización con Apps Script).
  //      Debe ir DESPUÉS de cargar los datos locales y ANTES de las
  //      notificaciones: init() programa la comparación nube/local a los 4 s.
  if (RN.drive && RN.drive.init) RN.drive.init();

  // 15. PIN (si hay)
  RN.pin.init();

  // 16. Notificaciones periódicas (v5.25.0: cada 4 h, con soporte nativo)
  if (RN.notify && RN.notify.init) RN.notify.init();
  // Revisión inicial (tras cargar) y luego cada 4 horas.
  setTimeout(function () { try { RN.notify.revisarRecordatorios(); } catch (e) {} }, 6000);
  setInterval(RN.notify.revisarRecordatorios, RN.notify.INTERVALO_MS); // cada 4 horas

  // 17. Guardar antes de salir si hay cambios
  window.addEventListener('beforeunload', (e) => {
    if (RN.state.isDirty) {
      RN.storageLocal.persistir();
    }
  });

  console.log(`%c AdminRed (RedNet) v${APP_VERSION} iniciado `, 'background:#2563eb;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold');
};

/**
 * v5.21.0: Ajusta la UI según la plataforma.
 *  - En nativo: oculta el botón "Instalar app" (no aplica), cambia el texto de
 *    la sección "Archivo de datos" para reflejar la gestión automática.
 *  - En web: comportamiento normal de PWA.
 */
RN.init.ajustarPlataforma = function () {
  var esNativo = RN.platform && RN.platform.esNativo();
  var btnInstall = document.getElementById('btn-install');
  if (btnInstall && esNativo) btnInstall.style.display = 'none';

  var desc = document.getElementById('archivo-desc');
  if (desc && esNativo) {
    desc.textContent = 'Los datos se guardan automáticamente en un archivo cifrado dentro de la app. ' +
      'No necesitas vincular nada. Puedes exportar un respaldo JSON a la carpeta Documentos del dispositivo.';
  }
};

/** Menú rápido de acciones frecuentes. */
RN.init.menuRapido = function () {
  const html = `
    <div class="modal-header"><h3>Acciones rápidas</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="flex" style="flex-direction:column;gap:8px">
        <button class="btn" onclick="RN.init._act(()=>RN.mora.listar())">📋 Ver clientes con mora</button>
        <button class="btn" onclick="RN.init._act(()=>RN.historialMensual.ver())">📅 Historial mensual</button>
        <button class="btn" onclick="RN.init._act(()=>RN.prediccion.ver())">🔮 Predicción de ingresos</button>
        <button class="btn" onclick="RN.init._act(()=>RN.estadisticas.ver())">📊 Estadísticas del negocio</button>
        <button class="btn" onclick="RN.init._act(()=>RN.whatsapp.enviarMasivo())">💬 Recordatorio masivo WhatsApp</button>
        <button class="btn" onclick="RN.init._act(()=>RN.historial.exportCSV())">⬇️ Exportar historial CSV</button>
        <button class="btn" onclick="RN.init._act(()=>RN.export.exportCSVClientes())">⬇️ Exportar clientes CSV</button>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html);
};

RN.init._act = function (fn) {
  RN.uiComponents.cerrarModal();
  setTimeout(fn, 50);
};

/**
 * v5.10.5: Aviso de cambio de mes.
 * Detecta clientes activos que debían pagar el MES ANTERIOR (mesInicio <= mesAnterior)
 * y no tienen cobro de servicio registrado en ese mes. Si los hay, muestra un toast
 * informativo para que el usuario revise la mora/cobranza del nuevo mes.
 * Solo se muestra una vez por sesión (guarda flag en RN.state._avisoMesMostrado).
 */
RN.init.avisoCambioMes = function () {
  if (RN.state._avisoMesMostrado) return;
  RN.state._avisoMesMostrado = true;
  try {
    var mes = RN.calc.mesActualStr();
    var mesAnt = RN.calc.mesAnterior(mes);
    // Clientes que ya debían estar activos el mes anterior (mesInicio <= mesAnt)
    // y no registran cobro de servicio en el mes anterior.
    var pendientesAnt = RN.calc.clientesActivos().filter(function (c) {
      var inicio = RN.calc.mesInicioCliente(c);
      if (inicio > mesAnt) return false; // empezó este mes o después
      var pago = RN.state.history.some(function (h) {
        return h.clienteId === c.id && h.tipo === 'servicio' && h.mes === mesAnt;
      });
      return !pago;
    });
    if (pendientesAnt.length > 0) {
      var msg = pendientesAnt.length + ' cliente' + (pendientesAnt.length === 1 ? '' : 's') +
        ' no pagó el mes pasado (' + mesAnt + '). Revisa Mora y Cobranza.';
      RN.notifyUI.toast(msg, 'warn', 9000);
    }
  } catch (e) {
    console.warn('[avisoCambioMes]', e);
  }
};

/** Crea datos de ejemplo para primer uso. */
RN.init.datosEjemplo = function () {
  // Planes
  RN.state.planes = [
    { id: 'plan-hogar10', nombre: 'Hogar 10M', megas: 10, precio: 500 },
    { id: 'plan-hogar25', nombre: 'Hogar 25M', megas: 25, precio: 800 },
    { id: 'plan-negocio50', nombre: 'Negocio 50M', megas: 50, precio: 1500 }
  ];
  // Clientes
  RN.state.clients = [
    { id: 'cli-1', nombre: 'Juan Pérez', telefono: '53123456', direccion: 'Calle 10 #25', planId: 'plan-hogar10', precio: 500, diaPago: 5, descuentoRecurrente: 0, deudaEquipo: 0, activo: true, createdAt: new Date().toISOString() },
    { id: 'cli-2', nombre: 'María González', telefono: '53987654', direccion: 'Av. 3 #100', planId: 'plan-hogar25', precio: 800, diaPago: 10, descuentoRecurrente: 50, deudaEquipo: 300, deudaEquipoOriginal: 600, cuotaEquipo: 100, activo: true, createdAt: new Date().toISOString() },
    { id: 'cli-3', nombre: 'Carlos Romero', telefono: '53445566', direccion: 'Calle 8 #50', planId: 'plan-negocio50', precio: 1500, diaPago: 15, descuentoRecurrente: 0, deudaEquipo: 0, activo: true, createdAt: new Date().toISOString() }
  ];
  // Inventario
  RN.state.inventario = [
    { id: 'lot-1', material: 'Cable UTP cat6', cantidad: 100, notas: 'Proveedor local', fecha: new Date().toISOString() },
    { id: 'lot-2', material: 'Conectores RJ45', cantidad: 50, notas: '', fecha: new Date().toISOString() }
  ];
  // Config
  RN.state.config.tasaUsd = 320;
  RN.state.config.diasBaseMes = 30;
  RN.state.config.mencionarDescuentoRecurrente = true;
  RN.state.mesActual = RN.calc.mesActualStr();
  RN.config.persistir();
  RN.storageLocal.persistir();
};

// Arranque automático cuando el DOM está listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', RN.init.arrancar);
} else {
  RN.init.arrancar();
}
