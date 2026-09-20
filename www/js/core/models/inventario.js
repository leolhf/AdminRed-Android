/**
 * models/inventario.js — Modelo de inventario con agrupación por producto y FIFO.
 *
 * v5.12.0: Introduce la gestión de inventario por producto (agrupando lotes
 * por `material`) y el método FIFO (primero en entrar, primero en salir) para
 * las ventas. Cada producto puede tener múltiples lotes (compras en diferentes
 * fechas y precios); al vender, se descuenta primero del lote más antiguo que
 * tenga stock disponible, manteniendo el precio de costo de ese lote hasta que
 * se agote, y continuando con el siguiente.
 *
 * Decisiones de diseño confirmadas:
 *  - 1a: Agrupar lotes por `material` (nombre del producto)
 *  - 4a: FIFO → precio único de costo basado en el lote más antiguo disponible
 *  - 3b: % de ganancia configurable (default 20), leído de RN.state.config.pctGananciaInventario
 */
RN.inventarioModel = RN.inventarioModel || {};

/**
 * Normaliza un nombre de material para agrupación (trim + lowerCase).
 * @param {string} material
 * @returns {string}
 */
RN.inventarioModel.normMaterial = function (material) {
  return (material || '').trim().toLowerCase();
};

/**
 * Devuelve la lista de productos únicos agrupados por nombre de material.
 * Cada producto tiene: nombre, lotes (ordenados por fecha asc), stockTotal,
 * stockDisponible, costoUnitarioVigente (costo del lote más antiguo con stock).
 * @returns {Array<{nombre, lotes, stockTotal, stockDisponible, costoVigente}>}
 */
RN.inventarioModel.productosAgrupados = function () {
  var lotes = RN.state.inventario || [];
  var grupos = {};
  lotes.forEach(function (l) {
    var key = RN.inventarioModel.normMaterial(l.material);
    if (!grupos[key]) {
      grupos[key] = { nombre: l.material, key: key, lotes: [] };
    }
    grupos[key].lotes.push(l);
  });
  return Object.keys(grupos).map(function (k) {
    var g = grupos[k];
    // Ordenar lotes por fecha (asc = más antiguo primero para FIFO)
    g.lotes.sort(function (a, b) {
      return (a.fecha || '').localeCompare(b.fecha || '');
    });
    g.stockTotal = g.lotes.reduce(function (s, l) { return s + (l.cantidad || 0); }, 0);
    g.stockDisponible = g.lotes.reduce(function (s, l) {
      return s + RN.inventarioModel.stockDisponibleLote(l.id);
    }, 0);
    g.costoVigente = RN.inventarioModel.costoVigenteProducto(g.lotes);
    return g;
  });
};

/**
 * Stock disponible de un lote = cantidad comprada − total asignado/vendido.
 * @param {string} loteId
 * @returns {number}
 */
RN.inventarioModel.stockDisponibleLote = function (loteId) {
  var lote = (RN.state.inventario || []).find(function (l) { return l.id === loteId; });
  if (!lote) return 0;
  var asignado = (RN.state.asignacionesInventario || [])
    .filter(function (a) { return a.loteId === loteId; })
    .reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
  return Math.max(0, (lote.cantidad || 0) - asignado);
};

/**
 * Costo vigente de un producto = costo unitario del lote más antiguo con stock.
 * Implementa la decisión 4a: el precio de costo FIFO es el del lote que se está
 * vendiendo actualmente (el más antiguo con stock disponible).
 * @param {Array} lotesOrdenados — lotes del producto ordenados por fecha asc
 * @returns {number} costo unitario del lote vigente (0 si no hay stock)
 */
RN.inventarioModel.costoVigenteProducto = function (lotesOrdenados) {
  if (!lotesOrdenados) return 0;
  for (var i = 0; i < lotesOrdenados.length; i++) {
    if (RN.inventarioModel.stockDisponibleLote(lotesOrdenados[i].id) > 0) {
      return lotesOrdenados[i].costoUnitario || 0;
    }
  }
  // Si ningún lote tiene stock, devolver el costo del último lote (referencia)
  if (lotesOrdenados.length) return lotesOrdenados[lotesOrdenados.length - 1].costoUnitario || 0;
  return 0;
};

