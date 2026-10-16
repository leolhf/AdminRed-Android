/**
 * ui/views/cobros.js — Vista Cobros del mes.
 * Parte de RN.render (extraído de render.js en v5.45.0; el código no cambió).
 * Depende de: ui/render.js (helpers), calculations.js.
 */
// ---------- COBROS ----------
// v5.52.9 FIX: faltaba inicializar RN.cobros. Sin esto, al cargar el script
// se lanza TypeError ("Cannot set properties of undefined") en setFiltro /
// _pintarRecordatorios, se aborta el resto del archivo (RN.render.cobros nunca
// se define) y RN.render.todo() en init.arrancar() revienta ANTES de conectar
// los botones del header (tema, deshacer, menú rápido). Resultado: sección
// Cobros vacía y botones de header muertos.
RN.cobros = RN.cobros || {};
RN.cobrosFiltro = RN.cobrosFiltro || 'todos'; // todos | hoy | ciclo | vencidos | notificados

RN.cobros.setFiltro = function (f) {
  RN.cobrosFiltro = f || 'todos';
  RN.render.cobros();
};

/** v5.52.8 — Pinta chips Hoy / En ciclo / Vencidos / Notificados. */
RN.cobros._pintarRecordatorios = function (res) {
  var bar = document.getElementById('cobros-recordatorios');
  if (!bar) return;
  if (!res) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  var f = RN.cobrosFiltro || 'todos';
  var cv = RN.ciclos.corteVigente && RN.ciclos.corteVigente();
  var venTxt = '';
  if (cv && RN.ciclos.ventanaCobro) {
    venTxt = RN.ciclos.ventanaCobro(cv.diaPago).texto;
  }
  var chips = [
    { id: 'todos', cls: '', label: 'Todos', n: null },
    { id: 'hoy', cls: 'chip-hoy', label: 'Hoy', n: res.hoy.length },
    { id: 'ciclo', cls: 'chip-ciclo', label: 'En ciclo', n: res.enCiclo.length },
    { id: 'vencidos', cls: 'chip-venc', label: 'Vencidos', n: res.vencidos.length },
    { id: 'notificados', cls: 'chip-wa', label: '💬 Notificados', n: res.notificados.length }
  ];
  var html = chips.map(function (ch) {
    var active = f === ch.id ? ' active' : '';
    var nHtml = ch.n != null ? '<span class="n">' + ch.n + '</span>' : '';
    return '<button type="button" class="cobros-rec-chip ' + ch.cls + active + '" onclick="RN.cobros.setFiltro(\'' + ch.id + '\')">' +
      ch.label + nHtml + '</button>';
  }).join('');
  var hint = '';
  if (cv) {
    hint = '<p class="cobros-rec-hint">Corte vigente: día <strong>' + cv.diaPago + '</strong> · ciclo <strong>' + venTxt + '</strong>' +
      (res.hoy.length ? ' · <strong>' + res.hoy.length + '</strong> cobran hoy' : '') +
      (res.enCiclo.length ? ' · <strong>' + res.enCiclo.length + '</strong> en ventana' : '') +
      (res.vencidos.length ? ' · <strong>' + res.vencidos.length + '</strong> vencidos' : '') +
      '</p>';
  } else if (res.totalPendientes) {
    hint = '<p class="cobros-rec-hint">' + res.totalPendientes + ' pendiente(s) este mes</p>';
  }
  bar.innerHTML = html + hint;
  bar.style.display = '';
};

