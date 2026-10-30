export const nextPaint = (): Promise<void> => new Promise(resolve => {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined' || document.hidden) setTimeout(resolve, 0);
  else requestAnimationFrame(() => setTimeout(resolve, 0));
});
/** Drain exact existing work, yielding only when a useful batch has used its budget. */
export async function runBatched<T>(steps: Generator<void, T>, budgetMs = 8): Promise<T> {
  const started = performance.now();
  let sliceStart = started, activeMs = 0, maxSliceMs = 0, batches = 1, deadline = started + budgetMs;
  for (;;) {
    const step = steps.next();
    if (step.done) {
      const slice = performance.now() - sliceStart; activeMs += slice; maxSliceMs = Math.max(maxSliceMs, slice);
      performance.measure('loading:batched', {start:started,end:performance.now(),detail:{activeMs,maxSliceMs,batches}});
      return step.value;
    }
    if (performance.now() >= deadline) { const slice = performance.now() - sliceStart; activeMs += slice; maxSliceMs = Math.max(maxSliceMs, slice); batches++; await nextPaint(); sliceStart = performance.now(); deadline = sliceStart + budgetMs; }
  }
}
export function drain<T>(steps: Generator<void, T>): T {
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}
export function loadingMark(name: string): void {
  performance.mark(`loading:${name}`);
  if (import.meta.env.DEV) console.debug(`[loading] ${name}: ${performance.now().toFixed(0)} ms`);
}
