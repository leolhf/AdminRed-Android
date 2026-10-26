/**
 * ui/views/clientes.js — Vista Clientes v5.55.21
 * Parque (KPIs) · chips · orden · lista con Cobrar en atrasados.
 */
RN.clientesUI = RN.clientesUI || {};
RN.clientesUI.chip = ''; // '' | due | warn | ok | paid | sin-ip | sin-nodo | admin | inactivo
RN.clientesUI.orden = 'ip';

RN.clientesUI.onChip = function (chip) {
  RN.clientesUI.chip = (RN.clientesUI.chip === chip) ? '' : chip;
  // sincronizar select de estado si el chip es un estado conocido
  var fe = document.getElementById('filter-estado');
  if (fe) {
    if (['ok', 'warn', 'due', 'paid', 'parcial', 'por-iniciar', 'inactivo', 'admin'].indexOf(RN.clientesUI.chip) >= 0) {
      fe.value = RN.clientesUI.chip;
    } else {
      fe.value = '';
    }
  }
  RN.render.clientes();
};

RN.clientesUI.onOrden = function () {
  var el = document.getElementById('cli-orden');
  if (el) RN.clientesUI.orden = el.value || 'ip';
  RN.render.clientes();
};

RN.render.clientes = function () {
  var cont = document.getElementById('lista-clientes');
  if (!cont) return;

  var abiertas = Array.prototype.slice.call(cont.querySelectorAll('.acc-card.open'))
    .map(function (el) { return el.id; });

  var q = (document.getElementById('search-clientes') || {}).value || '';
  var fe = (document.getElementById('filter-estado') || {}).value || '';
  var chip = RN.clientesUI.chip || '';
  var orden = RN.clientesUI.orden || 'ip';
  var mes = RN.calc.mesActualStr();
  var todos = RN.state.clients || [];

  // --- Parque KPIs (sobre todos, no solo filtrados) ---
  var nActivos = 0, nDue = 0, nOk = 0, nPaid = 0, nInact = 0, nAdmin = 0, nSinIp = 0, nSinNodo = 0, nWarn = 0;
  todos.forEach(function (c) {
    if (!c) return;
    var esAdm = RN.calc.esAdmin && RN.calc.esAdmin(c);
    if (esAdm) nAdmin++;
    if (c.activo === false) { nInact++; return; }
    nActivos++;
    var st = RN.calc.getStatus(c, mes);
    if (st === 'due') nDue++;
    else if (st === 'ok') nOk++;
    else if (st === 'paid') nPaid++;
    else if (st === 'warn') nWarn++;
    if (!c.ip || !String(c.ip).trim()) nSinIp++;
    if (!c.nodoId) nSinNodo++;
  });

  var parque = document.getElementById('cli-parque');
  if (parque) {
    var kpis = [
      { label: 'Activos', value: String(nActivos), cls: 'blue' },
      { label: 'Atrasados', value: String(nDue), cls: nDue ? 'red' : 'green' },
      { label: 'Al día / pagados', value: String(nOk + nPaid), cls: 'green' },
      { label: 'Sin IP', value: String(nSinIp), cls: nSinIp ? 'amber' : 'green' }
    ];
    parque.innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
    }).join('');
  }

  // --- Chips ---
  var chipsEl = document.getElementById('cli-chips');
  if (chipsEl) {
    var chips = [
      { id: '', label: 'Todos', n: todos.length },
      { id: 'due', label: 'Atrasados', n: nDue },
      { id: 'warn', label: 'Por vencer', n: nWarn },
      { id: 'ok', label: 'Al día', n: nOk },
      { id: 'paid', label: 'Pagados', n: nPaid },
      { id: 'sin-ip', label: 'Sin IP', n: nSinIp },
      { id: 'sin-nodo', label: 'Sin nodo', n: nSinNodo },
      { id: 'admin', label: 'Admin', n: nAdmin },
      { id: 'inactivo', label: 'Inactivos', n: nInact }
    ];
    chipsEl.innerHTML = chips.map(function (ch) {
      var active = (chip === ch.id) || (!chip && ch.id === '');
      return '<button type="button" class="chip' + (active ? ' active' : '') + '" data-chip="' + ch.id + '"'
        + ' onclick="RN.clientesUI.onChip(\'' + ch.id + '\')">' + ch.label
        + ' <span class="chip-n">' + ch.n + '</span></button>';
    }).join('');
  }

  // Sync orden select
  var ordEl = document.getElementById('cli-orden');
  if (ordEl) ordEl.value = orden;

  // Si hay chip de estado y el select está vacío, el chip manda
  var estadoFiltro = fe || (['ok', 'warn', 'due', 'paid', 'parcial', 'por-iniciar', 'inactivo', 'admin'].indexOf(chip) >= 0 ? chip : '');

  // --- Lista filtrada ---
  var lista = RN.calc.filtrarClientes(todos, q).filter(function (c) {
    if (!c) return false;
    var st = RN.calc.getStatus(c, mes);
    var esAdm = RN.calc.esAdmin && RN.calc.esAdmin(c);

    if (chip === 'sin-ip') {
      if (c.ip && String(c.ip).trim()) return false;
    } else if (chip === 'sin-nodo') {
      if (c.nodoId) return false;
    } else if (chip === 'admin' || estadoFiltro === 'admin') {
      if (!esAdm) return false;
    } else if (chip === 'inactivo' || estadoFiltro === 'inactivo') {
      if (c.activo !== false) return false;
    } else if (estadoFiltro) {
      if (st !== estadoFiltro) return false;
      // al filtrar por estado de pago, suele interesar activos
      if (c.activo === false && estadoFiltro !== 'inactivo') return false;
    }

    return true;
  });

  // Orden
  if (orden === 'nombre') {
    lista.sort(function (a, b) {
      return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
  } else if (orden === 'deuda') {
    lista.sort(function (a, b) {
      var ra = RN.calc.resumenCliente(a, mes);
      var rb = RN.calc.resumenCliente(b, mes);
      var ta = ra.mora > 0 ? ra.totalDeuda : (ra.estado === 'paid' ? 0 : ra.totalMes);
      var tb = rb.mora > 0 ? rb.totalDeuda : (rb.estado === 'paid' ? 0 : rb.totalMes);
      return (tb || 0) - (ta || 0);
    });
  } else if (orden === 'dia') {
    lista.sort(function (a, b) {
      return (a.diaPago || 1) - (b.diaPago || 1) || (a.nombre || '').localeCompare(b.nombre || '', 'es');
    });
  } else {
    lista.sort(RN.render.compararClientePorIP);
  }

  var contador = document.getElementById('cli-contador');
  if (contador) {
    contador.textContent = lista.length
      ? ('Mostrando ' + lista.length + ' de ' + todos.length + ' · Mes ' + mes)
      : ('Ningún cliente con estos filtros · Total ' + todos.length);
  }

  if (!todos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">👥</div>No hay clientes. Crea el primero con “+ Nuevo”.'
      + (RN.state.planes && RN.state.planes.length ? '' : ' Si aún no tienes planes, configúralos con “Planes”.')
      + '</div>';
    return;
  }

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">👥</div>Ningún cliente coincide. Prueba otro filtro o búsqueda.</div>';
    return;
  }

  cont.innerHTML = lista.map(function (c) {
    var r = RN.calc.resumenCliente(c, mes);
    var estado = r.estado;
    var deuda = r.deuda;
    var mora = r.mora;
    var total = mora > 0 ? r.totalDeuda : r.totalMes;
    var esAdm = RN.calc.esAdmin(c);
    var megas = 0;
    try { megas = RN.calc.getMegasCliente(c) || 0; } catch (e) { megas = 0; }
    var planNom = RN.render.nombrePlan(c);
    var nodoNom = '';
    if (c.nodoId && RN.nodos && RN.nodos.porId) {
      var nd = RN.nodos.porId(c.nodoId);
      if (nd) nodoNom = nd.nombre;
    }

    var subParts = [];
    if (esAdm) subParts.push('Admin');
    else subParts.push(RN.render.esc(planNom) + (megas ? ' · ' + megas + 'M' : ''));
    if (c.ip) subParts.push('<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>');
    else subParts.push('<span class="muted">Sin IP</span>');
    if (nodoNom) subParts.push(RN.render.esc(nodoNom));
    if (c.telefono) subParts.push(RN.render.esc(c.telefono));

    var showCobrar = !esAdm && (estado === 'due' || estado === 'warn' || estado === 'parcial' || (estado !== 'paid' && total > 0));
    var cobrarBtn = showCobrar
      ? '<div class="acc-summary-cli-actions">' + RN.render.btnCobrar(c.id, { stop: true }) + '</div>'
      : '';

    return '<div class="acc-card" id="acc-cli-' + c.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cli-' + c.id + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre)
            + (mora > 0 ? ' <span class="badge due" style="font-size:10px;vertical-align:middle">' + mora + ' mes' + (mora > 1 ? 'es' : '') + '</span>' : '')
            + (c.activo === false ? ' <span class="badge muted" style="font-size:10px">Inactivo</span>' : '')
            + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join(' · ') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (esAdm ? 'No paga' : (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total))) + '</div>' +
          '<div class="lbl">' + (esAdm ? (megas > 0 ? megas + 'M admin' : 'Administrador') : (estado === 'paid' ? 'Este mes' : (mora > 0 ? 'Deuda total' : 'Total'))) + '</div>' +
        '</div>' +
        cobrarBtn +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan</span><span class="acc-value">' + RN.render.esc(planNom) + '<br><span class="muted" style="font-size:12px">' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + (megas ? ' · ' + megas + 'M' : '') + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        (nodoNom ? '<div class="acc-row"><span class="acc-label">Nodo</span><span class="acc-value">' + RN.render.esc(nodoNom) + '</span></div>' : '') +
        '<div class="acc-row"><span class="acc-label">Dirección</span><span class="acc-value">' + (c.direccion ? RN.render.esc(c.direccion) : '<span class="muted">—</span>') + '</span></div>' +
        (RN.cola && RN.cola.tieneCola(c) ? (function () {
          var d = RN.cola.datos(c);
          return '<div class="acc-row"><span class="acc-label">Cola MikroTik</span><span class="acc-value">'
            + (d.esAdmin ? 'Max Limit: no se toca' : 'Max ' + RN.cola.formatoVel(d.maxLimitKbps))
            + '<br><span class="muted" style="font-size:12px">Limit At '
            + (d.limitAtKbps > 0 ? RN.cola.formatoVel(d.limitAtKbps) : '—')
            + ' · prioridad ' + d.prioridad + '</span></span></div>';
        })() : '') +
        (esAdm ? '' : '<div class="acc-row"><span class="acc-label">Día de pago</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>') +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        (esAdm ? '' : '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>') +
        '<div class="acc-actions">' +
          (esAdm ? '' : RN.render.btnCobrar(c.id)) +
          (esAdm ? '' : '<button class="btn sm" onclick="RN.clientHistory.abrir(\'' + c.id + '\')">Historial</button>') +
          (esAdm ? '' : RN.render.btnWhatsApp(c.id, { telefono: c.telefono })) +
          (RN.cola && RN.cola.tieneCola(c) ? '<button class="btn sm" onclick="RN.cola.copiarDeCliente(\'' + c.id + '\')" title="Comando cola Winbox">Cola</button>' : '') +
          '<button class="btn sm" onclick="RN.equiposRed.abrir(\'' + c.id + '\')">Equipos</button>' +
          '<button class="btn sm" onclick="RN.modalCliente.editar(\'' + c.id + '\')">Editar</button>' +
          '<button class="btn sm danger" onclick="RN.confirmDelete.cliente(\'' + c.id + '\')">Eliminar</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  abiertas.forEach(function (cardId) {
    var el = document.getElementById(cardId);
    if (el) el.classList.add('open');
  });
};
