/**
 * storage/autobackup.js — Respaldo automático periódico en IndexedDB.
 * v5.11.2 — Protección contra pérdida total de datos.
 *
 * Los datos principales viven en el archivo File System Access (volátil si se
 * borra la caché del navegador) y en localStorage (~5MB). Este módulo guarda
 * copias automáticas en IndexedDB (mucho más capacidad y persistente) cada vez
 * que se persiste el estado, conservando los últimos N snapshots con timestamp.
 *
 * Si el usuario pierde sus datos (borró datos del sitio, caché, etc.), puede
 * restaurar el último respaldo automático desde Ajustes.
 *
 * API pública:
 *   RN.autoBackup.guardar()            — guarda un snapshot (llamado desde storageLocal.guardar)
 *   RN.autoBackup.listar()             — lista snapshots [{ts, size, clientes}]
 *   RN.autoBackup.restaurarUltimo()    — restaura el snapshot más reciente
 *   RN.autoBackup.info()               — info del último backup para mostrar en UI
 *   RN.autoBackup.borrarTodos()        — limpia todos los snapshots
 */
RN.autoBackup = RN.autoBackup || {};

RN.autoBackup.MAX_SNAPSHOTS = 10;       // conservar los últimos 10
RN.autoBackup.STORE = 'autobackup';     // object store dentro de IDB.NAME

/** Abre (o crea) la DB de respaldos. Devuelve una Promise<IDBDatabase>. */
RN.autoBackup._abrirDB = function () {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible')); return; }
    // Usamos una DB propia para no interferir con la de file-handle (IDB.NAME v1).
    var req = indexedDB.open('adminred-autobackup', 1);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(RN.autoBackup.STORE)) {
        var os = db.createObjectStore(RN.autoBackup.STORE, { keyPath: 'ts' });
        os.createIndex('ts', 'ts', { unique: true });
      }
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
};

/** Guarda un snapshot del estado actual en IndexedDB. Best-effort (no lanza). */
RN.autoBackup.guardar = async function () {
  try {
    var db = await RN.autoBackup._abrirDB();
    var json = RN.storageLocal.serializar();
    var ts = Date.now();
    var snapshot = {
      ts: ts,
      fechaISO: new Date(ts).toISOString(),
      data: json,
      size: json.length,
      clientes: (RN.state.clients || []).length,
      historial: (RN.state.history || []).length
    };
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(RN.autoBackup.STORE, 'readwrite');
      tx.objectStore(RN.autoBackup.STORE).put(snapshot);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
    db.close();
    // Poda: conservar solo los últimos MAX_SNAPSHOTS
    RN.autoBackup._podar().catch(function () {});
    return true;
  } catch (e) {
    console.warn('autoBackup.guardar falló:', e);
    return false;
  }
};

/** Elimina los snapshots más antiguos, conservando solo MAX_SNAPSHOTS. */
RN.autoBackup._podar = async function () {
  var db = await RN.autoBackup._abrirDB();
  var todos = await RN.autoBackup._getAllKeys(db);
  if (todos.length <= RN.autoBackup.MAX_SNAPSHOTS) { db.close(); return; }
  // Ordenar descendente y borrar los que sobran (los más viejos)
  todos.sort(function (a, b) { return b - a; });
  var aBorrar = todos.slice(RN.autoBackup.MAX_SNAPSHOTS);
  await new Promise(function (resolve, reject) {
    var tx = db.transaction(RN.autoBackup.STORE, 'readwrite');
    var os = tx.objectStore(RN.autoBackup.STORE);
    aBorrar.forEach(function (k) { os.delete(k); });
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function (e) { reject(e.target.error); };
  });
  db.close();
};

/** Helper: todas las keys del store. */
RN.autoBackup._getAllKeys = function (db) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(RN.autoBackup.STORE, 'readonly');
    var req = tx.objectStore(RN.autoBackup.STORE).getAllKeys();
    req.onsuccess = function (e) { resolve(e.target.result || []); };
    req.onerror = function (e) { reject(e.target.error); };
  });
};

