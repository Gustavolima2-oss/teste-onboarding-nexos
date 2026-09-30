// Prévia animada do tooltip "Conversas" (Figma 2350:46910, mídia 378×210):
// um cursor de seta (preto com contorno branco, visível sobre a imagem) entra pela
// lateral, para sobre o ícone de fixar, o mini tooltip "Fixar no menu" aparece, o cursor
// clica (escala 0,9 → 1, com uma onda circular saindo do ponto) e o ícone vira "fixado".
// Dura ~2,5 s e repete a cada ~4 s enquanto a etapa estiver aberta.

import { gsap } from 'gsap';
import { prefersReducedMotion } from '../utils/reducedMotion';
import { asset } from '../utils/asset';

/** Geometria da mídia (px dentro dos 378×210), medida no Figma. */
export const PREVIEW = {
  /** Export do card 2350:46914 em 2x (inclui a sombra; cortado no fundo da mídia). */
  card: { x: 58.74, y: 35.27, w: 240.5, h: 175 },
  /** Ícone de fixar (2350:46970), 13 px. */
  pin: { x: 271.43, y: 44.27, size: 13 },
  /** Mini tooltip "Fixar no menu" (2350:46978). */
  tip: { x: 241, y: 12.84 },
  /**
   * Cursor de seta (20×27): canto superior esquerdo do SVG na posição final — a ponta
   * (1,5; 1,5) cai no centro do ícone de fixar (277,9; 50,8).
   */
  cursor: { x: 276.4, y: 49.3, w: 20, h: 27, fromX: 392, fromY: 150 },
  /** Onda do clique: círculo de 28 px centrado no ícone. */
  ripple: { size: 28 },
  /** Ciclo (s). */
  duration: 2.5,
  repeatEvery: 4,
};

export function previewMarkup(): string {
  const p = PREVIEW;
  return `
    <div class="coach-preview" aria-hidden="true">
      <img class="coach-preview-card" src="${asset('images/onboarding/preview-card.png')}" alt=""
        style="left:${p.card.x}px;top:${p.card.y}px;width:${p.card.w}px;height:${p.card.h}px" />
      <span class="coach-preview-pin" style="left:${p.pin.x}px;top:${p.pin.y}px"></span>
      <span class="coach-preview-tip" style="left:${p.tip.x}px;top:${p.tip.y}px">Fixar no menu</span>
      <span class="coach-preview-ripple" style="left:${p.pin.x + p.pin.size / 2 - p.ripple.size / 2}px;top:${p.pin.y + p.pin.size / 2 - p.ripple.size / 2}px;width:${p.ripple.size}px;height:${p.ripple.size}px"></span>
      <img class="coach-preview-cursor" src="${asset('images/onboarding/cursor-arrow.svg')}" alt="" width="${p.cursor.w}" height="${p.cursor.h}"
        style="left:0;top:0" />
    </div>`;
}

export class PreviewDemo {
  private tl: gsap.core.Timeline | null = null;
  private readonly pin: HTMLElement | null;
  private readonly tip: HTMLElement | null;
  private readonly cursor: HTMLElement | null;
  private readonly ripple: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.pin = root.querySelector('.coach-preview-pin');
    this.tip = root.querySelector('.coach-preview-tip');
    this.cursor = root.querySelector('.coach-preview-cursor');
    this.ripple = root.querySelector('.coach-preview-ripple');
    this.reset();
  }

  get running(): boolean {
    return !!this.tl;
  }

  start(): void {
    const { pin, tip, cursor, ripple } = this;
    if (!pin || !tip || !cursor || !ripple || this.tl) return;
    const c = PREVIEW.cursor;
    if (prefersReducedMotion()) {
      // Sem movimento: estado final parado (cursor visível sobre o ícone, dica, fixado).
      gsap.set(cursor, { x: c.x, y: c.y, opacity: 1 });
      gsap.set(tip, { opacity: 1, scale: 1 });
      pin.classList.add('is-pinned');
      return;
    }
    const tl = gsap.timeline({ repeat: -1, repeatDelay: PREVIEW.repeatEvery - PREVIEW.duration });
    tl.call(() => this.reset());
    tl.fromTo(
      cursor,
      { x: c.fromX, y: c.fromY, opacity: 1 },
      { x: c.x, y: c.y, duration: 0.9, ease: 'power2.inOut' },
    );
    tl.fromTo(
      tip,
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.2, ease: 'power2.out' },
      '>-0.05',
    );
    // Para um instante sobre o ícone e clica: 0,9 → 1, com a onda saindo do ponto.
    tl.to(cursor, { scale: 0.9, duration: 0.08, ease: 'power1.in' }, '+=0.35');
    tl.call(() => pin.classList.add('is-pinned'));
    tl.fromTo(
      ripple,
      { opacity: 0.9, scale: 0.3 },
      { opacity: 0, scale: 1.6, duration: 0.5, ease: 'power2.out' },
    );
    tl.to(cursor, { scale: 1, duration: 0.12, ease: 'power1.out' }, '<');
    tl.to(tip, { opacity: 0, duration: 0.2, ease: 'power1.in' }, '+=0.35');
    tl.to(cursor, { opacity: 0, duration: 0.25, ease: 'power1.in' }, '<');
    this.tl = tl;
  }

  stop(): void {
    this.tl?.kill();
    this.tl = null;
    this.reset();
  }

  dispose(): void {
    this.stop();
  }

  private reset(): void {
    const { pin, tip, cursor, ripple } = this;
    if (!pin || !tip || !cursor || !ripple) return;
    pin.classList.remove('is-pinned');
    gsap.set(ripple, { opacity: 0, scale: 0.3 });
    gsap.set(tip, { opacity: 0, scale: 0.9, transformOrigin: '50% 100%' });
    gsap.set(cursor, {
      x: PREVIEW.cursor.fromX,
      y: PREVIEW.cursor.fromY,
      opacity: 0,
      scale: 1,
      // O clique encolhe a partir da ponta da seta (1,5; 1,5 de 20×27).
      transformOrigin: '7.5% 5.5%',
    });
  }
}
