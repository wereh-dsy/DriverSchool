import { AccelerationRunDiagnostics } from '../experimental/acceleration/AccelerationRunDiagnostics';
import { VehiclePhysicsBlackBox, blackBoxFilename } from '../vehicle/diagnostics/VehiclePhysicsBlackBox';
import type { BlackBoxStatus } from '../vehicle/diagnostics/BlackBoxSchema';

declare const __DRIVERGAME_BUILD_VERSION__: string;
declare const __CITY_MAIN_RUNTIME_URL__: string;
import { AdaptiveDriverLayer } from '../vehicle/control/adaptive/AdaptiveDriverLayer';
import { DriverProfileStore } from '../vehicle/control/adaptive/DriverProfileStore';
import { LaneAssistMode, LaneAssistStateController, LANE_ASSIST_LABELS } from '../vehicle/control/LaneAssistState';
import { LaneDepartureWarningController } from '../vehicle/control/LaneDepartureWarningController';
import { ElectricPowertrain } from '../vehicle/powertrain/ElectricPowertrain';
import type { Powertrain } from '../vehicle/powertrain/Powertrain';
import { ParkingCamera } from '../camera/ParkingCamera';
import { ExecutiveDisplayContext } from '../vehicle/visual/ExecutiveDisplayContext';
import { ElectricDisplayContext } from '../vehicle/visual/ElectricDisplayContext';
import { DrivingSceneDisplayContext } from '../vehicle/visual/DrivingSceneDisplayContext';
import { SharedVehicleData } from '../vehicle/SharedVehicleData';
import { LateralAssistController, arbitrateLateralSteering, type LateralAssistContext } from '../vehicle/control/LateralAssistController';
import { createLaneObservation } from '../world/navigation/LaneObservation';
import { NavigationController } from '../world/navigation/NavigationController';
import { LateralAssistDebugView } from './LateralAssistDebugView';
import { TrajectoryPrediction } from '../experimental/trajectory/TrajectoryPrediction';
import { AccelerationTest } from '../experimental/acceleration/AccelerationTest';
import { AccelerationTestView } from '../experimental/acceleration/AccelerationTestView';
import { VehicleAssetRegistry } from '../vehicle/visual/VehicleAssetRegistry';
import { VehicleLoadingLifecycle } from '../vehicle/VehicleLoadingLifecycle';
import type { AdaptiveMirrorContext } from '../camera/AdaptiveMirrorRendering';
import {
  ACESFilmicToneMapping,
  BackSide,
  Color,
  DirectionalLight,
  Euler,
  Fog,
  HemisphereLight,
  MathUtils,
  Mesh,
  Quaternion,
  Texture,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
  Vector2,
} from 'three';
import { EngineAudio } from '../audio/EngineAudio';
import type { VehicleAudioProfile } from '../audio/VehicleAudioProfile';
import { evaluateCabinAcoustics, type CabinAcousticState } from '../audio/VehicleCabinAcoustics';
import {
  applyVehicleInteractionVisual,
  type VehicleInteractionDefinition,
} from '../vehicle/interaction/VehicleInteractionDefinition';
import { VehicleInteractionController } from '../vehicle/interaction/VehicleInteractionController';
import { OnFootController } from '../player/OnFootController';
import { PlayerModeController, smoothPlayerTransition } from '../player/PlayerModeController';
import { vehicleControlsForPlayerMode } from '../player/PlayerInput';
import {
  DEFAULT_DRIVER_FOV_DEGREES,
  DEFAULT_DRIVER_HEAD_LOOK,
  DriverCamera,
  MirrorAdjustmentController,
  MirrorSystem,
  type AdjustableMirrorSide,
} from '../camera';
import {
  VehicleInputSystem,
  createNeutralVehicleInputState,
  type VehicleControlMode,
  type VehicleInputSource,
  type VehicleInputState,
} from '../input';
import { Hud } from '../ui/Hud';
import { LapTimer } from './lap/LapTimer';
import { MirrorOverlayRenderer } from '../ui/MirrorOverlayRenderer';
import { WeatherSystem, WEATHER_LABELS, WEATHER_SEQUENCE, type EnvironmentTime, type Weather } from '../world/environment/WeatherSystem';
import { EnvironmentVisual } from '../world/environment/EnvironmentVisual';
import { VISUAL_ENVIRONMENT as V } from '../world/environment/VisualEnvironmentConfig';
import { createStaticEnvironmentMap } from '../world/environment/StaticEnvironmentMap';
import { WindshieldRain } from '../camera/WindshieldRain';
import { WiperController } from '../vehicle/control/WiperController';
import {
  DEFAULT_VEHICLE_ID,
  VEHICLE_CATALOG,
  createVehiclePhysicsConfig,
  getNextVehicleId,
  getVehicleDescriptor,
  isVehicleId,
  type VehicleId,
} from '../vehicle/VehicleCatalog';
import {
  VehicleDynamics,
  type VehicleRuntimeSnapshot,
} from '../vehicle/physics';
import { CruiseControlController } from '../vehicle/control';
import { RearParkingProximity } from '../vehicle/control/RearParkingProximity';
import { VehicleLightingController } from '../vehicle/control/VehicleLightingController';
import { VehicleFeedbackSystem } from '../vehicle/feedback/VehicleFeedbackSystem';
import { GamepadHaptics } from '../input/GamepadHaptics';
import { VehicleContactSystem } from '../vehicle/physics/VehicleContactSystem';
import { chassisBodyPose } from '../vehicle/physics/WheelPhysicsState';
import { MirrorGeometryDebug } from '../camera/MirrorGeometryDebug';
import { ContactDebugView } from './ContactDebugView';
import { VehicleVisualDebugView } from './VehicleVisualDebugView';
import {
  VehicleLighting,
  VehicleVisual,
  type VehicleLightMode,
} from '../vehicle/visual';
import {
  DRIVING_GROUND_CATALOG,
  createDrivingGround, prepareDrivingGround,
  getInitialDrivingGroundId,
  getNextDrivingGroundId,
  isDrivingGroundId,
  type DrivingGround,
  type DrivingGroundId,
} from '../world';

const FIXED_STEP = 1 / 120;
const MAX_FRAME_TIME = 0.1;
const MAX_STEPS_PER_FRAME = 16;
const GAMEPAD_LOOK_YAW_RATE = MathUtils.degToRad(84);
const GAMEPAD_LOOK_PITCH_RATE = MathUtils.degToRad(62);

export class DrivingGame {
  private blackBox?: VehiclePhysicsBlackBox;
  private blackBoxStatus: BlackBoxStatus = 'OFF';
  private readonly blackBoxExportTasks = new Map<VehiclePhysicsBlackBox, ReturnType<typeof setTimeout>>();
  private blackBoxExportError?: VehiclePhysicsBlackBox;
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private ground: DrivingGround;
  private vehicleVisual: VehicleVisual;
  private vehicleLighting: VehicleLighting;
  private mirrorAdjustment: MirrorAdjustmentController;
  private dynamics: VehicleDynamics<Powertrain>;
  private readonly driverCamera: DriverCamera;
  private mirrors: MirrorSystem;
  private readonly mirrorOverlay: MirrorOverlayRenderer;
  private readonly input = new VehicleInputSystem();
  private readonly hud: Hud;
  private readonly lapTimer = new LapTimer();
  private readonly engineAudio = new EngineAudio();
  private executiveDisplay: ExecutiveDisplayContext | null = null;
  private electricDisplay: ElectricDisplayContext | null = null;
  private drivingSceneDisplay: DrivingSceneDisplayContext | null = null;
  private sharedVehicleData: SharedVehicleData | null = null;
  private readonly vehicleAssets = new VehicleAssetRegistry();
  private pendingVehicleVisual: VehicleVisual | null = null;
  private readonly vehicleLoading = new VehicleLoadingLifecycle(phase => {
    this.hud.setVehicleLoading(phase);
    if (phase === 'Failed') {
      this.pendingVehicleVisual?.dispose(); this.pendingVehicleVisual = null;
      console.error('Vehicle loading failed', this.vehicleLoading.error);
    }
  });
  private combustionAudioLoad = false;
  private parkingCamera: ParkingCamera | null = null;
  private readonly cruiseControl = new CruiseControlController();
  private readonly lateralAssist = new LateralAssistController();
  private readonly laneAssistSelection = new LaneAssistStateController();
  private readonly laneDepartureWarning = new LaneDepartureWarningController();
  private readonly emptyLane = createLaneObservation();
  private readonly lateralPose = { x: 0, z: 0, yaw: 0, y: 0 };
  private readonly lateralContext: LateralAssistContext = { speed: 0, lateralVelocity: 0, yawRate: 0, driverSteering: 0,
    operational: false, forwardGear: false, leftSignal: false, rightSignal: false, suspended: true };
  private readonly lateralDebug = import.meta.env.DEV ? new LateralAssistDebugView(this.scene) : null;
  private trajectoryPrediction: TrajectoryPrediction | null = null;
  private accelerationTest: AccelerationTest | null = null;
  private accelerationDiagnostics: AccelerationRunDiagnostics | null = null;
  private accelerationTestView: AccelerationTestView | null = null;
  private readonly rearParking = new RearParkingProximity();
  private tripCheckpointTime = 0;
  private readonly lightController = new VehicleLightingController();
  private readonly feedback = new VehicleFeedbackSystem();
  private readonly haptics = new GamepadHaptics({ getGamepad: () => this.input.gamepad?.getActiveGamepad() ?? null });
  private readonly sun = new DirectionalLight(V.sunColor, V.sunIntensity);
  private readonly hemisphere = new HemisphereLight(V.ambientSky, V.ambientGround, V.ambientIntensity);
  private readonly environment = new WeatherSystem();
  private readonly environmentVisual: EnvironmentVisual;
  private readonly wiperController = new WiperController();
  private windshieldRain: WindshieldRain;
  private skyGeometry: SphereGeometry | null = null;
  private skyMaterial: ShaderMaterial | null = null;
  private skyDome: Mesh | null = null;
  private environmentMap: ReturnType<typeof createStaticEnvironmentMap> | null = null;
  private readonly contacts: VehicleContactSystem;
  private readonly contactDebug: ContactDebugView;
  private readonly visualDebug: VehicleVisualDebugView;
  private readonly mirrorGeometryDebug = new MirrorGeometryDebug();

  private snapshot: VehicleRuntimeSnapshot;
  private groundVisualLoading = true;
  private groundVisualErrorReported = false;
  private readonly mirrorHeadLook = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
  private readonly worldViewCameras: Camera[] = [];
  private readonly mirrorContext: AdaptiveMirrorContext = { speed: 0, road: 'unknown', headYaw: 0, headTargetYaw: 0,
    leftSignal: false, rightSignal: false, selector: 'N', parking: false, steering: 0, lateralActive: false,
    laneChange: false, junction: false, preview: null };
  private accumulator = 0;
  private lastFrameTime = 0;
  private animationFrame = 0;
  private running = false;
  private draggingLook = false;
  private pointerX = 0;
  private pointerY = 0;
  private lastControlMode: VehicleControlMode = 'normal';
  private lastInputSource: VehicleInputSource = 'keyboard';
  private lastShiftEventSequence = 0;
  private latestInput: VehicleInputState;
  private gameStarted = false;
  private settingsOpen = false;
  private readonly driverAdaptive = new AdaptiveDriverLayer(new DriverProfileStore());
  private readonly playerMode = new PlayerModeController();
  private readonly walker = new OnFootController();
  private readonly vehicleInteraction = new VehicleInteractionController();
  private interactionDefinition: VehicleInteractionDefinition | null = null;
  private cabinAcoustics: CabinAcousticState | null = null;
  private nearDriverEntry = false;
  private readonly cameraTransitionStartPosition = new Vector3();
  private readonly cameraTransitionStartQuaternion = new Quaternion();
  private readonly cameraTargetPosition = new Vector3();
  private readonly cameraTargetQuaternion = new Quaternion();
  private readonly walkerEye = new Vector3();
  private readonly walkerEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly navigation = new NavigationController();
  private selectedMirror: AdjustableMirrorSide = 'left';
  private fuelLevel = 0.78;
  private coolantTemperatureC = 86;
  // A real stall leaves the electrical ignition on; an intentional stop does not.
  private ignitionOn = true;
  private lastHandbrakeApplied = false;
  private lastParkingBrakeState: VehicleRuntimeSnapshot['parkingBrake']['state'] = 'RELEASED';
  private lastEmergencyBraking = false;
  private lastEngineRunning = true;
  private lastCruiseEventSequence = 0;
  private latestRoadRoughness = 0.08;
  private activeVehicleId: VehicleId;
  private activeGroundId: DrivingGroundId;

  static async create(host: HTMLElement): Promise<DrivingGame> {
    const groundId = DrivingGame.readStoredGroundId();
    const timing = await prepareDrivingGround(groundId);
    host.replaceChildren();
    return new DrivingGame(host, createDrivingGround(groundId, timing), groundId);
  }

