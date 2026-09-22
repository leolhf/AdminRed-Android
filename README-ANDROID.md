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

## Changelog

### v5.25.1 — Recordatorios en 3 grupos y fixes de notificaciones

`www/js/notificaciones/notifications.js` (único archivo modificado de la lógica, + `version.js` y este README):

- **Fix crítico:** el permiso de notificaciones (`POST_NOTIFICATIONS`, Android 13+) nunca se pedía solo — estaba atado al botón de Ajustes. Ahora `RN.notify.init()` lo pide al arrancar en la APK; sin esto todas las notificaciones se descartaban en silencio.
- **Fix:** `schedule: { at, every: 'day', repeats: true, allowWhileIdle: true }` — antes `repeats: true` sin `every` producía avisos de fondo de una sola vez.
- **Fix:** verificación de `checkExactNotificationSetting()` (Android 14: `SCHEDULE_EXACT_ALARM` ya no viene concedida) con toast de instrucciones si está denegada.
- **Nuevo diseño de recordatorios (3 grupos):**
  1. **MOROSOS** (`getMora(c) > 0`, modelo v5.10.5) — deuda TOTAL vía `deudaTotalCliente()` (servicio pendiente + equipo), título "Mora: N meses de atraso", IDs 2000+i.
  2. **COBRANZA HOY** (`diaPago === hoy`, `getStatus !== 'paid'`) — el recordatorio clásico del corte, IDs 2020+j.
  3. **VENCE MAÑANA** (`diaPago` = mañana, clampado al último día del mes en meses de 28/29/30; sin aviso al cruzar de mes) — aviso anticipado para clientes `ok`/`parcial`, IDs 2040+k.
- **Deduplicación:** cada cliente+grupo se notifica máximo 1 vez al día (registro persistido en `localStorage`, clave `rn_notify_ultimo`, con poda automática de días pasados). La clasificación reutiliza `getStatus()`/`getMora()` de `calculations.js` — sin lógica duplicada.
- **Avisos de fondo:** el resumen diario ahora es real ("2 clientes por cobrar y 1 en mora") en vez de solo una cantidad.
- Versión subida a `5.25.1` (`version.js` + `package.json`) para invalidar la caché del SW.

## Changelog

### v5.28.1 — FIX: plugins nativos fuera del bridge (Drive) + ciclo verificado

- **FIX crítico (Drive):** `registerPlugin(KeepAlivePlugin/GoogleDrivePlugin)` se movió ANTES de `super.onCreate()` en `MainActivity.java`. En Capacitor 6 el Bridge se construye dentro de `super.onCreate()` con la lista de plugins existente en ese momento; al registrarlos después, `window.Capacitor.Plugins['GoogleDrive']` no existía en el WebView y `drive.js` caía en el guard "La copia en Drive solo está disponible en la APK" aunque la app FUERA la APK. Era la causa exacta del mensaje al intentar conectar la cuenta de Google.
- **Diagnóstico mejorado:** si la app es nativa pero el plugin no aparece en el bridge, el toast ahora lo dice claramente ("reinstala la APK v5.28.1 o superior"); el mensaje "solo disponible en la APK" queda reservado al navegador/PWA.
- **Ciclo de cortes verificado (sin cambios de comportamiento):** con corte 25 y `graciaDias=5` (default), el grupo 'ciclo' notifica a los clientes del corte desde el día 20 (`inicioCiclo = max(1, diaPago - graciaDias)`, modelo v5.10.4) hasta el 24; el día 25 lo cubre el grupo 'hoy'. La revisión ahora usa `cv.inicioCiclo` directamente (una sola fuente de verdad).
- **Nota:** el enfoque de Drive (AccountManager + appDataFolder) no requiere OAuth Client ID ni registro de huella SHA-1 en Google Cloud Console, por lo que no hacía falta tocar la consola: el problema era solo el orden de registro del plugin.
- Versión subida a 5.28.1 (`version.js` + `package.json`).
