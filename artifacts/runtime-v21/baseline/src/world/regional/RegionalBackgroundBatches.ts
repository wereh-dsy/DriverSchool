import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3, type Material } from 'three';
import type { VisualGeometryData } from '../city/VisualStreamingData';
import type { WorldRenderResources } from '../render/WorldRenderResources';

const QUEUE_BYTES = 8 * 1024 * 1024;
const PAGE_BYTES = 1024 * 1024;
const COALESCE_MS = 200;

interface Addition {
  key: string;
  bucket: string;
  batch: string;
  data: VisualGeometryData;
  material: Material;
  bytes: number;
  received: number;
}

interface Page { mesh: Mesh; bytes: number }

/** Append immutable spatial pages. Later tiles never copy or upload an earlier page. */
export class RegionalBackgroundBatches {
  constructor(private readonly sectorSize=500,private readonly resources?:WorldRenderResources){}
  private observer?:(mesh:Mesh,added:boolean)=>void;
  setObserver(observer:(mesh:Mesh,added:boolean)=>void):void{this.observer=observer;}
  private releaseGeometry(mesh:Mesh):void{if(mesh.userData.worldGeometryLease)this.resources!.release(mesh.geometry);else mesh.geometry.dispose();}
  readonly root = new Group();
  private readonly pages = new Map<string, Page[]>();
  private readonly queued: Addition[] = [];
  private readonly pendingTiles = new Map<string, number>();
  private prepare?: (root: Group) => Promise<unknown>;
  private staging?: { root: Group; bucket: string; bytes: number };
  private preparation?: Promise<unknown>;
  private cancelled = false;
  private queuedBytes = 0;
  private publishedBytes = 0;
  private peakStagingBytes = 0;
  private readonly expiredPages:Page[]=[];
  error?: Error;

  setPreparation(prepare: (root: Group) => Promise<unknown>): void { this.prepare = prepare; }
  get pendingPreparation() { return this.preparation; }
  get ready() { return !this.queued.length && !this.preparation; }
  get canAccept() { return this.queuedBytes < QUEUE_BYTES; }
  get count() { return this.root.children.length; }
  isPending(key: string): boolean { return this.pendingTiles.has(key); }
  bucketFor(key:string):string{const[x,z]=key.split(',').map(Number);return `${Math.floor(x!/4)},${Math.floor(z!/4)}`;}
  get statistics() {
    return {
      queued: this.queued.length, queuedBytes: this.queuedBytes, queueBudgetBytes: QUEUE_BYTES,
      publishedBytes: this.publishedBytes, pages: this.count,
      stagingBatches: Number(!!this.staging), stagingBytes: this.staging?.bytes ?? 0,
      peakStagingBytes: this.peakStagingBytes, pageTargetBytes: PAGE_BYTES,
    };
  }

  private finishTilePart(key: string): void {
    const remaining = (this.pendingTiles.get(key) ?? 1) - 1;
    if (remaining) this.pendingTiles.set(key, remaining);
    else this.pendingTiles.delete(key);
  }

  retainGroups(groups: ReadonlySet<string>): void {
    for (let i = this.queued.length - 1; i >= 0; i--) {
      const part = this.queued[i]!;
      if (groups.has(part.bucket)) continue;
      this.queuedBytes -= part.bytes;
      this.finishTilePart(part.key);
      this.queued.splice(i, 1);
    }
    if (this.staging && !groups.has(this.staging.bucket)) this.staging.root.userData.streamingWarmupCancelled = true;
    for (const [bucket, pages] of this.pages) {
      if (groups.has(bucket)) continue;
      for (const page of pages) {
        page.mesh.removeFromParent();
        this.observer?.(page.mesh,false);
        this.expiredPages.push(page);
        this.publishedBytes -= page.bytes;
      }
      this.pages.delete(bucket);
    }
  }
  releaseExpired(deadline=Infinity):void{
    let released=0;
    while(this.expiredPages.length&&released++<8&&performance.now()<deadline)this.releaseGeometry(this.expiredPages.shift()!.mesh);
  }

  append(key: string, role: number, data: VisualGeometryData, material: Material): void {
    if (this.cancelled || !data.position.length) return;
    const bucket = this.bucketFor(key);
    const bytes = data.position.byteLength + data.normal.byteLength + (data.color?.byteLength ?? 0) + (data.index?.byteLength ?? 0);
    const batch = `${bucket}:${role}:${material.uuid}:${Number(!!data.color)}`;
    this.queued.push({ key, bucket, batch, data, material, bytes, received: performance.now() });
    this.pendingTiles.set(key, (this.pendingTiles.get(key) ?? 0) + 1);
    this.queuedBytes += bytes;
  }

