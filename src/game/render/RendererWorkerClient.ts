import { R, RENDER_PROTOCOL, RENDER_STATE_LENGTH, type RendererReply, type RenderVehicleInfo } from './RendererProtocol';
import { CITY_EDITOR_STORAGE_KEY, loadCityMap } from '../../world/city/CityMapLoader';
/** Main-thread input/DOM host. It has no getContext or WebGL submission API. */
export class RendererWorkerClient {
    readonly domElement = document.createElement('div');
    private readonly canvas = document.createElement('canvas');
    private worker?: Worker;
    private closingWorker?: Worker;
    private closeTimer?: ReturnType<typeof setTimeout>;
    readonly lifecycle = {
        disposed: false, acknowledged: false, terminated: false, resources: undefined as Record<string, unknown> | undefined
    };
    private epoch = 1;
    private sequence = 0;
    private sent = 0;
    private inFlight = false;
    private readonly latest = new Float64Array(RENDER_STATE_LENGTH);
    private credit: Float64Array = new Float64Array(RENDER_STATE_LENGTH);
    private lastTelemetry = 0;
    private telemetry?: () => Record<string, unknown>;
    private context?: () => Record<string, unknown>;
    private readonly pending = new Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>();
    private commandId = 0;
    private dpr = Math.min(devicePixelRatio, 1.6);
    private size = {
        width: innerWidth, height: innerHeight, dpr: this.dpr
    };
    private readonly resourceURLs = new Set<string>();
    private editorResource(): string | undefined {
        let saved: string | null = null;
        try {
            saved = localStorage.getItem(CITY_EDITOR_STORAGE_KEY);
            if (saved)
                loadCityMap(JSON.parse(saved));
        }
        catch {
            saved = null; /* Match the editor map's existing City Alpha fallback. */
        }
        if (!saved)
            return;
        const url = URL.createObjectURL(new Blob([saved], {
            type: 'application/json'
        }));
        this.resourceURLs.add(url);
        return url;
    }
    private vehicleInfo?: RenderVehicleInfo;
    private vehicleResolve!: (value: RenderVehicleInfo) => void;
    private vehicleReject!: (error: Error) => void;
    private readyResolve!: () => void;
    private readyReject!: (error: Error) => void;
    readonly vehicleReady = new Promise<RenderVehicleInfo>((resolve, reject) => { this.vehicleResolve = resolve; this.vehicleReject = reject; });
    readonly ready = new Promise<void>((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
    isReady = false;
    error?: Error;
    state: Record<string, unknown> = {
        owner: 'RendererWorker', ready: false
    };
    onProgress?: (stage: string, done: number, total: number, resource: string) => void;
    onVehicle?: (info: RenderVehicleInfo) => void;
    onError?: (error: Error) => void;
    constructor(host: HTMLElement, vehicleId: string, groundId: string, runtimeURL: string, signal?: AbortSignal) {
        void this.ready.catch(() => { });
        void this.vehicleReady.catch(() => { });
        this.domElement.className = 'webgl';
        this.domElement.tabIndex = 0;
        this.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;outline:none';
        this.canvas.style.cssText = 'display:block;width:100%;height:100%';
        this.domElement.append(this.canvas);
        host.prepend(this.domElement);
        const offscreen = this.canvas.transferControlToOffscreen();
        this.worker = new Worker(new URL('./Renderer.worker.ts', import.meta.url), {
            type: 'module', name: 'DriverSchool Renderer'
        });
        this.worker.onmessage = (event: MessageEvent<RendererReply>) => this.receive(event.data);
        this.worker.onerror = event => this.fail(new Error('Renderer Worker: ' + event.message));
        this.worker.postMessage({
            kind: 'init', version: RENDER_PROTOCOL, epoch: this.epoch, canvas: offscreen, width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio, 1.6), vehicleId, groundId, baseURI: document.baseURI, runtimeURL, search: location.search, visible: !document.hidden, editorMapURL: groundId === 'city-editor-map' ? this.editorResource() : undefined
        }, [offscreen]);
        document.addEventListener('visibilitychange', this.visibility);
        signal?.addEventListener('abort', () => this.dispose(), {
            once: true
        });
    }
    private readonly visibility = () => {
        this.worker?.postMessage({
            kind: 'command', epoch: this.epoch, id: 0, command: 'visibility', value: !document.hidden
        });
    };
    setSources(telemetry: () => Record<string, unknown>, context: () => Record<string, unknown>): void { this.telemetry = telemetry; this.context = context; }
    publish(write: (target: Float64Array) => void): void {
        if (this.error || !this.worker)
            return;
        write(this.latest);
        this.latest[R.version] = RENDER_PROTOCOL;
        this.latest[R.sequence] = ++this.sequence;
        this.latest[R.time] = performance.timeOrigin + performance.now();
        this.latest[R.epoch] = this.epoch;
        this.send();
    }
    private send(): void {
        if (!this.worker || this.inFlight || this.sent === this.sequence)
            return;
        this.credit.set(this.latest);
        const data = this.credit;
        this.inFlight = true;
        this.sent = this.sequence;
        const now = performance.now(), include = now - this.lastTelemetry >= 50;
        if (include)
            this.lastTelemetry = now;
        this.worker.postMessage({
            kind: 'state', version: RENDER_PROTOCOL, epoch: this.epoch, sequence: this.sent, data, telemetry: include ? this.telemetry?.() : undefined, context: include ? this.context?.() : undefined
        }, [data.buffer]);
    }
    private receive(message: RendererReply): void {
        if (message.epoch !== this.epoch || this.lifecycle.disposed && message.kind !== 'disposed')
            return;
        switch (message.kind) {
            case 'disposed':
                this.lifecycle.acknowledged = true;
                this.lifecycle.resources = message.state;
                clearTimeout(this.closeTimer);
                this.closingWorker?.terminate();
                this.closingWorker = undefined;
                this.lifecycle.terminated = true;
                break;
            case 'credit':
                this.credit = message.data;
                this.inFlight = false;
                this.send();
                break;
            case 'vehicle':
                this.vehicleInfo = message.info;
                this.vehicleResolve(message.info);
                this.onVehicle?.(message.info);
                break;
            case 'ready':
                this.isReady = true;
                for (const url of this.resourceURLs)
                    URL.revokeObjectURL(url);
                this.resourceURLs.clear();
                this.readyResolve();
                break;
            case 'progress':
                this.onProgress?.(message.stage, message.done, message.total, message.resource);
                break;
            case 'stats':
                this.state = message.state;
                break;
            case 'view':
                this.state = {
                    ...this.state, overlayVisible: message.overlayVisible
                };
                break;
            case 'commandError': {
                const task = this.pending.get(message.id);
                this.pending.delete(message.id);
                task?.reject(new Error(message.message));
                break;
            }
            case 'result': {
                const task = this.pending.get(message.id);
                this.pending.delete(message.id);
                task?.resolve(message.value);
                break;
            }
            case 'error':
                this.fail(new Error(message.message));
                break;
        }
    }
    private fail(error: Error): void {
        this.error = error;
        this.isReady = false;
        this.state = {
            ...this.state, error: error.message
        };
        this.vehicleReject(error);
        this.readyReject(error);
        for (const task of this.pending.values())
            task.reject(error);
        this.pending.clear();
        this.onError?.(error);
    }
    command(command: 'vehicle' | 'ground' | 'prepareDrive' | 'cycleDisplay' | 'clickDisplay' | 'visibility' | 'capture', value?: unknown): Promise<unknown> {
        if (this.error || !this.worker)
            return Promise.reject(this.error ?? new Error('Renderer disposed'));
        if (this.pending.size >= 16)
            return Promise.reject(new Error('Renderer command queue is full'));
        const id = ++this.commandId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve, reject
            });
            this.worker!.postMessage({
                kind: 'command', epoch: this.epoch, id, command, value
            });
        });
    }
    async prepareVehicle(id: string): Promise<RenderVehicleInfo> {
        if (this.vehicleInfo?.id === id)
            return this.vehicleInfo;
        await this.command('vehicle', id);
        if (this.vehicleInfo?.id !== id)
            throw Error('Renderer vehicle version mismatch');
        return this.vehicleInfo;
    }
    async prepareGround(id: string): Promise<void> {
        const sourceURL = id === 'city-editor-map' ? this.editorResource() : undefined;
        try {
            await this.command('ground', {
                id, sourceURL
            });
        }
        finally {
            if (sourceURL) {
                URL.revokeObjectURL(sourceURL);
                this.resourceURLs.delete(sourceURL);
            }
        }
    }
    async prepareDrive(): Promise<void> {
        this.lastTelemetry = 0;
        await this.ready;
        await this.command('prepareDrive', this.sequence);
    }
    setSize(width: number, height: number): void {
        if (width === this.size.width && height === this.size.height && this.dpr === this.size.dpr)
            return;
        this.size = {
            width, height, dpr: this.dpr
        };
        this.worker?.postMessage({
            kind: 'resize', epoch: this.epoch, ...this.size
        });
    }
    setPixelRatio(ratio: number): void { this.dpr = Math.min(ratio, 1.6); }
    getPixelRatio(): number { return this.dpr; }
    dispose(): void {
        if (this.lifecycle.disposed)
            return;
        this.lifecycle.disposed = true;
        for (const url of this.resourceURLs)
            URL.revokeObjectURL(url);
        this.resourceURLs.clear();
        document.removeEventListener('visibilitychange', this.visibility);
        const worker = this.closingWorker = this.worker;
        this.worker = undefined;
        worker?.postMessage({
            kind: 'command', epoch: this.epoch, id: 0, command: 'dispose'
        });
        this.closeTimer = setTimeout(() => { worker?.terminate(); this.closingWorker = undefined; this.lifecycle.terminated = true; }, 500);
        this.domElement.remove();
        const error = new Error('Renderer disposed');
        this.vehicleReject(error);
        this.readyReject(error);
        for (const task of this.pending.values())
            task.reject(error);
        this.pending.clear();
        this.isReady = false;
    }
}
