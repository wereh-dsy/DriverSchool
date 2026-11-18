import fs from 'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import ts from'typescript';
const out='artifacts/runtime-v4/',start=JSON.parse(fs.readFileSync(out+'starting-worktree.json','utf8')),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),initial=new Set(start.files.map(f=>f.path));
const changed=start.files.filter(f=>!fs.existsSync(f.path)||hash(f.path)!==f.sha256).map(f=>f.path);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','docs','AGENTS.md','package.json','vite.config.ts','tsconfig.json'],{encoding:'utf8'}).trim().split('\n');const added=files.filter(f=>!initial.has(f));
console.log(JSON.stringify({changed,added},null,2));
const bodies=file=>{const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),result=[];const visit=n=>{if(ts.isWhileStatement(n))result.push(ts.createPrinter().printNode(ts.EmitHint.Unspecified,n,source));ts.forEachChild(n,visit);};visit(source);return result;};
const baseline=bodies(out+'baseline/src/game/DrivingGame.ts'),current=bodies('src/game/DrivingGame.ts');
fs.writeFileSync(out+'fixed-loop-review.json',JSON.stringify({baselineLoops:baseline.length,currentLoops:current.length,unchanged:JSON.stringify(baseline)===JSON.stringify(current),baseline,current},null,2));console.log({fixedLoopUnchanged:JSON.stringify(baseline)===JSON.stringify(current)});
