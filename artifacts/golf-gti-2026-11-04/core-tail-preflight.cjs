// Diagnostic only: report every downstream core failure before rerunning the full build.
const {readFileSync}=require('node:fs');const {resolve}=require('node:path');const {build}=require('esbuild');
const root=resolve(__dirname,'../..'),source=readFileSync(resolve(root,'scripts/run-core-selftests.ts'),'utf8');
const setup=source.slice(0,source.indexOf('const results ='));
const tail=source.slice(source.indexOf('  cityToolchain:'),source.indexOf('\n};')).trim().split('\n');
const checks=tail.map(line=>{const m=line.trim().match(/^(\w+):\s*(.+),$/);if(!m)throw Error('Unparsed core entry '+line);return `try{${m[2]};console.log('PASS ${m[1]}')}catch(error){failures++;console.error('FAIL ${m[1]}',error)}`;});
build({stdin:{contents:setup+'let failures=0;\n'+checks.join('\n')+'\nif(failures)process.exitCode=1;',resolveDir:resolve(root,'scripts'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(root,'.tmp-golf-core-tail.mjs')});