  private constructor(private readonly host: HTMLElement, initialGround: DrivingGround, initialGroundId: DrivingGroundId) {
    this.hud = new Hud(host);
    this.contactDebug = new ContactDebugView(host);
    this.scene.add(this.contactDebug.root);
    this.visualDebug = new VehicleVisualDebugView(host);
    this.scene.add(this.visualDebug.root);
    this.scene.add(this.mirrorGeometryDebug.root);
    this.renderer = this.createRenderer();
    host.prepend(this.renderer.domElement);

    this.activeGroundId = initialGroundId;
    this.ground = initialGround;
    this.prepareGroundVisuals(this.ground);
    this.hud.setRoadNetwork(this.ground.roadNetwork);
    this.navigation.configure(DRIVING_GROUND_CATALOG.find(g=>g.id===this.activeGroundId)?.navigation?this.ground.roadNetwork:undefined);
    this.hud.setNavigation(this.navigation);
    this.hud.onMapVisibilityChange=visible=>{
      this.accumulator=0;this.draggingLook=false;this.input.setEnabled(false);this.haptics.stop();
      if(visible){this.cruiseControl.reset();this.laneAssistSelection.cancelCentering();this.laneAssistSelection.applyTo(this.lateralAssist);}
      else this.renderer.domElement.focus();
    };
    this.activeVehicleId = this.readStoredVehicleId();
    const initialVehicle = getVehicleDescriptor(this.activeVehicleId);
    this.vehicleLoading.mark('Static asset prepare');
    VehicleVisual.prepareAssets(initialVehicle.visualConfig, this.vehicleAssets);
    const colliderIndexStarted = performance.now();
    this.contacts = new VehicleContactSystem(this.ground, initialVehicle.visualConfig.collisionDimensions);
    performance.measure('city:colliderIndex', {start:colliderIndexStarted,end:performance.now()});
    this.vehicleLoading.mark('Instance creation');
    this.vehicleVisual = new VehicleVisual(initialVehicle.visualConfig, this.vehicleAssets);
    this.vehicleLighting = new VehicleLighting(this.vehicleVisual);
    this.windshieldRain = new WindshieldRain(this.vehicleVisual);
    this.mirrorAdjustment = this.createMirrorAdjustment(this.vehicleVisual);

    this.scene.background = new Color(V.fogColor);
    this.scene.fog = new Fog(V.fogColor, V.fogNear, V.fogFar);
    this.scene.add(this.ground.root, this.vehicleVisual.root);
    this.addLightingAndSky();
    this.environmentVisual = new EnvironmentVisual(this.scene, this.environment, this.sun, this.hemisphere, this.skyMaterial!,
      value => { this.renderer.toneMappingExposure = value; });
    this.environmentVisual.setGround(this.ground);

    const spawn = this.ground.spawnPose;
    this.vehicleLoading.mark('Dynamic state init');
    this.dynamics = new VehicleDynamics<Powertrain>(createVehiclePhysicsConfig(this.activeVehicleId), {
      currentFuelL: this.readStoredFuelL(this.activeVehicleId),
      x: spawn.position.x,
      z: spawn.position.z,
      yaw: spawn.yawRadians,
      gear: 'N',
      engineRunning: 'engine' in initialVehicle.physicsConfig && initialVehicle.physicsConfig.engine.ignitionSequence === undefined,
      stateOfCharge: this.readStoredSOC(this.activeVehicleId),
    });
    this.snapshot = this.contacts.synchronize(this.dynamics);
    this.configureVehicleDisplays();
    this.lapTimer.configure(this.ground.lapCourse, this.activeVehicleId, this.snapshot);
    this.ignitionOn = this.snapshot.vehicleOperational;
    this.feedback.setVehicleConfig(this.dynamics.config);
    this.feedback.reset(this.snapshot);
    this.lastEngineRunning = this.snapshot.engineRunning ?? false;
    this.latestInput = this.input.peekState();
    this.updateVehicleVisual(0);

    this.driverCamera = new DriverCamera({
      driverEyePosition: initialVehicle.visualConfig.driverEyePosition,
      aspect: window.innerWidth / Math.max(1, window.innerHeight),
      fov: DEFAULT_DRIVER_FOV_DEGREES,
      near: 0.025,
      far: 2_500,
      headLook: {
        yawLimit: DEFAULT_DRIVER_HEAD_LOOK.yawLimitRadians,
        pitchUpLimit: DEFAULT_DRIVER_HEAD_LOOK.pitchUpLimitRadians,
        pitchDownLimit: DEFAULT_DRIVER_HEAD_LOOK.pitchDownLimitRadians,
        response: DEFAULT_DRIVER_HEAD_LOOK.response,
      },
    });
    this.driverCamera.update(this.vehicleVisual.root, 0);
    // WORLD, EXTERIOR, INTERIOR, MIRROR_SURFACE, and optional DEBUG overlays.
    this.driverCamera.camera.layers.enableAll();
    this.configureVehicleInteraction(this.vehicleVisual, initialVehicle.audioProfile);

    this.mirrors = this.createMirrorSystem(this.vehicleVisual);
    this.mirrorOverlay = new MirrorOverlayRenderer(this.mirrors.getHudTexture('right'));
    this.mirrorOverlay.setView(this.mirrors.getView('right'));
    this.configureVehicleSettings();
    this.configureGroundSelection();
    this.configureVehicleSelection();

    this.input.setEnabled(false);
    this.haptics.setEnabled(false);
    this.hud.onStart = () => {
      this.gameStarted = true;
      this.input.setEnabled(!this.settingsOpen);
      this.haptics.setEnabled(!this.settingsOpen && this.hud.settings.vibrationEnabled);
      void this.engineAudio.start();
      this.renderer.domElement.focus();
    };
    this.bindEvents();
    this.queueVehicleWarmup();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  /** Public integration point for examinations, maps or scripted events. */
  public setWeather(weather: Weather, transitionSeconds = 8): void {
    this.environment.setWeather(weather, transitionSeconds);
    this.hud.settings.setEnvironment(this.environment.weather, this.environment.time);
    this.hud.showMessage(`天气 · ${WEATHER_LABELS[weather]}`, 1.8);
    this.persistEnvironment();
  }

  public setEnvironmentTime(time: EnvironmentTime): void {
    this.environment.setTime(time);
    this.hud.settings.setEnvironment(this.environment.weather, this.environment.time);
    this.environmentVisual.applyState();
    this.persistEnvironment();
  }

  dispose(): void {
    for (const timer of this.blackBoxExportTasks.values()) clearTimeout(timer);
    this.blackBoxExportTasks.clear();
    this.contacts.blackBox = undefined;
    this.dynamics.chassisMotion.diagnosticObserver = undefined;
    this.dynamics.chassisMotion.safetyObserver = undefined;
    this.dynamics.diagnosticRecoveryObserver = undefined;
    this.blackBox?.disable();
    this.vehicleLoading.dispose();
    this.pendingVehicleVisual?.dispose(); this.pendingVehicleVisual = null;
    this.storeCurrentFuel();
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.unbindEvents();
    this.input.dispose();
    this.haptics.dispose();
    this.hud.dispose();
    this.contactDebug.dispose();
    this.lateralDebug?.dispose();
    this.trajectoryPrediction?.dispose();
    this.accelerationTestView?.dispose();
    this.visualDebug.dispose();
    this.mirrorGeometryDebug.dispose();
    this.windshieldRain.dispose();
    this.environmentVisual.dispose();
    this.vehicleLighting.dispose();
    this.mirrors.dispose();
    this.parkingCamera?.dispose();
    this.vehicleVisual.dispose();
    this.vehicleAssets.dispose();
    this.mirrorOverlay.dispose();
    this.ground.dispose();
    this.skyGeometry?.dispose();
    this.skyMaterial?.dispose();
    this.skyGeometry = null;
    this.skyMaterial = null;
    this.skyDome = null;
    this.scene.environment = null;
    this.environmentMap?.dispose();
    this.environmentMap = null;
    this.renderer.dispose();
    this.engineAudio.dispose();
    this.electricDisplay?.dispose();
    this.drivingSceneDisplay?.dispose();
    this.sharedVehicleData?.dispose();
    this.renderer.domElement.remove();
  }

  private filterSettingsInput(sample: VehicleInputState): VehicleInputState {
    if (!this.settingsOpen) return sample;
    return {
      ...createNeutralVehicleInputState(this.snapshot.controlMode, this.snapshot.clutchPedal),
      brake: sample.brake,
      handbrake: sample.handbrake,
    };
  }

  private get drivingInputActive(): boolean {
    return this.playerMode.mode === 'Driving' && !this.playerMode.transitioning;
  }

  /** Binds the vehicle-authored interaction contract into the shared runtime. */
  private configureVehicleInteraction(visual: VehicleVisual, audioProfile?: VehicleAudioProfile): void {
    const base = visual.interactionDefinition;
    this.interactionDefinition = base === null
      ? null
      : { ...base, cabinAcoustics: audioProfile?.cabinAcoustics };
    this.vehicleInteraction.configure(this.interactionDefinition);
    this.playerMode.reset('Driving');
    this.walker.reset();
    this.nearDriverEntry = false;
    this.cabinAcoustics = null;
  }

  private isNearDriverEntry(): boolean {
    return this.vehicleInteraction.isInsideInteractionZone(
      { x: this.walker.position.x, z: this.walker.position.z },
      { x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw },
    );
  }

  /** Handles latched access commands inside the fixed step that consumed them. */
  private processVehicleInteractionCommands(input: VehicleInputState, dt: number): void {
    if (this.settingsOpen || !this.gameStarted || this.playerMode.transitioning) {
      this.vehicleInteraction.update(dt);
      this.vehicleInteraction.stopDriverWindow();
      return;
    }
    if (this.interactionDefinition === null) {
      this.vehicleInteraction.update(dt);
      if (input.enterExitVehicle || input.toggleDriverDoor) {
        this.hud.showMessage('当前车型暂未启用车门 / 上下车交互', 2);
      }
      return;
    }
    if (input.toggleDriverDoor) {
      if (this.playerMode.mode === 'OnFoot' && !this.isNearDriverEntry()) {
        this.hud.showMessage('请靠近主驾驶门再操作车门', 1.8);
      } else {
        const result = this.vehicleInteraction.toggleDriverDoor(this.snapshot.speed);
        if (!result.accepted) {
          this.hud.showMessage('车辆未停稳 · 无法操作主驾驶车门', 2);
        } else {
          this.hud.showMessage(this.vehicleInteraction.door.wantsOpen ? '主驾驶门正在打开' : '主驾驶门正在关闭', 1.4);
        }
      }
    }
    if (input.enterExitVehicle) this.requestPlayerModeChange();

    this.vehicleInteraction.update(dt);
    const driveWindow = this.drivingInputActive;
    const up = driveWindow && input.driverWindowUp === true;
    const down = driveWindow && input.driverWindowDown === true;
    if (up && !down) this.vehicleInteraction.driverWindowUp(dt);
    else if (down && !up) this.vehicleInteraction.driverWindowDown(dt);
    else this.vehicleInteraction.stopDriverWindow();
  }

  private requestPlayerModeChange(): void {
    if (this.playerMode.transitioning || this.interactionDefinition === null) return;
    if (this.playerMode.mode === 'Driving') {
      if (!this.vehicleInteraction.requestExitVehicle(this.snapshot.speed).accepted) {
        this.hud.showMessage('车辆未停稳 · 无法下车', 2.2);
        return;
      }
      // A closed door opens first; the camera transition starts immediately.
      this.vehicleInteraction.openDriverDoor();
      this.driverCamera.update(this.vehicleVisual.root, 0);
      this.cameraTransitionStartPosition.copy(this.driverCamera.camera.position);
      this.cameraTransitionStartQuaternion.copy(this.driverCamera.camera.quaternion);
      if (!this.playerMode.beginExit()) return;
      this.hud.showMessage('正在下车 · 主驾驶门已打开', 1.8);
      return;
    }
    const result = this.vehicleInteraction.requestEnterVehicle(
      this.snapshot.speed,
      { x: this.walker.position.x, z: this.walker.position.z },
      { x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw },
    );
    if (!result.accepted) {
      this.hud.showMessage(result.reason === 'vehicle-moving'
        ? '车辆未停稳 · 无法上车'
        : '请靠近主驾驶门再上车', 2.2);
      return;
    }
    this.vehicleInteraction.openDriverDoor();
    this.applyOnFootCamera();
    this.cameraTransitionStartPosition.copy(this.driverCamera.camera.position);
    this.cameraTransitionStartQuaternion.copy(this.driverCamera.camera.quaternion);
    if (!this.playerMode.beginEnter()) return;
    this.hud.showMessage('正在上车', 1.6);
  }

  private placeWalkerAtExit(): void {
    const pose = { x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw };
    const exit = this.vehicleInteraction.driverExitPoint(pose);
    if (exit === null) return;
    const groundY = this.ground.getRoadHeightAt(exit.x, exit.z);
    this.walker.placeAt(exit.x, exit.z, groundY, this.snapshot.yaw);
    this.nearDriverEntry = this.isNearDriverEntry();
  }

  private applyOnFootCamera(): void {
    this.walker.getEyePosition(this.walkerEye);
    this.driverCamera.camera.position.copy(this.walkerEye);
    this.walkerEuler.set(this.walker.pitch, this.walker.yaw, 0, 'YXZ');
    this.driverCamera.camera.quaternion.setFromEuler(this.walkerEuler);
    this.driverCamera.camera.updateMatrixWorld(true);
  }

  /**
   * Advances the Driving/OnFoot transition and owns the single first-person
   * camera. The transition ends exactly on the destination pose, so entering
   * or leaving cannot produce a camera jump.
   */
  private updatePlayerCamera(dt: number): void {
    const transition = this.playerMode.update(dt);
    if (transition !== null) {
      const kind = transition.kind;
      if (kind === 'exit') {
        const exit = this.vehicleInteraction.driverExitPoint(
          { x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw });
        if (exit !== null) {
          this.cameraTargetPosition.set(exit.x,
            this.ground.getRoadHeightAt(exit.x, exit.z) + this.walker.eyeHeight, exit.z);
        } else {
          this.cameraTargetPosition.copy(this.driverCamera.camera.position);
        }
        this.cameraTargetQuaternion.setFromEuler(this.walkerEuler.set(0, this.snapshot.yaw, 0, 'YXZ'));
      } else {
        this.vehicleVisual.root.updateWorldMatrix(true, false);
        const eye = this.interactionDefinition?.driverEyePoint;
        if (eye !== undefined) this.cameraTargetPosition.set(eye[0], eye[1], eye[2]);
        else this.cameraTargetPosition.copy(this.driverCamera.driverEyePosition);
        this.cameraTargetPosition.applyMatrix4(this.vehicleVisual.root.matrixWorld);
        this.vehicleVisual.root.getWorldQuaternion(this.cameraTargetQuaternion)
          .multiply(this.driverCamera.localRotation).normalize();
      }
      if (!transition.completed) {
        const t = smoothPlayerTransition(transition.progress);
        this.driverCamera.camera.position.lerpVectors(
          this.cameraTransitionStartPosition, this.cameraTargetPosition, t);
        this.driverCamera.camera.quaternion.slerpQuaternions(
          this.cameraTransitionStartQuaternion, this.cameraTargetQuaternion, t);
        this.driverCamera.camera.updateMatrixWorld(true);
        return;
      }
      if (kind === 'exit') {
        this.driverCamera.resetHeadLook(true);
        this.placeWalkerAtExit();
        this.hud.showMessage('已下车 · 可绕车步行', 2);
      } else {
        this.driverCamera.resetHeadLook(true);
        this.vehicleInteraction.closeDriverDoor();
        this.hud.showMessage('已上车 · 主驾驶门将自动关闭', 2);
      }
    }

    if (this.playerMode.mode === 'Driving') {
      this.driverCamera.update(this.vehicleVisual.root, dt);
    } else {
      this.applyOnFootCamera();
    }
  }

  private updateOnFootWalk(dt: number): void {
    if (this.playerMode.mode !== 'OnFoot' || this.playerMode.transitioning) {
      this.nearDriverEntry = false;
      return;
    }
    const input = this.input.peekState();
    const active = this.gameStarted && !this.settingsOpen && !this.hud.isMapOpen;
    const forward = active ? input.throttle - input.brake : 0;
    const strafe = active ? input.steering : 0;
    this.walker.update(dt, forward, strafe, {
      groundHeightAt: (x, z) => this.ground.getRoadHeightAt(x, z),
      worldBounds: this.ground.worldBounds,
      nearbyColliders: (x, z, radius) =>
        this.contacts.collisionSystem.getNearbyColliders({ x, z }, radius),
      vehicle: {
        x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw,
        dimensions: this.vehicleVisual.config.collisionDimensions,
      },
    });
    const near = this.isNearDriverEntry();
    if (near && !this.nearDriverEntry) this.hud.showMessage('按 Tab 上车 · 主驾驶门', 1.8);
    this.nearDriverEntry = near;
  }

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    this.updateBlackBoxUI();
    const frameDt = Math.min(MAX_FRAME_TIME, Math.max(0, (time - this.lastFrameTime) / 1_000));
    this.lastFrameTime = time;
    // Presets only move targets; all consumers below read the smoothed values.
    this.environment.update(frameDt);
    const thunderDelay = this.environment.consumeThunderDelay();
    if (thunderDelay !== null) this.engineAudio.playThunder(thunderDelay);
    if (!this.vehicleLoading.ready) {
      this.input.setEnabled(false); this.haptics.stop(); this.accumulator = 0;
      if (this.ground.visualReady === false && !this.ground.visualLoadingError) this.updateGroundVisuals(0);
      this.vehicleLoading.advance();
      this.animationFrame = requestAnimationFrame(this.frame);
      return;
    }
    if (this.groundVisualLoading && this.ground.visualReady === false) {
      this.input.setEnabled(false); this.haptics.stop(); this.accumulator = 0;
      if (this.ground.visualLoadingError) {
        this.hud.setVehicleLoading('Failed', '地图加载失败，请刷新重试');
      } else {
        this.hud.setVehicleLoading('Visual warmup', '正在准备道路与地形');
        this.updateGroundVisuals(0);
      }
      this.animationFrame = requestAnimationFrame(this.frame); return;
    }
    if (this.groundVisualLoading) { this.groundVisualLoading = false; this.ground.markLoadMilestone?.('playable'); this.hud.setVehicleLoading('Ready'); }
    if (this.ground.visualLoadingError && !this.groundVisualErrorReported) {
      this.groundVisualErrorReported = true; this.hud.showMessage('地图视觉加载失败 · 请刷新重试', 10);
    }
    this.hud.updateNavigation(frameDt);
    if(this.hud.isMapOpen){
      this.accumulator=0;this.input.setEnabled(false);this.haptics.stop();
      this.updateGroundVisuals(0);this.animationFrame=requestAnimationFrame(this.frame);return;
    }
    this.accumulator = Math.min(this.accumulator + frameDt, FIXED_STEP * MAX_STEPS_PER_FRAME);
    // Shared weather grip feeds the existing contact sampling for every vehicle.
    this.contacts.setWetness(this.environment.wetness);
    this.contacts.setRoadGripMultiplier(this.environment.roadGripMultiplier);

    // Automatic PRND buttons in F3 still need a live unified brake sample.
    // All propulsion/steering/accessory commands remain suppressed in menus.
    this.input.setEnabled(this.gameStarted && (!this.settingsOpen || this.snapshot.transmission.type !== 'MANUAL'));
    this.input.update(frameDt, this.snapshot.clutchEngagement ?? 0);
    if (this.snapshot.transmission.type !== 'MANUAL' && this.input.controlMode !== 'normal') {
      this.input.setControlMode('normal', this.snapshot.clutchEngagement ?? 0);
    }
    const frameInput = this.input.peekState();
    this.latestInput = this.drivingInputActive
      ? this.filterSettingsInput(frameInput)
      : vehicleControlsForPlayerMode(frameInput, 'OnFoot');
    if (this.drivingInputActive) this.updateHeadLookFromInput(frameDt, this.latestInput);
    this.reportInputChanges(this.latestInput);

    let stepIndex = 0;
    while (this.accumulator >= FIXED_STEP && stepIndex < MAX_STEPS_PER_FRAME) {
      const rawControls = this.input.consumeState();
      this.processVehicleInteractionCommands(rawControls, FIXED_STEP);
      const driverControls = this.drivingInputActive
        ? this.filterSettingsInput(rawControls)
        : vehicleControlsForPlayerMode(rawControls, 'OnFoot');
      this.processAccessoryCommands(driverControls);
      if (driverControls.cycleWipers) {
        const mode = this.wiperController.cycle();
        this.hud.settings.setWiperMode(mode);
        const labels = { OFF: '关闭', AUTO: '自动', INTERMITTENT: '间歇', LOW: '低速', HIGH: '高速' };
        this.hud.showMessage(`前雨刷 · ${labels[mode]}`, 1.6);
      }
      const controls = this.cruiseControl.update(FIXED_STEP, driverControls, {
        available: getVehicleDescriptor(this.activeVehicleId).capabilities.cruiseControl,
        speedMetersPerSecond: this.snapshot.speed,
        engineRunning: this.snapshot.driveAvailable,
        currentThrottle: this.snapshot.throttle,
        driverThrottleCommand: this.dynamics.driverThrottleCommand(driverControls.throttle),
        torqueLimitFactor: this.snapshot.driverAssists.engineTorqueFactor,
        parkingBrakeActive: this.snapshot.parkingBrake.engaged || this.snapshot.parkingBrake.applying,
        autoHoldHolding: this.snapshot.autoHold.holding,
        gear: this.snapshot.gear ?? 'N',
        driveSelector: this.snapshot.transmission.selectedMode ?? undefined,
      });
      this.reportCruiseControlEvent();

      this.laneAssistSelection.update(FIXED_STEP);
      if (driverControls.cycleLaneAssist) this.laneAssistSelection.cycleMode();
      if (driverControls.lccToggle) this.toggleLaneCentering();
      this.laneAssistSelection.applyTo(this.lateralAssist);

      const lateral = this.lateralContext;
      lateral.speed = this.snapshot.speed; lateral.lateralVelocity = this.snapshot.lateralVelocity;
      lateral.yawRate = this.snapshot.yawRate;
      lateral.driverSteering = driverControls.steering; lateral.operational = this.snapshot.vehicleOperational;
      lateral.forwardGear = this.snapshot.transmission.selectedMode === 'D';
      lateral.suspended = this.settingsOpen || !this.gameStarted || document.hidden;
      // Include the current input edge before the lamp controller consumes it below.
      lateral.leftSignal = driverControls.leftIndicator ? !this.lightController.leftSignalSelected : this.lightController.leftSignalSelected;
      lateral.rightSignal = driverControls.rightIndicator ? !this.lightController.rightSignalSelected : this.lightController.rightSignalSelected;
      this.lateralPose.x = this.snapshot.x; this.lateralPose.z = this.snapshot.z;
      this.lateralPose.yaw = this.snapshot.yaw; this.lateralPose.y = this.snapshot.chassis.groundHeight;
      if(this.dynamics.capabilities.laneDisplay||this.dynamics.capabilities.lka||this.dynamics.capabilities.lcc) {
        this.sharedVehicleData?.updateLaneObservation(FIXED_STEP, this.lateralPose, this.snapshot.speed, this.ground.roadNetwork,
          this.lateralAssist.laneChangeOverride || lateral.leftSignal && driverControls.steering < -.1 || lateral.rightSignal && driverControls.steering > .1);
      }
      const lateralOutput = this.lateralAssist.update(FIXED_STEP, this.sharedVehicleData?.laneObservation ?? this.emptyLane, lateral);
      if (this.laneDepartureWarning.update(FIXED_STEP, this.sharedVehicleData?.laneObservation ?? this.emptyLane,
        lateral, this.laneAssistSelection.state.mode, this.dynamics.capabilities.lka || this.dynamics.capabilities.lcc)) this.engineAudio.playLaneDepartureWarning();
      controls.steering = arbitrateLateralSteering(driverControls.steering, lateralOutput);

      const beforeStep = this.snapshot;
      this.dynamics.vehicleControl.learningAllowed = this.gameStarted && !this.settingsOpen && !document.hidden &&
        this.playerMode.mode === 'Driving' && !this.playerMode.transitioning && !lateralOutput.active && !this.cruiseControl.isActive;
      this.snapshot = this.contacts.step(FIXED_STEP, controls, this.dynamics);
      this.accelerationTest?.update(FIXED_STEP, beforeStep, this.snapshot, driverControls.throttle,
        this.gameStarted && !this.settingsOpen && !document.hidden, this.contacts.collision?.collided ?? false);
      if (this.accelerationTest && this.accelerationDiagnostics) this.accelerationDiagnostics.update(FIXED_STEP,
        this.accelerationTest.state, beforeStep, this.snapshot, driverControls, controls, this.contacts.wheelContacts,
        this.dynamics.driverAssists.frontTorqueFactor, this.dynamics.driverAssists.rearTorqueFactor, this.environment);
      this.tripCheckpointTime += FIXED_STEP;
      if (this.tripCheckpointTime >= 10) { this.tripCheckpointTime = 0; this.storeCurrentFuel(); }
      this.ignitionOn = this.snapshot.vehicleOperational;
      this.lapTimer.update(FIXED_STEP, this.snapshot, this.gameStarted && !this.settingsOpen && !document.hidden);
      if (driverControls.cycleDriveMode && this.snapshot.driveMode !== undefined) {
        this.hud.showMessage(`驾驶模式 · ${this.snapshot.driveMode}`, 1.6);
      }
      if (this.snapshot.transmission.type !== 'MANUAL' &&
        (driverControls.shiftUp || driverControls.shiftDown || driverControls.driveSelector !== undefined) &&
        this.snapshot.transmission.selectorRejectedReason !== null) {
        this.hud.showMessage(this.snapshot.transmission.selectorRejectedReason === 'brake-required'
          ? '选挡被拒绝 · 请踩住刹车再切换 P / R / N / D'
          : '选挡被拒绝 · 请先停车再切换行驶方向或驻车挡', 2.2);
      }
      this.updateVehicleFeedback(FIXED_STEP);
      const previousLightMode = this.lightController.state.mainLightMode;
      this.lightController.update(FIXED_STEP, driverControls, {
        assistedBrakeActive: this.snapshot.powertrain.ev !== undefined &&
          (this.snapshot.powertrain.ev.regenBrakeLight || this.snapshot.wheels.frontLeft.appliedBrakeTorque > 10 ||
            this.snapshot.wheels.frontRight.appliedBrakeTorque > 10 || this.snapshot.wheels.rearLeft.appliedBrakeTorque > 10 ||
            this.snapshot.wheels.rearRight.appliedBrakeTorque > 10),
        autoOffWithIgnition: this.vehicleVisual.config.exteriorLighting?.autoOffWithIgnition,
        ignitionOn: this.ignitionOn,
        actualGear: this.snapshot.transmission.selectedMode === 'R' ? 'R' : this.snapshot.gear ?? 'N',
        steeringWheelAngle: this.snapshot.steeringWheelAngle,
      });
      if (driverControls.cycleLights || driverControls.fogToggle) {
        const lights = this.lightController.state;
        if (lights.mainLightMode !== previousLightMode) this.storeLightMode(lights.mainLightMode);
        this.hud.settings.setLightMode(lights.mainLightMode);
        this.hud.settings.setFogLights(lights.fogMode);
        this.hud.showMessage(driverControls.fogToggle ? (lights.fogMode === 'front-rear' ? '前后雾灯已开启' : lights.fogMode === 'front' ? '前雾灯已开启' : '雾灯已关闭') : this.getLightModeLabel(lights.mainLightMode), 1.6);
      }
      const wheels = this.contacts.wheelContacts;
      const roughness = wheels === null ? 0.025 :
        (wheels.frontLeft.roughness + wheels.frontRight.roughness +
          wheels.rearLeft.roughness + wheels.rearRight.roughness) / 4;
      this.latestRoadRoughness = MathUtils.lerp(
        this.latestRoadRoughness, roughness, 1 - Math.exp(-FIXED_STEP * 9),
      );
      this.accumulator -= FIXED_STEP;
      stepIndex += 1;
    }

    this.reportShiftResult();
    this.reportEngineState();
    this.reportParkingBrakeState();
    this.updateAuxiliaryGauges(frameDt);
    this.vehicleLighting.applyState(this.lightController.state, this.ignitionOn, frameDt);
    this.haptics.setEnabled(this.gameStarted && !this.settingsOpen && !document.hidden && this.hud.settings.vibrationEnabled);
    this.haptics.update(frameDt, this.feedback.state.continuousRumble);
    this.hud.settings.setDriveSelector(this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.transmission.type);
    if (this.settingsOpen) this.hud.settings.setFuel(this.snapshot.fuel);
    this.hud.settings.setBattery(this.snapshot.powertrain.ev);

    this.updateVehicleVisual(frameDt);
    this.contactDebug.update(this.contacts, this.ground, frameDt, this.snapshot);
    // Maps with authored ambient animation (for example Subject 3 traffic
    // signals) opt in through an optional update hook.
    this.ground.update?.(frameDt);
    this.updateGroundVisuals(this.snapshot.speed);
    this.hud.updateMinimap(this.snapshot.x, this.snapshot.z, this.snapshot.yaw, frameDt);
    this.updateSun();
    this.updateOnFootWalk(frameDt);
    this.updatePlayerCamera(frameDt);
    this.wiperController.update(frameDt, this.environment.rainIntensity);
    if (this.wiperController.sweepStarted) this.engineAudio.playWiperSweep(this.wiperController.effectiveMode);
    this.windshieldRain.update(frameDt, this.environment.rainIntensity, this.wiperController, this.snapshot.speed);
    this.environmentVisual.update(frameDt, this.driverCamera.camera.position);
    this.updateWorldVisibility();
    const acousticsProfile = this.vehicleInteraction.cabinAcoustics;
    this.cabinAcoustics = acousticsProfile !== undefined && this.playerMode.mode === 'Driving'
      ? evaluateCabinAcoustics(acousticsProfile, {
        windowPosition: this.vehicleInteraction.driverWindowOpenFraction,
        doorOpenAmount: this.vehicleInteraction.driverDoorOpenFraction,
        speedMetersPerSecond: this.snapshot.speed,
      })
      : null;
    const combustionEngine = this.dynamics.engine;
    if (combustionEngine) this.engineAudio.update(
      this.snapshot.rpm ?? 0,
      this.snapshot.throttle,
      this.snapshot.engineRunning ?? false,
      {
        engineCharacter: combustionEngine.config,
        vehicleSpeed: Math.abs(this.snapshot.speed),
        engineLoad: MathUtils.clamp((this.combustionAudioLoad
          ? Math.max(combustionEngine.getTorqueSample().combustionTorque, Math.abs(this.snapshot.transmission.engineLoadTorque ?? 0))
          : Math.abs(this.snapshot.transmission.engineLoadTorque ?? 0)) / Math.max(1, combustionEngine.getTorqueAtRPM(this.snapshot.rpm ?? 0)), 0, 1),
        clutchEngagement: this.snapshot.clutchEngagement ?? 0,
        roadRoughness: this.latestRoadRoughness,
        cockpit: this.visualDebug.renderCamera === null && this.playerMode.mode === 'Driving',
        cabinAcoustics: this.cabinAcoustics ?? undefined,
        driveMode: this.snapshot.driveMode,
        gear: this.snapshot.gear ?? undefined,
        acceleration: this.snapshot.acceleration,
        ignitionPhase: combustionEngine.ignitionPhase,
        cruiseActive: this.cruiseControl.status.active,
        lowFuel: this.snapshot.fuel?.lowFuel ?? false,
        parkingDistance: (this.sharedVehicleData && !this.electricDisplay ? this.sharedVehicleData.rearParking : this.rearParking.state).nearestDistanceM,
      },
    );
    const cruiseStatus = this.cruiseControl.status;
    if (!combustionEngine && this.snapshot.powertrain.ev) {
      const ev = this.snapshot.powertrain.ev;
      const powertrain = this.dynamics.powertrain;
      this.engineAudio.updateElectric(ev.motorRPM, ev.motorTorque, {
        vehicleSpeed: this.snapshot.speed, roadRoughness: this.latestRoadRoughness,
        cockpit: this.visualDebug.renderCamera === null && this.playerMode.mode === 'Driving',
        operational: this.snapshot.vehicleOperational,
        driving: this.snapshot.transmission.selectedMode === 'D' || this.snapshot.transmission.selectedMode === 'R',
        regenerativePowerKw: ev.regenPowerKw,
        maximumTorque: powertrain instanceof ElectricPowertrain ? powertrain.config.motor.maxDriveTorque : undefined,
        maximumRPM: powertrain instanceof ElectricPowertrain ? powertrain.config.motor.maxRPM : undefined,
          presence: powertrain instanceof ElectricPowertrain ? powertrain.config.audioPresence : undefined,
      });
    }
    this.engineAudio.updateTurnSignal(this.lightController.state);
    this.engineAudio.updateWeather(frameDt, this.environment.rainIntensity,
      this.environment.windIntensity, this.environment.stormIntensity,
      this.visualDebug.renderCamera === null && this.playerMode.mode === 'Driving',
      Math.abs(this.snapshot.speed), this.cabinAcoustics ?? undefined);
    this.hud.updateLap(this.ground.lapCourse ? this.lapTimer.state : null);
    this.hud.update({
      ...this.snapshot,
      turbo: this.hud.isDebugOpen ? this.dynamics.engine?.getTurboSnapshot() : undefined,
      inputSource: this.latestInput.source,
      cruiseAvailable: cruiseStatus.available,
      cruiseActive: cruiseStatus.active,
      cruiseTargetSpeedKmh: cruiseStatus.targetSpeedKmh,
      rearParking: this.sharedVehicleData && !this.electricDisplay ? this.sharedVehicleData.rearParking : this.rearParking.state,
      drivetrainVibrationIntensity: this.feedback.state.drivetrainVibrationIntensity,
      triggerDiagnostics: this.input.gamepad?.getThrottleDiagnostics(),
      throttleCommand: this.latestInput.throttle,
      feedback: this.feedback.state,
    }, frameDt);

    this.trajectoryPrediction?.update(frameDt, this.snapshot, this.dynamics.config, this.ground, this.gameStarted && !this.hud.immersiveMode);
    if (this.accelerationTest) this.accelerationTestView?.update(frameDt, this.accelerationTest.state, this.gameStarted && !this.settingsOpen && !this.hud.immersiveMode);
    this.parkingCamera?.update(frameDt, this.snapshot.transmission.selectedMode === 'R');
    const mirror = this.mirrorContext, head = this.driverCamera.getHeadLook(this.mirrorHeadLook);
    mirror.speed = this.snapshot.speed;
    const mirrorRoad = this.sharedVehicleData?.laneTracker.trackedLane?.road.roadType ?? this.sharedVehicleData?.navigation.currentRoad?.roadType ?? 'unknown';
    mirror.road = mirrorRoad === 'circuit' ? 'unknown' : mirrorRoad;
    mirror.headYaw = head.yaw; mirror.headTargetYaw = head.targetYaw;
    mirror.leftSignal = this.lightController.leftSignalSelected; mirror.rightSignal = this.lightController.rightSignalSelected;
    mirror.selector = this.snapshot.transmission.selectedMode ?? String(this.snapshot.gear);
    mirror.parking = this.sharedVehicleData?.parking.active ?? this.rearParking.state.active;
    mirror.steering = this.latestInput.steering;
    mirror.lateralActive = this.lateralAssist.display.lkaActive || this.lateralAssist.display.lccActive;
    mirror.laneChange = this.lateralAssist.laneChangeOverride;
    mirror.junction = this.sharedVehicleData?.laneObservation.isIntersection ?? false;
    mirror.preview = this.settingsOpen ? this.selectedMirror : null;
    this.mirrors.renderAdaptive(frameDt, mirror);
    const showMirrorOverlay = this.playerMode.mode === 'Driving' &&
      this.mirrors.adaptive.showRightOverlay && !this.hud.immersiveMode;
    this.hud.setMirrorOverlayVisible(showMirrorOverlay);
    this.visualDebug.update(this.vehicleVisual, this.contacts, this.driverCamera, this.mirrors);
    this.windshieldRain.root.visible = this.visualDebug.renderCamera === null &&
      this.playerMode.mode === 'Driving';
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.visualDebug.renderCamera ?? this.driverCamera.camera);
    this.ground.markLoadMilestone?.('firstRender');
    if (showMirrorOverlay) this.mirrorOverlay.render(this.renderer, this.hud.getMirrorRect());

    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private updateVehicleVisual(dt: number): void {
    const feedbackOffset = this.feedback.state.cockpitOffset;
    // Suspension owns chassis pitch/roll. Only millimetre cabin vibration is
    // added here; the driver eye and physical mirror planes stay untouched.
    this.vehicleVisual.cockpitRoot.position.set(feedbackOffset.x, feedbackOffset.y, feedbackOffset.z);
    const chassis = this.snapshot.chassis;
    const roadHeight = chassis.groundHeight;
    const body = chassisBodyPose(chassis, this.vehicleVisual.config.staticBodyOffsetY, this.snapshot.yaw);
    this.vehicleVisual.setWorldPose(
      this.snapshot.x + body.offsetX,
      body.y,
      this.snapshot.z + body.offsetZ,
      this.snapshot.yaw,
      body.pitch,
      body.roll,
    );
    this.vehicleVisual.setWheelWorldPositions({
      frontLeft: this.snapshot.wheels.frontLeft.worldPosition,
      frontRight: this.snapshot.wheels.frontRight.worldPosition,
      rearLeft: this.snapshot.wheels.rearLeft.worldPosition,
      rearRight: this.snapshot.wheels.rearRight.worldPosition,
    });
    // Physics uses positive=right. Three's local Y/Z rotations are positive
    // counter-clockwise from the driver's view, hence the visual sign change.
    this.vehicleVisual.setFrontWheelSteeringAngles(
      -this.snapshot.leftRoadWheelAngle,
      -this.snapshot.rightRoadWheelAngle,
    );
    this.vehicleVisual.setSteeringWheelAngle(-this.snapshot.steeringWheelAngle);
    this.vehicleVisual.setWheelRotationAngles({
      frontLeft: this.snapshot.wheels.frontLeft.rotationAngle,
      frontRight: this.snapshot.wheels.frontRight.rotationAngle,
      rearLeft: this.snapshot.wheels.rearLeft.rotationAngle,
      rearRight: this.snapshot.wheels.rearRight.rotationAngle,
    });
    const parkingPose = {
      x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw,
      y: roadHeight, width: this.vehicleVisual.config.dimensions.width, length: this.vehicleVisual.config.dimensions.length,
    };
    this.navigation.update(dt,parkingPose,this.snapshot.speed);
    if(this.sharedVehicleData)this.sharedVehicleData.navigation.route=this.navigation.state.status==='preview'?null:this.navigation.state.route?.points??null;
    this.sharedVehicleData?.update(dt, parkingPose, this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.speed,
      this.electricDisplay ? true : this.ignitionOn, this.ground.roadNetwork, this.queryDisplayColliders);
    if (!this.sharedVehicleData) this.rearParking.update(parkingPose, !this.electricDisplay && (this.snapshot.gear === 'R' || this.snapshot.transmission.selectedMode === 'R'), this.ground.colliders);
    else if (this.electricDisplay) this.rearParking.update(parkingPose,false,[]);
    this.electricDisplay?.update(dt, parkingPose, this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.speed,
      this.ground.roadNetwork, this.queryDisplayColliders);
    this.drivingSceneDisplay?.update(dt, parkingPose, this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.speed,
      this.ignitionOn, this.ground.roadNetwork, this.queryDisplayColliders);
    this.executiveDisplay?.update(dt, parkingPose, this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.driveMode ?? 'NORMAL',
    this.cruiseControl.status.active, this.cruiseControl.status.targetSpeedKmh,
    this.snapshot.fuel!, this.ground.roadNetwork, this.ground.colliders, this.ignitionOn, this.snapshot.trip, this.rearParking.state);
    const assistState = this.lateralAssist.display, capabilities = this.dynamics.capabilities;
    this.hud.settings.setLateralAssistance(capabilities.lka, capabilities.lcc, assistState.lkaState, assistState.lccState, this.lateralAssist.lccRequested,
      LANE_ASSIST_LABELS[this.laneAssistSelection.state.mode]);
    this.lateralDebug?.update(dt, this.sharedVehicleData?.laneObservation ?? this.emptyLane, this.lateralAssist, roadHeight);
    if (this.settingsOpen) {
      this.hud.settings.setTrip(this.snapshot.trip);
      this.hud.settings.setStartStop(this.dynamics.capabilities.startStop, this.snapshot.startStop?.enabled ?? false,
        this.snapshot.startStop?.state ?? 'DISABLED');
    }
    this.sharedVehicleData?.publishTPMS(this.snapshot.tpmsState);
    this.vehicleVisual.updateInstruments({
      speedKmh: Math.abs(this.snapshot.speed) * 3.6,
      rpm: this.snapshot.rpm ?? 0,
      ev: this.snapshot.powertrain.ev,
      driveAvailable: this.snapshot.driveAvailable,
      gear: this.snapshot.transmission.type !== 'MANUAL'
        ? this.snapshot.transmission.selectedMode === 'D' && this.snapshot.transmission.currentPhysicalGear !== null ? `D${this.snapshot.transmission.currentPhysicalGear}` : this.snapshot.transmission.selectedMode ?? 'N'
        : this.snapshot.gear ?? 'N',
      engineRunning: this.snapshot.engineRunning,
      driveMode: this.snapshot.driveMode,
      startStopState: this.snapshot.startStop,
      cruiseTargetSpeedKmh: this.cruiseControl.status.targetSpeedKmh ?? undefined,
      fuelLevel: this.drivingSceneDisplay ? (this.snapshot.fuel?.fuelPercent ?? this.fuelLevel * 100) / 100
        : this.executiveDisplay ? (this.snapshot.fuel?.fuelPercent ?? 0) / 100 : this.fuelLevel,
      ignitionOn: this.ignitionOn,
      executive: this.executiveDisplay?.data,
      electricDisplay: this.electricDisplay?.data,
      tyres: this.sharedVehicleData?.tyres,
      tpmsState: this.snapshot.tpmsState,
      sharedVehicle: this.sharedVehicleData ?? undefined,
      trip: this.snapshot.trip,
      assistCapabilities: this.dynamics.capabilities,
      chassisStatus: this.snapshot.powertrain.ev ? { rideHeight: this.dynamics.config.suspension.rideHeight + this.snapshot.chassis.rideOffset,
        targetHeight: this.dynamics.suspension.rideHeightTarget, nominalHeight: this.dynamics.config.suspension.rideHeight,
        dampingMode: this.snapshot.driveMode ?? 'NORMAL',
        electricSoundPresence: this.dynamics.powertrain instanceof ElectricPowertrain ? this.dynamics.powertrain.config.audioPresence ?? 1 : 1 } : undefined,
      drivingScene: this.drivingSceneDisplay?.data,
      laneAssist: this.laneAssistSelection.state,
      ambientDaylight: this.ambientDaylight,
      coolantTemperatureC: this.coolantTemperatureC,
      handbrake: this.snapshot.handbrake,
      upshiftRecommended: this.snapshot.upshiftRecommended,
      indicators: {
        positionLights: this.lightController.state.positionLight,
        headlights: this.lightController.state.lowBeam,
        highBeam: this.lightController.state.effectiveHighBeam,
        fogLights: this.lightController.state.fogLightsEnabled,
        frontFogLights: this.lightController.state.frontFogLightsEnabled,
        rearFogLights: this.lightController.state.rearFogLightsEnabled,
        leftTurn: this.lightController.state.leftBlinkOn,
        rightTurn: this.lightController.state.rightBlinkOn,
        parkingBrake: this.snapshot.parkingBrake.engaged || this.snapshot.parkingBrake.applying,
        autoHold: this.snapshot.autoHold.holding,
        escActive: this.electricDisplay ? this.snapshot.driverAssists.escActive : undefined,
        engineWarning: this.snapshot.powertrain.kind === 'ICE' && !this.snapshot.engineRunning && this.snapshot.startStop?.state !== 'AUTO_STOPPED' && this.snapshot.startStop?.state !== 'RESTARTING',
        batteryWarning: this.snapshot.powertrain.ev ? this.snapshot.powertrain.ev.stateOfCharge <= .08 : !this.snapshot.engineRunning && this.snapshot.startStop?.state !== 'AUTO_STOPPED' && this.snapshot.startStop?.state !== 'RESTARTING',
        cruise: this.cruiseControl.status.active,
        upshift: this.snapshot.upshiftRecommended,
        absWarning: this.snapshot.driverAssists.absWarning || this.snapshot.driverAssists.absLamp,
        tcsActive: this.snapshot.driverAssists.skidLamp,
        tcsOff: this.snapshot.driverAssists.tcsOff,
        escOff: this.snapshot.driverAssists.escOff,
      },
    }, dt);
    this.vehicleVisual.setWheelAlignment(this.snapshot.wheels);
    if (this.interactionDefinition !== null) {
      applyVehicleInteractionVisual(
        this.interactionDefinition,
        this.vehicleInteraction.driverDoorOpenFraction,
        this.vehicleInteraction.driverWindowOpenFraction,
      );
    }
    this.vehicleVisual.root.updateMatrixWorld(true);
  }

