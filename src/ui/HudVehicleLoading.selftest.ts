import { Hud } from './Hud';
import { VehicleLoadingLifecycle } from '../vehicle/VehicleLoadingLifecycle';

/** Regression: the menu is removed 550 ms after entering the driving scene. */
export async function runHudVehicleLoadingSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++; if (!ok) throw new Error(`HUD vehicle loading: ${message}`);
  };
  const startButton = { disabled: false };
  const loadingStatus = { textContent: '', style: { cssText: '' }, hidden: true, isConnected: true };
  let overlayRemoved = false;
  // Only the loading callback needs these DOM objects. Preserve its real HUD
  // implementation and simulate the detached start menu without constructing WebGL.
  const hud = Object.assign(Object.create(Hud.prototype), {
    host: { querySelector: () => overlayRemoved ? null : startButton, append: () => {} },
    startButton, loadingStatus, vehicleLoading: false,
  }) as Hud;
  const loader = new VehicleLoadingLifecycle(phase => hud.setVehicleLoading(phase));
  loader.mark('Visual warmup');
  assert(startButton.disabled && !loadingStatus.hidden,'initial warmup blocks the start button');
  loader.advance();
  assert(!startButton.disabled && loadingStatus.hidden,'initial ready restores the start screen');
  overlayRemoved = true;
  for (const id of ['bmw-530li-g38','tesla-model-3-rwd','executive-lwb-2t']) {
    loader.mark('Static asset prepare');
    let installed = false;
    loader.enqueue('Instance creation',()=>{});
    loader.enqueue('Dynamic state init',()=>{installed=true;});
    loader.enqueue('Visual warmup',()=>Promise.resolve());
    loader.advance(); loader.advance(); loader.advance();
    await Promise.resolve(); loader.advance();
    assert(installed && loader.ready && loadingStatus.hidden,`${id}: switching after menu removal returns to ready`);
  }
  loader.dispose();
  return {assertions,consecutiveSwitches:3};
}
