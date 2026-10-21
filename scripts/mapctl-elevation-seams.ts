import { readFileSync,writeFileSync,renameSync,existsSync,unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CityEditingKernel } from '../src/editor/CityEditingKernel';
import { diagnoseElevationSeams,type SeamScope } from '../src/editor/ElevationSeams';
import {clusterElevationSeams,diagnoseJunctionElevationSeams} from '../src/editor/ElevationSeamClusters';
import { assertReceipt,makeReceipt } from './mapctl-support';

export async function runElevationSeamCommand(c:{command:string;kernel:CityEditingKernel;request:any;flags:Map<string,string>;source:string;raw:string;digest:string;output:(v:unknown)=>void}):Promise<boolean>{
  const {command,kernel,request,flags,source,raw,digest,output}=c;
  if(!['diagnose-elevation-seams','repair-elevation-seams'].includes(command))return false;
  const scope:SeamScope={bbox:request?.bbox??(request?.center?{minX:request.center.x-(request.radius??100),maxX:request.center.x+(request.radius??100),minZ:request.center.z-(request.radius??100),maxZ:request.center.z+(request.radius??100)}:undefined),roadId:request?.roadId,minHeightDelta:flags.has('height-threshold')?Number(flags.get('height-threshold')):request?.minHeightDelta};
  const diagnosis={...diagnoseElevationSeams(kernel.data,scope),mapDigest:digest};
  const saveReport=(value:unknown)=>{if(flags.has('out')){const path=resolve(flags.get('out')!);if(path.toLowerCase()===source.toLowerCase())throw new Error('Report cannot overwrite source map');writeFileSync(path,JSON.stringify(value,null,2)+'\n');}};
  if(command==='diagnose-elevation-seams'){
    const offset=request?.offset??0,limit=request?.limit??50;
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<0)throw new Error('Seam pagination requires nonnegative integer offset/limit');
    if(flags.has('clusters')){
      const junction=diagnoseJunctionElevationSeams(kernel.data,scope.minHeightDelta??diagnosis.limits.height,scope),clusters=clusterElevationSeams([...diagnosis.issues,...junction.issues]);
      const report={...diagnosis,junction,clusters,clusterCount:clusters.length};saveReport(report);
      output({...diagnosis,issues:[],junctionCoverage:junction.coverage,clusterCount:clusters.length,clusters:clusters.slice(offset,offset+limit),detailsFile:flags.get('out')});
    }else{saveReport(diagnosis);output({...diagnosis,issues:diagnosis.issues.slice(offset,offset+limit),pagination:{offset,limit,total:diagnosis.issues.length},detailsFile:flags.get('out')});}return true;
  }
  if(flags.get('safe-only')!=='true')throw new Error('repair-elevation-seams requires --safe-only; review complex candidates individually with kernel preview/apply');
  assertReceipt(request,digest);
  const selected=diagnosis.issues.filter(s=>s.category==='SAFE_AUTO_FIX'&&s.repair&&(!request?.ids||request.ids.includes(s.id)));
  const occupied=new Set<string>(),operations=selected.flatMap(s=>{
    const op=s.repair!;if(op.op!=='adjustElevationSeam')return [];
    const keys=op.elevations.flatMap(e=>[-1,0,1].map(d=>op.id+':'+(e.index+d)));
    if(keys.some(k=>occupied.has(k)))return [];keys.forEach(k=>occupied.add(k));return [op];
  });
  if(!operations.length){const result={valid:true,applied:0,diagnosis:diagnosis.counts,operations:[],message:'No eligible isolated safe fixes; complex candidates require local review'};saveReport(result);output(result);return true;}
  const before=kernel.data,summary=kernel.preview(operations,'Repair isolated elevation seams'),receipt=makeReceipt(kernel,summary,operations,digest),after=kernel.previewSnapshot(summary.id);
  // Exact structural equality, including all objects/signals and endpoint XYZ.
  const invariant=(map:typeof before)=>JSON.stringify({...map,version:0,roads:map.roads.map(r=>({...r,centerline:r.centerline.map(p=>({x:p.x,z:p.z}))}))});
  if(invariant(before)!==invariant(after))throw new Error('Safe seam repair changed fields beyond Y/version');
  const followup=diagnoseElevationSeams(after,scope);
  const result={...receipt,diagnosisBefore:diagnosis.counts,diagnosisAfter:followup.counts,applied:0};
  if(!summary.valid)throw new Error('Local validation rejected seam repair');
  for(const seam of selected.filter(s=>operations.includes(s.repair as typeof operations[number]))){
    const remaining=followup.issues.filter(s=>s.category!=='IGNORE_GRADE_SEPARATED'&&s.roadIds.includes(seam.roadIds[0])&&s.bbox.minX<=seam.bbox.maxX&&s.bbox.maxX>=seam.bbox.minX&&s.bbox.minZ<=seam.bbox.maxZ&&s.bbox.maxZ>=seam.bbox.minZ);
    if(remaining.some(s=>s.maxHeightDelta>seam.maxHeightDelta+.001||s.gradeDiscontinuity>seam.gradeDiscontinuity+.002))throw new Error('Repair worsens local seam metrics');
  }
  if(flags.get('apply')==='true'){
    if(readFileSync(source,'utf8')!==raw)throw new Error('Map changed during seam preview');kernel.commit(summary.id);
    const authored=JSON.parse(raw.replace(/^\uFEFF/,''));
    // loadCityMap may normalize optional metadata. Persist only the reviewed Y
    // values into authored input, so this command cannot incidentally normalize it.
    for(const op of operations){const road=authored.roads.find((r:{id:string})=>r.id===op.id);for(const e of op.elevations)road.centerline[e.index].y=e.after;}
    authored.version=kernel.data.version;
    const temporary=source+'.tmp-'+process.pid;
    try{writeFileSync(temporary,JSON.stringify(authored)+'\n');renameSync(temporary,source);}finally{if(existsSync(temporary))unlinkSync(temporary);}
    result.applied=operations.length;
  }
  saveReport(result);output(result);return true;
}