  private readonly queryDisplayColliders = (pose: { x: number; z: number }, radius: number) =>
    this.contacts.collisionSystem.getNearbyColliders(pose, radius);

  private configureVehicleDisplays(): void {
    const descriptor = getVehicleDescriptor(this.activeVehicleId);
    const settings = this.hud.settings;
    this.driverAdaptive.selectVehicle(this.activeVehicleId);
    this.driverAdaptive.resetTransient();
    this.driverAdaptive.setEnabled(settings.adaptiveLearningPreference);
    this.dynamics.vehicleControl.adaptive = this.driverAdaptive;
    this.dynamics.setDriverAssistOptions(settings.driverAssistOptions);
    this.dynamics.setAutoHoldEnabled(settings.autoHoldPreference ?? this.dynamics.config.autoHold?.enabledByDefault ?? false);
    this.dynamics.setStartStopEnabled(settings.startStopPreference);
    try { this.dynamics.tripComputer.restore(JSON.parse(localStorage.getItem(`drivergame.trip.${this.activeVehicleId}.v1`) ?? 'null')); } catch { /* Optional storage. */ }
    this.snapshot = this.dynamics.getSnapshot();
    this.cruiseControl.configure(this.dynamics.config.cruiseControl);
    this.lateralAssist.configure(this.dynamics.config.lateralAssist, this.dynamics.config.steering, this.dynamics.config.wheelBase);
    this.configureLaneAssistModes();
    if (descriptor.capabilities.lka && settings.lkaPreference) this.laneAssistSelection.setMode(LaneAssistMode.KEEP_ASSIST);
    this.laneAssistSelection.applyTo(this.lateralAssist);
    settings.setAssistanceSupport(descriptor.capabilities);
    settings.setStartStop(descriptor.capabilities.startStop, this.snapshot.startStop?.enabled ?? false, this.snapshot.startStop?.state ?? 'DISABLED');
    settings.setTrip(this.snapshot.trip);
    this.engineAudio.configure(descriptor.audioProfile);
    this.combustionAudioLoad = descriptor.audioProfile?.loadSource === 'combustion-and-transmission';
    this.hud.settings.setAutoHold(descriptor.capabilities.autoHold, this.snapshot.autoHold.enabled);
    const executive = descriptor.visualConfig.instrumentCluster.displayStyle === 'executive-virtual' || descriptor.visualConfig.instrumentCluster.displayStyle === 'suv-virtual';
    this.electricDisplay?.dispose();
    this.drivingSceneDisplay?.dispose();
    this.sharedVehicleData?.dispose();
    const features = descriptor.capabilities;
    const electric = descriptor.visualConfig.instrumentCluster.displayStyle === 'ev-center';
    this.sharedVehicleData = new SharedVehicleData({ lanes: features.laneDisplay,
      navigation: true, proximity: features.parkingRadar || features.parking360, tpms: features.tpms,
      parkingMode: electric || descriptor.visualConfig.instrumentCluster.displayStyle === 'ev-premium' ? 'selector' : 'low-speed' });
    this.sharedVehicleData.navigation.guidance=this.navigation.state;
    this.sharedVehicleData.navigation.map.navigationState=this.navigation.state;
    this.hud.setNavigationMap(this.navigation.planner?this.sharedVehicleData.navigation.map:undefined);
    if (this.sharedVehicleData) {
      this.sharedVehicleData.lateralAssist = this.lateralAssist.display;
      this.sharedVehicleData.publishTPMS(this.snapshot.tpmsState);
    }
    this.executiveDisplay = executive ? new ExecutiveDisplayContext(this.snapshot.fuel!, this.sharedVehicleData ?? undefined,features.navigation) : null;
    this.electricDisplay = electric ? new ElectricDisplayContext(this.sharedVehicleData ?? undefined) : null;
    this.drivingSceneDisplay = descriptor.visualConfig.drivingSceneDisplay
      ? new DrivingSceneDisplayContext(descriptor.visualConfig.drivingSceneDisplay, this.sharedVehicleData ?? undefined) : null;
    this.parkingCamera = descriptor.capabilities.parkingCamera ? new ParkingCamera(this.renderer, this.scene, this.vehicleVisual, descriptor.capabilities.surroundView) : null;
  }

