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

/** Every visible mirror renders on every display frame. Only invisible views are skipped. */
export class AdaptiveMirrorRendering {
  public renderMask = 7;
  public showRightOverlay = true;
  private invalidated = true;
  public invalidate(): void { this.invalidated = true; }
  /** Bits 1/2/4 select left/right/interior; the returned textures stay live between passes. */
  public update(_dt: number, c: AdaptiveMirrorContext, visibleMask = 7): number {
    const speed = Math.abs(c.speed);
    const parking = c.parking || c.selector === 'R' || c.selector === 'P' || speed < 3;
    let priority = parking || c.junction || c.laneChange || c.road === 'ramp' ? 7 : 0;
    if (c.leftSignal || c.headYaw > .18 || c.headTargetYaw > .18 || c.steering < -.12 || c.preview === 'left') priority |= 1;
    if (c.rightSignal || c.headYaw < -.18 || c.headTargetYaw < -.18 || c.steering > .12 || c.preview === 'right') priority |= 2;
    if (Math.abs(c.headYaw) > .18 || Math.abs(c.headTargetYaw) > .18) priority |= 4;
    this.showRightOverlay = speed < 30 / 3.6 || c.selector === 'R';
    // Assistance keeps both side views ready; driver intent also overrides visibility.
    if (c.lateralActive) priority |= 3;
    this.renderMask = this.invalidated ? 7 : visibleMask | priority | (this.showRightOverlay ? 2 : 0);
    this.invalidated = false;
    return this.renderMask;
  }
}
