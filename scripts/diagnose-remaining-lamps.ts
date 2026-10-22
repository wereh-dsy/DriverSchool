import fs from 'node:fs';
import {regionalTerrainSampler} from '../src/world/regional/RegionalTerrain';
import {roadPoints,roadEdges} from '../src/world/city/geometry';
import {project} from '../src/editor/EditorGeometry';
const map=JSON.parse(fs.readFileSync('artifacts/interchange-integrated-audit/surface-candidate-map.json','utf8'));
for(const id of ['v6-lamps-575','v61-road-lamp-36','regional:hewan:lamp:1:65','regional:hewan:lamp:-1:-65']){const o=map.objects.find((o:any)=>o.id===id),owners=map.roads.map((r:any)=>({road:r,hit:project(roadPoints(r),o.position)})).sort((a:any,b:any)=>a.hit.distance-b.hit.distance).slice(0,5).map((v:any)=>({id:v.road.id,distance:v.hit.distance,station:v.hit.along,y:v.hit.point.y,width:v.road.laneCount*v.road.laneWidth,armDot:(-(v.hit.point.x-o.position.x)*Math.sin(o.rotation)-(v.hit.point.z-o.position.z)*Math.cos(o.rotation))/v.hit.distance}));console.log(JSON.stringify({id,terrain:regionalTerrainSampler(map).heightAt(o.position.x,o.position.z),baseY:o.position.y,owners}));}
