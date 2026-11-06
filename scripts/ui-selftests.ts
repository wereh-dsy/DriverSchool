import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameUIController } from '../src/ui/controller/GameUIController';
import { createFileStorage, containedFile } from '../desktop/files';
import { validStorageKey } from '../src/platform/Platform';
import { runHudVehicleLoadingSelfTest } from '../src/ui/HudVehicleLoading.selftest';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { runGamepadHapticsSelfTest } from '../src/input/GamepadHaptics.selftest';
import { VEHICLE_CATALOG } from '../src/vehicle/VehicleCatalog';
import { vehicleViewModel } from '../src/game/GameUIViewModels';
import { EngineAudio } from '../src/audio/EngineAudio';

const calls: unknown[] = [];
const values = new Map<string, string>();
const ui = new GameUIController({
  startDrive: restart => calls.push(['start', restart]), selectVehicle: id => calls.push(['vehicle', id]),
  selectMap: id => calls.push(['map', id]), openSettings: section => calls.push(['settings', section]),
  screenChanged: () => {}, hudChanged: () => {},
}, { async loadText(key) { return values.get(key) ?? null; }, async saveText(key, value) { values.set(key, value); } }, 'sedan', 'road');
ui.resume(); assert.equal(ui.state.screen, 'main', 'no invalid continue session');
ui.startDrive(); ui.selectVehicle('other'); assert.equal(calls.length, 0, 'loading gates commands');
ui.setBusy(false); ui.startDrive(); assert.deepEqual(calls, [['start', false]]);
assert.equal(ui.freezesSimulation, false); ui.pause(); assert.equal(ui.freezesSimulation, true);
ui.openSettings('controls'); ui.settingsVisibility(true); ui.settingsVisibility(false);
assert.equal(ui.state.screen, 'pause', 'pause settings return to paused session');
ui.resume(); assert.equal(calls.length, 2, 'resume must not restart vehicle');
ui.settingsVisibility(true); assert.equal(ui.freezesSimulation, false, 'legacy F3 keeps existing physics policy');
ui.settingsVisibility(false); assert.equal(ui.state.screen, 'driving');
ui.navigate('main'); assert.equal(ui.state.hasSession, true); ui.resume(); assert.equal(calls.length, 2);
ui.restart(); assert.deepEqual(calls.at(-1), ['start', true]);
ui.setHudProfile('training'); await ui.loadPreferences(); assert.equal(ui.state.hudProfile, 'training');
assert.doesNotThrow(() => JSON.stringify(ui.state));
values.set('config/ui.json', '{broken'); await ui.loadPreferences(); assert.equal(ui.state.hudProfile, 'training');
for (const key of ['../escape', 'config/../escape', 'config/C:\\file', 'config/sub/file', 'saves/../../escape']) assert.equal(validStorageKey(key), false);
const temp = await mkdtemp(join(tmpdir(), 'driverschool-ui-'));
try {
  const storage = createFileStorage(temp);
  assert.equal(await storage.loadText('config/missing.json'), null);
  await storage.saveText('config/ui.json', '{"hudProfile":"standard"}');
  assert.equal(await storage.loadText('config/ui.json'), '{"hudProfile":"standard"}');
  await assert.rejects(storage.saveText('config/../escape', 'x'));
  assert.throws(() => containedFile(temp, '../outside'));
  const outside = join(temp, 'outside'); await mkdir(outside);
  await symlink(outside, join(temp, 'mods'), 'junction');
  // Junctions within application data are allowed; outside-root paths are rejected.
  await storage.saveText('mods/test.txt', 'local');
} finally { await rm(temp, { recursive: true, force: true }); }
for (const descriptor of VEHICLE_CATALOG) {
  const model = vehicleViewModel(descriptor);
  assert.ok(Number.parseFloat(model.power) > 0); assert.ok(model.transmission.length > 0);
  assert.equal(JSON.stringify(model).includes('visualConfig'), false);
}
const tankModel=vehicleViewModel(VEHICLE_CATALOG.find(vehicle=>vehicle.id==='tank-500-hi4-t')!);
assert.match(tankModel.name,/Tank 500/);assert.match(tankModel.powertrain,/P2/);assert.equal(tankModel.transmission,'9HAT');
console.log('UI controller / desktop storage / serializable vehicle models: PASS');
const gainTargets: number[] = [];
const audio = Object.assign(new EngineAudio(), {
  context: { currentTime: 0 }, master: { gain: { setTargetAtTime(value: number) { gainTargets.push(value); } } },
});
audio.setMenuDucked(true); audio.setMenuDucked(false);
assert.deepEqual(gainTargets, [.1, .58], 'pause lowers the shared audio bus and resume restores it');
console.log('Menu audio attenuation / restoration: PASS');
console.log('HUD loading:', await runHudVehicleLoadingSelfTest());
console.log('Existing Xbox / unified input:', runVehicleInputSystemSelfTest());
console.log('Existing haptics:', await runGamepadHapticsSelfTest());
