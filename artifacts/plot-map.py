import json, sys
from PIL import Image, ImageDraw, ImageFont

map_path = 'src/world/regional/regional-main.json'
map = json.load(open(map_path, encoding='utf-8-sig'))
minx, maxx, minz, maxz = [float(v) for v in sys.argv[1:5]]
out = sys.argv[5] if len(sys.argv) > 5 else 'artifacts/plan.png'
scale = float(sys.argv[6]) if len(sys.argv) > 6 else 2.0
W = int((maxx - minx) * scale)
H = int((maxz - minz) * scale)
img = Image.new('RGB', (W, H), (245, 245, 240))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 11)
except Exception:
    font = ImageFont.load_default()

colors = {
    'expressway': (210, 60, 60), 'arterial': (230, 150, 40), 'collector': (60, 130, 200),
    'local': (110, 170, 120), 'frontage': (140, 100, 180), 'ramp': (200, 60, 160),
}
def P(p):
    return ((p['x'] - minx) * scale, (p['z'] - minz) * scale)

for r in map['roads']:
    pts = r.get('centerline') or []
    if not any(minx <= p['x'] <= maxx and minz <= p['z'] <= maxz for p in pts):
        continue
    cls = r.get('roadClass', 'local')
    col = colors.get(cls, (120, 120, 120))
    wid = max(1, int((r.get('laneCount', 2) * 2.2) * scale * 0.5))
    xy = [P(p) for p in pts]
    d.line(xy, fill=col, width=wid)
    # endpoints
    for q, c in ((xy[0], (0, 120, 0)), (xy[-1], (180, 0, 0))):
        d.ellipse([q[0]-3, q[1]-3, q[0]+3, q[1]+3], fill=c)
    mid = xy[len(xy)//2]
    label = r['id']
    if len(label) > 44: label = label[:42] + '..'
    d.text((mid[0]+2, mid[1]+2), f"{label}", fill=(20, 20, 20), font=font)
for j in map['intersections']:
    p = j['position']
    if not (minx <= p['x'] <= maxx and minz <= p['z'] <= maxz): continue
    q = P(p)
    d.rectangle([q[0]-4, q[1]-4, q[0]+4, q[1]+4], outline=(0, 0, 0), width=1)
    d.text((q[0]+5, q[1]-14), j['id'], fill=(0, 0, 0), font=font)
img.save(out)
print(out, W, H, 'roads', sum(1 for r in map['roads'] if any(minx <= p['x'] <= maxx and minz <= p['z'] <= maxz for p in (r.get('centerline') or []))))
