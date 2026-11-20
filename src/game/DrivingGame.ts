import {writeRenderLighting} from './render/RenderLightingState';
import {exportDebugOverlays} from './render/RenderDebugOverlays';
import {
Euler,
MathUtils,
PerspectiveCamera,
Quaternion,
Raycaster,
Scene,
Vector2,
Vector3,
WebGLRenderer
} from 'three';
import { EngineAudio } from '../audio/EngineAudio';
import {
  createVehicleAcousticTelemetry,
  populateAcousticTelemetry,
} from '../audio/AcousticTelemetry';
import type { VehicleAcousticProfile } from '../audio/VehicleAcousticProfile';
import type { VehicleAudioProfile } from '../audio/VehicleAudioProfile';
import { evaluateCabinAcoustics,type CabinAcousticState } from '../audio/VehicleCabinAcoustics';
import {
DEFAULT_DRIVER_FOV_DEGREES,
DEFAULT_DRIVER_HEAD_LOOK,
DriverCamera,
MirrorAdjustmentController,
type AdjustableMirrorSide
} from '../camera';
import type { AdaptiveMirrorContext } from '../camera/AdaptiveMirrorRendering';
import { MirrorGeometryDebug } from '../camera/MirrorGeometryDebug';
import { AccelerationRunDiagnostics } from '../experimental/acceleration/AccelerationRunDiagnostics';
import { AccelerationTest, type AccelerationTarget } from '../experimental/acceleration/AccelerationTest';
import { AccelerationTestView } from '../experimental/acceleration/AccelerationTestView';
import { TrajectoryPrediction } from '../experimental/trajectory/TrajectoryPrediction';
import {
VehicleInputSystem,
createNeutralVehicleInputState,
type VehicleControlMode,
type VehicleInputSource,
type VehicleInputState,
} from '../input';
import { GamepadHaptics } from '../input/GamepadHaptics';
import { loadingMark } from '../loading/Loading';
import { platform } from '../platform';
import { OnFootController } from '../player/OnFootController';
import { vehicleControlsForPlayerMode } from '../player/PlayerInput';
import { PlayerModeController,smoothPlayerTransition } from '../player/PlayerModeController';
import { DrivingLabHUD, type DrivingLabModuleId, type DrivingLabModuleStates } from '../ui/DrivingLabHUD';
import { EhsControlPanel } from '../ui/EhsControlPanel';
import { Hud } from '../ui/Hud';
import { HybridControlPanel } from '../ui/HybridControlPanel';
import { GameUIController } from '../ui/controller/GameUIController';
import { GameShell } from '../ui/screens/GameShell';
import type { UIScreen } from '../ui/state/GameUIState';
import { SharedVehicleData } from '../vehicle/SharedVehicleData';
import {
DEFAULT_VEHICLE_ID,
VEHICLE_CATALOG,
createVehiclePhysicsConfig,
getNextVehicleId,
getVehicleDescriptor,
isVehicleId,
type VehicleId,
} from '../vehicle/VehicleCatalog';
import { VehicleLoadingLifecycle } from '../vehicle/VehicleLoadingLifecycle';
import { CruiseControlController } from '../vehicle/control';
import {
  ADASController,
  ScenarioDebugger,
  syncADASLiveVehicleTelemetry,
  type ADASCollisionContactInfo,
  type ADASState,
  type ADASVehicleState,
  type ADASWorldContext,
} from '../vehicle/adas';
import {
  clampHUDHeightLevel,
  VehicleHUDSystem,
  type VehicleHUDFrameInput,
} from '../vehicle/hud';
import { LANE_ASSIST_LABELS,LaneAssistMode,LaneAssistStateController } from '../vehicle/control/LaneAssistState';
import { LaneDepartureWarningController } from '../vehicle/control/LaneDepartureWarningController';
import { LateralAssistController,arbitrateLateralSteering,type LateralAssistContext } from '../vehicle/control/LateralAssistController';
import { RearParkingProximity } from '../vehicle/control/RearParkingProximity';
import { VehicleLightingController } from '../vehicle/control/VehicleLightingController';
import { WiperController } from '../vehicle/control/WiperController';
import { AdaptiveDriverLayer } from '../vehicle/control/adaptive/AdaptiveDriverLayer';
import { DriverProfileStore } from '../vehicle/control/adaptive/DriverProfileStore';
import type { BlackBoxStatus } from '../vehicle/diagnostics/BlackBoxSchema';
import { VehiclePhysicsBlackBox,blackBoxFilename } from '../vehicle/diagnostics/VehiclePhysicsBlackBox';
import { VehicleFeedbackSystem } from '../vehicle/feedback/VehicleFeedbackSystem';
import { VehicleInteractionController } from '../vehicle/interaction/VehicleInteractionController';
import {
applyVehicleInteractionVisual,
type VehicleInteractionDefinition,
} from '../vehicle/interaction/VehicleInteractionDefinition';
import {
VehicleDynamics,
type VehicleRuntimeSnapshot,
} from '../vehicle/physics';
import { VehicleContactSystem } from '../vehicle/physics/VehicleContactSystem';
import { EhsHybridSystem } from '../vehicle/powertrain/EhsHybridSystem';
import { ElectricPowertrain } from '../vehicle/powertrain/ElectricPowertrain';
import { P2HybridPowertrain } from '../vehicle/powertrain/P2HybridPowertrain';
import type { Powertrain } from '../vehicle/powertrain/Powertrain';
import {
type VehicleLightMode
} from '../vehicle/visual';
import { DrivingSceneDisplayContext } from '../vehicle/visual/DrivingSceneDisplayContext';
import { ElectricDisplayContext } from '../vehicle/visual/ElectricDisplayContext';
import { ExecutiveDisplayContext } from '../vehicle/visual/ExecutiveDisplayContext';
import { VehicleAssetRegistry } from '../vehicle/visual/VehicleAssetRegistry';
import {
DRIVING_GROUND_CATALOG,
getInitialDrivingGroundId,
getNextDrivingGroundId,
isDrivingGroundId,
prepareDrivingGround,
type DrivingGround,
type DrivingGroundId,
} from '../world';
import { createDrivingGroundAsync } from '../world/DrivingGroundCatalog';
import { WEATHER_LABELS,WEATHER_SEQUENCE,WeatherSystem,type EnvironmentTime,type Weather } from '../world/environment/WeatherSystem';
import { createLaneObservation } from '../world/navigation/LaneObservation';
import { NavigationController } from '../world/navigation/NavigationController';
import { ContactDebugView } from './ContactDebugView';
import { vehicleViewModel } from './GameUIViewModels';
import { LateralAssistDebugView } from './LateralAssistDebugView';
import { VehicleVisualDebugView } from './VehicleVisualDebugView';
import { LapTimer } from './lap/LapTimer';
import { renderTelemetry } from './render/RenderTelemetry';
import { R } from './render/RendererProtocol';
import { RendererWorkerClient } from './render/RendererWorkerClient';
import { SimulationVehicleRig } from './render/SimulationVehicleRig';
import { RuntimeCoordinator,type RuntimeTaskHandle } from './runtime/RuntimeCoordinator';
import { VehicleRenderPose } from './runtime/VehicleRenderPose';

declare const __DRIVERGAME_BUILD_VERSION__: string;
declare const __CITY_MAIN_RUNTIME_URL__: string;

export interface DrivingGameIntegration {
  ui: GameUIController; renderer?: WebGLRenderer; assets?: VehicleAssetRegistry; vehicleId: VehicleId; groundId: DrivingGroundId;
  signal?:AbortSignal;
}

const FIXED_STEP = 1 / 120;
const MAX_FRAME_TIME = 0.1;
const GAMEPAD_LOOK_YAW_RATE = MathUtils.degToRad(84);
const GAMEPAD_LOOK_PITCH_RATE = MathUtils.degToRad(62);

export class DrivingGame {
  private readonly gameUI: GameUIController;
  private readonly gameShell?: GameShell;
  private readyWaiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  private readonly menuCamera = new PerspectiveCamera(42, 16 / 9, .1, 2500);
  private readonly menuCameraEye = new Vector3();
  private readonly menuCameraTarget = new Vector3();
  private pendingMapSelection = false;

  private blackBox?: VehiclePhysicsBlackBox;
  private blackBoxStatus: BlackBoxStatus = 'OFF';
  private readonly blackBoxExportTasks = new Map<VehiclePhysicsBlackBox, ReturnType<typeof setTimeout>>();
  private blackBoxExportError?: VehiclePhysicsBlackBox;
  private readonly scene = new Scene();
  private readonly renderer: RendererWorkerClient;
  private ground: DrivingGround;
  private vehicleVisual: SimulationVehicleRig;
  
  private mirrorAdjustment: MirrorAdjustmentController;
  private dynamics: VehicleDynamics<Powertrain>;
  private readonly driverCamera: DriverCamera;
  
  
  private readonly input = new VehicleInputSystem();
  private readonly hud: Hud;
  private readonly lapTimer = new LapTimer();
  private readonly engineAudio = new EngineAudio();
  private readonly acousticTelemetry = createVehicleAcousticTelemetry();
  private readonly acousticContext: {
    roadRoughness: number;
    cockpit: boolean;
    cabinAcoustics: CabinAcousticState | undefined;
    hasDriverAccess: boolean;
    doorOpen: number;
    windowOpen: number;
    cruiseActive: boolean;
    parkingDistance: number | null;
    drivetrainLashIntensity: number;
  } = {
    roadRoughness: 0.12,
    cockpit: true,
    cabinAcoustics: undefined,
    hasDriverAccess: false,
    doorOpen: 0,
    windowOpen: 0,
    cruiseActive: false,
    parkingDistance: null,
    drivetrainLashIntensity: 0,
  };
  private readonly hybridControls = new HybridControlPanel(
    () => this.dynamics?.powertrain instanceof P2HybridPowertrain ? this.dynamics.powertrain : undefined,
    () => this.snapshot?.speed ?? 0, () => this.snapshot?.brake ?? 0,
    mode => {
      if (!this.dynamics?.setTerrainMode(mode)) return;
      this.snapshot = this.dynamics.getSnapshot();
      this.hud.showMessage(mode === 'OFF' ? `返回公路模式 · ${this.snapshot.driveMode ?? 'STANDARD'}` : `全地形模式 · ${mode}`, 1.8);
    });
  private readonly ehsControls = new EhsControlPanel(
    () => this.dynamics?.powertrain instanceof EhsHybridSystem ? this.dynamics.powertrain : undefined,
    () => this.dynamics?.driveMode === 'SNOW',
    enabled => {
      if (!this.dynamics?.setSnowMode(enabled)) return;
      this.snapshot = this.dynamics.getSnapshot();
      this.hud.showMessage(enabled ? '驾驶模式 · SNOW 雪地' : `驾驶模式 · ${this.snapshot.driveMode ?? 'NORMAL'}`, 1.8);
    });
  private hybridEnergyHudVisible = false;
  private drivingLabEnabled = false;
  private standaloneTrajectoryEnabled = false;
  private standaloneAccelEnabled = false;
  private drivingLabModules: DrivingLabModuleStates = {
    scenario: true,
    trajectory: false,
    acceleration: false,
    energy: false,
  };
  private drivingLabHud: DrivingLabHUD | null = null;
  private lastEvFallbackActive = false;
  private executiveDisplay: ExecutiveDisplayContext | null = null;
  private electricDisplay: ElectricDisplayContext | null = null;
  private drivingSceneDisplay: DrivingSceneDisplayContext | null = null;
  private sharedVehicleData: SharedVehicleData | null = null;
  
