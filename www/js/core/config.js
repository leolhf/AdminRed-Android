/**
 * config.js — Configuración base y utilidades de configuración.
 * v5.12.4 — La configuración del proveedor (megas, precio, sobreventa) se
 *           gestiona ahora desde el modal "📡 Gestionar mi servicio de internet",
 *           no desde Ajustes. La sección "Mi paquete de internet" fue eliminada.
 *           actualizarAvisoCapacidad() se movió al modal como
 *           RN.paqueteProveedor.actualizarAviso().
 */
RN.config = RN.config || {};

/** Aplica la config guardada al objeto state.config */
RN.config.cargar = function () {
  const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (raw) {
    try {
      const c = JSON.parse(raw);
      Object.assign(RN.state.config, c);
      // Migracion v5.8.5: fondoCaja manual -> fondoInicial
      if (RN.state.config.fondoCaja !== undefined && RN.state.config.fondoInicial === undefined) {
        RN.state.config.fondoInicial = RN.state.config.fondoCaja;
      }
      if (RN.state.config.fondoCaja !== undefined) {
        delete RN.state.config.fondoCaja;
      }
      RN.state.config.proveedorInternet = RN.state.config.proveedorInternet || '';
      RN.state.config.proveedorMonto = RN.state.config.proveedorMonto || 0;
      RN.state.config.proveedorMegas = RN.state.config.proveedorMegas || 0;
      RN.state.config.proveedorPrecioMega = RN.state.config.proveedorPrecioMega || 0;
      if (RN.state.config.sobreventaMegas === undefined || RN.state.config.sobreventaMegas === null) {
        RN.state.config.sobreventaMegas = 5;
      }
      // v5.11.3: % de ganancia personal (no recupera inversión)
      if (RN.state.config.pctPersonalInversion === undefined || RN.state.config.pctPersonalInversion === null) {
        RN.state.config.pctPersonalInversion = 0;
      }
      // v5.12.0: % de ganancia de inventario (default 20)
      if (RN.state.config.pctGananciaInventario === undefined || RN.state.config.pctGananciaInventario === null) {
        RN.state.config.pctGananciaInventario = 20;
      }
      // v5.12.9: % de ganancia del mes real para recuperación de préstamos externos (default 0)
      if (RN.state.config.pctRecuperacionGananciaMes === undefined || RN.state.config.pctRecuperacionGananciaMes === null) {
        RN.state.config.pctRecuperacionGananciaMes = 0;
      }
      // v5.17.0/v5.18.0: % de la ganancia proyectada del mes a mantener como reserva en caja (default 70)
      if (RN.state.config.pctReservaCaja === undefined || RN.state.config.pctReservaCaja === null) {
        RN.state.config.pctReservaCaja = 70;
      }
      // v5.12.4: paquete pendiente para el próximo mes (null si no hay)
      if (RN.state.config.paquetePendiente === undefined) {
        RN.state.config.paquetePendiente = null;
      }
      // v5.12.7: fecha de última actualización de la tasa USD (aviso de vencimiento).
      // Si un usuario ya tenía tasaUsd pero no fechaTasaUsd (instalación previa),
      // dejamos fechaTasaUsd en null para que el aviso aparezca y pueda registrarla.
      if (RN.state.config.fechaTasaUsd === undefined) {
        RN.state.config.fechaTasaUsd = null;
      }
    } catch (e) { /* ignorar config corrupta */ }
  }
};

/** Guarda la config actual en localStorage */
RN.config.persistir = function () {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(RN.state.config));
};

/**
 * Lee los inputs del formulario de ajustes y guarda.
 * v5.12.4: Los campos del proveedor ya no están en Ajustes (se gestionan
 * desde el modal). Aquí solo se leen los campos de configuración general.
 */
