// Roteador mínimo por hash: #/home, #/ferramentas, #/seu-negocio.
// Troca de tela com fade out (200 ms) → monta a nova → fade in (250 ms).

import { gsap } from 'gsap';
import type { Screen } from '../screens/types';

export type Route = '/home' | '/ferramentas' | '/seu-negocio';
export const ROUTES: Route[] = ['/home', '/ferramentas', '/seu-negocio'];

/** Durações da troca de tela (s). */
export const SCREEN_FADE = { out: 0.2, in: 0.25 };

/** Opções da troca: durações (s) e subida da tela nova (px, translateY → 0). */
export type SwapOptions = { animate?: boolean; out?: number; in?: number; rise?: number };

type Listener = (route: Route) => void;

export class Router {
  private current: { route: Route; screen: Screen } | null = null;
  private readonly listeners = new Set<Listener>();
  private switching: Promise<void> = Promise.resolve();

  constructor(
    private readonly outlet: HTMLElement,
    private readonly screens: Record<Route, () => Screen>,
  ) {}

  get route(): Route | null {
    return this.current?.route ?? null;
  }

  static parse(hash: string): Route {
    const r = hash.replace(/^#/, '') as Route;
    return ROUTES.includes(r) ? r : '/home';
  }

  start(): void {
    window.addEventListener('hashchange', this.handleHash);
    this.mount(Router.parse(location.hash));
  }

  stop(): void {
    window.removeEventListener('hashchange', this.handleHash);
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Navega com a transição de fade. Resolve quando a nova tela terminou de entrar. */
  go(route: Route, opts: SwapOptions = {}): Promise<void> {
    this.switching = this.switching.then(() => this.swap(route, opts));
    return this.switching;
  }

  /**
   * Monta `route` numa sonda invisível (fixed, mesma área da viewport) para medir
   * alvos antes da troca de verdade — o voo entre telas precisa do destino já na
   * decolagem. Chame o retorno para desmontar.
   */
  probe(route: Route): () => void {
    const box = document.createElement('div');
    box.className = 'screen is-probe';
    box.setAttribute('aria-hidden', 'true');
    this.outlet.after(box);
    const screen = this.screens[route]();
    screen.mount(box);
    return () => {
      screen.unmount();
      box.remove();
    };
  }

  private async swap(route: Route, opts: SwapOptions): Promise<void> {
    if (this.current?.route === route) return;
    const fade = (opts.animate ?? true) && !!this.current;
    const rise = opts.rise ?? 0;
    if (fade)
      await gsap
        .to(this.outlet, { opacity: 0, duration: opts.out ?? SCREEN_FADE.out, ease: 'power1.in' })
        .then();
    this.mount(route);
    window.scrollTo(0, 0);
    if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
    if (fade) {
      await gsap
        .fromTo(
          this.outlet,
          { opacity: 0, y: rise },
          {
            opacity: 1,
            y: 0,
            duration: opts.in ?? SCREEN_FADE.in,
            ease: rise ? 'power2.out' : 'power1.out',
            // Sem transform/opacity sobrando: criariam contexto de empilhamento e
            // prenderiam os alvos abaixo do overlay.
            clearProps: 'opacity,transform',
          },
        )
        .then();
    }
  }

  private mount(route: Route): void {
    this.current?.screen.unmount();
    const screen = this.screens[route]();
    this.outlet.replaceChildren();
    this.outlet.setAttribute('aria-label', screen.title);
    screen.mount(this.outlet);
    this.current = { route, screen };
    this.listeners.forEach((l) => l(route));
  }

  private handleHash = (): void => {
    void this.go(Router.parse(location.hash));
  };
}
