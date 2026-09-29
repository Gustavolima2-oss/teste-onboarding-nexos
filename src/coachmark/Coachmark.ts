// Coach mark do onboarding (fase 2): overlay desfocado, destaque dos alvos,
// tooltip (texto, prévia animada ou vídeo), 7 bolinhas de progresso, botão de
// narração, trava de rolagem e teclado.
//
// O destaque é uma classe no próprio elemento (nada é clonado). Alvos em grupo
// sobem juntos. Quando o alvo está numa camada fixa ([data-coach-layer], a
// sidebar), a camada sobe acima do overlay e ganha um véu próprio (mesmo blur e cor).

import { gsap } from 'gsap';
import {
  intersects,
  isVerticallyVisible,
  resolvePlacement,
  toRect,
  unionRect,
  viewportRect,
  type Candidate,
  type Placement,
  type Rect,
} from './placement';
import {
  NEXO_FIGMA_EXTENTS,
  NEXO_GESTURE_MARGIN,
  NEXO_TOP_GAP,
  TARGET_AVOID_PADDING,
  TOOLTIP_TOP_GAP,
  resolvedPlacements,
  type Step,
} from './steps';
import { PreviewDemo, previewMarkup } from './previewDemo';
import { prefersReducedMotion } from '../utils/reducedMotion';
import { focusWithModality, trackInputModality } from '../utils/inputModality';
import { asset } from '../utils/asset';

const TARGET_CLASS = 'is-coach-target';
const LAYER_CLASS = 'is-coach-layer';
/** Alvo perdendo o destaque: continua acima do overlay durante a transição. */
const LEAVING_CLASS = 'is-coach-leaving';
const LAYER_LEAVING_CLASS = 'is-coach-layer-leaving';
/** Migração do destaque entre alvos (ms). */
export const TARGET_TRANSITION_MS = 520;
/** Entrada do tooltip: fade + translateX −8 → 0 + escala 0,96 → 1. */
const TOOLTIP_IN = { duration: 0.25, offset: -8, scale: 0.96 };
/** Saída do tooltip: fade + escala 0,98. */
const TOOLTIP_OUT = { duration: 0.1, scale: 0.98 };
/** Total de bolinhas (o Figma varia entre 5 e 7; padronizado em 7). */
export const DOTS = 9;

const getDim = (): number =>
  Number(document.documentElement.style.getPropertyValue('--coach-dim') || 1);
const setDim = (v: number): void =>
  document.documentElement.style.setProperty('--coach-dim', String(v));

/** Por que o layout foi recalculado: etapa nova (goTo) ou resize/relayout. */
export type LayoutReason = 'step' | 'resize';
export type GoToOptions = { highlight?: boolean; transitionMs?: number };
export type Extents = { left: number; right: number; top: number; bottom: number };

export type CoachmarkOptions = {
  steps: Step[];
  onNext: (index: number) => void;
  /** "Voltar" (a partir da etapa 2). */
  onBack: (index: number) => void;
  onClose: () => void;
  /** Alto-falante (ou Espaço no tooltip): pausa/retoma a fala, ou liga o som no modo silencioso. */
  onVoiceToggle?: () => void;
  /** Vídeo do tooltip começou/parou. */
  onVideo?: (playing: boolean) => void;
  /** Extensão da silhueta do Nexo relativa ao centro do corpo (px). */
  nexoExtents?: () => Extents;
  /** Chamado a cada layout (etapa nova ou resize), para reposicionar o Nexo. */
  onLayout?: (layout: StepLayout, reason: LayoutReason) => void;
};

export type StepLayout = {
  target: Rect;
  tooltip: Rect;
  placement: Placement;
  /** Caixa visível do Nexo, centro do corpo (âncora) e a posição usada (a/b/c). */
  nexo: Rect;
  nexoAnchor: { x: number; y: number };
  nexoPlacement: Placement;
};

/** O ícone mostra a AÇÃO do clique: alto-falante (voz desligada ou pausada) ou pausa (tocando). */
export type VoiceButtonState = 'off' | 'playing' | 'paused';

/** Botões do Figma: "Próximo" 87×40 e "Finalizar" 89×40 (etapa 9). */
const NEXT_SIZE = { next: { w: 87, h: 40 }, final: { w: 89, h: 40 } };
/** Espessura do anel de progresso ("Subtract", 2483:5698). */
const RING_STROKE = 3.5;

