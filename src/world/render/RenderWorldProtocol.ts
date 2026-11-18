/** Numeric wire protocol. No Three objects or geometry copies cross this boundary. */
export const RECORD_STRIDE = 12;
export const VIEW_STRIDE = 35;
export const MAX_RENDER_VIEWS = 8;
export interface RenderWorldPatch { type:'patch'; revision:number; records:Float64Array }
export interface RenderWorldQuery {
  type:'query'; revision:number; sequence:number; count:number; views:Float64Array;
  recycle?:RenderPacket;
}
export interface RenderPacket {
  revision:number; sequence:number; count:number; cpuMs:number;
  generations:Uint32Array; masks:Uint16Array; lod:Uint8Array;
  /** Sorted draw slots, grouped by view, with count+1 offsets. */
  draws:Uint32Array; offsets:Uint32Array;
}
export interface RenderWorldReply { type:'packet'; packet:RenderPacket; views:Float64Array }
export const packetTransfers=(packet:RenderPacket):ArrayBuffer[]=>
  [packet.generations.buffer,packet.masks.buffer,packet.lod.buffer,packet.draws.buffer,packet.offsets.buffer] as ArrayBuffer[];