  advance(force = false): void {
    const first = this.queued[0];
    if (!first || this.preparation || this.cancelled || this.error) return;
    if (!force && this.queuedBytes < PAGE_BYTES && performance.now() - first.received < COALESCE_MS) return;

    const parts: Addition[] = [];
    let bytes = 0;
    for (let i = 0; i < this.queued.length;) {
      const part = this.queued[i]!;
      if (part.batch !== first.batch || (parts.length && bytes + part.bytes > PAGE_BYTES)) { i++; continue; }
      parts.push(part);
      bytes += part.bytes;
      this.queuedBytes -= part.bytes;
      this.queued.splice(i, 1);
    }

    const page = this.buildPage(parts);
    const root = new Group();
    root.name = '远景资源';
    root.userData.streamingPriority = 10000;
    root.add(page.mesh);
    root.updateMatrixWorld(true);
    this.staging = { root, bucket: first.bucket, bytes: page.bytes };
    this.peakStagingBytes = Math.max(this.peakStagingBytes, page.bytes);

    const publish = () => {
      if (this.cancelled || root.userData.streamingWarmupCancelled) {
        this.releaseGeometry(page.mesh);
        return;
      }
      const pages = this.pages.get(first.bucket) ?? [];
      pages.push(page);
      this.pages.set(first.bucket, pages);
      this.publishedBytes += page.bytes;
      this.root.add(page.mesh);
      this.observer?.(page.mesh,true);
    };
    const finish = () => {
      for (const part of parts) this.finishTilePart(part.key);
      root.clear();
      this.staging = undefined;
      this.preparation = undefined;
    };
    if (!this.prepare) {
      publish();
      finish();
      return;
    }
    this.preparation = Promise.resolve().then(() => this.prepare!(root)).then(publish, error => {
      this.releaseGeometry(page.mesh);
      this.error = error instanceof Error ? error : new Error(String(error));
    }).finally(finish);
  }

  private buildPage(parts: readonly Addition[]): Page {
    const first = parts[0]!;
    const count = parts.reduce((sum, part) => sum + part.data.position.length / 3, 0);
    const geometry = new BufferGeometry();
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
    const [cellX,cellZ]=first.bucket.split(',').map(Number),originX=cellX!*4*this.sectorSize,originZ=cellZ!*4*this.sectorSize;
    const color = first.data.color ? new Float32Array(count * 3) : undefined;
    const indexed = parts.some(part => !!part.data.index);
    const indexCount = parts.reduce((sum, part) => sum + (part.data.index?.length ?? part.data.position.length / 3), 0);
    const indices = indexed ? (count <= 65536 ? new Uint16Array(indexCount) : new Uint32Array(indexCount)) : undefined;
    let at = 0, indexAt = 0;
    const bounds = new Box3(), tileBounds = new Box3();
    for (const { data } of parts) {
      position.set(data.position, at * 3);
      for(let i=at*3;i<(at+data.position.length/3)*3;i+=3){position[i]!-=originX;position[i+2]!-=originZ;}
      normal.set(data.normal, at * 3);
      if (color && data.color) color.set(data.color, at * 3);
      if (indices) {
        const length = data.index?.length ?? data.position.length / 3;
        for (let i = 0; i < length; i++) indices[indexAt++] = at + (data.index?.[i] ?? i);
      }
      at += data.position.length / 3;
      tileBounds.min.fromArray(data.bounds);
      tileBounds.max.fromArray(data.bounds, 3);
      bounds.union(tileBounds);
    }
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('normal', new BufferAttribute(normal, 3));
    if (color) geometry.setAttribute('color', new BufferAttribute(color, 3));
    if (indices) geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.setDrawRange(0, indexCount);
    bounds.translate(new Vector3(-originX,0,-originZ));
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new Sphere());
    const mesh = new Mesh(geometry, first.material);
    mesh.name = `Regional background ${first.bucket}`;
    mesh.position.set(originX,0,originZ);mesh.updateMatrix();mesh.updateMatrixWorld(true);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    return { mesh, bytes: position.byteLength + normal.byteLength + (color?.byteLength ?? 0) + (indices?.byteLength ?? 0) };
  }

  cancel(): void {
    this.cancelled = true;
    this.queued.length = 0;
    this.queuedBytes = 0;
    this.pendingTiles.clear();
    if (this.staging) this.staging.root.userData.streamingWarmupCancelled = true;
  }

  dispose(): void {
    this.cancel();
    this.retainGroups(new Set());
    while(this.expiredPages.length)this.releaseGeometry(this.expiredPages.pop()!.mesh);
    this.root.clear();
  }
}
