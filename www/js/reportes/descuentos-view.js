/**
 * reportes/descuentos-view.js — Vista de gestión de descuentos y bonificaciones.
 * v5.47.0 — Vista reorganizada (variante híbrida):
 *  - Grupos por estado: "Vigentes y pendientes" (abierta, ordenada por urgencia:
 *    vence este mes → 1 solo pago → vence el mes próximo → otros N meses → permanentes)
 *    y "Finalizadas" (Aplicado/Anulado, colapsada por defecto con contador).
 *  - Chips de filtro rápido con contador: Activas (por defecto) / Vigentes este mes /
 *    Finalizadas / Todas, combinables con los filtros de mes/tipo/estado.
 *  - Búsqueda por cliente o motivo.
 *  - Badges de vencimiento: "vence este mes" (rojo) y "vence el mes próximo" (ámbar).
 * Se reutilizan sin cambios los helpers de vigencia de v5.14.4 (vigenteEnMes,
 * venceEnMes, rangoVigencia) y la exportación a CSV de v5.14.4/v5.15.
 */
RN.descuentosView = RN.descuentosView || {};

/* v5.47.0 — estado efímero de la vista (no se persiste) */
RN.descuentosView.filtroRapido = 'activas';
RN.descuentosView.finAbierto = false;
RN.descuentosView.toggleFin = function () {
  RN.descuentosView.finAbierto = !RN.descuentosView.finAbierto;
  RN.descuentosView.render();
};

