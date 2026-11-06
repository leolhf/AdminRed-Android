/**
 * ui/avisos-inicio.js — Modales de aviso al abrir la app (v5.53.2).
 *
 * Prioridad (máx. 1 modal por apertura):
 *   1. Cobranza / ciclo del día
 *   2. Cierre de mes pendiente
 *   3. Paquete proveedor sin cubrir/registrar
 *   4. Tasa USD desactualizada
 *
 * Cada tipo puede silenciarse con «No mostrar hoy».
 * Persistencia: localStorage rn_avisos_inicio_v1
 */
RN.avisosInicio = RN.avisosInicio || {};

RN.avisosInicio.KEY = 'rn_avisos_inicio_v1';
RN.avisosInicio.DIA_PAQUETE = 10;   // a partir de este día del mes
RN.avisosInicio.DIA_CIERRE = 28;    // fin de mes
RN.avisosInicio.DIA_CIERRE_PREV = 5; // primeros días: avisar mes anterior sin snapshot

RN.avisosInicio._claveHoy = function () {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
};

RN.avisosInicio._leer = function () {
  try {
    return JSON.parse(localStorage.getItem(RN.avisosInicio.KEY) || '{}');
  } catch (e) { return {}; }
};

RN.avisosInicio._escribir = function (reg) {
  try { localStorage.setItem(RN.avisosInicio.KEY, JSON.stringify(reg)); } catch (e) {}
};

/** ¿Este tipo de aviso ya se silenció hoy? */
RN.avisosInicio.yaSilenciado = function (tipo) {
  var reg = RN.avisosInicio._leer();
  return reg[tipo] === RN.avisosInicio._claveHoy();
};

RN.avisosInicio.silenciarHoy = function (tipo) {
  var reg = RN.avisosInicio._leer();
  reg[tipo] = RN.avisosInicio._claveHoy();
  // podar entradas de otros días
  var hoy = RN.avisosInicio._claveHoy();
  Object.keys(reg).forEach(function (k) {
    if (reg[k] !== hoy) delete reg[k];
  });
  RN.avisosInicio._escribir(reg);
};

/**
 * Evalúa avisos en orden de prioridad.
 * @returns {{tipo:string, titulo:string, cuerpo:string, acciones:Array}|null}
 */
RN.avisosInicio.evaluar = function () {
  try {
    var a = RN.avisosInicio._evalCobranza();
    if (a) return a;
    a = RN.avisosInicio._evalCierre();
    if (a) return a;
    a = RN.avisosInicio._evalPaquete();
    if (a) return a;
    a = RN.avisosInicio._evalTasa();
    if (a) return a;
  } catch (e) {
    console.warn('[avisosInicio]', e);
  }
  return null;
};

RN.avisosInicio._evalCobranza = function () {
  if (RN.avisosInicio.yaSilenciado('cobranza')) return null;
  var res = RN.ciclos.resumenRecordatorios ? RN.ciclos.resumenRecordatorios() : null;
  if (!res) return null;
  var nHoy = (res.hoy || []).length;
  var nCiclo = (res.enCiclo || []).length;
  var nVenc = (res.vencidos || []).length;
  var nNotif = (res.notificados || []).length;
  if (nHoy + nCiclo + nVenc === 0) return null;

  var cv = RN.ciclos.corteVigente ? RN.ciclos.corteVigente() : null;
  var venTxt = '';
  if (cv && RN.ciclos.ventanaCobro) {
    venTxt = RN.ciclos.ventanaCobro(cv.diaPago).textoLargo || RN.ciclos.ventanaCobro(cv.diaPago).texto;
  }

  var lineas = [];
  if (nHoy) lineas.push('<li><strong>' + nHoy + '</strong> cobran <strong>hoy</strong></li>');
  if (nCiclo) lineas.push('<li><strong>' + nCiclo + '</strong> en ciclo abierto' + (venTxt ? ' (' + venTxt + ')' : '') + '</li>');
  if (nVenc) lineas.push('<li><strong>' + nVenc + '</strong> con ciclo vencido / mora</li>');
  if (nNotif) lineas.push('<li>💬 <strong>' + nNotif + '</strong> ya notificados este ciclo</li>');

  var titulo = nHoy
    ? '📋 Cobranza de hoy'
    : (nCiclo ? '📋 Ciclo de cobro abierto' : '📋 Pendientes de cobro');

  return {
    tipo: 'cobranza',
    titulo: titulo,
    cuerpo: '<ul class="aviso-inicio-lista">' + lineas.join('') + '</ul>',
    acciones: [
      { label: 'Ir a Cobranza', cls: 'primary', fn: 'cobranza' },
      { label: 'WhatsApp masivo', cls: '', fn: 'wa' },
      { label: 'No mostrar hoy', cls: 'ghost', fn: 'silenciar' }
    ]
  };
};

