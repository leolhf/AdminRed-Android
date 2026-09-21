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

/** Abre un modal con contenido HTML. */
RN.uiComponents.modal = function (html, opts) {
  opts = opts || {};
  const box = document.getElementById('modal-box');
  const overlay = document.getElementById('modal-overlay');

  // v5.13.18 (BUG-CRITICO): Si ya hay un modal abierto, guardar su contenido
  // y className en la pila antes de sobrescribir, para poder restaurarlo al
  // cerrar este nuevo modal (modales anidados).
  // v5.20.0: además se capturan los valores vivos de los campos, porque
  // innerHTML no los conserva al restaurar.
  if (overlay.classList.contains('open')) {
    RN.uiComponents._modalStack.push({
      html: box.innerHTML,
      className: box.className,
      valores: RN.uiComponents._capturarValores(box)
    });
  }

  box.className = 'modal' + (opts.lg ? ' lg' : '');
  box.innerHTML = html;
  overlay.classList.add('open');
  // cerrar al click fuera
  overlay.onclick = (e) => { if (e.target === overlay) RN.uiComponents.cerrarModal(); };
};

/** Cierra el modal. Si hay modales apilados, restaura el nivel anterior. */
RN.uiComponents.cerrarModal = function () {
  // v5.13.18 (BUG-CRITICO): Si hay modales en la pila, restaurar el anterior
  // en lugar de cerrar el overlay. Esto permite que confirm/prompt abiertos
  // sobre otro modal se cierren sin destruir el modal padre.
  if (RN.uiComponents._modalStack.length > 0) {
    var prev = RN.uiComponents._modalStack.pop();
    var box = document.getElementById('modal-box');
    box.className = prev.className;
    box.innerHTML = prev.html;
    // v5.20.0: re-aplicar los valores vivos de los campos (innerHTML no los conserva).
    RN.uiComponents._restaurarValores(box, prev.valores);
    // Re-asignar el onclick del overlay (se perdió al restaurar innerHTML)
    var overlay = document.getElementById('modal-overlay');
    overlay.onclick = (e) => { if (e.target === overlay) RN.uiComponents.cerrarModal(); };
    return;
  }
  document.getElementById('modal-overlay').classList.remove('open');
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
  const html = `
    <div class="modal-header"><h3>${RN.render.esc(titulo)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><label>${RN.render.esc(label)}</label>
      <input id="prompt-input" type="${opts.type || 'text'}" value="${RN.render.esc(defaultValue || '')}" ${opts.step ? 'step="' + opts.step + '"' : ''}>
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