RN.config.guardar = function () {
  const tasa = parseFloat(document.getElementById('cfg-tasa-usd').value) || 0;
  const dias = parseInt(document.getElementById('cfg-dias-base').value, 10) || 30;
  // v5.13.5 (ISSUE #3): Días de gracia antes de mora (default 5, mínimo 0)
  const graciaEl = document.getElementById('cfg-gracia-dias');
  const graciaDias = graciaEl ? Math.max(0, parseInt(graciaEl.value, 10) || 5) : 5;
  const mencion = document.getElementById('cfg-mencion-desc').value === 'true';
  const auto = document.getElementById('cfg-tasa-auto').value === 'true';
  const fondo = parseFloat(document.getElementById('cfg-fondo-caja').value) || 0;
  RN.state.config.tasaUsd = tasa;
  // v5.12.7: Registrar la fecha de actualización de la tasa (aviso de vencimiento 24h/72h)
  if (tasa > 0) RN.state.config.fechaTasaUsd = new Date().toISOString();
  RN.state.config.diasBaseMes = dias;
  // v5.13.5 (ISSUE #3): Persistir días de gracia
  RN.state.config.graciaDias = graciaDias;
  RN.state.config.mencionarDescuentoRecurrente = mencion;
  RN.state.config.tasaAuto = auto;
  RN.state.config.fondoInicial = fondo;
  // v5.11.3: % de ganancia personal (no recupera inversión)
  const pctPersonal = parseFloat((document.getElementById('cfg-pct-personal') || {}).value) || 0;
  RN.state.config.pctPersonalInversion = Math.max(0, Math.min(100, pctPersonal));
  // v5.12.0: % de ganancia de inventario (default 20)
  const pctGanancia = parseFloat((document.getElementById('cfg-pct-ganancia-inv') || {}).value) || 0;
  RN.state.config.pctGananciaInventario = Math.max(0, Math.min(500, pctGanancia));
  // v5.12.9: % de ganancia del mes real destinado a recuperación de préstamos externos
  const pctGanMes = parseFloat((document.getElementById('cfg-pct-ganancia-mes') || {}).value) || 0;
  RN.state.config.pctRecuperacionGananciaMes = Math.max(0, Math.min(100, pctGanMes));
  // v5.17.0/v5.18.0: % de la ganancia proyectada del mes a mantener como reserva en caja
  const pctReserva = parseFloat((document.getElementById('cfg-pct-reserva-caja') || {}).value);
  RN.state.config.pctReservaCaja = isNaN(pctReserva) ? 70 : Math.max(0, Math.min(100, pctReserva));
  // v5.13.5 (ISSUE #4): Eliminar persistir() redundante. RN.storageLocal.guardar()
  // serializa TODO el estado (que incluye config) en localStorage[DATA].
  // persistir() duplicaba la escritura de config en localStorage[CONFIG].
  // Se conserva persistir() solo como API pública para guardado síncrono
  // inmediato de config en casos puntuales, pero no se llama dos veces aquí.
  RN.storageLocal.guardar();
  RN.notifyUI.toast('Configuración guardada', 'success');
  RN.render.todo();
};

/**
 * Rellena el formulario de ajustes con los valores actuales.
 * v5.12.4: Los campos del proveedor ya no están en Ajustes.
 */
RN.config.rellenarForm = function () {
  const c = RN.state.config;
  const t = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  t('cfg-tasa-usd', c.tasaUsd || 0);
  t('cfg-dias-base', c.diasBaseMes || 30);
  // v5.13.5 (ISSUE #3): Días de gracia (mora) configurable
  t('cfg-gracia-dias', c.graciaDias === undefined || c.graciaDias === null ? 5 : c.graciaDias);
  t('cfg-mencion-desc', String(c.mencionarDescuentoRecurrente));
  t('cfg-tasa-auto', String(c.tasaAuto));
  t('cfg-fondo-caja', c.fondoInicial || 0);
  // v5.11.3: % de ganancia personal (no recupera inversión)
  t('cfg-pct-personal', c.pctPersonalInversion || 0);
  // v5.12.0: % de ganancia de inventario (default 20)
  t('cfg-pct-ganancia-inv', (c.pctGananciaInventario === undefined || c.pctGananciaInventario === null) ? 20 : c.pctGananciaInventario);
  // v5.12.9: % de ganancia del mes real para recuperación de préstamos externos
  t('cfg-pct-ganancia-mes', c.pctRecuperacionGananciaMes || 0);
  // v5.17.0/v5.18.0: % de la ganancia proyectada del mes a mantener como reserva en caja
  t('cfg-pct-reserva-caja', (c.pctReservaCaja === undefined || c.pctReservaCaja === null) ? 70 : c.pctReservaCaja);
};
