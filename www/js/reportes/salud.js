/**
 * reportes/salud.js — Dashboard de salud del negocio con KPIs tipo semáforo.
 *
 * v5.14.2 (Auditoría Reportes):
 *   BUG-3: 'esperado' e 'ingresos' ya no son código muerto — se usan en el
 *          nuevo KPI "Cobranza real vs esperado".
 *   BUG-5: umbrales del semáforo renombrados y reordenados para que se lean
 *          en el mismo sentido que el resultado (verde/ámbar/rojo).
 *   CODE-3: _semaforo y _card se movieron fuera de render() para no
 *           recrearse como closures en cada llamada.
 *   UI-3: se muestra el mes operativo al que corresponden las métricas.
 */
RN.salud = RN.salud || {};

/**
 * invertir=false (mayor es mejor, ej. cobranza, recuperación de inversión):
 *   valor >= umbralVerde  -> verde
 *   valor >= umbralAmbar  -> ámbar
 *   si no                 -> rojo
 * invertir=true (menor es mejor, ej. % morosos):
 *   valor <= umbralVerde  -> verde
 *   valor <= umbralAmbar  -> ámbar
 *   si no                 -> rojo
 */
RN.salud._semaforo = function (valor, umbralVerde, umbralAmbar, invertir) {
  let cls, txt;
  if (invertir) {
    if (valor <= umbralVerde) { cls = 'green'; txt = 'Saludable'; }
    else if (valor <= umbralAmbar) { cls = 'amber'; txt = 'Atención'; }
    else { cls = 'red'; txt = 'Crítico'; }
  } else {
    if (valor >= umbralVerde) { cls = 'green'; txt = 'Saludable'; }
    else if (valor >= umbralAmbar) { cls = 'amber'; txt = 'Atención'; }
    else { cls = 'red'; txt = 'Crítico'; }
  }
  return { cls, txt };
};

RN.salud._card = function (titulo, valor, s, desc) {
  return `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">${titulo}</h3>
        <span class="badge ${s.cls === 'green' ? 'ok' : (s.cls === 'amber' ? 'warn' : 'due')}">${s.txt}</span>
      </div>
      <div class="value" style="font-size:28px;font-weight:800;color:var(--${s.cls === 'green' ? 'success' : (s.cls === 'amber' ? 'warn' : 'danger')});margin-top:8px">${valor}</div>
      <p class="muted" style="font-size:13px;margin-top:4px">${desc}</p>
    </div>`;
};

RN.salud.render = function () {
  const out = document.getElementById('salud-out');
  if (!out) return;

  const mes = RN.calc.mesActualStr();
  const cob = RN.calc.cobranzaMes(mes);
  const tasaCob = cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0;
  const utilidad = RN.calc.utilidadMes(mes);
  // BUG-3: antes se calculaban y nunca se usaban. Ahora alimentan el KPI
  // "Cobranza real vs esperado" (cuánto de lo que se esperaba cobrar este
  // mes realmente entró, incluyendo mora y equipo — distinto de tasaCob,
  // que solo cuenta clientes que pagaron algo).
  const esperado = RN.calc.ingresoEsperadoMes(mes);
  const ingresos = RN.calc.ingresosMes(mes);
  const ratioCobranza = esperado > 0 ? Math.round(ingresos / esperado * 100) : 0;
  const morosos = RN.calc.clientesActivos().filter(c => RN.calc.getStatus(c, mes) === 'due').length;
  const pctMorosos = cob.total ? Math.round(morosos / cob.total * 100) : 0;
  const recInv = RN.investment.porcentajeRecuperacion();

  // BUG-5: umbrales renombrados (verde/ámbar) y en el orden en que se leen.
  const s1 = RN.salud._semaforo(tasaCob, 70, 50, false);       // >=70% verde, 50-69% ámbar, <50% rojo
  const s2 = RN.salud._semaforo(utilidad, 1, 0, false);         // >0 verde, 0 ámbar, <0 rojo
  const s3 = RN.salud._semaforo(pctMorosos, 15, 30, true);      // <=15% verde, 16-30% ámbar, >30% rojo
  const s4 = RN.salud._semaforo(recInv, 60, 30, false);         // >=60% verde, 30-59% ámbar, <30% rojo
  const s5 = RN.salud._semaforo(ratioCobranza, 90, 70, false);  // >=90% verde, 70-89% ámbar, <70% rojo

  const saludGeneral = (() => {
    const puntos = [s1.cls, s2.cls, s3.cls, s4.cls, s5.cls];
    if (puntos.includes('red')) return { cls: 'due', txt: 'Crítico — requiere acción inmediata' };
    if (puntos.includes('amber')) return { cls: 'warn', txt: 'Atención — hay puntos a mejorar' };
    return { cls: 'ok', txt: 'Saludable — el negocio marcha bien' };
  })();

  out.innerHTML = `
    <div class="card" style="text-align:center">
      <h3>Estado general del negocio</h3>
      <p class="muted" style="font-size:12px">Mes operativo: ${RN.calc.mesTexto(mes)}</p>
      <div style="font-size:36px;margin:10px 0">${saludGeneral.cls === 'ok' ? '🟢' : (saludGeneral.cls === 'warn' ? '🟡' : '🔴')}</div>
      <p style="font-weight:700">${saludGeneral.txt}</p>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      ${RN.salud._card('Tasa de cobranza', tasaCob + '%', s1, `${cob.pagaron} de ${cob.total} clientes han pagado este mes`)}
      ${RN.salud._card('Utilidad del mes', RN.calc.formatCUP(utilidad), s2, 'Ingresos − gastos del mes')}
      ${RN.salud._card('% Clientes morosos', pctMorosos + '%', s3, `${morosos} cliente(s) atrasado(s) de ${cob.total}`)}
      ${RN.salud._card('Recuperación de inversión', recInv + '%', s4, 'Cuánto se ha recuperado de lo invertido')}
      ${RN.salud._card('Cobranza real vs esperado', ratioCobranza + '%', s5, `${RN.calc.formatCUP(ingresos)} cobrados de ${RN.calc.formatCUP(esperado)} esperados`)}
    </div>`;
};