  private restartBlackBox(reason: string): void {
    this.blackBoxExportError = undefined;
    const old = this.blackBox;
    if (old?.highDetail) old.freezeInterrupted(reason);
    if (old?.status === 'FROZEN') this.scheduleBlackBoxExport(old);
    this.dynamics.chassisMotion.diagnosticObserver = undefined;
    this.dynamics.chassisMotion.safetyObserver = undefined;
    this.dynamics.diagnosticRecoveryObserver = undefined;
    const descriptor = getVehicleDescriptor(this.activeVehicleId);
    // Only on enable/context change, never in the physics loop. Captures local config edits too.
    const config = JSON.stringify(this.dynamics.config);
    let hash = 2166136261;
    for (let i = 0; i < config.length; i++) hash = Math.imul(hash ^ config.charCodeAt(i), 16777619);
    this.blackBox = new VehiclePhysicsBlackBox({ mapId: this.ground.metadata.id,
      mapName: this.ground.metadata.displayName, mapVersion: this.ground.metadata.version,
      mapContentVersion: this.activeGroundId === 'city-main' && typeof __CITY_MAIN_RUNTIME_URL__ !== 'undefined'
        ? __CITY_MAIN_RUNTIME_URL__ : null,
      vehicleId: this.activeVehicleId, vehicleConfigVersion: descriptor.version,
      vehicleConfigHash: `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`,
      buildVersion: typeof __DRIVERGAME_BUILD_VERSION__ === 'undefined' ? 'development' : __DRIVERGAME_BUILD_VERSION__ });
    this.blackBox.arm(); this.contacts.blackBox = this.blackBox;
  }

