import {build} from 'esbuild';
const task=process.argv[2];
const result=await build({entryPoints:[`artifacts/highway-extension-streaming-test/${task}.ts`],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));} catch(e) {console.error(e.stack?.replace(/data:text[^\s)]+/g,'<diagnostic bundle>')??e);process.exitCode=1;}
