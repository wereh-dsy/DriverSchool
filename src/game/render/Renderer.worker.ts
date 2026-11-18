import type { RendererRequest } from './RendererProtocol';
import { installWorkerCanvasEnvironment } from './WorkerCanvasEnvironment';
let runtime: import('./RendererRuntime').RendererRuntime | undefined;
const deferred: RendererRequest[] = [];
const scope = globalThis as unknown as {
    onmessage: (event: MessageEvent<RendererRequest>) => void;
    postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = event => {
    const message = event.data;
    if (message.kind === 'init') {
        installWorkerCanvasEnvironment(message.baseURI, message.search, message.runtimeURL, message.visible);
        void import('./RendererRuntime').then(async ({ RendererRuntime }) => {
            runtime = new RendererRuntime(message, scope.postMessage.bind(scope));
            for (const pending of deferred.splice(0))
                runtime.receive(pending);
            await runtime.initialize();
        }).catch(error => scope.postMessage({
            kind: 'error', epoch: message.epoch, message: String(error?.stack ?? error)
        }));
        return;
    }
    if (runtime)
        runtime.receive(message);
    else if (message.kind === 'state' || message.kind === 'resize' || message.kind === 'command' && message.command === 'visibility') {
        const previous = deferred.findIndex(item => item.kind === message.kind && (message.kind !== 'command' || item.kind === 'command' && item.command === 'visibility'));
        if (previous >= 0) {
            const old = deferred.splice(previous, 1)[0];
            if (old?.kind === 'command')
                scope.postMessage({
                    kind: 'result', epoch: old.epoch, id: old.id
                });
        }
        deferred.push(message);
    }
    else if (deferred.length < 20)
        deferred.push(message);
    else if (message.kind === 'command')
        scope.postMessage({
            kind: 'commandError', epoch: message.epoch, id: message.id, message: 'Renderer startup command queue is full'
        });
};
