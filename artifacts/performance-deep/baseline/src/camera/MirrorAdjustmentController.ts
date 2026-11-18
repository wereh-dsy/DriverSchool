import { Euler, MathUtils, Quaternion, type Object3D } from 'three';

export type AdjustableMirrorSide = 'left' | 'right';

export interface MirrorAdjustment {
  yaw: number;
  pitch: number;
}

export type MirrorAdjustments = Record<AdjustableMirrorSide, MirrorAdjustment>;

export interface MirrorAdjustmentControllerOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  storageKey?: string;
  yawLimitRadians?: number;
  pitchLimitRadians?: number;
}

// V0.2B recalibrates the real plane to include the car's rear quarters.
// Older offsets described a body-hidden mirror and must not be replayed.
const DEFAULT_STORAGE_KEY = 'drivergame.mirror-adjustments.v4';
const LEGACY_STORAGE_KEYS = [
  'drivergame.mirror-adjustments.v1',
  'drivergame.mirror-adjustments.v2',
  'drivergame.mirror-adjustments.v3',
] as const;

/** Rotates the real glass; MirrorSystem follows each surface matrixWorld. */
export class MirrorAdjustmentController {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly storageKey: string;
  private readonly yawLimit: number;
  private readonly pitchLimit: number;
  private readonly baseQuaternion: Record<AdjustableMirrorSide, Quaternion>;
  private readonly adjustmentEuler = new Euler();
  private readonly adjustmentQuaternion = new Quaternion();
  private readonly adjustments: MirrorAdjustments = {
    left: { yaw: 0, pitch: 0 },
    right: { yaw: 0, pitch: 0 },
  };

  public constructor(
    private readonly surfaces: Readonly<Record<AdjustableMirrorSide, Object3D>>,
    options: MirrorAdjustmentControllerOptions = {},
  ) {
    this.baseQuaternion = {
      left: surfaces.left.quaternion.clone(),
      right: surfaces.right.quaternion.clone(),
    };
    this.storage = options.storage === undefined ? this.getDefaultStorage() : options.storage;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.yawLimit = Math.abs(options.yawLimitRadians ?? MathUtils.degToRad(10));
    this.pitchLimit = Math.abs(options.pitchLimitRadians ?? MathUtils.degToRad(7));
    this.restore();
    this.clearLegacyPreferences();
    this.apply('left');
    this.apply('right');
  }

  public get(side: AdjustableMirrorSide): Readonly<MirrorAdjustment> {
    return { ...this.adjustments[side] };
  }

  public getAll(): MirrorAdjustments {
    return {
      left: { ...this.adjustments.left },
      right: { ...this.adjustments.right },
    };
  }

  public nudge(
    side: AdjustableMirrorSide,
    yawDeltaRadians: number,
    pitchDeltaRadians: number,
  ): Readonly<MirrorAdjustment> {
    const adjustment = this.adjustments[side];
    adjustment.yaw = MathUtils.clamp(
      adjustment.yaw + this.finiteOrZero(yawDeltaRadians),
      -this.yawLimit,
      this.yawLimit,
    );
    adjustment.pitch = MathUtils.clamp(
      adjustment.pitch + this.finiteOrZero(pitchDeltaRadians),
      -this.pitchLimit,
      this.pitchLimit,
    );
    this.apply(side);
    this.persist();
    return this.get(side);
  }

  public reset(side?: AdjustableMirrorSide): void {
    const sides: readonly AdjustableMirrorSide[] = side === undefined
      ? ['left', 'right']
      : [side];
    for (const target of sides) {
      this.adjustments[target].yaw = 0;
      this.adjustments[target].pitch = 0;
      this.apply(target);
    }
    this.persist();
  }

  private apply(side: AdjustableMirrorSide): void {
    const { pitch, yaw } = this.adjustments[side];
    this.adjustmentEuler.set(pitch, yaw, 0, 'XYZ');
    this.adjustmentQuaternion.setFromEuler(this.adjustmentEuler);
    // The calibrated frame may live on the surface or its parent assembly.
    // Preserve it in either layout; F3 rotates the physical plane locally.
    this.surfaces[side].quaternion.copy(this.baseQuaternion[side])
      .multiply(this.adjustmentQuaternion);
    this.surfaces[side].updateMatrixWorld(true);
  }

  private restore(): void {
    try {
      const value = this.storage?.getItem(this.storageKey);
      if (value === null || value === undefined) return;
      const parsed = JSON.parse(value) as Partial<MirrorAdjustments>;
      for (const side of ['left', 'right'] as const) {
        const saved = parsed[side];
        if (saved === undefined) continue;
        this.adjustments[side].yaw = MathUtils.clamp(
          this.finiteOrZero(saved.yaw), -this.yawLimit, this.yawLimit,
        );
        this.adjustments[side].pitch = MathUtils.clamp(
          this.finiteOrZero(saved.pitch), -this.pitchLimit, this.pitchLimit,
        );
      }
    } catch {
      this.resetStoredPreference();
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.adjustments));
    } catch {
      // Session adjustment remains available if browser storage is blocked.
    }
  }

  private resetStoredPreference(): void {
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      // Ignore inaccessible storage.
    }
  }

  private clearLegacyPreferences(): void {
    if (this.storageKey !== DEFAULT_STORAGE_KEY) return;
    try {
      for (const key of LEGACY_STORAGE_KEYS) this.storage?.removeItem(key);
    } catch {
      // A blocked storage implementation must not disable mirror adjustment.
    }
  }

  private getDefaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
  }
}
