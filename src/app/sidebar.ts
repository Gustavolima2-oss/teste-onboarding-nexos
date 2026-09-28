// Sidebar persistente (fica fora da área das telas, não pisca na troca).
// Item ativo acompanha a rota; favoritos aparecem a partir de y=283.
// Alvos do coach mark: data-coach="nav-ferramentas" | "nav-seu-negocio" | "nav-waz" | "nav-fav-conversas".

import { gsap } from 'gsap';
import type { Route } from './router';
import { appState } from './state';
import { prefersReducedMotion } from '../utils/reducedMotion';
import { asset } from '../utils/asset';

const img = (name: string) => asset(`images/${name}`);
/** Favorito entrando/saindo da sidebar: fade + escala 0,6 ↔ 1 (s). */
const FAV_ANIM = { duration: 0.25, fromScale: 0.6 };

type NavItem = {
  route: Route;
  label: string;
  coach?: string;
  icon: string;
  /** Ícone quando ativo (se diferente). */
  activeIcon?: string;
  size: number;
};

const ITEMS: NavItem[] = [
  {
    route: '/home',
    label: 'Início',
    icon: 'icon-house.svg',
    activeIcon: 'icon-home.svg',
    size: 16,
  },
  {
    route: '/ferramentas',
    label: 'Ferramentas',
    coach: 'nav-ferramentas',
    icon: 'icon-ferramentas.svg',
    size: 14,
  },
  {
    route: '/seu-negocio',
    label: 'Seu negócio',
    coach: 'nav-seu-negocio',
    icon: 'icon-storefront.svg',
    activeIcon: 'nav-seu-negocio-active.svg',
    size: 16,
  },
];

const FAVORITES: Record<string, { label: string; icon: string; route: Route }> = {
  conversas: { label: 'Conversas', icon: 'icon-conversas.svg', route: '/ferramentas' },
};

export class Sidebar {
  readonly el: HTMLElement;
  private route: Route = '/home';
  private readonly unsubscribe: () => void;

  constructor() {
    this.el = document.createElement('nav');
    this.el.className = 'sidebar';
    this.el.setAttribute('aria-label', 'Navegação principal');
    this.el.dataset.coachLayer = '';
    this.el.innerHTML = `
      <div class="company">
        <span class="company-avatar"><img src="${img('company-bg.png')}" alt="" /><img src="${img('company-logo.png')}" alt="Donuts do K" /></span>
        <button type="button" class="company-panel" aria-label="Abrir painel lateral">
          <img src="${img('icon-sidepanel.svg')}" alt="" width="12" height="12" />
        </button>
      </div>
      <ul class="nav-group nav-group--top"></ul>
      <img class="nav-divider nav-divider--1" src="${img('nav-divider.svg')}" alt="" />
      <ul class="nav-group nav-group--team">
        <li>
          <a href="#/home" class="nav-item nav-chat" aria-label="Waz, 1 mensagem não lida" data-coach="nav-waz">
            <span class="nav-avatar nav-avatar--waz"><img src="${img('avatar-waz.png')}" alt="" /></span>
            <span class="nav-badge" aria-hidden="true">1</span>
          </a>
        </li>
      </ul>
      <img class="nav-divider nav-divider--2" src="${img('nav-divider.svg')}" alt="" />
      <ul class="nav-group nav-group--favorites" aria-label="Favoritos"></ul>
      <ul class="nav-group nav-group--settings">
        <li><a href="#/home" class="nav-item" aria-label="Configurações"><img src="${img('icon-gear.svg')}" alt="" width="16.256" height="16.256" /></a></li>
      </ul>`;
    this.renderItems();
    this.renderFavorites();
    this.unsubscribe = appState.subscribe(() => this.renderFavorites());
  }

  setRoute(route: Route): void {
    this.route = route;
    this.renderItems();
  }

  destroy(): void {
    this.unsubscribe();
    this.el.remove();
  }

  private renderItems(): void {
    const ul = this.el.querySelector('.nav-group--top');
    if (!ul) return;
    ul.innerHTML = ITEMS.map((it) => {
      const active = it.route === this.route;
      const icon = active && it.activeIcon ? it.activeIcon : it.icon;
      const full = icon === 'nav-seu-negocio-active.svg'; // svg de 32 px com o círculo
      const size = full ? 32 : it.size;
      const slug = it.route.slice(1);
      return `
        <li>
          <a href="#${it.route}" class="nav-item nav-item--${slug}${active ? ' is-active' : ''}" aria-label="${it.label}"${active ? ' aria-current="page"' : ''}${it.coach ? ` data-coach="${it.coach}"` : ''}>
            <img src="${img(icon)}" alt="" width="${size}" height="${size}" />
          </a>
        </li>`;
    }).join('');
  }

  /** Itens de favoritos por id (para animar só o que entra ou sai). */
  private readonly favItems = new Map<string, HTMLLIElement>();

  /**
   * Sincroniza os favoritos com o appState. O que entra aparece com fade; o que sai
   * some com fade e só então é removido (nada de corte seco quando o onboarding volta
   * uma etapa e desfaz o favorito).
   */
  private renderFavorites(): void {
    const ul = this.el.querySelector('.nav-group--favorites');
    if (!ul) return;
    const wanted = appState.favorites().filter((id) => FAVORITES[id]);
    const reduced = prefersReducedMotion();
    const vars = (show: boolean) => ({
      opacity: show ? 1 : 0,
      scale: show || reduced ? 1 : FAV_ANIM.fromScale,
      duration: FAV_ANIM.duration,
      ease: show ? 'power2.out' : 'power2.in',
    });
    for (const [id, li] of this.favItems) {
      if (wanted.includes(id)) continue;
      this.favItems.delete(id);
      li.dataset.leaving = '1';
      const a = li.firstElementChild ?? li;
      gsap.killTweensOf(a);
      gsap.to(a, { ...vars(false), onComplete: () => li.remove() });
    }
    wanted.forEach((id) => {
      if (this.favItems.has(id)) return;
      const f = FAVORITES[id];
      if (!f) return;
      const li = document.createElement('li');
      // A animação é no <a> (o alvo), não no <li>: um transform no pai criaria um
      // contexto de empilhamento e prenderia o alvo abaixo do overlay.
      li.innerHTML = `
        <a href="#${f.route}" class="nav-fav" aria-label="${f.label} (favorito)" data-coach="nav-fav-${id}">
          <img src="${img(f.icon)}" alt="" width="13.393" height="12" />
        </a>`;
      // Um item do mesmo id ainda saindo é descartado na hora.
      ul.querySelectorAll<HTMLLIElement>('li[data-leaving]').forEach((old) => {
        if (old.querySelector(`[data-coach="nav-fav-${id}"]`)) {
          gsap.killTweensOf(old.firstElementChild);
          old.remove();
        }
      });
      ul.append(li);
      this.favItems.set(id, li);
      const a = li.firstElementChild ?? li;
      gsap.fromTo(a, vars(false), { ...vars(true), clearProps: 'opacity,transform' });
    });
  }
}
