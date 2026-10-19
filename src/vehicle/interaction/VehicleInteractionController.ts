import type { VehicleCabinAcousticsProfile } from '../../audio/VehicleCabinAcoustics';
import {
  DriverDoorController,
  DriverWindowController,
  DEFAULT_STATIONARY_SPEED_EPSILON,
  type DriverAccessCommandResult,
} from './DriverAccessController';
import type { VehicleInteractionDefinition } from './VehicleInteractionDefinition';
import {
  driverExitWorldPoint,
  driverEntryWorldPoint,
  isInsideDriverInteractionZone,
  type PlanarPoint,
  type PlanarVehiclePose,
} from '../../player/DriverEntryZone';

/**
 * Shared Vehicle Interaction runtime. It owns the door/window fractions and
 * command interlocks, but knows nothing about a specific vehicle except the
 * VehicleInteractionDefinition it is configured with.
 */
export class VehicleInteractionController {
  public readonly door = new DriverDoorController();
  public readonly window = new DriverWindowController();
  private definition: VehicleInteractionDefinition | null = null;

  public get available(): boolean {
    return this.definition !== null;
  }

  public get interactionDefinition(): VehicleInteractionDefinition | null {
    return this.definition;
  }

  public get driverDoorOpenFraction(): number {
    return this.door.openFraction;
  }

  public get driverWindowOpenFraction(): number {
    return this.window.openFraction;
  }

  public get cabinAcoustics(): VehicleCabinAcousticsProfile | undefined {
    return this.definition?.cabinAcoustics;
  }

  public get stationarySpeedEpsilon(): number {
    return this.definition?.stationarySpeedEpsilon ?? DEFAULT_STATIONARY_SPEED_EPSILON;
  }

  public configure(definition: VehicleInteractionDefinition | null): void {
    this.definition = definition;
    this.reset();
    if (definition === null) return;
    this.door.configure({
      openSeconds: definition.driverDoor.openSeconds,
      closeSeconds: definition.driverDoor.closeSeconds,
    });
    this.window.configure({ travelSeconds: definition.driverWindow.movementSeconds });
  }

  public reset(): void {
    this.door.reset();
    this.window.reset();
  }

  public update(deltaSeconds: number): void {
    this.door.update(deltaSeconds);
  }

  public isStationary(speedMetersPerSecond: number): boolean {
    return Math.abs(Number.isFinite(speedMetersPerSecond) ? speedMetersPerSecond : 0)
      <= this.stationarySpeedEpsilon;
  }

  public openDriverDoor(): void {
    if (this.definition === null) return;
    this.door.open();
  }

  public closeDriverDoor(): void {
    if (this.definition === null) return;
    this.door.close();
  }

  public toggleDriverDoor(speedMetersPerSecond: number): DriverAccessCommandResult {
    if (this.definition === null) return { accepted: false, reason: 'unsupported' };
    if (!this.isStationary(speedMetersPerSecond)) {
      return { accepted: false, reason: 'vehicle-moving' };
    }
    this.door.toggle();
    return { accepted: true };
  }

  public driverWindowUp(deltaSeconds: number): void {
    if (this.definition === null) return;
    this.window.update(deltaSeconds, true, false);
  }

  public driverWindowDown(deltaSeconds: number): void {
    if (this.definition === null) return;
    this.window.update(deltaSeconds, false, true);
  }

  public stopDriverWindow(): void {
    if (this.definition === null) return;
    this.window.stop();
  }

  public isInsideInteractionZone(player: PlanarPoint, pose: PlanarVehiclePose): boolean {
    if (this.definition === null) return false;
    return isInsideDriverInteractionZone(player, pose, this.definition.driverInteractionZone);
  }

  public requestExitVehicle(speedMetersPerSecond: number): DriverAccessCommandResult {
    if (this.definition === null) return { accepted: false, reason: 'unsupported' };
    if (!this.isStationary(speedMetersPerSecond)) {
      return { accepted: false, reason: 'vehicle-moving' };
    }
    return { accepted: true };
  }

  public requestEnterVehicle(
    speedMetersPerSecond: number,
    player: PlanarPoint,
    pose: PlanarVehiclePose,
  ): DriverAccessCommandResult {
    if (this.definition === null) return { accepted: false, reason: 'unsupported' };
    if (!this.isStationary(speedMetersPerSecond)) {
      return { accepted: false, reason: 'vehicle-moving' };
    }
    if (!this.isInsideInteractionZone(player, pose)) {
      return { accepted: false, reason: 'not-near' };
    }
    return { accepted: true };
  }

  /** World-space ground anchor of the authored driver exit point. */
  public driverExitPoint(pose: PlanarVehiclePose): PlanarPoint | null {
    return this.definition === null ? null : driverExitWorldPoint(pose, this.definition);
  }

  /** World-space ground anchor of the authored driver entry point. */
  public driverEntryPoint(pose: PlanarVehiclePose): PlanarPoint | null {
    return this.definition === null ? null : driverEntryWorldPoint(pose, this.definition);
  }
}
