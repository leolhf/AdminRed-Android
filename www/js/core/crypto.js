/**
 * crypto.js — Cifrado AES-GCM del archivo de datos, ligado al PIN.
 * Cifrado real (no ofuscación). Si se pierde el PIN, no hay recuperación.
 * Usa Web Crypto API (SubtleCrypto).
 */
RN.crypto = RN.crypto || {};

/** Deriva una clave AES-GCM a partir del PIN + sal. */
RN.crypto.derivarClave = async function (pin, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ENCRYPTION.ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: ENCRYPTION.ALGO, length: ENCRYPTION.KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  );
};

/** Cifra un string y devuelve un ArrayBuffer con [salt(16) | iv(12) | ciphertext]. */
RN.crypto.cifrar = async function (texto, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION.SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION.IV_LEN));
  const key = await RN.crypto.derivarClave(pin, salt);
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: ENCRYPTION.ALGO, iv }, key, enc.encode(texto));
  const out = new Uint8Array(salt.length + iv.length + ct.byteLength);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(new Uint8Array(ct), salt.length + iv.length);
  return out.buffer;
};

/** Descifra un ArrayBuffer [salt | iv | ciphertext] y devuelve el string. */
RN.crypto.descifrar = async function (buf, pin) {
  const data = new Uint8Array(buf);
  const salt = data.slice(0, ENCRYPTION.SALT_LEN);
  const iv = data.slice(ENCRYPTION.SALT_LEN, ENCRYPTION.SALT_LEN + ENCRYPTION.IV_LEN);
  const ct = data.slice(ENCRYPTION.SALT_LEN + ENCRYPTION.IV_LEN);
  const key = await RN.crypto.derivarClave(pin, salt);
  const dec = await crypto.subtle.decrypt({ name: ENCRYPTION.ALGO, iv }, key, ct);
  return new TextDecoder().decode(dec);
};

/**
 * Hash robusto del PIN con PBKDF2 + sal (v5.11.2).
 * Devuelve un string con formato: pbkdf2$iter$salHex$hashHex
 * Sustituye al SHA-256 sin sal anterior, que era vulnerable a rainbow tables.
 * @param {string} pin  PIN en claro.
 * @param {Uint8Array} [salt]  Sal opcional (16 bytes). Si se omite, se genera una nueva.
 * @returns {Promise<string>}  String de almacenamiento.
 */
RN.crypto.hashPin = async function (pin, salt) {
  const useSalt = salt || crypto.getRandomValues(new Uint8Array(ENCRYPTION.SALT_LEN));
  const iterations = ENCRYPTION.PIN_ITERATIONS;
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode('pin:' + pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: useSalt, iterations: iterations, hash: 'SHA-256' },
    baseKey,
    256 // 32 bytes = 256 bits de salida
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(useSalt).map(b => b.toString(16).padStart(2, '0')).join('');
  return 'pbkdf2$' + iterations + '$' + saltHex + '$' + hashHex;
};

/**
 * Compara un PIN en claro contra el hash guardado (formato nuevo o viejo).
 * v5.11.2: comparación con tiempo constante para mitigar timing attacks.
 * @param {string} pin  PIN en claro ingresado.
 * @param {string} guardado  Hash guardado en localStorage (pbkdf2$...$ o SHA-256 hex viejo).
 * @returns {Promise<{ok:boolean, legacy:boolean}>}  ok=coincide, legacy=era hash viejo (merece re-hash).
 */
RN.crypto.verificarPin = async function (pin, guardado) {
  if (!guardado) return { ok: false, legacy: false };

  // Formato nuevo: pbkdf2$iter$saltHex$hashHex
  if (guardado.indexOf('pbkdf2$') === 0) {
    const parts = guardado.split('$');
    const iterations = parseInt(parts[1], 10);
    const salt = new Uint8Array(parts[2].match(/.{2}/g).map(h => parseInt(h, 16)));
    const esperado = parts[3];
    const candidato = await RN.crypto.hashPin(pin, salt);
    const candidatoHash = candidato.split('$')[3];
    return { ok: RN.crypto._tiempoConstante(candidatoHash, esperado), legacy: false };
  }

  // Formato viejo: SHA-256 sin sal (hex). Migrar lo antes posible.
  // Mantenemos compatibilidad para no bloquear al usuario existente.
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pin:' + pin));
  const candidato = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { ok: RN.crypto._tiempoConstante(candidato, guardado), legacy: true };
};

/**
 * Comparación de strings con tiempo constante (mitiga timing attacks).
 * Compara siempre ambos strings completos, sin cortocircuito.
 */
RN.crypto._tiempoConstante = function (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Recorrer igualmente para no filtrar la longitud por tiempo.
    var max = Math.max(a.length, b.length);
    var res = 0;
    for (var i = 0; i < max; i++) {
      res |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return false;
  }
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};
