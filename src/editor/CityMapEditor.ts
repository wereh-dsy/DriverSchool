import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CityGround } from '../world/city/CityGround';
import { CITY_EDITOR_STORAGE_KEY, loadCityMap } from '../world/city/CityMapLoader';
import { INTERSECTION_LANES, PREFAB_IDS, ROAD_LANES, newCityMap, type CityIntersection, type CityMapData, type CityObject, type CityPoint, type CityRoad, type IntersectionPort, type IntersectionType, type PrefabId, type RoadType, type RoadEndpoint } from '../world/city/CityMapData';
import { connectionPoint, junctionExtent, portsFor, rotatePoint, syncConnections, roadEdges, roadPoints } from '../world/city/geometry';
import { createRoad, moveRoadNode, createIntersection, placePrefab, placePreset, deleteObject, connectRoad, detachRoadEndpoint, roadEndpoint, saveMap, validateMap } from '../world/city/MapAPI';
import { ROAD_STYLES, applyRoadStyle } from '../world/city/RoadStyles';
import { PRESET_CATALOG, expandPreset, type PresetParameters, type PresetStamp } from '../world/city/presets/InfrastructurePresets';
import { projectWorldToRoad } from '../world/navigation/RoadNetwork';
import { CityEditorHistory } from './CityEditorHistory';
import cityAlpha from '../world/city/maps/city-alpha.json';
import './city-editor.css';

type Tool = 'select' | 'road' | 'intersection' | 'prefab' | 'preset';
type Entity = CityRoad | CityIntersection | CityObject;
interface Snap { point: CityPoint; junctionId?: string; port?: IntersectionPort; endpoint?: RoadEndpoint }
interface Drag { id: string; node?: number; start: CityPoint; before: CityMapData; moved: boolean }

