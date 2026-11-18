import { R, RENDER_PROTOCOL, RENDER_STATE_LENGTH, type RendererSnapshot } from './RendererProtocol';
import { RenderStateBuffer } from './RenderStateBuffer';
import { renderTelemetry, RenderTelemetryView } from './RenderTelemetry';
import { PrefabRegistry } from '../../world/city/PrefabRegistry';
import { createSubject3Materials } from '../../world/subject3/materials';
import { newCityMap } from '../../world/city/CityMapData';
import { CityGround } from '../../world/city/CityGround';
import { Subject3TrafficSignals } from '../../world/subject3/trafficSignals';
import { RuntimePerformance } from '../runtime/RuntimePerformance';
import { FixedStepClock } from '../runtime/FixedStepClock';
import { createRenderLightingState, writeRenderLighting, readRenderLighting } from './RenderLightingState';
export function runRendererRuntimeSelfTest() {
    let assertions = 0;
    const check = (ok: boolean, label: string) => {
        assertions++;
        if (!ok)
            throw Error('Independent renderer: ' + label);
    };
    const performanceRecord = new RuntimePerformance();
    performanceRecord.begin(10, 16, 'driving');
    performanceRecord.add('simulation', 2);
    performanceRecord.add('scene', 3);
    performanceRecord.add('render', 4);
    performanceRecord.finish(12, new FixedStepClock(), 0);
    const recorded = performanceRecord.latest()!;
    check(recorded.cpuMs === 12 && recorded.simulation === 2 && recorded.scene === 3 && recorded.render === 4, 'total CPU and named phase columns remain independent');
    check(recorded.absoluteTime > 1e12, 'cross-thread timestamps retain absolute clock');
    performanceRecord.dispose();
    const lightData = new Float64Array(RENDER_STATE_LENGTH), lights = createRenderLightingState(), received = createRenderLightingState();
    lights.mainLightMode = 'high';
    lights.fogMode = 'front-rear';
    lights.brakeLight = true;
    lights.leftBlinkOn = true;
    writeRenderLighting(lightData, lights);
    readRenderLighting(lightData, received);
    check(JSON.stringify(lights) === JSON.stringify(received), 'fast lighting state retains modes and short brake/signal pulses');
    const state = new RenderStateBuffer(), message = (sequence: number, time: number, x: number): RendererSnapshot => {
        const data = new Float64Array(RENDER_STATE_LENGTH);
        data[R.world] = 2;
        data[R.vehicle] = 3;
        data[R.time] = time;
        data[R.pose] = x;
        data[R.poseEpoch] = 1;
        return {
            kind: 'state', version: RENDER_PROTOCOL, epoch: 1, sequence, data
        };
    };
    check(state.accept(message(1, 1000, 0), 2, 3), 'first snapshot accepted');
    check(state.sample(1000)[R.pose] === 0, 'first state does not interpolate from zero origin');
    check(state.accept(message(2, 1010, 1), 2, 3), 'next snapshot accepted');
    check(Math.abs(state.sample(1010)[R.pose]! - 1 / 6) < 1e-8, 'fixed interpolation delay');
    check(state.sample(1160)[R.pose] === 1, '150ms renderer stall never extrapolates or repays simulation debt');
    check(!state.accept(message(1, 1000, -1), 2, 3), 'old result discarded');
    check(!state.accept(message(3, 1020, 2), 9, 3), 'old world discarded');
    check(!state.accept(message(3, 1020, 2), 2, 9), 'old vehicle discarded');
    const reset = message(3, 1020, 2);
    reset.data[R.poseEpoch] = 2;
    state.accept(reset, 2, 3);
    check(state.sample(1020)[R.pose] === 2, 'respawn epoch snaps pose and camera endpoints');
    const one = message(4, 1030, 2), two = message(5, 1040, 2);
    one.data[R.pose + 3] = Math.PI - .01;
    two.data[R.pose + 3] = -Math.PI + .01;
    state.accept(one, 2, 3);
    state.accept(two, 2, 3);
    check(Math.abs(state.sample(1040)[R.pose + 3]! - (Math.PI - .01 + .02 / 6)) < 1e-8, 'shortest arc across yaw wrap');
    const transfer = message(6, 1050, 3), copy = structuredClone(transfer, {
        transfer: [transfer.data.buffer as ArrayBuffer]
    });
    check(transfer.data.byteLength === 0 && copy.data.length === RENDER_STATE_LENGTH, 'transferable state has one ownership');
    const payload = renderTelemetry({
        speedKmh: 0, rpm: 0, gear: 'P', sharedVehicle: {
            network: {
                roads: ['must not copy']
            }, laneTracker: {
                network: ['must not copy']
            }, navigation: {
                pose: {
                    x: 0, z: 0, yaw: 0
                }, currentRoad: {
                    id: 'r', centerline: Array(100).fill({
                        x: 0, y: 0, z: 0
                    })
                }, map: {
                    huge: true
                }
            }, version: 1
        }, drivingScene: {
            version: 1
        }
    }) as Record<string, any>;
    check(!payload.sharedVehicle.network && !payload.sharedVehicle.laneTracker && !payload.sharedVehicle.navigation.map, 'no sensor/network/index transfer');
    check(Object.keys(payload.sharedVehicle.navigation.currentRoad).join() === 'id', 'road identity only');
    const view = new RenderTelemetryView(), hydrated = view.hydrate(payload);
    check(hydrated.drivingScene?.map === view.map && hydrated.sharedVehicle?.navigation.map === view.map, 'worker rebinds all map display adapters');
    const executive = view.hydrate({ executive: { version: 2, navigation: { pose: { x: 0, z: 0, yaw: 0 }, currentRoad: null } } });
    check(executive.executive?.navigation?.map === view.map, 'legacy executive observations do not require a shared-vehicle DTO');
    view.dispose();
    const materials = createSubject3Materials(), visual = new PrefabRegistry(materials), physics = new PrefabRegistry(materials, true);
    check(visual.entries.size === physics.entries.size, 'all prefab contracts retained');
    for (const [id, prefab] of visual.entries) {
        const logical = physics.entries.get(id)!;
        check(JSON.stringify(prefab.size) === JSON.stringify(logical.size) && prefab.solid === logical.solid, 'collision prefab contract ' + id);
        check(logical.template.children.length === 0, 'no physics-side mesh ' + id);
    }
    const map = newCityMap();
    map.roads = [{
            id: 'r', type: 'urban_2lane', laneCount: 2, laneWidth: 3.5, travelDirection: 'two-way', speedLimit: 50, centerline: [{
                    x: -100, y: 0, z: 0
                }, {
                    x: 100, y: 3, z: 0
                }]
        }];
    const full = new CityGround(map), simulation = new CityGround(map, {
        runtimeRole: 'simulation'
    });
    for (const [x, z] of [[-80, 1], [0, 2], [80, -2], [0, 20]]) {
        const a = full.sampleRoadSurface(x!, z!), b = simulation.sampleRoadSurface(x!, z!);
        check(a.height === b.height && a.grade === b.grade && a.surfaceType === b.surfaceType, 'physical support unchanged ' + x + ',' + z);
    }
    check(JSON.stringify(full.colliders) === JSON.stringify(simulation.colliders), 'collider output unchanged');
    check(simulation.root.children.every(child => child.children.length === 0), 'simulation has no drawable sector');
    full.dispose();
    simulation.dispose();
    visual.dispose();
    physics.dispose();
    Object.values(materials).forEach(material => material.dispose());
    const signals = new Subject3TrafficSignals(0, [], {
        greenSeconds: 25, amberSeconds: 3, allRedSeconds: 2
    });
    signals.update(3.25);
    const clock = signals.presentationSeconds;
    signals.update(10);
    signals.synchronizePresentation(clock);
    check(signals.presentationSeconds === 3.25, 'independent renderer signal clock follows authoritative simulation');
    signals.dispose();
    return {
        assertions, stateBytes: RENDER_STATE_LENGTH * 8, retainedSnapshots: 2
    };
}
