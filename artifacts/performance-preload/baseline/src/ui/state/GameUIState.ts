export type UIScreen = 'main' | 'vehicles' | 'maps' | 'training' | 'driving' | 'pause' | 'settings' | 'loading';
export type HudProfile = 'realistic' | 'standard' | 'training' | 'off';
export const HUD_PROFILES: readonly { id: HudProfile; label: string; description: string }[] = [
  { id: 'realistic', label: 'Realistic', description: '座舱优先，仅临时提示' },
  { id: 'standard', label: 'Standard', description: '车速、挡位与共享导航' },
  { id: 'training', label: 'Assisted / Training', description: '踏板、转向与辅助状态' },
  { id: 'off', label: '关闭 HUD', description: '保留真实座舱' },
];
export interface VehicleViewModel {
  id: string; name: string; powertrain: string; transmission: string; drive: string;
  power: string; description: string;
}
export interface MapViewModel { id: string; name: string; description: string }
export interface GameUIState {
  loading: { phase: 'idle' | 'starting' | 'loadingWorld' | 'loadingVehicle' | 'warmingRenderer' | 'ready' | 'error'; message: string };
  screen: UIScreen; hasSession: boolean; busy: boolean; hudProfile: HudProfile;
  vehicleId: string; mapId: string;
}
export interface DrivingHUDState {
  speedKmh: number; gear: string; throttle: number; brake: number; clutch: number | null;
  steering: number; abs: boolean; tcs: boolean; esc: boolean; speedLimit: number | null;
}
