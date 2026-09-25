#!/bin/bash
# ============================================================
#  AdminRed — Publicar proyecto Android (dispara el build del APK)
# ============================================================
#  Este script sube el proyecto Capacitor a un repositorio de GitHub.
#  Al hacer push, GitHub Actions compila el APK automáticamente y lo
#  publica como "release" descargable.
#
#  Uso:
#    1. Edita REPO_URL abajo con la URL de TU repositorio Android.
#    2. Ejecuta:  bash actualizar-android.sh
#
#  Opciones:
#    --no-poll         no espera a que GitHub publique la release
#    --ver-workflow    solo muestra el workflow remoto y sale
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Repositorio Android (separado del repo web)
REPO_URL="https://github.com/leolhf/AdminRed-Android.git"
REPO_SLUG="leolhf/AdminRed-Android"

POLL=1
VER_WORKFLOW=0
for arg in "$@"; do
    case "$arg" in
        --no-poll) POLL=0 ;;
        --ver-workflow) VER_WORKFLOW=1 ;;
    esac
done

WORKFLOW_PATH=".github/workflows/build-apk.yml"
WORKFLOW_RAW="https://raw.githubusercontent.com/${REPO_SLUG}/main/${WORKFLOW_PATH}"

echo -e "${GREEN}=== PUBLICANDO PROYECTO ANDROID AdminRed ===${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
echo -e "${YELLOW}Directorio: $(pwd)${NC}"

if [ "$VER_WORKFLOW" = "1" ]; then
    echo -e "${BLUE}Descargando el workflow remoto para inspección...${NC}"
    curl -fsS "$WORKFLOW_RAW" || echo -e "${RED}No se pudo descargar el workflow.${NC}"
    exit 0
fi

# --- 0. Sincronizar la versión en TODOS los sitios ---------------------------
# www/js/version.js es la fuente única de verdad: de ahí salen versionName,
# versionCode, package.json y version.json. Sin esto, el APK se publica con un
# versionCode viejo y Android NI SIQUIERA lo instala sobre el que ya tienes.
echo -e "${YELLOW}[0/5] Sincronizando la versión...${NC}"
if command -v python3 >/dev/null 2>&1; then
    python3 tools/sync-version.py || { echo -e "${RED}✗ No se pudo sincronizar la versión.${NC}"; exit 1; }
    VERSION=$(grep -oP "APP_VERSION\s*=\s*'\K[^']+" www/js/version.js 2>/dev/null | head -1)
    [ -z "$VERSION" ] && VERSION=$(sed -n "s/.*APP_VERSION *= *['\"]\([^'\"]*\)['\"].*/\1/p" www/js/version.js | head -1)
    echo -e "${GREEN}  Versión a publicar: v$VERSION${NC}"
    python3 tools/sync-version.py --check || { echo -e "${RED}✗ Versión desincronizada tras sincronizar.${NC}"; exit 1; }
else
    echo -e "${RED}✗ No hay python3: no se puede garantizar que la versión esté sincronizada.${NC}"
    echo -e "${YELLOW}  Sube a mano APP_VERSION, versionName, versionCode, package.json y version.json.${NC}"
    exit 1
fi

# --- 0b. Proteger el workflow del build (el push es --force) -----------------
# Este script re-inicializa git y hace push --force. Si el árbol local NO trae
# .github/workflows/build-apk.yml, el push BORRARÍA el workflow remoto y no se
# compilaría ningún APK nuevo: la app dejaría de recibir actualizaciones.
echo -e "${YELLOW}[0b/5] Comprobando el workflow de compilación...${NC}"
if [ ! -f "$WORKFLOW_PATH" ]; then
    echo -e "${YELLOW}  No existe $WORKFLOW_PATH en local. Descargándolo del repositorio...${NC}"
    mkdir -p "$(dirname "$WORKFLOW_PATH")"
    if curl -fsS "$WORKFLOW_RAW" -o "$WORKFLOW_PATH"; then
        echo -e "${GREEN}  ✓ Workflow recuperado (se conservará al subir).${NC}"
    else
        echo -e "${RED}✗ No se pudo recuperar $WORKFLOW_PATH.${NC}"
        echo -e "${RED}  Subir ahora BORRARÍA el workflow remoto y no habría más APK.${NC}"
        echo -e "${YELLOW}  Copia el archivo .github/workflows/build-apk.yml junto al proyecto y reintenta.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}  ✓ $WORKFLOW_PATH presente.${NC}"
fi

# El .gitignore también viaja en el repo: si falta en local, se recupera para no
# subir node_modules ni el keystore por accidente.
if [ ! -f ".gitignore" ]; then
    curl -fsS "https://raw.githubusercontent.com/${REPO_SLUG}/main/.gitignore" -o .gitignore 2>/dev/null \
        && echo -e "${GREEN}  ✓ .gitignore recuperado.${NC}"
fi

# --- Evitar el error "dubious ownership" (común en Termux con /storage) ---
git config --global --add safe.directory "$SCRIPT_DIR" 2>/dev/null

