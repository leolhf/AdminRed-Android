/**
 * clientes/modal-cliente.js — Alta/edición de clientes, CRUD de planes, descuento recurrente.
 * v5.8.8 — Plan "Personalizado": megas asignados + precio por mega (venta),
 *          el costo para el cliente se calcula automáticamente (megas × precioPorMega).
 */
RN.modalCliente = RN.modalCliente || {};

RN.modalCliente._editId = null;

/**
 * Importa datos desde la lista de contactos del dispositivo.
 *  - Web (PWA):    Contact Picker API (navigator.contacts) — Chrome Android.
 *  - Nativo (APK): plugin @capacitor-community/contacts (pickContact).
 * Pide nombre, teléfono y dirección. Llena los campos del modal si están visibles.
 */
RN.modalCliente.importarDeContactos = async function () {
  // Feature detection (web o nativo)
  if (!RN.platform.tieneContactos()) {
    RN.notifyUI.toast('Este dispositivo no permite importar contactos.', 'warn');
    return;
  }

  try {
    // --- Obtener el contacto (nativo o web) y normalizarlo ---
    var nombreContacto = '';
    var tels = [];
    var dirContacto = '';

    if (RN.platform.tienePluginContactos()) {
      // ---- NATIVO: plugin @capacitor-community/contacts ----
      var Contacts = RN.platform.plugin('Contacts');
      var perm = await Contacts.requestPermissions();
      if (perm && perm.contacts && perm.contacts !== 'granted' && perm.contacts !== 'limited') {
        RN.notifyUI.toast('Permiso de contactos denegado.', 'warn');
        return;
      }
      var res = await Contacts.pickContact({
        projection: { name: true, phones: true, postalAddresses: true }
      });
      if (!res || !res.contact) return; // el usuario canceló
      var c = res.contact;

      // Nombre: display o composición given+family
      if (c.name) {
        nombreContacto = (c.name.display || '').trim();
        if (!nombreContacto) {
          nombreContacto = [c.name.given, c.name.middle, c.name.family]
            .filter(function (x) { return x; }).join(' ').trim();
        }
      }
      // Teléfonos
      if (Array.isArray(c.phones)) {
        tels = c.phones.map(function (p) { return p && p.number ? String(p.number).trim() : ''; })
          .filter(function (t) { return t; });
      }
      // Dirección (primera postalAddress)
      if (Array.isArray(c.postalAddresses) && c.postalAddresses.length) {
        var pa = c.postalAddresses[0] || {};
        var partesN = [];
        if (pa.street) partesN.push(pa.street);
        if (pa.neighborhood) partesN.push(pa.neighborhood);
        if (pa.city) partesN.push(pa.city);
        if (pa.region) partesN.push(pa.region);
        if (pa.postcode) partesN.push(pa.postcode);
        dirContacto = partesN.join(', ');
      }
    } else {
      // ---- WEB: Contact Picker API ----
      var propsDisponibles = [];
      try { propsDisponibles = await navigator.contacts.getProperties(); } catch (e) { propsDisponibles = []; }
      var props = [];
      ['name', 'tel', 'address'].forEach(function (p) {
        if (propsDisponibles.indexOf(p) !== -1) props.push(p);
      });
      if (props.length === 0) props = ['name', 'tel', 'address'];

      var contacts = await navigator.contacts.select(props, { multiple: false });
      if (!contacts || contacts.length === 0) return; // el usuario canceló
      var contacto = contacts[0];

      // v5.20.0 (BUG-CRITICO): Al importar un contacto, el nombre y la dirección
      // se quedaban en blanco y solo se guardaba el teléfono. Dos causas:
      //  (1) El sistema de pila de modales (ui-components.js) restauraba el
      //      formulario desde innerHTML, que NO conserva los valores escritos por
      //      JS (input.value = ...). Al abrir el prompt de "varios números" (o el
      //      confirm de nombre) se perdían el nombre y la dirección recién llenados.
      //      -> Fix global en ui-components.js (captura/restaura valores vivos).
      //  (2) Robustez: normalizamos los datos del contacto (nombre puede venir como
      //      array o string) y re-aplicamos nombre/dirección en los callbacks de los
      //      diálogos, por si el DOM se reconstruye.

      // --- Normalizar datos del contacto (tolerante a formatos) ---
      if (Array.isArray(contacto.name)) {
        if (contacto.name.length) nombreContacto = String(contacto.name[0] || '').trim();
      } else if (typeof contacto.name === 'string') {
        nombreContacto = contacto.name.trim();
      }

      if (Array.isArray(contacto.tel)) {
        tels = contacto.tel.filter(function (t) { return t; });
      } else if (typeof contacto.tel === 'string' && contacto.tel) {
        tels = [contacto.tel];
      }

      if (Array.isArray(contacto.address) && contacto.address.length) {
        var addr = contacto.address[0] || {};
        var partes = [];
        if (addr.streetAddress) partes.push(addr.streetAddress);
        if (addr.city) partes.push(addr.city);
        if (addr.region) partes.push(addr.region);
        if (addr.postalCode) partes.push(addr.postalCode);
        dirContacto = partes.join(', ');
      }
    }

    // --- Helpers idempotentes: re-consultan el DOM por id y re-aplican datos ---
    var setNombre = function (forzar) {
      if (!nombreContacto) return;
      var inp = document.getElementById('cl-nombre');
      if (inp && (forzar || !inp.value.trim())) inp.value = nombreContacto;
    };
    var setDireccion = function () {
      if (!dirContacto) return;
      var inp = document.getElementById('cl-dir');
      if (inp) inp.value = dirContacto;
    };
    var setTel = function (valor) {
      if (!valor) return;
      var inp = document.getElementById('cl-tel');
      if (inp) inp.value = valor;
    };

    // Paso 1: leer el nombre actual antes de modificar nada.
    var nombreInput = document.getElementById('cl-nombre');
    var nombreActual = nombreInput ? nombreInput.value.trim() : '';

    // Paso 2: llenar campos directos (sin interacción del usuario).
    var necesitaConfirmNombre = false;
    if (nombreContacto) {
      if (nombreInput && !nombreActual) setNombre(true);
      else if (nombreInput) necesitaConfirmNombre = true;
    }

    var necesitaPromptTel = false;
    if (tels.length === 1) setTel(tels[0]);
    else if (tels.length > 1) necesitaPromptTel = true;

    setDireccion();

    // Paso 3: diálogos al final (modales anidados). Los callbacks re-aplican todo.
    var abrirPromptTel = function () {
      var opciones = tels.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
      RN.uiComponents.prompt(
        'Varios números',
        'El contacto tiene varios números:\n' + opciones + '\n\nEscribe el número de la opción (1-' + tels.length + '):',
        '1',
        function (valor) {
          var i = parseInt(valor, 10) - 1;
          var elegido = (i >= 0 && i < tels.length) ? tels[i] : tels[0];
          setTel(elegido);
          setNombre(false);
          setDireccion();
        },
        { type: 'number', step: '1' }
      );
    };

    if (necesitaConfirmNombre) {
      RN.uiComponents.confirm(
        'Reemplazar nombre',
        '¿Reemplazar el nombre actual ("' + nombreActual + '") por "' + nombreContacto + '"?',
        function () {
          setNombre(true);
          setDireccion();
          if (necesitaPromptTel) abrirPromptTel();
        },
        {
          onCancel: function () {
            setNombre(false);
            setDireccion();
            if (necesitaPromptTel) abrirPromptTel();
          }
        }
      );
    } else if (necesitaPromptTel) {
      abrirPromptTel();
    }

    // Avisos informativos.
    if (!nombreContacto) RN.notifyUI.toast('El contacto no tiene nombre guardado.', 'warn');
    if (tels.length === 0) RN.notifyUI.toast('Este contacto no tiene número de teléfono.', 'warn');

    RN.notifyUI.toast('Datos importados del contacto', 'success');
  } catch (e) {
    if (e.name !== 'AbortError') {
      RN.notifyUI.toast('Error al importar contacto: ' + e.message, 'error');
    }
  }
};

