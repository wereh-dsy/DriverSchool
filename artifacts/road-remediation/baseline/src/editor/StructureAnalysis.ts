import { roadEdges, polylineLength } from '../world/city/geometry';
import { regionalTerrainSampler } from '../world/regional/RegionalTerrain';
import { issue, MapAnalysisContext, structureType, type MapIssue } from './MapAnalysis';
import { queryObjects } from './ObjectAnalysis';

export function inspectStructure(context:MapAnalysisContext,id:string){
  const road=context.road(id),path=context.path(id),kind=structureType(road),enclosure=road.structure?.enclosure,terrain=context.map.regional?regionalTerrainSampler(context.map):undefined;
  const deck=path.map(p=>({xyz:p,deckElevation:p.y??0,groundElevation:terrain?.heightAt(p.x,p.z)??0}));
  return {roadId:id,type:kind,approximate:true,deckThickness:context.limits.deckThickness,deck,span:{start:0,end:polylineLength(path)},enclosure:enclosure??null,clearance:enclosure?.clearance??null,
    portals:enclosure&&enclosure.kind!=='cutting'?[{end:'start',position:path[0],derived:true},{end:'end',position:path.at(-1),derived:true}]:[],
    ceilingCoverage:enclosure&&enclosure.kind!=='cutting'?{derived:true,source:'RoadBuilder enclosure strip',completeByConstruction:true,meshContinuityVerified:false}:null,
    nearbyUpperLowerRoads:[...context.crossings(id),...context.overUnderRoads(id)],nearbyObjects:queryObjects(context,{roadId:id,radius:Math.max(-roadEdges(road).left,roadEdges(road).right)+20,limit:100}).objects,
    reviewRequired:kind==='depressed'&&!enclosure,reviewReason:kind==='depressed'&&!enclosure?'Negative road elevation has no authored enclosure; cover/portal intent needs review':null,envelope:context.envelope(id)};
}
export function structureIssues(context:MapAnalysisContext,id:string):MapIssue[]{
  const road=context.road(id),kind=structureType(road),enclosure=road.structure?.enclosure,result:MapIssue[]=[];
  if(kind==='depressed'&&!enclosure)result.push(issue('structure.missingPortal',{roadId:id},'Depressed road has no authored enclosure/portal intent',{}, {reviewRequired:true,approximate:true}));
  if(enclosure&&enclosure.kind!=='cutting'&&enclosure.clearance<context.limits.clearance)result.push(issue('structure.insufficientVerticalEnvelope',{roadId:id},'Enclosed floor-to-ceiling clearance is below review threshold',{actual:enclosure.clearance,required:context.limits.clearance}));
  if(enclosure&&enclosure.kind!=='cutting')result.push(issue('structure.shellReviewRequired',{roadId:id},'Ceiling is runtime derived; shell continuity and portal finish require visual review',{clearance:enclosure.clearance},{severity:'info',reviewRequired:true,approximate:true}));
  for(const crossing of context.crossings(id))if(!crossing.connected&&crossing.clearance<context.limits.clearance&&Math.abs((crossing.point.y??0)-crossing.otherY)>.5)result.push(issue('structure.insufficientVerticalEnvelope',{roadId:id,station:crossing.station},'Crossing deck clearance is below threshold',{otherRoadId:crossing.roadId,actual:crossing.clearance,required:crossing.requiredClearance}));
  return result;
}
