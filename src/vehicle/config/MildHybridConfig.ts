import type { ElectricMotorConfig } from './ElectricVehiclePhysicsConfig';

/** Crank-mounted 48 V ISG only; no independent wheel propulsion. */
export interface MildHybridConfig {
  motor: ElectricMotorConfig;
  battery: { usableCapacityKWh: number; defaultSOC: number; nominalVoltage: number;
    internalResistance: number; maxDischargeCurrent: number; maxChargeCurrent: number;
    maxAssistPower: number; maxRegenPower: number };
  restartTorque: number; burstDuration: number; recoveryTime: number;
  liftOffTorque: number; brakeRegenTorque: number;
  modeAssist: Partial<Record<string, number>>;
}
