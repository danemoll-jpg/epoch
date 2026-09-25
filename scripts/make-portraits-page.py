# Regenerates docs/portraits.html's leader data from src/data/civs.ts (Round 11). Run it after
# changing a leader's portraitFocus or color: python scripts/make-portraits-page.py
# (tests/leaders.test.ts fails if the page and the data drift apart).
import json
import re

src = open('src/data/civs.ts', encoding='utf-8').read().split('// ---- Legacy')[0]
leaders = []
pattern = r"id: '([a-z_]+)', name: '([^']+)'.*?leader: '([^']+)', color: '(#[0-9a-f]+)'.*?portraitFocus: \{ x: ([0-9.]+), y: ([0-9.]+), zoom: ([0-9.]+) \}"
num = lambda v: int(float(v)) if float(v).is_integer() else float(v)
for m in re.finditer(pattern, src, re.S):
    i, n, l, c, x, y, z = m.groups()
    leaders.append({'id': i, 'leader': l, 'civ': n, 'color': c, 'focus': {'x': num(x), 'y': num(y), 'zoom': num(z)}})
assert len(leaders) == 12, len(leaders)

page = open('docs/portraits.html', encoding='utf-8').read()
page = re.sub(r'(<script id="leaders" type="application/json">)[\s\S]*?(</script>)',
              lambda m: m.group(1) + json.dumps(leaders, ensure_ascii=False) + m.group(2), page)
open('docs/portraits.html', 'w', encoding='utf-8').write(page)
print('docs/portraits.html: %d leaders' % len(leaders))
