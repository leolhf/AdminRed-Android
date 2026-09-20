#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== ACTUALIZANDO REPOSITORIO AdminRed ===${NC}"

# Cambiar al directorio donde está este script (auto-detectable)
# Así funciona sin importar en qué carpeta lo pongas.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo -e "${YELLOW}Directorio actual: $(pwd)${NC}"

# === Función: detectar y reparar .git corrupto ===
# Los objetos vacíos (0 bytes) aparecen cuando un push se interrumpe.
# También pueden aparecer objetos corruptos que git fsck detecta.
# Como usamos --force, no necesitamos historial: reconstruir desde cero es seguro.
reparar_git_si_corrupto() {
    if [ ! -d ".git" ]; then
        return 0  # no existe, no hay nada que reparar
    fi

    # Método 1: buscar archivos vacíos en .git/objects
    EMPTY_OBJ=$(find .git/objects -type f -empty 2>/dev/null | head -1)

    # Método 2: git fsck detecta objetos corruptos/inaccesibles
    FSCK_ERR=$(git fsck --full 2>&1 | grep -iE "error|corrupt|empty|missing|bad" | head -1)

    if [ -n "$EMPTY_OBJ" ] || [ -n "$FSCK_ERR" ]; then
        echo -e "${RED}Detectado .git corrupto.${NC}"
        if [ -n "$EMPTY_OBJ" ]; then
            echo -e "${RED}  - Objeto vacío: $EMPTY_OBJ${NC}"
        fi
        if [ -n "$FSCK_ERR" ]; then
            echo -e "${RED}  - git fsck: $FSCK_ERR${NC}"
        fi
        echo -e "${YELLOW}Reconstruyendo repositorio git desde cero...${NC}"
        rm -rf .git
    fi
}

# Verificar al inicio
reparar_git_si_corrupto

# Inicializar git (nuevo o reconstruido)
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Inicializando repositorio git...${NC}"
    git init
    git remote add origin https://github.com/leolhf/AdminRed.git
fi

# Asegurar que la remote apunte al repo correcto (por si viene de otro clone)
EXISTING_REMOTE=$(git remote get-url origin 2>/dev/null)
if [ "$EXISTING_REMOTE" != "https://github.com/leolhf/AdminRed.git" ]; then
    echo -e "${YELLOW}Configurando remote...${NC}"
    git remote remove origin 2>/dev/null
    git remote add origin https://github.com/leolhf/AdminRed.git
fi

# Asegurar que la rama por defecto sea main
git symbolic-ref HEAD refs/heads/main 2>/dev/null

# Configurar usuario
git config user.name "leolhf"
git config user.email "hfleo975@gmail.com"

# Añadir archivos
echo -e "${YELLOW}Añadiendo archivos...${NC}"
git add .

# === Commit ===
# Siempre hacemos commit. Si no hay cambios reales, usamos --allow-empty
# para garantizar que exista la rama main y el push no falle con
# "src refspec main does not match any".
NECESITA_COMMIT=true

# Verificar si ya hay commits (HEAD existe)
if git rev-parse --verify HEAD >/dev/null 2>&1; then
    # Hay HEAD: verificar si hay cambios reales
    if git diff --cached --quiet 2>/dev/null; then
        NECESITA_COMMIT=false
    fi
fi

if [ "$NECESITA_COMMIT" = "true" ]; then
    echo -e "${YELLOW}Haciendo commit...${NC}"
    git commit -m "Actualización automática: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
    # Si el commit falló (sin cambios), forzar uno vacío
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        echo -e "${YELLOW}Forzando commit inicial...${NC}"
        git commit --allow-empty -m "Actualización automática: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
else
    echo -e "${YELLOW}No hay cambios nuevos (commit ya existente).${NC}"
fi

# === Verificar SIEMPRE antes del push ===
reparar_git_si_corrupto

# Si reconstruimos el .git, necesitamos re-add y re-commit
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Re-inicializando después de reparación...${NC}"
    git init
    git symbolic-ref HEAD refs/heads/main 2>/dev/null
    git remote add origin https://github.com/leolhf/AdminRed.git
    git config user.name "leolhf"
    git config user.email "hfleo975@gmail.com"
    git add .
    git commit -m "Actualización automática: $(date '+%Y-%m-%d %H:%M:%S')" || \
    git commit --allow-empty -m "Actualización automática: $(date '+%Y-%m-%d %H:%M:%S')"
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
    echo -e "${GREEN}✓ Actualización completada exitosamente${NC}"
else
    echo -e "${RED}✗ Error al subir.${NC}"
    echo ""
    echo -e "${YELLOW}Posibles causas y soluciones:${NC}"
    echo ""
    echo -e "${YELLOW}1) Token no configurado o expirado:${NC}"
    echo "   git remote set-url origin https://TU_TOKEN@github.com/leolhf/AdminRed.git"
    echo ""
    echo -e "${YELLOW}2) Si vuelve a dar error de 'bad object' o 'empty object':${NC}"
    echo "   rm -rf .git"
    echo "   bash actualizar.sh"
    echo ""
    echo -e "${YELLOW}3) Si el repo remoto tiene contenido corrupto:${NC}"
    echo "   Ve a https://github.com/leolhf/AdminRed/settings"
    echo "   Puedes borrar y recrear el repo, luego ejecuta actualizar.sh otra vez."
fi
