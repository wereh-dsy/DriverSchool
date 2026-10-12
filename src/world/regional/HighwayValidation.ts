import type { CityMapData } from '../city/CityMapData';
import type { MapIssue } from '../city/CityMapValidation';

export function validateHighwayData(map:CityMapData):MapIssue[]{
  const system=map.regional?.highways;if(!system)return [];
  const issues:MapIssue[]=[],error=(path:string,message:string)=>issues.push({severity:'error',code:'highway.invalid',path:'regional.highways.'+path,message});
  if(system.version!==1||!Array.isArray(system.routes)||!Array.isArray(system.exits)||!Array.isArray(system.junctions)||!Array.isArray(system.services)){error('','Expected versioned route, exit, junction and service arrays.');return issues;}
  if([...system.routes,...system.exits,...system.junctions,...system.services].some(v=>!v||typeof v!=='object')){error('','Expected highway records.');return issues;}
  const roads=new Map(map.roads.map(r=>[r.id,r])),ids=new Set<string>(),routes=new Set(system.routes.map(r=>r.id));
  const roadIds=(list:unknown,path:string)=>{if(!Array.isArray(list)||!list.length||list.some(id=>typeof id!=='string'||!roads.has(id)))error(path,'Expected nonempty existing road references.');};
  const node=(id:string,name:string,position:{x:number;y?:number;z:number},path:string)=>{if(!id||ids.has(id)||!name)error(path,'Expected unique ID and nonempty name.');ids.add(id);if(!position||![position.x,position.y??0,position.z].every(Number.isFinite))error(path,'Expected a finite node position.');};
  system.routes.forEach((r,i)=>{const path=`routes[${i}]`;if(!r.id||ids.has(r.id)||!r.name||!['national','provincial','connector'].includes(r.type)||!r.direction?.forward||!r.direction.reverse||!/^G\d{2,4}$|^S\d{2}$/.test(r.number))error(path,'Expected unique route, number, type and two directions.');ids.add(r.id);if(map.roadNames?.[r.id]?.routeNumber!==r.number)error(path,'Display number must agree with sign registry.');roadIds(r.roadIds,path);});
  system.exits.forEach((e,i)=>{const path=`exits[${i}]`;node(e.id,e.name,e.position,path);roadIds(e.roadIds,path);if(!routes.has(e.highway)||!e.exitNumber||!Array.isArray(e.destinations)||!e.destinations.length||e.destinations.some(d=>!d))error(path,'Expected highway, exit number and destinations.');});
  system.junctions.forEach((j,i)=>{const path=`junctions[${i}]`;node(j.id,j.name,j.position,path);roadIds(j.roadIds,path);if(!['interchange','continuation'].includes(j.kind)||!Array.isArray(j.connectedRoutes)||j.connectedRoutes.length<2||j.connectedRoutes.some(id=>!routes.has(id)||!j.directions?.[id]?.forward||!j.directions[id]!.reverse))error(path,'Expected junction kind, connected routes and matching directions.');});
  system.services.forEach((s,i)=>{const path=`services[${i}]`;node(s.id,s.name,s.position,path);roadIds(s.roadIds,path);if(!routes.has(s.highway)||!Array.isArray(s.facilities)||!s.facilities.length||s.facilities.some(f=>!['parking','fuel','charging','food','toilet'].includes(f)))error(path,'Expected highway and known facilities.');});
  if(Number(map.environment.metadata?.highwayNetworkRevision)>=2){
    const numbers=new Set<string>();
    system.routes.forEach((r,i)=>{if(numbers.has(r.number))error(`routes[${i}]`,'Duplicate displayed highway number.');numbers.add(r.number);
      if(r.number.startsWith('S')&&Number(r.number.slice(1))>40)error(`routes[${i}]`,'Provincial highways must use numbers at or below 40.');
      if(!['trunk','orbital','connector','branch'].includes(r.role??'')||!r.termini?.start||!r.termini.end)error(`routes[${i}]`,'Revision 2 requires network roles and explained termini.');
      if(r.roadIds.some(id=>roads.get(id)?.roadNameId!==r.id))error(`routes[${i}]`,'Mainline ownership disagrees with route registry.');
    });
  }
  return issues;
}
