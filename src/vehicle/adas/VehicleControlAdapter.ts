import { createNeutralVehicleInputState, type VehicleInputState } from '../../input/VehicleInputState';
import type { ExceptionControlDirectives } from './ExceptionRecoveryController';
import {
  clampADAS,
  type ADASDriverOverrideState,
  type ADASSpeedCommand,
  type ADASSteeringCommand,
  type TurnSignalRequest,
} from './ADASTypes';

export interface ActiveTurnLampState {
  leftSignalActive: boolean;
  rightSignalActive: boolean;
  hazardActive: boolean;
}

/**
 * Clean control boundary translating ADAS outputs into standard VehicleInputState
 * (steering, cruiseThrottle/throttle, cruiseBrake/brake, turn-signal toggle edges).
 * Never touches VehicleDynamics internals; zero per-tick allocations.
 */
export class VehicleControlAdapter {
  private readonly output: VehicleInputState = createNeutralVehicleInputState();
  private adasOwnedSignal: TurnSignalRequest = null;
  private lastDesiredSignal: TurnSignalRequest = null;
  private adasOwnedHazard = false;
  private prevSystemHazardRequest = false;
  private driverOverrodeHazard = false;
  private mechHandbrakeLatched = false;

  /** Turn signal currently owned by ADAS (never echoed back as driver intent). */
  public get ownedTurnSignal(): TurnSignalRequest {
    return this.adasOwnedSignal;
  }

  public reset(): void {
    this.adasOwnedSignal = null;
    this.lastDesiredSignal = null;
    this.adasOwnedHazard = false;
    this.prevSystemHazardRequest = false;
    this.driverOverrodeHazard = false;
    this.mechHandbrakeLatched = false;
  }

