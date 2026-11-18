import { Hud } from './Hud';
import { VehicleLoadingLifecycle } from '../vehicle/VehicleLoadingLifecycle';

/** Regression: loading remains observable after leaving the main menu. */
export async function runHudVehicleLoadingSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++; if (!ok) throw new Error(`HUD vehicle loading: ${message}`);
  };
  let loading = false;
  const onLoadingChange = (value: boolean) => { loading = value; };
  const loadingStatus = { textContent: '', style: { cssText: '' }, hidden: true, isConnected: true };
  let overlayRemoved = false;
  // Only the loading callback needs these DOM objects. Preserve its real HUD
  // implementation and simulate the detached start menu without constructing WebGL.
  const hud = Object.assign(Object.create(Hud.prototype), {
    host: { querySelector: () => overlayRemoved ? null : {}, append: () => {} },
    onLoadingChange, loadingStatus, vehicleLoading: false,
  }) as Hud;
  const loader = new VehicleLoadingLifecycle(phase => hud.setVehicleLoading(phase));
  loader.mark('Visual warmup');
  assert(loading && !loadingStatus.hidden,'initial warmup blocks driving commands');
  loader.advance();
  assert(!loading && loadingStatus.hidden,'initial ready restores driving commands');
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
