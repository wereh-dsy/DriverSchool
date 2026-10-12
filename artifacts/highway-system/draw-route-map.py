import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
data = json.loads((ROOT / 'src/world/regional/regional-main.json').read_text(encoding='utf-8'))
system = data['regional']['highways']
W, H, AA = 2400, 1700, 2
im = Image.new('RGB', (W * AA, H * AA), '#f4f7fa')
d = ImageDraw.Draw(im)
font_path = 'C:/Windows/Fonts/msyh.ttc'
def font(size): return ImageFont.truetype(font_path, int(size * AA))
bounds=data['bounds']
SCALE = min(1520 / (bounds['maxX']-bounds['minX']), 1100 / (bounds['maxZ']-bounds['minZ']))
def xy(p): return ((155 + (p['x'] - bounds['minX']) * SCALE) * AA, (320 + (p['z'] - bounds['minZ']) * SCALE) * AA)
def line(points, fill, width): d.line(points, fill=fill, width=int(width * AA), joint='curve')
def text(pos, value, size=24, fill='#26384b'): d.text((pos[0]*AA,pos[1]*AA), value, font=font(size), fill=fill)
def rect(box, fill, outline=None, radius=12, width=1):
    d.rounded_rectangle(tuple(v*AA for v in box),radius=radius*AA,fill=fill,outline=outline,width=width*AA)
placed=[]
def label(p, value, offset, color='#26384b', size=22):
    x,y=xy(p); x/=AA; y/=AA
    tx,ty=x+offset[0],y+offset[1]
    b=d.textbbox((0,0),value,font=font(size)); tw=(b[2]-b[0])/AA; th=size+12
    candidates=[(tx,ty)]+[(x+dx,y+dy) for dx,dy in [(18,-40),(-tw-18,-40),(18,30),(-tw-18,30),(18,-80),(-tw-18,-80),(18,70),(-tw-18,70),(40,-120),(-tw-40,110)]]
    for cx,cy in candidates:
        box=(cx-6,cy-3,cx+tw+8,cy+th)
        if box[0]<80 or box[2]>1750 or box[1]<235 or box[3]>1450:continue
        if all(box[2]+8<a or c+8<box[0] or box[3]+8<b or e+8<box[1] for a,b,c,e in placed):
            tx,ty=cx,cy;placed.append(box);break
    line([(x*AA,y*AA),((tx+tw/2)*AA,(ty+th/2)*AA)],'#9aabba',1)
    rect((tx-6,ty-3,tx+tw+8,ty+th),'#ffffff',radius=5)
    text((tx,ty),value,size,color)

text((85,65),'区域高速线路图',56)
text((88,146),'DriverGame · Regional World V3  |  交错双 C 绕城 · 主线贯穿 · 区域外联',25,'#64758a')
rect((65,220,1780,1470),'#ffffff','#dce4ec',20)
rect((1820,220,2340,1470),'#ffffff','#dce4ec',20)

# +X east, -Z north; city roads and ramp detail are deliberately omitted.
b=data['regional']['cityBounds']; a=xy({'x':b['minX'],'z':b['minZ']}); c=xy({'x':b['maxX'],'z':b['maxZ']})
d.rounded_rectangle((a[0],a[1],c[0],c[1]),radius=18*AA,fill='#eef2f6',outline='#d8e0e9',width=2*AA)
text(((a[0]+c[0])/2/AA-72,(a[1]+c[1])/2/AA-16),'城市核心区',24,'#8796a7')
text(((a[0]+c[0])/2/AA-90,(a[1]+c[1])/2/AA+20),'市内道路已省略',18,'#9ba8b7')
placed.append((a[0]/AA,a[1]/AA,c[0]/AA,c[1]/AA))
for r in data['roads']:
    if r.get('roadNameId')=='ring-expressway' and r['id'].startswith(('ring-cw-', 'ring-ccw-')): line([xy(p) for p in r['centerline']],'#a5b1be',3)

colors=dict(G17='#df483b',G38='#2369c2',G4516='#a147b7',S26='#b68b16',S37='#d56c24',S68='#5864ba',S89='#168c78',G42='#d93283',G65='#70513a',S18='#159bc4',S36='#6b8f23',S31='#33465c',S29='#c41e4e')
palette=[colors[r['id']] for r in data['regional']['routes']]
lookup={r['id']:r for r in system['routes']}
for i,r in enumerate(data['regional']['routes']):
    pts=[xy(p) for p in r['centerline']]
    line(pts,'#ffffff',12);line(pts,palette[i],7)
