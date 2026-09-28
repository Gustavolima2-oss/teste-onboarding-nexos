const query = window.matchMedia('(prefers-reduced-motion: reduce)');

export function prefersReducedMotion(): boolean {
  return query.matches;
}

export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  const listener = (e: MediaQueryListEvent) => cb(e.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
