import * as T from 'three';
import type { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import type { VehicleVisualConfig } from '../src/vehicle/visual/VehicleVisualConfig';
// Geometric visibility checks use the same eye, camera and meshes as gameplay.
// A centre ray alone misses a wheel cutting across the top half of a display.
export function checkJeskoCockpit(visual:VehicleVisual,config:VehicleVisualConfig){
  const camera=new T.PerspectiveCamera();
  const face=visual.root.getObjectByName('Jesko digital instrument face') as T.Mesh;
  const targets=[face,visual.root.getObjectByName('Jesko portrait control screen'),
    ...['centre','left','right'].map(n=>visual.root.getObjectByName('Jesko '+n+' oval vent honeycomb core'))] as T.Mesh[];
  const opaque:T.Mesh[]=[];visual.root.traverse(o=>{
    if(o instanceof T.Mesh&&o.visible){
      const materials=Array.isArray(o.material)?o.material:[o.material];
      if(materials.every(m=>!m.transparent))opaque.push(o);
    }
  });
  const ray=new T.Raycaster();ray.layers.enableAll();
  const rows:{part:string;steer:number;samples:number;blocked:number;offscreen:number;blockers:string[]}[]=[];
  camera.position.set(...config.driverEyePosition);camera.rotation.set(0,0,0);camera.fov=62;camera.aspect=4/3;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  for(const steer of [0,-.5,.5,-1.5,1.5]){
    visual.setSteeringWheelAngle(steer);visual.root.updateMatrixWorld(true);
    for(const target of steer===0?targets:[face]){
      target.geometry.computeBoundingBox();const bounds=target.geometry.boundingBox!;
      let samples=0,blocked=0,offscreen=0;const blockers=new Set<string>();
      for(let y=0;y<=8;y++)for(let x=0;x<=12;x++){
        const point=new T.Vector3(T.MathUtils.lerp(bounds.min.x+.003,bounds.max.x-.003,x/12),
          T.MathUtils.lerp(bounds.min.y+.003,bounds.max.y-.003,y/8),.0001).applyMatrix4(target.matrixWorld);
        const distance=point.distanceTo(camera.position);
        ray.set(point.clone().add(new T.Vector3(0,0,.1).transformDirection(target.matrixWorld)),new T.Vector3(0,0,-1).transformDirection(target.matrixWorld));ray.far=2;
        if(ray.intersectObject(target,false).length===0)continue;
        ray.set(camera.position,point.clone().sub(camera.position).normalize());ray.far=distance-.0005;
        const hits=ray.intersectObjects(opaque.filter(m=>m!==target),false);
        if(hits.length){blocked++;blockers.add(hits[0]!.object.name);}
        const p=point.project(camera);if(Math.abs(p.x)>1||Math.abs(p.y)>1||p.z<0||p.z>1)offscreen++;
        samples++;
      }
      rows.push({part:target.name,steer,samples,blocked,offscreen,blockers:[...blockers]});
    }
  }
  const failures:string[]=[];
  for(const row of rows){
    if(row.part==='Jesko digital instrument face'&&(row.blocked||row.offscreen))
      failures.push('Main display at '+row.steer+' rad: '+row.blocked+' blocked, '+row.offscreen+' outside neutral 4:3 camera');
    if(row.part.includes('honeycomb')&&row.blockers.some(n=>/dashboard|centre spine|portrait control/.test(n)))
      failures.push(row.part+' intersects a fascia/display sightline: '+row.blockers.join(', '));
  }
  if(visual.root.getObjectByName('Jesko SmartWheel icon texture'))failures.push('Wheel button texture was not removed');
  const badge=visual.root.getObjectByName('Jesko passenger embroidered panel') as T.Mesh;
  const points=badge.geometry.getAttribute('position');
  for(let n=0;n<points.count;n++)if(points.getZ(n)>-.50)failures.push('Passenger badge has an unprojected vertex '+n);
  visual.setSteeringWheelAngle(0);visual.root.updateMatrixWorld(true);
  const configured=new T.Vector3(...config.instrumentClusterTransform.position);
  if(face.getWorldPosition(new T.Vector3()).distanceTo(configured)>.00001)failures.push('Configured main screen pose differs from its actual mounting');
  return {eye:config.driverEyePosition,rows,failures};
}