RN.modalCliente.soportaContactos = function () {
  // Web: Contact Picker API. Nativo: plugin @capacitor-community/contacts.
  if (RN.platform && RN.platform.tieneContactos) return RN.platform.tieneContactos();
  return ('contacts' in navigator) && ('ContactsManager' in window);
};

/** Recalcula el precio mensual del cliente personalizado y muestra el desglose. v5.8.8 */
RN.modalCliente.recalcPersonalizado = function () {
  const planVal = (document.getElementById('cl-plan') || {}).value;
  const grupo = document.getElementById('cl-grupo-personalizado');
  if (!grupo) return;
  // Mostrar el bloque solo cuando NO hay plan seleccionado (personalizado)
  grupo.style.display = planVal ? 'none' : '';

  if (planVal) return; // si hay plan, los datos vienen del plan

  const megas = parseFloat((document.getElementById('cl-megas') || {}).value) || 0;
  const precioMega = parseFloat((document.getElementById('cl-precio-mega') || {}).value) || 0;
  const precio = +(megas * precioMega).toFixed(2);

  // Volcar el cálculo en el campo precio (oculto o visible) para que guardar() lo use
  const precioInput = document.getElementById('cl-precio');
  if (precioInput) precioInput.value = precio;

  // Desglose visible
  const desglose = document.getElementById('cl-desglose-personalizado');
  if (desglose) {
    if (megas > 0 && precioMega > 0) {
      desglose.style.display = '';
      desglose.innerHTML = '<strong>' + megas + ' Megas \u00d7 ' + precioMega + ' CUP/Mega = ' + RN.calc.formatCUP(precio) + '</strong>';
    } else {
      desglose.style.display = '';
      desglose.innerHTML = '<span class="muted">Ingresa megas y precio por mega para calcular el costo mensual</span>';
    }
  }
};