RN.render.cobros = function () {
  const cont = document.getElementById('lista-cobros');
  if (!cont) return;
  const q = (document.getElementById('search-cobros') || {}).value || '';
  let lista = RN.calc.clientesActivos();
  if (q) lista = RN.calc.filtrarClientes(lista, q); // v5.44.0: plan, teléfono y deuda>X

  // v5.52.8: resumen de recordatorios + filtro por chip
  var res = null;
  try {
    res = RN.ciclos.resumenRecordatorios ? RN.ciclos.resumenRecordatorios() : null;
  } catch (e) { res = null; }
  if (res) RN.cobros._pintarRecordatorios(res);
  else {
    var bar0 = document.getElementById('cobros-recordatorios');
    if (bar0) bar0.style.display = 'none';
  }

  var filtro = RN.cobrosFiltro || 'todos';
  if (res && filtro !== 'todos') {
    var ids = {};
    var arr = filtro === 'hoy' ? res.hoy
      : filtro === 'ciclo' ? res.enCiclo
      : filtro === 'vencidos' ? res.vencidos
      : filtro === 'notificados' ? res.notificados
      : null;
    if (arr) {
      arr.forEach(function (c) { ids[c.id] = true; });
      lista = lista.filter(function (c) { return ids[c.id]; });
    }
  }

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💳</div>' +
      (filtro !== 'todos' ? 'Nadie en este filtro. <button class="btn sm" onclick="RN.cobros.setFiltro(\'todos\')">Ver todos</button>' : 'No hay clientes activos.') +
      '</div>';
    return;
  }
  // ordenar: urgencia de recordatorio primero, luego estado
  var hoyN = RN.ciclos.diaHoyNum ? RN.ciclos.diaHoyNum() : new Date().getDate();
  lista.sort((a, b) => {
    function urgencia(c) {
      var st = RN.calc.getStatus(c);
      if (st === 'paid' || st === 'admin') return 50;
      var dp = c.diaPago || 1;
      if (dp === hoyN) return 0;
      var ven = RN.ciclos.ventanaCobro ? RN.ciclos.ventanaCobro(dp) : { inicio: dp, fin: dp };
      if (hoyN >= ven.inicio && hoyN < dp) return 1;
      if (dp < hoyN || RN.calc.getMora(c) > 0) return 2;
      return 3;
    }
    var ua = urgencia(a), ub = urgencia(b);
    if (ua !== ub) return ua - ub;
    const oa = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5, admin: 6 }[RN.calc.getStatus(a)];
    const ob = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5, admin: 6 }[RN.calc.getStatus(b)];
    return oa - ob;
  });

  // v5.13.1: Bug #4 — mes explícito para descuentos puntuales.
  const mes = RN.calc.mesActualStr();
  cont.innerHTML = lista.map(c => {
    // v5.13.7 (DUP-2): usar resumenCliente para centralizar calculos.
    const r = RN.calc.resumenCliente(c, mes);
    const estado = r.estado;
    const neto = r.neto;
    const cuotaEq = r.cuotaEq;
    const total = r.totalMes;
    const deuda = r.deuda;
    const mora = r.mora;
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const planSub = RN.render.nombrePlan(c) + ' · ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c));
    const subParts = [planSub];
    if (ipHtml) subParts.push(ipHtml);

    var accBtn;
    if (estado === 'paid') {
      accBtn = '<span class="badge paid">Pagado</span>';
    } else if (estado === 'parcial') {
      accBtn = '<span class="badge parcial">Pago parcial</span> <button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Completar pago</button>';
    } else {
      accBtn = '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + RN.render.escAttr(c.id) + '\')">Cobrar ' + RN.calc.formatCUP(total) + '</button>';
    }

    // v5.15 (C. acceso rápido): descuentos vigentes del mes para este cliente.
    // Gift-button 🎁 abre RN.descuentos.abrirParaCliente() (gestión, no cobro).
    var descsMes = (RN.state.descuentos || []).filter(function (d) {
      return d.clienteId === c.id && d.estado !== 'anulado' && RN.descuentos.vigenteEnMes(d, mes);
    });
    var impactoDesc = descsMes.reduce(function (acc, d) { return acc + (RN.calc.valorDescuento(d, c.id) || 0); }, 0);
    var GIFT = String.fromCodePoint(0x1F381);
    var giftTitle = 'Gestionar bonificaciones/descuentos de ' + RN.render.esc(c.nombre) +
      (descsMes.length ? ' — impacto este mes: ' + RN.calc.formatCUP(impactoDesc) : '');
    var giftBtn = '<button class="btn sm gift-btn' + (descsMes.length ? ' has-desc' : '') + '" title="' + giftTitle + '" onclick="RN.descuentos.abrirParaCliente(\'' + RN.render.escAttr(c.id) + '\')">' + GIFT + (descsMes.length ? ' <span class="gift-count">' + descsMes.length + '</span>' : '') + '</button>';
    var descRowsHtml = '';
    if (descsMes.length) {
      descRowsHtml = descsMes.map(function (d) {
        var mtxt = d.motivo ? RN.render.esc(d.motivo) : '';
        return '<span class="badge ok" title="' + mtxt + '">' + RN.render.esc(d.tipo) + (mtxt ? ': ' + mtxt : '') + ' (−' + RN.calc.formatCUP(RN.calc.valorDescuento(d, c.id)) + ')</span>';
      }).join(' ');
    } else {
      descRowsHtml = '<span class="muted">Ninguna este mes</span>';
    }

    // v5.52.7: marca visual si ya se abrió WhatsApp en este ciclo
    var notificadoWa = false;
    try {
      notificadoWa = !!(RN.notifyState && RN.notifyState.notificadoWaCiclo
        && RN.notifyState.notificadoWaCiclo(c.id, c.diaPago || 1)
        && estado !== 'paid');
    } catch (e) { notificadoWa = false; }
    var ven = (RN.ciclos && RN.ciclos.ventanaCobro)
      ? RN.ciclos.ventanaCobro(c.diaPago || 1)
      : { texto: 'día ' + (c.diaPago || 1) };
    var waBtn = (estado !== 'paid' && c.telefono)
      ? '<button class="btn sm" onclick="event.stopPropagation(); RN.whatsapp.enviarRecordatorio(\'' + RN.render.escAttr(c.id) + '\')">💬 WhatsApp</button>'
      : '';
    var nombreExtra = '';
    if (notificadoWa) nombreExtra += ' <span class="wa-notificado-ico" title="Notificado por WhatsApp en este ciclo">💬</span>';
    if (mora > 0) nombreExtra += ' <span class="badge due" style="font-size:10px;vertical-align:middle">Mora: ' + mora + 'm</span>';

    return '<div class="acc-card' + (notificadoWa ? ' notificado-wa' : '') + '" id="acc-cob-' + RN.render.escAttr(c.id) + '"' +
      (notificadoWa ? ' data-notificado="wa"' : '') + '>' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cob-' + RN.render.escAttr(c.id) + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + nombreExtra + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (cuotaEq > 0 ? 'Total (+equipo)' : 'A cobrar') + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan / Precio</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">Base: ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Ciclo de cobro</span><span class="acc-value"><strong>' + RN.render.esc(ven.texto) + '</strong> <span class="muted">(cierra día ' + (c.diaPago || 1) + ')</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) +
          (notificadoWa ? ' <span class="badge ok">💬 Notificado</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Neto a cobrar</span><span class="acc-value">' + RN.calc.formatCUP(neto) + (cuotaEq > 0 ? ' <span class="pill">+ equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Bonificaciones</span><span class="acc-value">' + descRowsHtml + '</span></div>' +
        '<div class="acc-actions">' + accBtn + ' ' + waBtn + ' ' + giftBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