  private pendingVehicleVisual: SimulationVehicleRig | null = null;
  private readonly vehicleLoading = new VehicleLoadingLifecycle(phase => {
    this.hud.setVehicleLoading(phase);
    if (phase === 'Failed') {
      this.pendingVehicleVisual?.dispose(); this.pendingVehicleVisual = null;
      console.error('Vehicle loading failed', this.vehicleLoading.error);
    }
  });
  
  private readonly cruiseControl = new CruiseControlController();
  private readonly adas = new ADASController();
  private readonly vehicleHud = new VehicleHUDSystem();
  private hudHeightLevel = 0;
  private readonly adasVisualQueryPose = { x: 0, z: 0 };
  private readonly hudActorPool: import('../vehicle/adas/ADASTypes').TrafficActorSnapshot[] = Array.from({ length: 16 }, () => ({
    id: '',
    kind: 'vehicle' as const,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    vx: 0,
    vz: 0,
    length: 4.5,
    width: 1.85,
    height: 1.5,
    confidence: 1,
    timestamp: 0,
  }));
  private readonly vehicleHudInput: VehicleHUDFrameInput;
  private readonly scenarioDebugger: ScenarioDebugger;
  private adasSimTime = 0;
  private prevAdasStateForHud: ADASState = 'OFF';
  private readonly adasCollisionContacts: ADASCollisionContactInfo[] = [];
  private readonly adasCollisionSample = {
    collided: false,
    deltaSpeedMps: 0,
    contacts: this.adasCollisionContacts,
  };
  private readonly adasLamps = { leftSignalActive: false, rightSignalActive: false, hazardActive: false };
  private readonly adasVehicleState: ADASVehicleState = {
    x: 0, y: 0, z: 0, yaw: 0, speed: 0, lateralVelocity: 0, yawRate: 0, acceleration: 0,
    steeringAngle: 0, steeringWheelAngle: 0, throttle: 0, brake: 0,
    wheelBase: 2.8, vehicleWidth: 1.9, vehicleLength: 4.8,
    steeringConfig: { maxRoadWheelAngle: 0.56, steeringWheelLock: 9.4, steeringRatio: 15, highSpeedReferenceSpeed: 18, highSpeedMinimumAuthority: 0.22 },
    vehicleOperational: false, driveAvailable: false, forwardGear: false,
    parkingBrakeActive: false, autoHoldHolding: false, suspended: true,
  };
  private readonly adasWorldContext: ADASWorldContext = {
    navigationState: null,
    roadNetwork: undefined,
    nearbyNetwork: undefined,
    trafficSignals: undefined,
    simulationTime: 0,
  };
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
  
  
  private readonly environment = new WeatherSystem();
  
  private readonly wiperController = new WiperController();
  
  
  
  
  
  private readonly contacts: VehicleContactSystem;
  private readonly contactDebug: ContactDebugView;
  private readonly visualDebug: VehicleVisualDebugView;
  private readonly mirrorGeometryDebug = new MirrorGeometryDebug();

  private snapshot: VehicleRuntimeSnapshot;
  private groundVisualLoading = true;
  private groundVisualErrorReported = false;
  private readonly mirrorHeadLook = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
  
  private readonly mirrorContext: AdaptiveMirrorContext = { speed: 0, road: 'unknown', headYaw: 0, headTargetYaw: 0,
    leftSignal: false, rightSignal: false, selector: 'N', parking: false, steering: 0, lateralActive: false,
    laneChange: false, junction: false, preview: null };
  private readonly runtime = new RuntimeCoordinator();
  
  
  
  
  
  private readonly renderPose = new VehicleRenderPose();
  private renderPoseVersion=1;
  private readonly renderCameraPosition=new Vector3();
  private readonly renderCameraQuaternion=new Quaternion();
  private readonly renderBodyInverse=new Quaternion();
  private lastFrameTime = 0;
  private resetDrivingClock=false;
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

  static async create(host:HTMLElement,integration?:DrivingGameIntegration):Promise<DrivingGame>{
 const groundId=integration?.groundId??DrivingGame.readStoredGroundId();
 let stored:string|null=null;try{stored=localStorage.getItem('drivergame.vehicle-id.v1');}catch{/* Optional preferences. */}
 const vehicleId=integration?.vehicleId??(stored&&isVehicleId(stored)?stored:DEFAULT_VEHICLE_ID);
 integration?.renderer?.forceContextLoss();integration?.renderer?.dispose();integration?.renderer?.domElement.remove();integration?.assets?.dispose();
 const renderer=new RendererWorkerClient(host,vehicleId,groundId,new URL(__CITY_MAIN_RUNTIME_URL__,document.baseURI).href,integration?.signal);
 renderer.onProgress=(stage,done,total,resource)=>{if(stage==='region'||stage==='gpu'||stage==='screen')integration?.ui.loadingProgress.update(stage,done,total,resource);};
 let ground:DrivingGround|undefined;
 try{
  const task=(async()=>{const timing=await prepareDrivingGround(groundId,undefined,'simulation');ground=await createDrivingGroundAsync(groundId,timing,integration?.signal,'simulation');})();
  const [info]=await Promise.all([renderer.vehicleReady,task]);
  if(integration?.signal?.aborted)throw new DOMException('Loading cancelled','AbortError');
  return new DrivingGame(host,ground!,groundId,renderer,integration,new SimulationVehicleRig(getVehicleDescriptor(vehicleId).visualConfig,info,renderer));
 }catch(error){renderer.dispose();ground?.dispose();throw error;}
}

  private constructor(private readonly host: HTMLElement, initialGround: DrivingGround, initialGroundId: DrivingGroundId,
    renderer: RendererWorkerClient,
    private readonly integration: DrivingGameIntegration|undefined, preparedVisual: SimulationVehicleRig) {
    
    this.hud = new Hud(host);
    this.vehicleHudInput = {
      dt: 0,
      visible: false,
      vehicleId: DEFAULT_VEHICLE_ID,
      ignitionOn: true,
      snapshot: null,
      sharedSpeedLimitKmh: null,
      navigationState: null,
      headLookYawRad: 0,
      headLookPitchRad: 0,
      bodyPitchRad: 0,
      bodyRollRad: 0,
      adasEnabled: false,
      adasStatus: this.adas.status,
      adasPlan: this.adas.planner.snapshot,
      adasObstacle: this.adas.obstacleAvoidance.assessment,
      adasRules: this.adas.trafficRules.decision,
      adasVehicle: this.adasVehicleState,
      samplesApproachLane: 0,
      theme: 'DAY',
      rainIntensity: 0,
      fogIntensity: 0,
      wetness: 0,
      ground: null,
      camera: null,
      viewportWidth: 1280,
      viewportHeight: 720,
      colliders: undefined,
      actors: this.adas.obstacleAvoidance.perception.actors,
      actorCount: 0,
      capabilities: undefined,
    };
    this.scenarioDebugger = new ScenarioDebugger(this.scene, () => this.adasVehicleState, () => this.ground, host, () => this.adasSimTime);
    renderer.onError = () => this.hud.showMessage('独立渲染线程异常 · 请返回主菜单重试', 30);
    this.contactDebug = new ContactDebugView(host);
    this.scene.add(this.contactDebug.root);
    this.visualDebug = new VehicleVisualDebugView(host);
    this.scene.add(this.visualDebug.root);
    this.scene.add(this.mirrorGeometryDebug.root);
    this.renderer = renderer;
    host.prepend(this.renderer.domElement);

    this.activeGroundId = initialGroundId;
    this.ground = initialGround;
    this.prepareGroundVisuals(this.ground);
    this.hud.setRoadNetwork(this.ground.roadNetwork);
    this.navigation.configure(DRIVING_GROUND_CATALOG.find(g=>g.id===this.activeGroundId)?.navigation?this.ground.roadNetwork:undefined);
    this.hud.setNavigation(this.navigation);
    this.hud.onMapVisibilityChange=visible=>{
      this.runtime.simulation.reset();this.draggingLook=false;this.input.setEnabled(false);this.haptics.stop();
      if(visible){this.cruiseControl.reset();this.adas.reset();this.laneAssistSelection.cancelCentering();this.laneAssistSelection.applyTo(this.lateralAssist);}
      else this.renderer.domElement.focus();
    };
    this.activeVehicleId = integration?.vehicleId ?? this.readStoredVehicleId();
    this.hudHeightLevel = this.readStoredHudHeight(this.activeVehicleId);
    const initialVehicle = getVehicleDescriptor(this.activeVehicleId);
    this.vehicleLoading.mark('Static asset prepare');
    
    const colliderIndexStarted = performance.now();
    this.contacts = new VehicleContactSystem(this.ground, initialVehicle.visualConfig.collisionDimensions);
    this.contacts.extraColliderQuery = (pose, radiusM) =>
      this.scenarioDebugger.activeCount > 0 ? this.scenarioDebugger.getNearbyColliders(pose, radiusM) : [];
    performance.measure('city:colliderIndex', {start:colliderIndexStarted,end:performance.now()});
    this.vehicleLoading.mark('Instance creation');
    this.vehicleVisual = preparedVisual;
    this.mirrorAdjustment = this.createMirrorAdjustment(this.vehicleVisual);

    this.scene.add(this.vehicleVisual.root);
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
    this.renderPose.reset(this.snapshot, initialVehicle.visualConfig.staticBodyOffsetY);this.renderPoseVersion++;
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
    this.configureVehicleInteraction(this.vehicleVisual, initialVehicle.audioProfile, initialVehicle.acousticProfile);

    this.configureVehicleSettings();
    this.configureGroundSelection();
    this.configureVehicleSelection();

    this.input.setEnabled(false);
    this.haptics.setEnabled(false);
    this.gameUI = integration?.ui ?? new GameUIController({
      startDrive: restart => {
        if (restart) this.resetVehicleToGroundStart();
        this.gameStarted = true; this.hud.setStarted();
        void this.engineAudio.start();
      },
      selectVehicle: id => { if (isVehicleId(id)) this.switchVehicle(id); },
      selectMap: id => {
        if (!isDrivingGroundId(id)) return;
        this.pendingMapSelection = true; this.syncUIState();
        void this.switchGround(id).finally(() => { this.pendingMapSelection = false; this.syncUIState(); });
      },
      openSettings: section => this.hud.settings.openSection(section),
      screenChanged: screen => this.onUIScreenChanged(screen),
      hudChanged: profile => this.hud.setProfile(profile),
    }, platform.storage, this.activeVehicleId, this.activeGroundId);
    if (!integration) this.gameShell = new GameShell(host, this.gameUI, platform, VEHICLE_CATALOG.map(vehicleViewModel),
      DRIVING_GROUND_CATALOG.map(ground => ({ id: ground.id, name: ground.displayName, description: ground.description })));
    this.hud.onLoadingChange = () => this.syncUIState();
    this.hud.onProfileRequest = profile => this.gameUI.setHudProfile(profile);
    if (!integration) { this.gameUI.setHudProfile(this.hud.initialProfile, false); void this.gameUI.loadPreferences(); }
    else this.hud.setProfile(this.gameUI.state.hudProfile);
    this.onUIScreenChanged(this.gameUI.state.screen);
    this.renderer.setSources(()=>renderTelemetry(this.vehicleVisual.telemetry) as Record<string,unknown>,()=>this.renderContext());
    this.bindEvents();
    this.queueVehicleWarmup();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.runtime.start(time => this.frame(time));
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
    this.runtime.dispose();
    this.unbindEvents();
    this.input.dispose();
    this.haptics.dispose();
    this.gameShell?.dispose();
    for (const waiter of this.readyWaiters) waiter.reject(new Error('Driving session disposed')); this.readyWaiters = [];
    this.hud.dispose();
    this.drivingLabHud?.dispose();
    this.drivingLabHud = null;
    this.scenarioDebugger.dispose();
    this.contactDebug.dispose();
    this.lateralDebug?.dispose();
    this.trajectoryPrediction?.dispose();
    this.accelerationTestView?.dispose();
    this.visualDebug.dispose();
    this.mirrorGeometryDebug.dispose();

    this.vehicleVisual.dispose();
    this.ground.dispose();

    this.renderer.dispose();
    this.engineAudio.dispose();
    this.hybridControls.dispose();
    this.ehsControls.dispose();
    this.electricDisplay?.dispose();
    this.drivingSceneDisplay?.dispose();
    this.sharedVehicleData?.dispose();
    this.renderer.domElement.remove();
  }

