# Round 19 (item 6): makes the full-screen leader scenes' pictures (src/assets/portraits-full/
# scene-<civ>.webp, 1200 px on the long side) from Dan's uncropped PNG masters
# (docs/portraits-full-master/<civ>.png). Run after adding or replacing a master:
#   python scripts/make-scene-webp.py
import os
from PIL import Image

SRC, OUT, SIZE, QUALITY = 'docs/portraits-full-master', 'src/assets/portraits-full', 1200, 80
os.makedirs(OUT, exist_ok=True)
total_png = total_webp = 0
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'):
        continue
    src, out = os.path.join(SRC, f), os.path.join(OUT, 'scene-' + f[:-4] + '.webp')
    im = Image.open(src).convert('RGB')
    scale = SIZE / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(out, 'WEBP', quality=QUALITY, method=6)
    total_png += os.path.getsize(src)
    total_webp += os.path.getsize(out)
    print('%s: %d KB -> %d KB' % (f[:-4], os.path.getsize(src) // 1024, os.path.getsize(out) // 1024))
print('total: %d KB -> %d KB' % (total_png // 1024, total_webp // 1024))
