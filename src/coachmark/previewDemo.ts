// Prévia animada do tooltip "Conversas" (Figma 2350:46910, mídia 378×210):
// o cursor entra pela lateral, para sobre o ícone de fixar, o mini tooltip
// "Fixar no menu" aparece, o cursor clica (escala 0,9 → 1) e o ícone vira
// "fixado". Dura ~2,5 s e repete a cada 6 s.

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
  /** Cursor (2350:46972): posição final do canto superior esquerdo do SVG (16×17). */
  cursor: { x: 276.2, y: 51.05, fromX: 392, fromY: 150 },
  /** Ciclo (s). */
  duration: 2.5,
  repeatEvery: 6,
};

export function previewMarkup(): string {
  const p = PREVIEW;
  return `
    <div class="coach-preview" aria-hidden="true">
      <img class="coach-preview-card" src="${asset('images/onboarding/preview-card.png')}" alt=""
        style="left:${p.card.x}px;top:${p.card.y}px;width:${p.card.w}px;height:${p.card.h}px" />
      <span class="coach-preview-pin" style="left:${p.pin.x}px;top:${p.pin.y}px"></span>
      <span class="coach-preview-tip" style="left:${p.tip.x}px;top:${p.tip.y}px">Fixar no menu</span>
      <img class="coach-preview-cursor" src="${asset('images/onboarding/cursor.svg')}" alt="" width="16" height="17"
        style="left:0;top:0" />
    </div>`;
}

export class PreviewDemo {
  private tl: gsap.core.Timeline | null = null;
  private readonly pin: HTMLElement | null;
  private readonly tip: HTMLElement | null;
  private readonly cursor: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.pin = root.querySelector('.coach-preview-pin');
    this.tip = root.querySelector('.coach-preview-tip');
    this.cursor = root.querySelector('.coach-preview-cursor');
    this.reset();
  }

  get running(): boolean {
    return !!this.tl;
  }

  start(): void {
    const { pin, tip, cursor } = this;
    if (!pin || !tip || !cursor || this.tl) return;
    const c = PREVIEW.cursor;
    if (prefersReducedMotion()) {
      // Sem movimento: mostra o estado final (cursor sobre o ícone, dica visível, fixado).
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
    tl.to(cursor, { scale: 0.9, duration: 0.08, ease: 'power1.in' }, '+=0.25');
    tl.call(() => pin.classList.add('is-pinned'));
    tl.to(cursor, { scale: 1, duration: 0.12, ease: 'power1.out' });
    tl.to(tip, { opacity: 0, duration: 0.2, ease: 'power1.in' }, '+=0.45');
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
    const { pin, tip, cursor } = this;
    if (!pin || !tip || !cursor) return;
    pin.classList.remove('is-pinned');
    gsap.set(tip, { opacity: 0, scale: 0.9, transformOrigin: '50% 100%' });
    gsap.set(cursor, {
      x: PREVIEW.cursor.fromX,
      y: PREVIEW.cursor.fromY,
      opacity: 0,
      scale: 1,
      transformOrigin: '30% 10%',
    });
  }
}
