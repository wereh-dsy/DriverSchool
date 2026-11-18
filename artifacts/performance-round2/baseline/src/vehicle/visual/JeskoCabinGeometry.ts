import * as T from 'three';

/** Simple vector artwork keeps badges crisp at any cockpit resolution. */
export function drawJeskoWordmark(c:CanvasRenderingContext2D,x:number,y:number,width:number,color='#d1d6d7'):void {
  c.save();c.translate(x,y);c.scale(width/145,width/145);c.strokeStyle=color;c.lineWidth=3.1;c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.moveTo(23,2);c.lineTo(12,22);c.quadraticCurveTo(8,29,1,24);
  c.moveTo(61,2);c.lineTo(38,2);c.lineTo(24,26);c.lineTo(48,26);c.moveTo(32,14);c.lineTo(52,14);
  c.moveTo(86,2);c.lineTo(66,2);c.quadraticCurveTo(59,2,57,8);c.quadraticCurveTo(55,12,68,15);c.quadraticCurveTo(79,19,71,24);c.lineTo(49,26);
  c.moveTo(98,2);c.lineTo(84,26);c.moveTo(92,13);c.lineTo(116,2);c.moveTo(92,13);c.lineTo(104,26);
  c.moveTo(126,2);c.quadraticCurveTo(118,2,114,9);c.lineTo(108,20);c.quadraticCurveTo(105,26,114,26);c.lineTo(129,26);
  c.quadraticCurveTo(135,26,139,19);c.lineTo(144,8);c.quadraticCurveTo(147,2,138,2);c.closePath();c.stroke();c.restore();
}

/** Closed section loft: a few curved rings provide continuous moulded panels. */
export function jeskoLoft(name:string,rings:readonly (readonly T.Vector3[])[],material:T.Material):T.Mesh {
  const axis=rings[rings.length-1]![0]!.clone().sub(rings[0]![0]!);
  const normal=new T.Vector3();
  for(let j=0;j<rings[0]!.length;j++)normal.add(rings[0]![j]!.clone().cross(rings[0]![(j+1)%rings[0]!.length]!));
  const sections=normal.dot(axis)<0?rings.map(r=>[...r].reverse()):rings;
  const n=sections[0]!.length,positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const vertex=(p:T.Vector3)=>{positions.push(p.x,p.y,p.z);uv.push(p.x*2,(p.z+p.y)*2);};
  for(const ring of sections)for(const p of ring)vertex(p);
  for(let r=0;r<sections.length-1;r++)for(let j=0;j<n;j++){
    const a=r*n+j,b=r*n+(j+1)%n;indices.push(a,b,b+n,a,b+n,a+n);
  }
  // Triangulate concave caps separately so their normals cannot bend the fascia.
  for(const [r,reverse] of [[0,true],[sections.length-1,false]] as const){
    const ring=sections[r]!,start=positions.length/3;
    for(const p of ring)vertex(p);
    const flat=ring.map(p=>Math.abs(axis.x)>Math.abs(axis.z)?new T.Vector2(p.y,p.z):new T.Vector2(p.x,p.y));
    for(const [a,b,c] of T.ShapeUtils.triangulateShape(flat,[])){
      const cross=new T.Vector3().subVectors(ring[b!]!,ring[a!]!).cross(new T.Vector3().subVectors(ring[c!]!,ring[a!]!));
      const flip=(cross.dot(axis)<0)!==reverse;
      indices.push(start+a!,start+(flip?c!:b!),start+(flip?b!:c!));
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=true;return mesh;
}

export function jeskoRoundedShape(width:number,height:number,radius:number):T.Shape {
  const s=new T.Shape(),x=-width/2,y=-height/2;
  s.moveTo(x+radius,y);s.lineTo(x+width-radius,y);s.quadraticCurveTo(x+width,y,x+width,y+radius);
  s.lineTo(x+width,y+height-radius);s.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);
  s.lineTo(x+radius,y+height);s.quadraticCurveTo(x,y+height,x,y+height-radius);
  s.lineTo(x,y+radius);s.quadraticCurveTo(x,y,x+radius,y);return s;
}
