/**
 * AdminRed — Respaldo en Google Drive vía Apps Script Web App (v2)
 * ---------------------------------------------------------------
 * Este script corre SIEMPRE con TU cuenta de Google (la que lo publica),
 * así que no depende del cliente OAuth Android, del SHA-1 del APK, ni de
 * scopes/appDataFolder. Guarda el respaldo como un archivo normal llamado
 * "adminred-backup.json" en tu Drive (visible solo con esa cuenta).
 *
 * NOVEDADES v2 (requieren AdminRed v5.41.1 o superior; con versiones
 * anteriores de la app sigue funcionando igual que antes):
 *  - Control de versiones al subir: si otro equipo cambió la copia desde la
 *    última vez que este equipo la vio, NO se sobrescribe; se responde
 *    { conflicto: true } y la app muestra la comparación.
 *  - Bloqueo (LockService): dos subidas simultáneas ya no se pisan ni crean
 *    dos archivos.
 *  - Copia de seguridad "adminred-backup-anterior.json": antes de sobrescribir
 *    se guarda la copia previa (como máximo una vez cada 24 h).
 *  - Devuelve la cuenta real dueña del script para mostrarla en Ajustes.
 *
 * ============================================================
 * CÓMO DESPLEGAR / ACTUALIZAR
 * ============================================================
 * 1. https://script.google.com/home/projects → abre tu proyecto (o "Nuevo
 *    proyecto"), borra el contenido de Code.gs y pega TODO este archivo.
 * 2. ⚙️ Configuración del proyecto → "Propiedades del script" → agregar:
 *       Propiedad: TOKEN
 *       Valor:     una cadena larga y secreta (trátala como contraseña).
 *    Si ya la tenías, se conserva.
 * 3. En el editor elige la función "autorizar" y pulsa ▶ Ejecutar. Google
 *    pedirá permisos nuevos (bloqueos y correo de la cuenta): acéptalos.
 * 4. Implementar → Nueva implementación (o Gestionar implementaciones → ✏️ →
 *    "Nueva versión" si ya existe; una edición sin nueva versión NO se
 *    aplica a la URL publicada):
 *       Tipo: Aplicación web
 *       Ejecutar como: Yo
 *       Quién tiene acceso: Cualquier usuario
 * 5. La URL termina en /exec. URL + TOKEN se escriben en la app:
 *    Ajustes → ☁️ Copia en Google Drive → 🔑 Configurar URL y token.
 * ============================================================
 */

var FILE_NAME = 'adminred-backup.json';
var PREV_NAME = 'adminred-backup-anterior.json';
var PREV_CADA_MS = 24 * 60 * 60 * 1000; // rotar la copia anterior como máx. 1 vez al día

function doGet(e) {
  return manejar(e, null);
}

function doPost(e) {
  var body = null;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ error: 'Body no es JSON válido' });
  }
  return manejar(e, body);
}

function manejar(e, body) {
  var lock = null;
  try {
    var tokenEsperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
    var params = (e && e.parameter) || {};
    var token = (body && body.token) || params.token;

    if (!tokenEsperado) {
      return responder({ error: 'El script no tiene TOKEN configurado (ver Propiedades del script)' });
    }
    if (token !== tokenEsperado) {
      return responder({ error: 'Token inválido' });
    }

    var accion = (body && body.accion) || params.accion || 'leer';
    var cuenta = cuentaActual();

    if (accion === 'subir') {
      var json = body && body.json;
      if (!json) return responder({ error: 'Falta el contenido (json) a subir' });

      // Una sola escritura a la vez: evita pisadas y archivos duplicados.
      lock = LockService.getScriptLock();
      lock.waitLock(20000);

      var archivo = buscarArchivo();
      var versionActual = archivo ? (archivo.getDescription() || '') : '';

      // Control de versiones (solo si el cliente lo envía: la app >= 5.41.1).
      // 'base' = versión de la nube que este equipo vio por última vez.
      if (archivo && versionActual && body.base !== undefined && !body.forzar &&
          String(body.base || '') !== versionActual) {
        return responder({
          conflicto: true,
          version: versionActual,
          fechaRemota: archivo.getLastUpdated().toISOString(),
          cuenta: cuenta
        });
      }

      var nueva = body.fechaISO || new Date().toISOString();
      if (archivo) {
        respaldarAnterior(archivo);
        archivo.setContent(json);
      } else {
        archivo = DriveApp.createFile(FILE_NAME, json, MimeType.PLAIN_TEXT);
      }
      archivo.setDescription(nueva); // sirve de "número de versión"
      return responder({
        ok: true,
        version: nueva,
        fechaRemota: archivo.getLastUpdated().toISOString(),
        cuenta: cuenta
      });
    }

    // accion === 'leer' (o cualquier otro valor, por defecto lee)
    var actual = buscarArchivo();
    if (!actual) return responder({ json: null, cuenta: cuenta });
    return responder({
      json: actual.getBlob().getDataAsString('UTF-8'),
      version: actual.getDescription() || '',
      fechaRemota: actual.getLastUpdated().toISOString(),
      cuenta: cuenta
    });
  } catch (err) {
    return responder({ error: 'Error interno: ' + String(err) });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (err2) {} }
  }
}

/** Guarda la copia previa en PREV_NAME (máx. 1 vez cada 24 h). Nunca rompe la subida. */
function respaldarAnterior(archivo) {
  try {
    var it = DriveApp.getFilesByName(PREV_NAME);
    var prev = it.hasNext() ? it.next() : null;
    if (prev && (new Date().getTime() - prev.getLastUpdated().getTime()) < PREV_CADA_MS) return;
    var contenido = archivo.getBlob().getDataAsString('UTF-8');
    if (!contenido) return;
    if (prev) prev.setContent(contenido);
    else DriveApp.createFile(PREV_NAME, contenido, MimeType.PLAIN_TEXT);
  } catch (err) { /* best-effort */ }
}

function cuentaActual() {
  try { return Session.getEffectiveUser().getEmail() || ''; }
  catch (err) { return ''; }
}

function buscarArchivo() {
  var it = DriveApp.getFilesByName(FILE_NAME);
  return it.hasNext() ? it.next() : null;
}

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Ejecútala UNA vez desde el editor (▶) para conceder los permisos nuevos. */
function autorizar() {
  DriveApp.getFilesByName(FILE_NAME);
  LockService.getScriptLock();
  Logger.log('Autorizado. Cuenta: ' + cuentaActual());
}
