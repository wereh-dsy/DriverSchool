import {RenderWorldCompiler} from './RenderWorldCompiler';
import {packetTransfers,type RenderWorldPatch,type RenderWorldQuery} from './RenderWorldProtocol';
const compiler=new RenderWorldCompiler();
const worker=globalThis as unknown as {onmessage:((event:MessageEvent<RenderWorldPatch|RenderWorldQuery>)=>void)|null;postMessage:(value:unknown,transfers:ArrayBuffer[])=>void};
worker.onmessage=event=>{
  const message=event.data;
  if(message.type==='patch'){compiler.patch(message);return;}
  const packet=compiler.compile(message);
  worker.postMessage({type:'packet',packet,views:message.views},[...packetTransfers(packet),message.views.buffer as ArrayBuffer]);
};
