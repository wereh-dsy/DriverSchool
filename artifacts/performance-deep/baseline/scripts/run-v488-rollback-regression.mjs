import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const output=await build({entryPoints:['scripts/run-v488-rollback-regression.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
 await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 const dir='artifacts/v488-full-rollback/';
 process.env.EAST_INTERCHANGE_ARTIFACT_DIR=dir+'east-aba-known-protocol';process.env.EAST_INTERCHANGE_MAP_SOURCE='src/world/regional/regional-main.json';process.env.EAST_INTERCHANGE_FULL_CONTEXT='1';process.argv.push('--ramp-only');
 // Reuse the already established short replay, including its full-context
 // diagnostic option; imports resolve exclusively to restored runtime source.
 const input=fs.readFileSync(dir+'before-rollback/scripts/run-east-interchange-contact-selftest.ts','utf8'),east=await build({stdin:{contents:input,sourcefile:'east-aba-existing-regression.ts',resolveDir:path.resolve('scripts'),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 await import('data:text/javascript;base64,'+Buffer.from(east.outputFiles[0].text).toString('base64'));
 const report=JSON.parse(fs.readFileSync(dir+'runtime-regression.json')),known=JSON.parse(fs.readFileSync(dir+'east-aba-known-protocol/ramp-summary.json'));report.eastABA={...known,passed:known.row.invalidABA===0&&known.row.rejectedSamples===0&&known.row.maxImpulse===0&&known.row.safety===0&&known.row.recovery===0&&known.row.rampSeen&&known.row.mainlineAfterRamp===0};report.allRequestedCasesPassed=report.rows.every(r=>r.passed)&&report.eastABA.passed;
 report.initialHarnessAttempt={path:'initial-solid-east-replay/east-ABA.json',acceptedAsRegressionEvidence:false,reason:'Custom zero-world-Y static spawn failed to establish the elevated approach correctly; it sampled the below-deck plane. Preserved as invalid setup evidence, replaced by the established full-context approach/spawn protocol.'};
 fs.writeFileSync(dir+'runtime-regression.json',JSON.stringify(report,null,2)+'\n');
}catch(e){console.error(String(e.stack??e.message).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'rollback-regression'));process.exitCode=1;}
