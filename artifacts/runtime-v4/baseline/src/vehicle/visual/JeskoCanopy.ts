import * as T from 'three';

/** Shared bonded-glass surface: transverse wrap plus a modest vertical crown.
 * All frames sample this surface; cabin trim cannot drift off the outer shell. */
export function jeskoWindshieldPoint(u:number,v:number):T.Vector3 {
  return new T.Vector3(u*T.MathUtils.lerp(.73,.55,v),
    T.MathUtils.lerp(.71,1.16,v)+.012*(1-u*u)*Math.sin(Math.PI*v),
    T.MathUtils.lerp(-1.06,-.40,v)+u*u*T.MathUtils.lerp(.18,.055,v)
      -.040*Math.sin(Math.PI*v)*(1-.45*u*u));
}
export function jeskoWindshieldGeometry():T.BufferGeometry {
  const p:number[]=[],uv:number[]=[],indices:number[]=[],nx=32,ny=12;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    p.push(...jeskoWindshieldPoint(i/nx*2-1,j/ny).toArray());uv.push(i/nx,j/ny);
  }
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+2,a,a+nx+2,a+nx+1);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function jeskoCanopyRail(name:string,sample:(t:number)=>T.Vector3,radius:number,material:T.Material,segments=20):T.Mesh {
  const curve=new T.CatmullRomCurve3(Array.from({length:segments+1},(_,i)=>sample(i/segments)),false,'centripetal');
  const m=new T.Mesh(new T.TubeGeometry(curve,segments,radius,6,false),material);
  m.name=name;m.castShadow=true;m.receiveShadow=true;return m;
}
export function addJeskoInteriorCanopy(root:T.Group,material:T.Material,sealMaterial:T.Material=material):void{
  for(const sign of [-1,1])root.add(jeskoCanopyRail(sign<0?'Left A-pillar':'Right A-pillar',
    t=>jeskoWindshieldPoint(sign,t).add(new T.Vector3(-sign*.012,0,.012)),.016,material));
  root.add(jeskoCanopyRail('Windshield header',t=>jeskoWindshieldPoint(t*2-1,1).add(new T.Vector3(0,-.004,.012)),.020,material,32));
  root.add(jeskoCanopyRail('Windshield lower bonded border',t=>jeskoWindshieldPoint(t*2-1,0).add(new T.Vector3(0,-.004,.006)),.012,sealMaterial,32));
  const lining=new T.Mesh(new T.BoxGeometry(1.04,.022,.68),material);lining.name='Cabin headliner';lining.position.set(0,1.126,.035);root.add(lining);
}