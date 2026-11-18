/** Canvas-only compatibility boundary: existing painters use OffscreenCanvas,
 * never a DOM canvas or a main-thread bitmap stream. No window is invented. */
export function installWorkerCanvasEnvironment(baseURI: string, search: string, runtimeURL?: string, visible = true): void {
    const scope = globalThis as unknown as Record<string, unknown>;
    scope.__driverSchoolRendererOwner = true;
    const workerFonts = (globalThis as unknown as {
        fonts: FontFaceSet;
    }).fonts, pendingFonts = new Set<Promise<FontFace>>();
    // FontFaceSet.ready in a worker can wait for a rendering/layout opportunity.
    // Await the actual font loads registered by the existing canvas painters instead.
    const fonts = {
        add(face: FontFace) { workerFonts.add(face); pendingFonts.add(face.loaded); void face.loaded.then(() => pendingFonts.delete(face.loaded), () => pendingFonts.delete(face.loaded)); return workerFonts; }, get ready() { return Promise.all([...pendingFonts]).then(() => workerFonts); }
    };
    const canvas = (tag: string) => {
        if (tag !== 'canvas')
            throw Error('Renderer Worker cannot create DOM element: ' + tag);
        return new OffscreenCanvas(1, 1);
    };
    scope.document = {
        baseURI, hidden: !visible, fonts, createElement: canvas, createElementNS: (_namespace: string, tag: string) => canvas(tag)
    };
    scope.__driverSchoolRenderSearch = search;
    scope.__driverSchoolCityRuntimeURL = runtimeURL;
}
