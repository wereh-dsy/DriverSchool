// src/game/StreamingShaderWarmup.ts
import { Group, InstancedMesh, Mesh, Scene } from "three";

// src/loading/Loading.ts
var nextPaint = () => new Promise((resolve) => {
  if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined" || document.hidden) setTimeout(resolve, 0);
  else requestAnimationFrame(() => setTimeout(resolve, 0));
});

// src/game/StreamingShaderWarmup.ts
var StreamingShaderWarmup = class {
  constructor(renderer) {
    this.renderer = renderer;
  }
  renderer;
  tail = Promise.resolve();
  prepared = /* @__PURE__ */ new Set();
  statistics = { roots: 0, objects: 0, representatives: 0, submissions: 0, maxSubmitMs: 0, cacheHits: 0 };
  prepare(root, scene, world, views, alive) {
    const run = async () => {
      if (!alive()) return;
      const targetScene = new Scene(), lights = [];
      targetScene.environment = scene.environment;
      targetScene.background = scene.background;
      targetScene.fog = scene.fog;
      targetScene.environmentIntensity = scene.environmentIntensity;
      targetScene.environmentRotation.copy(scene.environmentRotation);
      const gather = (object) => {
        if (object === world || !object.visible) return;
        if (object.isLight) lights.push(object);
        for (const child of object.children) gather(child);
      };
      gather(scene);
      targetScene.children.push(...lights);
      const objects = [], seen = /* @__PURE__ */ new Set();
      root.traverse((object) => {
        if (!(object instanceof Mesh) || object.isSkinnedMesh || object.isBatchedMesh || Object.keys(object.geometry.morphAttributes).length) {
          if (object.material) objects.push(object);
          return;
        }
        this.statistics.objects++;
        const materials = Array.isArray(object.material) ? object.material : [object.material], attributes = Object.entries(object.geometry.attributes).map(([name, a]) => name + ":" + a.itemSize).sort().join(","), instance = object instanceof InstancedMesh ? ":instance:" + !!object.instanceColor + ":" + !!object.morphTexture : ":mesh";
        const key = materials.map((m) => m.uuid).join("|") + instance + ":" + object.receiveShadow + ":" + attributes;
        if (!seen.has(key)) {
          seen.add(key);
          objects.push(object);
        }
      });
      this.statistics.roots++;
      this.statistics.representatives += objects.length;
      for (const view of views) {
        const lighting = lights.filter((l) => l.layers.test(view.camera.layers)).map((l) => {
          const light = l;
          return l.type + ":" + !!light.castShadow + ":" + !!light.map;
        }).sort().join("|");
        const context = [lighting, view.camera.type, view.camera.layers.mask, view.target?.texture.colorSpace ?? this.renderer.outputColorSpace, view.target?.texture.type ?? 0, this.renderer.toneMapping, this.renderer.shadowMap.enabled, this.renderer.shadowMap.type, scene.fog?.constructor.name, scene.environment?.uuid ?? "", this.renderer.clippingPlanes.length, this.renderer.localClippingEnabled].join(":");
        const key = (object) => {
          if (!(object instanceof Mesh) || Object.keys(object.geometry.morphAttributes).length || object.isSkinnedMesh || object.isBatchedMesh) return void 0;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          return context + "|" + materials.map((m) => m.uuid + ":" + m.version).join("|") + "|" + Object.entries(object.geometry.attributes).map(([name, a]) => name + ":" + a.itemSize).sort().join(",") + "|" + object.receiveShadow + "|" + (object instanceof InstancedMesh ? "instance:" + !!object.instanceColor + ":" + !!object.morphTexture : "mesh");
        };
        const needed = objects.filter((o) => {
          const k = key(o);
          if (k && this.prepared.has(k)) {
            this.statistics.cacheHits++;
            return false;
          }
          return true;
        });
        for (let i = 0; i < needed.length; i += 12) {
          await nextPaint();
          if (!alive()) return;
          const batch = new Group(), chunk = needed.slice(i, i + 12);
          batch.traverse = (callback) => {
            callback(batch);
            for (const object of chunk) callback(object);
          };
          const previous = this.renderer.getRenderTarget(), cube = this.renderer.getActiveCubeFace(), mip = this.renderer.getActiveMipmapLevel();
          let pending;
          const started = performance.now();
          try {
            this.renderer.setRenderTarget(view.target);
            const materials = this.renderer.compile(batch, view.camera, targetScene), programs = /* @__PURE__ */ new Set();
            for (const material of materials) {
              const properties = this.renderer.properties.get(material);
              for (const program of properties.programs?.values() ?? []) if (typeof program.isReady === "function") programs.add(program);
            }
            pending = programs.size ? new Promise((resolve) => {
              const check = () => {
                if (!alive()) {
                  resolve();
                  return;
                }
                for (const program of programs) if (!program.isReady()) {
                  setTimeout(check, 4);
                  return;
                }
                resolve();
              };
              check();
            }) : this.renderer.compileAsync(batch, view.camera, targetScene);
          } finally {
            this.renderer.setRenderTarget(previous, cube, mip);
            this.statistics.maxSubmitMs = Math.max(this.statistics.maxSubmitMs, performance.now() - started);
            this.statistics.submissions++;
          }
          await pending;
          if (!alive()) return;
          for (const object of chunk) {
            const k = key(object);
            if (k) this.prepared.add(k);
          }
          while (this.prepared.size > 512) this.prepared.delete(this.prepared.values().next().value);
        }
      }
    };
    const task = this.tail.then(run);
    this.tail = task.catch(() => {
    });
    return task;
  }
};
export {
  StreamingShaderWarmup
};
