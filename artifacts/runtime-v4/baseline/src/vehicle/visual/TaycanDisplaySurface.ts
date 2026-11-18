import * as T from 'three';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';

const fallbackAssets = new VehicleAssetRegistry();
export const TAYCAN_FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
export const TAYCAN_COLORS = { white: '#e5e9ee', secondary: '#8f979f', faint: '#3d444c', blue: '#8ec4de',
  green: '#8bbda8', amber: '#e5be76', red: '#df6a64', background: '#07090c' } as const;
export interface ScreenRect { x: number; y: number; width: number; height: number }
export const text = (c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number,
  color: string = TAYCAN_COLORS.white, align: CanvasTextAlign = 'left', weight = 400): void => {
  c.font = `${weight} ${size}px ${TAYCAN_FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
};
export function line(c: CanvasRenderingContext2D, x: number, y: number, x2: number, y2: number, color: string = TAYCAN_COLORS.faint, width = 1): void {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
}
/** Clip the curved outline without stretching UI coordinates into that outline. */
export function taycanScreenGeometry(width: number, height: number, rect: ScreenRect, pixelsW: number, pixelsH: number, curved: boolean): T.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const segments = curved ? 32 : 1;
  for (let i = 0; i <= segments; i++) {
    const u = (rect.x + rect.width * i / segments) / pixelsW, nx = 2 * u - 1;
    const rectTop = rect.y / pixelsH, rectBottom = (rect.y + rect.height) / pixelsH;
    const top = Math.max(rectTop, curved ? .022 * nx * nx / height : 0);
    const bottom = Math.min(rectBottom, curved ? 1 - .055 * Math.abs(nx) ** 4 / height : 1);
    for (const v of [top, bottom]) {
      positions.push((u - .5) * width, (.5 - v) * height, curved ? .035 * nx * nx : 0);
      uvs.push(i / segments, 1 - (v - rectTop) / (rectBottom - rectTop));
    }
    if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export class TaycanDynamicRegion {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  public readonly material: T.MeshBasicMaterial;
  public readonly mesh: T.Mesh;
  public redraws = 0;
  public elapsed = Infinity;
  private key = '';
  public constructor(public readonly rect: ScreenRect, geometry: T.BufferGeometry, name: string) {
    this.canvas.width = rect.width; this.canvas.height = rect.height;
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.minFilter = T.LinearFilter; this.texture.generateMipmaps = false;
    this.material = new T.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new T.Mesh(geometry, this.material); this.mesh.name = name; this.mesh.position.z = .0007; this.mesh.renderOrder = 3;
  }
  public invalidate(): void { this.key = ''; this.elapsed = Infinity; }
  public update(key: string, interval: number, draw: (c: CanvasRenderingContext2D) => void): boolean {
    if (this.elapsed < interval || key === this.key) return false;
    const c = this.canvas.getContext('2d'); if (!c) return false;
    c.clearRect(0, 0, this.rect.width, this.rect.height);
    c.save(); c.translate(-this.rect.x, -this.rect.y); draw(c); c.restore();
    this.key = key; this.elapsed = 0; this.redraws++; this.texture.needsUpdate = true; return true;
  }
}

/** Existing per-display elapsed/dirty pattern, no additional global scheduler. */
export class TaycanDisplaySurface extends T.Group {
  public readonly staticTexture: T.CanvasTexture;
  public readonly staticMaterial: T.MeshPhysicalMaterial;
  public readonly glass: T.Mesh;
  public readonly regions: TaycanDynamicRegion[] = [];
  public brightness = 1;
  public constructor(public readonly pixelWidth: number, public readonly pixelHeight: number,
    public readonly width: number, public readonly height: number, key: string,
    drawStatic: (c: CanvasRenderingContext2D) => void, assets?: VehicleAssetRegistry, public readonly curved = false,
    circle = false) {
    super(); this.name = key;
    const cache = assets ?? fallbackAssets;
    const canvas = cache.canvas(key + '/static-v1', pixelWidth, pixelHeight, drawStatic);
    this.staticTexture = new T.CanvasTexture(canvas); this.staticTexture.colorSpace = T.SRGBColorSpace;
    this.staticTexture.minFilter = T.LinearFilter; this.staticTexture.generateMipmaps = false;
    this.staticMaterial = new T.MeshPhysicalMaterial({ map: this.staticTexture, color: 0x15191d,
      emissive: 0xffffff, emissiveMap: this.staticTexture, emissiveIntensity: 1,
      roughness: .30, metalness: 0, clearcoat: .08, clearcoatRoughness: .24, specularIntensity: .08, toneMapped: false });
    const rect = { x: 0, y: 0, width: pixelWidth, height: pixelHeight };
    const geometry = circle ? new T.CircleGeometry(width / 2, 48) : taycanScreenGeometry(width, height, rect, pixelWidth, pixelHeight, curved);
    const base = new T.Mesh(geometry, this.staticMaterial); base.name = key + ' static glass'; this.add(base);
    const backing = new T.Mesh(circle ? new T.CircleGeometry(width / 2 + .002, 48) : taycanScreenGeometry(width + .007, height + .007, rect, pixelWidth, pixelHeight, curved),
      new T.MeshStandardMaterial({ color: 0x13161a, roughness: .28, metalness: .32 }));
    backing.name = key + ' thin border'; backing.position.z = -.001; this.add(backing);
    this.glass = new T.Mesh(geometry, new T.MeshPhysicalMaterial({ color: 0x10151a, roughness: .12,
      clearcoat: .3, clearcoatRoughness: .16, specularIntensity: .15, transparent: true, opacity: .012, depthWrite: false }));
    this.glass.name = key + ' reflective cover'; this.glass.position.z = .0014; this.glass.renderOrder = 4; this.add(this.glass);
  }
  public region(rect: ScreenRect, name: string, circle = false): TaycanDynamicRegion {
    const geometry = circle ? new T.CircleGeometry(this.width / 2, 48) : taycanScreenGeometry(this.width, this.height, rect, this.pixelWidth, this.pixelHeight, this.curved);
    const region = new TaycanDynamicRegion(rect, geometry, name); this.regions.push(region); this.add(region.mesh); return region;
  }
  public advance(dt: number): void { for (const r of this.regions) r.elapsed += Math.max(0, dt); }
  public luminance(target: number, dt: number, opacity = 1): void {
    this.brightness = T.MathUtils.damp(this.brightness, target, 4, dt);
    this.staticMaterial.emissiveIntensity = this.brightness * opacity;
    for (const r of this.regions) { r.material.color.setScalar(this.brightness); r.material.opacity = opacity; }
  }
}

/** Auto dimming uses the same daylight/lamp inputs already supplied to every instrument. */
export function taycanBrightness(daylight: number | undefined, lamps: boolean, instrument = false): number {
  const day = Math.max(0, Math.min(1, daylight ?? 1));
  return (instrument ? .66 : .48) + day * (instrument ? .32 : .40) - (lamps && day < .5 ? .035 : 0);
}
