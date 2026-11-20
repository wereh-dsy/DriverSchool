import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { VEHICLE_RENDER_LAYERS } from '../../visual/VehicleRenderLayers';
import {
  DEFAULT_ADAS_VISUALIZATION_CONFIG,
  resolvePaletteForTone,
  type ADASVisualizationConfig,
} from './ADASVisualizationConfig';
import type {
  ADASEnvironmentTheme,
  ADASRibbonTone,
  ADASWorldVisualPacket,
} from './ADASVisualizationTypes';

const MAX_RIBBON_VERTS = 128; // 64 samples * 2
const MAX_RIBBON_TRIS = 126; // 63 quads * 2

// Up to 7 target ground markers (up to 16 quads each: ring segments / footprint fill + edges / under-car rails)
const MAX_BRACKET_TARGETS = 7;
const MAX_BRACKET_QUADS = 16 * MAX_BRACKET_TARGETS;
const MAX_BRACKET_VERTS = MAX_BRACKET_QUADS * 4;
const MAX_BRACKET_TRIS = MAX_BRACKET_QUADS * 2;
const MAX_WORLD_CALLOUTS = 4;

// Ground-projected short dashed pedestrian prediction trajectories + conflict markers
const MAX_PED_QUADS = 64;
const MAX_PED_VERTS = MAX_PED_QUADS * 4;
const MAX_PED_TRIS = MAX_PED_QUADS * 2;

