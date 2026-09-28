// Renderer, câmera, luzes e loop do Nexo.
//
// Projeção: o canvas cobre a tela toda (fixed, inset 0), mas a câmera usa lens
// shift (setViewOffset) centrado no robô. Assim o Nexo é sempre visto de frente,
// sem distorção fora do eixo, e a conversão tela → mundo fica trivial: o robô
// está na origem (plano z = 0) e o ponto de tela escolhido é o centro óptico.

import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  Box3,
  DirectionalLight,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { gsap } from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { bakeGeometry } from './nexoGeometry';
import { NexoFace } from './NexoFace';
import { NEXO_SCREEN_SEARCH } from './nexoModels';
import {
  NEXO_CAMERA,
  NEXO_LIGHTS,
  NEXO_MATERIAL,
  NEXO_POSE,
  NEXO_BODY_BOX,
  NEXO_BODY_HEIGHT_PX,
  buildMaps,
  type NexoToneMapping,
  createNexoMaterial,
  type NexoMaps,
} from './nexoMaterial';

export type Point = { x: number; y: number };

/** Depois de 5 s só com a flutuação, o loop cai para ~30 fps. */
const IDLE_THROTTLE_MS = 5000;

const TONE_MAPPINGS = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
} as const;

/** Parâmetros ajustáveis ao vivo (tecla D / ajuste fino). */
export type NexoTuning = {
  toneMapping: NexoToneMapping;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  exposure: number;
  environmentIntensity: number;
  keyIntensity: number;
  rimIntensity: number;
  roughness: number;
  clearcoatRoughness: number;
  sheen: number;
  emissiveIntensity: number;
};

/** Transformações de animação somadas à pose de repouso. */
export type NexoMotion = {
  /** deslocamento em px a partir da âncora */
  x: number;
  y: number;
  scale: number;
  scaleY: number;
  /** graus, somados à pose */
  yaw: number;
  bank: number;
  tilt: number;
  opacity: number;
};

/** Caixa visível inteira (com braços), em px, relativa à âncora (centro do corpo). */
export type NexoExtents = { left: number; right: number; top: number; bottom: number };

/** Flutuação em repouso (somada ao movimento). amount 0–1 liga/desliga suavemente. */
export type NexoIdle = { amount: number; floatPx: number; periodS: number; rollDeg: number };

/**
 * Pose de corpo inteiro dos gestos (somada ao movimento): inclinação em X/Z e giro
 * (graus), deslocamento (px) e escala. Os gestos não mexem os braços (malha única).
 */
export type NexoBodyPose = {
  tiltX: number;
  tiltZ: number;
  yaw: number;
  x: number;
  y: number;
  scale: number;
};

const bodySignature = (b: NexoBodyPose) =>
  `${b.tiltX},${b.tiltZ},${b.yaw},${b.x},${b.y},${b.scale}`;

export type RenderStats = { frames: number; avgRenderMs: number; lastRenderMs: number };

export class NexoStage {
  readonly canvas: HTMLCanvasElement;
  readonly tuning: NexoTuning = {
    ...NEXO_POSE,
    toneMapping: NEXO_LIGHTS.toneMapping,
    exposure: NEXO_LIGHTS.exposure,
    environmentIntensity: NEXO_LIGHTS.environmentIntensity,
    keyIntensity: NEXO_LIGHTS.keyIntensity,
    rimIntensity: NEXO_LIGHTS.rimIntensity,
    roughness: NEXO_MATERIAL.roughness,
    clearcoatRoughness: NEXO_MATERIAL.clearcoatRoughness,
    sheen: NEXO_MATERIAL.sheen,
    emissiveIntensity: NEXO_MATERIAL.emissiveIntensity,
  };
  readonly motion: NexoMotion = {
    x: 0,
    y: 0,
    scale: 1,
    scaleY: 1,
    yaw: 0,
    bank: 0,
    tilt: 0,
    opacity: 1,
  };

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  /** Recebe posição/escala/rotações de animação. */
  private readonly root = new Group();
  /** Recebe a pose de repouso (yaw/roll) e a normalização do modelo. */
  private readonly pose = new Group();
  private readonly key: DirectionalLight;
  private readonly rim: DirectionalLight;
  private pmrem: PMREMGenerator | null = null;
  private envTarget: WebGLRenderTarget | null = null;
  private mesh: Mesh | null = null;
  /** Pose dos gestos (corpo inteiro). */
  readonly body: NexoBodyPose = { tiltX: 0, tiltZ: 0, yaw: 0, x: 0, y: 0, scale: 1 };
  readonly face = new NexoFace();
  private faceMesh: Mesh | null = null;
  /** Olhar (graus), somado à pose: segue o mouse (ver NexoLook). */
  readonly look = { yaw: 0, pitch: 0 };
  /** Exposto para calibração (tecla D / scripts/tune-nexo.mjs). */
  material: MeshPhysicalMaterial | null = null;
  private maps: NexoMaps | null = null;
  private baseMap: Texture | null = null;

