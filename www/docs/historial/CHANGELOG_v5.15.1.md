# Changelog v5.15.1 — KPIs del Panel clicables (resúmenes de ingresos y ganancias por corte)

## Resumen

Las cuatro primeras tarjetas KPI del **Panel del negocio** dejan de ser solo
informativas y pasan a ser **clicables**, abriendo cada una un resumen útil:

| Tarjeta | Acción al tocar |
|---|---|
| **Ingresos del mes** | Modal con el resumen de los ingresos del mes (por concepto y por corte) |
| **Costo del paquete** | Abre el modal **📡 Gestionar servicio** (`RN.paqueteProveedor.abrir()`) |
| **Ganancia proyectada del mes** | Modal con la ganancia esperada **por corte** |
| **Ganancia del mes** | Modal con la ganancia real cobrada **por corte** |

No hay cambios de modelo de datos ni de esquema (sigue siendo 8): todo se
calcula a partir del estado existente reutilizando las funciones de negocio ya
presentes (`ingresosMes`, `ingresoEsperadoMes`, `montoPaqueteProveedor`,
`costoMegaClienteMes`, `getPrecioNeto`, `getMora`, `resumenCliente`, `RN.ciclos`).

---

## Nuevo módulo `js/reportes/ganancia-cortes.js`

Centraliza los tres modales de resumen y los helpers de cálculo por corte:

- **`RN.ingresosMes.abrir()`** — resumen de los ingresos del mes:
  - KPI total + equivalente USD.
  - Desglose por concepto: **Servicio**, **Equipo** e **Inventario**.
  - Nota de mora incluida en el servicio (si aplica).
  - **Desglose por corte**: cada corte (día de pago) con su total y el detalle
    de conceptos; los cobros sin cliente/corte se agrupan como "Sin corte asignado".
  - Pie con el estado de cobranza (pagaron/total, parciales) y acceso al historial.

- **`RN.gananciaCortes.abrirProyectada()`** — ganancia **proyectada** por corte:
  - KPI de ganancia proyectada del mes (ingreso esperado − costo del paquete).
  - KPIs de ingreso esperado y costo del paquete.
  - Tabla por corte: clientes, ingreso esperado, costo del mega y ganancia,
    con fila de **Total**.
  - Aviso cuando no hay precio de proveedor por mega (ganancia inflada).

- **`RN.gananciaCortes.abrirReal()`** — ganancia **real** del mes por corte:
  - KPI de ganancia del mes (cobrado − costo del paquete).
  - KPIs de cobrado y costo del paquete.
  - Tabla por corte: clientes, cobrado, costo del mega y ganancia, con **Total**.
  - Mismo aviso de costo de proveedor no configurado.

### Criterio de cálculo por corte

- **Proyectada**: se agrupan los clientes activos con `mesInicio <= mes` por su
  `diaPago`. Ingreso esperado = suma de `getPrecioNeto`; costo = suma de
  `costoMegaClienteMes` (megas × precio por mega del proveedor); ganancia =
  ingreso − costo.
- **Real**: se agrupan los cobros del mes (`h.mes === mes`) por el `diaPago` del
  cliente. Cobrado = `h.monto + h.montoEquipo`; el costo del mega se calcula una
  sola vez por cliente (no por cobro) para no duplicarlo; ganancia = cobrado − costo.
- El **total del panel** sigue usando el costo del **paquete completo**
  (`montoPaqueteProveedor`), por eso el total de la tabla (costo del mega de los
  clientes) puede diferir del KPI; se explica en el pie de cada modal.

## `js/ui/render.js`

- Las 4 tarjetas KPI ahora llevan `click`:
  - `Ingresos del mes` → `RN.ingresosMes.abrir()`
  - `Costo del paquete` → `RN.paqueteProveedor.abrir()`
  - `Ganancia proyectada del mes` → `RN.gananciaCortes.abrirProyectada()`
  - `Ganancia del mes` → `RN.gananciaCortes.abrirReal()`
- La tarjeta de ingresos añade el subtexto "Toca para ver el resumen".
- Se reutiliza el mecanismo de KPI clicable ya existente (`kpi-click`, con
  `role="button"`, `tabindex` y soporte de teclado Enter/Space).

## `index.html` · `sw.js` · `js/version.js`

- `index.html`: se registra `js/reportes/ganancia-cortes.js` tras `descuentos-view.js`.
- `sw.js`: se añade el nuevo script a `CORE_ASSETS` para que quede cacheado offline.
- `js/version.js`: `APP_VERSION` sube de `5.15.0` a `5.15.1` (bump de parche);
  el Service Worker invalida la caché automáticamente.

## Documentación

- `js/DEPENDENCIAS.md`: se documenta el nuevo módulo y la regla de dependencia
  de los `onclick` del Panel.

## Verificación realizada

- `node --check` sin errores en `ganancia-cortes.js`, `render.js`, `version.js` y `sw.js`.
- Carga de la app sin errores de consola; versión mostrada `v5.15.1`.
- **Ingresos del mes**: abre el modal con desglose por concepto y por corte;
  con cobros de prueba (corte 5 = 500 servicio; corte 10 = 750 servicio + 100 equipo)
  muestra Servicio 1,250 · Equipo 100 · Total 1,350 y los cortes correctos.
- **Costo del paquete**: abre el modal **📡 Gestionar mi servicio de internet**.
- **Ganancia proyectada**: con 3 clientes (cortes 5/10/15) y proveedor 50M × 25,
  muestra por corte 250/125/250 y total 625 CUP (ingreso 2,750 − costo mega 2,125).
- **Ganancia del mes**: con los cobros de prueba muestra corte 5 = 500 y
  corte 10 = 850, total 1,350 CUP.
- Aviso de "costo del mega asumido 0" visible cuando no hay precio de proveedor.

## Archivos modificados

`js/reportes/ganancia-cortes.js` (nuevo) · `js/ui/render.js` · `index.html` ·
`sw.js` · `js/version.js` · `js/DEPENDENCIAS.md` · `CHANGELOG_v5.15.1.md` (nuevo)
