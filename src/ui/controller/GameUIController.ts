import type { StorageService } from '../../platform/Platform';
import type { GameUIState, HudProfile, UIScreen } from '../state/GameUIState';
export interface GameUICommands {
  startDrive(restart: boolean): void | Promise<void>;
  selectVehicle(id: string): void;
  selectMap(id: string): void;
  openSettings(section: 'vehicle' | 'controls' | 'world'): void;
  screenChanged(screen: UIScreen): void;
  hudChanged(profile: HudProfile): void;
}
/** Commands and serializable state; independent of DOM, renderer and desktop. */
export class GameUIController {
  readonly state: GameUIState;
  onChange?: (state: Readonly<GameUIState>) => void;
  private settingsReturn: UIScreen = 'main';
  get freezesSimulation(): boolean { return this.state.screen !== 'driving' && !(this.state.screen === 'settings' && this.settingsReturn === 'driving'); }
  constructor(private readonly commands: GameUICommands, private readonly storage: StorageService,
    vehicleId: string, mapId: string) {
    this.state = { loading: {phase:'idle',message:''}, screen: 'main', hasSession: false, busy: true, hudProfile: 'standard', vehicleId, mapId };
  }
  async loadPreferences(): Promise<void> {
    try {
      const raw = await this.storage.loadText('config/ui.json');
      const profile = raw ? JSON.parse(raw).hudProfile : undefined;
      if (['realistic', 'standard', 'training', 'off'].includes(profile)) this.setHudProfile(profile, false);
    } catch { /* Optional preference, default remains usable. */ }
  }
  navigate(screen: UIScreen): void {
    if (screen === this.state.screen) return;
    if ((screen === 'driving' || screen === 'pause') && !this.state.hasSession) return;
    this.state.screen = screen; this.commands.screenChanged(screen); this.emit();
  }
  startDrive(): void {
    if (this.state.busy) return;
    this.enterDrive(this.state.hasSession);
  }
  private enterDrive(restart: boolean): void {
    const result = this.commands.startDrive(restart);
    if (result instanceof Promise) {
      this.setBusy(true); this.navigate('loading');
      void result.then(() => {
        this.state.hasSession = true; this.setBusy(false); this.setLoading('ready'); this.navigate('driving');
      }, error => {
        console.error('Drive loading failed', error);
        this.setBusy(false); this.setLoading('error', '场景暂时无法载入，请返回主菜单重试。');
      });
    } else { this.state.hasSession = true; this.navigate('driving'); }
  }
  setLoading(phase: GameUIState['loading']['phase'], message = ''): void {
    this.state.loading = { phase, message }; this.emit();
  }
  resume(): void { if (!this.state.busy) this.navigate('driving'); }
  pause(): void { if (this.state.screen === 'driving') this.navigate('pause'); }
  restart(): void {
    if (!this.state.hasSession || this.state.busy) return;
    this.enterDrive(true);
  }
  selectVehicle(id: string): void { if (!this.state.busy) this.commands.selectVehicle(id); }
  selectMap(id: string): void { if (!this.state.busy) this.commands.selectMap(id); }
  openSettings(section: 'vehicle' | 'controls' | 'world' = 'vehicle'): void {
    if (this.state.screen !== 'settings') this.settingsReturn = this.state.screen === 'driving' ? 'pause' : this.state.screen;
    this.navigate('settings'); this.commands.openSettings(section);
  }
  settingsVisibility(visible: boolean): void {
    if (visible && this.state.screen !== 'settings') {
      this.settingsReturn = this.state.screen;
      this.navigate('settings');
    } else if (!visible && this.state.screen === 'settings') this.navigate(this.settingsReturn);
  }
  setBusy(busy: boolean): void { if (busy !== this.state.busy) { this.state.busy = busy; this.emit(); } }
  setSelection(vehicleId: string, mapId: string): void {
    if (vehicleId === this.state.vehicleId && mapId === this.state.mapId) return;
    this.state.vehicleId = vehicleId; this.state.mapId = mapId; this.emit();
  }
  setHudProfile(profile: HudProfile, persist = true): void {
    this.state.hudProfile = profile; this.commands.hudChanged(profile); this.emit();
    if (persist) void this.storage.saveText('config/ui.json', JSON.stringify({ version: 1, hudProfile: profile })).catch(() => {});
  }
  private emit(): void { this.onChange?.(this.state); }
}
