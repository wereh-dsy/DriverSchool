export interface AdaptiveMirrorContext {
  speed: number;
  road: 'highway' | 'urban' | 'ramp' | 'unknown';
  headYaw: number;
  headTargetYaw: number;
  leftSignal: boolean;
  rightSignal: boolean;
  selector: string;
  parking: boolean;
  steering: number;
  lateralActive: boolean;
  laneChange: boolean;
  junction: boolean;
  preview: 'left' | 'right' | null;
}

/** Focused/safety-critical mirrors follow the display. Other visible mirrors
 * remain live at 60 Hz, staggered on high-refresh displays. */
export class AdaptiveMirrorRendering {
  public renderMask = 7;
  public showRightOverlay = true;
  private invalidated = true;
  private readonly elapsed=new Float64Array([0,1/180,2/180]);
  private previousWanted=0;
  public invalidate(): void { this.invalidated = true; }
  /** Bits 1/2/4 select left/right/interior; the returned textures stay live between passes. */
  public update(dt: number, c: AdaptiveMirrorContext, visibleMask = 7): number {
    const speed = Math.abs(c.speed);
    const parking = c.parking || c.selector === 'R' || c.selector === 'P' || speed < 3;
    let priority = parking || c.junction || c.laneChange || c.road === 'ramp' ? 7 : 0;
    if (c.leftSignal || c.headYaw > .18 || c.headTargetYaw > .18 || c.steering < -.12 || c.preview === 'left') priority |= 1;
    if (c.rightSignal || c.headYaw < -.18 || c.headTargetYaw < -.18 || c.steering > .12 || c.preview === 'right') priority |= 2;
    if (Math.abs(c.headYaw) > .18 || Math.abs(c.headTargetYaw) > .18) priority |= 4;
    this.showRightOverlay = speed < 30 / 3.6 || c.selector === 'R';
    // Assistance keeps both side views ready; driver intent also overrides visibility.
    if (c.lateralActive) priority |= 3;
    const wanted=visibleMask|priority|(this.showRightOverlay?2:0),period=1/60;
    this.renderMask=0;
    for(let i=0;i<3;i++){
      const bit=1<<i;this.elapsed[i]=Math.min(period*2,this.elapsed[i]!+dt);
      if(this.invalidated||priority&bit||wanted&bit&&!(this.previousWanted&bit)){this.renderMask|=bit;this.elapsed[i]=i*period/3;}
      else if(wanted&bit&&this.elapsed[i]!+1e-7>=period){this.renderMask|=bit;this.elapsed[i]=Math.max(0,this.elapsed[i]!-period);}
    }
    this.previousWanted=wanted;
    this.invalidated = false;
    return this.renderMask;
  }
}