/** Lista los snapshots (metadatos, sin el data pesado), del más reciente al más viejo. */
RN.autoBackup.listar = async function () {
  try {
    var db = await RN.autoBackup._abrirDB();
    var all = await new Promise(function (resolve, reject) {
      var tx = db.transaction(RN.autoBackup.STORE, 'readonly');
      var req = tx.objectStore(RN.autoBackup.STORE).getAll();
      req.onsuccess = function (e) { resolve(e.target.result || []); };
      req.onerror = function (e) { reject(e.target.error); };
    });
    db.close();
    return all.map(function (s) {
      return { ts: s.ts, fechaISO: s.fechaISO, size: s.size, clientes: s.clientes, historial: s.historial };
    }).sort(function (a, b) { return b.ts - a.ts; });
  } catch (e) {
    console.warn('autoBackup.listar falló:', e);
    return [];
  }
};

/** Devuelve el snapshot más reciente completo (con data) o null. */
RN.autoBackup._ultimo = async function () {
  var db = await RN.autoBackup._abrirDB();
  var all = await new Promise(function (resolve, reject) {
    var tx = db.transaction(RN.autoBackup.STORE, 'readonly');
    var req = tx.objectStore(RN.autoBackup.STORE).getAll();
    req.onsuccess = function (e) { resolve(e.target.result || []); };
    req.onerror = function (e) { reject(e.target.error); };
  });
  db.close();
  if (!all.length) return null;
  all.sort(function (a, b) { return b.ts - a.ts; });
  return all[0];
};

/** Restaura el último respaldo automático (reemplaza el estado actual). */
RN.autoBackup.restaurarUltimo = async function () {
  // Confirmación con UI propia si existe, si no, confirm nativo.
  var confirmar = function () {
    return new Promise(function (resolve) {
      if (RN.uiComponents && RN.uiComponents.confirm) {
        // v5.13.5 (ISSUE #16): Antes se llamaba confirm() con 5 argumentos:
        // el callback de cancelación se pasaba como 4to arg (interpretado como
        // opts) y {danger:true} como 5to arg (ignorado). Resultado: el botón no
        // se mostraba en rojo y al cancelar la Promise quedaba colgada para
        // siempre. Ahora usamos opts.onCancel correctamente.
        RN.uiComponents.confirm(
          'Restaurar respaldo automático',
          'Esto reemplazará TODOS los datos actuales por la última copia automática guardada. ¿Continuar?',
          function () { resolve(true); },
          { danger: true, onCancel: function () { resolve(false); } }
        );
      } else {
        resolve(confirm('Esto reemplazará TODOS los datos actuales por la última copia automática. ¿Continuar?'));
      }
    });
  };

  var ok = await confirmar();
  if (!ok) return;

  try {
    var snap = await RN.autoBackup._ultimo();
    if (!snap) {
      RN.notifyUI.toast('No hay respaldos automáticos guardados', 'warn');
      return;
    }
    var data = JSON.parse(snap.data);
    data = RN.migration.migrar(data);
    RN.storageLocal._aplicarData(data);
    RN.checkpoint.crear();
    RN.storageLocal.persistir();
    RN.render.todo();
    RN.notifyUI.toast('Respaldo automático restaurado (' + new Date(snap.ts).toLocaleString() + ')', 'success');
  } catch (e) {
    RN.notifyUI.toast('Error al restaurar respaldo: ' + e.message, 'error');
  }
};

/** Info del último backup para mostrar en la UI (best-effort, no lanza). */
RN.autoBackup.info = async function () {
  try {
    var snap = await RN.autoBackup._ultimo();
    if (!snap) return null;
    return {
      fecha: new Date(snap.ts).toLocaleString(),
      clientes: snap.clientes,
      sizeKB: Math.round(snap.size / 1024)
    };
  } catch (e) {
    return null;
  }
};

/** Borra todos los snapshots. */
RN.autoBackup.borrarTodos = async function () {
  try {
    var db = await RN.autoBackup._abrirDB();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(RN.autoBackup.STORE, 'readwrite');
      tx.objectStore(RN.autoBackup.STORE).clear();
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
    db.close();
    RN.notifyUI.toast('Respaldos automáticos borrados', 'warn');
  } catch (e) {
    RN.notifyUI.toast('Error al borrar respaldos: ' + e.message, 'error');
  }
};
