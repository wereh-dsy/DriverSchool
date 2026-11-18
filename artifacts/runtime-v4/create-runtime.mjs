import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('artifacts/runtime-v4/baseline/src/game/DrivingGame.ts','utf8');
const tree=ts.createSourceFile('game.ts',source,ts.ScriptTarget.Latest,true);
const game=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='DrivingGame');
const method=name=>game.members.find(n=>n.name?.getText(tree)===name).getText(tree);
let methods=['addLightingAndSky','createMirrorSystem','prepareRenderMatrices','updateWorldVisibility'].map(method).join('\n');
methods=methods.replaceAll('this.visualDebug?.enabled','false').replaceAll('this.visualDebug.renderCamera === null','true');
fs.writeFileSync('artifacts/runtime-v4/renderer-methods.txt',methods);