/**
 * Costo vigente de un producto por su nombre (busca entre todos los lotes).
 * @param {string} material
 * @returns {number}
 */
RN.inventarioModel.costoVigentePorNombre = function (material) {
  var norm = RN.inventarioModel.normMaterial(material);
  var lotes = (RN.state.inventario || [])
    .filter(function (l) { return RN.inventarioModel.normMaterial(l.material) === norm; })
    .sort(function (a, b) { return (a.fecha || '').localeCompare(b.fecha || ''); });
  return RN.inventarioModel.costoVigenteProducto(lotes);
};

/**
 * Stock disponible total de un producto por su nombre.
 * @param {string} material
 * @returns {number}
 */
RN.inventarioModel.stockDisponibleProducto = function (material) {
  var norm = RN.inventarioModel.normMaterial(material);
  var lotes = (RN.state.inventario || [])
    .filter(function (l) { return RN.inventarioModel.normMaterial(l.material) === norm; });
  return lotes.reduce(function (s, l) {
    return s + RN.inventarioModel.stockDisponibleLote(l.id);
  }, 0);
};

/**
 * Devuelve el porcentaje de ganancia configurado (default 20).
 * @returns {number}
 */
RN.inventarioModel.pctGanancia = function () {
  var pct = RN.state.config.pctGananciaInventario;
  if (pct === undefined || pct === null) return 20;
  return pct;
};

/**
 * Calcula el precio de venta sugerido = costo × (1 + pct/100).
 * @param {number} costoUnitario
 * @returns {number}
 */
RN.inventarioModel.precioVentaSugerido = function (costoUnitario) {
  var pct = RN.inventarioModel.pctGanancia();
  return +((costoUnitario || 0) * (1 + pct / 100)).toFixed(2);
};

/**
 * Reparte una cantidad a vender entre los lotes de un producto usando FIFO.
 * Devuelve un array de { loteId, cantidad, costoUnitario } con el desglose
 * por lote. Si no hay suficiente stock, devuelve null.
 *
 * @param {string} material — nombre del producto
 * @param {number} cantidad — cantidad a vender
 * @returns {Array<{loteId, cantidad, costoUnitario}>|null}
 */
RN.inventarioModel.repartirFIFO = function (material, cantidad) {
  var norm = RN.inventarioModel.normMaterial(material);
  var lotes = (RN.state.inventario || [])
    .filter(function (l) { return RN.inventarioModel.normMaterial(l.material) === norm; })
    .sort(function (a, b) { return (a.fecha || '').localeCompare(b.fecha || ''); });

  var restante = cantidad;
  var desglose = [];
  for (var i = 0; i < lotes.length && restante > 0; i++) {
    var disp = RN.inventarioModel.stockDisponibleLote(lotes[i].id);
    if (disp <= 0) continue;
    var tomar = Math.min(disp, restante);
    desglose.push({
      loteId: lotes[i].id,
      cantidad: tomar,
      costoUnitario: lotes[i].costoUnitario || 0
    });
    restante -= tomar;
  }
  if (restante > 0) return null; // no hay suficiente stock
  return desglose;
};

/**
 * Costo total real de un desglose FIFO (suma de cantidad × costoUnitario por lote).
 * @param {Array<{loteId, cantidad, costoUnitario}>} desglose
 * @returns {number}
 */
RN.inventarioModel.costoTotalDesglose = function (desglose) {
  if (!desglose) return 0;
  return desglose.reduce(function (s, d) {
    return s + d.cantidad * (d.costoUnitario || 0);
  }, 0);
};

/**
 * Ganancia real de una venta = precioTotal − costoTotal (por lote, FIFO).
 * @param {number} precioTotal
 * @param {Array<{loteId, cantidad, costoUnitario}>} desglose
 * @returns {number}
 */
RN.inventarioModel.gananciaReal = function (precioTotal, desglose) {
  var costo = RN.inventarioModel.costoTotalDesglose(desglose);
  return +((precioTotal || 0) - costo).toFixed(2);
};
