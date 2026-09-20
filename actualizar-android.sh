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
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Repositorio Android (separado del repo web)
REPO_URL="https://github.com/leolhf/AdminRed-Android.git"

echo -e "${GREEN}=== PUBLICANDO PROYECTO ANDROID AdminRed ===${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
echo -e "${YELLOW}Directorio: $(pwd)${NC}"

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

# --- Añadir archivos (el .gitignore excluye node_modules, build y secretos) ---
echo -e "${YELLOW}Añadiendo archivos...${NC}"
git add .

NECESITA_COMMIT=true
if git rev-parse --verify HEAD >/dev/null 2>&1; then
    if git diff --cached --quiet 2>/dev/null; then
        NECESITA_COMMIT=false
    fi
fi

if [ "$NECESITA_COMMIT" = "true" ]; then
    echo -e "${YELLOW}Haciendo commit...${NC}"
    git commit -m "Actualización Android: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        git commit --allow-empty -m "Actualización Android: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
else
    echo -e "${YELLOW}No hay cambios nuevos.${NC}"
fi

reparar_git_si_corrupto

if ! git rev-parse --verify main >/dev/null 2>&1; then
    git branch -m main 2>/dev/null || git branch main 2>/dev/null
fi

echo -e "${YELLOW}Subiendo al repositorio...${NC}"
git push -u origin main --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Subida completada.${NC}"
    echo -e "${GREEN}  GitHub Actions compilará el APK en unos minutos.${NC}"
    echo -e "${GREEN}  Revisa la pestaña 'Actions' y luego 'Releases' de tu repo.${NC}"
else
    echo -e "${RED}✗ Error al subir.${NC}"
    echo -e "${YELLOW}Si es por token: git remote set-url origin https://TU_TOKEN@github.com/leolhf/AdminRed-Android.git${NC}"
fi
