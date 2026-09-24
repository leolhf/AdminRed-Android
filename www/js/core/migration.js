/**
 * migration.js — Migración de datos de versiones antiguas del modelo.
 * Se ejecuta al cargar datos. Reconstruye campos que no existían.
 */

RN.migration = RN.migration || {};

RN.migration.VERSION_ESQUEMA = 11;

/** Aplica migraciones al blob de datos cargado. */
RN.migration.migrar = function (data) {
  if (!data) return data;
  let v = data.esquema || 1;

  // v1→v2: asegurar arrays que puedan no existir
  if (v < 2) {
    data.inventario = data.inventario || [];
    data.asignacionesInventario = data.asignacionesInventario || [];
    data.descuentos = data.descuentos || [];
    data.snapshots = data.snapshots || [];
    data.equiposRed = data.equiposRed || [];
    data.planes = data.planes || [];
    v = 2;
  }

  // v2→v3: investments incluidos en el guardado (bug histórico: se perdían al recargar)
  if (v < 3) {
    data.investments = data.investments || [];
    v = 3;
  }

  // v3→v4: descuentos puntuales (v5.8.0). Reconstruir estructura de descuentos.
  if (v < 4) {
    data.descuentos = (data.descuentos || []).map(d => {
      // asegurar campos de descuento puntual
      return Object.assign({
        id: RN.calc.uid('desc'),
        clienteId: null,
        tipo: d.tipo || 'ajuste',
        motivo: d.motivo || '',
        modo: d.modo || 'fijo',
        valor: d.valor || 0,
        mes: d.mes || RN.calc.mesActualStr(),
        fecha: d.fecha || new Date().toISOString(),
        estado: d.estado || (d.aplicado ? 'aplicado' : 'pendiente'),
        cobroHid: d.cobroHid || null
      }, d);
    });
    v = 4;
  }

  // v4->v5: fondo de caja automatico (v5.8.5). Migrar config.fondoCaja -> config.fondoInicial.
  if (v < 5) {
    if (data.config) {
      if (data.config.fondoCaja !== undefined && data.config.fondoInicial === undefined) {
        data.config.fondoInicial = data.config.fondoCaja;
      }
      delete data.config.fondoCaja;
      data.config.proveedorInternet = data.config.proveedorInternet || '';
      data.config.proveedorMonto = data.config.proveedorMonto || 0;
      data.config.proveedorMegas = data.config.proveedorMegas || 0;
      data.config.proveedorPrecioMega = data.config.proveedorPrecioMega || 0;
      if (data.config.sobreventaMegas === undefined || data.config.sobreventaMegas === null) {
        data.config.sobreventaMegas = 5;
      }
      // v5.11.3: % de ganancia personal (no recupera inversión)
      if (data.config.pctPersonalInversion === undefined || data.config.pctPersonalInversion === null) {
        data.config.pctPersonalInversion = 0;
      }
      // v5.12.0: % de ganancia de inventario (default 20)
      if (data.config.pctGananciaInventario === undefined || data.config.pctGananciaInventario === null) {
        data.config.pctGananciaInventario = 20;
      }
      // v5.12.4: paquete pendiente para el proximo mes (null si no hay)
      if (data.config.paquetePendiente === undefined) {
        data.config.paquetePendiente = null;
      }
    }
    v = 5;
  }

  // v5->v6: mes de inicio de cobro por cliente (v5.10.5). Asegura que cada
  // cliente tenga un campo mesInicio "YYYY-MM" valido. Si no existe, se calcula
  // desde createdAt (mes de alta) o, como ultimo recurso, el mes actual.
  // Esto hace explicito el mes desde el que se espera pago y permite que la
  // UI de edicion muestre un valor coherente en el selector "Mes de inicio".
  if (v < 6) {
    if (Array.isArray(data.clients)) {
      data.clients.forEach(function (c) {
        if (c.mesInicio && /^\d{4}-\d{2}$/.test(c.mesInicio)) return; // ya valido
        var mi = '';
        if (c.createdAt) {
          var d = new Date(c.createdAt);
          if (!isNaN(d.getTime())) {
            mi = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          }
        }
        if (!mi) {
          var hoy = new Date();
          mi = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
        }
        c.mesInicio = mi;
      });
    }
    v = 6;
  }

  // v6->v7: inventario con costo de compra, asignaciones con precio de venta,
  // e inversiones con fecha de compra (v5.11.0). Asegura que existan los campos
  // nuevos sin perder datos previos.
  if (v < 7) {
    // Lotes de inventario: costo unitario y total de la compra
    if (Array.isArray(data.inventario)) {
      data.inventario.forEach(function (l) {
        if (l.costoUnitario === undefined) l.costoUnitario = 0;
        if (l.costoTotal === undefined) l.costoTotal = +(((l.cantidad || 0) * (l.costoUnitario || 0)).toFixed(2));
      });
    }
    // Asignaciones de inventario: precio de venta unitario y total, flag vendida
    if (Array.isArray(data.asignacionesInventario)) {
      data.asignacionesInventario.forEach(function (a) {
        if (a.precioUnitario === undefined) a.precioUnitario = 0;
        if (a.precioTotal === undefined) a.precioTotal = 0;
        if (a.vendida === undefined) a.vendida = false;
      });
    }
    // Inversiones: fecha de compra (deducida de la fecha de creacion si falta)
    if (Array.isArray(data.investments)) {
      data.investments.forEach(function (inv) {
        if (!inv.fechaCompra && inv.fecha) {
          inv.fechaCompra = inv.fecha;
        }
      });
    }
    // Clientes: normalizar IP a formato de direccion de red con puntos (v5.11.1)
    // Si la IP vieja esta guardada como numeros planos (sin puntos), se intenta
    // formatear repartiendo los digitos en 4 octetos. Si ya tiene puntos, se
    // respeta y solo se eliminan caracteres invalidos. Si no encaja en 4 octetos,
    // se deja tal cual para no danar el dato.
    // v5.13.1: Bug #18 — validacion con regex despues de migrar.
    if (Array.isArray(data.clients)) {
      data.clients.forEach(function (c) {
        if (!c.ip) return;
        var ip = String(c.ip).trim();
        if (ip.indexOf('.') !== -1) {
          // Ya tiene formato de IP: conservar solo digitos y puntos
          c.ip = ip.replace(/[^0-9.]/g, '');
          // v5.13.1: Bug #18 — validar formato IP (4 octetos 0-255)
          if (!RN.migration._esIpValida(c.ip)) {
            console.warn('IP migrada invalida, se deja sin formato:', c.ip);
            c.ip = '';
          }
          return;
        }
        // IP plana (solo digitos): intentar formatear a 4 octetos
        var digitos = ip.replace(/[^0-9]/g, '');
        if (digitos.length < 4) { c.ip = digitos; return; }
        c.ip = (function () {
          // Reparto de mejor esfuerzo: hasta 3 digitos por octeto, 4 octetos.
          // Prioriza octetos de 3 digitos al inicio, luego 2, luego 1 al final.
          var total = digitos.length;
          // Calcular cuantos digitos sobran despues de llenar octetos de 3
          // Estrategia sencilla y estable: repartir lo mas uniforme posible.
          var base = Math.floor(total / 4);
          var extra = total % 4;
          var sizes = [];
          for (var i = 0; i < 4; i++) {
            sizes.push(base + (i < extra ? 1 : 0));
          }
          // Limitar cada octeto a 3 digitos maximo
          var idx = 0, octetos = [];
          for (var k = 0; k < 4; k++) {
            var s = Math.min(sizes[k], 3);
            octetos.push(digitos.substr(idx, s));
            idx += s;
          }
          // Si sobraron digitos por el limite de 3, anadirlos al ultimo octeto
          // (caso raro: total > 12). Si excede 3 en el ultimo, se descarta.
          if (idx < total) {
            var resto = digitos.substr(idx, 3 - octetos[3].length);
            octetos[3] = (octetos[3] + resto).substr(0, 3);
          }
          return octetos.join('.');
        })();
        // v5.13.1: Bug #18 — validar que la IP migrada sea valida
        if (!RN.migration._esIpValida(c.ip)) {
          console.warn('IP migrada invalida desde digitos planos, se descarta:', c.ip);
          c.ip = '';
        }
      });
    }
    v = 7;
  }

  // v7->v8: bonificaciones permanentes / por N meses (v5.14.4). Asignar
  // defaults a TODOS los descuentos existentes para el modelo unificado:
  //   vigencia: 'unPago' si era soloPago, si no 'meses' (comportamiento idéntico)
  //   desde:    el mes que ya tenía (d.mes)
  //   durMeses: 1 (un solo mes = comportamiento previo exacto)
  //   aplicaciones: [{mes, cobroHid}] solo si ya estaba aplicada a un cobro
  // REGLA DE ORO: todo el código que lea estos campos debe tolerar que falten
  // (checkpoints de undo, backups importados y blobs viejos NO pasan por aquí),
  // por eso los helpers de calculations.js trabajan con fallbacks equivalentes.
  if (v < 8) {
    if (Array.isArray(data.descuentos)) {
      data.descuentos.forEach(function (d) {
        if (d.vigencia === undefined) {
          d.vigencia = d.soloPago ? 'unPago' : 'meses';
        }
        if (d.desde === undefined) {
          d.desde = d.mes;
        }
        if (d.durMeses === undefined) {
          d.durMeses = 1;
        }
        if (d.aplicaciones === undefined) {
          d.aplicaciones = (d.cobroHid && d.estado === 'aplicado')
            ? [{ mes: d.mes, cobroHid: d.cobroHid, valor: null }]
            : [];
        }
      });
    }
    v = 8;
  }

  // v8->v9: depósitos a la caja + % de reserva de caja (v5.17.0).
  //   - depositos: array nuevo (aportes de dinero al fondo de caja).
  //   - config.pctReservaCaja: % de la ganancia proyectada del mes a reservar (default 70).
  if (v < 9) {
    data.depositos = data.depositos || [];
    if (data.config) {
      if (data.config.pctReservaCaja === undefined || data.config.pctReservaCaja === null) {
        data.config.pctReservaCaja = 70;
      }
    }
    v = 9;
  }

  // v9->v10: separar los RETIROS de caja de los gastos (v5.19.0).
  //   Antes los retiros se guardaban en state.gastos con esRetiroCaja=true.
  //   Ahora viven en state.retiros (array propio) para no ensuciar la utilidad.
  //   Migramos los gastos marcados como retiro al nuevo array.
  if (v < 10) {
    data.retiros = data.retiros || [];
    if (Array.isArray(data.gastos)) {
      var _gastosRestantes = [];
      data.gastos.forEach(function (g) {
        if (g && g.esRetiroCaja) {
          data.retiros.push({
            id: g.id || ('retiro-' + Math.random().toString(36).slice(2, 9)),
            concepto: g.concepto || 'Retiro de caja',
            monto: g.monto || 0,
            fecha: g.fecha || null,
            mes: g.mes || (g.fecha ? String(g.fecha).slice(0, 7) : null)
          });
        } else {
          _gastosRestantes.push(g);
        }
      });
      data.gastos = _gastosRestantes;
    }
    v = 10;
  }

  // v10->v11 (v5.27.0): separar las DEVOLUCIONES DE PRÉSTAMO de los gastos
  //   y agregar doble moneda a retiros, depósitos y devoluciones.
  //   Antes las devoluciones vivían en state.gastos con esDevolucionInversion=true,
  //   contaminando la utilidad neta. Ahora viven en su propio array y se resta el
  //   totalRecibidoCUP del fondo de caja sin tocar la utilidad.
  //   También enriquecemos retiros/depositos/devoluciones con campos de moneda:
  //     moneda: 'CUP' | 'USD' | 'MIXTO'
  //     montoUSD, montoCUP, montoCUPDesdeUSD, totalRecibidoCUP, tasaUsd
  if (v < 11) {
    data.devolucionesInversion = data.devolucionesInversion || [];
    if (Array.isArray(data.gastos)) {
      var _gastosRestantes2 = [];
      data.gastos.forEach(function (g) {
        if (g && g.esDevolucionInversion) {
          data.devolucionesInversion.push({
            id: g.id || ('devinv-' + Math.random().toString(36).slice(2, 9)),
            inversionId: g.inversionId || null,
            concepto: g.concepto || 'Devolución de préstamo',
            monto: g.monto || 0,
            moneda: 'CUP',
            montoUSD: 0,
            montoCUP: g.monto || 0,
            montoCUPDesdeUSD: 0,
            totalRecibidoCUP: g.monto || 0,
            tasaUsd: 0,
            fecha: g.fecha || null,
            mes: g.mes || (g.fecha ? String(g.fecha).slice(0, 7) : null)
          });
        } else {
          _gastosRestantes2.push(g);
        }
      });
      data.gastos = _gastosRestantes2;
    }
    // Asegurar campos de doble moneda en retiros y depósitos ya migrados.
    (data.retiros || []).forEach(function (r) {
      if (!r.moneda) r.moneda = 'CUP';
      if (r.totalRecibidoCUP === undefined) r.totalRecibidoCUP = r.monto || 0;
      if (r.montoUSD === undefined) r.montoUSD = 0;
      if (r.montoCUP === undefined) r.montoCUP = r.monto || 0;
    });
    (data.depositos || []).forEach(function (d) {
      if (!d.moneda) d.moneda = 'CUP';
      if (d.totalRecibidoCUP === undefined) d.totalRecibidoCUP = d.monto || 0;
      if (d.montoUSD === undefined) d.montoUSD = 0;
      if (d.montoCUP === undefined) d.montoCUP = d.monto || 0;
    });
    v = 11;
  }

  // Reconstruir recuperación de inversión desde el historial si está en 0.
  // v5.11.3: la recuperación ahora es AUTOMÁTICA (recuperadoRealInv calcula el
  // margen neto de los clientes vinculados desde la fecha de compra, descontando
  // el costo del mega y la retención personal). El campo inv.recuperado solo se
  // conserva para inversiones SIN clientes vinculados. Para las que tienen
  // clientes, no se usa ese campo (lo calcula el modelo en vivo), así que no lo
  // pisamos aquí para no interferir con el cálculo automático.
  if (data.investments && data.investments.length) {
    data.investments.forEach(inv => {
      if ((inv.recuperado === undefined || inv.recuperado === 0) && (!inv.clienteIds || !inv.clienteIds.length)) {
        inv.recuperado = 0; // sin clientes vinculados: recuperación manual por defecto 0
      }
    });
  }

  data.esquema = RN.migration.VERSION_ESQUEMA;
  return data;
};

/**
 * v5.13.1: Bug #18 — Valida que una string sea una IPv4 valida.
 * Formato: 4 octetos (0-255) separados por puntos.
 * @param {string} ip - string a validar
 * @returns {boolean}
 */
RN.migration._esIpValida = function (ip) {
  if (!ip || typeof ip !== 'string') return false;
  var partes = ip.split('.');
  if (partes.length !== 4) return false;
  for (var i = 0; i < 4; i++) {
    var octeto = partes[i];
    if (!/^\d{1,3}$/.test(octeto)) return false;
    var val = parseInt(octeto, 10);
    if (isNaN(val) || val < 0 || val > 255) return false;
    // No permitir ceros a la izquierda (ej: "01", "001") excepto "0" itself
    if (octeto.length > 1 && octeto[0] === '0') return false;
  }
  return true;
};