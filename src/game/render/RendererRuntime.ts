import { createRenderLightingState, readRenderLighting } from './RenderLightingState';
import { RenderStateBuffer } from './RenderStateBuffer';
import { RenderDebugOverlays } from './RenderDebugOverlays';
import { VehicleVisualDebugView } from '../VehicleVisualDebugView';
import { CityGround } from '../../world/city/CityGround';
import { BackSide, Box3, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, Quaternion, Raycaster, Scene, ShaderMaterial, SphereGeometry, type Object3D, type Camera, type WebGLRenderer } from 'three';
import { DRIVING_GROUND_IDS } from '../../world/DrivingGroundCatalog';
import { VEHICLE_CATALOG } from '../../vehicle/VehicleCatalog';
import { DriverCamera, MirrorSystem } from '../../camera';
import type { AdaptiveMirrorContext } from '../../camera/AdaptiveMirrorRendering';
import { ParkingCamera } from '../../camera/ParkingCamera';
import { WindshieldRain } from '../../camera/WindshieldRain';
import { MirrorOverlayRenderer } from '../../ui/MirrorOverlayRenderer';
import { WiperController } from '../../vehicle/control/WiperController';
import { applyVehicleInteractionVisual } from '../../vehicle/interaction/VehicleInteractionDefinition';
import { getVehicleDescriptor, isVehicleId, type VehicleId } from '../../vehicle/VehicleCatalog';
import { VehicleLighting, VehicleVisual } from '../../vehicle/visual';
import { VehicleAssetRegistry } from '../../vehicle/visual/VehicleAssetRegistry';
import type { DrivingGround } from '../../world/DrivingGround';
import { createDrivingGroundAsync, isDrivingGroundId, prepareDrivingGround, type DrivingGroundId } from '../../world/DrivingGroundCatalog';
import { EnvironmentVisual } from '../../world/environment/EnvironmentVisual';
import { createStaticEnvironmentMap } from '../../world/environment/StaticEnvironmentMap';
import { VISUAL_ENVIRONMENT as V } from '../../world/environment/VisualEnvironmentConfig';
import { WEATHER_SEQUENCE, WeatherSystem, type EnvironmentTime } from '../../world/environment/WeatherSystem';
import { createGameRenderer } from '../createGameRenderer';
import { RuntimeCoordinator, type RuntimeTaskHandle } from '../runtime/RuntimeCoordinator';
import { WorldRenderGraph } from '../runtime/WorldRenderGraph';
import { StreamingShaderWarmup } from '../StreamingShaderWarmup';
import { R, RENDER_PROTOCOL, type RendererInit, type RendererReply, type RendererRequest, type RenderVehicleInfo } from './RendererProtocol';
import { RenderTelemetryView } from './RenderTelemetry';
/** Sole owner of the playable WebGL context and every visual resource. */
export class RendererRuntime {
    private readonly scene = new Scene();
    private readonly renderer: WebGLRenderer;
    private readonly runtime = new RuntimeCoordinator({
        independentRendering: true
    });
    private readonly assets = new VehicleAssetRegistry();
    private readonly driverCamera = new DriverCamera({
        driverEyePosition: [0, 1, 0], aspect: 1, fov: 72, near: .025, far: 2500
    });
    private readonly sun = new DirectionalLight(V.sunColor, V.sunIntensity);
    private readonly hemisphere = new HemisphereLight(V.ambientSky, V.ambientGround, V.ambientIntensity);
    private readonly environment = new WeatherSystem();
    private readonly wiper = new WiperController();
    private readonly lightState = createRenderLightingState();
    private readonly telemetryView = new RenderTelemetryView();
    private readonly debugOverlays = new RenderDebugOverlays();
    private readonly visualDebug = new VehicleVisualDebugView();
    private readonly environmentMap: ReturnType<typeof createStaticEnvironmentMap>;
    private readonly environmentVisual: EnvironmentVisual;
    private skyGeometry: SphereGeometry | null = null;
    private skyMaterial: ShaderMaterial | null = null;
    private skyDome: Mesh | null = null;
    private vehicleVisual!: VehicleVisual;
    private pendingVehicle?: VehicleVisual;
    private vehicleLighting!: VehicleLighting;
    private windshieldRain!: WindshieldRain;
    private mirrors!: MirrorSystem;
    private mirrorOverlay!: MirrorOverlayRenderer;
    private parkingCamera: ParkingCamera | null = null;
    private ground!: DrivingGround;
    private graph!: WorldRenderGraph;
    private readonly warmup: StreamingShaderWarmup;
    private readonly states = new RenderStateBuffer();
    private readonly current = this.states.current;
    private readonly previous = this.states.previous;
    private readonly cameraFrom = new Quaternion();
    private readonly cameraTo = new Quaternion();
    private readonly worldViewCameras: Camera[] = [];
    private readonly worldShadowCameras: Camera[] = [];
    private readonly wheels = {
        frontLeft: {
            x: 0, y: 0, z: 0
        }, frontRight: {
            x: 0, y: 0, z: 0
        }, rearLeft: {
            x: 0, y: 0, z: 0
        }, rearRight: {
            x: 0, y: 0, z: 0
        }
    };
    private readonly rotations = {
        frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0
    };
    private readonly alignment = {
        frontLeft: {
            steeringAngle: 0, camberAngle: 0
        }, frontRight: {
            steeringAngle: 0, camberAngle: 0
        }, rearLeft: {
            steeringAngle: 0, camberAngle: 0
        }, rearRight: {
            steeringAngle: 0, camberAngle: 0
        }
    };
    private readonly snapshot = {
        x: 0, z: 0, yaw: 0, speed: 0
    };
    private context: Record<string, any> = {};
    private telemetry?: Record<string, unknown>;
    private vehicleId: VehicleId;
    private groundId: DrivingGroundId;
    private visible = true;
    private running = true;
    private initialized = false;
    private prepared = false;
    private get sequence(): number { return this.states.sequence; }
    private lastTime = 0;
    private lastStats = 0;
    private frameCount = 0;
    private overlayVisible = false;
    private preparingOverlay = false;
    private width: number;
    private height: number;
    private transition?: Promise<void>;
    constructor(private readonly init: RendererInit, private readonly reply: (message: RendererReply, transfer?: Transferable[]) => void) {
        if (init.version !== RENDER_PROTOCOL || !isVehicleId(init.vehicleId) || !isDrivingGroundId(init.groundId))
            throw Error('Unsupported Renderer protocol or resource ID');
        this.vehicleId = init.vehicleId;
        this.groundId = init.groundId;
        this.width = init.width;
        this.visible = init.visible;
        this.height = init.height;
        this.renderer = createGameRenderer(init);
        this.renderer.getContext().canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.fail(new Error('WebGL context lost in Renderer Worker')); });
        this.environmentMap = createStaticEnvironmentMap(this.renderer);
        this.scene.background = new Color(V.fogColor);
        this.scene.fog = new Fog(V.fogColor, V.fogNear, V.fogFar);
        this.scene.add(this.debugOverlays.root, this.visualDebug.root);
        this.addLightingAndSky();
        this.environmentVisual = new EnvironmentVisual(this.scene, this.environment, this.sun, this.hemisphere, this.skyMaterial!, value => { this.renderer.toneMappingExposure = value; });
        this.warmup = new StreamingShaderWarmup(this.renderer, this.runtime);
    }
    async initialize(): Promise<void> {
        if (!this.running)
            return;
        await document.fonts.ready;
        await this.installVehicle(this.vehicleId);
        if (!this.running)
            return;
        await this.installGround(this.groundId, this.init.editorMapURL);
        if (!this.running)
            return;
        this.graph = new WorldRenderGraph(this.renderer, this.scene, () => this.ground);
        this.runtime.performance.bindRenderer(this.renderer, () => ({
            owner: 'RendererWorker', world: this.ground.runtimeState?.(), renderGraph: this.graph.state
        }));
        this.graph.add('world.visibility', [], () => { const started = performance.now(); this.updateWorldVisibility(); this.renderPreparationCpu = performance.now() - started; this.runtime.performance.add('scene', this.renderPreparationCpu); });
        this.graph.add('additional.views', ['world.visibility'], () => {
            this.runtime.performance.beginGpu();
            if (this.current[R.mode] === 1) {
                this.parkingCamera?.update(this.renderDt, this.context.reversing === true);
                this.mirrors.renderAdaptive(this.renderDt, this.context.mirror as AdaptiveMirrorContext);
            }
            const visible = this.current[R.mode] === 1 && this.context.overlay && !this.context.immersive && this.mirrors.adaptive.showRightOverlay;
            if (visible !== this.overlayVisible) {
                this.overlayVisible = visible;
                this.reply({
                    kind: 'view', epoch: this.init.epoch, overlayVisible: visible
                });
            }
            this.mirrorOverlay.setView(this.mirrors.getView(this.context.mirror?.preview ?? 'right'));
        });
        this.graph.add('main.composite', ['additional.views'], () => { this.renderer.setRenderTarget(null); this.renderer.setViewport(0, 0, this.width, this.height); this.renderer.setScissorTest(false); this.renderer.render(this.scene, this.driverCamera.camera); this.ground.markLoadMilestone?.('firstRender'); });
        this.graph.add('hud.composite', ['main.composite'], () => {
            if (this.preparingOverlay || this.current[R.mode] === 1 && this.context.overlay && !this.context.immersive && this.mirrors.adaptive.showRightOverlay) {
                const r = this.preparingOverlay ? [0, 0, 2, 2] : this.current.subarray(R.overlay, R.overlay + 4);
                this.mirrorOverlay.render(this.renderer, {
                    left: r[0]!, top: r[1]!, width: r[2]!, height: r[3]!, bottom: r[1]! + r[3]!
                } as DOMRect, {
                    left: 0, top: 0, width: this.width, height: this.height, bottom: this.height
                } as DOMRect);
            }
        });
        this.initialized = true;
        this.runtime.start(this.frame);
        await this.prepare();
        this.reply({
            kind: 'ready', epoch: this.init.epoch
        });
    }
    private progress(stage: string, done: number, total: number, resource: string): void {
        this.reply({
            kind: 'progress', epoch: this.init.epoch, stage, done, total, resource
        });
    }
    private async prepare(): Promise<void> {
        this.prepared = false;
        this.ground.beginVisualPreload?.();
        while (this.running && (this.ground.visualReady === false || !this.warmup.idle)) {
            if (this.ground.visualLoadingError)
                throw this.ground.visualLoadingError;
            const p = this.ground.visualLoadingProgress;
            this.progress('region', p?.regionDone ?? 0, p?.regionTotal ?? 1, p?.resource ?? '世界资源');
            if (p)
                this.progress('gpu', p.gpuDone, p.gpuTotal, '静态资源预热');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (!this.running)
            return;
        const root = new Group();
        root.children.push(this.vehicleVisual.root, this.windshieldRain.root, this.environmentVisual.visualResourceRoot);
        try {
            await this.warmup.prepare(root, this.scene, this.ground.root, this.views(), () => this.running, () => -50);
        }
        finally {
            root.children = [];
        }
        this.progress('screen', 1, 4, '座舱、雨效和镜面资源');
        this.prepareRenderMatrices();
        this.updateWorldVisibility();
        this.renderer.shadowMap.needsUpdate = true;
        this.graph.execute();
        this.runtime.performance.endGpu();
        await this.warmup.settle(() => this.running);
        this.mirrors.render('left');
        this.mirrors.render('right');
        this.mirrors.interiorMirror?.render();
        const overlay = this.mirrorOverlay.preparationView;
        await this.warmup.prepare(overlay.root, overlay.scene, this.ground.root, [{
                camera: overlay.camera, target: null
            }], () => this.running, () => -50);
        this.preparingOverlay = true;
        try {
            this.graph.execute();
            this.runtime.performance.endGpu();
            await this.warmup.settle(() => this.running);
        }
        finally {
            this.preparingOverlay = false;
        }
        this.progress('screen', 2, 4, '镜面 HUD 实际着色器与缓冲');
        if (this.parkingCamera) {
            this.parkingCamera.update(.2, true);
            this.graph.execute();
            this.runtime.performance.endGpu();
            await this.warmup.settle(() => this.running);
            this.parkingCamera.update(0, false);
        }
        this.progress('screen', 3, 4, '首屏、阴影和多视图提交');
        this.graph.execute();
        this.runtime.performance.endGpu();
        await this.warmup.settle(() => this.running);
        while (this.running && (this.ground.visualReady === false || !this.warmup.idle)) {
            if (this.ground.visualLoadingError)
                throw this.ground.visualLoadingError;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        const completed = this.ground.visualLoadingProgress;
        if (completed) {
            this.progress('region', completed.regionDone, completed.regionTotal, '出生区域已完成');
            this.progress('gpu', completed.gpuDone, completed.gpuTotal, 'GPU 资源已完成');
        }
        else {
            this.progress('region', 1, 1, '场地资源已完成');
            this.progress('gpu', 1, 1, '场地与车辆 GPU 资源已完成');
        }
        this.ground.finishVisualPreload?.();
        this.prepared = true;
        this.progress('screen', 4, 4, 'Renderer Worker 已就绪');
    }
    private views() {
        const views = [{
                camera: this.driverCamera.camera, target: null as import('three').WebGLRenderTarget | null
            }];
        if (this.mirrors)
            for (const side of ['left', 'right'] as const) {
                const view = this.mirrors.getView(side);
                if (view.enabled)
                    views.push({
                        camera: view.camera, target: view.renderTarget
                    });
            }
        if (this.mirrors?.interiorMirror)
            views.push({
                camera: this.mirrors.interiorMirror.camera, target: this.mirrors.interiorMirror.renderTarget
            });
        return views;
    }
    private async installGround(id: DrivingGroundId, sourceURL?: string): Promise<void> {
        this.progress('region', 0, 1, '地图资源');
        const timing = await prepareDrivingGround(id), ground = id === 'city-editor-map' && sourceURL ? new CityGround(await (await fetch(sourceURL)).json(), {
            deferred: true, runtimeRole: 'visual'
        }) : await createDrivingGroundAsync(id, timing, undefined, 'visual');
        if (id === 'city-editor-map' && sourceURL)
            await (ground as CityGround).prepare();
        if (!this.running) {
            ground.dispose();
            return;
        }
        this.ground?.dispose();
        this.ground = ground;
        this.groundId = id;
        this.scene.add(ground.root);
        this.states.clear();
        this.telemetry = undefined;
        this.context = {};
        ground.setRuntimeCoordinator?.(this.runtime);
        ground.setVisualResourcePreparation?.(texture => this.renderer.initTexture(texture), root => this.warmup.prepare(root, this.scene, ground.root, this.views(), () => this.running && ground === this.ground && root.userData.streamingWarmupCancelled !== true, () => typeof root.userData.streamingPriority === 'function' ? root.userData.streamingPriority() : root.userData.streamingPriority ?? 100));
        ground.setVisualObserver?.((root, added) => {
            if (ground === this.ground) {
                if (added)
                    this.environmentVisual.addVisualRoot(root);
                else
                    this.environmentVisual.removeVisualRoot(root);
            }
        });
        this.environmentVisual.setGround(ground);
        this.telemetryView.setNetwork(ground.roadNetwork);
        if (!this.sequence) {
            this.vehicleVisual.setWorldPose(ground.spawnPose.position.x, ground.spawnPose.position.y, ground.spawnPose.position.z, ground.spawnPose.yawRadians);
            this.driverCamera.update(this.vehicleVisual.root, 0);
            this.snapshot.x = ground.spawnPose.position.x;
            this.snapshot.z = ground.spawnPose.position.z;
        }
    }
    private async installVehicle(id: VehicleId): Promise<void> {
        const descriptor = getVehicleDescriptor(id);
        VehicleVisual.prepareAssets(descriptor.visualConfig, this.assets);
        const next = new VehicleVisual(descriptor.visualConfig, this.assets);
        this.pendingVehicle = next;
        await document.fonts.ready;
        if (!this.running) {
            next.dispose();
            this.pendingVehicle = undefined;
            return;
        }
        this.pendingVehicle = undefined;
        this.parkingCamera?.dispose();
        this.mirrors?.dispose();
        this.mirrorOverlay?.dispose();
        this.windshieldRain?.dispose();
        this.vehicleLighting?.dispose();
        this.vehicleVisual?.root.removeFromParent();
        this.vehicleVisual?.dispose();
        this.vehicleVisual = next;
        this.vehicleId = id;
        this.scene.add(next.root);
        this.vehicleLighting = new VehicleLighting(next);
        this.windshieldRain = new WindshieldRain(next);
        this.driverCamera.setDriverEyePosition(descriptor.visualConfig.driverEyePosition);
        if (this.ground) {
            const spawn = this.ground.spawnPose;
            next.setWorldPose(spawn.position.x, spawn.position.y, spawn.position.z, spawn.yawRadians);
            this.snapshot.x = spawn.position.x;
            this.snapshot.z = spawn.position.z;
            this.snapshot.yaw = spawn.yawRadians;
            this.snapshot.speed = 0;
            this.states.clear();
            this.context = {};
            this.telemetry = undefined;
            this.driverCamera.update(next.root, 0);
        }
        this.mirrors = this.createMirrorSystem(next);
        this.mirrorOverlay = new MirrorOverlayRenderer(this.mirrors.getHudTexture('right'));
        this.mirrorOverlay.setView(this.mirrors.getView('right'));
        this.parkingCamera = descriptor.capabilities.parkingCamera ? new ParkingCamera(this.renderer, this.scene, next, descriptor.capabilities.surroundView) : null;
        const transform = (t: {
            position: readonly number[];
            rotation: readonly number[];
        }) => ({
            position: [...t.position], rotation: [...t.rotation]
        });
        const interaction = next.interactionDefinition;
        const mirror = (side: 'left' | 'right') => {
            const m = next.getMirrorSurface(side);
            return {
                position: m.position.toArray(), quaternion: m.quaternion.toArray()
            };
        };
        const targets = new Set<Object3D>(), collector = new Raycaster(), boxes: number[] = [];
        collector.intersectObjects = (objects) => {
            for (const object of objects)
                targets.add(object);
            return [];
        };
        collector.intersectObject = object => { targets.add(object); return []; };
        next.cockpitRoot.handleDisplayClick(collector);
        next.root.updateMatrixWorld(true);
        const inverse = next.root.matrixWorld.clone().invert();
        for (const target of targets) {
            const box = new Box3().setFromObject(target).applyMatrix4(inverse);
            if (!box.isEmpty())
                boxes.push(...box.min.toArray(), ...box.max.toArray());
        }
        const info: RenderVehicleInfo = {
            id, mirrors: {
                left: mirror('left'), right: mirror('right')
            }, interaction: interaction ? {
                doorClosed: transform(interaction.driverDoor.closedTransform), doorOpen: transform(interaction.driverDoor.openTransform), windowClosed: transform(interaction.driverWindow.closedTransform)
            } : null, displayBounds: new Float64Array(boxes)
        };
        this.reply({
            kind: 'vehicle', epoch: this.init.epoch, info
        });
        this.assets.prune();
    }
    receive(message: RendererRequest): void {
        if (message.epoch !== this.init.epoch || !this.running)
            return;
        if (message.kind === 'state') {
            if (this.states.accept(message, DRIVING_GROUND_IDS.indexOf(this.groundId), VEHICLE_CATALOG.findIndex(vehicle => vehicle.id === this.vehicleId))) {
                if (message.telemetry)
                    this.telemetry = message.telemetry;
                if (message.context) {
                    this.context = message.context;
                    this.debugOverlays.apply(this.context.debugGeometry ?? []);
                    this.visualDebug.setPresentation(this.context.visualDebug === true);
                }
            }
            this.reply({
                kind: 'credit', epoch: this.init.epoch, sequence: message.sequence, data: message.data
            }, [message.data.buffer as ArrayBuffer]);
        }
        else if (message.kind === 'resize') {
            this.width = Math.max(1, message.width);
            this.height = Math.max(1, message.height);
            this.renderer.setPixelRatio(Math.min(1.6, message.dpr));
            this.renderer.setSize(this.width, this.height, false);
        }
        else if (message.kind === 'command') {
            if (message.command === 'dispose') {
                void this.dispose().catch(error => this.fail(error));
                return;
            }
            if (message.command === 'capture') {
                this.reply({
                    kind: 'result', epoch: this.init.epoch, id: message.id, value: {
                        performance: this.runtime.report(), warmup: this.warmup.statistics, publications: [...((this.ground as any).sectors?.publications?.entries() ?? [])].map(([id, job]: any) => ({
                            id, built: job.built, warmed: job.warmed, preparation: !!job.preparation
                        })), world: this.ground.runtimeState?.(), sectors: (this.ground as any).sectors?.visualStatistics, graph: this.graph?.state
                    }
                });
                return;
            }
            if (message.command === 'visibility') {
                this.visible = message.value === true;
                this.lastTime = 0;
                (document as unknown as {
                    hidden: boolean;
                }).hidden = !this.visible;
                this.reply({
                    kind: 'result', epoch: this.init.epoch, id: message.id
                });
                return;
            }
            if (this.transition) {
                this.reply({
                    kind: 'commandError', epoch: this.init.epoch, id: message.id, message: 'Renderer transition already in progress'
                });
                return;
            }
            const run = async () => {
                if (message.command === 'prepareDrive') {
                    const deadline = performance.now() + 5000;
                    while (this.running && this.sequence < Number(message.value)) {
                        if (performance.now() > deadline) throw Error('Driving view snapshot was not received');
                        await new Promise(resolve => setTimeout(resolve, 4));
                    }
                    if (!this.running) return;
                    this.applySnapshot();
                    await this.prepare();
                    // Exercise the actual driving camera, adaptive mirrors and HUD
                    // while controls remain closed, rather than a menu-only frame.
                    for (let i = 0; i < 3 && this.running; i++) {
                        this.graph.execute();
                        this.runtime.performance.endGpu();
                        await this.warmup.settle(() => this.running);
                        await new Promise(resolve => setTimeout(resolve, 16));
                    }
                }
                else if (message.command === 'vehicle') {
                    if (!isVehicleId(String(message.value)))
                        throw Error('Invalid vehicle');
                    await this.installVehicle(message.value as VehicleId);
                    if (this.initialized)
                        await this.prepare();
                }
                else if (message.command === 'ground') {
                    const value = message.value as {
                        id: string;
                        sourceURL?: string;
                    };
                    if (!isDrivingGroundId(value.id))
                        throw Error('Invalid map');
                    await this.installGround(value.id, value.sourceURL);
                    if (this.initialized)
                        await this.prepare();
                }
                else if (message.command === 'cycleDisplay')
                    this.vehicleVisual.cockpitRoot.cycleCenterDisplayPage();
                else if (message.command === 'clickDisplay') {
                    const values = message.value as number[], ray = new Raycaster();
                    ray.ray.origin.fromArray(values);
                    ray.ray.direction.fromArray(values, 3);
                    this.vehicleVisual.cockpitRoot.handleDisplayClick(ray);
                }
                this.reply({
                    kind: 'result', epoch: this.init.epoch, id: message.id
                });
            };
            const task = run().catch(error => this.fail(error));
            if (message.command === 'vehicle' || message.command === 'ground' || message.command === 'prepareDrive') {
                this.transition = task;
                void task.finally(() => { this.transition = undefined; });
            }
        }
    }
    private renderDt = 0;
    private renderPreparationCpu = 0;
    private streamingTask?: RuntimeTaskHandle;
    private streamingGround?: DrivingGround;
    private scheduleStreaming(): void {
        const ground = this.ground;
        if (this.streamingGround === ground && this.streamingTask?.state === 'queued')
            return;
        this.streamingTask?.cancel();
        this.streamingGround = ground;
        this.streamingTask = this.runtime.enqueue({
            id: 'world:stream', phase: 'streaming', priority: () => 'visible', valid: () => this.running && ground === this.ground, step: () => { ground.updatePlayerPosition?.(this.snapshot.x, this.snapshot.z, this.snapshot.yaw, this.snapshot.speed, this.renderDt * 1000); return true; }
        });
        void this.streamingTask.done.catch(error => this.fail(error));
    }
    private readonly frame = (time: number): void => {
        const started = performance.now(), dt = this.lastTime ? Math.min(.1, (time - this.lastTime) / 1000) : 0;
        this.lastTime = time;
        this.runtime.setMode(!this.prepared || this.transition ? 'loading' : !this.visible ? 'suspended' : this.current[R.mode] === 1 ? 'driving' : 'loading');
        if (!this.running || !this.initialized || !this.visible && this.prepared)
            return;
        this.renderDt = dt;
        if (this.sequence)
            this.applySnapshot();
        this.ground.update?.(this.current[R.paused] ? 0 : dt);
        this.ground.applyRenderClock?.(this.current[R.signalClock]!);
        this.ground.setSurfaceReferenceHeight?.(this.current[R.roadHeight]!);
        this.scheduleStreaming();
        this.skyDome?.position.copy(this.driverCamera.camera.position);
        const { x, z } = this.snapshot, y = this.sequence ? this.current[R.roadHeight]! : this.ground.spawnPose.position.y;
        this.sun.position.set(x - 95, y + 145, z + 70);
        this.sun.target.position.set(x, y, z - 25);
        this.sun.target.updateMatrixWorld();
        this.environmentVisual.update(dt, this.driverCamera.camera.position);
        this.vehicleLighting.applyState(this.lightState, this.current[R.ignition] === 1, dt);
        this.windshieldRain.update(dt, this.environment.rainIntensity, this.wiper, this.snapshot.speed);
        this.windshieldRain.root.visible = this.context.cockpit !== false;
        if (this.telemetry) {
            this.telemetry.speedKmh = Math.abs(this.states.sampled[R.speed]!) * 3.6;
            this.telemetry.rpm = this.states.sampled[R.rpm];
            this.telemetry.activeSpoilerDeployment = this.states.sampled[R.spoiler];
            this.telemetry.ignitionOn = this.current[R.ignition] === 1;
            this.vehicleVisual.updateInstruments(this.telemetryView.hydrate(this.telemetry), dt);
        }
        this.prepareRenderMatrices();
        this.runtime.performance.add('scene', performance.now() - started);
        if (this.visualDebug.enabled)
            this.visualDebug.update(this.vehicleVisual, this.context.debugContacts, this.driverCamera, this.mirrors);
        if (!this.visible || !this.prepared) {
            this.updateWorldVisibility();
            return;
        }
        const renderStart = performance.now();
        this.graph.execute();
        this.runtime.performance.endGpu();
        this.runtime.performance.add('render', performance.now() - renderStart - this.renderPreparationCpu);
        this.frameCount++;
        if (time - this.lastStats >= 1000) {
            this.lastStats = time;
            this.reply({
                kind: 'stats', epoch: this.init.epoch, state: {
                    owner: 'RendererWorker', webgl2: this.renderer.capabilities.isWebGL2, ready: this.prepared, frames: this.frameCount, sequence: this.sequence, overlayVisible: this.overlayVisible, mirrors: {
                        left: this.mirrors.getView('left').valid, right: this.mirrors.getView('right').valid
                    }, shadow: !!this.sun.shadow.map, debugText: this.visualDebug.presentationText, info: {
                        render: {
                            ...this.renderer.info.render
                        }, memory: {
                            ...this.renderer.info.memory
                        }, programs: this.renderer.info.programs?.length
                    }, renderGraph: this.graph.state, world: this.ground.runtimeState?.(), performance: this.runtime.performance.latest()
                }
            });
        }
    };
    private applySnapshot(): void {
        const s = this.states.sample(performance.timeOrigin + performance.now()), a = this.previous, b = this.current, t = this.states.alpha, p = R.pose;
        readRenderLighting(b, this.lightState);
        this.vehicleVisual.setWorldPose(s[p]!, s[p + 1]!, s[p + 2]!, s[p + 3]!, s[p + 4]!, s[p + 5]!);
        for (const [i, id] of (['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const).entries()) {
            const at = p + 9 + i * 4, w = this.wheels[id];
            w.x = s[at]!;
            w.y = s[at + 1]!;
            w.z = s[at + 2]!;
            this.rotations[id] = s[at + 3]!;
        }
        this.vehicleVisual.root.updateMatrixWorld(true);
        this.vehicleVisual.setWheelWorldPositions(this.wheels);
        this.vehicleVisual.setWheelRotationAngles(this.rotations);
        this.vehicleVisual.setFrontWheelSteeringAngles(-s[p + 6]!, -s[p + 7]!);
        this.vehicleVisual.setSteeringWheelAngle(-s[p + 8]!);
        this.vehicleVisual.cockpitRoot.position.fromArray(s, R.bodyFeedback);
        this.cameraFrom.fromArray(a, R.cameraQuaternion);
        this.cameraTo.fromArray(b, R.cameraQuaternion);
        this.driverCamera.camera.quaternion.copy(this.cameraFrom).slerp(this.cameraTo, t);
        this.driverCamera.camera.position.fromArray(s, R.cameraPosition);
        if (b[R.cameraSpace] === 1) {
            this.vehicleVisual.root.localToWorld(this.driverCamera.camera.position);
            this.driverCamera.camera.quaternion.premultiply(this.vehicleVisual.root.quaternion);
        }
        this.driverCamera.camera.fov = b[R.cameraParams]!;
        this.driverCamera.camera.aspect = b[R.cameraParams + 1]!;
        this.driverCamera.camera.near = b[R.cameraParams + 2]!;
        this.driverCamera.camera.far = b[R.cameraParams + 3]!;
        this.driverCamera.camera.projectionMatrix.fromArray(b, R.cameraProjection);
        this.driverCamera.camera.projectionMatrixInverse.copy(this.driverCamera.camera.projectionMatrix).invert();
        this.driverCamera.camera.layers.mask = b[R.cameraLayers]!;
        this.driverCamera.camera.updateMatrixWorld();
        this.snapshot.x = b[R.focus]!;
        this.snapshot.z = b[R.focus + 1]!;
        this.snapshot.yaw = b[R.focus + 2]!;
        this.snapshot.speed = b[R.speed]!;
        const weather = R.weather;
        this.environment.weather = WEATHER_SEQUENCE[b[weather]!] ?? 'CLEAR';
        this.environment.time = (['DAY', 'DUSK', 'NIGHT'] as EnvironmentTime[])[b[weather + 1]!] ?? 'DAY';
        for (const [i, key] of (['cloudiness', 'rainIntensity', 'fogIntensity', 'wetness', 'windIntensity', 'stormIntensity', 'lightningFlash'] as const).entries())
            this.environment[key] = b[weather + 2 + i]!;
        this.wiper.angle = s[R.wiper]!;
        this.wiper.previousAngle = s[R.wiper + 1]!;
        this.wiper.sweptMin = b[R.wiper + 2]!;
        this.wiper.sweptMax = b[R.wiper + 3]!;
        this.wiper.sweeping = b[R.wiper + 4] === 1;
        for (const [i, id] of (['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const).entries()) {
            this.alignment[id].steeringAngle = b[R.alignment + i * 2]!;
            this.alignment[id].camberAngle = b[R.alignment + i * 2 + 1]!;
        }
        this.vehicleVisual.setWheelAlignment(this.alignment as Parameters<VehicleVisual['setWheelAlignment']>[0]);
        if (this.vehicleVisual.interactionDefinition)
            applyVehicleInteractionVisual(this.vehicleVisual.interactionDefinition, s[R.access]!, s[R.access + 1]!);
        for (const [i, side] of (['left', 'right'] as const).entries())
            this.vehicleVisual.getMirrorSurface(side).quaternion.fromArray(b, R.mirrorQuaternion + i * 4);
        this.vehicleVisual.root.updateMatrixWorld(true);
    }
    private fail(error: unknown): void {
        this.reply({
            kind: 'error', epoch: this.init.epoch, message: error instanceof Error ? error.stack ?? error.message : String(error)
        });
    }
    async dispose(): Promise<void> {
        if (!this.running)
            return;
        this.running = false;
        this.runtime.dispose();
        this.warmup.dispose();
        this.ground?.dispose();
        this.pendingVehicle?.dispose();
        this.pendingVehicle = undefined;
        await this.warmup.whenIdle();
        await this.ground?.whenDisposed;
        this.parkingCamera?.dispose();
        this.mirrors?.dispose();
        this.mirrorOverlay?.dispose();
        this.windshieldRain?.dispose();
        this.vehicleLighting?.dispose();
        this.vehicleVisual?.dispose();
        this.environmentVisual.dispose();
        this.environmentMap.dispose();
        this.telemetryView.dispose();
        this.debugOverlays.dispose();
        this.visualDebug.dispose();
        this.assets.dispose();
        this.skyGeometry?.dispose();
        this.skyMaterial?.dispose();
        this.graph?.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.reply({
            kind: 'disposed', epoch: this.init.epoch, state: {
                contextLost: true, renderWorld: (this.ground as any)?.sectors?.visualStatistics?.worldRendering?.renderWorld, graph: this.graph?.state
            }
        });
    }
    private addLightingAndSky(): void {
        this.scene.add(this.hemisphere);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(V.shadowMapSize, V.shadowMapSize);
        this.sun.shadow.camera.left = -V.shadowHalfExtent;
        this.sun.shadow.camera.right = V.shadowHalfExtent;
        this.sun.shadow.camera.top = V.shadowHalfExtent;
        this.sun.shadow.camera.bottom = -V.shadowHalfExtent;
        this.sun.shadow.camera.near = 5;
        this.sun.shadow.camera.far = 320;
        this.sun.shadow.bias = -0.00007;
        this.sun.shadow.normalBias = .018;
        this.scene.add(this.sun, this.sun.target);
        this.skyMaterial = new ShaderMaterial({
            side: BackSide,
            depthWrite: false,
            uniforms: {
                topColor: {
                    value: new Color(V.skyTop)
                },
                horizonColor: {
                    value: new Color(V.skyHorizon)
                },
                groundColor: {
                    value: new Color(V.skyGround)
                },
            },
            vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        varying vec3 vWorldPosition;
        void main() {
          vec3 direction = normalize(vWorldPosition - cameraPosition);
          float up = smoothstep(-0.08, 0.72, direction.y);
          vec3 color = mix(horizonColor, topColor, up);
          color = mix(groundColor, color, smoothstep(-0.18, 0.02, direction.y));
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
        });
        this.skyGeometry = new SphereGeometry(1900, 28, 16);
        const sky = new Mesh(this.skyGeometry, this.skyMaterial);
        sky.name = 'Atmospheric sky dome';
        sky.frustumCulled = false;
        this.skyDome = sky;
        this.scene.add(sky);
        this.scene.environment = this.environmentMap!.texture;
        this.scene.environmentIntensity = V.environmentIntensity;
    }
    private createMirrorSystem(vehicle: VehicleVisual): MirrorSystem {
        const leftMirror = vehicle.getMirrorSurface('left');
        const rightMirror = vehicle.getMirrorSurface('right');
        return new MirrorSystem(this.renderer, this.scene, {
            driverCamera: this.driverCamera,
            vehicleRoot: vehicle.root,
            defaultResolution: [640, 336],
            // Real exterior geometry supplies parking references. Only the cabin
            // and reflective glass are excluded; never hide the complete car body.
            hiddenDuringReflection: [vehicle.cockpitRoot, this.windshieldRain.root],
            autoBindSurfaces: true,
            interior: vehicle.centerMirrorSurface && vehicle.config.centerMirrorTransform ? {
                surface: vehicle.centerMirrorSurface, size: vehicle.config.centerMirrorTransform.size,
                reflectiveRoot: vehicle.mirrorSurfaceRoot, enabled: vehicle.config.mirrorSystem?.interior !== 'static',
            } : undefined,
            mirrors: {
                left: {
                    enabled: vehicle.config.mirrorSystem?.left !== false,
                    surface: leftMirror,
                    size: vehicle.config.leftMirrorTransform.size,
                    resolution: [640, 336],
                    cropToMirror: true,
                    viewportPadding: 0.025,
                    clipBias: 0.003,
                },
                right: {
                    enabled: vehicle.config.mirrorSystem?.right !== false,
                    surface: rightMirror,
                    size: vehicle.config.rightMirrorTransform.size,
                    resolution: [640, 336],
                    cropToMirror: true,
                    viewportPadding: 0.025,
                    clipBias: 0.003,
                },
            },
        });
    }
    private prepareRenderMatrices(): void {
        if (!this.ground.root.userData.staticWorldTransforms || false) {
            this.scene.matrixWorldAutoUpdate = true;
            return;
        }
        this.scene.updateWorldMatrix(false, false);
        this.ground.root.updateWorldMatrix(false, false);
        for (const child of this.scene.children)
            if (child !== this.ground.root)
                child.updateMatrixWorld();
        this.scene.matrixWorldAutoUpdate = false;
    }
    private updateWorldVisibility(): void {
        if (!this.ground.updateVisualVisibility)
            return;
        const cameras = this.worldViewCameras;
        cameras.length = 0;
        cameras.push(this.driverCamera.camera);
        // Update off-axis projections before culling, including a newly turned head.
        this.mirrors.update();
        for (const side of ['left', 'right'] as const) {
            const view = this.mirrors.getView(side);
            if (view.enabled && view.valid)
                cameras.push(view.camera);
        }
        if (this.mirrors.interiorMirror?.update())
            cameras.push(this.mirrors.interiorMirror.camera);
        const shadows = this.worldShadowCameras;
        shadows.length = 0;
        if (this.sun.castShadow) {
            this.sun.updateWorldMatrix(true, false);
            this.sun.shadow.updateMatrices(this.sun);
            shadows.push(this.sun.shadow.camera);
        }
        this.ground.updateVisualVisibility(this.driverCamera.camera.position, true && this.scene.fog instanceof Fog ? this.scene.fog.far : Infinity, cameras, shadows);
    }
}
