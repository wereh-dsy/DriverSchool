import {MAX_RENDER_VIEWS,RECORD_STRIDE,VIEW_STRIDE,type RenderPacket,type RenderWorldPatch,type RenderWorldQuery} from './RenderWorldProtocol';

/** Worker-owned dense database. Patches are coalesced by stable slot/generation;
 * expensive culling, LOD decisions and draw ordering never inspect Object3D. */
export class RenderWorldCompiler {
  private records=new Float64Array(0);
  private previousLOD=new Uint8Array(0);
  private capacity=0;
  revision=0;
  patch(patch:RenderWorldPatch):void {
    for(let i=0;i<patch.records.length;i+=RECORD_STRIDE){
      const slot=patch.records[i]!;
      if(slot>=this.capacity){const capacity=Math.ceil((slot+1)/1024)*1024,data=new Float64Array(capacity*RECORD_STRIDE),lod=new Uint8Array(capacity);data.set(this.records);lod.set(this.previousLOD);this.records=data;this.previousLOD=lod;this.capacity=capacity;}
      if(this.records[slot*RECORD_STRIDE+1]!==patch.records[i+1])this.previousLOD[slot]=0;
      this.records.set(patch.records.subarray(i,i+RECORD_STRIDE),slot*RECORD_STRIDE);
    }
    this.revision=patch.revision;
  }
  compile(query:RenderWorldQuery):RenderPacket {
    const started=performance.now(),old=query.recycle,n=this.capacity;
    const packet:RenderPacket=old&&old.masks.length>=n&&old.draws.length>=n*MAX_RENDER_VIEWS?old:{revision:0,sequence:0,count:0,cpuMs:0,generations:new Uint32Array(n),masks:new Uint16Array(n),lod:new Uint8Array(n),draws:new Uint32Array(n*MAX_RENDER_VIEWS),offsets:new Uint32Array(MAX_RENDER_VIEWS+1)};
    packet.masks.fill(0);packet.generations.fill(0);packet.offsets.fill(0);
    const views=query.views;
    for(let slot=0;slot<n;slot++){
      const at=slot*RECORD_STRIDE,d=this.records;
      packet.generations[slot]=d[at+1]!;
      if(!d[at+10])continue;
      const x=d[at+2]!,y=d[at+3]!,z=d[at+4]!,radius=d[at+5]!;
      packet.generations[slot]=d[at+1]!;
      const distance=Math.max(0,Math.hypot(x-views[28]!,y-views[29]!,z-views[30]!)-radius),previous=this.previousLOD[slot];
      let lod=distance<=750||(previous===1&&distance<=850)?1:distance<=1800||(previous===2&&distance<=1900)?2:3;
      // Select only a prepared representation; never hide a road while a new
      // representation is still being streamed. Near detail is the safe fallback.
      const available=d[at+11]!;if(!(available&(1<<(lod-1))))lod=available&1?1:available&2?2:3;
      packet.lod[slot]=lod;this.previousLOD[slot]=lod;
      for(let v=0;v<query.count;v++){
        const p=v*VIEW_STRIDE,depth=-(views[p+24]!*x+views[p+25]!*y+views[p+26]!*z+views[p+27]!);
        const margin=views[p+34]!+Math.max(0,depth)*.08;
        if(depth>views[p+31]!+radius+margin)continue;
        if(views[p+33]===1&&!(d[at+9]!&1))continue;
        let visible=true;
        for(let plane=0;plane<24;plane+=4)if(views[p+plane]!*x+views[p+plane+1]!*y+views[p+plane+2]!*z+views[p+plane+3]! < -radius-margin){visible=false;break;}
        if(visible)packet.masks[slot]!|=1<<v;
      }
    }
    let written=0;
    for(let view=0;view<query.count;view++){
      packet.offsets[view]=written;
      for(let slot=0;slot<n;slot++)if(packet.masks[slot]!&(1<<view))packet.draws[written++]=slot;
      packet.draws.subarray(packet.offsets[view]!,written).sort((a,b)=>this.records[a*RECORD_STRIDE+8]!-this.records[b*RECORD_STRIDE+8]!||this.records[a*RECORD_STRIDE+7]!-this.records[b*RECORD_STRIDE+7]!||a-b);
    }
    packet.offsets[query.count]=written;packet.revision=this.revision;packet.sequence=query.sequence;packet.count=query.count;packet.cpuMs=performance.now()-started;
    return packet;
  }
}