RN.avisosInicio._evalCierre = function () {
  if (RN.avisosInicio.yaSilenciado('cierre')) return null;
  var mes = RN.calc.mesActualStr();
  var dia = RN.ciclos.diaHoyNum ? RN.ciclos.diaHoyNum() : new Date().getDate();
  var snaps = RN.state.snapshots || [];

  // Fin de mes: mes actual sin snapshot
  if (dia >= RN.avisosInicio.DIA_CIERRE) {
    var cerrado = snaps.some(function (s) { return s.mes === mes; });
    if (!cerrado) {
      return {
        tipo: 'cierre',
        titulo: '📋 Cierre de mes pendiente',
        cuerpo: '<p>Estamos a día <strong>' + dia + '</strong> y <strong>' +
          RN.calc.mesTexto(mes) + '</strong> aún no tiene snapshot de cierre.</p>' +
          '<p class="muted">Genera el snapshot para congelar KPIs y anular descuentos puntuales.</p>',
        acciones: [
          { label: 'Cerrar mes', cls: 'primary', fn: 'cierre' },
          { label: 'No mostrar hoy', cls: 'ghost', fn: 'silenciar' }
        ]
      };
    }
  }

  // Principio de mes: mes anterior sin snapshot
  if (dia <= RN.avisosInicio.DIA_CIERRE_PREV) {
    var mesAnt = RN.calc.mesAnterior(mes);
    var cerradoAnt = snaps.some(function (s) { return s.mes === mesAnt; });
    if (!cerradoAnt) {
      return {
        tipo: 'cierre',
        titulo: '📋 Mes anterior sin cerrar',
        cuerpo: '<p><strong>' + RN.calc.mesTexto(mesAnt) +
          '</strong> no tiene snapshot. Conviene cerrarlo para el historial.</p>' +
          '<p class="muted">El cierre siempre usa el mes del reloj; si ya cambió el mes, el snapshot se generará del mes actual. Revisa Historial si necesitas el anterior.</p>',
        acciones: [
          { label: 'Entendido', cls: 'primary', fn: 'silenciar' },
          { label: 'Ir a Cobros', cls: '', fn: 'cobros' }
        ]
      };
    }
  }
  return null;
};

RN.avisosInicio._evalPaquete = function () {
  if (RN.avisosInicio.yaSilenciado('paquete')) return null;
  var dia = RN.ciclos.diaHoyNum ? RN.ciclos.diaHoyNum() : new Date().getDate();
  if (dia < RN.avisosInicio.DIA_PAQUETE) return null;

  var mes = RN.calc.mesActualStr();
  var costo = RN.calc.montoPaqueteProveedor
    ? RN.calc.montoPaqueteProveedor()
    : (+(RN.state.config.proveedorMonto) || 0);
  if (costo <= 0) return null;

  var gastosProv = (RN.state.gastos || []).filter(function (g) {
    if (g.mes !== mes) return false;
    var cat = (g.categoria || '').toLowerCase();
    var con = (g.concepto || '').toLowerCase();
    return cat.indexOf('proveedor') >= 0 || cat.indexOf('internet') >= 0
      || con.indexOf('paquete') >= 0 || con.indexOf('proveedor') >= 0;
  });
  var montoProv = gastosProv.reduce(function (s, g) { return s + (g.monto || 0); }, 0);
  if (montoProv >= costo - 0.005) return null; // ya registrado

  var ingresos = RN.calc.ingresosMes(mes);
  var cubierto = ingresos >= costo - 0.005;
  var f = RN.calc.formatCUP;

  return {
    tipo: 'paquete',
    titulo: '📦 Paquete del proveedor',
    cuerpo: '<p>Costo del paquete: <strong>' + f(costo) + '</strong></p>' +
      '<p>Ingresos del mes: <strong>' + f(ingresos) + '</strong>' +
      (cubierto ? ' (cubren el costo)' : ' (aún no cubren el costo)') + '</p>' +
      '<p class="muted">No hay gasto de proveedor/internet registrado este mes. Si ya lo pagaste, regístralo en Gastos.</p>',
    acciones: [
      { label: 'Ir a Gastos', cls: 'primary', fn: 'gastos' },
      { label: 'No mostrar hoy', cls: 'ghost', fn: 'silenciar' }
    ]
  };
};

