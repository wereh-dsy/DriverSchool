import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const dir='artifacts/v488-reapply-and-g17-fix/';
// Reuse the previously validated local four-wheel replay, without changing its
// contact adapter, chassis integration, collider set, or prescribed-speed rule.
let source=fs.readFileSync('scripts/run-v488-rollback-regression.ts','utf8');
source=source.slice(0,source.indexOf('const bbNames='));
source=source.replace("const dir='artifacts/v488-full-rollback/'",`const dir='${dir}g17/'`);
source=source.replace('const ground=local(options.x,options.z,options.y),config=', 'const ground=sharedGround,config=');
source=source.replace('}finally{ground.dispose();}', '}finally{/* The shared immutable map is disposed after the final short case. */}');
source=source.replace('seam17to18,minGrounded,', 'seam17to18,coveredSegments:Object.fromEntries(WHEEL_IDS.map(id=>[id,[...seen[id]]])),minGrounded,');
source=source.replace("console.log(JSON.stringify({...row,samples:undefined,seams:seams.filter(s=>s.from===17&&s.to===18)}))", "console.log(JSON.stringify({name,passed:row.passed,rejection,airborneTicks,peakImpulse}))");
source=source.replace('box.arm();adapter.blackBox=box;', "if(name.startsWith('fixture-')){box.arm();adapter.blackBox=box;}");
source=source.replace("box.requestManualTrigger();adapter.step(dt,controls,car);box.freezeInterrupted('pure v486 rollback short regression');const trace=box.createExport();save(name+'-blackbox.json',trace);", "if(name.startsWith('fixture-')){box.requestManualTrigger();adapter.step(dt,controls,car);box.freezeInterrupted('G17 same-layer continuation regression');save(name+'-blackbox.json',box.createExport());}");
fs.mkdirSync(dir+'g17/',{recursive:true});
source+=`
const sharedGround=local(3425,-340,0),rows:any[]=[];
try {
 const evidence=JSON.parse(fs.readFileSync('artifacts/v488-full-rollback/input-blackbox-evidence.json','utf8'));
 for(const [i,b]of evidence.entries())rows.push(drive('fixture-'+(i+1),{x:3410,z:b.pose.z,y:0,yaw:b.pose.yaw,speed:b.pose.speedKph,length:36,roadId}));
 for(const speed of [60,90,120,150])for(const offset of [0,-.4,.4,-.8,.8]){
  const row:any=drive('sweep-'+speed+'-'+offset,{x:3400,z:-341.375+offset,y:0,yaw:-Math.PI/2,speed,length:52,roadId});
  row.covered16Through19=WHEEL_IDS.every(id=>[16,17,18,19].every(s=>row.coveredSegments[id].includes(s)));
  row.passed&&=row.covered16Through19;
  rows.push(row);
 }
}finally{sharedGround.dispose();}
const report={mapVersion:map.version,sourceHash:createHash('sha256').update(sourceText).digest('hex'),complete:true,passed:rows.every(r=>r.passed),protocol:'Two original 36m fixtures plus 4 speeds × 5 lateral positions over runtime segments 16→17→18→19. Actual SUV config, 120Hz, static settling, prescribed longitudinal speed only. Real nearby colliders and support/classification code retained.',rows:rows.map(({samples,...r})=>r)};
fs.writeFileSync('${dir}g17-regression.json',JSON.stringify(report,null,2)+'\\n');
const support=runWheelSupportContinuitySelfTest(),navigation=runNavigationSelfTest();
fs.writeFileSync('${dir}targeted-tests.json',JSON.stringify({support,navigation},null,2)+'\\n');
console.log(JSON.stringify({complete:true,cases:rows.length,passed:report.passed,support,navigation}));
if(!report.passed)throw new Error('G17 fixture/sweep regression');
`;
try{
 const output=await build({stdin:{contents:source,resolveDir:path.resolve('scripts'),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 // The established A-B-A fixture has its own valid elevated approach/spawn;
 // all runtime imports resolve to the reapplied v488 plus the continuity fix.
 process.env.EAST_INTERCHANGE_ARTIFACT_DIR=dir+'east-aba';process.env.EAST_INTERCHANGE_MAP_SOURCE='src/world/regional/regional-main.json';process.env.EAST_INTERCHANGE_FULL_CONTEXT='1';process.argv.push('--ramp-only');
 const east=await build({entryPoints:['scripts/run-east-interchange-contact-selftest.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 await import('data:text/javascript;base64,'+Buffer.from(east.outputFiles[0].text).toString('base64'));
}catch(e){console.error(String(e.stack??e.message).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'g17-regression'));process.exitCode=1;}
