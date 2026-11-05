/**
 * core/validate-fields.js — Validación de campos de cliente (IP, teléfono).
 * v5.11.2 — Validaciones no bloqueantes: avisan al usuario pero no impiden
 * guardar (para no romper datos legítimos raros).
 *
 * API pública:
 *   RN.validateFields.ip(valor)          -> { ok, mensaje }
 *   RN.validateFields.telefono(valor)    -> { ok, valorNormalizado, mensaje }
 */
RN.validateFields = RN.validateFields || {};

/**
 * Valida una dirección IPv4.
 * Acepta X.X.X.X con cada octeto entre 0 y 255.
 * No exige 4 octetos estrictamente si el valor es muy corto (compatibilidad
 * con datos viejos), pero avisa cuando el formato no es de IPv4 estándar.
 * @returns {{ok:boolean, mensaje:string}}
 */
RN.validateFields.ip = function (valor) {
  var v = String(valor == null ? '' : valor).trim();
  if (!v) return { ok: true, mensaje: '' }; // vacío es válido (campo opcional)
  var partes = v.split('.');
  if (partes.length !== 4) {
    return { ok: false, mensaje: 'La IP debería tener 4 grupos separados por puntos (ej: 192.168.1.10). Se guarda igual.' };
  }
  for (var i = 0; i < 4; i++) {
    var p = partes[i];
    if (!/^\d+$/.test(p)) {
      return { ok: false, mensaje: 'El grupo "' + p + '" no es numérico. Se guarda igual.' };
    }
    var n = parseInt(p, 10);
    if (n < 0 || n > 255) {
      return { ok: false, mensaje: 'El grupo "' + p + '" está fuera de rango (0-255). Se guarda igual.' };
    }
  }
  return { ok: true, mensaje: '' };
};

/**
 * Normaliza y valida un número de teléfono (orientado a Cuba: +53).
 * v5.13.5 (ISSUE #5): Lógica simplificada con retornos tempranos en lugar de
 * la variable acumulativa `ok` que era difícil de seguir.
 * - Quita espacios, guiones y paréntesis.
 * - Si viene como 8 dígitos sin prefijo, asume Cuba y añade +53.
 * - Si viene con +53 y 8 dígitos, lo deja.
 * - Avisa si el resultado no parece un número de teléfono razonable.
 * @returns {{ok:boolean, valorNormalizado:string, mensaje:string}}
 */
RN.validateFields.telefono = function (valor) {
  var v = String(valor == null ? '' : valor).trim();
  if (!v) return { ok: true, valorNormalizado: '', mensaje: '' };

  // Conservar solo dígitos y el signo + inicial.
  var tienePlus = v.charAt(0) === '+';
  var digitos = v.replace(/[^\d]/g, '');

  // Caso 1: 8 dígitos sin prefijo → asumir Cuba (+53)
  if (digitos.length === 8 && !tienePlus) {
    return { ok: true, valorNormalizado: '+53' + digitos, mensaje: 'Se agregó el prefijo +53 al teléfono.' };
  }
  // Caso 2: +53 + 8 dígitos (10 dígitos con +)
  if (digitos.length === 10 && tienePlus) {
    return { ok: true, valorNormalizado: '+53' + digitos.slice(2), mensaje: '' };
  }
  // Caso 3: 53 + 8 dígitos sin + (10 dígitos sin +)
  if (digitos.length === 10 && !tienePlus) {
    return { ok: true, valorNormalizado: '+53' + digitos.slice(2), mensaje: '' };
  }

  // Caso raro: dejar como venía pero limpio, con aviso informativo si es anómalo
  var resultado = (tienePlus ? '+' : '') + digitos;
  if (digitos.length < 6) {
    return { ok: false, valorNormalizado: resultado, mensaje: 'El teléfono parece demasiado corto. Revisa el número.' };
  }
  if (digitos.length > 15) {
    return { ok: false, valorNormalizado: resultado, mensaje: 'El teléfono parece demasiado largo. Revisa el número.' };
  }
  return { ok: true, valorNormalizado: resultado, mensaje: '' };
};
