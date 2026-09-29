// Rosto do Nexo desenhado num canvas (1024×768) e aplicado como decal sobre a tela
// do robô, cobrindo o rosto pintado na textura. Reproduz o PNG de referência:
// bezel arredondado com borda roxa, fundo marrom-escuro translúcido, scanlines finas
// e contínuas, reflexo especular suave no topo do vidro e pixels laranja com cantos
// arredondados e glow. Olhos em cápsulas verticais; boca mais estreita que os olhos.
//
// Estados: smile (padrão), blink (automático a cada 3–5 s), wink, look (olhos
// deslocados), listen (olhos maiores, boca reta) e talk (fala de robô: barras em
// degraus como um equalizador, trocando a cada 70–120 ms).

import { CanvasTexture, SRGBColorSpace } from 'three';

export type FaceExpression = 'smile' | 'blink' | 'wink' | 'look' | 'listen' | 'talk';

const W = 1024;
const H = 768;

/**
 * Estilo (medido no PNG de referência, ZzmyStBoZ… 4). Posições em frações da TELA
 * (retângulo interno ao bezel): x de 0 a 1 na largura, y de 0 a 1 na altura.
 */
export const FACE_STYLE = {
  /** O decal cobre a tela com 6% de folga (NexoStage.buildFace): a tela é 1/1,06 do canvas. */
  screenInset: (1 - 1 / 1.06) / 2,
  /** Raio dos cantos da tela, em fração da altura. */
  cornerRadius: 0.2,
  /** Bezel: borda roxa e fio de luz interno (fração da altura). */
  bezel: '#452650',
  bezelWidth: 0.022,
  bezelHighlight: 'rgba(214, 180, 232, 0.35)',
  /** Fundo marrom-escuro translúcido (centro mais claro, bordas mais escuras). */
  bgCenter: 'rgba(118, 90, 84, 0.93)',
  bgEdge: 'rgba(48, 32, 34, 0.96)',
  /** Scanlines: período e espessura em px do canvas (768 px de altura ≈ 128 linhas). */
  scanPeriod: 6,
  scanDark: 'rgba(12, 6, 6, 0.34)',
  scanLight: 'rgba(255, 226, 214, 0.05)',
  /** Pixels do rosto. */
  pixel: '#ff9a4d',
  pixelCore: '#ffc58a',
  glow: 'rgba(255, 128, 40, 0.9)',
  /** Tamanho da célula da pixel art, em fração da largura da tela. */
  cell: 0.064,
  /** Intervalos (ms). */
  blinkEvery: [3000, 5000] as [number, number],
  blinkMs: 120,
  talkStep: [70, 120] as [number, number],
  eyePulse: [300, 500] as [number, number],
  /** Deslocamento máximo dos olhos no estado look (fração da largura ≈ 1,5 px na tela). */
  lookMax: 0.03,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class NexoFace {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private expression: FaceExpression = 'smile';
  private look = { x: 0, y: 0 };
  private blinkUntil = 0;
  private nextBlink = performance.now() + rand(...FACE_STYLE.blinkEvery);
  private bars = [1, 2, 3, 2, 1];
  private nextBars = 0;
  /**
   * Fala guiada pelo áudio: volume 0..1 lido do AnalyserNode a cada quadro, ou null
   * para o padrão pseudoaleatório (modo silencioso, sem WebAudio).
   */
  private talkLevel: number | null = null;
  /** Degraus da boca com o volume real (5; movimento reduzido usa 3). */
  levelSteps = 5;
  /** Altura de um degrau das barras, em células (3 degraus × 0,6 = 1,8 célula). */
  private barUnit = 0.6;
  private eyeGlow = 1;
  private nextPulse = 0;
  private dirty = true;
  /**
   * Compensação do esticamento do decal: a caixa do decal não tem a proporção 4:3
   * do canvas; `ky` corrige a altura para os pixels do rosto saírem quadrados.
   */
  private ky = 1;
  /** Velocidade da fala (1 = normal; movimento reduzido usa 0,6). */
  speed = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('NexoFace: canvas 2D indisponível');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.draw(performance.now());
  }

  get current(): FaceExpression {
    return this.expression;
  }

  /** Proporção (largura/altura) da caixa do decal no modelo. */
  setBoxAspect(aspect: number): void {
    // Um px do canvas mede boxW/W na horizontal e boxH/H na vertical: para a célula
    // sair quadrada, a altura em px é multiplicada por (boxW/W)/(boxH/H) = aspect·H/W.
    this.ky = (aspect * H) / W;
    this.dirty = true;
  }

  setExpression(e: FaceExpression): void {
    if (e === this.expression) return;
    this.expression = e;
    if (e !== 'talk') {
      this.talkLevel = null;
      this.barUnit = 0.6;
    }
    if (e === 'blink') this.blinkUntil = performance.now() + FACE_STYLE.blinkMs;
    this.dirty = true; // troca em um único quadro
  }

  /** Olhos na direção (−1..1, −1..1). */
  setLook(x: number, y: number): void {
    const nx = Math.max(-1, Math.min(1, x));
    const ny = Math.max(-1, Math.min(1, y));
    if (Math.abs(nx - this.look.x) + Math.abs(ny - this.look.y) < 0.02) return;
    this.look = { x: nx, y: ny };
    this.dirty = true;
  }

  /**
   * Boca pela fala gravada: `null` volta ao sorriso NA HORA (entre palavras, pausa, fim);
   * um número (volume 0..1) mostra as barras em degraus; 'auto' usa o padrão
   * pseudoaleatório (modo silencioso). A troca acontece no mesmo quadro.
   */
  setTalkLevel(level: number | 'auto' | null): void {
    if (level === null) {
      this.talkLevel = null;
      if (this.expression === 'talk') this.setExpression('smile');
      return;
    }
    if (level === 'auto') {
      if (this.expression !== 'talk' || this.talkLevel !== null) this.nextBars = 0;
      this.talkLevel = null;
      this.barUnit = 0.6;
      this.setExpression('talk');
      return;
    }
    this.setExpression('talk');
    this.talkLevel = level;
    const steps = Math.max(1, this.levelSteps);
    this.barUnit = 1.8 / steps;
    // Degrau do centro pelo volume; as vizinhas um e dois degraus abaixo.
    const q = Math.max(1, Math.min(steps, Math.ceil(level * steps)));
    const next = [q - 2, q - 1, q, q - 1, q - 2].map((h) => Math.max(1, h));
    if (next.some((h, i) => h !== this.bars[i])) {
      this.bars = next;
      this.dirty = true;
    }
  }

  /** Pulso de fala por palavra (narração: onboundary). */
  pulseWord(): void {
    this.nextBars = 0;
  }

  /** Atualiza animações; devolve true se redesenhou (a textura precisa subir). */
  update(now: number): boolean {
    if (this.expression === 'blink' && now > this.blinkUntil) {
      this.expression = 'smile';
      this.dirty = true;
    }
    if (this.expression !== 'talk' && this.expression !== 'blink' && now > this.nextBlink) {
      this.blinkUntil = now + FACE_STYLE.blinkMs;
      this.nextBlink = now + rand(...FACE_STYLE.blinkEvery);
      this.dirty = true;
    }
    if (this.blinkUntil && now > this.blinkUntil) {
      this.blinkUntil = 0;
      this.dirty = true;
    }
    if (this.expression === 'talk') {
      if (this.talkLevel === null && now >= this.nextBars) {
        // Barras em degraus discretos (1 a 3), com variação aleatória; as do meio maiores.
        this.bars = this.bars.map((_, i) => {
          const center = i === 2 ? 1 : 0;
          const edge = i === 0 || i === 4 ? 1 : 0;
          return Math.max(1, Math.min(3, Math.round(rand(0.5, 3.4)) + center - edge));
        });
        this.nextBars = now + rand(...FACE_STYLE.talkStep) / this.speed;
        this.dirty = true;
      }
      if (now >= this.nextPulse) {
        this.eyeGlow = this.eyeGlow > 1 ? 1 : 1.7;
        this.nextPulse = now + (this.eyeGlow > 1 ? 90 : rand(...FACE_STYLE.eyePulse));
        this.dirty = true;
      }
    } else if (this.eyeGlow !== 1) {
      this.eyeGlow = 1;
      this.dirty = true;
    }
    if (!this.dirty) return false;
    this.draw(now);
    return true;
  }

  dispose(): void {
    this.texture.dispose();
  }

  // ---------- geometria da tela ----------

  /** Retângulo da tela (dentro do bezel) em px do canvas. */
  private screen() {
    const i = FACE_STYLE.screenInset;
    const x = W * i;
    const y = H * i;
    return { x, y, w: W - 2 * x, h: H - 2 * y };
  }

  private roundedScreen(pad = 0): void {
    const s = this.screen();
    const r = Math.min(s.w, s.h) * FACE_STYLE.cornerRadius - pad;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x + pad, s.y + pad, s.w - 2 * pad, s.h - 2 * pad, Math.max(r, 0));
  }

  // ---------- desenho ----------

  private draw(now: number): void {
    const c = this.ctx;
    const s = this.screen();
    c.clearRect(0, 0, W, H);

    // Fundo translúcido (radial) recortado na tela arredondada.
    c.save();
    this.roundedScreen();
    c.clip();
    const bg = c.createRadialGradient(
      s.x + s.w * 0.5,
      s.y + s.h * 0.45,
      s.h * 0.1,
      s.x + s.w * 0.5,
      s.y + s.h * 0.5,
      s.w * 0.72,
    );
    bg.addColorStop(0, FACE_STYLE.bgCenter);
    bg.addColorStop(1, FACE_STYLE.bgEdge);
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // Rosto (pixels com glow).
    c.save();
    c.shadowColor = FACE_STYLE.glow;
    c.shadowBlur = s.w * 0.028 * this.eyeGlow;
    const blinking = this.blinkUntil > now || this.expression === 'blink';
    this.drawEyes(blinking);
    c.shadowBlur = s.w * 0.028;
    this.drawMouth();
    c.restore();

    // Scanlines finas e contínuas por cima de tudo (como no PNG).
    for (let y = s.y; y < s.y + s.h; y += FACE_STYLE.scanPeriod) {
      c.fillStyle = FACE_STYLE.scanDark;
      c.fillRect(s.x, y, s.w, 2);
      c.fillStyle = FACE_STYLE.scanLight;
      c.fillRect(s.x, y + 3, s.w, 1);
    }

    // Reflexo especular suave no topo do vidro.
    const sp = c.createLinearGradient(0, s.y, 0, s.y + s.h * 0.42);
    sp.addColorStop(0, 'rgba(255, 244, 240, 0.3)');
    sp.addColorStop(0.55, 'rgba(255, 244, 240, 0.09)');
    sp.addColorStop(1, 'rgba(255, 244, 240, 0)');
    c.fillStyle = sp;
    c.beginPath();
    c.ellipse(s.x + s.w * 0.5, s.y + s.h * 0.02, s.w * 0.62, s.h * 0.4, 0, 0, Math.PI);
    c.fill();
    // Vinheta interna (profundidade do vidro).
    const vg = c.createRadialGradient(
      s.x + s.w / 2,
      s.y + s.h / 2,
      s.h * 0.35,
      s.x + s.w / 2,
      s.y + s.h / 2,
      s.w * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,4,8,0.45)');
    c.fillStyle = vg;
    c.fillRect(s.x, s.y, s.w, s.h);
    c.restore();

    // Bezel: borda roxa com raio generoso + fio de luz interno.
    const bw = s.h * FACE_STYLE.bezelWidth;
    c.lineWidth = bw;
    c.strokeStyle = FACE_STYLE.bezel;
    this.roundedScreen(bw / 2);
    c.stroke();
    c.lineWidth = Math.max(1.5, bw * 0.18);
    c.strokeStyle = FACE_STYLE.bezelHighlight;
    this.roundedScreen(bw);
    c.stroke();

    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  /**
   * Pixel com cantos levemente arredondados. (cx, cy) em fração da tela; w e h em
   * células. A altura é corrigida por `ky` para a célula sair quadrada no modelo.
   */
  private px(cx: number, cy: number, w: number, h: number): void {
    const s = this.screen();
    const cell = s.w * FACE_STYLE.cell;
    const cw = w * cell;
    const ch = h * cell * this.ky;
    const gap = cell * 0.07;
    const x = s.x + cx * s.w - cw / 2 + gap / 2;
    const y = s.y + cy * s.h - ch / 2 + gap / 2;
    const c = this.ctx;
    const grad = c.createLinearGradient(0, y, 0, y + ch);
    grad.addColorStop(0, FACE_STYLE.pixelCore);
    grad.addColorStop(1, FACE_STYLE.pixel);
    c.fillStyle = grad;
    c.beginPath();
    c.roundRect(x, y, cw - gap, ch - gap, cell * 0.22);
    c.fill();
  }

  /**
   * Olho em cápsula vertical (medido no PNG: ~13% da largura da tela e ~23% da
   * altura): meio de 2×2 células e pontas mais estreitas (1,3×0,8).
   */
  private eye(cx: number, cy: number, big: boolean): void {
    const k = big ? 1.2 : 1;
    const s = this.screen();
    const cellY = (FACE_STYLE.cell * this.ky * s.w) / s.h; // célula em fração da altura
    this.px(cx, cy, 2 * k, 2 * k);
    this.px(cx, cy - cellY * 1.35 * k, 1.35 * k, 0.8 * k);
    this.px(cx, cy + cellY * 1.35 * k, 1.35 * k, 0.8 * k);
  }

  private drawEyes(blinking: boolean): void {
    const e = this.expression;
    const dx = this.look.x * FACE_STYLE.lookMax;
    const dy = this.look.y * FACE_STYLE.lookMax * 0.7;
    // Olhos a ±12% do centro, centro vertical em 41% da altura (PNG de referência).
    const y = 0.41 + dy;
    const left = 0.5 - 0.12 + dx;
    const right = 0.5 + 0.12 + dx;
    const closed = (x: number) => this.px(x, y + 0.04, 2.2, 0.6);
    if (blinking) {
      closed(left);
      closed(right);
      return;
    }
    const big = e === 'listen';
    this.eye(left, y, big);
    if (e === 'wink') closed(right);
    else this.eye(right, y, big);
  }

  private drawMouth(): void {
    const e = this.expression;
    const y = 0.7;
    if (e === 'talk') {
      // Equalizador: 5 barras de 0,6 célula, alturas em degraus (0,6 / 1,2 / 1,8 células).
      this.bars.forEach((h, i) => this.px(0.5 + (i - 2) * 0.05, y - 0.02, 0.62, this.barUnit * h));
      return;
    }
    if (e === 'listen') {
      this.px(0.5, y, 2.8, 0.7); // boca reta
      return;
    }
    // Sorriso (PNG): cantos 1×1 a ±14% do centro, em 63% da altura; barra de ~17% da
    // largura (2,6 células) em 70%. Mais estreita que o espaço entre os olhos.
    this.px(0.5 - 0.135, 0.63, 0.95, 0.95);
    this.px(0.5 + 0.135, 0.63, 0.95, 0.95);
    this.px(0.5, y, 2.7, 0.95);
  }
}
