// API pública do mascote. É isto que o time de tecnologia consome.
//
// Contrato:
//   mount, appearAt, flyTo, gesture, talk, lookAt, setExpression, exit, on, destroy.
// Extras (fora do contrato, opcionais): placeAt (reposiciona sem animar), hide,
// useFallback (troca para o PNG), stopTalking, e o 2º parâmetro de gesture (alvo do "point").
// Os gestos são movimentos de corpo inteiro (a malha não tem esqueleto).
//
// Sem WebGL, ou se o GLB falhar, o NexoGuide troca sozinho para um PNG
// posicionado pela mesma API (fade entre etapas). O coach mark nunca quebra por
// causa do Nexo.

import { gsap } from 'gsap';
import { NexoStage, type Point } from './NexoStage';
import {
  FLIGHT,
  arcPoint,
  arcTangent,
  bankFromVelocity,
  easeInOut2,
  easeInOut2Rate,
  makeArc,
  midFlight,
} from './flight';
import { REST_POSE, gestureTimeline, type Gesture } from './gestures';
import { NexoLook } from './NexoLook';
import { Narrator } from './narration';
import { prefersReducedMotion } from '../utils/reducedMotion';
import { asset } from '../utils/asset';

export type { Point } from './NexoStage';
export type { Gesture } from './gestures';
export type Anchor = DOMRect | Point;
export type Expression = 'smile' | 'blink' | 'wink' | 'listen' | 'talk';
export type NexoEvent = 'arrived' | 'ready' | 'error';

export interface NexoGuideApi {
  mount(): Promise<void>;
  appearAt(anchor: DOMRect | Point): Promise<void>;
  flyTo(anchor: DOMRect | Point, opts?: { facing?: 'left' | 'right' }): Promise<void>;
  gesture(name: Gesture): Promise<void>;
  talk(opts: { text: string; narrate: boolean }): Promise<void>;
  lookAt(point: Point | null): void;
  setExpression(e: Expression): void;
  exit(): Promise<void>;
  on(event: NexoEvent, cb: () => void): void;
  destroy(): void;
}

export type NexoGuideOptions = {
  modelUrl?: string;
  fallbackUrl?: string;
  container?: HTMLElement;
};

/** Aparição: escala 0,6 → 1, opacidade 0 → 1, yaw de +40° até a pose, sem overshoot. */
const APPEAR = { duration: 0.5, fromScale: 0.6, fromYawDeg: 40, ease: 'power2.out' };
/** Movimento reduzido: sem voo, só fade na origem e no destino (s); fala 40% mais lenta. */
const REDUCED = { fadeOut: 0.15, fadeIn: 0.2, talkSlowdown: 1.4 };
/** Fala sem narração: ~60 ms por caractere, entre 1,2 e 4 s. */
const TALK = { msPerChar: 60, min: 1200, max: 4000 };
const EXPRESSION_MS = { blink: 120, wink: 450 };
const IDLE_FADE = { in: 0.6, out: 0.15 };
/**
 * Antes de voar ou gesticular, o corpo volta ao neutro, a flutuação some e o olhar
 * volta à frente (s). Assim nenhum eixo tem duas animações ao mesmo tempo.
 */
const RELAX = { duration: 0.1, idleFade: 0.2 };
/** Saída: voa para fora pelo canto superior direito. */
const EXIT = { duration: 0.9, margin: 160 };
/**
 * Fallback PNG (public/fallback/nexo.png, recortado na caixa visível): tamanho na
 * tela e centro do corpo dentro da imagem (px), na escala da fase 2 (corpo 96,5 px).
 */
const FALLBACK = { w: 182.3, h: 149, bodyX: 101.9, bodyY: 48.6 };

