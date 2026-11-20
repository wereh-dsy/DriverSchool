import type { VehicleRuntimeSnapshot } from '../physics';
import type { VehicleHUDInfoSnapshot } from './VehicleHUDTypes';

/**
 * Formats regular driver-facing vehicle telemetry (speed, speed limit, gear, range)
 * independently of ADAS ON/OFF state.
 */
export function buildVehicleInformationSnapshot(
  visible: boolean,
  snapshot: VehicleRuntimeSnapshot | null,
  sharedSpeedLimitKmh: number | null,
  rulesSpeedLimitMps: number,
  speedLimitEstimated: boolean,
): VehicleHUDInfoSnapshot {
  if (!visible || !snapshot) {
    return {
      visible: false,
      speedKmh: 0,
      speedLimitKmh: null,
      overspeed: false,
      overspeedSeverity: 'none',
      gearLabel: '—',
      rangeKm: null,
      rangeLabel: '—',
      rangeKind: 'none',
    };
  }

  const speedKmh = Math.max(0, Math.round(Math.abs(snapshot.speed) * 3.6));

  let resolvedLimit: number | null = null;
  if (typeof sharedSpeedLimitKmh === 'number' && Number.isFinite(sharedSpeedLimitKmh) && sharedSpeedLimitKmh > 5) {
    resolvedLimit = Math.round(sharedSpeedLimitKmh);
  } else if (
    !speedLimitEstimated &&
    Number.isFinite(rulesSpeedLimitMps) &&
    rulesSpeedLimitMps > 2
  ) {
    resolvedLimit = Math.round(rulesSpeedLimitMps * 3.6);
  }

  const deltaOver = resolvedLimit !== null ? speedKmh - resolvedLimit : 0;
  const overspeed = deltaOver > 3;
  const overspeedSeverity: VehicleHUDInfoSnapshot['overspeedSeverity'] =
    deltaOver >= 12 ? 'severe' : overspeed ? 'mild' : 'none';

  const gearLabel = formatTransmissionGearLabel(snapshot);

  const fuelRange =
    snapshot.fuel && Number.isFinite(snapshot.fuel.estimatedRangeKm) && snapshot.fuel.estimatedRangeKm >= 0
      ? snapshot.fuel.estimatedRangeKm
      : null;
  const evRange =
    snapshot.powertrain?.ev &&
    Number.isFinite(snapshot.powertrain.ev.estimatedRangeKm) &&
    snapshot.powertrain.ev.estimatedRangeKm >= 0
      ? snapshot.powertrain.ev.estimatedRangeKm
      : null;

  let rangeKm: number | null = null;
  let rangeKind: VehicleHUDInfoSnapshot['rangeKind'] = 'none';
  if (fuelRange !== null && evRange !== null) {
    rangeKm = Math.max(0, Math.round(fuelRange + evRange));
    rangeKind = 'hybrid';
  } else if (evRange !== null) {
    rangeKm = Math.max(0, Math.round(evRange));
    rangeKind = 'ev';
  } else if (fuelRange !== null) {
    rangeKm = Math.max(0, Math.round(fuelRange));
    rangeKind = 'fuel';
  }

  return {
    visible: true,
    speedKmh,
    speedLimitKmh: resolvedLimit,
    overspeed,
    overspeedSeverity,
    gearLabel,
    rangeKm,
    rangeLabel: rangeKm !== null ? `${rangeKm} km` : '—',
    rangeKind,
  };
}

function formatTransmissionGearLabel(snapshot: VehicleRuntimeSnapshot): string {
  const t = snapshot.transmission;
  if (!t) {
    return snapshot.gear !== null && snapshot.gear !== undefined ? String(snapshot.gear) : 'N';
  }
  const mode = t.selectedMode;
  if (mode === 'P' || mode === 'R' || mode === 'N') {
    return mode;
  }
  const phys = t.currentPhysicalGear;
  if (t.manualSelectionActive) {
    if (typeof phys === 'number' && Number.isFinite(phys) && phys > 0) return `M${phys}`;
    return 'M';
  }
  if (t.type === 'MANUAL') {
    if (typeof phys === 'number' && Number.isFinite(phys) && phys > 0) return String(phys);
    if (snapshot.gear !== null && snapshot.gear !== undefined) return String(snapshot.gear);
  }
  if (mode === 'D') {
    return 'D';
  }
  if (snapshot.gear !== null && snapshot.gear !== undefined) return String(snapshot.gear);
  if (typeof phys === 'number' && Number.isFinite(phys) && phys > 0) return String(phys);
  return 'D';
}
