# AdminRed v5.22.0 — Compilación automática del APK + botón de descarga

## Novedades

### 🚀 Compilación automática del APK (GitHub Actions)
El proyecto Android ahora incluye un flujo de **GitHub Actions** que compila y firma
el APK automáticamente cada vez que se sube un cambio al repositorio
`leolhf/AdminRed-Android`. El APK se publica como *release* descargable.

- Workflow: `.github/workflows/build-apk.yml`
- Script de publicación: `actualizar-android.sh`
- Instrucciones: `README-ANDROID.md`

### 📲 Botón "Descargar APK" en la PWA
Nueva tarjeta en **Ajustes → App Android (APK)** con dos botones:
- **Descargar APK (última versión):** abre la release más reciente del repo Android.
- **Ver todas las versiones:** abre el historial completo de releases.

La tarjeta se **oculta automáticamente** cuando la app corre dentro del APK nativo
(no tiene sentido descargarse a sí misma).

- Módulo nuevo: `js/apk.js` (`RN.apk`)
- Inicialización: `RN.apk.init()` en `init.js` (paso 14b)

### 🔧 Repositorios separados
- **Web (PWA):** `leolhf/AdminRed` — sin cambios, se publica con `actualizar.sh`.
- **Android (APK):** `leolhf/AdminRed-Android` — proyecto Capacitor + CI.

Ambos scripts se ejecutan desde la misma carpeta local (`AdminRedApp/`), así que
no hay duplicación de trabajo.

## Notas técnicas
- El `.gitignore` del proyecto Android excluye `node_modules`, builds y **secretos**
  (keystore y `keystore.properties`). El keystore viaja cifrado como *secret* de GitHub.
- El APK mantiene la misma firma, por lo que las actualizaciones se instalan encima
  sin desinstalar.