  /**
   * Apply ADAS commands onto a copy of driverInput in our pre-allocated buffer.
   * When `adasControlling` is false, passes through driverInput cleanly and turns off
   * any turn signal previously owned by ADAS.
   */
  public apply(
    driverInput: Readonly<VehicleInputState>,
    adasControlling: boolean,
    steerCmd: Readonly<ADASSteeringCommand>,
    speedCmd: Readonly<ADASSpeedCommand>,
    override: Readonly<ADASDriverOverrideState>,
    desiredSignal: TurnSignalRequest,
    lamps: Readonly<ActiveTurnLampState>,
    emergencyBraking: boolean,
    exceptionDirectives?: Readonly<ExceptionControlDirectives>,
  ): VehicleInputState {
    const out = this.output;
    this.copyBaseFields(driverInput, out);

    // 0. Exception hazard light arbitration (rising-edge system request; driver can always manually toggle off/on)
    const sysHazardReq = Boolean(exceptionDirectives?.active && exceptionDirectives.requestHazard);
    const sysHazardEdge = sysHazardReq && !this.prevSystemHazardRequest;
    this.prevSystemHazardRequest = sysHazardReq;
    if (sysHazardEdge) {
      this.driverOverrodeHazard = false;
    }

    if (driverInput.hazard) {
      // Explicit driver manual hazard action takes ownership immediately
      this.driverOverrodeHazard = true;
      this.adasOwnedHazard = false;
    } else if (exceptionDirectives?.active && exceptionDirectives.shouldLockDisableAdas) {
      if (sysHazardReq && !this.driverOverrodeHazard && !lamps.hazardActive) {
        out.hazard = true;
      }
      // Collision handover leaves hazard lamps on persistently while handing full control to driver
      this.adasOwnedHazard = false;
    } else if (sysHazardReq) {
      if (!this.driverOverrodeHazard && !lamps.hazardActive) {
        out.hazard = true;
        this.adasOwnedHazard = true;
      }
      if (lamps.hazardActive) {
        this.adasOwnedSignal = null;
        this.lastDesiredSignal = null;
      }
    } else {
      if (this.adasOwnedHazard && !this.driverOverrodeHazard && lamps.hazardActive) {
        out.hazard = true;
      }
      this.adasOwnedHazard = false;
      this.driverOverrodeHazard = false;
    }

    const hazardSuppressingSignals = sysHazardReq && !this.driverOverrodeHazard;

    // 1. Turn signal arbitration (maneuver-driven, yields immediately to manual driver indicator or exception hazard)
    const driverTouchedSignal =
      override.manualTurnSignalActive ||
      driverInput.leftIndicator ||
      driverInput.rightIndicator ||
      driverInput.hazard ||
      lamps.hazardActive ||
      hazardSuppressingSignals;

    if (driverTouchedSignal) {
      // If ADAS had already switched that side's lamp ON and driver hits the same indicator,
      // keep lamp ON as driver-owned intent instead of accidentally toggling it OFF.
      if (driverInput.leftIndicator && this.adasOwnedSignal === 'left' && lamps.leftSignalActive) {
        out.leftIndicator = false;
      }
      if (driverInput.rightIndicator && this.adasOwnedSignal === 'right' && lamps.rightSignalActive) {
        out.rightIndicator = false;
      }
      this.adasOwnedSignal = null;
      this.lastDesiredSignal = null;
    } else {
      const targetSignal: TurnSignalRequest = adasControlling ? desiredSignal : null;
      if (targetSignal !== this.lastDesiredSignal) {
        if (targetSignal === 'left') {
          if (!lamps.leftSignalActive) out.leftIndicator = true;
          this.adasOwnedSignal = 'left';
        } else if (targetSignal === 'right') {
          if (!lamps.rightSignalActive) out.rightIndicator = true;
          this.adasOwnedSignal = 'right';
        } else if (this.adasOwnedSignal !== null) {
          if (this.adasOwnedSignal === 'left' && lamps.leftSignalActive) out.leftIndicator = true;
          else if (this.adasOwnedSignal === 'right' && lamps.rightSignalActive) out.rightIndicator = true;
          this.adasOwnedSignal = null;
        }
        this.lastDesiredSignal = targetSignal;
      } else if (targetSignal === null && this.adasOwnedSignal !== null) {
        if (this.adasOwnedSignal === 'left' && lamps.leftSignalActive) out.leftIndicator = true;
        else if (this.adasOwnedSignal === 'right' && lamps.rightSignalActive) out.rightIndicator = true;
        this.adasOwnedSignal = null;
      }
    }

    if (!adasControlling) {
      if (exceptionDirectives?.keepHandbrakeAfterDisarm) {
        this.mechHandbrakeLatched = true;
      }
      if (this.mechHandbrakeLatched) {
        if (driverInput.handbrake > 0.5 || driverInput.throttle > 0.2) {
          this.mechHandbrakeLatched = false;
        } else {
          out.handbrake = 1;
        }
      }
      out.cruiseThrottle = 0;
      out.cruiseBrake = 0;
      return out;
    }
    this.mechHandbrakeLatched = false;

    // 1b. Exception control override (collision stopping/park or blocked low-speed reverse)
    if (exceptionDirectives?.active && exceptionDirectives.overrideDriving) {
      out.steering = clampADAS(exceptionDirectives.steering, -1, 1);
      const brk = clampADAS(exceptionDirectives.brake, 0, 1);
      const thr = brk > 0.001 ? 0 : clampADAS(exceptionDirectives.throttle, 0, 1);
      const shiftingGearOrSelector =
        exceptionDirectives.requestDriveSelector !== undefined ||
        exceptionDirectives.requestDirectGear !== undefined;

      out.throttle = 0;
      out.cruiseThrottle = thr;
      if (shiftingGearOrSelector) {
        if (exceptionDirectives.requestDriveSelector !== undefined) {
          out.driveSelector = exceptionDirectives.requestDriveSelector;
        }
        if (exceptionDirectives.requestDirectGear !== undefined) {
          out.directGear = exceptionDirectives.requestDirectGear;
        }
        // SelectorSafety / powertrain requires physical brake input >= 0.1 for PRND/R shifts
        out.brake = Math.max(driverInput.brake, brk, 1.0);
        out.cruiseBrake = Math.max(brk, 1.0);
      } else {
        out.brake = clampADAS(driverInput.brake, 0, 1);
        out.cruiseBrake = brk;
      }
      if (exceptionDirectives.requestHandbrake) {
        out.handbrake = 1;
      }
      return out;
    }

    // 2. Lateral steering arbitration
    if (override.steeringOverride || !steerCmd.active) {
      out.steering = clampADAS(driverInput.steering, -1, 1);
    } else {
      // During smooth reacquire (steeringBlend < 1), blend seamlessly from driver input to ADAS
      const blend = clampADAS(override.steeringBlend, 0, 1);
      out.steering = clampADAS(
        driverInput.steering * (1 - blend) + steerCmd.steering * blend,
        -1,
        1,
      );
    }

    // 3. Longitudinal arbitration (strictly prevents simultaneous throttle + brake conflicts)
    if (emergencyBraking) {
      out.throttle = 0;
      out.cruiseThrottle = 0;
      out.brake = clampADAS(driverInput.brake, 0, 1);
      out.cruiseBrake = clampADAS(speedCmd.brake, 0, 1);
    } else if (override.brakeOverride) {
      out.throttle = 0;
      out.cruiseThrottle = 0;
      out.brake = clampADAS(driverInput.brake, 0, 1);
      out.cruiseBrake = 0;
    } else if (override.accelerationOverride) {
      out.throttle = clampADAS(driverInput.throttle, 0, 1);
      out.cruiseThrottle = 0;
      out.brake = 0;
      out.cruiseBrake = 0;
    } else {
      const adasBrake = clampADAS(speedCmd.brake, 0, 1);
      const adasThrottle = adasBrake > 0.001 ? 0 : clampADAS(speedCmd.throttle, 0, 1);
      out.throttle = 0;
      out.brake = 0;
      out.cruiseThrottle = adasThrottle;
      out.cruiseBrake = adasBrake;
    }

    return out;
  }

