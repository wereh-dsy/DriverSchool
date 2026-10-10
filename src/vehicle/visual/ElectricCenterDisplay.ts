import type { InstrumentTelemetry } from './InstrumentCluster';

export const ELECTRIC_DISPLAY_LAYOUT = { width: 1024, height: 640, splitX: 338,
  driving: { x: 0, y: 0, width: 338, height: 640 }, map: { x: 338, y: 0, width: 686, height: 640 } } as const;
const severityColor = { NONE: '#adb2b3', FAR: '#b7bdbe', CAUTION: '#c7ab68', NEAR: '#c48a4e', CRITICAL: '#bc5148' };

/** Light, fixed 33/67 CanvasTexture face. Gear changes only the central driving view. */
export class ElectricCenterDisplay {
  private elapsed = Infinity;
  private key = '';
  private blinkKey = '';
  public update(canvas: HTMLCanvasElement, telemetry: InstrumentTelemetry, dt: number): boolean {
    const data = telemetry.electricDisplay, ev = telemetry.ev, indicators = telemetry.indicators;
    this.elapsed += dt;
    const blink = `${indicators?.leftTurn}|${indicators?.rightTurn}`;
    if (this.elapsed < .05 && blink === this.blinkKey) return false;
    this.elapsed = 0; this.blinkKey = blink;
    const key = `${telemetry.ignitionOn}|${telemetry.driveAvailable}|${Math.round(telemetry.speedKmh)}|${telemetry.gear}|${telemetry.driveMode}|${ev?.stateOfCharge.toFixed(3)}|${Math.round(ev?.estimatedRangeKm ?? 0)}|${ev?.batteryPowerKw.toFixed(0)}|${ev?.regenLimitReason}|${telemetry.cruiseTargetSpeedKmh}|${JSON.stringify(indicators)}|${data?.version}|${data?.x.toFixed(1)}|${data?.z.toFixed(1)}|${data?.yaw.toFixed(2)}|${data?.viewMetres.toFixed(1)}|${data?.localTime}`;
    if (this.key === key) return false;
    const c = canvas.getContext('2d'); if (!c) return false;
    this.key = key;
    c.clearRect(0, 0, 1024, 640); c.fillStyle = '#fafaf7'; c.fillRect(0, 0, 1024, 640);
    const text = (value: string, x: number, y: number, size: number, color = '#242b2e', align: CanvasTextAlign = 'left', bold = false) => {
      c.font = `${bold ? '600' : '400'} ${size}px "Segoe UI", sans-serif`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(value, x, y);
    };
    if (data) data.map.draw(c, ELECTRIC_DISPLAY_LAYOUT.map, data.x, data.z, data.yaw, data.viewMetres);
    else { c.fillStyle = '#f2f3ef'; c.fillRect(338, 0, 686, 640); text('Map unavailable', 681, 330, 30, '#727778', 'center'); }
    c.fillStyle = '#fafaf7'; c.fillRect(338, 0, 686, 58);
    text('MAP', 365, 39, 26, '#6d7578'); if (data?.localTime) text(data.localTime, 993, 39, 28, '#525b60', 'right');
    if (data?.map.available) {
      const metres = data.viewMetres > 350 ? 100 : data.viewMetres > 140 ? 50 : 20, length = metres / data.viewMetres * 686;
      c.strokeStyle = '#656d70'; c.lineWidth = 2; c.beginPath(); c.moveTo(371, 599); c.lineTo(371 + length, 599); c.stroke();
      text(`${metres} m`, 371, 628, 24, '#616a6d'); text('N ↑', 992, 625, 25, '#616a6d', 'right');
    }
    c.strokeStyle = '#dcdfdf'; c.lineWidth = 1; c.beginPath(); c.moveTo(338, 0); c.lineTo(338, 640); c.stroke();
    if (telemetry.ignitionOn === false) { text('OFF', 169, 315, 42, '#858c8e', 'center'); return true; }
    text(String(Math.round(Math.abs(telemetry.speedKmh))), 22, 120, 108, '#202729', 'left', true);
    text('km/h', 27, 156, 25, '#677175');
    text(String(telemetry.gear), 282, 69, 50, '#202729', 'center', true);
    if (indicators?.leftTurn) text('←', 238, 143, 42, '#438964', 'center', true);
    if (indicators?.rightTurn) text('→', 294, 143, 42, '#438964', 'center', true);
    for (let i=0;i<4;i++) { const gear = ['P','R','N','D'][i]!; text(gear, 27 + i * 54, 194, 28, gear === telemetry.gear ? '#252d30' : '#a7adae', 'left', gear === telemetry.gear); }
    const lamps = [indicators?.highBeam ? 'HIGH' : indicators?.headlights ? 'LOW' : indicators?.positionLights ? 'POS' : '', indicators?.fogLights ? 'FOG' : ''].filter(Boolean);
    text(lamps.join('  '), 317, 211, 22, indicators?.highBeam ? '#54899f' : '#56846c', 'right');
    c.save(); c.beginPath(); c.rect(12, 222, 314, 240); c.clip();
    const centreX = 169, centreY = 349;
    if (data && !data.parking) {
      for (let i=0;i<data.lanes.length;i++) {
        const line = data.lanes[i]!; c.strokeStyle = '#a9b5ba'; c.lineWidth = 3;
        c.setLineDash(data.laneMarkings?.[i] === 'dashed' ? [11, 13] : []); c.beginPath();
        line.forEach((p, j) => { const x = centreX + p.x * 4.8, y = centreY - p.forward * 4.8; if (j === 0) c.moveTo(x,y); else c.lineTo(x,y); }); c.stroke();
      }
      c.setLineDash([]); c.fillStyle = '#a4acaf';
      for (const obstacle of data.obstacles) c.fillRect(centreX + obstacle.x * 4.8 - obstacle.width * 2.4, centreY - obstacle.forward * 4.8 - obstacle.length * 2.4, Math.max(7,obstacle.width * 4.8), Math.max(7,obstacle.length * 4.8));
    }
    if (data?.parking) for (let i=0;i<data.proximity.zones.length;i++) {
      const zone = data.proximity.zones[i]!; if (zone.distanceM === null || zone.severity === 'NONE') continue;
      const angle = (i - 3) * Math.PI / 4, rear = i >= 4 && i <= 6;
      c.strokeStyle = severityColor[zone.severity]; c.globalAlpha = data.reverse && !rear ? .65 : 1;
      c.lineWidth = data.reverse && rear ? 7 : 4;
      for (let band=0;band < (zone.severity === 'CRITICAL' ? 3 : zone.severity === 'NEAR' ? 2 : 1);band++) {
        c.beginPath(); c.ellipse(centreX, centreY, 59 + band*9, 86 + band*9, 0, angle-.31, angle+.31); c.stroke();
      }
    }
    c.globalAlpha = 1; c.fillStyle = '#dce1e2'; c.strokeStyle = '#939da1'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(centreX-25, centreY-48, 50, 96, 14); c.fill(); c.stroke();
    c.fillStyle = '#8c9bA2'; c.beginPath(); c.roundRect(centreX-19, centreY-24, 38, 37, 7); c.fill();
    c.strokeStyle = '#edf2f3'; c.lineWidth = 4; c.beginPath(); c.moveTo(centreX-15, centreY-41); c.lineTo(centreX+15, centreY-41); c.stroke();
    c.restore();
    const proximity = data?.proximity;
    if (data?.parking && proximity?.nearestDistanceM !== null && proximity?.nearestDistanceM !== undefined) {
      text(`${proximity.nearestDistanceM.toFixed(proximity.nearestDistanceM < .5 ? 2 : 1)} m`, 169, 474, 32, proximity.nearestDistanceM < .4 ? '#bc5148' : '#7c7561', 'center');
    }
    const warning = !telemetry.driveAvailable ? 'NO DRIVE' : (ev?.stateOfCharge ?? 1) <= .08 ? 'LOW BATTERY'
      : indicators?.absWarning ? 'ABS' : indicators?.tcsActive || indicators?.escActive ? 'TRACTION'
      : ev?.regenLimited ? 'REGEN LIMITED' : indicators?.autoHold ? 'HOLD' : indicators?.parkingBrake ? 'PARK BRAKE' : '';
    text(warning, 169, 501, 23, '#9b743c', 'center');
    const power = ev?.batteryPowerKw ?? 0, fraction = Math.min(1, Math.abs(power) / (power < 0 ? 85 : 230));
    c.fillStyle = '#d7dddc'; c.fillRect(22, 519, 294, 5);
    c.fillStyle = power < 0 ? '#598b79' : '#627981'; c.fillRect(power < 0 ? 169-147*fraction : 169, 519, 147*fraction, 5);
    text(`${power < 0 ? 'REGEN' : 'POWER'} ${Math.abs(power).toFixed(0)} kW`, 169, 553, 25, '#5b6d71', 'center');
    text(ev ? `${Math.round(ev.stateOfCharge*100)}%  ${Math.round(ev.estimatedRangeKm)} km` : '—', 22, 598, 36, '#273336');
    if (telemetry.driveMode) text(telemetry.driveMode, 22, 627, 23, '#6b7579');
    if (indicators?.cruise) text(`CRUISE ${Math.round(telemetry.cruiseTargetSpeedKmh ?? 0)}`, 317, 627, 23, '#538379', 'right');
    return true;
  }
}
