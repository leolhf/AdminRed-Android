# AdminRed v5.31.0 — Cuadre de caja por moneda (CUP y USD por separado)

**Fecha:** 2026-09-25

## Resumen

El modal **Cuadre de caja** solo tenía un campo, `Saldo real contado (CUP)`, y lo
comparaba contra el **fondo total**. Eso obligaba a contar pesos y dólares como si
fueran lo mismo: si te faltaban 20 USD, el descuadre se registraba como un descuadre
de pesos (el fondo bajaba por el equivalente) pero la **gaveta de dólares no se movía
ni un dólar**, así que el descuadre volvía a aparecer en el siguiente cuadre.

Ahora el cuadre se hace **por moneda**: dos conteos independientes (CUP y USD), cada
uno contra su propio saldo calculado, y un movimiento por moneda con la diferencia
real de esa moneda.

## Cambios

### `js/cobros/cuadre.js` (reescrito)

- El modal pide **dos** saldos contados:
  - 🪙 **Saldo real contado — CUP (pesos)**
  - 💵 **Saldo real contado — USD (dólares)**
- Arriba muestra las cifras calculadas por la app, separadas por moneda:
  **USD en la gaveta** (`RN.calc.usdEnCaja()`), **CUP en la gaveta**
  (`RN.calc.cupEnCaja()`) y el **fondo total equivalente en CUP**
  (`RN.calc.fondoCaja()`).
- Dejar un campo **vacío** = "esa moneda no se contó" y no genera movimiento:
  se puede cuadrar solo CUP, solo USD o los dos a la vez.
- El resultado en vivo muestra **una línea por moneda**: faltante, sobrante o
  "cuadre exacto", con lo contado y lo que dice la app.
- Movimientos registrados (categoría `Descuadre de caja`, como antes):
  - **CUP**: `monto` en pesos, positivo si falta y negativo si sobra (igual que v5.14.0).
  - **USD**: `monto` = equivalente en CUP (impacto en el fondo) y `montoCuadreUSD`
    **firmado** (+ faltan USD, − sobran USD), más `tasaUsada` y los saldos
    calculado/contado en dólares.
- Si hay descuadre en dólares y **no hay tasa USD configurada**, avisa y bloquea el
  registro (no se puede valorar el ajuste). Sin tasa, el cuadre de CUP y el conteo
  de USD siguen funcionando.
- Bloquea montos contados negativos.
- `RN.cuadre.listar()` (historial): nueva columna **Moneda** y dos KPI separados
  (neto por descuadres **en CUP** y **en USD**), además del total equivalente.
- Funciones puras y testeables añadidas: `RN.cuadre.esContado()`,
  `RN.cuadre.diferencia()`, `RN.cuadre.construirMovimientos()`.

### `js/core/calculations.js`

- Nuevo `RN.calc.usdCuadreAjuste()`: suma `montoCuadreUSD` de los cuadres en dólares.
- `usdEnCaja()` **resta** ese ajuste, así que la gaveta de USD refleja los faltantes
  y sobrantes en dólares. Los cuadres antiguos (sin `cuadreMoneda`) no la afectan:
  los datos ya guardados siguen cuadrando exactamente igual que antes.
- Nuevo `RN.calc.descuadresPorMoneda()`: `{ cup, usd, usdEnCUP, totalCUP, cantidad }`.

### `js/ui/render.js`

- La tarjeta de cada cuadre en **Gastos** muestra la moneda del cuadre
  (`Faltante de caja · USD`) y su monto real (`$20.00 USD (2.400,00 CUP)`) en vez de
  mostrar siempre el equivalente en pesos como si fuera un descuadre de pesos.

### `js/version.js`

- `APP_VERSION` → `5.31.0` (invalida la caché del service worker).

### `android/app/build.gradle`

- `versionCode` → `5310`, `versionName` → `5.31.0`.

### `tools/test-cuadre-monedas.js` (nuevo)

Verificación automática con Node, sin navegador: `node tools/test-cuadre-monedas.js`.
Comprueba el escenario de la captura (fondo de 98.000 CUP con 20 USD en la gaveta),
un **faltante simultáneo en CUP y en USD**, un sobrante solo en CUP, el cuadre de
una sola moneda, el bloqueo sin tasa, los deudores negativos y la compatibilidad
con los cuadres antiguos en CUP.

## v5.31.0 — Detección de actualizaciones del APK reparada

El APK no avisaba de las versiones nuevas. Eran cinco fallos acumulados:

### `www/js/update.js` (reescrito)