/** Centro de um DOMRect, ou o próprio ponto. A âncora é o centro do CORPO do robô. */
export function anchorPoint(anchor: Anchor): Point {
  if ('width' in anchor) return { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  return { x: anchor.x, y: anchor.y };
}

export class NexoGuide implements NexoGuideApi {
  private stage: NexoStage | null = null;
  private look: NexoLook | null = null;
  private img: HTMLImageElement | null = null;
  private readonly narrator = new Narrator();
  private readonly listeners = new Map<NexoEvent, Set<() => void>>();
  private expression: Expression = 'smile';
  private readonly modelUrl: string;
  private readonly fallbackUrl: string;
  private readonly container: HTMLElement;
  /** Animação de posição em curso (aparição, voo, saída). */
  private current: gsap.core.Timeline | null = null;
  private gestureTl: gsap.core.Timeline | null = null;
  private idleTween: gsap.core.Tween | null = null;
  private restCall: gsap.core.Tween | null = null;
  private expressionTimer = 0;
  private talkToken = 0;
  private flying = false;
  private anchor: Point = { x: 0, y: 0 };
  private visible = false;

  constructor(opts: NexoGuideOptions = {}) {
    this.modelUrl = opts.modelUrl ?? asset('models/nexo.glb');
    this.fallbackUrl = opts.fallbackUrl ?? asset('fallback/nexo.png');
    this.container = opts.container ?? document.body;
  }

  /** Palco 3D (debug e medições). null antes do mount, no fallback ou após destroy. */
  get debugStage(): NexoStage | null {
    return this.stage;
  }

  get mode(): 'webgl' | 'png' | 'none' {
    return this.stage ? 'webgl' : this.img ? 'png' : 'none';
  }

  get currentExpression(): Expression {
    return this.expression;
  }

  get isFlying(): boolean {
    return this.flying;
  }

  get position(): Point {
    return { ...this.anchor };
  }

  // ---------- ciclo de vida ----------

  async mount(): Promise<void> {
    if (this.stage || this.img) return;
    if (!hasWebGL()) {
      this.useFallback();
      this.emit('ready');
      return;
    }
    const stage = new NexoStage();
    this.stage = stage;
    stage.motion.opacity = 0;
    stage.face.speed = prefersReducedMotion() ? 0.6 : 1;
    this.container.append(stage.canvas);
    window.addEventListener('resize', this.handleResize);
    try {
      await stage.load(this.modelUrl);
      if (this.stage !== stage) return; // trocou para o fallback enquanto carregava
      this.look = new NexoLook(stage);
      stage.start();
      this.emit('ready');
    } catch (err) {
      if (this.stage !== stage) return;
      console.warn('[NexoGuide] falha no 3D, usando o PNG', err);
      this.useFallback();
      this.emit('error');
    }
  }

  /** Troca para o PNG (sem WebGL, GLB com erro ou lento demais). */
  useFallback(): void {
    if (this.img) return;
    this.stage?.dispose();
    this.stage = null;
    this.look?.dispose();
    this.look = null;
    const img = document.createElement('img');
    img.src = this.fallbackUrl;
    img.alt = '';
    img.className = 'nexo-fallback';
    img.setAttribute('aria-hidden', 'true');
    img.style.width = `${FALLBACK.w}px`;
    img.style.height = `${FALLBACK.h}px`;
    img.style.opacity = '0';
    this.container.append(img);
    this.img = img;
    this.placeImg();
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
    window.clearTimeout(this.expressionTimer);
    this.current?.kill();
    this.gestureTl?.kill();
    this.idleTween?.kill();
    if (this.stage) gsap.killTweensOf([this.stage.motion, this.stage.idle]);
    this.current = null;
    this.narrator.dispose();
    this.look?.dispose();
    this.look = null;
    this.stage?.dispose();
    this.stage = null;
    this.img?.remove();
    this.img = null;
    this.listeners.clear();
  }

  // ---------- posição ----------

  async appearAt(anchor: Anchor): Promise<void> {
    this.finishCurrent();
    this.anchor = anchorPoint(anchor);
    this.visible = true;
    const tl = gsap.timeline();
    this.current = tl;
    const reduced = prefersReducedMotion();
    if (this.img) {
      this.placeImg();
      tl.to(this.img, { opacity: 1, duration: REDUCED.fadeIn, ease: 'power1.out' });
    } else if (this.stage) {
      const stage = this.stage;
      stage.setAnchor(this.anchor);
      const m = stage.motion;
      if (reduced) {
        Object.assign(m, { x: 0, y: 0, scale: 1, scaleY: 1, yaw: 0, bank: 0, tilt: 0, opacity: 0 });
        tl.to(m, { opacity: 1, duration: REDUCED.fadeIn, ease: 'power1.out' });
      } else {
        Object.assign(m, {
          x: 0,
          y: 0,
          scale: APPEAR.fromScale,
          scaleY: 1,
          yaw: APPEAR.fromYawDeg,
          bank: 0,
          tilt: 0,
          opacity: 0,
        });
        tl.to(m, { scale: 1, yaw: 0, duration: APPEAR.duration, ease: APPEAR.ease }, 0);
        tl.to(m, { opacity: 1, duration: APPEAR.duration / 2, ease: 'power1.out' }, 0);
      }
    }
    await tl.then();
    if (this.current === tl) this.current = null;
    this.scheduleRest();
    this.flash('blink', EXPRESSION_MS.blink);
  }

  async flyTo(
    anchor: Anchor,
    opts: { facing?: 'left' | 'right'; duration?: number } = {},
  ): Promise<void> {
    this.finishCurrent();
    const to = anchorPoint(anchor);
    const from = { ...this.anchor };
    this.anchor = to;
    const tl = gsap.timeline();
    this.current = tl;
    this.flying = true;
    this.gestureTl?.kill();
    this.restCall?.kill();

    if (this.img) {
      const img = this.img;
      tl.to(img, { opacity: 0, duration: REDUCED.fadeOut, ease: 'power1.in' });
      tl.call(() => this.placeImg());
      tl.to(img, { opacity: 1, duration: REDUCED.fadeIn, ease: 'power1.out' });
    } else if (this.stage) {
      const stage = this.stage;
      if (prefersReducedMotion()) {
        this.setIdle(false);
        this.setLookEnabled(false);
        if (opts.facing) stage.setFacing(opts.facing);
        const m = stage.motion;
        tl.to(m, { opacity: 0, duration: REDUCED.fadeOut, ease: 'power1.in' });
        tl.call(() => stage.setAnchor(to));
        tl.to(m, { opacity: 1, duration: REDUCED.fadeIn, ease: 'power1.out' });
      } else {
        // 100 ms de relaxamento (junto com a saída do tooltip), depois o voo.
        this.relaxInto(tl, stage, RELAX.duration);
        tl.call(() => {
          this.look?.reset();
          if (opts.facing) stage.setFacing(opts.facing);
        });
        this.buildFlight(tl, stage, from, to, opts.duration ?? FLIGHT.duration);
      }
    }

    await tl.then();
    if (this.current === tl) this.current = null;
    this.flying = false;
    if (this.stage) {
      Object.assign(this.stage.motion, {
        x: 0,
        y: 0,
        bank: 0,
        yaw: 0,
        scale: 1,
        scaleY: 1,
        opacity: 1,
      });
    }
    this.scheduleRest();
    this.flash('wink', EXPRESSION_MS.wink);
    this.emit('arrived');
  }

  /** Reposiciona sem animar (resize). Se estiver voando, conclui o voo antes. */
  placeAt(anchor: Anchor): void {
    this.finishCurrent();
    this.anchor = anchorPoint(anchor);
    this.stage?.setAnchor(this.anchor);
    this.stage?.requestRender();
    this.placeImg();
  }

  /** Voa para fora pelo canto superior direito (~900 ms) e some. */
  async exit(): Promise<void> {
    this.finishCurrent();
    this.gestureTl?.kill();
    this.restCall?.kill();
    this.stopTalking();
    this.setLookEnabled(false);
    this.setIdle(false);
    const tl = gsap.timeline();
    this.current = tl;
    if (this.img) {
      tl.to(this.img, { opacity: 0, duration: 0.3, ease: 'power1.in' });
    } else if (this.stage) {
      const stage = this.stage;
      this.look?.reset();
      if (prefersReducedMotion()) {
        tl.to(stage.motion, { opacity: 0, duration: REDUCED.fadeOut * 2, ease: 'power1.in' });
      } else {
        const out = { x: window.innerWidth + EXIT.margin, y: -EXIT.margin };
        this.flying = true;
        this.buildFlight(tl, stage, { ...this.anchor }, out, EXIT.duration);
        tl.to(stage.motion, { opacity: 0, duration: 0.25, ease: 'power1.in' }, '-=0.3');
      }
    }
    await tl.then();
    if (this.current === tl) this.current = null;
    this.flying = false;
    this.visible = false;
  }

  /** Some com um fade curto, sem voo (Esc). */
  async hide(): Promise<void> {
    this.current?.kill();
    this.gestureTl?.kill();
    this.restCall?.kill();
    this.current = null;
    this.flying = false;
    this.stopTalking();
    this.setIdle(false);
    this.setLookEnabled(false);
    this.visible = false;
    const target = this.stage?.motion ?? this.img;
    if (target) await gsap.to(target, { opacity: 0, duration: 0.2, ease: 'power1.in' }).then();
  }

  // ---------- gestos, fala, olhar ----------

  async gesture(name: Gesture, opts: { target?: Anchor } = {}): Promise<void> {
    const stage = this.stage;
    if (!stage) return; // PNG: sem gestos
    this.gestureTl?.kill();
    this.restCall?.kill();
    const reduced = prefersReducedMotion();
    // Durante o gesto o olhar fica congelado e a flutuação desligada (mesmos eixos).
    if (this.look) this.look.frozen = true;
    let lead = 0;
    if (stage.idle.amount > 0.02) {
      this.idleTween?.kill();
      lead = RELAX.idleFade;
      this.idleTween = gsap.to(stage.idle, { amount: 0, duration: lead, ease: 'sine.inOut' });
    } else {
      this.idleTween?.kill();
      stage.idle.amount = 0;
    }
    let toward: { dx: number; dy: number } | undefined;
    if (opts.target) {
      const t = anchorPoint(opts.target);
      toward = { dx: t.x - this.anchor.x, dy: t.y - this.anchor.y };
    }
    const tl = gestureTimeline(stage.body, name, {
      amplitude: reduced ? 0.5 : 1,
      toward,
    });
    if (lead) tl.delay(lead);
    this.gestureTl = tl;
    tl.eventCallback('onComplete', () => {
      if (this.gestureTl === tl) this.rest();
    });
    // Resolve no rótulo 'done' (gesto feito) quando existir; senão, no fim.
    await new Promise<void>((resolve) => {
      if (tl.labels.done !== undefined) tl.call(resolve, [], 'done');
      else void tl.then(() => resolve());
      tl.eventCallback('onInterrupt', () => resolve());
    });
  }

  /**
   * Fala: com `narrate` e voz disponível, a boca segue a narração (barras pulsam por
   * palavra e param no fim). Sem narração, dura ~60 ms por caractere (1,2–4 s).
   */
  async talk({ text, narrate }: { text: string; narrate: boolean }): Promise<void> {
    const token = ++this.talkToken;
    const reduced = prefersReducedMotion();
    if (this.look) this.look.amplitude = 0.5;
    const done = () => {
      if (token !== this.talkToken) return;
      if (this.look) this.look.amplitude = 1;
      this.setExpression('smile');
    };
    if (narrate && Narrator.hasVoice()) {
      await this.narrator.speak(
        text,
        {
          onStart: () => {
            if (token === this.talkToken) this.setExpression('talk');
          },
          onWord: () => this.stage?.face.pulseWord(),
          onEnd: done,
        },
        reduced ? 0.9 : 1.05,
      );
      return;
    }
    this.setExpression('talk');
    const base = Math.min(TALK.max, Math.max(TALK.min, text.length * TALK.msPerChar));
    await new Promise<void>((r) =>
      window.setTimeout(r, base * (reduced ? REDUCED.talkSlowdown : 1)),
    );
    done();
  }

  /** Para a fala (e a narração) na hora. */
  stopTalking(): void {
    this.talkToken++;
    this.narrator.cancel();
    if (this.look) this.look.amplitude = 1;
    if (this.expression === 'talk') this.setExpression('smile');
  }

  /** Ponto de descanso do olhar (tooltip). O mouse, quando se mexe, tem prioridade. */
  lookAt(point: Point | null): void {
    this.look?.setRest(point);
  }

  setExpression(e: Expression): void {
    this.expression = e;
    this.stage?.face.setExpression(e);
  }

  on(event: NexoEvent, cb: () => void): void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(cb);
  }

  // ---------- interno ----------

  /**
   * Voo em arco (power2.inOut), sem antecipação nem assentamento elástico. Cada eixo
   * tem um só dono durante o voo: posição e escala pelo arco, Z pelo banking, Y
   * (rotação) pelo giro na direção do movimento. O banking vem da velocidade
   * analítica (tangente da curva × derivada do easing), sem ruído de quadro.
   */
  private buildFlight(
    tl: gsap.core.Timeline,
    stage: NexoStage,
    from: Point,
    to: Point,
    duration: number,
  ): void {
    const m = stage.motion;
    const arc = makeArc(from, to);
    const state = { t: 0 };

    stage.setAnchor(to);
    m.x = from.x - to.x;
    m.y = from.y - to.y;

    tl.to(state, {
      t: 1,
      duration,
      ease: 'none',
      onUpdate: () => {
        const p = easeInOut2(state.t);
        const pt = arcPoint(arc, p);
        m.x = pt.x - to.x;
        m.y = pt.y - to.y;
        const vx = (arcTangent(arc, p).x * easeInOut2Rate(state.t)) / duration;
        m.bank = bankFromVelocity(vx, arc.distance, duration);
        const env = midFlight(p);
        m.yaw = arc.dirX * FLIGHT.yawTurnDeg * env * stage.facing;
        m.scale = 1 - (1 - FLIGHT.depthScale) * env;
      },
    });
  }

  /** Corpo ao neutro, flutuação a zero e olhar à frente, em `duration` s, no início de `tl`. */
  private relaxInto(tl: gsap.core.Timeline, stage: NexoStage, duration: number): void {
    this.idleTween?.kill();
    this.idleTween = null;
    if (this.look) {
      this.look.enabled = false;
      this.look.frozen = true;
    }
    tl.to(stage.body, { ...REST_POSE, duration, ease: 'power2.inOut' }, 0);
    tl.to(stage.idle, { amount: 0, duration, ease: 'power2.inOut' }, 0);
    tl.to(stage.look, { yaw: 0, pitch: 0, duration, ease: 'power2.inOut' }, 0);
  }

  /**
   * Volta a flutuar e a seguir o olhar. Adiado um instante: se um gesto começar logo
   * depois da chegada (fluxo normal), ele assume e chama `rest()` no fim.
   */
  private scheduleRest(): void {
    this.restCall?.kill();
    this.restCall = gsap.delayedCall(0.05, () => {
      if (!this.gestureTl?.isActive()) this.rest();
    });
  }

  private rest(): void {
    if (this.look) this.look.frozen = false;
    this.setIdle(true);
    this.setLookEnabled(true);
  }

  private placeImg(): void {
    if (!this.img) return;
    this.img.style.left = `${this.anchor.x - FALLBACK.bodyX}px`;
    this.img.style.top = `${this.anchor.y - FALLBACK.bodyY}px`;
  }

  private setIdle(on: boolean): void {
    const stage = this.stage;
    if (!stage) return;
    this.idleTween?.kill();
    const target = on && !prefersReducedMotion() && this.visible ? 1 : 0;
    this.idleTween = gsap.to(stage.idle, {
      amount: target,
      duration: on ? IDLE_FADE.in : IDLE_FADE.out,
      ease: 'sine.inOut',
    });
  }

  private setLookEnabled(on: boolean): void {
    if (!this.look) return;
    this.look.enabled = on && !prefersReducedMotion() && this.visible;
    if (!this.look.enabled) this.look.reset();
  }

  private flash(e: Expression, ms: number): void {
    this.setExpression(e);
    window.clearTimeout(this.expressionTimer);
    this.expressionTimer = window.setTimeout(() => {
      if (this.expression === e) this.setExpression('smile');
    }, ms);
  }

  private finishCurrent(): void {
    if (this.current && this.current.isActive()) this.current.progress(1);
  }

  private emit(event: NexoEvent): void {
    this.listeners.get(event)?.forEach((cb) => cb());
  }

  private handleResize = (): void => {
    this.stage?.resize();
  };
}

function hasWebGL(): boolean {
  if (new URLSearchParams(location.search).has('nowebgl')) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
