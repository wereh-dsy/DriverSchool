import '../src/styles.css';
import '../src/ui/design/system.css';
import { StartupApplication } from '../src/game/startup/StartupApplication';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';

// Development-only access to the actual StartupApplication/DrivingGame. This
// page is not a Vite production input and never enters the published payload.
const app = new StartupApplication(document.querySelector<HTMLElement>('#app')!);
app.ui.selectVehicle('byd-qin-plus-dmi-210-2026'); app.ui.selectMap('road-course');
const api: any = (window as any).qinRuntimeAudit = { ready: false, errors: [], samples: [] };
window.addEventListener('error', e => api.errors.push(e.message));
window.addEventListener('unhandledrejection', e => api.errors.push(String(e.reason)));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const neutral = createNeutralVehicleInputState();
let command = { ...neutral, brake: 1 };
try {
  await wait(1200); app.ui.startDrive();
  const deadline = performance.now() + 90000;
  while (app.ui.state.screen !== 'driving') {
    if (app.ui.state.loading.phase === 'error' || performance.now() > deadline) throw Error(app.ui.state.loading.message);
    await wait(50);
  }
  const game = (app as any).game;
  game.input.consumeState = () => command;
  await game.engineAudio.start();
  const origin = { x: game.snapshot.x, z: game.snapshot.z, yaw: game.snapshot.yaw };
  api.view = (exterior: boolean) => {
    if (game.visualDebug.enabled) game.visualDebug.toggle();
    if (exterior) {
      game.visualDebug.toggle(); game.visualDebug.cycleInspectionView(); game.visualDebug.cycleInspectionView();
      game.visualDebug.root.visible = false; game.visualDebug.panel.hidden = true;
    }
  };
  api.scenario = (mode: string, speed: number, throttle: number, soc: number, exterior = false) => {
    command = { ...neutral, throttle, brake: speed === 0 && throttle === 0 ? 1 : 0 };
    game.snapshot = game.dynamics.reset({ ...origin, driveSelector: 'D', speed, stateOfCharge: soc });
    game.snapshot = game.contacts.synchronize(game.dynamics);
    game.dynamics.powertrain.setHybridMode(mode, .65);
    api.view(exterior);
  };
  api.snapshot = () => {
    const s = game.snapshot, a = game.engineAudio, h = s.powertrain.ehs;
    const gl = game.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { errors: api.errors, speedKmh: s.speedKmh, ehs: h, rpm: s.rpm, engineRunning: s.engineRunning,
      camera: game.visualDebug.renderCamera ? 'exterior' : 'cockpit', audio: { state: a.context?.state,
        firingHz: a.exhaustPulse?.frequency.value, engineGain: a.engineBus?.gain.value,
        exhaustGain: a.exhaustGain?.gain.value, motorHz: a.electricMotor?.frequency.value, motorGain: a.electricGain?.gain.value },
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webglVersion: gl.getParameter(gl.VERSION), triangles: game.renderer.info.render.triangles,
      drawings: game.renderer.info.render.calls, ready: game.vehicleLoading.ready };
  };
  api.navigation = () => game.vehicleVisual.cockpitRoot.cycleCenterDisplayPage();
  api.record = async (ms: number) => {
    const a = game.engineAudio, ctx: AudioContext = a.context;
    await a.resume();
    const recorder = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
    const blocks: Float32Array[] = [];
    recorder.onaudioprocess = e => blocks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    a.master.connect(recorder); recorder.connect(mute); mute.connect(ctx.destination);
    await wait(ms); a.master.disconnect(recorder); recorder.disconnect(); mute.disconnect();
    const samples = blocks.reduce((n, b) => n + b.length, 0), bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
    const str = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, ctx.sampleRate, true); view.setUint32(28, ctx.sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, samples * 2, true);
    let at = 44, energy = 0, peak = 0;
    for (const block of blocks) for (const sample of block) {
      energy += sample * sample; peak = Math.max(peak, Math.abs(sample));
      view.setInt16(at, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true); at += 2;
    }
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { base64: btoa(binary), rms: Math.sqrt(energy / Math.max(1, samples)), peak, samples, sampleRate: ctx.sampleRate };
  };
  api.scenario('EV', 0, 0, .85); api.ready = true; document.title = 'QIN GPU/AUDIO READY';
} catch (error) { api.errors.push(String(error)); document.title = 'QIN AUDIT ERROR'; }