1. **Un fallo se guardaba como comprobación válida.** `_marcarComprobado()` se
   llamaba *antes* de validar la respuesta, así que una sola consulta fallida
   (muy común en el APK al arrancar en frío, cuando la red aún no está lista)
   bloqueaba los avisos automáticos **6 horas**. Ahora se separan
   "última comprobación CORRECTA" (`adminred:update-last-check`) de
   "último intento" (`adminred:update-last-attempt`), y tras un fallo se
   reintenta con espera corta creciente: 5 → 10 → 20 → 40 → 60 min.
2. **Una sola fuente de datos.** Dependía solo de la API de GitHub
   (`releases/latest`), limitada a **60 peticiones/hora por IP** y que devuelve
   **404** si la última release es borrador o preliminar. Ahora hay dos fuentes:
   - API de GitHub (informa la URL directa del `.apk`),
   - `version.json` en `raw.githubusercontent` (sin límite de peticiones; lo
     genera `tools/sync-version.py` en cada publicación).
   Si una falla se usa la otra, y la que funcionó **queda recordada** para ir
   primero la próxima vez.
3. **Cero feedback visible.** La comprobación automática es silenciosa y el aviso
   dependía de la notificación del sistema: si el permiso `POST_NOTIFICATIONS`
   no estaba concedido, `_notificar()` devolvía `false` y el usuario no veía
   **absolutamente nada**. Ahora se pinta una **banda visible** en la app
   ("⬆️ Nueva versión vX disponible · Descargar"), además de la notificación.
4. **Sin forma de ver qué pasaba.** Nuevo `RN.update.diagnostico()` (Ajustes →
   "🧩 Diagnóstico de actualizaciones"): consulta las dos fuentes, muestra el
   resultado de cada una, la versión instalada, la publicada, el último error,
   los fallos acumulados y cuándo fue la última comprobación correcta.
5. **Se abría la página, no el APK.** El aviso y la notificación abren ahora la
   **URL directa del archivo `.apk`** cuando la API la informa.

Además: `cache: 'no-store'` + parámetro anti-caché (el WebView no sirve respuestas
viejas), comprobación también al reanudar la app (plugin App de Capacitor),
comparación de versiones **numérica** ("5.9" < "5.10", no al revés) y lectura
robusta de versiones con prefijo ("AdminRed v5.30.0" → "5.30.0").

### Versión sincronizada en TODOS los sitios (`tools/sync-version.py`, nuevo)

En el proyecto entregado, `www/js/version.js` decía **5.30.0** mientras
`android/app/build.gradle` decía **versionName "5.29.0" / versionCode 5290**
(y `package.json`, 5.29.0). Consecuencias reales:

- El APK publicado no se identificaba como la versión que la app cree ser.
- **Android no instala un APK con un `versionCode` igual o menor que el
  instalado**, así que la actualización se quedaba sin instalar: el síntoma
  exacto de "no detecta actualizaciones".

`tools/sync-version.py` toma `APP_VERSION` de `www/js/version.js` como **fuente
única de verdad** y escribe `versionName`, `versionCode` (5.31.0 → 5310),
`package.json` y `version.json`. Rechaza publicar si el `versionCode`
**decreciera**. Con `--check` sirve para CI (exit 1 si hay desincronía).

### `version.json` en la raíz del repo (nuevo)

Manifiesto de versión que la app consulta sin depender de la API de GitHub. Se
regenera en cada publicación.

### `actualizar-android.sh`

- Sincroniza la versión antes de subir (`tools/sync-version.py`).
- **Protege `.github/workflows/build-apk.yml`**: si falta en local, lo descarga
  del repositorio antes de subir. El script re-inicializa git y hace
  `git push --force`, así que subir un árbol sin `.github` **borraría el workflow
  y dejaría de compilarse cualquier APK nuevo** (el ZIP sin archivos ocultos
  reproducía exactamente ese escenario). Si no se puede recuperar, **aborta**.
- Comprueba que la etiqueta `v<versión>` no exista ya (subir dos veces la misma
  versión hacía fallar la creación del release y no aparecía nada nuevo).
- Tras subir, espera a la release y muestra la **URL directa del APK**.

### `tools/test-update-check.js` (nuevo)

`node tools/test-update-check.js` — 33 comprobaciones sobre el módulo real con
`fetch`, `localStorage` y `navigator` simulados: comparación numérica de
versiones, detección correcta, aviso único por versión, **fallo que no arma el
bloqueo de 6 h**, respaldo a `version.json` cuando la API devuelve 403, nuevo
aviso al salir otra versión, estado, diagnóstico de las dos fuentes y ausencia
de red.

## Compatibilidad

- No hay migración de datos: los cuadres anteriores se leen como CUP
  (comportamiento idéntico al de v5.30.0).
- `RN.cuadre.totalNeto()` se mantiene (ahora devuelve el neto equivalente en CUP).
- El botón "🧮 Cuadre de caja" de la pestaña Finanzas no cambia de sitio.
