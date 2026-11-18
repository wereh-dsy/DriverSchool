import {build} from 'esbuild';
import fs from 'node:fs';
// Omit solid construction only in this offline bundle. In particular, retain
// authored barrier flags: they participate in real road-edge continuation.
const output=await build({entryPoints:['scripts/audit-road-surfaces.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins:[{name:'surface-only-no-solids',setup(build){build.onLoad({filter:/[\\/]CityGround\.ts$/},args=>{const original=fs.readFileSync(args.path,'utf8'),line=original.split('\n').find(l=>l.includes('this.colliders = ['));if(!line)throw new Error('Offline collider hook no longer matches');return {contents:original.replace(line,'    this.colliders = [];'),loader:'ts'};});}}]});
try{await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));}catch(e){console.error(String(e.stack??e.message).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'surface-audit'));process.exitCode=1;}
