// Posicionamento com prioridade, compartilhado pelo tooltip e pelo Nexo:
// tenta cada candidato na ordem; se nenhum couber na viewport (menos a margem),
// restringe (clamp) o primeiro candidato para dentro dela.

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Placement = 'right' | 'bottom' | 'top' | 'clamped';

export type Candidate = { placement: Exclude<Placement, 'clamped'>; rect: Rect };

export const VIEWPORT_MARGIN = 16;

export function viewportRect(): Rect {
  // clientWidth exclui a barra de rolagem; innerHeight cobre a altura visível.
  return { x: 0, y: 0, w: document.documentElement.clientWidth, h: window.innerHeight };
}

export function fits(rect: Rect, vp: Rect, margin = VIEWPORT_MARGIN): boolean {
  return (
    rect.x >= vp.x + margin &&
    rect.y >= vp.y + margin &&
    rect.x + rect.w <= vp.x + vp.w - margin &&
    rect.y + rect.h <= vp.y + vp.h - margin
  );
}

export function clampRect(rect: Rect, vp: Rect, margin = VIEWPORT_MARGIN): Rect {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), Math.max(min, max));
  return {
    ...rect,
    x: clamp(rect.x, vp.x + margin, vp.x + vp.w - margin - rect.w),
    y: clamp(rect.y, vp.y + margin, vp.y + vp.h - margin - rect.h),
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Primeiro candidato que cabe na viewport (menos a margem) e não encosta em
 * nenhum retângulo de `avoid`; senão, o primeiro candidato restrito à viewport.
 */
export function resolvePlacement(
  candidates: Candidate[],
  vp: Rect = viewportRect(),
  margin = VIEWPORT_MARGIN,
  avoid: Rect[] = [],
): { placement: Placement; rect: Rect } {
  for (const c of candidates) {
    if (fits(c.rect, vp, margin) && !avoid.some((r) => intersects(c.rect, r))) return c;
  }
  const first = candidates[0];
  if (!first) throw new Error('resolvePlacement: nenhum candidato');
  return { placement: 'clamped', rect: clampRect(first.rect, vp, margin) };
}

/** Letra usada no debug: a = lado do Figma (right/bottom), b = top, c = clamped. */
export const PLACEMENT_LETTER: Record<Placement, 'a' | 'b' | 'c'> = {
  right: 'a',
  bottom: 'a',
  top: 'b',
  clamped: 'c',
};

/** União das caixas (alvos em grupo). */
export function unionRect(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((q) => q.x + q.w));
  const b = Math.max(...rects.map((q) => q.y + q.h));
  return { x, y, w: r - x, h: b - y };
}

export function toRect(r: DOMRect): Rect {
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

export function isVerticallyVisible(rect: Rect, vp: Rect = viewportRect()): boolean {
  return rect.y >= vp.y && rect.y + rect.h <= vp.y + vp.h;
}
