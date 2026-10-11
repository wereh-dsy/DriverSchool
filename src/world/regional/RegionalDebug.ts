import type { SectorManager } from '../city/SectorManager';

/** Opt-in only: ?regionalDebug=1. No permanent production HUD. */
export class RegionalDebug {
  private readonly canvas=document.createElement('canvas');
  private lastPaint=0;
  constructor(private readonly sectors:SectorManager){
    this.canvas.width=520;this.canvas.height=370;this.canvas.style.cssText='position:fixed;right:12px;top:12px;width:520px;height:370px;z-index:50;pointer-events:none;border:1px solid #5c7780;background:#11202aeb';
    this.canvas.dataset.regionalStreamingDebug='true';document.body.append(this.canvas);
  }
  update():void {
    const now=performance.now();if(now-this.lastPaint<200)return;this.lastPaint=now;
    const state=this.sectors.debugState,ctx=this.canvas.getContext('2d');if(!state||!ctx)return;
    const b=this.sectors.map.regional!.terrainBounds,size=this.sectors.map.sectorSize,scale=Math.min(490/(b.maxX-b.minX),285/(b.maxZ-b.minZ));
    const x=(value:number)=>15+(value-b.minX)*scale,z=(value:number)=>45+(value-b.minZ)*scale;
    ctx.clearRect(0,0,520,370);ctx.font='14px sans-serif';ctx.fillStyle='#ffffff';ctx.fillText(`Regional streaming | sector ${state.currentSector} | ahead ${Math.round(state.lookaheadMetres)} m`,15,24);
    for(const [key,tier]of state.tiers){const [sx,sz]=key.split(',').map(Number);ctx.fillStyle=this.sectors.active.has(key)?tier==='near'?'#49bb83':'#438caf':'#283843';ctx.fillRect(x(sx!*size),z(sz!*size),size*scale-1,size*scale-1);}
    for(const route of this.sectors.map.regional!.routes){ctx.strokeStyle='#ddd6b2';ctx.lineWidth=1;ctx.beginPath();route.centerline.forEach((p,i)=>i?ctx.lineTo(x(p.x),z(p.z)):ctx.moveTo(x(p.x),z(p.z)));ctx.stroke();}
    const outline=(keys:string[],color:string)=>{ctx.strokeStyle=color;ctx.lineWidth=1;for(const key of keys){const [sx,sz]=key.split(',').map(Number);ctx.strokeRect(x(sx!*size),z(sz!*size),size*scale-1,size*scale-1);}};
    outline(state.lookahead,'#f3d85d');outline(state.preloaded,'#bd8ae5');outline([state.currentSector],'#ffffff');
    ctx.fillStyle='#d6e4e6';ctx.fillText('绿 NEAR · 蓝 MID · 灰 FAR / 未加载 · 黄前视 · 紫结构预载',15,345);ctx.fillText(`Active sectors: ${this.sectors.active.size} · logical roads: ${this.sectors.map.roads.length}`,15,365);
  }
  dispose(){this.canvas.remove();}
}
