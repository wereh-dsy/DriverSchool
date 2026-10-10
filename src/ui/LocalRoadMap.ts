import { worldToRoadMap, type RoadNetworkData, type RoadSegmentData, type RoadIntersectionData } from '../world/navigation/RoadNetwork';

const TILE = 256, PIXELS = 512;
type MapEdge = { ax: number; az: number; bx: number; bz: number; width: number; major: boolean };
type Cell = { edges: MapEdge[]; roads: Set<RoadSegmentData>; junctions: Set<RoadIntersectionData> };

/** Shared north-up minimap coordinates. Index once, rasterize only visible cached tiles. */
export class LocalRoadMap {
  private network: RoadNetworkData | undefined;
  private readonly cells = new Map<string, Cell>();
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  public version = 0;
  public rasterizations = 0;
  public get available(): boolean { return this.network !== undefined; }
  private point(x: number, z: number): { x: number; y: number } {
    const bounds = this.network!.bounds, p = worldToRoadMap(bounds, x, z);
    return { x: p.x * (bounds.maximumX - bounds.minimumX), y: p.y * (bounds.maximumZ - bounds.minimumZ) };
  }
  public setNetwork(network: RoadNetworkData | undefined): void {
    if (network === this.network) return;
    this.network = network; this.cells.clear(); this.tiles.clear(); this.version++;
    if (!network) return;
    const cell = (x: number, z: number): Cell => {
      const key = `${x},${z}`;
      let value = this.cells.get(key);
      if (!value) { value = { edges: [], roads: new Set(), junctions: new Set() }; this.cells.set(key, value); }
      return value;
    };
    for (const road of network.segments) for (let i = 1; i < road.centerline.length; i++) {
      const a = this.point(road.centerline[i - 1]!.x, road.centerline[i - 1]!.z), b = this.point(road.centerline[i]!.x, road.centerline[i]!.z);
      const edge = { ax: a.x, az: a.y, bx: b.x, bz: b.y, width: road.width, major: (road.speedLimit ?? 0) >= 70 || road.width >= 18 };
      const pad = road.width / 2 + 1;
      for (let x = Math.floor((Math.min(a.x, b.x) - pad) / TILE); x <= Math.floor((Math.max(a.x, b.x) + pad) / TILE); x++)
        for (let z = Math.floor((Math.min(a.y, b.y) - pad) / TILE); z <= Math.floor((Math.max(a.y, b.y) + pad) / TILE); z++) {
          const entry = cell(x, z); entry.edges.push(edge); entry.roads.add(road);
        }
    }
    for (const junction of network.intersections) {
      const p = this.point(junction.center.x, junction.center.z);
      for (let x = Math.floor((p.x - junction.halfExtentX) / TILE); x <= Math.floor((p.x + junction.halfExtentX) / TILE); x++)
        for (let z = Math.floor((p.y - junction.halfExtentZ) / TILE); z <= Math.floor((p.y + junction.halfExtentZ) / TILE); z++) cell(x, z).junctions.add(junction);
    }
  }
  public nearby(x: number, z: number, radius = 110): { network: RoadNetworkData | undefined; complexity: number } {
    if (!this.network) return { network: undefined, complexity: 0 };
    const p = this.point(x, z), roads = new Set<RoadSegmentData>(), junctions = new Set<RoadIntersectionData>();
    for (let tx = Math.floor((p.x - radius) / TILE); tx <= Math.floor((p.x + radius) / TILE); tx++)
      for (let tz = Math.floor((p.y - radius) / TILE); tz <= Math.floor((p.y + radius) / TILE); tz++) {
        const entry = this.cells.get(`${tx},${tz}`);
        entry?.roads.forEach(r => roads.add(r)); entry?.junctions.forEach(j => junctions.add(j));
      }
    const nearbyRoads: RoadSegmentData[] = [];
    let density = 0;
    for (const road of roads) {
      let near = false;
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1]!, b = road.centerline[i]!, dx = b.x - a.x, dz = b.z - a.z;
        const length = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (length * length || 1)));
        if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) <= radius) { near = true; density += Math.min(length, radius * 2); }
      }
      if (near) nearbyRoads.push(road);
    }
    const nearbyJunctions = [...junctions].filter(j => Math.hypot(j.center.x - x, j.center.z - z) <= radius);
    const branches = nearbyJunctions.reduce((n, j) => n + Math.max(0, j.arms.length - 2), 0);
    return { network: { ...this.network, segments: nearbyRoads, intersections: nearbyJunctions },
      complexity: branches * 3 + Math.max(0, nearbyRoads.length - 2) + Math.min(2, density / 900) };
  }
  private tile(x: number, z: number): HTMLCanvasElement | null {
    const key = `${x},${z}`, entry = this.cells.get(key);
    if (!entry) return null;
    let canvas = this.tiles.get(key);
    if (canvas) { this.tiles.delete(key); this.tiles.set(key, canvas); return canvas; }
    canvas = document.createElement('canvas'); canvas.width = canvas.height = PIXELS;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.setTransform(PIXELS / TILE, 0, 0, PIXELS / TILE, -x * PIXELS, -z * PIXELS);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const edge of entry.edges) {
      ctx.strokeStyle = edge.major ? '#b4b6b7' : '#d0d2d2'; ctx.lineWidth = Math.max(2, edge.width);
      ctx.beginPath(); ctx.moveTo(edge.ax, edge.az); ctx.lineTo(edge.bx, edge.bz); ctx.stroke();
    }
    ctx.fillStyle = '#c2c5c5';
    for (const j of entry.junctions) { const p = this.point(j.center.x, j.center.z); ctx.fillRect(p.x - j.halfExtentX, p.y - j.halfExtentZ, j.halfExtentX * 2, j.halfExtentZ * 2); }
    this.tiles.set(key, canvas); this.rasterizations++;
    if (this.tiles.size > 24) this.tiles.delete(this.tiles.keys().next().value!);
    return canvas;
  }
  public draw(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, x: number, z: number, yaw: number, viewMetres: number): void {
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
    ctx.fillStyle = '#f2f3ef'; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (this.network) {
      const p = this.point(x, z), scale = rect.width / viewMetres, halfH = rect.height / scale / 2;
      const left = p.x - viewMetres / 2, top = p.y - halfH;
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((p.x + viewMetres / 2) / TILE); tx++)
        for (let tz = Math.floor(top / TILE); tz <= Math.floor((p.y + halfH) / TILE); tz++) {
          const tile = this.tile(tx, tz); if (tile) ctx.drawImage(tile, rect.x + (tx * TILE - left) * scale, rect.y + (tz * TILE - top) * scale, TILE * scale, TILE * scale);
        }
      ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2); ctx.rotate(-yaw);
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(11, 12); ctx.lineTo(0, 7); ctx.lineTo(-11, 12); ctx.closePath();
      ctx.fillStyle = '#367f91'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#727778'; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Map unavailable', rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    ctx.restore();
  }
  public dispose(): void { this.tiles.clear(); this.cells.clear(); this.network = undefined; }
}

/** Display-only zoom. Speed smoothing, complexity hysteresis and minimum scale hold. */
export class AdaptiveMapZoom {
  public viewMetres = 90;
  public targetMetres = 90;
  private speed = 0;
  private complex = false;
  private wide = false;
  private hold = 0;
  public update(dt: number, speed: number, complexity: number, selector: string): number {
    const step = Math.max(0, Math.min(.25, Number.isFinite(dt) ? dt : 0));
    this.speed += (Math.abs(speed) - this.speed) * (1 - Math.exp(-step * 1.3));
    if (complexity >= 5) this.complex = true; else if (complexity <= 3) this.complex = false;
    if (this.speed >= 24) this.wide = true; else if (this.speed <= 19) this.wide = false;
    const parking = selector === 'P' || selector === 'R' || this.speed < 2;
    const target = parking ? 90 : this.complex ? (this.wide ? 200 : 150) : this.wide ? 500 : 240;
    this.hold = Math.max(0, this.hold - step);
    if (target !== this.targetMetres && (parking || this.hold === 0)) { this.targetMetres = target; this.hold = 2.5; }
    this.viewMetres += (this.targetMetres - this.viewMetres) * (1 - Math.exp(-step * 1.4));
    return this.viewMetres;
  }
}
