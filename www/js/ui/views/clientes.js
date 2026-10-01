/**
 * ui/views/clientes.js — Vista Clientes: lista en acordeón con búsqueda y filtros.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */
// ---------- CLIENTES ----------
RN.render.clientes = function () {
  const cont = document.getElementById('lista-clientes');
  if (!cont) return;
  // v5.13.7 (CODE-4) / FIX v5.13.12: capturar qué tarjetas estaban abiertas
  // ANTES de sobreescribir el innerHTML, para poder reabrirlas tras el
  // re-render. Sin esto, la línea `abiertas.forEach(...)` del final lanzaba
  // un ReferenceError ("abiertas is not defined") que abortaba arrancar()
  // antes de conectar los botones del header (pasos 11 vs 13 de init.js),
  // dejando todos los botones de la app sin funcionar.
  const abiertas = Array.prototype.slice.call(cont.querySelectorAll('.acc-card.open'))
    .map(function (el) { return el.id; });
  const q = (document.getElementById('search-clientes') || {}).value || '';
  const fe = (document.getElementById('filter-estado') || {}).value || '';
  // v5.44.0: búsqueda por nombre, dirección, IP, teléfono, plan y `deuda>X` (RN.calc.filtrarClientes)
  let lista = RN.calc.filtrarClientes(RN.state.clients, q).filter(c => {
    if (fe && RN.calc.getStatus(c) !== fe) return false;
    return true;
  });

  // v5.12.6: ordenar siempre por IP (orden natural numérico).
  // Los clientes sin IP van al final, ordenados por nombre entre sí.
  lista.sort(RN.render.compararClientePorIP);

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">👥</div>No hay clientes. Crea el primero con "+ Nuevo cliente".</div>';
    return;
  }

  // v5.13.1: Bug #4 — mes explícito para descuentos puntuales.
  const mes = RN.calc.mesActualStr();
  cont.innerHTML = lista.map(c => {
    // v5.13.7 (DUP-2): usar resumenCliente para centralizar todos los calculos.
    const r = RN.calc.resumenCliente(c, mes);
    const estado = r.estado;
    const deuda = r.deuda;
    const neto = r.neto;
    const mora = r.mora;
    // v5.13.7 (LOG-1): si hay mora, el total incluye los meses atrasados.
    const total = mora > 0 ? r.totalDeuda : r.totalMes;
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const telHtml = c.telefono ? RN.render.esc(c.telefono) : '';
    const subParts = [];
    if (telHtml) subParts.push(telHtml);
    if (ipHtml) subParts.push(ipHtml);
    if (!subParts.length) subParts.push('<span class="muted">Sin datos</span>');

    return '<div class="acc-card" id="acc-cli-' + c.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cli-' + c.id + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + (mora > 0 ? ' <span class="badge due" style="font-size:10px;vertical-align:middle">' + mora + ' mes' + (mora > 1 ? 'es' : '') + '</span>' : '') + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (estado === 'paid' ? 'Este mes' : (mora > 0 ? 'Deuda total' : 'Total')) + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Dirección</span><span class="acc-value">' + (c.direccion ? RN.render.esc(c.direccion) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Pago día</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-actions">' +
          '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar</button>' +
          '<button class="btn sm" onclick="RN.clientHistory.abrir(\'' + c.id + '\')">Historial</button>' +
          '<button class="btn sm" onclick="RN.whatsapp.enviarRecordatorio(\'' + c.id + '\')">WhatsApp</button>' +
          '<button class="btn sm" onclick="RN.equiposRed.abrir(\'' + c.id + '\')">Equipos</button>' +
          '<button class="btn sm" onclick="RN.modalCliente.editar(\'' + c.id + '\')">Editar</button>' +
          '<button class="btn sm danger" onclick="RN.confirmDelete.cliente(\'' + c.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  // v5.13.7 (CODE-4): restaurar tarjetas que estaban abiertas antes del re-render.
  abiertas.forEach(function (cardId) {
    var el = document.getElementById(cardId);
    if (el) el.classList.add('open');
  });
};
