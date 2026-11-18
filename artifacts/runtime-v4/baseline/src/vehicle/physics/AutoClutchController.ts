import type { AutoClutchConfig, Gear } from '../config';
import { clamp, clamp01, moveTowards } from './math';

export type AutoClutchState =
  | 'steady'
  | 'takeover'
  | 'shift-disengaging'
  | 'shift-hold'
  | 'shift-reengaging';

export interface AutoClutchContext {
  currentEngagement: number;
  currentGear: Gear;
  vehicleSpeed: number;
  engineRPM: number;
  coupledEngineRPM: number;
  throttle: number;
}

export interface AutoClutchUpdateResult {
  targetEngagement: number;
  cutThrottle: boolean;
  /** Present for one update when the gearbox may safely swap ratios. */
  gearToEngage?: Gear;
}

/**
 * Policy/actuator controller used only in Normal Control Mode. The mechanical
 * Clutch remains active in every mode and is the sole source of transmitted
 * torque, slip and capacity.
 */
export class AutoClutchController {
  public state: AutoClutchState = 'steady';
  public pendingGear: Gear | null = null;
  public commandedEngagement = 0;

  private shiftTimer = 0;

  public constructor(
    public readonly config: AutoClutchConfig,
    private readonly idleRPM: number,
  ) {}

  public reset(currentEngagement = 0): void {
    this.commandedEngagement = clamp01(currentEngagement);
    this.state = 'steady';
    this.pendingGear = null;
    this.shiftTimer = 0;
  }

  /** Smoothly inherit a clutch position when Manual mode releases control. */
  public takeOver(currentEngagement: number): void {
    this.commandedEngagement = Number.isFinite(currentEngagement)
      ? clamp01(currentEngagement)
      : 0;
    this.pendingGear = null;
    this.shiftTimer = 0;
    this.state = 'takeover';
  }

  /** Cancel automatic sequencing before Manual mode takes ownership. */
  public releaseControl(currentEngagement: number): void {
    this.commandedEngagement = Number.isFinite(currentEngagement)
      ? clamp01(currentEngagement)
      : 0;
    this.pendingGear = null;
    this.shiftTimer = 0;
    this.state = 'steady';
  }

  public requestShift(targetGear: Gear): boolean {
    if (this.pendingGear !== null || this.isShifting) return false;
    this.pendingGear = targetGear;
    this.shiftTimer = 0;
    this.state = 'shift-disengaging';
    return true;
  }

  public update(dt: number, context: AutoClutchContext): AutoClutchUpdateResult {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const drivingTarget = this.calculateDrivingTarget(context);

    switch (this.state) {
      case 'shift-disengaging': {
        this.commandedEngagement = 0;
        if (context.currentEngagement <= this.config.shiftDisengagedThreshold) {
          this.state = 'shift-hold';
          this.shiftTimer = Math.max(0, this.config.gearChangeDelay);
        }
        return { targetEngagement: 0, cutThrottle: true };
      }
      case 'shift-hold': {
        this.commandedEngagement = 0;
        this.shiftTimer -= safeDt;
        if (this.shiftTimer <= 0) {
          const gearToEngage = this.pendingGear;
          this.pendingGear = null;
          this.state = 'shift-reengaging';
          return gearToEngage === null
            ? { targetEngagement: 0, cutThrottle: true }
            : { targetEngagement: 0, cutThrottle: true, gearToEngage };
        }
        return { targetEngagement: 0, cutThrottle: true };
      }
      case 'shift-reengaging': {
        this.commandedEngagement = drivingTarget;
        if (Math.abs(context.currentEngagement - drivingTarget) <= 0.015) {
          this.state = 'steady';
        }
        return { targetEngagement: drivingTarget, cutThrottle: false };
      }
      case 'takeover': {
        this.commandedEngagement = moveTowards(
          this.commandedEngagement,
          drivingTarget,
          Math.max(0, this.config.takeoverRate) * safeDt,
        );
        if (Math.abs(this.commandedEngagement - drivingTarget) <= 1e-4) {
          this.state = 'steady';
        }
        return { targetEngagement: this.commandedEngagement, cutThrottle: false };
      }
      case 'steady': {
        this.commandedEngagement = drivingTarget;
        return { targetEngagement: drivingTarget, cutThrottle: false };
      }
    }
  }

  public get isShifting(): boolean {
    return this.state === 'shift-disengaging' ||
      this.state === 'shift-hold' ||
      this.state === 'shift-reengaging';
  }

  private calculateDrivingTarget(context: AutoClutchContext): number {
    if (context.currentGear === 'N') return 0;

    const absoluteSpeed = Math.abs(context.vehicleSpeed);
    const coupledRPM = Math.abs(context.coupledEngineRPM);
    const launchSpeed = Math.max(0.1, this.config.launchFullyEngagedSpeed);
    const idleRPM = Math.max(1, this.idleRPM);

    if (absoluteSpeed >= launchSpeed || coupledRPM >= idleRPM * 1.08) return 1;

    const antiStallStart = idleRPM * clamp(this.config.antiStallRPMFraction, 0, 0.98);
    const antiStallProgress = clamp01(
      (coupledRPM - antiStallStart) / Math.max(1, idleRPM - antiStallStart),
    );
    if (context.throttle <= 0.02) return antiStallProgress;

    const launchProgress = clamp01(absoluteSpeed / launchSpeed);
    const minimumEngagement = clamp01(this.config.launchMinimumEngagement);
    const speedLaunchTarget = minimumEngagement + (1 - minimumEngagement) * launchProgress;
    // Bug fix: speed-only take-up could sit forever at a weak bite on a hill,
    // free-revving while gravity prevented launchProgress from increasing.
    // Elevated engine RPM permits extra *mechanical* clutch pressure, not
    // hidden wheel torque. Normal flat-ground creep and Manual mode are intact.
    const elevatedRPM = clamp01((context.engineRPM - idleRPM * 2.6) / (idleRPM * 2));
    const rpmLaunchTarget = minimumEngagement + (1 - minimumEngagement) *
      elevatedRPM * clamp01(context.throttle);
    const launchTarget = Math.max(speedLaunchTarget, rpmLaunchTarget);

    // If RPM is already sagging near idle, avoid adding clutch pressure faster
    // than the engine can support. Manual mode bypasses this anti-stall policy.
    const rpmHeadroom = clamp01((context.engineRPM - idleRPM) / (idleRPM * 0.55));
    const antiStallLimit = minimumEngagement +
      (1 - minimumEngagement) * Math.max(antiStallProgress, rpmHeadroom);
    return Math.min(launchTarget, antiStallLimit);
  }
}
