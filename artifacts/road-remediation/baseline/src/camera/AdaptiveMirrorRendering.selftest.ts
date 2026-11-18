import { AdaptiveMirrorRendering, type AdaptiveMirrorContext } from './AdaptiveMirrorRendering';
import { DriverCamera } from './DriverCamera';
import { MirrorSystem } from './MirrorSystem';
import { InteriorMirror } from './InteriorMirror';
import { Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, ShaderMaterial, Vector3, Vector4, type Material, type WebGLRenderer } from 'three';

export function runAdaptiveMirrorSelfTest() {
  let assertions = 0;
  const check = (value: boolean, message: string) => { assertions++; if (!value) throw new Error(`Adaptive mirror: ${message}`); };
  const c: AdaptiveMirrorContext = { speed: 38, road: 'highway', headYaw: 0, headTargetYaw: 0, leftSignal: false,
    rightSignal: false, selector: 'D', parking: false, steering: 0, lateralActive: false, laneChange: false, junction: false, preview: null };
  const policy = new AdaptiveMirrorRendering(), counts = [0, 0, 0];
  for (let i = 0; i < 600; i++) { const mask = policy.update(1 / 120, c, 5); if (i >= 120) for (let j = 0; j < 3; j++) if (mask & 1 << j) counts[j] = counts[j]! + 1; }
  check(counts[0] === 480 && counts[1] === 0 && counts[2] === 480, 'visible mirrors render every frame; invisible right view skipped');
  check(!policy.showRightOverlay, 'neutral highway hides dedicated right overlay');
  check(policy.update(0, c, 7) === 7, 'a mirror entering view renders immediately, even with zero elapsed time');
  c.rightSignal = true; check(!!(policy.update(0, c) & 2), 'right signal immediately refreshes');
  check(!policy.showRightOverlay && !!(policy.update(0, c, 0) & 2), 'right signal restores entity mirror without high-speed overlay');
  c.rightSignal = false; policy.update(0, c); c.headTargetYaw = -.35; check(!!(policy.update(0, c) & 2), 'target head movement refreshes before smoothing');
  c.headTargetYaw = 0; c.leftSignal = true; check(!!(policy.update(0, c) & 1), 'left signal priority');
  c.rightSignal = true; check(!!(policy.update(0, c) & 2), 'hazards prioritize both sides');
  c.leftSignal = c.rightSignal = false; c.selector = 'R'; check(policy.update(0, c) === 7, 'reverse immediately promotes all mirrors');
  check(policy.showRightOverlay && policy.update(0, c, 0) === 7, 'reverse retains complete mirrors');
  c.selector = 'D'; c.road = 'urban'; c.speed = 29 / 3.6; check(policy.update(.02, c, 5) === 7 && policy.showRightOverlay, 'low-speed city retains every-frame overlay feedback');
  c.speed = 30 / 3.6; policy.update(.02, c); check(!policy.showRightOverlay, '30 km/h hides overlay');
  c.speed = 38; c.road = 'ramp'; policy.update(.02, c); check(!policy.showRightOverlay, 'higher-speed ramp hides only overlay');
  c.road = 'unknown'; policy.update(.02, c); check(!policy.showRightOverlay, 'higher-speed unknown road hides overlay');
  c.road = 'highway'; for (let i = 0; i < 120; i++) policy.update(1 / 120, c);
  c.laneChange = true; check(policy.update(0, c) === 7 && !policy.showRightOverlay, 'lane change promotes entity mirrors without overriding overlay speed rule');
  c.laneChange = false; c.parking = true; check(policy.update(.02, c, 0) === 7, 'parking prioritizes all mirrors');
  c.parking = false; c.preview = 'right'; check(!!(policy.update(.02, c, 0) & 2) && !policy.showRightOverlay, 'settings prioritize entity mirror without overriding overlay speed rule');
  c.preview = null; c.lateralActive = true; check((policy.update(.02, c, 0) & 3) === 3, 'active assistance keeps side mirrors ready every frame');
  c.lateralActive = false; policy.invalidate(); check(policy.update(0, c, 0) === 7, 'resource change invalidates every cached mirror');
  const saved = new Vector4(0, 0, 1280, 720); let target: unknown = null, passes = 0;
  const renderer = { capabilities: { maxTextureSize: 8192 }, xr: { enabled: false }, shadowMap: { autoUpdate: true }, autoClear: true,
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    getViewport: (v: Vector4) => v.copy(saved), getScissor: (v: Vector4) => v.copy(saved), getScissorTest: () => false,
    setRenderTarget: (v: unknown) => { target = v; }, setViewport: () => {}, setScissor: () => {}, setScissorTest: () => {},
    state: { buffers: { depth: { setMask: () => {} } } }, render: () => { passes++; } } as unknown as WebGLRenderer;
  const driver = new DriverCamera({ driverEyePosition: [0, 1, 0] });
  const vehicle = new Group();
  driver.update(vehicle);
  const mirrors = new MirrorSystem(renderer, new Scene(), { driverCamera: driver, vehicleRoot: vehicle,
    mirrors: { left: { position: [-.4, 1, -1], size: [.3, .2] }, right: { position: [.4, 1, -1], size: [.3, .2] } } });
  c.lateralActive = false; mirrors.renderAdaptive(0, c); check(passes === 2, 'initial textures rendered');
  mirrors.renderAdaptive(0, c); check(passes === 4, 'visible mirrors render again without a frequency timer');
  const left = mirrors.getView('left').textureMatrix.clone(); driver.setDriverEyePosition([.05, 1, 0]); c.rightSignal = true;
  driver.setHeadLook(-1.4, 0); c.headYaw = c.headTargetYaw = -1.4;
  driver.update(vehicle);
  mirrors.renderAdaptive(0, c); check(passes === 5, 'out-of-view mirror skipped while observation keeps requested side live');
  check(left.equals(mirrors.getView('left').textureMatrix), 'skipped texture retains its matching projection');
  const corner = mirrors.getView('left').worldCorners[0].clone(), uv = new Vector4(corner.x, corner.y, corner.z, 1).applyMatrix4(left);
  vehicle.position.set(40, 2, -30); vehicle.rotation.y = .4;
  driver.update(vehicle);
  mirrors.renderAdaptive(0, c);
  const moved = corner.clone().applyMatrix4(vehicle.matrixWorld), attached = new Vector4(moved.x, moved.y, moved.z, 1).applyMatrix4(mirrors.getView('left').textureMatrix);
  check(Math.abs(uv.x / uv.w - attached.x / attached.w) < 1e-8 && Math.abs(uv.y / uv.w - attached.y / attached.w) < 1e-8, 'cached image stays attached during vehicle motion');
  check(passes === 6, 'attachment adds no pass for the invisible side');
  check(target === null && renderer.shadowMap.autoUpdate, 'render state restored'); mirrors.dispose();
  vehicle.position.set(0, 0, 0); vehicle.rotation.set(0, 0, 0); driver.resetHeadLook(true); driver.update(vehicle);
  const surface = new Mesh<PlaneGeometry, Material>(new PlaneGeometry(.3, .1), new MeshBasicMaterial()); surface.position.set(0, 1, -1); vehicle.add(surface);
  const originalMaterial = surface.material, cabin = new InteriorMirror(renderer, new Scene(), driver.camera, surface, [.3, .1], vehicle);
  const frustum = new Frustum(), projection = new Matrix4();
  const setFrustum = () => { driver.camera.updateWorldMatrix(true, false); frustum.setFromProjectionMatrix(projection.multiplyMatrices(driver.camera.projectionMatrix, driver.camera.matrixWorldInverse)); };
  setFrustum(); check(cabin.isVisible(frustum), 'visible cabin aperture remains live');
  cabin.render(); cabin.render(); check(passes === 8, 'cabin mirror renders on consecutive frames');
  const texture = (surface.material as ShaderMaterial).uniforms.textureMatrix!.value as Matrix4;
  const point = new Vector3(.1, 0, 0).applyMatrix4(surface.matrixWorld), oldUv = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(texture);
  vehicle.position.set(15, 2, -20); vehicle.rotation.y = .3; cabin.attachCachedTexture();
  const newPoint = new Vector3(.1, 0, 0).applyMatrix4(surface.matrixWorld), newUv = new Vector4(newPoint.x, newPoint.y, newPoint.z, 1).applyMatrix4(texture);
  check(Math.abs(oldUv.x / oldUv.w - newUv.x / newUv.w) < 1e-8 && Math.abs(oldUv.y / oldUv.w - newUv.y / newUv.w) < 1e-8, 'cached cabin image follows moving aperture');
  driver.setHeadLook(-1.4, 0); driver.update(vehicle); setFrustum(); check(!cabin.isVisible(frustum), 'invisible cabin aperture can be skipped');
  cabin.dispose(); check(surface.material === originalMaterial, 'cabin material ownership restored'); surface.geometry.dispose(); originalMaterial.dispose();
  return { passed: true, assertions, highwayPasses: counts };
}
