import fs from 'node:fs';
const runtime=JSON.parse(fs.readFileSync('artifacts/performance-preload/runtime-fixture.json'));
const map=runtime.map,stops=[];
function point(road,label,stationFraction=.5){
 const path=runtime.roadNetwork.segments.find(r=>r.id===road.id)?.centerline??road.centerline;
 const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.z-path[i].z)),length=lengths.reduce((a,b)=>a+b,0);let station=length*stationFraction;
 for(let i=1;i<path.length;i++){const segment=lengths[i-1];if(station>segment){station-=segment;continue;}const a=path[i-1],b=path[i],t=station/segment,direction=road.travelDirection==='reverse'?-1:1,tx=(b.x-a.x)/segment,tz=(b.z-a.z)/segment,offset=(road.laneCount-1)*road.laneWidth/2*direction;
  return{id:label,roadId:road.id,x:a.x+(b.x-a.x)*t-tz*offset,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t+tx*offset,yaw:Math.atan2(-tx*direction,-tz*direction)};}
 throw Error('No valid authored point '+road.id);
}
const tunnel=map.roads.find(r=>r.id==='urban-rail-underpass:underpass');
const bridge=map.roads.find(r=>r.id==='ew-wb-split')??map.roads.find(r=>r.elevationMode==='elevated');
const junction=map.intersections.find(j=>j.channelized&&j.connections.length>=4)??map.intersections.find(j=>j.type==='irregular'&&j.connections.length>=4);
if(!tunnel||!bridge||!junction)throw Error('Existing structure fixtures unavailable');
stops.push(point(tunnel,'underpass'),point(bridge,'elevated'));
const connection=junction.connections[0],road=map.roads.find(r=>r.id===connection.roadId);
stops.push({...point(road,'complex-junction',connection.end==='start'?.15:.85),junctionId:junction.id});
const spawn=JSON.parse(fs.readFileSync('artifacts/performance-preload/route.json')).spawn;
stops.push({id:'city-return',x:spawn.position.x,y:spawn.position.y,z:spawn.position.z,yaw:spawn.rotation});
fs.writeFileSync('artifacts/runtime-v2-phase2/tour.json',JSON.stringify(stops,null,2));console.log(stops);
