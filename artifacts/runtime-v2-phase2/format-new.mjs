import fs from 'node:fs';
import ts from 'typescript';
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
for(const name of fs.readdirSync('src/world/render').filter(name=>name.endsWith('.ts'))){
 const file='src/world/render/'+name,source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const transformed=ts.transform(source,[context=>root=>ts.visitNode(root,function visit(node){
  const next=ts.visitEachChild(node,visit,context),block=statement=>ts.isBlock(statement)?statement:ts.factory.createBlock([statement],true);
  if(ts.isBlock(next))return ts.factory.updateBlock(next,next.statements.length?ts.factory.createNodeArray(next.statements):next.statements);
  if(ts.isIfStatement(next))return ts.factory.updateIfStatement(next,next.expression,block(next.thenStatement),next.elseStatement?(ts.isIfStatement(next.elseStatement)?next.elseStatement:block(next.elseStatement)):undefined);
  if(ts.isForOfStatement(next))return ts.factory.updateForOfStatement(next,next.awaitModifier,next.initializer,next.expression,block(next.statement));
  if(ts.isForStatement(next))return ts.factory.updateForStatement(next,next.initializer,next.condition,next.incrementor,block(next.statement));
  if(ts.isWhileStatement(next))return ts.factory.updateWhileStatement(next,next.expression,block(next.statement));
  return next;
 })]);
 // New synthetic blocks carry an explicit multiline flag, unlike a printer's
 // preservation of the original one-line method bodies.
 const multiline=ts.transform(transformed.transformed[0],[context=>root=>ts.visitNode(root,function visit(node){const next=ts.visitEachChild(node,visit,context);return ts.isBlock(next)?ts.factory.createBlock(next.statements,true):next;})]);
 fs.writeFileSync(file,printer.printFile(multiline.transformed[0]));transformed.dispose();multiline.dispose();
}
console.log('Formatted only the six new world-render modules');
