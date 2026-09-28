// Tela Home (Figma 2350:3004): saudação e "Seu time" com o Waz.

import type { Screen } from './types';
import { asset } from '../utils/asset';

const img = (name: string) => asset(`images/${name}`);

export function createHome(): Screen {
  return {
    title: 'Início',
    mount(root) {
      root.innerHTML = `
        <main class="home">
          <h1 class="greeting" data-enter><span class="greeting-muted">Olá,</span> Donuts do K</h1>
          <section class="team" aria-labelledby="team-title" data-enter>
            <h2 id="team-title" class="section-title">Seu time</h2>
            <ul class="member-list">
              <li class="member" data-coach="member-waz">
                <span class="member-avatar member-avatar--waz">
                  <img class="member-avatar-bg" src="${img('ellipse-waz.svg')}" alt="" />
                  <span class="member-avatar-crop"><img src="${img('avatar-waz.png')}" alt="" /></span>
                </span>
                <span class="member-text"><span class="member-name">Waz</span></span>
              </li>
            </ul>
          </section>
        </main>`;
    },
    unmount() {},
  };
}
