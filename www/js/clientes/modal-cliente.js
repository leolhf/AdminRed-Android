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
  // v5.48.0: precio por mega en USD -> el CUP se deriva de la tasa vigente (redondeo hacia arriba a 100)
  const esUSD = ((document.getElementById('cl-moneda-precio') || {}).value === 'USD');
  const tasa = RN.state.config.tasaUsd || 0;
  const totalUSD = +(megas * precioMega).toFixed(2);
  const precio = esUSD
    ? (tasa > 0 ? RN.calc.redondearCobroCUP(totalUSD * tasa) : 0)
    : +(megas * precioMega).toFixed(2);

  const lbl = document.getElementById('cl-lbl-precio-mega');
  if (lbl) lbl.textContent = esUSD ? 'Precio por mega (USD/Mbps) \u2014 lo que cobras' : 'Precio por mega (CUP/Mbps) \u2014 lo que cobras';

  // Volcar el cálculo en el campo precio (oculto o visible) para que guardar() lo use
  const precioInput = document.getElementById('cl-precio');
  if (precioInput) precioInput.value = precio;

  // Desglose visible
  const desglose = document.getElementById('cl-desglose-personalizado');
  if (desglose) {
    if (esUSD && megas > 0 && precioMega > 0) {
      desglose.style.display = '';
      desglose.innerHTML = tasa > 0
        ? '<strong>' + megas + ' Megas \u00d7 ' + precioMega + ' USD/Mega = ' + totalUSD.toFixed(2) + ' USD \u2248 ' + RN.calc.formatCUP(precio) + '</strong><br><span class="muted" style="font-size:12px">Con la tasa de hoy (1 USD = ' + tasa + ' CUP). El monto en CUP cambia cada mes seg\u00fan la tasa; el precio fijo es el de USD.</span>'
        : '<strong>' + totalUSD.toFixed(2) + ' USD/mes</strong><br><span style="color:var(--danger);font-size:12px">\u26a0 Configura la tasa USD en Ajustes para calcular el monto en CUP.</span>';
    } else if (megas > 0 && precioMega > 0) {
      desglose.style.display = '';
      desglose.innerHTML = '<strong>' + megas + ' Megas \u00d7 ' + precioMega + ' CUP/Mega = ' + RN.calc.formatCUP(precio) + '</strong>';
    } else {
      desglose.style.display = '';
      desglose.innerHTML = '<span class="muted">Ingresa megas y precio por mega para calcular el costo mensual</span>';
    }
  }
};

/**
 * v5.50.0: al marcar "Administrador (no paga)" se ocultan los campos de cobro
 * (día de pago, mes de inicio, descuento, deuda de equipo) y el precio se fija en 0.
 */
RN.modalCliente.toggleAdmin = function () {
  var chk = document.getElementById('cl-admin');
  var esAdmin = !!(chk && chk.checked);
  ['cl-bloque-pago', 'cl-bloque-equipo'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = esAdmin ? 'none' : '';
  });
  var precio = document.getElementById('cl-precio');
  if (precio) {
    if (esAdmin) { precio.value = 0; precio.disabled = true; }
    else { precio.disabled = false; }
  }
  var grupo = document.getElementById('cl-moneda-precio');
  if (grupo) grupo.disabled = esAdmin;
  var pm = document.getElementById('cl-precio-mega');
  if (pm) pm.disabled = esAdmin;
  if (!esAdmin) RN.modalCliente.recalcPersonalizado();
  else {
    var desglose = document.getElementById('cl-desglose-personalizado');
    if (desglose) desglose.innerHTML = '<span class="muted">Administrador: no paga. Elige un plan o escribe los megas solo para saber cu\u00e1nta red consume.</span>';
  }
};

/** v5.50.0: arma un cliente temporal con lo que hay en el formulario (para calcular la cola). */
RN.modalCliente._clienteDesdeForm = function () {
  var val = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
  var planId = val('cl-plan') || null;
  var esAdmin = !!(document.getElementById('cl-admin') || {}).checked;
  return {
    nombre: (val('cl-nombre') || '').trim(),
    ip: (val('cl-ip') || '').replace(/[^0-9.]/g, '').trim(),
    colaPadre: (document.getElementById('cl-cola-padre') && document.getElementById('cl-cola-padre').value) || null,
    planId: planId,
    megas: planId ? 0 : (parseFloat(val('cl-megas')) || 0),
    esAdmin: esAdmin,
    limitAtManual: RN.cola.parseVelocidad(val('cl-limitat'))
  };
};

