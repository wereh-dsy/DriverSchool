import {
  BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute,
  Mesh, MeshStandardMaterial, Object3D, PointLight, SpotLight,
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
  private readonly nearFill: SpotLight[] = [];
  private readonly nearFillTargets: Object3D[] = [];
  private readonly foglamps: readonly [SpotLight, SpotLight, SpotLight];
  private readonly fogTargets: readonly [Object3D, Object3D, Object3D];
  private readonly lampMeshes: Mesh[] = [];
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private state = lightsOff();
  private ignitionOn: boolean | undefined;
  private wakeTime = Infinity;
  private readonly signatureSegments: { material: MeshStandardMaterial; side: number; index: number; turn: boolean }[] = [];
  private readonly blinkAge = [0, 0];
  private readonly previousBlink = [false, false];
  private readonly turnSpills: { light: PointLight; left: boolean }[] = [];

  public constructor(private readonly vehicle: VehicleVisual) {
    const sport = vehicle.config.body.profile === 'sport-coupe';
    const halfLength = (vehicle.config.dimensions.length - (sport ? 0.12 : 0.0226)) * 0.5;
    const halfWidth = vehicle.config.dimensions.width * 0.5 - 0.005;
    const executive = vehicle.config.body.design === 'executive';
    const profile = vehicle.config.exteriorLighting;
    const frontZ = vehicle.config.lampLayout ? -vehicle.config.dimensions.length / 2 - .012 : -halfLength - 0.01;
    const rearZ = vehicle.config.lampLayout ? vehicle.config.dimensions.length / 2 + .012 : halfLength + 0.009;
    // Authored lenses remain housings, not permanently glowing outputs.
    vehicle.exteriorRoot.traverse((object) => {
      if (!(object instanceof Mesh) || !['headlamp', 'tail-lamp'].includes(object.userData.vehicleBodyPart)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material instanceof MeshStandardMaterial) {
        material.emissiveIntensity = 0;
        // A dark optical housing lets the separate LED modules read clearly.
        if (profile && object.userData.vehicleBodyPart === 'headlamp') material.color.set(0x23313e);
      }
    });
    for (const [key, color] of [
      ['head', 0xfff1cf], ['position', 0xffefc5], ['tail', 0xc0192d], ['brake', 0xff2131],
      ['reverse', 0xe8f4ff], ['fogFront', 0xffefc5], ['fogRear', 0xff253b],
      ['left', 0xffa321], ['right', 0xffa321],
    ] as const) this.materials.set(key, new MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0, roughness: 0.24, metalness: 0.08,
      toneMapped: false,
    }));
    if (profile) for (const [key, material] of this.materials) {
      // Unpowered optics stay dark; the LED emission supplies their lit colour.
      // A pale diffuse surface otherwise reads as a white lamp even when OFF.
      material.color.set(0x101418);
      if (key === 'head' || key === 'position') { material.emissive.set(profile.color); material.toneMapped = true; }
      if (key === 'left' || key === 'right') material.emissive.set(profile.turnColor ?? 0xffa321);
    }
    const leftTarget = new Object3D();
    const rightTarget = new Object3D();
    this.targets = [leftTarget, rightTarget];
    this.headlamps = [this.createHeadlamp(executive ? -halfWidth * .66 : -0.55, frontZ + 0.025, leftTarget),
      this.createHeadlamp(executive ? halfWidth * .66 : 0.55, frontZ + 0.025, rightTarget)];
    vehicle.root.add(...this.headlamps, ...this.targets);
    if (profile?.retainLowBeamOnHigh) {
      for (const side of [-1, 1]) {
        const target = new Object3D(), x = side * halfWidth * .66;
        const light = this.createHeadlamp(x, frontZ + .025, target);
        light.name = side < 0 ? 'Left high-beam near fill' : 'Right high-beam near fill';
        light.distance = profile.low.distance; light.angle = profile.low.angle;
        target.position.set(x * .82, profile.low.targetY, profile.low.targetZ);
        this.nearFill.push(light); this.nearFillTargets.push(target); vehicle.root.add(light, target);
      }
    }
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
      if (vehicle.config.lampLayout?.mirrorRepeater) {
        const transform = side < 0 ? vehicle.config.leftMirrorTransform : vehicle.config.rightMirrorTransform;
        const lens = new Mesh(new BoxGeometry(.005, .014, .08), this.materials.get(signalKey)!);
        lens.position.set(transform.position[0] + side * .015, transform.position[1] - .026, transform.position[2] - .035);
        this.addLens(lens, signalKey, label + ' mirror amber repeater');
      }
      if (profile?.signature === 'segmented-led') {
        const centre = side * halfWidth * .66;
        const turnHeight = profile.turnLensHeight ?? .016, turnY = .736 - turnHeight * .5;
        for (let i = 0; i < 4; i++) this.addBox(i === 0 ? label + ' low/high headlamp' : `${label} LED optical module ${i + 1}`, 'head', [.047, .024, .004],
          [centre + (i - 1.5) * .087, .751, frontZ]);
        for (let i = 0; i < 5; i++) {
          this.addSignatureSegment(`${label} DRL segment ${i + 1}`, 'position', side, i, false,
            [.075, .0045, .004], [centre + side * (i - 2) * .080, .707, frontZ]);
          this.addSignatureSegment(`${label} front turn segment ${i + 1}`, signalKey, side, i, true,
            [.075, turnHeight, .004], [centre + side * (i - 2) * .080, turnY, frontZ]);
        }
        const cornerMaterial = this.materials.get(signalKey)!.clone();
        cornerMaterial.color.set(0x100b05); cornerMaterial.emissive.set(profile.turnColor ?? 0xff7208);
        cornerMaterial.side = DoubleSide; // The thin wrapped diffuser is visible from both front and flank.
        this.materials.set(`${label} front turn corner`, cornerMaterial);
        const cornerGeometry = new BufferGeometry();
        cornerGeometry.setAttribute('position', new Float32BufferAttribute([
          centre + side * .19, turnY - turnHeight * .5, frontZ - .002, centre + side * .19, .736, frontZ - .002,
          side * halfWidth * .973, .736, frontZ + .12, side * halfWidth * .973, turnY - turnHeight * .5, frontZ + .12,
        ], 3));
        cornerGeometry.setIndex([0, 1, 2, 0, 2, 3]); cornerGeometry.computeVertexNormals();
        this.addLens(new Mesh(cornerGeometry, cornerMaterial), signalKey, `${label} front turn corner`);
        this.signatureSegments.push({ material: cornerMaterial, side, index: 4, turn: true });
        const returnMaterial = this.signatureSegments.find(segment => segment.side === side && !segment.turn && segment.index === 4)!.material;
        const returnLens = new Mesh(new BoxGeometry(.032, .0035, .004), returnMaterial);
        returnLens.position.set(centre + side * .206, .724, frontZ); returnLens.rotation.z = side * .65;
        this.addLens(returnLens, 'position', label + ' DRL swept return');
        if (profile.turnSpillIntensity) {
          const light = new PointLight(profile.turnColor ?? 0xff7208, 0, 1.25, 2);
          light.name = label + ' amber indicator spill'; light.position.set(side * halfWidth * .82, turnY, frontZ - .035);
          light.castShadow = false; light.layers.enable(VEHICLE_RENDER_LAYERS.EXTERIOR);
          vehicle.root.add(light); this.turnSpills.push({ light, left: side < 0 });
        }
      } else {
        this.addBox(label + ' low/high headlamp', 'head', [executive ? .43 : .33, executive ? .040 : .061, .004], [side * (executive ? halfWidth * .66 : .54), executive ? .735 : .641, frontZ]);
        this.addBox(label + ' front position lamp', 'position', [0.24, 0.016, 0.004], [side * (executive ? halfWidth * .66 : .55), executive ? .720 : .588, frontZ]);
      }
      this.addBox(label + ' front fog lamp', 'fogFront', [0.13, 0.048, 0.004], [side * (executive ? .76 : .62), .355, frontZ + .004]);
      this.addBox(label + ' rear tail lamp', 'tail', [0.32, 0.025, 0.004], [side * (executive ? halfWidth * .66 : .55), executive ? .778 : .731, rearZ]);
      this.addBox(label + ' brake lamp', 'brake', [0.33, 0.036, 0.004], [side * (executive ? halfWidth * .66 : .55), executive ? .750 : .676, rearZ]);
      this.addBox(label + ' reverse lamp', 'reverse', [0.14, 0.026, 0.004], [side * (executive ? .52 : .49), executive ? .715 : .602, rearZ]);
      if (profile?.signature !== 'segmented-led') this.addBox(label + ' front turn signal', signalKey, [.13, .038, .004], [side * (executive ? .81 : .73), executive ? .733 : .6, frontZ]);
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

  public applyState(state: Readonly<VehicleLightingState>, ignitionOn?: boolean, deltaTime = 0): void {
    this.state = { ...state };
    const profile = this.vehicle.config.exteriorLighting;
    if (ignitionOn !== undefined) {
      if (ignitionOn && this.ignitionOn !== true) this.wakeTime = 0;
      if (!ignitionOn) this.wakeTime = Infinity;
      this.ignitionOn = ignitionOn;
    }
    if (this.ignitionOn) this.wakeTime += Math.max(0, deltaTime);
    const powered = !(profile?.autoOffWithIgnition && this.ignitionOn === false);
    const output = (key: string, intensity: number): void => {
      this.materials.get(key)!.emissiveIntensity = intensity;
    };
    output('head', !powered ? 0 : state.effectiveHighBeam ? profile?.highLensIntensity ?? 2.3 : state.lowBeam ? profile?.lowLensIntensity ?? 1.35 : 0);
    output('position', powered && state.positionLight ? 0.65 : 0);
    output('tail', powered && state.positionLight ? 0.8 : 0);
    output('brake', state.brakeLight ? 2.1 : 0);
    output('reverse', state.reverseLight ? 1.4 : 0);
    output('fogFront', powered && state.fogLightsEnabled ? 2.6 : 0);
    output('fogRear', powered && state.fogLightsEnabled ? 3 : 0);
    output('left', state.leftBlinkOn ? profile?.turnLensIntensity ?? 1.8 : 0);
    output('right', state.rightBlinkOn ? profile?.turnLensIntensity ?? 1.8 : 0);
    for (const spill of this.turnSpills) spill.light.intensity = (spill.left ? state.leftBlinkOn : state.rightBlinkOn) ? profile?.turnSpillIntensity ?? 0 : 0;
    if (!profile) this.materials.get('head')!.color.set(state.effectiveHighBeam ? 0xddefff : 0xfff1cf);
    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const blinking = sideIndex === 0 ? state.leftBlinkOn : state.rightBlinkOn;
      if (!blinking || !this.previousBlink[sideIndex]) this.blinkAge[sideIndex] = 0;
      if (blinking) this.blinkAge[sideIndex]! += Math.max(0, deltaTime);
      this.previousBlink[sideIndex] = blinking;
    }
    const smooth = (value: number): number => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    for (const segment of this.signatureSegments) {
      const sideIndex = segment.side < 0 ? 0 : 1;
      const blinking = this.previousBlink[sideIndex]!;
      if (segment.turn) {
        const lit = blinking && (deltaTime === 0 || this.blinkAge[sideIndex]! >= segment.index * (profile?.sequentialTurnSeconds ?? .18) / 5);
        segment.material.emissiveIntensity = lit ? profile?.turnLensIntensity ?? 1.8 : 0;
      } else {
        const t = this.wakeTime / (profile?.welcomeSeconds ?? .85);
        const normal = state.positionLight ? .65 : 0;
        const welcome = smooth((t - segment.index * .075) / .16) * (.8 + (normal - .8) * smooth((t - .68) / .32));
        segment.material.emissiveIntensity = powered ? (t < 1 ? welcome : normal) * (blinking ? .18 : 1) : 0;
      }
    }
    const beam = profile && (state.effectiveHighBeam ? profile.high : profile.low);
    const mainBeam = powered && (state.lowBeam || state.effectiveHighBeam);
    for (const light of this.headlamps) {
      light.intensity = mainBeam ? beam?.intensity ?? (state.effectiveHighBeam ? 850 : 380) : 0;
      light.distance = beam?.distance ?? (state.effectiveHighBeam ? 130 : 65);
      light.angle = beam?.angle ?? (state.effectiveHighBeam ? Math.PI / 12 : Math.PI / 5.5);
    }
    for (const target of this.targets) {
      target.position.y = beam?.targetY ?? (state.effectiveHighBeam ? 0.15 : -0.65);
      target.position.z = beam?.targetZ ?? (state.effectiveHighBeam ? -90 : -38);
    }
    for (const light of this.nearFill) light.intensity = powered && state.effectiveHighBeam ? profile!.low.intensity : 0;
    this.foglamps[0].intensity = powered && state.fogLightsEnabled ? 150 : 0;
    this.foglamps[1].intensity = powered && state.fogLightsEnabled ? 150 : 0;
    this.foglamps[2].intensity = powered && state.fogLightsEnabled ? 28 : 0;
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
    for (const light of this.nearFill) light.removeFromParent();
    for (const target of this.nearFillTargets) target.removeFromParent();
    for (const light of this.foglamps) light.removeFromParent();
    for (const target of this.fogTargets) target.removeFromParent();
    for (const spill of this.turnSpills) spill.light.removeFromParent();
    for (const lens of this.lampMeshes) { lens.removeFromParent(); lens.geometry.dispose(); }
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  private createHeadlamp(x: number, z: number, target: Object3D): SpotLight {
    const light = new SpotLight(new Color(0xffefc0), 0, 55, Math.PI / 7.5, 0.42, 1.25);
    const profile = this.vehicle.config.exteriorLighting;
    if (profile) { light.color.set(profile.color); light.penumbra = profile.penumbra; light.decay = profile.decay; }
    light.name = x < 0 ? 'Left low/high beam' : 'Right low/high beam';
    light.position.set(x, profile ? .747 : this.vehicle.config.body.design === 'executive' ? .735 : .66, z);
    if (this.vehicle.config.lampLayout) { light.position.y = this.vehicle.config.lampLayout.frontHeight; light.position.x = Math.sign(x) * this.vehicle.config.lampLayout.frontLateral; }
    if (this.vehicle.config.body.profile === 'suv') {
      light.position.y = this.vehicle.config.body.hoodTopY - .16;
      light.position.x = Math.sign(x) * .745;
    }
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
    const layout = this.vehicle.config.lampLayout;
    if (layout && name !== 'High-mounted centre brake lamp') {
      if (position[2] < 0) {
        if (key === 'head') { lens.position.y = layout.frontHeight; lens.position.x = Math.sign(position[0]) * layout.frontLateral; }
        if (key === 'position') lens.position.y = layout.frontHeight - .025;
        if (key === 'left' || key === 'right') lens.position.y = layout.frontIndicatorHeight;
      } else {
        if (key === 'tail') lens.position.y = layout.rearTailHeight;
        if (key === 'brake') lens.position.y = layout.rearBrakeHeight;
        if (key === 'left' || key === 'right') lens.position.y = layout.rearIndicatorHeight;
        if (key === 'reverse') lens.position.y = layout.rearReverseHeight;
      }
    }
    if (this.vehicle.config.body.profile === 'suv') {
      const body = this.vehicle.config.body;
      if (name === 'High-mounted centre brake lamp') {
        lens.position.set(0, this.vehicle.config.cabin.roofY - .10,
          this.vehicle.config.vehicleLength * .5 - body.trunkLength - .075);
      } else if (position[2] < 0) {
        lens.position.y += key === 'fogFront' ? body.groundClearance - .20 : body.hoodTopY - .16 - .641;
        lens.position.x = Math.sign(position[0]) * Math.min(.85, Math.abs(position[0]) + .205);
      } else {
        lens.position.y += key === 'fogRear' ? body.groundClearance - .20 : body.trunkDeckY - .12 - .731;
        lens.position.x += Math.sign(position[0]) * .16;
      }
    }
    this.addLens(lens, key);
  }

  private addCornerLens(name: string, key: string, side: -1 | 1, halfWidth: number, halfLength: number, y: number, height: number): void {
    const layout = this.vehicle.config.lampLayout;
    if (layout) y = key === 'tail' ? layout.rearTailHeight : key === 'brake' ? layout.rearBrakeHeight
      : key === 'left' || key === 'right' ? layout.rearIndicatorHeight : key === 'reverse' ? layout.rearReverseHeight : y;
    if (this.vehicle.config.body.profile === 'suv') y += this.vehicle.config.body.trunkDeckY - .12 - .731;
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

  private addSignatureSegment(name: string, key: string, side: number, index: number, turn: boolean,
    size: readonly [number, number, number], position: readonly [number, number, number]): void {
    const material = this.materials.get(key)!.clone();
    if (turn) { material.color.set(0x100b05); material.emissive.set(this.vehicle.config.exteriorLighting?.turnColor ?? 0xff7208); }
    this.materials.set(name, material);
    const lens = new Mesh(new BoxGeometry(...size), material);
    lens.position.set(...position);
    this.addLens(lens, key, name);
    this.signatureSegments.push({ material, side, index, turn });
  }
}
