import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CityEditingKernel } from '../src/editor/CityEditingKernel';
import type { EditorCommand, EditSummary } from '../src/editor/EditorCommands';
import { MAP_REVIEW_LIMITS } from '../src/editor/MapAnalysis';

export const digestOperations=(operations:unknown)=>createHash('sha256').update(JSON.stringify(operations)).digest('hex');
export function makeReceipt(kernel:CityEditingKernel,summary:EditSummary,operations:EditorCommand|EditorCommand[],mapDigest:string){
  const affectedIds=[...new Set([...summary.created,...summary.modified,...summary.deleted])].sort();
  const entities=[...kernel.data.roads,...kernel.data.intersections,...kernel.data.objects,...kernel.data.signs??[]];
  return {schemaVersion:2,mapDigest,mapVersion:kernel.data.version,operationDigest:digestOperations(operations),operations,affectedIds,sourceState:entities.filter(e=>affectedIds.includes(e.id)),summary,diff:kernel.diffPreview(summary.id)};
}
export function assertReceipt(request:any,mapDigest:string):void {
  for(const receipt of [request,request?.diagnosis]){
    if((receipt?.summary||receipt?.issues||receipt?.affectedIds)&&!receipt.mapDigest)throw new Error('Receipt has no source digest; inspect/diagnose/preview again before applying');
    if(receipt?.mapDigest&&receipt.mapDigest!==mapDigest)throw new Error('Map changed since inspect/diagnose/preview; inspect, diagnose or preview again');
    if(receipt?.operationDigest&&receipt.operationDigest!==digestOperations(receipt.operations))throw new Error('Receipt operations changed; preview again');
  }
}
export function writeReviewPackage(directory:string,request:unknown,receipt:ReturnType<typeof makeReceipt>,review:ReturnType<CityEditingKernel['reviewPreview']>,validation:unknown,source:string){
  const root=resolve(directory),files:Record<string,unknown>={'request.json':request,'preview.json':receipt.summary,'receipt.json':receipt,'diff.json':review.diff,'diagnose-before.json':review.diagnosticsBefore,'diagnose-after.json':review.diagnosticsAfter,'issue-diff.json':review.issueDiff,'validate.json':validation};
  if(Object.keys(files).some(name=>resolve(root,name)===source)||resolve(root,'REPORT.md')===source)throw new Error('Review package cannot overwrite source');
  // Avoid silently replacing another task's review package.
  mkdirSync(root,{recursive:true});
  for(const [name,value] of Object.entries(files))writeFileSync(join(root,name),JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  const diff=review.diff;
  const report=`# Map review\n\n- Roads: +${diff.roads.added.length} / -${diff.roads.removed.length} / modified ${diff.roads.modified.length}\n- Objects: +${diff.objects.added.length} / -${diff.objects.removed.length} / modified ${diff.objects.modified.length}\n- Topology changed: ${diff.topology.changed}\n- Maximum horizontal displacement: ${diff.maxRoadDisplacement.toFixed(3)} m\n- Maximum vertical displacement: ${diff.maxElevationDelta.toFixed(3)} m\n- Issues: resolved ${review.issueDiff.resolved.length}, new ${review.issueDiff.new.length}, unchanged ${review.issueDiff.unchanged.length}\n- Validation: ${receipt.summary.valid?'valid':'invalid'} (local dependencies)\n- Navigation: ${diff.topology.scope}; components delta ${diff.topology.componentDelta}; new dead ends ${diff.topology.newDeadEnds.length}; logical directed lane connections checked; no driving simulation\n- Approximate envelopes and visibility reviewRequired must be reviewed by an agent/human.\n- Build is not executed by mapctl. Source map is unchanged.\n`;
  writeFileSync(join(root,'REPORT.md'),report,{encoding:'utf8',flag:'wx'});return {directory:root,files:[...Object.keys(files),'REPORT.md']};
}
export const MAPCTL_HELP={
  schemaVersion:2,usage:'node scripts/mapctl.mjs <command> <map.json|regional-main|editor-test> --request @request.json [--out result.json]',
  commands:{
    'diagnose-ramps':{readOnly:true,output:'--out report.json; topology, full profiles and paved-footprint clearance for all A/B/C/D candidates'},
    'diagnose-grade-branches':{readOnly:true,output:'Same complete inventory, including unnamed elevation branches'},
    'inspect-ramp-profile':{readOnly:true,flags:'--road id --out profile.json; includes all nodes, grade/curvature metrics'},
    'diagnose-elevation-seams':{scope:'whole map by default; --road, --bbox or --near x,z --radius metres',flags:'--height-threshold 0.02 --clusters includes junction ownership boundaries and category-independent connected runs',output:'--out full-report.json; stdout paginated',readOnly:true},
    'repair-elevation-seams':{required:'--safe-only',behavior:'isolated interior Y fixes only; preview/semantic diff/local validation; --apply explicitly writes; --out saves receipt'},
    inspect:{kinds:['profile','geometry','ramp','object','structure','region','issue'],examples:[{kind:'profile',roadId:'road-id',step:10},{kind:'object',objectId:'object-id'},{kind:'region',center:{x:0,z:0},radius:300}]},
    query:{kinds:['road','corridor','corridors','group','sign','signs','intersection','connected','objects','accessWindows','diagnosis'],examples:[{kind:'objects',roadId:'road-id',radius:30,limit:100,offset:0},{kind:'accessWindows',mainline:'main-id',frontage:'frontage-id',start:0,end:1000,minLength:100,buffer:80}]},
    diagnose:{domains:['legacy (default)','profile','ramps','objects','structures','all'],scope:'roadId | intersectionId | corridorId | objectId | bbox | center+radius | full:true',filters:['codes (prefix[])','minSeverity','limit','offset']},
    preview:{request:{operations:[{op:'moveObject',id:'tree-id',delta:{x:0,y:0,z:2}}]},readOnly:true},
    repair:{request:'legacy diagnosis receipt, {diagnosis}, {operations}, or {domain,scope}; preview by default; --apply is explicit'},
    brush:{request:'PlacementBrushRequest; preview only unless --apply; also available as {op:"brushObjects",brush:request} in any transaction'},
    apply:{request:'@receipt.json; source digest, operation digest, affected ids and source bytes checked before atomic rename'},
    validate:{request:'local roadId/intersectionId/objectId/corridorId/bbox; --full is explicit'},
    review:{request:'@receipt.json',packageFlag:'--package artifacts/unique-task-directory',readOnly:true},
    diff:{syntax:'diff <before.json> --after <after.json> [--full]',readOnly:true},
  },
  operations:{
    adjustElevationSeam:{id:'road id',elevations:[{index:3,before:.12,after:.10}],contract:'custom polyline, interior Y only, stale-value and grade guards; keeps all other fields'},
    repairPavementProfile:{id:'road id',profile:[{station:0,before:0,after:0},{station:30,before:.1,after:.08},{station:60,before:0,after:0}],contract:'reviewed vertical stations on the original XZ polyline; preserves original nodes; endpoint edits require complete explicit ownership'},
    setJunctionLanding:{id:'junction id',contract:'reviewed local pavement ownership (8m approach reach) for a ground landing beside graded roads'},
    setPavementSurface:{id:'road id',surface:'ribbon',contract:'use existing visual pavement triangles for confirmed graded-bend contact seams'},
    moveObject:{id:'editable id',delta:{x:0,y:0,z:1}},rotateObject:{id:'editable id',rotation:'radians'},removeObject:{id:'authored prefab/sign id'},
    reanchorObject:{id:'editable id',roadId:'optional',station:'optional metres',lateralOffset:'signed metres',verticalOffset:'metres',strategy:['reanchorRoadside','reanchorToApproach','moveOppositeSide','fixFacing','moveToRoadside','moveOutsideCarriageway','moveOutward']},
    repairElevation:{id:'road/corridor id',start:'metres',end:'metres',strategy:['smoothLocalExtremum','smoothWave','smoothGradeBreak','fitBetweenConstraints'],anchors:[{station:100,elevation:'optional existing elevation'}],maxGrade:.08},
    repairRamp:{id:'ramp id',start:'optional metres',end:'optional metres',strategy:'same profile strategies'},
    brushObjects:{brush:{mode:['SINGLE','LINE','RANGE','AREA','REPLACE','REPAIR'],type:'existing prefab id | roadSign | trafficLight',roadId:'id',intersectionId:'signal anchor',approaches:['north'],stationStart:100,stationEnd:800,spacing:32,density:.002,side:['left','right','both'],lateralOffset:2,heightMode:['GROUND','ROAD_SURFACE','ROAD_DECK','SIDEWALK','STRUCTURE_DECK','ABSOLUTE','RELATIVE'],heightOffset:.15,orientation:['ROAD_FORWARD','ROAD_BACKWARD','FACE_TRAFFIC','FACE_ROAD','FACE_INTERSECTION','NORMAL_TO_ROAD','ABSOLUTE'],arrangement:['ALIGNED','STAGGERED'],autoAdjust:['STRICT','SKIP','ADJUST'],maxAutoMove:5,seed:42,randomPositionJitter:0,randomRotationJitter:0,randomScaleJitter:0,minDistanceToIntersection:20,minDistanceToRamp:10,minDistanceToObject:2,snapMode:['roadside','none'],pitch:0,roll:0}},
  },
  limitations:['approximate envelopes are marked; visibility/shell finish returns reviewRequired','generated signals have stable signal:<intersection>:<port> ids and persist as approach overrides','pitch/roll unsupported by current object schema and rejected if nonzero','logical directed lane reachability is checked; physical traffic/driving simulation is not performed'],thresholds:MAP_REVIEW_LIMITS,
};
