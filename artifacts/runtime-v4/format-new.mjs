import fs from 'node:fs';
import ts from 'typescript';
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
for(const file of [...fs.readdirSync('src/game/render').filter(name=>name.endsWith('.ts')).map(name=>'src/game/render/'+name),'src/world/city/CitySimulationSectors.ts']){
 const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const multiline=node=>{if(ts.isBlock(node)||ts.isObjectLiteralExpression(node))ts.setEmitFlags(node,ts.EmitFlags.MultiLine);ts.forEachChild(node,multiline);};multiline(tree);
 fs.writeFileSync(file,printer.printFile(tree));
}
