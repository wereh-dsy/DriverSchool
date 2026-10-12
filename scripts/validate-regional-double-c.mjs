import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {validatePresetGeometry} from './src/world/city/presets/PresetGeometryValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
 const {validatePresetGeometry}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const current=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));
 const baseline=JSON.parse(fs.readFileSync('artifacts/highway-system/v2-baseline.json','utf8'));
 const baselineRoads=new Map(baseline.roads.map(r=>[r.id,JSON.stringify(r)]));
 const changed=new Set(current.roads.filter(r=>JSON.stringify(r)!==baselineRoads.get(r.id)).map(r=>r.id));
 // Preserve the full road/junction context, but inspect only changed roads.
 // Untouched city roads provide clearance/branch context and are never retested.
 const baselineTargets=new Set(baseline.roads.filter(r=>r.id.startsWith('regional:')).map(r=>r.id));
 const context=map=>({...map,signs:[],objects:map.objects.filter(o=>o.id.startsWith('regional:extension-tree:'))});
 const oldIssues=validatePresetGeometry(context(baseline),baselineTargets);
 const normalize=s=>s.replace(/:revision\d+|:lane\d+/g,'');
 const key=i=>i.code+' '+normalize(i.path)+' '+normalize(i.message);
 const known=new Set(oldIssues.map(key));
 const all=validatePresetGeometry(context(current),changed);
 const inherited=all.filter(i=>known.has(key(i))),issues=all.filter(i=>!known.has(key(i)));
 const report={passed:issues.length===0,changedRoads:changed.size,baselineIssues:oldIssues,inheritedIssues:inherited,issues};
 fs.writeFileSync('artifacts/highway-system/v3-geometry.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,changedRoads:changed.size,baselineIssues:oldIssues.length,inheritedIssues:inherited.length,issues},null,2));
 if(issues.length)process.exitCode=1;
} catch(e) {console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<double-c-geometry>'));process.exitCode=1;}