RN.avisosInicio._evalTasa = function () {
  if (RN.avisosInicio.yaSilenciado('tasa')) return null;
  if (!RN.tasaAviso || !RN.tasaAviso.estadoTasa) return null;
  // No molestar si el usuario pospuso el aviso de tasa
  if (RN.tasaAviso._estaPospuesto && RN.tasaAviso._estaPospuesto()) return null;

  var est = RN.tasaAviso.estadoTasa();
  if (est !== 'urgente' && est !== 'sintasa') return null;

  var tiempo = RN.tasaAviso.tiempoTranscurrido
    ? RN.tasaAviso.tiempoTranscurrido()
    : 'desconocido';
  var tasa = RN.state.config.tasaUsd || 0;

  return {
    tipo: 'tasa',
    titulo: est === 'sintasa' ? '💱 Sin tasa USD' : '💱 Tasa USD desactualizada',
    cuerpo: est === 'sintasa'
      ? '<p>No hay tasa USD configurada. Los préstamos y cobros en USD pueden quedar mal convertidos.</p>'
      : '<p>Tasa actual: <strong>' + tasa + '</strong> CUP/USD</p>' +
        '<p class="muted">Última actualización: ' + tiempo + '</p>',
    acciones: [
      { label: 'Actualizar tasa', cls: 'primary', fn: 'tasa' },
      { label: 'No mostrar hoy', cls: 'ghost', fn: 'silenciar' }
    ]
  };
};

/** Muestra el modal del aviso evaluado. */
RN.avisosInicio.mostrar = function (aviso) {
  if (!aviso) return;
  RN.avisosInicio._actual = aviso;

  // v5.53.3: onclick inline (más fiable que addEventListener tras innerHTML)
  var btns = (aviso.acciones || []).map(function (a) {
    return '<button type="button" class="btn ' + (a.cls || '') +
      '" onclick="RN.avisosInicio._accion(\'' + a.fn + '\')">' + a.label + '</button>';
  }).join(' ');

  var html =
    '<div class="modal-header"><h3>' + aviso.titulo + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' + aviso.cuerpo + '</div>' +
    '<div class="modal-footer">' + btns + '</div>';

  RN.uiComponents.modal(html, {});
};

/**
 * v5.53.4: usa trasCerrar para encadenar modales de forma fiable.
 */
RN.avisosInicio._accion = function (fn) {
  var tipo = RN.avisosInicio._actual && RN.avisosInicio._actual.tipo;
  if (fn === 'silenciar') {
    if (tipo) RN.avisosInicio.silenciarHoy(tipo);
    RN.uiComponents.cerrarModal({ todo: true });
    return;
  }

  var abrirDestino = function () {
    try {
      if (fn === 'cobranza') {
        var grupos = RN.ciclos.clientesCobranzaPendientes
          ? RN.ciclos.clientesCobranzaPendientes() : [];
        var total = grupos.reduce(function (s, g) { return s + (g.clientes || []).length; }, 0);
        if (total > 0 && RN.cobranza && RN.cobranza.abrir) {
          RN.cobranza.abrir({ replace: true });
        } else {
          if (RN.cobrosFiltro !== undefined) RN.cobrosFiltro = 'ciclo';
          RN.tabs.ir('cobros');
          if (RN.render && RN.render.cobros) RN.render.cobros();
          RN.notifyUI.toast('Revisa pendientes en Cobros', 'info');
        }
      } else if (fn === 'wa') {
        if (RN.whatsapp && RN.whatsapp.enviarMasivo) RN.whatsapp.enviarMasivo();
      } else if (fn === 'cierre') {
        if (RN.monthReset && RN.monthReset.confirmar) RN.monthReset.confirmar();
      } else if (fn === 'cobros') {
        RN.tabs.ir('cobros');
      } else if (fn === 'gastos') {
        RN.tabs.ir('gastos');
      } else if (fn === 'tasa') {
        if (RN.tasaAviso && RN.tasaAviso.abrirModal) RN.tasaAviso.abrirModal();
        else if (RN.ajustes) RN.ajustes.abrir();
      }
    } catch (e) {
      console.warn('[avisosInicio] accion', fn, e);
      try { RN.tabs.ir('cobros'); } catch (e2) {}
    }
  };

  if (RN.uiComponents.trasCerrar) {
    RN.uiComponents.trasCerrar(abrirDestino, { todo: true });
  } else {
    RN.uiComponents.cerrarModal();
    setTimeout(abrirDestino, 80);
  }
};

/** Punto de entrada al arrancar la app. */
RN.avisosInicio.comprobarAlIniciar = function () {
  var aviso = RN.avisosInicio.evaluar();
  if (aviso) RN.avisosInicio.mostrar(aviso);
};
