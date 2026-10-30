/// <reference types="vite/client" />

declare module 'virtual:game-catalog' {
  export const vehicles: readonly import('./ui/state/GameUIState').VehicleViewModel[];
  export const maps: readonly import('./ui/state/GameUIState').MapViewModel[];
}
