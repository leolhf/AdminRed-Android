#!/bin/bash
# ============================================================
#  AdminRed — Publicar la WEB (PWA) en leolhf/AdminRed
# ============================================================
#  IMPORTANTE: este script usa un GIT_DIR EXTERNO (../.git-web)
#  para NO crear una carpeta .git dentro de www/.
#
#  ¿Por qué? Porque www/ está dentro del proyecto Android
#  (AdminRedApp/). Si se creara www/.git, el repositorio Android
#  lo trataría como un "submódulo embebido" y el APK dejaría de
#  compilar (www quedaría vacío en el repo Android).
#
#  Con el GIT_DIR externo, los dos repos (web y Android) conviven
#  en la misma carpeta sin pisarse.
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

REPO_URL="https://github.com/leolhf/AdminRed.git"
GIT_DIR_EXTERNO="$SCRIPT_DIR/../.git-web"

# Exportar GIT_DIR/GIT_WORK_TREE: git usará el repo externo y
# trabajará sobre el contenido de www/ (sin crear www/.git).
export GIT_DIR="$GIT_DIR_EXTERNO"
export GIT_WORK_TREE="$SCRIPT_DIR"

echo -e "${GREEN}=== ACTUALIZANDO REPOSITORIO WEB AdminRed ===${NC}"
echo -e "${YELLOW}Directorio: $(pwd)${NC}"
echo -e "${YELLOW}GIT_DIR:    $GIT_DIR${NC}"

# === Función: detectar y reparar .git corrupto ===
# Los objetos vacíos (0 bytes) aparecen cuando un push se interrumpe.
# Como usamos --force, no necesitamos historial: reconstruir es seguro.
reparar_git_si_corrupto() {
    if [ ! -d "$GIT_DIR" ]; then
        return 0
    fi
    EMPTY_OBJ=$(find "$GIT_DIR/objects" -type f -empty 2>/dev/null | head -1)
    FSCK_ERR=$(git fsck --full 2>&1 | grep -iE "error|corrupt|empty|missing|bad" | head -1)
    if [ -n "$EMPTY_OBJ" ] || [ -n "$FSCK_ERR" ]; then
        echo -e "${RED}Detectado git corrupto.${NC}"
        [ -n "$EMPTY_OBJ" ] && echo -e "${RED}  - Objeto vacío: $EMPTY_OBJ${NC}"
        [ -n "$FSCK_ERR" ] && echo -e "${RED}  - git fsck: $FSCK_ERR${NC}"
        echo -e "${YELLOW}Reconstruyendo repositorio git desde cero...${NC}"
        rm -rf "$GIT_DIR"
    fi
}

reparar_git_si_corrupto

# Inicializar git (nuevo o reconstruido)
if [ ! -d "$GIT_DIR" ]; then
    echo -e "${YELLOW}Inicializando repositorio git (externo)...${NC}"
    git init
    git remote add origin "$REPO_URL"
fi

# Asegurar que la remote apunte al repo correcto
EXISTING_REMOTE=$(git remote get-url origin 2>/dev/null)
if [ "$EXISTING_REMOTE" != "$REPO_URL" ]; then
    echo -e "${YELLOW}Configurando remote...${NC}"
    git remote remove origin 2>/dev/null
    git remote add origin "$REPO_URL"
fi

# Asegurar rama main
git symbolic-ref HEAD refs/heads/main 2>/dev/null

# Configurar usuario
git config user.name "leolhf"
git config user.email "hfleo975@gmail.com"

# Añadir archivos
echo -e "${YELLOW}Añadiendo archivos...${NC}"
git add -A

# === Commit ===
NECESITA_COMMIT=true
if git rev-parse --verify HEAD >/dev/null 2>&1; then
    if git diff --cached --quiet 2>/dev/null; then
        NECESITA_COMMIT=false
    fi
fi

if [ "$NECESITA_COMMIT" = "true" ]; then
    echo -e "${YELLOW}Haciendo commit...${NC}"
    git commit -m "Actualización web: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        echo -e "${YELLOW}Forzando commit inicial...${NC}"
        git commit --allow-empty -m "Actualización web: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
else
    echo -e "${YELLOW}No hay cambios nuevos (commit ya existente).${NC}"
fi

# === Verificar SIEMPRE antes del push ===
reparar_git_si_corrupto

# Si reconstruimos el git, re-add y re-commit
if [ ! -d "$GIT_DIR" ]; then
    echo -e "${YELLOW}Re-inicializando después de reparación...${NC}"
    git init
    git symbolic-ref HEAD refs/heads/main 2>/dev/null
    git remote add origin "$REPO_URL"
    git config user.name "leolhf"
    git config user.email "hfleo975@gmail.com"
    git add -A
    git commit -m "Actualización web: $(date '+%Y-%m-%d %H:%M:%S')" || \
    git commit --allow-empty -m "Actualización web: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# Confirmar que la rama main existe antes de push
if ! git rev-parse --verify main >/dev/null 2>&1; then
    echo -e "${YELLOW}Creando rama main...${NC}"
    git branch -m main 2>/dev/null || git branch main 2>/dev/null
fi

# Subir (siempre con --force: reemplaza el remoto completamente)
echo -e "${YELLOW}Subiendo al repositorio...${NC}"
git push -u origin main --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Web actualizada exitosamente${NC}"
    echo -e "${GREEN}  https://leolhf.github.io/AdminRed/${NC}"
else
    echo -e "${RED}✗ Error al subir.${NC}"
    echo ""
    echo -e "${YELLOW}Posibles causas y soluciones:${NC}"
    echo -e "${YELLOW}1) Token no configurado o expirado:${NC}"
    echo "   git remote set-url origin https://TU_TOKEN@github.com/leolhf/AdminRed.git"
    echo -e "${YELLOW}2) Si vuelve a dar error de 'bad object' o 'empty object':${NC}"
    echo "   rm -rf ../.git-web && bash actualizar.sh"
fi
