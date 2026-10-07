import {
  BoxGeometry, BufferGeometry, Color, Float32BufferAttribute,
  Mesh, MeshStandardMaterial, Object3D, SpotLight,
} from 'three';

import type { VehicleVisual } from './VehicleVisual';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';
import type { VehicleLightingState, VehicleLightMode } from '../control/VehicleLightingController';
export type { VehicleLightingState, VehicleLightMode } from '../control/VehicleLightingController';

const lightsOff = (): VehicleLightingState => ({
  mainLightMode: 'off', fogLightsEnabled: false, leftTurnSignal: false, rightTurnSignal: false,
  hazard: false, brakeLight: false, reverseLight: false, highBeamFlash: false,
  effectiveHighBeam: false, positionLight: false, lowBeam: false, leftBlinkOn: false, rightBlinkOn: false,
});

/** Real exterior lamp meshes. The controller supplies all logical states. */
export class VehicleLighting {
  private readonly headlamps: readonly [SpotLight, SpotLight];
  private readonly targets: readonly [Object3D, Object3D];
  private readonly foglamps: readonly [SpotLight, SpotLight, SpotLight];
  private readonly fogTargets: readonly [Object3D, Object3D, Object3D];
  private readonly lampMeshes: Mesh[] = [];
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private state = lightsOff();

