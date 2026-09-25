# Round 16 (C1): makes the game's leader portraits (src/assets/portraits/<civ>.webp) from Dan's
# PNG masters (docs/portraits-master/<civ>.png). WebP at quality 90 looks the same at every size
# the game shows (128 px and under) and is about a sixth of the size (the offline download drops
# by about 4.4 MB). Run after adding or replacing a master: python scripts/make-portrait-webp.py
import os
from PIL import Image

SRC, OUT, QUALITY = 'docs/portraits-master', 'src/assets/portraits', 90
os.makedirs(OUT, exist_ok=True)
total_png = total_webp = 0
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'):
        continue
    src, out = os.path.join(SRC, f), os.path.join(OUT, f[:-4] + '.webp')
    Image.open(src).save(out, 'WEBP', quality=QUALITY, method=6)
    total_png += os.path.getsize(src)
    total_webp += os.path.getsize(out)
    print('%s: %d KB -> %d KB' % (f[:-4], os.path.getsize(src) // 1024, os.path.getsize(out) // 1024))
print('total: %d KB -> %d KB' % (total_png // 1024, total_webp // 1024))
