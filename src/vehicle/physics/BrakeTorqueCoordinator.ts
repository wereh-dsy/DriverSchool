import type { WheelBrakeTorques } from './BrakeSystem';

/** One physical hydraulic actuator per wheel. ABS has final service authority. */
export class BrakeTorqueCoordinator {
  public readonly wheelTorques: WheelBrakeTorques[] = Array.from({ length: 4 }, () => ({
    requestedBrakeTorque: 0, appliedBrakeTorque: 0,
    requestedHandbrakeTorque: 0, appliedHandbrakeTorque: 0,
  }));
  private readonly esc = [0, 0, 0, 0];
  private readonly traction = [0, 0, 0, 0];
  private readonly service = [0, 0, 0, 0];
  private readonly parking = [0, 0, 0, 0];
  public reset(): void {
    this.esc.fill(0); this.traction.fill(0); this.service.fill(0); this.parking.fill(0);
    for (const t of this.wheelTorques) Object.assign(t, {
      requestedBrakeTorque: 0, appliedBrakeTorque: 0, requestedHandbrakeTorque: 0, appliedHandbrakeTorque: 0 });
  }
  public requestWheel(index: number, source: 'esc' | 'traction', torque: number): void {
    (source === 'esc' ? this.esc : this.traction)[index] = Math.max(0, torque);
  }
  public requestBase(index: number, service: number, parking: number): void {
    this.service[index] = Math.max(0, service); this.parking[index] = Math.max(0, parking);
  }
  public hasServiceRequest(index: number): boolean {
    return Math.max(this.service[index]!, this.esc[index]!, this.traction[index]!) > 1;
  }
  public resolve(index: number, maximum: number, absPressure: number): WheelBrakeTorques {
    // Driver/hold/emergency and assists request the same caliper. Max avoids
    // double counting overlapping requests; ABS modulates the complete result.
    const requestedBrakeTorque = Math.min(maximum,
      Math.max(this.service[index]!, this.esc[index]!, this.traction[index]!));
    const out = this.wheelTorques[index]! as { -readonly [K in keyof WheelBrakeTorques]: number };
    out.requestedBrakeTorque = requestedBrakeTorque;
    out.appliedBrakeTorque = requestedBrakeTorque * Math.min(1, Math.max(0, absPressure));
    out.requestedHandbrakeTorque = this.parking[index]!;
    out.appliedHandbrakeTorque = this.parking[index]!;
    return out;
  }
}