/** Muestra Max Limit, Limit At y prioridad calculados para el cliente del formulario. */
RN.modalCliente.actualizarCola = function () {
  var box = document.getElementById('cl-cola-info');
  if (!box) return;
  var c = RN.modalCliente._clienteDesdeForm();
  var lbl = document.getElementById('cl-lbl-limitat');
  if (lbl) lbl.innerHTML = (c.esAdmin ? 'Limit At manual * ' : 'Limit At manual ') + '<span class="muted" style="font-size:11px">' + (c.esAdmin ? '(obligatorio · ej: 2M, 3M)' : '(opcional · ej: 2M, 1400k)') + '</span>';
  if (!RN.cola.tieneCola(c)) {
    box.innerHTML = '<span class="muted">Define el plan o los megas para calcular la cola.</span>';
    return;
  }
  var d = RN.cola.datos(c);
  var partes = [];
  if (c.esAdmin) partes.push('Max Limit: <strong>no se toca</strong> (lo cambian los schedulers)');
  else partes.push('Max Limit: <strong>' + RN.cola.formatoVel(d.maxLimitKbps) + '</strong>');
  partes.push('Limit At: <strong>' + (d.limitAtKbps > 0 ? RN.cola.formatoVel(d.limitAtKbps) : '\u2014') + '</strong>' + (d.manual ? ' <span class="muted">(manual)</span>' : ''));
  partes.push('Prioridad: <strong>' + d.prioridad + '</strong>');
  var extra = '<br><span class="muted" style="font-size:12px">Nombre en el router: ' + RN.render.esc(RN.cola.nombreSeguro(c.nombre)) + (RN.cola.ipValida(c.ip) ? ' \u00b7 ' + RN.render.esc(c.ip) + '/32' : ' \u00b7 falta IP v\u00e1lida') + '</span>';
  box.innerHTML = partes.join(' \u00b7 ') + extra;
};

/** Copia el comando de la cola del cliente del formulario. */
RN.modalCliente.copiarComando = function () {
  var c = RN.modalCliente._clienteDesdeForm();
  var r = RN.cola.comando(c);
  if (!r.ok) { RN.notifyUI.toast(r.error, 'error'); return; }
  RN.cola.copiar(r.comando);
};

