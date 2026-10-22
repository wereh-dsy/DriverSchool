import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const baseline=process.argv.includes('--baseline');
const old=baseline?execFileSync('git',['show','HEAD:src/vehicle/physics/WheelSupportContinuity.ts'],{encoding:'utf8'}):undefined;
if(baseline){const r=JSON.parse(fs.readFileSync('artifacts/v488-reapply-and-g17-fix/v488-restoration-consistency.json'));if(createHash('sha256').update(old).digest('hex')!==r.protectedHashes['src/vehicle/physics/WheelSupportContinuity.ts'])throw new Error('Wrong pre-fix continuity baseline');}
const output=await build({entryPoints:['scripts/audit-adjacent-support-boundaries.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins:[{name:'offline-boundary-probe',setup(b){
 b.onLoad({filter:/[/\\]CityGround\.ts$/},args=>{const text=fs.readFileSync(args.path,'utf8'),modified=text.replace(/this\.colliders = \[\.\.\.this\.data\.objects[^\n]+;/,'this.colliders = [];');if(modified===text)throw new Error('Collider omission hook not found');return {contents:modified,loader:'ts'};});
 if(baseline)b.onLoad({filter:/[/\\]WheelSupportContinuity\.ts$/},()=>({contents:old,loader:'ts'}));
}}]});
try{await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));}catch(e){console.error(String(e.stack??e.message).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'adjacent-boundary-audit'));process.exitCode=1;}
