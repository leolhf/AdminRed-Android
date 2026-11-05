/**
 * red/red-view.js — Vista Red (v5.54.2 Fase C).
 * Capacidad Limit At, scripts MikroTik y accesos rápidos.
 */
RN.redView = RN.redView || {};

RN.redView.render = function () {
  var out = document.getElementById('red-out');
  if (!out) return;
  var cfg = RN.state.config || {};
  var padre = cfg.colaPadre || 'LEO';
  var maxPadre = cfg.colaPadreMaxLimit || 0;
  var html = '';

  html += '<div class="card" style="margin-bottom:12px">' +
    '<h3 style="margin-top:0">📡 Red / MikroTik</h3>' +
    '<p class="muted" style="font-size:13px;margin:0 0 8px">Cola padre: <strong>' + RN.render.esc(padre) + '</strong>' +
    (maxPadre ? ' · max sugerido ' + maxPadre + 'M' : ' · sin max-limit en config') +
    ' · Las colas se pegan en el Terminal del RouterBoard.</p>' +
    '<div class="dash-accion-btns">' +
      '<button type="button" class="btn primary sm" onclick="RN.cola.abrirResumen()">📊 Capacidad (Limit At)</button>' +
      '<button type="button" class="btn sm" onclick="RN.cola.mostrarScript && RN.cola.mostrarScript(\'simple\')">Script estilo export</button>' +
      '<button type="button" class="btn sm" onclick="RN.cola.mostrarScript && RN.cola.mostrarScript(\'upsert\')">Script upsert</button>' +
      '<button type="button" class="btn sm" onclick="RN.cola.abrirAjustes && RN.cola.abrirAjustes()">⚙️ Reglas de cola</button>' +
    '</div></div>';

  // Capacidad resumen
  if (RN.cola && RN.cola.estadoCapacidad && RN.cola.txtM) {
    var cap = RN.cola.estadoCapacidad();
    var color = cap.excedido ? 'var(--danger)' : (cap.aviso ? 'var(--warn)' : 'var(--success)');
    html += '<div class="card" style="margin-bottom:12px">' +
      '<h3 style="margin-top:0">Capacidad</h3>' +
      '<p style="color:' + color + ';font-weight:700;margin:0 0 6px">' +
      RN.cola.txtM(cap.comprometido) + ' / ' + RN.cola.txtM(cap.tope) +
      ' (' + cap.pctReal + '%)</p>' +
      '<p class="muted" style="font-size:12px;margin:0">Paquete ' + RN.cola.txtM(cap.paquete) +
      ' − reserva ' + RN.cola.txtM(cap.reserva) +
      ' · margen ' + RN.cola.txtM(cap.margen) + '</p></div>';
  }

  // Comando padre LEO
  if (maxPadre > 0) {
    var cmdPadre = '/queue simple set [find name="' + String(padre).replace(/"/g, '') + '"] max-limit=0/' + maxPadre + 'M';
    html += '<div class="card" style="margin-bottom:12px">' +
      '<h3 style="margin-top:0">Limitar cola padre (anti-latencia)</h3>' +
      '<p class="muted" style="font-size:12px">Recomendado en picos de demanda. Ajusta el valor en Ajustes si hace falta.</p>' +
      '<textarea readonly rows="2" id="red-cmd-padre" style="width:100%;font-family:monospace;font-size:11px">' +
      RN.render.esc(cmdPadre) + '</textarea>' +
      '<button type="button" class="btn sm primary" style="margin-top:8px" onclick="RN.cola.copiar(document.getElementById(\'red-cmd-padre\').value)">📋 Copiar</button>' +
      '</div>';
  }

  // Clientes con cola sin IP
  var sinIp = [];
  try {
    (RN.calc.clientesActivos() || []).forEach(function (c) {
      if (RN.cola.tieneCola(c) && !RN.cola.ipValida(c.ip)) sinIp.push(c);
    });
  } catch (e) {}
  if (sinIp.length) {
    html += '<div class="card" style="border-color:var(--warn)">' +
      '<h3 style="margin-top:0">⚠️ Sin IP (' + sinIp.length + ')</h3><ul class="lista-simple">';
    sinIp.forEach(function (c) {
      html += '<li><strong>' + RN.render.esc(c.nombre) + '</strong> ' +
        '<button class="btn sm" onclick="RN.modalCliente.editar(\'' + RN.render.escAttr(c.id) + '\')">Editar</button></li>';
    });
    html += '</ul></div>';
  }

  out.innerHTML = html;
};
