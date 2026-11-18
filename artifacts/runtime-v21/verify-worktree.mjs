import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out='artifacts/runtime-v21/', start=JSON.parse(fs.readFileSync(out+'starting-worktree.json','utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const allowed=new Set([
 'docs/CURRENT_CODE_CONTEXT.md','docs/RUNTIME_V2_PHASE2_2026-11-16.md','docs/RUNTIME_V2_PHASE21_2026-11-17.md',
 'scripts/run-world-render-selftests.mjs','src/game/StreamingShaderWarmup.ts','src/game/runtime/RuntimeCoordinator.ts',
 'src/world/render/StaticGeometryPacking.ts','src/world/render/RuntimeFirstRendering.selftest.ts',
 'src/world/render/StaticBatchBuilder.ts','src/world/render/WorldRenderResources.ts','src/world/render/WorldRenderClusters.ts','src/world/render/WorldLODProxies.ts',
 'src/world/city/PrefabRegistry.ts','src/world/city/SectorManager.ts','src/world/city/FogVisibility.ts','src/world/city/VisualStreaming.selftest.ts','src/world/regional/RegionalBackgroundBatches.ts'
]);
const changed=start.files.filter(f=>!fs.existsSync(f.path)||hash(f.path)!==f.sha256).map(f=>f.path);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','docs','AGENTS.md','package.json','vite.config.ts','tsconfig.json'],{encoding:'utf8'}).trim().split('\n');
const initial=new Set(start.files.map(f=>f.path)), added=files.filter(f=>!initial.has(f));
const unexpected=[...changed,...added].filter(f=>!allowed.has(f));
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const result={passed:!unexpected.length&&head===start.head&&hash(start.release.path)===start.release.sha256,head,headUnchanged:head===start.head,changed,added,unexpected,vehicleChanges:changed.filter(f=>f.startsWith('src/vehicle/')),mapUnchanged:hash('src/world/regional/regional-main.json')===start.files.find(f=>f.path==='src/world/regional/regional-main.json').sha256,oldReleaseUnchanged:hash(start.release.path)===start.release.sha256};
fs.writeFileSync(out+'worktree-verification.json',JSON.stringify(result,null,2));console.log(result);if(!result.passed||!result.mapUnchanged)process.exitCode=1;
