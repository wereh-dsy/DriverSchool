// Dev-only browser fixture. Not an entry in the packaged game; all movement
// uses the shipping 120 Hz VehicleContactSystem and VehicleInputState.
import '../src/styles.css';
import { Scene, WebGLRenderer } from 'three';
import { DrivingGame } from '../src/game/DrivingGame';
import { createNeutralVehicleInputState, type VehicleInputState } from '../src/input/VehicleInputState';
import { VehicleDynamics, type VehicleSnapshot } from '../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { DriverCamera } from '../src/camera/DriverCamera';
import { MirrorSystem } from '../src/camera/MirrorSystem';
import { MirrorOverlayRenderer } from '../src/ui/MirrorOverlayRenderer';
import { Hud } from '../src/ui/Hud';
import { CircuitGround } from '../src/world/circuit/CircuitGround';
import type { DrivingGround, DrivingGroundId } from '../src/world';
import type { VehicleId } from '../src/vehicle/VehicleCatalog';
import { VehicleLightingController } from '../src/vehicle/control/VehicleLightingController';
import { VehicleLighting } from '../src/vehicle/visual/VehicleLighting';
import { VehicleFeedbackSystem } from '../src/vehicle/feedback/VehicleFeedbackSystem';

type Harness = {
  dynamics: VehicleDynamics; snapshot: VehicleSnapshot; contacts: VehicleContactSystem;
  ground: DrivingGround; vehicleVisual: VehicleVisual; driverCamera: DriverCamera;
  mirrors: MirrorSystem; mirrorOverlay: MirrorOverlayRenderer; scene: Scene;
  renderer: WebGLRenderer; hud: Hud;
  lightController: VehicleLightingController; vehicleLighting: VehicleLighting; feedback: VehicleFeedbackSystem;
  ignitionOn: boolean;
  switchGround(id: DrivingGroundId): void; switchVehicle(id: VehicleId): void;
  updateVehicleVisual(dt: number): void;
  processAccessoryCommands(input: VehicleInputState): void;
  updateVehicleFeedback(dt: number): void;
};
const host = document.querySelector<HTMLElement>('#app')!;
const game = new DrivingGame(host);
const g = game as unknown as Harness;
document.querySelector('[data-start-overlay]')?.remove();
const toolbar = document.createElement('div');
toolbar.style.cssText = 'position:fixed;left:240px;top:6px;z-index:10000;padding:5px;background:#101c22cc;display:flex;gap:4px;flex-wrap:wrap;max-width:650px;color:white;font:12px sans-serif';
const status = document.createElement('output');
status.setAttribute('aria-label', '驾驶验收进度');
status.style.cssText = 'width:100%;white-space:pre-wrap';
host.append(toolbar);
let job: (() => void) | null = null;
let vehicle: VehicleId = 'family-sedan';
let elapsed = 0;
const dt = 1 / 120;
const controls = (overrides: Partial<VehicleInputState> = {}) => ({ ...createNeutralVehicleInputState(), ...overrides });
function step(command: VehicleInputState) {
  g.processAccessoryCommands(command);
  g.snapshot = g.contacts.step(dt, command, g.dynamics);
  g.updateVehicleFeedback(dt);
  g.lightController.update(dt, command, { ignitionOn: g.ignitionOn,
    actualGear: g.snapshot.gear, steeringWheelAngle: g.snapshot.steeringWheelAngle });
  g.vehicleLighting.applyState(g.lightController.state);
  elapsed += dt;
}
function reset(map: DrivingGroundId, state: Parameters<VehicleDynamics['reset']>[0] = {}) {
  job = null; g.switchVehicle(vehicle); g.switchGround(map); g.contacts.reset();
  const spawn = g.ground.spawnPose;
  g.snapshot = g.dynamics.reset({ x: spawn.position.x, z: spawn.position.z, yaw: spawn.yawRadians, ...state });
  g.feedback.reset(g.snapshot);
  elapsed = 0; g.driverCamera.resetHeadLook(true);
  g.snapshot = g.contacts.step(dt, controls(), g.dynamics);
}
function button(text: string, action: () => void) {
  const b = document.createElement('button'); b.textContent = text;
  b.addEventListener('click', action); toolbar.append(b);
}
function runSeconds(seconds: number, command: VehicleInputState, label: string) {
  let remaining = Math.round(seconds / dt);
  job = () => {
    for (let i = 0; i < 6 && remaining > 0; i++, remaining--) step(command);
    status.textContent = `${label} · ${elapsed.toFixed(1)} s · ${g.snapshot.speedKmh.toFixed(1)} km/h · ${Math.round(g.snapshot.rpm)} rpm\n${g.snapshot.transmission.type} ${g.snapshot.transmission.selectedMode ?? ''} / ${g.snapshot.gear} · Pitch ${(g.snapshot.chassis.pitch * 180 / Math.PI).toFixed(2)}° Roll ${(g.snapshot.chassis.roll * 180 / Math.PI).toFixed(2)}°`;
    if (remaining === 0) { job = null; status.textContent += '\n完成 · 真实第一人称 / 实际四轮接触'; }
  };
}
button('家用车', () => { vehicle = 'family-sedan'; reset('subject-2-training-ground'); });
button('GT', () => { vehicle = 'sport-coupe'; reset('subject-2-training-ground'); });
button('6AT', () => { vehicle = 'test-6at-sedan'; reset('subject-2-training-ground'); });
button('7DCT', () => { vehicle = 'test-7dct-sedan'; reset('subject-2-training-ground'); });
button('自动挡起停', () => {
  reset('subject-2-training-ground');
  g.dynamics.requestDriveSelector('D', 1);
  let remaining = 12 * 120;
  job = () => {
    for (let i = 0; i < 6 && remaining > 0; i++, remaining--) {
      step(controls({ brake: elapsed < 2 || elapsed >= 8 ? 1 : 0, throttle: 0 }));
    }
    const t = g.snapshot.transmission;
    status.textContent = `${t.type} · ${elapsed.toFixed(1)} s · ${t.selectedMode} / ${t.currentPhysicalGear} · ${g.snapshot.speedKmh.toFixed(1)} km/h · ${Math.round(g.snapshot.rpm)} rpm\n${t.torqueConverter ? `SLIP ${Math.round(t.torqueConverter.slipRPM)} · LOCK ${Math.round(t.torqueConverter.lockupEngagement * 100)}%` : t.dct ? `A ${Math.round(t.dct.clutchAEngagement * 100)}% · B ${Math.round(t.dct.clutchBEngagement * 100)}% · NEXT ${t.dct.preselectedGear}` : '请先选6AT/7DCT'} `;
    if (remaining === 0) { job = null; status.textContent += g.snapshot.engineRunning && g.snapshot.speedKmh < .1 ? '\n完成 · D挡刹停，发动机仍运行' : '\n验收异常'; }
  };
});
button('科目二低速转向', () => { reset('subject-2-training-ground', { speed: 2, gear: 'N' }); runSeconds(4, controls({ steering: .55 }), '科目二低速'); });
button('倒库后退', () => { reset('subject-2-training-ground', { x: -22, z: 22, yaw: 0, speed: -1.5, gear: 'N' }); runSeconds(4, controls({ steering: .05 }), '倒库车身 / 库线'); });
button('科目二坡起', () => { reset('subject-2-training-ground', { x: -43, z: -16, yaw: 0, gear: 'N' }); if (g.snapshot.transmission.type === 'MANUAL') g.dynamics.requestGear(1); else g.dynamics.requestDriveSelector('D', 1); runSeconds(7, controls({ throttle: .75 }), '坡起 / 四轮地形'); });
button('公路制动转向', () => { reset('road-course', { x: 0, z: 95, yaw: 0, speed: 16, gear: 'N' }); runSeconds(3, controls({ steering: .22, brake: .27 }), '公路制动入弯'); });
button('公路单侧草地', () => { reset('road-course', { x: 5.7, z: 95, yaw: 0, speed: 10, gear: 'N' }); runSeconds(4, controls(), '单侧草地拖拽'); });
button('赛道连续两圈', () => {
  reset('simple-circuit', { gear: 'N' }); if (g.snapshot.transmission.type === 'MANUAL') g.dynamics.requestGear(1); else g.dynamics.requestDriveSelector('D', 1);
  const ground = g.ground as CircuitGround;
  const route = ground.metadata.routeCenterline.slice(0, -1);
  const spacing = ground.metadata.lapLength / route.length;
  let nearest = route.reduce((best, p, i) => Math.hypot(p.x - g.snapshot.x, p.z - g.snapshot.z) < Math.hypot(route[best]!.x - g.snapshot.x, route[best]!.z - g.snapshot.z) ? i : best, 0);
  let previous = nearest, laps = 0, maxError = 0, cooldown = 0, collisions = 0;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const modulo = (n: number) => (n % route.length + route.length) % route.length;
  job = () => {
    for (let k = 0; k < 36 && laps < 2 && elapsed < 300; k++) {
      const s = g.snapshot; let best = Infinity;
      for (let off = -45; off <= 45; off++) {
        const idx = modulo(nearest + off), p = route[idx]!;
        const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
        if (d < best) { best = d; previous = idx; }
      }
      if (nearest > route.length * .82 && previous < route.length * .18) laps++;
      nearest = previous; maxError = Math.max(maxError, Math.sqrt(best));
      const distance = route[nearest]!.distance;
      let radius = Infinity;
      for (const section of ground.metadata.sections) {
        if (section.radius === undefined) continue;
        const ahead = (section.startDistance - distance + ground.metadata.lapLength) % ground.metadata.lapLength;
        if (ahead < 145 || distance >= section.startDistance && distance <= section.endDistance) radius = Math.min(radius, section.radius);
      }
      const targetSpeed = radius < 55 ? 36 : radius < 82 ? 62 : radius < 102 ? 72 : Number.isFinite(radius) ? 80 : 98;
      const look = Math.max(14, Math.min(31, 13 + Math.abs(s.speed) * .62));
      const p = route[modulo(nearest + Math.round(look / spacing))]!;
      const steering = Math.max(-1, Math.min(1, -wrap(Math.atan2(-(p.x - s.x), -(p.z - s.z)) - (s.yaw - s.bodySlipAngle)) * 1.55));
      const error = targetSpeed - s.speedKmh;
      const brake = error < -7 ? Math.min(.72, (-error - 4) / 22) : 0;
      const throttle = brake ? 0 : error > 12 ? .78 : error > 3 ? .48 : .2;
      cooldown = Math.max(0, cooldown - dt);
      const gear = typeof s.gear === 'number' ? s.gear : 0;
      const shiftUp = s.transmission.type === 'MANUAL' && gear > 0 && gear < 5 && cooldown === 0 && s.speedKmh > ([0,24,43,67,91][gear] ?? Infinity);
      if (shiftUp) cooldown = 1.15;
      step(controls({ steering, brake, throttle, shiftUp }));
      if (g.contacts.collision?.collided) collisions++;
    }
    status.textContent = `${vehicle} 赛道 ${laps}/2 圈 · ${elapsed.toFixed(1)} s · ${g.snapshot.speedKmh.toFixed(1)} km/h\n最大线路偏差 ${maxError.toFixed(2)} m · 碰撞 ${collisions}`;
    if (laps >= 2 || elapsed >= 300) { job = null; status.textContent += laps >= 2 ? '\n完成连续两圈' : '\n未完成'; }
  };
});
button('看左镜', () => { g.driverCamera.setHeadLook(.42, -.06); g.mirrorOverlay.setView(g.mirrors.getView('left')); });
button('回正 / 右镜', () => { g.driverCamera.resetHeadLook(true); g.mirrorOverlay.setView(g.mirrors.getView('right')); });
button('主灯循环', () => {
  g.lightController.cycleMainLightMode(); g.vehicleLighting.applyState(g.lightController.state);
  status.textContent = `灯光 ${g.lightController.state.mainLightMode} · 真实前后灯 / 同一镜面反射`;
});
button('雾灯', () => { g.lightController.toggleFog(); g.vehicleLighting.applyState(g.lightController.state); status.textContent = `雾灯 ${g.lightController.state.fogLightsEnabled} · 主灯 ${g.lightController.state.mainLightMode}`; });
button('制动灯', () => { step(controls({ brake: 1 })); status.textContent = `制动灯 ${g.lightController.state.brakeLight}`; });
button('倒车灯', () => { reset('subject-2-training-ground', { gear: 'R', driveSelector: 'R' }); step(controls()); status.textContent = `倒车灯 ${g.lightController.state.reverseLight} · 实际 ${g.snapshot.gear}`; });
button('左镜灯体', () => { g.driverCamera.setHeadLook(.42, -.06); g.mirrorOverlay.setView(g.mirrors.getView('left')); });
toolbar.append(status);
reset('subject-2-training-ground');
const render = () => {
  job?.();
  g.updateVehicleVisual(dt); g.driverCamera.update(g.vehicleVisual.root, dt);
  g.hud.update({ ...g.snapshot, inputSource: 'keyboard', cruiseAvailable: false, cruiseActive: false, cruiseTargetSpeedKmh: null }, dt);
  g.hud.settings.setDriveSelector(g.snapshot.transmission.selectedMode ?? 'N', g.snapshot.transmission.type);
  g.mirrors.render(); g.renderer.setRenderTarget(null); g.renderer.setViewport(0, 0, innerWidth, innerHeight);
  g.renderer.setScissorTest(false); g.renderer.clear(true, true, true);
  g.renderer.render(g.scene, g.driverCamera.camera);
  g.mirrorOverlay.render(g.renderer, g.hud.getMirrorRect());
  requestAnimationFrame(render);
};
requestAnimationFrame(render);
window.addEventListener('beforeunload', () => game.dispose(), { once: true });