  private updateBlackBoxUI(): void {
    const recorder = this.blackBox;
    if (recorder?.status === 'FROZEN' && this.blackBoxExportError !== recorder) this.scheduleBlackBoxExport(recorder);
    const status = recorder && recorder === this.blackBoxExportError ? 'ERROR' : recorder?.status ?? 'OFF';
    if (status === this.blackBoxStatus) return;
    this.blackBoxStatus = status; this.hud.settings.setBlackBoxStatus(status);
  }

  private scheduleBlackBoxExport(recorder: VehiclePhysicsBlackBox): void {
    if (this.blackBoxExportTasks.has(recorder)) return;
    // A later browser task; never serialize from ContactSystem.step or its observers.
    const timer = setTimeout(() => {
      this.blackBoxExportTasks.delete(recorder);
      try {
        const json = JSON.stringify(recorder.createExport(), (_key, value: unknown) =>
          typeof value === 'number' && !Number.isFinite(value) ? String(value) : value, 2);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = blackBoxFilename(); document.body.appendChild(anchor);
        try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
        recorder.markSaved();
        if (this.blackBoxExportError === recorder) this.blackBoxExportError = undefined;
        if (this.blackBox === recorder) this.hud.showMessage('车辆物理黑匣子已保存 · 已继续缓存', 3);
      } catch {
        this.blackBoxExportError = recorder;
        this.hud.showMessage('黑匣子导出失败 · 记录仍保留，可点击保存按钮重试', 5);
      }
      this.updateBlackBoxUI();
    }, 0);
    this.blackBoxExportTasks.set(recorder, timer);
  }

