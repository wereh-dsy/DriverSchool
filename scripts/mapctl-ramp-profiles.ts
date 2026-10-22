import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {CityEditingKernel} from '../src/editor/CityEditingKernel';
import {diagnoseRampProfiles,rampProfile} from '../src/editor/RampProfileAudit';
export function runRampProfileCommand(c:{command:string;kernel:CityEditingKernel;request:any;flags:Map<string,string>;source:string;digest:string;output:(v:unknown)=>void}){
  if(!['diagnose-ramps','diagnose-grade-branches','inspect-ramp-profile'].includes(c.command))return false;
  const {command,kernel,request,flags,source,digest,output}=c;
  if(flags.has('out')&&resolve(flags.get('out')!).toLowerCase()===source.toLowerCase())throw new Error('Read-only output cannot overwrite source');
  if(command==='inspect-ramp-profile'){
    const road=kernel.data.roads.find(r=>r.id===request?.roadId);if(!road)throw new Error('Unknown road');const row=rampProfile(road);if(flags.has('out'))writeFileSync(flags.get('out')!,JSON.stringify(row,null,2)+'\n');output(row);return true;
  }
  const report={...diagnoseRampProfiles(kernel.data),mapDigest:digest};
  if(flags.has('out'))writeFileSync(flags.get('out')!,JSON.stringify(report,null,2)+'\n');
  output({coverage:report.coverage,mapVersion:report.mapVersion,categories:Object.fromEntries(['A','B','C','D'].map(k=>[k,report.inventory.filter(r=>r.category===k).length])),reviewCues:report.inventory.filter(r=>r.reviewCues.length).length,detailsFile:flags.get('out')});return true;
}