  private copyBaseFields(src: Readonly<VehicleInputState>, dst: VehicleInputState): void {
    dst.throttle = Number.isFinite(src.throttle) ? src.throttle : 0;
    dst.brake = Number.isFinite(src.brake) ? src.brake : 0;
    dst.steering = Number.isFinite(src.steering) ? src.steering : 0;
    dst.handbrake = Number.isFinite(src.handbrake) ? src.handbrake : 0;
    dst.clutchPedal = src.clutchPedal;
    dst.lookX = src.lookX;
    dst.lookY = src.lookY;
    dst.shiftUp = src.shiftUp;
    dst.shiftDown = src.shiftDown;
    dst.returnToAuto = src.returnToAuto;
    dst.leftIndicator = src.leftIndicator;
    dst.rightIndicator = src.rightIndicator;
    dst.hazard = src.hazard;
    dst.cycleLights = src.cycleLights;
    dst.engineStart = src.engineStart;
    dst.cruiseToggle = src.cruiseToggle;
    dst.lccToggle = src.lccToggle;
    dst.cycleLaneAssist = src.cycleLaneAssist;
    dst.adasToggle = src.adasToggle;
    dst.fogToggle = src.fogToggle;
    dst.cycleWipers = src.cycleWipers;
    dst.cycleDriveMode = src.cycleDriveMode;
    dst.cycleEnergyMode = src.cycleEnergyMode;
    dst.highBeamFlash = src.highBeamFlash;
    dst.hornPressed = src.hornPressed;
    dst.enterExitVehicle = src.enterExitVehicle;
    dst.toggleDriverDoor = src.toggleDriverDoor;
    dst.driverWindowUp = src.driverWindowUp;
    dst.driverWindowDown = src.driverWindowDown;
    dst.driveSelector = src.driveSelector;
    dst.directGear = src.directGear;
    dst.controlMode = src.controlMode;
    dst.source = src.source;
    dst.sourceMetadata = src.sourceMetadata;
    dst.cruiseThrottle = src.cruiseThrottle;
    dst.cruiseBrake = src.cruiseBrake;
  }
}
