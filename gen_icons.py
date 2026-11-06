#!/usr/bin/env python3
"""Genera los iconos de lanzador de Android a partir del icono de la app (512x512)."""
import os
from PIL import Image, ImageDraw

SRC = "www/icons/icon-512.png"
RES = "android/app/src/main/res"

# Tamaños de icono de lanzador por densidad
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Tamaño del foreground adaptativo (108dp base)
FG_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

src = Image.open(SRC).convert("RGBA")

def rounded(img, radius_ratio=0.22):
    """Aplica esquinas redondeadas."""
    w, h = img.size
    r = int(min(w, h) * radius_ratio)
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def circle(img):
    """Recorta en círculo."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, w - 1, h - 1], fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

for folder, size in SIZES.items():
    d = os.path.join(RES, folder)
    os.makedirs(d, exist_ok=True)
    base = src.resize((size, size), Image.LANCZOS)
    # ic_launcher (cuadrado redondeado)
    rounded(base).save(os.path.join(d, "ic_launcher.png"))
    # ic_launcher_round (círculo)
    circle(base).save(os.path.join(d, "ic_launcher_round.png"))

for folder, size in FG_SIZES.items():
    d = os.path.join(RES, folder)
    os.makedirs(d, exist_ok=True)
    # Foreground adaptativo: el icono ocupa ~66% del lienzo (safe zone),
    # centrado sobre fondo transparente.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * 0.66)
    icon = src.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(icon, (off, off), icon)
    canvas.save(os.path.join(d, "ic_launcher_foreground.png"))

print("Iconos generados correctamente.")
