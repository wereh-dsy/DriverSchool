import * as T from 'three';
import {surfaceGrid,surfaceRounded} from './SurfaceVehicleGeometry';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Vector3Tuple as P} from './VehicleVisualConfig';

export function su7DriverPodLift(x:number,z:number):number {
  const along=T.MathUtils.clamp((z+.955)/.405,0,1);
  return .12*Math.exp(-(((x+.40)/.29)**4))*Math.sin(along*Math.PI)**2;
}

/** Adjacent dashboard skins share their boundary curves instead of overlapping capsules. */
export function su7DashboardSurface(name:string,profile:T.Curve<T.Vector3>,material:T.Material,driverPod=false):T.Mesh {
  return surfaceGrid(name,24,16,(u,v)=>{
    const x=T.MathUtils.lerp(-.85,.85,u),p=profile.getPoint(1-v),edge=(Math.abs(x)/.85)**8;
    return [x,p.y-.010*edge+(driverPod?su7DriverPodLift(x,p.z):0),p.z-.014*edge];
  },material);
}

/** A shallow bevel gives upholstery and metal their own grazing highlights. */
export function su7PaddedPanel(name:string,size:P,position:P,material:T.Material,radius=.03):T.Mesh {
  const mesh=surfaceRounded(name,size,position,material,radius);
  const old=mesh.geometry,shape=(old as T.ExtrudeGeometry).parameters.shapes;
  mesh.geometry=new T.ExtrudeGeometry(shape,{depth:Math.max(.002,size[2]-.012),bevelEnabled:true,
    bevelThickness:.006,bevelSize:.004,bevelSegments:2,curveSegments:6});
  mesh.geometry.translate(0,0,-Math.max(.002,size[2]-.012)/2);
  const p=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/size[0]+.5,p.getY(i)/size[1]+.5);
  const raw=mesh.geometry;raw.deleteAttribute('normal');mesh.geometry=mergeVertices(raw,1e-5);mesh.geometry.computeVertexNormals();raw.dispose();
  // Sub-centimetre bevels cannot be resolved by the outdoor shadow map.
  mesh.castShadow=false;old.dispose();return mesh;
}

/** Surface-bound light-guide diffusion. One shared 1D profile, no bloom pass or lights. */
export function su7LightGuideMaterial(color:number):T.MeshBasicMaterial {
  const pixels=new Uint8Array(64*4);
  for(let i=0;i<64;i++){
    const v=(i+.5)/32-1,a=.83*Math.exp(-((v/.085)**2))+.17*Math.exp(-((v/.48)**2));
    pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=255;pixels[i*4+3]=Math.round(a*255);
  }
  const map=new T.DataTexture(pixels,1,64);map.name='SU7 light-guide diffusion';
  map.magFilter=map.minFilter=T.LinearFilter;map.needsUpdate=true;
  return new T.MeshBasicMaterial({color,map,transparent:true,opacity:0,depthWrite:false,
    side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false});
}

export function su7LightGuide(name:string,points:readonly P[],width:number,material:T.Material,across:P=[0,1,0]):T.Mesh {
  const mesh=surfaceGrid(name,points.length-1,1,(u,v)=>{
    const p=points[Math.round(u*(points.length-1))]!;
    return [p[0]+across[0]*(v-.5)*width,p[1]+across[1]*(v-.5)*width,p[2]+across[2]*(v-.5)*width];
  },material);
  // surfaceGrid's default V runs along the path. The optical profile runs ACROSS it.
  const uv=mesh.geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++){const across=uv.getX(i),along=1-uv.getY(i);uv.setXY(i,along,across);}
  mesh.castShadow=mesh.receiveShadow=false;mesh.renderOrder=2;return mesh;
}
