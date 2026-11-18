import { Box3, Group, Matrix4, Ray, Vector3, type Raycaster } from 'three';
import type { VehicleVisualConfig } from '../../vehicle/visual/VehicleVisualConfig';
import type { InstrumentTelemetry } from '../../vehicle/visual/InstrumentCluster';
import type { VehicleInteractionDefinition, VehicleInteractionTransform } from '../../vehicle/interaction/VehicleInteractionDefinition';
import type { RenderVehicleInfo } from './RendererProtocol';
import type { RendererWorkerClient } from './RendererWorkerClient';
/** Logical eye/access/mirror anchors only. No meshes, materials, textures or GPU resources. */
export class SimulationVehicleRig {
    readonly root = new Group();
    readonly cockpitRoot: Group & {
        cycleCenterDisplayPage: () => boolean;
        handleDisplayClick: (ray: Raycaster) => boolean;
    };
    readonly interactionDefinition: VehicleInteractionDefinition | null;
    private readonly mirrors = {
        left: new Group(), right: new Group()
    };
    telemetry?: InstrumentTelemetry;
    constructor(readonly config: VehicleVisualConfig, info: RenderVehicleInfo, client: RendererWorkerClient) {
        this.root.rotation.order = 'YXZ';
        const cockpit = new Group() as SimulationVehicleRig['cockpitRoot'];
        this.cockpitRoot = cockpit;
        this.root.add(cockpit, this.mirrors.left, this.mirrors.right);
        cockpit.cycleCenterDisplayPage = () => { void client.command('cycleDisplay').catch(() => { }); return true; };
        const inverse = new Matrix4(), localRay = new Ray(), point = new Vector3(), boxes: Box3[] = [];
        for (let i = 0; i < info.displayBounds.length; i += 6)
            boxes.push(new Box3(new Vector3().fromArray(info.displayBounds, i), new Vector3().fromArray(info.displayBounds, i + 3)));
        cockpit.handleDisplayClick = ray => {
            this.root.updateWorldMatrix(true, false);
            inverse.copy(this.root.matrixWorld).invert();
            localRay.copy(ray.ray).applyMatrix4(inverse);
            if (!boxes.some(box => localRay.intersectBox(box, point)))
                return false;
            void client.command('clickDisplay', [...ray.ray.origin.toArray(), ...ray.ray.direction.toArray()]).catch(() => { });
            return true;
        };
        for (const side of ['left', 'right'] as const) {
            this.mirrors[side].position.fromArray(info.mirrors[side].position);
            this.mirrors[side].quaternion.fromArray(info.mirrors[side].quaternion);
        }
        const access = config.driverAccess, base = info.interaction;
        const transform = (t: {
            position: number[];
            rotation: number[];
        }) => ({
            position: t.position as unknown as VehicleInteractionTransform['position'], rotation: t.rotation as unknown as VehicleInteractionTransform['rotation']
        });
        if (access && base) {
            const hinge = new Group(), door = new Group(), window = new Group();
            hinge.add(door, window);
            this.root.add(hinge);
            this.interactionDefinition = {
                id: config.name, driverDoor: {
                    hingeNode: hinge, doorNode: door, closedTransform: transform(base.doorClosed), openTransform: transform(base.doorOpen), openSeconds: access.openSeconds, closeSeconds: access.closeSeconds, softClose: access.softClose
                }, driverWindow: {
                    node: window, closedTransform: transform(base.windowClosed), localTravelDirection: access.windowTravelDirection, travelDistance: access.windowTravelDistance, movementSeconds: access.windowTravelSeconds
                }, driverEyePoint: config.driverEyePosition, driverEntryPoint: access.driverEntryPoint, driverExitPoint: access.driverExitPoint, driverInteractionZone: access.driverInteractionZone, stationarySpeedEpsilon: access.stationarySpeedEpsilon
            };
        }
        else
            this.interactionDefinition = null;
    }
    setWorldPose(x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0): void { this.root.position.set(x, y, z); this.root.rotation.set(pitch, yaw, roll, 'YXZ'); }
    getMirrorSurface(side: 'left' | 'right'): Group { return this.mirrors[side]; }
    updateInstruments(telemetry: InstrumentTelemetry, _dt: number): void { this.telemetry = telemetry; }
    dispose(): void { this.telemetry = undefined; this.root.removeFromParent(); this.root.clear(); }
}