  private configureVehicleSettings(): void {
    const settings = this.hud.settings;
    settings.onBlackBoxChange = enabled => {
      if (enabled) this.restartBlackBox('enabled');
      else {
        this.contacts.blackBox = undefined;
        this.dynamics.chassisMotion.diagnosticObserver = undefined;
        this.dynamics.chassisMotion.safetyObserver = undefined;
        this.dynamics.diagnosticRecoveryObserver = undefined;
        const timer = this.blackBox && this.blackBoxExportTasks.get(this.blackBox);
        if (timer !== undefined) clearTimeout(timer);
        if (this.blackBox) this.blackBoxExportTasks.delete(this.blackBox);
        this.blackBox?.disable(); this.blackBox = undefined; this.blackBoxExportError = undefined;
      }
      this.updateBlackBoxUI();
    };
    settings.onBlackBoxSave = () => {
      if (this.blackBox?.status === 'FROZEN') {
        this.blackBoxExportError = undefined; this.scheduleBlackBoxExport(this.blackBox);
      } else this.blackBox?.requestManualTrigger();
    };
    this.hud.onImmersiveModeChange = enabled => {
      if (!enabled) return;
      if (this.contactDebug.root.visible) this.contactDebug.toggle();
      if (this.visualDebug.enabled) this.visualDebug.toggle();
      this.mirrorGeometryDebug.setVisible(false);
      this.lateralDebug?.setEnabled(false);
    };
    settings.onTrajectoryPredictionChange = enabled => {
      if (enabled && !this.trajectoryPrediction) this.trajectoryPrediction = new TrajectoryPrediction(this.scene);
      if (!enabled) { this.trajectoryPrediction?.dispose(); this.trajectoryPrediction = null; }
    };
    settings.onAccelerationTestChange = enabled => {
      if (!enabled) {
        this.accelerationTestView?.dispose(); this.accelerationTestView = null; this.accelerationTest = null; this.accelerationDiagnostics = null;
        return;
      }
      if (this.accelerationTest) return;
      const test = this.accelerationTest = new AccelerationTest();
      let storage: Storage | undefined;
      try { storage = localStorage; } catch { /* Optional browser storage. */ }
      const diagnostics = this.accelerationDiagnostics = new AccelerationRunDiagnostics(storage, () => this.input.gamepad?.getThrottleDiagnostics());
      const view = this.accelerationTestView = new AccelerationTestView(this.host);
      const arm = (target = test.state.target): void => {
        if (!test.arm(this.snapshot, this.input.peekState().throttle, target)) return;
        const descriptor = getVehicleDescriptor(this.activeVehicleId);
        diagnostics.arm({ vehicleId: this.activeVehicleId, vehicleVersion: descriptor.version,
          groundId: this.ground.metadata.id, groundVersion: this.ground.metadata.version,
          weather: this.environment.weather, wetness: this.environment.wetness }, test.state);
        view.setContext(descriptor.displayName, this.ground.metadata.displayName);
      };
      view.onExport = () => diagnostics.serialize();
      view.setContext(getVehicleDescriptor(this.activeVehicleId).displayName, this.ground.metadata.displayName);
      arm();
      view.onArm = () => { arm(); this.renderer.domElement.focus(); };
      view.onTargetChange = target => {
        arm(target); this.renderer.domElement.focus();
      };
      view.onStop = () => { test.stop(); this.renderer.domElement.focus(); };
    };
    settings.onLateralPreferencesChange = () => this.configureLaneAssistModes();
    settings.onLCCToggle = () => this.toggleLaneCentering();
    settings.setFuel(this.snapshot.fuel);
    settings.setBattery(this.snapshot.powertrain.ev);
    settings.onStateOfChargeChange = soc => {
      this.accelerationTest?.interrupt('训练电量已修改');
      if (this.dynamics.powertrain instanceof ElectricPowertrain) this.dynamics.powertrain.setStateOfCharge(soc);
      this.snapshot = this.dynamics.getSnapshot(); settings.setBattery(this.snapshot.powertrain.ev); this.storeCurrentFuel();
    };
    settings.onFuelChange = litres => {
      this.accelerationTest?.interrupt('训练油量已修改');
      this.dynamics.setCurrentFuelL(litres);
      this.snapshot = this.dynamics.getSnapshot();
      settings.setFuel(this.snapshot.fuel);
    settings.setBattery(this.snapshot.powertrain.ev);
      this.storeCurrentFuel();
    };
    try {
      const stored = JSON.parse(localStorage.getItem('drivergame.environment.v1') ?? '{}');
      // Initial preference snaps to its preset equilibrium; live switching uses transitions.
      const storedWeather = stored.weather === 'LIGHT_RAIN' ? 'DRIZZLE' : stored.weather;
      if (WEATHER_SEQUENCE.includes(storedWeather as Weather)) this.environment.setWeather(storedWeather as Weather, 0);
      if (['DAY', 'DUSK', 'NIGHT'].includes(stored.time)) this.environment.setTime(stored.time as EnvironmentTime);
    } catch { /* Optional preferences must not prevent driving. */ }
    const applyEnvironment = () => {
      this.contacts.setWetness(this.environment.wetness);
      this.contacts.setRoadGripMultiplier(this.environment.roadGripMultiplier);
      this.environmentVisual.applyState();
      settings.setEnvironment(this.environment.weather, this.environment.time);
      this.persistEnvironment();
    };
    applyEnvironment();
    settings.onWeatherChange = weather => this.setWeather(weather);
    settings.onTimeChange = time => {
      this.environment.setTime(time);
      applyEnvironment();
      this.hud.showMessage(`环境时间 · ${{ DAY: '白天', DUSK: '黄昏', NIGHT: '夜间' }[time]}`, 1.6);
    };
    settings.onWiperModeChange = mode => { this.wiperController.setMode(mode); settings.setWiperMode(mode); };
    this.dynamics.setDriverAssistOptions(settings.driverAssistOptions);
    settings.onDriverAssistsChange = options => this.dynamics.setDriverAssistOptions(options);
    settings.onAdaptiveLearningChange = enabled => this.driverAdaptive.setEnabled(enabled);
    settings.onDriverProfileReset = () => {
      this.driverAdaptive.resetProfile();
      this.hud.showMessage('已重置当前车型驾驶习惯 · 自适应开关保持不变', 2);
    };
    settings.onAutoHoldChange = enabled => {
      this.dynamics.setAutoHoldEnabled(enabled);
      this.snapshot = this.dynamics.getSnapshot();
      settings.setAutoHold(this.dynamics.capabilities.autoHold, this.snapshot.autoHold.enabled);
    };
    settings.onStartStopChange = enabled => {
      this.dynamics.setStartStopEnabled(enabled); this.snapshot = this.dynamics.getSnapshot();
      settings.setStartStop(this.dynamics.capabilities.startStop, this.snapshot.startStop?.enabled ?? false, this.snapshot.startStop?.state ?? 'DISABLED');
    };
    settings.onTripReset = trip => {
      if (trip === 'A') this.dynamics.tripComputer.resetTripA(); else this.dynamics.tripComputer.resetTripB();
      this.snapshot = this.dynamics.getSnapshot(); settings.setTrip(this.snapshot.trip); this.storeCurrentFuel();
    };
    const storedLightMode = this.readStoredLightMode();
    this.lightController.setMainLightMode(storedLightMode);
    this.vehicleLighting.applyState(this.lightController.state);
    settings.setLightMode(storedLightMode);
    settings.setMirrorSide(this.selectedMirror);
    settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
    const keyboard = this.input.keyboard;
    if (keyboard !== null) settings.setBindings(keyboard.getBindings());

    settings.onVisibilityChange = (visible) => {
      this.settingsOpen = visible;
      if (visible) this.accelerationTest?.interrupt('打开设置', false);
      if (visible) this.lapTimer.suspend(this.snapshot);
      this.input.setEnabled(this.gameStarted && (!visible || this.snapshot.transmission.type !== 'MANUAL'));
      if (visible) this.haptics.setEnabled(false);
      if (visible) {
        settings.setFuel(this.snapshot.fuel);
    settings.setBattery(this.snapshot.powertrain.ev);
        this.cruiseControl.reset();
        this.laneAssistSelection.cancelCentering();
        this.lateralAssist.reset(); this.sharedVehicleData?.resetLanes();
        this.showMirrorPreview(this.selectedMirror);
        settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
      } else {
        this.showMirrorPreview('right');
        this.renderer.domElement.focus();
      }
    };
    settings.onLightModeChange = (mode) => this.setLightMode(mode);
    settings.setFogLights(this.lightController.state.fogMode);
    settings.onFogToggle = () => {
      const lights = this.lightController.toggleFog();
      this.vehicleLighting.applyState(lights);
      settings.setLightMode(lights.mainLightMode);
      settings.setFogLights(lights.fogMode);
      this.storeLightMode(lights.mainLightMode);
    };
    settings.onVibrationChange = (enabled) => this.haptics.setEnabled(enabled && this.gameStarted && !this.settingsOpen);
    settings.onDriveSelectorChange = (mode) => {
      if (this.snapshot.transmission.type === 'MANUAL') return;
      this.dynamics.requestDriveSelector(mode, this.input.peekState().brake);
      this.snapshot = this.dynamics.getSnapshot();
      settings.setDriveSelector(this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.transmission.type);
      this.hud.showMessage(this.snapshot.transmission.selectorRejectedReason === 'brake-required'
        ? '挡位选择被拒绝 · 请踩住刹车'
        : this.snapshot.transmission.selectorRejectedReason ? '挡位选择被拒绝 · 请先将车辆停稳' : `自动挡选择 ${mode}`, 1.7);
    };
    settings.onMirrorSideChange = (side) => {
      this.selectedMirror = side;
      settings.setMirrorAdjustment(this.mirrorAdjustment.get(side));
      this.showMirrorPreview(side);
    };
    settings.onMirrorNudge = (side, yawDegrees, pitchDegrees) => {
      const adjustment = this.mirrorAdjustment.nudge(
        side,
        MathUtils.degToRad(yawDegrees),
        MathUtils.degToRad(pitchDegrees),
      );
      settings.setMirrorAdjustment(adjustment);
    };
    settings.onMirrorReset = (side) => {
      this.mirrorAdjustment.reset(side);
      settings.setMirrorAdjustment(this.mirrorAdjustment.get(side));
      this.hud.showMessage(`${side === 'left' ? '左' : '右'}后视镜已复位`);
    };
    settings.onBindingChange = (action, code) => {
      keyboard?.setBinding(action, code);
      if (keyboard !== null) settings.setBindings(keyboard.getBindings());
      this.hud.showMessage('键位已保存');
    };
    settings.onBindingReset = () => {
      keyboard?.resetBindings();
      if (keyboard !== null) settings.setBindings(keyboard.getBindings());
      this.hud.showMessage('键位已恢复默认');
    };
    settings.onNotice = (message) => this.hud.showMessage(message, 2.4);
  }

  private configureGroundSelection(): void {
    this.hud.setMapOptions(
      DRIVING_GROUND_CATALOG.map((ground) => ({
        id: ground.id,
        label: ground.displayName,
        description: ground.description,
      })),
      this.activeGroundId,
    );
    this.hud.onMapChange = (groundId) => {
      if (!isDrivingGroundId(groundId)) return;
      void this.switchGround(groundId);
    };
  }

  private groundLoadRequest = 0;
  private async switchGround(groundId: DrivingGroundId): Promise<void> {
    const request = ++this.groundLoadRequest;
    if (groundId === this.activeGroundId) return;
    this.hud.showMessage('正在加载地图资源', 10);
    let nextGround: DrivingGround;
    try {
      const timing = await prepareDrivingGround(groundId);
      if (request !== this.groundLoadRequest || !this.running) return;
      nextGround = createDrivingGround(groundId, timing);
    } catch (error) {
      if (request === this.groundLoadRequest) this.hud.showMessage(`地图加载失败：${String(error)}`, 10);
      return;
    }
    const previousGround = this.ground;
    this.scene.remove(previousGround.root);
    this.ground = nextGround;
    this.groundVisualLoading = true; this.groundVisualErrorReported = false;
    this.prepareGroundVisuals(nextGround);
    this.hud.setRoadNetwork(nextGround.roadNetwork);
    this.contacts.setGround(nextGround);
    this.activeGroundId = groundId;
    this.hud.resetNavigationMap();
    this.navigation.configure(DRIVING_GROUND_CATALOG.find(g=>g.id===groundId)?.navigation?nextGround.roadNetwork:undefined);
    this.hud.setNavigationMap(this.navigation.planner?this.sharedVehicleData?.navigation.map:undefined);
    this.scene.add(nextGround.root);
    this.environmentVisual.setGround(nextGround);
    previousGround.dispose();

    this.resetVehicleToGroundStart();
    this.lapTimer.configure(nextGround.lapCourse, this.activeVehicleId, this.snapshot);
    this.hud.setActiveMap(groundId);
    this.storeGroundId(groundId);
    this.hud.showMessage(`${nextGround.metadata.displayName}已载入 · 车辆回到起点`, 2.5);
    this.renderer.domElement.focus();
  }

  private resetVehicleToGroundStart(): void {
    if (this.blackBox) this.restartBlackBox('vehicle/map reset');
    this.accelerationTest?.interrupt('车辆已重置');
    this.laneAssistSelection.reset();
    this.laneDepartureWarning.reset();
    this.contacts.reset();
    this.cruiseControl.reset();
    this.lateralAssist.reset(); this.sharedVehicleData?.resetLanes();
    this.vehicleInteraction.reset();
    this.playerMode.reset('Driving');
    this.walker.reset();
    this.nearDriverEntry = false;
    const spawn = this.ground.spawnPose;
    const controlMode = this.input.controlMode;
    const engineRunning = this.snapshot.engineRunning;
    const clutchEngagement = controlMode === 'manual-clutch'
      ? 1 - this.input.manualClutchPedal
      : 0;
    this.snapshot = this.dynamics.reset({
      x: spawn.position.x,
      z: spawn.position.z,
      yaw: spawn.yawRadians,
      gear: 'N',
      controlMode,
      clutchEngagement,
      engineRunning,
      vehicleOperational: this.snapshot.vehicleOperational,
      engineRPM: engineRunning ? this.dynamics.engine?.config.idleRPM : undefined,
    });
    this.snapshot = this.contacts.synchronize(this.dynamics);
    this.feedback.reset(this.snapshot);
    this.haptics.stop();
    this.lapTimer.reset(this.snapshot);
    this.lightController.update(0, createNeutralVehicleInputState(), {
      autoOffWithIgnition: this.vehicleVisual.config.exteriorLighting?.autoOffWithIgnition,
      ignitionOn: this.ignitionOn, actualGear: this.snapshot.transmission.selectedMode === 'R' ? 'R' : this.snapshot.gear ?? 'N',
      steeringWheelAngle: this.snapshot.steeringWheelAngle,
    });
    this.lastEngineRunning = this.snapshot.engineRunning ?? false;
    this.lastShiftEventSequence = this.snapshot.shiftEventSequence;
    this.lastHandbrakeApplied = this.snapshot.handbrake > 0.05;
    this.lastParkingBrakeState = this.snapshot.parkingBrake.state;
    this.lastEmergencyBraking = this.snapshot.parkingBrake.emergencyBraking;
    this.latestRoadRoughness = 0.08;
    this.accumulator = 0;
    this.driverCamera.resetHeadLook(true);
    this.updateVehicleVisual(0);
    this.driverCamera.update(this.vehicleVisual.root, 0);
    if (this.visualDebug.enabled) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
  }

