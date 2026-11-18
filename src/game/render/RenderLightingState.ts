import type { VehicleLightingState } from '../../vehicle/control/VehicleLightingController';
import { R } from './RendererProtocol';
const flags = ['fogLightsEnabled', 'frontFogLightsEnabled', 'rearFogLightsEnabled', 'leftTurnSignal', 'rightTurnSignal', 'hazard', 'brakeLight', 'reverseLight', 'highBeamFlash', 'effectiveHighBeam', 'positionLight', 'lowBeam', 'leftBlinkOn', 'rightBlinkOn'] as const;
const modes = ['off', 'position', 'low', 'high'] as const, fog = ['off', 'front', 'front-rear'] as const;
export type RenderLightingState = {
    -readonly [K in keyof VehicleLightingState]: VehicleLightingState[K];
};
export function createRenderLightingState(): RenderLightingState {
    return {
        mainLightMode: 'off', fogMode: 'off', fogLightsEnabled: false, frontFogLightsEnabled: false, rearFogLightsEnabled: false, leftTurnSignal: false, rightTurnSignal: false, hazard: false, brakeLight: false, reverseLight: false, highBeamFlash: false, effectiveHighBeam: false, positionLight: false, lowBeam: false, leftBlinkOn: false, rightBlinkOn: false
    };
}
export function writeRenderLighting(data: Float64Array, state: VehicleLightingState): void {
    let bits = 0;
    for (let i = 0; i < flags.length; i++)
        if (state[flags[i]!])
            bits |= 1 << i;
    data[R.lights] = bits;
    data[R.lights + 1] = modes.indexOf(state.mainLightMode);
    data[R.lights + 2] = fog.indexOf(state.fogMode);
}
export function readRenderLighting(data: Float64Array, state: RenderLightingState): void {
    const bits = data[R.lights]!;
    for (let i = 0; i < flags.length; i++)
        state[flags[i]!] = !!(bits & 1 << i);
    state.mainLightMode = modes[data[R.lights + 1]!] ?? 'off';
    state.fogMode = fog[data[R.lights + 2]!] ?? 'off';
}
