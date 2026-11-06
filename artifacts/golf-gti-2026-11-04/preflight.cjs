// Target the catalog-dependent checks before the mandatory, much longer normal build.
const {readFileSync}=require('node:fs');const {resolve}=require('node:path');const {build}=require('esbuild');
const root=resolve(__dirname,'../..'),source=readFileSync(resolve(root,'scripts/run-core-selftests.ts'),'utf8');
const imports=source.slice(0,source.indexOf("await prepareDrivingGround"));
const names=['runPowertrainLayoutSelfTest','runFuelSystemSelfTest','runVehicleCatalogSelfTest','runVehicleStructureSelfTest','runSuspensionStanceSelfTest','runInstrumentClusterLayoutSelfTest','runDriverViewSelfTest','runVehicleExteriorSelfTest','runVehicleVisualDimensionsSelfTest','runMirrorGeometrySelfTest','runCircuitGroundSelfTest'];
build({stdin:{contents:imports+'let failures=0;\n'+names.map(name=>`try{console.log(${JSON.stringify(name)},JSON.stringify(${name}()));}catch(error){failures++;console.error(${JSON.stringify(name)},String(error));}`).join('\n')+'\nif(failures)process.exitCode=1;',resolveDir:resolve(root,'scripts'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(root,'.tmp-golf-platform-preflight.mjs')});
