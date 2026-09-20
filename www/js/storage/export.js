/**
 * storage/export.js — Exportación/importación de respaldos y export CSV de clientes.
 */
RN.export = RN.export || {};

/**
 * Descarga un blob como archivo.
 * v5.14.2 (Auditoría Reportes — CODE-4): los CSV se generan con BOM UTF-8
 * (\uFEFF) al inicio para que Microsoft Excel detecte la codificación y
 * muestre correctamente los acentos (nombres de clientes, conceptos en
 * español). Sin el BOM, Excel asume Latin-1/Windows-1252 y los caracteres
 * acentuados se ven como mojibake (ej. "descuadre" con símbolos extraños).
 */
RN.export.descargar = function (nombre, contenido, tipo) {
  if (tipo === 'text/csv' && typeof contenido === 'string' && contenido.charCodeAt(0) !== 0xFEFF) {
    contenido = '\uFEFF' + contenido;
  }

  // v5.21.0: En el APK nativo, la descarga por <a download> con blob no funciona
  // en el WebView. Escribimos el archivo en la carpeta pública Documentos del
  // dispositivo (visible desde el gestor de archivos) usando el plugin Filesystem.
  if (RN.platform && RN.platform.tieneFilesystem()) {
    var fs = RN.platform.plugin('Filesystem');
    var b64;
    try {
      var bytes = new TextEncoder().encode(contenido);
      b64 = RN.storageNative._ab2b64(bytes.buffer);
    } catch (e) {
      RN.notifyUI.toast('No se pudo preparar el archivo: ' + e.message, 'error');
      return;
    }
    fs.writeFile({ path: nombre, data: b64, directory: 'DOCUMENTS', recursive: true })
      .then(function () {
        RN.notifyUI.toast('Archivo guardado en Documentos: ' + nombre, 'success', 6000);
      })
      .catch(function (e) {
        RN.notifyUI.toast('No se pudo guardar el archivo: ' + e.message, 'error');
      });
    return;
  }

  const blob = new Blob([contenido], { type: tipo || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * v5.14.2 (Auditoría Reportes — DUP-2): escape CSV centralizado. Antes cada
 * export (historial.js, descuentos-view.js, export.js) repetía su propio
 * `'"' + String(f).replace(/"/g, '""') + '"'`. Ahora todos usan este helper.
 */
RN.export.toCSV = function (rows) {
  return rows.map(function (r) {
    return r.map(function (f) { return '"' + String(f == null ? '' : f).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
};

/** Exporta un respaldo JSON completo. */
RN.export.exportarBackup = function () {
  const json = RN.storageLocal.serializar();
  const fecha = new Date().toISOString().slice(0, 10);
  RN.export.descargar(`adminred-backup-${fecha}.json`, json, 'application/json');
  RN.notifyUI.toast('Respaldo exportado', 'success');
};

/**
 * v5.13.4 (Mejora #8) — Valida la estructura mínima de un objeto de respaldo.
 * Devuelve { ok: bool, errores: [] }. No valida la coherencia financiera
 * (eso lo hace validacion.validar() después de aplicar); solo valida que
 * el JSON tenga la forma esperada para que _aplicarData() no corrompa el estado.
 */
RN.export._validarEstructura = function (data) {
  var errores = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errores: ['El respaldo no es un objeto JSON válido'] };
  }
  // Claves mínimas que debe tener un respaldo de AdminRed
  var clavesRequeridas = ['clients', 'history', 'config'];
  clavesRequeridas.forEach(function (k) {
    if (!(k in data)) {
      errores.push('Falta la clave "' + k + '" en el respaldo');
    }
  });
  // Las claves que deben ser arrays
  var clavesArray = ['clients', 'history', 'gastos', 'depositos', 'retiros', 'inventario', 'investments', 'planes', 'descuentos', 'snapshots'];
  clavesArray.forEach(function (k) {
    if (k in data && !Array.isArray(data[k])) {
      errores.push('La clave "' + k + '" debe ser un array, no ' + typeof data[k]);
    }
  });
  // config debe ser objeto
  if ('config' in data && (typeof data.config !== 'object' || Array.isArray(data.config))) {
    errores.push('La clave "config" debe ser un objeto');
  }
  // Cada cliente debe tener al menos id
  if (Array.isArray(data.clients)) {
    data.clients.forEach(function (c, i) {
      if (!c || typeof c !== 'object') {
        errores.push('Cliente #' + i + ' no es un objeto válido');
      } else if (!c.id) {
        errores.push('Cliente #' + i + ' no tiene id');
      }
    });
  }
  return { ok: errores.length === 0, errores: errores };
};

/**
 * v5.13.4 (Mejora #8) — Genera un resumen legible del respaldo para mostrar
 * al usuario en modo seguro antes de confirmar la importación.
 */
RN.export._resumenBackup = function (data) {
  function cant(arr) { return Array.isArray(arr) ? arr.length : 0; }
  var líneas = [];
  líneas.push('Clientes: ' + cant(data.clients));
  líneas.push('Cobros (historial): ' + cant(data.history));
  líneas.push('Inversiones: ' + cant(data.investments));
  líneas.push('Gastos: ' + cant(data.gastos));
  líneas.push('Depósitos a caja: ' + cant(data.depositos));
  líneas.push('Retiros de caja: ' + cant(data.retiros));
  líneas.push('Inventario: ' + cant(data.inventario));
  líneas.push('Descuentos: ' + cant(data.descuentos));
  líneas.push('Snapshots: ' + cant(data.snapshots));
  if (data.config) {
    if (data.config.tasaUsd) líneas.push('Tasa USD: ' + data.config.tasaUsd + ' CUP');
    if (data.mesActual) líneas.push('Mes operativo: ' + data.mesActual);
    if (data.esquema) líneas.push('Esquema: v' + data.esquema);
  }
  return líneas.join('\n');
};

/**
 * Importa un respaldo JSON desde archivo.
 * v5.13.4 (Mejora #8): Ahora valida la estructura antes de aplicar, ofrece
 * modo seguro (confirmar antes de sobreescribir), y ejecuta validacion.validar()
 * después de importar para detectar problemas de coherencia.
 */
RN.export.importarBackup = function () {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    var texto;
    try {
      texto = await file.text();
    } catch (e) {
      RN.notifyUI.toast('No se pudo leer el archivo: ' + e.message, 'error');
      return;
    }
    var data;
    try {
      data = JSON.parse(texto);
    } catch (e) {
      RN.notifyUI.toast('El archivo no es JSON válido: ' + e.message, 'error');
      return;
    }
    // Paso 1: Validar estructura mínima
    var est = RN.export._validarEstructura(data);
    if (!est.ok) {
      RN.notifyUI.toast('Estructura inválida: ' + est.errores[0], 'error');
      console.error('[AdminRed import] Estructura inválida:', est.errores);
      return;
    }
    // Paso 2: Mostrar resumen y pedir confirmación (modo seguro)
    // v5.13.5 (ISSUE #15): Usar RN.uiComponents.confirm() en lugar del
    // confirm() nativo del navegador, para mantener consistencia visual con
    // el tema (dark/light) de la app.
    var resumen = RN.export._resumenBackup(data);
    var aplicarImport = function () {
      // Paso 3: Aplicar migración y sobreescribir
      try {
        // Crear snapshot de los datos actuales ANTES de sobreescribir (modo seguro)
        if (RN.checkpoint && RN.checkpoint.crear) {
          RN.checkpoint.crear();
        }
        data = RN.migration.migrar(data);
        RN.storageLocal._aplicarData(data);
        RN.storageLocal.persistir();
        RN.render.todo();
      } catch (e) {
        RN.notifyUI.toast('Error al aplicar el respaldo: ' + e.message, 'error');
        console.error('[AdminRed import] Error al aplicar:', e);
        return;
      }
      // Paso 4: Validar coherencia financiera después de importar
      var val = RN.validacion.validar();
      if (val.ok) {
        RN.notifyUI.toast('Respaldo importado correctamente. Integridad OK.', 'success');
      } else {
        RN.notifyUI.toast('Importado con ' + val.errores.length + ' advertencias de integridad', 'warn');
        console.warn('[AdminRed import] Advertencias de integridad:', val.errores);
        // Mostrar los errores en un modal para que el usuario pueda revisarlos
        var esc = function (s) {
          return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };
        var html =
        '<div class="modal-header"><h3>⚠️ Advertencias de integridad</h3>' +
        '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
        '<div class="modal-body"><div style="max-width:500px;text-align:left">' +
        '<p>El respaldo se importó pero se detectaron <b>' + val.errores.length +
        '</b> problemas de coherencia:</p><ul style="max-height:300px;overflow:auto;font-size:13px">' +
        val.errores.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
        '</ul><p style="font-size:12px;color:#888">Puede usar Auditoría financiera ' +
        '(Ajustes → Diagnóstico) para más detalles.</p></div></div>' +
        '<div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>';
      if (RN.uiComponents && RN.uiComponents.modal) {
        RN.uiComponents.modal(html, { lg: true });
      }
    }
    }; // fin aplicarImport

    // v5.13.5 (ISSUE #15): confirmación con modal estilizado (danger)
    RN.uiComponents.confirm(
      'Importar respaldo',
      'Respaldo detectado:\n\n' + resumen +
      '\n\n¿Desea importar y SOBREESCRIBIR los datos actuales?\n' +
      '(Se creará un snapshot automático de los datos actuales antes de sobreescribir)',
      aplicarImport,
      { danger: true, onCancel: function () { RN.notifyUI.toast('Importación cancelada', 'warn'); } }
    );
  };
  input.click();
};

/** Exporta clientes a CSV. */
RN.export.exportCSVClientes = function () {
  const rows = [['id', 'nombre', 'telefono', 'direccion', 'diaPago', 'planId', 'precio', 'estado', 'deudaEquipo', 'descuentoRecurrente']];
  RN.state.clients.forEach(c => {
    rows.push([
      c.id, c.nombre || '', c.telefono || '', c.direccion || '', c.diaPago || '',
      c.planId || '', c.precio || 0, RN.calc.getStatus(c),
      RN.investment.getDeudaEquipoCliente(c), c.descuentoRecurrente || 0
    ]);
  });
  // v5.14.2 (DUP-2): escape CSV centralizado en RN.export.toCSV.
  const csv = RN.export.toCSV(rows);
  RN.export.descargar('clientes.csv', csv, 'text/csv');
  RN.notifyUI.toast('CSV de clientes exportado', 'success');
};
