/**
 * ui/ui-components.js — Componentes de interfaz reutilizables (modal, confirm, prompt).
 *
 * v5.13.18 (BUG-CRITICO): Sistema de pila de modales (modal stack).
 * Antes existía un solo modal global. Cuando se llamaba confirm() o prompt()
 * mientras otro modal estaba abierto (ej: modal de cliente al importar contactos),
 * el nuevo diálogo SOBREESCRIBÍA el contenido del modal-box, destruyendo el
 * formulario anterior. Al cerrar el confirm/prompt, cerrarModal() ocultaba el
 * overlay entero, perdiéndose el modal original.
 *
 * Ahora modal() guarda el contenido actual en una pila antes de mostrar el nuevo,
 * y cerrarModal() restaura el nivel anterior si la pila no está vacía. Esto
 * permite modales anidados (confirm/prompt sobre cualquier modal) sin perder
 * el modal padre.
 *
 * v5.20.0 (BUG-CRITICO): Al restaurar un modal apilado se perdían los valores
 * escritos por JavaScript en los campos (input.value = ...). innerHTML serializa
 * el ATRIBUTO value (valor por defecto), no la propiedad .value viva; por eso,
 * al importar un contacto del teléfono, el nombre y la dirección recién llenados
 * se borraban al abrir el prompt de "varios números" (o el confirm de nombre),
 * quedando solo el teléfono. Ahora, al apilar un modal se capturan los valores
 * vivos de todos los campos (input/select/textarea) y se re-aplican al restaurar.
 */
RN.uiComponents = RN.uiComponents || {};

// v5.13.18: Pila de modales para soportar modales anidados.
RN.uiComponents._modalStack = [];

/**
 * v5.20.0: Captura los valores VIVOS de todos los campos con id dentro de un
 * contenedor. Necesario porque innerHTML no conserva la propiedad .value.
 * Devuelve un mapa { id: { tipo, value|checked } }.
 */
RN.uiComponents._capturarValores = function (root) {
  var vals = {};
  if (!root) return vals;
  var campos = root.querySelectorAll('input, select, textarea');
  for (var i = 0; i < campos.length; i++) {
    var el = campos[i];
    if (!el.id) continue;
    if (el.type === 'checkbox' || el.type === 'radio') {
      vals[el.id] = { tipo: el.type, checked: !!el.checked };
    } else {
      vals[el.id] = { tipo: el.type, value: el.value };
    }
  }
  return vals;
};

/**
 * v5.20.0: Re-aplica los valores capturados por _capturarValores() sobre los
 * campos ya restaurados en el DOM (por id).
 */
RN.uiComponents._restaurarValores = function (root, vals) {
  if (!root || !vals) return;
  Object.keys(vals).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var v = vals[id];
    if (v.tipo === 'checkbox' || v.tipo === 'radio') {
      el.checked = v.checked;
    } else {
      el.value = v.value;
    }
  });
};

/**
 * Abre un modal con contenido HTML.
 * @param {string} html
 * @param {object} [opts]
 * @param {boolean} [opts.lg] — modal ancho
 * @param {boolean} [opts.replace] — v5.53.4: no apilar; sustituye el modal actual
 *   (útil al pasar de un aviso a Cobranza, etc.)
 */
RN.uiComponents.modal = function (html, opts) {
  opts = opts || {};
  const box = document.getElementById('modal-box');
  const overlay = document.getElementById('modal-overlay');

  if (opts.replace) {
    // Sustituir: vaciar pila y no guardar el modal actual
    RN.uiComponents._modalStack = [];
  } else if (overlay.classList.contains('open')) {
    // v5.13.18: apilar el modal actual antes de sobrescribir
    // v5.20.0: capturar valores vivos de campos
    RN.uiComponents._modalStack.push({
      html: box.innerHTML,
      className: box.className,
      valores: RN.uiComponents._capturarValores(box)
    });
  }

  box.className = 'modal' + (opts.lg ? ' lg' : '');
  box.innerHTML = html;
  overlay.classList.add('open');
  overlay.onclick = function (e) {
    if (e.target === overlay) RN.uiComponents.cerrarModal();
  };
};

/**
 * Cierra el modal superior. Si hay pila, restaura el anterior.
 * @param {object} [opts]
 * @param {boolean} [opts.todo] — cierra todo y vacía la pila
 */
