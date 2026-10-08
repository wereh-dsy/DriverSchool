import { writeFileSync } from 'node:fs';
import { newCityMap, createRoad, connectRoads, placePreset, saveMap } from '../src/world/city/MapAPI';
import { PRESET_CATALOG } from '../src/world/city/presets/InfrastructurePresets';
import { polylineLength, roadPoints, sampleAt } from '../src/world/city/geometry';
import { validatePresetGeometry } from '../src/world/city/presets/PresetGeometryValidation';

const map = newCityMap();
map.id='preset-showcase';map.name='Preset Showcase';
map.bounds={minX:-1700,maxX:11900,minZ:-1700,maxZ:11900};
map.environment={districts:[],spawnPoints:[{id:'placeholder',position:{x:0,y:0,z:0},rotation:0}],metadata:{purpose:'Development driving inspection; isolated production fixtures',productionGeometry:'true'}};
for (const [i,preset] of PRESET_CATALOG.filter(p=>p.production).entries()) {
  const position={x:(i%4)*3400,y:0,z:Math.floor(i/4)*3400};
  const stamp=placePreset(map,preset.id,{position,groupId:preset.id});
  // Every upper external port gets a straight, eased ground access/egress road.
  for(const port of stamp.connectionPorts) {
    const p=port.position!,source=stamp.roads.find(r=>r.id===port.endpoint.roadId)!;
    if((p.y??0)<2) continue;
    const dx=Math.sin(port.heading!),dz=-Math.cos(port.heading!),length=400;
    const points=Array.from({length:81},(_,n)=>{
      const t=n/80,blend=t*t*(3-2*t);
      return {x:p.x+dx*length*t,y:(p.y??0)*(1-blend),z:p.z+dz*length*t};
    });
    const input=port.endpoint.end==='start';
    const access=createRoad(map,{baseName:`${preset.id}-access`,styleId:'elevated_expressway_6',laneCount:source.laneCount,
      travelDirection:source.travelDirection,type:'highway',laneWidth:source.laneWidth,elevationMode:'custom',streetlights:false,
      centerline:input?points.reverse():points,structure:{barrierEnabled:true,piersEnabled:true,barrierOffset:0.25}});
    connectRoads(map,input?{roadId:access.id,end:'end'}:port.endpoint,input?port.endpoint:{roadId:access.id,end:'start'});
  }
  const incoming=stamp.connectionPorts.find(p=>{
    const r=stamp.roads.find(r=>r.id===p.endpoint.roadId)!;
    return r.travelDirection==='two-way'||(r.travelDirection==='forward')===(p.endpoint.end==='start');
  })!;
  const source=stamp.roads.find(r=>r.id===incoming.endpoint.roadId)!,pts=roadPoints(source),length=polylineLength(pts);
  const s=sampleAt(pts,incoming.endpoint.end==='start'?20:length-20);
  const offset=source.travelDirection==='two-way'?source.laneWidth/2:0;
  const forward=incoming.endpoint.end==='start'?1:-1;
  map.environment.spawnPoints.push({id:preset.id,position:{x:s.point.x-s.tangent.z*offset*forward,y:s.point.y,z:s.point.z+s.tangent.x*offset*forward},
    rotation:Math.atan2(-s.tangent.x*forward,-s.tangent.z*forward)});
}
map.environment.spawnPoints.shift();
const issues=validatePresetGeometry(map);
if(issues.length) throw new Error(JSON.stringify(issues));
writeFileSync('src/world/city/maps/preset-showcase.json',saveMap(map),'utf8');
console.log(JSON.stringify({id:map.id,presets:map.environment.spawnPoints.length,roads:map.roads.length,geometryErrors:issues.length}));