# --- Reparar .git corrupto (mismo criterio que actualizar.sh de la web) ---
reparar_git_si_corrupto() {
    if [ ! -d ".git" ]; then return 0; fi
    EMPTY_OBJ=$(find .git/objects -type f -empty 2>/dev/null | head -1)
    FSCK_ERR=$(git fsck --full 2>&1 | grep -iE "error|corrupt|empty|missing|bad" | head -1)
    if [ -n "$EMPTY_OBJ" ] || [ -n "$FSCK_ERR" ]; then
        echo -e "${RED}Detectado .git corrupto. Reconstruyendo...${NC}"
        rm -rf .git
    fi
}
reparar_git_si_corrupto

# --- Inicializar git ---
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Inicializando repositorio git...${NC}"
    git init
    git remote add origin "$REPO_URL"
fi

EXISTING_REMOTE=$(git remote get-url origin 2>/dev/null)
if [ "$EXISTING_REMOTE" != "$REPO_URL" ]; then
    echo -e "${YELLOW}Configurando remote...${NC}"
    git remote remove origin 2>/dev/null
    git remote add origin "$REPO_URL"
fi

git symbolic-ref HEAD refs/heads/main 2>/dev/null
git config user.name "leolhf"
git config user.email "hfleo975@gmail.com"

# --- Guardar credenciales de forma persistente (una sola vez) ---
git config --global credential.helper store 2>/dev/null

# --- Comprobar que la etiqueta de esta versión no exista ya ---------------
# Si ya existe v<VERSION>, GitHub Actions no puede crear la release y no
# aparecería ninguna versión nueva para que la app la detecte.
if [ -n "$VERSION" ]; then
    if git ls-remote --tags origin "v$VERSION" 2>/dev/null | grep -q "v$VERSION"; then
        echo -e "${RED}✗ La versión v$VERSION ya está publicada en el repositorio.${NC}"
        echo -e "${YELLOW}  Sube APP_VERSION en www/js/version.js (por ejemplo a 5.31.1) y vuelve a ejecutar.${NC}"
        exit 1
    fi
fi

# --- Añadir archivos (el .gitignore excluye node_modules, build y secretos) ---
echo -e "${YELLOW}[1/5] Añadiendo archivos...${NC}"
git add .

NECESITA_COMMIT=true
if git rev-parse --verify HEAD >/dev/null 2>&1; then
    if git diff --cached --quiet 2>/dev/null; then
        NECESITA_COMMIT=false
    fi
fi

if [ "$NECESITA_COMMIT" = "true" ]; then
    echo -e "${YELLOW}[2/5] Haciendo commit...${NC}"
    git commit -m "Actualización Android v$VERSION: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --allow-empty -m "Actualización Android v$VERSION: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
else
    echo -e "${YELLOW}  No hay cambios nuevos.${NC}"
fi

reparar_git_si_corrupto

if ! git rev-parse --verify main >/dev/null 2>&1; then
    git branch -m main 2>/dev/null || git branch main 2>/dev/null
fi

echo -e "${YELLOW}[3/5] Subiendo al repositorio...${NC}"
git push -u origin main --force

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Error al subir.${NC}"
    echo -e "${YELLOW}Si es por autenticación: ejecuta 'git push' manualmente una vez.${NC}"
    echo -e "${YELLOW}Git te pedirá usuario y token (como contraseña) y los guardará para la próxima vez.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Subida completada (v$VERSION).${NC}"
echo -e "${GREEN}  GitHub Actions compilará el APK en unos minutos.${NC}"

# --- Esperar a que la release aparezca y mostrar la URL del APK -----------
if [ "$POLL" = "1" ] && [ -n "$VERSION" ]; then
    echo -e "${YELLOW}[4/5] Esperando a que GitHub publique la release v$VERSION...${NC}"
    API="https://api.github.com/repos/${REPO_SLUG}/releases/tags/v${VERSION}"
    OK=0
    for i in $(seq 1 20); do
        sleep 20
        RESP=$(curl -fsS -H "Accept: application/vnd.github+json" "$API" 2>/dev/null)
        APK_URL=$(printf '%s' "$RESP" | grep -o "https://[^\"]*\.apk" | head -1)
        if [ -n "$APK_URL" ]; then
            OK=1
            break
        fi
        echo -e "  ... esperando ($((i*20))s)"
    done
    echo -e "${YELLOW}[5/5] Resultado:${NC}"
    if [ "$OK" = "1" ]; then
        echo -e "${GREEN}✓ APK publicado:${NC} $APK_URL"
        echo -e "${GREEN}  La app lo detectará con el nombre AdminRed_v$VERSION.apk${NC}"
    else
        echo -e "${YELLOW}  Aún no aparece. Revisa la pestaña Actions del repositorio:${NC}"
        echo -e "  https://github.com/${REPO_SLUG}/actions"
    fi
else
    echo -e "${YELLOW}[4/5] Sin espera (--no-poll).${NC}"
fi

echo -e "${BLUE}Releases: https://github.com/${REPO_SLUG}/releases${NC}"