  public async prepareDriveFromUI(vehicleId:string,groundId:string,restart:boolean,signal?:AbortSignal):Promise<void>{
 if(isDrivingGroundId(groundId)&&groundId!==this.activeGroundId&&!await this.switchGround(groundId,signal))throw Error('Map loading failed');
 if(isVehicleId(vehicleId)&&vehicleId!==this.activeVehicleId)this.switchVehicle(vehicleId);
 if(restart)this.resetVehicleToGroundStart();
 await this.whenReady();await this.prepareFirstScreen(signal);
 this.ground.finishVisualPreload?.();this.gameUI.loadingProgress.finish();this.gameStarted=true;this.hud.setStarted();void this.engineAudio.start();loadingMark('driveReady');
}
  public whenReady(): Promise<void> {
    if (this.vehicleLoading.ready && !this.groundVisualLoading) return Promise.resolve();
    return new Promise((resolve, reject) => this.readyWaiters.push({ resolve, reject }));
  }
  public uiSelectVehicle(id: string): void { if (isVehicleId(id)) this.switchVehicle(id); }
  public uiScreenChanged(screen: UIScreen): void { this.onUIScreenChanged(screen); }
  public uiHudChanged(profile: import('../ui/state/GameUIState').HudProfile): void { this.hud.setProfile(profile); }
  public uiSettings(section: 'vehicle' | 'controls' | 'world'): void { this.hud.settings.openSection(section); }

  private syncUIState(): void {
    const busy = this.pendingMapSelection || !this.vehicleLoading.ready || this.groundVisualLoading;
    if (!this.integration || this.gameUI.state.screen !== 'loading') this.gameUI?.setBusy(busy);
    if (!busy && this.readyWaiters.length) {
      for (const waiter of this.readyWaiters) waiter.resolve(); this.readyWaiters = [];
    }
    if (this.vehicleLoading.phase === 'Failed' || this.ground.visualLoadingError) {
      for (const waiter of this.readyWaiters) waiter.reject(this.vehicleLoading.error ?? this.ground.visualLoadingError); this.readyWaiters = [];
    }
  }
  private async prepareFirstScreen(signal?:AbortSignal):Promise<void>{
 const progress=this.gameUI.loadingProgress;
 this.updateVehicleVisual(0);this.publishRender(this.driverCamera.camera,1);
 await this.renderer.ready;
 if(this.renderer.error)throw this.renderer.error;
 await this.renderer.prepareDrive();
 this.gameUI.loadingProgress.close('region');this.gameUI.loadingProgress.close('gpu');
 if(!this.running||signal?.aborted)throw new DOMException('Loading cancelled','AbortError');
 (this.host.closest<HTMLElement>('#app')??this.host).dataset.loadingHud='true';
 this.hud.updateMinimap(this.snapshot.x,this.snapshot.z,this.snapshot.yaw,1/20);
 progress.update('screen',1,1,'独立渲染线程首屏已就绪');progress.close('screen');
}

