#!/usr/bin/env python3
"""Genera el splash screen (fondo oscuro + icono centrado) para Android."""
import os
from PIL import Image

SRC = "www/icons/icon-512.png"
RES = "android/app/src/main/res"
BG = (15, 23, 42, 255)  # #0F172A (background_color del manifest)

# Tamaños de splash por densidad (portrait y landscape)
PORT = {
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}
LAND = {
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}

icon = Image.open(SRC).convert("RGBA")

def make_splash(w, h):
    canvas = Image.new("RGBA", (w, h), BG)
    # El icono ocupa ~30% del lado menor
    side = int(min(w, h) * 0.30)
    ic = icon.resize((side, side), Image.LANCZOS)
    off = ((w - side) // 2, (h - side) // 2)
    canvas.paste(ic, off, ic)
    return canvas.convert("RGB")

for folder, (w, h) in {**PORT, **LAND}.items():
    d = os.path.join(RES, folder)
    os.makedirs(d, exist_ok=True)
    make_splash(w, h).save(os.path.join(d, "splash.png"))

# Splash genérico (drawable/) por si alguna densidad no está cubierta
make_splash(480, 320).save(os.path.join(RES, "drawable", "splash.png"))

print("Splash generado correctamente.")
