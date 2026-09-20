/**
 * reportes/descuentos-view.js — Vista de gestión de descuentos y bonificaciones,
 * con filtros por mes/tipo/estado y exportación a CSV.
 * v5.14.4: columna "Vigencia" (Permanente / N meses / 1 solo pago), filtro por
 * mes de APLICACIÓN (vigenteEnMes), estado "Activa" para permanentes vivas,
 * y CSV con columnas vigencia/desde/vence/durMeses/aplicaciones.
 */
RN.descuentosView = RN.descuentosView || {};

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
  if (selTipo && !selTipo.dataset.filled) { selTipo.addEventListener('change', () => RN.descuentosView.render()); selTipo.dataset.filled = '1'; }
  if (selEst && !selEst.dataset.filled) { selEst.addEventListener('change', () => RN.descuentosView.render()); selEst.dataset.filled = '1'; }

  const tbody = document.querySelector('#tabla-descuentos tbody');
  if (!tbody) return;

  const fMes = selMes ? selMes.value : '';
  const fTipo = selTipo ? selTipo.value : '';
  const fEst = selEst ? selEst.value : '';

  // v5.14.4: el filtro por mes pasa de "mes de creación" a "aplica al mes
  // seleccionado" (vigenteEnMes): si filtras junio, aparecen las permanentes
  // creadas en abril que siguen activas en junio, y las de N meses jun–ago.
  let lista = RN.state.descuentos.slice().reverse().filter(d => {
    if (fMes && !RN.descuentos.vigenteEnMes(d, fMes)) return false;
    if (fTipo && d.tipo !== fTipo) return false;
    if (fEst && d.estado !== fEst) return false;
    return true;
  });

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

  tbody.innerHTML = lista.map(d => {
    // v5.14.2 (Auditoría Reportes — DUP-3): usar el helper centralizado.
    const c = RN.calc.clientePorId(d.clienteId);
    const _ed = _estadoDesc(d);
    const _vig = RN.descuentos.vigenciaDe(d);
    const _vence = _vig === 'meses' ? RN.descuentos.venceEnMes(d) : '';
    return `<tr>
      <td data-label="Cliente">${RN.render.esc(c ? c.nombre : '—')}</td>
      <td data-label="Tipo">${d.tipo}${RN.descuentos._badgeVigencia(d)}</td>
      <td data-label="Motivo">${RN.render.esc(d.motivo)}</td>
      <td data-label="Modo">${d.modo}</td>
      <td data-label="Valor">${d.modo === 'porcentaje' ? d.valor + '%' : (d.modo === 'dias' ? d.valor + ' días' : RN.calc.formatCUP(d.valor))}</td>
      <td data-label="Vigencia">${RN.descuentos.rangoVigencia(d)}</td>
      <td data-label="Estado"><span class="badge ${_ed[0]}">${_ed[1]}</span></td>
      <td data-label="Acciones">${d.estado !== 'anulado' ? `<button class="btn sm danger" onclick="RN.descuentos.eliminar('${d.id}')">🗑</button>` : ''}</td>
    </tr>`;
  }).join('');
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