  public constructor(private readonly vehicle: VehicleVisual) {
    const sport = vehicle.config.body.profile === 'sport-coupe';
    const halfLength = (vehicle.config.dimensions.length - (sport ? 0.12 : 0.0226)) * 0.5;
    const halfWidth = vehicle.config.dimensions.width * 0.5 - 0.005;
    const executive = vehicle.config.body.design === 'executive';
    const frontZ = -halfLength - 0.01;
    const rearZ = halfLength + 0.009;
    // Authored lenses remain housings, not permanently glowing outputs.
    vehicle.exteriorRoot.traverse((object) => {
      if (!(object instanceof Mesh) || !['headlamp', 'tail-lamp'].includes(object.userData.vehicleBodyPart)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material instanceof MeshStandardMaterial) material.emissiveIntensity = 0;
    });
    for (const [key, color] of [
      ['head', 0xfff1cf], ['position', 0xffefc5], ['tail', 0xc0192d], ['brake', 0xff2131],
      ['reverse', 0xe8f4ff], ['fogFront', 0xffefc5], ['fogRear', 0xff253b],
      ['left', 0xffa321], ['right', 0xffa321],
    ] as const) this.materials.set(key, new MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0, roughness: 0.24, metalness: 0.08,
      toneMapped: false,
    }));
    const leftTarget = new Object3D();
    const rightTarget = new Object3D();
    this.targets = [leftTarget, rightTarget];
    this.headlamps = [this.createHeadlamp(executive ? -halfWidth * .66 : -0.55, frontZ + 0.025, leftTarget),
      this.createHeadlamp(executive ? halfWidth * .66 : 0.55, frontZ + 0.025, rightTarget)];
    vehicle.root.add(...this.headlamps, ...this.targets);
    this.fogTargets = [new Object3D(), new Object3D(), new Object3D()];
    this.foglamps = [
      this.createFoglamp('Left front fog beam', -0.62, frontZ - 0.012, false, this.fogTargets[0]),
      this.createFoglamp('Right front fog beam', 0.62, frontZ - 0.012, false, this.fogTargets[1]),
      this.createFoglamp('Rear fog light spill', -0.29, rearZ + 0.012, true, this.fogTargets[2]),
    ];
    vehicle.root.add(...this.foglamps, ...this.fogTargets);
    for (const side of [-1, 1] as const) {
      const label = side < 0 ? 'Left' : 'Right';
      const signalKey = side < 0 ? 'left' : 'right';
      this.addBox(label + ' low/high headlamp', 'head', [executive ? .43 : .33, executive ? .040 : .061, .004], [side * (executive ? halfWidth * .66 : .54), executive ? .735 : .641, frontZ]);
      this.addBox(label + ' front position lamp', 'position', [0.24, 0.016, 0.004], [side * (executive ? halfWidth * .66 : .55), executive ? .720 : .588, frontZ]);
      this.addBox(label + ' front fog lamp', 'fogFront', [0.13, 0.048, 0.004], [side * (executive ? .76 : .62), .355, frontZ + .004]);
      this.addBox(label + ' rear tail lamp', 'tail', [0.32, 0.025, 0.004], [side * (executive ? halfWidth * .66 : .55), executive ? .778 : .731, rearZ]);
      this.addBox(label + ' brake lamp', 'brake', [0.33, 0.036, 0.004], [side * (executive ? halfWidth * .66 : .55), executive ? .750 : .676, rearZ]);
      this.addBox(label + ' reverse lamp', 'reverse', [0.14, 0.026, 0.004], [side * (executive ? .52 : .49), executive ? .715 : .602, rearZ]);
      this.addBox(label + ' front turn signal', signalKey, [0.13, 0.038, 0.004], [side * (executive ? .81 : .73), executive ? .733 : .6, frontZ]);
      this.addBox(label + ' rear turn signal', signalKey, [0.17, 0.024, 0.004], [side * (executive ? .80 : .56), executive ? .763 : .633, rearZ]);
      // The same lamp output wraps around a real rear corner, visible to the
      // real planar mirror; there is no mirror-specific lighting model.
      this.addCornerLens(label + ' tail corner lens', 'tail', side, halfWidth, halfLength, 0.731, 0.023);
      this.addCornerLens(label + ' brake corner lens', 'brake', side, halfWidth, halfLength, 0.676, 0.031);
      this.addCornerLens(label + ' turn corner lens', signalKey, side, halfWidth, halfLength, 0.631, 0.022);
      this.addCornerLens(label + ' reverse corner lens', 'reverse', side, halfWidth, halfLength, 0.594, 0.016);
      this.addCornerLens(label + ' rear fog corner lens', 'fogRear', side, halfWidth, halfLength, 0.559, 0.016);
    }
    this.addBox('Rear fog lamp', 'fogRear', [0.13, 0.052, 0.004], [-0.29, 0.383, rearZ]);
    this.addBox('High-mounted centre brake lamp', 'brake', [0.2, 0.024, 0.007],
      [0, executive ? vehicle.config.body.trunkDeckY + .08 : sport ? .78 : .84,
        executive ? halfLength - vehicle.config.body.trunkLength - .075 : sport ? 1.105 : 1.015]);
    this.applyState(this.state);
  }

  public get lightMode(): VehicleLightMode { return this.state.mainLightMode; }

  public applyState(state: Readonly<VehicleLightingState>): void {
    this.state = { ...state };
    const output = (key: string, intensity: number): void => {
      this.materials.get(key)!.emissiveIntensity = intensity;
    };
    output('head', state.effectiveHighBeam ? 2.3 : state.lowBeam ? 1.35 : 0);
    output('position', state.positionLight ? 0.65 : 0);
    output('tail', state.positionLight ? 0.8 : 0);
    output('brake', state.brakeLight ? 2.1 : 0);
    output('reverse', state.reverseLight ? 1.4 : 0);
    output('fogFront', state.fogLightsEnabled ? 2.6 : 0);
    output('fogRear', state.fogLightsEnabled ? 3 : 0);
    output('left', state.leftBlinkOn ? 1.8 : 0);
    output('right', state.rightBlinkOn ? 1.8 : 0);
    this.materials.get('head')!.color.set(state.effectiveHighBeam ? 0xddefff : 0xfff1cf);
    const mainBeam = state.lowBeam || state.effectiveHighBeam;
    for (const light of this.headlamps) {
      light.intensity = mainBeam ? (state.effectiveHighBeam ? 850 : 380) : 0;
      light.distance = state.effectiveHighBeam ? 130 : 65;
      light.angle = state.effectiveHighBeam ? Math.PI / 12 : Math.PI / 5.5;
    }
    for (const target of this.targets) {
      target.position.y = state.effectiveHighBeam ? 0.15 : -0.65;
      target.position.z = state.effectiveHighBeam ? -90 : -38;
    }
    this.foglamps[0].intensity = state.fogLightsEnabled ? 150 : 0;
    this.foglamps[1].intensity = state.fogLightsEnabled ? 150 : 0;
    this.foglamps[2].intensity = state.fogLightsEnabled ? 28 : 0;
  }

  /** Compatibility during migration; the game's controller remains authoritative. */
  public setMode(mode: VehicleLightMode): void {
    this.applyState({ ...this.state, mainLightMode: mode, positionLight: mode !== 'off',
      lowBeam: mode === 'low' || mode === 'high', effectiveHighBeam: mode === 'high' || this.state.highBeamFlash,
      fogLightsEnabled: mode !== 'off' && this.state.fogLightsEnabled });
  }
  public cycle(): VehicleLightMode {
    const modes: readonly VehicleLightMode[] = ['off', 'position', 'low', 'high'];
    this.setMode(modes[(modes.indexOf(this.lightMode) + 1) % 4]!);
    return this.lightMode;
  }
  public setIndicators(leftOn: boolean, rightOn: boolean): void {
    this.applyState({ ...this.state, leftBlinkOn: leftOn, rightBlinkOn: rightOn });
  }

  public dispose(): void {
    for (const light of this.headlamps) light.removeFromParent();
    for (const target of this.targets) target.removeFromParent();
    for (const light of this.foglamps) light.removeFromParent();
    for (const target of this.fogTargets) target.removeFromParent();
    for (const lens of this.lampMeshes) { lens.removeFromParent(); lens.geometry.dispose(); }
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  private createHeadlamp(x: number, z: number, target: Object3D): SpotLight {
    const light = new SpotLight(new Color(0xffefc0), 0, 55, Math.PI / 7.5, 0.42, 1.25);
    light.name = x < 0 ? 'Left low/high beam' : 'Right low/high beam';
    light.position.set(x, this.vehicle.config.body.design === 'executive' ? .735 : .66, z);
    light.castShadow = false;
    light.layers.enable(VEHICLE_RENDER_LAYERS.EXTERIOR);
    light.layers.enable(VEHICLE_RENDER_LAYERS.INTERIOR);
    light.target = target;
    target.position.set(x * 0.82, 0.08, -34);
    return light;
  }

  private createFoglamp(name: string, x: number, z: number, rear: boolean, target: Object3D): SpotLight {
    const light = new SpotLight(rear ? 0xff253b : 0xffefc5, 0, rear ? 6 : 24,
      rear ? Math.PI / 2.5 : Math.PI / 3.2, 0.65, 1.4);
    light.name = name;
    light.position.set(x, rear ? 0.383 : 0.355, z);
    light.castShadow = false;
    light.layers.enable(VEHICLE_RENDER_LAYERS.EXTERIOR);
    light.layers.enable(VEHICLE_RENDER_LAYERS.INTERIOR);
    light.target = target;
    target.position.set(x, rear ? 0.10 : -0.25, z + (rear ? 2 : -8));
    return light;
  }

  private addBox(name: string, key: string, size: readonly [number, number, number], position: readonly [number, number, number]): void {
    const lens = new Mesh(new BoxGeometry(...size), this.materials.get(key)!);
    lens.name = name;
    lens.position.set(...position);
    this.addLens(lens, key);
  }

  private addCornerLens(name: string, key: string, side: -1 | 1, halfWidth: number, halfLength: number, y: number, height: number): void {
    if (this.vehicle.config.body.design === 'executive') {
      y = key === 'tail' ? .778 : key === 'brake' ? .750 : key === 'reverse' ? .715 : key === 'fogRear' ? .56 : .763;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([
      side * halfWidth * 0.935, y - height * 0.5, halfLength - 0.29,
      side * halfWidth * 0.935, y + height * 0.5, halfLength - 0.29,
      side * halfWidth * 0.87, y + height * 0.5, halfLength + 0.007,
      side * halfWidth * 0.87, y - height * 0.5, halfLength + 0.007,
    ], 3));
    geometry.setIndex(side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    geometry.computeVertexNormals();
    this.addLens(new Mesh(geometry, this.materials.get(key)!), key, name);
  }

  private addLens(lens: Mesh, key: string, name?: string): void {
    if (name !== undefined) lens.name = name;
    lens.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
    lens.userData.vehicleBodyPart = 'active-lamp';
    lens.userData.lightingOutput = key;
    lens.castShadow = false;
    this.lampMeshes.push(lens);
    this.vehicle.exteriorRoot.add(lens);
  }
}
