import { worldToRoadMap, type RoadNetworkData } from '../world/navigation/RoadNetwork';

export type MinimapPosition = 'off' | 'top-left' | 'top-right';

/** Cached 2D road plan plus player marker; no additional world camera. */
export class Minimap {
  private readonly root = document.createElement('section');
  private readonly canvas = document.createElement('canvas');
  private readonly roadLayer = document.createElement('canvas');
  private readonly drawing: CanvasRenderingContext2D | null;
  private network: RoadNetworkData | undefined;
  private position: MinimapPosition = 'top-right';
  private elapsed = Infinity;
  private readonly size = 208;
  private readonly padding = 10;

  public constructor(host: HTMLElement) {
    this.root.className = 'hud-minimap';
    this.root.setAttribute('aria-label', '科目三小地图：道路、路口和车辆朝向');
    const label = document.createElement('header');
    label.textContent = '道路地图 · N ↑';
    this.canvas.width = this.canvas.height = this.roadLayer.width = this.roadLayer.height = this.size * 2;
    this.drawing = this.canvas.getContext('2d');
    this.drawing?.scale(2, 2);
    this.root.append(label, this.canvas);
    host.prepend(this.root);
    this.refreshVisibility();
  }

  public setPosition(position: MinimapPosition): void {
    this.position = position;
    this.elapsed = Infinity;
    this.refreshVisibility();
  }

  public setNetwork(network: RoadNetworkData | undefined): void {
    this.network = network;
    this.elapsed = Infinity;
    this.refreshVisibility();
    const ctx = this.roadLayer.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    if (!network) return;
    const scale = this.mapScale();
    ctx.strokeStyle = '#a8b8c2';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of network.segments) {
      ctx.lineWidth = Math.max(2.5, road.width * scale);
      ctx.beginPath();
      road.centerline.forEach((point, i) => {
        const mapped = this.mapPoint(point.x, point.z);
        if (i === 0) ctx.moveTo(mapped.x, mapped.y); else ctx.lineTo(mapped.x, mapped.y);
      });
      ctx.stroke();
    }
    ctx.fillStyle = '#dbe6eb';
    for (const junction of network.intersections) {
      const mapped = this.mapPoint(junction.center.x, junction.center.z);
      ctx.fillRect(mapped.x - junction.halfExtentX * scale, mapped.y - junction.halfExtentZ * scale,
        junction.halfExtentX * scale * 2, junction.halfExtentZ * scale * 2);
    }
  }

  public update(x: number, z: number, yaw: number, dt: number): void {
    if (this.root.hidden || !this.network || !this.drawing) return;
    this.elapsed += dt;
    if (this.elapsed < 1 / 20) return;
    this.elapsed = 0;
    const ctx = this.drawing;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(this.roadLayer, 0, 0, this.size, this.size);
    const point = this.mapPoint(x, z);
    ctx.save();
    ctx.translate(point.x, point.y);
    // +Y on canvas is +Z in world; yaw zero points up, positive yaw turns left.
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = '#ffd47e';
    ctx.strokeStyle = '#17212a';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  public dispose(): void { this.root.remove(); }

  private mapScale(): number {
    const bounds = this.network!.bounds;
    return (this.size - this.padding * 2) / Math.max(
      bounds.maximumX - bounds.minimumX, bounds.maximumZ - bounds.minimumZ, 1);
  }

  private mapPoint(x: number, z: number): { x: number; y: number } {
    const bounds = this.network!.bounds;
    const normalized = worldToRoadMap(bounds, x, z);
    const spanX = bounds.maximumX - bounds.minimumX;
    const spanZ = bounds.maximumZ - bounds.minimumZ;
    const scale = this.mapScale();
    return { x: (this.size - spanX * scale) / 2 + normalized.x * spanX * scale,
      y: (this.size - spanZ * scale) / 2 + normalized.y * spanZ * scale };
  }

  private refreshVisibility(): void {
    this.root.hidden = this.position === 'off' || !this.network || !this.drawing;
    this.root.dataset.position = this.position;
  }
}