const RIBBON_VERTEX_SHADER = `
  attribute vec3 aMetrics;
  varying vec3 vMetrics;
  varying vec2 vWorldXZ;
  void main() {
    vMetrics = aMetrics;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const RIBBON_FRAGMENT_SHADER = `
  uniform vec3 uFillColor;
  uniform vec3 uEdgeColor;
  uniform float uFillAlpha;
  uniform float uEdgeAlpha;
  uniform float uMasterAlpha;
  uniform vec2 uEgoPos;
  uniform vec2 uEgoFwd;
  uniform float uNearFadeStart;
  uniform float uNearFadeEnd;
  uniform float uEdgeWidth;
  uniform float uFarFadeStart;
  varying vec3 vMetrics;
  varying vec2 vWorldXZ;

  void main() {
    if (uMasterAlpha <= 0.002) discard;

    float absU = abs(vMetrics.x);
    float outerAA = 1.0 - smoothstep(0.93, 1.0, absU);
    if (outerAA <= 0.002) discard;

    float fwdDist = dot(vWorldXZ - uEgoPos, uEgoFwd);
    // Do not clip a far curving loop (such as a U-turn) via vehicle-forward distance.
    float nearDist = mix(fwdDist, 12.0, smoothstep(0.18, 0.36, vMetrics.y));
    float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, nearDist);
    float farFade = 1.0 - smoothstep(uFarFadeStart, 1.0, vMetrics.y);
    float longitudinal = nearFade * farFade * outerAA;
    if (longitudinal <= 0.002) discard;

    float innerEdge = 1.0 - uEdgeWidth * 2.1;
    float outerEdge = 1.0 - uEdgeWidth * 0.4;
    float edgeBand = smoothstep(innerEdge, outerEdge, absU);
    vec3 col = mix(uFillColor, uEdgeColor, edgeBand);
    float baseA = mix(uFillAlpha, uEdgeAlpha, edgeBand);
    float alpha = baseA * longitudinal * uMasterAlpha;
    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BRACKET_VERTEX_SHADER = `
  attribute vec3 aColor;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BRACKET_FRAGMENT_SHADER = `
  uniform float uAlpha;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    if (uAlpha <= 0.002) discard;
    if (vUv.y < -0.5) {
      // Soft translucent static-obstacle ground risk footprint fill
      float edgeSoft = (1.0 - smoothstep(0.36, 0.5, abs(vUv.x - 0.5))) *
                       (1.0 - smoothstep(0.36, 0.5, abs(vUv.y + 1.5)));
      float alpha = uAlpha * 0.28 * (0.45 + 0.55 * edgeSoft);
      if (alpha <= 0.002) discard;
      gl_FragColor = vec4(vColor, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    float aaU = 1.0 - smoothstep(0.30, 0.5, abs(vUv.x - 0.5));
    float tipFade = smoothstep(0.0, 0.10, vUv.y) * (1.0 - smoothstep(0.90, 1.0, vUv.y));
    float alpha = uAlpha * aaU * tipFade;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PED_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute vec3 aDashUv;
  varying vec3 vColor;
  varying vec3 vDashUv;
  void main() {
    vColor = aColor;
    vDashUv = aDashUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PED_FRAGMENT_SHADER = `
  uniform float uAlpha;
  varying vec3 vColor;
  varying vec3 vDashUv;
  void main() {
    if (uAlpha <= 0.002) discard;
    float latAA = 1.0 - smoothstep(0.60, 1.0, abs(vDashUv.x));
    float ph = fract(vDashUv.y);
    float dashSoft = smoothstep(0.18, 0.30, ph) * (1.0 - smoothstep(0.72, 0.86, ph));
    float uncertaintyFade = clamp(vDashUv.z, 0.08, 1.0);
    float discMask = 1.0 - smoothstep(0.42, 0.96, length(vec2(vDashUv.x, vDashUv.y + 1.0)));
    float mask = vDashUv.y < -0.5 ? discMask * 0.72 : dashSoft * uncertaintyFade;
    float alpha = uAlpha * latAA * mask;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * WebGL2 / Three.js world-space ADAS AR presenter.
 * Owns only two lightweight reusable indexed geometries, depth-tested against world,
 * vehicles, and cabin geometry. Placed on VEHICLE_RENDER_LAYERS.DEBUG so mirrors stay clean.
 */
export class ADASWorldRenderer {
  public readonly root = new Group();

  private readonly config: ADASVisualizationConfig;
  private readonly ribbonGeo = new BufferGeometry();
  private readonly ribbonPositions = new Float32Array(MAX_RIBBON_VERTS * 3);
  private readonly ribbonMetrics = new Float32Array(MAX_RIBBON_VERTS * 3);
  private readonly ribbonMat: ShaderMaterial;
  private readonly ribbonMesh: Mesh;

  private readonly bracketGeo = new BufferGeometry();
  private readonly bracketPositions = new Float32Array(MAX_BRACKET_VERTS * 3);
  private readonly bracketUvs = new Float32Array(MAX_BRACKET_VERTS * 2);
  private readonly bracketColors = new Float32Array(MAX_BRACKET_VERTS * 3);
  private readonly bracketMat: ShaderMaterial;
  private readonly bracketMesh: Mesh;

  private readonly pedGeo = new BufferGeometry();
  private readonly pedPositions = new Float32Array(MAX_PED_VERTS * 3);
  private readonly pedColors = new Float32Array(MAX_PED_VERTS * 3);
  private readonly pedDashUvs = new Float32Array(MAX_PED_VERTS * 3);
  private readonly pedMat: ShaderMaterial;
  private readonly pedMesh: Mesh;

  private ribbonAlpha = 0;
  private targetRibbonAlpha = 0;
  private ribbonTone: ADASRibbonTone = 'normal';
  private hasValidRibbonGeo = false;

  private bracketAlpha = 0;
  private targetBracketAlpha = 0;
  private bracketTone: ADASRibbonTone = 'normal';
  private hasValidBracketGeo = false;

  private pedAlpha = 0;
  private targetPedAlpha = 0;
  private hasValidPedGeo = false;
  private readonly tmpToneColor = new Color(0x6ec3dc);

  private readonly calloutGeo = new PlaneGeometry(1.35, 0.44);
  private readonly callouts: Array<{
    mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
    canvas: OffscreenCanvas | HTMLCanvasElement;
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    texture: CanvasTexture;
    active: boolean;
    wx: number;
    wy: number;
    wz: number;
    signature: string;
  }> = [];

  private activeTheme: ADASEnvironmentTheme = 'DAY';
  private readonly fillColorTarget = new Color(0x4599b5);
  private readonly edgeColorTarget = new Color(0x7bcde3);
  private readonly bracketColorTarget = new Color(0x6ec3dc);
  private readonly fillColorCurrent = new Color(0x4599b5);
  private readonly edgeColorCurrent = new Color(0x7bcde3);
  private readonly bracketColorCurrent = new Color(0x6ec3dc);

  public constructor(config: Partial<ADASVisualizationConfig> = {}) {
    this.config = {
      ...DEFAULT_ADAS_VISUALIZATION_CONFIG,
      ...config,
      ribbon: { ...DEFAULT_ADAS_VISUALIZATION_CONFIG.ribbon, ...config.ribbon },
      targetMarker: { ...DEFAULT_ADAS_VISUALIZATION_CONFIG.targetMarker, ...config.targetMarker },
      themes: { ...DEFAULT_ADAS_VISUALIZATION_CONFIG.themes, ...config.themes },
    };

    this.root.name = 'ADASWorldVisualization';
    this.root.layers.set(VEHICLE_RENDER_LAYERS.DEBUG);

    // 1. Setup Ribbon Mesh
    this.ribbonGeo.setAttribute('position', new BufferAttribute(this.ribbonPositions, 3));
    this.ribbonGeo.setAttribute('aMetrics', new BufferAttribute(this.ribbonMetrics, 3));
    const ribbonIndices = new Uint16Array(MAX_RIBBON_TRIS * 3);
    for (let i = 0; i < MAX_RIBBON_TRIS / 2; i++) {
      const v0 = i * 2;
      const idx = i * 6;
      ribbonIndices[idx] = v0;
      ribbonIndices[idx + 1] = v0 + 1;
      ribbonIndices[idx + 2] = v0 + 2;
      ribbonIndices[idx + 3] = v0 + 1;
      ribbonIndices[idx + 4] = v0 + 3;
      ribbonIndices[idx + 5] = v0 + 2;
    }
    this.ribbonGeo.setIndex(new BufferAttribute(ribbonIndices, 1));
    this.ribbonGeo.setDrawRange(0, 0);

    const dayNorm = this.config.themes.DAY.normal;
    this.ribbonMat = new ShaderMaterial({
      vertexShader: RIBBON_VERTEX_SHADER,
      fragmentShader: RIBBON_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uFillColor: { value: this.fillColorCurrent },
        uEdgeColor: { value: this.edgeColorCurrent },
        uFillAlpha: { value: dayNorm.fillAlpha },
        uEdgeAlpha: { value: dayNorm.edgeAlpha },
        uMasterAlpha: { value: 0 },
        uEgoPos: { value: new Vector2(0, 0) },
        uEgoFwd: { value: new Vector2(0, -1) },
        uNearFadeStart: { value: 2.2 },
        uNearFadeEnd: { value: 5.4 },
        uEdgeWidth: { value: this.config.ribbon.edgeWidthRatio },
        uFarFadeStart: { value: this.config.ribbon.farFadeStartRatio },
      },
    });

    this.ribbonMesh = new Mesh(this.ribbonGeo, this.ribbonMat);
    this.ribbonMesh.name = 'ADASPathRibbon';
    this.ribbonMesh.layers.set(VEHICLE_RENDER_LAYERS.DEBUG);
    this.ribbonMesh.frustumCulled = false;
    this.ribbonMesh.renderOrder = 4;
    this.ribbonMesh.visible = false;

    // 2. Setup Multi-Target Corner Bracket Mesh
    this.bracketGeo.setAttribute('position', new BufferAttribute(this.bracketPositions, 3));
    this.bracketGeo.setAttribute('uv', new BufferAttribute(this.bracketUvs, 2));
    this.bracketGeo.setAttribute('aColor', new BufferAttribute(this.bracketColors, 3));
    const bracketIndices = new Uint16Array(MAX_BRACKET_TRIS * 3);
    for (let q = 0; q < MAX_BRACKET_QUADS; q++) {
      const v = q * 4;
      const idx = q * 6;
      bracketIndices[idx] = v;
      bracketIndices[idx + 1] = v + 1;
      bracketIndices[idx + 2] = v + 2;
      bracketIndices[idx + 3] = v + 1;
      bracketIndices[idx + 4] = v + 3;
      bracketIndices[idx + 5] = v + 2;
    }
    this.bracketGeo.setIndex(new BufferAttribute(bracketIndices, 1));
    this.bracketGeo.setDrawRange(0, 0);

    this.bracketMat = new ShaderMaterial({
      vertexShader: BRACKET_VERTEX_SHADER,
      fragmentShader: BRACKET_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uAlpha: { value: 0 },
      },
    });

    this.bracketMesh = new Mesh(this.bracketGeo, this.bracketMat);
    this.bracketMesh.name = 'ADASTargetBrackets';
    this.bracketMesh.layers.set(VEHICLE_RENDER_LAYERS.DEBUG);
    this.bracketMesh.frustumCulled = false;
    this.bracketMesh.renderOrder = 5;
    this.bracketMesh.visible = false;

    // 3. Setup Ground-Projected Dashed Pedestrian Prediction Mesh
    this.pedGeo.setAttribute('position', new BufferAttribute(this.pedPositions, 3));
    this.pedGeo.setAttribute('aColor', new BufferAttribute(this.pedColors, 3));
    this.pedGeo.setAttribute('aDashUv', new BufferAttribute(this.pedDashUvs, 3));
    const pedIndices = new Uint16Array(MAX_PED_TRIS * 3);
    for (let q = 0; q < MAX_PED_QUADS; q++) {
      const v = q * 4;
      const idx = q * 6;
      pedIndices[idx] = v;
      pedIndices[idx + 1] = v + 1;
      pedIndices[idx + 2] = v + 2;
      pedIndices[idx + 3] = v + 1;
      pedIndices[idx + 4] = v + 3;
      pedIndices[idx + 5] = v + 2;
    }
    this.pedGeo.setIndex(new BufferAttribute(pedIndices, 1));
    this.pedGeo.setDrawRange(0, 0);

    this.pedMat = new ShaderMaterial({
      vertexShader: PED_VERTEX_SHADER,
      fragmentShader: PED_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uAlpha: { value: 0 },
      },
    });

    this.pedMesh = new Mesh(this.pedGeo, this.pedMat);
    this.pedMesh.name = 'ADASPedesPredMesh';
    this.pedMesh.layers.set(VEHICLE_RENDER_LAYERS.DEBUG);
    this.pedMesh.frustumCulled = false;
    this.pedMesh.renderOrder = 5;
    this.pedMesh.visible = false;

    this.root.add(this.ribbonMesh, this.bracketMesh, this.pedMesh);

    for (let i = 0; i < MAX_WORLD_CALLOUTS; i++) {
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(256, 84)
          : typeof document !== 'undefined'
            ? Object.assign(document.createElement('canvas'), { width: 256, height: 84 })
            : ({ width: 256, height: 84 } as unknown as HTMLCanvasElement);
      const ctx =
        typeof (canvas as OffscreenCanvas).getContext === 'function'
          ? ((canvas as OffscreenCanvas).getContext('2d') as
              | OffscreenCanvasRenderingContext2D
              | CanvasRenderingContext2D
              | null)
          : null;
      const texture = new CanvasTexture(canvas as unknown as HTMLCanvasElement);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      const mat = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(this.calloutGeo, mat);
      mesh.name = `ADASWorldCallout_${i}`;
      mesh.layers.set(VEHICLE_RENDER_LAYERS.DEBUG);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      mesh.visible = false;
      this.root.add(mesh);
      this.callouts.push({ mesh, canvas, ctx, texture, active: false, wx: 0, wy: 0, wz: 0, signature: '' });
    }
  }

  /** Receives latest 20 Hz ADAS visual packet from main thread. */
  public applyPacket(packet: ADASWorldVisualPacket | null | undefined): void {
    if (!packet || !packet.visible) {
      this.targetRibbonAlpha = 0;
      this.targetBracketAlpha = 0;
      this.targetPedAlpha = 0;
      for (let i = 0; i < this.callouts.length; i++) {
        this.callouts[i]!.active = false;
      }
      return;
    }

    this.activeTheme = packet.theme;

    // 1. Update Path Ribbon geometry when triggered
    if (packet.ribbonActive && packet.sampleCount >= 2) {
      this.rebuildRibbonGeometry(packet);
      this.ribbonTone = packet.tone;
      this.targetRibbonAlpha = 1;
      if (packet.urgent) {
        this.ribbonAlpha = 1;
      }
      this.ribbonMat.uniforms.uNearFadeStart!.value = packet.nearFadeStartM;
      this.ribbonMat.uniforms.uNearFadeEnd!.value = packet.nearFadeEndM;
      this.ribbonMat.uniforms.uEgoPos!.value.set(packet.egoX, packet.egoZ);
      this.ribbonMat.uniforms.uEgoFwd!.value.set(-Math.sin(packet.egoYaw), -Math.cos(packet.egoYaw));
    } else {
      this.targetRibbonAlpha = 0;
      if (packet.urgent) this.ribbonAlpha = 0;
    }

    // 2. Update Multi-Target Ground Markers & World-Space Telemetry Callouts
    const hasExtraTargets = Boolean(packet.extraTargets && packet.extraTargets.length > 0);
    if (packet.target.active || hasExtraTargets) {
      this.rebuildTargetBrackets(packet.target, packet.extraTargets);
      this.rebuildWorldCallouts(packet);
      this.bracketTone = packet.target.active ? packet.target.tone : (packet.extraTargets![0]?.tone ?? 'caution');
      this.targetBracketAlpha = 1;
      if (packet.urgent || packet.target.tone === 'hazard') {
        this.bracketAlpha = 1;
      }
    } else {
      this.targetBracketAlpha = 0;
      for (let i = 0; i < this.callouts.length; i++) {
        this.callouts[i]!.active = false;
      }
    }

    // 3. Update Ground-Projected Dashed Pedestrian Prediction Trajectories
    if (packet.pedestrianPaths && packet.pedestrianPaths.length > 0) {
      this.rebuildPedestrianPaths(packet.pedestrianPaths);
      this.targetPedAlpha = 1;
    } else {
      this.targetPedAlpha = 0;
    }
  }

  /** Per-frame smooth alpha fading, theme color interpolation, and live ego near-fade sync. */
  public update(
    dt: number,
    theme: ADASEnvironmentTheme,
    egoX: number,
    egoZ: number,
    egoYaw: number,
  ): void {
    this.activeTheme = theme;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;

    // Smoothly track interpolated ego pose for zero-stutter near-bumper fade
    this.ribbonMat.uniforms.uEgoPos!.value.set(egoX, egoZ);
    this.ribbonMat.uniforms.uEgoFwd!.value.set(-Math.sin(egoYaw), -Math.cos(egoYaw));

    // Smooth fade transitions for path ribbon
    const rRate =
      this.targetRibbonAlpha > this.ribbonAlpha
        ? 1 / Math.max(0.05, this.config.ribbon.fadeInSeconds)
        : 1 / Math.max(0.05, this.config.ribbon.fadeOutSeconds);
    if (this.ribbonAlpha < this.targetRibbonAlpha) {
      this.ribbonAlpha = Math.min(this.targetRibbonAlpha, this.ribbonAlpha + safeDt * rRate);
    } else if (this.ribbonAlpha > this.targetRibbonAlpha) {
      this.ribbonAlpha = Math.max(this.targetRibbonAlpha, this.ribbonAlpha - safeDt * rRate);
    }

    // Smooth fade transitions for target marker
    const bRate =
      this.targetBracketAlpha > this.bracketAlpha
        ? 1 / Math.max(0.05, this.config.targetMarker.fadeInSeconds)
        : 1 / Math.max(0.05, this.config.targetMarker.fadeOutSeconds);
    if (this.bracketAlpha < this.targetBracketAlpha) {
      this.bracketAlpha = Math.min(this.targetBracketAlpha, this.bracketAlpha + safeDt * bRate);
    } else if (this.bracketAlpha > this.targetBracketAlpha) {
      this.bracketAlpha = Math.max(this.targetBracketAlpha, this.bracketAlpha - safeDt * bRate);
    }

    // Color & luminance theme transition (DAY / DUSK / NIGHT)
    const rPal = resolvePaletteForTone(this.activeTheme, this.ribbonTone, this.config);
    const bPal = resolvePaletteForTone(this.activeTheme, this.bracketTone, this.config);
    const colorBlend = Math.min(1, safeDt * 7.5);
    this.fillColorTarget.setHex(rPal.fillHex);
    this.edgeColorTarget.setHex(rPal.edgeHex);
    this.bracketColorTarget.setHex(bPal.bracketHex);
    this.fillColorCurrent.lerp(this.fillColorTarget, colorBlend);
    this.edgeColorCurrent.lerp(this.edgeColorTarget, colorBlend);
    this.bracketColorCurrent.lerp(this.bracketColorTarget, colorBlend);

    this.ribbonMat.uniforms.uFillAlpha!.value = rPal.fillAlpha;
    this.ribbonMat.uniforms.uEdgeAlpha!.value = rPal.edgeAlpha;
    this.ribbonMat.uniforms.uMasterAlpha!.value = this.ribbonAlpha;
    this.ribbonMesh.visible = this.hasValidRibbonGeo && this.ribbonAlpha > 0.004;

    this.bracketMat.uniforms.uAlpha!.value = bPal.bracketAlpha * this.bracketAlpha;
    this.bracketMesh.visible = this.hasValidBracketGeo && this.bracketAlpha > 0.004;

    const calloutVisible = this.bracketAlpha > 0.02;
    const themeFade = this.activeTheme === 'NIGHT' ? 0.82 : this.activeTheme === 'DUSK' ? 0.92 : 1.0;
    for (let i = 0; i < this.callouts.length; i++) {
      const slot = this.callouts[i]!;
      slot.mesh.visible = calloutVisible && slot.active;
      if (slot.mesh.visible) {
        slot.mesh.position.set(slot.wx, slot.wy, slot.wz);
        slot.mesh.rotation.set(0, Math.atan2(egoX - slot.wx, egoZ - slot.wz), 0);
        slot.mesh.material.opacity = this.bracketAlpha * themeFade;
      }
    }

    if (this.pedAlpha < this.targetPedAlpha) {
      this.pedAlpha = Math.min(this.targetPedAlpha, this.pedAlpha + safeDt * 5.0);
    } else if (this.pedAlpha > this.targetPedAlpha) {
      this.pedAlpha = Math.max(this.targetPedAlpha, this.pedAlpha - safeDt * 3.5);
    }
    const pedBaseAlpha = this.activeTheme === 'NIGHT' ? 0.78 : 0.88;
    this.pedMat.uniforms.uAlpha!.value = pedBaseAlpha * this.pedAlpha;
    this.pedMesh.visible = this.hasValidPedGeo && this.pedAlpha > 0.004;
  }

  public dispose(): void {
    this.ribbonGeo.dispose();
    this.ribbonMat.dispose();
    this.bracketGeo.dispose();
    this.bracketMat.dispose();
    this.pedGeo.dispose();
    this.pedMat.dispose();
    this.calloutGeo.dispose();
    for (let i = 0; i < this.callouts.length; i++) {
      const slot = this.callouts[i]!;
      slot.mesh.material.dispose();
      slot.texture.dispose();
    }
    this.root.removeFromParent();
  }

  private rebuildRibbonGeometry(packet: ADASWorldVisualPacket): void {
    const count = Math.min(packet.sampleCount, MAX_RIBBON_VERTS / 2);
    if (count < 2) {
      this.hasValidRibbonGeo = false;
      this.ribbonGeo.setDrawRange(0, 0);
      return;
    }

    const pts = packet.points;
    const norms = packet.normals;
    const dists = packet.distances;
    const halfW = packet.widthM * 0.5;
    const lift = this.config.ribbon.surfaceLiftM;
    const totalLen = Math.max(0.5, dists[count - 1]!);

    for (let i = 0; i < count; i++) {
      const idx3 = i * 3;
      const px = pts[idx3]!;
      const py = pts[idx3 + 1]!;
      const pz = pts[idx3 + 2]!;
      let nx = norms[idx3] ?? 0;
      let ny = norms[idx3 + 1] ?? 1;
      let nz = norms[idx3 + 2] ?? 0;
      const nLen = Math.hypot(nx, ny, nz);
      if (nLen > 1e-4) {
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }

      const prevI = Math.max(0, i - 1);
      const nextI = Math.min(count - 1, i + 1);
      const tx = pts[nextI * 3]! - pts[prevI * 3]!;
      const ty = pts[nextI * 3 + 1]! - pts[prevI * 3 + 1]!;
      const tz = pts[nextI * 3 + 2]! - pts[prevI * 3 + 2]!;

      // right = normalize(tangent x normal)
      let rx = ty * nz - tz * ny;
      let ry = tz * nx - tx * nz;
      let rz = tx * ny - ty * nx;
      const rLen = Math.hypot(rx, ry, rz);
      if (rLen > 1e-4) {
        rx /= rLen;
        ry /= rLen;
        rz /= rLen;
      } else {
        rx = 1;
        ry = 0;
        rz = 0;
      }

      const liftX = nx * lift;
      const liftY = ny * lift;
      const liftZ = nz * lift;
      const vNorm = dists[i]! / totalLen;

      const leftV = i * 2 * 3;
      this.ribbonPositions[leftV] = px - rx * halfW + liftX;
      this.ribbonPositions[leftV + 1] = py - ry * halfW + liftY;
      this.ribbonPositions[leftV + 2] = pz - rz * halfW + liftZ;
      this.ribbonMetrics[leftV] = -1;
      this.ribbonMetrics[leftV + 1] = vNorm;
      this.ribbonMetrics[leftV + 2] = dists[i]!;

      const rightV = leftV + 3;
      this.ribbonPositions[rightV] = px + rx * halfW + liftX;
      this.ribbonPositions[rightV + 1] = py + ry * halfW + liftY;
      this.ribbonPositions[rightV + 2] = pz + rz * halfW + liftZ;
      this.ribbonMetrics[rightV] = 1;
      this.ribbonMetrics[rightV + 1] = vNorm;
      this.ribbonMetrics[rightV + 2] = dists[i]!;
    }

    (this.ribbonGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.ribbonGeo.getAttribute('aMetrics') as BufferAttribute).needsUpdate = true;
    this.ribbonGeo.setDrawRange(0, (count - 1) * 6);
    this.hasValidRibbonGeo = true;
  }

  private rebuildTargetBrackets(
    target: ADASWorldVisualPacket['target'],
    extraTargets?: ADASWorldVisualPacket['extraTargets'],
  ): void {
    const cfg = this.config.targetMarker;
    const thick = cfg.bracketThicknessM;
    let quadIdx = 0;

    const appendMarker = (
      tx: number,
      ty: number,
      tz: number,
      yaw: number,
      width: number,
      length: number,
      tone: ADASRibbonTone,
      category: 'lead' | 'adjacent' | 'static-obstacle' | 'pedestrian' | 'cyclist' = 'lead',
    ) => {
      const pal = resolvePaletteForTone(this.activeTheme, tone, this.config);
      this.tmpToneColor.setHex(pal.bracketHex);
      const cr = this.tmpToneColor.r;
      const cg = this.tmpToneColor.g;
      const cb = this.tmpToneColor.b;

      const hw = width * 0.5 + cfg.minBoxPadM;
      const hl = length * 0.5 + cfg.minBoxPadM;
      const liftY = ty + cfg.verticalLiftM;

      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const rx = cosY;
      const rz = -sinY;
      const bx = sinY;
      const bz = cosY;

      const pushGroundQuad = (
        lx0: number,
        lz0: number,
        lx1: number,
        lz1: number,
        wxDir: number,
        wzDir: number,
        thickScale = 1.0,
      ) => {
        if (quadIdx >= MAX_BRACKET_QUADS) return;
        const halfT = thick * 0.5 * thickScale;
        const ax0 = tx + rx * (lx0 - wxDir * halfT) + bx * (lz0 - wzDir * halfT);
        const az0 = tz + rz * (lx0 - wxDir * halfT) + bz * (lz0 - wzDir * halfT);
        const bx0 = tx + rx * (lx0 + wxDir * halfT) + bx * (lz0 + wzDir * halfT);
        const bz0 = tz + rz * (lx0 + wxDir * halfT) + bz * (lz0 + wzDir * halfT);

        const ax1 = tx + rx * (lx1 - wxDir * halfT) + bx * (lz1 - wzDir * halfT);
        const az1 = tz + rz * (lx1 - wxDir * halfT) + bz * (lz1 - wzDir * halfT);
        const bx1 = tx + rx * (lx1 + wxDir * halfT) + bx * (lz1 + wzDir * halfT);
        const bz1 = tz + rz * (lx1 + wxDir * halfT) + bz * (lz1 + wzDir * halfT);

        const vBase = quadIdx * 12;
        this.bracketPositions[vBase] = ax0;
        this.bracketPositions[vBase + 1] = liftY;
        this.bracketPositions[vBase + 2] = az0;
        this.bracketPositions[vBase + 3] = bx0;
        this.bracketPositions[vBase + 4] = liftY;
        this.bracketPositions[vBase + 5] = bz0;
        this.bracketPositions[vBase + 6] = ax1;
        this.bracketPositions[vBase + 7] = liftY;
        this.bracketPositions[vBase + 8] = az1;
        this.bracketPositions[vBase + 9] = bx1;
        this.bracketPositions[vBase + 10] = liftY;
        this.bracketPositions[vBase + 11] = bz1;

        for (let k = 0; k < 4; k++) {
          const cBase = (quadIdx * 4 + k) * 3;
          this.bracketColors[cBase] = cr;
          this.bracketColors[cBase + 1] = cg;
          this.bracketColors[cBase + 2] = cb;
        }

        const uBase = quadIdx * 8;
        this.bracketUvs[uBase] = 0;
        this.bracketUvs[uBase + 1] = 0;
        this.bracketUvs[uBase + 2] = 1;
        this.bracketUvs[uBase + 3] = 0;
        this.bracketUvs[uBase + 4] = 0;
        this.bracketUvs[uBase + 5] = 1;
        this.bracketUvs[uBase + 6] = 1;
        this.bracketUvs[uBase + 7] = 1;
        quadIdx++;
      };

      if (category === 'pedestrian' || category === 'cyclist') {
        // Lightweight ground ring halo directly under pedestrian/cyclist (zero rectangular human box!)
        const r = Math.max(0.38, Math.min(0.68, Math.max(hw, hl)));
        const segs = 8;
        for (let s = 0; s < segs && quadIdx < MAX_BRACKET_QUADS; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          const a1 = ((s + 1) / segs) * Math.PI * 2;
          const x0 = Math.cos(a0) * r;
          const z0 = Math.sin(a0) * r;
          const x1 = Math.cos(a1) * r;
          const z1 = Math.sin(a1) * r;
          const am = (a0 + a1) * 0.5;
          pushGroundQuad(x0, z0, x1, z1, Math.cos(am), Math.sin(am), 0.75);
        }
        return;
      }

      if (category === 'static-obstacle') {
        // Translucent ground-footprint risk zone + slim perimeter contour (no floating ! or debug box)
        if (quadIdx < MAX_BRACKET_QUADS) {
          const padW = width * 0.5 + 0.10;
          const padL = length * 0.5 + 0.10;
          const vBase = quadIdx * 12;
          this.bracketPositions[vBase] = tx - rx * padW - bx * padL;
          this.bracketPositions[vBase + 1] = liftY - 0.008;
          this.bracketPositions[vBase + 2] = tz - rz * padW - bz * padL;
          this.bracketPositions[vBase + 3] = tx + rx * padW - bx * padL;
          this.bracketPositions[vBase + 4] = liftY - 0.008;
          this.bracketPositions[vBase + 5] = tz + rz * padW - bz * padL;
          this.bracketPositions[vBase + 6] = tx - rx * padW + bx * padL;
          this.bracketPositions[vBase + 7] = liftY - 0.008;
          this.bracketPositions[vBase + 8] = tz - rz * padW + bz * padL;
          this.bracketPositions[vBase + 9] = tx + rx * padW + bx * padL;
          this.bracketPositions[vBase + 10] = liftY - 0.008;
          this.bracketPositions[vBase + 11] = tz + rz * padW + bz * padL;
          for (let k = 0; k < 4; k++) {
            const cBase = (quadIdx * 4 + k) * 3;
            this.bracketColors[cBase] = cr;
            this.bracketColors[cBase + 1] = cg;
            this.bracketColors[cBase + 2] = cb;
          }
          const uBase = quadIdx * 8;
          this.bracketUvs[uBase] = 0;
          this.bracketUvs[uBase + 1] = -2;
          this.bracketUvs[uBase + 2] = 1;
          this.bracketUvs[uBase + 3] = -2;
          this.bracketUvs[uBase + 4] = 0;
          this.bracketUvs[uBase + 5] = -1;
          this.bracketUvs[uBase + 6] = 1;
          this.bracketUvs[uBase + 7] = -1;
          quadIdx++;
        }
        const cw = width * 0.5 + 0.10;
        const cl = length * 0.5 + 0.10;
        pushGroundQuad(-cw, cl, cw, cl, 0, 1, 0.85);
        pushGroundQuad(-cw, -cl, cw, -cl, 0, 1, 0.85);
        pushGroundQuad(-cw, -cl, -cw, cl, 1, 0, 0.85);
        pushGroundQuad(cw, -cl, cw, cl, 1, 0, 0.85);
        return;
      }

      // Vehicles (lead & interfering adjacent): slim ground-hugging under-bumper & wheel-track marks
      // Zero rectangular cage corners, zero vertical 3D poles
      const trackHalfW = Math.max(0.55, width * 0.44);
      const rearZ = length * 0.5 + 0.14;
      const sideRailLen = Math.min(0.85, length * 0.24);
      const thickMul = tone === 'hazard' ? 1.45 : tone === 'caution' ? 1.15 : 0.95;

      // Subtle segmented rear under-bumper optical bar
      pushGroundQuad(-trackHalfW, rearZ, trackHalfW, rearZ, 0, 1, thickMul);
      // Slim short rear wheel-track chamfered ticks
      pushGroundQuad(-trackHalfW, rearZ, -trackHalfW, rearZ - sideRailLen, 1, 0, 0.85 * thickMul);
      pushGroundQuad(trackHalfW, rearZ, trackHalfW, rearZ - sideRailLen, 1, 0, 0.85 * thickMul);
      if (tone === 'hazard') {
        // Gentle inner risk chevron bar right behind rear bumper during emergency gap/AEB
        pushGroundQuad(-trackHalfW * 0.58, rearZ + 0.22, trackHalfW * 0.58, rearZ + 0.22, 0, 1, 1.25);
      }
    };

    if (target.active) {
      const cat =
        target.category ??
        (target.kind === 'obstacle' ? 'static-obstacle' : 'lead');
      appendMarker(target.x, target.y, target.z, target.yaw, target.width, target.length, target.tone, cat);
    }
    if (extraTargets) {
      for (let i = 0; i < extraTargets.length; i++) {
        const et = extraTargets[i]!;
        appendMarker(et.x, et.y, et.z, et.yaw, et.width, et.length, et.tone, et.category ?? 'adjacent');
      }
    }

    (this.bracketGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.bracketGeo.getAttribute('uv') as BufferAttribute).needsUpdate = true;
    (this.bracketGeo.getAttribute('aColor') as BufferAttribute).needsUpdate = true;
    this.bracketGeo.setDrawRange(0, quadIdx * 6);
    this.hasValidBracketGeo = quadIdx > 0;
  }

  private rebuildWorldCallouts(packet: ADASWorldVisualPacket): void {
    let slotIdx = 0;
    const assignSlot = (
      tx: number,
      ty: number,
      tz: number,
      height: number,
      distanceM: number,
      speedKmh: number | null | undefined,
      tone: ADASRibbonTone,
      category: 'lead' | 'adjacent' | 'static-obstacle' | 'pedestrian' | 'cyclist',
    ) => {
      if (slotIdx >= this.callouts.length) return;
      if (category === 'pedestrian' || category === 'cyclist') return;
      if (!Number.isFinite(distanceM) || distanceM > 95) return;
      if (category === 'static-obstacle' && tone !== 'hazard' && distanceM > 45) return;

      const slot = this.callouts[slotIdx]!;
      slotIdx++;
      slot.active = true;
      slot.wx = tx;
      slot.wy = ty + Math.max(1.2, height) + 0.36;
      slot.wz = tz;

      const distText = `${Math.max(1, Math.round(distanceM))}m`;
      const mainText =
        category === 'static-obstacle'
          ? distText
          : speedKmh !== null && speedKmh !== undefined && Number.isFinite(speedKmh)
            ? `${distText} · ${Math.max(0, Math.round(speedKmh))}`
            : distText;

      const sig = `${this.activeTheme}|${tone}|${mainText}`;
      if (sig === slot.signature) return;
      slot.signature = sig;

      const ctx = slot.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, 256, 84);
      const pal = resolvePaletteForTone(this.activeTheme, tone, this.config);
      this.tmpToneColor.setHex(pal.bracketHex);
      const hexCol = `#${this.tmpToneColor.getHexString()}`;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 5;
      ctx.fillStyle = tone === 'normal' ? 'rgba(232, 246, 252, 0.94)' : hexCol;
      ctx.font = '600 28px "Bahnschrift", "DIN Alternate", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mainText, 128, 34);

      // Subtle minimal optical underline tick pointing to target below
      ctx.fillStyle = hexCol;
      ctx.fillRect(108, 56, 40, 3);
      ctx.restore();
      slot.texture.needsUpdate = true;
    };

    if (packet.target.active) {
      const t = packet.target;
      assignSlot(
        t.x,
        t.y,
        t.z,
        t.height,
        t.distanceM,
        t.speedKmh,
        t.tone,
        t.category ?? (t.kind === 'obstacle' ? 'static-obstacle' : 'lead'),
      );
    }
    if (packet.extraTargets) {
      for (let i = 0; i < packet.extraTargets.length && slotIdx < this.callouts.length; i++) {
        const et = packet.extraTargets[i]!;
        assignSlot(
          et.x,
          et.y,
          et.z,
          et.height,
          et.distanceM ?? Math.hypot(et.x - packet.egoX, et.z - packet.egoZ),
          et.speedKmh,
          et.tone,
          et.category ?? 'adjacent',
        );
      }
    }
    for (let i = slotIdx; i < this.callouts.length; i++) {
      this.callouts[i]!.active = false;
    }
  }

  private rebuildPedestrianPaths(
    paths: NonNullable<ADASWorldVisualPacket['pedestrianPaths']>,
  ): void {
    let quadIdx = 0;

    for (let p = 0; p < paths.length && quadIdx < MAX_PED_QUADS; p++) {
      const path = paths[p]!;
      const pal = resolvePaletteForTone(this.activeTheme, path.tone, this.config);
      this.tmpToneColor.setHex(pal.bracketHex);
      const cr = this.tmpToneColor.r;
      const cg = this.tmpToneColor.g;
      const cb = this.tmpToneColor.b;

      const pts = path.points;
      const numPts = Math.floor(pts.length / 3);
      let sAccum = 0;

      for (let i = 0; i + 1 < numPts && quadIdx < MAX_PED_QUADS; i++) {
        const ax = pts[i * 3]!;
        const ay = pts[i * 3 + 1]!;
        const az = pts[i * 3 + 2]!;
        const bx = pts[(i + 1) * 3]!;
        const by = pts[(i + 1) * 3 + 1]!;
        const bz = pts[(i + 1) * 3 + 2]!;
        const dx = bx - ax;
        const dz = bz - az;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 0.05) continue;

        // Progressive widening (0.075m -> 0.19m) + opacity taper cleanly communicate prediction uncertainty
        const u0 = i / Math.max(1, numPts - 1);
        const u1 = (i + 1) / Math.max(1, numPts - 1);
        const hw0 = 0.075 + u0 * 0.115;
        const hw1 = 0.075 + u1 * 0.115;
        const fade0 = 1.0 - u0 * 0.72;
        const fade1 = 1.0 - u1 * 0.72;

        const rx = -dz / segLen;
        const rz = dx / segLen;
        const vBase = quadIdx * 12;
        this.pedPositions[vBase] = ax - rx * hw0;
        this.pedPositions[vBase + 1] = ay + 0.032;
        this.pedPositions[vBase + 2] = az - rz * hw0;
        this.pedPositions[vBase + 3] = ax + rx * hw0;
        this.pedPositions[vBase + 4] = ay + 0.032;
        this.pedPositions[vBase + 5] = az + rz * hw0;
        this.pedPositions[vBase + 6] = bx - rx * hw1;
        this.pedPositions[vBase + 7] = by + 0.032;
        this.pedPositions[vBase + 8] = bz - rz * hw1;
        this.pedPositions[vBase + 9] = bx + rx * hw1;
        this.pedPositions[vBase + 10] = by + 0.032;
        this.pedPositions[vBase + 11] = bz + rz * hw1;

        const vStart = sAccum * 1.8;
        const vEnd = (sAccum + segLen) * 1.8;
        const uBase = quadIdx * 12;
        this.pedDashUvs[uBase] = -1;
        this.pedDashUvs[uBase + 1] = vStart;
        this.pedDashUvs[uBase + 2] = fade0;
        this.pedDashUvs[uBase + 3] = 1;
        this.pedDashUvs[uBase + 4] = vStart;
        this.pedDashUvs[uBase + 5] = fade0;
        this.pedDashUvs[uBase + 6] = -1;
        this.pedDashUvs[uBase + 7] = vEnd;
        this.pedDashUvs[uBase + 8] = fade1;
        this.pedDashUvs[uBase + 9] = 1;
        this.pedDashUvs[uBase + 10] = vEnd;
        this.pedDashUvs[uBase + 11] = fade1;

        for (let k = 0; k < 4; k++) {
          const cBase = (quadIdx * 4 + k) * 3;
          this.pedColors[cBase] = cr;
          this.pedColors[cBase + 1] = cg;
          this.pedColors[cBase + 2] = cb;
        }
        sAccum += segLen;
        quadIdx++;
      }

      // Draw restrained ground conflict highlight at predicted intersection zone
      if (path.hasConflict && path.conflictPoint && quadIdx < MAX_PED_QUADS) {
        const cp = path.conflictPoint;
        const rDisc = 0.46;
        const vBase = quadIdx * 12;
        this.pedPositions[vBase] = cp.x - rDisc;
        this.pedPositions[vBase + 1] = cp.y + 0.045;
        this.pedPositions[vBase + 2] = cp.z - rDisc;
        this.pedPositions[vBase + 3] = cp.x + rDisc;
        this.pedPositions[vBase + 4] = cp.y + 0.045;
        this.pedPositions[vBase + 5] = cp.z - rDisc;
        this.pedPositions[vBase + 6] = cp.x - rDisc;
        this.pedPositions[vBase + 7] = cp.y + 0.045;
        this.pedPositions[vBase + 8] = cp.z + rDisc;
        this.pedPositions[vBase + 9] = cp.x + rDisc;
        this.pedPositions[vBase + 10] = cp.y + 0.045;
        this.pedPositions[vBase + 11] = cp.z + rDisc;

        // y = -1.0 triggers circular radial conflict zone mask in PED_FRAGMENT_SHADER
        const uBase = quadIdx * 12;
        this.pedDashUvs[uBase] = -1;
        this.pedDashUvs[uBase + 1] = -2;
        this.pedDashUvs[uBase + 2] = 1;
        this.pedDashUvs[uBase + 3] = 1;
        this.pedDashUvs[uBase + 4] = -2;
        this.pedDashUvs[uBase + 5] = 1;
        this.pedDashUvs[uBase + 6] = -1;
        this.pedDashUvs[uBase + 7] = 0;
        this.pedDashUvs[uBase + 8] = 1;
        this.pedDashUvs[uBase + 9] = 1;
        this.pedDashUvs[uBase + 10] = 0;
        this.pedDashUvs[uBase + 11] = 1;

        for (let k = 0; k < 4; k++) {
          const cBase = (quadIdx * 4 + k) * 3;
          if (path.tone === 'hazard') {
            this.pedColors[cBase] = 0.94;
            this.pedColors[cBase + 1] = 0.36;
            this.pedColors[cBase + 2] = 0.36;
          } else {
            this.pedColors[cBase] = 0.95;
            this.pedColors[cBase + 1] = 0.68;
            this.pedColors[cBase + 2] = 0.28;
          }
        }
        quadIdx++;
      }
    }

    (this.pedGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.pedGeo.getAttribute('aColor') as BufferAttribute).needsUpdate = true;
    (this.pedGeo.getAttribute('aDashUv') as BufferAttribute).needsUpdate = true;
    this.pedGeo.setDrawRange(0, quadIdx * 6);
    this.hasValidPedGeo = quadIdx > 0;
  }
}
