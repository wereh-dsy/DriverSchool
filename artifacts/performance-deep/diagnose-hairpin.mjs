import{build}from'esbuild';import fs from'node:fs';
let source=fs.readFileSync('src/world/circuit/CircuitGround.selftest.ts','utf8');
source=source.replace('function runHairpinAcceptance(ground: CircuitGround)', 'export function runHairpinAcceptance(ground: CircuitGround)');
source=source.replace('let nearest=route.findIndex', 'const failures:string[]=[];let worst:unknown;let nearest=route.findIndex');
source=source.replace('maximumError=Math.max(maximumError,Math.sqrt(best));','if(Math.sqrt(best)>maximumError)worst={distance:route[nearest]!.distance,speed:state.speedKmh,headingError:wrapAngle(targetYaw-(state.yaw-state.bodySlipAngle)),steering:car.steering.steeringInput,roadWheel:car.steering.steeringAngle,yawRate:state.yawRate,slip:state.bodySlipAngle};maximumError=Math.max(maximumError,Math.sqrt(best));');
source=source.replace('if(!ok)throw new Error(`Circuit hairpin ${vehicle.id}: ${message}`);','if(!ok)failures.push(message);');
source=source.replace('return {vehicle:vehicle.id,maximumError,minimumSpeed,minimumGrip,collisions};','return {vehicle:vehicle.id,maximumError,minimumSpeed,minimumGrip,collisions,worst,failures};');
source+='\nexport {CircuitGround};';
const b=await build({stdin:{contents:source,resolveDir:process.cwd()+'/src/world/circuit',loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));const ground=new api.CircuitGround({shadows:false});try{const data=api.runHairpinAcceptance(ground);fs.writeFileSync('artifacts/performance-deep/hairpin-diagnostic.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data.filter(r=>r.failures.length),null,2));}finally{ground.dispose();}}catch(e){console.error(e.message);process.exitCode=1;}