RN.modalCliente.abrir = function (id) {
  RN.modalCliente._editId = id || null;
  const c = id ? RN.state.clients.find(x => x.id === id) : null;
  const planesOpts = RN.state.planes.map(p => `<option value="${p.id}" ${c && c.planId === p.id ? 'selected' : ''}>${RN.render.esc(p.nombre)} \u00b7 ${p.megas}M \u00b7 ${RN.calc.formatCUP(p.precio)}</option>`).join('');

  const html = `
    <div class="modal-header"><h3>${c ? 'Editar cliente' : 'Nuevo cliente'}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Nombre *</label><input id="cl-nombre" value="${RN.render.esc(c ? c.nombre : '')}" lang="es" spellcheck="true" autocorrect="on" autocapitalize="words" autocomplete="name"></div></div>
      <div class="form-row"><label><input type="checkbox" id="cl-admin" ${c && c.esAdmin === true ? 'checked' : ''} onchange="RN.modalCliente.toggleAdmin()"> Administrador (no paga)</label>
        <small class="muted" style="display:block;margin-top:4px">Usa la red pero no cuenta como cliente que paga: no sale en cobros, alertas ni notificaciones. Sus megas se muestran aparte.</small></div>
      <div class="form-row cols-2">
        <div><label>Tel\u00e9fono</label>
          <div style="display:flex;gap:6px;align-items:flex-end">
            <input id="cl-tel" value="${RN.render.esc(c ? c.telefono : '')}" placeholder="+53..." style="flex:1" inputmode="tel" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="tel">
            ${RN.modalCliente.soportaContactos() ? '<button type="button" class="btn" style="white-space:nowrap;padding:8px 10px" onclick="RN.modalCliente.importarDeContactos()" title="Importar desde contactos del tel\u00e9fono">\ud83d\udccd Contactos</button>' : ''}
          </div>
        </div>
        <div><label>Direcci\u00f3n</label><input id="cl-dir" value="${RN.render.esc(c ? c.direccion : '')}" spellcheck="true" autocorrect="on" autocapitalize="sentences"></div>
        <div><label>IP / Direcci\u00f3n de red <span class="muted" style="font-size:11px">(red local)</span></label>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="cl-ip" inputmode="decimal" pattern="[0-9.]*" maxlength="15" value="${RN.render.esc((function(){ if(c&&c.ip) return c.ip; return (RN.cola&&RN.cola.siguienteIpLibre)?(RN.cola.siguienteIpLibre(null)||''):''; })())}" placeholder="Ej: 192.168.20.10" oninput="this.value=this.value.replace(/[^0-9.]/g,'');RN.modalCliente._hintIp()" spellcheck="false" autocorrect="off" autocapitalize="off" style="flex:1">
            <button type="button" class="btn sm" title="Siguiente IP libre" onclick="RN.modalCliente.usarIpLibre()">Libre</button>
          </div>
          <small class="muted" id="cl-ip-hint" style="display:block;margin-top:4px"></small>
        </div>
        <div><label>Nodo de red <span class="muted" style="font-size:11px">(opcional)</span></label>
          <select id="cl-nodo"><option value="">— Sin asignar —</option>${(RN.nodos && RN.nodos.lista ? RN.nodos.lista() : []).slice().sort(function(a,b){return (a.nombre||'').localeCompare(b.nombre||'','es');}).map(function(n){return '<option value="'+n.id+'"'+(c&&c.nodoId===n.id?' selected':'')+'>'+RN.render.esc(n.nombre)+(n.tipo?' · '+n.tipo:'')+'</option>';}).join('')}</select>
          <span class="muted" style="font-size:11px">Carga por AP/router (100M vs 1G)</span>
        </div>
      </div>
      <div class="form-row cols-2">
        <div><label>Plan de servicio</label>
          <select id="cl-plan" onchange="RN.modalCliente.recalcPersonalizado()"><option value="">\u2014 Personalizado \u2014</option>${planesOpts}</select>
        </div>
        <div><label>Precio mensual (CUP) *</label><input id="cl-precio" type="number" step="0.01" value="${c ? (c.precio || 0) : ''}" oninput="RN.modalCliente.recalcPersonalizado()"></div>
      </div>

      <div id="cl-grupo-personalizado" class="form-row cols-2" style="${c && c.planId ? 'display:none' : ''}">
        <div><label>Megas asignados (Mbps)</label><input id="cl-megas" type="number" step="1" min="0" value="${c ? (c.megas || 0) : 0}" placeholder="Ej: 30" oninput="RN.modalCliente.recalcPersonalizado()"></div>
        <div><label id="cl-lbl-precio-mega">Precio por mega (${c && c.precioMoneda === 'USD' ? 'USD' : 'CUP'}/Mbps) \u2014 lo que cobras</label><input id="cl-precio-mega" type="number" step="0.01" min="0" value="${c ? (c.precioMega || 0) : 0}" placeholder="Ej: 40" oninput="RN.modalCliente.recalcPersonalizado()"></div>
        <div style="grid-column:1 / -1"><label>Moneda del precio por mega</label>
          <select id="cl-moneda-precio" onchange="RN.modalCliente.recalcPersonalizado()">
            <option value="CUP" ${c && c.precioMoneda === 'USD' ? '' : 'selected'}>CUP (pesos) \u2014 precio fijo en CUP</option>
            <option value="USD" ${c && c.precioMoneda === 'USD' ? 'selected' : ''}>USD (d\u00f3lares) \u2014 se convierte a CUP con la tasa</option>
          </select>
        </div>
      </div>
      <div id="cl-desglose-personalizado" class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:12px"></div>

      <div class="divider"></div>
      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Cola MikroTik</h3>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Parent e IP definen el comando para el RouterBoard.</p>
      <div class="form-row cols-2">
        <div><label>Cola padre</label>
          <select id="cl-cola-padre">${(function(){
            var padres = (RN.cola && RN.cola.padresDisponibles) ? RN.cola.padresDisponibles() : ['LEO'];
            var actual = (c && c.colaPadre) ? c.colaPadre : ((RN.state.config && RN.state.config.colaPadre) || 'LEO');
            if (padres.indexOf(actual) < 0) padres = [actual].concat(padres);
            return padres.map(function(p){
              return '<option value="' + RN.render.esc(p) + '"' + (p === actual ? ' selected' : '') + '>' + RN.render.esc(p) + '</option>';
            }).join('');
          })()}</select>
        </div>
        <div><label id="cl-lbl-limitat">Limit At manual <span class="muted" style="font-size:11px">(opcional · ej: 2M, 1400k)</span></label>
          <input id="cl-limitat" value="${c && c.limitAtManual > 0 ? RN.cola.formatoVel(c.limitAtManual) : ''}" placeholder="Autom\u00e1tico seg\u00fan el plan" spellcheck="false" autocorrect="off" autocapitalize="off"></div>
      </div>
<div id="cl-cola-info" class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:8px"></div>
      <div class="form-row"><button type="button" class="btn sm" onclick="RN.modalCliente.copiarComando()">\ud83d\udccb Copiar comando</button></div>

      <div id="cl-bloque-pago">
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
      </div>
      <div id="cl-bloque-equipo">
      <div class="divider"></div>
      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Equipo vendido a plazos (opcional)</h3>
      <div class="form-row cols-3">
        <div><label>Deuda equipo (CUP)</label><input id="cl-deuda-eq" type="number" step="0.01" value="${c ? (c.deudaEquipo || 0) : 0}"></div>
        <div><label>Deuda original</label><input id="cl-deuda-orig" type="number" step="0.01" value="${c ? (c.deudaEquipoOriginal || c.deudaEquipo || 0) : 0}"></div>
        <div><label>Cuota mensual equipo</label><input id="cl-cuota-eq" type="number" step="0.01" value="${c ? (c.cuotaEquipo || 0) : 0}"></div>
      </div>
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
  // v5.50.0: aplicar estado de administrador (si el cliente ya lo es)
  RN.modalCliente.toggleAdmin();
  // v5.50.0: mantener la seccion "Cola MikroTik" al dia con el formulario
  ['cl-nombre', 'cl-ip', 'cl-plan', 'cl-megas', 'cl-admin', 'cl-limitat', 'cl-cola-padre'].forEach(function (eid) {
    var el = document.getElementById(eid);
    if (el) { el.addEventListener('input', RN.modalCliente.actualizarCola); el.addEventListener('change', RN.modalCliente.actualizarCola); }
  });
  RN.modalCliente.actualizarCola();
  if (RN.modalCliente._hintIp) RN.modalCliente._hintIp();
};

RN.modalCliente.editar = RN.modalCliente.abrir;

RN.modalCliente.guardar = function () {
  const id = RN.modalCliente._editId;
  const nombre = document.getElementById('cl-nombre').value.trim();
  if (!nombre) { RN.notifyUI.toast('El nombre es obligatorio', 'error'); return; }
  const planId = document.getElementById('cl-plan').value || null;
  // v5.50.0: administrador (no paga). El precio 0 solo se acepta con esta casilla marcada.
  const esAdmin = !!(document.getElementById('cl-admin') || {}).checked;
  const precio = esAdmin ? 0 : (parseFloat(document.getElementById('cl-precio').value) || 0);
  const diaRaw = parseInt(document.getElementById('cl-dia').value, 10) || 5;
  // v5.13.10 (DUP-1): validar contra la fuente única de verdad.
  const CORTES_PAGO = RN.ciclos.cortesOficiales();
  const dia = (CORTES_PAGO.indexOf(diaRaw) !== -1) ? diaRaw : CORTES_PAGO[0];

  // Datos personalizados (solo relevantes si no hay plan)
  const megas = parseFloat((document.getElementById('cl-megas') || {}).value) || 0;
  const precioMega = esAdmin ? 0 : (parseFloat((document.getElementById('cl-precio-mega') || {}).value) || 0);
  // v5.48.0: precio fijo en USD (solo personalizados con megas y precio por mega)
  const precioMoneda = (!esAdmin && !planId && (document.getElementById('cl-moneda-precio') || {}).value === 'USD') ? 'USD' : 'CUP';
  if (precioMoneda === 'USD') {
    if (!(megas > 0 && precioMega > 0)) {
      RN.notifyUI.toast('Con precio en USD define los megas y el precio por mega', 'error'); return;
    }
    if (!(RN.state.config.tasaUsd > 0)) {
      RN.notifyUI.toast('Configura la tasa USD en Ajustes antes de usar precios en USD', 'error'); return;
    }
  }

  // Validación: si es personalizado, debe tener precio > 0 (venga de megas×precio o escrito directo)
  if (!esAdmin && !planId && precio <= 0) {
    RN.notifyUI.toast('En personalizado define megas y precio por mega (o un precio manual)', 'error');
    return;
  }
  if (!esAdmin && precio <= 0 && planId) {
    RN.notifyUI.toast('El plan no tiene precio definido', 'error'); return;
  }

  // v5.50.0: cola MikroTik. Con cola (administrador o con megas) la IP es obligatoria y valida
  // (se usa como /32), y el administrador necesita Limit At manual.
  const limitAtTxt = (document.getElementById('cl-limitat') || {}).value || '';
  const limitAtManual = RN.cola.parseVelocidad(limitAtTxt);
  if (limitAtTxt.trim() && !limitAtManual) {
    RN.notifyUI.toast('Limit At no v\u00e1lido. Usa por ejemplo 2M o 1400k', 'error'); return;
  }
  const clienteCola = RN.modalCliente._clienteDesdeForm();
  if (RN.cola.tieneCola(clienteCola)) {
    if (!RN.cola.ipValida(clienteCola.ip)) {
      RN.notifyUI.toast('Este cliente lleva cola en el MikroTik: la IP es obligatoria y debe ser v\u00e1lida (ej: 192.168.20.24)', 'error'); return;
    }
    if (esAdmin && !limitAtManual) {
      RN.notifyUI.toast('El administrador necesita un Limit At manual (ej: 2M)', 'error'); return;
    }
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
    nodoId: (document.getElementById('cl-nodo') && document.getElementById('cl-nodo').value) || null,
    planId,
    precio,
    diaPago: dia,
    descuentoRecurrente: esAdmin ? 0 : (parseFloat(document.getElementById('cl-desc-rec').value) || 0),
    mesInicio: (function () {
      // v5.13.7 (LOG-3): solo sobrescribir mesInicio si el campo existe y tiene valor.
      // Si el campo no esta en el DOM, devolver undefined para que Object.assign no lo toque.
      var el = document.getElementById('cl-mes-inicio');
      return el && el.value ? el.value : undefined;
    })(),

    deudaEquipo: esAdmin ? 0 : (parseFloat(document.getElementById('cl-deuda-eq').value) || 0),
    deudaEquipoOriginal: esAdmin ? 0 : (parseFloat(document.getElementById('cl-deuda-orig').value) || 0),
    cuotaEquipo: esAdmin ? 0 : (parseFloat(document.getElementById('cl-cuota-eq').value) || 0),
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
  // v5.48.0: 'USD' = precio fijo en dólares; 'CUP' = comportamiento de siempre. `precio` queda
  // como referencia en CUP con la tasa de hoy (el cobro real usa RN.calc.getPrecioBase).
  data.precioMoneda = precioMoneda;
  // v5.50.0: esAdmin solo existe cuando es true (ausente = falso, clientes existentes no cambian).
  if (esAdmin) data.esAdmin = true;
  // v5.50.0: Limit At manual (kbps); ausente = se calcula por las reglas
  if (limitAtManual > 0) data.limitAtManual = limitAtManual;
  var padreSel = (document.getElementById('cl-cola-padre') || {}).value || '';
  var padreDef = (RN.state.config && RN.state.config.colaPadre) || 'LEO';
  if (padreSel && padreSel !== padreDef) data.colaPadre = padreSel;
  else delete data.colaPadre;

  // IP duplicada
  if (ipRaw && RN.cola && RN.cola.ipValida(ipRaw) && RN.cola.ipLibre && !RN.cola.ipLibre(ipRaw, id || null)) {
    RN.notifyUI.toast('Esa IP ya está asignada a otro cliente', 'error');
    return;
  }

  if (id) {
    const c = RN.state.clients.find(x => x.id === id);
    Object.assign(c, data);
    if (!esAdmin) delete c.esAdmin;
    if (!(limitAtManual > 0)) delete c.limitAtManual;
    if (!data.colaPadre) delete c.colaPadre;
  } else {
    data.id = RN.calc.uid('cli');
    data.createdAt = new Date().toISOString();
    RN.state.clients.push(data);
  }
  RN.storageLocal.guardar();
  var cidGuardado = id || data.id;
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(id ? 'Cliente actualizado' : 'Cliente creado', 'success');
  // v5.53.5: comando MikroTik para pegar en el RouterBoard
  try {
    if (RN.cola && RN.cola.mostrarComandoCliente && cidGuardado) {
      var cGuardado = RN.state.clients.find(function (x) { return x.id === cidGuardado; });
      if (cGuardado && RN.cola.tieneCola(cGuardado)) {
        setTimeout(function () { RN.cola.mostrarComandoCliente(cidGuardado); }, 250);
      }
    }
  } catch (e) {}
};
