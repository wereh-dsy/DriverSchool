import assert from 'node:assert/strict';
import {dir,read,write,hash,central,analyze} from './common';
const map=read(dir+'candidate-map.json'),base=read(dir+'baseline-map.json'),seeds=map.roads.filter(central),result=analyze(map,seeds,true).rows;
assert.equal(hash(seeds),hash(base.roads.filter(central)));
const failures=result.filter((r:any)=>r.severity!=='PASS');
write('central-regression.json',{passed:!failures.length,ramps:8,interfaces:16,geometryUnchanged:true,results:result,failures});console.log(JSON.stringify({ramps:8,interfaces:16,failures:failures.map((r:any)=>r.id)}));if(failures.length)process.exitCode=1;
