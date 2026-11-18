export const RENDER_PROTOCOL = 1;
export const RENDER_STATE_LENGTH = 192;
export const R = {
    version: 0, sequence: 1, time: 2, epoch: 3, pose: 4, cameraPosition: 34, cameraQuaternion: 37, cameraProjection: 41, cameraLayers: 57, visible: 58, paused: 59, bodyFeedback: 60, wiper: 64, weather: 72, lights: 88, speed: 104, alignment: 108, access: 120, mirrorQuaternion: 124, overlay: 132, head: 136, mode: 140, rpm: 141, simTime: 142, signalClock: 143, poseEpoch: 144, vehicle: 145, world: 146, cameraSpace: 147, cameraParams: 148, roadHeight: 152, focus: 153, spoiler: 156, ignition: 157
} as const;
export interface RenderVehicleInfo {
    id: string;
    mirrors: {
        left: {
            position: number[];
            quaternion: number[];
        };
        right: {
            position: number[];
            quaternion: number[];
        };
    };
    interaction: null | {
        doorClosed: {
            position: number[];
            rotation: number[];
        };
        doorOpen: {
            position: number[];
            rotation: number[];
        };
        windowClosed: {
            position: number[];
            rotation: number[];
        };
    };
    displayBounds: Float64Array;
}
export interface RendererInit {
    kind: 'init';
    version: 1;
    epoch: number;
    canvas: OffscreenCanvas;
    width: number;
    height: number;
    dpr: number;
    vehicleId: string;
    groundId: string;
    baseURI: string;
    runtimeURL: string;
    search: string;
    visible: boolean;
    editorMapURL?: string;
}
export interface RendererSnapshot {
    kind: 'state';
    version: 1;
    epoch: number;
    sequence: number;
    data: Float64Array;
    telemetry?: Record<string, unknown>;
    context?: Record<string, unknown>;
}
export interface RendererCommand {
    kind: 'command';
    epoch: number;
    id: number;
    command: 'vehicle' | 'ground' | 'prepareDrive' | 'cycleDisplay' | 'clickDisplay' | 'visibility' | 'capture' | 'dispose';
    value?: unknown;
}
export type RendererRequest = RendererInit | RendererSnapshot | RendererCommand | {
    kind: 'resize';
    epoch: number;
    width: number;
    height: number;
    dpr: number;
};
export type RendererReply = {
    kind: 'vehicle';
    epoch: number;
    info: RenderVehicleInfo;
} | {
    kind: 'ready';
    epoch: number;
} | {
    kind: 'credit';
    epoch: number;
    sequence: number;
    data: Float64Array;
} | {
    kind: 'progress';
    epoch: number;
    stage: string;
    done: number;
    total: number;
    resource: string;
} | {
    kind: 'stats';
    epoch: number;
    state: Record<string, unknown>;
} | {
    kind: 'view';
    epoch: number;
    overlayVisible: boolean;
} | {
    kind: 'result';
    epoch: number;
    id: number;
    value?: unknown;
} | {
    kind: 'commandError';
    epoch: number;
    id: number;
    message: string;
} | {
    kind: 'disposed';
    epoch: number;
    state: Record<string, unknown>;
} | {
    kind: 'error';
    epoch: number;
    message: string;
};