RN.uiComponents.cerrarModal = function (opts) {
  opts = opts || {};
  var overlay = document.getElementById('modal-overlay');
  var box = document.getElementById('modal-box');

  if (opts.todo) {
    RN.uiComponents._modalStack = [];
    if (overlay) overlay.classList.remove('open');
    return;
  }

  if (RN.uiComponents._modalStack.length > 0) {
    var prev = RN.uiComponents._modalStack.pop();
    box.className = prev.className;
    box.innerHTML = prev.html;
    RN.uiComponents._restaurarValores(box, prev.valores);
    overlay.onclick = function (e) {
      if (e.target === overlay) RN.uiComponents.cerrarModal();
    };
    return;
  }
  if (overlay) overlay.classList.remove('open');
};

/**
 * v5.53.4 — Cierra el modal actual (o toda la pila) y ejecuta `fn` en el
 * siguiente frame de pintado, cuando el overlay ya puede recibir un modal nuevo.
 * Evita setTimeout mágicos y condiciones de carrera al encadenar modales.
 *
 * @param {function} fn
 * @param {object} [opts]
 * @param {boolean} [opts.todo=true] — por defecto cierra toda la pila (flujo "ir a X")
 */
RN.uiComponents.trasCerrar = function (fn, opts) {
  opts = opts || {};
  var todo = opts.todo !== false; // default true
  RN.uiComponents.cerrarModal({ todo: todo });
  // Doble rAF: esperar a que el navegador aplique classList.remove('open')
  var run = function () {
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { console.warn('[uiComponents.trasCerrar]', e); }
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () {
      requestAnimationFrame(run);
    });
  } else {
    setTimeout(run, 0);
  }
};

/**
 * v5.53.4 — Abre un modal sustituyendo el actual (alias de modal + replace).
 */
RN.uiComponents.reemplazarModal = function (html, opts) {
  opts = opts || {};
  opts.replace = true;
  RN.uiComponents.modal(html, opts);
};

/** Diálogo de confirmación reutilizable.
 * v5.13.5 (ISSUE #16): Añadido parámetro opcional onCancel para poder manejar
 * la cancelación (antes la Promise quedaba colgada si se cancelaba).
 * Firma: confirm(titulo, mensaje, onConfirm, opts)  — onConfirm puede ser opts
 * Para usar onCancel: confirm(titulo, mensaje, onConfirm, { onCancel, danger })
 */
RN.uiComponents.confirm = function (titulo, mensaje, onConfirm, opts) {
  opts = opts || {};
  const html = `
    <div class="modal-header"><h3>${RN.render.esc(titulo)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><p>${RN.render.esc(mensaje)}</p></div>
    <div class="modal-footer">
      <button class="btn ghost" id="confirm-cancel">Cancelar</button>
      <button class="btn ${opts.danger ? 'danger' : 'primary'}" id="confirm-ok">Confirmar</button>
    </div>`;
  RN.uiComponents.modal(html);
  document.getElementById('confirm-ok').onclick = () => { RN.uiComponents.cerrarModal(); if (onConfirm) onConfirm(); };
  // v5.13.5 (ISSUE #16): invocar onCancel al cancelar (si se proporcionó)
  document.getElementById('confirm-cancel').onclick = () => { RN.uiComponents.cerrarModal(); if (opts.onCancel) opts.onCancel(); };
};

/** Prompt reutilizable (input de texto/numero).
 * v5.13.5: Añadido opts.onCancel para manejar la cancelación.
 */
RN.uiComponents.prompt = function (titulo, label, defaultValue, onOk, opts) {
  opts = opts || {};
  // v5.55.1: atributos de escritura Android — números sin corrección; texto libre en español.
  var tipo = opts.type || 'text';
  var attrsEscritura = (tipo === 'number')
    ? ' spellcheck="false" autocorrect="off" autocapitalize="off" inputmode="decimal"'
    : ' lang="es" spellcheck="true" autocorrect="on" autocapitalize="sentences"';
  const html = `
    <div class="modal-header"><h3>${RN.render.esc(titulo)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><label>${RN.render.esc(label)}</label>
      <input id="prompt-input" type="${tipo}" value="${RN.render.esc(defaultValue || '')}" ${opts.step ? 'step="' + opts.step + '"' : ''}${attrsEscritura}>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" id="prompt-cancel">Cancelar</button>
      <button class="btn primary" id="prompt-ok">Aceptar</button>
    </div>`;
  RN.uiComponents.modal(html);
  const inp = document.getElementById('prompt-input');
  inp.focus(); inp.select();
  const ok = () => { const v = inp.value; RN.uiComponents.cerrarModal(); onOk(opts.type === 'number' ? parseFloat(v) : v); };
  document.getElementById('prompt-ok').onclick = ok;
  document.getElementById('prompt-cancel').onclick = () => { RN.uiComponents.cerrarModal(); if (opts.onCancel) opts.onCancel(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
};