  private prepareGroundVisuals(ground: DrivingGround): void {
    ground.setVisualResourcePreparation?.(texture => this.renderer.initTexture(texture),
      root => this.renderer.compileAsync(root, this.driverCamera.camera, this.scene));
    ground.setVisualObserver?.((root, added) => {
      if (ground !== this.ground) return;
      if (added) this.environmentVisual.addVisualRoot(root); else this.environmentVisual.removeVisualRoot(root);
    });
  }

  private updateGroundVisuals(speed: number): void {
    if (this.ground.updatePlayerPosition?.(this.snapshot.x, this.snapshot.z, this.snapshot.yaw, speed) && !this.ground.setVisualObserver)
      this.environmentVisual.setGround(this.ground);
  }

  private updateWorldVisibility(): void {
    if (!this.ground.updateVisualVisibility) return;
    const cameras = this.worldViewCameras; cameras.length = 0;
    cameras.push(this.driverCamera.camera);
    // Update off-axis projections before culling, including a newly turned head.
    this.mirrors.update();
    for (const side of ['left', 'right'] as const) {
      const view = this.mirrors.getView(side);
      if (view.enabled && view.valid) cameras.push(view.camera);
    }
    if (this.mirrors.interiorMirror?.update()) cameras.push(this.mirrors.interiorMirror.camera);
    this.ground.updateVisualVisibility(this.driverCamera.camera.position,
      this.visualDebug.renderCamera === null && this.scene.fog instanceof Fog ? this.scene.fog.far : Infinity, cameras);
  }

  private configureVehicleSelection(): void {
    this.hud.setVehicleOptions(
      VEHICLE_CATALOG.map((vehicle) => ({
        id: vehicle.id,
        label: vehicle.displayName,
        description: vehicle.description,
      })),
      this.activeVehicleId,
    );
    this.hud.onVehicleChange = (vehicleId) => {
      if (!isVehicleId(vehicleId)) return;
      this.switchVehicle(vehicleId);
    };
  }

  private switchVehicle(vehicleId: VehicleId): void {
    if (vehicleId === this.activeVehicleId || !this.vehicleLoading.ready) return;
    this.accelerationTest?.interrupt('切换车辆');
    const config = getVehicleDescriptor(vehicleId).visualConfig;
    this.vehicleLoading.mark('Static asset prepare');
    this.vehicleLoading.enqueue('Static asset prepare', () => VehicleVisual.prepareAssets(config, this.vehicleAssets));
    this.vehicleLoading.enqueue('Instance creation', () => { this.pendingVehicleVisual = new VehicleVisual(config, this.vehicleAssets); });
    this.vehicleLoading.enqueue('Dynamic state init', () => {
      const visual = this.pendingVehicleVisual!;
      this.installVehicle(vehicleId, visual); this.pendingVehicleVisual = null;
      this.queueVehicleWarmup();
    });
  }

  private installVehicle(vehicleId: VehicleId, nextVisual: VehicleVisual): void {
    if (vehicleId === this.activeVehicleId) return;
    this.playerMode.reset('Driving');
    this.vehicleInteraction.reset();
    this.walker.reset();
    this.laneAssistSelection.reset();
    this.laneDepartureWarning.reset();
    this.storeCurrentFuel();
    this.cruiseControl.reset();
    this.lateralAssist.reset(); this.sharedVehicleData?.resetLanes();
    const descriptor = getVehicleDescriptor(vehicleId);
    const spawn = this.ground.spawnPose;
    const controlMode = this.input.controlMode;
    const clutchEngagement = controlMode === 'manual-clutch'
      ? 1 - this.input.manualClutchPedal
      : 0;
    const nextPhysicsConfig = createVehiclePhysicsConfig(vehicleId);
    const engineRunning = 'engine' in nextPhysicsConfig && nextPhysicsConfig.engine.ignitionSequence === undefined && this.snapshot.vehicleOperational;
    const nextDynamics = new VehicleDynamics<Powertrain>(nextPhysicsConfig, {
      currentFuelL: this.readStoredFuelL(vehicleId),
      x: spawn.position.x,
      z: spawn.position.z,
      yaw: spawn.yawRadians,
      gear: 'N',
      controlMode,
      clutchEngagement,
      engineRunning,
      engineRPM: 'engine' in nextPhysicsConfig && engineRunning ? nextPhysicsConfig.engine.idleRPM : undefined,
      stateOfCharge: this.readStoredSOC(vehicleId),
    });

    const retainedLightMode = this.lightController.state.mainLightMode;
    this.parkingCamera?.dispose();
    this.mirrors.dispose();
    this.windshieldRain.dispose();
    this.vehicleLighting.dispose();
    this.scene.remove(this.vehicleVisual.root);
    this.vehicleVisual.dispose();

    this.vehicleVisual = nextVisual;
    this.configureVehicleInteraction(nextVisual, descriptor.audioProfile);
    this.vehicleLighting = new VehicleLighting(nextVisual);
    this.windshieldRain = new WindshieldRain(nextVisual);
    this.vehicleLighting.applyState(this.lightController.state);
    this.mirrorAdjustment = this.createMirrorAdjustment(nextVisual);
    this.dynamics = nextDynamics;
    this.dynamics.setDriverAssistOptions(this.hud.settings.driverAssistOptions);
    this.contacts.setCollisionDimensions(descriptor.visualConfig.collisionDimensions);
    this.snapshot = this.contacts.synchronize(nextDynamics);
    this.feedback.setVehicleConfig(nextPhysicsConfig);
    this.feedback.reset(this.snapshot);
    this.haptics.stop();
    this.scene.add(nextVisual.root);
    this.driverCamera
      .setDriverEyePosition(descriptor.visualConfig.driverEyePosition)
      .resetHeadLook(true)
      .update(nextVisual.root, 0);
    this.mirrors = this.createMirrorSystem(nextVisual);
    this.mirrorOverlay.setView(this.mirrors.getView(this.settingsOpen ? this.selectedMirror : 'right'));

    this.activeVehicleId = vehicleId;
    if (this.blackBox) this.restartBlackBox('vehicle changed');
    this.ignitionOn = this.snapshot.vehicleOperational;
    this.configureVehicleDisplays();
    this.lapTimer.configure(this.ground.lapCourse, vehicleId, this.snapshot);
    this.hud.setActiveVehicle(vehicleId);
    this.hud.settings.setLightMode(retainedLightMode);
    this.hud.settings.setFuel(this.snapshot.fuel);
    this.hud.settings.setBattery(this.snapshot.powertrain.ev);
    this.hud.settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
    this.lastShiftEventSequence = this.snapshot.shiftEventSequence;
    this.lastEngineRunning = this.snapshot.engineRunning ?? false;
    this.lastHandbrakeApplied = this.snapshot.handbrake > 0.05;
    this.lastParkingBrakeState = this.snapshot.parkingBrake.state;
    this.lastEmergencyBraking = this.snapshot.parkingBrake.emergencyBraking;
    this.latestRoadRoughness = 0.08;
    this.updateVehicleVisual(0);
    this.storeVehicleId(vehicleId);
    if (this.visualDebug.enabled) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
    this.hud.showMessage(`已切换为${descriptor.displayName} · 车辆回到当前场地起点`, 2.4);
    this.renderer.domElement.focus();
  }

