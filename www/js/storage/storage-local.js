/**
 * storage/storage-local.js — Persistencia en localStorage (respaldo).
 * El archivo real (storage-file.js) es la fuente preferida cuando hay handle;
 * localStorage garantiza que no se pierdan datos al recargar.
 */
RN.storageLocal = RN.storageLocal || {};

/** Serializa todo el estado a JSON. */
RN.storageLocal.serializar = function () {
  return JSON.stringify({
    clients: RN.state.clients,
    history: RN.state.history,
    gastos: RN.state.gastos,
    depositos: RN.state.depositos,
    retiros: RN.state.retiros,
    inventario: RN.state.inventario,
    asignacionesInventario: RN.state.asignacionesInventario,
    investments: RN.state.investments,
    planes: RN.state.planes,
    equiposRed: RN.state.equiposRed,
    descuentos: RN.state.descuentos,
    eventos: RN.state.eventos,
    snapshots: RN.state.snapshots,
    config: RN.state.config,
    reciboCounter: RN.state.reciboCounter,
    mesActual: RN.state.mesActual,
    esquema: RN.migration.VERSION_ESQUEMA
  });
};

/** Carga desde localStorage, aplica migración y pobla el estado. */
RN.storageLocal.cargar = function () {
  const raw = localStorage.getItem(STORAGE_KEYS.DATA);
  if (!raw) {
    RN.state.mesActual = RN.calc.mesActualStr();
    return false;
  }
  try {
    let data = JSON.parse(raw);
    data = RN.migration.migrar(data);
    RN.state.clients = data.clients || [];
    RN.state.history = data.history || [];
    RN.state.gastos = data.gastos || [];
    RN.state.depositos = data.depositos || [];
    RN.state.retiros = data.retiros || [];
    RN.state.inventario = data.inventario || [];
    RN.state.asignacionesInventario = data.asignacionesInventario || [];
    RN.state.investments = data.investments || [];
    RN.state.planes = data.planes || [];
    RN.state.equiposRed = data.equiposRed || [];
    RN.state.descuentos = data.descuentos || [];
    // v5.15 — eventos de trazabilidad (fallback: [] en backups previos)
    RN.state.eventos = data.eventos || [];
    RN.state.snapshots = data.snapshots || [];
    if (data.config) Object.assign(RN.state.config, data.config);
    RN.state.reciboCounter = data.reciboCounter || 0;
    RN.state.mesActual = data.mesActual || RN.calc.mesActualStr();
    return true;
  } catch (e) {
    console.error('storage-local: error al cargar', e);
    RN.notifyUI.toast('Datos locales corruptos', 'error');
    return false;
  }
};

/** Persiste el estado en localStorage. */
RN.storageLocal.persistir = function () {
  try {
    localStorage.setItem(STORAGE_KEYS.DATA, RN.storageLocal.serializar());
    RN.validacion.marcarLimpio();
    return true;
  } catch (e) {
    RN.notifyUI.toast('No se pudo guardar en localStorage', 'error');
    return false;
  }
};

