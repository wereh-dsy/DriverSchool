import { CanvasTexture, Mesh, MeshBasicMaterial } from 'three';
import { InstrumentCluster, SUV_INSTRUMENT_CLUSTER_LAYOUT as L, SUV_INSTRUMENT_LAMP_SLOTS,
  getSuvInstrumentScales, suvSpeedFraction, type InstrumentTelemetry } from './InstrumentCluster';
import { ROAD_SUV_VISUAL_CONFIG } from './VehicleVisualConfig';
import { ExecutiveDisplayContext, type ExecutiveDisplayData } from './ExecutiveDisplayContext';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { FuelSnapshot } from '../physics/FuelSystem';

type Region = { x: number; y: number; width: number; height: number };
type TextCall = { value: string; x: number; y: number; alpha: number; clips: Region[] };
type Matrix = [number, number, number, number, number, number];

/** A drawing-command recorder, not a pixel snapshot or WebGL substitute. */
function recordingCanvas() {
  const texts: TextCall[] = [], images: { x: number; y: number }[] = [], clips: Region[] = [], rotations: number[] = [];
  const lines: { x: number; y: number; clips: Region[] }[] = [], dashes: number[][] = [], curves = { count: 0 };
  let matrix: Matrix = [1, 0, 0, 1, 0, 0], pendingRect: Region | null = null;
  let state: Record<string, unknown> = { globalAlpha: 1 };
  const stack: { matrix: Matrix; state: Record<string, unknown>; clips: Region[] }[] = [];
  const point = (x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const methods: Record<string, (...args: never[]) => unknown> = {};
  const operations = {
    save: () => stack.push({ matrix: [...matrix], state: { ...state }, clips: [...clips] }),
    restore: () => { const s = stack.pop(); if (s) { matrix = s.matrix; state = s.state; clips.splice(0, clips.length, ...s.clips); } },
    translate: (x: number, y: number) => { const p = point(x, y); matrix[4] = p.x; matrix[5] = p.y; },
    scale: (x: number, y: number) => { matrix[0] *= x; matrix[1] *= x; matrix[2] *= y; matrix[3] *= y; },
    rotate: (a: number) => {
      rotations.push(a); const [m0, m1, m2, m3] = matrix, c = Math.cos(a), s = Math.sin(a);
      matrix[0] = m0 * c + m2 * s; matrix[1] = m1 * c + m3 * s;
      matrix[2] = m2 * c - m0 * s; matrix[3] = m3 * c - m1 * s;
    },
    beginPath: () => { pendingRect = null; },
    rect: (x: number, y: number, width: number, height: number) => { pendingRect = { x, y, width, height }; },
    clip: () => { if (pendingRect) clips.push(pendingRect); },
    fillRect: (x: number, y: number, w: number, h: number) => {
      if (x === 0 && y === 0 && w === L.canvasWidth && h === L.canvasHeight) {
        texts.length = 0; images.length = 0; rotations.length = 0; lines.length = 0; dashes.length = 0; curves.count = 0;
      }
    },
    fillText: (value: string, x: number, y: number) => {
      const p = point(x, y); texts.push({ value, ...p, alpha: state.globalAlpha as number, clips: [...clips] });
    },
    drawImage: (_canvas: unknown, x: number, y: number) => { images.push(point(x, y)); },
    moveTo: (x: number, y: number) => { lines.push({ ...point(x, y), clips: [...clips] }); },
    lineTo: (x: number, y: number) => { lines.push({ ...point(x, y), clips: [...clips] }); },
    setLineDash: (values: number[]) => { dashes.push([...values]); },
    quadraticCurveTo: () => {
      if (clips.some(c => c.x === L.centerPageRegion.x && c.y === L.centerPageRegion.y)) curves.count++;
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  Object.assign(methods, operations);
  const context = new Proxy({}, {
    get: (_target, key: string) => key in methods ? methods[key] : key in state ? state[key] : (...args: unknown[]) => {
      if (args.some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error(`Nonfinite canvas command: ${key}`);
    },
    set: (_target, key: string, value: unknown) => { state[key] = value; return true; },
  });
  return { width: 1, height: 1, getContext: () => context, texts, images, rotations, lines, dashes, curves };
}

export function runSuvInstrumentClusterSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`SUV instrument: ${message}`); };
  const inside = (inner: Region, outer: Region) => inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
  assert(L.leftDialRegion.x + L.leftDialRegion.width < L.centerRegion.x, 'left dial and center are disjoint');
  assert(L.centerRegion.x + L.centerRegion.width < L.rightDialRegion.x, 'right dial and center are disjoint');
  assert(L.centerRegion.width / L.canvasWidth >= .19 && L.centerRegion.width / L.canvasWidth <= .24, 'center occupies about 20%');
  assert(inside(L.centerPageRegion, L.centerRegion) && inside(L.assistRegion, L.centerRegion), 'all central regions are contained');
  assert(L.centerPageRegion.y + L.centerPageRegion.height <= L.assistRegion.y, 'page cannot cover assistance');
  assert(L.dialRingRadius + 3 <= L.leftDialRegion.width / 2 && L.leftDialRegion.width === L.rightDialRegion.width, 'equal circular dials fit their regions');
  const scales = getSuvInstrumentScales(ROAD_SUV_VISUAL_CONFIG.instrumentCluster);
  assert(scales.rpm === 8000 && scales.speed === 280, 'SUV uses reference scales without changing vehicle config');
  assert(getSuvInstrumentScales({ maximumRPM: 9100, maximumSpeedKmh: 315 }).rpm === 10000, 'higher configurations fit');
  const marks = [0, 20, 40, 60, 100, 140, 180, 220, 280];
  marks.forEach((v, i) => assert(Math.abs(suvSpeedFraction(v, 280) - i / 8) < 1e-9, `pointer aligns with ${v} mark`));
  assert(suvSpeedFraction(-1, 280) === 0 && suvSpeedFraction(900, 280) === 1 && suvSpeedFraction(NaN, 280) === 0, 'speed mapping clamps invalid input');
  for (let speed = 1; speed <= 280; speed++) assert(suvSpeedFraction(speed, 280) >= suvSpeedFraction(speed - 1, 280), 'speed mapping is monotonic');
  assert(new Set(SUV_INSTRUMENT_LAMP_SLOTS.map(s => `${s[1]}/${s[2]}`)).size === SUV_INSTRUMENT_LAMP_SLOTS.length, 'lamps have unique fixed slots');

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), canvases: ReturnType<typeof recordingCanvas>[] = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
    const canvas = recordingCanvas(); canvases.push(canvas); return canvas;
  } } });
  let cluster: InstrumentCluster | undefined;
  try {
    cluster = new InstrumentCluster(ROAD_SUV_VISUAL_CONFIG.instrumentCluster);
    const display = cluster.getObjectByName('SUV virtual cockpit twin dials and central information column') as Mesh;
    const canvas = ((display.material as MeshBasicMaterial).map as CanvasTexture).image as ReturnType<typeof recordingCanvas>;
    const fuel: FuelSnapshot = { tankCapacityL: 75, currentFuelL: 45, fuelUsedL: 1, fuelPercent: 60, fuelMassKg: 33,
      lowFuel: false, emptyFuel: false, currentFuelFlowLPerHour: 1, instantConsumption: 9, instantConsumptionUnit: 'L/100km',
      averageConsumptionLPer100km: 9.2, tripFuelUsedL: 1, tripDistanceKm: 12.4, estimatedRangeKm: 583 };
    const data: ExecutiveDisplayData = { version: 1, page: 'DRIVING', overlay: null,
      lanes: [[{ x: -1.8, forward: 0 }, { x: -1, forward: 40 }], [{ x: 1.8, forward: 0 }, { x: 2.6, forward: 40 }]],
      laneMarkings: ['solid', 'dashed'], roads: [], obstacles: [],
      localTime: '15:02', trip: { seconds: 1234, averageSpeed: 48, fuel, distanceKm: 12.4, averageConsumptionLPer100km: 9.2 } };
    const base: InstrumentTelemetry = { speedKmh: 80, rpm: 1900, gear: 'D5', ignitionOn: true, engineRunning: true,
      fuelLevel: .6, coolantTemperatureC: 90, executive: data, indicators: {} };
    const render = (telemetry: InstrumentTelemetry) => {
      for (let i = 0; i < 100; i++) cluster!.update(telemetry, 1 / 60);
      assert(canvas.images.length === 2, 'every page preserves both cached main dials');
      assert(canvas.images[0]!.x + 460 < L.centerRegion.x && canvas.images[1]!.x > L.centerRegion.x + L.centerRegion.width, 'dial artwork cannot reach central content');
      canvas.texts.forEach(t => {
        assert(Number.isFinite(t.x) && Number.isFinite(t.y) && !/NaN|Infinity/.test(t.value), 'valid canvas text');
        assert(!/[\u3400-\u9fff]/u.test(t.value), 'all SUV instrument labels are English');
        if (t.clips.some(c => c.x === L.centerPageRegion.x && c.y === L.centerPageRegion.y)) {
          assert(t.x >= L.centerPageRegion.x && t.x <= L.centerPageRegion.x + L.centerPageRegion.width &&
            t.y >= L.centerPageRegion.y && t.y <= L.centerPageRegion.y + L.centerPageRegion.height, 'page text contained');
        }
        if (t.x >= L.centerRegion.x && t.x <= L.centerRegion.x + L.centerRegion.width) {
          assert(t.clips.some(c => c.x === L.centerRegion.x && c.width === L.centerRegion.width), 'every central text command has a hard region clip');
        }
      });
      assert(!canvas.texts.some(t => t.value === 'CRUISE' || t.value === '000'), 'no cruise banner or padded speed');
      return canvas.texts.map(t => t.value);
    };
    let texts = render({ ...base, gear: 'P', speedKmh: 0, rpm: 720 });
    assert(texts.includes('P') && texts.includes('0'), 'P/idle gear and zero speed');
    texts = render(base);
    assert(texts.includes('D5') && texts.includes('80') && texts.includes('583 km'), 'D/driving telemetry mapped');
    assert(!texts.includes('Trip') && canvas.curves.count === 0, 'driving page contains no trip block or car illustration');
    const mainRoad = canvas.lines.filter(p => p.clips.some(c => c.x === L.centerPageRegion.x && c.y === L.centerPageRegion.y));
    assert(Math.max(...mainRoad.map(p => p.y)) - Math.min(...mainRoad.map(p => p.y)) > 130, 'lanes occupy the main center page');
    assert(canvas.dashes.some(d => d[0] === 9 && d[1] === 12), 'live lane markings retain dashed divider');
    // Texture invalidation quantizes the smoothed RPM to 5-rpm buckets.
    assert(Math.abs(canvas.rotations[0]! - (-Math.PI * .75 + Math.PI * 1.5 * 1900 / 8000)) < .003, 'RPM pointer matches displayed scale');
    texts = render({ ...base, speedKmh: 250 });
    assert(texts.includes('250'), 'display does not clamp at old 200 km/h config');
    texts = render({ ...base, cruiseTargetSpeedKmh: 80, indicators: { cruise: true }, executive: { ...data, version: 2, page: 'CRUISE' } });
    assert(texts.includes('80 km/h'), 'cruise uses small lower readout');
    assert(canvas.curves.count === 0 && canvas.dashes.some(d => d[0] === 9), 'cruise retains live central lanes without a car illustration');
    assert(!render(base).includes('80 km/h'), 'inactive cruise disappears');
    texts = render({ ...base, fuelLevel: .05, executive: { ...data, version: 3, trip: { ...data.trip, fuel: { ...fuel, lowFuel: true, estimatedRangeKm: 60 } } } });
    assert(texts.includes('Please refuel.') && texts.includes('Range 60 km') && !texts.includes('Trip'), 'fuel warning replaces page');
    assert(render({ ...base, executive: { ...data, version: 4, page: 'TRIP' } }).includes('9.2 L/100km'), 'trip values');
    assert(render({ ...base, executive: { ...data, version: 5, page: 'MAP' } }).includes('Driving data'), 'menu confined to center');
    assert(render({ ...base, gear: 'R', executive: { ...data, version: 6, page: 'PARKING', rearParking: {
      active: true, nearestZone: 'CENTER', nearestDistanceM: .8, zones: [
        { zone: 'LEFT_CORNER', detected: false, distanceM: null, severity: 'NONE' },
        { zone: 'LEFT', detected: false, distanceM: null, severity: 'NONE' },
        { zone: 'CENTER', detected: true, distanceM: .8, severity: 'NEAR' },
        { zone: 'RIGHT', detected: false, distanceM: null, severity: 'NONE' },
        { zone: 'RIGHT_CORNER', detected: false, distanceM: null, severity: 'NONE' },
      ],
    } } }).includes('Rear center 0.8 m'), 'reverse direction and surface distance');
    assert(render({ ...base, executive: { ...data, version: 7, overlay: { title: 'DRIVE SELECT', value: 'SPORT', alpha: 1 } } }).includes('Sport'), 'mode notification replaces content');
    const beforeLamps = render({ ...base, indicators: { parkingBrake: true, headlights: true, highBeam: true }, coolantTemperatureC: 122 });
    assert(beforeLamps.includes('P') && beforeLamps.includes('122'), 'brake/lighting/hot coolant draw without crash');
    const parkingSlot = canvas.texts.find(t => t.value === 'P')!;
    render({ ...base, indicators: { parkingBrake: true } });
    const parkingAlone = canvas.texts.find(t => t.value === 'P')!;
    assert(parkingSlot.x === parkingAlone.x && parkingSlot.y === parkingAlone.y, 'lamp slot stays fixed when other warnings disappear');
    const roadDisplay = new ExecutiveDisplayContext(fuel);
    const network: RoadNetworkData = { mapId: 'suv-lane-fixture', bounds: { minimumX: -10, maximumX: 10, minimumZ: -60, maximumZ: 10 },
      intersections: [], segments: [{ id: 'road', centerline: [{ x: 0, z: 10 }, { x: 0, z: -60 }],
        width: 7.2, laneWidth: 3.6, length: 70, laneCountPerDirection: 1, travelDirection: 'two-way' }] };
    const pose = { x: 1.8, z: 0, yaw: 0, y: 0, width: 1.9, length: 4.9 };
    roadDisplay.update(.2, pose, 'D', 'NORMAL', false, null, fuel, network, [], true);
    assert(roadDisplay.data.lanes.length === 2, 'real road adapter supplies D driving lanes');
    roadDisplay.update(.2, pose, 'D', 'NORMAL', true, 80, fuel, network, [], true);
    assert(roadDisplay.data.page === 'CRUISE' && roadDisplay.data.lanes.every(line => line.length > 2), 'cruise page keeps fresh authored road geometry');
    roadDisplay.update(.2, pose, 'D', 'NORMAL', true, 80, fuel, undefined, [], true);
    assert(roadDisplay.data.lanes.length === 0, 'cruise clears unavailable road data');
    render({ ...base, speedKmh: NaN, rpm: Infinity, fuelLevel: NaN, coolantTemperatureC: NaN });
    texts = render({ ...base, ignitionOn: false, engineRunning: false });
    assert(canvas.texts.every(t => t.alpha === 0), 'ignition-off fades every layer including lamps');
    const count = canvases.length;
    render(base); render({ ...base, speedKmh: 90 });
    assert(canvases.length === count, 'refreshes reuse the installed canvas');
    return { assertions, stateChecks: 16, centerWidthFraction: L.centerRegion.width / L.canvasWidth };
  } finally {
    cluster?.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  }
}
