import * as THREE from 'three';
import type { Subject3JunctionConfig, Subject3Point2 } from './Subject3GroundConfig';
import { makeBox } from './geometry';
import type { Subject3Materials } from './materials';
import { normalize2 } from './math';

export type Subject3SignalColor = 'red' | 'amber' | 'green';

export type Subject3TrafficSignalPhase =
  | 'north-south-green'
  | 'north-south-amber'
  | 'all-red'
  | 'east-west-green'
  | 'east-west-amber';

export interface Subject3TrafficSignalState {
  readonly phase: Subject3TrafficSignalPhase;
  /** Which approach pair currently holds the right of way. */
  readonly quadrant: 'north-south' | 'east-west' | 'none';
  readonly color: Subject3SignalColor;
  readonly secondsInPhase: number;
  readonly secondsRemaining: number;
}

export type Subject3JunctionControlKind = 'north-south' | 'east-west';

export interface Subject3SignalArmMetadata {
  readonly segmentId: string;
  /** Unit vector pointing from the junction outwards along the arm. */
  readonly outward: Subject3Point2;
  readonly approachYawRadians: number;
  readonly approachLaneCount: number;
  readonly approachLaneWidth: number;
  readonly roadWidth: number;
  readonly controlKind: Subject3JunctionControlKind;
  /** Local +X of this arm points along its right-hand normal. */
  readonly right: Subject3Point2;
}

export interface Subject3SignalJunctionMetadata {
  readonly id: string;
  readonly center: Subject3Point2;
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
  readonly arms: readonly Subject3SignalArmMetadata[];
}

interface SignalTiming {
  readonly greenSeconds: number;
  readonly amberSeconds: number;
  readonly allRedSeconds: number;
}

interface SignalHead {
  readonly junctionIndex: number;
  readonly controlKind: Subject3JunctionControlKind;
  readonly root: THREE.Group;
  readonly lamps: Readonly<Record<Subject3SignalColor, THREE.Mesh>>;
}

const disposeMaterial = (material: THREE.Material): void => {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
};

export const armControlKind = (
  outward: Subject3Point2,
): Subject3JunctionControlKind => (Math.abs(outward.x) >= Math.abs(outward.z)
  ? 'east-west'
  : 'north-south');

/**
 * Geometry-only traffic signals. The controller owns only a phase clock, so a
 * later examination system can query `getStateForJunction` without touching the
 * visuals, and no examination logic lives here.
 */
export class Subject3TrafficSignals {
  public readonly root = new THREE.Group();
  private readonly heads: SignalHead[] = [];
  private readonly timing: SignalTiming;
  private readonly cycleSeconds: number;
  private readonly offsets: number[];
  private elapsedSeconds = 0;

  public constructor(
    junctionCount: number,
    offsets: readonly number[],
    timing: SignalTiming,
  ) {
    this.root.name = 'Subject 3 traffic signals';
    this.root.userData.renderCategory = 'WORLD';
    this.root.userData.gameplayLogic = false;
    this.timing = timing;
    this.cycleSeconds = (timing.greenSeconds + timing.amberSeconds) * 2 + timing.allRedSeconds * 2;
    this.offsets = Array.from({ length: junctionCount }, (_, index) => offsets[index] ?? 0);
    this.update(0);
  }

  public addHead(
    junctionIndex: number,
    arm: Subject3SignalArmMetadata,
    center: Subject3Point2,
    yawRadians: number,
    materials: Subject3Materials,
    shadows: boolean,
    headHeight: number,
  ): void {
    const head = this.buildHead(junctionIndex, arm, center, yawRadians, materials, shadows, headHeight);
    this.heads.push(head);
    this.root.add(head.root);
    this.applyHeadState(head);
  }

  public update(deltaSeconds: number): void {
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.elapsedSeconds += deltaSeconds;
    for (const head of this.heads) this.applyHeadState(head);
  }

  public getStateForJunction(junctionIndex: number): Subject3TrafficSignalState {
    const offset = this.offsets[junctionIndex] ?? 0;
    const local = (((this.elapsedSeconds + offset) % this.cycleSeconds) + this.cycleSeconds)
      % this.cycleSeconds;
    const { greenSeconds, amberSeconds, allRedSeconds } = this.timing;
    const northSouthGreenEnd = greenSeconds;
    const northSouthAmberEnd = northSouthGreenEnd + amberSeconds;
    const firstAllRedEnd = northSouthAmberEnd + allRedSeconds;
    const eastWestGreenEnd = firstAllRedEnd + greenSeconds;
    const eastWestAmberEnd = eastWestGreenEnd + amberSeconds;
    if (local < northSouthGreenEnd) {
      return {
        phase: 'north-south-green',
        quadrant: 'north-south',
        color: 'green',
        secondsInPhase: local,
        secondsRemaining: northSouthGreenEnd - local,
      };
    }
    if (local < northSouthAmberEnd) {
      return {
        phase: 'north-south-amber',
        quadrant: 'north-south',
        color: 'amber',
        secondsInPhase: local - northSouthGreenEnd,
        secondsRemaining: northSouthAmberEnd - local,
      };
    }
    if (local < firstAllRedEnd) {
      return {
        phase: 'all-red',
        quadrant: 'none',
        color: 'red',
        secondsInPhase: local - northSouthAmberEnd,
        secondsRemaining: firstAllRedEnd - local,
      };
    }
    if (local < eastWestGreenEnd) {
      return {
        phase: 'east-west-green',
        quadrant: 'east-west',
        color: 'green',
        secondsInPhase: local - firstAllRedEnd,
        secondsRemaining: eastWestGreenEnd - local,
      };
    }
    if (local < eastWestAmberEnd) {
      return {
        phase: 'east-west-amber',
        quadrant: 'east-west',
        color: 'amber',
        secondsInPhase: local - eastWestGreenEnd,
        secondsRemaining: eastWestAmberEnd - local,
      };
    }
    return {
      phase: 'all-red',
      quadrant: 'none',
      color: 'red',
      secondsInPhase: local - eastWestAmberEnd,
      secondsRemaining: this.cycleSeconds - local,
    };
  }