RN.modalCliente.abrir = function (id) {
  RN.modalCliente._editId = id || null;
  const c = id ? RN.state.clients.find(x => x.id === id) : null;
  const planesOpts = RN.state.planes.map(p => `<option value="${p.id}" ${c && c.planId === p.id ? 'selected' : ''}>${RN.render.esc(p.nombre)} \u00b7 ${p.megas}M \u00b7 ${RN.calc.formatCUP(p.precio)}</option>`).join('');

  const html = `
    <div class="modal-header"><h3>${c ? 'Editar cliente' : 'Nuevo cliente'}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Nombre *</label><input id="cl-nombre" value="${RN.render.esc(c ? c.nombre : '')}"></div></div>
      <div class="form-row cols-2">
        <div><label>Tel\u00e9fono</label>
          <div style="display:flex;gap:6px;align-items:flex-end">
            <input id="cl-tel" value="${RN.render.esc(c ? c.telefono : '')}" placeholder="+53..." style="flex:1">
            ${RN.modalCliente.soportaContactos() ? '<button type="button" class="btn" style="white-space:nowrap;padding:8px 10px" onclick="RN.modalCliente.importarDeContactos()" title="Importar desde contactos del tel\u00e9fono">\ud83d\udccd Contactos</button>' : ''}
          </div>
        </div>
        <div><label>Direcci\u00f3n</label><input id="cl-dir" value="${RN.render.esc(c ? c.direccion : '')}"></div>
        <div><label>IP / Direcci\u00f3n de red <span class="muted" style="font-size:11px">(ej: 192.168.1.10)</span></label><input id="cl-ip" inputmode="decimal" pattern="[0-9.]*" maxlength="15" value="${RN.render.esc(c ? c.ip : '')}" placeholder="Ej: 192.168.1.10" oninput="this.value=this.value.replace(/[^0-9.]/g,'')"></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Plan de servicio</label>
          <select id="cl-plan" onchange="RN.modalCliente.recalcPersonalizado()"><option value="">\u2014 Personalizado \u2014</option>${planesOpts}</select>
        </div>
        <div><label>Precio mensual (CUP) *</label><input id="cl-precio" type="number" step="0.01" value="${c ? (c.precio || 0) : ''}" oninput="RN.modalCliente.recalcPersonalizado()"></div>
      </div>

      <div id="cl-grupo-personalizado" class="form-row cols-2" style="${c && c.planId ? 'display:none' : ''}">
        <div><label>Megas asignados (Mbps)</label><input id="cl-megas" type="number" step="1" min="0" value="${c ? (c.megas || 0) : 0}" placeholder="Ej: 30" oninput="RN.modalCliente.recalcPersonalizado()"></div>
        <div><label>Precio por mega (CUP/Mbps) \u2014 lo que cobras</label><input id="cl-precio-mega" type="number" step="0.01" min="0" value="${c ? (c.precioMega || 0) : 0}" placeholder="Ej: 40" oninput="RN.modalCliente.recalcPersonalizado()"></div>
      </div>
      <div id="cl-desglose-personalizado" class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:12px"></div>

      <div class="form-row cols-2">
        <div><label>D\u00eda de pago (corte) *</label><select id="cl-dia">${
          (function () {
            // v5.13.10 (DUP-1): cortes desde la fuente única de verdad.
            var cortes = RN.ciclos.cortesOficiales();
            var actual = c ? (c.diaPago || cortes[0]) : cortes[0];
            if (cortes.indexOf(actual) === -1) {
              // Redondear al corte más cercano; en empate, al corte mayor
              actual = cortes.reduce(function (best, cut) {
                return Math.abs(cut - actual) <= Math.abs(best - actual) ? cut : best;
              }, cortes[0]);
            }
            return cortes.map(function (cut) {
              return '<option value="' + cut + '"' + (cut === actual ? ' selected' : '') + '>' + cut + '</option>';
            }).join('');
          })()
        }</select></div>
        <div><label>Descuento recurrente (CUP)</label><input id="cl-desc-rec" type="number" step="0.01" value="${c ? (c.descuentoRecurrente || 0) : 0}"></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Mes de inicio de cobro</label>
          <select id="cl-mes-inicio">${(function () {
            var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
            var hoy = new Date();
            var actual = c && c.mesInicio ? c.mesInicio : (RN.calc.mesActualStr ? RN.calc.mesActualStr() : hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0'));
            var opts = '';
            // 6 meses hacia atras + 12 hacia adelante desde el mes actual
            for (var i = -6; i <= 12; i++) {
              var d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
              var val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              var txt = meses[d.getMonth()] + ' ' + d.getFullYear();
              opts += '<option value="' + val + '"' + (val === actual ? ' selected' : '') + '>' + txt + '</option>';
            }
            return opts;
          })()}</select>
          <small class="muted" style="display:block;margin-top:4px">A partir de este mes se le empieza a esperar pago. Por defecto, el mes actual.</small>
        </div>
      </div>
      <div class="divider"></div>
      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Equipo vendido a plazos (opcional)</h3>
      <div class="form-row cols-3">
        <div><label>Deuda equipo (CUP)</label><input id="cl-deuda-eq" type="number" step="0.01" value="${c ? (c.deudaEquipo || 0) : 0}"></div>
        <div><label>Deuda original</label><input id="cl-deuda-orig" type="number" step="0.01" value="${c ? (c.deudaEquipoOriginal || c.deudaEquipo || 0) : 0}"></div>
        <div><label>Cuota mensual equipo</label><input id="cl-cuota-eq" type="number" step="0.01" value="${c ? (c.cuotaEquipo || 0) : 0}"></div>
      </div>
      <div class="form-row"><label><input type="checkbox" id="cl-activo" ${(!c || c.activo !== false) ? 'checked' : ''}> Cliente activo</label></div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.modalCliente.guardar()">Guardar</button>
    </div>`;
  RN.uiComponents.modal(html, { lg: true });

  // Al elegir plan, autocompletar precio y recalcular visibilidad del bloque personalizado
  const selPlan = document.getElementById('cl-plan');
  selPlan.addEventListener('change', () => {
    const p = RN.state.planes.find(x => x.id === selPlan.value);
    if (p) {
      document.getElementById('cl-precio').value = p.precio;
      // Al usar un plan, limpiar los campos personalizados
      const m = document.getElementById('cl-megas'); if (m) m.value = 0;
      const pm = document.getElementById('cl-precio-mega'); if (pm) pm.value = 0;
    }
    RN.modalCliente.recalcPersonalizado();
  });

  // Cálculo inicial del desglose
  RN.modalCliente.recalcPersonalizado();
};

