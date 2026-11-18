import fs from 'node:fs';
const root='artifacts/runtime-v4/',out=root+'ac-verified/';fs.mkdirSync(out,{recursive:true});
let runner=fs.readFileSync(root+'compare.cjs','utf8').replace("out=path.resolve('artifacts/runtime-v4')","out=path.resolve(process.env.DRIVER_PROFILE_OUTPUT??'artifacts/runtime-v4')");fs.writeFileSync(root+'compare-ac.cjs',runner);
fs.copyFileSync(root+'worker-instrument.js',out+'worker-instrument.js');
fs.writeFileSync(root+'summarize-ac.mjs',fs.readFileSync(root+'summarize.mjs','utf8').replace("const dir='artifacts/runtime-v4/'","const dir='artifacts/runtime-v4/ac-verified/'"));
let server=fs.readFileSync(root+'server.mjs','utf8').replace("snapshot=resolve(output,'baseline')","snapshot=resolve(process.env.DRIVER_BASELINE_SNAPSHOT??resolve(output,'baseline'))");fs.writeFileSync(root+'server-ac.mjs',server);
