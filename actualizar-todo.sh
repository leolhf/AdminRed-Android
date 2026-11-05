#!/bin/bash
# ============================================================
#  AdminRed — Actualizar TODO (web + APK) con un solo comando
# ============================================================
#  Uso:  bash actualizar-todo.sh
#
#  Hace las dos cosas de una vez:
#    1. Sube la web (PWA) al repo leolhf/AdminRed
#    2. Sube el proyecto Android al repo leolhf/AdminRed-Android
#       (GitHub compila el APK solo en ~3 minutos)
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  AdminRed — Actualizando TODO${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# --- 1. WEB (PWA) ---
echo -e "${YELLOW}[1/2] Actualizando la WEB (PWA)...${NC}"
if [ -f "www/actualizar.sh" ]; then
    ( cd www && bash actualizar.sh )
    WEB_OK=$?
else
    echo -e "${RED}No se encontró www/actualizar.sh${NC}"
    WEB_OK=1
fi
echo ""

# --- 2. APK (Android) ---
echo -e "${YELLOW}[2/2] Actualizando el APK (Android)...${NC}"
if [ -f "actualizar-android.sh" ]; then
    bash actualizar-android.sh
    APK_OK=$?
else
    echo -e "${RED}No se encontró actualizar-android.sh${NC}"
    APK_OK=1
fi
echo ""

# --- Resumen ---
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  RESUMEN${NC}"
echo -e "${GREEN}========================================${NC}"
if [ "$WEB_OK" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} Web (PWA) subida"
else
    echo -e "  ${RED}✗${NC} Web (PWA) falló"
fi
if [ "$APK_OK" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} Proyecto Android subido"
    echo -e "     ${YELLOW}→ GitHub compilará el APK en ~3 min${NC}"
    echo -e "     ${YELLOW}→ https://github.com/leolhf/AdminRed-Android/releases/latest${NC}"
else
    echo -e "  ${RED}✗${NC} Proyecto Android falló"
fi
echo ""
