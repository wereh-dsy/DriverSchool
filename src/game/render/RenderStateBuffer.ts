import { R, RENDER_PROTOCOL, RENDER_STATE_LENGTH, type RendererSnapshot } from './RendererProtocol';
/** Two retained snapshots; no history queue and no extrapolation/time catch-up. */
export class RenderStateBuffer {
    readonly current = new Float64Array(RENDER_STATE_LENGTH);
    readonly previous = new Float64Array(RENDER_STATE_LENGTH);
    readonly sampled = new Float64Array(RENDER_STATE_LENGTH);
    sequence = 0;
    stale = 0;
    resets = 0;
    alpha = 1;
    accept(message: RendererSnapshot, world: number, vehicle: number): boolean {
        const data = message.data;
        if (message.version !== RENDER_PROTOCOL || message.sequence <= this.sequence || data.length !== RENDER_STATE_LENGTH || data[R.world] !== world || data[R.vehicle] !== vehicle) {
            this.stale++;
            return false;
        }
        this.previous.set(this.current);
        this.current.set(data);
        if (!this.sequence || this.current[R.poseEpoch] !== this.previous[R.poseEpoch] || this.current[R.cameraSpace] !== this.previous[R.cameraSpace] || Math.hypot(this.current[R.pose]! - this.previous[R.pose]!, this.current[R.pose + 2]! - this.previous[R.pose + 2]!) > 20) {
            this.previous.set(this.current);
            this.resets++;
        }
        this.sequence = message.sequence;
        return true;
    }
    sample(absoluteTime: number): Float64Array {
        const a = this.previous, b = this.current, s = this.sampled, span = b[R.time]! - a[R.time]!;
        const t = this.alpha = span > 0 ? Math.min(1, Math.max(0, (absoluteTime - 1000 / 120 - a[R.time]!) / span)) : 1;
        for (let i = 0; i < s.length; i++)
            s[i] = a[i]! + (b[i]! - a[i]!) * t;
        for (const index of [3, 4, 5, 12, 16, 20, 24]) {
            const at = R.pose + index;
            s[at] = a[at]! + Math.atan2(Math.sin(b[at]! - a[at]!), Math.cos(b[at]! - a[at]!)) * t;
        }
        return s;
    }
    clear(): void { this.sequence = 0; this.current.fill(0); this.previous.fill(0); this.sampled.fill(0); }
}
