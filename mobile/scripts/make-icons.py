"""Draws the iPhone app icon and launch screen from the GovProposalPro mark (assets/mark.png).

Run from mobile/:  python3 scripts/make-icons.py
Needs Pillow. Writes into the Xcode asset catalog. App Store icons must have no transparency.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(HERE, 'ios', 'App', 'App', 'Assets.xcassets')
BG = (4, 5, 10)


def glow_background(size, strength=1.0):
    """The app's dark background with soft blue (top left) and red (top right) light."""
    img = Image.new('RGB', (size, size), BG)
    layer = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(layer)
    r = int(size * 0.55)
    d.ellipse([-r // 2, -r // 2, r, r], fill=(10, 60, 170))
    d.ellipse([size - r, -r // 2, size + r // 2, r], fill=(120, 20, 40))
    layer = layer.filter(ImageFilter.GaussianBlur(size * 0.18))
    return Image.blend(img, layer, 0.75 * strength)


def place_mark(canvas, scale):
    mark = Image.open(os.path.join(HERE, 'assets', 'mark.png')).convert('RGBA')
    size = canvas.size[0]
    h = int(size * scale)
    w = int(mark.width * h / mark.height)
    mark = mark.resize((w, h), Image.LANCZOS)
    out = canvas.convert('RGBA')
    out.alpha_composite(mark, ((size - w) // 2, (size - h) // 2))
    return out.convert('RGB')


icon = place_mark(glow_background(1024), 0.58)
icon.save(os.path.join(ASSETS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), optimize=True)

splash = place_mark(glow_background(2732, 0.6), 0.12)
for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    splash.save(os.path.join(ASSETS, 'Splash.imageset', name), optimize=True)
print('Wrote the app icon and launch screen.')