  private anchor: Point = { x: 0, y: 0 };
  private baseScale = 1;
  /** Centro do corpo menos a projeção do pivô (px), na pose de repouso. */
  private centerOffset: Point = { x: 0, y: 0 };
  /** Índices dos vértices do corpo (sem braços), usados na calibração. */
  private bodyIndices: Uint32Array = new Uint32Array();
  private extents: NexoExtents = { left: 0, right: 0, top: 0, bottom: 0 };
  private facingSign: 1 | -1 = 1;
  private dirty = true;
  /** Flutuação: ±3 px em 3 s, sem micro-rotação em Z. */
  readonly idle: NexoIdle = { amount: 0, floatPx: 3, periodS: 3, rollDeg: 0 };
  private running = false;
  private readonly tickers = new Set<(dt: number, now: number) => void>();
  private lastTime = 0;
  private idleY = 0;
  private idleBank = 0;
  /** Assinatura do último quadro renderizado: só renderiza de novo se algo mudou. */
  private lastSignature = '';
  /** Assinatura sem a flutuação: detecta atividade "de verdade" (voo, gesto, olhar, fala). */
  private lastActiveSignature = '';
  private lastActive = 0;
  private tick = 0;
  private renderMsTotal = 0;
  private frames = 0;
  private lastRenderMs = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nexo-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');

    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.tuning.exposure;
    this.renderer.setClearColor(0x000000, 0);

    this.camera = new PerspectiveCamera(NEXO_CAMERA.fovDeg, 1, 0.1, 100);

