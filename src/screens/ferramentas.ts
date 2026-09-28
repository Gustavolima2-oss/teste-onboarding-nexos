// Tela Ferramentas (Figma 2350:45423): cabeçalho, chips de categoria, busca e o
// card Conversas (com o botão de fixar/favoritar ligado ao appState).

import { appState } from '../app/state';
import type { Screen } from './types';
import { asset } from '../utils/asset';

const img = (name: string) => asset(`images/ferramentas/${name}`);

const FAV_ID = 'conversas';

const CHIPS = [
  'Jurídico',
  'Marketing',
  'Vendas &amp; Atendimento',
  'Finanças',
  'RH',
  'Mais Agentes',
];

interface Conversa {
  name: string;
  avatar: string;
  preview: string;
  time: string;
  /** Mensagens não lidas (badge laranja); sem badge = lida (check duplo). */
  unread?: number;
}

const CONVERSAS: Conversa[] = [
  {
    name: 'Jéssica Belcost',
    avatar: 'avatar-jessica.png',
    preview: 'Perfeito! Te envio o catálogo agora 🍰',
    time: '09:42',
  },
  {
    name: 'João Amado',
    avatar: 'avatar-joao.png',
    preview: 'Quanto custa o plano mensal?',
    time: '09:31',
    unread: 2,
  },
  {
    name: 'Marília Ribeiro',
    avatar: 'avatar-marilia.png',
    preview: 'Ótimo, agendei sua demonstração pra qui…',
    time: 'Ontem',
  },
  {
    name: 'Estephano Alencar',
    avatar: 'avatar-estephano.png',
    preview: 'Pode me ligar amanhã de manhã?',
    time: 'Ontem',
    unread: 1,
  },
];

const conversaRow = (c: Conversa) => `
  <li class="inbox-row${c.unread ? ' is-unread' : ''}">
    <img class="inbox-avatar" src="${img(c.avatar)}" alt="" />
    <span class="inbox-texts">
      <span class="inbox-name">${c.name}</span>
      <span class="inbox-preview">
        ${c.unread ? '' : `<img class="inbox-read" src="${img('icon-read.svg')}" alt="" />`}
        <span class="inbox-preview-text">${c.preview}</span>
      </span>
    </span>
    <span class="inbox-meta">
      <span class="inbox-time">${c.time}</span>
      ${c.unread ? `<span class="inbox-badge">${c.unread}</span>` : '<span class="inbox-badge-slot"></span>'}
    </span>
  </li>`;

export function createFerramentas(): Screen {
  let unsubscribe: (() => void) | null = null;
  let favBtn: HTMLButtonElement | null = null;

  const renderFav = () => {
    if (!favBtn) return;
    const on = appState.isFavorite(FAV_ID);
    favBtn.classList.toggle('is-active', on);
    favBtn.setAttribute('aria-pressed', String(on));
    favBtn.setAttribute(
      'aria-label',
      on ? 'Desafixar Conversas do menu' : 'Fixar Conversas no menu',
    );
  };

  const onFavClick = () => appState.setFavorite(FAV_ID, !appState.isFavorite(FAV_ID));

  return {
    title: 'Ferramentas',
    mount(root) {
      root.innerHTML = `
        <main class="ferramentas">
          <header class="ferramentas-header">
            <h1 class="ferramentas-title">Ferramentas</h1>
          </header>
          <div class="ferramentas-body">
            <div class="chip-row" role="group" aria-label="Categorias" data-coach="ferramentas-chips" data-enter>
              <button type="button" class="chip chip--active" aria-pressed="true">
                <span class="chip-icon"><img src="${img('icon-ferramentas.svg')}" alt="" /></span>
                Ferramentas
              </button>
              ${CHIPS.map(
                (label) =>
                  `<button type="button" class="chip" aria-pressed="false">${label}</button>`,
              ).join('')}
            </div>
            <section class="tools" aria-labelledby="tools-all-title" data-enter>
              <div class="tools-head">
                <h2 id="tools-all-title" class="tools-title">Todas as suas ferramentas</h2>
                <label class="tool-search">
                  <img class="tool-search-icon" src="${img('icon-search.svg')}" alt="" />
                  <input type="search" class="tool-search-input" placeholder="Buscar ferramenta..." aria-label="Buscar ferramenta" />
                </label>
              </div>
              <ul class="tool-grid">
                <li>
                  <article class="tool-card" data-coach="card-conversas" aria-labelledby="tool-conversas-title">
                    <img class="tool-card-bg" src="${img('conversas-bg.jpg')}" alt="" />
                    <div class="inbox-card" aria-hidden="true">
                      <ul class="inbox">${CONVERSAS.map(conversaRow).join('')}</ul>
                      <span class="inbox-footer">Ver todas as conversas</span>
                    </div>
                    <span class="tool-card-fade"></span>
                    <h3 id="tool-conversas-title" class="tool-card-title">
                      <button type="button" class="tool-card-link">
                        <span class="tool-card-name">Conversas</span>
                        <img class="tool-card-chevron" src="${img('icon-chevron.svg')}" alt="" />
                      </button>
                    </h3>
                    <p class="tool-card-desc">Atenda e qualifique cada lead do Whatsapp</p>
                    <button type="button" class="tool-card-pin" data-coach="fav-conversas"><span class="tool-card-pin-icon"></span></button>
                  </article>
                </li>
              </ul>
            </section>
          </div>
        </main>`;

      favBtn = root.querySelector<HTMLButtonElement>('[data-coach="fav-conversas"]');
      favBtn?.addEventListener('click', onFavClick);
      renderFav();
      unsubscribe = appState.subscribe(renderFav);
    },
    unmount() {
      unsubscribe?.();
      unsubscribe = null;
      favBtn?.removeEventListener('click', onFavClick);
      favBtn = null;
    },
  };
}