RN.descuentosView.render = function () {
  // v5.15 (mudanza A): mini-resumen de impacto arriba de la tabla
  if (RN.descuentos && RN.descuentos.resumenGestion) RN.descuentos.resumenGestion();
  // Rellenar filtro de meses
  const selMes = document.getElementById('filter-desc-mes');
  if (selMes && !selMes.dataset.filled) {
    // v5.14.2 (Auditoría Reportes — DUP-4): helper compartido con render.js.
    // v5.14.4: opciones sobre el campo 'desde' (inicio de vigencia).
    const meses = RN.calc.mesesConDatos(RN.state.descuentos, 'desde');
    selMes.innerHTML = '<option value="">Todos los meses</option>' + meses.map(m => `<option value="${m}">${RN.calc.mesTexto(m)}</option>`).join('');
    selMes.addEventListener('change', () => RN.descuentosView.render());
    selMes.dataset.filled = '1';
  }
  const selTipo = document.getElementById('filter-desc-tipo');
  const selEst = document.getElementById('filter-desc-estado');
  const inpBuscar = document.getElementById('filter-desc-buscar');
  const chipsWrap = document.getElementById('desc-chips');
  if (selTipo && !selTipo.dataset.filled) { selTipo.addEventListener('change', () => RN.descuentosView.render()); selTipo.dataset.filled = '1'; }
  if (selEst && !selEst.dataset.filled) { selEst.addEventListener('change', () => RN.descuentosView.render()); selEst.dataset.filled = '1'; }
  // v5.47.0: búsqueda por cliente/motivo + chips de filtro rápido (delegación)
  if (inpBuscar && !inpBuscar.dataset.filled) { inpBuscar.addEventListener('input', () => RN.descuentosView.render()); inpBuscar.dataset.filled = '1'; }
  if (chipsWrap && !chipsWrap.dataset.filled) {
    chipsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn || !btn.dataset.modo) return;
      RN.descuentosView.filtroRapido = btn.dataset.modo;
      RN.descuentosView.render();
    });
    chipsWrap.dataset.filled = '1';
  }

  const tbody = document.querySelector('#tabla-descuentos tbody');
  if (!tbody) return;

  const fMes = selMes ? selMes.value : '';
  const fTipo = selTipo ? selTipo.value : '';
  const fEst = selEst ? selEst.value : '';
  const q = (inpBuscar ? inpBuscar.value.trim().toLowerCase() : '');
  const modo = RN.descuentosView.filtroRapido || 'activas';
  const mesAct = RN.calc.mesActualStr();

  // v5.14.4: el filtro por mes pasa de "mes de creación" a "aplica al mes
  // seleccionado" (vigenteEnMes): si filtras junio, aparecen las permanentes
  // creadas en abril que siguen activas en junio, y las de N meses jun–ago.
  // v5.47.0: se añade la búsqueda por cliente/motivo.
  let base = RN.state.descuentos.slice().reverse().filter(d => {
    if (fMes && !RN.descuentos.vigenteEnMes(d, fMes)) return false;
    if (fTipo && d.tipo !== fTipo) return false;
    if (fEst && d.estado !== fEst) return false;
    if (q) {
      const c = RN.calc.clientePorId(d.clienteId);
      const texto = ((c ? c.nombre : '') + ' ' + (d.motivo || '')).toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  // v5.47.0: contadores de los chips (sobre la lista ya filtrada por
  // mes/tipo/estado/búsqueda, antes del filtro rápido).
  const esViva = (d) => d.estado === 'pendiente';
  const esVigenteMes = (d) => RN.descuentos.vigenteEnMes(d, mesAct);
  const nAct = base.filter(esViva).length;
  const nMes = base.filter(esVigenteMes).length;
  const nFin = base.length - nAct;
  if (chipsWrap) {
    chipsWrap.innerHTML = [
      ['activas', 'Activas', nAct],
      ['este_mes', 'Vigentes este mes', nMes],
      ['finalizadas', 'Finalizadas', nFin],
      ['todas', 'Todas', base.length]
    ].map(([k, label, n]) =>
      `<button type="button" class="chip ${modo === k ? 'active' : ''}" data-modo="${k}">${label} <span class="chip-n">${n}</span></button>`
    ).join('');
  }

  // Filtro rápido por estado
  let lista = base;
  if (modo === 'activas') lista = base.filter(esViva);
  else if (modo === 'este_mes') lista = base.filter(esVigenteMes);
  else if (modo === 'finalizadas') lista = base.filter(d => !esViva(d));

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="icon">🏷️</div>No hay descuentos ni bonificaciones que apliquen a la selección. Créalos aquí mismo con <strong>"🎁 + Nueva bonificación"</strong> o en la lista de Cobros con el botón 🎁 de cada cliente.</div></td></tr>`;
    return;
  }

  // v5.14.4 (R4): "aplicado" = consumida definitivamente; las permanentes y
  // de N meses vivas en 'pendiente' se muestran como "Activa".
  const estadoBadge = { aplicado: ['paid', 'Aplicado'], pendiente: ['warn', 'Pendiente'], anulado: ['muted', 'Anulado'] };
  const _estadoDesc = function (d) {
    if (d.estado === 'pendiente' && RN.descuentos.vigenciaDe(d) === 'permanente') return ['ok', 'Activa'];
    if (d.estado === 'pendiente' && RN.descuentos.vigenciaDe(d) === 'meses' && (parseInt(d.durMeses, 10) || 1) > 1) {
      return ['por', 'Activa'];
    }
    if (d.estado === 'pendiente' && RN.descuentos.vigenciaDe(d) === 'unPago') return ['warn', 'Pendiente'];
    return estadoBadge[d.estado] || ['muted', d.estado];
  };

  // v5.47.0: badge de vencimiento en la columna Vigencia (solo N meses vivas).
  const _alertaVenc = function (d) {
    if (!esViva(d)) return '';
    if (RN.descuentos.vigenciaDe(d) !== 'meses') return '';
    const vence = RN.descuentos.venceEnMes(d);
    if (!vence) return '';
    if (vence === mesAct) return ' <span class="badge due" style="font-size:10px">⚠ vence este mes</span>';
    if (vence === RN.calc.mesSiguiente(mesAct)) return ' <span class="badge warn" style="font-size:10px">vence el mes próximo</span>';
    return '';
  };

  // v5.47.0: urgencia para ordenar lo vigente (0 = más urgente).
  const _urgencia = function (d) {
    if (!esViva(d)) return 9;
    const vig = RN.descuentos.vigenciaDe(d);
    if (vig === 'meses') {
      const vence = RN.descuentos.venceEnMes(d);
      if (vence === mesAct) return 0;
      if (vence && vence === RN.calc.mesSiguiente(mesAct)) return 2;
      return 3;
    }
    if (vig === 'unPago') return 1;
    return 4; // permanente
  };

  const _fila = function (d) {
    // v5.14.2 (Auditoría Reportes — DUP-3): usar el helper centralizado.
    const c = RN.calc.clientePorId(d.clienteId);
    const _ed = _estadoDesc(d);
    const _vig = RN.descuentos.vigenciaDe(d);
    const _vence = _vig === 'meses' ? RN.descuentos.venceEnMes(d) : '';
    return `<tr${!esViva(d) ? ' class="fila-finalizada"' : ''}>
      <td data-label="Cliente">${RN.render.esc(c ? c.nombre : '—')}</td>
      <td data-label="Tipo">${d.tipo}${RN.descuentos._badgeVigencia(d)}</td>
      <td data-label="Motivo">${RN.render.esc(d.motivo)}</td>
      <td data-label="Modo">${d.modo}</td>
      <td data-label="Valor">${d.modo === 'porcentaje' ? d.valor + '%' : (d.modo === 'dias' ? d.valor + ' días' : RN.calc.formatCUP(d.valor))}</td>
      <td data-label="Vigencia">${RN.descuentos.rangoVigencia(d)}${_alertaVenc(d)}</td>
      <td data-label="Estado"><span class="badge ${_ed[0]}">${_ed[1]}</span></td>
      <td data-label="Acciones">${d.estado !== 'anulado' ? `<button class="btn sm danger" onclick="RN.descuentos.eliminar('${d.id}')">🗑</button>` : ''}</td>
    </tr>`;
  };

  const vig = lista.filter(esViva).sort((a, b) => _urgencia(a) - _urgencia(b));
  const fin = lista.filter(d => !esViva(d));

  // v5.47.0: la tabla se divide en dos grupos. En los modos 'activas'/
  // 'este_mes' solo se ve el grupo vivo; en 'todas' aparecen ambos y las
  // Finalizadas quedan colapsadas por defecto (tocar la cabecera las despliega).
  let html = '';
  if (modo !== 'finalizadas' && vig.length) {
    html += `<tr class="desc-grupo-head"><td colspan="8">🏷️ Vigentes y pendientes (${vig.length})</td></tr>`;
    html += vig.map(_fila).join('');
  }
  if (fin.length && (modo === 'finalizadas' || modo === 'todas')) {
    const abierta = modo === 'finalizadas' || RN.descuentosView.finAbierto;
    html += `<tr class="desc-grupo-head ${abierta ? 'abierta' : ''}" onclick="RN.descuentosView.toggleFin()" title="Toca para ${abierta ? 'ocultar' : 'ver'} el histórico"><td colspan="8"><span class="chev">▶</span> 🗄️ Finalizadas (${fin.length})${abierta ? '' : ' — toca para ver'}</td></tr>`;
    if (abierta) html += fin.map(_fila).join('');
  }
  if (!html) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="icon">🏷️</div>No hay descuentos ni bonificaciones que apliquen a la selección.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = html;
};

RN.descuentosView.exportCSV = function () {
  // v5.14.4: columnas nuevas vigencia/desde/vence/durMeses/nº aplicaciones.
  // ⚠ Si consumes descuentos.csv en hojas de cálculo, revisa las nuevas columnas.
  const rows = [['cliente', 'tipo', 'motivo', 'modo', 'valor', 'vigencia', 'desde', 'vence', 'durMeses', 'aplicaciones', 'mes_creacion', 'estado', 'fecha']];
  RN.state.descuentos.forEach(d => {
    // v5.14.2 (DUP-3): usar el helper centralizado.
    const c = RN.calc.clientePorId(d.clienteId);
    const _vig = RN.descuentos.vigenciaDe(d);
    rows.push([
      c ? c.nombre : '', d.tipo, d.motivo, d.modo, d.valor,
      _vig, RN.descuentos.desdeDe(d),
      _vig === 'meses' ? RN.descuentos.venceEnMes(d) : '',
      _vig === 'meses' ? (Math.max(1, parseInt(d.durMeses, 10) || 1)) : '',
      Array.isArray(d.aplicaciones) ? d.aplicaciones.length : 0,
      d.mes, d.estado, (d.fecha || '').slice(0, 10)
    ]);
  });
  // v5.14.2 (DUP-2): escape CSV centralizado en RN.export.toCSV.
  const csv = RN.export.toCSV(rows);
  RN.export.descargar('descuentos.csv', csv, 'text/csv');
  RN.notifyUI.toast('Descuentos exportados', 'success');
};