export class CityMapEditor {
  private readonly ui = document.createElement('main');
  private readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly topCamera = new THREE.OrthographicCamera(-300, 300, 300, -300, 0.1, 6000);
  private readonly previewCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
  private readonly topControls: OrbitControls;
  private readonly previewControls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly history = new CityEditorHistory();
  private data: CityMapData = loadCityMap(cityAlpha);
  private ground!: CityGround;
  private readonly overlay = new THREE.Group();
  private readonly ghost = new THREE.Group();
  private ghostPosition: CityPoint = { x: 0, y: 0, z: 0 };
  private presetStamp: PresetStamp | null = null;
  private selectedNode = 0;
  private grid = new THREE.Group();
  private selectedId: string | null = null;
  private tool: Tool = 'select';
  private draft: Snap[] = [];
  private drag: Drag | null = null;
  private topView = true;
  private dirty = false;
  private readonly viewport: HTMLElement;
  private readonly inspector: HTMLElement;
  private readonly fileInput = document.createElement('input');
  private frame = 0;
  private lastFrame = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly keyHandler = (e: KeyboardEvent) => this.key(e);
  private readonly unloadHandler = (e: BeforeUnloadEvent) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };

  constructor(host: HTMLElement) {
    this.ui.className = 'city-editor';
    try { const saved = localStorage.getItem(CITY_EDITOR_STORAGE_KEY); if (saved) this.data = loadCityMap(JSON.parse(saved)); } catch { /* A stale/corrupt draft falls back to Alpha. */ }
    this.ui.innerHTML = `<header><strong>City Map Editor V2</strong>
      <button data-action="new">New</button><button data-action="alpha">Reload City Alpha</button><button data-action="import">Open / Import Updated Map</button><button data-action="export">Save / Export</button>
      <button data-action="undo">Undo</button><button data-action="redo">Redo</button><button data-action="view">Top / 3D</button><button data-action="fit">Fit</button><button data-action="validate">Validate</button><button data-action="play">Play in Game</button></header>
      <aside class="ce-tools"><h3>Tools</h3><button data-tool="select">Select / Move</button><button data-tool="road">Road</button>
      <select data-road-type>${Object.keys(ROAD_LANES).map(t => `<option>${t}</option>`).join('')}</select>
      <select data-road-style>${ROAD_STYLES.map(s => `<option value="${s.id}" ${s.id === 'urban_street_4' ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <button data-action="finish">Finish Road (Enter)</button><button data-tool="intersection">Intersection</button>
      <select data-junction-type>${Object.keys(INTERSECTION_LANES).map(t => `<option>${t}</option>`).join('')}</select>
      <label>Signalized<input type="checkbox" data-new-signal checked></label>
      <button data-tool="prefab">Prefab</button><select data-prefab>${PREFAB_IDS.map(t => `<option>${t}</option>`).join('')}</select>
      <button data-tool="preset">Preset / Stamp</button><select data-preset>${['ROAD', 'INTERSECTION', 'INTERCHANGE', 'DISTRICT'].map(category => `<optgroup label="${category}">${PRESET_CATALOG.filter(p => p.category === category).map(p => `<option value="${p.id}">${p.id}</option>`).join('')}</optgroup>`).join('')}</select>
      <div class="ce-preset-params"><label>Rotation °<input data-preset-rotation type="number" value="0" step="15"></label><label>Base Y<input data-preset-y type="number" value="0" step="0.5"></label>
      <label>Main lanes<select data-preset-main><option>6</option><option>4</option></select></label><label>Cross lanes<select data-preset-cross><option>4</option><option>6</option></select></label>
      <label>Elevation m<input data-preset-height type="number" value="8" min="5" max="12" step="0.5"></label><label>Ramp lanes<select data-preset-lanes><option>1</option><option>2</option></select></label><label>Radius m<input data-preset-radius type="number" value="100" min="40" max="100"></label>
      <label>Anchor port<select data-preset-anchor><option value="">Centre</option></select></label><p data-preset-description class="ce-hint"></p></div>
      <hr><label>Grid<input type="checkbox" data-grid checked></label><label>Grid snap<input type="checkbox" data-snap checked></label>
      <label>Grid m<input type="number" data-grid-step value="5" min="1" max="100"></label><label>Endpoint snap<input type="checkbox" data-endpoint-snap checked></label>
      <p class="ce-hint">Top: left click to edit; middle/right drag to pan; wheel to zoom.<br>3D: left drag to orbit; right drag to pan. Edit in Top.<br>Esc cancels road. Delete removes selection. Ctrl+Z / Ctrl+Y history.</p>
      <h3>Objects</h3><select class="ce-object-list" data-list size="6"></select></aside>
      <div class="ce-viewport"></div><aside class="ce-inspector"></aside><footer></footer>`;
    host.replaceChildren(this.ui);
    this.viewport = this.require('.ce-viewport'); this.inspector = this.require('.ce-inspector');
    this.viewport.append(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setClearColor(0x889ca8);
    this.scene.add(new THREE.HemisphereLight(0xddeeff, 0x76705f, 2.3));
    const sun = new THREE.DirectionalLight(0xfff3dd, 3); sun.position.set(180, 350, 100); this.scene.add(sun, this.overlay, this.ghost);
    this.topCamera.position.set(0, 1800, 0); this.topCamera.up.set(0, 0, -1); this.topCamera.lookAt(0, 0, 0);
    this.previewCamera.position.set(350, 300, 350);
    this.topControls = new OrbitControls(this.topCamera, this.renderer.domElement);
    this.previewControls = new OrbitControls(this.previewCamera, this.renderer.domElement); this.configureControls();
    this.fileInput.type = 'file'; this.fileInput.accept = '.json,application/json'; this.fileInput.hidden = true; this.ui.append(this.fileInput);
    this.fileInput.addEventListener('change', () => { const file = this.fileInput.files?.[0]; if (file) void this.readFile(file); this.fileInput.value = ''; });
    this.ui.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => void this.action(button.dataset.action!)));
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.addEventListener('click', () => { this.tool = button.dataset.tool as Tool; this.draft = []; this.ghost.visible = this.tool === 'preset'; this.updateUI(); this.drawOverlay(); if (this.tool === 'preset') this.refreshPreset(); }));
    this.require('[data-preset]').addEventListener('change', () => this.refreshPreset());
    this.ui.querySelectorAll<HTMLElement>('.ce-preset-params input,.ce-preset-params select').forEach(c => c.addEventListener('change', () => this.refreshPreset(true)));
    this.require('[data-road-style]').addEventListener('change', () => { this.require<HTMLSelectElement>('[data-road-type]').value = ROAD_STYLES.find(s => s.id === this.value('[data-road-style]'))!.type; });
    this.require('[data-grid]').addEventListener('change', () => { this.grid.visible = this.checked('[data-grid]'); });
    this.require('[data-grid-step]').addEventListener('change', () => this.drawGrid());
    this.require<HTMLSelectElement>('[data-list]').addEventListener('change', e => { this.selectedId = (e.target as HTMLSelectElement).value || null; this.updateUI(); this.drawOverlay(); });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', e => this.pointerDown(e));
    canvas.addEventListener('pointermove', e => this.pointerMove(e));
    canvas.addEventListener('pointerup', e => this.pointerUp(e));
    canvas.addEventListener('pointercancel', () => this.cancelDrag());
    window.addEventListener('keydown', this.keyHandler); window.addEventListener('beforeunload', this.unloadHandler);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.viewport);
    this.require<HTMLSelectElement>('[data-road-type]').value = 'urban_4lane';
    this.refreshPreset(); this.ghost.visible = false; this.resize(); this.rebuild(); this.fit(); this.animate(0);
  }
  private require<T extends HTMLElement = HTMLElement>(selector: string): T { return this.ui.querySelector<T>(selector)!; }
  private checked(selector: string): boolean { return this.require<HTMLInputElement>(selector).checked; }
  private value(selector: string): string { return this.require<HTMLInputElement>(selector).value; }
  private get camera(): THREE.Camera { return this.topView ? this.topCamera : this.previewCamera; }
  private get controls(): OrbitControls { return this.topView ? this.topControls : this.previewControls; }
  private entities(): Entity[] { return [...this.data.roads, ...this.data.intersections, ...this.data.objects]; }
  private selected(): Entity | undefined { return this.entities().find(e => e.id === this.selectedId); }
  private status(message?: string): void {
    this.require('footer').textContent = message ?? `${this.data.name}${this.dirty ? ' *' : ''} · ${this.data.roads.length} roads / ${this.data.intersections.length} junctions / ${this.data.objects.length} prefabs · ${this.topView ? 'TOP' : '3D PREVIEW'} · sectors ${this.data.sectorSize}m · ${this.draft.length ? `${this.draft.length} road nodes; Enter to finish` : 'Ready'}`;
  }
  private rebuild(): void {
    if (this.ground) { this.scene.remove(this.ground.root); this.ground.dispose(); }
    syncConnections(this.data); this.ground = new CityGround(this.data, { editor: true }); this.scene.add(this.ground.root);
    this.drawGrid(); this.drawOverlay(); this.updateUI();
  }
  private persist(): void { try { localStorage.setItem(CITY_EDITOR_STORAGE_KEY, saveMap(this.data)); } catch { this.status('Browser draft storage unavailable; use JSON Export to save.'); } }
  private change(edit: () => void): void {
    const before = structuredClone(this.data);
    try { edit(); syncConnections(this.data); this.data = loadCityMap(this.data); this.history.record(before, this.data); this.dirty = true; this.rebuild(); this.persist(); }
    catch (error) { this.data = before; this.rebuild(); this.status(String(error)); }
  }
  private clearGroup(group: THREE.Group): void {
    group.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { o.geometry.dispose(); const list = Array.isArray(o.material) ? o.material : [o.material]; list.forEach(m => m.dispose()); } }); group.clear();
  }
  private presetParameters(): PresetParameters {
    return { position: { ...this.ghostPosition }, rotation: THREE.MathUtils.degToRad(Number(this.value('[data-preset-rotation]'))),
      mainRoadLanes: Number(this.value('[data-preset-main]')), crossRoadLanes: Number(this.value('[data-preset-cross]')),
      mainElevation: Number(this.value('[data-preset-height]')), rampLaneCount: Number(this.value('[data-preset-lanes]')), rampRadius: Number(this.value('[data-preset-radius]')) };
  }
  private refreshPreset(keepAnchor = false): void {
    this.clearGroup(this.ghost);
    try {
      const params = this.presetParameters(); params.position = { x: 0, y: 0, z: 0 }; params.groupId = 'preview';
      this.presetStamp = expandPreset(this.value('[data-preset]'), params);
      const anchor = this.require<HTMLSelectElement>('[data-preset-anchor]'), old = keepAnchor ? anchor.value : '';
      anchor.replaceChildren(new Option('Centre', ''));
      for (const port of this.presetStamp.connectionPorts) anchor.add(new Option(port.label, port.label)); anchor.value = old;
      if (anchor.selectedIndex < 0) anchor.selectedIndex = 0;
      const descriptor = PRESET_CATALOG.find(p => p.id === this.value('[data-preset]'))!;
      this.require('[data-preset-description]').textContent = `${descriptor.description} R rotates 15°. Cyan = exposed ports; select an anchor to snap a port.`;
      const line = (points: CityPoint[], color: number) => this.ghost.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, (p.y ?? 0) + 0.5, p.z))), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.75 })));
      for (const road of this.presetStamp.roads) {
        const points = roadPoints(road), edges = roadEdges(road);
        for (const offset of [edges.left, edges.right]) line(points.map((p, i) => { const next = points[Math.min(i + 1, points.length - 1)]!, previous = points[Math.max(0, i - 1)]!, dx = next.x - previous.x, dz = next.z - previous.z, l = Math.hypot(dx, dz) || 1; return { x: p.x - dz / l * offset, y: p.y, z: p.z + dx / l * offset }; }), 0x72efbc);
      }
      for (const object of this.presetStamp.objects) { const p = object.position; line([{ x: p.x - 8, y: p.y, z: p.z - 8 }, { x: p.x + 8, y: p.y, z: p.z - 8 }, { x: p.x + 8, y: p.y, z: p.z + 8 }, { x: p.x - 8, y: p.y, z: p.z + 8 }, { x: p.x - 8, y: p.y, z: p.z - 8 }], 0x72efbc); }
      for (const port of this.presetStamp.connectionPorts) {
        const point = roadEndpoint({ ...this.data, roads: this.presetStamp.roads }, port.endpoint);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x40d9ff, depthTest: false })); dot.position.set(point.x, (point.y ?? 0) + 1, point.z); this.ghost.add(dot);
      }
      this.ghost.position.set(this.ghostPosition.x, this.ghostPosition.y ?? 0, this.ghostPosition.z); this.ghost.visible = this.tool === 'preset';
    } catch (error) { this.presetStamp = null; this.status(String(error)); }
  }
  private positionPreset(p: CityPoint): Snap {
    const snap = this.snap(p), anchor = this.presetStamp?.connectionPorts.find(port => port.label === this.value('[data-preset-anchor]'));
    const q = anchor ? roadEndpoint({ ...this.data, roads: this.presetStamp!.roads }, anchor.endpoint) : { x: 0, y: 0, z: 0 };
    const y = anchor && (snap.endpoint || snap.junctionId) ? (snap.point.y ?? 0) - (q.y ?? 0) : Number(this.value('[data-preset-y]'));
    this.ghostPosition = { x: snap.point.x - q.x, y, z: snap.point.z - q.z };
    this.ghost.position.set(this.ghostPosition.x, y, this.ghostPosition.z); return snap;
  }
  private drawGrid(): void {
    this.clearGroup(this.grid); this.scene.remove(this.grid); this.grid = new THREE.Group();
    const b = this.data.bounds, step = Math.max(1, Math.min(100, Number(this.value('[data-grid-step]')) || 5));
    const vertices: number[] = [], sectorVertices: number[] = [], size = this.data.sectorSize;
    // Cap only the display density for very large maps; snapping keeps the chosen step.
    const displayStep = Math.max(step, Math.ceil(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 500 / step) * step);
    for (let x = Math.ceil(b.minX / displayStep) * displayStep; x <= b.maxX; x += displayStep) vertices.push(x, 0.19, b.minZ, x, 0.19, b.maxZ);
    for (let z = Math.ceil(b.minZ / displayStep) * displayStep; z <= b.maxZ; z += displayStep) vertices.push(b.minX, 0.19, z, b.maxX, 0.19, z);
    for (let x = Math.ceil(b.minX / size) * size; x <= b.maxX; x += size) sectorVertices.push(x, 0.22, b.minZ, x, 0.22, b.maxZ);
    for (let z = Math.ceil(b.minZ / size) * size; z <= b.maxZ; z += size) sectorVertices.push(b.minX, 0.22, z, b.maxX, 0.22, z);
    for (const [points, color, opacity] of [[vertices, 0x768b91, 0.22], [sectorVertices, 0x37c3e3, 0.7]] as const) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      this.grid.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })));
    }
    this.grid.visible = this.checked('[data-grid]'); this.scene.add(this.grid);
  }
  private drawOverlay(): void {
    this.clearGroup(this.overlay);
    const marker = (p: CityPoint, color: number, radius = 1.5) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 6), new THREE.MeshBasicMaterial({ color, depthTest: false })); mesh.position.set(p.x, (p.y ?? 0) + 1, p.z); mesh.renderOrder = 10; this.overlay.add(mesh);
    };
    const line = (points: CityPoint[], color: number) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, (p.y ?? 0) + 0.4, p.z)));
      const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false })); mesh.renderOrder = 9; this.overlay.add(mesh);
    };
    const selected = this.selected();
    if (selected && 'centerline' in selected) { line(roadPoints(selected), 0x49caff); selected.centerline.forEach((p, i) => marker(p, i === this.selectedNode ? 0xff7f38 : 0xffd35b)); }
    else if (selected) { marker(selected.position, 0xffd35b, 2.5); const direction = rotatePoint({ x: 0, z: -12 }, selected.rotation); line([selected.position, { x: selected.position.x + direction.x, z: selected.position.z + direction.z }], 0xffd35b); }
    if (this.tool === 'road' || this.tool === 'intersection' || (selected && 'connections' in selected)) for (const j of this.data.intersections) for (const port of portsFor(j)) marker(connectionPoint(j, port, this.data), j.connections.some(c => c.port === port) ? 0xe77959 : 0x65e3ba);
    if (this.draft.length) { const points = this.draft.map(s => s.point); line(points, 0x71f5ae); points.forEach(p => marker(p, 0x71f5ae)); }
    for (const spawn of this.data.environment.spawnPoints) marker(spawn.position, 0xec66da, 2);
    for (const port of this.data.connectionPorts ?? []) marker(roadEndpoint(this.data, port.endpoint), 0x40d9ff, 2);
  }
  private configureControls(): void {
    this.topControls.enabled = this.topView; this.previewControls.enabled = !this.topView;
    this.topControls.enableRotate = false; this.topControls.mouseButtons.LEFT = null;
    this.topControls.mouseButtons.MIDDLE = THREE.MOUSE.PAN; this.topControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.topControls.minZoom = 0.01; this.topControls.maxZoom = 80;
    this.previewControls.minDistance = 5; this.previewControls.maxDistance = 3500; this.previewControls.maxPolarAngle = Math.PI / 2 - 0.02;
  }
  private resize(): void {
    const w = Math.max(1, this.viewport.clientWidth), h = Math.max(1, this.viewport.clientHeight), ratio = w / h;
    this.renderer.setSize(w, h); this.previewCamera.aspect = ratio; this.previewCamera.updateProjectionMatrix();
    this.topCamera.left = -300 * ratio; this.topCamera.right = 300 * ratio; this.topCamera.top = 300; this.topCamera.bottom = -300; this.topCamera.updateProjectionMatrix();
  }
  private fit(): void {
    const b = this.data.bounds, x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    this.controls.target.set(x, 0, z); this.topCamera.position.set(x, 1800, z); this.topCamera.zoom = Math.min(600 / (b.maxZ - b.minZ), (this.topCamera.right - this.topCamera.left) / (b.maxX - b.minX)) * 0.9;
    this.topCamera.updateProjectionMatrix(); this.previewCamera.position.set(x + 500, 450, z + 500); this.controls.update();
  }
  private ray(e: PointerEvent): CityPoint | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const point = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3()); return point ? { x: point.x, z: point.z } : null;
  }
  private tolerance(): number { return Math.max(2, (this.topCamera.right - this.topCamera.left) / this.topCamera.zoom / this.viewport.clientWidth * 10); }
  private snap(p: CityPoint, roadId?: string): Snap {
    const threshold = Math.min(20, Math.max(8, this.tolerance()));
    if (this.checked('[data-endpoint-snap]')) {
      let nearest: Snap | undefined, distance = threshold;
      for (const j of this.data.intersections) for (const port of portsFor(j)) {
        if (j.connections.some(c => c.port === port && c.roadId !== roadId)) continue;
        const point = connectionPoint(j, port, this.data), d = Math.hypot(point.x - p.x, point.z - p.z);
        if (d < distance) { distance = d; nearest = { point, junctionId: j.id, port }; }
      }
      if (nearest) return nearest;
      for (const r of this.data.roads) if (r.id !== roadId) for (const end of ['start', 'end'] as const) {
        if (this.data.intersections.some(j => j.connections.some(c => c.roadId === r.id && c.end === end))) continue;
        const endpoint = { roadId: r.id, end }, point = roadEndpoint(this.data, endpoint);
        const d = Math.hypot(point.x - p.x, point.z - p.z); if (d < distance) { distance = d; nearest = { point, endpoint }; }
      }
      if (nearest) return nearest;
    }
    const step = Math.max(1, Math.min(100, Number(this.value('[data-grid-step]')) || 5));
    return { point: this.checked('[data-snap]') ? { x: Math.round(p.x / step) * step, z: Math.round(p.z / step) * step } : { ...p } };
  }
  private connect(road: CityRoad, end: 'start' | 'end', snap: Snap): void {
    const from = { roadId: road.id, end }; detachRoadEndpoint(this.data, from);
    if (snap.junctionId && snap.port) connectRoad(this.data, from, { junctionId: snap.junctionId, port: snap.port });
    else if (snap.endpoint) connectRoad(this.data, from, { endpoint: snap.endpoint });
  }
  private detach(road: CityRoad): void { detachRoadEndpoint(this.data, { roadId: road.id, end: 'start' }); detachRoadEndpoint(this.data, { roadId: road.id, end: 'end' }); }
  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.topView) return;
    const p = this.ray(e); if (!p) return;
    if (this.tool === 'preset') {
      if (!this.presetStamp) return;
      const snapped = this.positionPreset(p), label = this.value('[data-preset-anchor]');
      this.change(() => {
        const stamp = placePreset(this.data, this.value('[data-preset]'), this.presetParameters());
        const anchor = stamp.connectionPorts.find(port => port.label === label);
        if (anchor && snapped.junctionId && snapped.port) connectRoad(this.data, anchor.endpoint, { junctionId: snapped.junctionId, port: snapped.port });
        else if (anchor && snapped.endpoint) connectRoad(this.data, anchor.endpoint, { endpoint: snapped.endpoint });
        this.selectedId = stamp.roads[0]?.id ?? stamp.objects[0]?.id ?? null;
      }); return;
    }
    if (this.tool === 'road') {
      const snapped = this.snap(p), last = this.draft.at(-1)?.point;
      if (!last || Math.hypot(snapped.point.x - last.x, snapped.point.z - last.z) >= 0.1) { snapped.point.y ??= ROAD_STYLES.find(s => s.id === this.value('[data-road-style]'))!.elevation; this.draft.push(snapped); }
      this.drawOverlay(); this.status(); return;
    }
    if (this.tool === 'intersection') {
      this.change(() => {
        const j = createIntersection(this.data, { type: this.value('[data-junction-type]') as IntersectionType, position: this.snap(p).point, rotation: 0, signalized: this.checked('[data-new-signal]') }); this.selectedId = j.id;
        for (const port of portsFor(j)) {
          const cp = connectionPoint(j, port, this.data);
          let closest: { r: CityRoad; end: 'start' | 'end' } | undefined, best = 12;
          for (const r of this.data.roads) for (const end of ['start', 'end'] as const) {
            if (this.data.intersections.some(j => j.connections.some(c => c.roadId === r.id && c.end === end))) continue;
            const ep = end === 'start' ? r.centerline[0]! : r.centerline.at(-1)!, d = Math.hypot(cp.x - ep.x, cp.z - ep.z);
            if (d < best && Math.abs((ep.y ?? 0) - (j.position.y ?? 0)) < 0.2) { best = d; closest = { r, end }; }
          }
          if (closest) connectRoad(this.data, { roadId: closest.r.id, end: closest.end }, { junctionId: j.id, port });
        }
      }); return;
    }
    if (this.tool === 'prefab') {
      this.change(() => { const o = placePrefab(this.data, { prefabId: this.value('[data-prefab]') as PrefabId, position: this.snap(p).point, rotation: 0 }); this.selectedId = o.id; }); return;
    }
    const selected = this.selected();
    if (selected && 'centerline' in selected) {
      const node = selected.centerline.findIndex(point => Math.hypot(point.x - p.x, point.z - p.z) < this.tolerance());
      if (node >= 0) { this.selectedNode = node; this.updateUI(); this.drawOverlay(); this.drag = { id: selected.id, node, start: p, before: structuredClone(this.data), moved: false }; this.renderer.domElement.setPointerCapture(e.pointerId); return; }
    }
    const hits = this.raycaster.intersectObject(this.ground.root, true);
    let id: string | undefined;
    for (const hit of hits) {
      const ids = hit.object.userData.cityObjectIds as string[] | undefined;
      if (ids && hit.instanceId !== undefined) { id = ids[hit.instanceId]; break; }
    }
    if (!id) for (const j of this.data.intersections) {
      const local = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation), h = junctionExtent(j, this.data);
      if (Math.abs(local.x) < h && Math.abs(local.z) < h) { id = j.id; break; }
    }
    if (!id) { const projected = projectWorldToRoad(this.ground.roadNetwork, p.x, p.z); const r = this.data.roads.find(r => r.id === projected?.segmentId);
      if (r && projected!.distanceFromCenterline < r.laneCount * r.laneWidth / 2 + 3) id = r.id;
    }
    this.selectedId = id ?? null;
    if (id) { this.drag = { id, start: p, before: structuredClone(this.data), moved: false }; this.renderer.domElement.setPointerCapture(e.pointerId); }
    this.drawOverlay(); this.updateUI();
  }
  private pointerMove(e: PointerEvent): void {
    if (this.tool === 'preset' && this.topView && this.presetStamp) { const p = this.ray(e); if (p) this.positionPreset(p); return; }
    if (!this.drag) return;
    const p = this.ray(e); if (!p) return;
    const drag = this.drag;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.z - drag.start.z) < this.tolerance() * 0.25) return;
    drag.moved = true; this.data = structuredClone(drag.before);
    const entity = this.entities().find(o => o.id === drag.id)!;
    if ('centerline' in entity) {
      if (drag.node !== undefined) {
        const endpoint = drag.node === 0 ? 'start' : drag.node === entity.centerline.length - 1 ? 'end' : undefined;
        const snapped = endpoint ? this.snap(p, entity.id) : { point: this.snap(p, entity.id).point };
        moveRoadNode(this.data, entity.id, drag.node, { ...snapped.point, y: endpoint && ('junctionId' in snapped || 'endpoint' in snapped) ? snapped.point.y : entity.centerline[drag.node]!.y });
        if (endpoint) this.connect(entity, endpoint, snapped);
      } else {
        const origin = entity.centerline[0]!, snapped = this.snap({ x: origin.x + p.x - drag.start.x, z: origin.z + p.z - drag.start.z }, entity.id);
        const dx = snapped.point.x - origin.x, dz = snapped.point.z - origin.z; this.detach(entity);
        entity.centerline.forEach(point => { point.x += dx; point.z += dz; });
      }
    } else { entity.position = { ...this.snap({ x: entity.position.x + p.x - drag.start.x, z: entity.position.z + p.z - drag.start.z }).point, y: entity.position.y ?? 0 }; }
    syncConnections(this.data); this.drawOverlay(); this.status('Moving selection · release to apply');
  }
  private pointerUp(e: PointerEvent): void {
    const drag = this.drag; if (!drag) return;
    this.drag = null;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) this.renderer.domElement.releasePointerCapture(e.pointerId);
    if (drag.moved) {
      try { this.data = loadCityMap(this.data); this.history.record(drag.before, this.data); this.dirty = true; this.rebuild(); this.persist(); }
      catch (error) { this.data = drag.before; this.rebuild(); this.status(String(error)); }
    }
  }
  private cancelDrag(): void { if (this.drag) { this.data = this.drag.before; this.drag = null; this.rebuild(); } }
  private finishRoad(): void {
    if (this.draft.length < 2) { this.status('Road needs at least two nodes.'); return; }
    const draft = this.draft;
    this.change(() => {
      const type = this.value('[data-road-type]') as RoadType;
      const r = createRoad(this.data, { type, styleId: this.value('[data-road-style]'), centerline: draft.map(s => ({ ...s.point })), curve: 'polyline' });
      this.connect(r, 'start', draft[0]!); this.connect(r, 'end', draft.at(-1)!); this.selectedId = r.id; this.draft = [];
    });
  }
  private deleteSelected(): void {
    if (!this.selectedId) return;
    this.change(() => {
      deleteObject(this.data, this.selectedId!); this.selectedId = null;
    });
  }
  private updateUI(): void {
    this.ui.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === this.tool));
    this.require<HTMLButtonElement>('[data-action=undo]').disabled = !this.history.canUndo;
    this.require<HTMLButtonElement>('[data-action=redo]').disabled = !this.history.canRedo;
    const list = this.require<HTMLSelectElement>('[data-list]'); list.replaceChildren();
    for (const e of this.entities()) { const option = document.createElement('option'); option.value = e.id; option.textContent = e.id; option.selected = e.id === this.selectedId; list.append(option); }
    if (!this.selectedId) list.selectedIndex = -1;
    this.inspector.replaceChildren();
    const validation = validateMap(this.data);
    if (validation.errors.length || validation.warnings.length) {
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = `Validation: ${validation.errors.length} errors / ${validation.warnings.length} warnings`; details.append(summary);
      for (const issue of [...validation.errors, ...validation.warnings]) { const p = document.createElement('p'); p.className = 'ce-hint'; p.textContent = `${issue.code} · ${issue.path}: ${issue.message}`; details.append(p); } this.inspector.append(details);
    }
    const title = document.createElement('h3'); title.textContent = this.selectedId ?? 'Map'; this.inspector.append(title);
    const input = (name: string, value: string | number | boolean, onChange: (v: string) => void, choices?: string[]) => {
      const label = document.createElement('label'); label.append(document.createTextNode(name));
      const control = choices ? document.createElement('select') : document.createElement('input');
      if (control instanceof HTMLSelectElement) for (const choice of choices!) { const option = document.createElement('option'); option.textContent = choice; option.value = choice; control.append(option); }
      else control.type = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
      if (control instanceof HTMLInputElement && typeof value === 'boolean') control.checked = value;
      else control.value = String(value);
      if (control instanceof HTMLInputElement && typeof value === 'number') control.step = 'any';
      control.addEventListener('change', () => this.change(() => onChange(control instanceof HTMLInputElement && control.type === 'checkbox' ? String(control.checked) : control.value)));
      label.append(control); this.inspector.append(label);
    };
    const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', action); this.inspector.append(b); };
    const e = this.selected();
    if (!e) {
      input('Map ID', this.data.id, v => { this.data.id = v; }); input('Name', this.data.name, v => { this.data.name = v; });
      input('Version', this.data.version, v => { this.data.version = Number(v); }); input('Sector m', this.data.sectorSize, v => { this.data.sectorSize = Number(v); });
      for (const axis of ['minX', 'maxX', 'minZ', 'maxZ'] as const) input(axis, this.data.bounds[axis], v => { this.data.bounds[axis] = Number(v); });
      const spawn = this.data.environment.spawnPoints[0]!;
      input('Spawn X', spawn.position.x, v => { spawn.position.x = Number(v); }); input('Spawn Z', spawn.position.z, v => { spawn.position.z = Number(v); });
      input('Spawn Y', spawn.position.y ?? 0, v => { spawn.position.y = Number(v); });
      input('Spawn °', THREE.MathUtils.radToDeg(spawn.rotation), v => { spawn.rotation = THREE.MathUtils.degToRad(Number(v)); });
      this.status(); return;
    }
    const pos = 'centerline' in e ? e.centerline.reduce((sum, p) => ({ x: sum.x + p.x / e.centerline.length, z: sum.z + p.z / e.centerline.length }), { x: 0, z: 0 }) : e.position;
    for (const axis of ['x', 'z'] as const) input(`Position ${axis.toUpperCase()}`, Number(pos[axis].toFixed(2)), v => {
      if ('centerline' in e) { this.detach(e); const delta = Number(v) - pos[axis]; e.centerline.forEach(p => { p[axis] += delta; }); } else e.position[axis] = Number(v);
    });
    const rotation = 'centerline' in e ? Math.atan2(-(e.centerline[1]!.x - e.centerline[0]!.x), -(e.centerline[1]!.z - e.centerline[0]!.z)) : e.rotation;
    input('Rotation °', Number(THREE.MathUtils.radToDeg(rotation).toFixed(2)), v => {
      const radians = THREE.MathUtils.degToRad(Number(v));
      if ('centerline' in e) { this.detach(e); e.centerline = e.centerline.map(p => { const local = rotatePoint({ x: p.x - pos.x, z: p.z - pos.z }, radians - rotation); return { x: pos.x + local.x, y: p.y ?? 0, z: pos.z + local.z }; }); }
      else e.rotation = radians;
    });
    if ('centerline' in e) {
      input('Style', e.styleId ?? 'urban_street_4', v => { this.detach(e); applyRoadStyle(e, v); }, ROAD_STYLES.map(s => s.id));
      input('Road type', e.type, v => { e.type = v as RoadType; e.laneCount = ROAD_LANES[e.type]; if (e.type === 'ramp_1') e.travelDirection = 'forward'; }, Object.keys(ROAD_LANES));
      if (e.type === 'highway') input('Lane count', e.laneCount, v => { e.laneCount = Number(v); });
      input('Elevation mode', e.elevationMode ?? 'custom', v => {
        this.detach(e); const current = roadPoints({ ...e, curve: 'polyline' }); e.elevationMode = v as CityRoad['elevationMode'];
        if (v === 'custom') e.centerline = current;
        else { const y = v === 'ground' ? 0 : Math.max(2.5, e.elevation || 6); e.elevation = y; e.centerline.forEach(p => { p.y = y; }); }
      }, ['ground', 'elevated', 'custom']);
      input('Whole road Y', e.elevationMode === 'ground' ? 0 : e.elevationMode === 'elevated' ? e.elevation ?? 6 : e.centerline[0]!.y ?? 0, v => {
        this.detach(e); const y = Number(v); e.elevation = y; e.elevationMode = y === 0 ? 'ground' : y >= 2.5 ? 'elevated' : 'custom'; e.centerline.forEach(p => { p.y = y; });
      });
      input('Barrier', e.structure?.barrierEnabled ?? e.centerline.some(p => (p.y ?? 0) > 2), v => { e.structure = { ...e.structure, barrierEnabled: v === 'true' }; });
      input('Piers', e.structure?.piersEnabled ?? true, v => { e.structure = { ...e.structure, piersEnabled: v === 'true' }; });
      input('Pier spacing m', e.structure?.pierSpacing ?? 30, v => { e.structure = { ...e.structure, pierSpacing: Number(v) }; });
      input('Pier style', e.structure?.pierStyle ?? 'round', v => { e.structure = { ...e.structure, pierStyle: v as 'round' | 'rectangular' }; }, ['round', 'rectangular']);
      input('Lane width m', e.laneWidth, v => { e.laneWidth = Number(v); }); input('Speed km/h', e.speedLimit, v => { e.speedLimit = Number(v); });
      input('Curve', e.curve ?? 'polyline', v => { e.curve = v as 'polyline' | 'smooth'; }, ['polyline', 'smooth']);
      input('Direction', e.travelDirection, v => { e.travelDirection = v as CityRoad['travelDirection']; }, ['two-way', 'forward', 'reverse']);
      input('Sidewalk', e.sidewalk?.enabled ?? false, v => { e.sidewalk = { enabled: v === 'true', width: e.sidewalk?.width ?? 2.5 }; });
      input('Sidewalk m', e.sidewalk?.width ?? 2.5, v => { e.sidewalk = { enabled: e.sidewalk?.enabled ?? true, width: Number(v) }; });
      const points = roadPoints(e); let grade = 0;
      for (let i = 1; i < points.length; i++) { const a = points[i - 1]!, b = points[i]!; grade = Math.max(grade, Math.abs((b.y ?? 0) - (a.y ?? 0)) / Math.hypot(b.x - a.x, b.z - a.z)); }
      const hint = document.createElement('p'); hint.className = 'ce-hint'; hint.textContent = `Max grade ${(grade * 100).toFixed(1)}% (${THREE.MathUtils.radToDeg(Math.atan(grade)).toFixed(1)}°). Recommended ≤12%, maximum 25%. Drag nodes in Top; editing Y switches to Custom. Transforms detach endpoint links.`; this.inspector.append(hint);
      const nodeLabel = document.createElement('label'); nodeLabel.append('Selected node'); const nodeSelect = document.createElement('select');
      this.selectedNode = Math.min(this.selectedNode, e.centerline.length - 1);
      e.centerline.forEach((_, i) => nodeSelect.add(new Option(String(i + 1), String(i), false, i === this.selectedNode)));
      nodeSelect.addEventListener('change', () => { this.selectedNode = Number(nodeSelect.value); this.updateUI(); this.drawOverlay(); }); nodeLabel.append(nodeSelect); this.inspector.append(nodeLabel);
      const index = this.selectedNode, p = e.centerline[index]!;
      for (const axis of ['x', 'y', 'z'] as const) input(`Node ${index + 1} ${axis.toUpperCase()}`, Number((p[axis] ?? 0).toFixed(2)), v => {
        const point = { ...p, [axis]: Number(v) }; moveRoadNode(this.data, e.id, index, point);
        const end = index === 0 ? 'start' : index === e.centerline.length - 1 ? 'end' : undefined;
        if (end && axis !== 'y') { const snapped = this.snap(point, e.id); if (snapped.junctionId || snapped.endpoint) this.connect(e, end, snapped); }
      });
    } else if ('connections' in e) {
      input('Position Y', e.position.y ?? 0, v => { e.position.y = Number(v); });
      input('Junction type', e.type, v => { e.type = v as IntersectionType; e.connections = e.connections.filter(c => portsFor(e).includes(c.port)); }, Object.keys(INTERSECTION_LANES));
      input('Signalized', e.signalized, v => { e.signalized = v === 'true'; });
      input('Signal offset s', e.signals?.offsetSeconds ?? 0, v => { e.signals = { ...e.signals, offsetSeconds: Number(v) }; });
      input('Signal height m', e.signals?.headHeight ?? 5.8, v => { e.signals = { ...e.signals, headHeight: Number(v) }; });
      for (const port of portsFor(e)) {
        const c = e.connections.find(c => c.port === port);
        input(port, c ? `${c.roadId}:${c.end}` : 'disconnected', v => {
          e.connections = e.connections.filter(c => c.port !== port);
          if (v !== 'disconnected') { const split = v.lastIndexOf(':'); const road = this.data.roads.find(r => r.id === v.slice(0, split))!; this.connect(road, v.slice(split + 1) as 'start' | 'end', { point: connectionPoint(e, port, this.data), junctionId: e.id, port }); }
        }, ['disconnected', ...this.data.roads.flatMap(r => [`${r.id}:start`, `${r.id}:end`])]);
      }
    } else {
      input('Position Y', e.position.y ?? 0, v => { e.position.y = Number(v); });
      input('Prefab', e.prefabId, v => { e.prefabId = v as PrefabId; }, [...PREFAB_IDS]);
      for (const axis of ['x', 'y', 'z'] as const) input(`Scale ${axis}`, e.scale?.[axis] ?? 1, v => { e.scale = { x: 1, y: 1, z: 1, ...e.scale, [axis]: Number(v) }; });
      input('Tint hex', e.color ?? '#ffffff', v => { e.color = v; });
    }
    if (!('connections' in e)) input('District', e.district ?? '', v => { e.district = v; });
    button('Delete', () => this.deleteSelected()); button('Deselect', () => { this.selectedId = null; this.updateUI(); this.drawOverlay(); }); this.status();
  }
  private async readFile(file: File): Promise<void> {
    try { const data = loadCityMap(JSON.parse(await file.text())); this.replaceMap(data); this.status(`Loaded ${file.name}`); }
    catch (error) { this.status(`Import failed: ${String(error)}`); }
  }
  private replaceMap(map: CityMapData): void {
    this.history.record(this.data, map); this.data = map; this.selectedId = null; this.draft = []; this.dirty = true; this.rebuild(); this.fit(); this.persist();
  }
  private async action(action: string): Promise<void> {
    if (action === 'new') this.replaceMap(newCityMap());
    if (action === 'alpha') {
      try { const path = import.meta.env.DEV ? '/src/world/city/maps/city-alpha.json' : `${import.meta.env.BASE_URL}city-alpha.json`; const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); this.replaceMap(loadCityMap(await response.json())); this.status('City Alpha reloaded from JSON. Play in Game previews these changes.'); }
      catch (error) { this.status(`Reload failed: ${String(error)}. Use Import to open the updated JSON.`); }
    }
    if (action === 'validate') { const report = validateMap(this.data); this.status(`Validation: ${report.errors.length} errors, ${report.warnings.length} warnings. Details in Inspector.`); }
    if (action === 'finish') this.finishRoad();
    if (action === 'import') this.fileInput.click();
    if (action === 'export') {
      try {
        const map = loadCityMap(this.data), blob = new Blob([saveMap(map)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${map.id.replace(/[^a-z0-9_-]/gi, '_')}.json`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000); this.dirty = false; this.status('JSON exported. Import it to continue editing.');
      } catch (error) { this.status(String(error)); }
    }
    if (action === 'play') {
      try {
        if (!this.data.roads.length) throw new Error('Add a road before playing.');
        localStorage.setItem(CITY_EDITOR_STORAGE_KEY, JSON.stringify(loadCityMap(this.data)));
        this.dirty = false; const url = new URL(location.href); url.search = '?city=editor'; location.assign(url.href);
      } catch (error) { this.status(`Cannot launch: ${String(error)}. JSON export remains available.`); }
    }
    if (action === 'undo' || action === 'redo') {
      const map = action === 'undo' ? this.history.undo(this.data) : this.history.redo(this.data);
      if (map) { this.data = map; this.draft = []; this.dirty = true; this.rebuild(); this.persist(); }
    }
    if (action === 'view') {
      const target = this.controls.target.clone(); this.topView = !this.topView;
      this.controls.target.copy(target);
      if (this.topView) { this.topCamera.position.set(target.x, 1800, target.z); this.topCamera.lookAt(target); }
      else this.previewCamera.position.set(target.x + 170, 140, target.z + 170);
      this.configureControls(); this.controls.update(); this.updateUI();
    }
    if (action === 'fit') this.fit();
  }
  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.matches('input,select,textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); void this.action(e.shiftKey ? 'redo' : 'undo'); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); void this.action('redo'); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); void this.action('export'); }
    else if (e.code === 'Enter' && this.tool === 'road') this.finishRoad();
    else if (e.code === 'KeyR' && this.tool === 'preset') { this.require<HTMLInputElement>('[data-preset-rotation]').value = String(Number(this.value('[data-preset-rotation]')) + 15); this.refreshPreset(true); }
    else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
    else if (e.code === 'Escape') { this.cancelDrag(); this.draft = []; this.drawOverlay(); this.status(); }
  }
  private animate = (time: number): void => {
    this.frame = requestAnimationFrame(this.animate); const dt = this.lastFrame ? Math.min(0.1, (time - this.lastFrame) / 1000) : 0; this.lastFrame = time;
    this.controls.update(); this.ground.update(dt); this.renderer.render(this.scene, this.camera);
  };
  dispose(): void {
    cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); window.removeEventListener('keydown', this.keyHandler); window.removeEventListener('beforeunload', this.unloadHandler);
    this.topControls.dispose(); this.previewControls.dispose(); this.ground.dispose(); this.clearGroup(this.grid); this.clearGroup(this.overlay); this.clearGroup(this.ghost); this.renderer.dispose(); this.ui.remove();
  }
}