    this.key = new DirectionalLight(NEXO_LIGHTS.keyColor, this.tuning.keyIntensity);
    this.key.position.set(...NEXO_LIGHTS.keyPosition);
    this.rim = new DirectionalLight(NEXO_LIGHTS.rimColor, this.tuning.rimIntensity);
    this.rim.position.set(...NEXO_LIGHTS.rimPosition);
    this.scene.add(this.key, this.rim, this.root);
    this.root.add(this.pose);
  }

  get info() {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      programs: i.programs?.length ?? 0,
    };
  }

  /** Objeto renderer.info (continua legível depois do dispose: confere a memória liberada). */
  get rendererInfo() {
    return this.renderer.info;
  }

  get stats(): RenderStats {
    return {
      frames: this.frames,
      avgRenderMs: this.frames ? this.renderMsTotal / this.frames : 0,
      lastRenderMs: this.lastRenderMs,
    };
  }

  resetStats(): void {
    this.frames = 0;
    this.renderMsTotal = 0;
  }

  get rendererLabel(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
  }

  async load(url: string): Promise<void> {
    this.pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget = this.pmrem.fromScene(room, 0.04);
    room.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = this.tuning.environmentIntensity;

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);

    let mesh: Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
    });
    if (!mesh) throw new Error('NexoStage: modelo sem malha');
    const found: Mesh = mesh;

    const original = found.material as MeshStandardMaterial;
    if (!original.map) throw new Error('NexoStage: modelo sem textura base');
    this.baseMap = original.map;
    this.maps = buildMaps(original.map);
    this.material = createNexoMaterial(
      original.map,
      this.maps,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    original.dispose();

    // Geometria em float nas coordenadas do modelo (pivô no centro da caixa).
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new Vector3());
    const toModel = new Matrix4()
      .makeTranslation(-center.x, -center.y, -center.z)
      .multiply(found.matrixWorld);
    const geometry = bakeGeometry(found, toModel);
    found.geometry.dispose();
    const body = new Mesh(geometry, this.material);
    this.pose.add(body);
    this.mesh = body;
    this.bodyIndices = this.selectBody(body);
    this.buildFace(body, this.maps);

    this.applyTuning();
    this.resize();
    // Compila os shaders agora (em paralelo quando o navegador suporta), e não no
    // primeiro quadro visível: a compilação a frio travava ~450 ms a aparição.
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  /** 1 quando virado para a esquerda (pose de repouso), −1 quando espelhado. */
  get facing(): 1 | -1 {
    return this.facingSign;
  }

  /** Lado para onde o Nexo se vira: espelha o yaw de repouso. */
  setFacing(facing: 'left' | 'right'): void {
    this.facingSign = facing === 'left' ? 1 : -1;
    this.applyTuning();
  }

  /** Caixa visível inteira relativa ao centro do corpo, na pose de repouso (px). */
  get visibleExtents(): NexoExtents {
    return { ...this.extents };
  }

  /** Centro do CORPO do robô, em px da viewport. */
  setAnchor(p: Point): void {
    this.anchor = { ...p };
    this.dirty = true;
  }

  getAnchor(): Point {
    return { ...this.anchor };
  }

  /** Aplica os parâmetros de ajuste e recalibra o tamanho (pose muda a silhueta). */
  applyTuning(): void {
    const t = this.tuning;
    this.renderer.toneMapping = TONE_MAPPINGS[t.toneMapping];
    this.renderer.toneMappingExposure = t.exposure;
    this.scene.environmentIntensity = t.environmentIntensity;
    this.key.intensity = t.keyIntensity;
    this.rim.intensity = t.rimIntensity;
    if (this.material) {
      this.material.roughness = t.roughness;
      this.material.clearcoatRoughness = t.clearcoatRoughness;
      this.material.sheen = t.sheen;
      this.material.emissiveIntensity = t.emissiveIntensity;
    }
    this.pose.rotation.set(
      0,
      MathUtils.degToRad(t.yawDeg) * this.facingSign,
      MathUtils.degToRad(t.rollDeg) * this.facingSign,
    );
    this.placeCamera();
    this.calibrate();
    this.dirty = true;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.calibrate();
    this.dirty = true;
  }

  requestRender(): void {
    this.dirty = true;
  }

  addTicker(fn: (dt: number, now: number) => void): () => void {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  /**
   * O loop roda no ticker do GSAP: os tweens atualizam `motion` primeiro e o
   * quadro é desenhado em seguida, no mesmo rAF (sem atraso de um quadro).
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    gsap.ticker.add(this.loop);
  }

  stop(): void {
    this.running = false;
    gsap.ticker.remove(this.loop);
  }

  /**
   * Mede o custo de um quadro: renderiza `frames` quadros seguidos, cada um com
   * gl.finish() (espera a GPU), e devolve a média em ms. Só para diagnóstico.
   */
  benchmark(frames = 120): { avgMs: number; maxMs: number } {
    const gl = this.renderer.getContext();
    let total = 0;
    let max = 0;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      this.applyMotion();
      this.renderer.render(this.scene, this.camera);
      gl.finish();
      const dt = performance.now() - t0;
      total += dt;
      if (dt > max) max = dt;
    }
    return { avgMs: total / frames, maxMs: max };
  }

  /** Renderiza um quadro agora (medições). */
  renderNow(): void {
    this.render();
  }

  dispose(): void {
    this.stop();
    this.tickers.clear();
    this.pose.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
    this.material?.dispose();
    this.faceMesh?.geometry.dispose();
    (this.faceMesh?.material as MeshBasicMaterial | undefined)?.dispose();
    this.face.dispose();
    this.maps?.emissiveMap.dispose();
    this.maps?.roughnessMap.dispose();
    this.baseMap?.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ---------- interno ----------

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(now - this.lastTime, 100);
    this.lastTime = now;
    if (document.hidden) return;
    for (const fn of this.tickers) fn(dt, now);

    const i = this.idle;
    if (i.amount > 0) {
      const t = now / 1000;
      this.idleY = i.amount * i.floatPx * Math.sin((2 * Math.PI * t) / i.periodS);
      this.idleBank = i.amount * i.rollDeg * Math.sin((2 * Math.PI * t) / (i.periodS * 1.37));
    } else {
      this.idleY = 0;
      this.idleBank = 0;
    }

    if (this.face.update(now)) this.dirty = true;

    const m = this.motion;
    const b = bodySignature(this.body);
    // Piscadas automáticas não contam como atividade (senão o modo 30 fps nunca entraria).
    const faceChanged = this.dirty && this.face.current === 'talk';
    const active = `${this.anchor.x},${this.anchor.y},${m.x},${m.y},${m.scale},${m.scaleY},${m.yaw},${m.bank},${m.tilt},${m.opacity},${this.look.yaw},${this.look.pitch}|${b}`;
    if (active !== this.lastActiveSignature || faceChanged) {
      this.lastActiveSignature = active;
      this.lastActive = now;
    }
    // Só a flutuação há mais de 5 s: renderiza a ~30 fps (um quadro sim, outro não).
    this.tick++;
    if (now - this.lastActive > IDLE_THROTTLE_MS && this.tick % 2 === 1) return;
    const sig = `${this.anchor.x},${this.anchor.y},${m.x},${m.y},${m.scale},${m.scaleY},${m.yaw},${m.bank},${m.tilt},${m.opacity},${this.idleY},${this.idleBank},${this.look.yaw},${this.look.pitch}|${b}`;
    if (this.dirty || sig !== this.lastSignature) {
      this.lastSignature = sig;
      this.render();
    }
  };

  private render(): void {
    const t0 = performance.now();
    this.applyMotion();
    this.renderer.render(this.scene, this.camera);
    this.lastRenderMs = performance.now() - t0;
    this.renderMsTotal += this.lastRenderMs;
    this.frames++;
    this.dirty = false;
  }

  private placeCamera(): void {
    const pitch = MathUtils.degToRad(this.tuning.pitchDeg);
    this.camera.position.set(
      0,
      Math.sin(pitch) * NEXO_CAMERA.distance,
      Math.cos(pitch) * NEXO_CAMERA.distance,
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
  }

  private applyMotion(): void {
    const m = this.motion;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // O pivô é projetado no centro óptico; desloca para que o centro VISÍVEL caia na âncora.
    const b = this.body;
    const sx = this.anchor.x + m.x + b.x - this.centerOffset.x;
    const sy = this.anchor.y + m.y + b.y + this.idleY - this.centerOffset.y;
    this.camera.setViewOffset(w, h, w / 2 - sx, h / 2 - sy, w, h);

    const s = this.baseScale * m.scale * b.scale;
    this.root.scale.set(s, s * m.scaleY, s);
    this.root.rotation.set(
      MathUtils.degToRad(m.tilt + b.tiltX + this.look.pitch),
      MathUtils.degToRad(m.yaw + b.yaw + this.look.yaw) * this.facingSign,
      MathUtils.degToRad(m.bank + b.tiltZ + this.idleBank),
    );
    if (this.faceMesh) (this.faceMesh.material as MeshBasicMaterial).opacity = m.opacity;
    // O material é sempre transparent (definido em createNexoMaterial): alternar
    // transparent recompila o shader e travaria o fade de aparição.
    if (this.material) this.material.opacity = m.opacity;
    this.root.visible = m.opacity > 0.001;
  }

  /**
   * Ajusta a escala para que a altura do CORPO (projeção dos vértices da esfera)
   * seja NEXO_BODY_HEIGHT_PX, mede o deslocamento entre o pivô e o centro do corpo
   * e a extensão da silhueta inteira. Roda só quando pose, tela ou tuning mudam.
   */
  private calibrate(): void {
    if (!this.mesh) return;
    const saved = { ...this.motion };
    Object.assign(this.motion, { x: 0, y: 0, scale: 1, scaleY: 1, yaw: 0, bank: 0, tilt: 0 });
    this.camera.clearViewOffset();

    const measure = (indices?: Uint32Array) => {
      this.root.scale.setScalar(this.baseScale);
      this.root.rotation.set(0, 0, 0);
      this.root.updateMatrixWorld(true);
      return this.projectedBox(indices);
    };

    this.baseScale = 1;
    for (let i = 0; i < 3; i++) {
      const b = measure(this.bodyIndices);
      this.baseScale *= NEXO_BODY_HEIGHT_PX / (b.maxY - b.minY);
    }
    const body = measure(this.bodyIndices);
    const all = measure();
    const cx = (body.minX + body.maxX) / 2;
    const cy = (body.minY + body.maxY) / 2;
    this.centerOffset = { x: cx - window.innerWidth / 2, y: cy - window.innerHeight / 2 };
    this.extents = {
      left: all.minX - cx,
      right: all.maxX - cx,
      top: all.minY - cy,
      bottom: all.maxY - cy,
    };
    Object.assign(this.motion, saved);
  }

  /**
   * Rosto animado: acha a tela pelos texels escuros (UV dos vértices frontais), monta
   * um decal que cobre a tela inteira (com 6% de folga) e o prende à malha.
   */
  private buildFace(mesh: Mesh, maps: NexoMaps): void {
    const pos = mesh.geometry.attributes.position;
    const nor = mesh.geometry.attributes.normal;
    const uv = mesh.geometry.attributes.uv;
    if (!pos || !nor || !uv) return;
    const c = new Vector3();
    const nsum = new Vector3();
    const pts: Vector3[] = [];
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (
        Math.abs(v.x) > NEXO_SCREEN_SEARCH.maxAbsX ||
        v.y < NEXO_SCREEN_SEARCH.minY ||
        v.z < NEXO_SCREEN_SEARCH.minZ
      )
        continue;
      if (!maps.isScreen(uv.getX(i), uv.getY(i))) continue;
      pts.push(v.clone());
      c.add(v);
      nsum.add(new Vector3().fromBufferAttribute(nor, i));
    }
    if (pts.length < 20) {
      console.warn('[NexoStage] tela do rosto não encontrada; mantendo o rosto da textura');
      return;
    }
    c.divideScalar(pts.length);
    const n = nsum.normalize();
    const right = new Vector3(0, 1, 0).cross(n).normalize();
    const up = new Vector3().crossVectors(n, right).normalize();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const d = p.clone().sub(c);
      const x = d.dot(right);
      const y = d.dot(up);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const w = (maxX - minX) * 1.06;
    const h = (maxY - minY) * 1.06;
    const mid = c
      .clone()
      .addScaledVector(right, (minX + maxX) / 2)
      .addScaledVector(up, (minY + maxY) / 2);
    const orientation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(right, up, n));
    // O decal sai em coordenadas de mundo: calcula com tudo em repouso (identidade).
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.pose.rotation.set(0, 0, 0);
    this.scene.updateMatrixWorld(true);
    const geo = new DecalGeometry(mesh, mid, orientation, new Vector3(w, h, 0.5));
    const mat = new MeshBasicMaterial({
      map: this.face.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      toneMapped: false,
    });
    this.faceMesh = new Mesh(geo, mat);
    this.faceMesh.name = 'rosto';
    this.faceMesh.renderOrder = 2;
    mesh.add(this.faceMesh);
    this.face.setBoxAspect(w / h);
    this.faceInfo = { center: mid, size: { w, h }, vertices: pts.length };
  }

  /** Dados da tela do rosto (debug/README). */
  faceInfo: { center: Vector3; size: { w: number; h: number }; vertices: number } | null = null;

  /** Vértices dentro de NEXO_BODY_BOX, em coordenadas do modelo (sem pose). */
  private selectBody(mesh: Mesh): Uint32Array {
    const pos = mesh.geometry.attributes.position;
    if (!pos) return new Uint32Array();
    this.pose.rotation.set(0, 0, 0);
    this.pose.updateMatrixWorld(true);
    const toModel = this.pose.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    const v = new Vector3();
    const out: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toModel);
      if (Math.abs(v.x) < NEXO_BODY_BOX.maxAbsX && v.y > NEXO_BODY_BOX.minY) out.push(i);
    }
    return Uint32Array.from(out);
  }

  /** Caixa em px da projeção dos vértices (todos, ou só `indices`), sem view offset. */
  private projectedBox(indices?: Uint32Array) {
    const mesh = this.mesh;
    if (!mesh) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const pos = mesh.geometry.attributes.position;
    if (!pos) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new Vector3();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    this.camera.updateProjectionMatrix();
    const count = indices ? indices.length : pos.count;
    for (let k = 0; k < count; k++) {
      const i = indices ? (indices[k] ?? 0) : k;
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }
}
