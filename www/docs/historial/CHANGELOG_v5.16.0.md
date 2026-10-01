# Changelog v5.16.0 — Panel enriquecido (tendencia, alertas, cortes, rentabilidad y caja proyectada)

## Resumen

Se añaden **7 mejoras** al **Panel del negocio** que dan contexto, alertas y
proyecciones sin cambiar el esquema de datos (sigue siendo 8). Todo se calcula
reutilizando funciones de negocio ya existentes.

| # | Mejora | Dónde |
|---|---|---|
| 1 | Tendencia de 6 meses (ingresos vs gastos) | Card "📈 Tendencia de 6 meses" |
| 2 | Comparativa ▲/▼ vs mes anterior | Badge en cada KPI con monto |
| 4 | "Requiere tu atención" (alertas accionables) | Card "⚠️ Requiere tu atención" |
| 5 | Próximos cortes (agenda) | Card "📅 Próximos cortes" |
| 8 | Ganancia por mega vendido | Card "💰 Rentabilidad" |
| 9 | Aporte de la sobreventa | Card "💰 Rentabilidad" |
| 11 | Caja proyectada | Card "🏦 Caja proyectada" |

---

## Nuevo módulo `js/panel/panel-widgets.js`

### 1. Tendencia de 6 meses
Mini-gráfico de barras (ingresos verdes vs gastos rojos) de los últimos 6 meses
usando `RN.calc.tendenciaMensual(6)`. El mes actual se resalta. Pie con totales
de ingresos, gastos y balance del período.

### 2. Comparativa vs mes anterior — `RN.panelWidgets.deltaHTML(actual, anterior, opts)`
Devuelve un badge `▲/▼ %` comparando con el mes anterior (`RN.calc.mesAnterior`).
- Si la base es casi nula y el % se dispara (>999%), muestra la **diferencia
  absoluta en CUP** en vez de un porcentaje absurdo.
- `opts.invertir` permite marcar que "bajar es bueno" (ej. gastos).
- `render.js` lo usa para anotar los KPIs de Ingresos, Ganancia proyectada,
  Ganancia del mes y Utilidad neta.

### 4. "Requiere tu atención" — `RN.panelWidgets.renderAtencion()`
Lista de alertas accionables, cada una con un botón que abre el modal
correspondiente:
- **Morosos** (`RN.mora.abrir()`) — clientes con `getMora() > 0`.
- **Paquete del proveedor sin pagar** (`RN.paqueteProveedor.abrir()`).
- **Capacidad de red** excedida o ≥80% (`RN.paqueteProveedor.abrir()`).
- **Tasa USD** vencida (`RN.tasaAviso.abrirModal()`).
- **Inversión sin recuperar** (`RN.inversion.abrirNueva()`).
Si no hay nada pendiente, muestra "✅ Todo en orden".

### 5. Próximos cortes — `RN.panelWidgets.renderCortes()`
Agenda de los cortes oficiales (`RN.ciclos.cortesOficiales()`): por cada corte,
clientes, cuántos pagaron, monto esperado y estado (Vigente / Pasado / En N días).
El corte vigente se resalta.

### 8 y 9. Rentabilidad — `RN.panelWidgets.renderRentabilidad()`
- **Ganancia por mega vendido** = ganancia del mes ÷ megas vendidos.
- **Aporte de la sobreventa** = megas por encima del paquete (costo 0) × precio
  del mega. Usa `RN.gananciaCortes._repartoCosto()` (v5.15.2) para saber cuántos
  megas son sobreventa. Refuerza el concepto de que la sobreventa es ganancia
  directa.

### 11. Caja proyectada — `RN.panelWidgets.renderCajaProyectada()`
Fondo de caja actual + lo que falta por cobrar de servicio este mes − el paquete
del proveedor si aún no se ha pagado = proyección al cerrar el mes.

---

## Cambios en archivos existentes

| Archivo | Cambio |
|---|---|
| `js/ui/render.js` | Deltas ▲/▼ en los KPIs; llamada a `RN.panelWidgets.renderAll()` al final de `dashboard()`; **fix**: `RN.investment.abrirModal()` → `RN.inversion.abrirNueva()` (el botón "Registrar inversión" del estado vacío no funcionaba) |
| `index.html` | Contenedores de los 5 widgets + `<script src="js/panel/panel-widgets.js">` |
| `sw.js` | `panel-widgets.js` en `CORE_ASSETS` |
| `styles.css` | Estilos de deltas, alertas, tendencia, cortes y caja proyectada |
| `js/version.js` | `APP_VERSION` → `5.16.0` |
| `js/DEPENDENCIAS.md` | Entrada 42c + nota v5.16.0 |

## Verificación

- `node --check` OK en `panel-widgets.js`, `render.js` y `sw.js`.
- Verificado en navegador con datos de prueba (paquete 40M × 1250, cortes 5/15/25,
  sobreventa 20M): los 5 widgets renderizan, los deltas muestran ▲/▼, y los
  botones de alerta abren sus modales (Gestionar servicio, Tasa USD, Nueva
  inversión). Sin errores en consola.
