import * as T from 'three';
import { VehicleVisual } from './VehicleVisual';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { getVehicleDescriptor, createVehiclePhysicsConfig } from '../VehicleCatalog';
import { SharedVehicleData } from '../SharedVehicleData';
import { ElectricPowertrain } from '../powertrain/ElectricPowertrain';
import { ElectricCenterDisplay } from './ElectricCenterDisplay';
import { LateralAssistController } from '../control/LateralAssistController';
import { createLaneObservation } from '../../world/navigation/LaneObservation';
import { createStaticOBBCollider } from '../physics/CollisionSystem';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import { taycanBrightness } from './TaycanDisplaySurface';
import { taycanSymbolAtlas } from './TaycanSymbols';

/** Display-only integration checks: live telemetry/controller/sensor sources, recording canvases. */
export function runTaycanDisplaysSelfTest() {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => { assertions++; if (!condition) throw new Error(`Taycan HMI: ${message}`); };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const allTexts: string[] = [];
  const contexts: CanvasRenderingContext2D[] = [];
  const makeCanvas = () => {
    const values: Record<string, unknown> = {};
    const context = new Proxy({} as CanvasRenderingContext2D, { get: (_target, key: string) => {
      if (key === 'fillText') return (value: string) => { allTexts.push(value); };
      if (key === 'measureText') return (value: string) => ({ width: value.length * 12 });
      if (key.startsWith('create')) return () => ({ addColorStop: () => {} });
      return values[key] ?? (() => {});
    }, set: (_target, key: string, value) => { values[key] = value; return true; } });
    contexts.push(context); return { width: 1, height: 1, getContext: () => context };
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: makeCanvas } });
  const assets = new VehicleAssetRegistry(), descriptor = getVehicleDescriptor('porsche-taycan-4s');
  const visual = new VehicleVisual(descriptor.visualConfig, assets);
  const shared = new SharedVehicleData({ lanes: true, navigation: true, proximity: true, tpms: true, parkingMode: 'selector' });
  try {
    const config = createVehiclePhysicsConfig('porsche-taycan-4s');
    const provider = new ElectricPowertrain(config); provider.reset({ driveSelector: 'D' });
    const telemetry: InstrumentTelemetry = { speedKmh: 80, rpm: 0, gear: 'D2', ignitionOn: true, ambientDaylight: 1,
      driveMode: 'NORMAL', sharedVehicle: shared, tyres: shared.tyres, ev: provider.getSnapshot().ev,
      assistCapabilities: descriptor.capabilities, indicators: { parkingBrake: false, headlights: false },
      chassisStatus: { rideHeight: .128, targetHeight: .128, nominalHeight: .128, dampingMode: 'NORMAL', electricSoundPresence: config.audioPresence! } };
    const instrument = visual.cockpitRoot.instrumentCluster.premiumEVFace!, displays = visual.cockpitRoot.taycanDisplays!;
    const { center, climate, chrono } = displays;
    const update = (t = telemetry, count = 60, dt = 1 / 60) => { for (let i = 0; i < count; i++) visual.updateInstruments(t, dt); };
    assert(descriptor.capabilities.navigation && descriptor.capabilities.parking360 && descriptor.capabilities.tpms && descriptor.capabilities.lka && descriptor.capabilities.lcc,
      'shared data features and authorized existing lateral controllers installed');
    assert(visual.root.getObjectByName('Taycan curved three-zone instruments') !== undefined && visual.root.getObjectByName('Taycan lower climate touch display') !== undefined && visual.root.getObjectByName('Taycan Sport Chrono') !== undefined, 'four distinct physical displays');
    let pointLights = 0; visual.cockpitRoot.traverse(o => { if (o instanceof T.PointLight) pointLights++; });
    assert(pointLights === 0, 'screen emission adds no cabin PointLight');
    const position = (instrument.surface.glass.geometry.getAttribute('position')) as T.BufferAttribute;
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < position.count; i++) { zMin = Math.min(zMin, position.getZ(i)); zMax = Math.max(zMax, position.getZ(i)); }
    assert(zMax - zMin > .03 && instrument.surface.width > .65, 'physical instrument is wide with curved wrap');
    const uv = instrument.surface.glass.geometry.getAttribute('uv') as T.BufferAttribute;
    let mappingError = 0;
    for (let i = 0; i < position.count; i++) {
      mappingError = Math.max(mappingError, Math.abs(position.getY(i) - (uv.getY(i) - .5) * instrument.surface.height));
    }
    assert(mappingError < 1e-7, 'curved profile clips the screen without vertically distorting circular meters');
    assert(Math.abs(instrument.surface.width / 1536 - instrument.surface.height / 540) < 1e-9,
      'circle texture uses equal horizontal and vertical physical pixel scale');
    assert(climate.rotation.x < -.6 && center.position.z > descriptor.visualConfig.dashboard.position[2], 'separate embedded center and tilted console display');
    assert(instrument.surface.staticTexture.image === assets.canvas('Taycan curved instrument/static-v1', 1536, 540, () => { throw new Error('static redrawn'); }), 'static texture comes from shared cache');
    assert(taycanSymbolAtlas(assets) === taycanSymbolAtlas(assets), 'one cached icon atlas');
    instrument.selectPage('driving'); update();
    assert(allTexts.includes('80') && allTexts.includes('NORMAL') && !allTexts.some(s => /rear motor|motor rpm|THERMAL POWER LIMIT/.test(s)), 'readable primary speed with no engineering debug panel');
    const counts = instrument.surface.regions.map(r => r.redraws), centerCount = center.surface.regions.map(r => r.redraws), lowerCount = climate.surface.regions[0]!.redraws;
    update(telemetry, 50, .001);
    assert(instrument.surface.regions.every((r, i) => r.redraws === counts[i]) && climate.surface.regions[0]!.redraws === lowerCount && center.surface.regions.every((r, i) => r.redraws === centerCount[i]), 'unchanged values do not redraw/upload canvases');
    const rapidStart = instrument.surface.regions[1]!.redraws;
    for (let i = 0; i < 120; i++) visual.updateInstruments({ ...telemetry, speedKmh: i }, 1 / 120);
    assert(instrument.surface.regions[1]!.redraws - rapidStart <= 31, 'speed region updates at at most 30 Hz');
    update({ ...telemetry, ambientDaylight: .025, indicators: { headlights: true } }, 180);
    const nightLevel = instrument.surface.brightness;
    assert(nightLevel > .60 && nightLevel < .70 && climate.surface.brightness < nightLevel, 'night readable, lower screen dimmer than instrument');
    assert(taycanBrightness(1, false, true) > taycanBrightness(.025, true, true), 'environment and lamp dimming');
    update(telemetry, 180); assert(instrument.surface.brightness > .94, 'day readability restores without redrawing static assets');

    const road: RoadNetworkData = { mapId: 'display-fixture', bounds: { minimumX: -100, maximumX: 100, minimumZ: -120, maximumZ: 120 },
      segments: [{ id: 'fixture-road', centerline: [{ x: 0, z: -100 }, { x: 0, z: 100 }], length: 200, width: 7, laneWidth: 3.5, laneCountPerDirection: 1,
        travelDirection: 'two-way', speedLimit: 60, markingsAvailable: true, lanes: [{ id: 'left', roadId: 'fixture-road', index: 0, direction: 'reverse', width: 3.5 }, { id: 'right', roadId: 'fixture-road', index: 1, direction: 'forward', width: 3.5 }] }], intersections: [] };
    const pose = { x: 1.75, z: 0, yaw: 0, y: 0, width: config.width, length: config.length };
    let queries = 0; const query = () => { queries++; return []; };
    shared.update(0, pose, 'D', 80 / 3.6, true, road, query);
    assert(shared.navigation.speedLimit === 60 && shared.navigation.roadName === null && shared.navigation.route === null, 'navigation reads existing metadata without fake route');
    center.selectPage('navigation'); update(telemetry, 240);
    assert(center.mapDraws > 0 && shared.navigation.map.rasterizations > 0, 'logical cached map actually draws');
    const draws = center.mapDraws, rasterizations = shared.navigation.map.rasterizations;
    update(telemetry, 60, .0001);
    assert(center.mapDraws === draws && shared.navigation.map.rasterizations === rasterizations, 'unchanged map does not redraw/rebuild tiles');
    const queryCount = queries;
    center.selectVehiclePage('energy'); update(telemetry, 60);
    assert(center.mapDraws === draws && queries === queryCount, 'hidden map and UI adapters do not query sensors');
    allTexts.length = 0; center.selectVehiclePage('energy'); center.surface.regions[1]!.invalidate(); update();
    assert(allTexts.includes(`${Math.round(telemetry.ev!.stateOfCharge * 100)} %`) && allTexts.includes(`${Math.round(telemetry.ev!.estimatedRangeKm)} km`) && allTexts.includes(`${telemetry.ev!.tripEnergyRecoveredKWh.toFixed(2)} kWh`), 'energy data equals provider telemetry');
    center.selectVehiclePage('status'); allTexts.length = 0; update();
    assert(allTexts.includes('--') && !allTexts.includes('250'), 'invalid TPMS uses empty readings');
    shared.setTyreStatus(0, { pressure: 247, warning: true, valid: true }); allTexts.length = 0; update();
    assert(allTexts.includes('247'), 'shared TPMS input is displayed');
    const tyreDraws = center.surface.regions[1]!.redraws;
    for (let i = 0; i < 120; i++) { shared.setTyreStatus(0, { pressure: 247 + i, warning: true, valid: true }); visual.updateInstruments(telemetry, 1 / 120); }
    assert(center.surface.regions[1]!.redraws - tyreDraws <= 2, 'TPMS limited to 2 Hz');

    const lateral = new LateralAssistController(); lateral.configure(config.lateralAssist, config.steering, config.wheelBase); shared.lateralAssist = lateral.display;
    const lane = { ...createLaneObservation(), valid: true, laneId: 'lane-test', laneWidth: 3.5, confidence: 1,
      distanceToLeftBoundary: 1.75, distanceToRightBoundary: 1.75, leftBoundaryType: 'solid' as const, rightBoundaryType: 'dashed' as const, lookAheadDistance: 20 };
    const ctx = { speed: 80 / 3.6, lateralVelocity: 0, yawRate: 0, driverSteering: 0, operational: true, forwardGear: true, leftSignal: false, rightSignal: false, suspended: false };
    lateral.toggleLCC(); for (let i = 0; i < 180; i++) lateral.update(1 / 60, lane, ctx);
    instrument.selectPage('auto'); center.selectVehiclePage('assist'); allTexts.length = 0; update();
    assert(lateral.display.lccActive && instrument.visiblePage === 'assistance' && allTexts.includes('ACTIVE') && allTexts.includes('Lane Centering'), 'real LCC ACTIVE is shared by cluster and Assist page');
    lateral.update(1 / 60, { ...lane, valid: false }, ctx); allTexts.length = 0; update();
    assert(!lateral.display.lccActive && allTexts.includes('UNAVAILABLE'), 'invalid lane never shows fake engagement');
    lateral.reset(); const offsetLane = { ...lane, lateralOffset: -1.10, distanceToLeftBoundary: .65, distanceToRightBoundary: 2.85, headingError: -.08 };
    for (let i = 0; i < 120; i++) lateral.update(1 / 60, offsetLane, ctx);
    assert(lateral.display.correctingSide === 'left' || lateral.display.lkaActive, 'LKA correction source exists without rewriting controller');
    allTexts.length = 0; instrument.selectPage('assistance'); update(); assert(allTexts.includes('Lane Keeping'), 'LKA active state is rendered');
    instrument.selectPage('navigation'); allTexts.length = 0; update(); assert(allTexts.includes('Driving information') && !allTexts.includes('无法显示地图'), 'cluster no-route navigation keeps useful driving fallback');

    const obstacle = createStaticOBBCollider({ id: 'rear', x: pose.x, z: pose.z + config.length / 2 + .4, width: 2, length: .2 });
    shared.update(1, pose, 'R', 0, true, road, () => [obstacle]); center.selectVehiclePage('energy');
    update({ ...telemetry, gear: 'R' }, 30);
    assert(center.page === 'parking' && shared.parking.active && shared.rearParking.active && shared.parking.nearestDistanceM != null, 'R activates shared parking page and sensors');
    allTexts.length = 0; center.surface.regions[1]!.invalidate(); update({ ...telemetry, gear: 'R' });
    assert(allTexts.includes('Rear proximity') && allTexts.includes(`${shared.parking.nearestDistanceM!.toFixed(2)} m`), 'synthetic rear and 360 view consumes actual shared distances');
    update({ ...telemetry, gear: 'D2' }, 30); assert(center.page === 'parking', 'reverse exit has short delay');
    update({ ...telemetry, gear: 'D2' }, 90); assert(center.page === 'vehicle' && center.vehiclePage === 'energy', 'returns to prior page after R');
    assert(!center.click(new T.Vector2(.03, .105)), 'parking manual shortcut is disabled while D');
    update({ ...telemetry, gear: 'P' }); assert(center.click(new T.Vector2(.03, .105)) && center.page === 'parking', 'P permits manual parking');

    const climateDraws = climate.surface.regions[0]!.redraws, temperature = climate.driverTemperature;
    assert(climate.click(new T.Vector2(.25, 1 - 285 / 800)), 'temperature control consumes touch'); update();
    assert(climate.driverTemperature === temperature + .5 && climate.surface.regions[0]!.redraws > climateDraws, 'climate UI state changes and redraws');
    climate.click(new T.Vector2(.5, 1 - 505 / 800)); assert(!climate.auto && climate.fan === 3, 'fan is an actual UI control');
    climate.click(new T.Vector2(.5, 1 - 595 / 800)); assert(climate.auto, 'AUTO is an actual UI control');
    climate.click(new T.Vector2(.25, 1 - 710 / 800)); assert(climate.defog, 'defog state toggles');
    climate.click(new T.Vector2(.75, 1 - 710 / 800)); assert(center.page === 'navigation', 'lower Home shortcut performs page action');
    const beforeClock = chrono.surface.regions[0]!.redraws; update(telemetry, 120, 1 / 120);
    assert(chrono.surface.regions[0]!.redraws - beforeClock <= 1, 'Chrono uploads at at most 1 Hz');
    update({ ...telemetry, ignitionOn: false }, 120); assert(climate.surface.regions[0]!.material.opacity === 0 && instrument.surface.regions[1]!.material.opacity === 0, 'screens black out without reallocating resources');

    // Regression of the untouched Tesla canvas adapter over the extended render-facing interface.
    const teslaFace = new ElectricCenterDisplay(assets), canvas = makeCanvas() as unknown as HTMLCanvasElement;
    const ev = new ElectricPowertrain(createVehiclePhysicsConfig('tesla-model-3-rwd')).getSnapshot().ev!;
    assert(teslaFace.update(canvas, { speedKmh: 53, rpm: 0, gear: 'D', ignitionOn: true, ev }, .1), 'Tesla EV telemetry UI still draws');
    assert(!teslaFace.update(canvas, { speedKmh: 53, rpm: 0, gear: 'D', ignitionOn: true, ev }, .1), 'Tesla unchanged data remains dirty-gated');
    visual.root.updateMatrixWorld(true);
    const eye = new T.Vector3(...descriptor.visualConfig.driverEyePosition);
    const roadSightline = new T.Raycaster(eye, new T.Vector3(eye.x, 0, -12).sub(eye).normalize());
    roadSightline.layers.enableAll();
    assert(roadSightline.intersectObject(instrument.surface.glass, false).length === 0,
      'lowered cluster leaves the road 12 metres ahead visible from the configured driver eye');
    const camera = new T.PerspectiveCamera(65, 1.6, .025, 100); camera.position.set(...descriptor.visualConfig.driverEyePosition); camera.lookAt(new T.Vector3(-.28, .92, -1.05)); camera.updateMatrixWorld(true);
    for (const screen of [instrument.surface.glass, center.surface.glass]) {
      const p = screen.getWorldPosition(new T.Vector3()).project(camera); assert(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1, 'main screen center is inside actual driver view');
    }
    const aim = center.surface.glass.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, -.045, 0));
    const ray = new T.Raycaster(camera.position, aim.sub(camera.position).normalize()); ray.layers.enableAll();
    const hit = ray.intersectObjects(visual.cockpitRoot.children, true)[0];
    assert(hit?.object.name.startsWith('Taycan PCM') === true, 'center lower content is not occluded by dashboard trim');
    return { assertions, mapRasterizations: shared.navigation.map.rasterizations, dynamicRegions: instrument.surface.regions.length,
      speedRegionHzMaximum: 30, mapHzMaximum: 10, tpmsHzMaximum: 2, climateHzMaximum: 5, chronoHzMaximum: 1,
      fixedStaticCanvases: 7, vehicleQueriesByUI: queries - queryCount, recordingContexts: contexts.length };
  } finally { visual.dispose(); shared.dispose(); assets.dispose(); if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document'); }
}
