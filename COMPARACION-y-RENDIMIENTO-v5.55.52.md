# Comparación v5.55.52 (tu fuente) vs recomendaciones previas + rendimiento APK

## 1. Comparación de lógica financiera

### Lo que tu versión mejoró respecto a mis recomendaciones

| Tema | Mi paquete | Tu versión (otra fuente) | Veredicto |
|------|------------|--------------------------|-----------|
| Utilidad operativa | `utilidadOperativaMes` | Igual + docs más claros (Resultado de caja vs ganancia) | Mejor en la tuya |
| Bolsillos | Solo cambió la ganancia base | Añade `serie[]`, `fondoCorridoFinal`, `desfaseFondo` para conciliar mes a mes | Mejor en la tuya |
| Recuperación real | `sugerirAplicacionRecuperacion` / toast genérico | `aplicacionPendiente`, `aplicacionesPendientes`, `avisoAplicacionInversion`, aviso en vista Caja con montos sugerido/libre | Mejor en la tuya |
| Gastos operativos en investment | Delega a `gastosOperativosMes` | Usa `esGastoOperativo` como predicado (más robusto) | Mejor / equivalente |
| Snapshots | — | Campo `utilidadOperativa` en snapshot | Mejor en la tuya |

### Lo que faltaba o se había perdido en tu ZIP

| Tema | Estado en tu ZIP | Acción tomada ahora |
|------|------------------|---------------------|
| `RN.calc.auditoriaCaja()` | **Ausente** (sí estaba en mis recomendaciones) | **Restaurada** (v5.55.53) y usa `desfaseFondo` de bolsillos |
| `version.json` | Seguía en **5.55.51** mientras `version.js` decía 5.55.52 | Alineado a **5.55.53** |
| `aporteExtraMes` | Aún sumaba ingresos − gastos operativos a mano | Pasa por `utilidadOperativaMes` |

En conjunto: la otra fuente **refinó bien** el modelo de bolsillos y la aplicación de recuperación a deudas. No reintrodujo bugs graves de dinero; solo faltaba la auditoría global y un alinear de versiones.

---

## 2. Por qué la APK se siente menos fluida

Es una app **Capacitor + WebView** con **~86 scripts síncronos** y **~1.3 MB de JS** sin minificar ni empaquetar. En Chrome de escritorio se nota menos; en WebView Android el arranque y el scroll pesan más.

### Causas principales (orden de impacto)

1. **`tests-calculo.js` (~98 KB) cargado en producción**  
   Estaba en `index.html` al final. Parse + ejecutar en cada arranque de la APK sin aportar nada al usuario.

2. **86 `<script src>` sin `defer`/`async`**  
   Bloquean el parseo del HTML uno tras otro. No hay bundler (Vite/Rollup/esbuild).

3. **`webContentsDebuggingEnabled: true` siempre**  
   En `capacitor.config.json`. Útil en desarrollo; en release añade overhead.

4. **`minifyEnabled false` en release** (`build.gradle`)  
   El JS llega al WebView sin minificar (más parse/RAM). Activar R8/ProGuard a ciegas puede romper Capacitor; requiere reglas cuidadas.

5. **Assets de documentación dentro de `www/`**  
   ~320 KB `docs/` + decenas de `CHANGELOG_*.md` (~300 KB+). Capacitor los copia a `assets/public` y aapt los empaqueta. No afectan el runtime JS, pero sí tamaño de APK e I/O al instalar/actualizar.

6. **ForegroundService + tick cada 30 s**  
   Mantiene proceso vivo e inyecta JS en segundo plano. Correcto para recordatorios, pero compite por CPU/batería y puede hacer “micro-tirones” al volver a primer plano.

7. **Renders completos por `innerHTML`**  
   Patrón habitual en la app (`RN.render.*`). En listas largas de clientes/cobros el WebView recoloca todo el DOM. En móvil se nota más que en desktop.

8. **Sin aceleración explícita en WebView**  
   Por defecto suele ir en hardware, pero no estaba forzada en `MainActivity` / manifest.

---

## 3. Cambios de rendimiento aplicados (v5.55.53)

| Cambio | Archivo | Efecto |
|--------|---------|--------|
| Quitar `tests-calculo.js` del `index.html` de producción | `www/index.html` | Menos ~98 KB parse en cada arranque |
| `webContentsDebuggingEnabled: false` | `capacitor.config.json` | Menos overhead WebView en release |
| `hardwareAccelerated` + `largeHeap` | `AndroidManifest.xml` | Mejor composición GPU / más margen de heap |
| `optimizarWebView()` (cache, DOM storage, hardware layer, offscreen pre-raster, sin overscroll) | `MainActivity.java` | Scroll y pintado más estables |
| `aapt` ignora `docs`, `CHANGELOG*`, `*.md`, `tests` | `android/app/build.gradle` | APK más liviana |
| Restaurar `auditoriaCaja` + alinear `aporteExtraMes` | `calculations.js`, `investment.js` | Cierra huecos vs recomendaciones |
| Versión **5.55.53** | `version.js`, `version.json`, `build.gradle` | Consistencia de caché SW / versionCode |

### Qué NO se hizo (requiere más trabajo / riesgo)

- Bundler + minify de todo el JS (mayor ganancia a medio plazo).
- `minifyEnabled true` + ProGuard rules para Capacitor 6.
- Virtualizar listas de clientes/cobros (solo pintar filas visibles).
- Cargar módulos de reportes/MikroTik bajo demanda.
- Reducir o hacer opt-in el ForegroundService permanente.

---

## 4. Cómo seguir mejorando fluidez (prioridad)

1. **Corto plazo (ya aplicado)** — no cargar tests, debug WebView off, hardware layer, excluir docs del APK.  
2. **Medio** — un solo bundle `app.min.js` con esbuild/rollup; `defer` en scripts; no empaquetar `www/docs` ni changelogs históricos.  
3. **UI** — en listas grandes, no llamar `render.todo()` completo; invalidar solo la vista activa; debounce más agresivo en búsqueda (ya hay 200 ms en clientes).  
4. **Nativo** — valorar que el tick del servicio no ejecute JS si el WebView está pausado (ya hay `appEnPrimerPlano`; revisar que el path en background sea mínimo).

---

## 5. Cómo aplicar

Sustituye en tu proyecto los archivos del paquete `AdminRed-v5.55.53-perf-y-ajustes.zip` respetando rutas, luego:

```bash
npx cap sync android
# generar APK release como sueles
```

Tras instalar, confirma en Ajustes / versión que aparece **5.55.53**.
