import type { CityRoad } from '../CityMapData';
import { newCityMap } from '../CityMapData';
import { CITY_CLEARANCE_REPAIR_ROADS, cityGeometryRepairCandidate } from './CityGeometryRepair';
import mouthRepairs from '../../../../artifacts/city-geometry-review-2026-10-13/ramp-mouth-repairs.json';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Exact replacement expectations for the audited geometry repair. This does
 * not accept arbitrary height changes or relax frozen infrastructure checks. */
export function matchesApprovedCityGeometry(before:CityRoad,after:CityRoad,baselineRoads:CityRoad[]):boolean{
  if(CITY_CLEARANCE_REPAIR_ROADS.includes(before.id as typeof CITY_CLEARANCE_REPAIR_ROADS[number])){
    const fixture=newCityMap();fixture.roads=baselineRoads.filter(r=>CITY_CLEARANCE_REPAIR_ROADS.includes(r.id as typeof CITY_CLEARANCE_REPAIR_ROADS[number]));
    return same(after,cityGeometryRepairCandidate(fixture).roads.find(r=>r.id===before.id));
  }
  const repair=mouthRepairs.plans.find(p=>p.id===before.id);if(!repair)return same(before,after);
  if(before.centerline.length!==repair.before.length||after.centerline.length!==repair.after.length)return false;
  if(!same({...before,centerline:[]},{...after,centerline:[]}))return false;
  return before.centerline.every((p,i)=>same({...p,y:repair.after[i]},after.centerline[i])&&Math.abs((p.y??0)-repair.before[i]!)<1e-7)&&repair.maxGrade<=.120001&&repair.before[0]===repair.after[0]&&repair.before.at(-1)===repair.after.at(-1);
}
