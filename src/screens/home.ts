// Tela Home (Figma 2350:3004): saudação e "Seu time" com o Waz. Na última etapa do
// onboarding (e depois dele), a linha do Waz vira o card com a mensagem dele e a bolinha
// de não lida (Figma 2631:3475 / 2631:3583).

import { gsap } from 'gsap';
import type { Screen } from './types';
import { appState } from '../app/state';
import { prefersReducedMotion } from '../utils/reducedMotion';
import { asset } from '../utils/asset';

const img = (name: string) => asset(`images/${name}`);

export const WAZ_MESSAGE = 'Oi aqui o Waz! Estou animado em me juntar ao seu time!';
/**
 * Entrada da mensagem nova: fade + deslize de 6 px, logo depois que a tela entra
 * (a tela leva 250 ms), antes do destaque do onboarding (s).
 */
const MESSAGE_IN = { delay: 0.15, duration: 0.35, rise: 6 };

const memberMarkup = (withMessage: boolean) => `
  <span class="member-avatar member-avatar--waz">
    <img class="member-avatar-bg" src="${img('ellipse-waz.svg')}" alt="" />
    <span class="member-avatar-crop"><img src="${img('avatar-waz.png')}" alt="" /></span>
  </span>
  <span class="member-text">
    <span class="member-name">Waz</span>
    ${withMessage ? `<span class="member-message">${WAZ_MESSAGE}</span>` : ''}
  </span>
  ${
    withMessage
      ? `<img class="member-unread" src="${img('unread-dot.svg')}" alt="1 mensagem não lida" width="12" height="12" />`
      : ''
  }`;

export function createHome(): Screen {
  let unsubscribe: (() => void) | null = null;
  let tween: gsap.core.Tween | null = null;
  return {
    title: 'Início',
    mount(root) {
      root.innerHTML = `
        <main class="home">
          <h1 class="greeting" data-enter><span class="greeting-muted">Olá,</span> Donuts do K</h1>
          <section class="team" aria-labelledby="team-title" data-enter>
            <h2 id="team-title" class="section-title">Seu time</h2>
            <ul class="member-list">
              <li class="member" data-coach="member-waz"></li>
            </ul>
          </section>
        </main>`;
      const member = root.querySelector<HTMLLIElement>('.member');
      if (!member) return;
      let shown: boolean | null = null;
      const render = (animate: boolean) => {
        const withMessage = appState.wazMessage !== null;
        if (withMessage === shown) return;
        shown = withMessage;
        tween?.kill();
        member.classList.toggle('has-message', withMessage);
        member.innerHTML = memberMarkup(withMessage);
        if (!withMessage || !animate) return;
        // Mensagem nova: entra com fade + leve deslize (só fade com movimento reduzido).
        const els = member.querySelectorAll('.member-message, .member-unread');
        tween = gsap.from(els, {
          opacity: 0,
          y: prefersReducedMotion() ? 0 : MESSAGE_IN.rise,
          duration: MESSAGE_IN.duration,
          delay: MESSAGE_IN.delay,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        });
      };
      render(appState.wazMessage === 'new');
      unsubscribe = appState.subscribe(() => render(appState.wazMessage === 'new'));
    },
    unmount() {
      tween?.kill();
      tween = null;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
