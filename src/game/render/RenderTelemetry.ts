import type { InstrumentTelemetry } from '../../vehicle/visual/InstrumentCluster';
import { LocalRoadMap } from '../../ui/LocalRoadMap';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
const omitted = new Set(['map', 'nearbyNetwork', 'laneTracker', 'laneObservation', 'laneObserver', 'navigationController', 'roadNetwork', 'network', 'lateralNetwork', 'lateralNearby', 'detector', 'rearDetector']);
/** Display observations only: never clone a network, map index, sensor or texture. */
export function renderTelemetry(value: unknown, depth = 0): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === undefined)
        return value;
    if (depth > 8)
        return undefined;
    if (Array.isArray(value))
        return value.map(item => renderTelemetry(item, depth + 1));
    if (typeof value !== 'object' || 'isObject3D' in value || 'isTexture' in value)
        return undefined;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
        if (!omitted.has(key) && !key.startsWith('_') && typeof item !== 'function') {
            if (key === 'currentRoad' || key === 'road')
                result[key] = item && typeof item === 'object' && 'id' in item ? {
                    id: item.id
                } : null;
            else if (key === 'sharedVehicle' && item) {
                const shared = item as Record<string, unknown>;
                result[key] = renderTelemetry(Object.fromEntries(['version', 'lane', 'parking', 'rearParking', 'tyres', 'tpmsState', 'lateralAssist', 'navigation'].map(name => [name, shared[name]])), depth + 1);
            }
            else
                result[key] = renderTelemetry(item, depth + 1);
        }
    return result;
}
/** Worker owns its map drawing cache; sensor observations remain main-thread authoritative. */
export class RenderTelemetryView {
    readonly map = new LocalRoadMap();
    private roads = new Map<string, RoadNetworkData['segments'][number]>();
    private nearbyVersion = -1;
    private nearby?: RoadNetworkData;
    setNetwork(network: RoadNetworkData | undefined): void { this.map.setNetwork(network); this.roads = new Map(network?.segments.map(road => [road.id, road])); this.nearbyVersion = -1; }
    hydrate(value: Record<string, unknown>): InstrumentTelemetry {
        const telemetry = value as unknown as InstrumentTelemetry;
        const t = value as Record<string, any>, navigation = t.sharedVehicle?.navigation ?? t.executive?.navigation;
        if (navigation) {
            navigation.map = this.map;
            this.map.navigationState = navigation.guidance;
            navigation.currentRoad = this.roads.get(navigation.currentRoad?.id) ?? null;
            const version = t.sharedVehicle?.version ?? t.executive?.version;
            if (version !== this.nearbyVersion) {
                this.nearbyVersion = version;
                this.nearby = this.map.nearby(navigation.pose.x, navigation.pose.z).network;
            }
            navigation.nearbyNetwork = this.nearby;
        }
        if (t.executive?.navigation)
            t.executive.navigation = navigation;
        if (t.electricDisplay)
            t.electricDisplay.map = this.map;
        if (t.drivingScene)
            t.drivingScene.map = this.map;
        return telemetry;
    }
    dispose(): void { this.map.dispose(); this.roads.clear(); this.nearby = undefined; }
}