/** Os dois ícones ficam sobrepostos; o estado só troca a opacidade (crossfade de 120 ms). */
const VOICE_ICONS = `
  <img class="coach-audio-icon coach-audio-icon--speaker" src="${asset('images/onboarding/speaker-high.svg')}" alt="" width="18" height="18" />
  <img class="coach-audio-icon coach-audio-icon--pause" src="${asset('images/onboarding/pause.svg')}" alt="" width="18" height="18" />`;

export class Coachmark {
  readonly overlay: HTMLDivElement;
  readonly tooltip: HTMLDivElement;
  private readonly mediaEl: HTMLDivElement;
  private readonly sayEl: HTMLParagraphElement;
  private readonly srEl: HTMLSpanElement;
  private readonly ringPath: SVGPathElement;
  private readonly ringSvg: SVGSVGElement;
  private readonly dotsEl: HTMLDivElement;
  private readonly audioButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  readonly backButton: HTMLButtonElement;

  private index = -1;
  /** Alvos da etapa atual (destacados ou não). */
  private targets: HTMLElement[] = [];
  /** Elementos com o destaque aplicado e as camadas elevadas deles. */
  private highlighted: HTMLElement[] = [];
  private highlightedLayers: HTMLElement[] = [];
  private readonly leaving = new Map<HTMLElement, number>();
  private dimTween: gsap.core.Tween | null = null;
  private tooltipTween: gsap.core.Tween | null = null;
  private lastLayout: StepLayout | null = null;
  private previousFocus: Element | null = null;
  private scrollLock: { overflow: string; paddingRight: string } | null = null;
  private opened = false;
  private demo: PreviewDemo | null = null;
  private video: HTMLVideoElement | null = null;
  private voiceState: VoiceButtonState | null = null;
  /** Palavras do texto falado (um <span> por palavra, na ordem do manifesto). */
  private wordEls: HTMLSpanElement[] = [];
  private spokenShown = -1;
  private progressShown = -1;
  /** Movimento reduzido: o gradiente anda em degraus de 10%, sem animação suave. */
  private readonly reducedProgress = prefersReducedMotion();