/** Aplica un objeto data al estado (usado por storage-file y export al importar). */
RN.storageLocal._aplicarData = function (data) {
  RN.state.clients = data.clients || [];
  RN.state.history = data.history || [];
  RN.state.gastos = data.gastos || [];
  RN.state.depositos = data.depositos || [];
  RN.state.retiros = data.retiros || [];
  RN.state.inventario = data.inventario || [];
  RN.state.asignacionesInventario = data.asignacionesInventario || [];
  RN.state.investments = data.investments || [];
  RN.state.planes = data.planes || [];
  RN.state.equiposRed = data.equiposRed || [];
  RN.state.descuentos = data.descuentos || [];
  // v5.15 — eventos de trazabilidad (fallback: [] en backups previos)
  RN.state.eventos = data.eventos || [];
  RN.state.snapshots = data.snapshots || [];
  // v5.13.1: Bug #5 — Preservar la tasa USD más reciente al importar datos.
  // Se recopilan candidatos de tasa de 3 fuentes (estado actual, archivo
  // importado, localStorage) y se aplica la más reciente al FINAL, después
  // de que toda la config se haya cargado. Esto evita que las llamadas
  // intermedias a Object.assign sobreescriban la tasa correcta.
  var candidatos = [];
  // Candidato 1: estado actual (en memoria)
  if (RN.state.config.tasaUsd) {
    candidatos.push({
      tasa: RN.state.config.tasaUsd,
      fecha: RN.state.config.fechaTasaUsd || null,
      fuente: 'estado'
    });
  }
  // Candidato 2: archivo importado (data.config)
  if (data.config && data.config.tasaUsd) {
    candidatos.push({
      tasa: data.config.tasaUsd,
      fecha: data.config.fechaTasaUsd || null,
      fuente: 'archivo'
    });
  }
  // Candidato 3: localStorage (STORAGE_KEYS.CONFIG)
  var savedConfigRaw = null;
  try {
    savedConfigRaw = localStorage.getItem(STORAGE_KEYS.CONFIG);
  } catch (e) { /* ignorar */ }
  if (savedConfigRaw) {
    try {
      var savedConfigTmp = JSON.parse(savedConfigRaw);
      if (savedConfigTmp.tasaUsd) {
        candidatos.push({
          tasa: savedConfigTmp.tasaUsd,
          fecha: savedConfigTmp.fechaTasaUsd || null,
          fuente: 'localStorage'
        });
      }
    } catch (e) { /* config corrupta, ignorar */ }
  }
  // Aplicar config del archivo importado
  if (data.config) Object.assign(RN.state.config, data.config);
  // v5.13.16 (BUG-CRITICO): Eliminada la re-aplicacion de STORAGE_KEYS.CONFIG.
  // Antes, este bloque hacia Object.assign(RN.state.config, savedConfig) con la
  // config de STORAGE_KEYS.CONFIG, lo que sobreescribia la config del backup
  // importado (data.config) con la config local stale. Como persistir() ya no
  // se llama en la mayoria de los flujos (ISSUE #22, ISSUE #4),
  // STORAGE_KEYS.CONFIG esta desactualizada y sobreescribia cambios como
  // paquetePendiente, fondo de caja, % de ganancia, etc. La tasa USD se sigue
  // preservando via la logica de candidatos (Bug #5) que se aplica mas abajo.
  // v5.13.1: Bug #5 — Aplicar la tasa más reciente al FINAL.
  // Ordenar candidatos por fecha descendente (más reciente primero).
  // Los candidatos sin fecha se consideran los más viejos.
  candidatos.sort(function (a, b) {
    if (!a.fecha && !b.fecha) return 0;
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0;
  });
  if (candidatos.length > 0) {
    RN.state.config.tasaUsd = candidatos[0].tasa;
    RN.state.config.fechaTasaUsd = candidatos[0].fecha;
  }
  RN.state.reciboCounter = data.reciboCounter || 0;
  RN.state.mesActual = data.mesActual || RN.calc.mesActualStr();
};

/**
 * v5.13.1: Bug #16 — Debounce para los guardados asíncronos (archivo + IndexedDB).
 * Antes, cada llamada a guardar() disparaba inmediatamente una escritura a
 * archivo y a IndexedDB. Si el usuario hacía varios cambios rápidos (ej.
 * cobrar a 10 clientes seguidos), se acumulaban decenas de escrituras
 * asíncronas simultáneas, causando race conditions y picos de I/O.
 * Ahora los guardados asíncronos se agrupan con un debounce de 500ms.
 * El checkpoint y el persistir() (localStorage) siguen siendo síncronos.
 */
RN.storageLocal._debounceAsync = null;
RN.storageLocal._guardarAsyncDebounced = function () {
  if (RN.storageLocal._debounceAsync) {
    clearTimeout(RN.storageLocal._debounceAsync);
  }
  RN.storageLocal._debounceAsync = setTimeout(function () {
    RN.storageLocal._debounceAsync = null;
    // Guardar en archivo vinculado (best-effort).
    // v5.21.0: también en nativo (Capacitor Filesystem), donde no existe
    // window.showSaveFilePicker pero sí RN.storageFile._esNativo.
    if (RN.state.fileHandle && (window.showSaveFilePicker || RN.storageFile._esNativo)) {
      RN.storageFile.guardarAhora().catch(() => {});
    }
    // v5.11.2: respaldo automático en IndexedDB (best-effort, no bloquea)
    if (RN.autoBackup && RN.autoBackup.guardar) {
      RN.autoBackup.guardar().catch(() => {});
    }
  }, 500);
};

/** Guarda estado + crea checkpoint. Helper usado por toda la app. */
RN.storageLocal.guardar = function () {
  RN.checkpoint.crear();
  RN.storageLocal.persistir();
  // v5.13.16 (BUG-CRITICO): Sincronizar STORAGE_KEYS.CONFIG con el estado actual.
  // Desde v5.13.5 (ISSUE #22, ISSUE #4) se eliminó la llamada explicita a
  // RN.config.persistir() en config.guardar() y modal-paquete-proveedor, lo que
  // dejo STORAGE_KEYS.CONFIG desactualizada. Aunque ya no se re-aplica al cargar
  // (ver init.js paso 4b eliminado), la mantenemos sincronizada aqui para que
  // ambos almacenamientos (DATA y CONFIG) sean consistentes y evitar problemas
  // futuros si alguna parte del codigo vuelve a leer STORAGE_KEYS.CONFIG.
  if (RN.config && RN.config.persistir) RN.config.persistir();
  // v5.13.1: Bug #16 — guardados asíncronos con debounce
  RN.storageLocal._guardarAsyncDebounced();
};
