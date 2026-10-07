import {
  ACESFilmicToneMapping,
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  Mesh,
  PCFSoftShadowMap,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { EngineAudio } from '../audio/EngineAudio';
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
import { MirrorOverlayRenderer } from '../ui/MirrorOverlayRenderer';
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
  type VehicleSnapshot,
} from '../vehicle/physics';
import { CruiseControlController } from '../vehicle/control';
import { VehicleLightingController } from '../vehicle/control/VehicleLightingController';
import { VehicleFeedbackSystem } from '../vehicle/feedback/VehicleFeedbackSystem';
import { GamepadHaptics } from '../input/GamepadHaptics';
import { VehicleContactSystem } from '../vehicle/physics/VehicleContactSystem';
import { MirrorGeometryDebug } from '../camera/MirrorGeometryDebug';
import { ContactDebugView } from './ContactDebugView';
import { VehicleVisualDebugView } from './VehicleVisualDebugView';
import {
  VehicleLighting,
  VehicleVisual,
  type VehicleLightMode,
} from '../vehicle/visual';
import {
  DEFAULT_DRIVING_GROUND_ID,
  DRIVING_GROUND_CATALOG,
  createDrivingGround,
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
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private ground: DrivingGround;
  private vehicleVisual: VehicleVisual;
  private vehicleLighting: VehicleLighting;
  private mirrorAdjustment: MirrorAdjustmentController;
  private dynamics: VehicleDynamics;
  private readonly driverCamera: DriverCamera;
  private mirrors: MirrorSystem;
  private readonly mirrorOverlay: MirrorOverlayRenderer;
  private readonly input = new VehicleInputSystem();
  private readonly hud: Hud;
  private readonly engineAudio = new EngineAudio();
  private readonly cruiseControl = new CruiseControlController();
  private readonly lightController = new VehicleLightingController();
  private readonly feedback = new VehicleFeedbackSystem();
  private readonly haptics = new GamepadHaptics({ getGamepad: () => this.input.gamepad?.getActiveGamepad() ?? null });
  private readonly sun = new DirectionalLight(0xfff1cf, 3.4);
  private skyGeometry: SphereGeometry | null = null;
  private skyMaterial: ShaderMaterial | null = null;
  private readonly contacts: VehicleContactSystem;
  private readonly contactDebug: ContactDebugView;
  private readonly visualDebug: VehicleVisualDebugView;
  private readonly mirrorGeometryDebug = new MirrorGeometryDebug();

  private snapshot: VehicleSnapshot;
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
  private selectedMirror: AdjustableMirrorSide = 'left';
  private fuelLevel = 0.78;
  private coolantTemperatureC = 86;
  // A real stall leaves the electrical ignition on; an intentional stop does not.
  private ignitionOn = true;
  private lastHandbrakeApplied = false;
  private lastEngineRunning = true;
  private lastCruiseEventSequence = 0;
  private latestRoadRoughness = 0.08;
  private activeVehicleId: VehicleId;
  private activeGroundId: DrivingGroundId;

  constructor(host: HTMLElement) {
    this.hud = new Hud(host);
    this.contactDebug = new ContactDebugView(host);
    this.scene.add(this.contactDebug.root);
    this.visualDebug = new VehicleVisualDebugView(host);
    this.scene.add(this.visualDebug.root);
    this.scene.add(this.mirrorGeometryDebug.root);
    this.renderer = this.createRenderer();
    host.prepend(this.renderer.domElement);

    this.activeGroundId = this.readStoredGroundId();
    this.ground = createDrivingGround(this.activeGroundId);
    this.activeVehicleId = this.readStoredVehicleId();
    const initialVehicle = getVehicleDescriptor(this.activeVehicleId);
    this.contacts = new VehicleContactSystem(this.ground, initialVehicle.visualConfig.collisionDimensions);
    this.vehicleVisual = new VehicleVisual(initialVehicle.visualConfig);
    this.vehicleLighting = new VehicleLighting(this.vehicleVisual);
    this.mirrorAdjustment = this.createMirrorAdjustment(this.vehicleVisual);

    this.scene.background = new Color(0xaebfc0);
    this.scene.fog = new Fog(0xaebfc0, 180, 1_100);
    this.scene.add(this.ground.root, this.vehicleVisual.root);
    this.addLightingAndSky();

    const spawn = this.ground.spawnPose;
    this.dynamics = new VehicleDynamics(createVehiclePhysicsConfig(this.activeVehicleId), {
      x: spawn.position.x,
      z: spawn.position.z,
      yaw: spawn.yawRadians,
      gear: 'N',
    });
    this.snapshot = this.dynamics.getSnapshot();
    this.ignitionOn = this.snapshot.engineRunning;
    this.feedback.setVehicleConfig(this.dynamics.config);
    this.feedback.reset(this.snapshot);
    this.lastEngineRunning = this.snapshot.engineRunning;
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
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.unbindEvents();
    this.input.dispose();
    this.haptics.dispose();
    this.hud.dispose();
    this.contactDebug.dispose();
    this.visualDebug.dispose();
    this.mirrorGeometryDebug.dispose();
    this.vehicleLighting.dispose();
    this.mirrors.dispose();
    this.vehicleVisual.dispose();
    this.mirrorOverlay.dispose();
    this.ground.dispose();
    this.skyGeometry?.dispose();
    this.skyMaterial?.dispose();
    this.skyGeometry = null;
    this.skyMaterial = null;
    this.renderer.dispose();
    this.engineAudio.dispose();
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

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    const frameDt = Math.min(MAX_FRAME_TIME, Math.max(0, (time - this.lastFrameTime) / 1_000));
    this.lastFrameTime = time;
    this.accumulator = Math.min(this.accumulator + frameDt, FIXED_STEP * MAX_STEPS_PER_FRAME);

    // Automatic PRND buttons in F3 still need a live unified brake sample.
    // All propulsion/steering/accessory commands remain suppressed in menus.
    this.input.setEnabled(this.gameStarted && (!this.settingsOpen || this.snapshot.transmission.type !== 'MANUAL'));
    this.input.update(frameDt, this.snapshot.clutchEngagement);
    if (this.snapshot.transmission.type !== 'MANUAL' && this.input.controlMode !== 'normal') {
      this.input.setControlMode('normal', this.snapshot.clutchEngagement);
    }
    this.latestInput = this.filterSettingsInput(this.input.peekState());
    this.updateHeadLookFromInput(frameDt, this.latestInput);
    this.reportInputChanges(this.latestInput);

    let stepIndex = 0;
    while (this.accumulator >= FIXED_STEP && stepIndex < MAX_STEPS_PER_FRAME) {
      const driverControls = this.filterSettingsInput(this.input.consumeState());
      this.processAccessoryCommands(driverControls);
      const controls = this.cruiseControl.update(FIXED_STEP, driverControls, {
        available: getVehicleDescriptor(this.activeVehicleId).capabilities.cruiseControl,
        speedMetersPerSecond: this.snapshot.speed,
        engineRunning: this.snapshot.engineRunning,
        gear: this.snapshot.gear,
        driveSelector: this.snapshot.transmission.selectedMode ?? undefined,
      });
      this.reportCruiseControlEvent();

      this.snapshot = this.contacts.step(FIXED_STEP, controls, this.dynamics);
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
        ignitionOn: this.ignitionOn,
        actualGear: this.snapshot.gear,
        steeringWheelAngle: this.snapshot.steeringWheelAngle,
      });
      if (driverControls.cycleLights || driverControls.fogToggle) {
        const lights = this.lightController.state;
        if (lights.mainLightMode !== previousLightMode) this.storeLightMode(lights.mainLightMode);
        this.hud.settings.setLightMode(lights.mainLightMode);
        this.hud.settings.setFogLights(lights.fogLightsEnabled);
        this.hud.showMessage(driverControls.fogToggle ? (lights.fogLightsEnabled ? '前后雾灯已开启' : '雾灯已关闭') : this.getLightModeLabel(lights.mainLightMode), 1.6);
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
    this.updateAuxiliaryGauges(frameDt);
    this.vehicleLighting.applyState(this.lightController.state);
    this.haptics.setEnabled(this.gameStarted && !this.settingsOpen && !document.hidden && this.hud.settings.vibrationEnabled);
    this.haptics.update(frameDt, this.feedback.state.continuousRumble);
    this.hud.settings.setDriveSelector(this.snapshot.transmission.selectedMode ?? 'N', this.snapshot.transmission.type);

    this.updateVehicleVisual(frameDt);
    this.contactDebug.update(this.contacts, this.ground, frameDt, this.snapshot);
    // Maps with authored ambient animation (for example Subject 3 traffic
    // signals) opt in through an optional update hook.
    this.ground.update?.(frameDt);
    this.updateSun();
    this.driverCamera.update(this.vehicleVisual.root, frameDt);
    this.engineAudio.update(
      this.snapshot.rpm,
      this.snapshot.throttle,
      this.snapshot.engineRunning,
      {
        vehicleSpeed: Math.abs(this.snapshot.speed),
        engineLoad: MathUtils.clamp(Math.abs(this.snapshot.transmission.engineLoadTorque) / Math.max(1, this.dynamics.engine.getTorqueAtRPM(this.snapshot.rpm)), 0, 1),
        clutchEngagement: this.snapshot.clutchEngagement,
        roadRoughness: this.latestRoadRoughness,
      },
    );
    const cruiseStatus = this.cruiseControl.status;
    this.hud.update({
      ...this.snapshot,
      turbo: this.hud.isDebugOpen ? this.dynamics.engine.getTurboSnapshot() : undefined,
      inputSource: this.latestInput.source,
      cruiseAvailable: cruiseStatus.available,
      cruiseActive: cruiseStatus.active,
      cruiseTargetSpeedKmh: cruiseStatus.targetSpeedKmh,
      drivetrainVibrationIntensity: this.feedback.state.drivetrainVibrationIntensity,
      triggerDiagnostics: this.input.gamepad?.getThrottleDiagnostics(),
      throttleCommand: this.latestInput.throttle,
      feedback: this.feedback.state,
    }, frameDt);

    this.mirrors.render();
    this.visualDebug.update(this.vehicleVisual, this.contacts, this.driverCamera, this.mirrors);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.visualDebug.renderCamera ?? this.driverCamera.camera);
    this.mirrorOverlay.render(this.renderer, this.hud.getMirrorRect());

    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private updateVehicleVisual(dt: number): void {
    const feedbackOffset = this.feedback.state.cockpitOffset;
    // Suspension owns chassis pitch/roll. Only millimetre cabin vibration is
    // added here; the driver eye and physical mirror planes stay untouched.
    this.vehicleVisual.cockpitRoot.position.set(feedbackOffset.x, feedbackOffset.y, feedbackOffset.z);
    const contacts = this.contacts.wheelContacts;
    const chassis = this.snapshot.chassis;
    const roadHeight = contacts === null
      ? this.ground.getRoadHeightAt(this.snapshot.x, this.snapshot.z) : chassis.groundHeight;
    const roadPitch = contacts === null ? this.ground.getRoadPitchAt(
      this.snapshot.x,
      this.snapshot.z,
      this.snapshot.yaw,
    ) : chassis.terrainPitch;
    // Support heights capture a flat-topped curb even when all normals are up.
    // Never add the averaged normal's slope again to this fitted terrain plane.
    const roadRoll = contacts === null ? 0 : chassis.terrainRoll;
    this.vehicleVisual.setWorldPose(
      this.snapshot.x,
      roadHeight + 0.03 + chassis.rideOffset,
      this.snapshot.z,
      this.snapshot.yaw,
      roadPitch + chassis.pitch,
      roadRoll + chassis.roll,
    );
    if (contacts !== null) {
      this.vehicleVisual.setWheelWorldPositions({
        frontLeft: this.snapshot.wheels.frontLeft.worldPosition,
        frontRight: this.snapshot.wheels.frontRight.worldPosition,
        rearLeft: this.snapshot.wheels.rearLeft.worldPosition,
        rearRight: this.snapshot.wheels.rearRight.worldPosition,
      });
    } else {
      // Initial spawn has not performed a physical step yet. Use the same
      // dimension anchors and terrain height until the first contact state.
      this.vehicleVisual.setWheelGroundHeights({
        frontLeft: this.ground.getRoadHeightAt(this.snapshot.wheels.frontLeft.worldPosition.x, this.snapshot.wheels.frontLeft.worldPosition.z),
        frontRight: this.ground.getRoadHeightAt(this.snapshot.wheels.frontRight.worldPosition.x, this.snapshot.wheels.frontRight.worldPosition.z),
        rearLeft: this.ground.getRoadHeightAt(this.snapshot.wheels.rearLeft.worldPosition.x, this.snapshot.wheels.rearLeft.worldPosition.z),
        rearRight: this.ground.getRoadHeightAt(this.snapshot.wheels.rearRight.worldPosition.x, this.snapshot.wheels.rearRight.worldPosition.z),
      });
    }
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
    this.vehicleVisual.updateInstruments({
      speedKmh: Math.abs(this.snapshot.speed) * 3.6,
      rpm: this.snapshot.rpm,
      gear: this.snapshot.transmission.type !== 'MANUAL'
        ? this.snapshot.transmission.selectedMode === 'D' && this.snapshot.transmission.type !== 'CVT' ? `D${this.snapshot.gear}` : this.snapshot.transmission.selectedMode ?? 'N'
        : this.snapshot.gear,
      engineRunning: this.snapshot.engineRunning,
      fuelLevel: this.fuelLevel,
      coolantTemperatureC: this.coolantTemperatureC,
      handbrake: this.snapshot.handbrake,
      upshiftRecommended: this.snapshot.upshiftRecommended,
      indicators: {
        positionLights: this.lightController.state.positionLight,
        headlights: this.lightController.state.lowBeam,
        highBeam: this.lightController.state.effectiveHighBeam,
        fogLights: this.lightController.state.fogLightsEnabled,
        leftTurn: this.lightController.state.leftBlinkOn,
        rightTurn: this.lightController.state.rightBlinkOn,
        parkingBrake: this.snapshot.handbrake > 0.05,
        engineWarning: !this.snapshot.engineRunning,
        batteryWarning: !this.snapshot.engineRunning,
        cruise: this.cruiseControl.status.active,
        upshift: this.snapshot.upshiftRecommended,
        absWarning: this.snapshot.driverAssists.absWarning,
        tcsActive: this.snapshot.driverAssists.tcsLamp,
        tcsOff: this.snapshot.driverAssists.tcsOff,
      },
    }, dt);
    this.vehicleVisual.root.updateMatrixWorld(true);
  }

  private configureVehicleSettings(): void {
    const settings = this.hud.settings;
    this.dynamics.setDriverAssistOptions(settings.driverAssistOptions);
    settings.onDriverAssistsChange = options => this.dynamics.setDriverAssistOptions(options);
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
      this.input.setEnabled(this.gameStarted && (!visible || this.snapshot.transmission.type !== 'MANUAL'));
      if (visible) this.haptics.setEnabled(false);
      if (visible) {
        this.cruiseControl.reset();
        this.showMirrorPreview(this.selectedMirror);
        settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
      } else {
        this.showMirrorPreview('right');
        this.renderer.domElement.focus();
      }
    };
    settings.onLightModeChange = (mode) => this.setLightMode(mode);
    settings.setFogLights(this.lightController.state.fogLightsEnabled);
    settings.onFogToggle = () => {
      const lights = this.lightController.toggleFog();
      this.vehicleLighting.applyState(lights);
      settings.setLightMode(lights.mainLightMode);
      settings.setFogLights(lights.fogLightsEnabled);
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
        label: ground.label,
        description: ground.description,
      })),
      this.activeGroundId,
    );
    this.hud.onMapChange = (groundId) => {
      if (!isDrivingGroundId(groundId)) return;
      this.switchGround(groundId);
    };
  }

  private switchGround(groundId: DrivingGroundId): void {
    if (groundId === this.activeGroundId) return;
    const nextGround = createDrivingGround(groundId);
    const previousGround = this.ground;
    this.scene.remove(previousGround.root);
    this.ground = nextGround;
    this.contacts.setGround(nextGround);
    this.activeGroundId = groundId;
    this.scene.add(nextGround.root);
    previousGround.dispose();

    this.resetVehicleToGroundStart();
    this.hud.setActiveMap(groundId);
    this.storeGroundId(groundId);
    this.hud.showMessage(`${nextGround.metadata.displayName}已载入 · 车辆回到起点`, 2.5);
    this.renderer.domElement.focus();
  }

  private resetVehicleToGroundStart(): void {
    this.contacts.reset();
    this.cruiseControl.reset();
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
      engineRPM: engineRunning ? this.dynamics.config.engine.idleRPM : 0,
    });
    this.feedback.reset(this.snapshot);
    this.haptics.stop();
    this.lightController.update(0, createNeutralVehicleInputState(), {
      ignitionOn: this.ignitionOn, actualGear: this.snapshot.gear,
      steeringWheelAngle: this.snapshot.steeringWheelAngle,
    });
    this.lastEngineRunning = this.snapshot.engineRunning;
    this.lastShiftEventSequence = this.snapshot.shiftEventSequence;
    this.lastHandbrakeApplied = this.snapshot.handbrake > 0.05;
    this.latestRoadRoughness = 0.08;
    this.accumulator = 0;
    this.driverCamera.resetHeadLook(true);
    this.updateVehicleVisual(0);
    this.driverCamera.update(this.vehicleVisual.root, 0);
    if (this.visualDebug.enabled) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
  }

  private configureVehicleSelection(): void {
    this.hud.setVehicleOptions(
      VEHICLE_CATALOG.map((vehicle) => ({
        id: vehicle.id,
        label: vehicle.name,
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
    if (vehicleId === this.activeVehicleId) return;
    this.cruiseControl.reset();
    const descriptor = getVehicleDescriptor(vehicleId);
    const spawn = this.ground.spawnPose;
    const controlMode = this.input.controlMode;
    const clutchEngagement = controlMode === 'manual-clutch'
      ? 1 - this.input.manualClutchPedal
      : 0;
    const nextVisual = new VehicleVisual(descriptor.visualConfig);
    const nextPhysicsConfig = createVehiclePhysicsConfig(vehicleId);
    const engineRunning = this.snapshot.engineRunning;
    const nextDynamics = new VehicleDynamics(nextPhysicsConfig, {
      x: spawn.position.x,
      z: spawn.position.z,
      yaw: spawn.yawRadians,
      gear: 'N',
      controlMode,
      clutchEngagement,
      engineRunning,
      engineRPM: engineRunning ? nextPhysicsConfig.engine.idleRPM : 0,
    });

    const retainedLightMode = this.lightController.state.mainLightMode;
    this.mirrors.dispose();
    this.vehicleLighting.dispose();
    this.scene.remove(this.vehicleVisual.root);
    this.vehicleVisual.dispose();

    this.vehicleVisual = nextVisual;
    this.vehicleLighting = new VehicleLighting(nextVisual);
    this.vehicleLighting.applyState(this.lightController.state);
    this.mirrorAdjustment = this.createMirrorAdjustment(nextVisual);
    this.dynamics = nextDynamics;
    this.dynamics.setDriverAssistOptions(this.hud.settings.driverAssistOptions);
    this.contacts.setCollisionDimensions(descriptor.visualConfig.collisionDimensions);
    this.snapshot = nextDynamics.getSnapshot();
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
    this.hud.setActiveVehicle(vehicleId);
    this.hud.settings.setLightMode(retainedLightMode);
    this.hud.settings.setMirrorAdjustment(this.mirrorAdjustment.get(this.selectedMirror));
    this.lastShiftEventSequence = this.snapshot.shiftEventSequence;
    this.lastEngineRunning = this.snapshot.engineRunning;
    this.lastHandbrakeApplied = this.snapshot.handbrake > 0.05;
    this.latestRoadRoughness = 0.08;
    this.updateVehicleVisual(0);
    this.storeVehicleId(vehicleId);
    if (this.visualDebug.enabled) this.mirrorGeometryDebug.anchorVehicle(this.vehicleVisual.root);
    this.hud.showMessage(`已切换为${descriptor.name} · 车辆回到当前场地起点`, 2.4);
    this.renderer.domElement.focus();
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
      hiddenDuringReflection: [vehicle.cockpitRoot],
      autoBindSurfaces: true,
      mirrors: {
        left: {
          surface: leftMirror,
          size: vehicle.config.leftMirrorTransform.size,
          resolution: [640, 336],
          cropToMirror: true,
          viewportPadding: 0.025,
          clipBias: 0.003,
        },
        right: {
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

  private readStoredGroundId(): DrivingGroundId {
    try {
      const stored = localStorage.getItem('drivergame.ground-id.v1');
      if (stored !== null && isDrivingGroundId(stored)) return stored;
    } catch {
      // Fall back to the default when storage is disabled.
    }
    return DEFAULT_DRIVING_GROUND_ID;
  }

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
    this.hud.settings.setFogLights(this.lightController.state.fogLightsEnabled);
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

  private getLightModeLabel(mode: VehicleLightMode): string {
    return { off: '灯光已关闭', position: '示廓灯 / 尾灯', low: '近光灯', high: '远光灯' }[mode];
  }

  private processAccessoryCommands(input: VehicleInputState): void {
    if (input.engineStart) {
      if (!this.snapshot.engineRunning) this.engineAudio.onIgnitionStart();
      const result = this.dynamics.requestEngineToggle();
      if (result === 'started') {
        this.ignitionOn = true;
        this.engineAudio.onEngineStart();
      } else if (result === 'stopped') {
        this.ignitionOn = false;
        this.engineAudio.onEngineStop();
      } else {
        this.hud.showMessage(this.snapshot.transmission.type === 'MANUAL' ? '无法启动 · 请挂空挡或把离合完全踩下' : '无法启动 · 请先选择 P 或 N 挡', 2.4);
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
      drivetrainLashJolt: this.snapshot.drivetrainLash.joltIntensity,
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    return renderer;
  }

  private addLightingAndSky(): void {
    const hemisphere = new HemisphereLight(0xd9edf2, 0x52613e, 2.1);
    this.scene.add(hemisphere);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2_048, 2_048);
    this.sun.shadow.camera.left = -75;
    this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 75;
    this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.00012;
    this.scene.add(this.sun, this.sun.target);

    this.skyMaterial = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new Color(0x6f9fb0) },
        horizonColor: { value: new Color(0xd4d8cf) },
        groundColor: { value: new Color(0x8e9c84) },
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
    this.scene.add(sky);
  }

  private updateSun(): void {
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
    if (handbrakeApplied !== this.lastHandbrakeApplied) {
      this.lastHandbrakeApplied = handbrakeApplied;
      this.hud.showMessage(
        handbrakeApplied ? '驻车制动已拉起' : '驻车制动已释放',
        1.6,
      );
    }
  }

  private reportEngineState(): void {
    if (this.snapshot.engineRunning === this.lastEngineRunning) return;
    this.lastEngineRunning = this.snapshot.engineRunning;
    this.hud.showMessage(
      this.snapshot.engineRunning
        ? '发动机已启动'
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
    window.addEventListener('keydown', this.onGlobalKeyDown);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
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

  private readonly onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyC') this.driverCamera.resetHeadLook();
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
    if (event.button !== 0) return;
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
    this.driverCamera.addHeadLook(-deltaX * 0.0026, -deltaY * 0.0022);
  };

  private readonly onPointerUp = (): void => {
    this.draggingLook = false;
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.accumulator = 0;
      this.cruiseControl.reset();
      this.haptics.setEnabled(false);
    } else {
      this.lastFrameTime = performance.now();
    }
  };
}