RN.modalCliente.editar = RN.modalCliente.abrir;

RN.modalCliente.guardar = function () {
  const id = RN.modalCliente._editId;
  const nombre = document.getElementById('cl-nombre').value.trim();
  if (!nombre) { RN.notifyUI.toast('El nombre es obligatorio', 'error'); return; }
  const planId = document.getElementById('cl-plan').value || null;
  const precio = parseFloat(document.getElementById('cl-precio').value) || 0;
  const diaRaw = parseInt(document.getElementById('cl-dia').value, 10) || 5;
  // v5.13.10 (DUP-1): validar contra la fuente única de verdad.
  const CORTES_PAGO = RN.ciclos.cortesOficiales();
  const dia = (CORTES_PAGO.indexOf(diaRaw) !== -1) ? diaRaw : CORTES_PAGO[0];

  // Datos personalizados (solo relevantes si no hay plan)
  const megas = parseFloat((document.getElementById('cl-megas') || {}).value) || 0;
  const precioMega = parseFloat((document.getElementById('cl-precio-mega') || {}).value) || 0;

  // Validación: si es personalizado, debe tener precio > 0 (venga de megas×precio o escrito directo)
  if (!planId && precio <= 0) {
    RN.notifyUI.toast('En personalizado define megas y precio por mega (o un precio manual)', 'error');
    return;
  }
  if (precio <= 0 && planId) {
    RN.notifyUI.toast('El plan no tiene precio definido', 'error'); return;
  }

  // v5.11.2: normalizar telefono y validar IP (avisos no bloqueantes)
  const telRaw = document.getElementById('cl-tel').value.trim();
  const telRes = RN.validateFields.telefono(telRaw);
  const ipRaw = (document.getElementById('cl-ip').value || '').replace(/[^0-9.]/g, '').trim();
  const ipRes = RN.validateFields.ip(ipRaw);
  // Avisos informativos (no bloquean el guardado)
  if (telRes.mensaje) RN.notifyUI.toast(telRes.mensaje, 'warn');
  if (ipRes.mensaje) RN.notifyUI.toast(ipRes.mensaje, 'warn');

  const data = {
    nombre,
    telefono: telRes.valorNormalizado,
    direccion: document.getElementById('cl-dir').value.trim(),
    ip: ipRaw,
    planId,
    precio,
    diaPago: dia,
    descuentoRecurrente: parseFloat(document.getElementById('cl-desc-rec').value) || 0,
    mesInicio: (function () {
      // v5.13.7 (LOG-3): solo sobrescribir mesInicio si el campo existe y tiene valor.
      // Si el campo no esta en el DOM, devolver undefined para que Object.assign no lo toque.
      var el = document.getElementById('cl-mes-inicio');
      return el && el.value ? el.value : undefined;
    })(),

    deudaEquipo: parseFloat(document.getElementById('cl-deuda-eq').value) || 0,
    deudaEquipoOriginal: parseFloat(document.getElementById('cl-deuda-orig').value) || 0,
    cuotaEquipo: parseFloat(document.getElementById('cl-cuota-eq').value) || 0,
    activo: document.getElementById('cl-activo').checked
  };

  // v5.8.8: guardar megas y precioMega del cliente personalizado.
  // Si hay plan, se guardan en 0 (los megas vienen del plan).
  if (planId) {
    data.megas = 0;
    data.precioMega = 0;
  } else {
    data.megas = megas;
    data.precioMega = precioMega;
  }

  if (id) {
    const c = RN.state.clients.find(x => x.id === id);
    Object.assign(c, data);
  } else {
    data.id = RN.calc.uid('cli');
    data.createdAt = new Date().toISOString();
    RN.state.clients.push(data);
  }
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(id ? 'Cliente actualizado' : 'Cliente creado', 'success');
};
