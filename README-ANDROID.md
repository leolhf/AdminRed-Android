# AdminRed — Proyecto Android (Capacitor)

Este repositorio contiene el **proyecto nativo Android** de AdminRed, construido con
[Capacitor](https://capacitorjs.com/). La app web (PWA) vive en `www/` y es la misma
que se publica en el repositorio web.

> **Importante:** este repo es solo para el APK. La versión web se sigue publicando
> aparte con su propio `actualizar.sh`.

---

## ¿Cómo funciona la compilación automática?

Cada vez que subes cambios a la rama `main`, **GitHub Actions**:

1. Instala Node.js, JDK 17 y el Android SDK.
2. Instala las dependencias (`npm ci`).
3. Sincroniza los assets web (`npx cap sync android`).
4. Restaura el keystore de firma desde los *secrets*.
5. Compila el APK de release firmado.
6. Lo publica como **release descargable** en la pestaña *Releases* del repo.

No tienes que compilar nada a mano. Solo subes el código y esperas ~4 minutos.

---

## Configuración inicial (una sola vez)

### 1. Crear el repositorio

Crea un repositorio en GitHub llamado **`AdminRed-Android`** (público, recomendado:
minutos de Actions ilimitados y gratis).

### 2. Subir el proyecto

El script ya apunta a `https://github.com/leolhf/AdminRed-Android.git`. Solo ejecuta:

```bash
bash actualizar-android.sh
```

### 3. Configurar los 4 secrets de firma

Ve a **Settings → Secrets and variables → Actions → New repository secret** y crea:

| Secret | Valor |
|---|---|
| `KEYSTORE_BASE64` | El keystore codificado en base64 (ver abajo) |
| `KEYSTORE_PASSWORD` | Contraseña del keystore (`adminred2025`) |
| `KEY_ALIAS` | Alias de la clave (`adminred`) |
| `KEY_PASSWORD` | Contraseña de la clave (`adminred2025`) |

Para generar el `KEYSTORE_BASE64` en Linux/macOS:

```bash
base64 -w0 adminred-release.keystore
```

Copia toda la salida y pégala como valor del secret `KEYSTORE_BASE64`.

> ⚠️ **Nunca** subas el keystore ni `keystore.properties` al repositorio.
> El `.gitignore` ya los excluye. Los secrets de GitHub están cifrados.

### 4. Listo

Haz cualquier cambio y súbelo. En la pestaña **Actions** verás la compilación, y en
**Releases** aparecerá el APK listo para descargar e instalar.

---

## Compilar localmente (opcional)

Si prefieres compilar en tu máquina:

```bash
npm ci
npx cap sync android
cd android
./gradlew assembleRelease
```

El APK queda en `android/app/build/outputs/apk/release/app-release.apk`.

---

## Estructura

```
.
├── .github/workflows/build-apk.yml   # Compilación automática del APK
├── www/                              # La app web (PWA) — mismo código que el repo web
├── android/                          # Proyecto Android nativo
├── capacitor.config.json             # Configuración de Capacitor
├── package.json                      # Dependencias (Capacitor + plugins)
├── actualizar-android.sh             # Script para subir este repo
└── .gitignore                        # Excluye node_modules, build y secretos
```

---

## Actualizar la versión

Antes de subir cambios importantes, sube la versión en **dos sitios**:

1. `www/js/version.js` → `APP_VERSION = '5.22.0'`
2. `android/app/build.gradle` → `versionCode 5220` y `versionName "5.22.0"`

El workflow usa `APP_VERSION` para nombrar el APK y la release automáticamente.