fold=next(r for r in data['roads'] if r['id']=='regional:v3:chenjiang-foldback')
line([xy(p) for p in fold['centerline']],'#ffffff',8)
line([xy(p) for p in fold['centerline']],colors['S31'],4)
label(fold['centerline'][len(fold['centerline'])//2],'沿江折返联络匝道',(18,28),size=18)

# Route badges placed away from hubs and crossing points.
stations=[.65,.68,.72,.80,.70,.48,.44,.76,.70,.34,.20,.20,.27]
offsets=[(15,-42),(35,-70),(0,-42),(0,18),(0,18),(10,-18),(-70,35),(-95,0),(0,18),(18,0),(0,-42),(-100,0),(0,-42)]
for i,r in enumerate(data['regional']['routes']):
    p=r['centerline'][int((len(r['centerline'])-1)*stations[i])]; x,y=xy(p);x/=AA;y/=AA
    x+=offsets[i][0];y+=offsets[i][1]; n=lookup[r['id']]['number']; bw=105 if len(n)>3 else 76
    rect((x,y,x+bw,y+39),palette[i],radius=8);text((x+10,y+4),n,24,'#ffffff')
    placed.append((x,y,x+bw,y+39))

joffset={'regional:qingling':(-120,-68),'regional:dongyuan':(20,-50),'regional:lingang':(-125,32),'regional:xichuan':(-120,-38),'regional:logistics':(-120,24),'regional:dongnan':(25,-70),'regional:airport-link':(-115,-55),'regional:newcity-link':(60,10),'regional:yunjiang-link':(-90,-55),'regional:chenjiang-east-link':(15,-30),'regional:v2:westgate':(-100,-45),'regional:v2:airport-north':(20,-55),'regional:v2:northwest':(24,-40),'regional:v2:westlink':(-130,20)}
for j in system['junctions']:
    offset=joffset.get(j['id'],(18,-38))
    x,y=xy(j['position']);rad=8*AA
    d.ellipse((x-rad,y-rad,x+rad,y+rad),fill='#ffffff',outline='#26384b',width=3*AA)
    label(j['position'],j['name'],offset,size=18)
for s in system['services']:
    x,y=xy(s['position']);rad=5*AA
    d.rectangle((x-rad,y-rad,x+rad,y+rad),fill='#ffffff',outline='#26384b',width=2*AA)
    label(s['position'],s['name'],(16,17),size=18)

airport=next(r for r in data['regional']['routes'] if r['id']=='S18')['centerline'][-1]
label(airport,'机场 / 航站楼',(-40,-65),size=24)
newcity=next(r for r in data['regional']['routes'] if r['id']=='S36')['centerline'][-1]
label(newcity,'邻近区域 / 新城',(0,25),size=24)
for route_id,at,value,offset in [('G42',0,'西原方向（区域外）',(-25,-105)),('G42',-1,'晨江方向（区域外）',(-180,-62)),('G65',0,'云岭西北（区域外）',(-90,-62)),('G65',-1,'南部地区（区域外）',(10,16)),('S37',-1,'西川方向（区域外）',(0,30))]:
    route=next(r for r in data['regional']['routes'] if r['id']==route_id)
    label(route['centerline'][at],value,offset,size=20)

for route_id,at,value,offset in [('S89',0,'西南绕城 · 西原外联',(0,-62)),('S89',-1,'西南绕城 · 东部外联',(-230,-80)),('S29',0,'东北绕城 · 西北外联',(0,-62)),('S29',-1,'东北绕城 · 东南外联',(18,25)),('S31',0,'沿江北方向（区域外）',(-200,-62)),('S31',-1,'沿江南方向（区域外）',(-200,25)),('G38',-1,'北岭方向（区域外）',(18,-55)),('S36',0,'西部新城（区域外）',(0,-60))]:
    route=next(r for r in data['regional']['routes'] if r['id']==route_id)
    label(route['centerline'][at],value,offset,size=20)

text((1860,260),'高速线路 · 颜色图例',30)
for i,r in enumerate(system['routes']):
    y=328+i*69
    line([(1865*AA,(y+18)*AA),(1928*AA,(y+18)*AA)],palette[i],8)
    text((1947,y),r['number']+'  '+r['name'],25)
text((1860,1270),'○  主线贯穿的枢纽',22)
text((1860,1320),'□  服务区 / 停车设施',22)
line([(1865*AA,1390*AA),(1928*AA,1390*AA)],'#a5b1be',4)
text((1947,1370),'既有城市快速环路',22,'#708095')
text((1860,1420),'各路线双向合并为一条线',20,'#708095')

# Orientation and scale are based on actual world coordinates.
nx,ny=1680,310
line([(nx*AA,(ny+70)*AA),(nx*AA,(ny+15)*AA)],'#26384b',3)
d.polygon([(nx*AA,ny*AA),((nx-10)*AA,(ny+22)*AA),((nx+10)*AA,(ny+22)*AA)],fill='#26384b')
text((nx-12,ny-36),'北',24)
sx,sy=125,1390; length=2000*SCALE
line([(sx*AA,sy*AA),((sx+length)*AA,sy*AA)],'#52677b',4)
for v in [sx,sx+length]:line([(v*AA,(sy-7)*AA),(v*AA,(sy+7)*AA)],'#52677b',2)
text((sx,sy+12),'0',19,'#708095');text((sx+length-25,sy+12),'2 km',19,'#708095')
text((85,1520),'按当前地图主线坐标绘制；仅额外标出沿江折返匝道，省略其余匝道、出入口细节与市内道路。',25,'#64758a')
text((85,1570),'S12 西南绕城与 S29 东北绕城各自开放外联；S31 南端折返保留为联络匝道，主线继续向南。',23,'#64758a')
out=ROOT/'artifacts/highway-system/highway-route-map.png'
im.resize((W,H),Image.Resampling.LANCZOS).save(out)
print(out)