  constructor(private readonly opts: CoachmarkOptions) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'coach-overlay';

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'coach-tooltip';
    this.tooltip.setAttribute('role', 'dialog');
    this.tooltip.setAttribute('aria-modal', 'true');
    this.tooltip.setAttribute('aria-describedby', 'coach-say-sr');
    this.tooltip.hidden = true;
    this.tooltip.innerHTML = `
      <div class="coach-media" hidden></div>
      <div class="coach-head">
        <p class="coach-say" aria-hidden="true"></p>
        <span id="coach-say-sr" class="sr-only" aria-live="polite"></span>
        <button type="button" class="coach-audio" aria-pressed="false"></button>
      </div>
      <div class="coach-footer">
        <button type="button" class="coach-back">Voltar</button>
        <div class="coach-dots" role="img">${'<span></span>'.repeat(DOTS)}</div>
        <span class="coach-next-wrap">
          <button type="button" class="coach-next">Próximo</button>
          <svg class="coach-ring" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="coach-ring-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="94" y2="0">
                <stop offset="0" stop-color="#E49876" />
                <stop offset="0.442308" stop-color="#FFC846" />
                <stop offset="1" stop-color="#FFD8C7" />
              </linearGradient>
            </defs>
            <path pathLength="100" stroke="url(#coach-ring-grad)" />
          </svg>
        </span>
      </div>`;
    const q = <T extends Element>(sel: string): T => {
      const el = this.tooltip.querySelector(sel);
      if (!el) throw new Error(`Coachmark: ${sel} não encontrado`);
      return el as T;
    };
    this.mediaEl = q<HTMLDivElement>('.coach-media');
    this.sayEl = q<HTMLParagraphElement>('.coach-say');
    this.srEl = q<HTMLSpanElement>('#coach-say-sr');
    this.ringSvg = q<SVGSVGElement>('.coach-ring');
    this.ringPath = q<SVGPathElement>('.coach-ring path');
    this.dotsEl = q<HTMLDivElement>('.coach-dots');
    this.audioButton = q<HTMLButtonElement>('.coach-audio');
    this.nextButton = q<HTMLButtonElement>('.coach-next');
    this.backButton = q<HTMLButtonElement>('.coach-back');
    this.audioButton.innerHTML = VOICE_ICONS;
    this.setVoiceState('off');
  }

  get currentIndex(): number {
    return this.index;
  }

  get layout(): StepLayout | null {
    return this.lastLayout;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** Abre o coach mark. Com `dimmed: false` o overlay começa transparente (ver dim()). */
  open({ dimmed = true }: { dimmed?: boolean } = {}): void {
    if (this.opened) return;
    this.opened = true;
    this.previousFocus = document.activeElement;
    trackInputModality();
    setDim(dimmed ? 1 : 0);
    document.body.append(this.overlay, this.tooltip);
    this.lockScroll();
    this.tooltip.addEventListener('click', this.handleClick);
    document.addEventListener('click', this.handleTargetClick, true);
    document.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Prepara a etapa: escolhe os alvos, preenche o conteúdo, rola até o alvo se
   * necessário (e espera a rolagem terminar) e posiciona o tooltip, ainda oculto.
   */
  async goTo(
    index: number,
    { highlight = true, transitionMs = TARGET_TRANSITION_MS }: GoToOptions = {},
  ): Promise<StepLayout> {
    const step = this.opts.steps[index];
    if (!step) throw new Error(`Coachmark: etapa ${index} inexistente`);
    const els = this.queryTargets(step);
    if (!els.length) throw new Error(`Coachmark: alvo ${String(step.target)} não encontrado`);
    this.index = index;
    this.targets = els;
    this.fillContent(step, index);
    await this.ensureVisible(step);
    if (highlight) this.highlight(transitionMs);
    return this.positionTooltip('step');
  }

  /**
   * Aplica o destaque aos alvos atuais. Os anteriores perdem o destaque com
   * transição e continuam acima do overlay até ela terminar; depois voltam
   * exatamente ao estado original.
   */
  highlight(transitionMs = TARGET_TRANSITION_MS): void {
    const step = this.opts.steps[this.index];
    if (!step) return;
    const next = this.targets;
    if (next.length && next.every((el) => this.highlighted.includes(el))) return;
    document.documentElement.style.setProperty('--coach-target-dur', `${transitionMs}ms`);
    for (const el of this.highlighted) if (!next.includes(el)) this.release(el, transitionMs);
    for (const layer of this.highlightedLayers) this.releaseLayer(layer, transitionMs);

    const layers = new Set<HTMLElement>();
    for (const el of next) {
      el.classList.remove(LEAVING_CLASS);
      el.classList.add(TARGET_CLASS);
      el.dataset.coachHighlight = step.highlight;
      // Alvo navegável: clicar nele avança como o "Próximo" (cursor e hover no CSS).
      if (step.targetClickAdvances) el.dataset.coachAdvance = '';
      else delete el.dataset.coachAdvance;
      const layer = el.closest<HTMLElement>('[data-coach-layer]');
      if (layer) layers.add(layer);
    }
    for (const layer of layers) {
      window.clearTimeout(this.leaving.get(layer));
      layer.classList.remove(LAYER_LEAVING_CLASS);
      layer.classList.add(LAYER_CLASS);
    }
    this.highlighted = [...next];
    this.highlightedLayers = [...layers];
  }

  /** Tira o destaque (fim do fluxo), com transição. */
  unhighlight(transitionMs = TARGET_TRANSITION_MS): void {
    for (const el of this.highlighted) this.release(el, transitionMs);
    for (const layer of this.highlightedLayers) this.releaseLayer(layer, transitionMs);
    this.highlighted = [];
    this.highlightedLayers = [];
  }

  /** Anima o escurecimento/desfoque (overlay e véus das camadas) até `to` (0–1). */
  async dim(to: number, duration = 0.45, ease = 'power2.inOut'): Promise<void> {
    const state = { v: getDim() };
    this.dimTween?.kill();
    const tween = gsap.to(state, { v: to, duration, ease, onUpdate: () => setDim(state.v) });
    this.dimTween = tween;
    await tween.then();
  }

  /** Mostra o tooltip (fade + deslize + escala) e foca o "Próximo". */
  async showTooltip({ animate = true }: { animate?: boolean } = {}): Promise<void> {
    this.setBusy(false); // um botão desabilitado não recebe foco
    this.tooltipTween?.kill();
    this.tooltip.hidden = false;
    this.tooltip.classList.add('is-visible');
    focusWithModality(this.nextButton);
    if (!animate) {
      gsap.set(this.tooltip, { clearProps: 'opacity,transform' });
      return;
    }
    const reduced = prefersReducedMotion();
    const fromBelow = this.tooltip.dataset.placement === 'bottom';
    const fromTop = this.tooltip.dataset.placement === 'top';
    const tween = gsap.fromTo(
      this.tooltip,
      {
        opacity: 0,
        x: reduced || fromTop || fromBelow ? 0 : TOOLTIP_IN.offset,
        y: reduced ? 0 : fromBelow ? TOOLTIP_IN.offset : fromTop ? -TOOLTIP_IN.offset : 0,
        scale: reduced ? 1 : TOOLTIP_IN.scale,
      },
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        duration: TOOLTIP_IN.duration,
        ease: 'power3.out',
        clearProps: 'transform',
      },
    );
    this.tooltipTween = tween;
    await tween.then();
  }

  /** Esconde o tooltip (fade + escala 0,98). */
  async hideTooltip({
    animate = true,
    duration = TOOLTIP_OUT.duration,
  }: { animate?: boolean; duration?: number } = {}): Promise<void> {
    this.tooltipTween?.kill();
    this.stopMedia();
    if (animate && !this.tooltip.hidden) {
      const tween = gsap.to(this.tooltip, {
        opacity: 0,
        scale: prefersReducedMotion() ? 1 : TOOLTIP_OUT.scale,
        duration,
        ease: 'power2.in',
      });
      this.tooltipTween = tween;
      await tween.then();
      if (this.tooltipTween !== tween) return; // outra animação assumiu
    }
    this.tooltip.classList.remove('is-visible');
    this.tooltip.hidden = true;
    gsap.set(this.tooltip, { clearProps: 'opacity,transform' });
  }

  /** Durante transições, "Voltar" e "Próximo" ficam desabilitados. Na etapa 1 não há "Voltar". */
  setBusy(busy: boolean): void {
    document.documentElement.classList.toggle('is-coach-busy', busy);
    this.nextButton.disabled = busy;
    this.backButton.disabled = busy || this.index <= 0;
  }

  /**
   * Estado do alto-falante, sempre mostrando a ação do clique: 'off' (voz desligada:
   * alto-falante, "Ouvir o Nexo"), 'playing' (pausa, "Pausar", aria-pressed) ou 'paused'
   * (alto-falante, "Continuar ouvindo").
   */
  setVoiceState(state: VoiceButtonState): void {
    if (state === this.voiceState) return;
    this.voiceState = state;
    const b = this.audioButton;
    const label = { off: 'Ouvir o Nexo', playing: 'Pausar', paused: 'Continuar ouvindo' }[state];
    b.setAttribute('aria-pressed', String(state === 'playing'));
    b.setAttribute('aria-label', label);
    b.title = label;
    b.dataset.voice = state;
  }

  /**
   * Texto no início da etapa: sem voz, inteiro em branco; com voz, todo cinza (acende
   * palavra a palavra). O anel volta a zero.
   */
  prepareText(voice: boolean): void {
    this.setVoiceProgress(0, voice ? 0 : this.wordEls.length);
  }

  /**
   * Grifo e gradiente da fala: `spoken` palavras ficam brancas (progressivo) e o
   * "Próximo" preenche `progress` (0..1). Só mexe no que mudou.
   */
  setVoiceProgress(progress: number, spoken: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const shown = this.reducedProgress ? Math.floor(p * 10) / 10 : p;
    if (shown !== this.progressShown) {
      this.progressShown = shown;
      this.nextButton.style.setProperty('--coach-progress', String(shown));
      // Anel do Figma ("Subtract"): contorno da pílula, do meio da lateral esquerda,
      // em sentido horário, preenchido de 0 a 100% ao longo da fala.
      this.ringPath.style.strokeDasharray = shown > 0 ? `${shown * 100} 100` : '0 100';
    }
    if (spoken !== this.spokenShown) {
      this.spokenShown = spoken;
      this.wordEls.forEach((el, i) => el.classList.toggle('is-spoken', i < spoken));
    }
  }

  /** Começa a demonstração do cursor (etapa com tooltip de prévia). */
  startDemo(): void {
    this.demo?.start();
  }

  /** Recalcula posições sem animar (resize). */
  relayout(): StepLayout | null {
    if (this.index < 0) return null;
    return this.positionTooltip('resize');
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.dimTween?.kill();
    this.tooltipTween?.kill();
    this.stopMedia();
    this.demo?.dispose();
    this.demo = null;
    for (const [el, t] of this.leaving) {
      window.clearTimeout(t);
      el.classList.remove(LEAVING_CLASS, LAYER_LEAVING_CLASS);
    }
    this.leaving.clear();
    for (const el of this.highlighted) {
      el.classList.remove(TARGET_CLASS);
      delete el.dataset.coachHighlight;
    }
    for (const l of this.highlightedLayers) l.classList.remove(LAYER_CLASS);
    this.highlighted = [];
    this.highlightedLayers = [];
    this.targets = [];
    document.documentElement.style.removeProperty('--coach-target-dur');
    this.overlay.remove();
    this.tooltip.remove();
    gsap.set(this.tooltip, { clearProps: 'opacity,transform' });
    setDim(1);
    this.unlockScroll();
    this.tooltip.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('click', this.handleTargetClick, true);
    document.documentElement.classList.remove('is-coach-busy');
    window.removeEventListener('resize', this.handleResize);
    if (this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
    this.index = -1;
    this.lastLayout = null;
  }

  // ---------- alvos ----------

  private queryTargets(step: Step): HTMLElement[] {
    const sels = Array.isArray(step.target) ? step.target : [step.target];
    return sels.flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s)));
  }

  private targetRect(): Rect {
    return unionRect(this.targets.map((el) => toRect(el.getBoundingClientRect())));
  }

  private release(el: HTMLElement, ms: number): void {
    delete el.dataset.coachAdvance;
    el.classList.remove(TARGET_CLASS);
    el.classList.add(LEAVING_CLASS);
    window.clearTimeout(this.leaving.get(el));
    this.leaving.set(
      el,
      window.setTimeout(() => {
        el.classList.remove(LEAVING_CLASS);
        delete el.dataset.coachHighlight;
        this.leaving.delete(el);
      }, ms),
    );
  }

  private releaseLayer(layer: HTMLElement, ms: number): void {
    layer.classList.remove(LAYER_CLASS);
    layer.classList.add(LAYER_LEAVING_CLASS);
    window.clearTimeout(this.leaving.get(layer));
    this.leaving.set(
      layer,
      window.setTimeout(() => {
        layer.classList.remove(LAYER_LEAVING_CLASS);
        this.leaving.delete(layer);
      }, ms),
    );
  }

  // ---------- conteúdo ----------

  /**
   * Texto falado: um <span> por palavra, na mesma divisão por espaços do manifesto.
   * Entre frases, uma linha em branco (como no Figma). O texto inteiro fica para leitores
   * de tela desde o início (o grifo é só visual: a versão em spans tem aria-hidden).
   */
  private renderWords(text: string): void {
    const words = text.split(/\s+/).filter(Boolean);
    this.sayEl.replaceChildren();
    this.wordEls = words.map((w, i) => {
      const span = document.createElement('span');
      span.className = 'coach-say-word';
      span.textContent = w;
      this.sayEl.append(span);
      const endsSentence = /[.!?]$/.test(w) && i < words.length - 1;
      if (endsSentence) {
        this.sayEl.append(document.createElement('br'), document.createElement('br'));
      } else if (i < words.length - 1) {
        this.sayEl.append(' ');
      }
      return span;
    });
    this.srEl.textContent = text;
    this.spokenShown = -1;
  }

  /** Caminho do anel em volta do botão (w×h), com 3,5 px de espessura colado à borda. */
  private drawRing({ w, h }: { w: number; h: number }): void {
    const t = RING_STROKE;
    const W = w + t;
    const H = h + t;
    const x0 = t / 2;
    const y0 = t / 2;
    const r = H / 2;
    const cy = y0 + r;
    this.ringSvg.setAttribute('width', String(w + 2 * t));
    this.ringSvg.setAttribute('height', String(h + 2 * t));
    this.ringSvg.setAttribute('viewBox', `0 0 ${w + 2 * t} ${h + 2 * t}`);
    this.ringPath.setAttribute(
      'd',
      [
        `M ${x0} ${cy}`,
        `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
        `H ${x0 + W - r}`,
        `A ${r} ${r} 0 0 1 ${x0 + W - r} ${y0 + H}`,
        `H ${x0 + r}`,
        `A ${r} ${r} 0 0 1 ${x0} ${cy}`,
      ].join(' '),
    );
    this.ringSvg.querySelector('linearGradient')?.setAttribute('x2', String(w + 2 * t));
  }

  private fillContent(step: Step, index: number): void {
    const t = step.tooltip;
    this.tooltip.dataset.step = step.id;
    this.tooltip.dataset.kind = t.kind;
    this.tooltip.setAttribute('aria-label', `Etapa ${index + 1} de ${DOTS}`);
    this.renderWords(step.text);
    const last = index === this.opts.steps.length - 1;
    this.nextButton.textContent = last ? 'Finalizar' : 'Próximo';
    this.nextButton.classList.toggle('is-final', last);
    this.drawRing(last ? NEXT_SIZE.final : NEXT_SIZE.next);
    this.setVoiceProgress(0, 0);
    this.dotsEl.setAttribute('aria-label', `Etapa ${index + 1} de ${DOTS}`);
    this.dotsEl
      .querySelectorAll('span')
      .forEach((d, i) => d.classList.toggle('is-done', i <= index));
    // Etapa 1: "Voltar" some mas ocupa o lugar (bolinhas e "Próximo" não saem do lugar).
    this.backButton.classList.toggle('is-hidden', index === 0);
    this.backButton.setAttribute('aria-hidden', String(index === 0));
    if (index === 0) this.backButton.disabled = true;

    this.demo?.dispose();
    this.demo = null;
    this.stopMedia();
    if (t.kind === 'text') {
      this.mediaEl.hidden = true;
      this.mediaEl.innerHTML = '';
      return;
    }
    this.mediaEl.hidden = false;
    const close = `<button type="button" class="coach-close" aria-label="Fechar o tour"><img src="${asset('images/onboarding/close.svg')}" alt="" width="13.049" height="13.049" /></button>`;
    if (t.kind === 'preview') {
      this.mediaEl.innerHTML = previewMarkup() + close;
      this.demo = new PreviewDemo(this.mediaEl);
    } else if (t.kind === 'image' && t.media) {
      this.mediaEl.innerHTML = `<img class="coach-poster" src="${t.media.poster}" alt="${t.media.alt}" />`;
    } else if (t.kind === 'video' && t.media) {
      this.mediaEl.innerHTML = `
        <img class="coach-poster" src="${t.media.poster}" alt="${t.media.alt}" />
        <span class="coach-poster-shade" aria-hidden="true"></span>
        <button type="button" class="coach-play"><img src="${asset('images/onboarding/play.svg')}" alt="" width="10" height="10" /><span>Play</span></button>
        ${close}`;
    }
  }

  private playVideo(): void {
    const step = this.opts.steps[this.index];
    const src = step?.tooltip.media?.src;
    if (!src || this.video) return;
    const v = document.createElement('video');
    v.className = 'coach-video';
    v.src = src;
    v.playsInline = true;
    v.muted = true;
    v.setAttribute('aria-label', step?.tooltip.media?.alt ?? 'Vídeo');
    v.addEventListener('ended', () => this.stopMedia());
    this.mediaEl.classList.add('is-playing');
    this.mediaEl.prepend(v);
    this.video = v;
    void v.play().catch(() => this.stopMedia());
    this.opts.onVideo?.(true);
  }

  private stopMedia(): void {
    this.demo?.stop();
    if (!this.video) return;
    this.video.pause();
    this.video.remove();
    this.video = null;
    this.mediaEl.classList.remove('is-playing');
    this.opts.onVideo?.(false);
  }

  // ---------- geometria ----------

  private candidates(step: Step, t: Rect, size: { w: number; h: number }): Candidate[] {
    const o = step.tooltip.offset;
    const preferred: Candidate =
      step.tooltip.placement === 'bottom'
        ? { placement: 'bottom', rect: { x: t.x + o.x, y: t.y + t.h + o.y, ...size } }
        : { placement: 'right', rect: { x: t.x + t.w + o.x, y: t.y + o.y, ...size } };
    return [
      preferred,
      {
        placement: 'top',
        rect: { x: t.x + t.w - size.w, y: t.y - TOOLTIP_TOP_GAP - size.h, ...size },
      },
    ];
  }

  private tooltipSize(): { w: number; h: number } {
    const wasHidden = this.tooltip.hidden;
    if (wasHidden) {
      this.tooltip.style.visibility = 'hidden';
      this.tooltip.hidden = false;
    }
    const size = { w: this.tooltip.offsetWidth, h: this.tooltip.offsetHeight };
    if (wasHidden) {
      this.tooltip.hidden = true;
      this.tooltip.style.visibility = '';
    }
    return size;
  }

  private async ensureVisible(step: Step): Promise<void> {
    const t = this.targetRect();
    const [preferred] = this.candidates(step, t, this.tooltipSize());
    // Só a dimensão vertical: rolar não resolve estouro horizontal (isso é papel da colisão).
    if (isVerticallyVisible(t) && preferred && isVerticallyVisible(preferred.rect)) return;
    const first = this.targets[0];
    if (first) await scrollIntoViewAndWait(first, !prefersReducedMotion());
  }

  private positionTooltip(reason: LayoutReason): StepLayout {
    const step = this.opts.steps[this.index];
    if (!step || !this.targets.length) throw new Error('Coachmark: sem etapa ativa');
    const t = this.targetRect();
    const size = this.tooltipSize();
    const { placement, rect } = resolvePlacement(this.candidates(step, t, size), viewportRect());
    this.tooltip.style.left = `${rect.x}px`;
    this.tooltip.style.top = `${rect.y}px`;
    this.tooltip.dataset.placement = placement;

    const nexo = this.placeNexo(step, t, rect);
    resolvedPlacements[step.id] = { tooltip: placement, nexo: nexo.placement };
    const layout: StepLayout = {
      target: t,
      tooltip: rect,
      placement,
      nexo: nexo.rect,
      nexoAnchor: nexo.anchor,
      nexoPlacement: nexo.placement,
    };
    this.lastLayout = layout;
    this.opts.onLayout?.(layout, reason);
    return layout;
  }

  /**
   * Posição do Nexo em relação ao tooltip (onde quer que ele esteja):
   * (a) à direita, com o offset do Figma; (b) acima, alinhado à borda direita,
   * base 8 px sobre o topo; (c) clamp de (a) na viewport. Nunca cobre o
   * tooltip nem o alvo destacado.
   */
  private placeNexo(step: Step, target: Rect, tip: Rect) {
    const base = this.opts.nexoExtents?.() ?? NEXO_FIGMA_EXTENTS;
    // Reserva espaço para os gestos (braços abrem além da silhueta de repouso).
    const e = {
      ...base,
      left: base.left - NEXO_GESTURE_MARGIN,
      right: base.right + NEXO_GESTURE_MARGIN,
    };
    const w = e.right - e.left;
    const h = e.bottom - e.top;
    const boxAt = (ax: number, ay: number): Rect => ({ x: ax + e.left, y: ay + e.top, w, h });
    const pad = TARGET_AVOID_PADDING;
    const avoid = [
      tip,
      { x: target.x - pad, y: target.y - pad, w: target.w + pad * 2, h: target.h + pad * 2 },
    ];
    const a = { x: tip.x + tip.w + step.nexo.offset.x, y: tip.y + tip.h / 2 + step.nexo.offset.y };
    const b = { x: tip.x + tip.w - e.right, y: tip.y - NEXO_TOP_GAP - e.bottom };
    const res = resolvePlacement(
      [
        { placement: 'right', rect: boxAt(a.x, a.y) },
        { placement: 'top', rect: boxAt(b.x, b.y) },
      ],
      viewportRect(),
      undefined,
      avoid,
    );
    // (c) clamp: se ainda encostar no tooltip, empurra para a direita dele.
    if (res.placement === 'clamped' && intersects(res.rect, tip)) {
      res.rect.x = Math.max(res.rect.x, tip.x + tip.w + 4);
    }
    return { ...res, anchor: { x: res.rect.x - e.left, y: res.rect.y - e.top } };
  }

  // ---------- rolagem ----------

  private lockScroll(): void {
    const root = document.documentElement;
    const scrollbar = window.innerWidth - root.clientWidth;
    this.scrollLock = {
      overflow: root.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };
    root.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }

  private unlockScroll(): void {
    if (!this.scrollLock) return;
    document.documentElement.style.overflow = this.scrollLock.overflow;
    document.body.style.paddingRight = this.scrollLock.paddingRight;
    this.scrollLock = null;
  }

  // ---------- eventos ----------

  private handleClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    if (btn === this.nextButton) this.opts.onNext(this.index);
    else if (btn === this.backButton) this.opts.onBack(this.index);
    else if (btn === this.audioButton) this.opts.onVoiceToggle?.();
    else if (btn.classList.contains('coach-close')) this.opts.onClose();
    else if (btn.classList.contains('coach-play')) this.playVideo();
  };

  /**
   * Clique num alvo destacado. Com `targetClickAdvances`, avança como o "Próximo"
   * (se não estiver em transição). Em qualquer alvo, um link não navega sozinho:
   * a navegação durante o tour é sempre do fluxo (senão a rota mudaria por fora).
   */
  private handleTargetClick = (e: MouseEvent): void => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(
      `.${TARGET_CLASS}, .${LEAVING_CLASS}`,
    );
    if (!el) return;
    const step = this.opts.steps[this.index];
    const advances = el.classList.contains(TARGET_CLASS) && !!step?.targetClickAdvances;
    if (advances) {
      e.preventDefault();
      e.stopPropagation();
      if (!this.nextButton.disabled) this.opts.onNext(this.index);
      return;
    }
    if ((e.target as Element).closest('a[href]')) e.preventDefault();
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.opts.onClose();
      return;
    }
    if (this.tooltip.hidden) return;
    const active = document.activeElement;
    // Setas e Enter navegam, exceto dentro do vídeo (setas = busca) ou de outro campo.
    const inMedia = active instanceof HTMLVideoElement || active instanceof HTMLInputElement;
    if (!inMedia && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const btn = e.key === 'ArrowLeft' ? this.backButton : this.nextButton;
        if (!btn.disabled) btn.click();
        return;
      }
      // Espaço (foco dentro do tooltip): pausa e retoma a fala.
      if ((e.key === ' ' || e.code === 'Space') && active && this.tooltip.contains(active)) {
        e.preventDefault();
        if (!this.audioButton.disabled) this.opts.onVoiceToggle?.();
        return;
      }
      // Enter avança; num botão do tooltip (Voltar, áudio) ativa esse botão.
      if (
        e.key === 'Enter' &&
        !(active instanceof HTMLButtonElement && this.tooltip.contains(active))
      ) {
        e.preventDefault();
        if (!this.nextButton.disabled) this.nextButton.click();
        return;
      }
    }
    if (e.key !== 'Tab') return;
    // Foco preso no tooltip: circula entre os controles habilitados.
    const focusables = Array.from(
      this.tooltip.querySelectorAll<HTMLElement>('button:not([disabled]), video[controls]'),
    );
    if (!focusables.length) return;
    e.preventDefault();
    const i = focusables.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      i < 0
        ? focusables.length - 1
        : (i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
    const el = focusables[nextIndex];
    if (el) focusWithModality(el);
  };

  private handleResize = (): void => {
    this.relayout();
  };
}

function scrollIntoViewAndWait(el: HTMLElement, smooth: boolean): Promise<void> {
  return new Promise((resolve) => {
    // Termina no 'scrollend' ou quando a posição fica parada por STILL_FRAMES
    // quadros seguidos (o 'scrollend' não dispara se não houver rolagem).
    const STILL_FRAMES = 10;
    let lastY = window.scrollY;
    let still = 0;
    let raf = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', finish);
      cancelAnimationFrame(raf);
      resolve();
    };
    const poll = () => {
      still = window.scrollY === lastY ? still + 1 : 0;
      lastY = window.scrollY;
      if (still >= STILL_FRAMES) finish();
      else raf = requestAnimationFrame(poll);
    };
    window.addEventListener('scrollend', finish);
    el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    raf = requestAnimationFrame(poll);
  });
}
