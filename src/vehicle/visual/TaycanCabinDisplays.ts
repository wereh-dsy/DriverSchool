import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { TaycanCenterDisplay } from './TaycanCenterDisplay';
import { TaycanClimateDisplay, TaycanSportChrono } from './TaycanAuxDisplays';
import type { PremiumEVInstruments } from './PremiumEVInstruments';

/** Local mounts only; exterior, full dashboard, doors and seats remain in their builders. */
export class TaycanCabinDisplays {
  public readonly center: TaycanCenterDisplay;
  public readonly climate: TaycanClimateDisplay;
  public readonly chrono: TaycanSportChrono;
  private readonly touchSurfaces: T.Object3D[];
  private readonly spillMaterials: T.MeshStandardMaterial[] = [];
  public constructor(root: T.Group, assets: VehicleAssetRegistry, private readonly instrument: PremiumEVInstruments) {
    this.center = new TaycanCenterDisplay(assets); this.center.position.set(.13, .803, -.449); root.add(this.center);
    this.climate = new TaycanClimateDisplay(assets); this.climate.position.set(.10, .605, -.10); this.climate.rotation.x = -.72; root.add(this.climate);
    this.chrono = new TaycanSportChrono(assets); this.chrono.position.set(.10, .906, -.70); this.chrono.rotation.x = -.12; root.add(this.chrono);
    const trim = new T.MeshStandardMaterial({ color: 0x11171c, roughness: .28, metalness: .12 });
    const bezel = new T.Mesh(new T.BoxGeometry(.438, .190, .014), trim); bezel.name = 'Taycan PCM embedded mount'; bezel.position.set(.13, .803, -.460); root.add(bezel);
    const lowerMount = new T.Mesh(new T.BoxGeometry(.245, .302, .016), trim); lowerMount.name = 'Taycan climate console mount'; lowerMount.position.copy(this.climate.position); lowerMount.rotation.copy(this.climate.rotation);
    lowerMount.position.z -= .011; lowerMount.position.y -= .009; root.add(lowerMount);
    this.center.onInstrumentPage = page => instrument.selectPage(page);
    this.climate.onHome = () => this.center.selectPage('navigation');
    this.touchSurfaces = [this.center.surface.glass, this.climate.surface.glass, instrument.surface.glass];
    root.traverse(o => {
      if (o instanceof T.Mesh && o.name.startsWith('Premium EV red lower fascia') && o.material instanceof T.MeshStandardMaterial) {
        const m = o.material.clone(); o.material = m; m.emissive.setHex(0x6a2125); this.spillMaterials.push(m);
      }
    });
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.center.update(t, dt); this.climate.update(t, dt); this.chrono.update(t, dt);
    for (const m of this.spillMaterials) m.emissiveIntensity = (t.ignitionOn === false ? 0 : .018) * (1 - (t.ambientDaylight ?? 1));
  }
  public click(raycaster: T.Raycaster): boolean {
    const hit = raycaster.intersectObjects(this.touchSurfaces, false)[0]; if (!hit?.uv) return false;
    if (hit.object === this.center.surface.glass) return this.center.click(hit.uv);
    if (hit.object === this.climate.surface.glass) return this.climate.click(hit.uv);
    return this.instrument.click(hit.uv);
  }
}
