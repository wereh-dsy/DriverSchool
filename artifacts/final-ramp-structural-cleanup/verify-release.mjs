import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const dir='artifacts/final-ramp-structural-cleanup/';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),result=read(dir+'release-result.json');
assert.equal(result.exitCode,0);
const hash=b=>createHash('sha256').update(b).digest('hex');
const guard=read(dir+'scope-guard.json'),external='D:/DriverSchoolRelease/DriverSchool-win32-x64',asarPath=external+'/resources/app.asar';
const localRequire=createRequire(import.meta.url),packagerRequire=createRequire(localRequire.resolve('@electron/packager'));
const asar=await import(pathToFileURL(packagerRequire.resolve('@electron/asar')).href);
for(const file of ['DriverSchool.exe','resources/app.asar','icudtl.dat','resources.pak'])assert(fs.statSync(external+'/'+file).isFile());
assert(fs.statSync(external+'/locales').isDirectory());
assert.equal(hash(fs.readFileSync(asarPath)),hash(fs.readFileSync('release/DriverSchool-win32-x64/resources/app.asar')));
const internal='release/DriverSchool-win32-x64';
function packageInventory(root,relative='') { return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(entry=>{const file=path.join(relative,entry.name);assert(!entry.isSymbolicLink(),'Unexpected package link: '+file);return entry.isDirectory()?packageInventory(root,file):[file];}).sort(); }
const runtimeFiles=packageInventory(internal);
assert.deepEqual(packageInventory(external),runtimeFiles,'Full runtime directory inventory mismatch');
for(const file of runtimeFiles)assert.equal(hash(fs.readFileSync(path.join(external,file))),hash(fs.readFileSync(path.join(internal,file))),'Runtime file mismatch: '+file);
const payload=path.resolve('.desktop/payload'),files=[];
function walk(p){for(const entry of fs.readdirSync(p,{withFileTypes:true})){const file=path.join(p,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}}
walk(payload);
for(const file of files){const relative=path.relative(payload,file),packed=asar.extractFile(asarPath,relative),source=fs.readFileSync(file);if(relative==='package.json')assert.deepEqual(JSON.parse(packed),JSON.parse(source),'External manifest mismatch');else assert.equal(hash(packed),hash(source),'External payload mismatch: '+relative);}
const runtime=asar.extractFile(asarPath,path.normalize('dist/'+guard.expectedRuntimeAsset));
assert.equal(hash(runtime),guard.compiledRuntimeHash);
assert.equal(JSON.parse(runtime).map.version,492);
assert.equal(hash(fs.readFileSync('src/world/regional/regional-main.json')),guard.candidateHash);
assert.equal(hash(fs.readFileSync('dist/'+guard.expectedRuntimeAsset)),guard.compiledRuntimeHash);
const manifest=read('dist/.vite/manifest.json');
const references=Object.values(manifest).filter(e=>e.file.endsWith('.js')&&fs.readFileSync('dist/'+e.file,'utf8').includes(path.basename(guard.expectedRuntimeAsset))).map(e=>e.file);
assert(references.length>0);
Object.assign(result,{externalDirectory:external,executable:external+'/DriverSchool.exe',completeDirectoryPublished:true,completeRuntimeFileCount:runtimeFiles.length,completeRuntimeByteExactMatch:true,payloadFileCount:files.length,payloadExactMatch:true,asarHash:hash(fs.readFileSync(asarPath)),runtimeAsset:guard.expectedRuntimeAsset,runtimeHash:hash(runtime),mapVersion:492,distConsistent:true,applicationReferencesRuntime:references,smoke:{status:'pending'}});
fs.writeFileSync(dir+'release-result.json',JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(dir+'dist-consistency.json',JSON.stringify({passed:true,sourceHash:guard.candidateHash,runtime:'dist/'+guard.expectedRuntimeAsset,runtimeHash:guard.compiledRuntimeHash,exactMatchWithNormalCompiler:true,applicationReferencesRuntime:references,version:492,browserBuildsThisBatch:2,externalPackageExactMatch:true},null,2)+'\n');
console.log(JSON.stringify(result));
