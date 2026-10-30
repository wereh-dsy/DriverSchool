import {createServer} from 'vite';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import electron from 'electron';
const dir='artifacts/highway-extension-streaming-test/';
console.log('Starting isolated diagnostic server.');
const server=await createServer({configFile:false,cacheDir:'.desktop/highway-vite-cache',publicDir:false,define:{__CITY_MAIN_RUNTIME_URL__:JSON.stringify('/unused-diagnostic-runtime.json')},server:{host:'127.0.0.1',port:5183,strictPort:true,watch:{ignored:['**/artifacts/**','**/.desktop/**','**/release/**']}},optimizeDeps:{noDiscovery:true,include:['three','three/addons/utils/BufferGeometryUtils.js']}});await server.listen();
console.log('Diagnostic server ready.');
const env={...process.env,HIGHWAY_STRESS_URL:'http://127.0.0.1:5183/'+dir+'stress.html'};delete env.ELECTRON_RUN_AS_NODE;
const log=fs.createWriteStream(dir+'streaming-stress.log');
try {const child=spawn(electron,[dir+'stress-electron.cjs'],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>{log.write(b);process.stdout.write(b);});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});process.exitCode=code??1;}finally{log.end();await server.close();}
