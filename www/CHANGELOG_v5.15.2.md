# Changelog v5.15.2 — Costo del paquete por corte (sobreventa = ganancia directa) + modal Utilidad neta

## Resumen

Dos cambios sobre la versión 5.15.1:

1. **Corrección del modelo de costo del mega en los modales de ganancia por corte.**
   Antes, cada corte (y cada cliente) cargaba `megas × precioMega`, lo que
   **inflaba el costo total** por encima del costo real del paquete contratado.
   Ahora el **paquete es un costo FIJO**: los primeros `proveedorMegas` megas
   vendidos lo consumen (en orden de corte) y **los megas de sobreventa no
   tienen costo → son ganancia directa**. Así el total de costo de los modales
   coincide con el **Costo del paquete** que muestra el Panel.

2. **La tarjeta KPI "Utilidad neta" ahora es clicable** y abre un modal con la
   **ganancia vs gastos del mes**.

No hay cambios de modelo de datos ni de esquema (sigue siendo 8).

---

## 1. Corrección del reparto del costo del paquete por corte

### El problema

Con el modelo anterior, el costo se calculaba como `megas × precioMega` para
**cada** cliente/corte. Ejemplo con paquete **40M × 1250 = 50,000 CUP**:

| Modal | Costo mostrado (antes) | Costo correcto |
|---|---|---|
| Ganancia proyectada | 77,500 (inflado) | **50,000** |
| Ganancia del mes | 62,500 (inflado) | **50,000** |

Esto hacía que la ganancia apareciera **menor** de lo real. El usuario lo
describió así: *"al tener sobreventa ya hay megas que son ganancias directas
para mí; puede que en el primer corte con los usuarios que tengo ya cubra el
precio del paquete contratado, por lo que los demás representan ganancia
directa"*.

### La solución: `RN.gananciaCortes._repartoCosto(cortes)`

Nuevo helper que reparte el **costo fijo** del paquete entre los cortes,
**en orden de día de pago**:

- Se ordenan los cortes por `diaPago` ascendente.
- Se recorre con un contador `restante = proveedorMegas`.
- Para cada corte: `megasEnPaquete = min(megas, restante)` y
  `megasSobreventa = megas − megasEnPaquete`.
- El costo del corte = `megasEnPaquete × precioMega` (la sobreventa cuesta 0).
- `costoPaquete = proveedorMegas × precioMega` (fijo, igual que el Panel).
- `costoNoCubierto = max(0, costoPaquete − totalCosto)` → capacidad del paquete
  que **no se vendió** (pérdida): el paquete se paga igual.

Devuelve `{ filas, totalCosto, totalMegas, megasPaquete, megasSobreventa,
costoPaquete, costoNoCubierto, precioMega }`.

### Efecto en los modales

- **`_resumenProyectado(mes)`** y **`_resumenReal(mes)`** ahora usan
  `_repartoCosto`. El `totalCosto` de cada modal es el **costo del paquete
  (fijo)**, por lo que la ganancia total coincide con el Panel.
- **`abrirProyectada()`** y **`abrirReal()`** muestran:
  - Tabla por corte: **Corte · Clientes · Megas · Ingreso/Cobrado · Costo del
    paquete · Ganancia**, con la sobreventa anotada por corte.
  - Fila **"Capacidad sin vender"** cuando queda paquete sin usar (pérdida),
    para que el total cuadre.
  - Dos KPIs nuevos: **Megas vendidos** y **Sobreventa (ganancia directa)**.
  - Pie explicativo del modelo de costo fijo.

> Nota: `costoMegaClienteMes()` (en `investment.js`) **no** se modificó, porque
> la recuperación de inversión sí usa el costo por cliente. El cambio es
> exclusivo de los modales de ganancia por corte.

---

## 2. Modal "Utilidad neta" (ganancia vs gastos del mes)

La tarjeta **Utilidad neta** del Panel ahora es clicable
(`onclick="RN.utilidadMes.abrir()"`).

### `RN.utilidadMes._gastosPorCategoria(mes)`

Agrupa los gastos del mes por categoría, **excluyendo los movimientos de
capital** (`esRetiroCaja` y `esDevolucionInversion`), que no son gasto
operativo. Devuelve `{ filas: [{categoria, monto}], total, totalConCapital }`.

### `RN.utilidadMes.abrir()`

Modal con:

- KPI **Utilidad neta del mes** = ingresos − gastos operativos, con margen %.
- KPIs de **Ingresos del mes** y **Gastos del mes**.
- **Ingresos por concepto**: Servicio, Equipo, Inventario y total.
- **Gastos por categoría** con total.
- Nota aclaratoria: no incluye retiros de caja ni devoluciones de inversión
  (movimientos de capital). Si existen, se muestran aparte como informativos.
- Pie con botón **➕ Registrar gasto** (`RN.gastos.abrirNuevo()`).

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `js/reportes/ganancia-cortes.js` | `_repartoCosto`, `_resumenProyectado`/`_resumenReal` reescritos, `abrirProyectada`/`abrirReal` con sobreventa y capacidad sin vender, nuevo `RN.utilidadMes` |
| `js/ui/render.js` | Tarjeta **Utilidad neta** clicable → `RN.utilidadMes.abrir()` |
| `js/version.js` | `APP_VERSION` → `5.15.2` |
| `js/DEPENDENCIAS.md` | Nota v5.15.2 |
| `CHANGELOG_v5.15.2.md` | Este archivo |

## Verificación

- `node --check` OK en `ganancia-cortes.js` y `render.js`.
- Con paquete 40M × 1250 = 50,000 y cortes 5/15/25, el costo total de ambos
  modales es **50,000** (antes 77,500 / 62,500), y la ganancia sube en
  consecuencia. La sobreventa aparece como ganancia directa.
