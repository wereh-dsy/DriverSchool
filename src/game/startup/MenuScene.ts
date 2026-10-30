import { Scene, Color, Mesh, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, HemisphereLight, DirectionalLight, PerspectiveCamera, Group, Texture, type WebGLRenderer } from 'three';
import { VehicleAssetRegistry } from '../../vehicle/visual/VehicleAssetRegistry';
import { getVehicleDescriptor, VEHICLE_IDS, isVehicleId, type VehicleId } from '../../vehicle/VehicleCatalog';
import { prepareVehicleExterior, buildVehicleStaticWheels } from '../../vehicle/visual/VehicleStaticAssets';
import { createGameRenderer } from '../createGameRenderer';
import { nextPaint, loadingMark } from '../../loading/Loading';

/** A floor, lights and the selected exterior. No world, cockpit or simulation. */
export class MenuScene {
  readonly renderer: WebGLRenderer;
  readonly assets = new VehicleAssetRegistry();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 16 / 9, .1, 100);
  private readonly floor = new Mesh(new PlaneGeometry(70, 70), new MeshStandardMaterial({ color: 0x282d30, roughness: .92 }));
  private visual: Group | undefined;
  private owner: object | undefined;
  private generation = 0;
  private screen = 'main';
  private stopped = false;
  private transferred = false;
  private warmTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> = Promise.resolve();
  private settleFrame = 0;
  private readonly contactShadow: Mesh<PlaneGeometry,MeshBasicMaterial>;
  constructor(host: HTMLElement) {
    this.renderer = createGameRenderer(); host.prepend(this.renderer.domElement);
    this.scene.background = new Color(0x252b30);
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -.015; this.floor.receiveShadow = true;
    this.scene.add(this.floor, new HemisphereLight(0xd7e4ee, 0x454743, 2));
    const sun = new DirectionalLight(0xfff7ea, 3); sun.position.set(8, 10, -8); this.scene.add(sun);
    const rim=new DirectionalLight(0xc6e0f0,1.35);rim.position.set(-6,4,5);this.scene.add(rim);
    // Static presentation contact: one small texture/quad, no shadow render pass.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d')!;
    const gradient=ctx.createRadialGradient(64,64,12,64,64,64);gradient.addColorStop(0,'#0009');gradient.addColorStop(.55,'#0005');gradient.addColorStop(1,'#0000');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    this.contactShadow=new Mesh(new PlaneGeometry(1,1),new MeshBasicMaterial({map:new CanvasTexture(canvas),transparent:true,depthWrite:false}));
    this.contactShadow.rotation.x=-Math.PI/2;this.contactShadow.position.y=-.012;this.scene.add(this.contactShadow);
    this.camera.layers.enableAll(); window.addEventListener('resize', this.resize);
    this.resize();
  }
  select(id: string): Promise<void> {
    if (!isVehicleId(id) || this.stopped) return Promise.resolve();
    const request = ++this.generation;
    if (this.warmTimer) clearTimeout(this.warmTimer);
    // Serialize ownership changes; never dispose a scene while compileAsync borrows it.
    this.pending = this.pending.catch(() => {}).then(async () => {
      if (request !== this.generation || this.stopped) return;
      await nextPaint();
      const config = getVehicleDescriptor(id).visualConfig;
      prepareVehicleExterior(config, this.assets);
      await nextPaint();
      if (request !== this.generation || this.stopped) return;
      const root = new Group(); this.assets.retain(config);
      try {
      root.add(this.assets.section(config, 'exterior', () => {}));
      await nextPaint();
      root.add(this.assets.section(config, 'wheels', target => {
        // Some wheel atlases are borrowed from the exterior by the existing builder.
        const wheels = buildVehicleStaticWheels(root, config);
        for (const pivot of Object.values(wheels.pivots)) target.add(pivot);
      }));
      const textures = new Set<Texture>();
      root.traverse(o => { if (o instanceof Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const value of Object.values(m)) if (value instanceof Texture && !value.isRenderTargetTexture) textures.add(value); });
      let batch = 0;
      for (const texture of textures) { this.renderer.initTexture(texture); if (++batch % 4 === 0) await nextPaint(); }
      await this.renderer.compileAsync(root, this.camera, this.scene);
      if (request !== this.generation || this.stopped) { this.release(root, config); return; }
      if (this.visual) this.release(this.visual, this.owner!);
      this.visual = root; this.owner = config; this.scene.add(root);
      this.contactShadow.scale.set(config.dimensions.width*1.65,config.dimensions.length*1.22,1);
      this.frame(config.dimensions.length);if(this.screen==='vehicles')this.settle(); this.assets.prune();
      loadingMark('vehicleReady'); loadingMark('menuSceneReady');
      this.scheduleNeighbours(id);
      } catch (error) {
        if (this.visual !== root) this.release(root, config);
        throw error;
      }
    });
    return this.pending;
  }
  private scheduleNeighbours(id: VehicleId): void {
    const index = VEHICLE_IDS.indexOf(id), neighbours = [VEHICLE_IDS[(index + 1) % VEHICLE_IDS.length]!, VEHICLE_IDS[(index + VEHICLE_IDS.length - 1) % VEHICLE_IDS.length]!];
    const warm = () => {
      if (this.stopped || !neighbours.length) return;
      prepareVehicleExterior(getVehicleDescriptor(neighbours.shift()!).visualConfig, this.assets);
      this.assets.prune();
      if (neighbours.length) this.warmTimer = setTimeout(warm, 700);
    };
    this.warmTimer = setTimeout(warm, 900);
  }
  setScreen(screen: string): void {
    this.screen = screen;cancelAnimationFrame(this.settleFrame);
    if(screen==='loading'&&this.warmTimer)clearTimeout(this.warmTimer);
    if(screen==='vehicles')this.settle();else this.frame();
  }
  private settle(): void {
    cancelAnimationFrame(this.settleFrame);
    if(this.stopped||matchMedia('(prefers-reduced-motion: reduce)').matches){this.frame();return;}
    const started=performance.now();
    const tick=(now:number)=>{
      if(this.stopped||this.screen!=='vehicles')return;
      const t=Math.min(1,(now-started)/240);this.frame(this.length,1+.035*(1-t)**3);
      if(t<1)this.settleFrame=requestAnimationFrame(tick);
    };
    this.settleFrame=requestAnimationFrame(tick);
  }
  private length = 5;
  private frame(length = this.length, distance = 1): void {
    if (this.stopped) return;
    this.length = length;
    this.camera.position.set(length * .94 * distance, length * .50, -length * 1.20 * distance);
    this.camera.lookAt(this.screen === 'vehicles' ? 0 : -length * .36, .65, 0);
    this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera);
  }
  private readonly resize = (): void => {
    if (this.stopped) return;
    const width = window.innerWidth, height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.frame();
  };
  private release(root: Group, owner: object): void {
    root.removeFromParent(); const materials = new Set<MeshStandardMaterial>();
    root.traverse(o => { if (o instanceof Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
    for (const material of materials) material.dispose();
    this.assets.release(owner);
  }
  async transfer(): Promise<{ renderer: WebGLRenderer; assets: VehicleAssetRegistry }> {
    if (this.transferred) return { renderer: this.renderer, assets: this.assets };
    this.stopped = true; this.generation++; if (this.warmTimer) clearTimeout(this.warmTimer);
    cancelAnimationFrame(this.settleFrame);
    await this.pending.catch(() => {}); window.removeEventListener('resize', this.resize);
    if (this.visual) { this.release(this.visual, this.owner!); this.visual = undefined; }
    this.floor.geometry.dispose(); this.floor.material.dispose();
    this.contactShadow.geometry.dispose();this.contactShadow.material.map?.dispose();this.contactShadow.material.dispose();this.transferred = true;
    return { renderer: this.renderer, assets: this.assets };
  }
  async dispose(): Promise<void> {
    if (this.transferred) return;
    await this.transfer(); this.assets.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