  private queueVehicleWarmup(): void {
    this.vehicleLoading.mark('Visual warmup');
    const textures = new Set<Texture>();
    this.vehicleVisual.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        for (const value of Object.values(material))
          if (value instanceof Texture && !value.isRenderTargetTexture) textures.add(value);
    });
    const pending = [...textures];
    for (let i = 0; i < pending.length; i += 4) {
      const batch = pending.slice(i,i+4);
      this.vehicleLoading.enqueue('Visual warmup', () => { for (const texture of batch) this.renderer.initTexture(texture); });
    }
    this.vehicleLoading.enqueue('Visual warmup', () => this.renderer.compileAsync(this.vehicleVisual.root, this.driverCamera.camera, this.scene));
    if (this.mirrors.getView('left').enabled) this.vehicleLoading.enqueue('Visual warmup', () => this.mirrors.render('left'));
    if (this.mirrors.getView('right').enabled) this.vehicleLoading.enqueue('Visual warmup', () => this.mirrors.render('right'));
    if (this.mirrors.interiorMirror) this.vehicleLoading.enqueue('Visual warmup', () => this.mirrors.interiorMirror?.render());
    this.vehicleLoading.enqueue('Visual warmup', () => {
      this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.driverCamera.camera);
    });
  }

  private createMirrorAdjustment(vehicle: VehicleVisual): MirrorAdjustmentController {
    return new MirrorAdjustmentController({
      left: vehicle.getMirrorSurface('left'),
      right: vehicle.getMirrorSurface('right'),
    });
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

  private readStoredVehicleId(): VehicleId {
    try {
      const stored = localStorage.getItem('drivergame.vehicle-id.v1');
      if (stored !== null && isVehicleId(stored)) return stored;
    } catch {
      // Fall back to the default when storage is disabled.
    }
    return DEFAULT_VEHICLE_ID;
  }

  private static readStoredGroundId(): DrivingGroundId {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('drivergame.ground-id.v1');
    } catch {
      // Fall back to the default when storage is disabled.
    }
    return getInitialDrivingGroundId(stored, location.search);
  }

  private readStoredFuelL(vehicleId: VehicleId): number | undefined {
    try {
      const stored = localStorage.getItem(`drivergame.fuel.${vehicleId}.v1`);
      if (stored !== null && stored.trim() !== '' && Number.isFinite(Number(stored))) return Number(stored);
    } catch { /* Optional preferences must not prevent driving. */ }
    return undefined;
  }

  private readStoredSOC(vehicleId: VehicleId): number | undefined {
    try {
      const stored = localStorage.getItem(`drivergame.soc.${vehicleId}.v1`);
      if (stored !== null && stored.trim() !== '' && Number.isFinite(Number(stored))) return MathUtils.clamp(Number(stored), 0, 1);
    } catch { /* Optional session energy persistence. */ }
    return undefined;
  }

  private readonly storeCurrentFuel = (): void => {
    this.driverAdaptive.persist();
    try {
      localStorage.setItem(`drivergame.trip.${this.activeVehicleId}.v1`, JSON.stringify(this.dynamics.tripComputer.getSnapshot()));
      if (this.dynamics.fuel) localStorage.setItem(`drivergame.fuel.${this.activeVehicleId}.v1`, String(this.dynamics.fuel.currentFuelL));
      if (this.snapshot.powertrain.ev) localStorage.setItem(`drivergame.soc.${this.activeVehicleId}.v1`, String(this.snapshot.powertrain.ev.stateOfCharge));
    } catch { /* The current session still supports fuel edits. */ }
  };

  private storeVehicleId(vehicleId: VehicleId): void {
    try {
      localStorage.setItem('drivergame.vehicle-id.v1', vehicleId);
    } catch {
      // The current session can still switch vehicles without persistence.
    }
  }

  private storeGroundId(groundId: DrivingGroundId): void {
    try {
      localStorage.setItem('drivergame.ground-id.v1', groundId);
    } catch {
      // The current session can still switch grounds without persistence.
    }
  }

  private showMirrorPreview(side: AdjustableMirrorSide): void {
    this.mirrorOverlay.setView(this.mirrors.getView(side));
    this.hud.setMirrorPreviewSide(side);
  }

  private setLightMode(mode: VehicleLightMode): void {
    this.lightController.setMainLightMode(mode);
    this.vehicleLighting.applyState(this.lightController.state);
    this.hud.settings.setLightMode(mode);
    this.hud.settings.setFogLights(this.lightController.state.fogMode);
    this.storeLightMode(mode);
    this.hud.showMessage(this.getLightModeLabel(mode), 1.6);
  }

  private storeLightMode(mode: VehicleLightMode): void {
    try {
      localStorage.setItem('drivergame.light-mode.v1', mode);
    } catch {
      // Lighting remains usable when browser storage is unavailable.
    }
  }

  private persistEnvironment(): void {
    try {
      localStorage.setItem('drivergame.environment.v1', JSON.stringify({
        weather: this.environment.weather, time: this.environment.time,
      }));
    } catch { /* Optional preference. */ }
  }

  /** Day/night owns base daylight; weather only attenuates it for the cabin. */
  private get ambientDaylight(): number {
    const daylight = this.environment.time === 'DAY' ? 1 : this.environment.time === 'DUSK' ? .32 : .025;
    return daylight * this.environment.lightAttenuation;
  }

  private getLightModeLabel(mode: VehicleLightMode): string {
    return { off: '灯光已关闭', position: '示廓灯 / 尾灯', low: '近光灯', high: '远光灯' }[mode];
  }

  private processAccessoryCommands(input: VehicleInputState): void {
    if (input.engineStart) {
      const electric = this.snapshot.powertrain.kind === 'EV';
      const sequenced = electric || this.dynamics.engine?.config.ignitionSequence !== undefined;
      if (!sequenced && !this.snapshot.engineRunning) this.engineAudio.onIgnitionStart();
      const result = this.dynamics.requestEngineToggle();
      if (result === 'started') {
        this.ignitionOn = true;
        if (!sequenced) this.engineAudio.onEngineStart();
      } else if (result === 'stopped') {
        this.ignitionOn = false;
        this.lateralAssist.reset(); this.sharedVehicleData?.resetLanes();
        this.laneAssistSelection.reset();
        if (!sequenced) this.engineAudio.onEngineStop();
      } else {
        this.hud.showMessage(this.snapshot.fuel?.emptyFuel ? '无法启动 · 油箱已空' :
          this.snapshot.transmission.type === 'MANUAL' ? '无法启动 · 请挂空挡或把离合完全踩下' : '无法启动 · 请先选择 P 或 N 挡', 2.4);
      }
      // Deliberate ignition changes must not synthesize the genuine stall edge.
      if (result !== 'start-rejected') {
        this.snapshot = this.dynamics.getSnapshot();
        this.feedback.reset(this.snapshot);
        this.haptics.stop();
      }
    }
  }

  private updateVehicleFeedback(dt: number): void {
    const feedback = this.feedback.update(dt, this.snapshot, this.contacts.collision ?? undefined, {
      drivetrainLashJolt: this.snapshot.drivetrainLash?.joltIntensity,
    });
    for (const pulse of feedback.hapticPulses) this.haptics.pushPulse(pulse);
  }

  private readStoredLightMode(): VehicleLightMode {
    try {
      const mode = localStorage.getItem('drivergame.light-mode.v1');
      if (mode === 'position' || mode === 'low' || mode === 'high') return mode;
    } catch {
      // Use the safe default below.
    }
    return 'off';
  }

  private updateAuxiliaryGauges(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.fuelLevel = Math.max(0, this.fuelLevel - this.snapshot.throttle * dt / 7_200);
    const targetTemperature = 88 + this.snapshot.throttle * 7;
    const blend = 1 - Math.exp(-0.08 * dt);
    this.coolantTemperatureC = MathUtils.lerp(
      this.coolantTemperatureC,
      targetTemperature,
      blend,
    );
  }

  private createRenderer(): WebGLRenderer {
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.domElement.className = 'webgl';
    renderer.domElement.tabIndex = 0;
    // The driver glass uses a belt-plane clip to stay inside the door slot.
    renderer.localClippingEnabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = V.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    return renderer;
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
        topColor: { value: new Color(V.skyTop) },
        horizonColor: { value: new Color(V.skyHorizon) },
        groundColor: { value: new Color(V.skyGround) },
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
    this.skyGeometry = new SphereGeometry(1_900, 28, 16);
    const sky = new Mesh(this.skyGeometry, this.skyMaterial);
    sky.name = 'Atmospheric sky dome';
    sky.frustumCulled = false;
    this.skyDome = sky;
    this.scene.add(sky);
    this.environmentMap = createStaticEnvironmentMap(this.renderer);
    this.scene.environment = this.environmentMap.texture;
    this.scene.environmentIntensity = V.environmentIntensity;
  }

  private updateSun(): void {
    this.skyDome?.position.copy(this.driverCamera.camera.position);
    const { x, z } = this.snapshot;
    const y = this.ground.getRoadHeightAt(x, z);
    this.sun.position.set(x - 95, y + 145, z + 70);
    this.sun.target.position.set(x, y, z - 25);
    this.sun.target.updateMatrixWorld();
  }

  private updateHeadLookFromInput(dt: number, input: VehicleInputState): void {
    if (input.controlMode !== 'normal' || dt <= 0) return;
    if (Math.abs(input.lookX) < 1e-4 && Math.abs(input.lookY) < 1e-4) return;
    this.driverCamera.addHeadLook(
      -input.lookX * GAMEPAD_LOOK_YAW_RATE * dt,
      -input.lookY * GAMEPAD_LOOK_PITCH_RATE * dt,
    );
  }

  private reportInputChanges(input: VehicleInputState): void {
    if (input.source !== this.lastInputSource) {
      this.lastInputSource = input.source;
      const label = input.source === 'gamepad'
        ? '标准手柄已接管'
        : input.source === 'wheel'
          ? '方向盘设备已接管'
          : '键盘已接管';
      this.hud.showMessage(label, 1.8);
    }

    // Manual-clutch mode is a keyboard-only accessory command.
    if (input.controlMode !== this.lastControlMode) {
      this.lastControlMode = input.controlMode;
      this.hud.showMessage(
        input.controlMode === 'manual-clutch'
          ? '手动离合模式 · 右摇杆上下控制踏板位置'
          : '普通模式 · 自动离合已平顺接管',
        2.8,
      );
    }

    const handbrakeApplied = input.handbrake > 0.5;
    if (this.dynamics.capabilities.electronicParkingBrake) return;
    if (handbrakeApplied !== this.lastHandbrakeApplied) {
      this.lastHandbrakeApplied = handbrakeApplied;
      this.hud.showMessage(
        handbrakeApplied ? '驻车制动已拉起' : '驻车制动已释放',
        1.6,
      );
    }
  }

  private reportParkingBrakeState(): void {
    if (!this.dynamics.capabilities.electronicParkingBrake) return;
    const parking = this.snapshot.parkingBrake;
    if (parking.emergencyBraking && !this.lastEmergencyBraking) this.hud.showMessage('EPB · 受控紧急制动', 1.6);
    this.lastEmergencyBraking = parking.emergencyBraking;
    if (parking.state === this.lastParkingBrakeState) return;
    this.lastParkingBrakeState = parking.state;
    const messages = { APPLYING: 'EPB · 正在施加', ENGAGED: 'EPB · 已驻车',
      RELEASING: 'EPB · 正在释放', RELEASED: 'EPB · 已释放' };
    this.hud.showMessage(messages[parking.state], 1.6);
  }

  private reportEngineState(): void {
    if (this.snapshot.powertrain.kind === 'EV') return;
    if (this.snapshot.engineRunning === this.lastEngineRunning) return;
    this.lastEngineRunning = this.snapshot.engineRunning ?? false;
    if (this.snapshot.startStop?.state === 'AUTO_STOPPED' || this.snapshot.startStop?.state === 'RESTARTING') {
      this.hud.showMessage(this.snapshot.startStop.state === 'AUTO_STOPPED' ? 'START/STOP · 自动停机，车辆电源保持' : 'START/STOP · 正在重新启动', 1.8);
      return;
    }
    this.hud.showMessage(
      this.snapshot.engineRunning
        ? '发动机已启动'
        : this.snapshot.fuel?.emptyFuel ? '燃油耗尽 · 发动机已熄火'
        : this.snapshot.transmission.type === 'MANUAL'
          ? '发动机已熄火 · 挂空挡或踩下离合后按 I / Start'
          : '发动机已关闭 · 选择 P / N 后按 I / Start 启动',
      this.snapshot.engineRunning ? 1.8 : 3.2,
    );
  }

  private reportCruiseControlEvent(): void {
    const status = this.cruiseControl.status;
    const event = status.lastEvent;
    if (event === null || event.sequence === this.lastCruiseEventSequence) return;
    this.lastCruiseEventSequence = event.sequence;
    if (event.kind === 'activated' && status.targetSpeedKmh !== null) {
      this.hud.showMessage(
        `定速巡航已开启 · ${Math.round(status.targetSpeedKmh)} km/h`,
        2.2,
      );
      return;
    }

    const messageByReason: Partial<Record<typeof event.reason, string>> = {
      'driver-toggle': '定速巡航已关闭',
      'driver-brake': '定速巡航已取消 · 驾驶员制动',
      'parking-brake': '定速巡航已取消 · 驻车制动已启用',
      'manual-clutch': '定速巡航已取消 · 手动离合模式不可用',
      'engine-off': '定速巡航已取消 · 发动机未运行',
      'not-forward-gear': '定速巡航不可用 · 请挂入前进挡',
      'speed-too-low': '定速巡航不可用 · 车速需达到 25 km/h',
      unavailable: '当前车辆不支持定速巡航',
    };
    this.hud.showMessage(messageByReason[event.reason] ?? '定速巡航已取消', 2.2);
  }

  private reportShiftResult(): void {
    if (this.snapshot.shiftEventSequence === this.lastShiftEventSequence) return;
    this.lastShiftEventSequence = this.snapshot.shiftEventSequence;
    if (!this.snapshot.shiftRejected) return;

    const message = this.snapshot.shiftRejectionReason === 'clutch-not-disengaged'
      ? '换挡被拒绝 · 请先把离合踏板充分踩下'
      : this.snapshot.shiftRejectionReason === 'engine-over-speed'
        ? '换挡被拒绝 · 降挡会导致发动机超转'
        : this.snapshot.shiftRejectionReason === 'shift-in-progress'
          ? '换挡被拒绝 · 上一次换挡尚未完成'
          : '换挡被拒绝 · 已经处于该挡位';
    this.hud.showMessage(message, 2.2);
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.storeCurrentFuel);
    window.addEventListener('keydown', this.onGlobalKeyDown);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.storeCurrentFuel);
    window.removeEventListener('keydown', this.onGlobalKeyDown);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onResize = (): void => {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(width, height);
    this.driverCamera.setAspect(width, height);
  };

  private toggleLaneCentering(): void {
    this.laneAssistSelection.toggleCentering();
    this.laneAssistSelection.applyTo(this.lateralAssist);
    this.hud.showMessage(this.lateralAssist.lccRequested ? 'LCC 已请求 · 等待有效车道 / 速度' : 'LCC 未启用', 1.8);
  }

  private configureLaneAssistModes(): void {
    const support = this.dynamics.capabilities, settings = this.hud.settings;
    this.laneAssistSelection.setAvailability(support.lka || support.lcc,
      support.lka && settings.lkaPreference, support.lcc && settings.lccPreference);
    this.laneAssistSelection.applyTo(this.lateralAssist);
  }

  private readonly onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F11' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) this.blackBox?.requestManualTrigger();
      return;
    }
    if(this.hud.isMapOpen)return;
    if (this.hud.immersiveMode && (event.code === 'F6' || event.code === 'F7' || event.code === 'F8' || event.code === 'F9')) {
      event.preventDefault();
      return;
    }
    if (event.code === 'F9' && !event.repeat && this.lateralDebug) { event.preventDefault(); this.lateralDebug.toggle(); }
    if (event.code === 'KeyY' && event.shiftKey && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      const index = WEATHER_SEQUENCE.indexOf(this.environment.weather);
      this.setWeather(WEATHER_SEQUENCE[(index + 1) % WEATHER_SEQUENCE.length]!);
    }
    if (event.code === 'KeyU' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && this.gameStarted && !this.settingsOpen) {
      if (this.executiveDisplay) { event.preventDefault(); this.executiveDisplay.cyclePage(); }
      else if (this.vehicleVisual.cockpitRoot.cycleCenterDisplayPage()) event.preventDefault();
    }
    if (event.code === 'KeyC') {
      if (this.playerMode.mode === 'OnFoot') this.walker.resetLook();
      else this.driverCamera.resetHeadLook();
    }
    if (event.code === 'F7' && !event.repeat) {
      event.preventDefault();
      const shown = this.visualDebug.toggle();
      this.mirrorGeometryDebug.setVisible(shown);
      if (shown) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
      this.hud.showMessage(shown ? '车体 / 镜面几何调试已开启 · F8 外部观察 · F7 关闭' : '视觉调试已关闭');
    }
    if (event.code === 'F8' && !event.repeat) {
      event.preventDefault();
      this.visualDebug.cycleInspectionView();
      if (!this.visualDebug.enabled) this.hud.showMessage('先按 F7 开启视觉调试，再按 F8 切换外部观察角度');
    }
    if (event.code === 'F6' && !event.repeat) {
      event.preventDefault();
      const shown = this.contactDebug.toggle();
      this.hud.showMessage(shown ? '四轮接触 / 碰撞调试已开启 · F6 关闭' : '接触调试已关闭');
    }
    if (event.code === 'F4' && !event.repeat) {
      event.preventDefault();
      this.switchGround(getNextDrivingGroundId(this.activeGroundId));
    }
    if (event.code === 'F5' && !event.repeat) {
      event.preventDefault();
      this.switchVehicle(getNextVehicleId(this.activeVehicleId));
    }
    if (event.code === 'Backspace') {
      event.preventDefault();
      this.resetVehicleToGroundStart();
      this.hud.showMessage(this.snapshot.transmission.type === 'MANUAL' ? '车辆已回到起点 · 当前为空挡' : '车辆已回到起点 · 当前为 P 挡');
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if(this.hud.isMapOpen)return;
    if (event.button !== 0) return;
    if (this.playerMode.mode === 'OnFoot') {
      this.draggingLook = true;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      this.renderer.domElement.setPointerCapture(event.pointerId);
      return;
    }
    if (this.gameStarted && !this.settingsOpen && !this.visualDebug.enabled && this.drivingSceneDisplay) {
      const bounds = this.renderer.domElement.getBoundingClientRect(), ray = new Raycaster();
      ray.layers.enableAll(); ray.setFromCamera(new Vector2(
        (event.clientX-bounds.left)/bounds.width*2-1, 1-(event.clientY-bounds.top)/bounds.height*2), this.driverCamera.camera);
      if (this.vehicleVisual.cockpitRoot.handleDisplayClick(ray)) { event.preventDefault(); return; }
    }
    this.draggingLook = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.draggingLook) return;
    const deltaX = event.clientX - this.pointerX;
    const deltaY = event.clientY - this.pointerY;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    if (this.playerMode.mode === 'OnFoot' && !this.playerMode.transitioning) {
      this.walker.addLook(-deltaX * 0.0026, -deltaY * 0.0022);
      return;
    }
    this.driverCamera.addHeadLook(-deltaX * 0.0026, -deltaY * 0.0022);
  };

  private readonly onPointerUp = (): void => {
    this.draggingLook = false;
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.accelerationTest?.interrupt('离开游戏页面', false);
      this.lapTimer.suspend(this.snapshot);
      this.accumulator = 0;
      this.cruiseControl.reset();
      this.lateralAssist.reset(); this.sharedVehicleData?.resetLanes();
      this.haptics.setEnabled(false);
    } else {
      this.lastFrameTime = performance.now();
    }
  };
}
