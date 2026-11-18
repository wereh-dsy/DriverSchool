(()=>{function instrumentContext(gl) {
  const buffers = /* @__PURE__ */ new Map(), bindings = /* @__PURE__ */ new Map();
  let bytes = 0, peak = 0, draw, pass = "", totals = {}, events = [];
  const add = (name, value) => {
    totals[name] = (totals[name] ?? 0) + value;
  };
  const wrap = (name, after) => {
    const fn = gl[name].bind(gl);
    gl[name] = (...args) => {
      const t = performance.now(), r = fn(...args), ms = performance.now() - t;
      add(name + "Ms", ms);
      add(name + "Calls", 1);
      after?.(args, r);
      if (ms > 2 && events.length < 40) events.push({ call: name, ms, pass, draw });
      return r;
    };
  };
  const bind = gl.bindBuffer.bind(gl);
  gl.bindBuffer = (target, b) => {
    bindings.set(target, b);
    return bind(target, b);
  };
  wrap("bufferData", (a) => {
    const b = bindings.get(a[0]), size = typeof a[1] === "number" ? a[1] : a[1]?.byteLength ?? 0;
    if (b) {
      bytes += size - (buffers.get(b) ?? 0);
      buffers.set(b, size);
      peak = Math.max(peak, bytes);
    }
    add("uploadBytes", size);
  });
  wrap("bufferSubData", (a) => add("uploadBytes", a[2]?.byteLength ?? 0));
  const remove = gl.deleteBuffer.bind(gl);
  gl.deleteBuffer = (b) => {
    bytes -= buffers.get(b) ?? 0;
    buffers.delete(b);
    return remove(b);
  };
  for (const name of ["compileShader", "linkProgram", "getProgramParameter", "getShaderParameter", "getUniformLocation", "getAttribLocation", "texImage2D", "texSubImage2D", "generateMipmap"]) wrap(name);
  const attach = (game) => {
    const direct = game.renderer.renderBufferDirect.bind(game.renderer);
    game.renderer.renderBufferDirect = (camera, scene, g, m, o, group) => {
      const previous = draw;
      draw = { object: o.name, type: m.type, geometry: g.id, bytes: g.index?.array.byteLength ?? 0, shadow: !!(m.isMeshDepthMaterial || m.isMeshDistanceMaterial) };
      try {
        return direct(camera, scene, g, m, o, group);
      } finally {
        draw = previous;
      }
    };
    const render = game.renderer.render.bind(game.renderer);
    game.renderer.render = (...args) => {
      const old = pass;
      pass = game.renderer.getRenderTarget() ? "offscreen" : "main";
      try {
        return render(...args);
      } finally {
        pass = old;
      }
    };
  };
  return { attach, take() {
    const result = { ...totals, events, bufferBytes: bytes, bufferPeak: peak, buffers: buffers.size };
    totals = {};
    events = [];
    return result;
  }, memory() {
    return { bufferBytes: bytes, bufferPeak: peak, buffers: buffers.size };
  } };
}

const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(...args){const gl=get.apply(this,args);if(gl&&args[0]==='webgl2'&&!globalThis.__rendererGL){globalThis.__rendererGL=instrumentContext(gl);}return gl;};return true;})()