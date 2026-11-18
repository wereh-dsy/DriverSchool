import { vehicles, maps } from 'virtual:game-catalog';
import { platform } from '../../platform';
import { GameUIController } from '../../ui/controller/GameUIController';
import { GameShell } from '../../ui/screens/GameShell';
import { nextPaint, loadingMark } from '../../loading/Loading';
import type { DrivingGame } from '../DrivingGame';
import type { MenuScene } from './MenuScene';
import type { ControlSettingsPanel } from '../../ui/ControlSettingsPanel';
import type { UIScreen } from '../../ui/state/GameUIState';

/** Thin startup orchestration. Phase 1 commands and UI remain the only UI boundary. */
export class StartupApplication {
  readonly ui: GameUIController;
  private readonly shell: GameShell;
  private readonly runtimeHost = document.createElement('div');
  private menu?: MenuScene;
  private menuTask: Promise<void>;
  private game?: DrivingGame;
  private starting = false;
  private disposed = false;
  private settings?: ControlSettingsPanel;
  private settingsCleanup?: () => void;
  constructor(private readonly host: HTMLElement) {
    loadingMark('bootstrap');
    host.replaceChildren(this.runtimeHost);
    this.runtimeHost.style.cssText = 'width:100%;height:100%';
    const vehicleId = this.stored('drivergame.vehicle-id.v1', vehicles.map(v => v.id), 'family-sedan');
    const search = new URLSearchParams(location.search);
    const alias = search.get('city');
    const preferredMap = search.get('ground') ?? (alias === 'editor' ? 'city-editor-map' : ['main', 'city-main'].includes(alias ?? '') ? 'city-main' : alias === 'preset-showcase' ? alias : null);
    const mapId = preferredMap && maps.some(m => m.id === preferredMap) ? preferredMap : this.stored('drivergame.ground-id.v1', maps.map(m => m.id), 'road-course');
    this.ui = new GameUIController({
      startDrive: restart => this.startDrive(restart),
      selectVehicle: id => this.selectVehicle(id), selectMap: id => this.selectMap(id),
      openSettings: section => { void this.openSettings(section); },
      screenChanged: screen => this.screenChanged(screen),
      hudChanged: profile => { host.dataset.hudProfile = profile; this.game?.uiHudChanged(profile); },
    }, platform.storage, vehicleId, mapId);
    this.shell = new GameShell(host, this.ui, platform, vehicles, maps);
    this.ui.setBusy(false); host.dataset.menuOpen = 'true';
    void this.ui.loadPreferences(); loadingMark('uiInteractive');
    this.menuTask = this.prepareMenu().catch(error => { this.ui.setLoading('error', '车辆展示暂不可用，可尝试开始驾驶'); console.error(error); });
  }
  private stored(key: string, ids: readonly string[], fallback: string): string {
    try { const value = localStorage.getItem(key); return value && ids.includes(value) ? value : fallback; } catch { return fallback; }
  }
  private persist(key: string, id: string): void { try { localStorage.setItem(key, id); } catch { /* Optional storage. */ } }
  private async prepareMenu(): Promise<void> {
    await nextPaint();
    const { MenuScene } = await import('./MenuScene');
    if (this.starting || this.disposed) return;
    this.menu = new MenuScene(this.runtimeHost);
    await this.menu.select(this.ui.state.vehicleId);
  }
  private selectVehicle(id: string): void {
    if (!vehicles.some(v => v.id === id)) return;
    this.ui.setSelection(id, this.ui.state.mapId); this.settings?.setActiveVehicle(id); this.persist('drivergame.vehicle-id.v1', id);
    if (!this.game) void this.menu?.select(id).catch(error => {console.error(error); this.ui.setLoading('error', '车辆展示暂不可用，可尝试开始驾驶');});
    else this.game.uiSelectVehicle(id);
    // Map runtime remains deferred until the driving entry command.
  }
  private selectMap(id: string): void {
    if (!maps.some(m => m.id === id)) return;
    this.ui.setSelection(this.ui.state.vehicleId, id); this.settings?.setActiveMap(id); this.persist('drivergame.ground-id.v1', id);
  }
  private screenChanged(screen: UIScreen): void {
    this.host.dataset.menuOpen = String(screen !== 'driving');
    this.menu?.setScreen(screen); this.game?.uiScreenChanged(screen);
  }
  private async startDrive(restart: boolean): Promise<void> {
    loadingMark('drivePreload');
    this.starting = true; this.ui.setLoading('loadingWorld', '正在准备驾驶场地');
    await nextPaint();
    if (!this.game) {
      // Runtime modules and the already selected exterior prepare independently.
      const runtimeModule = import('../DrivingGame');
      await this.menuTask.catch(() => {});
      const shared = await this.menu?.transfer();
      this.settings?.dispose(); this.settings = undefined; this.settingsCleanup?.();
      const { DrivingGame } = await runtimeModule;
      const options = { ...shared, ui: this.ui, vehicleId: this.ui.state.vehicleId, groundId: this.ui.state.mapId };
      // Runtime validates stable IDs at its own boundary.
      this.game = await DrivingGame.create(this.runtimeHost, options as Parameters<typeof DrivingGame.create>[1]);
      if (this.disposed) { this.game.dispose(); return; }
      this.game.start();
    }
    await this.game.prepareDriveFromUI(this.ui.state.vehicleId, this.ui.state.mapId, restart);
  }
  private async openSettings(section: 'vehicle' | 'controls' | 'world'): Promise<void> {
    if (this.game) { this.game.uiSettings(section); return; }
    const [{ ControlSettingsPanel }, { KeyboardInput }, { getVehicleDescriptor, isVehicleId }] = await Promise.all([
      import('../../ui/ControlSettingsPanel'), import('../../input/KeyboardInput'), import('../../vehicle/VehicleCatalog'),
    ]);
    if (this.disposed || this.ui.state.screen !== 'settings') return;
    if (!this.settings) {
      const settings = this.settings = new ControlSettingsPanel(this.host), keyboard = new KeyboardInput({ target: null });
      this.settingsCleanup = () => keyboard.dispose();
      settings.setBindings(keyboard.getBindings());
      settings.onBindingChange = (action, key) => { keyboard.setBinding(action, key); settings.setBindings(keyboard.getBindings()); };
      settings.onBindingReset = () => { keyboard.resetBindings(); settings.setBindings(keyboard.getBindings()); };
      settings.onImmersiveModeChange = enabled => this.ui.setHudProfile(enabled ? 'off' : 'standard');
      settings.onVisibilityChange = visible => this.ui.settingsVisibility(visible);
      settings.onVehicleChange = id => { this.selectVehicle(id); if (isVehicleId(id)) settings.setAssistanceSupport(getVehicleDescriptor(id).capabilities); settings.setSessionAvailable(false); }; settings.onMapChange = id => this.selectMap(id);
      settings.setVehicleOptions(vehicles.map(v => ({id:v.id,label:v.name,description:v.description})), this.ui.state.vehicleId);
      settings.setMapOptions(maps.map(m => ({id:m.id,label:m.name,description:m.description})), this.ui.state.mapId);
      settings.setSessionAvailable(false);
    }
    if (isVehicleId(this.ui.state.vehicleId)) this.settings.setAssistanceSupport(getVehicleDescriptor(this.ui.state.vehicleId).capabilities);
    this.settings.setImmersiveMode(this.ui.state.hudProfile === 'off');
    this.settings.setSessionAvailable(false); this.settings.openSection(section);
  }
  dispose(): void {
    this.disposed = true; this.shell.dispose(); this.settings?.dispose(); this.settingsCleanup?.();
    if (this.game) this.game.dispose(); else void this.menuTask.finally(() => this.menu?.dispose());
  }
}
