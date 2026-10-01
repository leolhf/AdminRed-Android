# Changelog v5.13.19 — Sincronización automática de mes operativo

## Resumen

El mes operativo de la app (`RN.state.mesActual`) **no cambiaba automáticamente** al cambiar el mes calendario real. Era un proceso 100% manual: el usuario debía ir a Cobros → "Cerrar mes". Si el usuario no lo hacía, la app se quedaba "estancada" en un mes anterior (ej: julio) aunque ya estuviera en agosto o septiembre, mostrando datos de cobranza y KPIs de un mes que ya pasó.

### Problema reportado
> "Estoy en agosto y la aplicación mantiene mes operativo julio, como es que hace el salto del mes la app"

### Causa raíz
- `RN.calc.mesActualStr()` prioriza `RN.state.mesActual` sobre el reloj del sistema. Esto es correcto por diseño (permite trabajar en un mes hasta cerrarlo).
- `RN.calc.sincronizarMesReal()` **existía pero nunca se llamaba** desde ningún punto de la app.
- No había ninguna lógica que detectara "el mes real está por delante del mes operativo" y avisara al usuario.
- El único camino para avanzar el mes era el botón manual "Cerrar mes" en Cobros.

### Solución implementada

Se añadió **aviso automático de sincronización de mes** al arrancar la app:

1. **`RN.init.avisoSincronizarMes()`** (nueva función en `init.js`):
   - Se ejecuta 1.2 segundos después del render inicial (vía `setTimeout` en `arrancar()`).
   - Compara `RN.calc.mesRealStr()` (reloj del sistema) con `RN.calc.mesActualStr()` (mes operativo).
   - Si el mes real está por delante (`diff > 0`), muestra un **modal informativo** con:
     - El mes operativo actual y el mes real detectado.
     - Cuántos meses de diferencia hay.
     - Un **resumen de cada mes a cerrar** con sus KPIs (ingresos, gastos, cobranza) previsualizados desde el snapshot.
     - Dos botones: **"Sincronizar a [mes real]"** y **"Mantener [mes operativo]"**.
   - Solo se muestra una vez por sesión (flag `_avisoSyncMesMostrado`).

2. **`RN.init._confirmarSyncMes()`** (handler del botón sincronizar):
   - Cierra **cada mes intermedio** automáticamente, replicando la lógica de `RN.monthReset.confirmar()`:
     - Genera un snapshot inmutable (`RN.calc.generarSnapshot(mes)`) y lo guarda en `RN.state.snapshots`.
     - Anula los descuentos puntuales pendientes del mes (`estado: 'anulado'`), respetando los `soloPago`.
     - Avanza `RN.state.mesActual` al mes siguiente.
     - Aplica `paquetePendiente` si existe (solo una vez, en el primer cierre).
   - Si hay múltiples meses de diferencia (ej: operativo=Julio, real=Septiembre), genera **2 snapshots** (uno por Julio, otro por Agosto) y avanza el mes operativo hasta Septiembre.
   - Persiste config + data, re-renderiza la UI, muestra toast de éxito y notificación local.

3. **`RN.init._cancelarSyncMes()`** (handler del botón mantener):
   - Cierra el modal y muestra un toast recordando que el usuario debe cerrar el mes manualmente cuando esté listo.

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `js/init.js` | Añadidas funciones `avisoSincronizarMes()`, `_confirmarSyncMes()`, `_cancelarSyncMes()`. Añadida llamada en `arrancar()` con `setTimeout(…, 1200)`. |
| `js/version.js` | Bump `5.13.18` → `5.13.19` |

### Beneficios

- **El usuario ya no necesita recordar cerrar el mes manualmente.** La app le avisa al arrancar si hay meses pendientes por cerrar.
- **Snapshots automáticos:** Al sincronizar, se genera un snapshot por cada mes cerrado, preservando el historial de KPIs igual que el cierre manual.
- **Manejo de múltiples meses:** Si el usuario no abrió la app durante varios meses, se cierran todos los meses intermedios en una sola acción.
- **No invasivo:** El usuario puede elegir mantener el mes operativo actual si prefiere cerrar manualmente.
- **Paquete pendiente:** Si había un `paquetePendiente` configurado, se aplica correctamente al sincronizar (igual que el cierre manual).