  /** Colour shown by the head facing the supplied approach direction. */
  public getColorForApproach(
    junctionIndex: number,
    controlKind: Subject3JunctionControlKind,
  ): Subject3SignalColor {
    const state = this.getStateForJunction(junctionIndex);
    if (state.quadrant === 'none' || state.quadrant !== controlKind) return 'red';
    return state.color;
  }

  public getCycleSeconds(): number {
    return this.cycleSeconds;
  }

  public getHeadCount(): number {
    return this.heads.length;
  }

  /** Sector unloading: release only this junction's geometry and private lamps. */
  public removeHeadsForJunction(junctionIndex: number): void {
    for (let i = this.heads.length - 1; i >= 0; i -= 1) {
      const head = this.heads[i]!;
      if (head.junctionIndex !== junctionIndex) continue;
      head.root.removeFromParent();
      head.root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      for (const lamp of Object.values(head.lamps)) (lamp.material as THREE.Material).dispose();
      this.heads.splice(i, 1);
    }
  }

  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) disposeMaterial(material);
    this.root.clear();
    this.heads.length = 0;
  }

  private applyHeadState(head: SignalHead): void {
    const color = this.getColorForApproach(head.junctionIndex, head.controlKind);
    for (const key of ['red', 'amber', 'green'] as const) {
      const material = head.lamps[key].material as THREE.MeshBasicMaterial;
      const bright = key === 'red' ? 0xff3b30 : key === 'amber' ? 0xffb020 : 0x2fd269;
      const dark = key === 'red' ? 0x351315 : key === 'amber' ? 0x382a12 : 0x123022;
      material.color.setHex(key === color ? bright : dark);
      material.opacity = 1;
      material.transparent = false;
    }
  }

  private buildHead(
    junctionIndex: number,
    arm: Subject3SignalArmMetadata,
    center: Subject3Point2,
    yawRadians: number,
    materials: Subject3Materials,
    shadows: boolean,
    headHeight: number,
  ): SignalHead {
    const root = new THREE.Group();
    root.name = `Traffic signal ${arm.segmentId}`;
    root.userData.subject3JunctionIndex = junctionIndex;
    root.position.set(center.x, 0, center.z);
    root.rotation.y = yawRadians;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.11, headHeight, 10),
      materials.darkMetal,
    );
    pole.position.y = headHeight * 0.5;
    pole.castShadow = shadows;
    root.add(pole);

    root.add(makeBox(
      'Signal cantilever',
      [2.05, 0.12, 0.12],
      [0.95, headHeight - 0.25, 0],
      materials.darkMetal,
      shadows,
    ));
    root.add(makeBox(
      'Signal head housing',
      [0.54, 1.5, 0.3],
      [1.8, headHeight - 0.6, -0.2],
      materials.darkMetal,
      shadows,
    ));

    // Local -Z faces the served approach, across the intersection from this pole.
    const lampY: Readonly<Record<Subject3SignalColor, number>> = {
      red: headHeight + 0.02,
      amber: headHeight - 0.5,
      green: headHeight - 1.02,
    };
    const lamps: Partial<Record<Subject3SignalColor, THREE.Mesh>> = {};
    for (const key of ['red', 'amber', 'green'] as const) {
      const base = key === 'red'
        ? materials.signalRed
        : key === 'amber' ? materials.signalAmber : materials.signalGreen;
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14),
        base.clone(),
      );
      disc.name = `Signal lamp ${key}`;
      disc.rotation.x = Math.PI * 0.5;
      disc.position.set(1.8, lampY[key], -0.36);
      root.add(disc);
      lamps[key] = disc;
      root.add(makeBox(
        `Signal visor ${key}`,
        [0.44, 0.07, 0.34],
        [1.8, lampY[key] + 0.17, -0.22],
        materials.darkMetal,
        shadows,
      ));
    }
    return {
      junctionIndex,
      controlKind: arm.controlKind,
      root,
      lamps: lamps as Readonly<Record<Subject3SignalColor, THREE.Mesh>>,
    };
  }
}

export const normalizeOutward = (outward: Subject3Point2): Subject3Point2 => normalize2(outward);

export const signalOffsetFor = (junction: Subject3JunctionConfig): number =>
  junction.signalOffsetSeconds ?? 0;