  private onUIScreenChanged(screen: UIScreen): void {
    const driving = screen === 'driving';
    // Loading/pause wall time is not simulation debt. Keep the full 120 Hz
    // cadence after handoff without catching up the final loading render.
    if(driving)this.resetDrivingClock=true;
    if(screen!=='loading')delete (this.host.closest<HTMLElement>('#app')??this.host).dataset.loadingHud;
    this.hud.setMenuOpen(!driving);
    this.runtime.simulation.reset(); this.draggingLook = false;
    this.input.setEnabled(driving && this.gameStarted);
    this.haptics.setEnabled(driving && this.gameStarted && this.hud.settings.vibrationEnabled);
    this.engineAudio.setMenuDucked(!driving);
    if (!driving) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.cruiseControl.reset(); this.adas.reset(); this.laneAssistSelection.cancelCentering();
      this.lateralAssist.reset(); this.lapTimer.suspend(this.snapshot);
      this.accelerationTest?.interrupt('打开菜单', false);
    } else this.renderer.domElement.focus();
  }

  private renderMenuBackground(_dt: number): void {
    const screen = this.gameUI.state.screen;
    const showroom = screen === 'main' || screen === 'vehicles' || screen === 'maps' || screen === 'training' || !this.gameStarted;
    let camera = this.driverCamera.camera;
    if (showroom) {
      const dimensions = this.dynamics.config;
      const distance = Math.max(dimensions.length, dimensions.width * 2);
      this.menuCameraEye.set(distance * .94, distance * .50, -distance * 1.20);
      this.vehicleVisual.root.localToWorld(this.menuCameraEye);
      this.menuCameraTarget.set(screen === 'vehicles' ? 0 : -distance * .36, dimensions.height * .45, 0);
      this.vehicleVisual.root.localToWorld(this.menuCameraTarget);
      this.menuCamera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.menuCamera.updateProjectionMatrix();
      this.menuCamera.position.copy(this.menuCameraEye); this.menuCamera.lookAt(this.menuCameraTarget);
      this.menuCamera.layers.set(0); this.menuCamera.layers.enable(1); this.menuCamera.layers.enable(2);
      camera = this.menuCamera;
    }
    this.publishRender(camera,0);
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
  private configureVehicleInteraction(
    visual: SimulationVehicleRig,
    audioProfile?: VehicleAudioProfile,
    acousticProfile?: VehicleAcousticProfile,
  ): void {
    const base = visual.interactionDefinition;
    this.interactionDefinition = base === null
      ? null
      : { ...base, cabinAcoustics: audioProfile?.cabinAcoustics ?? acousticProfile?.cabin.cabinAcoustics };
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
    this.runtime.setMode(this.gameUI.state.screen === 'loading' ? 'loading' : document.hidden||this.gameUI.freezesSimulation ? 'suspended' : 'driving');
    if(this.gameUI.state.screen==='loading'){
      this.updateWorldVisibility();
      const region=this.ground.visualLoadingProgress;if(region){this.gameUI.loadingProgress.update('region',region.regionDone,region.regionTotal,region.resource);if(region.regionTotal>0&&region.regionDone===region.regionTotal)this.gameUI.loadingProgress.close('region');}
    }
    this.syncUIState();
    this.updateBlackBoxUI();
    if(this.resetDrivingClock){this.resetDrivingClock=false;this.lastFrameTime=time;this.runtime.simulation.reset();this.renderPose.reset(this.snapshot,this.vehicleVisual.config.staticBodyOffsetY);this.renderPoseVersion++;}
    const elapsedSeconds = Math.max(0, (time - this.lastFrameTime) / 1_000);
    const frameDt = Math.min(MAX_FRAME_TIME, elapsedSeconds);
    this.lastFrameTime = time;
    // Presets only move targets; all consumers below read the smoothed values.
    this.environment.update(frameDt);
    const thunderDelay = this.environment.consumeThunderDelay();
    if (thunderDelay !== null) this.engineAudio.playThunder(thunderDelay);
    if (!this.vehicleLoading.ready) {
      this.input.setEnabled(false); this.haptics.stop(); this.runtime.simulation.reset();
      if (this.ground.visualReady === false && !this.ground.visualLoadingError) this.updateGroundVisuals(0);
      this.vehicleLoading.advance();
      return;
    }
    if (this.groundVisualLoading && this.ground.visualReady === false) {
      this.input.setEnabled(false); this.haptics.stop(); this.runtime.simulation.reset();
      if (this.ground.visualLoadingError) {
        this.hud.setVehicleLoading('Failed', '地图加载失败，请刷新重试');
      } else {
        this.hud.setVehicleLoading('Visual warmup', '正在准备道路与地形');
        this.updateGroundVisuals(0);
      }
      return;
    }
    if (this.groundVisualLoading) { this.groundVisualLoading = false; this.ground.markLoadMilestone?.('playable'); this.hud.setVehicleLoading('Ready'); }
    if (this.ground.visualLoadingError && !this.groundVisualErrorReported) {
      this.groundVisualErrorReported = true; this.hud.showMessage('地图视觉加载失败 · 请刷新重试', 10);
    }
    if (this.gameUI.freezesSimulation || document.hidden) {
      this.runtime.simulation.reset(); this.input.setEnabled(false); this.haptics.stop();
      this.updateGroundVisuals(0);
      if(this.gameUI.state.screen!=='loading')this.renderMenuBackground(frameDt);
      return;
    }
    this.hud.updateNavigation(frameDt);
    if(this.hud.isMapOpen){
      this.runtime.simulation.reset();this.input.setEnabled(false);this.haptics.stop();
      this.updateGroundVisuals(0);return;
    }
    this.runtime.simulation.begin(elapsedSeconds, true);
    const simulationStarted = performance.now();
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

    while (this.runtime.simulation.canStep()) {
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
      this.adasSimTime += FIXED_STEP;
      if (this.gameStarted && !this.settingsOpen) {
        this.scenarioDebugger.update(FIXED_STEP);
      }
      const adasWasEnabled = this.adas.isEnabled;
      if (driverControls.adasToggle) {
        this.adas.toggle(this.snapshot.throttle);
        if (this.adas.isEnabled && adasWasEnabled) {
          this.hud.showMessage('碰撞停车驻车中 · 完成后可手动重新开启 ADAS', 2.0);
        } else if (this.adas.isEnabled) {
          this.cruiseControl.reset();
          this.laneAssistSelection.cancelCentering();
          this.laneAssistSelection.applyTo(this.lateralAssist);
          this.hud.showMessage('ADAS 导航辅助驾驶已开启 · 按 Y 键或手柄 Y 可关闭', 2.0);
        } else if (adasWasEnabled) {
          this.hud.showMessage('ADAS 导航辅助驾驶已关闭', 1.8);
        }
      }

      let controls = driverControls;
      let lateralOutputActive = false;
      if (this.adas.isEnabled || adasWasEnabled) {
        const av = this.adasVehicleState;
        const dims = this.vehicleVisual.config.dimensions;
        av.x = this.snapshot.x; av.y = this.snapshot.chassis.groundHeight; av.z = this.snapshot.z;
        av.yaw = this.snapshot.yaw; av.speed = this.snapshot.speed;
        av.lateralVelocity = this.snapshot.lateralVelocity; av.yawRate = this.snapshot.yawRate;
        av.acceleration = this.snapshot.acceleration;
        av.steeringAngle = this.snapshot.steeringAngle; av.steeringWheelAngle = this.snapshot.steeringWheelAngle;
        av.throttle = this.snapshot.throttle; av.brake = this.snapshot.brake;
        av.wheelBase = this.dynamics.config.wheelBase;
        av.vehicleWidth = dims.width; av.vehicleLength = dims.length;
        av.steeringConfig = this.dynamics.config.steering;
        av.vehicleOperational = this.snapshot.vehicleOperational;
        av.driveAvailable = this.snapshot.driveAvailable;
        av.forwardGear = this.snapshot.transmission.type === 'MANUAL'
          ? typeof this.snapshot.gear === 'number' && this.snapshot.gear >= 1
          : this.snapshot.transmission.selectedMode === 'D';
        av.transmissionType = this.snapshot.transmission.type;
        av.driveSelector = this.snapshot.transmission.selectedMode;
        av.reverseGear = this.snapshot.gear === 'R' || this.snapshot.transmission.selectedMode === 'R';
        av.neutralGear = this.snapshot.gear === 'N' || this.snapshot.transmission.selectedMode === 'N';
        av.supportsPark = this.snapshot.transmission.type !== 'MANUAL' && this.snapshot.transmission.selectedMode !== null;
        av.hasElectronicParkingBrake = this.dynamics.capabilities.electronicParkingBrake;
        av.parkingBrakeEngaged = this.snapshot.parkingBrake.engaged;
        av.collision = this.adasCollisionSample;
        av.parkingBrakeActive = this.snapshot.parkingBrake.engaged || this.snapshot.parkingBrake.applying;
        av.autoHoldHolding = this.snapshot.autoHold.holding;
        av.suspended = this.settingsOpen || !this.gameStarted || document.hidden;
        syncADASLiveVehicleTelemetry(av, this.dynamics.config, dims, this.snapshot, this.environment.roadGripMultiplier);

        const aw = this.adasWorldContext;
        aw.navigationState = this.navigation.state;
        aw.roadNetwork = this.ground.roadNetwork;
        aw.laneGraph = this.ground.laneGraph;
        aw.nearbyNetwork = this.sharedVehicleData?.navigation.nearbyNetwork;
        aw.trafficSignals = this.ground.trafficSignals;
        aw.trafficActorProvider = this.scenarioDebugger;
        aw.getLegacyJunctionSignalColor = this.queryLegacySignalColor;
        aw.queryNearbyColliders = this.queryDisplayColliders;
        aw.simulationTime = this.adasSimTime;
        aw.suppressNavigationReroute = this.adas.isControlling && this.adas.isManeuvering;
        aw.roadGripMultiplier = this.environment.roadGripMultiplier;
        aw.wetness = this.environment.wetness;
        aw.visibilityFactor = Math.max(0.3, 1 - this.environment.fogIntensity * 0.5 - this.environment.rainIntensity * 0.25);

        const lampState = this.lightController.state;
        this.adasLamps.leftSignalActive = lampState.leftTurnSignal;
        this.adasLamps.rightSignalActive = lampState.rightTurnSignal;
        this.adasLamps.hazardActive = lampState.hazard;

        // Avoid double-toggling inside ADASController since we already handled the edge above.
        const adasStepInput = driverControls.adasToggle ? { ...driverControls, adasToggle: false } : driverControls;
        controls = this.adas.step(FIXED_STEP, adasStepInput, av, aw, this.adasLamps);
        lateralOutputActive = this.adas.isControlling;

        const curAdasState = this.adas.status.state;
        if (curAdasState !== this.prevAdasStateForHud) {
          const prevHudState = this.prevAdasStateForHud;
          this.prevAdasStateForHud = curAdasState;
          if (curAdasState === 'COLLISION_HANDOVER') {
            this.hud.showMessage(this.adas.status.reason || '碰撞停车 · 双闪开启 · ADAS 已解除，请接管', 4.0);
          } else if (curAdasState === 'BLOCKED_RECOVERY_FAILED') {
            this.hud.showMessage(this.adas.status.reason || '脱困失败，请人工接管', 3.5);
          } else if (
            curAdasState === 'OFF' &&
            prevHudState.startsWith('BLOCKED_') &&
            this.adas.status.reason
          ) {
            this.hud.showMessage(this.adas.status.reason, 3.0);
          }
        }
      }

      if (!this.adas.isEnabled) {
        controls = this.cruiseControl.update(FIXED_STEP, driverControls, {
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
        lateralOutputActive = lateralOutput.active;
      }

      const beforeStep = this.snapshot;
      this.dynamics.vehicleControl.learningAllowed = this.gameStarted && !this.settingsOpen && !document.hidden &&
        this.playerMode.mode === 'Driving' && !this.playerMode.transitioning && !lateralOutputActive && !this.cruiseControl.isActive && !this.adas.isControlling;
      this.snapshot = this.contacts.step(FIXED_STEP, controls, this.dynamics);
      this.syncAdasCollisionSample(beforeStep.speed, this.snapshot.speed);
      this.renderPose.push(this.snapshot,this.vehicleVisual.config.staticBodyOffsetY);
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
        const modeLabels: Record<string, string> = {
          STANDARD: 'STANDARD 标准', NORMAL: 'NORMAL 标准', ECO: 'ECO 经济',
          SPORT: 'SPORT 运动', SNOW: 'SNOW 雪地', WET: 'WET 湿滑',
          RACE: 'RACE 赛道', RANGE: 'RANGE 续航', SPORT_PLUS: 'SPORT+ 运动增强', MAYBACH: 'MAYBACH 尊享',
        };
        this.hud.showMessage(`驾驶模式 · ${modeLabels[this.snapshot.driveMode] ?? this.snapshot.driveMode}`, 1.8);
      }
      if (driverControls.cycleEnergyMode) {
        const h = this.snapshot.powertrain.hybrid;
        const e = this.snapshot.powertrain.ehs;
        if (h) {
          const labels: Record<string, string> = { EV: 'EV 纯电', HEV: 'HEV 混动', INTELLIGENT: 'INTELLIGENT 智能', HYBRID: 'HEV 混动' };
          this.hud.showMessage(`动力模式 · ${labels[h.mode] ?? h.mode}`, 1.8);
        } else if (e) {
          const labels: Record<string, string> = { EV: 'EV 纯电优先', HEV: 'HEV 混动', HOLD: 'HEV 智能保电' };
          this.hud.showMessage(`动力模式 · ${labels[e.mode] ?? e.mode}`, 1.8);
        }
      }
      const evFallback = Boolean(this.snapshot.powertrain.hybrid?.evFallbackActive || this.snapshot.powertrain.ehs?.evFallbackActive);
      if (evFallback && !this.lastEvFallbackActive) {
        const reason = this.snapshot.powertrain.hybrid?.evFallbackReason ?? this.snapshot.powertrain.ehs?.evFallbackReason ?? 'NONE';
        const reasonLabels: Record<string, string> = {
          LOW_SOC: '电量偏低，发动机已介入',
          THERMAL_LIMIT: '电池温度限功率，发动机已介入',
          BATTERY_LIMIT: '电池输出受限，发动机已介入',
          POWER_DEMAND: '高动力需求，已切入混动辅助',
          SPEED_LIMIT: '超出纯电车速上限，发动机已介入',
        };
        this.hud.showMessage(`纯电模式退出 · ${reasonLabels[reason] ?? '已切入混动'}`, 2.4);
      }
      this.lastEvFallbackActive = evFallback;
      if (this.snapshot.transmission.type !== 'MANUAL' &&
        (driverControls.shiftUp || driverControls.shiftDown || driverControls.driveSelector !== undefined) &&
        this.snapshot.transmission.selectorRejectedReason !== null) {
        this.hud.showMessage(this.snapshot.transmission.selectorRejectedReason === 'brake-required'
          ? '选挡被拒绝 · 请踩住刹车再切换 P / R / N / D'
          : '选挡被拒绝 · 请先停车再切换行驶方向或驻车挡', 2.2);
      }
      this.updateVehicleFeedback(FIXED_STEP);
      const previousLightMode = this.lightController.state.mainLightMode;
      const lightInput = this.adas.isEnabled || adasWasEnabled ? controls : driverControls;
      this.lightController.update(FIXED_STEP, lightInput, {
        assistedBrakeActive: (this.adas.isControlling && (controls.cruiseBrake ?? 0) > 0.04) ||
          (this.snapshot.powertrain.ev !== undefined &&
          (this.snapshot.powertrain.ev.regenBrakeLight || this.snapshot.wheels.frontLeft.appliedBrakeTorque > 10 ||
            this.snapshot.wheels.frontRight.appliedBrakeTorque > 10 || this.snapshot.wheels.rearLeft.appliedBrakeTorque > 10 ||
            this.snapshot.wheels.rearRight.appliedBrakeTorque > 10)),
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
      this.runtime.simulation.completeStep();
    }
    this.runtime.performance.add('simulation', performance.now() - simulationStarted);
    const sceneStarted = performance.now();

    this.reportShiftResult();
    this.reportEngineState();
    this.reportParkingBrakeState();
    this.updateAuxiliaryGauges(frameDt);
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
    this.updateGroundVisuals(this.snapshot.speed, frameDt * 1000);
    this.hud.updateMinimap(this.snapshot.x, this.snapshot.z, this.snapshot.yaw, frameDt);

    this.updateOnFootWalk(frameDt);
    this.updatePlayerCamera(frameDt);
    this.wiperController.update(frameDt, this.environment.rainIntensity);
    if (this.wiperController.sweepStarted) this.engineAudio.playWiperSweep(this.wiperController.effectiveMode);
    const acousticsProfile = this.vehicleInteraction.cabinAcoustics;
    this.cabinAcoustics = acousticsProfile !== undefined && this.playerMode.mode === 'Driving'
      ? evaluateCabinAcoustics(acousticsProfile, {
        windowPosition: this.vehicleInteraction.driverWindowOpenFraction,
        doorOpenAmount: this.vehicleInteraction.driverDoorOpenFraction,
        speedMetersPerSecond: this.snapshot.speed,
      })
      : null;
    const cockpitView = this.visualDebug.renderCamera === null && this.playerMode.mode === 'Driving';
    const cruiseStatus = this.cruiseControl.status;
    this.acousticContext.roadRoughness = this.latestRoadRoughness;
    this.acousticContext.cockpit = cockpitView;
    this.acousticContext.cabinAcoustics = this.cabinAcoustics ?? undefined;
    this.acousticContext.hasDriverAccess = this.interactionDefinition !== null;
    this.acousticContext.doorOpen = this.interactionDefinition ? this.vehicleInteraction.driverDoorOpenFraction : 0;
    this.acousticContext.windowOpen = this.interactionDefinition ? this.vehicleInteraction.driverWindowOpenFraction : 0;
    this.acousticContext.cruiseActive = cruiseStatus.active;
    this.acousticContext.parkingDistance = (this.sharedVehicleData && !this.electricDisplay
      ? this.sharedVehicleData.rearParking
      : this.rearParking.state).nearestDistanceM;
    this.acousticContext.drivetrainLashIntensity = this.snapshot.drivetrainLash?.joltIntensity ?? 0;
    populateAcousticTelemetry(this.acousticTelemetry, this.snapshot, this.dynamics.engine, this.acousticContext);
    this.engineAudio.updateAcoustic(this.acousticTelemetry, frameDt);
    const showEnergyControls = this.hybridEnergyHudVisible && this.gameUI.state.screen === 'driving' && !this.settingsOpen && !this.hud.immersiveMode;
    this.hybridControls.update(frameDt, showEnergyControls);
    this.ehsControls.update(frameDt, showEnergyControls);
    const showVehicleHud =
      this.gameUI.state.screen === 'driving' &&
      !this.settingsOpen &&
      this.playerMode.mode === 'Driving';
    this.vehicleHud.updateHUDState(this.getVehicleHudInput(frameDt, showVehicleHud));
    this.engineAudio.updateTurnSignal(this.lightController.state, cockpitView);
    this.engineAudio.updateWeather(frameDt, this.environment.rainIntensity,
      this.environment.windIntensity, this.environment.stormIntensity,
      cockpitView, Math.abs(this.snapshot.speed), this.cabinAcoustics ?? undefined);
    this.hud.updateLap(this.ground.lapCourse ? this.lapTimer.state : null);
    this.hud.update({
      ...this.snapshot,
      speedLimit: this.sharedVehicleData?.navigation.speedLimit ?? null,
      steeringInput: this.latestInput.steering,
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
    if (this.drivingLabHud) {
      const labVisible = this.gameUI.state.screen === 'driving' && !this.settingsOpen && !this.hud.immersiveMode;
      this.drivingLabHud.root.hidden = !labVisible;
      if (labVisible) {
        this.drivingLabHud.update(
          frameDt,
          this.accelerationTest?.state ?? null,
          this.gameStarted && !this.settingsOpen && !this.hud.immersiveMode,
          this.snapshot.steeringAngle,
          this.snapshot.speed,
        );
      }
    }


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
    this.runtime.performance.add('scene',performance.now()-sceneStarted);
    const renderStarted = performance.now();
    this.publishRender(this.visualDebug.renderCamera??this.driverCamera.camera,1);

    this.runtime.performance.add('render',performance.now()-renderStarted);
  };

  
  

  private updateVehicleVisual(dt: number): void {
    const feedbackOffset = this.feedback.state.cockpitOffset;
    // Suspension owns chassis pitch/roll. Only millimetre cabin vibration is
    // added here; the driver eye and physical mirror planes stay untouched.
    this.vehicleVisual.cockpitRoot.position.set(feedbackOffset.x, feedbackOffset.y, feedbackOffset.z);
    const chassis = this.snapshot.chassis;
    const roadHeight = chassis.groundHeight;
    this.renderPose.sample(dt > 0 ? this.runtime.simulation.interpolation : 1);
    const body = this.renderPose.body;
    this.vehicleVisual.setWorldPose(
      body.x,
      body.y,
      body.z,
      body.yaw,
      body.pitch,
      body.roll,
    );

    // Physics uses positive=right. Three's local Y/Z rotations are positive
    // counter-clockwise from the driver's view, hence the visual sign change.


    const parkingPose = {
      x: this.snapshot.x, z: this.snapshot.z, yaw: this.snapshot.yaw,
      y: roadHeight, width: this.vehicleVisual.config.dimensions.width, length: this.vehicleVisual.config.dimensions.length,
    };
    if (this.adas.isEnabled && this.adas.status.requestNavReroute) {
      this.navigation.triggerImmediateReroute();
    }
    this.navigation.setRerouteSuppression(this.adas.isControlling && this.adas.isManeuvering);
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
      driverAccess: this.interactionDefinition ? { doorOpen: this.vehicleInteraction.driverDoorOpenFraction,
        windowOpen: this.vehicleInteraction.driverWindowOpenFraction } : undefined,
      activeSpoilerDeployment: this.snapshot.activeSpoilerDeployment,
      speedKmh: Math.abs(this.snapshot.speed) * 3.6,
      rpm: this.snapshot.rpm ?? 0,
      ev: this.snapshot.powertrain.ev,
      hybrid: this.snapshot.powertrain.hybrid,
      ehs: this.snapshot.powertrain.ehs,
      driveAvailable: this.snapshot.driveAvailable,
      gear: this.snapshot.transmission.type !== 'MANUAL'
        ? this.snapshot.transmission.selectedMode === 'D' && this.snapshot.transmission.currentPhysicalGear !== null ? `D${this.snapshot.transmission.currentPhysicalGear}` : this.snapshot.transmission.selectedMode ?? 'N'
        : this.snapshot.gear ?? 'N',
      engineRunning: this.snapshot.engineRunning,
      driveMode: this.snapshot.driveMode,
      startStopState: this.snapshot.startStop,
      cruiseTargetSpeedKmh: this.cruiseControl.status.targetSpeedKmh ?? undefined,
      fuelLevel: (this.snapshot.fuel?.fuelPercent ?? this.fuelLevel * 100) / 100,
      ignitionOn: this.ignitionOn,
      executive: this.executiveDisplay?.data,
      electricDisplay: this.electricDisplay?.data,
      tyres: this.sharedVehicleData?.tyres,
      tpmsState: this.snapshot.tpmsState,
      sharedVehicle: this.sharedVehicleData ?? undefined,
      trip: this.snapshot.trip,
      assistCapabilities: this.dynamics.capabilities,
      chassisStatus: this.snapshot.powertrain.ev || this.dynamics.config.suspension.airSuspension ? { rideHeight: this.dynamics.config.suspension.rideHeight + this.snapshot.chassis.rideOffset,
        targetHeight: this.dynamics.suspension.rideHeightTarget, nominalHeight: this.dynamics.config.suspension.rideHeight,
        dampingMode: this.snapshot.driveMode ?? 'NORMAL',
        electricSoundPresence: this.dynamics.powertrain instanceof ElectricPowertrain ? this.dynamics.powertrain.config.audioPresence ?? 1 : 1 } : undefined,
      drivingScene: this.drivingSceneDisplay?.data,
      laneAssist: this.laneAssistSelection.state,
      ambientDaylight: this.ambientDaylight,
      coolantTemperatureC: this.snapshot.powertrain.ice?.thermal?.temperatureC ?? this.coolantTemperatureC,
      transmissionTemperatureC: this.snapshot.transmission?.thermal?.temperatureC,
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

    if (this.interactionDefinition !== null) {
      applyVehicleInteractionVisual(
        this.interactionDefinition,
        this.vehicleInteraction.driverDoorOpenFraction,
        this.vehicleInteraction.driverWindowOpenFraction,
      );
    }
    this.vehicleVisual.root.updateMatrixWorld(true);
  }

  private readonly queryDisplayColliders = (pose: { x: number; z: number }, radius: number) => {
    const staticColliders = this.contacts.collisionSystem.getNearbyColliders(pose, radius);
    const debugColliders = this.scenarioDebugger?.getNearbyColliders(pose, radius);
    if (!debugColliders || debugColliders.length === 0) return staticColliders;
    return staticColliders.concat(debugColliders);
  };

  private readonly queryLegacySignalColor = (
    junctionId: string,
    controlKind: 'north-south' | 'east-west',
  ): 'red' | 'amber' | 'green' | undefined => {
    const legacyGround = this.ground as DrivingGround & {
      getTrafficSignalSnapshot?: (id?: string) => { northSouth: 'red' | 'amber' | 'green'; eastWest: 'red' | 'amber' | 'green' };
    };
    const snap = legacyGround.getTrafficSignalSnapshot?.(junctionId);
    if (!snap) return undefined;
    return controlKind === 'north-south' ? snap.northSouth : snap.eastWest;
  };

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
    this.engineAudio.configure(descriptor.audioProfile, descriptor.acousticProfile);
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
      this.standaloneTrajectoryEnabled = enabled;
      this.syncTrajectoryResource();
    };
    settings.onHybridEnergyHudChange = enabled => {
      this.hybridEnergyHudVisible = enabled;
    };
    settings.onAccelerationTestChange = enabled => {
      this.standaloneAccelEnabled = enabled;
      this.syncAccelerationResources(enabled);
    };
    settings.onDrivingLabChange = enabled => {
      this.setDrivingLabEnabled(enabled);
    };
    settings.onLateralPreferencesChange = () => this.configureLaneAssistModes();
    settings.onLCCToggle = () => this.toggleLaneCentering();
    settings.setFuel(this.snapshot.fuel);
    settings.setBattery(this.snapshot.powertrain.ev);
    settings.setHudHeightLevel(this.hudHeightLevel);
    settings.onHudHeightChange = level => {
      this.hudHeightLevel = clampHUDHeightLevel(level);
      this.saveStoredHudHeight(this.activeVehicleId, this.hudHeightLevel);
    };
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
    settings.setHudHeightLevel(this.hudHeightLevel);
    settings.onHudHeightChange = level => {
      this.hudHeightLevel = clampHUDHeightLevel(level);
      this.saveStoredHudHeight(this.activeVehicleId, this.hudHeightLevel);
    };
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
    settings.setLightMode(storedLightMode);
    settings.setMirrorSide(this.selectedMirror);
    settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
    const keyboard = this.input.keyboard;
    if (keyboard !== null) settings.setBindings(keyboard.getBindings());

    settings.onVisibilityChange = (visible) => {
      this.settingsOpen = visible;
      this.gameUI?.settingsVisibility(visible);
      if (visible) this.accelerationTest?.interrupt('打开设置', false);
      if (visible) this.lapTimer.suspend(this.snapshot);
      this.input.setEnabled(this.gameStarted && (!visible || this.snapshot.transmission.type !== 'MANUAL'));
      if (visible) this.haptics.setEnabled(false);
      if (visible) {
        settings.setFuel(this.snapshot.fuel);
    settings.setBattery(this.snapshot.powertrain.ev);
    settings.setHudHeightLevel(this.hudHeightLevel);
    settings.onHudHeightChange = level => {
      this.hudHeightLevel = clampHUDHeightLevel(level);
      this.saveStoredHudHeight(this.activeVehicleId, this.hudHeightLevel);
    };
        this.cruiseControl.reset();
        this.adas.reset();
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
  private async switchGround(groundId: DrivingGroundId,signal?:AbortSignal): Promise<boolean> {
    const request = ++this.groundLoadRequest;
    if (groundId === this.activeGroundId && !this.ground.visualLoadingError) return true;
    this.hud.showMessage('正在加载地图资源', 10);
    let nextGround: DrivingGround;
    try {
      const timing = await prepareDrivingGround(groundId,undefined,'simulation');
      if (request !== this.groundLoadRequest || !this.running||signal?.aborted) return false;
      nextGround = await createDrivingGroundAsync(groundId, timing,signal,'simulation');
      await this.renderer.prepareGround(groundId);
      if(request!==this.groundLoadRequest||!this.running||signal?.aborted){nextGround.dispose();return false;}
    } catch (error) {
      if (request === this.groundLoadRequest&&this.running&&!signal?.aborted) this.hud.showMessage(`地图加载失败：${String(error)}`, 10);
      return false;
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

    previousGround.dispose();
    this.scenarioDebugger.clearAll();

    this.resetVehicleToGroundStart();
    this.lapTimer.configure(nextGround.lapCourse, this.activeVehicleId, this.snapshot);
    this.hud.setActiveMap(groundId);
    this.gameUI.setSelection(this.gameUI.state.vehicleId, groundId);
    this.storeGroundId(groundId);
    this.accelerationTestView?.setContext(nextGround.metadata.displayName ? getVehicleDescriptor(this.activeVehicleId).displayName : '', nextGround.metadata.displayName);
    this.drivingLabHud?.setContext(getVehicleDescriptor(this.activeVehicleId).displayName, nextGround.metadata.displayName);
    this.hud.showMessage(`${nextGround.metadata.displayName}已载入 · 车辆回到起点`, 2.5);
    this.renderer.domElement.focus();
    return true;
  }

  private resetVehicleToGroundStart(): void {
    if (this.blackBox) this.restartBlackBox('vehicle/map reset');
    this.accelerationTest?.interrupt('车辆已重置');
    this.laneAssistSelection.reset();
    this.laneDepartureWarning.reset();
    this.contacts.reset();
    this.cruiseControl.reset();
    this.adas.reset();
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
    this.lastEvFallbackActive = false;
    this.latestRoadRoughness = 0.08;
    this.runtime.simulation.reset();
    this.renderPose.reset(this.snapshot,this.vehicleVisual.config.staticBodyOffsetY);this.renderPoseVersion++;
    this.driverCamera.resetHeadLook(true);
    this.updateVehicleVisual(0);
    this.driverCamera.update(this.vehicleVisual.root, 0);
    if (this.visualDebug.enabled) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
  }

  
  private streamingTask?:RuntimeTaskHandle;
  private streamingSpeed=0;
  private streamingGround?:DrivingGround;
  private prepareGroundVisuals(ground:DrivingGround):void{ground.setRuntimeCoordinator?.(this.runtime);ground.beginVisualPreload?.();}

  private updateGroundVisuals(speed: number, frameMs?: number): void {
    this.streamingSpeed=speed;
    const ground = this.ground;
    if(this.streamingGround===ground&&this.streamingTask?.state==='queued')return;
    this.streamingTask?.cancel();
    this.streamingGround=ground;
    this.streamingTask=this.runtime.enqueue({
      id:'world:stream', phase:'streaming', priority:()=> 'visible',
      valid:()=>this.running&&ground===this.ground,
      step:()=>{
        ground.updatePlayerPosition?.(this.snapshot.x,this.snapshot.z,this.snapshot.yaw,this.streamingSpeed,frameMs);
        return true;
      },
    });
    void this.streamingTask.done.catch(error=>{if(this.running)console.error('World streaming failed',error);});
  }

  private updateWorldVisibility():void{this.publishRender(this.driverCamera.camera,0);}

  /** City sectors publish frozen world matrices. Update dynamic scene roots once,
   * rather than recursively revisiting the whole city for every mirror/pass. */
  

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

  private switchVehicle(vehicleId:VehicleId):void{
 if(vehicleId===this.activeVehicleId||!this.vehicleLoading.ready)return;
 this.accelerationTest?.interrupt('切换车辆');
 this.vehicleLoading.mark('Static asset prepare');
 this.vehicleLoading.enqueue('Static asset prepare',async()=>{const info=await this.renderer.prepareVehicle(vehicleId);this.pendingVehicleVisual=new SimulationVehicleRig(getVehicleDescriptor(vehicleId).visualConfig,info,this.renderer);});
 this.vehicleLoading.enqueue('Dynamic state init',()=>{this.installVehicle(vehicleId,this.pendingVehicleVisual!);this.pendingVehicleVisual=null;});
}

  private installVehicle(vehicleId: VehicleId, nextVisual: SimulationVehicleRig): void {
    if (vehicleId === this.activeVehicleId) return;
    this.playerMode.reset('Driving');
    this.vehicleInteraction.reset();
    this.walker.reset();
    this.laneAssistSelection.reset();
    this.laneDepartureWarning.reset();
    this.storeCurrentFuel();
    this.cruiseControl.reset();
    this.adas.reset();
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

    this.scene.remove(this.vehicleVisual.root);
    this.vehicleVisual.dispose();

    this.vehicleVisual = nextVisual;
    this.configureVehicleInteraction(nextVisual, descriptor.audioProfile, descriptor.acousticProfile);
    this.mirrorAdjustment = this.createMirrorAdjustment(nextVisual);
    this.dynamics = nextDynamics;
    this.dynamics.setDriverAssistOptions(this.hud.settings.driverAssistOptions);
    this.contacts.setCollisionDimensions(descriptor.visualConfig.collisionDimensions);
    this.snapshot = this.contacts.synchronize(nextDynamics);
    this.runtime.simulation.reset();
    this.renderPose.reset(this.snapshot,nextVisual.config.staticBodyOffsetY);this.renderPoseVersion++;
    this.feedback.setVehicleConfig(nextPhysicsConfig);
    this.feedback.reset(this.snapshot);
    this.haptics.stop();
    this.scene.add(nextVisual.root);
    this.driverCamera
      .setDriverEyePosition(descriptor.visualConfig.driverEyePosition)
      .resetHeadLook(true)
      .update(nextVisual.root, 0);

    this.activeVehicleId = vehicleId;
    this.hudHeightLevel = this.readStoredHudHeight(vehicleId);
    if (this.blackBox) this.restartBlackBox('vehicle changed');
    this.ignitionOn = this.snapshot.vehicleOperational;
    this.configureVehicleDisplays();
    this.lapTimer.configure(this.ground.lapCourse, vehicleId, this.snapshot);
    this.hud.setActiveVehicle(vehicleId);
    this.gameUI.setSelection(vehicleId, this.gameUI.state.mapId);
    this.hud.settings.setLightMode(retainedLightMode);
    this.hud.settings.setFuel(this.snapshot.fuel);
    this.hud.settings.setBattery(this.snapshot.powertrain.ev);
    this.hud.settings.setHudHeightLevel(this.hudHeightLevel);
    this.accelerationTestView?.setContext(descriptor.displayName, this.ground.metadata.displayName);
    this.drivingLabHud?.setContext(descriptor.displayName, this.ground.metadata.displayName);
    this.hud.settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
    this.lastShiftEventSequence = this.snapshot.shiftEventSequence;
    this.lastEngineRunning = this.snapshot.engineRunning ?? false;
    this.lastHandbrakeApplied = this.snapshot.handbrake > 0.05;
    this.lastParkingBrakeState = this.snapshot.parkingBrake.state;
    this.lastEmergencyBraking = this.snapshot.parkingBrake.emergencyBraking;
    this.lastEvFallbackActive = false;
    this.latestRoadRoughness = 0.08;
    this.updateVehicleVisual(0);
    this.storeVehicleId(vehicleId);
    if (this.visualDebug.enabled) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
    this.hud.showMessage(`已切换为${descriptor.displayName} · 车辆回到当前场地起点`, 2.4);
    this.renderer.domElement.focus();
  }

  private queueVehicleWarmup():void{
 if(this.integration)this.gameUI.setLoading('warmingRenderer','正在准备独立渲染线程');
 this.vehicleLoading.mark('Visual warmup');this.vehicleLoading.enqueue('Visual warmup',()=>this.renderer.ready);
}

  private createMirrorAdjustment(vehicle: SimulationVehicleRig): MirrorAdjustmentController {
    return new MirrorAdjustmentController({
      left: vehicle.getMirrorSurface('left'),
      right: vehicle.getMirrorSurface('right'),
    });
  }

  

 private syncAdasCollisionSample(speedBefore: number, speedAfter: number): void {
   this.adasCollisionSample.collided = false;
   this.adasCollisionSample.deltaSpeedMps = 0;
   this.adasCollisionContacts.length = 0;
   const col = this.contacts.collision;
   if (!col || !col.collided || col.contacts.length === 0) return;
   this.adasCollisionSample.collided = true;
   this.adasCollisionSample.deltaSpeedMps = Math.abs(speedBefore - speedAfter);
   const nearby = col.nearbyColliders;
   for (let i = 0; i < col.contacts.length; i++) {
     const c = col.contacts[i]!;
     let colType: ADASCollisionContactInfo['colliderType'];
     let maxH: number | undefined;
     for (let k = 0; k < nearby.length; k++) {
       if (nearby[k]!.id === c.colliderId) {
         colType = nearby[k]!.type;
         maxH = nearby[k]!.maxHeight;
         break;
       }
     }
     this.adasCollisionContacts.push({
       colliderId: c.colliderId,
       colliderType: colType,
       maxHeight: maxH,
       inwardSpeed: c.inwardSpeed,
       penetration: c.penetration,
     });
   }
 }

 private getVehicleHudInput(dt: number, visible: boolean): VehicleHUDFrameInput {
  const av = this.adasVehicleState;
  if (!this.adas.isEnabled) {
    const dims = this.vehicleVisual.config.dimensions;
    av.x = this.snapshot.x; av.y = this.snapshot.chassis.groundHeight; av.z = this.snapshot.z;
    av.yaw = this.snapshot.yaw; av.speed = this.snapshot.speed;
    av.vehicleWidth = dims.width; av.vehicleLength = dims.length;
  }
  const caps = getVehicleDescriptor(this.activeVehicleId).capabilities;
  const perception = this.adas.obstacleAvoidance.perception;
  let actors = perception.actors;
  let actorCount = perception.count;
  if (!this.adas.isEnabled) {
    actors = this.hudActorPool;
    actorCount = this.scenarioDebugger.queryNearbyActors(av.x, av.y, av.z, 130, this.hudActorPool);
  }
  const target = this.adasVisualQueryPose;
  target.x = av.x; target.z = av.z;
  const colliders = visible && (this.adas.isEnabled || actorCount > 0)
    ? this.contacts.collisionSystem.getNearbyColliders(target, 140)
    : undefined;
  const head = this.driverCamera.getHeadLook(this.mirrorHeadLook);
  const body = this.renderPose.body;
  const out = this.vehicleHudInput;
  out.dt = dt;
  out.visible = visible;
  out.windshieldVisible = this.gameUI.state.screen === 'driving' && this.playerMode.mode === 'Driving';
  out.hudHeightLevel = this.hudHeightLevel;
  out.vehicleId = this.activeVehicleId;
  out.ignitionOn = this.ignitionOn;
  out.snapshot = this.snapshot;
  out.sharedSpeedLimitKmh = this.sharedVehicleData?.navigation.speedLimit ?? null;
  out.navigationState = this.navigation.state;
  out.headLookYawRad = head.yaw;
  out.headLookPitchRad = head.pitch;
  out.bodyPitchRad = body.pitch;
  out.bodyRollRad = body.roll;
  out.adasEnabled = this.adas.isEnabled;
  out.adasStatus = this.adas.status;
  out.adasPlan = this.adas.planner.snapshot;
  out.adasObstacle = this.adas.obstacleAvoidance.assessment;
  out.adasRules = this.adas.trafficRules.decision;
  out.adasVehicle = av;
  out.samplesApproachLane = this.adas.planner.activeSampleApproachLane;
  out.theme = this.environment.time;
  out.rainIntensity = this.environment.rainIntensity;
  out.fogIntensity = this.environment.fogIntensity;
  out.wetness = this.environment.wetness;
  out.ground = this.ground;
  out.camera = this.visualDebug.renderCamera ?? this.driverCamera.camera;
  out.viewportWidth = window.innerWidth;
  out.viewportHeight = window.innerHeight;
  out.colliders = colliders;
  out.actors = actors;
  out.actorCount = actorCount;
  out.capabilities = caps;
  return out;
 }

 private renderContext():Record<string,unknown>{
  const showVehicleWorld = this.gameUI.state.screen === 'driving' && !this.settingsOpen && this.playerMode.mode === 'Driving';
  const input = this.getVehicleHudInput(0, showVehicleWorld);
  const adasVisual = this.vehicleHud.buildWorldPacket(input);
  return {debugGeometry:exportDebugOverlays(this.scene),adasVisual,visualDebug:this.visualDebug.enabled,debugContacts:this.visualDebug.enabled?{collision:this.contacts.collision?{vehicleOBB:{corners:this.contacts.collision.vehicleOBB.corners}}:null,wheelContacts:this.contacts.wheelContacts}:undefined,lights:{...this.lightController.state},ignitionOn:this.ignitionOn,mirror:{...this.mirrorContext},reversing:this.snapshot.transmission.selectedMode==='R',cockpit:this.visualDebug.renderCamera===null&&this.playerMode.mode==='Driving',overlay:this.playerMode.mode==='Driving',immersive:this.hud.immersiveMode};
 }
 private publishRender(camera:PerspectiveCamera,mode:number):void{
  this.visualDebug.updateInspectionCamera(this.vehicleVisual.root,this.driverCamera);if(typeof this.renderer.state.debugText==='string')this.visualDebug.receivePresentation(this.renderer.state.debugText);
  const rect=this.hud.getMirrorRect();
  this.renderer.publish(data=>{
   this.renderPose.writeCurrent(data,R.pose);data[R.poseEpoch]=this.renderPoseVersion;data[R.vehicle]=VEHICLE_CATALOG.findIndex(vehicle=>vehicle.id===this.activeVehicleId);data[R.world]=DRIVING_GROUND_CATALOG.findIndex(ground=>ground.id===this.activeGroundId);data[R.signalClock]=this.ground.getRenderClock?.()??0;data[R.roadHeight]=this.ground.getRoadHeightAt(this.snapshot.x,this.snapshot.z);data[R.focus]=this.snapshot.x;data[R.focus+1]=this.snapshot.z;data[R.focus+2]=this.snapshot.yaw;
   const attached=camera===this.driverCamera.camera&&this.playerMode.mode==='Driving'&&!this.playerMode.transitioning;camera.getWorldPosition(this.renderCameraPosition);camera.getWorldQuaternion(this.renderCameraQuaternion);if(attached){this.vehicleVisual.root.worldToLocal(this.renderCameraPosition);this.vehicleVisual.root.getWorldQuaternion(this.renderBodyInverse).invert();this.renderCameraQuaternion.premultiply(this.renderBodyInverse);}data[R.cameraSpace]=attached?1:0;this.renderCameraPosition.toArray(data,R.cameraPosition);this.renderCameraQuaternion.toArray(data,R.cameraQuaternion);data[R.cameraParams]=camera.fov;data[R.cameraParams+1]=camera.aspect;data[R.cameraParams+2]=camera.near;data[R.cameraParams+3]=camera.far;camera.projectionMatrix.toArray(data,R.cameraProjection);data[R.cameraLayers]=camera.layers.mask;
   data[R.mode]=mode;data[R.paused]=this.gameUI?.freezesSimulation?1:0;data[R.speed]=this.snapshot.speed;data[R.visible]=document.hidden?0:1;
   const feedback=this.feedback.state.cockpitOffset;data[R.bodyFeedback]=feedback.x;data[R.bodyFeedback+1]=feedback.y;data[R.bodyFeedback+2]=feedback.z;
   const wiper=this.wiperController;data[R.wiper]=wiper.angle;data[R.wiper+1]=wiper.previousAngle;data[R.wiper+2]=wiper.sweptMin;data[R.wiper+3]=wiper.sweptMax;data[R.wiper+4]=wiper.sweeping?1:0;
   data[R.weather]=WEATHER_SEQUENCE.indexOf(this.environment.weather);data[R.weather+1]=['DAY','DUSK','NIGHT'].indexOf(this.environment.time);
   for(const [i,key]of (['cloudiness','rainIntensity','fogIntensity','wetness','windIntensity','stormIntensity','lightningFlash']as const).entries())data[R.weather+2+i]=this.environment[key];
   for(const [i,id]of (['frontLeft','frontRight','rearLeft','rearRight']as const).entries()){data[R.alignment+i*2]=this.snapshot.wheels[id].steeringAngle;data[R.alignment+i*2+1]=this.snapshot.wheels[id].camberAngle??0;}
   data[R.access]=this.vehicleInteraction.driverDoorOpenFraction;data[R.access+1]=this.vehicleInteraction.driverWindowOpenFraction;
   this.vehicleVisual.getMirrorSurface('left').quaternion.toArray(data,R.mirrorQuaternion);this.vehicleVisual.getMirrorSurface('right').quaternion.toArray(data,R.mirrorQuaternion+4);
   data[R.overlay]=rect.left;data[R.overlay+1]=rect.top;data[R.overlay+2]=rect.width;data[R.overlay+3]=rect.height;data[R.simTime]=this.runtime.simulation.simulatedSeconds;data[R.rpm]=this.snapshot.rpm??0;data[R.spoiler]=this.snapshot.activeSpoilerDeployment??0;data[R.ignition]=this.ignitionOn?1:0;writeRenderLighting(data,this.lightController.state);
  });
  this.hud.setMirrorOverlayVisible(this.renderer.state.overlayVisible===true);
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

  private readStoredHudHeight(vehicleId: VehicleId): number {
    try {
      const stored = localStorage.getItem(`drivergame.hud-height.${vehicleId}.v1`);
      if (stored !== null && stored.trim() !== '' && Number.isFinite(Number(stored))) {
        return clampHUDHeightLevel(Number(stored));
      }
    } catch { /* Optional HUD height preference. */ }
    return 0;
  }

  private saveStoredHudHeight(vehicleId: VehicleId, level: number): void {
    try {
      localStorage.setItem(`drivergame.hud-height.${vehicleId}.v1`, String(clampHUDHeightLevel(level)));
    } catch { /* Optional HUD height preference. */ }
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
    this.hud.setMirrorPreviewSide(side);
  }

  private setLightMode(mode: VehicleLightMode): void {
    this.lightController.setMainLightMode(mode);
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
        this.adas.reset();
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
    if (!this.snapshot.engineRunning && this.snapshot.automaticEngineStop && !this.snapshot.startStop?.supported) {
      this.hud.showMessage('动力系统 · 发动机自动停机，车辆电源保持', 1.8);
      return;
    }
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
    this.renderer.domElement.addEventListener('dblclick', this.onPointerLockRequest);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pagehide', this.storeCurrentFuel);
    window.removeEventListener('keydown', this.onGlobalKeyDown);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('dblclick', this.onPointerLockRequest);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
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
    this.menuCamera.aspect = width / height; this.menuCamera.updateProjectionMatrix();
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
    if (event.code === 'F10' && !event.repeat) {
      event.preventDefault();
      this.scenarioDebugger.toggleHUD();
      return;
    }
    if(this.hud.isMapOpen || this.gameUI.state.screen !== 'driving')return;
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
    if(this.hud.isMapOpen || this.gameUI.state.screen !== 'driving')return;
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
    if (this.gameUI.state.screen !== 'driving') return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!this.draggingLook && !locked) return;
    const deltaX = locked ? event.movementX : event.clientX - this.pointerX;
    const deltaY = locked ? event.movementY : event.clientY - this.pointerY;
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

  private readonly onPointerLockRequest = (): void => {
    if (this.gameUI.state.screen !== 'driving') return;
    void this.renderer.domElement.requestPointerLock().catch(() => this.hud.showMessage('鼠标锁定不可用，仍可拖动观察', 2));
  };

  private readonly onPointerLockChange = (): void => {
    if (!document.pointerLockElement) this.gameUI.pause();
  };

  private syncTrajectoryResource(): void {
    const wanted = this.standaloneTrajectoryEnabled || (this.drivingLabEnabled && this.drivingLabModules.trajectory);
    if (wanted && !this.trajectoryPrediction) {
      this.trajectoryPrediction = new TrajectoryPrediction(this.scene);
    } else if (!wanted && this.trajectoryPrediction) {
      this.trajectoryPrediction.dispose();
      this.trajectoryPrediction = null;
    }
  }

  private armAccelerationTest(target?: AccelerationTarget): void {
    const test = this.accelerationTest;
    const diagnostics = this.accelerationDiagnostics;
    if (!test || !diagnostics) return;
    const desiredTarget = target ?? test.state.target;
    if (!test.arm(this.snapshot, this.input.peekState().throttle, desiredTarget)) return;
    const descriptor = getVehicleDescriptor(this.activeVehicleId);
    diagnostics.arm(
      {
        vehicleId: this.activeVehicleId,
        vehicleVersion: descriptor.version,
        groundId: this.ground.metadata.id,
        groundVersion: this.ground.metadata.version,
        weather: this.environment.weather,
        wetness: this.environment.wetness,
      },
      test.state,
    );
    this.accelerationTestView?.setContext(descriptor.displayName, this.ground.metadata.displayName);
    this.drivingLabHud?.setContext(descriptor.displayName, this.ground.metadata.displayName);
  }

  private syncAccelerationResources(autoArmOnEnable: boolean): void {
    const wanted = this.standaloneAccelEnabled || (this.drivingLabEnabled && this.drivingLabModules.acceleration);
    if (!wanted) {
      this.accelerationTestView?.dispose();
      this.accelerationTestView = null;
      this.accelerationTest = null;
      this.accelerationDiagnostics = null;
      return;
    }
    if (!this.accelerationTest) {
      this.accelerationTest = new AccelerationTest();
      let storage: Storage | undefined;
      try { storage = localStorage; } catch { /* Optional browser storage. */ }
      this.accelerationDiagnostics = new AccelerationRunDiagnostics(
        storage,
        () => this.input.gamepad?.getThrottleDiagnostics(),
      );
    }
    if (this.standaloneAccelEnabled && !this.accelerationTestView) {
      const view = this.accelerationTestView = new AccelerationTestView(this.host);
      view.onExport = () => this.accelerationDiagnostics?.serialize() ?? null;
      view.setContext(getVehicleDescriptor(this.activeVehicleId).displayName, this.ground.metadata.displayName);
      view.onArm = () => { this.armAccelerationTest(); this.renderer.domElement.focus(); };
      view.onTargetChange = target => { this.armAccelerationTest(target); this.renderer.domElement.focus(); };
      view.onStop = () => { this.accelerationTest?.stop(); this.renderer.domElement.focus(); };
    } else if (!this.standaloneAccelEnabled && this.accelerationTestView) {
      this.accelerationTestView.dispose();
      this.accelerationTestView = null;
    }
    if (autoArmOnEnable) {
      this.armAccelerationTest();
    }
  }

  private handleDrivingLabModuleToggle(moduleId: DrivingLabModuleId, enabled: boolean): void {
    this.drivingLabModules[moduleId] = enabled;
    if (moduleId === 'scenario') {
      if (!enabled && !this.scenarioDebugger.isHUDOpen) {
        this.scenarioDebugger.clearAll();
      }
      return;
    }
    if (moduleId === 'trajectory') {
      this.syncTrajectoryResource();
      return;
    }
    if (moduleId === 'acceleration') {
      this.syncAccelerationResources(enabled);
      return;
    }
  }

  private setDrivingLabEnabled(enabled: boolean): void {
    this.drivingLabEnabled = enabled;
    this.hud.settings.setDrivingLabEnabled(enabled);

    if (enabled) {
      if (!this.drivingLabHud) {
        this.drivingLabHud = new DrivingLabHUD(
          this.scenarioDebugger,
          {
            getPowertrain: () => this.dynamics?.powertrain,
            getSnapshot: () => this.snapshot.powertrain,
            getSpeedMps: () => this.snapshot?.speed ?? 0,
            getBrakeInput: () => this.snapshot?.brake ?? 0,
            getSnowModeActive: () => this.dynamics?.driveMode === 'SNOW',
            onSnowModeChange: snowEnabled => {
              if (!this.dynamics?.setSnowMode(snowEnabled)) return;
              this.snapshot = this.dynamics.getSnapshot();
              this.hud.showMessage(snowEnabled ? '驾驶模式 · SNOW 雪地' : `驾驶模式 · ${this.snapshot.driveMode ?? 'NORMAL'}`, 1.8);
            },
            onP2TerrainModeChange: mode => {
              if (!this.dynamics?.setTerrainMode(mode)) return;
              this.snapshot = this.dynamics.getSnapshot();
              this.hud.showMessage(mode === 'OFF' ? `返回公路模式 · ${this.snapshot.driveMode ?? 'STANDARD'}` : `全地形模式 · ${mode}`, 1.8);
            },
          },
          {
            onModuleToggle: (id, on) => this.handleDrivingLabModuleToggle(id, on),
            onRequestClose: () => this.setDrivingLabEnabled(false),
            onAccelArm: target => { this.armAccelerationTest(target); this.renderer.domElement.focus(); },
            onAccelStop: () => { this.accelerationTest?.stop(); this.renderer.domElement.focus(); },
            onAccelTargetChange: target => { this.armAccelerationTest(target); this.renderer.domElement.focus(); },
            onAccelExport: () => this.accelerationDiagnostics?.serialize() ?? null,
          },
          this.drivingLabModules,
          this.host,
        );
        const descriptor = getVehicleDescriptor(this.activeVehicleId);
        this.drivingLabHud.setContext(descriptor.displayName, this.ground.metadata.displayName);
      }
      this.syncTrajectoryResource();
      this.syncAccelerationResources(this.drivingLabModules.acceleration);
      return;
    }

    // Closing Driving Lab: release HUD, listeners & lab-only visualizer/test resources cleanly.
    this.drivingLabHud?.dispose();
    this.drivingLabHud = null;
    if (!this.scenarioDebugger.isHUDOpen) {
      this.scenarioDebugger.clearAll();
    }
    this.syncTrajectoryResource();
    this.syncAccelerationResources(false);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.accelerationTest?.interrupt('离开游戏页面', false);
      this.lapTimer.suspend(this.snapshot);
      this.runtime.suspend();
      this.cruiseControl.reset();
      this.adas.reset();
      this.lateralAssist.reset(); this.sharedVehicleData?.resetLanes();
      this.haptics.setEnabled(false);
    } else {
      this.runtime.suspend();
      this.renderPose.reset(this.snapshot,this.vehicleVisual.config.staticBodyOffsetY);this.renderPoseVersion++;
      this.lastFrameTime = performance.now();
    }
  };
}
